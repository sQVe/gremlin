# ADR 0011: GitHub through `gh api`

- Status: Accepted
- Date: 2026-10-03

## Context

- Zeta needs notifications, plus review requests, review decisions, check status, and mergeability
  for pull requests across many repositories in each refresh.
- `gh search prs --json` does not return check status or mergeability. `gh pr list --json` returns
  them, but for one repository at a time.
- One GraphQL search query can return all of these pull request fields in one request. A test query
  for one account returned 59 pull requests for 2 of the usual 5,000 points per hour.
- GraphQL has no notifications field. Notifications come only from the REST `GET /notifications`
  endpoint.
- Users already sign in with `gh`, which stores the token, picks the host, and switches accounts. A
  token that Zeta keeps from startup misses a later `gh auth switch`.

## Options considered

- Run `gh pr list` and `gh search prs` with `--json`. Rejected: one refresh needs a search plus a
  process for each pull request or repository to fill in the missing fields.
- Send requests with Bun `fetch` and a token from `gh auth token`. Rejected: Zeta would handle
  tokens and hosts itself and gain little, because a refresh sends few requests, and `gh` stays
  required for the token.
- Use Octokit. Rejected: it adds dependencies for a few requests that `gh` or `fetch` already sends.
- Run `gh api`: one batched GraphQL query for searches and one REST call for notifications. Chosen:
  `gh` owns authentication, the host, and the active account, and Zeta adds no dependency.

## Decision

Zeta reads and writes GitHub by running `gh api`.

- Pull request searches and subject details run as one batched `gh api graphql` query per refresh,
  plus one per extra page.
- Notifications use `gh api /notifications`, one call per page.
- Zeta never reads, stores, or passes a GitHub token. `gh` finds it, so `GH_TOKEN` and
  `gh auth switch` work as they do for `gh`.
- `gh` is a required tool. Zeta reports a clear error when `gh` is missing or not signed in.
- Each request starts a new `gh` process, so it uses the account that is active at that time.
- Every call runs with `--include`. Zeta reads the HTTP status and headers, and the GraphQL `errors`
  field, instead of the exit code. GraphQL can report a rate limit with HTTP 200, and `gh` exits 1
  on a 304 Not Modified.
- Only the `github` module builds requests and parses their results. It passes plain work data to
  the rest of Zeta, so the transport can change without touching other modules.
- Actions that change GitHub, such as marking a notification read, also run `gh api` through the
  `github` module.

## Tradeoffs

- A refresh costs few processes and requests, at a small point cost.
- Zeta has no token handling, no host config, and no HTTP client dependency.
- Cost: Zeta does not work without `gh` installed and signed in.
- Cost: errors arrive as status lines, headers, and response text, which Zeta must parse, instead of
  typed HTTP errors.
- Cost: Zeta owns its GraphQL query and must follow GitHub schema deprecations.
- Cost: cancellation kills the `gh` process instead of aborting a request.

## See also

- [ADR 0013: Hand-written sync over a SQLite cache](./0013-local-sync-cache.md)
- [`gh api` manual](https://cli.github.com/manual/gh_api)
- [GitHub GraphQL rate limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)
- [GitHub notifications API](https://docs.github.com/en/rest/activity/notifications)
- [gh-dash GraphQL queries](https://github.com/dlvhdr/gh-dash/blob/main/internal/data/prapi.go#L508-L595)
- [lazygit GitHub token lookup](https://github.com/jesseduffield/lazygit/blob/master/pkg/commands/git_commands/github.go#L165-L301)
