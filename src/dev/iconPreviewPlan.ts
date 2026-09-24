/**
 * 后台 logo 预览的**判据**（纯函数，零 DOM、零 `import.meta.glob`）——
 * 「这个下拉是不是我们认得的那种」「这个选项该画哪个 logo」「那张样式表长什么样」。
 *
 * 【2026-09-23 加】和 adminPlan.ts / publishPlan.ts / cardsPlan.ts 同一个分法：
 * 判据在 `*Plan.ts`，I/O（去认 DOM、贴属性、挂样式表）在 `keystaticIconPreview.ts`。
 * 拆开不是为了整洁：那一半 import 了 `src/utils/agentLogoUrls.ts`（`import.meta.glob`，
 * 只有 Vite 认），裸 tsx 加载不了 —— 不拆的话下面这几条只能靠 grep 源码去"测"，
 * 而 grep 钉不住"认错了下拉"这种逻辑错误。`agentIcons.test.ts` 的 E 组直接调这里。
 */
import {
  AGENT_ICONS,
  AGENT_ICON_UNSET,
  agentIconSlot,
  cssUrl,
  findAgentIcon,
} from "../config/agentIcons";
import { AGENT_IDS, findAgent } from "../config/agents";

/** 贴在要画 logo 的那个元素上：值是图标 id。 */
export const LOGO_ATTR = "data-lwj-logo";
/** 那个元素在哪（下拉按钮里 / 展开的列表里），两处的版面不一样。 */
export const LOGO_AT_ATTR = "data-lwj-logo-at";

export type PickerKind = {
  /** 调试和测试用的名字。 */
  name: "icon" | "agent";
  /** 那个隐藏 `<select>` 的选项 value 集合（不含 react-aria 多渲的那个空选项）。 */
  values: ReadonlySet<string>;
  /** 这个选项值画哪个 logo（图标 id）；`undefined` = 这一项不画。 */
  logoFor: (value: string) => string | undefined;
};

/**
 * 认得出的两种下拉，各自「选项值 → 画哪个 logo」。
 *
 *   ① 「智能体与模型」页那一格**图标**：值就是图标 id。
 *   ② 研究稿 / 问答 / 回答排序里那一格**哪个智能体**：值是智能体 id，画它在登记表里
 *      挑的那个 logo —— 走站上那一份 `agentIconSlot()`，所以后台这里看见的和站上
 *      那张芯片上画的**是同一个判据给的答案**。
 *      （这一格是顺手加的：图标是在登记表那页配的，可人**每天**碰到它的地方
 *      是新建一条内容时选智能体那一下。）
 *
 * ★ 两种的选项集合**有交集**（`claude` / `codex` 在两张表里同名），但**不相等**
 *   （智能体那边有 `human` / `unspecified` / `spark`，图标这边有 `gemini` / `openai` /
 *   `unset`）—— 而 `pickerFor()` 要求集合**正好相等**，所以一个下拉不可能同时认成两种。
 *   ⚠ 正因为有交集，**不许**改成"看选项的 key 在不在某张表里"来认下拉。
 * ⚠ 后台这里**只画完成态**（挑了 logo 的那几个）：「我自己」「未标注」、以及还没挑 logo
 *   的智能体一律不画。站上那三档（人形 / 虚线圈）是给**读者**分档用的；后台这一行的
 *   名字本身已经把话说完了，再画一圈虚线只是让选项列表参差不齐。
 */
export const PICKERS: readonly PickerKind[] = [
  {
    name: "icon",
    values: new Set([...AGENT_ICONS.map(i => i.id), AGENT_ICON_UNSET]),
    logoFor: value => findAgentIcon(value)?.id,
  },
  {
    name: "agent",
    values: new Set(AGENT_IDS),
    logoFor: value => {
      const slot = agentIconSlot(findAgent(value));
      return slot.tier === "picked" ? slot.icon.id : undefined;
    },
  },
];

/**
 * 这一串选项值是不是上面认得出的某一种。**集合正好相等才算** —— 子集不算，
 * 否则一个恰好只列了 `claude` / `codex` 两项的下拉会被认成图标那一格，
 * 而智能体下拉里正好就有这两个 key。
 * ⚠ react-aria 的 HiddenSelect 头一个是空 `<option>`，调用方先把 `""` 滤掉再传进来。
 */
export function pickerFor(values: readonly string[]): PickerKind | undefined {
  return PICKERS.find(
    kind =>
      values.length === kind.values.size &&
      values.every(v => kind.values.has(v))
  );
}

/**
 * 预览的样式表。每个 logo 一条规则，画法跟着 `tone`（同站上 AgentLogo.astro）：
 * 彩色 = 背景图，单色 = mask ＋ `currentColor` —— 后台自己有深色主题，
 * 单色 logo 画成背景图的话深色下是一块看不见的黑。
 *
 * ★ 地址一律走 `cssUrl()`（转义 ＋ 双引号）—— 手拼 `url('…')` 碰上带单引号的地址
 *   整条声明作废，站上那一侧 2026-09-23 实测踩到过。
 * ★ 两个位置两套版面：
 *   - 下拉按钮里：那个文字 `<span>` 的 `::before`，行内、排在名字前面
 *     （那个 span 的两个伪元素都是空的，实测）。
 *   - 展开的列表里：选项里那一格网格**本来就留着一个 `icon` 区**
 *     （`grid-template-areas: ". icon text . kbd checkmark ."`，没东西时 0 宽）——
 *     放进 `grid-area: icon`，正是它设计好的位置。
 *     ⚠ **不许**画在文字那个 span 的伪元素上：它的 `::before` / `::after` 都已经被
 *       Keystar 占了（`content: " "; display: table`，给行高做的修正）。
 */
export function previewStyleSheet(urlOf: (iconId: string) => string): string {
  const base = [
    `[${LOGO_ATTR}]::before {`,
    `  content: "";`,
    `  flex: none;`,
    `  width: 1.15em;`,
    `  height: 1.15em;`,
    `  background: no-repeat center / contain;`,
    `}`,
    `[${LOGO_AT_ATTR}="trigger"]::before {`,
    `  display: inline-block;`,
    `  vertical-align: -0.2em;`,
    `  margin-inline-end: 0.5em;`,
    `}`,
    `[${LOGO_AT_ATTR}="option"]::before {`,
    `  grid-area: icon;`,
    `  align-self: center;`,
    `  margin-inline-end: 0.5em;`,
    `}`,
  ];
  const perIcon = AGENT_ICONS.map(icon => {
    const url = cssUrl(urlOf(icon.id));
    return icon.tone === "color"
      ? `[${LOGO_ATTR}="${icon.id}"]::before { background-image: ${url}; }`
      : `[${LOGO_ATTR}="${icon.id}"]::before { background-color: currentColor; ` +
          `-webkit-mask: ${url} center / contain no-repeat; ` +
          `mask: ${url} center / contain no-repeat; }`;
  });
  return [...base, ...perIcon].join("\n");
}
