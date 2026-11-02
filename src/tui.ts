import {spawnSync} from 'node:child_process';
import {appendFile} from 'node:fs/promises';
import {
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  StyledText,
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
  validateTarget,
} from './github';
import {judgeIntention, reviewComments} from './llm';
import {lines, span, styled, type Tone} from './theme';
import {
  appendInline,
  commentsPath,
  getSection,
  parseInline,
  readComments,
  setSection,
  type Store,
} from './store';

const PAGES = ['Checklist', 'Intention', 'Comments', 'Review'] as const;

/** Options for {@link runTui}. */
export interface TuiOptions {
  /** If true, `p` sends the review; otherwise it is a dry run. */
  post: boolean;
}

/**
 * Runs the four-page review UI until the user quits.
 *
 * Pages: Checklist (tick steps), Intention (state what the PR does; an LLM
 * judge says pass/retry), Comments (`path:line comment`), Review (gated;
 * model feedback, edit in $EDITOR, dry-run or post).
 *
 * @param store The open review (state, diff, directory).
 * @param opts Run options.
 */
export async function runTui(store: Store, opts: TuiOptions): Promise<void> {
  const {state} = store;
  const files = parseDiff(store.diff);
  const renderer = await createCliRenderer({exitOnCtrlC: true});

  const root = new BoxRenderable(renderer, {
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    padding: 1,
  });
  const header = new TextRenderable(renderer, {content: ''});
  const body = new TextRenderable(renderer, {content: '', flexGrow: 1});
  const status = new TextRenderable(renderer, {content: ''});
  const input = new InputRenderable(renderer, {width: '100%', placeholder: ''});
  const footer = new TextRenderable(renderer, {content: ''});
  for (const r of [header, body, status, input, footer]) root.add(r);
  renderer.root.add(root);

  let cursor = 0; // checklist cursor
  let message = ''; // transient status line
  let messageTone: Tone = 'ok';
  /** Sets the status line; errors and blocks stand out from normal messages. */
  const say = (text: string, tone: Tone = 'ok'): void => {
    message = text;
    messageTone = tone;
  };
  let busy = false;
  let typingOff = false; // Esc: leave the input so arrows navigate
  let payloadText = '';
  const inputPage = (): boolean => state.page === 1 || state.page === 2;
  const intentionLocked = (): boolean => state.intention.status === 'passed';

  async function persist(): Promise<void> {
    await store.save();
  }

  async function draw(): Promise<void> {
    const md = await readComments(store.dir);
    const comments = parseInline(md);
    const gates = reviewGates(state, comments);
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
      text = lines([
        [
          span('Add: ', 'accent', {bold: true}),
          span('path:line comment'),
          span('   (or: general: text for the review body)', 'muted'),
        ],
        [span('Files in diff:', 'muted')],
        ...[...files.keys()].map((f) => [span(`  ${f}`, 'muted')]),
        [],
        [span(`Comments (${comments.length}):`, 'accent', {bold: true})],
        ...comments.map((c) => [
          span(`  ${c.path}:L${c.line}`, 'comment', {bold: true}),
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
              [span('Feedback on your comments (LLM):', 'llm', {bold: true})],
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
      hint +=
        ' · s start review · e edit comments.md · p ' +
        (opts.post ? 'post' : 'dry-run payload');
    }
    body.content = text;
    status.content = busy
      ? styled(span('working…', 'warn'))
      : styled(span(message, messageTone, {bold: messageTone === 'error'}));
    footer.content = styled(span(hint, 'muted'));
    input.visible = inputPage() && !(state.page === 1 && intentionLocked());
    if (input.visible && !typingOff) {
      input.placeholder =
        state.page === 1 ? 'your intention…' : 'path:line comment';
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
      const g = value.match(/^general:\s*(.+)$/i);
      if (g) {
        const md = await readComments(store.dir);
        const prev = getSection(md, 'General');
        await Bun.write(
          commentsPath(store.dir),
          setSection(md, 'General', prev ? `${prev}\n${g[1]}` : g[1]!),
        );
        say('Added to general comment.');
        input.value = '';
      } else {
        const m = value.match(/^(\S+?):(\d+)\s+(.+)$/);
        const err = m
          ? validateTarget(files, m[1]!, Number(m[2]))
          : 'Use: path:line comment';
        if (err || !m) say(err ?? '', 'error');
        else {
          await appendInline(store.dir, {
            path: m[1]!,
            line: Number(m[2]),
            body: m[3]!,
          });
          say('Added.');
          input.value = '';
        }
      }
    }
    await persist();
    await draw();
  }
  input.on(InputRenderableEvents.ENTER, (v: string): void => void submit(v));

  async function startReview(): Promise<void> {
    const md = await readComments(store.dir);
    const gates = reviewGates(state, parseInline(md));
    if (!gates.ok) {
      say(`Blocked: ${gates.missing.join(', ')}`, 'error');
      return;
    }
    busy = true;
    await draw();
    try {
      state.feedback = await reviewComments(md);
      say('');
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
      .map((c) => validateTarget(files, c.path, c.line))
      .find(Boolean);
    if (bad) {
      say(`Edited comment invalid: ${bad}`, 'error');
      return;
    }
    const reviewer = process.env.REVIEWER || (await ghLogin());
    const model = process.env.MODEL || 'opencode-default';
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
    if (state.page === 3 && !busy) {
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
}
