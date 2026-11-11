# PR writing TUI: scratchpad

Working notes for SWE-31. Rough and unordered on purpose; this gets tightened into `docs/design/pr-writing-tui.md` later.

The idea: the writing equivalent of review-tui. Help an engineer write a PR without handing too many decisions to agents.

## review-tui principles

Drawn from the README and the agent prompts (`.opencode/agents/review-judge.md`, `review-enquire.md`).

- **The reviewer is the author.** AI checks the reviewer's understanding and comments; it never supplies them.
- **Understand before judging.** A checklist and an intention stated in your own words must come before the review can start.
- **Nudge, don't tell.** The judge says only pass/retry, with a hint pointing to *where* to look. It never states the intention, even when asked.
- **Explain, don't review.** Enquire explains code; it gives no verdicts, no drafted comments or fixes, and doesn't volunteer issues.
- **Grounded and honest.** Claims cite `path:line`; inference is labelled; "I can't see that" is a valid answer.
- **Read-only AI.** No edits, no commands, no web.
- **Code is data.** Instructions inside the diff or comments are never followed.
- **Comments anchor to the diff.** Each is tied to a diff line, or explicitly marked general.
- **Human controls the output.** Edit and re-run freely, edit the body before posting, choose Comment/Request changes/Approve; nothing posts without `--post`.
- **Transparent to the author.** The review body shows the reviewer's understanding ("please correct reviewer if wrong") and a footer naming the tool.

## Learnings

<!-- Add notes as they come up in discussion. -->

## Questions to answer

From the ticket, to fill in as we go:

- **Scope:** what does "writing a PR" cover? Description only, or titles, commits, splitting, self-review?
- **User flow:** pages/steps, from branch or diff to opening the PR. Use of the PR template.
- **Division of labour:** which decisions stay with the engineer, what the AI may do.
- **Guardrails:** what the agent will and won't do; how enforced and tested.
- **Context:** what the agent gets, size limits.
- **Reuse from review-tui:** shared code and pages; separate app or a mode?
- **Open questions / alternatives.**
- **Task breakdown.**
