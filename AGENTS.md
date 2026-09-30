# Gremlin

Terminal UI for GitHub work that needs action. Read [the development guide](docs/development.md) for
local setup and verification.

- Run `pnpm check` before finishing changes. It runs typechecking, lint with house style,
  formatting, Knip, and tests.
- Format with `pnpm format`; configuration lives in `vite.config.ts`.
- Follow the decisions in [docs/adr](docs/adr/README.md), and record new decisions there. Read that
  guide before adding an ADR. Do not write documents that explain how a feature works; see
  [ADR 0001](docs/adr/0001-documentation-scope.md).
- Name values in camelCase and types in PascalCase. Never SCREAMING_CASE, not even for module
  constants.
- Declare a helper before the code that uses it. Join at most three checks in one condition, and do
  not mix `&&` with `||`; name the inner group instead.
- Comment only what the code cannot say, such as a constraint or a workaround. Do not describe the
  code's history.
- Add a changeset with `pnpm changeset` for user-facing changes.
- Before finishing a document, check its local links and verify the commands it gives against the
  repository.

## Tests

- Test behavior a caller can observe. Do not test wording, constants, types, or internal calls.
- Keep tests next to source. Cross-module and tooling checks go in `tests/`.
- Use temporary directories for fixtures and remove them when the test finishes.
- Never drop assertions or failure cases to save time.
