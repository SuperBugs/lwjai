/**
 * 把正文里每个 `<table>` 包进一层 `<div class="table-scroll">`，让宽表在手机上横向滚。
 *
 * ## 为什么不用 CSS 一行了事
 *
 * 常见的偷懒写法是 `table { display: block; overflow-x: auto }`。它能滚，但 `<table>`
 * 一旦变成 block，里面的 tbody 会被包进一个匿名表格盒，表**失去 width: 100%**：
 * 短表缩成一团靠左，长表照旧。研究稿几乎每篇都是表格为主（结论速览三列、财务表更宽），
 * 两种表都会出现在同一篇里。包一层 div 是通行做法（GitHub、Docusaurus 都这么干），
 * 表本身一个字节不动。
 *
 * ## ★ 列数写在容器上：`--table-cols`
 *
 * 【2026-09-20 实测】只包一层是不够的。中文格子每个字都能断行，浏览器会把一张六列表
 * 压到**一个字一行**也要塞进 375px —— 表永远"放得下"，滚动容器永远不会启动，
 * 而每个格子读起来像竖排。所以插件数一下最宽那一行有几列，写成 `--table-cols`，
 * typography.css 据此给表一个下限（每列 7rem）：三列 21rem 手机放得下、不滚，
 * 六列 42rem 就滚。列数由内容决定，CSS 里写不出来，只能在这里算。
 *
 * ## 位置
 *
 * 挂在 astro.config.ts 的 rehype 链里、**消毒之后**。消毒是白名单，这层加的 div、
 * class 和 style 在它之后才出现，不用进白名单；反过来放在消毒之前，白名单会把它们吃掉，
 * 而页面、构建、闸门三处全绿 —— docs/engineering-notes.md 坑 14 那个形态。
 *
 * ★ 不 import `unist-util-visit`：它不是这个仓库的直接依赖（pnpm 下 import 不到），
 *   自己递归几行就够了。零 import，`scripts/gate/tableScroll.test.ts` 用真实的
 *   markdown 管线测它。
 */

type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

export const TABLE_SCROLL_CLASS = "table-scroll";

const isScrollWrapper = (node: HastNode): boolean =>
  node.type === "element" &&
  node.tagName === "div" &&
  Array.isArray(node.properties?.className) &&
  (node.properties!.className as unknown[]).includes(TABLE_SCROLL_CLASS);

/** 最宽那一行的格子数（th / td 都算），至少 1。 */
export function columnCount(table: HastNode): number {
  let max = 0;
  const walk = (node: HastNode) => {
    if (node.type === "element" && node.tagName === "tr") {
      const cells = (node.children ?? []).filter(
        c => c.type === "element" && (c.tagName === "td" || c.tagName === "th")
      ).length;
      if (cells > max) max = cells;
      return;
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(table);
  return Math.max(1, max);
}

/** 递归；已经包过的不再包（插件跑两遍也不会套两层）。 */
export function wrapTables(node: HastNode): void {
  if (!node.children) return;
  node.children = node.children.map(child => {
    wrapTables(child);
    if (
      child.type === "element" &&
      child.tagName === "table" &&
      !isScrollWrapper(node)
    ) {
      return {
        type: "element",
        tagName: "div",
        properties: {
          className: [TABLE_SCROLL_CLASS],
          style: `--table-cols: ${columnCount(child)}`,
        },
        children: [child],
      };
    }
    return child;
  });
}

export default function rehypeTableScroll() {
  return (tree: HastNode) => {
    wrapTables(tree);
  };
}
