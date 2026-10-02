# ADR 0002: Bun as runtime, package manager, and test runner

- Status: Accepted
- Date: 2026-09-30

## Context

- Zeta will render its terminal UI with OpenTUI. OpenTUI's native renderer fails on Node 24 with
  "OpenTUI native FFI is not available for this runtime yet".
- OpenTUI supports Bun, and Node 26.4 or later only with experimental FFI enabled. Its testing docs
  use Bun.
- With Node tooling, app tests would need a second runtime and test runner next to the tooling
  tests.

## Options considered

- Keep Node 24, pnpm, and Vitest. Rejected: app code and app tests cannot load OpenTUI on Node 24.
- Move to Node 26.4 or later with experimental FFI. Rejected: it depends on an experimental flag,
  and the project prefers Bun for OpenTUI.
- Use Bun, and run Vitest on Bun. Rejected: Vitest works on Bun, but it adds a second test tool when
  Bun already has a test runner.
- Use Bun as the runtime, package manager, and test runner. Chosen: one runtime runs the tooling,
  the app, and every test.

## Decision

Zeta uses Bun as its runtime, package manager, and test runner.

- `bun.lock` is the only lockfile. `packageManager` in `package.json` pins the Bun version, and CI
  installs that version.
- Tests use `bun test` and import from `bun:test`.
- Vite+ stays for lint, formatting, and staged checks. TypeScript, Knip, and Changesets also stay.
- Scripts and hooks run installed command-line tools with `bunx --bun`, so tools with a Node shebang
  run on Bun.

## Tradeoffs

- The tooling, the app, and all tests share one runtime and one test runner.
- Cost: GitHub's dependency graph does not read `bun.lock`, so dependency review does not cover
  locked package versions. A scheduled `bun audit` covers them instead.
- Cost: tools that assume Node need `bunx --bun`, and a tool that fails on Bun has no Node fallback.
- Cost: Oxlint's test rules do not recognize `bun:test`, so test files get no test-specific lint.

## See also

- [OpenTUI runtime support](https://opentui.com/docs/getting-started/runtime-support/)
- [OpenTUI testing](https://opentui.com/docs/core-concepts/testing/)
