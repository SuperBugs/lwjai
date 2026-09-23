/**
 * **不属于任何内容集合**的那几个页面的地址。【2026-09-21】
 *
 * 四类内容（研究稿 / 问答 / 教程 / 提示词）的前缀在 `collections.ts` 的 `urlPrefix` 里，
 * 由 `entryUrl()` / `collectionUrl()` 推 —— 那边是一份判据，这里是另一份。
 * 两边都只有一处，**别在组件里手写路径字符串**。
 *
 * ## 为什么这些值这么短
 *
 * 【2026-09-21 站长定的】全站口径就是「能短则短」：`/a` 而不是 `/about`。
 * 代价是地址栏里看不出是什么页 —— 站长明确接受了这一条，理由是这几页本来就不靠
 * 分享（真正会被贴出去的是内容页和标签页）。
 *
 * ## ⚠ 这张表**管不住路由本身**
 *
 * Astro 的路由是**按文件名**来的：`/a` 之所以存在，是因为盘上有 `src/pages/a.astro`。
 * 这个文件改一个值，路由**不会**跟着动 —— 只有链接会动，于是全站链接指向 404，
 * 而构建、类型检查、闸门四处全绿（Astro 不核对 `<a href>`）。
 *
 * ★ 所以 `scripts/gate/routes.test.ts` 拿这张表和 `src/pages/` 下的真实文件对账。
 *   改这里的任何一个值，必须同时改那个文件名，否则测试红。
 */

export const ROUTES = {
  /** 「关于」。原来是 /about。 */
  about: "a",
  /** 搜索页（工具页，noindex 且不进 sitemap）。原来是 /search。 */
  search: "se",
  /** 归档。`showArchives` 默认关着，路由仍然生成。原来是 /archives。 */
  archives: "ar",
  /** 标签索引和每个标签的列表页。原来是 /tags。 */
  tags: "t",
  /** 标的索引（/s/orcl）。本来就是一个字母，没动过。 */
  symbols: "s",
} as const;

export type RouteKey = keyof typeof ROUTES;

/** 带前导斜杠的站内路径，**不带末尾斜杠**（全站口径，见 astro.config.ts 的 trailingSlash）。 */
export const routePath = (key: RouteKey): string => `/${ROUTES[key]}`;
