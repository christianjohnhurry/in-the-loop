# in-the-loop

<p align="center">
  <img src="docs/logo.svg" alt="In The Loop: review-tui" width="300">
</p>

Utility tools for software engineers who want to empower themselves with AI while maintaining discipline and keeping themselves in the loop.

The goal is for AI to empower the user to build a deeper mental model of their codebase. Key decisions should be made by the engineer, with their authorship and their understanding. That can be undermined by a general chat interface with no guardrails. These tools keep AI accessible, but avoids unwittingly handing off decision making to an agent. 

## review-tui

A terminal UI that walks a reviewer through a GitHub PR: checklist, intention, enquire, comments, review.

The AI checks the reviewer's understanding and comments. The reviewer stays the author.

**New here?** Follow the [quick guide](docs/review-tui-quick-guide.md) to review a PR end to end.

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

## Quick start

**1. Prerequisites**

- [Bun](https://bun.sh).
- `gh`, logged in: `gh auth login`.
- `opencode`, with a model provider logged in: `opencode auth login`.

**2. Install the CLI**

```sh
bun install -g github:christianjohnhurry/in-the-loop#v<version>
```

Use the latest tag from the [releases page](https://github.com/christianjohnhurry/in-the-loop/releases). This puts `review-tui` on your `PATH`.

**3. Install the VS Code extension (optional, recommended)**

Download `review-tui-selection-<version>.vsix` from the same release, then:

```sh
code --install-extension review-tui-selection-<version>.vsix
```

It tells review-tui which file and lines you have selected, for Enquire and Comments.

**4. Review a PR**

```sh
gh pr checkout <n>      # a checkout of the PR's repo, at the PR head
review-tui              # reviews the PR for the branch you are on (or pass a PR URL)
```

Launch from inside that checkout so Enquire can search the repo. From anywhere else it still works, but only sees your selection and the diff.

**What to expect.** A start page shows the repo, the PR and the model; press Enter. Then five pages, left to right (←/→):

1. **Checklist**: tick the review steps.
2. **Intention**: say in your own words what the PR does; the model checks it, you do not get the answer.
3. **Enquire**: ask about the code you selected. Optional.
4. **Comments**: add `path:line comment` lines and general comments.
5. **Review**: get model feedback on your comments, then press `p`, choose Comment, Request changes or Approve, and confirm with `y`.

**Nothing is posted until you press `y`.** Your work is saved in `reviews/<repo>-<pr>/` in the directory you launched from; launch the same PR from there to resume.

**What is sent to the model.** review-tui sends text to the model you pick on the start page (or `$MODEL`), through the OpenCode server it starts on your machine, to whichever provider that model belongs to:

| Page | Sent |
| --- | --- |
| Intention | The PR diff, the PR description and your intention statement |
| Enquire | Your question, the selected code and the diff. The agent may also read other files in the repo you launched from (not `.env` files), which are then sent too |
| Review | The contents of `comments.md`: your inline and general comments |

The review message, review body and checklist are not sent to the model. Nothing goes to GitHub except the review you confirm with `y`. What OpenCode and the provider do with that text (logging, retention, training) is governed by them: see the [OpenCode docs](https://opencode.ai/docs) and your provider's terms. **Check that sending your employer's code to that provider is allowed before using this on work code.**

More: the step-by-step [quick guide](docs/review-tui-quick-guide.md), and every page and key in [`docs/ui.md`](docs/ui.md). The reference sections below cover configuration and files.

## Requirements

- [Bun](https://bun.sh).
- `gh`, authenticated.
- `opencode` on `PATH`, unless you set `OPENCODE_URL` (see [Configuration](#configuration)).
- Optional: VS Code with the extension in `vscode-extension/`.

## Install and run

```sh
bun install
bun src/cli.ts                                            # review the open PR for the current branch
bun src/cli.ts https://github.com/<owner>/<repo>/pull/<n> # review a specific PR
```

Nothing is posted until you press `p` on the Review page and confirm (see [Review](#review)). There is no dry-run mode and no `--post` flag; passing `--post` is an error.

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
- It reads **the repo you are reviewing**, not review-tui's own checkout: run review-tui from inside a checkout of the PR's repo and the agent can `read`, `grep`, `glob` and `list` it ("where is this called from?"). It still cannot edit files, run commands or use the network, and cannot read `.env` files or anything outside the repo.
- Repo search is only switched on when the checkout is the PR's repo (a git remote matches `owner/repo`) at the PR's head commit. Otherwise the page says "Repo search unavailable: <reason>" and the model sees only your selection and the diff. Run `gh pr checkout <n>` to fix it; the check is repeated on every question.
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

With a VS Code selection, just type the comment. Press Enter to add it. With nothing selected, the page shows a `General:` line (and the input placeholder repeats it) telling you to type `general: your note` for a comment on the whole review.

### Review

| Key | Action                                                |
| --- | ----------------------------------------------------- |
| `s` | Start review, or re-run it (LLM feedback on comments) |
| `e` | Edit `comments.md` in `$EDITOR`                       |
| `m` | Write a message to the author in `$EDITOR`            |
| `b` | Edit the review body in `$EDITOR`                     |
| `p` | Choose the review type, then post it              |

`s` and `p` need a complete checklist, a passed intention and at least one comment. Nothing is sent until you confirm.

`p` opens a prompt for the review type: **Comment** (the default), **Request changes** or **Approve**. Press `←`/`→` or `c`/`r`/`a` to choose, Enter to continue, Esc to cancel. Enter does not post: it opens a confirmation that shows the PR (`owner/repo#number`), the review type, the number of inline comments and that the review will be posted publicly to GitHub. Press `y` to post for real; Esc or `n` cancels, and any other key (including Enter) does nothing. The chosen type becomes the `event` of the review (`COMMENT`, `REQUEST_CHANGES`, `APPROVE`). Just before sending, the review is saved to `payload.json` (handy for debugging). If GitHub refuses it, the error is shown, nothing is posted, and the prompt goes back to the type step so you can pick another type; your comments, message and body are kept. If the refusal is because you opened the PR yourself, the message is plain: "Cannot approve or request changes on a PR you opened yourself. Post as a Comment instead." Press `c`, Enter, then `y` to post as a Comment.

The review can be re-run as often as you like: press `e` to edit `comments.md`, then `s` again. Each run reads `comments.md` as it is now, so it sees your edits, and replaces the previous feedback. The heading shows which run the feedback is from.

The review body has up to four parts, in this order, each under its own `###` heading (a modest size in a GitHub review comment): (1) "Message from the reviewer", your message to the author, which you write with `m` (saved as `review-message.md`; heading and section left out if you write none); (2) your intention as a `> ` quote block under the heading "Reviewer’s understanding of the PR contents and intention (please correct reviewer if wrong)", so GitHub shows it was written during the review; (3) "Summary of inline comments", a two-line summary of the inline comments; (4) "General comments" (your `general:` text on the Comments page, which apply across the whole review). The page shows the body. Press `b` to edit the whole body before `p`; the edit is saved as `review-body.md` and posted as written (delete the file to rebuild it). The `[reviewer + model]` prefix goes on its own first line, so the first heading still renders. Posted bodies end with a `---` rule and a footer, added at post time and so not shown in the preview or `review-body.md`: `Reviewed with [In The Loop's review-tui](https://github.com/christianjohnhurry/in-the-loop) (vX.Y.Z)`; the model is already in the `[reviewer + model]` prefix. Everything goes up as one review with the inline comments.

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

LLM calls go through a local OpenCode server, using the read-only agents in `.opencode/agents/` (`review-judge.md`, `review-enquire.md`). review-tui passes them to the OpenCode server it starts, so they work whatever directory a session runs in. With `OPENCODE_URL` the server must already have these agents.

## State and files

State lives in `reviews/<repo>-<pr>/`:

| File           | Contents                              |
| -------------- | ------------------------------------- |
| `comments.md`  | Your comments and the intention       |
| `state.json`   | Checklist, intention, page, feedback, review runs, model |
| `diff.patch`   | The PR diff                           |
| `review-message.md` | Your message to the author, after `m` |
| `review-body.md` | Your edited review body, after `b` |
| `payload.json` | The review payload, saved just before posting |

## Development

```sh
bun test                    # unit tests
bun run eval:judge          # five canned judge cases against a live model
bun run lint
bun run typecheck
bun src/cli.ts --version
```

Where each file lives and what it does: [`docs/repo-layout.md`](docs/repo-layout.md).

CI (`.github/workflows/ci.yml`) runs on every pull request and push to `main`: lint, typecheck and tests for review-tui, and typecheck, build and tests for `vscode-extension/`. It does not run `eval:judge`, which needs a live model.

User-visible changes are recorded in `CHANGELOG.md`, one entry per ticket, with a version bump in `package.json`.

The logo at the top is `docs/logo.svg`, generated from `src/start.ts` in the start page's colours. After changing the logo, run `bun scripts/logo.ts`. A test fails if the file is out of date.

## Licence

MIT. See [`LICENSE`](LICENSE).
