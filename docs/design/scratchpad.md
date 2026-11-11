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

### Scope: a code *writing* tool, not just a PR-description tool

It covers the author's whole path, from idea to reviewable change:

1. **Propose** a feature.
2. **Design** it.
3. **Break the design into tickets.**
4. **Turn tickets into sensible CLs/PRs**: well-sized, well-described changes.

So the "PR writing TUI" name undersells it; it's the author-side counterpart to review-tui. (The ticket/branch names stay as they are.)

### Who writes the code: a mix

- **The engineer owns the abstract thinking**: what the feature is for, the design, how it splits into tickets and PRs.
- **LLMs write the implementation, at speed**, inside the boundaries the engineer set.
- So the tool's job is to keep that line sharp: make the engineer do (and show they've done) the abstract thinking before the agent writes code, and make sure what comes back matches it and is understood, so the engineer can still own it in review.

### Where the line sits

Three possible depths for the engineer's "abstract thinking":

1. **What and why**: problem, goal, acceptance criteria.
2. **Shape**: which modules change, how responsibilities split, main data flows.
3. **Contracts**: signatures, types, data shapes, maybe tests.

**Decision: level 2 by default, level 3 for risky parts** (public APIs, data models, anything hard to reverse). Level 1 alone hands the design to the agent; level 3 everywhere costs speed where details don't matter.

**Who decides what's risky: a checklist.** The tool asks per change, like review-tui's checklist: does it touch a public API? A data model or schema? A migration? Anything hard to roll back? Security or auth? Any "yes" means level 3 (contracts) for that part. Considered and rejected: engineer flags it unprompted (easy to skip); AI suggests risky spots (bends "nudge, don't tell", the AI volunteering issues).

Follow-up: how is level 2/3 captured so the agent is held to it?

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
