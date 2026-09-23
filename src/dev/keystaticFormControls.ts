/**
 * 后台表单里那几种控件的版面补丁 —— **一张样式表，两件事**：
 *
 *   ① **多选那一格画成一排药丸**（标签、以及「能在哪些智能体底下跑」）；
 *   ② **下拉框铺满整行**（【2026-09-21 用户要的】「所有的这个选框都拉长一点，
 *      宽度铺满，好选择一点」）。Keystar 的 Picker 默认是**固定 192px**
 *      （实测），旁边的文本框却是满宽的 —— 一列控件里宽窄不一，而下拉的可点区域
 *      恰恰是最需要大的那个（里面的字最长）。
 *      ⚠ 只放大**表单里**的下拉：正文编辑器工具条上那个「Heading 1」也是同一种
 *        控件（`button[aria-haspopup="listbox"]`），铺满的话工具条就废了。
 *        判据是它在不在 `[data-lwj-help-head]` 里（那是 keystaticHelp 给每个
 *        **字段**标的），实测工具条那个不在。
 *
 * ## ① 药丸
 *
 * 【2026-09-21 用户要的】原话是「标签选择的时候应该用 label group 选择，list 太占空间了」。
 * 换成封闭词表那天它是 `fields.multiselect`，Keystatic 把每个选项渲染成一行 ——
 * 9 个标签就是 9 行、**321px 高**（实测），而这张表单在 `entryLayout: "content"`
 * 下只有 240px 宽的一条侧栏，等于一个"选分类"的动作吃掉大半屏。
 * 改成一排可换行的药丸之后同样 9 个选项是 **158px**，一眼扫得完。
 *
 * ## 为什么是一张样式表，而不是一段改 DOM 的脚本
 *
 * 这一格的结构本来就是"一个 flex 行里放着 N 个 `<label>`"（Keystar 的 CheckboxGroup
 * 自己就是 `display:flex; flex-wrap:wrap`），竖成一列**不是它的默认样子**，
 * 而是下面那条规矩把每个选项撑成整行的。所以这里一个节点都不用动、一个 `data-*`
 * 都不用设，只要把那一条压回去 —— 和 `keystaticFormLayout.ts` 守同一条红线
 * （那棵 DOM 是 React 管的，搬节点轻则弹回、重则当场抛），只是这一处连属性都不用设。
 *
 * ## ⚠ 它压的是**我们自己**的另一条规则，不是上游的
 *
 * `keystaticHelp.ts`（说明收成角标那一套）里有一条：
 *
 *     [data-lwj-help-head] > :not([data-lwj-help]):not([data-lwj-help-label]) { flex-basis: 100%; }
 *
 * 意思是"标签和角标排一行，控件自己占一行"—— 对文本框、下拉框都对。
 * 但 CheckboxGroup 把**标签、说明和 N 个选项塞在同一个容器里**，于是那条规则
 * 逐个把选项撑成整行。这就是那 9 行的来源（2026-09-21 在浏览器里逐条比出来的，
 * 一开始以为是 Keystatic 自己的样式）。
 *
 * 所以下面那条选择器的权重必须**盖过 (0,3,0)**：属性选择器写两遍
 * （`[role="group"][role="group"]`）把它抬到 (0,3,2)。
 * ★ 写两遍不是笔误，`keystaticHelp.ts` / `keystaticFormLayout.ts` 用的是同一个手法
 *   （理由：上游那些样式是 emotion 运行时插进 <head> 的，谁排在后面不由我们决定）。
 *   ⚠ 谁哪天"顺手"把重复的那一半删掉，这一格会**悄悄变回九行**——
 *   不报错、不影响数据，只是又占回大半屏。`tags.test.ts` 的 F 组钉着这件事。
 *
 * ## 认不出来就原样显示
 *
 * 选择器只认"`role=group` 底下、直接装着一个复选框的 `<label>`"——
 * 上游哪天换了结构，最坏是回到一列（也就是今天之前的样子），不会错位、不会丢选项。
 * ★ 它**不碰单独的复选框**（「置顶到首页」「草稿」）：那两个不在 `role=group` 里
 *   （实测），所以不会被画成药丸。
 *
 * ## 选中态：保留 Keystatic 自己那个勾选框
 *
 * 药丸的边框和底色跟着选中变，但**方框没有藏起来**。藏掉更好看，代价是
 * "选中"这件事就只剩颜色一处在说 —— 哪天 `:has()` 那条没命中（选择器被改、
 * 浏览器不支持），屏幕上就是一排长得一模一样的词，而**没有任何东西是错的**，
 * 只是看不出勾了哪个。留着方框，颜色那一层失效了也还有第二处说话。
 */

const STYLE_ID = "lwj-form-controls-style";

/** 多选里的一个选项：`role=group` 的直接子 `<label>`，里面第一层就是那个复选框。 */
const CHIP =
  '[role="group"][role="group"] > label:has(> input[type="checkbox"])';

/**
 * 表单里的一个下拉（Keystar 的 Picker 渲染成一个 `aria-haspopup="listbox"` 的按钮）。
 *
 * ★ `[data-lwj-help-head]` 那一段是**范围**，不是装饰：正文编辑器工具条上那个
 *   「Heading 1」是同一种按钮，它不在任何字段容器里（实测），所以被排除在外。
 * ★ 属性写两遍的理由同药丸那条（权重）。
 */
const FIELD = "[data-lwj-help-head][data-lwj-help-head]";
const PICKER = 'button[aria-haspopup="listbox"]';

export const FORM_CONTROLS_CSS = `
${CHIP} {
  flex: 0 0 auto;
  align-items: center;
  border: 1px solid var(--kui-color-border-neutral);
  border-radius: 999px;
  padding-block: 2px;
  padding-inline: 8px 12px;
}
${CHIP}:has(> input[type="checkbox"]:checked) {
  border-color: var(--kui-color-background-accent-emphasis);
  background: var(--kui-color-background-surface);
}
${FIELD}:has(${PICKER}) {
  width: 100%;
}
${FIELD} > *:has(> ${PICKER}) {
  width: 100%;
}
${FIELD} ${PICKER} {
  width: 100%;
  max-width: none;
}
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = FORM_CONTROLS_CSS;
  document.head.append(style);
}

/**
 * 挂载点：`keystatic.config.ts` 顶上那句副作用 import（同 `keystaticHelp.ts`）。
 *
 * ⚠ 那份配置**服务端也会加载**（/api/keystatic 那条路由），所以先看 `document`
 *   在不在 —— 裸写 `document` 在 Node 里当场抛，而 scripts/gate 的测试直接 import 这个文件。
 * ★ 不需要 MutationObserver：样式表插一次就够了，表单进进出出都由选择器命中，
 *   这也是它比另外两个 dev 脚本短这么多的原因。
 */
if (typeof document !== "undefined") {
  if (document.head) ensureStyle();
  else
    document.addEventListener("DOMContentLoaded", ensureStyle, { once: true });
}
