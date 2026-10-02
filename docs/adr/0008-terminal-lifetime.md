# ADR 0008: One owner for terminal lifetime

- Status: Accepted
- Date: 2026-10-01

## Context

- Gremlin stops on `q`, Ctrl+C, SIGINT, SIGTERM, and fatal errors. Each path must stop timers and
  children, save state, and restore the terminal.
- Surveyed OpenTUI apps work around unsafe teardown: Ox repairs terminal line discipline after
  destroy, and Cline defers destroy until input parsing finishes.
- The renderer prototype in [ADR 0003](./0003-opentui-react-renderer.md) restored the terminal on
  `q`, Ctrl+C, and SIGINT.
- Herdr is optional. Without it, tuicr must run in Gremlin's own terminal, so the renderer must
  pause and resume around a child process.

## Options considered

- `index.ts` owns startup and shutdown. Rejected: it would mix dependency wiring with signal
  handling and mounting, and terminal code could not be tested with fake dependencies.
- Each component or hook handles its own exit. Rejected: exit paths would compete, and one could
  skip cleanup.
- Require Herdr and run tuicr only in a Herdr pane. Rejected: Gremlin must work without Herdr.
- `terminal.tsx` owns the renderer, its lifetime, and shutdown. Chosen: one module controls every
  exit path and every terminal handoff.

## Decision

`terminal.tsx` alone owns the renderer, the keymap instance, React mounting, signal handlers, and
shutdown. The bindings on that instance come from the command catalog. `index.ts` composes
dependencies and starts `terminal`.

### Shutdown

- One idempotent shutdown runs for every exit path. The renderer's own exit handling is turned off.
- It blocks new intents and stops timers, then aborts refresh and owned child processes. It
  terminates children that do not exit within a bounded wait.
- It saves dismissals within a bounded wait.
- It unmounts React, removes bindings and subscriptions, and destroys the renderer in `finally`.
- It restores the terminal before it prints a fatal error.
- It never stops a Herdr workspace or daemon.

### Lending the terminal

- `terminal` provides a function that suspends input and rendering, runs a child process in the
  terminal, and resumes in `finally`. Actions receive it as an injected function.
- If resume fails, Gremlin restores the terminal and exits.

## Tradeoffs

- Every exit path runs the same cleanup in the same order.
- Actions can run interactive tools without knowing about the renderer.
- Cost: the suspend and resume sequence is not yet verified on the pinned OpenTUI version. The first
  action that lends the terminal must prove it in a pseudo-terminal test.
- Cost: bounded waits can cut off a slow save or child process at quit.

## See also

- [ADR 0003: OpenTUI with React bindings as the renderer](./0003-opentui-react-renderer.md)
- [ADR 0007: Side effects as narrow function records](./0007-side-effect-functions.md)
