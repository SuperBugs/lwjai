/**
 * 标的代码的形状 —— schema、后台、导入脚本用同一份。
 *
 * 【2026-09-20 从 content.config.ts 挪出来】导入脚本（scripts/content/import.ts）
 * 是裸 tsx 跑的，加载不了 content.config.ts（它 import 了 astro:content）。
 * 抄一份正则过去，就是"两处各写一份、其中一处错了而全绿"那个形态（docs/gate.md 第 7 节）。
 * content.config.ts 继续 re-export 这两个名字，原来的调用方不用改。
 *
 * ★ 零 import。
 */

/** 美股代码：1~5 个大写字母，允许 BRK.B / RDS-A 这种带点或连字符的类别股。 */
export const SYMBOL_RE = /^[A-Z]{1,5}(?:[.-][A-Z]{1,2})?$/;

/**
 * 代码归一 —— **「这两个写法是不是同一只票」全站唯一判据**。
 * 大写、点换成连字符（`brk.b` / `BRK-B` / `BRK.B` 都是同一只）。
 *
 * ★【2026-09-22 抽出来的】在它之前这条规矩有两份各自写死的拷贝：
 *   `getUniqueSymbols.ts` 的 `symbolSlug()`（小写版，算 `/s/<代码>` 那段地址）和
 *   `related.ts` 的 `normalizeSymbol()`（大写版，判"是不是同一只票"）。
 *   两份都对，但**改一边不会有任何报错** —— 症状是详情页说"这只票还有 3 篇"
 *   而 `/s/brk-b` 那一页上只有 1 篇，两处各自都"正常工作"。
 *   现在那两个函数都调这一个，它们自己只负责大小写那一层。
 * ★ 标的表（`src/config/symbols.ts`）查行、判重也用它：表里同时有 `BRK.B` 和 `BRK-B`
 *   的话，两行会抢同一个 `/s/brk-b`，而后台、构建、闸门四处全绿。
 */
export function symbolKey(code: string): string {
  return code.trim().toUpperCase().replace(/\./g, "-");
}

/**
 * 这个标的是**怎么认出来**的。封闭枚举，四档。
 *
 * ★ 第四档 `unknown` 不许压扁成"没有标的"。
 *   "这篇没认出是哪只票"（要回来补）和"这篇本来就不讲某一只票"（宏观、复盘、方法论，
 *   不用补）在后台列表里必须长得不一样 —— 前者是待办，后者是完成态。
 *   所以 symbol 为空时，symbolSource 仍然有意义：`unknown` = 没认出来，
 *   `manual` + 空 symbol = 人看过了，确认它不讲单只票。
 */
export const SYMBOL_SOURCES = [
  "subject_line",
  "title",
  "manual",
  "unknown",
] as const;

export type SymbolSource = (typeof SYMBOL_SOURCES)[number];

/**
 * 两个名字是不是**同一个**（前后空白、大小写都不算区别）。
 *
 * 【2026-09-21 用户要的】「当中文名和英文名一致时，就只显示一个」。
 * 站上不少票没有通行中文译名，`symbolName` 和 `symbolNameEn` 两格填的就是同一个词
 * （Zoom / DraftKings）—— 那是常态，不是手滑。不去重的话：
 *   - 标的芯片印成 `ZM Zoom Zoom`（详情页那张 lg 芯片，两格都画）；
 *   - 发帖文案第一行是 `$ZM Zoom Zoom`。
 *
 * ★ 判据放在这里、两处都读它：同一条规矩抄成两份的那天，就是其中一处
 *   悄悄漏掉去重的那天（docs/engineering-notes.md 坑 8 那个形态）。
 *   读它的地方：`src/components/SymbolChip.astro`、`src/utils/sharePost.ts`。
 * ★ 空值一律**不算同一个**：两格都空的时候本来就没有东西可印，
 *   在这里返回 true 会让调用方以为"去过重了"。
 */
export function sameName(
  a: string | undefined,
  b: string | undefined
): boolean {
  const x = a?.trim().toLowerCase() ?? "";
  const y = b?.trim().toLowerCase() ?? "";
  return x !== "" && x === y;
}
