import {
  BoxRenderable,
  ScrollBoxRenderable,
  TextRenderable,
  type RenderContext,
  type ScrollUnit,
} from '@opentui/core';

/** One page's scroll region and the text inside it. */
export interface PageView {
  /** The page's own scroll region; keeps its own offset while hidden. */
  readonly scroll: ScrollBoxRenderable;
  /** The page's content, as long as the page needs and no longer. */
  readonly text: TextRenderable;
}

/**
 * The page body area: a box that fills the space between the fixed tab bar
 * and the input, holding one scroll region per page. Only the current page's
 * region is visible, so a page scrolls independently of every other page and
 * a short page is never padded to a long page's height.
 */
export class Pager {
  /** Add this to the layout where the page body goes. */
  readonly view: BoxRenderable;
  private readonly pages: PageView[];
  private current = 0;

  /**
   * @param ctx The renderer.
   * @param count Number of pages.
   * @param stickyBottom Pages that follow their newest line (e.g. a chat).
   */
  constructor(
    ctx: RenderContext,
    count: number,
    stickyBottom: readonly number[] = [],
  ) {
    this.view = new BoxRenderable(ctx, {
      flexDirection: 'column',
      flexGrow: 1,
      flexShrink: 1,
      minHeight: 0,
    });
    this.pages = Array.from({length: count}, (_, i) => {
      const sticky = stickyBottom.includes(i);
      const scroll = new ScrollBoxRenderable(ctx, {
        flexGrow: 1,
        flexShrink: 1,
        minHeight: 0,
        scrollY: true,
        scrollX: false,
        visible: i === 0,
        ...(sticky ? {stickyScroll: true, stickyStart: 'bottom' as const} : {}),
      });
      const text = new TextRenderable(ctx, {content: '', flexShrink: 0});
      scroll.add(text);
      this.view.add(scroll);
      return {scroll, text};
    });
  }

  /** Shows page `index` and hides the others; each keeps its own offset. */
  show(index: number): void {
    this.current = index;
    this.pages.forEach((p, i) => {
      p.scroll.visible = i === index;
    });
  }

  /** The page currently shown. */
  get active(): PageView {
    return this.pages[this.current]!;
  }

  /** Page `index`'s views. */
  page(index: number): PageView {
    return this.pages[index]!;
  }

  /** Scrolls the current page by `delta` `unit`s (negative is up). */
  scrollBy(delta: number, unit: ScrollUnit = 'absolute'): void {
    this.active.scroll.scrollBy(delta, unit);
  }

  /** Scrolls the current page to its newest (last) line. */
  scrollToEnd(): void {
    this.active.scroll.scrollTo(Number.MAX_SAFE_INTEGER);
  }
}
