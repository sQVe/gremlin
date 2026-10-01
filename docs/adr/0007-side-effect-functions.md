# ADR 0007: Side effects as narrow function records

- Status: Accepted
- Date: 2026-10-01

## Context

- Gremlin calls `gh`, Grove, Herdr, tuicr, the browser, the filesystem, and the clock. Tests must
  run without a GitHub account or these tools.
- Tests of a refused action must show that no command ran and no file changed.
- In Tau, adapter interfaces without a second implementation became scaffolding. lazygit's guide
  names a "God Struct" of broad dependencies.
- Gremlin usually runs inside Herdr, but it must also work without Herdr.

## Options considered

- Adapter interfaces, classes, or a service container. Rejected: each has one production
  implementation, so the extra type adds no choice.
- One shared `Effects` record for the whole app. Rejected: every consumer could reach every effect,
  and one type would couple all modules.
- Direct runtime calls inside each module, replaced in tests with module mocks. Rejected: tests
  would depend on module loading, and pure modules would gain I/O.
- A narrow record of functions per consumer. Chosen: each consumer names only the effects it uses,
  and tests pass fakes for those.

## Decision

Side effects reach a module as a record of plain functions that the module declares for itself.

- Each consumer declares the type of its record beside its own code. The session's record holds only
  what the session calls, such as fetching work, running an action, saving dismissals, reading the
  time, and scheduling timers.
- `index.ts` builds the production functions. Tests pass fakes, deferred promises, and a fake clock.
- No adapter interfaces, classes, or containers.
- Long-running effects accept an `AbortSignal`.
- External tools run as argument arrays, never as shell strings.
- Grove owns worktrees, Herdr owns workspaces, and tuicr owns reviews. Gremlin chooses the action
  and invokes the tool.
- Actions detect Herdr and fall back when it is absent. Herdr is never required.

## Tradeoffs

- A function signature shows which effects a module can reach.
- Tests pass only the fakes a module uses, and record calls to assert after the action.
- Cost: two consumers of the same effect declare similar types.
- Cost: `index.ts` wires every record by hand.
- Cost: each Herdr action needs a fallback path and tests for both paths.

## See also

- [ADR 0004: Capability modules with an enforced import table](./0004-capability-modules.md)
- [ADR 0008: One owner for terminal lifetime](./0008-terminal-lifetime.md)
