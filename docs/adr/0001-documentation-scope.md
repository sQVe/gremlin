# ADR 0001: Documentation scope

- Status: Accepted
- Date: 2026-09-30

## Context

- Feature pages duplicate behavior defined in code and tests. Maintaining both lets prose drift from
  behavior.
- Code shows what a feature does, but not always why it was designed that way.
- Gremlin records those lasting reasons in ADRs.

## Options considered

- Keep a page per feature under `docs/`. Rejected: it gives readers a guide, but duplicates behavior
  defined in code and can drift as the code changes.
- Write no feature pages. Chosen: ADRs record decisions, and code states behavior.

## Decision

Gremlin documents decisions, not features.

- ADRs record lasting decisions and their reasons. Include only the details needed to understand or
  follow the decision.
- Code and tests state behavior.
- `docs/` holds only what no feature owns: the documentation index, the development guide, and the
  ADRs.
- The root README introduces the project and links to the rest. Topic details go in `docs/` and are
  linked from the [documentation index](../README.md).

Do not add a page that explains how a feature works. Write an ADR when a lasting decision needs a
recorded reason.

An accepted ADR can define a current convention. Record a change to what a decision requires in a
new ADR that replaces it. Do not change the rules in place.

## Tradeoffs

- Fewer descriptions of behavior to keep in sync with code.
- Readers who want current behavior must read the code.
- Cost: a reader who wants a guided tour of a feature does not get one.
- Cost: a decision recorded once is not updated as the feature grows, so an ADR describes the choice
  at the time it was made, not today's code.
