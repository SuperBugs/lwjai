/**
 * 后台两个选择器（【2026-09-23 用户要的】）：
 *   ①「这一条是…」那个下拉换成**搜索 + 分页**的面板（`src/dev/keystaticGroupPicker.ts`）；
 *   ②「标的」那一格加**搜索框 + 滚动框**（`src/dev/keystaticSymbolPicker.ts`）。
 * 判据全在 `src/dev/pickerPlan.ts`，这里钉的是那一份，外加几条**接线**。
 *
 * ## 为什么要钉
 *
 * 这两个东西坏了的样子**全是零症状**：
 *   - 搜索的规矩差一点（全角半角、大小写、只搜那行字不搜公司名）→ 屏幕上是
 *     「没有匹配」，而那一组明明就在；人会以为这条没归过组，然后新建一个选题；
 *   - 键盘 / 翻页算错一格 → 高亮的那一行不在这一页上，按 Enter 选中一个看不见的东西；
 *   - 搜索框没从 modTime 的指纹里排掉 → 打开一条老稿子、搜一下票，更新时间就被盖成此刻；
 *   - 自己的药丸用了勾选框 → groupFill 数勾选框个数认"哪一格是标的"，数成 2N、认不出，
 *     选了「补一份研究」之后标的**静默不跟着带过来**。
 *
 * 用例喂的是**后台真会给的东西**：隐藏 `<select>` 的选项是 2026-09-23 在浏览器里量出来的
 * 那个形状（头上有一个 react-aria 垫的空白占位项），标的名字来自真的标的表。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clampPage,
  cursorForQuery,
  filterGroups,
  formCollection,
  GROUP_PAGE_SIZE,
  groupEmptyText,
  groupPagerText,
  groupSearchIndex,
  matchesQuery,
  moveCursor,
  nextVisible,
  openCursor,
  pageCountOf,
  pageSlice,
  queryTerms,
  searchKey,
  splitGroupChoices,
  symbolChoices,
  symbolEmptyText,
  symbolSummary,
  type ChoiceOption,
} from "../../src/dev/pickerPlan";
import { countsAsContent, OWN_UI_ATTR } from "../../src/dev/ownUi";
import { SYMBOLS, symbolOptionLabel } from "../../src/config/symbols";
import { SYMBOL_PICKER_CSS } from "../../src/dev/keystaticSymbolPicker";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * 先把注释去掉再对账 —— 注释掉的那一行照样 `includes` 得到（keystaticForm.test.ts 同一个做法）。
 * ⚠ 这个朴素版本会把**字符串里的 `/*`** 当成块注释开头（docs/engineering-notes.md 记过：`*.md` 那种 glob）。
 *   下面用到它的几个文件里没有那种字符串 —— 加断言之前先确认一眼。
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** 一串组：g1 最新 … g20 最老（groupScan 排好的顺序，这里不再排）。 */
const groups = (n: number): ChoiceOption[] =>
  Array.from({ length: n }, (_, i) => ({
    value: String(1000 + i),
    label: `② 补一份研究：T${i + 1}（09-${String(23 - (i % 20)).padStart(2, "0")}）`,
  }));

// ── A. 搜索的规矩 ─────────────────────────────────────────────────────

test("A · 全角半角、大小写怎么混着敲都对得上（两边同一个 NFKC）", () => {
  const label = "② 补一份研究：MU（09-23）";
  for (const q of ["mu", "MU", "ｍｕ", "ＭＵ", "（09", "(09", "09-23", "研究：mu"]) {
    assert.equal(matchesQuery(label, q), true, `「${q}」该命中「${label}」`);
  }
  assert.equal(matchesQuery(label, "09-22"), false);
});

test("A · 空格隔开的几段**都得命中**；空搜索词 = 不筛", () => {
  const hay = "② 补一份研究：MU（09-23） 1036 MU 美光科技 Micron Technology";
  assert.equal(matchesQuery(hay, "mu 美光"), true);
  assert.equal(matchesQuery(hay, "micron 09-23"), true);
  assert.equal(matchesQuery(hay, "mu 甲骨文"), false, "一段不中就整条不中");
  assert.equal(matchesQuery(hay, ""), true);
  assert.equal(matchesQuery(hay, "   "), true, "只有空白也是空搜索词");
  assert.deepEqual(queryTerms("  Mu　 美光 "), ["mu", "美光"], "全角空格也是分隔");
});

test("A · ①②会被 NFKC 折成数字 —— 两边一起折，所以不影响匹配（只是别拿 searchKey 做显示）", () => {
  assert.equal(searchKey("② 补一份研究"), "2 补一份研究");
  assert.equal(matchesQuery("② 补一份研究：ZM", "②"), true);
});

// ── B. 那个隐藏 <select> 的选项怎么拆 ─────────────────────────────────

test("B · 浏览器里量出来的形状：空白占位项扔掉、有字的空串是「新选题」、其余原序", () => {
  const measured: ChoiceOption[] = [
    { value: "", label: " " }, // react-aria HiddenSelect 自己垫的
    { value: "", label: "① 这是一个新选题" },
    { value: "1036", label: "② 补一份研究：MU（09-23）" },
    { value: "1034", label: "② 补一份研究：SECZ（09-22）" },
  ];
  const { fresh, groups: gs } = splitGroupChoices(measured);
  assert.deepEqual(fresh, { value: "", label: "① 这是一个新选题" });
  assert.deepEqual(
    gs.map(g => g.value),
    ["1036", "1034"],
    "顺序是 groupScan 排好的（新的在前），这里不许再排"
  );
});

test("B · 认「新选题」靠有字、不靠位置 —— 上游哪天不垫占位项了也认得出", () => {
  const { fresh } = splitGroupChoices([
    { value: "", label: "① 这是一个新问题" },
    { value: "1003", label: "② 补一个回答：…" },
  ]);
  assert.equal(fresh?.label, "① 这是一个新问题");
  assert.equal(splitGroupChoices([{ value: "", label: "  " }]).fresh, null);
});

// ── C. 除了那行字，还能搜到什么 ───────────────────────────────────────

test("C · 标题就是代码的那一组，敲公司名（中文 / 英文）也找得到 —— 名字从真的标的表查", () => {
  const index = groupSearchIndex([
    { key: "1036", carryList: { symbols: ["MU"] } },
    { key: "1028", carryList: { symbols: ["HOOD"] } },
  ]);
  const opts: ChoiceOption[] = [
    { value: "1036", label: "② 补一份研究：MU（09-23）" },
    { value: "1028", label: "② 补一个回答：加密货币相关标的最近都在涨，是什么原因？（09-22）" },
  ];
  assert.deepEqual(filterGroups(opts, index, "美光").map(g => g.value), ["1036"]);
  assert.deepEqual(filterGroups(opts, index, "micron").map(g => g.value), ["1036"]);
  assert.deepEqual(
    filterGroups(opts, index, "robinhood").map(g => g.value),
    ["1028"],
    "问答的标题里根本没有 HOOD / Robinhood，只能靠这份索引"
  );
  assert.deepEqual(
    filterGroups(opts, index, "1036").map(g => g.value),
    ["1036"],
    "组的号（后台列表里那一列）也要搜得到"
  );
});

test("C · ★ 索引的键 = 全部的组，没勾标的那一组也得在（值是空串，不是缺键）", () => {
  const index = groupSearchIndex([
    { key: "1022", carryList: { symbols: [] } },
    { key: "1003", carryList: {} },
    { key: "1032", carryList: { symbols: ["GRML"] } },
  ]);
  // 面板拿这份键去认那个隐藏 <select>（选项集合正好等于它）—— 少一个键就认不出来。
  assert.deepEqual(Object.keys(index).sort(), ["1003", "1022", "1032"]);
  assert.equal(index["1022"], "1022");
  assert.match(index["1032"]!, /GRML.*格陵兰矿业.*Greenland Mines/);
});

test("C · 标的表里查不到的代码：只有代码，不编名字", () => {
  const index = groupSearchIndex([{ key: "9", carryList: { symbols: ["ZZZZ"] } }]);
  assert.equal(index["9"], "9 ZZZZ");
});

// ── D. 翻页和键盘 ─────────────────────────────────────────────────────

test("D · 页数至少是 1；页码夹在范围里", () => {
  assert.equal(pageCountOf(0), 1, "零组也是「第 1 / 1 页」");
  assert.equal(pageCountOf(GROUP_PAGE_SIZE), 1);
  assert.equal(pageCountOf(GROUP_PAGE_SIZE + 1), 2);
  assert.equal(clampPage(-3, 20), 0);
  assert.equal(clampPage(99, 20), pageCountOf(20) - 1);
});

test("D · 打开时停在**当前选中的那一组**上，页码跟着它走", () => {
  const gs = groups(20);
  assert.deepEqual(openCursor(gs, "1011"), { active: 12, page: 1 }, "第 12 组在第 2 页");
  assert.deepEqual(openCursor(gs, "1000"), { active: 1, page: 0 });
  assert.deepEqual(openCursor(gs, ""), { active: 0, page: 0 }, "新选题 → 第 1 页、停在顶上那一项");
  assert.deepEqual(openCursor(gs, "gone"), { active: 0, page: 0 }, "找不到当成新选题，不许抛");
});

test("D · 搜索词变了：停在第一个命中；没命中是 -1（Enter 什么都不做）；清空回到顶上", () => {
  assert.deepEqual(cursorForQuery("mu", 3), { active: 1, page: 0 });
  assert.deepEqual(
    cursorForQuery("zzz", 0),
    { active: -1, page: 0 },
    "不许停在「新选题」上 —— 它永远「命中」，停上去等于敲什么都选成新选题"
  );
  assert.deepEqual(cursorForQuery("  ", 20), { active: 0, page: 0 });
});

test("D · ↓：顶上那一项 → 本页第一组；本页最后一组 → **翻到下一页**；最后一组 → 不动", () => {
  const n = 20;
  assert.deepEqual(moveCursor({ active: 0, page: 1 }, "down", n), { active: 9, page: 1 });
  assert.deepEqual(moveCursor({ active: 3, page: 0 }, "down", n), { active: 4, page: 0 });
  assert.deepEqual(moveCursor({ active: 8, page: 0 }, "down", n), { active: 9, page: 1 });
  assert.deepEqual(moveCursor({ active: 20, page: 2 }, "down", n), { active: 20, page: 2 });
  assert.deepEqual(
    moveCursor({ active: -1, page: 0 }, "down", 0),
    { active: 0, page: 0 },
    "一组都没命中时 ↓ 只能落到顶上那一项"
  );
});

test("D · ↑：本页第一组 → 顶上那一项（**不往回翻页**）；顶上那一项 → 不动", () => {
  const n = 20;
  assert.deepEqual(
    moveCursor({ active: 9, page: 1 }, "up", n),
    { active: 0, page: 1 },
    "屏幕上第一组上面画着的是「新选题」，不是上一页的最后一组"
  );
  assert.deepEqual(moveCursor({ active: 10, page: 1 }, "up", n), { active: 9, page: 1 });
  assert.deepEqual(moveCursor({ active: 0, page: 1 }, "up", n), { active: 0, page: 1 });
});

test("D · PageDown / PageUp：翻一页、停在那一页第一组；到头不动；没命中时什么都不做", () => {
  const n = 20;
  assert.deepEqual(moveCursor({ active: 0, page: 0 }, "pageDown", n), { active: 9, page: 1 });
  assert.deepEqual(moveCursor({ active: 17, page: 2 }, "pageDown", n), { active: 17, page: 2 });
  assert.deepEqual(moveCursor({ active: 12, page: 1 }, "pageUp", n), { active: 1, page: 0 });
  assert.deepEqual(moveCursor({ active: -1, page: 0 }, "pageDown", 0), { active: -1, page: 0 });
});

test("D · ★ 高亮在哪一组，页码就由它推 —— 不许出现「高亮的那一行不在这一页上」", () => {
  // 两个数各记各的、被记歪了的状态：页码说第 1 页，高亮却在第 20 组。
  const next = moveCursor({ active: 20, page: 0 }, "up", 20);
  assert.equal(next.active, 19);
  assert.equal(next.page, Math.floor((19 - 1) / GROUP_PAGE_SIZE), "页码得跟着高亮走");
  // 筛完之后序号越界（原来停在第 20 组，现在只剩 3 组）：夹回来，不许指向不存在的那一行。
  const clamped = moveCursor({ active: 20, page: 2 }, "up", 3);
  assert.ok(clamped.active <= 3);
});

test("D · 一页画哪几组：编号和键盘那一套是同一套（从 1 起、跨页连续）", () => {
  const gs = groups(20);
  const p1 = pageSlice(gs, 1);
  assert.equal(p1.length, GROUP_PAGE_SIZE);
  assert.equal(p1[0]!.active, GROUP_PAGE_SIZE + 1);
  assert.equal(p1[0]!.option.value, gs[GROUP_PAGE_SIZE]!.value);
  const last = pageSlice(gs, 99);
  assert.equal(last.at(-1)!.option.value, "1019", "页码越界夹到最后一页");
  assert.deepEqual(pageSlice([], 0), []);
});

test("D · 翻页那一行三档长得都不一样；在搜的时候必须带着「共 N 个」", () => {
  const plain = groupPagerText("", 20, 20, 1, "选题");
  const hit = groupPagerText("mu", 3, 20, 0, "选题");
  const miss = groupPagerText("zzz", 0, 20, 0, "选题");
  assert.equal(plain, "第 2 / 3 页 · 共 20 个选题");
  assert.match(hit, /匹配 3 个/);
  assert.match(hit, /共 20 个选题/, "只印「匹配 3 个」分不出是一共 3 个还是筛剩 3 个");
  assert.match(miss, /匹配 0 个（共 20 个选题）/);
  assert.equal(new Set([plain, hit, miss]).size, 3);
  assert.equal(groupEmptyText(" zzz ", "问题"), "没有匹配「zzz」的问题");
});

test("D · 编辑页和新建页都认；列表页、单例页、别的地方都不认", () => {
  assert.equal(formCollection("/keystatic/collection/posts/create"), "posts");
  assert.equal(formCollection("/keystatic/collection/qa/item/1033"), "qa");
  assert.equal(formCollection("/keystatic/collection/posts/item/1008-2"), "posts");
  for (const p of [
    "/keystatic/collection/posts",
    "/keystatic/collection/posts/createx",
    "/keystatic/singletons/symbols",
    "/keystatic",
    "/r/1002",
  ]) {
    assert.equal(formCollection(p), undefined, p);
  }
});

// ── E. 标的那一格 ─────────────────────────────────────────────────────

test("E · 每一项的那行字就是 symbolOptionLabel()（DOM 那一半靠它对上真勾选框），顺序 = 表的顺序", () => {
  const choices = symbolChoices(SYMBOLS);
  assert.deepEqual(
    choices.map(c => c.label),
    SYMBOLS.map(symbolOptionLabel)
  );
  assert.deepEqual(
    choices.map(c => c.value),
    SYMBOLS.map(s => s.code),
    "自动排序等于替人重排他在「标的」页拖出来的顺序"
  );
});

test("E · 英文名不在那行字里，但要搜得到（真的标的表：MU / Micron Technology）", () => {
  const mu = symbolChoices(SYMBOLS).find(c => c.value === "MU");
  assert.ok(mu, "标的表里得有 MU（这条用例用的是真数据）");
  assert.ok(!mu.label.includes("Micron"), "那行字本来就不带英文名 —— 这条用例才有意义");
  assert.equal(matchesQuery(mu.search, "micron"), true);
  assert.equal(matchesQuery(mu.search, "美光"), true);
  assert.equal(matchesQuery(mu.search, "mu"), true);
});

test("E · 「已勾」那一行：一只都没勾印一句话（完成态，不是空白），勾了几只列几只", () => {
  const none = symbolSummary([]);
  assert.equal(none.empty, true);
  assert.ok(none.text.trim() !== "", "空白的话，「没勾」和「这一行坏了」长得一样");
  assert.ok(
    !/待补|未填|请/.test(none.text),
    "讲宏观、讲方法论的内容本来就不勾 —— 不许说成待补"
  );
  const two = symbolSummary(["NOK 诺基亚", "MU 美光科技"]);
  assert.equal(two.empty, false);
  assert.equal(two.text, "已勾 2 只：NOK 诺基亚、MU 美光科技");
});

test("E · 没命中的那句话：带着搜索词，并告诉人表外的票去哪儿加", () => {
  const t = symbolEmptyText("  tsla ");
  assert.match(t, /「tsla」/);
  assert.match(t, /左侧「标的」那一页/);
});

test("E · 方向键找下一个**看得见的**；走到头是 -1；从外面进来找第一个 / 最后一个", () => {
  const vis = [false, true, false, true, true, false];
  assert.equal(nextVisible(vis, 1, 1), 3, "跳过藏起来的那一颗");
  assert.equal(nextVisible(vis, 3, -1), 1);
  assert.equal(nextVisible(vis, 4, 1), -1, "往后走到头");
  assert.equal(nextVisible(vis, 1, -1), -1, "往前走到头（DOM 那一半把焦点交回搜索框）");
  assert.equal(nextVisible(vis, -1, 1), 1, "从搜索框按 ↓ 进来");
  assert.equal(nextVisible(vis, vis.length, -1), 4, "End");
  assert.equal(nextVisible([false, false], -1, 1), -1, "一颗都看不见");
});

// ── F. 自己画的控件不算"改了这条内容" ─────────────────────────────────

/** 一个够 `countsAsContent()` 用的假元素：只回答"祖先里有没有这个选择器"。 */
const fakeEl = (ancestors: string[]) => ({
  closest: (sel: string) => (ancestors.includes(sel) ? {} : null),
});

test("F · 判据：挂在我们自己的控件底下 → 不算；其余（Keystatic 的输入框）→ 算", () => {
  assert.equal(countsAsContent(fakeEl([`[${OWN_UI_ATTR}]`])), false);
  assert.equal(countsAsContent(fakeEl([])), true);
  assert.equal(countsAsContent(fakeEl(['[role="group"]'])), true);
});

test("F · 接线：modTime 的指纹真的逐个问了它（没接上 = 搜一下票就盖上更新时间）", () => {
  const src = stripComments(read("src/dev/keystaticModTime.ts"));
  assert.match(src, /import \{ countsAsContent \} from "\.\/ownUi";/);
  const fp = /function fingerprint\([\s\S]*?\n\}/.exec(src)?.[0] ?? "";
  assert.ok(fp !== "", "找不到 fingerprint() —— 改名了的话这条断言要跟着改");
  assert.match(fp, /if \(!countsAsContent\(el\)\) continue;/);
});

test("F · 两个选择器的根节点都带着那个属性（带在根上，底下的输入框全被排掉）", () => {
  const sym = stripComments(read("src/dev/keystaticSymbolPicker.ts"));
  const grp = stripComments(read("src/dev/keystaticGroupPicker.ts"));
  assert.match(sym, /make\("div", \{ \[ROOT_ATTR\]: "", \[OWN_UI_ATTR\]: "" \}\)/);
  assert.match(grp, /\[POP_ATTR\]: "",\s*\[OWN_UI_ATTR\]: "",/);
});

// ── G. 接线：没接上都是零症状的 ───────────────────────────────────────

test("G · keystatic.config.ts 真的挂了两个选择器，面板吃的是和 groupFill 同一次扫描", () => {
  // ⚠ 这个文件**不许**过 stripComments：里面好几个 `"./src/content/posts/*.md"`，
  //   朴素的剥注释会从那个 `/*` 一口吃到下一个 `*/`（docs/engineering-notes.md 第四节记过这个坑）。
  //   改成按行首锚定查原文 —— 被 `//` 注释掉的那一行不会以 `mount` / `import` 开头。
  const ks = read("keystatic.config.ts");
  assert.match(ks, /^import \{ mountSymbolPicker \} from "\.\/src\/dev\/keystaticSymbolPicker";$/m);
  assert.match(ks, /^import \{ mountGroupPicker \} from "\.\/src\/dev\/keystaticGroupPicker";$/m);
  assert.match(ks, /^mountSymbolPicker\(\);$/m, "import 了但没调用，等于没挂");
  const call = /^mountGroupPicker\(\{\n[\s\S]*?^\}\);$/m.exec(ks)?.[0] ?? "";
  assert.ok(call !== "", "mountGroupPicker({...}) 那一段不在了（或者被注释掉了）");
  assert.match(call, /posts: \{ noun: "选题", search: groupSearchIndex\(postGroups\) \}/);
  assert.match(call, /qa: \{ noun: "问题", search: groupSearchIndex\(qaGroups\) \}/);
});

test("G · 「哪一格」的判据只有 groupFill 那一份：两个选择器都 import，不自己再写", () => {
  const sym = stripComments(read("src/dev/keystaticSymbolPicker.ts"));
  const grp = stripComments(read("src/dev/keystaticGroupPicker.ts"));
  assert.match(sym, /import \{ multiBoxes \} from "\.\/keystaticGroupFill";/);
  assert.ok(!/function multiBoxes/.test(sym));
  assert.match(grp, /import \{ groupSelect \} from "\.\/keystaticGroupFill";/);
  assert.ok(!/function groupSelect/.test(grp));
  assert.match(grp, /import \{ setSelectValue \} from "\.\/keystaticAgentModel";/);
});

test("G · ★ 自己的药丸不许是勾选框 —— groupFill 按勾选框个数认「哪一格是标的」，数成 2N 就认不出", () => {
  const sym = stripComments(read("src/dev/keystaticSymbolPicker.ts"));
  const inputs = [...sym.matchAll(/make\("input", \{([^}]*)\}/g)].map(m => m[1]!);
  assert.equal(inputs.length, 1, "只该有一个 <input>：搜索框");
  assert.match(inputs[0]!, /type: "search"/);
  assert.match(sym, /make\("button", \{[^}]*role: "checkbox"/, "药丸是 button[role=checkbox]");
});

test("G · 拦截挂在 document 捕获阶段、只 stopPropagation —— modTime 同一层的监听照样收得到「人点过」", () => {
  const grp = stripComments(read("src/dev/keystaticGroupPicker.ts"));
  assert.match(grp, /document\.addEventListener\(type, onPointerish, true\)/);
  assert.match(grp, /document\.addEventListener\("keydown", onKeyDown, true\)/);
  assert.ok(
    !/stopImmediatePropagation/.test(grp),
    "stopImmediatePropagation 会连 modTime 挂在 document 上的 isTrusted 闸一起拦掉"
  );
  assert.ok(
    !/window\.addEventListener\("pointerdown"/.test(grp),
    "挂在 window 上 = 在 modTime 之前就把事件掐了"
  );
});

test("G · 失败方向：弹面板抛了就**不拦这一下**（退回原生下拉），不是一个死按钮", () => {
  const grp = stripComments(read("src/dev/keystaticGroupPicker.ts"));
  const body = /function onPointerish\([\s\S]*?\n\}/.exec(grp)?.[0] ?? "";
  // giveUp 之后紧跟 return，stopPropagation 在 try/catch 之后 —— 抛了的那一下不会被吞掉。
  assert.match(body, /catch \(err\) \{\s*giveUp\(err\);[^\n]*\n\s*return;/);
  assert.ok(
    body.indexOf("stopPropagation") > body.indexOf("giveUp"),
    "stopPropagation 排在 try/catch 前面的话，抛了的那一下原生列表也弹不出来"
  );
});

test("G · 藏 Keystatic 那排药丸只在自己的容器挂好之后；颜色之外还有第二处说「勾了」", () => {
  assert.match(
    SYMBOL_PICKER_CSS,
    /\[data-lwj-sym-ready\]\[data-lwj-sym-ready\] > label \{ display: none; \}/,
    "藏的规则只许挂在「挂好了」那个属性上"
  );
  const sym = stripComments(read("src/dev/keystaticSymbolPicker.ts"));
  const mount = /function mount\([\s\S]*?\n\}/.exec(sym)?.[0] ?? "";
  assert.ok(
    mount.indexOf("group.append(root)") >= 0 &&
      mount.indexOf("group.append(root)") < mount.indexOf("group.setAttribute(READY_ATTR"),
    "先设「可以藏」、后挂容器的话，挂的那一步一抛，这一格就两排都没有"
  );
  // 同 keystaticFormControls 保留勾选框的理由：选中态不能只靠颜色一处在说。
  assert.match(
    SYMBOL_PICKER_CSS,
    /\[aria-checked="true"\] \[data-lwj-sym-mark\]::after/,
    "勾上的药丸里得画出那个勾"
  );
});
