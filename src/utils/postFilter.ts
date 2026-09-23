import config from "@/config";

/**
 * 能喂给 `postFilter` 的条目：**只要求这两个字段**。
 *
 * 写成结构类型而不是 `CollectionEntry<"posts">`，是因为 posts / qa 两个集合
 * 共用这一条过滤口径。复制一份给 qa 用的后果见 docs/engineering-notes.md 坑 1 ——
 * 漏掉 DEV 分支或 scheduledPostMargin，症状是「dev 里有、dist 里没有、构建还是绿的」。
 */
export type FilterableEntry = { data: { draft?: boolean; pubDatetime: Date } };

/**
 * Determines whether a post is eligible to be listed/rendered.
 *
 * - Excludes drafts always
 * - In production, excludes scheduled posts until `pubDatetime` minus the configured margin
 * - In dev, always shows non-draft posts to make authoring easier
 *
 * ⚠ 下面那行判据是 docs/engineering-notes.md 坑 1 的根源（定时稿在 dev 里看得见、build 里
 *   页面根本不生成而且不报错）。**一个字都不要改** —— 这一轮只放宽入参类型。
 */
export function postFilter({ data }: FilterableEntry): boolean {
  const isPublishTimePassed =
    Date.now() >
    new Date(data.pubDatetime).getTime() - config.posts.scheduledPostMargin;
  return !data.draft && (import.meta.env.DEV || isPublishTimePassed);
}
