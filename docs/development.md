# Development

Set up a checkout and check changes before release.

## Local setup

Use the Bun version specified by `packageManager` in [package.json](../package.json). Bun is the
runtime, package manager, and test runner. Run these commands from the Gremlin checkout:

```sh
bun install --frozen-lockfile
bun run check
```

`bun install` also installs the Git hooks. The pre-commit hook runs the house-style and format
checks on staged files.

## Check changes

| Command                           | Use                                                                       |
| --------------------------------- | ------------------------------------------------------------------------- |
| `bun run check`                   | Run typechecking, house style, formatting, Knip, and the full test suite. |
| `bun run test`                    | Run the full test suite.                                                  |
| `bun run test tests/lint.test.ts` | Run one test file.                                                        |
| `bun run test:changed`            | Run tests affected by uncommitted changes.                                |
| `bun run style:check`             | Check all lint rules, including house style.                              |
| `bun run style:fix`               | Apply safe lint fixes, then format.                                       |
| `bun run lint`                    | Run ordinary lint diagnostics, as editors do.                             |
| `bun run format`                  | Format files.                                                             |
| `bun run knip`                    | Find unused files, exports, and dependencies.                             |

Style commands accept file paths, for example `bun run style:fix tests/lint.test.ts`. Rename
bindings and move helpers manually. Do not set `GREMLIN_LINT_STYLE` globally; the style commands set
it for their child linter.

Configure linting, formatting, and staged checks in [vite.config.ts](../vite.config.ts). Run
installed command-line tools with `bunx --bun`, as the scripts do. The tools start with a Node
shebang, so without `--bun` they run on Node instead of Bun.

## Versioning

Add a changeset for user-facing changes:

```sh
bun run changeset
```

Describe the behavior change for users. Commit the generated file under `.changeset/` with the
change it describes.

The [changeset check](../.github/workflows/changeset.yml) requires a changeset when a PR touches
`src/`, but not for changes only to docs, tooling, or dependencies.

The [release workflow](../.github/workflows/release.yml) opens version PRs and creates Git tags and
GitHub releases. Gremlin is private and is not published to npm.
