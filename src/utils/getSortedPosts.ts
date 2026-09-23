import { postFilter } from "./postFilter";

/**
 * Returns posts that are eligible to be shown to users, sorted by “last updated”
 * descending (uses `modDatetime` when present, otherwise `pubDatetime`).
 *
 * Note: filtering respects drafts and scheduled posts via `postFilter()`.
 *
 * ★ 泛型而不是 `CollectionEntry<"posts">[]`：posts 和 qa 要能混排（首页、归档、
 *   标的页），而排序只用到日期两字段。
 *   **返回 `T[]` 而不是 `any[]`** —— 这里一旦塌成 any，所有调用点（Card 的 props、
 *   page.data.map）就全部失去类型检查，而那是静默的：字段名写错也不报。
 */
export function getSortedPosts<
  T extends {
    data: { draft?: boolean; pubDatetime: Date; modDatetime?: Date | null };
  },
>(posts: T[]): T[] {
  return posts
    .filter(postFilter)
    .sort(
      (a, b) =>
        Math.floor(
          new Date(b.data.modDatetime ?? b.data.pubDatetime).getTime() / 1000
        ) -
        Math.floor(
          new Date(a.data.modDatetime ?? a.data.pubDatetime).getTime() / 1000
        )
    );
}
