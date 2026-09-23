/**
 * 提示词的来源三档 —— 「这份提示词是谁写的」。
 *
 * ## 为什么这三个字符串值得一个自己的文件
 *
 * 提示词模块**收投稿**：读者把自己在用的提示词发过来，我在后台建一条发出去。
 * 于是"谁写的"在这个集合里**是内容，不是元数据** —— 和问答的「哪个智能体答的」
 * 站在同一个位置：一份来路不明的交易提示词，读者没有任何依据判断该不该照着用。
 *
 * 这三个值同时出现在几个地方，而且**必须逐字相同**：
 *
 *   src/config/promptOrigins.ts        ← 唯一的一份
 *      ├── src/content.config.ts             z.enum() + superRefine 的判据
 *      ├── keystatic.config.ts               后台下拉框的 value 和 defaultValue
 *      └── src/components/PromptOriginChip.astro   页面上分三档显示
 *
 * （原来还有第四处：`src/pages/p/[...slug].md.ts` 导出文件里那一行 `origin`。
 *  【2026-09-23】导出件改成正文原文、站方一个字都不加，那一行没了 ——
 *  分享者 / 投稿署名现在**只在页面上**，不跟着下载走的文件走。）
 *
 * 各写一份字面量的下场很具体：后台存 `"contributed"`、判据比 `"contribution"`，
 * 于是**每一条投稿都显示成「来源未标注」**，而后台、构建、闸门四处全绿。
 *
 * ## 为什么这里没有显示文案
 *
 * 和 `agents.ts` 不一样：那里的 `name` 是产品名（"Anthropic Claude"），不翻译；
 * 这里的三档是**界面用语**（「站长自己在用的」/「投稿 · 某某」/「来源未标注」），
 * 要跟着语言走，所以住在 `src/i18n/lang/*.ts` 的 `prompts` 那一组里。
 * 后台的下拉框文案是第三套（只有中文、只给我自己看），写在 keystatic.config.ts。
 *
 * ★ 这个文件**一个 import 都不许有** —— 理由同 `src/config/collections.ts`：
 *   `keystatic.config.ts` 是在 Astro 之外被加载的，碰不到 `astro:content`
 *   这类虚拟模块，也没有 `@/` 别名。
 */

/** 站长自己在用的。**完成态。** */
export const ORIGIN_SITE = "site";

/** 读者投稿。**完成态**，而且 schema 保证它一定带署名
 *  （投稿人要求匿名时写的是「匿名」—— 那同样是一个显式的答案，不是空白）。 */
export const ORIGIN_CONTRIBUTED = "contributed";

/**
 * 哨兵：**还没标是谁写的**。
 *
 * 理由和 `agents.ts` 的哨兵逐字相同：Keystatic 的 `fields.select` 的 `defaultValue`
 * 是必填的、永远有值（类型里没有 `?`，select 也没有 validation 入参），
 * 后台根本不存在"这个下拉框是空的"这一档。默认值落在一个真实档上 =
 * 人忘了选，存盘时就被静默标成那一档 —— 而文件上、页面上、闸门里都看不出
 * 这是默认值还是人挑的。那是**替投稿人认领**或者**替自己认领别人的东西**，
 * 比留空糟糕得多。
 *
 * 所以默认值落在哨兵上，让"还没标"成为一个能被 schema 拦下来的显式状态
 * （content.config.ts 里那条 superRefine：非草稿 + 哨兵 → 构建失败）。
 */
export const UNSPECIFIED_ORIGIN = "unspecified";

/** 给 zod 的 `z.enum()` 用。**至少两个元素**，否则类型推断会塌。
 *  顺序里哨兵排第一，和 `AGENTS` 同一个约定（默认值指着它）。 */
export const PROMPT_ORIGIN_IDS = [
  UNSPECIFIED_ORIGIN,
  ORIGIN_SITE,
  ORIGIN_CONTRIBUTED,
] as [string, string, ...string[]];
