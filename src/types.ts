export interface PrInfo {
  url: string;
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  headSha: string;
}

export interface Verdict {
  verdict: "pass" | "retry";
  hint: string;
}

export interface State {
  pr: PrInfo;
  page: number;
  checklist: Record<string, boolean>;
  intention: { status: "open" | "passed"; text: string; hint: string };
  feedback: string;
}

export interface InlineComment {
  path: string;
  line: number;
  body: string;
}
