/**
 * 站内检索框的钉子 —— 【2026-09-23】首页加全站搜索框、/s 加标的筛选框那天补的。
 *
 * 同一个组件（src/components/CollectionSearch.astro）有两档：列表页顶上「只搜本集合」、
 * 首页导语下面「全站」；/s 顶上另有一个**就地筛选**的框（不走 Pagefind）。
 *
 *   A / C. **纯函数**（src/utils/searchBox.ts、src/config/symbols.ts 的 symbolSearchText）：
 *          范围 → 过滤条件、去 `/se` 的地址、结果地址、搜索词怎么匹配、筛选框三档。
 *   B / D. **接线**（grep 源码、先剥注释，同 seo.test.ts）：每一条都是"漏了零症状"的形态 ——
 *          页面照常渲染、构建全绿，只是框没了 / 搜错了范围 / 回车过去是个空框 /
 *          后台搜得到的票站上搜不到。
 *
 * 破坏实跑过：见文件末尾那段。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  SEARCH_QUERY_PARAM,
  filterTier,
  matchesQuery,
  searchFilters,
  searchPageHref,
  searchResultHref,
} from "../../src/utils/searchBox";
import { SEARCH_FILTER_KEY, SEARCH_KINDS } from "../../src/config/searchKinds";
import { requireCollectionSpec } from "../../src/config/collections";
import { SYMBOLS, symbolSearchText } from "../../src/config/symbols";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
/** 先剥注释再 grep —— 注释里写着"别把这条挪到 if 外面去"这种话，不剥的话删掉真东西照样绿。 */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

const COMPONENT = "src/components/CollectionSearch.astro";
const component = () => stripComments(read(COMPONENT));
/** 组件的客户端脚本那一段（`<script>` 到 `</script>`）。 */
const componentScript = () => {
  const src = component();
  const start = src.indexOf("<script>");
  const end = src.indexOf("</script>", start);
  assert.ok(start >= 0 && end > start, `${COMPONENT} 里找不到客户端 <script>`);
  return src.slice(start, end);
};

// ── A. 纯函数 ───────────────────────────────────────────────────────────────

test("A1 全站那一档：一个过滤条件都不加", () => {
  assert.deepEqual(searchFilters("site", SEARCH_FILTER_KEY, undefined), {});
  // 全站不需要键名：DOM 上少了 data-filter-key 也照样是全站
  assert.deepEqual(searchFilters("site", undefined, undefined), {});
});

test("A2 列表页那一档：只按本集合那个分面值过滤", () => {
  for (const kind of Object.values(SEARCH_KINDS)) {
    assert.deepEqual(searchFilters("collection", SEARCH_FILTER_KEY, kind), {
      [SEARCH_FILTER_KEY]: [kind],
    });
  }
});

test("A3 接错了就是 null —— ★ 丢了 kind 不许悄悄退成全站", () => {
  // 最要紧的是这一条：列表页那个框丢了 data-kind，退成 {} 的话它在「问答」页搜出研究稿来，
  // 而没有任何一处报错。null = 不挂，一个没反应的框自己点一下就看得出来。
  assert.equal(searchFilters("collection", SEARCH_FILTER_KEY, undefined), null);
  assert.equal(searchFilters("collection", SEARCH_FILTER_KEY, ""), null);
  assert.equal(searchFilters("collection", undefined, SEARCH_KINDS.qa), null);
  // 认不出的范围：不许按"没写就是全站"处理
  assert.equal(searchFilters(undefined, SEARCH_FILTER_KEY, SEARCH_KINDS.qa), null);
  assert.equal(searchFilters(undefined, SEARCH_FILTER_KEY, undefined), null);
  assert.equal(searchFilters("sitewide", SEARCH_FILTER_KEY, undefined), null);
});

test("A4 去 /se 的地址：空词就是光秃秃的搜索页，有词就带上、两头的空白剪掉", () => {
  assert.equal(searchPageHref("/se", ""), "/se");
  assert.equal(searchPageHref("/se", "   "), "/se");
  assert.equal(searchPageHref("/se", " TSLA "), `/se?${SEARCH_QUERY_PARAM}=TSLA`);

  // 读者真会敲的几种：中文 + 空格、带点的代码、带 & 的词。
  // 判据是 /se 那一侧**读得回原样**（它也是 URLSearchParams），不是某一种编码长相。
  for (const term of ["英伟达 财报", "BRK.B", "S&P 500", "做空？"]) {
    const href = searchPageHref("/se", term);
    const back = new URL(href, "https://lwj.ai").searchParams.get(
      SEARCH_QUERY_PARAM
    );
    assert.equal(back, term, `「${term}」去了 /se 读回来是「${back}」`);
    assert.ok(href.startsWith("/se?"), `${href} 不是 /se 的地址`);
  }
});

test("A5 结果地址剪掉末尾斜杠（Pagefind 给的是 /r/1036/，站上是 /r/1036）", () => {
  // 下面几条是 2026-09-23 从真索引里抄的形状（pagefind.search() 的 data().url / sub_results），
  // 不是照着正则编的：页面本身、中文标题转出来的百分号锚点、英文锚点、「关于」页。
  const cases: [string, string][] = [
    ["/r/1019/", "/r/1019"],
    [
      "/r/1019/#%E4%B8%80%E7%BB%93%E8%AE%BA%E9%80%9F%E8%A7%88",
      "/r/1019#%E4%B8%80%E7%BB%93%E8%AE%BA%E9%80%9F%E8%A7%88",
    ],
    ["/r/1031/#grmlgreenland-mines", "/r/1031#grmlgreenland-mines"],
    ["/a/", "/a"],
    // 已经是正式形态的原样放过；根路径的那一根斜杠就是它自己，不许剪
    ["/r/1019", "/r/1019"],
    ["/r/1019#grml", "/r/1019#grml"],
    ["/", "/"],
  ];
  for (const [from, to] of cases) {
    assert.equal(searchResultHref(from), to, `${from} 应该换成 ${to}`);
  }
  // PagefindUI 拿第一条子结果和页面地址比相等，两边换完必须还相等
  assert.equal(searchResultHref("/r/1019/"), searchResultHref("/r/1019"));
});

// ── B. 接线 ─────────────────────────────────────────────────────────────────

test("B1 首页挂着全站那一档（用户要的；删掉是零症状的）", () => {
  const home = stripComments(read("src/pages/index.astro"));
  assert.match(
    home,
    /import CollectionSearch from "@\/components\/CollectionSearch\.astro"/,
    "首页没有 import 检索框"
  );
  assert.match(
    home,
    /<CollectionSearch\b[^>]*\bsiteWide\b[^>]*\/>/,
    "首页没挂全站检索框（<CollectionSearch siteWide />）"
  );
  assert.doesNotMatch(
    home,
    /<CollectionSearch\b[^>]*\bkind=/,
    "首页那个框带了 kind —— 那就只搜一个集合了"
  );
});

test("B2 四个列表页仍是「只搜本集合」那一档，kind 从 SEARCH_KINDS 取", () => {
  for (const key of Object.keys(SEARCH_KINDS)) {
    const prefix = requireCollectionSpec(key).urlPrefix!;
    const page = stripComments(read(`src/pages/${prefix}/[...page].astro`));
    assert.match(
      page,
      new RegExp(`<CollectionSearch\\s+kind=\\{SEARCH_KINDS\\.${key}\\}\\s*/>`),
      `/${prefix} 列表页的检索框不再是 kind={SEARCH_KINDS.${key}}`
    );
  }
});

test("B3 范围显式写在 DOM 上，过滤条件只经 searchFilters() 一处算", () => {
  const src = component();
  assert.match(src, /data-scope=\{mode\.scope\}/, "组件没把范围写到 data-scope 上");
  const script = componentScript();
  assert.match(
    script,
    /searchFilters\(\s*root\.dataset\.scope\s*,/,
    "脚本没经 searchFilters() 算过滤条件"
  );
  assert.match(
    script,
    /debouncedSearch\(term,\s*\{\s*filters:\s*filters!,?\s*\}\)/,
    "debouncedSearch 用的不是 searchFilters() 算出来的那份"
  );
  // 就地再拼一份 `{ [键]: [kind] }` = 第二份判据，丢了 kind 时它不会返回 null
  assert.doesNotMatch(
    script,
    /filters:\s*\{\s*\[/,
    "脚本里又就地拼了一份过滤条件"
  );
});

test("B4 地址栏参数名只有一份：/se 读它、首页表单的 input 用它、两条链接按它拼", () => {
  const se = stripComments(read("src/pages/se.astro"));
  assert.match(se, /params\.get\(SEARCH_QUERY_PARAM\)/, "/se 读检索词没用 SEARCH_QUERY_PARAM");
  assert.match(se, /params\.set\(SEARCH_QUERY_PARAM,/, "/se 写回地址栏没用 SEARCH_QUERY_PARAM");
  assert.doesNotMatch(
    se,
    /params\.(get|set)\(\s*["'`]/,
    "/se 又写死了一个参数名字面量"
  );

  const src = component();
  assert.match(
    src,
    /name=\{siteWide \? SEARCH_QUERY_PARAM : undefined\}/,
    "全站那一档的 <input name> 不是 SEARCH_QUERY_PARAM —— 回车过去 /se 是个空框"
  );
  const script = componentScript();
  assert.match(script, /allLink\.href = searchPageHref\(/, "「搜全站」没带上框里的词");
  assert.match(script, /moreLink\.href = searchPageHref\(/, "「查看全部」没带上框里的词");
});

test("B5 全站那一档回车去 /se：外面是 GET 表单，Enter 只在列表页那一档拦", () => {
  const src = component();
  assert.match(src, /const Row = siteWide \? "form" : "div"/, "全站那一档外面不是表单了");
  assert.match(
    src,
    /siteWide \? \{ action: searchUrl, method: "get" \}/,
    "表单没指向 /se（或者不是 GET）"
  );

  const script = componentScript();
  // 拦 Enter 的 keydown 只能有一处，而且在 else（列表页那一档）里 ——
  // 挪到外面，全站那一档的表单就永远提交不出去，屏幕上是"按回车没反应"。
  const keydowns = script.match(/addEventListener\("keydown"/g) ?? [];
  assert.equal(keydowns.length, 1, `keydown 监听应该只有一处，现在是 ${keydowns.length}`);
  assert.match(
    script,
    /if \(siteWide\) \{[\s\S]*?\} else \{\s*input\.addEventListener\("keydown"/,
    "拦回车的 keydown 不在列表页那一档（else）里了"
  );
});

test("B6 「搜全站」「查看全部」和表单都走 ROUTES，不手写老地址", () => {
  const src = component();
  assert.match(
    src,
    /const searchUrl = getRelativeLocaleUrl\(locale, ROUTES\.search\)/,
    "去搜索页的地址不是从 ROUTES.search 算的"
  );
  assert.doesNotMatch(src, /getAssetPath\(\s*["']\/?search["']\s*\)/, "又手写了 /search 老地址");
});

test("B7 结果链接都经 searchResultHref()：两个检索框、/se 的页面和子结果", () => {
  const script = componentScript();
  assert.match(
    script,
    /a\.href = searchResultHref\(d\.url\)/,
    "检索框的结果链接没剪末尾斜杠 —— 本地每条 404、线上每条多跳一次"
  );
  const se = stripComments(read("src/pages/se.astro"));
  assert.match(se, /processResult:/, "/se 没挂 processResult");
  assert.match(
    se,
    /result\.url = searchResultHref\(result\.url\)/,
    "/se 的结果地址没剪末尾斜杠"
  );
  assert.match(
    se,
    /sub\.url = searchResultHref\(sub\.url\)/,
    "/se 的子结果（锚点那几条）没一起换 —— PagefindUI 会认不出哪条是页面本身"
  );
});

// ── C. 标的筛选框（/s）：纯函数 ─────────────────────────────────────────────

test("C1 一只票按代码、中文名、英文名都搜得到 —— 读者真会这么敲", () => {
  // 形状抄自标的表里真实的一行（src/data/symbols.json 的 MU）
  const hay = symbolSearchText({
    code: "MU",
    name: "美光科技",
    nameEn: "Micron Technology",
  });
  const hits = [
    "MU",
    "mu",
    "ＭＵ", // 中文输入法下敲出来的全角
    "美光",
    "micron",
    "Micron Technology",
    "美光 mu", // 空格切开，每段都得中
  ];
  for (const q of hits) {
    assert.equal(matchesQuery(hay, q), true, `「${q}」该找到 MU（${hay}）`);
  }
  for (const q of ["NVDA", "英伟达", "mu 甲骨文"]) {
    assert.equal(matchesQuery(hay, q), false, `「${q}」不该找到 MU（${hay}）`);
  }
  // 名字都没填的票：只有代码 —— 不编一个名字进去（CRWV 一开始就是这一档）
  assert.equal(symbolSearchText({ code: "CRWV" }), "CRWV");
});

test("C2 标的表里的每一只，按自己的代码 / 中文名 / 英文名都找得回来", () => {
  // 拿真表逐行过一遍：哪天 symbolSearchText 漏了一格（比如英文名），这里按行报出来
  assert.ok(SYMBOLS.length > 0, "标的表是空的 —— 这条用例什么都没测");
  for (const row of SYMBOLS) {
    const hay = symbolSearchText(row);
    for (const q of [row.code, row.code.toLowerCase(), row.name, row.nameEn]) {
      if (!q) continue;
      assert.equal(matchesQuery(hay, q), true, `${row.code}：搜「${q}」找不到它`);
    }
  }
});

test("C3 筛选框三档：没输入 / 有匹配 / 一只都没中，只有空白也算没输入", () => {
  assert.equal(filterTier("", 14), "idle");
  assert.equal(filterTier("   ", 14), "idle");
  assert.equal(filterTier("mu", 1), "some");
  assert.equal(filterTier(" mu ", 1), "some");
  assert.equal(filterTier("nvda", 0), "none");
});

// ── D. 标的筛选框（/s）：接线 ───────────────────────────────────────────────

const SYMBOLS_PAGE = "src/pages/s/index.astro";
/** /s 的客户端脚本那一段。 */
const symbolsScript = () => {
  const src = stripComments(read(SYMBOLS_PAGE));
  const start = src.indexOf("<script>");
  const end = src.indexOf("</script>", start);
  assert.ok(start >= 0 && end > start, `${SYMBOLS_PAGE} 里找不到客户端 <script>`);
  return src.slice(start, end);
};

test("D1 /s 挂着筛选框（有票的那一档里），每张卡带着 symbolSearchText 算的那串字", () => {
  const src = stripComments(read(SYMBOLS_PAGE));
  assert.match(
    src,
    /symbols\.length === 0 \?[\s\S]*?<EmptyState[\s\S]*?\) : \([\s\S]*?data-symbol-filter[\s\S]*?<SearchField/,
    "/s 的筛选框没了，或者跑到空状态那一档去了"
  );
  assert.match(
    src,
    /<li data-symbol-search=\{symbolSearchText\(symbolNames\(s\.code\)\)\}>/,
    "卡片上能被搜的字不是 symbolSearchText() 算的 —— 后台搜得到的票站上可能搜不到"
  );
  assert.match(src, /data-symbol-filter-status/, "筛选框底下那一行（三档）没了");
});

test("D2 /s 的脚本用的是共用那一条匹配规矩和三档，没有自己再写一份", () => {
  const script = symbolsScript();
  assert.match(
    script,
    /import \{[^}]*\bmatchesQuery\b[^}]*\} from "@\/utils\/searchBox"/,
    "/s 的脚本没从 searchBox.ts 拿 matchesQuery"
  );
  assert.match(script, /matchesQuery\(card\.dataset\.symbolSearch/, "筛卡片没走 matchesQuery()");
  assert.match(script, /filterTier\(query, shown\)/, "底下那一行没走 filterTier() 分档");
  assert.doesNotMatch(
    script,
    /\.toLowerCase\(|\.normalize\(|\.includes\(/,
    "/s 的脚本里又有一份自己的匹配（toLowerCase / normalize / includes）"
  );
  // 一只都没中那一档要给一条去全站搜的路，地址按共用的拼法
  assert.match(script, /searchPageHref\(searchUrl!, term\)/, "「在全站搜」那条链接没走 searchPageHref()");
  // 词进地址栏、带着 ?q= 进来能恢复 —— 参数名和 /se 同一个
  assert.match(script, /params\.set\(SEARCH_QUERY_PARAM, term\)/, "筛选词没写进地址栏");
  assert.match(script, /\.get\(\s*SEARCH_QUERY_PARAM\s*\)/, "带着 ?q= 进来不会恢复筛选");
});

test("D3 后台选择器没有自己的一份匹配规矩：pickerPlan 转出的就是 searchBox 那一份", () => {
  const plan = stripComments(read("src/dev/pickerPlan.ts"));
  assert.match(
    plan,
    /import \{[^}]*\bmatchesQuery\b[^}]*\} from "\.\.\/utils\/searchBox"/,
    "pickerPlan.ts 没从 searchBox.ts 拿 matchesQuery"
  );
  assert.doesNotMatch(
    plan,
    /function (matchesQuery|queryTerms|searchKey)\b/,
    "pickerPlan.ts 里又定义了一份 matchesQuery / queryTerms / searchKey"
  );
  assert.match(plan, /search: symbolSearchText\(r\)/, "后台标的那一格能被搜的字不是 symbolSearchText() 算的");
});

test("D4 站上的搜索输入框只有 SearchField 一处画（公开页面，不含 src/dev/ 后台）", () => {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${name}`;
      if (rel === "src/dev") continue;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.(astro|ts)$/.test(name) && /type="search"/.test(stripComments(read(rel)))) {
        found.push(rel);
      }
    }
  };
  walk("src");
  assert.deepEqual(found, ["src/components/SearchField.astro"], `又有别处手写了一个搜索框：${found.join("、")}`);
  for (const rel of [COMPONENT, SYMBOLS_PAGE]) {
    assert.match(stripComments(read(rel)), /<SearchField\b/, `${rel} 没用 SearchField`);
  }
});

/*
 * 破坏实跑过（2026-09-23，在临时副本上）：每一处单独改坏、跑这个文件、看对应那条红、改回来：
 *   ① searchFilters 认不出的范围返回 {}（= 退成全站）       → A3 红
 *   ② 首页 <CollectionSearch siteWide … /> 整行删掉          → B1 红
 *   ③ /q 列表页改成 <CollectionSearch siteWide />           → B2 红
 *   ④ 脚本改回就地拼 `filters: { [filterKey!]: [kind!] }`   → B3 红
 *   ⑤ /se 改回 params.get("q")                              → B4 红
 *   ⑥ 拦 Enter 的 keydown 挪出 else（两档都拦）              → B5 红
 *   ⑦ 「搜全站」改回 getAssetPath("search")                  → B6 红
 *   ⑧ 全站那一档 <input name> 换成另一个字面量               → B4 红
 *   ⑨ 「搜全站」不再带上框里的词                             → B4 红
 *   ⑩ searchResultHref 原样返回（不剪斜杠）                  → A5 红
 *   ⑪ 检索框改回 a.href = d.url                             → B7 红
 *   ⑫ /se 的 processResult 只换页面、不换子结果              → B7 红
 *   ⑬ symbolSearchText 丢了英文名                            → C1 C2 红
 *   ⑭ filterTier 把只有空白当成"搜了"                        → C3 红
 *   ⑮ /s 的筛选框里没有 SearchField 了                       → D1 D4 红
 *   ⑯ /s 卡片上能搜的字只剩代码                              → D1 红
 *   ⑰ /s 脚本自己写一份 toLowerCase().includes()             → D2 红
 *   ⑱ /s 脚本不走 filterTier 分档                            → D2 红
 *   ⑲ pickerPlan 又自己定义了一份 matchesQuery 那三个        → D3 红
 *   ⑳ 后台标的那一格能搜的字丢了英文名                       → D3 红
 *   ㉑ /s 手写一个 <input type="search"> 代替 SearchField     → D1 D4 红
 *   ㉒ /s 筛选词不写进地址栏                                  → D2 红
 *   （⑬～㉒ 是整个 src/ 拷进临时目录跑的 —— D4 要走遍 src。）
 */
