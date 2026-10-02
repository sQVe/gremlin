import { existsSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Definition, ESTree, Plugin, SourceCode, Variable } from '@oxlint/plugins';

type WrappedExpression =
  | ESTree.TSAsExpression
  | ESTree.TSSatisfiesExpression
  | ESTree.TSTypeAssertion
  | ESTree.TSNonNullExpression
  | ESTree.ParenthesizedExpression;

type TypeDeclaration = ESTree.TSTypeAliasDeclaration | ESTree.TSInterfaceDeclaration;

interface ModuleLocation {
  module: string;
  entry: boolean;
  directory: boolean;
}

type ImportSource =
  | ESTree.ImportDeclaration
  | ESTree.ExportNamedDeclaration
  | ESTree.ExportAllDeclaration;

const wrappedExpressionTypes = new Set<string>([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'TSNonNullExpression',
  'ParenthesizedExpression',
]);

const isWrappedExpression = (node: ESTree.Node): node is WrappedExpression =>
  wrappedExpressionTypes.has(node.type);

const isCondition = (node: ESTree.Node): node is ESTree.LogicalExpression =>
  node.type === 'LogicalExpression' && node.operator !== '??';

const isNegation = (node: ESTree.Node): node is ESTree.UnaryExpression =>
  node.type === 'UnaryExpression' && node.operator === '!';

const collectOperators = (node: ESTree.Node, operators: string[]) => {
  if (isWrappedExpression(node)) {
    return collectOperators(node.expression, operators);
  }

  if (isNegation(node)) {
    return collectOperators(node.argument, operators);
  }

  if (!isCondition(node)) {
    return operators;
  }

  operators.push(node.operator);
  collectOperators(node.left, operators);
  collectOperators(node.right, operators);

  return operators;
};

const isUnusedMarker = (definition: Definition, variable: Variable): boolean => {
  if (!definition.name.name.startsWith('_')) {
    return false;
  }

  if (variable.references.some((reference) => reference.isRead())) {
    return false;
  }

  if (definition.type === 'Parameter') {
    return true;
  }

  return definition.node.type === 'VariableDeclarator' && definition.node.id.type !== 'Identifier';
};

const isFunction = (node: ESTree.Node): boolean =>
  node.type === 'FunctionDeclaration' ||
  node.type === 'FunctionExpression' ||
  node.type === 'ArrowFunctionExpression';

const unwrapExpression = (node: ESTree.Node): ESTree.Node =>
  isWrappedExpression(node) ? unwrapExpression(node.expression) : node;

const isJsx = (node: ESTree.Node): boolean => {
  const value = unwrapExpression(node);

  if (value.type === 'ConditionalExpression') {
    return isJsx(value.consequent) || isJsx(value.alternate);
  }

  if (value.type === 'LogicalExpression') {
    return isJsx(value.left) || isJsx(value.right);
  }

  return value.type === 'JSXElement' || value.type === 'JSXFragment';
};

const enclosingFunctionOf = (node: ESTree.Node): ESTree.Node | undefined => {
  let current = node.parent;

  while (current !== null && !isFunction(current)) {
    current = current.parent;
  }

  return current ?? undefined;
};

// A `let` or `var` binding can be reassigned, and a destructured name holds a field of the
// function rather than the function.
const constantInitializerOf = (definition: Definition): ESTree.Node | undefined => {
  const declarator = definition.node;

  if (declarator.type !== 'VariableDeclarator' || declarator.id.type !== 'Identifier') {
    return undefined;
  }

  const declaration = declarator.parent;
  const constant = declaration.type === 'VariableDeclaration' && declaration.kind === 'const';

  return constant && declarator.init !== null ? unwrapExpression(declarator.init) : undefined;
};

const definedFunctionOf = (definition: Definition): ESTree.Node | undefined => {
  if (definition.type === 'FunctionName' && definition.node.type === 'FunctionDeclaration') {
    return definition.node;
  }

  const initializer = constantInitializerOf(definition);

  return initializer !== undefined && isFunction(initializer) ? initializer : undefined;
};

const declarationOf = (statement: ESTree.Node): ESTree.Node => {
  if (statement.type === 'ExportNamedDeclaration') {
    return statement.declaration ?? statement;
  }

  const defaultInterface =
    statement.type === 'ExportDefaultDeclaration' &&
    statement.declaration.type === 'TSInterfaceDeclaration';

  return defaultInterface ? statement.declaration : statement;
};

const typeDeclarationOf = (statement: ESTree.Node): TypeDeclaration | undefined => {
  const declaration = declarationOf(statement);

  const isType =
    declaration.type === 'TSTypeAliasDeclaration' || declaration.type === 'TSInterfaceDeclaration';

  return isType ? declaration : undefined;
};

const isReExport = (statement: ESTree.Node): boolean =>
  statement.type === 'ExportNamedDeclaration' && statement.source !== null;

// Imports and re-exports head the module; a type below them is not below a value.
const isModuleHeader = (statement: ESTree.Node): boolean =>
  statement.type === 'ImportDeclaration' ||
  statement.type === 'ExportAllDeclaration' ||
  isReExport(statement);

const topLevelStatementOf = (node: ESTree.Node): ESTree.Node => {
  let statement = node;

  while (statement.parent !== null && statement.parent.type !== 'Program') {
    statement = statement.parent;
  }

  return statement;
};

const rootNameOf = (name: ESTree.TSTypeQueryExprName): string | undefined => {
  if (name.type === 'TSQualifiedName') {
    return rootNameOf(name.left);
  }

  return name.type === 'Identifier' ? name.name : undefined;
};

// Where a statement starts once the comment lines directly above it are counted with it. Code
// before it on the same line stays out.
const lineStartWithComments = (statement: ESTree.Node, sourceCode: SourceCode): number => {
  let first: ESTree.Span = statement;
  const comments = sourceCode.getCommentsBefore(statement);

  for (const comment of comments.toReversed()) {
    const previous = sourceCode.getTokenBefore(comment);
    const trailsPrevious = previous?.loc.end.line === comment.loc.start.line;

    if (trailsPrevious || comment.loc.end.line + 1 < first.loc.start.line) {
      break;
    }

    first = comment;
  }

  const sharesLine = sourceCode.getTokenBefore(first)?.loc.end.line === first.loc.start.line;

  return sharesLine ? first.range[0] : first.range[0] - first.loc.start.column;
};

const moduleValues = (program: ESTree.Program, sourceCode: SourceCode) => {
  const names = new Set<string>();
  let first: ESTree.Node | undefined;

  for (const statement of program.body) {
    if (isModuleHeader(statement) || typeDeclarationOf(statement) !== undefined) {
      continue;
    }

    first ??= statement;

    for (const variable of sourceCode.getDeclaredVariables(declarationOf(statement))) {
      names.add(variable.name);
    }
  }

  return { names, first };
};

// A type that applies `typeof` to a value in this module mirrors that value and stays beside it.
const misplacedTypes = (
  program: ESTree.Program,
  sourceCode: SourceCode,
  typeQueries: Map<ESTree.Node, string[]>,
) => {
  const values = moduleValues(program, sourceCode);

  if (values.first === undefined) {
    return undefined;
  }

  const insertAt = lineStartWithComments(values.first, sourceCode);
  const types: { declaration: TypeDeclaration; range: [number, number] }[] = [];

  for (const statement of program.body) {
    const declaration = typeDeclarationOf(statement);
    const derived = typeQueries.get(statement)?.some((name) => values.names.has(name)) ?? false;

    if (declaration === undefined || statement.range[0] < insertAt || derived) {
      continue;
    }

    // Code after the type on its line stays put; otherwise the whole line goes.
    const next = sourceCode.getTokenAfter(statement);
    const lineEnd = sourceCode.text.indexOf('\n', statement.range[1]);
    const sharesLine = next !== null && next.loc.start.line === statement.loc.end.line;
    const end = lineEnd === -1 ? sourceCode.text.length : lineEnd + 1;

    types.push({
      declaration,
      range: [lineStartWithComments(statement, sourceCode), sharesLine ? next.range[0] : end],
    });
  }

  return { insertAt, types };
};

const folderModules = new Set(['github', 'work', 'session', 'ui']);
const flatModules = new Set(['config', 'actions', 'localState', 'commands', 'index', 'terminal']);

const allowedImports = new Map<string, Set<string>>([
  ['work', new Set()],
  ['config', new Set()],
  ['github', new Set(['work'])],
  ['localState', new Set(['work'])],
  ['actions', new Set(['work', 'config'])],
  ['session', new Set(['work'])],
  ['commands', new Set(['work', 'session'])],
  ['ui', new Set(['work', 'session', 'commands'])],
  ['terminal', new Set(['ui', 'session', 'commands', 'config'])],
  ['index', new Set([...folderModules, ...flatModules])],
]);

const typeOnlyImports = new Map([['session', new Set(['github', 'actions', 'localState'])]]);
const runtimeModules = new Set(['work', 'session', 'commands', 'ui']);
const rendererFreeModules = new Set(['work', 'session', 'commands']);
const packageRoots = new Map<string, string | undefined>();

// The nearest package.json marks the root, so a `src` segment above it never counts.
const packageRootOf = (directory: string): string | undefined => {
  if (packageRoots.has(directory)) {
    return packageRoots.get(directory);
  }

  const parent = dirname(directory);
  let root: string | undefined = directory;

  if (!existsSync(join(directory, 'package.json'))) {
    root = parent === directory ? undefined : packageRootOf(parent);
  }

  packageRoots.set(directory, root);

  return root;
};

const escapesDirectory = (path: string): boolean =>
  path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path);

const locate = (path: string): ModuleLocation | undefined => {
  const segments = path.replace(/\.[jt]sx?$/, '').split(sep);
  const [first = '', second] = segments;
  const flatModule = first.replace(/\.test$/, '');

  if (segments.length === 1 && flatModules.has(flatModule)) {
    return { module: flatModule, entry: first === flatModule, directory: false };
  }

  if (!folderModules.has(first)) {
    return undefined;
  }

  const entry = segments.length === 2 && second === first;

  return { module: first, entry, directory: segments.length === 1 };
};

const filePathOf = (url: string): string | undefined => {
  try {
    return fileURLToPath(url);
  } catch {
    return undefined;
  }
};

// Returns `undefined` for a package name and `null` for a file URL that names no local path.
const localPathOf = (specifier: string, directory: string): string | null | undefined => {
  if (/^file:/i.test(specifier)) {
    return filePathOf(specifier) ?? null;
  }

  if (!specifier.startsWith('.') && !isAbsolute(specifier)) {
    return undefined;
  }

  return resolve(directory, specifier);
};

const isRuntimeBuiltin = (specifier: string): boolean => {
  const bunBuiltin = specifier === 'bun' || specifier.startsWith('bun:');

  return bunBuiltin || specifier.startsWith('node:') || isBuiltin(specifier);
};

const isRendererPackage = (specifier: string): boolean =>
  specifier === 'react' || specifier.startsWith('react/') || specifier.startsWith('@opentui/');

const packageBoundary = (
  importer: string,
  specifier: string,
  testFile: boolean,
): string | undefined => {
  const testRunner = testFile && specifier === 'bun:test';

  if (runtimeModules.has(importer) && !testRunner && isRuntimeBuiltin(specifier)) {
    return 'builtin';
  }

  return rendererFreeModules.has(importer) && isRendererPackage(specifier) ? 'renderer' : undefined;
};

const moduleBoundary = (
  importer: string,
  target: ModuleLocation,
  typeOnly: boolean,
): string | undefined => {
  if (target.directory) {
    return 'directory';
  }

  if (target.module === importer) {
    return undefined;
  }

  if (!target.entry) {
    return 'private';
  }

  if (allowedImports.get(importer)?.has(target.module) === true) {
    return undefined;
  }

  if (typeOnlyImports.get(importer)?.has(target.module) !== true) {
    return 'module';
  }

  return typeOnly ? undefined : 'typeOnly';
};

const isTypeOnly = (node: ImportSource): boolean => {
  if (node.type === 'ExportAllDeclaration') {
    return node.exportKind === 'type';
  }

  if (node.type === 'ExportNamedDeclaration') {
    const typeSpecifiers =
      node.specifiers.length > 0 &&
      node.specifiers.every((specifier) => specifier.exportKind === 'type');

    return node.exportKind === 'type' || typeSpecifiers;
  }

  const typeSpecifiers =
    node.specifiers.length > 0 &&
    node.specifiers.every(
      (specifier) => specifier.type === 'ImportSpecifier' && specifier.importKind === 'type',
    );

  return node.importKind === 'type' || typeSpecifiers;
};

const literalSourceOf = (source: ESTree.Expression): string | undefined => {
  if (source.type === 'Literal' && typeof source.value === 'string') {
    return source.value;
  }

  if (source.type !== 'TemplateLiteral' || source.expressions.length > 0) {
    return undefined;
  }

  return source.quasis[0]?.value.cooked ?? undefined;
};

const stylePlugin: Plugin = {
  meta: { name: 'zeta' },
  rules: {
    'helper-before-use': {
      meta: {
        type: 'suggestion',
        schema: [],
        messages: { order: 'Define helper "{{name}}" before its callers.' },
      },
      create(context) {
        const checkReferences = (node: ESTree.Node) => {
          for (const variable of context.sourceCode.getDeclaredVariables(node)) {
            for (const reference of variable.references) {
              let name: ESTree.Node = reference.identifier;

              while (name.parent.type === 'TSQualifiedName') {
                name = name.parent;
              }

              if (name.parent.type === 'TSTypeQuery') {
                continue;
              }

              if (reference.isRead() && reference.identifier.range[0] < node.range[0]) {
                context.report({
                  node: reference.identifier,
                  messageId: 'order',
                  data: { name: variable.name },
                });
              }
            }
          }
        };

        return {
          FunctionDeclaration: checkReferences,
          // Infer only function syntax; factory-returned helpers need type-aware lint.
          VariableDeclarator(node) {
            let initializer = node.init;

            if (!initializer) {
              return;
            }

            while (isWrappedExpression(initializer)) {
              initializer = initializer.expression;
            }

            const definesFunction =
              initializer.type === 'ArrowFunctionExpression' ||
              initializer.type === 'FunctionExpression';

            if (node.id.type === 'Identifier' && definesFunction) {
              checkReferences(node);
            }
          },
        };
      },
    },
    'type-placement': {
      meta: {
        type: 'suggestion',
        fixable: 'code',
        schema: [],
        messages: {
          placement:
            'Declare "{{names}}" below the imports, above values. Only types that use `typeof` on a value here may follow it.',
        },
      },
      create(context) {
        const { sourceCode } = context;
        const typeQueries = new Map<ESTree.Node, string[]>();

        return {
          TSTypeQuery(node) {
            const name = rootNameOf(node.exprName);
            const statement = topLevelStatementOf(node);

            if (name !== undefined) {
              typeQueries.set(statement, [...(typeQueries.get(statement) ?? []), name]);
            }
          },
          'Program:exit'(program) {
            const placement = misplacedTypes(program, sourceCode, typeQueries);
            const [first] = placement?.types ?? [];

            if (placement === undefined || first === undefined) {
              return;
            }

            const { insertAt, types } = placement;

            const moved = types
              .map(({ range }) => `${sourceCode.text.slice(...range).trimEnd()}\n\n`)
              .join('');

            const names = types.map(({ declaration }) => declaration.id.name).join('", "');

            // One report per file: Oxlint applies fixes in a single pass and skips overlapping ones.
            context.report({
              node: first.declaration.id,
              messageId: 'placement',
              data: { names },
              fix: (fixer) => [
                fixer.insertTextBeforeRange([insertAt, insertAt], moved),
                ...types.map(({ range }) => fixer.removeRange(range)),
              ],
            });
          },
        };
      },
    },
    'max-condition-checks': {
      meta: {
        type: 'suggestion',
        schema: [],
        messages: {
          tooMany: 'This condition joins {{count}} checks. Join at most 3 and name the rest.',
          mixed: 'This condition mixes && and ||. Name the inner group first.',
        },
      },
      create(context) {
        return {
          LogicalExpression(node) {
            if (!isCondition(node)) {
              return;
            }

            let parent = node.parent;

            while (isWrappedExpression(parent) || isNegation(parent)) {
              parent = parent.parent;
            }

            if (isCondition(parent)) {
              return;
            }

            const operators = collectOperators(node, []);
            const count = operators.length + 1;

            if (new Set(operators).size > 1) {
              context.report({ node, messageId: 'mixed' });
            }

            if (count > 3) {
              context.report({ node, messageId: 'tooMany', data: { count: String(count) } });
            }
          },
        };
      },
    },
    'module-boundaries': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          unknownFile: 'File "{{file}}" is not in a known module. Move it into one.',
          unknownTarget:
            'Module "{{importer}}" imports "{{target}}", which is not in a known module.',
          escape: 'Module "{{importer}}" imports "{{target}}", which is outside src/.',
          directory:
            'Module "{{importer}}" imports the directory "{{target}}". Import its entry file.',
          private:
            'Module "{{importer}}" imports "{{target}}", a private file of another module. Import its entry file.',
          module:
            'Module "{{importer}}" may not import "{{target}}": the module table refuses that edge.',
          typeOnly:
            'Module "{{importer}}" may import only types from "{{target}}". Use `import type`.',
          builtin: 'Module "{{importer}}" must not import the runtime built-in "{{target}}".',
          renderer: 'Module "{{importer}}" must not import the renderer package "{{target}}".',
          dynamic:
            'Module "{{importer}}" has a computed dynamic import. Use a string literal so its boundary can be checked.',
        },
      },
      create(context) {
        const filename = context.physicalFilename;
        const root = packageRootOf(dirname(filename));
        const sourceDirectory = root === undefined ? undefined : join(root, 'src');

        if (sourceDirectory === undefined) {
          return {};
        }

        const path = relative(sourceDirectory, filename);

        if (escapesDirectory(path)) {
          return {};
        }

        // A file named after a folder module, such as `src/session.ts`, sits outside that folder.
        const location = locate(path);
        const importer = location?.directory === false ? location.module : undefined;

        if (importer === undefined) {
          return {
            Program(node) {
              context.report({ node, messageId: 'unknownFile', data: { file: path } });
            },
          };
        }

        const testFile = /\.test\.tsx?$/.test(filename);

        const boundaryOf = (specifier: string, typeOnly: boolean): string | undefined => {
          const localPath = localPathOf(specifier, dirname(filename));

          if (localPath === undefined) {
            return packageBoundary(importer, specifier, testFile);
          }

          if (localPath === null) {
            return 'unknownTarget';
          }

          const targetPath = relative(sourceDirectory, localPath);

          if (escapesDirectory(targetPath)) {
            return 'escape';
          }

          const target = locate(targetPath);

          return target === undefined
            ? 'unknownTarget'
            : moduleBoundary(importer, target, typeOnly);
        };

        const check = (source: ESTree.StringLiteral, typeOnly: boolean) => {
          const messageId = boundaryOf(source.value, typeOnly);

          if (messageId !== undefined) {
            context.report({ node: source, messageId, data: { importer, target: source.value } });
          }
        };

        const checkSource = (node: ImportSource) => {
          if (node.source !== null) {
            check(node.source, isTypeOnly(node));
          }
        };

        return {
          ImportDeclaration: checkSource,
          ExportNamedDeclaration: checkSource,
          ExportAllDeclaration: checkSource,
          TSImportType(node) {
            check(node.source, true);
          },
          ImportExpression(node) {
            const specifier = literalSourceOf(node.source);

            if (specifier === undefined) {
              context.report({ node, messageId: 'dynamic', data: { importer } });

              return;
            }

            const messageId = boundaryOf(specifier, false);

            if (messageId !== undefined) {
              context.report({ node, messageId, data: { importer, target: specifier } });
            }
          },
        };
      },
    },
    'naming-convention': {
      meta: {
        type: 'suggestion',
        schema: [],
        messages: { name: 'Use {{format}} for "{{name}}".' },
      },
      create(context) {
        // JSX treats lowercase tags as built-in elements, so components need PascalCase names.
        const components = new Set<ESTree.Node>();

        const checkName = (
          node: ESTree.BindingIdentifier,
          format: 'camelCase' | 'PascalCase',
          name = node.name,
        ) => {
          const pattern = format === 'camelCase' ? /^[a-z][a-zA-Z0-9]*$/ : /^[A-Z][a-zA-Z0-9]*$/;

          if (!pattern.test(name)) {
            context.report({ node, messageId: 'name', data: { format, name: node.name } });
          }
        };

        const checkDefinition = (
          definition: Definition,
          variable: Variable,
          checked: Set<ESTree.Node>,
        ) => {
          if (
            definition.type === 'ImportBinding' ||
            definition.node.type.startsWith('TS') ||
            checked.has(definition.name)
          ) {
            return;
          }

          checked.add(definition.name);

          const unusedMarker = isUnusedMarker(definition, variable);
          const name = unusedMarker ? definition.name.name.slice(1) : definition.name.name;

          if (unusedMarker && !name) {
            return;
          }

          const definedFunction = definedFunctionOf(definition);

          const componentName =
            definedFunction !== undefined && components.has(definedFunction) && /^[A-Z]/.test(name);

          const pascalCase = definition.type === 'ClassName' || componentName;

          checkName(definition.name, pascalCase ? 'PascalCase' : 'camelCase', name);
        };

        return {
          ReturnStatement(node) {
            const returningFunction = enclosingFunctionOf(node);

            if (node.argument !== null && returningFunction !== undefined && isJsx(node.argument)) {
              components.add(returningFunction);
            }
          },
          ArrowFunctionExpression(node) {
            if (node.expression && isJsx(node.body)) {
              components.add(node);
            }
          },
          'Program:exit'() {
            const checked = new Set<ESTree.Node>();

            for (const scope of context.sourceCode.scopeManager.scopes) {
              for (const variable of scope.variables) {
                for (const definition of variable.defs) {
                  checkDefinition(definition, variable, checked);
                }
              }
            }
          },
          TSInterfaceDeclaration(node) {
            checkName(node.id, 'PascalCase');
          },
          TSTypeAliasDeclaration(node) {
            checkName(node.id, 'PascalCase');
          },
          TSEnumDeclaration(node) {
            checkName(node.id, 'PascalCase');
          },
          TSTypeParameter(node) {
            checkName(node.name, 'PascalCase');
          },
        };
      },
    },
  },
};

export default stylePlugin;
