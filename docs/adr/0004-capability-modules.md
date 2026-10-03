# ADR 0004: Capability modules with an enforced import table

- Status: Accepted
- Date: 2026-10-01

## Context

- Zeta reads GitHub, classifies work, coordinates a session, runs local actions, saves dismissals,
  reads config, and renders a terminal UI. Each job needs one clear owner before app code exists.
- Surveys of mature TUIs suggested layer folders such as `domain/`, `application/`, and `adapters/`.
  In Tau, generic layers and early shared extraction became scaffolding that later had to be
  removed.
- Separate files alone did not constrain state access in lazygit, whose refactor PR #2519 says "it's
  not clear where state should live".
- Written rules alone did not hold in Tau: it grew four task-ID parsers despite a parse-once rule.
  Boundaries need a mechanical check.

## Options considered

- Layer folders (`domain/`, `application/`, `adapters/`, `ui/`). Rejected: the folder names say
  little about who owns a job, and they invite empty scaffolding.
- Capability modules with import rules written only in `AGENTS.md`. Rejected: the rules would drift
  without a check.
- Start every module as one flat file and add folders later. Rejected: `github`, `work`, `session`,
  and `ui` each split into several files in the first version.
- Capability modules with an import table enforced by lint. Chosen: modules name their owner, and
  lint refuses imports that cross the table.

## Decision

`src/` holds capability modules. A lint rule, `zeta/module-boundaries`, enforces which module may
import which.

### Modules

- Folder modules: `github/`, `work/`, `session/`, `ui/`. Each has one public entry file named after
  the folder, such as `session/session.ts`. Other files in the folder are private to the module.
- Flat modules: `config.ts`, `actions.ts`, `localState.ts`, `commands.ts`, `index.ts`,
  `terminal.tsx`.
- A file outside these modules is an error. A new module starts as a flat file. It becomes a folder
  when it needs a second source file.

### Import direction

- `work` and `config` import no other module.
- `github`, `localState`, and `actions` import `work`. `actions` also imports `config`.
- `session` imports `work`. It may import types from `github`, `actions`, and `localState`, but not
  their functions. Their functions reach the session as injected dependencies.
- `commands` imports `work` and `session`. `ui` imports `work`, `session`, and `commands`. Neither
  imports an integration module.
- `terminal` imports `ui`, `session`, `commands`, and `config`. `index` imports any module. No
  module imports `index` or `terminal`, except `index` importing `terminal`.
- `work`, `session`, `commands`, and `ui` import no Node or Bun built-ins. `work`, `session`, and
  `commands` also import no React or OpenTUI packages.
- Type imports count as dependencies. Dynamic imports must use a literal path.

The rule holds the exact table. A change that keeps these directions updates the rule. A new module
joins the table with the ADR that introduces it. A change that reverses a direction needs a new ADR.

### Code placement

- Types live in the module that owns them. Do not add a shared `types.ts`, `utils/`, or barrel file.
- Extract shared code only when two existing consumers need it.

## Tradeoffs

- An agent or reviewer can read ownership from the path, and lint refuses imports that cross it.
- Pure modules stay free of I/O, so tests run them without fakes.
- Cost: every new module or edge needs a rule change, which adds friction to small additions.
- Cost: the rule checks import paths only. It does not detect I/O reached through globals such as
  `Date.now` or `process`.

## See also

- [ADR 0005: One session store outside React](./0005-session-store.md)
- [ADR 0007: Side effects as narrow function records](./0007-side-effect-functions.md)
- [lazygit PR #2519](https://github.com/jesseduffield/lazygit/pull/2519)
