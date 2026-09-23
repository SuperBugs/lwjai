/**
 * 「这篇要不要画目录、画哪几条」—— **全站唯一的判据**。
 *
 * ## 为什么单独拎成一个文件
 *
 * 【2026-09-20 加侧栏时逼出来的】在这之前这段过滤写在 `TableOfContents.astro`
 * 里面，组件自己决定"少于三节就整个不渲染"。侧栏版式一来，**页面也要知道
 * 这个答案**：正文那一格在 xl 以上是个两列网格（左边目录、右边正文），
 * 而没有目录的时候那个网格必须塌回一列。
 *
 * 页面自己再写一遍 `headings.filter(h => h.depth === 2 || h.depth === 3)`
 * 就是同一个判据的第二份拷贝 —— 两边哪天不一致，症状是**左边空着 224px
 * 的一条白带，正文被推到右边**，而组件、页面、构建、测试四处全绿。
 * 这正是 docs/engineering-notes.md 坑 8 那个形态（同一句断言两处、只改一处）。
 *
 * 所以判据只有这里一处：组件画什么读它，页面开不开网格也读它。
 *
 * ## 零 import
 *
 * 刻意**不** `import type { MarkdownHeading } from "astro"`：这个文件要能被
 * `tsx --test` 裸加载（`scripts/gate/toc.test.ts`）。`import type` 虽然会被
 * 擦掉，但下一个人顺手加一条值 import 就炸在 import 阶段，而错误信息
 * 和目录毫无关系。结构类型写在这里，反正只用三个字段。
 */

/** `render()` 吐的 headings 里我们用得上的那几格。 */
export type TocHeading = {
  depth: number;
  slug: string;
  text: string;
};

/**
 * 少于这个数就不画目录。
 *
 * 两节的目录比没有目录更碍事：它占一块地方，却没告诉读者任何他扫一眼正文
 * 看不出来的事。**这是"完成态"，不是"空状态"** —— 所以不渲染，也不摆一句
 * 「这篇太短没有目录」。
 */
export const TOC_MIN_COUNT = 3;

/**
 * 目录里该出现的条目。够不上 `minCount` 时返回**空数组**。
 *
 * ★ 返回空数组而不是 `null`：调用方写 `tocItems(h).length > 0`，
 *   比 `!= null` 少一种判错的写法。
 *
 * 只取 h2 / h3：h4 以下在这个站的稿子里是表格小标题那一类，进目录会把
 * 十来行撑成三十行。h1 是文章标题本身，它不在正文里。
 */
export function tocItems<T extends TocHeading>(
  headings: readonly T[] | undefined,
  minCount: number = TOC_MIN_COUNT
): T[] {
  const items = (headings ?? []).filter(h => h.depth === 2 || h.depth === 3);
  return items.length >= minCount ? items : [];
}
