/**
 * 搜索引擎那几格的关键词 —— 【2026-09-24 用户要的】「SEO 优化，增加美股分析、AI 研报等关键词」。
 *
 * 判据在 src/utils/seoMeta.ts（纯函数，裸 tsx 直接跑），措辞在 i18n 的 `t.seo`。钉四件事：
 *
 *   A. 关键词真的在该在的地方（站点说明、首页标题、站点 keywords、研究稿模板）。
 *   B. 研究稿 `<title>` 的主语（代码 ＋ 中文名 ＋ 标题，谁的信息多谁留下）。
 *   C. `<title>` 里的「AI」只在 `provenanceOf()` 判成 ai 时出现；日期按站点时区。
 *   D. 接线：Layout 印 keywords、四个详情页 / 四个列表页 / 标的页都走 seoMeta。
 *      每一条都是"漏了零症状"的形态 —— 页面照常、构建全绿，只有搜索引擎那头看得见。
 *
 * ★ 喂的都是**编的**输入，不读 src/content：`pnpm test` 在 build 链里，一次正常的发稿
 *   （比如同一个智能体同一天写了同一只票两份）不该因为 <title> 撞名拦下整站发布。
 *
 * 破坏实跑过（2026-09-24，docs/engineering-notes.md 坑 17 那条纪律），见文件末尾那张表。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  detailSeo,
  listSeo,
  mergeKeywords,
  symbolSubject,
  symbolKeywords,
} from "../../src/utils/seoMeta";
import { blogPostingJsonLd, siteJsonLd } from "../../src/utils/structuredData";
import zh from "../../src/i18n/lang/zh-CN";
import en from "../../src/i18n/lang/en";
import { AGENTS, UNSPECIFIED_AGENT } from "../../src/config/agents";
import { CONTENT_COLLECTIONS } from "../../src/config/collections";
import { SYMBOLS } from "../../src/config/symbols";
import config from "../../astro-paper.config";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
/** 先剥注释再 grep（同 seo.test.ts）：注释里正写着"别把 X 改回去"，不剥的话删掉真的那句照样绿。 */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

const ROUTED = CONTENT_COLLECTIONS.filter(c => c.urlPrefix !== null);
const AI_AGENT = AGENTS.find(a => a.kind === "ai")!;
const HUMAN_AGENT = AGENTS.find(a => a.kind === "human")!;
const CTX = {
  siteTitle: "牢玩家",
  timezone: "Asia/Shanghai",
  dateFormat: zh.post.dateOnlyFormat,
};
const PUB = new Date("2026-09-22T02:00:00.000Z");

// ── A. 关键词在不在 ─────────────────────────────────────────────────

test("A1 站点说明、首页标题、站点 keywords 都带着「美股分析」「AI 研报」", () => {
  for (const word of ["美股分析", "AI 研报"]) {
    assert.ok(config.site.description.includes(word), `site.description 里没有「${word}」`);
    assert.ok(zh.home.tagline.includes(word), `home.tagline（首页 <title>）里没有「${word}」`);
    assert.ok(config.site.keywords?.includes(word), `site.keywords 里没有「${word}」`);
    assert.ok(zh.seo.lists.posts.includes(word), `研究稿列表页 <title> 里没有「${word}」`);
    assert.ok(zh.seo.symbolTitle.includes(word), `/s/<代码> 的 <title> 里没有「${word}」`);
    assert.ok(zh.seo.detail.posts.ai.includes(word), `研究稿详情页（AI 写的）<title> 里没有「${word}」`);
  }
  // 摘要只截前七八十个字：关键词得在最前面，不能排到那句承诺后面去。
  assert.ok(
    config.site.description.indexOf("美股分析") < 10,
    "site.description 的开头不是「美股分析」—— 搜索结果摘要截断时它可能被切掉"
  );
});

test("A2 站点 keywords 不堆词：不重复、不超过十来个", () => {
  const kw = config.site.keywords ?? [];
  assert.deepEqual(mergeKeywords(kw), [...kw], "site.keywords 里有重复（不分大小写）或空项");
  assert.ok(kw.length <= 12, `site.keywords 有 ${kw.length} 个 —— 堆多了在必应那边是作弊信号`);
});

// ── B. 研究稿 <title> 的主语 ─────────────────────────────────────────

test("B1 研究稿主语：代码 ＋ 中文名 ＋ 标题，谁的信息多谁留下", () => {
  // 站上真实的几种形状（名字是编的输入，不读标的表 —— 后台改一个名字不该让这条红）。
  assert.equal(symbolSubject("AAPL", [{ code: "AAPL", name: "苹果" }]), "AAPL 苹果");
  assert.equal(
    symbolSubject("Oracle", [{ code: "ORCL", name: "甲骨文" }]),
    "ORCL 甲骨文 Oracle"
  );
  assert.equal(
    symbolSubject("ORCL｜甲骨文 投资可行性分析", [{ code: "ORCL", name: "甲骨文" }]),
    "ORCL｜甲骨文 投资可行性分析",
    "标题已经包着代码和名字，不该再补一遍"
  );
  assert.equal(
    symbolSubject("HOOD", [{ code: "HOOD", name: "Robinhood Markets" }]),
    "HOOD Robinhood Markets"
  );
  assert.equal(symbolSubject("META", [{ code: "META", name: "Meta" }]), "META", "只差大小写算同一个");
  assert.equal(
    symbolSubject("AMC", [{ code: "AMC", name: "AMC院线" }]),
    "AMC院线",
    "名字包着代码时代码让位"
  );
  assert.equal(
    symbolSubject("美光科技 HBM 分析", [{ code: "MU", name: "美光科技" }]),
    "MU 美光科技 HBM 分析"
  );
  // 表里没名字：只有代码，不编一个。
  assert.equal(symbolSubject("XYZ", [{ code: "XYZ" }]), "XYZ");
});

test("B2 一个字母的代码不会被英文单词「包含」掉（按词边界比）", () => {
  assert.equal(
    symbolSubject("Agilent", [{ code: "A", name: "安捷伦" }]),
    "A 安捷伦 Agilent"
  );
  assert.equal(
    symbolSubject("Ford 财报", [{ code: "F", name: "福特" }]),
    "F 福特 Ford 财报"
  );
});

test("B3 没勾票 / 勾了好几只：主语就是标题本身", () => {
  assert.equal(symbolSubject(" 宏观周报 ", []), "宏观周报");
  assert.equal(
    symbolSubject("CPU", [
      { code: "ARM", name: "Arm" },
      { code: "INTC", name: "英特尔" },
    ]),
    "CPU"
  );
});

// ── C. AI 只在确实是 AI 写的时候出现；日期按站点时区 ──────────────────

test("C1 AI 写的研究稿：带智能体名字和「AI 研报」，以「 | 站名」结尾", () => {
  const { title } = detailSeo(
    "posts",
    { title: "ZZZQ", pubDatetime: PUB, symbols: ["ZZZQ"], agent: AI_AGENT.id },
    zh.seo,
    CTX
  );
  assert.ok(title.startsWith("ZZZQ "), title);
  assert.ok(title.includes(`${AI_AGENT.name} AI 研报`), `没带智能体名字：${title}`);
  assert.ok(title.includes("美股分析"), title);
  assert.ok(title.endsWith(" | 牢玩家"), title);
});

test("C2 人写的 / 没标的 / 登记表里查不到的：<title> 里不许出现 AI（替内容认领出身）", () => {
  for (const agent of [HUMAN_AGENT.id, UNSPECIFIED_AGENT, "deleted-agent-id", undefined]) {
    for (const collection of ["posts", "qa"] as const) {
      const { title, keywords } = detailSeo(
        collection,
        { title: "某个标题", pubDatetime: PUB, agent },
        zh.seo,
        CTX
      );
      assert.doesNotMatch(title, /AI/, `${collection} agent=${agent} 的 <title> 说了 AI：${title}`);
      assert.ok(!keywords.includes(HUMAN_AGENT.name), `把「${HUMAN_AGENT.name}」当成了关键词`);
    }
  }
  const human = detailSeo("posts", { title: "AAPL", pubDatetime: PUB, agent: HUMAN_AGENT.id }, zh.seo, CTX);
  assert.ok(human.title.includes("美股分析") && human.title.includes("研报"), human.title);
});

test("C3 同一只票：三个智能体三个 <title>；同一个智能体隔天再写也不同名", () => {
  const ais = AGENTS.filter(a => a.kind === "ai");
  const titles = ais.map(
    a => detailSeo("posts", { title: "ZZZQ", pubDatetime: PUB, symbols: ["ZZZQ"], agent: a.id }, zh.seo, CTX).title
  );
  assert.equal(new Set(titles).size, ais.length, `撞名了：${titles.join(" / ")}`);

  const later = new Date("2026-09-24T02:00:00.000Z");
  const a = detailSeo("posts", { title: "ZZZQ", pubDatetime: PUB, agent: AI_AGENT.id }, zh.seo, CTX);
  const b = detailSeo("posts", { title: "ZZZQ", pubDatetime: later, agent: AI_AGENT.id }, zh.seo, CTX);
  assert.notEqual(a.title, b.title);
});

test("C4 日期是创建那天、按站点时区（北京时间 20:00 UTC 已经是第二天）；条目自己填了时区就用它", () => {
  const evening = new Date("2026-09-21T20:00:00.000Z");
  const beijing = detailSeo("posts", { title: "ZZZQ", pubDatetime: evening }, zh.seo, CTX).title;
  assert.ok(beijing.includes("2026/09/22"), `按 UTC 截了日期：${beijing}`);
  assert.ok(!beijing.includes("2026/09/21"), beijing);

  const ny = detailSeo(
    "posts",
    { title: "ZZZQ", pubDatetime: evening, timezone: "America/New_York" },
    zh.seo,
    CTX
  ).title;
  assert.ok(ny.includes("2026/09/21"), `条目自己那格时区没生效：${ny}`);
});

test("C5 问答 / 教程 / 提示词：主语是标题原样，不往问题前面塞代码", () => {
  const qa = detailSeo(
    "qa",
    { title: "某公司发布可转债，估算合理跌幅", pubDatetime: PUB, symbols: ["ZZZQ"], agent: AI_AGENT.id },
    zh.seo,
    CTX
  );
  assert.ok(qa.title.startsWith("某公司发布可转债，估算合理跌幅 · "), qa.title);
  assert.ok(qa.title.includes(AI_AGENT.name), qa.title);
  assert.ok(qa.keywords.includes("ZZZQ"), "问答的标的没进 keywords");

  assert.equal(
    detailSeo("guides", { title: "某券商开户", pubDatetime: PUB }, zh.seo, CTX).title,
    "某券商开户 · 美股教程 | 牢玩家"
  );
  assert.equal(
    detailSeo("prompts", { title: "估值计算", pubDatetime: PUB }, zh.seo, CTX).title,
    "估值计算 · 美股分析 AI 提示词 | 牢玩家"
  );
});

test("C7 研究稿 <title> 的名字真的是从标的表查的（不是只印标题里那个代码）", () => {
  // 挑表里任意一只「中文名不包着代码」的票 —— 不点名，后台改了哪一行都不影响这条。
  const row = SYMBOLS.find(
    s => s.name && !s.name.toUpperCase().includes(s.code.toUpperCase())
  );
  assert.ok(row, "标的表里一只带中文名的票都没有 —— 这条测不了");
  const { title } = detailSeo(
    "posts",
    { title: row.code, pubDatetime: PUB, symbols: [row.code], agent: AI_AGENT.id },
    zh.seo,
    CTX
  );
  assert.ok(
    title.startsWith(`${row.code} ${row.name} `),
    `标题只有代码、没补上表里的名字「${row.name}」：${title}`
  );
});

test("C6 keywords：标的（代码和名字）→ 标签 → 智能体，去重", () => {
  const { keywords } = detailSeo(
    "posts",
    { title: "ZZZQ", pubDatetime: PUB, symbols: ["ZZZQ"], tags: ["财报", "财报"], agent: AI_AGENT.id },
    zh.seo,
    CTX
  );
  assert.deepEqual(keywords, ["ZZZQ", "财报", AI_AGENT.name]);
  // 表里有名字的票：名字从标的表来（symbolNames），不是条目上手填的。
  const known = symbolKeywords(["AAPL"]).filter(Boolean);
  assert.equal(known[0], "AAPL");
});

// ── 模板占位符：写错一个字 tplStr 就静默换成空 ─────────────────────────

test("模板：每一格该有的占位符都在，没有认不出的占位符（zh-CN 和 en）", () => {
  const ALLOWED = new Set(["subject", "agent", "date", "lead", "desc", "label", "coverage"]);
  const check = (where: string, tpl: string, must: string[]) => {
    for (const name of must) {
      assert.ok(tpl.includes(`{{${name}}}`), `${where} 少了 {{${name}}}：「${tpl}」`);
    }
    for (const [, name] of tpl.matchAll(/\{\{(\w+)\}\}/g)) {
      assert.ok(ALLOWED.has(name!), `${where} 有个认不出的占位符 {{${name}}} —— 会被静默换成空`);
    }
  };
  for (const [lang, t] of [["zh-CN", zh], ["en", en]] as const) {
    check(`${lang} seo.detail.posts.ai`, t.seo.detail.posts.ai, ["subject", "agent", "date"]);
    check(`${lang} seo.detail.posts.other`, t.seo.detail.posts.other, ["subject", "date"]);
    check(`${lang} seo.detail.qa.ai`, t.seo.detail.qa.ai, ["subject", "agent"]);
    check(`${lang} seo.detail.qa.other`, t.seo.detail.qa.other, ["subject"]);
    check(`${lang} seo.detail.guides`, t.seo.detail.guides, ["subject"]);
    check(`${lang} seo.detail.prompts`, t.seo.detail.prompts, ["subject"]);
    check(`${lang} seo.listDesc`, t.seo.listDesc, ["lead", "desc"]);
    check(`${lang} seo.symbolTitle`, t.seo.symbolTitle, ["label"]);
    check(`${lang} seo.symbolDesc`, t.seo.symbolDesc, ["label", "coverage"]);
    // other 那一版不许带 {{agent}}：人写的 / 没标的，名字那一格是空串。
    assert.ok(!t.seo.detail.posts.other.includes("{{agent}}"), `${lang} posts.other 带了 {{agent}}`);
    assert.ok(!t.seo.detail.qa.other.includes("{{agent}}"), `${lang} qa.other 带了 {{agent}}`);
  }
});

test("列表页：<title> 是 lead ＋ 站名，description 是 lead 接上页面上那句说明", () => {
  const seo = listSeo(zh.seo.lists.posts, zh.pages.postsDesc, zh.seo, "牢玩家");
  assert.equal(seo.title, `${zh.seo.lists.posts} | 牢玩家`);
  assert.ok(seo.description.startsWith(zh.seo.lists.posts), seo.description);
  assert.ok(seo.description.endsWith(zh.pages.postsDesc), "页面上那句说明没原样接上");
});

test("mergeKeywords：去空白、去空项、不分大小写去重（留第一次的写法）、保持顺序", () => {
  assert.deepEqual(
    mergeKeywords([" AAPL ", "", undefined, "苹果"], ["aapl", "美股分析"], ["美股分析"]),
    ["AAPL", "苹果", "美股分析"]
  );
  assert.deepEqual(mergeKeywords(), []);
});

test("结构化数据：WebSite / BlogPosting 带 keywords，空表不写那个键", () => {
  const base = { name: "x", url: "https://x/", description: "d", lang: "zh-CN" };
  const [site] = siteJsonLd({ ...base, keywords: ["美股分析"] })["@graph"] as Record<string, unknown>[];
  assert.deepEqual(site!.keywords, ["美股分析"]);
  const [bare] = siteJsonLd({ ...base, keywords: [] })["@graph"] as Record<string, unknown>[];
  assert.ok(!("keywords" in bare!), "空关键词表写成了 keywords: []");

  const post = { headline: "h", url: "https://x/1", lang: "zh-CN", author: { name: "a" }, publisher: { name: "p", url: "https://x/" } };
  assert.deepEqual(blogPostingJsonLd({ ...post, keywords: ["AAPL"] }).keywords, ["AAPL"]);
  assert.ok(!("keywords" in blogPostingJsonLd({ ...post, keywords: [] })));
  assert.ok(!("keywords" in blogPostingJsonLd(post)));
});

// ── D. 接线 ─────────────────────────────────────────────────────────

test("D1 Layout 印 <meta name=\"keywords\">：页面自己的在前、站点那张在后，空了不印", () => {
  const layout = stripComments(read("src/layouts/Layout.astro"));
  assert.match(layout, /mergeKeywords\(keywords, site\.keywords/, "Layout 没按「页面在前、站点在后」合并关键词");
  assert.match(
    layout,
    /metaKeywords\.length > 0 && \(\s*<meta name="keywords" content=\{metaKeywords\.join\(/,
    "Layout 没把合并后的关键词印进 <meta name=\"keywords\">（或者空了也印）"
  );
  const post = stripComments(read("src/layouts/PostLayout.astro"));
  assert.match(post, /<Layout[^>]*\{keywords\}/, "PostLayout 没把 keywords 传给 Layout");
  assert.match(post, /blogPostingJsonLd\(\{[\s\S]*?\bkeywords,\s*\}\)/, "PostLayout 没把 keywords 写进 JSON-LD");
});

test("D2 四个详情页都走 detailSeo（用自己的集合名），<title> 和 keywords 都传给 PostLayout", () => {
  for (const c of ROUTED) {
    const path = `src/pages/${c.urlPrefix}/[...slug]/index.astro`;
    const src = stripComments(read(path));
    assert.match(
      src,
      new RegExp(`detailSeo\\("${c.key}", \\w+\\.data, t\\.seo, \\{`),
      `${path} 没调 detailSeo("${c.key}", …) —— <title> 又变回只有标题`
    );
    assert.match(src, /dateFormat: t\.post\.dateOnlyFormat/, `${path} 的日期格式不是列表卡片那一个`);
    assert.match(src, /timezone: config\.site\.timezone/, `${path} 没传站点时区`);
    assert.match(src, /<PostLayout\s[^>]*title=\{seo\.title\}/, `${path} 没把 seo.title 传给 PostLayout`);
    assert.match(src, /<PostLayout\s[^>]*keywords=\{seo\.keywords\}/, `${path} 没把 seo.keywords 传给 PostLayout`);
    assert.doesNotMatch(src, /title=\{`\$\{title\} \| /, `${path} 还在手拼「标题 | 站名」`);
  }
});

test("D3 四个列表页都走 listSeo（用自己的那一格和自己的说明）", () => {
  for (const c of ROUTED) {
    const path = `src/pages/${c.urlPrefix}/[...page].astro`;
    const src = stripComments(read(path));
    assert.match(
      src,
      new RegExp(`listSeo\\(\\s*t\\.seo\\.lists\\.${c.key},\\s*t\\.pages\\.${c.key}Desc,`),
      `${path} 没用 listSeo(t.seo.lists.${c.key}, t.pages.${c.key}Desc, …)`
    );
    assert.match(src, /<Layout title=\{seo\.title\} description=\{seo\.description\}/, `${path} 没把 listSeo 的结果传给 Layout`);
  }
});

test("D4 标的页、标签页、首页", () => {
  const symbol = stripComments(read("src/pages/s/[symbol]/[...page].astro"));
  assert.match(symbol, /const seoLabel = symbolSubject\(code, \[\{ code, name \}\]\)/, "/s/<代码> 的 <title> 主语不是 symbolSubject 拼的（和详情页两种写法）");
  assert.match(symbol, /tplStr\(t\.seo\.symbolTitle, \{ label: seoLabel \}\)/, "/s/<代码> 的 <title> 没用 seo.symbolTitle");
  assert.match(symbol, /tplStr\(t\.seo\.symbolDesc, \{ label: seoLabel, coverage \}\)/, "/s/<代码> 的 description 没用 seo.symbolDesc");
  assert.match(symbol, /keywords=\{symbolKeywords\(\[code\]\)\}/, "/s/<代码> 没把这只票的代码和名字当关键词");

  const tag = stripComments(read("src/pages/t/[tag]/[...page].astro"));
  assert.match(tag, /keywords=\{\[tagName\]\}/, "/t/<标签> 没把标签当关键词");

  const index = stripComments(read("src/pages/index.astro"));
  assert.match(index, /<h1 class="sr-only">\{homeTitle\}<\/h1>/, "首页的 h1 又只剩站名了");
  assert.match(index, /siteJsonLd\(\{[\s\S]*?keywords: config\.site\.keywords/, "首页结构化数据没带 site.keywords");
});

/*
 * 破坏验证（2026-09-24，在隔离副本里逐处改坏、跑这个文件和 seo.test.ts、改回来）—— 24 处全红：
 *   seoMeta.ts   provenance 判据换成 true（C2）/ .tz() 换成 .utc()（C4）/ 不认条目时区（C4）/
 *                研究稿不补名字（C7）/ 词边界改回 includes（B1 B2）/ 被包含的段不让位（B1）/
 *                去重分大小写（mergeKeywords）/ 列表 description 不接说明（列表页）
 *   zh-CN.ts     {{agent}} 写成 {{agnet}}（C1 C3 模板）
 *   config       站点说明删掉「美股分析」（A1）
 *   structuredData  空表也写 keywords / BlogPosting 不写（结构化数据）
 *   Layout       不印 meta / 站点在前（D1）；PostLayout 不传 Layout / 不进 JSON-LD（D1）
 *   详情页       /r 回到手拼标题、/g 用错集合名、/q 不传 keywords（D2）
 *   列表页       /q 用了 posts 那一格（D3）
 *   首页 h1 / 首页 JSON-LD / 标的页 label / 标签页 keywords（D4）
 */
