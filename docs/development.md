# Development

Set up a checkout and check changes before release.

## Local setup

Use the Node.js version required by `engines.node` and the pnpm version specified by
`packageManager` in [package.json](../package.json). Run these commands from the Gremlin checkout:

```sh
pnpm install --frozen-lockfile
pnpm check
```

`pnpm install` also installs the Git hooks. The pre-commit hook runs the house-style and format
checks on staged files.

## Check changes

| Command                        | Use                                                                       |
| ------------------------------ | ------------------------------------------------------------------------- |
| `pnpm check`                   | Run typechecking, house style, formatting, Knip, and the full test suite. |
| `pnpm test`                    | Run the full test suite.                                                  |
| `pnpm test tests/lint.test.ts` | Run one test file.                                                        |
| `pnpm test:changed`            | Run tests affected by uncommitted changes.                                |
| `pnpm style:check`             | Check all lint rules, including house style.                              |
| `pnpm style:fix`               | Apply safe lint fixes, then format.                                       |
| `pnpm lint`                    | Run ordinary lint diagnostics, as editors do.                             |
| `pnpm format`                  | Format files.                                                             |
| `pnpm knip`                    | Find unused files, exports, and dependencies.                             |

Style commands accept file paths, for example `pnpm style:fix tests/lint.test.ts`. Rename bindings
and move helpers manually. Do not set `GREMLIN_LINT_STYLE` globally; the style commands set it for
their child linter.

Configure linting, formatting, and staged checks in [vite.config.ts](../vite.config.ts). Keep the
installed Vitest version the same as the version bundled with Vite+.

## Versioning

Add a changeset for user-facing changes:

```sh
pnpm changeset
```

Describe the behavior change for users. Commit the generated file under `.changeset/` with the
change it describes.

The [changeset check](../.github/workflows/changeset.yml) requires a changeset when a PR touches
`src/`, but not for changes only to docs, tooling, or dependencies.

The [release workflow](../.github/workflows/release.yml) opens version PRs and creates Git tags and
GitHub releases. Gremlin is private and is not published to npm.
