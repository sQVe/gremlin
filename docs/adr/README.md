# Architecture decision records

Record lasting decisions and the reasons behind them, not how a feature works.

## Before writing

Follow [ADR 0001](./0001-documentation-scope.md) for documentation scope. Before opening the
[template](./TEMPLATE.md), answer:

- What choice are we making, and what lasting reason stands behind it?
- What credible alternative did we consider, and why did we reject it?

If the answers only restate what the code does, do not write an ADR. Code and tests hold behavior. A
feature change does not require a new document.

Use a title that names the choice, and state that choice at the start of the Decision section. An
ADR is not a feature summary, implementation plan, or acceptance checklist.

A new ADR is Accepted. Merging its PR is the approval, so there is no Proposed stage. When a later
decision replaces it, change its status to Superseded with a link to the replacement.

## Index

- [0001: Documentation scope](./0001-documentation-scope.md)
- [0002: Bun as runtime, package manager, and test runner](./0002-bun-toolchain.md)
- [0003: OpenTUI with React bindings as the renderer](./0003-opentui-react-renderer.md)
- [0004: Capability modules with an enforced import table](./0004-capability-modules.md)
- [0005: One session store outside React](./0005-session-store.md)
- [0006: One command catalog as data](./0006-command-catalog.md)
- [0007: Side effects as narrow function records](./0007-side-effect-functions.md)
- [0008: One owner for terminal lifetime](./0008-terminal-lifetime.md)
- [0009: Versioned local state and config](./0009-local-state-and-config.md)
- [0010: One project base shared with Phi](./0010-shared-project-base.md)
- [0011: GitHub through `gh api`](./0011-github-through-gh-api.md)
- [0012: Sources find candidates, local rules decide why](./0012-work-sources-and-rules.md)
- [0013: Hand-written sync over a SQLite cache](./0013-local-sync-cache.md)
- [0014: Results for expected failures, exceptions for bugs, and checked boundaries](./0014-coding-conventions.md)
