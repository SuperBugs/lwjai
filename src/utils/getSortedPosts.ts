import { sortNewestCreated } from "./createdOrder";
import { postFilter } from "./postFilter";

/**
 * Returns posts that are eligible to be shown to users, sorted by creation time
 * descending (`pubDatetime`; same-minute ties by entry number).
 *
 * Note: filtering respects drafts and scheduled posts via `postFilter()`.
 *
 * ★【2026-09-23 用户要的】按**创建时间**排，不是上游的「最后更新」
 *   （`modDatetime ?? pubDatetime`）—— 后台改一个字就会自动填更新时间，
 *   按它排的话改过的老稿子全被顶回最前。判据和理由在 `createdOrder.ts`。
 *   全站每个列表的先后都从这里出（首页、/r /q /g /p、/t /s /ar、RSS、
 *   相关条目、详情页那排切换），别在调用方再 `.sort()` 一次。
 *
 * ★ 泛型而不是 `CollectionEntry<"posts">[]`：posts 和 qa 要能混排（首页、归档、
 *   标的页），而排序只用到 `id` 和 `pubDatetime`。
 *   **返回 `T[]` 而不是 `any[]`** —— 这里一旦塌成 any，所有调用点（Card 的 props、
 *   page.data.map）就全部失去类型检查，而那是静默的：字段名写错也不报。
 */
export function getSortedPosts<
  T extends { id: string; data: { draft?: boolean; pubDatetime: Date } },
>(posts: T[]): T[] {
  return sortNewestCreated(posts.filter(postFilter));
}
