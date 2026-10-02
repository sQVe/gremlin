# ADR 0006: One command catalog as data

- Status: Accepted
- Date: 2026-10-01

## Context

- [ADR 0003](./0003-opentui-react-renderer.md) requires shortcuts from one keymap definition. Help,
  availability, and user remaps need the same source, or they drift from the keys that work.
- lazygit binding records carry a handler, description, scope, and disabled reason, and one record
  drives invocation, help, and availability.
- Ox splits navigation keys from action commands, and Gemini CLI keeps keyboard commands apart from
  slash commands. Each split adds a second place to change.
- A command written as a closure cannot tell help why it is disabled, and tests must run its effects
  to see what it does.

## Options considered

- Commands with a `run(dispatch)` closure. Rejected: help cannot explain a disabled command, and
  tests must run effects to observe a command.
- Bindings registered by each component. Rejected: ADR 0003 already requires one keymap definition.
- One catalog of command data. Chosen: keymap, help, availability, and remaps read the same records,
  and tests assert intents without running effects.

## Decision

`commands.ts` defines every command once, as data.

### Commands

- Each command has an id, a label, a scope (`global`, `list`, `preview`, or `modal`), and default
  keys.
- `disabledReason(snapshot)` returns why the command cannot run, or nothing when it can.
- `intent(snapshot)` returns an application intent for the session or a UI intent for React. It
  performs no I/O.
- Keymap layers, help, and availability come from the catalog. Key handlers read the latest
  snapshot, not one captured at render.
- The session checks preconditions again before it acts. A disabled key is not a safety check.

### Scopes

- `list` and `preview` bindings follow focus. `global` bindings work outside modals.
- An open modal blocks the commands beneath it. On close, focus returns to the previous target only
  if it is still mounted.

### Remaps

- Config maps a command id to a list of keys. The list replaces the defaults, and `[]` disables the
  command's keys.
- Unknown ids, invalid keys, and one key bound to two commands in overlapping scopes stop startup.
- Quit signals such as SIGINT still stop Zeta when the quit command has no keys.

## Tradeoffs

- A key shown in help is a key that works, and help can say why a command is disabled.
- Tests check a command by its intent, with no fakes for effects.
- Cost: every command needs a catalog entry, even one used in a single place.
- Cost: intents add a type for each action, which a closure would not need.

## See also

- [ADR 0003: OpenTUI with React bindings as the renderer](./0003-opentui-react-renderer.md)
- [ADR 0005: One session store outside React](./0005-session-store.md)
- [ADR 0009: Versioned local state and config](./0009-local-state-and-config.md)
