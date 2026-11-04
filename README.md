# in-the-loop

Utility tools for software engineers who want to empower themselves with AI while maintaining discipline and keeping themselves in the loop.

The goal is for AI to speed up the work, not take it over. Key decisions should still be made by the engineer, with their authorship and their understanding.

## review-tui (walking skeleton)

A terminal UI that walks a reviewer through a GitHub PR: checklist, intention, enquire, comments, review. The AI checks the reviewer's understanding and comments; the reviewer stays the author.

```sh
bun install
bun src/cli.ts https://github.com/<owner>/<repo>/pull/<n>          # dry run
bun src/cli.ts https://github.com/<owner>/<repo>/pull/<n> --post   # really post
```

- Requires `gh` (authenticated) and Bun. State lives in `reviews/<repo>-<pr>/` (`comments.md`, `state.json`, `diff.patch`); relaunching resumes.
- On launch a start page shows the repo and PR branch; Enter continues (a resumed review returns to its last page).
- Pages: ←/→ to switch. Checklist: ↑/↓, space. Intention/Comments: type, Enter, Esc to leave the input. Review: `s` start, `e` edit `comments.md` in `$EDITOR`, `p` payload/post.
- Enquire: select code in VS Code, type a question, Enter. The model explains the code; it does not review it (no verdicts, no drafted comments, no statement of the PR's intention). Answers are plain text, not saved, and never reach `comments.md` or GitHub. Uses the read-only agent in `.opencode/agents/review-enquire.md`. Never locked and not a gate. Design: `docs/design/enquire-page.md`.
- Comments: `path:line comment` or `path:10-15 comment` (every line must be in the diff), or `general: text` for the review body.
- VS Code (extension in `vscode-extension/`): review-tui auto-connects when exactly one running VS Code has this repo open; otherwise type `/ide` (then `/ide N` to pick, `/ide off` to disconnect). The Comments page shows the active file or selection (`src/llm.ts:L42-48`). With a selection, just type the comment; with only a file open, start with the line: `42 comment` or `42-48 comment`. Without VS Code, `path:line` works as before.
- `$REVIEWER` (default: your `gh` login) and `$MODEL` form the `[$REVIEWER + $MODEL]` prefix. `$MODEL` is `provider/model` (e.g. `anthropic/claude-sonnet-5-5`) and is the model the judge runs on; a malformed value exits at startup, and an unknown model shows as a failed judge call (retry). When unset, OpenCode's own default model runs and the prefix shows the model OpenCode reported using (`unknown` if no LLM call has completed this session, e.g. a resumed review).
- LLM calls go through a local OpenCode server using the read-only agents in `.opencode/agents/` (`review-judge.md`, `review-enquire.md`). Set `OPENCODE_URL` to use an existing server instead of spawning one (the `opencode` binary must be on `PATH` otherwise).
- `bun test` for unit tests; `bun run eval:judge` runs the five canned judge cases against a live model.
- Version: `bun src/cli.ts --version`. User-visible changes are recorded in `CHANGELOG.md`.
