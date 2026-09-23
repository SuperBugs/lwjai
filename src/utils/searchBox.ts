/**
 * 站内检索框的判据。【2026-09-23】
 *
 * 读这一份的：列表页那个「只搜本集合」的框、首页那个「全站」的框
 * （两个都是 `src/components/CollectionSearch.astro`）、`/se` 搜索页、
 * `/s` 标的索引顶上那个筛选框，以及后台的几个选择器（搜索词怎么匹配那一节）。
 *
 * ★ 零依赖：客户端脚本会把它打进浏览器的包，`scripts/gate/search.test.ts`
 *   又要能用裸 tsx 跑它。别在这里 import `@/config` —— 那会把整份站点配置打进客户端。
 */

// ── 搜索词怎么匹配：站上 /s 的筛选框和后台的选择器共用这一条 ─────────────────
//
// 【2026-09-23】这三个函数原来在 `src/dev/pickerPlan.ts`（后台选择器）。/s 要同一条规矩，
// 而那个文件在 src/dev/ 底下、还 import 了整张标的表 —— 公开页面的包不该把它带进来。
// 搬到这里，pickerPlan.ts 原样转出去，后台那几处的 import 一个都不用改。

/**
 * 比较之前两边都过一遍：**NFKC + 小写**。
 *
 * NFKC 不是讲究：中文输入法下敲出来的常常是全角（`ＭＵ`、`０９`），而选项里的
 * 括号和冒号本来就是全角的（「补一份研究：MU（09-23）」）。只转小写的话，
 * 半角的 `(09` 找不到全角的 `（09`，屏幕上是「没有匹配」而那一项明明就在。
 * 两边同一个函数，所以全角半角怎么混着敲都对得上。
 * ⚠ NFKC 会把 `①` `②` 折成 `1` `2` —— 两边一起折，不影响匹配，只是别拿它做显示。
 */
export function searchKey(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

/** 搜索词按空白切开：**每一段都得命中**（`mu 09` = 既有 mu 又有 09）。 */
export function queryTerms(query: string): string[] {
  return searchKey(query)
    .split(/\s+/u)
    .filter(t => t !== "");
}

/** 空搜索词 = 全都算命中（搜索框空着就是"不筛"）。 */
export function matchesQuery(haystack: string, query: string): boolean {
  const terms = queryTerms(query);
  if (terms.length === 0) return true;
  const h = searchKey(haystack);
  return terms.every(t => h.includes(t));
}

/**
 * 一个"就地筛选"的框（/s 那一个）现在处在哪一档。三档，屏幕上长得不一样：
 *
 *   idle → 没输入（只有空白也算）：全都显示着，底下那一行不画
 *   some → 有匹配：「匹配 3 只（共 14 只）」—— **总数必须在**，
 *          不然筛掉之后的那几张卡读起来像"站上就这几只"
 *   none → 一只都没中：说一句没有，**再给一条去全站搜的路** ——
 *          没有这只票的专页 ≠ 站上没提过它
 */
export type FilterTier = "idle" | "some" | "none";

export function filterTier(query: string, shown: number): FilterTier {
  if (queryTerms(query).length === 0) return "idle";
  return shown > 0 ? "some" : "none";
}

// ── Pagefind 那几个框 ─────────────────────────────────────────────────────

/**
 * `/se` 从地址栏读检索词用的参数名（`/se?q=TSLA`）。
 *
 * 读它的有三处：`/se` 自己（读进来、边搜边写回地址栏）、首页那个框回车提交时的
 * `<input name>`、「搜全站」「查看全部」两条链接拼出来的地址。
 * ⚠ 对不上是零症状的：回车照样跳到 `/se`，只是那一页的框是空的 ——
 *   读者以为自己敲的词丢了，而构建、类型、页面四处全绿。
 */
export const SEARCH_QUERY_PARAM = "q";

/** 检索框的两档范围。服务端写在 DOM 上（`data-scope`），见 `searchFilters()` 为什么。 */
export type SearchScope = "site" | "collection";

/**
 * 这一个框检索时带什么过滤条件。
 *
 *   site                      → `{}`：全站，一个条件都不加
 *   collection + 键名 + kind  → `{ [键名]: [kind] }`：只搜这一档
 *   其余                      → `null`：**接错了**（collection 却缺键名或 kind、
 *                                认不出的 scope）。调用方不挂这个框
 *
 * ★ 范围是**显式**的一格，不是"没有 kind 就当全站"。那样推的失败方向是反的：
 *   哪天列表页那个框丢了 `data-kind`，它会**悄悄变成全站搜索** —— 在「问答」页
 *   搜出研究稿来，没有任何一处报错。显式之后丢了就是 null、框不挂：
 *   一个没反应的框自己点一下就看得出来，一个搜错范围的框看不出来。
 */
export function searchFilters(
  scope: string | undefined,
  filterKey: string | undefined,
  kind: string | undefined
): Record<string, string[]> | null {
  if (scope === "site") return {};
  if (scope === "collection" && filterKey && kind) {
    return { [filterKey]: [kind] };
  }
  return null;
}

/**
 * 去搜索页，并把检索词一起带过去（`/se?q=…`）。词是空的就是光秃秃的搜索页。
 *
 * `searchUrl` 由服务端算好（`getRelativeLocaleUrl(locale, ROUTES.search)`）——
 * 这里只管拼查询串，不许再拼一遍路径（站内链接一律走 `ROUTES`）。
 */
export function searchPageHref(searchUrl: string, term: string): string {
  const q = term.trim();
  if (!q) return searchUrl;
  return `${searchUrl}?${new URLSearchParams({ [SEARCH_QUERY_PARAM]: q })}`;
}

/**
 * Pagefind 给的结果地址 → 站上的正式地址（**不带末尾斜杠**）。
 *
 * 【2026-09-23 实测】Pagefind 按产物的文件路径起地址：`dist/r/1036/index.html` →
 * `/r/1036/`，而全站口径是不带斜杠（astro.config.ts 的 `trailingSlash: "never"`）。
 * 不换的话每一条搜索结果：
 *   - `astro dev` / `astro preview` 里**直接 404**（Astro 的 never 在本地是严格匹配）；
 *   - 线上先被 Cloudflare 跳一次（wrangler.jsonc 的 `drop-trailing-slash`）才到。
 * 两个检索框和 `/se` 的子结果都读这一份。子结果带锚点（`/r/1036/#估值`），斜杠在
 * `#` 前面，一起剪掉；根路径 `/` 原样留着。
 */
export function searchResultHref(url: string): string {
  const m = /^([^?#]*?)\/+([?#].*)?$/.exec(url);
  if (!m || m[1] === "") return url;
  return m[1] + (m[2] ?? "");
}
