import { expect, it, onTestFinished } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

it('rejects lint warnings in project checks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gremlin-lint-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const fixture = join(directory, 'warning.js');
  await writeFile(fixture, 'console.log("warning fixture");\n');

  const result = spawnSync(process.execPath, ['run', 'lint', fixture], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
  });

  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('eslint(no-console)');
}, 30_000);

it('enforces house style only when explicitly enabled', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gremlin-style-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const fixture = join(directory, 'style.ts');

  await writeFile(
    fixture,
    [
      'export const MAX_RETRIES = 3;',
      'export interface requestOptions { request_id: string }',
      'export const cb = () => 1;',
      'export const caller = () => helper();',
      'const helper = () => 1;',
      'export const normalize = (name: string) => {',
      '  const trimmed = name.trim(); // Keep with the declaration.',
      '  return trimmed;',
      '};',
      'export const width = 80, height = 24;',
      'export const read = (value: string) => {',
      '  let result: string;',
      '  if ((result = value)) { return result; }',
      "  return '';",
      '};',
    ].join('\n'),
  );

  const environment = { ...process.env, GREMLIN_LINT_STYLE: '0' };

  const ordinary = spawnSync(process.execPath, ['run', 'lint', fixture], {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    timeout: 20_000,
  });

  const style = spawnSync(process.execPath, ['scripts/runStyle.ts', fixture], {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    timeout: 20_000,
  });

  expect(ordinary.error).toBeUndefined();
  expect(ordinary.status).toBe(0);
  expect(style.error).toBeUndefined();
  expect(style.status).toBe(1);

  for (const rule of [
    'naming-convention',
    'id-denylist',
    'helper-before-use',
    'padding-line-between-statements',
    'one-var',
    'no-cond-assign',
  ]) {
    expect(ordinary.stdout).not.toContain(rule);
    expect(style.stdout).toContain(rule);
  }
}, 60_000);

it('checks binding names and helper order without rejecting external fields or recursion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gremlin-style-bindings-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const fixtures = [
    [
      'valid.ts',
      `
      export interface RequestOptions { request_id: string }
      export type Result<Value> = Value | null;
      export class RequestError extends Error {}
      export const { request_id: requestId } = { request_id: 'one' };
      export const { omitted: _omitted, ...rest } = { omitted: 1, kept: 2 };
      export const unusedParameter = (_event: unknown, value: string) => value;
      export const anonymousParameter = (_: unknown, value: string) => value;
      export const recursive = (value: number): number => value ? recursive(value - 1) : 0;
      export type HelperResult = ReturnType<typeof helper>;
      const helper = () => 1;
      export const caller = () => helper();
      export const callback = () => laterValue;
      const laterValue = 1;
    `,
    ],
    [
      'invalid.ts',
      `
      export const MAX_RETRIES = 3;
      export interface requestOptions {}
      export type result<value> = value | null;
      export class requestError extends Error {}
      export const { request_id } = { request_id: 'one' };
      export const readParameter = (_value: string) => _value;
      export const badUnusedName = (_bad_name: unknown, value: string) => value;
      export const { omitted: _bad_name, ...rest } = { omitted: 1, kept: 2 };
      export const caller = () => helper();
      const helper = () => 1;
    `,
    ],
    [
      'shadowing.ts',
      `
      export const caller = () => helper();
      const helper = () => 1;
      export const other = (helper: () => number) => helper();
    `,
    ],
    [
      'wrapped.ts',
      `
      export const caller = () => helper();
      const helper = (() => 1) satisfies () => number;
      export const secondCaller = () => secondHelper();
      const secondHelper = function () { return 2; } as () => number;
      export const declarationCaller = () => declaredHelper();
      function declaredHelper() { return 3; }
    `,
    ],
    [
      'cycle.ts',
      `
      // eslint-disable-next-line gremlin/helper-before-use -- Mutually recursive helpers.
      export const even = (value: number): boolean => value === 0 || odd(value - 1);
      const odd = (value: number): boolean => value !== 0 && even(value - 1);
    `,
    ],
  ];

  for (const [name, source] of fixtures) {
    await writeFile(join(directory, name!), source!);
  }

  const result = spawnSync(process.execPath, ['scripts/runStyle.ts', directory], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
  });

  const diagnostics = result.stdout.split('\n').filter((line) => line.includes('gremlin('));

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(diagnostics.filter((line) => line.includes('/valid.ts:'))).toEqual([]);
  expect(diagnostics.filter((line) => line.includes('/cycle.ts:'))).toEqual([]);

  expect(
    diagnostics.filter(
      (line) => line.includes('/wrapped.ts:') && line.includes('helper-before-use'),
    ),
  ).toHaveLength(3);

  expect(
    diagnostics.filter(
      (line) => line.includes('/invalid.ts:') && line.includes('naming-convention'),
    ),
  ).toHaveLength(9);

  expect(
    diagnostics.filter(
      (line) => line.includes('/invalid.ts:') && line.includes('helper-before-use'),
    ),
  ).toHaveLength(1);

  expect(
    diagnostics.filter(
      (line) => line.includes('/shadowing.ts:') && line.includes('helper-before-use'),
    ),
  ).toHaveLength(1);
}, 30_000);

it('allows PascalCase only for function components that return JSX', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gremlin-style-components-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const fixtures = [
    [
      'valid.tsx',
      `
      export function DeclaredView() { return <box />; }
      export const ArrowView = () => <box>text</box>;
      export const ExpressionView = function () { return (<><box /></>); };
      export const LoadingView = (loading: boolean) => {
        if (loading) { return null; }
        return loading ? <text /> : <box />;
      };
    `,
    ],
    [
      'invalid.tsx',
      `
      export const MaxItems = 3;
      export const MAX_ITEMS = 3;
      export function NotView() { return 1; }
      export const Renderer = () => { const render = () => <box />; return render; };
      export const MAIN_VIEW = () => <box />;
      export let MutableView = () => <box />;
      export var VariableView = function () { return <box />; };
      export const { name: DisplayName } = () => <box />;
      export const { length: Arity } = function () { return <box />; };
      export function ParameterView(Label: string) { return <box>{Label}</box>; }
      export function DestructuredView({ title: Title }: { title: string }) {
        return <box>{Title}</box>;
      }
    `,
    ],
  ];

  for (const [name, source] of fixtures) {
    await writeFile(join(directory, name!), source!);
  }

  const result = spawnSync(process.execPath, ['scripts/runStyle.ts', directory], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
  });

  const diagnostics = result.stdout
    .split('\n')
    .filter((line) => line.includes('gremlin(naming-convention)'));

  const invalidLines = fixtures[1]![1]!.split('\n');

  const reportedName = (diagnostic: string) => {
    const [, line, column] = diagnostic.match(/\/invalid\.tsx:(\d+):(\d+):/) ?? [];
    const sourceLine = invalidLines[Number(line) - 1] ?? '';

    return sourceLine.slice(Number(column) - 1).match(/^\w+/)?.[0] ?? '';
  };

  expect(result.error).toBeUndefined();
  expect(diagnostics.filter((line) => line.includes('/valid.tsx:'))).toEqual([]);

  expect(
    diagnostics
      .filter((line) => line.includes('/invalid.tsx:'))
      .map(reportedName)
      .toSorted((left, right) => left.localeCompare(right)),
  ).toEqual([
    'Arity',
    'DisplayName',
    'Label',
    'MAIN_VIEW',
    'MAX_ITEMS',
    'MaxItems',
    'MutableView',
    'NotView',
    'Renderer',
    'Title',
    'VariableView',
  ]);
}, 30_000);

it('fixes house spacing without changing comments or names', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gremlin-style-fix-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const fixture = join(directory, 'spacing.ts');

  await writeFile(
    fixture,
    [
      'export const normalize = (name: string) => {',
      '  const trimmed = name.trim(); // Keep with the declaration.',
      '  // Keep with the guard.',
      '  if (!trimmed) {',
      "    return 'unknown';",
      '  }',
      '  return trimmed;',
      '};',
      'export const width = 80, height = 24;',
    ].join('\n'),
  );

  const result = spawnSync(process.execPath, ['scripts/runStyle.ts', '--fix', fixture], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
  });

  expect(result.error).toBeUndefined();
  expect(result.stdout + result.stderr).not.toMatch(/\berror\b/);
  expect(result.status).toBe(0);

  expect(await readFile(fixture, 'utf8')).toBe(
    [
      'export const normalize = (name: string) => {',
      '  const trimmed = name.trim(); // Keep with the declaration.',
      '',
      '  // Keep with the guard.',
      '  if (!trimmed) {',
      "    return 'unknown';",
      '  }',
      '',
      '  return trimmed;',
      '};',
      '',
      'export const width = 80;',
      'export const height = 24;',
      '',
    ].join('\n'),
  );

  const fixed = await readFile(fixture, 'utf8');

  const repeated = spawnSync(process.execPath, ['scripts/runStyle.ts', '--fix', fixture], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
  });

  expect(repeated.error).toBeUndefined();
  expect(repeated.status).toBe(0);
  expect(await readFile(fixture, 'utf8')).toBe(fixed);

  const manual = join(directory, 'manual.ts');

  await writeFile(
    manual,
    'export const MAX_RETRIES=3;\nexport const caller=()=>helper();\nconst helper=()=>1;\n',
  );

  const manualResult = spawnSync(process.execPath, ['scripts/runStyle.ts', '--fix', manual], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
  });

  expect(manualResult.error).toBeUndefined();
  expect(manualResult.status).toBe(1);

  expect(await readFile(manual, 'utf8')).toBe(
    'export const MAX_RETRIES = 3;\nexport const caller = () => helper();\nconst helper = () => 1;\n',
  );
}, 60_000);

it('pads loop exits and multiline statements in a form the formatter keeps', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gremlin-style-multiline-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const fixture = join(directory, 'multiline.ts');

  await writeFile(
    fixture,
    [
      'export const limit = 9;',
      'export const options = {',
      '  limit,',
      '};',
      '',
      'export const collect = (values: number[]) => {',
      '  const collected: number[] = [];',
      '',
      '  for (const value of values) {',
      '    if (value < 0) {',
      '      collected.push(0);',
      '      continue;',
      '    }',
      '',
      '    if (value > limit) {',
      '      collected.push(limit);',
      '      break;',
      '    }',
      '',
      '    collected.push(value);',
      '  }',
      '',
      '  collected.sort((left, right) => left - right);',
      '  Object.assign(collected, {',
      '    total: collected.length,',
      '  });',
      '  collected.reverse();',
      '',
      '  return collected;',
      '};',
      '',
    ].join('\n'),
  );

  const check = spawnSync(process.execPath, ['scripts/runStyle.ts', fixture], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
  });

  const diagnostics = check.stdout
    .split('\n')
    .filter((line) => line.includes('padding-line-between-statements'));

  expect(check.error).toBeUndefined();
  expect(check.status).toBe(1);
  expect(diagnostics).toHaveLength(5);

  const fix = spawnSync(process.execPath, ['scripts/runStyle.ts', '--fix', fixture], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
  });

  expect(fix.error).toBeUndefined();
  expect(fix.status).toBe(0);

  expect(await readFile(fixture, 'utf8')).toBe(
    [
      'export const limit = 9;',
      '',
      'export const options = {',
      '  limit,',
      '};',
      '',
      'export const collect = (values: number[]) => {',
      '  const collected: number[] = [];',
      '',
      '  for (const value of values) {',
      '    if (value < 0) {',
      '      collected.push(0);',
      '',
      '      continue;',
      '    }',
      '',
      '    if (value > limit) {',
      '      collected.push(limit);',
      '',
      '      break;',
      '    }',
      '',
      '    collected.push(value);',
      '  }',
      '',
      '  collected.sort((left, right) => left - right);',
      '',
      '  Object.assign(collected, {',
      '    total: collected.length,',
      '  });',
      '',
      '  collected.reverse();',
      '',
      '  return collected;',
      '};',
      '',
    ].join('\n'),
  );

  const recheck = spawnSync(process.execPath, ['scripts/runStyle.ts', fixture], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
  });

  expect(recheck.error).toBeUndefined();
  expect(recheck.status).toBe(0);
}, 60_000);

it('moves types above unrelated values but leaves types derived from a value beside it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gremlin-style-types-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const fixture = join(directory, 'types.ts');
  await writeFile(join(directory, 'home.ts'), "export const home = '/gremlin';\n");

  await writeFile(
    fixture,
    [
      "import { home } from './home.ts';",
      '',
      'export const root = home.trim();',
      '',
      '// Describes one request.',
      'export interface Request {',
      '  path: string;',
      '}',
      '',
      'const defaults = { path: root };',
      '',
      'export type Defaults = typeof defaults;',
      '',
      'const build = (path: string): Request => ({ path });',
      '',
      'export type Built = ReturnType<typeof build>;',
      '',
      'type Paths = string[];',
      '',
      'export const paths: Paths = [build(root).path, defaults.path];',
      '',
      'type Name = string; paths.push(root);',
      '',
      'export default interface Options {',
      '  name: Name;',
      '}',
      '',
      'paths.pop(); export type Label = Name;',
      '',
    ].join('\n'),
  );

  const check = spawnSync(process.execPath, ['scripts/runStyle.ts', fixture], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
  });

  const diagnostics = check.stdout.split('\n').filter((line) => line.includes('type-placement'));

  expect(check.error).toBeUndefined();
  expect(check.status).toBe(1);
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]).toContain('/types.ts:6:');

  const fix = spawnSync(process.execPath, ['scripts/runStyle.ts', '--fix', fixture], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
  });

  expect(fix.error).toBeUndefined();
  expect(fix.status).toBe(0);

  expect(await readFile(fixture, 'utf8')).toBe(
    [
      "import { home } from './home.ts';",
      '',
      '// Describes one request.',
      'export interface Request {',
      '  path: string;',
      '}',
      '',
      'type Paths = string[];',
      '',
      'type Name = string;',
      '',
      'export default interface Options {',
      '  name: Name;',
      '}',
      '',
      'export type Label = Name;',
      '',
      'export const root = home.trim();',
      '',
      'const defaults = { path: root };',
      '',
      'export type Defaults = typeof defaults;',
      '',
      'const build = (path: string): Request => ({ path });',
      '',
      'export type Built = ReturnType<typeof build>;',
      '',
      'export const paths: Paths = [build(root).path, defaults.path];',
      '',
      'paths.push(root);',
      '',
      'paths.pop();',
      '',
    ].join('\n'),
  );
}, 60_000);

it('keeps size thresholds advisory without weakening other lint checks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gremlin-style-size-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const fixture = join(directory, 'large.ts');

  await writeFile(
    fixture,
    [
      'export const sum = (first: number, second: number, third: number, fourth: number, fifth: number) => first + second + third + fourth + fifth;',
      '',
      'export const longFunction = (values: number[]) => {',
      ...Array.from({ length: 61 }, (_, index) => `  values.push(${index});`),
      '};',
      '',
      ...Array.from({ length: 501 }, (_, index) => `export const value${index} = ${index};`),
    ].join('\n'),
  );

  const result = spawnSync(process.execPath, ['scripts/runStyle.ts', fixture], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
  });

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout).not.toContain('max-lines');
  expect(result.stdout).not.toContain('max-params');
}, 30_000);

it('limits the checks joined in one condition and rejects mixed operators', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gremlin-style-conditions-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const fixtures = [
    [
      'valid.ts',
      `
      export const three = (a: boolean, b: boolean, c: boolean) => a || b || c;
      export const fallback = (a?: string, b?: string, c?: string, d?: string) => a ?? b ?? c ?? d;
      export const negated = (a: boolean, b: boolean, c: boolean) => !(a || b || c);
      export const wrapped = (a: boolean, b: boolean, c: boolean) => (a || b || c) satisfies boolean;
      export const named = (a: boolean, b: boolean, c: boolean) => {
        const either = b || c;

        return a && either;
      };
    `,
    ],
    [
      'invalid.ts',
      `
      export const four = (a: boolean, b: boolean, c: boolean, d: boolean) => a || b || c || d;
      export const mixed = (a: boolean, b: boolean, c: boolean) => a && (b || c);
      export const asserted = (a: boolean, b: boolean, c: boolean) => a && ((b || c) as boolean);
      export const satisfied = (a: boolean, b: boolean, c: boolean) => a && ((b || c) satisfies boolean);
      export const negated = (a: boolean, b: boolean, c: boolean) => a && !(b || c);
    `,
    ],
  ];

  for (const [name, source] of fixtures) {
    await writeFile(join(directory, name!), source!);
  }

  const result = spawnSync(process.execPath, ['scripts/runStyle.ts', directory], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
  });

  const diagnostics = result.stdout
    .split('\n')
    .filter((line) => line.includes('max-condition-checks'));

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(diagnostics.filter((line) => line.includes('/valid.ts:'))).toEqual([]);
  expect(diagnostics.filter((line) => line.includes('/invalid.ts:'))).toHaveLength(5);
}, 30_000);

it('keeps imports inside module boundaries in ordinary lint', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gremlin-boundaries-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  // The `src` segment above the project root must not count as the application source.
  const project = join(directory, 'src', 'project');

  const configUrl = pathToFileURL(join(project, 'src', 'config.ts')).href;
  const privateSessionUrl = pathToFileURL(join(project, 'src', 'session', 'valueImports.ts')).href;

  const fixtures: [string, string[], number][] = [
    [
      'src/work/work.ts',
      [
        "import { helper } from './helper.ts';",
        "import { nested } from './nested/deep';",
        'export const work = helper + nested;',
      ],
      0,
    ],
    ['src/work/helper.ts', ['export const helper = 1;'], 0],
    [
      'src/work/nested/deep.ts',
      ["import { helper } from '../helper.ts';", 'export const nested = helper;'],
      0,
    ],
    [
      'src/work/work.test.ts',
      [
        "import { expect, it } from 'bun:test';",
        "import { work } from './work.ts';",
        "it('works', () => expect(work).toBe(2));",
      ],
      0,
    ],
    ['src/config.ts', ['export const config = 1;'], 0],
    [
      'src/config.test.ts',
      [
        "import { expect, it } from 'bun:test';",
        "import { config } from './config.ts';",
        "it('configures', () => expect(config).toBe(1));",
      ],
      0,
    ],
    [
      'src/github/github.ts',
      [
        "import { work } from '../work/work';",
        'export const github = work;',
        'export interface Github { id: number }',
      ],
      0,
    ],
    [
      'src/localState.ts',
      [
        "import { work } from './work/work.js';",
        'export const localState = work;',
        'export interface LocalState { id: number }',
      ],
      0,
    ],
    [
      'src/actions.ts',
      [
        "import { readFile } from 'node:fs/promises';",
        "import { config } from './config.ts';",
        "import { work } from './work/work.ts';",
        'export const actions = [readFile, config, work];',
        'export interface Actions { id: number }',
      ],
      0,
    ],
    [
      'src/session/session.ts',
      [
        "import type { Github } from '../github/github.ts';",
        "import { type LocalState } from '../localState.ts';",
        "import { work } from '../work/work.ts';",
        "export type { Actions } from '../actions.ts';",
        "export type GithubIdentifier = import('../github/github.ts').Github['id'];",
        'const loaded = await import(`../work/work.ts`);',
        'export const session = [work, loaded];',
        'export type Sources = [Github, LocalState];',
      ],
      0,
    ],
    [
      'src/commands.ts',
      [
        "import { session } from './session/session.ts';",
        "import { work } from './work/work.ts';",
        'export const commands = [session, work];',
      ],
      0,
    ],
    [
      'src/ui/ui.tsx',
      [
        "import { useState } from 'react';",
        "import { createRoot } from '@opentui/react';",
        "import { commands } from '../commands.ts';",
        "import { session } from '../session/session.ts';",
        "import { view } from './view.tsx';",
        'export const ui = [useState, createRoot, commands, session, view];',
      ],
      0,
    ],
    ['src/ui/view.tsx', ['export const view = 1;'], 0],
    [
      'src/ui/ui.test.tsx',
      [
        "import { expect, it } from 'bun:test';",
        "import { ui } from './ui.tsx';",
        "it('renders', () => expect(ui).toHaveLength(5));",
      ],
      0,
    ],
    [
      'src/terminal.tsx',
      [
        "import process from 'node:process';",
        "import { commands } from './commands.ts';",
        "import { config } from './config.ts';",
        "import { session } from './session/session.ts';",
        "import { ui } from './ui/ui.tsx';",
        'export const terminal = [process, commands, config, session, ui];',
      ],
      0,
    ],
    [
      'src/index.ts',
      [
        "import { actions } from './actions.ts';",
        "import { commands } from './commands.ts';",
        "import { config } from './config.ts';",
        "import { github } from './github/github.ts';",
        "import { localState } from './localState.ts';",
        "import { session } from './session/session.ts';",
        "import { terminal } from './terminal.tsx';",
        "import { ui } from './ui/ui.tsx';",
        "import { work } from './work/work.ts';",
        'export const index = [actions, commands, config, github, localState, session, terminal, ui, work];',
      ],
      0,
    ],
    [
      'scripts/tool.ts',
      [
        "import { readFile } from 'node:fs';",
        "import { helper } from '../src/work/helper.ts';",
        'export const tool = [readFile, helper];',
      ],
      0,
    ],
    ['src/utils.ts', ['export const utils = 1;'], 1],
    ['src/helpers/format.ts', ['export const format = 1;'], 1],
    ['src/session.ts', ['export const misplaced = 1;'], 1],
    ['src/config/values.ts', ['export const values = 1;'], 1],
    [
      'src/work/refusedModules.ts',
      [
        "import { config } from '../config.ts';",
        "import type { Github } from '../github/github.ts';",
        "export * from '../session/session.ts';",
        'export const refused: [number, Github?] = [config];',
      ],
      3,
    ],
    [
      'src/session/valueImports.ts',
      [
        "import { github } from '../github/github.ts';",
        "import { type Actions, actions } from '../actions.ts';",
        "export { localState } from '../localState.ts';",
        "const loaded = await import('../localState.ts');",
        'export const values = [github, actions, loaded];',
        'export type Value = Actions;',
      ],
      4,
    ],
    ['src/session/typeImports.ts', ["export type Command = import('../commands.ts').Command;"], 1],
    [
      'src/ui/privateImports.tsx',
      [
        "import { helper } from '../work/helper.ts';",
        "import { work } from '../work';",
        "import { nested } from '../work/nested/deep.ts';",
        "export * from '../session/valueImports.ts';",
        'export const imported = [helper, work, nested];',
      ],
      4,
    ],
    [
      'src/github/escape.ts',
      [
        "import { outside } from '../../outside.ts';",
        "import { work } from '../../src/work/work.ts';",
        'export const escaped = [outside, work];',
      ],
      1,
    ],
    [
      'src/work/runtime.ts',
      [
        "import { readFile } from 'node:fs';",
        "import path from 'path';",
        "import { $ } from 'bun';",
        "import { test } from 'bun:test';",
        "import { useState } from 'react';",
        "import { jsx } from 'react/jsx-runtime';",
        "import { createCliRenderer } from '@opentui/core';",
        "import { parse } from 'yaml';",
        'export const runtime = [readFile, path, $, test, useState, jsx, createCliRenderer, parse];',
      ],
      7,
    ],
    [
      'src/ui/runtime.tsx',
      [
        "import { readFileSync } from 'fs';",
        "import { useState } from 'react';",
        "import { createRoot } from '@opentui/react';",
        'export const runtime = [readFileSync, useState, createRoot];',
      ],
      1,
    ],
    [
      'src/commands.test.ts',
      [
        "import { expect, it } from 'bun:test';",
        "import { readFile } from 'node:fs/promises';",
        "import { commands } from './commands.ts';",
        "it('reads', () => expect([readFile, commands]).toHaveLength(2));",
      ],
      1,
    ],
    [
      'src/work/dynamic.ts',
      [
        "const name = 'helper';",
        'export const computed = await import(name);',
        // eslint-disable-next-line eslint/no-template-curly-in-string -- Fixture source with an interpolated import.
        'export const interpolated = await import(`./${name}.ts`);',
        "export const refused = await import('../config.ts');",
        "export const allowed = await import('./helper.ts');",
      ],
      3,
    ],
    ['src/work/directory.ts', ["export * from '.';"], 1],
    [
      'src/work/fileUrls.ts',
      [
        `export { config } from '${configUrl}';`,
        `export const loaded = await import('${privateSessionUrl}');`,
      ],
      2,
    ],
  ];

  await mkdir(project, { recursive: true });
  await writeFile(join(project, 'package.json'), '{}\n');

  for (const [file, lines] of fixtures) {
    const path = join(project, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${lines.join('\n')}\n`);
  }

  const result = spawnSync(process.execPath, ['run', 'lint', project], {
    cwd: root,
    env: { ...process.env, GREMLIN_LINT_STYLE: '0' },
    encoding: 'utf8',
    timeout: 20_000,
  });

  const diagnostics = result.stdout
    .split('\n')
    .filter((line) => line.includes('gremlin(module-boundaries)'));

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);

  for (const [file, , count] of fixtures) {
    const fileDiagnostics = diagnostics.filter((line) =>
      line.startsWith(`${join(project, file)}:`),
    );

    expect({ file, diagnostics: fileDiagnostics.length }).toEqual({ file, diagnostics: count });
  }

  const expected = fixtures.reduce((total, fixture) => total + fixture[2], 0);
  expect(diagnostics).toHaveLength(expected);
}, 30_000);
