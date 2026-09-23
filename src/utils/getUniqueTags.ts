import { postFilter } from "./postFilter";
import { slugifyStr } from "./slugify";

type Tag = {
  tag: string;
  tagName: string;
};

/**
 * 能进标签索引的条目：**结构类型**，posts 和 qa 都能喂。
 *
 * ★ `tags` 在这里是**必填 `string[]`**，不是 optional —— 新集合的 schema 必须写
 *   `tags: z.array(z.string()).default([])`，才能进这个函数。
 */
export type TaggableEntry = {
  id: string;
  collection: string;
  data: { tags: string[]; draft?: boolean; pubDatetime: Date };
};

/**
 * Builds a de-duplicated, sorted tag list from posts.
 *
 * - Drafts and scheduled posts are excluded via `postFilter()`
 * - `tag` is the slug used in URLs; `tagName` is the original label for display
 * - Uniqueness is based on the slug (so differently-cased labels collapse)
 */
export function getUniqueTags(entries: TaggableEntry[]): Tag[] {
  const tags: Tag[] = entries
    .filter(postFilter)
    .flatMap(entry => {
      // ★【2026-09-18 实测】schema 里漏了 tags 的集合喂进来时，flatMap 会往数组里
      //   塞一个 undefined，接着 slugify 抛 `string argument expected`。
      //   **会响，但那条错看不出是哪个集合、哪一条** —— 排查时只能一个集合一个集合试。
      //   所以这里先自己抛一条带集合名和 id 的。
      //   （单个标签不是字符串的情况仍然死在 slugify 里；有 z.array(z.string())
      //    钉着的集合到不了那一步。）
      if (!Array.isArray(entry.data.tags)) {
        throw new Error(
          `${entry.collection}/${entry.id} 没有可用的 tags 字段（拿到的是 ${typeof entry.data.tags}）。` +
            `进标签索引的集合，schema 里必须有 tags: z.array(z.string()).default([])。`
        );
      }
      return entry.data.tags;
    })
    .map(tag => ({ tag: slugifyStr(tag), tagName: tag }))
    .filter(
      (value, index, self) =>
        self.findIndex(tag => tag.tag === value.tag) === index
    )
    .sort((tagA, tagB) => tagA.tag.localeCompare(tagB.tag));
  return tags;
}
