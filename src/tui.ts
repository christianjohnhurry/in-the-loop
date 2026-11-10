import {spawnSync} from 'node:child_process';
import {appendFile} from 'node:fs/promises';
import {
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  StyledText,
  type TextChunk,
  TextRenderable,
  createCliRenderer,
} from '@opentui/core';
import {CHECKLIST} from './checklist';
import {reviewGates} from './gates';
import {
  buildReviewPayload,
  ghLogin,
  parseDiff,
  postReview,
  validateRange,
} from './github';
import {
  IdeClient,
  describeContext,
  discoverIdes,
  resolveTarget,
  toRepoPath,
  type FoundIde,
} from './ide';
import {Pager} from './pager';
import {enquire, subjectLabel, type Subject} from './enquire';
import {
  currentModelLabel,
  fetchProviders,
  judgeIntention,
  requestedModel,
  setModel,
} from './llm';
import {
  filterModels,
  initialModel,
  listModels,
  openCodeDefault,
  type ModelOption,
  type ModelRef,
} from './model';
import {reviseRun} from './revise';
import {CORNER_LOGO, cornerLogo, startPage, type ModelView} from './start';
import {glow, lines, span, styled, type Tone} from './theme';
import {
  appendInline,
  commentsPath,
  getSection,
  parseInline,
  readComments,
  setSection,
  type Store,
} from './store';
import type {InlineComment} from './types';

const PAGES = [
  'Checklist',
  'Intention',
  'Enquire',
  'Comments',
  'Review',
] as const;

/** Index of the Enquire page in {@link PAGES}. */
const ENQUIRE_PAGE = 2;

/** Options for {@link runTui}. */
export interface TuiOptions {
  /** If true, `p` sends the review; otherwise it is a dry run. */
  post: boolean;
}

/**
 * Runs the five-page review UI until the user quits.
 *
 * Pages: Checklist (tick steps), Intention (state what the PR does; an LLM
 * judge says pass/retry), Enquire (ask about the selected code; never locked,
 * not a gate), Comments (`path:line comment`), Review (gated;
 * model feedback, edit in $EDITOR, dry-run or post).
 *
 * @param store The open review (state, diff, directory).
 * @param opts Run options.
 */
export async function runTui(store: Store, opts: TuiOptions): Promise<void> {
  const {state} = store;
  const files = parseDiff(store.diff);
  const repoRoot = gitRoot();
  let candidates: FoundIde[] = []; // from the last /ide scan
  const renderer = await createCliRenderer({exitOnCtrlC: true});

  const root = new BoxRenderable(renderer, {
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    padding: 1,
  });
  const topBar = new BoxRenderable(renderer, {
    visible: false,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
    height: 1,
  });
  const logo = new TextRenderable(renderer, {
    content: cornerLogo(),
    width: CORNER_LOGO.length,
    flexShrink: 0,
  });
  topBar.add(logo);
  const header = new TextRenderable(renderer, {
    content: '',
    visible: false,
    flexShrink: 0,
  });
  const pager = new Pager(renderer, PAGES.length, [ENQUIRE_PAGE]);
  const splash = new BoxRenderable(renderer, {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    visible: false,
  });
  // Model: the saved choice, else $MODEL, else OpenCode's default once the
  // list has loaded.
  let selectedModel: ModelRef | undefined = initialModel(
    state.model,
    requestedModel(),
    undefined,
  );
  if (state.model) setModel(state.model);
  let models: ModelOption[] = [];
  let modelsLoading = true;
  let modelsError: string | undefined;
  let picker: {query: string; cursor: number} | undefined;
  /** Picker rows that fit under the logo. */
  const pickerRows = (): number =>
    Math.max(3, Math.min(10, renderer.height - 24));
  /** Index of the selected model in the full list; 0 if absent. */
  const selectedIndex = (): number =>
    Math.max(
      0,
      models.findIndex(
        (o) =>
          o.providerID === selectedModel?.providerID &&
          o.modelID === selectedModel?.modelID,
      ),
    );
  const modelView = (): ModelView => {
    const options = filterModels(models, picker?.query ?? '');
    return {
      selected: selectedModel,
      loading: modelsLoading,
      pickable: !modelsError,
      error: modelsError,
      picker: picker && {
        query: picker.query,
        options,
        cursor: Math.min(picker.cursor, Math.max(0, options.length - 1)),
        rows: pickerRows(),
      },
    };
  };
  const splashBlocks = startPage(state.pr, modelView()).map(
    (content) => new TextRenderable(renderer, {content}),
  );
  for (const b of splashBlocks) splash.add(b);
  const status = new TextRenderable(renderer, {content: '', flexShrink: 0});
  const input = new InputRenderable(renderer, {
    width: '100%',
    placeholder: '',
    flexShrink: 0,
  });
  const footer = new TextRenderable(renderer, {content: '', flexShrink: 0});
  for (const r of [topBar, header, pager.view, splash, status, input, footer])
    root.add(r);
  renderer.root.add(root);

  let started = false; // false while the start page is showing
  let cursor = 0; // checklist cursor
  let message = ''; // transient status line
  let messageTone: Tone = 'ok';
  /** Sets the status line; errors and blocks stand out from normal messages. */
  const say = (text: string, tone: Tone = 'ok'): void => {
    message = text;
    messageTone = tone;
  };
  let busy = false;
  const ide = new IdeClient(() => void draw());
  let typingOff = false; // Esc: leave the input so arrows navigate
  let payloadText = '';
  let asking = false; // an Enquire question is in flight
  let glowStep = 0;
  let glowTimer: ReturnType<typeof setInterval> | undefined;
  const turns: Turn[] = []; // Enquire transcript (this run only)
  const inputPage = (): boolean => state.page >= 1 && state.page <= 3;
  const intentionLocked = (): boolean => state.intention.status === 'passed';

  async function persist(): Promise<void> {
    await store.save();
  }

  /** One line: the IDE connection and what the reviewer is looking at. */
  function ideLine(): TextChunk[] {
    if (ide.status === 'connected') {
      const here = describeContext(ide.context);
      return [
        span('IDE: ', 'accent', {bold: true}),
        span(`${ide.ide!.lock.ideName} connected`, 'ok'),
        span(' · ', 'muted'),
        here
          ? span(here, 'comment', {bold: !!ide.context.selection})
          : span('no file open', 'muted'),
        ...(here && !ide.context.selection
          ? [span('  (no selection: type "42 comment")', 'muted')]
          : []),
      ];
    }
    if (ide.status === 'connecting')
      return [
        span('IDE: ', 'accent', {bold: true}),
        span('connecting…', 'warn'),
      ];
    return [
      span('IDE: ', 'accent', {bold: true}),
      span('not connected', 'muted'),
      span(
        ide.ide
          ? `  (${ide.problem}; reconnecting…)`
          : ide.problem
            ? `  (${ide.problem}; /ide to retry)`
            : '  (/ide to connect)',
        'muted',
      ),
    ];
  }

  /** The numbered list shown after `/ide` finds several IDEs. */
  function candidateLines(): TextChunk[][] {
    if (ide.status === 'connected' || candidates.length < 2) return [];
    return candidates.map((c, i) => [
      span(`  /ide ${i + 1}`, 'accent'),
      span(
        `  ${c.lock.ideName}: ${c.lock.workspaceFolders.join(', ')}`,
        'muted',
      ),
    ]);
  }

  /** Handles `/ide`, `/ide N` and `/ide off`. */
  async function ideCommand(arg: string): Promise<void> {
    if (arg === 'off') {
      ide.disconnect();
      candidates = [];
      return say('IDE disconnected.');
    }
    candidates = await discoverIdes(repoRoot);
    const pick = /^\d+$/.test(arg) ? candidates[Number(arg) - 1] : undefined;
    if (candidates.length === 0)
      return say(
        `No running IDE found for ${repoRoot}. Open the repo in VS Code with the extension.`,
        'warn',
      );
    if (arg && !pick) return say(`No IDE number ${arg}.`, 'error');
    if (!pick && candidates.length > 1)
      return say('Several IDEs match: pick one with /ide N.', 'warn');
    try {
      await ide.connect(pick ?? candidates[0]!);
      say(`Connected to ${ide.ide!.lock.ideName}.`);
    } catch (e) {
      say(`Could not connect: ${(e as Error).message}`, 'error');
    }
  }

  /** What the reviewer has selected in VS Code, in repo-relative terms. */
  function currentSubject(): Subject | null {
    const {path, selection} = ide.context;
    if (ide.status !== 'connected' || !path || !selection) return null;
    const rel = toRepoPath(ide.ide!.lock, repoRoot, path, files);
    return rel ? {path: rel, ...selection} : null;
  }

  /** The Enquire page: subject line, transcript, thinking status. */
  function enquireLines(): TextChunk[][] {
    const subject = currentSubject();
    const subjectLine: TextChunk[] = [
      span('Subject: ', 'accent', {bold: true}),
      subject
        ? span(subjectLabel(subject), 'comment', {bold: true})
        : span(
            ide.status === 'connected' && ide.context.path
              ? 'no selection (select code in VS Code to ask about it)'
              : 'none (/ide to connect VS Code, then select code)',
            'muted',
          ),
    ];
    return [
      [
        span(
          'Ask about the code you selected. You judge; the model explains.',
          'muted',
        ),
      ],
      subjectLine,
      ...candidateLines(),
      ...turns
        .slice(-MAX_TURNS_SHOWN)
        .flatMap((t) => [
          [],
          [span(t.subject ? `── ${t.subject} ` : '── no selection ', 'muted')],
          ...t.excerpt.map((l) => [span(`  ${l}`, 'muted', {dim: true})]),
          [span('Q: ', 'accent', {bold: true}), span(t.question)],
          ...(t.answer === undefined
            ? []
            : t.answer
                .split('\n')
                .map((l, i) => [
                  span(i ? '   ' : 'A: ', 'llm', {bold: true}),
                  span(l, 'llm'),
                ])),
        ]),
      ...(asking ? [[], [glow('thinking…', glowStep)]] : []),
    ];
  }

  async function draw(): Promise<void> {
    const md = await readComments(store.dir);
    const comments = parseInline(md);
    const gates = reviewGates(state, comments);
    topBar.visible = started;
    pager.view.visible = started;
    splash.visible = !started;
    header.visible = started;
    if (!started) {
      startPage(state.pr, modelView()).forEach((content, i) => {
        splashBlocks[i]!.content = content;
      });
      status.content = styled(span(''));
      footer.content = styled(
        span(
          picker
            ? 'type to filter · ↑/↓ move · Enter select · Esc cancel'
            : `Enter start ${modelsError ? '' : '· m change model '}· Ctrl+C quit`,
          'muted',
        ),
      );
      input.visible = false;
      input.blur();
      renderer.requestRender();
      return;
    }
    header.content = styled(
      span('◀ ', 'muted'),
      ...PAGES.flatMap((p, i) => [
        i === state.page
          ? span(`[ ${p} ]`, 'accent', {bold: true})
          : span(p, 'muted'),
        '  ',
      ]),
      span('▶', 'muted'),
      span(`   (${state.page + 1}/${PAGES.length})   `, 'muted'),
      span(`PR #${state.pr.number}: ${state.pr.title}`, undefined, {
        bold: true,
      }),
    );
    let text: StyledText;
    let hint = '←/→ pages · Ctrl+C quit';
    if (state.page === 0) {
      text = lines(
        CHECKLIST.map((c, i) => {
          const on = state.checklist[c.id];
          const here = i === cursor;
          return [
            span(here ? '> ' : '  ', 'accent', {bold: true}),
            span(`[${on ? 'x' : ' '}] `, on ? 'ok' : 'muted', {bold: on}),
            on
              ? span(c.label, 'muted')
              : span(c.label, here ? 'accent' : undefined, {bold: here}),
          ];
        }),
      );
      hint += ' · ↑/↓ move · space tick';
    } else if (state.page === 1) {
      const i = state.intention;
      text = intentionLocked()
        ? lines([
            [
              span('🔒 Locked: ', 'ok', {bold: true}),
              span('intention accepted and saved to comments.md', 'ok'),
            ],
            [],
            [span(i.text)],
          ])
        : lines([
            [span('In your own words: what does this PR change, and why?')],
            [
              span(
                '(The reviewer states it; the judge only says pass/retry.)',
                'muted',
              ),
            ],
            [],
            ...(i.hint
              ? [
                  [
                    span('retry · Hint: ', 'warn', {bold: true}),
                    span(i.hint, 'warn'),
                  ],
                  [],
                ]
              : []),
            ...(i.text
              ? [[span('Your last attempt: ', 'muted'), span(i.text)]]
              : []),
          ]);
      hint += ' · type + Enter submit · Esc leave input';
    } else if (state.page === 2) {
      text = lines(enquireLines());
      hint += ' · type a question + Enter · /ide connect · Esc leave input';
    } else if (state.page === 3) {
      text = lines([
        [
          span('Add: ', 'accent', {bold: true}),
          span(
            ide.status === 'connected'
              ? 'comment on the selection'
              : 'path:line comment',
          ),
          span('   (or: general: text for the review body)', 'muted'),
        ],
        ideLine(),
        ...candidateLines(),
        [span('Files in diff:', 'muted')],
        ...[...files.keys()].map((f) => [span(`  ${f}`, 'muted')]),
        [],
        [span(`Comments (${comments.length}):`, 'accent', {bold: true})],
        ...comments.map((c) => [
          span(
            `  ${c.path}:L${c.startLine === undefined ? c.line : `${c.startLine}-${c.line}`}`,
            'comment',
            {bold: true},
          ),
          span(' — '),
          span(c.body),
        ]),
      ]);
      hint += ' · Enter add · Esc leave input';
    } else {
      text = lines([
        [
          span('Gates: ', 'accent', {bold: true}),
          gates.ok
            ? span('all passed', 'ok', {bold: true})
            : span(`blocked: ${gates.missing.join(', ')}`, 'warn', {
                bold: true,
              }),
        ],
        [
          span('Mode: ', 'accent', {bold: true}),
          opts.post
            ? span('POST (live)', 'error', {bold: true})
            : span('dry run', 'muted'),
        ],
        [],
        ...(state.feedback
          ? [
              [
                span(
                  `Feedback on your comments (LLM, run ${state.reviewRuns ?? 1}):`,
                  'llm',
                  {bold: true},
                ),
              ],
              ...state.feedback.split('\n').map((l) => [span(l, 'llm')]),
            ]
          : []),
        ...(payloadText
          ? [
              [],
              [span('Payload:', 'accent', {bold: true})],
              ...payloadText.split('\n').map((l) => [span(l, 'muted')]),
            ]
          : []),
      ]);
      const sVerb = state.reviewRuns ? 're-run' : 'start';
      hint +=
        ` · s ${sVerb} review · e edit comments.md · p ` +
        (opts.post ? 'post' : 'dry-run payload');
    }
    pager.show(state.page);
    pager.active.text.content = text;
    status.content = busy
      ? styled(span('working…', 'warn'))
      : styled(span(message, messageTone, {bold: messageTone === 'error'}));
    footer.content = styled(span(hint, 'muted'));
    input.visible = inputPage() && !(state.page === 1 && intentionLocked());
    if (input.visible && !typingOff) {
      input.placeholder =
        state.page === 1
          ? 'your intention…'
          : state.page === 2
            ? 'your question…'
            : 'path:line comment';
      input.focus();
    } else input.blur();
    renderer.requestRender();
  }

  async function go(page: number): Promise<void> {
    state.page = (page + PAGES.length) % PAGES.length;
    typingOff = false;
    say('');
    await persist();
    await draw();
  }

  async function submit(value: string): Promise<void> {
    if (busy || !value.trim()) return;
    if (state.page === 1 && !intentionLocked()) {
      busy = true;
      state.intention.text = value.trim();
      input.value = '';
      await draw();
      const v = await judgeIntention(
        {
          diff: store.diff,
          description: state.pr.body,
          statement: state.intention.text,
        },
        undefined,
        (e) =>
          void appendFile(
            `${store.dir}/errors.log`,
            `${new Date().toISOString()} judge: ${String((e as Error)?.stack ?? e)}\n`,
          ),
      );
      busy = false;
      if (v.verdict === 'pass') {
        state.intention.status = 'passed';
        state.intention.hint = '';
        const md = await readComments(store.dir);
        await Bun.write(
          commentsPath(store.dir),
          setSection(md, 'Intention', state.intention.text),
        );
        say('Intention passed.');
      } else {
        state.intention.hint = v.hint;
        say('Not yet: retry.', 'warn');
      }
    } else if (state.page === 2) {
      const cmd = value.trim().match(/^\/ide(?:\s+(\S+))?$/);
      if (cmd) {
        input.value = '';
        await ideCommand(cmd[1] ?? '');
      } else if (!asking) await ask(value);
    } else if (state.page === 3) {
      const cmd = value.trim().match(/^\/ide(?:\s+(\S+))?$/);
      const g = value.match(/^general:\s*(.+)$/i);
      if (cmd) {
        input.value = '';
        await ideCommand(cmd[1] ?? '');
      } else if (g) {
        const md = await readComments(store.dir);
        const prev = getSection(md, 'General');
        await Bun.write(
          commentsPath(store.dir),
          setSection(md, 'General', prev ? `${prev}\n${g[1]}` : g[1]!),
        );
        say('Added to general comment.');
        input.value = '';
      } else {
        const m = value.match(/^(\S+?):(\d+)(?:-(\d+))?\s+(.+)$/);
        if (m) {
          const first = Number(m[2]);
          const last = m[3] === undefined ? first : Number(m[3]);
          const startLine = last > first ? first : undefined;
          const err = validateRange(files, m[1]!, startLine, last);
          if (err) say(err, 'error');
          else {
            await addComment({path: m[1]!, startLine, line: last, body: m[4]!});
            input.value = '';
          }
        } else if (ide.status === 'connected') {
          // No explicit path:line: the comment is about what the IDE shows.
          const spec = value.match(/^(\d+(?:-\d+)?)\s+(.+)$/s);
          const t = resolveTarget(
            ide.context,
            ide.ide!.lock,
            repoRoot,
            files,
            ide.context.selection ? undefined : spec?.[1],
          );
          if ('error' in t) say(t.error, 'error');
          else {
            const body = ide.context.selection ? value.trim() : spec![2]!;
            await addComment({...t, body});
            input.value = '';
          }
        } else
          say('Use: path:line comment (or /ide to use your editor)', 'error');
      }
    }
    await persist();
    await draw();
  }
  /** Sends an Enquire question about the subject as it is right now. */
  async function ask(question: string): Promise<void> {
    const subject = currentSubject();
    const turn: Turn = {
      subject: subject ? subjectLabel(subject) : '',
      excerpt: subject ? excerptLines(subject.text) : [],
      question: question.trim(),
    };
    asking = true;
    glowStep = 0;
    glowTimer = setInterval(() => {
      glowStep += 1;
      void draw();
    }, 200);
    turns.push(turn);
    await draw();
    if (state.page === ENQUIRE_PAGE) pager.scrollToEnd();
    const r = await enquire(
      {question, subject, diff: store.diff},
      undefined,
      (e) =>
        void appendFile(
          `${store.dir}/errors.log`,
          `${new Date().toISOString()} enquire: ${String((e as Error)?.stack ?? e)}\n`,
        ),
    );
    clearInterval(glowTimer);
    asking = false;
    if (r.ok) {
      turn.answer = r.answer;
      input.value = '';
      say('');
    } else {
      // Failed turns are not kept; the question stays in the input.
      turns.splice(turns.indexOf(turn), 1);
      say(r.message, 'error');
    }
  }

  /** Appends an inline comment and confirms with the range it landed on. */
  async function addComment(c: InlineComment): Promise<void> {
    if (c.startLine === undefined) delete c.startLine;
    await appendInline(store.dir, c);
    say(
      `Added on ${c.path}:L${c.startLine === undefined ? c.line : `${c.startLine}-${c.line}`}.`,
    );
  }
  input.on(InputRenderableEvents.ENTER, (v: string): void => void submit(v));

  /** Runs a review of comments.md as it is now; repeatable after edits. */
  async function startReview(): Promise<void> {
    busy = true;
    await draw();
    try {
      const result = await reviseRun(store);
      if (result.ok) say(`Review run ${result.run} done.`);
      else say(`Blocked: ${result.missing.join(', ')}`, 'error');
    } catch (e) {
      say(`Review failed: ${(e as Error).message}`, 'error');
    }
    busy = false;
  }

  async function editComments(): Promise<void> {
    await renderer.suspend();
    spawnSync(process.env.EDITOR || 'vi', [commentsPath(store.dir)], {
      stdio: 'inherit',
    });
    await renderer.resume();
  }

  async function publish(): Promise<void> {
    const md = await readComments(store.dir);
    const comments = parseInline(md);
    const gates = reviewGates(state, comments);
    if (!gates.ok) {
      say(`Blocked: ${gates.missing.join(', ')}`, 'error');
      return;
    }
    const bad = comments
      .map((c) => validateRange(files, c.path, c.startLine, c.line))
      .find(Boolean);
    if (bad) {
      say(`Edited comment invalid: ${bad}`, 'error');
      return;
    }
    const reviewer = process.env.REVIEWER || (await ghLogin());
    const model = currentModelLabel();
    const general = getSection(md, 'General') || 'Review comments below.';
    const payload = buildReviewPayload({
      prefix: `[${reviewer} + ${model}]`,
      general,
      comments,
      headSha: state.pr.headSha,
    });
    payloadText = JSON.stringify(payload, null, 2);
    await Bun.write(`${store.dir}/payload.json`, payloadText);
    say(
      opts.post
        ? `Posted: ${await postReview(state.pr, payload)}`
        : `Dry run: payload saved to ${store.dir}/payload.json`,
    );
  }

  renderer.keyInput.on('keypress', async (key) => {
    if (!started) {
      if (picker) {
        const options = filterModels(models, picker.query);
        if (key.name === 'escape') picker = undefined;
        else if (key.name === 'return') {
          const pick = options[Math.min(picker.cursor, options.length - 1)];
          if (pick) {
            selectedModel = {
              providerID: pick.providerID,
              modelID: pick.modelID,
            };
            state.model = selectedModel;
            setModel(selectedModel);
            await persist();
            picker = undefined;
          }
        } else if (key.name === 'up')
          picker.cursor = Math.max(0, picker.cursor - 1);
        else if (key.name === 'down')
          picker.cursor = Math.min(options.length - 1, picker.cursor + 1);
        else if (key.name === 'backspace') {
          picker.query = picker.query.slice(0, -1);
          picker.cursor = 0;
        } else if (
          !key.ctrl &&
          !key.meta &&
          /^[\x20-\x7e]$/.test(key.sequence)
        ) {
          picker.query += key.sequence;
          picker.cursor = 0;
        }
        return void (await draw());
      }
      if (key.name === 'return') {
        started = true;
        await draw();
      } else if (key.name === 'm' && !modelsError) {
        picker = {query: '', cursor: selectedIndex()};
        await draw();
      }
      return;
    }
    if (key.name === 'pageup' || key.name === 'pagedown') {
      pager.scrollBy(key.name === 'pageup' ? -0.5 : 0.5, 'viewport');
      return renderer.requestRender();
    }
    const typing = inputPage() && input.visible && !typingOff;
    const inputEmpty = !input.value;
    if (key.name === 'escape') {
      typingOff = true;
      say('Input off: use ←/→; Enter or i to type again', 'muted');
      await draw();
      return;
    }
    if (typingOff && (key.name === 'return' || key.name === 'i')) {
      typingOff = false;
      say('');
      await draw();
      return;
    }
    if (
      typing &&
      !(inputEmpty && (key.name === 'left' || key.name === 'right'))
    )
      return;
    if (key.name === 'left') return void (await go(state.page - 1));
    if (key.name === 'right') return void (await go(state.page + 1));
    if (state.page === 0) {
      if (key.name === 'up') cursor = Math.max(0, cursor - 1);
      else if (key.name === 'down')
        cursor = Math.min(CHECKLIST.length - 1, cursor + 1);
      else if (key.name === 'space') {
        const id = CHECKLIST[cursor]!.id;
        state.checklist[id] = !state.checklist[id];
        await persist();
      }
      return void (await draw());
    }
    if (state.page === 4 && !busy) {
      if (key.name === 's') await startReview();
      else if (key.name === 'e') await editComments();
      else if (key.name === 'p') {
        try {
          await publish();
        } catch (e) {
          say(`Failed: ${(e as Error).message}`, 'error');
        }
      }
      await persist();
      return void (await draw());
    }
  });

  await draw();

  // List models in the background so the start page never waits on OpenCode.
  void (async (): Promise<void> => {
    try {
      const listing = await fetchProviders();
      models = listModels(listing);
      selectedModel = initialModel(
        state.model,
        requestedModel(),
        openCodeDefault(listing),
      );
      setModel(selectedModel);
    } catch (e) {
      modelsError = (e as Error).message || 'OpenCode unavailable';
    }
    modelsLoading = false;
    if (picker && !picker.query) picker.cursor = selectedIndex();
    if (!started) await draw();
  })();

  // Like Claude Code's /ide: connect automatically when exactly one matches.
  candidates = await discoverIdes(repoRoot);
  if (candidates.length === 1) {
    try {
      await ide.connect(candidates[0]!);
      say(`Connected to ${ide.ide!.lock.ideName}.`);
    } catch {
      // Stale lock or refused: stay usable without it; /ide shows why.
    }
    await draw();
  }
}

/** The repo checkout: the git top level of the working directory. */
function gitRoot(): string {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  });
  return r.status === 0 ? r.stdout.trim() : process.cwd();
}

/** One Enquire exchange as shown in the transcript. */
interface Turn {
  /** `path:L10-20` as it was when the question was sent; empty if none. */
  subject: string;
  /** First lines of the selected text. */
  excerpt: string[];
  question: string;
  /** Undefined while the model is thinking. */
  answer?: string;
}

const MAX_TURNS_SHOWN = 5;
const EXCERPT_LINES = 4;

/** The first few selected lines, with a marker if there are more. */
function excerptLines(text: string): string[] {
  const all = text.split('\n');
  return all.length > EXCERPT_LINES
    ? [
        ...all.slice(0, EXCERPT_LINES),
        `… (${all.length - EXCERPT_LINES} more lines)`,
      ]
    : all;
}
