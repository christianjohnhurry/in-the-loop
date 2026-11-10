import {afterEach, expect, test} from 'bun:test';
import {BoxRenderable, TextRenderable} from '@opentui/core';
import {
  createTestRenderer,
  type TestRendererSetup,
} from '@opentui/core/testing';
import {Pager} from '../src/pager';

let setup: TestRendererSetup | undefined;

afterEach(async () => {
  await setup?.dispose();
  setup = undefined;
});

/** Rows `prefix 1` .. `prefix n`, one per line. */
function rows(prefix: string, n: number): string {
  return Array.from({length: n}, (_, i) => `${prefix} ${i + 1}`).join('\n');
}

/** A 10-row screen: a fixed tab bar line, the pager, then a footer line. */
async function layout(): Promise<{pager: Pager; s: TestRendererSetup}> {
  const s = await createTestRenderer({width: 40, height: 10});
  setup = s;
  const root = new BoxRenderable(s.renderer, {
    flexDirection: 'column',
    width: '100%',
    height: '100%',
  });
  const tabs = new TextRenderable(s.renderer, {
    content: 'TABS',
    flexShrink: 0,
  });
  const pager = new Pager(s.renderer, 3, [1]);
  const footer = new TextRenderable(s.renderer, {
    content: 'FOOTER',
    flexShrink: 0,
  });
  for (const r of [tabs, pager.view, footer]) root.add(r);
  s.renderer.root.add(root);
  return {pager, s};
}

test('tab bar stays visible while a long page is scrolled to the end', async () => {
  const {pager, s} = await layout();
  pager.page(1).text.content = rows('chat', 100);
  pager.show(1);
  await s.renderOnce();
  pager.scrollToEnd();
  await s.renderOnce();
  await s.renderOnce();
  const frame = s.captureCharFrame();
  expect(frame).toContain('TABS');
  expect(frame).toContain('FOOTER');
  expect(frame).toContain('chat 100');
  expect(frame).not.toContain('chat 1\n');
});

test('a short page opens at its own top, not at the long page offset', async () => {
  const {pager, s} = await layout();
  pager.page(1).text.content = rows('chat', 100);
  pager.page(0).text.content = rows('item', 3);
  pager.show(1);
  await s.renderOnce();
  pager.scrollToEnd();
  await s.renderOnce();
  pager.show(0);
  await s.renderOnce();
  await s.renderOnce();
  const frame = s.captureCharFrame();
  expect(frame).toContain('item 1');
  expect(frame).toContain('item 3');
  expect(frame).not.toContain('chat');
  expect(pager.page(0).scroll.scrollTop).toBe(0);
});

test('each page remembers its own scroll position', async () => {
  const {pager, s} = await layout();
  pager.page(0).text.content = rows('a', 50);
  pager.page(2).text.content = rows('c', 50);
  pager.show(0);
  await s.renderOnce();
  pager.scrollBy(10);
  await s.renderOnce();
  const before = pager.page(0).scroll.scrollTop;
  expect(before).toBeGreaterThan(0);
  pager.show(2);
  await s.renderOnce();
  expect(pager.page(2).scroll.scrollTop).toBe(0);
  pager.show(0);
  await s.renderOnce();
  expect(pager.page(0).scroll.scrollTop).toBe(before);
});

test('a sticky page follows new lines when at the end', async () => {
  const {pager, s} = await layout();
  pager.show(1);
  pager.page(1).text.content = rows('chat', 30);
  await s.renderOnce();
  pager.scrollToEnd();
  await s.renderOnce();
  pager.page(1).text.content = rows('chat', 40);
  await s.renderOnce();
  await s.renderOnce();
  expect(s.captureCharFrame()).toContain('chat 40');
});
