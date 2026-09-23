/**
 * Pagefind 分面「kind」的取值 —— **全站唯一的一份**。
 *
 * ## 为什么不直接用登记表的 label
 *
 * `src/config/collections.ts` 里 posts 的 label 是「研究稿」（闸门报数时印
 * 「研究稿 1 篇」，那里要的是量词搭得上的说法），而搜索分面上要的是「研究」。
 * 两者是**不同场合的两个词**，硬拗成一个会让其中一边读起来别扭。
 *
 * ## 为什么必须单点
 *
 * 这个值同时出现在两个地方，而且**必须逐字相同**：
 *
 *   ① 详情页的 `data-pagefind-filter={`kind:${SEARCH_KINDS.posts}`}`
 *      —— 决定索引里这一页被打上什么分面值
 *   ② 列表页的 `<CollectionSearch kind={SEARCH_KINDS.posts} />`
 *      —— 决定检索时按什么值过滤
 *
 * 两边各写一份字面量的话，改一处忘一处的症状是：**搜什么都 0 条，而且不报错**。
 * 构建绿、类型绿、页面绿，只有真去搜一次才发现 —— 而人最不会去搜的就是
 * 自己刚写完的那个集合。所以两边都从这里取。
 *
 * ★ 改这里的值 = 改索引里的分面值，**必须重新 `pnpm build`** 才生效
 *   （Pagefind 索引是构建产物）。只改代码不重建，线上还是旧值。
 */

/**
 * 分面的**键名**。
 *
 * ★【2026-09-18 改】原来这个键写死成字面量 `"kind"`，散在 5 个地方
 *   （三个详情页的 `data-pagefind-filter`、`/search` 的 `openFilters`、
 *   集合检索框的 `filters`）。两个问题：
 *
 *   ① PagefindUI 的筛选面板**直接把键名显示给读者**（首字母大写）——
 *      于是一个全中文的站，搜索页左边那一栏标题是英文的「Kind」。
 *      在构建产物里核实过，而 dev 里那一页永远是 "DEV mode Warning"，
 *      所以这一处只有构建之后才看得见。
 *   ② 5 份字面量和上面 SEARCH_KINDS 的处境一模一样：改一处忘一处 =
 *      **搜什么都 0 条且不报错**。这个文件存在的全部理由就是防这个，
 *      而键名却漏在外面。
 *
 * ⚠ 值和 `SEARCH_KINDS` 一样是**写进索引**的，改完必须重新 `pnpm build`。
 */
export const SEARCH_FILTER_KEY = "类型";

/** key 与 `src/config/collections.ts` 的 key 对齐；只有会被搜的集合才在这里。 */
export const SEARCH_KINDS = {
  posts: "研究",
  qa: "问答",
  guides: "教程",
  prompts: "提示词",
} as const;

export type SearchKind = (typeof SEARCH_KINDS)[keyof typeof SEARCH_KINDS];
