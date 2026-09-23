/**
 * 「这一份**最后改的是哪一刻**」—— 全站唯一判据。【2026-09-22 加】
 *
 * 三个消费方读它：
 *
 *   - `src/utils/structuredData.ts` 的 `blogPostingJsonLd()` —— 详情页 JSON-LD 的 `dateModified`
 *   - `src/config/sitemap.ts` 的 `buildLastmodIndex()`       —— sitemap 里每条 `<lastmod>`
 *   - `scripts/content/plan.ts` 的 `entryTime()`             —— 批量清理划时间区间（只用解析器那半）
 *
 * ## 为什么 `modDatetime` 没填要退回 `pubDatetime`
 *
 * **一篇发出去就没再动过的稿子，最近一次改动就是发布那一次。** 这不是"找个值填坑"：
 * sitemaps.org 和 Google 对 lastmod 的定义都是「这一页最后一次修改的时间」，
 * 而这个问题对一篇没改过的稿子有确定答案 —— 后台那一格留空是**完成态**
 * （`src/dev/keystaticModTime.ts`：新条目留空，人清空过也永远不再碰），
 * 不是"还没填"。所以这里不是在猜。
 *
 * ★ 这一条**必须和 JSON-LD 同源**。页面 `<script type="application/ld+json">` 里的
 *   `dateModified` 和 sitemap 里的 `<lastmod>` 回答的是**同一个问题**，而且两者会被
 *   同一个抓取方在几秒内先后读到。两处各写一份的那天就是它们开始各说各话的那天 ——
 *   docs/engineering-notes.md 坑 8 / 坑 22 同一个形态（一句断言出现在两处，改一处漏一处，四处全绿）。
 *   所以 `blogPostingJsonLd()` 里原来那句 `dateModified ?? datePublished` 搬到了这里。
 *
 * ⚠ 两个都没有时返回 `undefined`，调用方**不许编一个日期**。
 *   `src/content/pages/about.md` 的 schema 里压根没有这两格（`plan.ts` 那张表也记着
 *   这件事），列表页 / 标签页 / 首页更没有。**一个编出来的 lastmod 比没有 lastmod 贵**：
 *   抓取方按它决定要不要回来，而一个永远等于"上次构建时间"的 lastmod 会让它
 *   干脆不再看这个字段 —— 于是真正改过的那几篇也跟着失去这个信号。
 *
 * ⚠ **刻意不用 git 提交时间**（`git log -1 --format=%cI <文件>`）。两个理由：
 *   ① 站上印给读者的是 frontmatter 那两格，git 时间会和它对不上（改个错别字
 *      重新提交，lastmod 动了而页面上的时间没动 —— 又是"同一个问题两个答案"）；
 *   ② Cloudflare Workers Builds 的克隆深度不保证，历史不全时算出来的是构建时间。
 */

/**
 * 从 frontmatter 的一格里读出时刻。读不出来（没填 / 是空串 / 不是日期）= `undefined`。
 *
 * ⚠ **YAML 会把没加引号的 `2026-09-17T18:30:00Z` 直接解析成 `Date`**，加了引号的
 *   还是字符串 —— 同一个字段在两条稿子里可能是两种类型，取决于那一行当初谁写的
 *   （后台和 `pnpm content:import` 写出来的不带引号，手写 frontmatter 的人常加引号）。
 *   这件事**只许在这一处处理**：`scripts/content/plan.ts` 的 `entryTime()`
 *   曾经另有一份一模一样的三元表达式，现在它调这里。
 */
export function frontmatterDate(raw: unknown): Date | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const ms =
    raw instanceof Date
      ? raw.getTime()
      : typeof raw === "string" || typeof raw === "number"
        ? new Date(raw).getTime()
        : NaN;
  return Number.isNaN(ms) ? undefined : new Date(ms);
}

/**
 * 见文件头：`modDatetime` 优先，没填退回 `pubDatetime`，两个都没有就**没有答案**。
 *
 * 收 `Date | null | undefined` 是为了迁就两边的调用方：JSON-LD 那边
 * `dateModified` 显式写的是 `Date | null`，frontmatter 那边读出来是 `undefined`。
 */
export function lastModifiedAt(
  pubDatetime?: Date | null,
  modDatetime?: Date | null
): Date | undefined {
  return modDatetime ?? pubDatetime ?? undefined;
}
