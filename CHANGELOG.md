# Changelog

All notable changes to `review-tui` are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.9.0] - 2026-11-10 (SWE-24)

### Added

- The review can be run again from the Review page: edit `comments.md` with
  `e`, then press `s` again, as many times as needed. Each run reads
  `comments.md` as it is now, so it sees your edits.
- `src/revise.ts` (`reviseRun`) holds one run, so it can be tested without the
  UI. The run count is saved as `reviewRuns` in `state.json`.

### Changed

- The feedback heading shows the run number, and the footer hint reads
  `s re-run review` once a run has completed.
- A run that fails keeps the feedback from the last successful run.

## [0.8.1] - 2026-11-07 (SWE-21)

### Added

- `docs/repo-layout.md`: the repo tree with a comment on what each file does.
- `docs/ui.md`: a labelled wireframe of each page, the key bindings,
  and a Mermaid diagram of how the pages, VS Code, OpenCode and the review
  files connect. The README links to it from a short ASCII sketch.

## [0.8.0] - 2026-11-06 (SWE-20)

### Added

- `review-tui` with no URL reviews the open PR for the current git branch,
  found with `gh pr view --json url`. An explicit URL still wins and works
  from any directory.
- Clear errors, exit code 2, when not inside a git repo, when HEAD is
  detached, and when the branch has no open PR (each suggests passing a URL).

### Changed

- Usage is now `review-tui [pr-url] [--post]`.

## [0.7.0] - 2026-11-06 (SWE-19)

### Added

- Model picker on the start page. A `model:` line under `repo:` and `branch:`
  shows the model the judge runs on; `m` opens a filterable, scrolling list of
  every model OpenCode reports for the reviewer, and Enter selects one. Enter
  with the list closed still starts the review.
- The default is `$MODEL` if set, else OpenCode's default model (its
  configured `model`, else the first provider's default).
- The chosen model is saved in `state.json` (`model`) and wins on resume; older
  state files without one fall back to the default. It is sent on every judge
  call and shown in the `[$REVIEWER + $MODEL]` label.
- If OpenCode cannot list models the start page shows an error line and keeps
  the default/`$MODEL`.

## [0.6.1] - 2026-11-04 (SWE-18)

### Changed

- README reorganised under headings (requirements, install, a page-by-page
  walkthrough with key tables, VS Code, configuration, state and files,
  development) and now opens with the start-page logo, shown as an image in the
  start page's colours. "(walking skeleton)" dropped from the heading.

### Added

- `bun scripts/logo.ts` regenerates `docs/logo.svg` from `src/start.ts`
  (`logoBlocks()`); a test fails if it is out of date.

## [0.6.0] - 2026-11-04 (SWE-12)

### Added

- Enquire page between Intention and Comments (design: `docs/design/enquire-page.md`).
  Select code in VS Code, type a question and Enter; the page shows the
  subject (`path:L10-20`), your question with an excerpt of the selection, and
  the model's plain-text answer, with a glowing "thinking…" status while it
  works. It is never locked and not a Review gate. `/ide` works here too.
  Answers are not saved and are not sent to the Review page or GitHub. This is
  the walking skeleton: no output guards, repo search or history yet.
- `.opencode/agents/review-enquire.md`: a separate read-only agent (edit, bash,
  web, task, question, and for now read/grep/glob/list denied) with the design
  doc's rules G1 to G11 in its prompt.

### Changed

- `state.json` now has a `version` field. Files saved before it (version 1) are
  migrated on open: saved pages at or after Comments move up one, so a resumed
  review lands on the same page as before.

## [0.5.0] - 2026-11-04 (SWE-11)

### Added

- Start page: on launch (and on resume) review-tui shows the In The Loop
  logo, the repo and the PR head branch, and waits for Enter. A resumed review
  then returns to its saved page. A small "In The Loop" logo stays in the
  top-right corner of every page. The head branch (`headRefName`) is now
  saved in `state.json`; older files are backfilled via `gh`, or show `-`.
- `$MODEL` (`provider/model`) now selects the OpenCode model the judge runs on,
  so the `[$REVIEWER + $MODEL]` prefix always names the model that ran. With
  `$MODEL` unset, OpenCode's default is kept and the prefix shows the model
  OpenCode reports (not `opencode-default`). A malformed `$MODEL` is rejected at
  startup; an unknown model fails closed like any other judge error.
## [0.3.0] - 2026-11-02 (SWE-4)

### Added

- VS Code extension (`vscode-extension/`): local WebSocket server that
  publishes the active file and selection, discovered via
  `~/.review-tui/ide/<port>.lock`. Protocol in `docs/ide-protocol.md`. review-tui
  now uses it (below).
- review-tui connects to the extension (`src/ide.ts`): `/ide` command and
  auto-connect, shows the active file/selection on the Comments page, and
  targets new comments at the selection. Multi-line comments are stored as
  `path:L42-48` in `comments.md` and sent with `start_line`/`line`. Selections
  outside the PR diff are rejected; VS Code closing mid-session is handled.
## [0.2.0] - 2026-11-02 (SWE-3)

### Added

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

[Unreleased]: https://github.com/christianjohnhurry/in-the-loop/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/christianjohnhurry/in-the-loop/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/christianjohnhurry/in-the-loop/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/christianjohnhurry/in-the-loop/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/christianjohnhurry/in-the-loop/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/christianjohnhurry/in-the-loop/releases/tag/v0.1.0
