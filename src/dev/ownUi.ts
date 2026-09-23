/**
 * 「这是我们自己画的界面控件，它的值**不是这条内容的一部分**」—— 一个属性，三处读。
 *
 * 【2026-09-23 加】后台多了两个搜索框（「标的」那一格、「这一条是…」那个下拉，
 * 见 `keystaticSymbolPicker.ts` / `keystaticGroupPicker.ts`）。它们是 `<input>`，
 * 而 `keystaticModTime.ts` 判"表单变了没有"的指纹是**把页面上每一个
 * input / textarea / select 的值压成一个数** —— 不排掉的话：
 *
 *   打开一条老稿子 → 在标的搜索框里敲「mu」→ 指纹变了 → **更新时间被盖成此刻**，
 *   表单变成已修改。人一个字都没改，只是找了一下票。
 *
 * 那正好撞碎 modTime 文件头边界 ③「打开一条看看就走，不留痕迹」，而且零报错 ——
 * 页面上只是多了一个时间，存盘的话它就进了 frontmatter。
 *
 * ★ 所以规矩是：我们自己挂进页面的控件，**根节点**一律带这个属性；
 *   modTime 的指纹跳过它底下的所有东西。钉子在 `scripts/gate/pickers.test.ts`。
 * ⚠ 反过来别滥用：Keystatic 自己的控件**一个都不许带**它 —— 带上就是那一格的改动
 *   从此不算数（改了标的却不盖更新时间，同样零报错）。
 */
export const OWN_UI_ATTR = "data-lwj-own-ui";

/** 给 `closest()` / `querySelector()` 用的那一份。 */
export const OWN_UI_SELECTOR = `[${OWN_UI_ATTR}]`;

/**
 * 这个控件的值算不算"这条内容变了"。modTime 的指纹逐个问它。
 *
 * 入参只要一个 `closest()` —— 这样测试能拿一个记账用的假元素跑它（仓库里没有 jsdom）。
 */
export function countsAsContent(el: {
  closest(selector: string): unknown;
}): boolean {
  return !el.closest(OWN_UI_SELECTOR);
}
