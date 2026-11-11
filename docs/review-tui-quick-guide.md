# review-tui quick guide

Review a GitHub PR end to end with review-tui. This guide is the shortest path; the [README](../README.md) has the full reference and [`ui.md`](ui.md) shows every screen.

You write the review. The AI explains code when you ask, checks that you understand the PR, and gives feedback on your comments. It never writes them for you.

You will go through five pages, in order: **Checklist → Intention → Enquire → Comments → Review**.

## 1. Before you start

- [Bun](https://bun.sh) installed.
- `gh` installed and logged in (`gh auth status`).
- `opencode` on your `PATH` with a model you can use. review-tui lists the models OpenCode has available.
- Optional: the VS Code extension, so you can select code instead of typing file names and line numbers (see [With and without VS Code](#with-and-without-vs-code)).

From a checkout of this repo, once:

```sh
bun install
```

## 2. Launch

```sh
bun src/cli.ts https://github.com/<owner>/<repo>/pull/<n>
```

That is a **dry run**: everything works except the final post, which only saves a file. To really post, add `--post`:

```sh
bun src/cli.ts https://github.com/<owner>/<repo>/pull/<n> --post
```

- With no URL, review-tui reviews the open PR for the branch you have checked out in the current git repo. If there is none it exits with a message; pass a URL instead.
- Your work is saved under `reviews/<repo>-<pr>/` **in the directory you launch from**. Launch the same PR from the same directory to resume where you left off. Dry run first, then relaunch with `--post`, is a good habit: nothing is lost.

## 3. Start page

You see the repo, the PR's branch and the model that will be used.

| Key    | Action                                            |
| ------ | ------------------------------------------------- |
| Enter  | Start                                             |
| `m`    | Pick a different model (type to filter, ↑/↓, Enter to select, Esc to close) |
| Ctrl+C | Quit                                              |

## Keys that work on every page

| Key        | Action                                                          |
| ---------- | --------------------------------------------------------------- |
| ←/→        | Previous / next page. On a page with a text box, only while the box is empty |
| Esc        | Leave the text box so ←/→ always switch pages                   |
| Enter or `i` | Back into the text box (after Esc)                            |
| PgUp/PgDn  | Scroll the page                                                 |
| Ctrl+C     | Quit                                                            |

The bar at the bottom always lists the keys for the page you are on.

## 4. The pages

### Checklist

Eleven steps from Google's code review guide (design, tests, naming, and so on). Tick each as you cover it. No AI here.

| Key   | Action        |
| ----- | ------------- |
| ↑/↓   | Move          |
| Space | Tick / untick |

You can only start the review and post once all eleven are ticked.

### Intention

Type, in your own words, what the PR changes and why, then press Enter. A judge model replies **pass** or **retry** with a hint, and never tells you the answer. Retry as often as you need. After a pass, the page locks and your wording is saved to `comments.md`.

You need a pass before you can start the review or post.

### Enquire

Ask questions about the code to understand it: "why is a new session created here?", "where is this called?". Type a question and press Enter.

- With VS Code connected, the question is about the code you have selected. Without it, you can still ask; mention the file in your question.
- The model explains. It does not give verdicts or write comments for you.
- Answers are not saved and never reach your review. This page is optional.

### Comments

This is where you spend most of your time. Press Enter to add each comment.

| You type                 | Result                                              |
| ------------------------ | --------------------------------------------------- |
| `src/app.ts:42 Why not reuse the session?`      | Comment on one line         |
| `src/app.ts:42-48 This block repeats …`          | Comment on a range of lines |
| `general: Nice tests overall, docs are missing.` | **General comment**: about the whole PR, not tied to code |
| text only (VS Code, code selected)               | Comment on your selection   |
| `42 comment` or `42-48 comment` (VS Code, nothing selected) | Line or range in the file open in VS Code |

- **Inline vs general.** An inline comment sits on a line of code. A general comment applies to the whole review and is added to the end of the posted summary. With no code selected, the page shows a `General:` line reminding you to type `general: your note`.
- Inline comments must be on a line that is in the PR's diff. The page lists the files in the diff; a line outside it is refused with a message.
- Each comment is saved as a line in `comments.md`, for example `- src/app.ts:L42-48 — Why not reuse the session here?`. You can edit that file from the Review page.

### Review

Check your comments, add a message to the author, choose how to post, and post.

| Key | Action                                                                 |
| --- | ---------------------------------------------------------------------- |
| `s` | Ask the AI for feedback on accuracy and fairness of your comments. Optional; run it again after editing |
| `e` | Edit `comments.md` in `$EDITOR` (default `vi`)                         |
| `m` | Write a message to the author in `$EDITOR`                             |
| `b` | Edit the whole review body in `$EDITOR`                                |
| `p` | Post (see below)                                                       |

The page shows **Gates**: `s` and `p` only work when the checklist is complete, the intention has passed and there is at least one comment. It also shows **Mode**: `dry run`, or red `POST (live)` if you launched with `--post`.

The review body is built for you, each part under its own heading:

1. **Message from the reviewer**: what you wrote with `m` (left out if empty).
2. **Reviewer's understanding of the PR contents and intention**: your intention, as a quote.
3. **Summary of inline comments**: counts and files.
4. **General comments**: your `general:` comments.

It ends with a line naming review-tui and its version. Your inline comments go up in the same review. Every comment is prefixed with `[you + model]` so the AI's part is visible.

If you edit the body with `b`, your edit is posted as written and is no longer updated when comments change; delete `review-body.md` in the review folder to build it afresh.

## 5. Post the review

Press `p` on the Review page. You choose the review type:

| Key             | Type                | Effect on GitHub                      |
| --------------- | ------------------- | ------------------------------------- |
| `c` (default)   | **Comment**         | Feedback only                         |
| `r`             | **Request changes** | Marks the PR as needing changes       |
| `a`             | **Approve**         | Approves the PR                       |

←/→ also move between the three. Enter posts (or, in a dry run, saves `reviews/<repo>-<pr>/payload.json` so you can read exactly what would be sent). Esc cancels. Comment is highlighted when the prompt opens, so pressing Enter straight away never approves or blocks by accident.

If GitHub refuses, nothing is posted and the prompt stays open with the reason. The usual case is approving or requesting changes on a PR **you opened yourself**: GitHub does not allow it. Press `c`, then Enter, to post it as a Comment. Your comments and message are kept.

## With and without VS Code

|                    | With the VS Code extension                                   | Without                                   |
| ------------------ | ------------------------------------------------------------ | ----------------------------------------- |
| Comments           | Select code, type the comment, Enter                         | Type `path:line comment`                   |
| Enquire            | Questions are about your selection                           | Ask in words; name the file               |
| Connecting         | Automatic when one VS Code window has the repo open; else `/ide`, then `/ide N` to choose a window, `/ide off` to disconnect | Nothing to do |

Install the extension from `vscode-extension/` (steps in its [README](../vscode-extension/README.md)). `/ide` is typed into the Enquire or Comments text box.

## If something looks wrong

| You see                                     | Do this                                              |
| ------------------------------------------- | ---------------------------------------------------- |
| `Blocked: checklist incomplete` (or intention / comments) | Finish the missing step, then try again |
| The Intention judge says retry              | Read the hint, say what changes and why in your own words |
| A comment is refused as outside the diff    | Use a file and line from the "Files in diff" list    |
| Arrow keys move the text cursor, not the page | Press Esc, then ←/→                                |
| Not sure what will be posted                | Stay in dry run and read `payload.json`              |
| The model list is empty or fails            | Check that `opencode` works; Enter still starts      |

Full reference: [README](../README.md). Every screen and key: [`ui.md`](ui.md).
