/**
 * @file Loads the review agents from `.opencode/agents/*.md` so they can be
 * handed to OpenCode inline. OpenCode only finds project agents in the tree
 * a session runs in, and Enquire runs in the repo under review, not here.
 */
import {readdir} from 'node:fs/promises';
import {resolve} from 'node:path';

/** An OpenCode agent definition, as accepted in `config.agent`. */
export interface AgentConfig {
  description?: string;
  mode?: string;
  temperature?: number;
  permission?: Record<string, unknown>;
  prompt: string;
}

/** Name of the Enquire agent that may read the repo under review. */
export const ENQUIRE_AGENT = 'review-enquire';
/** Name of the Enquire agent with every repo tool denied (degraded mode). */
export const ENQUIRE_NO_REPO_AGENT = 'review-enquire-norepo';

const AGENTS_DIR = resolve(import.meta.dir, '..', '.opencode', 'agents');

/**
 * The one path the no-repo agent may `read`. It cannot exist as a real file.
 * Denying `read` outright makes OpenCode (1.x, tried with the free
 * `opencode/big-pickle` model) never answer, so `read` stays on with a rule
 * that matches nothing, and every real read is refused.
 */
const NO_FILE = '.review-tui-no-such-file';

/**
 * Parses an agent file: YAML frontmatter, then the prompt.
 *
 * @param md The file contents.
 * @return The agent definition.
 */
export function parseAgent(md: string): AgentConfig {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(md);
  if (!m) throw new Error('agent file has no frontmatter');
  const front = Bun.YAML.parse(m[1]!) as Omit<AgentConfig, 'prompt'>;
  return {...front, prompt: m[2]!.trim()};
}

/**
 * The same agent unable to look at the repo: `grep`, `glob` and `list` are
 * denied and `read` allows nothing (see {@link NO_FILE}).
 *
 * @param agent The agent to restrict.
 * @return A copy that cannot look at the repo.
 */
export function withoutRepoTools(agent: AgentConfig): AgentConfig {
  const permission = {...agent.permission};
  for (const tool of ['grep', 'glob', 'list']) permission[tool] = 'deny';
  permission.read = {'*': 'deny', [NO_FILE]: 'allow'};
  return {...agent, permission};
}

/**
 * Reads every agent in `.opencode/agents/`, plus the no-repo Enquire agent.
 *
 * @param dir Directory of agent files; defaults to this install's.
 * @return Agents by name, for OpenCode's `config.agent`.
 */
export async function loadAgents(
  dir: string = AGENTS_DIR,
): Promise<Record<string, AgentConfig>> {
  const agents: Record<string, AgentConfig> = {};
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.md'))) {
    agents[file.slice(0, -3)] = parseAgent(
      await Bun.file(resolve(dir, file)).text(),
    );
  }
  const enquire = agents[ENQUIRE_AGENT];
  if (enquire) agents[ENQUIRE_NO_REPO_AGENT] = withoutRepoTools(enquire);
  return agents;
}
