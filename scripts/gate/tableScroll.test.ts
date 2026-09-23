/**
 * 宽表包一层横向滚动容器（`src/utils/rehypeTableScroll.ts`）的测试。
 *
 * 用的是和 sanitize.test.ts 同一套真实 markdown 管线：消毒 → callouts → 本插件。
 * 钉两件事：表确实被包了（否则手机上宽表被压成一格一个字，而构建全绿）；
 * 插件排在消毒**之后**，class 才活得下来（排在之前会被白名单吃掉，同样全绿）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import rehypeSanitize from "rehype-sanitize";
import rehypeCallouts from "rehype-callouts";
import { MARKDOWN_SANITIZE_SCHEMA } from "../../src/config/sanitize";
import rehypeTableScroll, {
  columnCount,
  TABLE_SCROLL_CLASS,
  wrapTables,
} from "../../src/utils/rehypeTableScroll";

const processor = await createMarkdownProcessor({
  smartypants: false,
  rehypePlugins: [
    [rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA],
    rehypeCallouts,
    rehypeTableScroll,
  ],
});
const render = async (md: string) => (await processor.render(md)).code;

// 研究提示词第一节的真实形状：三列、表头、对齐标记。
const TABLE_MD = [
  "## 一、结论速览",
  "",
  "| 项目 | 研究判断 | 决定性依据或缺口 |",
  "| :-- | :-- | :-- |",
  "| 公司与证券 | 样例单元格 | 核心收入来源 |",
  "",
  "样例段落。",
].join("\n");

test("表格被包进 div.table-scroll 并带上列数，表本身原样", async () => {
  const html = await render(TABLE_MD);
  // 注意 \s*：rehypeRaw 重新解析时会把表格内部的换行文本节点「寄养」到表格前面（HTML 解析算法的
  // foster parenting），它们落在 div 里、table 前，渲染上是空白、没有影响。
  // ★ 列数必须写在容器上：没有它，CSS 给不了"每列至少 7rem"的下限，
  //   中文六列表在 375px 上会被压成一个字一行而永远不滚（2026-09-20 实测过）。
  assert.match(
    html,
    new RegExp(
      `<div class="${TABLE_SCROLL_CLASS}" style="--table-cols: 3">\\s*<table>`
    )
  );
  assert.match(html, /<\/table><\/div>/);
  assert.match(html, /<th align="left">项目<\/th>/, "表头和对齐标记不许被动");
});

test("列数按最宽的那一行数：表头两列、某一行三格 → 3；空表算 1", () => {
  const cell = (tag: string) => ({ type: "element", tagName: tag, children: [] });
  const row = (n: number, tag = "td") => ({
    type: "element",
    tagName: "tr",
    children: Array.from({ length: n }, () => cell(tag)),
  });
  const table = {
    type: "element",
    tagName: "table",
    children: [
      { type: "element", tagName: "thead", children: [row(2, "th")] },
      { type: "element", tagName: "tbody", children: [row(2), row(3), row(1)] },
    ],
  };
  assert.equal(columnCount(table), 3);
  assert.equal(
    columnCount({ type: "element", tagName: "table", children: [] }),
    1,
    "空表至少算 1 列，别让 calc() 里出现 0"
  );
});

test("一篇里两张表各包各的，段落不受影响", async () => {
  const html = await render(`${TABLE_MD}\n\n${TABLE_MD.replace("一、", "二、")}`);
  assert.equal(
    (html.match(new RegExp(`class="${TABLE_SCROLL_CLASS}"`, "g")) ?? []).length,
    2
  );
  assert.match(html, /<p>样例段落。<\/p>/);
});

test("没有表格的正文一个字节都不变", async () => {
  const md = "## 小标题\n\n一段正文。\n";
  const plain = await createMarkdownProcessor({
    smartypants: false,
    rehypePlugins: [[rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA], rehypeCallouts],
  });
  assert.equal(await render(md), (await plain.render(md)).code);
});

test("wrapTables 是幂等的：跑两遍不会套两层", () => {
  // 显式标类型：`children: []` 会被推断成 never[]，下面取 tagName 时 astro check 会红。
  type Node = { type: string; tagName?: string; children?: Node[] };
  const tree: Node = {
    type: "root",
    children: [{ type: "element", tagName: "table", children: [] }],
  };
  wrapTables(tree);
  wrapTables(tree);
  const wrapper = tree.children![0]!;
  assert.equal(wrapper.tagName, "div");
  assert.equal(wrapper.children![0]!.tagName, "table", "套了两层 div");
});
