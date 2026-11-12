# Changelog

All notable changes to `review-tui` are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.19.0] - 2026-11-11 (SWE-35)

### Added

- One-command install of the CLI: `bun install -g github:christianjohnhurry/in-the-loop#v<version>`
  puts `review-tui` on `PATH`. `package.json` is no longer `private` and has a
  `files` list (`src`, `.opencode/agents`, `LICENSE`, `README.md`,
  `CHANGELOG.md`) so the agents ship with the install.
- `.github/workflows/release.yml`: pushing a tag `v<version>` (which must match
  `package.json`) builds the VS Code extension and publishes a GitHub release
  with `review-tui-selection.vsix` attached and the CHANGELOG section as notes.
  The file name has no version, so
  `releases/latest/download/review-tui-selection.vsix` is a stable link. The
  .vsix is stamped with the release version.
- Startup check (`src/preflight.ts`): if `gh` or `opencode` is not on `PATH`
  (`opencode` is not needed with `OPENCODE_URL`), review-tui exits with code 2
  and an install hint instead of a stack trace.

### Changed

- `vscode-extension` `bun run package` now writes `review-tui-selection.vsix`
  (was `review-tui-selection-<version>.vsix`), copies the root `LICENSE` into
  the package, and runs a pinned `@vscode/vsce` through `bun x` (no `npx`).
- README install section: install from a release tag, VS Code extension
  download, and a Releases note. Running from a clone still works.

## [0.18.0] - 2026-11-11 (SWE-39)

### Changed

- Enquire now runs in the repo under review (the git top level of the directory
  you launch from) instead of review-tui's own install, and the agent may
  `read`, `grep`, `glob` and `list` it, so "where is this called from?" works
  on the PR's code. It still cannot edit, run commands or use the network, and
  cannot read `.env` files or anything outside the repo
  (`.opencode/agents/review-enquire.md`).
- Repo search is only on when the checkout is the PR's repo (a git remote
  matches `owner/repo`) at the PR head commit. Otherwise the Enquire page shows
  "Repo search unavailable: <reason>" (with a `gh pr checkout` hint), the model
  is told, and it answers from the selection and diff only. The check is
  repeated on every question.
- The review agents are now passed to the OpenCode server inline
  (`src/agents.ts`), because OpenCode only loads `.opencode/agents` from the
  tree a session runs in. With `OPENCODE_URL` the server must have the agents.

### Added

- `src/checkout.ts` (the PR-head check) and `src/agents.ts`, with tests using a
  temporary git repo in `test/repo-access.test.ts`.
- Design doc open question 1 answered (see `docs/design/enquire-page.md`).

## [0.17.0] - 2026-11-11 (SWE-38)

### Changed

- **Breaking:** the `--post` flag and dry-run mode are gone. `p` on the Review
  page always posts for real, but only after a confirmation. After choosing the
  review type, Enter opens a confirmation showing `owner/repo#number`, the
  review type, the number of inline comments and that the review will be posted
  publicly to GitHub. Only `y` posts; Esc or `n` cancels; any other key,
  Enter included, does nothing. The Review page no longer shows a `Mode:` line.
- If GitHub refuses the review, the prompt goes back to the type step with the
  error (nothing is lost), as before.
- `payload.json` is still written, just before the review is sent, for
  debugging. It is no longer written without posting.
- `review-tui --post` (or any unknown `--option`) now exits with code 2 and a
  usage message instead of being ignored.
- README, `docs/ui.md` and the quick guide describe the new flow.

### Added

- `src/postprompt.ts`: the posting prompt as a small state machine
  (`choose` then `confirm`), with tests in `test/postprompt.test.ts` for
  confirm, cancel and refusal.

## [0.16.1] - 2026-11-11 (SWE-36)

### Added

- GitHub Actions workflow `.github/workflows/ci.yml`, run on pull requests and
  pushes to `main`. It runs lint, typecheck and tests for review-tui, and
  typecheck, build and tests for `vscode-extension/`. No live-model steps.

## [0.16.0] - 2026-11-11 (SWE-34)

### Added

- `LICENSE` (MIT). The `license` field in `package.json` is now `MIT`, and the
  README has a Licence section.

### Changed

- `vscode-extension/package.json` `license` changed from `UNLICENSED` to `MIT`.

## [0.15.1] - 2026-11-11 (SWE-32)

### Added

- `docs/review-tui-quick-guide.md`: a short guide for new users covering
  launch (dry run and `--post`), the start page, each page in order, general
  versus inline comments, using review-tui with and without VS Code,
  choosing Comment, Request changes or Approve, and what to do when a step is
  blocked. The README links to it near the top.

### Fixed

- `docs/ui.md` said the Review page unlocks once the checklist is ticked. The
  page is always reachable; the gates apply to `s` and `p`.

## [0.15.0] - 2026-11-11 (SWE-29)

### Changed

- Each section of the posted review body has a `###` heading: "Message from
  the reviewer", "Reviewer’s understanding of the PR contents and intention
  (please correct reviewer if wrong)" (still a quote block), "Summary of inline
  comments" and "General comments". Empty sections, and their headings, are
  left out as before.
- The footer is separated from the sections by a `---` rule, and no longer
  repeats the model (`using $MODEL`), which is already in the
  `[reviewer + model]` prefix: it now reads `Reviewed with [In The Loop's
  review-tui](...) (vX.Y.Z)`.
- The `[reviewer + model]` prefix is now on its own line at the top of the
  review body, so the first heading starts a line and renders as a heading.
  Inline comments keep the prefix on the same line.

## [0.14.0] - 2026-11-11 (SWE-28)

### Changed

- Approving or requesting changes on a PR you opened yourself now shows a
  plain message, "Cannot approve or request changes on a PR you opened
  yourself. Post as a Comment instead.", instead of GitHub's raw error.
  Nothing is posted, your review is kept and the review type prompt stays
  open, so you can switch to Comment and post straight away.

## [0.13.0] - 2026-11-11 (SWE-27)

### Added

- The Comments page always shows a `General:` line explaining how to add a
  general comment (`general: your note` + Enter, no selection needed), and the
  input placeholder mentions it too. Previously the hint was a small muted
  aside on the `Add:` line.

## [0.12.0] - 2026-11-10 (SWE-26)

### Added

- `p` now asks for the review type before posting: Comment (the default),
  Request changes or Approve, mapped to GitHub's `COMMENT`, `REQUEST_CHANGES`
  and `APPROVE`. `←`/`→` or `c`/`r`/`a` choose, Enter posts (or saves the
  dry-run payload), Esc cancels. The chosen type is shown before posting.

### Changed

- If GitHub refuses the post, for example approving or requesting changes on
  your own PR, the error is shown, nothing is posted, and the prompt stays
  open so you can pick another type. Comments, message and body are kept.

## [0.11.0] - 2026-11-10 (SWE-25)

### Added

- Posted review bodies end with a footer: `Reviewed with [In The Loop's
  review-tui](https://github.com/christianjohnhurry/in-the-loop) (vX.Y.Z)
  using $MODEL`, showing the real version and the model used. It is added when
  the review is built, so it also ends an edited `review-body.md`.

### Changed

- The intention heading now reads "Reviewer’s understanding of the PR contents
  and intention (please correct reviewer if wrong)".
- `src/version.ts` exposes the version from `package.json`.

## [0.10.0] - 2026-11-10 (SWE-23)

### Added

- The posted review now has a body built from four parts, in order: a
  message from you to the author, your stated intention as a `> ` quote
  block, a two-line summary of the inline comments, and your general
  comments (the `general:` text). It goes up with the inline comments as
  one review.
- Review page shows the body. `m` opens your message in `$EDITOR` (saved as
  `review-message.md`; no message means none is posted). `b` opens the whole
  body (saved as `review-body.md`) to edit it before `p`. An edited body is
  posted as written; delete the file to build it afresh.

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

## [0.8.2] - 2026-11-10 (SWE-22)

### Fixed

- The page tabs stay fixed at the top of the window; only the page body
  scrolls, so a long Enquire transcript no longer pushes them out of sight.
- Each page has its own scroll region and offset. Switching pages no longer
  carries the Enquire transcript's scroll height over, so a short page opens
  at its own top and each page remembers where you left it.

### Added

- PgUp/PgDn scroll the page body. Enquire still follows the newest message.

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
