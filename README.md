# in-the-loop

Utility tools for software engineers who want to empower themselves with AI while maintaining discipline and keeping themselves in the loop.

The goal is for AI to speed up the work, not take it over. Key decisions should still be made by the engineer, with their authorship and their understanding.

## review-tui (walking skeleton)

A terminal UI that walks a reviewer through a GitHub PR: checklist, intention, comments, review. The AI checks the reviewer's understanding and comments; the reviewer stays the author.

```sh
bun install
bun src/cli.ts https://github.com/<owner>/<repo>/pull/<n>          # dry run
bun src/cli.ts https://github.com/<owner>/<repo>/pull/<n> --post   # really post
```

- Requires `gh` (authenticated) and Bun. State lives in `reviews/<repo>-<pr>/` (`comments.md`, `state.json`, `diff.patch`); relaunching resumes.
- Pages: ←/→ to switch. Checklist: ↑/↓, space. Intention/Comments: type, Enter, Esc to leave the input. Review: `s` start, `e` edit `comments.md` in `$EDITOR`, `p` payload/post.
- Comments: `path:line comment` (line must be in the diff), or `general: text` for the review body.
- Model: any model your local OpenCode has available. `bun src/cli.ts --list-models` lists them; pick one with `--model provider/model` or `REVIEW_MODEL=provider/model` (validated up front). With no choice, OpenCode's default is used. The model that actually answered is recorded in `state.json`.
- Posted comments are prefixed `[$REVIEWER + provider/model]`; `$REVIEWER` defaults to your `gh` login.
- LLM calls go through a local OpenCode server using the read-only agent in `.opencode/agents/review-judge.md`. Set `OPENCODE_URL` to use an existing server instead of spawning one (the `opencode` binary must be on `PATH` otherwise).
- `bun test` for unit tests; `REVIEW_MODEL=… bun run eval:judge` runs the five canned judge cases against a live model.
