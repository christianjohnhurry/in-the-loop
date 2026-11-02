/** A pull request as fetched from GitHub. */
export interface PrInfo {
  url: string;
  owner: string;
  repo: string;
  number: number;
  title: string;
  /** The PR description. */
  body: string;
  /** Commit the diff and inline comments are anchored to. */
  headSha: string;
}

/** What the intention judge is allowed to say after parsing. */
export interface Verdict {
  verdict: 'pass' | 'retry';
  /** Length-capped nudge shown on `retry`; empty on `pass`. */
  hint: string;
}

/** Everything persisted in state.json so a review can be resumed. */
export interface State {
  pr: PrInfo;
  /** Index of the page the reviewer was last on. */
  page: number;
  /** Checklist item id to ticked. */
  checklist: Record<string, boolean>;
  intention: {status: 'open' | 'passed'; text: string; hint: string};
  /** The AI's feedback on the reviewer's comments. */
  feedback: string;
}

/** One line or line-range comment on the PR's new side. */
export interface InlineComment {
  path: string;
  /** Last line of the comment (the only line for a single-line comment). */
  line: number;
  /** First line of a multi-line range; absent for a single line. */
  startLine?: number;
  body: string;
}
