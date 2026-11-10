# in-the-loop

<p align="center">
  <img src="docs/logo.svg" alt="In The Loop: review-tui" width="300">
</p>

Utility tools for software engineers who want to empower themselves with AI while maintaining discipline and keeping themselves in the loop.

The goal is for AI to speed up the work, not take it over. Key decisions should still be made by the engineer, with their authorship and their understanding.

## review-tui

A terminal UI that walks a reviewer through a GitHub PR: checklist, intention, enquire, comments, review.

The AI checks the reviewer's understanding and comments. The reviewer stays the author.

```
 ◀ [ Checklist ]  Intention  Enquire  Comments  Review ▶     ✻ In The Loop
┌─────────────────────────────────────────────────────────────────────┐
│ [x] Design   [ ] Tests   …       page body (differs per page)       │
├─────────────────────────────────────────────────────────────────────┤
│ status line                                                         │
│ > input (Intention, Enquire, Comments)                              │
│ ←/→ pages · Esc leave input · Ctrl+C quit                           │
└─────────────────────────────────────────────────────────────────────┘
  VS Code selection ──▶ Enquire, Comments      OpenCode ◀──▶ judge, enquire
```

Every page, its keys, and how data flows between the panes, VS Code and the LLM: [`docs/ui.md`](docs/ui.md). Where the code lives: [`docs/repo-layout.md`](docs/repo-layout.md).

## Requirements

- [Bun](https://bun.sh).
- `gh`, authenticated.
- `opencode` on `PATH`, unless you set `OPENCODE_URL` (see [Configuration](#configuration)).
- Optional: VS Code with the extension in `vscode-extension/`.

## Install and run

```sh
bun install
bun src/cli.ts                                                     # review the open PR for the current branch
bun src/cli.ts https://github.com/<owner>/<repo>/pull/<n>          # dry run
bun src/cli.ts https://github.com/<owner>/<repo>/pull/<n> --post   # really post
```

Without a URL, review-tui finds the open PR for the branch you have checked out (via `gh pr view`). It must be run inside a git repo on a branch, not a detached HEAD; otherwise it exits with code 2 and suggests passing a URL. A URL argument always wins and works from any directory.

Relaunching the same PR resumes the review.

## Pages

On launch a start page shows the repo, the PR branch and the model the judge will use. Press Enter to continue. A resumed review returns to its last page.

#### Start page model picker

Press `m` to open a list of every model OpenCode has available to you (configured and authenticated providers). The list is read from OpenCode, not hardcoded.

| Key   | Action                                    |
| ----- | ----------------------------------------- |
| `m`   | Open the model list                       |
| Type  | Filter by provider, model ID or name      |
| ↑/↓   | Move (the list scrolls)                   |
| Enter | Select the model and close the list       |
| Esc   | Close the list without changing the model |

Enter starts the review only when the list is closed. If OpenCode cannot list models, the start page shows an error line and the current model, and Enter still starts.

Switch pages with ←/→. Arrow keys switch pages while the input is empty. Ctrl+C quits.

| Key       | Action                                                   |
| --------- | -------------------------------------------------------- |
| ←/→       | Previous / next page                                     |
| PgUp/PgDn | Scroll the page body (the tab bar stays fixed)           |
| Esc       | Leave the text input (so ←/→ always work)                |
| Enter     | Type again (when the input is off); otherwise submit     |
| `i`       | Type again (when the input is off)                       |

### Checklist

Tick each review step before you can start the review.

| Key   | Action        |
| ----- | ------------- |
| ↑/↓   | Move          |
| Space | Tick / untick |

### Intention

State in your own words what the PR changes and why. The judge only says pass or retry, with a hint.

| Key   | Action                |
| ----- | --------------------- |
| Type  | Write your intention  |
| Enter | Submit to the judge   |

### Enquire

Select code in VS Code, type a question and press Enter. The model explains the code. It does not review it: no verdicts, no drafted comments, no statement of the PR's intention.

- Answers are plain text. They are not saved and never reach `comments.md` or GitHub.
- It uses the read-only agent in `.opencode/agents/review-enquire.md`.
- It is never locked and not a gate.
- Design: [`docs/design/enquire-page.md`](docs/design/enquire-page.md).

| Key        | Action                          |
| ---------- | ------------------------------- |
| Type       | Write a question                |
| Enter      | Ask                             |
| `/ide`     | Connect VS Code (see below)     |

### Comments

Write your review comments here. Every line must be in the diff.

| Input                 | Meaning                                     |
| --------------------- | ------------------------------------------- |
| `path:line comment`   | Comment on one line                         |
| `path:10-15 comment`  | Comment on a range                          |
| `general: text`       | General comment that applies to the whole review |
| `42 comment`          | Line in the open file (VS Code, no selection) |
| `42-48 comment`       | Range in the open file (VS Code, no selection) |

With a VS Code selection, just type the comment. Press Enter to add it.

### Review

| Key | Action                                  |
| --- | --------------------------------------- |
| `s` | Start review (LLM feedback on comments) |
| `e` | Edit `comments.md` in `$EDITOR`         |
| `m` | Write a message to the author in `$EDITOR` |
| `b` | Edit the review body in `$EDITOR`       |
| `p` | Build the payload and post it           |

`s` and `p` need a complete checklist, a passed intention and at least one comment. Without `--post`, `p` is a dry run and only saves `payload.json`.

The review body has four parts, in this order: (1) your message to the author, which you write with `m` (saved as `review-message.md`; left out if you write none); (2) your intention as a `> ` quote block, so GitHub shows it was written during the review; (3) a two-line summary of the inline comments; (4) your general comments (`general:` text on the Comments page, which apply across the whole review). The page shows the body. Press `b` to edit the whole body before `p`; the edit is saved as `review-body.md` and posted as written (delete the file to rebuild it). Everything goes up as one review with the inline comments.

## VS Code integration

The extension in `vscode-extension/` shares your active file and selection with review-tui. See its [README](vscode-extension/README.md) to install it, and [`docs/ide-protocol.md`](docs/ide-protocol.md) for the protocol.

review-tui connects automatically when exactly one running VS Code has this repo open. Otherwise:

| Command    | Action                           |
| ---------- | -------------------------------- |
| `/ide`     | Scan for VS Code windows         |
| `/ide N`   | Pick window N from the list      |
| `/ide off` | Disconnect                       |

The Comments page shows the active file or selection (`src/llm.ts:L42-48`). Without VS Code, `path:line` works as before.

## Configuration

| Variable       | Meaning                                                                      |
| -------------- | ---------------------------------------------------------------------------- |
| `$REVIEWER`    | Name in the `[$REVIEWER + $MODEL]` prefix. Default: your `gh` login.          |
| `$MODEL`       | `provider/model`, e.g. `anthropic/claude-sonnet-5-5`. See below.             |
| `OPENCODE_URL` | Use an existing OpenCode server instead of spawning one.                     |
| `$EDITOR`      | Editor for `e` on the Review page. Default: `vi`.                            |

`$MODEL` is the model the judge runs on. A malformed value exits at startup. An unknown model shows as a failed judge call (retry). The start page pre-selects it, and you can pick another there. When unset, the start page pre-selects OpenCode's default (its configured `model`, else the first provider's default). A model picked on the start page is saved in `state.json` and wins over `$MODEL` when the review is resumed. The prefix then shows the model OpenCode reported using, or `unknown` if no LLM call has completed this session (e.g. a resumed review).

LLM calls go through a local OpenCode server, using the read-only agents in `.opencode/agents/` (`review-judge.md`, `review-enquire.md`).

## State and files

State lives in `reviews/<repo>-<pr>/`:

| File           | Contents                              |
| -------------- | ------------------------------------- |
| `comments.md`  | Your comments and the intention       |
| `state.json`   | Checklist, intention, page, feedback, model |
| `diff.patch`   | The PR diff                           |
| `review-message.md` | Your message to the author, after `m` |
| `review-body.md` | Your edited review body, after `b` |
| `payload.json` | The review payload, after `p`         |

## Development

```sh
bun test                    # unit tests
bun run eval:judge          # five canned judge cases against a live model
bun run lint
bun run typecheck
bun src/cli.ts --version
```

Where each file lives and what it does: [`docs/repo-layout.md`](docs/repo-layout.md).

User-visible changes are recorded in `CHANGELOG.md`, one entry per ticket, with a version bump in `package.json`.

The logo at the top is `docs/logo.svg`, generated from `src/start.ts` in the start page's colours. After changing the logo, run `bun scripts/logo.ts`. A test fails if the file is out of date.
