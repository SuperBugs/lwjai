/**
 * 目录（`src/components/TableOfContents.astro` + `src/utils/tocItems.ts`）的测试。
 *
 * 【2026-09-20 加侧栏时写的】这一组钉的是**两种零症状的坏法**，不是"目录能不能画"：
 *
 *   1. 判据被抄成两份 —— 页面自己再 `filter` 一遍 headings 来决定开不开网格。
 *      两边哪天不一致，症状是大屏上左边空着一条 13rem 的白带，正文被推到右边，
 *      而组件、页面、构建四处全绿。
 *   2. 窄屏那份折叠块漏了 `xl:hidden` —— 大屏上目录**出现两遍**，
 *      一份在正文上面、一份在左边侧栏。同样不报错。
 *
 * ⚠ B 组是 grep 源码，钉的是**拼写，不是行为**（和 share.test.ts / detailParity.test.ts
 *   同一个性质）：能抓住"复制粘贴时把类名抄丢了"，抓不住"挂上了但 sticky 是死的"。
 *   先剥注释再 grep —— 页面注释里逐字写着 `xl:hidden` 为什么不许去掉，
 *   不剥的话把真类名删掉、注释留着，用例照样绿（share.test.ts 为这个形态被咬过一次）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TOC_MIN_COUNT, tocItems } from "../../src/utils/tocItems";
import { CONTENT_COLLECTIONS } from "../../src/config/collections";
import zhCN from "../../src/i18n/lang/zh-CN";
import en from "../../src/i18n/lang/en";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

/**
 * 侧栏那一档挂在**每一个有详情路由的集合**上。
 *
 * 【2026-09-21】原来这里是写死的两条（posts / qa），因为侧栏先只做了那两页；
 * 教程和提示词当天补齐之后改成从登记表推 —— 用户要的就是"四页一致"，
 * 而写死一张名单意味着**加第五个集合时这一组不会红**：那一页悄悄没有侧栏，
 * 构建全绿、别的页面照常，只有那一页的读者看得见（`detailParity.test.ts`
 * 为同一个形态存在）。
 *
 * 真要有哪一页不该有侧栏，就在这儿显式减掉并写明理由 —— 那时它是一个决定，
 * 不是一次遗漏。
 */
const RAIL_PAGES = CONTENT_COLLECTIONS.filter(c => c.urlPrefix !== null).map(
  c => `src/pages/${c.urlPrefix}/[...slug]/index.astro`
);

const h = (depth: number, n: number) => ({
  depth,
  slug: `s${n}`,
  text: `第 ${n} 节`,
});

// ── A. 判据本身 ────────────────────────────────────────────────────────────

test("A · 够不上 minCount 就是空数组，而不是一条短目录", () => {
  const two = [h(2, 1), h(2, 2)];
  assert.deepEqual(
    tocItems(two),
    [],
    "两节也画了目录 —— 两节的目录比没有目录更碍事，而且页面靠 length 判断开不开网格"
  );
  assert.equal(tocItems([h(2, 1), h(2, 2), h(3, 3)]).length, 3);
});

test("A · 只收 h2 / h3", () => {
  const mixed = [h(1, 1), h(2, 2), h(3, 3), h(4, 4), h(2, 5)];
  assert.deepEqual(
    tocItems(mixed, 1).map(x => x.depth),
    [2, 3, 2],
    "h1（文章标题）或 h4（这个站里是表格小标题那一类）混进了目录"
  );
});

test("A · headings 为空 / undefined 不许抛 —— 短回答走的就是这条路", () => {
  assert.deepEqual(tocItems([]), []);
  assert.deepEqual(tocItems(undefined), []);
});

test("A · minCount 有默认值，页面和组件不许各填各的", () => {
  // 组件的 Props 默认值转交的就是这个常量；页面一个字都不填。
  assert.equal(TOC_MIN_COUNT, 3);
  assert.deepEqual(tocItems([h(2, 1), h(2, 2)], TOC_MIN_COUNT), []);
});

// ── B. 两页的接线 ──────────────────────────────────────────────────────────

test("B · 开不开网格必须读 tocItems()，不许在页面里再 filter 一遍 headings", () => {
  for (const p of RAIL_PAGES) {
    const src = stripComments(read(p));
    assert.match(
      src,
      /tocItems\(headings\)\.length > 0/,
      `${p} 没有用 tocItems() 算 hasToc。\n` +
        `  在这儿另写一份 headings.filter(...) 就是同一个判据的第二份拷贝 ——\n` +
        `  两边不一致的症状是大屏上左边空着 13rem 的白带，而四处全绿。`
    );
    assert.ok(
      !/headings\.filter\(/.test(src),
      `${p} 里自己 filter 了 headings —— 判据只许在 src/utils/tocItems.ts 一处。`
    );
    assert.match(
      src,
      /hasToc &&\s*"xl:grid/,
      `${p} 的两列网格没跟着 hasToc 走 —— 没有目录的那几篇会空出左边一整条。`
    );
  }
});

test("B · 网格那一列是 minmax(0,1fr)，不许写成 1fr", () => {
  for (const p of RAIL_PAGES) {
    const src = stripComments(read(p));
    assert.match(
      src,
      /xl:grid-cols-\[13rem_minmax\(0,1fr\)\]/,
      `${p} 的正文列不是 minmax(0,1fr)。\n` +
        `  \`1fr\` = \`minmax(auto,1fr)\`，下限是内容的最小宽度 —— 这个站几乎每篇\n` +
        `  研究稿都有宽表格，那一列会被表格顶宽，整个网格撑破版心、侧栏被挤没。`
    );
  }
});

test("B · 窄屏那份折叠块必须带 xl:hidden —— 否则大屏上目录出现两遍", () => {
  for (const p of RAIL_PAGES) {
    const src = stripComments(read(p));
    const mounts = [...src.matchAll(/<TableOfContents\b[^>]*>/g)].map(m => m[0]);
    assert.equal(
      mounts.length,
      2,
      `${p} 上 TableOfContents 不是两份（折叠块 + 侧栏），而是 ${mounts.length} 份`
    );
    const rail = mounts.find(m => /variant="rail"/.test(m));
    const inline = mounts.find(m => !/variant="rail"/.test(m));
    assert.ok(rail, `${p} 没挂侧栏那一份（variant="rail"）`);
    assert.match(
      inline ?? "",
      /xl:hidden/,
      `${p} 的折叠块那一份少了 xl:hidden —— xl 以上目录会出现两遍：\n` +
        `  一份在正文上面、一份在左边侧栏。页面不报错、构建全绿。`
    );
  }
});

test("B · 侧栏的 sticky 三件套一件都不许少", () => {
  const src = stripComments(read("src/components/TableOfContents.astro"));
  for (const [cls, why] of [
    ["xl:sticky", "不钉住就只是一条跟着正文滚走的列表"],
    [
      "xl:self-start",
      "网格默认 align-items:stretch，被拉满整行高之后 sticky 没有可移动的余量，看起来就是"
        + "「sticky 没生效」",
    ],
    ["xl:overflow-y-auto", "17 节的目录比一屏高，不让它自己滚的话底下几节永远够不着"],
  ] as const) {
    assert.ok(
      src.includes(cls),
      `TableOfContents 的侧栏少了 ${cls} —— ${why}。`
    );
  }
  // calc 里的 `+` / `-` 两侧必须是下划线（Tailwind 还原成空格）。写成裸的
  // `calc(var(--header-h)+1.5rem)` 那条 utility 根本生成不出来，侧栏退回
  // top:auto —— 它照样钉住，只是钉在页眉底下半截，而构建全绿。
  assert.match(
    src,
    /xl:top-\[calc\(var\(--header-h\)_\+_1\.5rem\)\]/,
    "侧栏的 top 里 calc 没用下划线写空格 —— 那条 utility 生成不出来，目录会被页眉盖住"
  );
});

test("B · 高亮不许读 --header-h：它的值是 5rem，parseFloat 出来是 5", () => {
  const src = stripComments(read("src/components/TableOfContents.astro"));
  assert.ok(
    !/getPropertyValue\(\s*["']--header-h/.test(src),
    "脚本又去读 --header-h 了。theme.css 里它是 `5rem`，parseFloat 得到 5，\n" +
      "  当像素用就是把判定线画在离顶 5px 处 —— 高亮总是超前一整节，\n" +
      "  而且看起来像「判据差了一点点」，不像坏了。量 <header> 的实际高度没有单位这回事。"
  );
  assert.match(
    src,
    /querySelector\("header"\)/,
    "脚本没有量真正那个 <header> 的高度"
  );
});

test("B · 侧栏脚本挂了 astro:page-load", () => {
  const src = stripComments(read("src/components/TableOfContents.astro"));
  assert.match(
    src,
    /astro:page-load/,
    "ClientRouter 按脚本内容去重，站内跳到第二篇文章时这段不会再执行，而 DOM 已经换了一批 —— " +
      "高亮会停在上一篇的章节上。问答页「换一条回答」是同一个页面里换正文，同一条理由。"
  );
});

test("B · 侧栏带着 data-pagefind-ignore 和 data-print-hide", () => {
  const src = stripComments(read("src/components/TableOfContents.astro"));
  const nav = /<nav[\s\S]*?>/.exec(src)?.[0] ?? "";
  assert.match(
    nav,
    /data-pagefind-ignore/,
    "侧栏没带 data-pagefind-ignore —— 目录文字是标题的复制，进索引会把每个标题数两遍"
  );
  assert.match(
    nav,
    /data-print-hide/,
    "侧栏没带 data-print-hide —— 打印出来纸上会多一栏点不动的目录"
  );
});

// ── C. 折叠（【2026-09-21 用户要的】两个档都能收起来）──────────────────────
//
// 窄屏那份本来就是 `<details open>`，点标题就收；这一组钉的全是**侧栏那一档**。
// 每一条对着一种"按钮在，功能不在"的坏法 —— 它们的共同点是**点下去不报错**：
//
//   ① 列没跟着收 → 目录没了、正文原地不动、左边空着 13rem，像按钮坏了
//   ② 状态贴晚了 → 首屏先画一份展开的再收回去，整篇正文横着跳一下
//   ③ 判据抄成两份 → 按钮说收起了、页面说没有（theme.ts 顶上那段的复刻）
//   ④ 换页自己展开 → ClientRouter 把根元素的属性从新文档抄了一遍
//   ⑤ 回调写成闭包 → 首屏 `astro:page-load` 也触发一次，一次点击切两下 = 没反应
//   ⑥ 连按钮也一起藏 → 收起来之后回不去，而这是唯一的入口

const tocSrc = () => stripComments(read("src/components/TableOfContents.astro"));

/**
 * 侧栏那段 markup（`<nav …>` 到 `</nav>`）。
 *
 * ⚠ 下面那条**必须在这一段里**找按钮，不能在整份源码里 grep `data-toc-toggle` ——
 *   那个串在样式表和脚本里各还有一处，把按钮整个删掉用例照样绿（写这一组时实测）。
 */
const railMarkup = (src: string) => {
  const from = src.indexOf("<nav");
  const to = src.indexOf("</nav>", from);
  return from >= 0 && to > from ? src.slice(from, to) : "";
};

test("C · 侧栏有折叠入口，按钮和列表是同一对（aria-controls ↔ id）", () => {
  const markup = railMarkup(tocSrc());
  assert.match(
    markup,
    /<button[\s\S]*?data-toc-toggle/,
    "侧栏的 markup 里没有折叠钮 —— 用户要的就是这个，而少了它页面照常渲染、构建全绿"
  );
  const id = /aria-controls="([^"]+)"/.exec(markup)?.[1];
  assert.ok(id, "折叠钮没有 aria-controls：读屏软件不知道它管的是哪一块");
  assert.ok(
    markup.includes(`id="${id}"`),
    `aria-controls 指着 ${id}，而侧栏里没有这个 id —— 这种错只有读屏软件的用户撞得到`
  );
});

test("C · 收起态藏的是列表，不许把按钮本身也藏掉", () => {
  const src = tocSrc();
  assert.match(
    src,
    /\[data-toc-list\][\s\S]{0,200}?\{\s*display:\s*none/,
    "收起之后目录列表还在 —— 那就不叫收起"
  );
  assert.ok(
    !/\[data-toc-toggle\][^{]*\{\s*display:\s*none/.test(src),
    "收起态把折叠钮本身也藏了：读者收起来之后**没有任何入口**能把它拿回来，\n" +
      "  而屏幕上不会有任何东西看起来是错的（docs/engineering-notes.md 第二节「入口不许静默消失」）。"
  );
});

test("C · 收起之后左边那一列必须跟着收", () => {
  const src = tocSrc();
  assert.match(
    src,
    /\[data-toc-collapsed\][^{]*:has\(>\s*\[data-toc-rail\]\)[^{]*\{[^}]*grid-template-columns/,
    "收起态没有改网格的列宽。症状：读者按下按钮，目录没了、正文原地不动、\n" +
      "  左边空出 13rem 的白带 —— 和「这个按钮坏了」在屏幕上长得一模一样。\n" +
      "  （和 tocItems.ts 顶上那段「没有目录时网格要塌回一列」是同一个失败形态。）"
  );
});

test("C · 折叠状态在目录进 DOM 之前就贴好：is:inline，且排在 <nav> 前面", () => {
  const state = stripComments(read("src/components/TocRailState.astro"));
  assert.match(
    state,
    /^\s*<script is:inline>/m,
    "贴状态那段不是**顶层的** `is:inline` 了。打包出来的模块脚本是 defer 的，\n" +
      "  首屏会先画一份展开的目录再收回去：不是闪一下颜色，是整篇正文横着跳一下。\n" +
      "  （它单独一个文件是因为 prettier 的 Astro 解析器读不了表达式里的 <script>，\n" +
      "  理由写在那一份的头上 —— 别把它塞回 TableOfContents 的那个三元表达式里。）"
  );

  const src = tocSrc();
  const mount = src.indexOf("<TocRailState />");
  const rail = src.indexOf("data-toc-rail");
  assert.ok(mount >= 0, "侧栏那一档没有渲染 <TocRailState />：状态没人贴，刷新就回到展开");
  assert.ok(
    rail >= 0 && mount < rail,
    "<TocRailState /> 跑到 <nav> 后面去了 —— 目录那时已经进 DOM 并且画出来了"
  );
});

test("C · 存在哪儿只有一处知道：TableOfContents 自己不许碰 localStorage", () => {
  assert.ok(
    stripComments(read("src/components/TocRailState.astro")).includes(
      "localStorage"
    ),
    "连 TocRailState 都不存了 —— 读者的选择跨不过一次刷新"
  );
  assert.ok(
    !tocSrc().includes("localStorage"),
    "TableOfContents 自己又读了一次 localStorage：判据从此有两份。\n" +
      "  这正是 theme.ts 顶上记着的那件事（默认值写在三处，改一处就是页面\n" +
      "  先闪一个颜色再跳成另一个）—— 这里漂开的症状是按钮和页面各说各的。"
  );
});

test("C · 站内跳到下一篇时目录不许自己展开", () => {
  assert.match(
    stripComments(read("src/components/TocRailState.astro")),
    /astro:after-swap/,
    "ClientRouter 换页时**根元素的属性是从新文档抄过来的**（theme.ts 为同一件事\n" +
      "  也挂着这个监听）。不重贴的话，读者收起来的目录会在跳到下一篇时自己展开。"
  );
});

test("C · 点击回调是模块作用域那个函数，不是每次 bind 新造的闭包", () => {
  const src = tocSrc();
  assert.match(
    src,
    /function onTocToggle\(/,
    "点击回调不是一个模块作用域的具名函数了"
  );
  assert.match(
    src,
    /addEventListener\("click",\s*onTocToggle\)/,
    "`astro:page-load` **首屏也会触发一次**，而下面又直接调了一次 bind：\n" +
      "  回调是闭包的话同一个按钮会挂上两个监听，一次点击切两下 = 什么都没发生。\n" +
      "  同一个函数引用时 addEventListener 自己会去重 —— 这是唯一零报错的写法。"
  );
});

test("C · 按钮的初值写的是展开那一档，两句文案从 i18n 带给脚本", () => {
  const src = tocSrc();
  assert.match(
    src,
    /aria-expanded="true"/,
    "markup 里的初值不是展开那一档 —— 没有 JS 的读者看到的就是这一档，\n" +
      "  而目录确实是展开的（BackToTopButton 顶上记着初值和脚本对不上的下场）。"
  );
  for (const attr of ["data-label-collapse", "data-label-expand"]) {
    assert.match(
      src,
      new RegExp(`${attr}=\\{t\\.toc\\.`),
      `${attr} 不是从 i18n 带过来的 —— 客户端脚本里拿不到 Astro.currentLocale，` +
        `在脚本里写死中文就是第二份文案。`
    );
  }
});

test("C · 收起 / 展开两句话都不许留空，也不许是同一句", () => {
  for (const [name, pack] of [
    ["zh-CN", zhCN],
    ["en", en],
  ] as const) {
    assert.ok(
      pack.toc.collapse.trim() && pack.toc.expand.trim(),
      `${name} 的 toc.collapse / toc.expand 有一句是空的 —— 收起之后按钮上只剩\n` +
        `  一个图标，这两句是它唯一说得出自己是谁的地方（读屏念到的是「按钮」）。`
    );
    assert.notEqual(
      pack.toc.collapse,
      pack.toc.expand,
      `${name} 的两档是同一句话：读者按下去之前不知道会发生什么`
    );
  }
});
