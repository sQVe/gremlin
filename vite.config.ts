import { defineConfig } from 'vite-plus';

// Explicit commands opt in; language servers keep the ordinary diagnostics.
// eslint-disable-next-line node/no-process-env -- Scoped to the style command's child process.
const styleEnabled = process.env.GREMLIN_LINT_STYLE === '1';

const blockStatements = ['if', 'for', 'while', 'do', 'switch', 'try'];

const multilineStatements = [
  'multiline-block-like',
  'multiline-const',
  'multiline-export',
  'multiline-expression',
  'multiline-let',
  'multiline-return',
  'multiline-type',
  { selector: 'ClassDeclaration, TSInterfaceDeclaration', lineMode: 'multiline' },
];

const statementPadding = [
  { blankLine: 'always', prev: '*', next: ['return', 'break', 'continue'] },
  { blankLine: 'always', prev: '*', next: blockStatements },
  { blankLine: 'always', prev: blockStatements, next: '*' },
];

// Spread last: later entries win, so a multiline declaration is padded inside a declaration group.
const multilinePadding = [
  { blankLine: 'always', prev: '*', next: multilineStatements },
  { blankLine: 'always', prev: multilineStatements, next: '*' },
];

// Production code separates a group of declarations from the steps that use it; tests keep their
// arrange steps compact.
const declarationPadding = [
  { blankLine: 'always', prev: ['const', 'let'], next: '*' },
  { blankLine: 'any', prev: ['const', 'let'], next: ['const', 'let'] },
];

const paddingRule = (...entries: object[]): ['error', ...object[]] => ['error', ...entries];

export default defineConfig({
  lint: {
    plugins: ['typescript', 'unicorn', 'oxc', 'import', 'node'],
    categories: {
      correctness: 'error',
      suspicious: 'error',
      perf: 'warn',
    },
    options: {
      typeAware: true,
    },
    jsPlugins: ['./scripts/stylePlugin.ts', ...(styleEnabled ? ['@stylistic/eslint-plugin'] : [])],
    rules: {
      ...(styleEnabled
        ? {
            'gremlin/naming-convention': 'error',
            'eslint/no-cond-assign': ['error', 'always'],
            'eslint/id-denylist': [
              'error',
              'btn',
              'cb',
              'errMsg',
              'ctx',
              'cfg',
              'msg',
              'err',
              'idx',
              'res',
              'req',
              'tmp',
              'fn',
              'el',
              'str',
              'val',
              'obj',
              'arr',
              'opts',
            ],
            'eslint/one-var': ['error', 'never'],
            'gremlin/helper-before-use': 'error',
            'gremlin/max-condition-checks': 'error',
            'gremlin/type-placement': 'error',
            '@stylistic/padding-line-between-statements': paddingRule(
              ...statementPadding,
              ...declarationPadding,
              ...multilinePadding,
            ),
          }
        : {}),
      'gremlin/module-boundaries': 'error',
      'typescript/no-unnecessary-condition': 'error',
      'typescript/prefer-readonly': 'error',
      'typescript/no-unsafe-type-assertion': 'error',
      'typescript/no-unnecessary-type-assertion': 'error',
      'typescript/no-unnecessary-boolean-literal-compare': 'error',
      'typescript/no-redundant-type-constituents': 'error',
      'typescript/no-meaningless-void-operator': 'error',
      'typescript/restrict-template-expressions': 'error',
      'typescript/no-base-to-string': 'error',
      'typescript/require-array-sort-compare': 'error',
      'typescript/no-mixed-enums': 'error',
      'typescript/strict-boolean-expressions': [
        'error',
        {
          allowNullableString: false,
          allowNullableBoolean: false,
          allowNullableObject: true,
          allowNumber: true,
        },
      ],
      'unicorn/prefer-top-level-await': 'error',
      'eslint/no-warning-comments': 'error',
      'typescript/unbound-method': 'off',
      'typescript/no-extraneous-class': 'off',
      'typescript/no-unsafe-enum-comparison': 'off',
      'oxc/no-async-endpoint-handlers': 'off',
      'oxc/no-this-in-exported-function': 'off',

      'eslint/curly': 'error',
      'eslint/func-style': ['error', 'expression'],
      'eslint/prefer-const': 'error',
      'eslint/no-nested-ternary': 'error',
      'eslint/eqeqeq': [
        'error',
        'always',
        {
          null: 'ignore',
        },
      ],
      'eslint/no-param-reassign': 'error',
      'eslint/default-param-last': 'error',
      'eslint/no-empty': 'error',
      'eslint/no-unreachable-loop': 'error',

      'typescript/consistent-type-imports': 'error',
      'typescript/consistent-type-definitions': ['error', 'interface'],
      'typescript/no-inferrable-types': 'error',
      'typescript/prefer-nullish-coalescing': 'error',
      'typescript/no-explicit-any': 'error',
      'typescript/no-non-null-assertion': 'error',
      'typescript/no-misused-promises': 'error',
      'typescript/no-floating-promises': 'error',
      'typescript/await-thenable': 'error',
      'typescript/no-unsafe-argument': 'error',
      'typescript/no-unsafe-assignment': 'error',
      'typescript/no-unsafe-call': 'error',
      'typescript/no-unsafe-member-access': 'error',
      'typescript/no-unsafe-return': 'error',
      'typescript/switch-exhaustiveness-check': 'error',
      'typescript/only-throw-error': 'error',
      'typescript/return-await': 'error',
      'typescript/restrict-plus-operands': 'error',
      'typescript/ban-ts-comment': 'error',
      'typescript/no-unsafe-function-type': 'error',
      'typescript/prefer-includes': 'error',
      'typescript/prefer-promise-reject-errors': 'error',
      'typescript/prefer-ts-expect-error': 'error',
      'typescript/no-namespace': 'error',
      'typescript/no-require-imports': 'error',
      'typescript/consistent-generic-constructors': 'error',
      'typescript/array-type': [
        'error',
        {
          default: 'array',
        },
      ],
      'typescript/adjacent-overload-signatures': 'error',
      'typescript/no-empty-object-type': 'error',
      'typescript/no-import-type-side-effects': 'error',
      'typescript/no-non-null-asserted-nullish-coalescing': 'error',
      'typescript/use-unknown-in-catch-callback-variable': 'error',

      'import/no-cycle': 'error',
      'import/no-commonjs': 'error',
      'import/consistent-type-specifier-style': 'error',
      'import/first': 'error',
      'import/no-duplicates': 'error',
      'import/no-mutable-exports': 'error',
      'import/export': 'error',

      'unicorn/no-negation-in-equality-check': 'error',
      'unicorn/no-immediate-mutation': 'error',
      'unicorn/no-instanceof-array': 'error',
      'unicorn/no-this-assignment': 'error',
      'unicorn/no-unreadable-iife': 'error',
      'unicorn/no-useless-promise-resolve-reject': 'error',
      'unicorn/new-for-builtins': 'error',
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prefer-module': 'error',
      'unicorn/catch-error-name': [
        'error',
        {
          name: 'error',
        },
      ],
      'unicorn/error-message': 'error',
      'unicorn/throw-new-error': 'error',
      'unicorn/prefer-structured-clone': 'error',
      'unicorn/prefer-type-error': 'error',
      'unicorn/no-new-buffer': 'error',
      'unicorn/no-length-as-slice-end': 'error',
      'unicorn/no-abusive-eslint-disable': 'error',
      'unicorn/no-document-cookie': 'error',
      'unicorn/no-useless-error-capture-stack-trace': 'error',
      'unicorn/prefer-number-properties': 'error',
      'unicorn/prefer-array-find': 'error',
      'unicorn/prefer-array-flat-map': 'error',
      'unicorn/no-anonymous-default-export': 'error',

      'oxc/no-const-enum': 'error',
      'oxc/no-accumulating-spread': 'error',
      'oxc/bad-bitwise-operator': 'error',

      'node/no-new-require': 'error',
      'node/no-path-concat': 'error',
      'node/no-exports-assign': 'error',

      'eslint/no-console': 'warn',
      'eslint/complexity': [
        'warn',
        {
          max: 12,
        },
      ],
      'eslint/max-depth': [
        'warn',
        {
          max: 3,
        },
      ],
      'eslint/max-nested-callbacks': [
        'warn',
        {
          max: 3,
        },
      ],
      'eslint/no-await-in-loop': 'warn',
      'eslint/no-empty-function': 'warn',
      'eslint/no-template-curly-in-string': 'warn',
      'eslint/accessor-pairs': 'warn',

      'typescript/no-deprecated': 'warn',
      'typescript/require-await': 'warn',
      'typescript/no-confusing-void-expression': 'warn',
      'typescript/related-getter-setter-pairs': 'warn',
      'typescript/consistent-type-assertions': [
        'warn',
        {
          assertionStyle: 'as',
        },
      ],
      'typescript/prefer-for-of': 'warn',
      'typescript/prefer-function-type': 'warn',
      'typescript/prefer-reduce-type-parameter': 'warn',
      'typescript/unified-signatures': 'warn',
      'typescript/no-dynamic-delete': 'warn',
      'typescript/no-invalid-void-type': 'warn',
      'typescript/consistent-type-exports': 'warn',
      'typescript/no-unnecessary-type-conversion': 'warn',
      'typescript/no-unnecessary-type-parameters': 'warn',
      'typescript/no-useless-default-assignment': 'warn',
      'typescript/prefer-find': 'warn',
      'typescript/prefer-optional-chain': 'warn',
      'typescript/prefer-string-starts-ends-with': 'warn',

      'import/no-named-as-default': 'warn',
      'import/no-named-as-default-member': 'warn',
      'import/no-unassigned-import': 'warn',
      'import/no-named-default': 'warn',

      'unicorn/consistent-function-scoping': 'warn',
      'unicorn/no-object-as-default-parameter': 'warn',
      'unicorn/no-typeof-undefined': 'warn',
      'unicorn/no-unnecessary-array-flat-depth': 'warn',
      'unicorn/no-unnecessary-array-splice-count': 'warn',
      'unicorn/no-unnecessary-slice-end': 'warn',
      'unicorn/no-useless-switch-case': 'warn',
      'unicorn/prefer-array-some': 'warn',
      'unicorn/prefer-event-target': 'warn',
      'unicorn/prefer-regexp-test': 'warn',
      'unicorn/require-number-to-fixed-digits-argument': 'warn',
      'unicorn/consistent-date-clone': 'warn',
      'unicorn/consistent-existence-index-check': 'warn',
      'unicorn/custom-error-definition': 'warn',
      'unicorn/filename-case': [
        'warn',
        {
          cases: {
            camelCase: true,
            pascalCase: true,
          },
        },
      ],
      'unicorn/no-array-method-this-argument': 'warn',
      'unicorn/no-await-expression-member': 'warn',
      'unicorn/no-unreadable-array-destructuring': 'warn',
      'unicorn/no-useless-collection-argument': 'warn',
      'unicorn/prefer-array-index-of': 'warn',
      'unicorn/prefer-default-parameters': 'warn',
      'unicorn/prefer-global-this': 'warn',
      'unicorn/prefer-logical-operator-over-ternary': 'warn',
      'unicorn/prefer-negative-index': 'warn',
      'unicorn/prefer-object-from-entries': 'warn',
      'unicorn/prefer-optional-catch-binding': 'warn',
      'unicorn/prefer-string-trim-start-end': 'warn',
      'unicorn/prefer-response-static-json': 'warn',
      'unicorn/require-array-join-separator': 'warn',
      'unicorn/prefer-blob-reading-methods': 'warn',
      'unicorn/prefer-set-has': 'warn',
      'unicorn/no-instanceof-builtins': 'warn',

      'oxc/no-barrel-file': 'error',
      'oxc/no-map-spread': 'warn',
      'oxc/branches-sharing-code': 'warn',

      'node/no-process-env': 'warn',
    },
    overrides: [
      ...(styleEnabled
        ? [
            {
              files: ['**/*.test.{ts,tsx}', '**/fixtures/**', 'tests/*.ts'],
              rules: {
                '@stylistic/padding-line-between-statements': paddingRule(
                  ...statementPadding,
                  ...multilinePadding,
                ),
              },
            },
          ]
        : []),
      {
        files: ['**/*.test.{ts,tsx}', '**/fixtures/**', 'tests/*.ts'],
        rules: {
          'typescript/no-explicit-any': 'off',
          'typescript/no-non-null-assertion': 'off',
          'typescript/no-unsafe-type-assertion': 'off',
          'eslint/no-empty-function': 'off',
          'eslint/max-nested-callbacks': 'off',
          // Test steps are ordered, and async mocks need not suspend.
          'eslint/no-await-in-loop': 'off',
          'typescript/require-await': 'off',
          // Direct assertions and nested fixtures keep test scenarios together.
          'unicorn/no-await-expression-member': 'off',
          'eslint/complexity': 'off',
          'eslint/max-depth': 'off',
          // Tests isolate the real process environment.
          'node/no-process-env': 'off',
        },
      },
    ],
  },
  fmt: {
    printWidth: 100,
    singleQuote: true,
    // Local agent state is not source and must not be reformatted.
    ignorePatterns: ['bun.lock', '.tau/**'],
    overrides: [{ files: ['*.md'], options: { proseWrap: 'always' } }],
    sortImports: {
      newlinesBetween: true,
      groups: ['builtin', 'external', ['parent', 'sibling', 'index'], 'style', 'unknown'],
    },
  },
  staged: {
    '*.{ts,tsx,js,jsx,mjs,cjs}': [
      'bun scripts/runStyle.ts',
      'bunx --bun vp fmt --check --no-error-on-unmatched-pattern',
    ],
    '*.{json,md,yaml,yml,css}': 'bunx --bun vp fmt --check --no-error-on-unmatched-pattern',
  },
});
