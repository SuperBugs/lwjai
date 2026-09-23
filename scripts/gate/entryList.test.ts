/**
 * 后台列表页（研究稿 / 问答 / 教程 / 提示词）：**搜索 + 新的在前 + 分页**。【2026-09-23 用户要的】
 * 判据在 `src/dev/entryListPlan.ts`，扫盘在 `entryListScan.ts`，DOM 在 `keystaticEntryList.ts`，
 * 数据接口 `/_entries` 在 `entries-run.ts`。
 *
 * ## 为什么要钉
 *
 * 这张表坏了的样子**几乎全是零症状**：
 *   - 搜索只搜了标题（没搜公司名、智能体）→ 敲「美光」是「没有匹配」，而那一篇明明就在；
 *   - 排序另写了一个比较函数 → 后台和站上 /r 各排各的，两边都"没错"；
 *   - 扫盘和 Keystatic 读的不是同一个目录 / 同一种文件 → 列表安静地少几条，
 *     而少几条的列表和完整的长得一模一样；
 *   - 读不出来的那一条被吞掉 → 最需要被点开修的那一条，在列表上消失了；
 *   - 路由改了名而浏览器那头没跟上 → 整张表退回 Keystatic 那张（旧的在前、搜不到）。
 *
 * 用例喂的是**后台真会写出来的东西**：frontmatter 照抄盘上研究稿 1037 / 1036 的形状
 * （Keystatic 写的是不带引号的时刻，YAML 读出来是 `Date`；手写的常带引号，读出来是字符串），
 * 经 `parseEntrySource()` 也就是生产那一条路解析，不手搓 `EntryRow`。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  beijingLabel,
  countMismatchText,
  ENTRIES_ROUTE,
  filterRows,
  itemHref,
  keystaticCount,
  LIST_COLLECTIONS,
  LIST_PAGE_SIZE,
  listCollection,
  listColumns,
  listEmptyText,
  listPageCount,
  listPageRows,
  listPagerText,
  PAGE_PARAM,
  pageWindow,
  parseListState,
  parsePayload,
  QUERY_PARAM,
  rowBadges,
  rowFromFrontmatter,
  rowSearchText,
  searchPlaceholder,
  sortRows,
  withListState,
  type EntryRow,
} from "../../src/dev/entryListPlan";
import { parseEntrySource, scanEntryRows } from "../../src/dev/entryListScan";
import { ENTRY_LIST_CSS } from "../../src/dev/keystaticEntryList";
import { OWN_UI_ATTR } from "../../src/dev/ownUi";
import {
  NUMBERED_COLLECTIONS,
  requireCollectionSpec,
} from "../../src/config/collections";
import { newestCreatedFirst } from "../../src/utils/createdOrder";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * 先剥注释再查 —— 注释里常常正写着要查的那个名字（docs/engineering-notes.md 记过两次这种假钉子）。
 * ⚠ 朴素版：会把字符串里的 `/*` 当成注释开头。下面用到它的文件里，
 *   keystatic.config.ts 有 `*.md` 那种 glob 字符串 —— 查它的断言**只在抠出来的那一段里**查。
 */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

/** 照抄盘上 src/content/posts/1037.md 的 frontmatter（Keystatic 写的，时刻不带引号）。 */
const MU_1037 = `---
questionKey: '1036'
title: MU
description: 接近月内高点，板块回暖带动大涨；下周财报，业绩指引可能不及预期。
symbols:
  - MU
agent: chatgpt
model: gpt-6-pro
prompt: '1000'
tags:
  - 个股研究
pubDatetime: 2026-09-23T02:52:00.000Z
modDatetime: 2026-09-23T05:47:00.000Z
featured: false
draft: false
symbolSource: manual
---
# MU｜美光科技
`;

const NOW = Date.parse("2026-09-23T07:00:00.000Z");

/** 走生产那一条路（`parseEntrySource`）把一份 .md 变成一行。 */
function rowFromSource(
  slug: string,
  raw: string,
  extra: { byline?: string; now?: number } = {}
): EntryRow {
  const parsed = parseEntrySource(raw);
  return rowFromFrontmatter({
    slug,
    data: parsed.data,
    problem: parsed.problem,
    byline: extra.byline,
    now: extra.now ?? NOW,
  });
}

/**
 * 在 1037 的基础上换掉几个键 —— **整块**换：那一行加上紧跟着的缩进行
 * （`symbols:` 底下那几个 `  - MU`）。
 *
 * ⚠ 写这条测试时当场踩到：第一版只换那一行，`symbols: []` 后面还挂着原来的 `  - MU`，
 *   YAML 整份读不出来 → 那一行成了「读不出来」、每一格都是空的 → 断言"标的是空的"照样绿。
 *   **测试自己喂坏了输入**（docs/engineering-notes.md 坑 17 / docs/gate.md 第 7 节那个形态）。
 *   所以造完先确认它读得出来。
 */
function variant(changes: Record<string, string>): string {
  let src = MU_1037;
  for (const [key, block] of Object.entries(changes)) {
    const re = new RegExp(`^${key}:.*(?:\\n[ \\t]+.*)*`, "m");
    assert.ok(re.test(src), `样例里没有 ${key} 这一行`);
    src = src.replace(re, block);
  }
  const parsed = parseEntrySource(src);
  assert.equal(parsed.problem, undefined, `造出来的样例自己就坏了：${parsed.problem}`);
  return src;
}

const mu1037 = () =>
  rowFromSource("1037", MU_1037, { byline: "OpenAI ChatGPT（GPT-6-Pro）" });

// ── A. 搜索：屏幕上看得见的都搜得到 ─────────────────────────────────────

test("A · 研究稿的标题常常就是代码：敲公司中文名、英文名、智能体、模型、日期、号都得找得到", () => {
  const row = mu1037();
  const hay = rowSearchText(row);
  for (const q of [
    "美光",
    "micron",
    "MU",
    "ｍｕ", // 中文输入法下敲出来的全角
    "chatgpt",
    "GPT-6",
    "09-23",
    "2026-09-23 10:52",
    "1037",
    "个股研究",
    "板块回暖",
  ]) {
    assert.equal(filterRows([row], q, [hay]).length, 1, `「${q}」该命中 1037`);
  }
  assert.equal(filterRows([row], "甲骨文").length, 0);
});

test("A · 看不见的东西搜不到：归组的键（1036）不在 1037 那一行里", () => {
  // 敲「1036」出来一条 1037，人看不出为什么 —— 那不是搜索，是谜语。
  assert.equal(filterRows([mu1037()], "1036").length, 0);
});

test("A · 徽章上的字也能搜：敲「草稿」就是只看草稿", () => {
  const draft = rowFromSource("1038", variant({ draft: "draft: true" }));
  const live = mu1037();
  assert.deepEqual(
    filterRows([live, draft], "草稿").map(r => r.slug),
    ["1038"]
  );
  const future = rowFromSource(
    "1039",
    variant({ pubDatetime: "pubDatetime: 2026-09-30T02:52:00.000Z" })
  );
  assert.deepEqual(
    filterRows([live, future], "未到发布时间").map(r => r.slug),
    ["1039"]
  );
});

test("A · 空格隔开的几段都得命中；空搜索词 = 全部、保序", () => {
  const gpt = mu1037();
  const spark = rowFromSource("1036", MU_1037, {
    byline: "Google Spark（Gemini-3.1-Pro）",
  });
  assert.deepEqual(
    filterRows([gpt, spark], "美光 spark").map(r => r.slug),
    ["1036"]
  );
  const all = filterRows([gpt, spark], "   ");
  assert.deepEqual(all.map(r => r.slug), ["1037", "1036"]);
});

test("A · 搜索框的灰字只列这个集合真有的东西（教程没有标的、没有智能体）", () => {
  const posts = searchPlaceholder(listColumns("posts"));
  const guides = searchPlaceholder(listColumns("guides"));
  assert.match(posts, /公司名/);
  assert.match(posts, /智能体/);
  assert.doesNotMatch(guides, /公司名|代码|智能体|模型/);
  assert.match(guides, /标题/);
});

// ── B. 一行怎么来 ──────────────────────────────────────────────────────

test("B · Keystatic 写的时刻（YAML 读成 Date）和手写带引号的（字符串）读出来是同一个", () => {
  const plain = parseEntrySource(MU_1037);
  assert.ok(plain.data?.pubDatetime instanceof Date, "前提：不带引号的真是 Date");
  const quoted = rowFromSource(
    "1037",
    variant({ pubDatetime: 'pubDatetime: "2026-09-23T02:52:00.000Z"' })
  );
  const row = mu1037();
  assert.equal(row.pub, "2026-09-23T02:52:00.000Z");
  assert.equal(quoted.pub, row.pub);
  assert.equal(quoted.pubLabel, row.pubLabel);
});

test("B · 时间读数是北京时间（和后台那两格同一个口径）：UTC 20:00 是次日 04:00", () => {
  assert.equal(mu1037().pubLabel, "2026-09-23 10:52");
  assert.equal(beijingLabel("2026-09-21T20:00:00.000Z"), "2026-09-22 04:00");
  assert.equal(beijingLabel("不是时间"), "", "认不出就是空串，不编");
});

test("B · 「未到发布时间」按传进来的此刻判（发布时间晚于此刻才算）", () => {
  const at = Date.parse("2026-09-23T02:52:00.000Z");
  assert.equal(rowFromSource("1037", MU_1037, { now: at }).future, false);
  assert.equal(rowFromSource("1037", MU_1037, { now: at - 60_000 }).future, true);
  assert.equal(mu1037().future, false);
});

test("B · 标题被 YAML 读成数字也照样是标题；没有标题是空串（屏幕上印「（没有标题）」）", () => {
  assert.equal(rowFromSource("1040", variant({ title: "title: 2026" })).title, "2026");
  const untitled = rowFromSource("1041", variant({ title: "title: ''" }));
  assert.equal(untitled.title, "");
  assert.equal(untitled.problem, undefined, "没标题是待补，不是读不出来");
});

test("B · 公司名从标的表查（不是条目上抄的）；表里没有的代码只剩代码", () => {
  assert.deepEqual(mu1037().symbols, [
    { code: "MU", name: "美光科技", nameEn: "Micron Technology" },
  ]);
  const odd = rowFromSource(
    "1042",
    variant({ symbols: "symbols:\n  - ZZZZ\n  - ORCL" })
  );
  assert.deepEqual(odd.symbols.map(s => s.code), ["ZZZZ", "ORCL"]);
  assert.equal(odd.symbols[0]?.name, undefined);
  assert.equal(odd.symbols[1]?.name, "甲骨文");
});

test("B · 标的三档：勾了 / 一只都没勾（完成态）/ 没认出来（待补）—— 后两档不许一样", () => {
  const none = rowFromSource("1043", variant({ symbols: "symbols: []" }));
  const pending = rowFromSource(
    "1044",
    variant({ symbols: "symbols: []", symbolSource: "symbolSource: unknown" })
  );
  assert.deepEqual(none.symbols, []);
  assert.equal(none.symbolsPending, false);
  assert.equal(pending.symbolsPending, true);
});

test("B · 读不出来的也占一行（带原因），`_` 开头的挂「不是条目」", () => {
  const broken = rowFromSource("1045", "---\ntitle: [没关上\n---\n正文");
  assert.match(broken.problem ?? "", /frontmatter 解析失败/);
  assert.equal(broken.title, "");
  assert.equal(rowBadges(broken)[0]?.kind, "problem");

  const bare = rowFromSource("1046", "# 只有正文，没有 frontmatter\n");
  assert.match(bare.problem ?? "", /没有 frontmatter/);

  const keep = rowFromSource("_keep", "---\ntitle: 占位\n---\n");
  assert.equal(keep.offSite, true);
  assert.equal(rowBadges(keep)[0]?.kind, "offsite");
});

test("B · 徽章：已发布的一个都不挂（完成态）；草稿 / 未到时间 / 置顶各有各的", () => {
  assert.deepEqual(rowBadges(mu1037()), []);
  const all = rowFromSource(
    "1047",
    variant({
      draft: "draft: true",
      featured: "featured: true",
      pubDatetime: "pubDatetime: 2027-01-01T00:00:00.000Z",
    })
  );
  assert.deepEqual(
    rowBadges(all).map(b => b.kind),
    ["draft", "future", "featured"],
    "顺序固定：先说发不出去的，再说置顶"
  );
  for (const b of rowBadges(all)) assert.ok(b.hint.length > 0, `${b.kind} 要有悬停说明`);
});

test("B · 「智能体（模型）」只在调用方给了才有（教程 / 提示词没有这一格）", () => {
  assert.equal(mu1037().byline, "OpenAI ChatGPT（GPT-6-Pro）");
  assert.equal("byline" in rowFromSource("1005", MU_1037), false);
});

// ── C. 顺序：新的在前，和站上同一条规矩 ─────────────────────────────────

test("C · 新的在前；同一分钟的按号（大的在前，1万号之后也对）；读不出时间的沉底", () => {
  const at = (slug: string, pub: string) =>
    rowFromSource(slug, variant({ pubDatetime: `pubDatetime: ${pub}` }));
  const rows = [
    at("1002", "2026-09-16T12:00:00.000Z"),
    rowFromSource("1003", "---\ntitle: [坏的\n---\n"),
    at("9999", "2026-09-23T02:52:00.000Z"),
    at("10000", "2026-09-23T02:52:00.000Z"),
    at("1036", "2026-09-23T02:50:00.000Z"),
  ];
  assert.deepEqual(
    sortRows(rows).map(r => r.slug),
    ["10000", "9999", "1036", "1002", "1003"]
  );
});

test("C · 排序就是站上那个 newestCreatedFirst（不许另写一份）", () => {
  const plan = read("src/dev/entryListPlan.ts");
  assert.match(plan, /from "\.\.\/utils\/createdOrder"/);
  const body = stripComments(plan).slice(
    stripComments(plan).indexOf("export function sortRows")
  );
  assert.match(body.slice(0, 400), /newestCreatedFirst\(/);
  // 行为上也对一遍：随手一组，两种排法结果逐个相同。
  const rows = ["1010", "1002", "1030", "1007"].map((slug, i) =>
    rowFromSource(
      slug,
      variant({ pubDatetime: `pubDatetime: 2026-09-2${i}T0${i}:00:00.000Z` })
    )
  );
  const expected = [...rows]
    .sort((a, b) =>
      newestCreatedFirst(
        { id: a.slug, pubDatetime: a.pub ?? "" },
        { id: b.slug, pubDatetime: b.pub ?? "" }
      )
    )
    .map(r => r.slug);
  assert.deepEqual(sortRows(rows).map(r => r.slug), expected);
});

// ── D. 分页 ────────────────────────────────────────────────────────────

const many = (n: number) =>
  Array.from({ length: n }, (_, i) => String(1000 + i));

test("D · 一页 20 条；27 条是两页，第二页 7 条；手敲的 page=99 夹到最后一页", () => {
  assert.equal(LIST_PAGE_SIZE, 20);
  const rows = many(27);
  assert.equal(listPageCount(rows.length), 2);
  assert.equal(listPageRows(rows, 0).length, 20);
  assert.deepEqual(listPageRows(rows, 1), rows.slice(20));
  assert.deepEqual(listPageRows(rows, 98), rows.slice(20));
  assert.equal(listPageCount(0), 1, "零条也是「第 1 / 1 页」");
});

test("D · 页码那一排：头尾都在、当前页前后各两页；只隔一页的直接画出来，不画「…」", () => {
  assert.deepEqual(pageWindow(0, 1), [0]);
  assert.deepEqual(pageWindow(0, 2), [0, 1]);
  assert.deepEqual(pageWindow(0, 12), [0, 1, 2, null, 11]);
  assert.deepEqual(pageWindow(5, 12), [0, null, 3, 4, 5, 6, 7, null, 11]);
  assert.deepEqual(pageWindow(11, 12), [0, null, 9, 10, 11]);
  assert.deepEqual(pageWindow(3, 7), [0, 1, 2, 3, 4, 5, 6], "窗口把头尾都盖住了");
  // ⚠ 上面那几条里**没有一处正好只隔一页**（破坏验证时抓到的：把"只隔一页就直接画出来"
  //   删掉，它们照样全绿）。下面两条才真的走到那个分支：第 2 页 / 倒数第 2 页被画出来。
  assert.deepEqual(pageWindow(4, 12), [0, 1, 2, 3, 4, 5, 6, null, 11], "只隔第 2 页");
  assert.deepEqual(pageWindow(7, 12), [0, null, 5, 6, 7, 8, 9, 10, 11], "只隔倒数第 2 页");
  assert.deepEqual(pageWindow(40, 12), [0, null, 9, 10, 11], "越界的当前页夹回去");
});

test("D · 翻页那一行三档长得不一样；在搜的时候「共 N 条」必须也在", () => {
  assert.equal(listPagerText("", 27, 27, 1), "共 27 条 · 第 2 / 2 页");
  assert.equal(listPagerText("美光", 3, 27, 0), "匹配 3 条（共 27 条） · 第 1 / 1 页");
  assert.equal(listPagerText("美光", 0, 27, 0), "匹配 0 条（共 27 条）");
  assert.equal(listEmptyText(" 美光 ", 27), "没有匹配「美光」的条目。");
  assert.notEqual(listEmptyText("", 0), "", "一条都没读到也得说一句");
});

// ── E. 地址栏 ──────────────────────────────────────────────────────────

test("E · 搜索词和页码记在地址栏：第 1 页、空搜索词不写（左侧菜单点进来的就是默认状态）", () => {
  assert.deepEqual(parseListState("?q=%E7%BE%8E%E5%85%89&page=2"), { q: "美光", page: 1 });
  assert.deepEqual(parseListState(""), { q: "", page: 0 });
  for (const bad of ["?page=0", "?page=-1", "?page=abc", "?page=1.5", "?page="]) {
    assert.equal(parseListState(bad).page, 0, bad);
  }
  assert.equal(withListState("", { q: "", page: 0 }), "");
  assert.equal(
    parseListState(withListState("", { q: "mu 美光", page: 3 })).q,
    "mu 美光"
  );
  assert.equal(parseListState(withListState("", { q: "x", page: 3 })).page, 3);
});

test("E · 不借 Keystatic 的 `search` 参数，也不把它冲掉", () => {
  assert.notEqual(QUERY_PARAM, "search");
  assert.notEqual(PAGE_PARAM, "search");
  const next = withListState("?search=10", { q: "美光", page: 1 });
  const params = new URLSearchParams(next);
  assert.equal(params.get("search"), "10");
  assert.equal(params.get(QUERY_PARAM), "美光");
});

// ── F. 认页面、拼地址 ──────────────────────────────────────────────────

test("F · 只认列表页本身；新建页、编辑页、别的集合、坏地址都不认（坏地址不许抛）", () => {
  assert.equal(listCollection("/keystatic/collection/posts"), "posts");
  assert.equal(listCollection("/keystatic/collection/qa/"), "qa");
  assert.equal(listCollection("/keystatic/collection/posts/create"), undefined);
  assert.equal(listCollection("/keystatic/collection/posts/item/1037"), undefined);
  assert.equal(listCollection("/keystatic/collection/systemPrompts"), undefined);
  assert.equal(listCollection("/keystatic/singleton/tags"), undefined);
  assert.equal(listCollection("/keystatic/collection/%E0%A4%A"), undefined);
});

test("F · 换成这张表的集合 = 登记表里有条目号的那几个；标的 / 智能体两列跟着 provenance 走", () => {
  assert.deepEqual([...LIST_COLLECTIONS], [...NUMBERED_COLLECTIONS]);
  for (const key of ["posts", "qa", "guides"]) {
    assert.ok(LIST_COLLECTIONS.includes(key), `用户点名的「${key}」必须在`);
  }
  for (const key of LIST_COLLECTIONS) {
    const byAgent = requireCollectionSpec(key).provenance === "by-agent";
    assert.deepEqual(listColumns(key), { symbols: byAgent, byline: byAgent }, key);
  }
});

/** Keystatic 的发布包（文件名带哈希，所以按内容找）。 */
const KS_DIST = join(ROOT, "node_modules", "@keystatic", "core", "dist");
const ksSource = () =>
  readdirSync(KS_DIST)
    .filter(f => f.endsWith(".js") && !f.includes(".node") && !f.includes(".worker"))
    .map(f => readFileSync(join(KS_DIST, f), "utf8"))
    .join("\n");

test("F · 编辑页地址的拼法和 Keystatic 自己的 getItemPath() 逐字相同（上游改了这条会红）", () => {
  const src = ksSource();
  assert.match(
    src,
    /function getItemPath\(basePath, collection, key\) \{\s*return `\$\{basePath\}\/collection\/\$\{encodeURIComponent\(collection\)\}\/item\/\$\{encodeURIComponent\(key\)\}`;/
  );
  assert.equal(itemHref("posts", "1037"), "/keystatic/collection/posts/item/1037");
  assert.equal(itemHref("qa", "a b"), "/keystatic/collection/qa/item/a%20b");
});

test("F · 我们靠着的几件上游事实（Keystatic 升级时这条红了，先去看列表页还好不好使）", () => {
  const src = ksSource();
  assert.match(src, /addEventListener\("popstate", handleNavigate\)/, "路由听 popstate —— 点一行就靠它");
  assert.match(src, /MAIN_PANEL_ID = 'keystatic-main-panel'/, "main 的 id");
  assert.match(src, /role: "search"/, "顶上搜索框的外壳");
  assert.match(src, /"aria-label": "show search"/, "窄屏那个放大镜按钮");
  // 上游搜索只认地址 —— 这正是换掉它的理由。哪天它会搜标题了，这张表就该重新想想还要不要。
  assert.match(src, /item\.name\.toLowerCase\(\)\.includes\(searchTerm\.toLowerCase\(\)\)/);
});

// ── G. 读回来的数据 ────────────────────────────────────────────────────

test("G · 接口吐的那个形状认得；认不得的整份不认（不许画一张缺行的表）", () => {
  const good = { collection: "posts", readAt: "2026-09-23T07:00:00.000Z", entries: [mu1037()] };
  const ok = parsePayload(JSON.parse(JSON.stringify(good)), "posts");
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.payload.entries, [mu1037()]);

  const bad: [unknown, RegExp][] = [
    [{ ...good, collection: "qa" }, /要的是「posts」/],
    [{ collection: "posts" }, /entries/],
    [{ ...good, entries: [{ title: "没有号" }] }, /第 1 行/],
    [{ error: "读「posts」失败：ENOENT" }, /ENOENT/],
    ["<html>", /不是一个 JSON 对象/],
  ];
  for (const [json, re] of bad) {
    const r = parsePayload(json, "posts");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, re);
  }
});

// ── H. 条数对账 ────────────────────────────────────────────────────────

test("H · Keystatic 那张表的条数 = aria-rowcount 减表头；对不上时那句话先叫人刷新", () => {
  assert.equal(keystaticCount("28"), 27);
  assert.equal(keystaticCount("1"), 0);
  assert.equal(keystaticCount(null), undefined);
  assert.equal(keystaticCount("abc"), undefined);
  assert.equal(countMismatchText(27, 27), undefined);
  const text = countMismatchText(28, 27) ?? "";
  assert.match(text, /28/);
  assert.match(text, /27/);
  assert.match(text, /刷新/);
});

// ── K. 扫盘 ────────────────────────────────────────────────────────────

/** 造一个临时仓库根，里面有 src/content/posts/。 */
function tempRepo(): { root: string; dir: string } {
  const root = mkdtempSync(join(tmpdir(), "lwj-entrylist-"));
  const dir = join(root, ...requireCollectionSpec("posts").dir.split("/"));
  mkdirSync(dir, { recursive: true });
  return { root, dir };
}

test("K · 和 Keystatic 列的一样：目录下每一个 .md（不递归），读不出来的、`_` 开头的也在", () => {
  const { root, dir } = tempRepo();
  try {
    writeFileSync(join(dir, "1037.md"), MU_1037);
    writeFileSync(
      join(dir, "1036.md"),
      variant({ pubDatetime: 'pubDatetime: "2026-09-23T02:50:00.000Z"' })
    );
    writeFileSync(join(dir, "1045.md"), "---\ntitle: [没关上\n---\n");
    writeFileSync(join(dir, "_keep.md"), "---\ntitle: 占位\n---\n");
    writeFileSync(join(dir, "notes.txt"), "不是 .md");
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub", "1099.md"), MU_1037);

    const calls: unknown[] = [];
    const rows = scanEntryRows("posts", {
      root,
      now: NOW,
      byline: data => {
        calls.push(data.agent);
        return `by:${String(data.agent)}`;
      },
    });
    // 读不出时间的（坏的那条、没写时间的占位）沉底；它俩之间按 createdOrder 的号规矩
    // （位数多的算大、大的在前）—— `_keep` 五个字符，排在 `1045` 前面。
    assert.deepEqual(rows.map(r => r.slug), ["1037", "1036", "_keep", "1045"]);
    const bySlug = new Map(rows.map(r => [r.slug, r]));
    assert.equal(bySlug.get("1037")?.byline, "by:chatgpt");
    assert.equal(bySlug.get("1045")?.byline, undefined, "读不出来的那条不去算智能体");
    assert.equal(calls.length, 3, "byline 只对读得出来的调");
    assert.match(bySlug.get("1045")?.problem ?? "", /frontmatter/);
    assert.equal(bySlug.get("_keep")?.offSite, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("K · 按修改时间缓存：改过的文件重读、删掉的文件消失、新加的出现", () => {
  const { root, dir } = tempRepo();
  try {
    const file = join(dir, "1037.md");
    writeFileSync(file, MU_1037);
    assert.equal(scanEntryRows("posts", { root, now: NOW })[0]?.title, "MU");

    // 同样长度的改动也得认出来：mtime 往后拨一下（真实编辑一定会动它）。
    writeFileSync(file, MU_1037.replace("title: MU", "title: MX"));
    const later = new Date(Date.now() + 5_000);
    utimesSync(file, later, later);
    assert.equal(scanEntryRows("posts", { root, now: NOW })[0]?.title, "MX");

    writeFileSync(join(dir, "1038.md"), variant({ title: "title: 新的一条" }));
    assert.deepEqual(
      scanEntryRows("posts", { root, now: NOW }).map(r => r.slug).sort(),
      ["1037", "1038"]
    );
    rmSync(file);
    assert.deepEqual(
      scanEntryRows("posts", { root, now: NOW }).map(r => r.slug),
      ["1038"]
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("K · 目录不在就抛（接口回 500 → 屏幕上是「读不到」那一档，不是一张空表）", () => {
  const root = mkdtempSync(join(tmpdir(), "lwj-entrylist-empty-"));
  try {
    assert.throws(() => scanEntryRows("posts", { root, now: NOW }), /ENOENT/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("K · 真实内容：每个集合读到的条数 = 目录里的 .md 个数，一条都读不出来的都没有，顺序就是新的在前", () => {
  for (const key of LIST_COLLECTIONS) {
    const dir = join(ROOT, ...requireCollectionSpec(key).dir.split("/"));
    const files = readdirSync(dir).filter(f => f.endsWith(".md"));
    const rows = scanEntryRows(key, { root: ROOT, now: Date.now() });
    assert.equal(rows.length, files.length, `${key}：条数对不上`);
    assert.deepEqual(
      rows.filter(r => r.problem).map(r => `${r.slug}：${r.problem}`),
      [],
      `${key}：有读不出来的稿子（站上构建也会红）`
    );
    assert.deepEqual(rows, sortRows(rows), `${key}：没按新的在前排`);
  }
});

// ── L. 接线 ────────────────────────────────────────────────────────────

test("L · keystatic.config.ts 真的挂了它（import ＋ 调用，都不在注释里）", () => {
  const src = stripComments(read("keystatic.config.ts"));
  assert.match(src, /import \{ mountEntryList \} from "\.\/src\/dev\/keystaticEntryList";/);
  assert.match(src, /^mountEntryList\(\);$/m);
});

test("L · /_entries：astro.config.ts 挂的地址 = 浏览器 fetch 的那个常量，入口文件在", () => {
  const cfg = stripComments(read("astro.config.ts"));
  const m = /pattern:\s*"(\/_entries)",\s*entrypoint:\s*new URL\("\.\/(src\/dev\/entries-run\.ts)"/.exec(cfg);
  assert.ok(m, "astro.config.ts 里没找到 /_entries 那条 injectRoute");
  assert.equal(m[1], ENTRIES_ROUTE);
  assert.ok(existsSync(join(ROOT, m[2]!)), `${m[2]} 不存在`);

  const dom = stripComments(read("src/dev/keystaticEntryList.ts"));
  assert.match(dom, /\$\{ENTRIES_ROUTE\}\?c=/, "浏览器那头拿常量拼地址");
  assert.doesNotMatch(dom, /"\/_entries/, "别在 DOM 那头再写一份字面量");
});

test("L · 接口：关掉预渲染（不然 ?c= 读不到）、扫盘走 scanEntryRows、「智能体（模型）」走 bylineOf", () => {
  const src = stripComments(read("src/dev/entries-run.ts"));
  assert.match(src, /export const prerender = false;/);
  assert.match(src, /export const GET: APIRoute/);
  assert.match(src, /scanEntryRows\(collection,/);
  assert.match(src, /byline: data => bylineOf\(collection, data, t\)/);
  assert.match(src, /from "\.\/xhsEntry"/);
});

test("L · 面板根上带 data-lwj-own-ui（modTime 的指纹跳过它）", () => {
  const src = stripComments(read("src/dev/keystaticEntryList.ts"));
  const at = src.indexOf('const root = make("section"');
  assert.ok(at >= 0, "没找到面板根节点");
  assert.match(src.slice(at, at + 200), /\[OWN_UI_ATTR\]: ""/);
  assert.equal(OWN_UI_ATTR, "data-lwj-own-ui");
});

test("L · 样式：只在面板没退回时藏表和搜索框（`!important` 压内联 style）；读不到时表露回来、话排在上面", () => {
  const css = ENTRY_LIST_CSS;
  const active =
    'main:has(> [data-lwj-el-grid] ~ [data-lwj-el]:not([data-state="failed"]))';
  assert.ok(css.includes(`${active} > [data-lwj-el-grid]`), "藏表的条件");
  assert.ok(css.includes(`${active} > header [role="search"]`), "藏 Keystatic 搜索框的条件");
  assert.ok(css.includes('header button[aria-label="show search"]'), "窄屏那个放大镜");
  assert.match(css, /header button\[aria-label="show search"\] \{ display: none !important; \}/);
  // 窄窗口里 Keystatic 把「Add」让给它的搜索框，而那个框被藏了 —— 按钮得还回来。
  assert.ok(
    css.includes(`${active} > header a[href$="/create"] { display: flex !important; }`),
    "窄窗口里「Add」按钮要还回来"
  );
  // 面板本身只在"排在表后面"时显示（表被拿走的那一帧它就跟着不显示了）。
  assert.match(css, /\[data-lwj-el\] \{ display: none; \}/);
  assert.match(css, /main > \[data-lwj-el-grid\] ~ \[data-lwj-el\] \{\s*display: flex;/);
  // 退回那一档：表排到那句话下面。
  assert.match(css, /main:has\(> \[data-lwj-el\]\[data-state="failed"\]\) > \[data-lwj-el-grid\] \{ order: 2; \}/);
});

test("L · Keystatic 读的目录（keystatic.config.ts 的 path）和我们扫的目录（登记表的 dir）是同一个", () => {
  // 运行时有条数对账兜着（countMismatchText），这是它的静态孪生：改了一边，这里先红。
  const src = read("keystatic.config.ts");
  for (const key of LIST_COLLECTIONS) {
    const at = src.indexOf(`\n    ${key}: collection({`);
    assert.ok(at >= 0, `keystatic.config.ts 里没找到 ${key} 这个集合`);
    const path = /path: "([^"]+)"/.exec(src.slice(at, at + 2000))?.[1];
    assert.equal(path, `${requireCollectionSpec(key).dir}/*`, key);
  }
});
