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
- `$REVIEWER` (default: your `gh` login) and `$MODEL` (default `opencode-default`) form the `[$REVIEWER + $MODEL]` prefix.
- LLM calls go through a local OpenCode server using the read-only agent in `.opencode/agents/review-judge.md`. Set `OPENCODE_URL` to use an existing server instead of spawning one (the `opencode` binary must be on `PATH` otherwise).
- `bun test` for unit tests; `bun run eval:judge` runs the five canned judge cases against a live model.
- Version: `bun src/cli.ts --version`. User-visible changes are recorded in `CHANGELOG.md`.
