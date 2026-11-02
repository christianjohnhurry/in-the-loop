# Changelog

All notable changes to `review-tui` are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- VS Code extension (`vscode-extension/`, SWE-5): local WebSocket server that
  publishes the active file and selection, discovered via
  `~/.review-tui/ide/<port>.lock`. Protocol in `docs/ide-protocol.md`. review-tui
  does not use it yet (SWE-6).
- Colour theme (`src/theme.ts`): terracotta accent, muted greys, green/amber/red
  for pass, retry and errors. No backgrounds are set, so it suits dark and
  light terminals; text markers (`[x]`, `>`, pass/retry, Locked) are kept.

## [0.1.0] - 2026-11-01

First walking skeleton (SWE-2): all four pages, end to end, on one PR.

### Added

- `review-tui <pr-url>` fetches the PR title, description and diff with `gh`
  and keeps per-PR state in `reviews/<repo>-<pr>/` (`comments.md`,
  `state.json`, `diff.patch`). Relaunching resumes where you left off.
- Four pages, switched with the left/right arrows: Checklist, Intention,
  Comments, Review.
- Checklist of review steps from Google's engineering-practices guide,
  saved to `state.json`.
- Intention page: an LLM judge returns `pass` or `retry` with a hint. The
  guardrail is in code: only the parsed verdict and a length-capped hint are
  shown, malformed output fails closed, and hints that copy the PR
  description are replaced.
- Comments page: `path:line comment`, validated against the diff, appended
  to `comments.md`. `general: text` sets the review body.
- Review page: gated on a complete checklist, a passed intention and at
  least one comment; one-shot model feedback on the comments; `e` opens
  `comments.md` in `$EDITOR`; `p` builds one GitHub review with every
  comment prefixed `[$REVIEWER + $MODEL]`. Dry run by default, `--post`
  sends it.
- LLM calls go through a local OpenCode server using a read-only agent
  (`.opencode/agents/review-judge.md`).
- `--version` flag, ESLint and Prettier (Google-style TypeScript), unit
  tests, a live judge eval (`bun run eval:judge`) and a pull request
  template.

[Unreleased]: https://github.com/christianjohnhurry/in-the-loop/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/christianjohnhurry/in-the-loop/releases/tag/v0.1.0
