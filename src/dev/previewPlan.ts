/**
 * 后台那条「Preview」点下去之后该看到什么 —— **四档**，判据在这儿（纯函数、有测试）。
 *
 * 【2026-09-21 用户要的】「编辑的时候没有预览功能」。Keystatic 原生有这个口子：
 * `collection({ previewUrl })`，它把 `{slug}` 换成条目号，渲染成编辑页右上角
 * 「…」菜单里的一条 **Preview**（新标签打开）。★ 只有**编辑页**有，新建页没有 ——
 * 还没存盘的条目在盘上不存在，没什么可预览的。
 *
 * ## 为什么不直接把 previewUrl 指向 `/r/{slug}`
 *
 * 因为**草稿在 dev 里也没有页面**：`src/utils/postFilter.ts` 是
 * `!data.draft && (import.meta.env.DEV || 已过发布时间)` —— DEV 只放宽了"未到发布
 * 时间"那一半，`draft` 一直被排除（那个文件头上写着"一个字都不要改"）。
 * 而写稿的流程恰恰是**先存成草稿、预览、再发布**，也就是说最常见的那次预览
 * 会撞上站点 404 页。
 *
 * 404 在那一刻同时可能意味着三件事：这是草稿 / 还没存盘 / 地址刚改过。
 * 把它们摊成同一张 404 正是这个仓库第二节点名的错误。所以中间隔一层
 * `/_preview`（dev 专用路由，`src/dev/preview.astro`）：能看就直接跳过去，
 * 看不了就说清楚是哪一档。
 *
 * ## 四档
 *
 *   - `open`    —— 已发布：302 跳到真实地址。
 *   - `draft`   —— 是草稿：站上**没有**这个地址（不是坏了）。说清楚怎么让它有。
 *   - `missing` —— 盘上找不到这一条：多半是**还没按 Save**，或者地址刚改过。
 *   - `unknown` —— 参数不对 / 这个集合没有详情路由。这一档只会出现在有人手敲
 *                  地址、或者 previewUrl 写错的时候，说出来比静默跳首页强。
 *
 * ★ 零 import：`keystatic.config.ts` 在 Astro 之外被 Vite 加载，测试是裸 tsx 跑的。
 */

/** 四档。`open` 之外的三档都要在页面上长得不一样（`preview.astro`）。 */
export type PreviewTier = "open" | "draft" | "missing" | "unknown";

export function previewTier(input: {
  /** 这个集合在登记表里，而且有按条目的详情路由（`urlPrefix !== null`）。 */
  routable: boolean;
  /** 盘上真的有这一条（`getEntry` 拿到了）。 */
  found: boolean;
  /** 这一条的 `draft` 是不是 true。 */
  draft: boolean;
}): PreviewTier {
  if (!input.routable) return "unknown";
  if (!input.found) return "missing";
  // ⚠ 顺序要紧：先 found 后 draft —— 反过来的话"盘上没有"会因为 draft 默认 false
  //   落进 `open`，于是预览跳向一个不存在的地址，又变回一张 404。
  return input.draft ? "draft" : "open";
}

/**
 * 喂给 Keystatic `collection({ previewUrl })` 的那个串。
 *
 * ★ **`{slug}` 必须原样留着** —— Keystatic 是拿它做字面量替换的
 *   （`previewUrl.replace("{slug}", itemSlug)`）。顺手 `encodeURIComponent` 整个串
 *   会把它变成 `%7Bslug%7D`，替换当场失配：菜单里那条 Preview 照常在、点下去
 *   打开的是一个带着字面量 `{slug}` 的地址。**零报错**，测试钉着这一条。
 *
 * ⚠ 走查询串而不是 `/_preview/<集合>/<号>`：dev 注进来的路由如果是动态段，
 *   静态输出模式下要 `getStaticPaths`，而这一页要的正是"什么都还没有也能开"。
 */
export function previewUrlFor(collectionKey: string): string {
  return `/_preview?c=${encodeURIComponent(collectionKey)}&s={slug}`;
}
