/**
 * 后台下拉框里的 **logo 预览**：选中的 logo 画在下拉框里名字前面，
 * 展开的列表里每一项前面也画着它自己的 logo。两种下拉：
 * 「智能体与模型」页那一格「图标」，以及研究稿 / 问答 / 回答排序里「哪个智能体」那一格。
 *
 * 【2026-09-23 用户要的】「去网络上找合适的，给我配置到管理端」。logo 换成品牌标之后，
 * 下拉里如果只有一列名字（「Gemini（Google）」「Codex（OpenAI）」），挑的时候得去站上
 * 才看得见挑的是什么 —— 那不叫配置到管理端。
 *
 * ## 判据一个字都不在这里
 *
 * 「认得哪几种下拉 / 哪一项画哪个 logo / 样式表长什么样」在 `./iconPreviewPlan.ts`
 * （纯函数、有单测）；logo 清单在 `src/config/agentIcons.ts`；「id → 地址」在
 * `src/utils/agentLogoUrls.ts`（站上的 `AgentLogo.astro` 读的是同一份）。
 * 这个文件只管**去认那个下拉、贴一个属性、挂一张样式表**。
 *
 * ## 三条脾气（和 keystaticAgentModel.ts / keystaticHelp.ts 同一套）
 *
 *   ① **只设 `data-*`，不往 React 管的 DOM 里插节点、不碰 `style`。** 图是 CSS 的
 *      `::before` 画的，那张样式表挂在 `<head>` 里。⚠ 下拉按钮本身的 `style` React 在写
 *      （实测 `box-shadow: none`），碰了下一次渲染就被写回去。
 *   ② **按选项 value 集合认那一格，不认标签文字。** 那个隐藏 `<select>` 的选项集合
 *      正好是一张封闭登记表 —— 改了中文标签也不会失效。展开的列表不在字段里
 *      （portal 到了 body 底下），靠下拉按钮的 `aria-controls` 找回来。
 *      ⚠ **不许**只看选项的 `data-key`：智能体那个下拉里也有 `claude` / `codex` 两个 key，
 *      和图标表里的两个 id 同名 —— 只看 key 会把两种下拉搅在一起。
 *   ③ **轮询，不监听。** 值变了 react-aria 不发事件（keystaticGroupFill.ts 先踩的），
 *      展开的列表是虚拟滚动、滚一下就换一批节点。
 *
 * ★ 认不出结构就**什么都不做**：最坏是回到只有名字的下拉，选项和存盘一样照常 ——
 *   这是一个预览，不是这一格能不能用的前提。
 */
import { findAgentIcon } from "../config/agentIcons";
import {
  LOGO_AT_ATTR,
  LOGO_ATTR,
  pickerFor,
  previewStyleSheet,
} from "./iconPreviewPlan";
import { agentLogoUrl } from "../utils/agentLogoUrls";

const TICK_MS = 250;
const STYLE_ID = "lwj-icon-preview-style";

/**
 * 这个隐藏 `<select>` 对应的那个可见的下拉按钮：往上找，第一个装着下拉按钮的祖先里
 * **恰好一个**才算（实测往上三层就是 Picker 自己的容器）。
 * 找到两个就是认错了容器 —— 宁可不画，也不给别的下拉挂上 logo。
 */
function triggerOf(select: HTMLSelectElement): HTMLElement | null {
  let node: HTMLElement | null = select.parentElement;
  for (let hops = 0; node && hops < 6; hops++, node = node.parentElement) {
    const found = node.querySelectorAll<HTMLElement>(
      'button[aria-haspopup="listbox"]'
    );
    if (found.length === 1) return found[0]!;
    if (found.length > 1) return null;
  }
  return null;
}

/** 贴上 / 撕掉。值没变就不动 DOM（每 250ms 一拍，别每拍都写一遍属性）。 */
function mark(el: Element, iconId: string | undefined, at: string): void {
  if (iconId) {
    if (el.getAttribute(LOGO_ATTR) !== iconId)
      el.setAttribute(LOGO_ATTR, iconId);
    if (el.getAttribute(LOGO_AT_ATTR) !== at) el.setAttribute(LOGO_AT_ATTR, at);
  } else if (el.hasAttribute(LOGO_ATTR)) {
    el.removeAttribute(LOGO_ATTR);
    el.removeAttribute(LOGO_AT_ATTR);
  }
}

function tick(): void {
  for (const select of document.querySelectorAll("select")) {
    // ⚠ react-aria 的 HiddenSelect 头一个是空 `<option>`，滤掉再认。
    const kind = pickerFor(
      [...select.options].map(o => o.value).filter(v => v !== "")
    );
    if (!kind) continue;
    const trigger = triggerOf(select);
    if (!trigger) continue;

    // ① 下拉按钮里那个文字 span：画**当前选中的**那个。选到一个不画的（「还没挑」、
    //    「我自己」…）就撕掉 —— 上一次选的那个 logo 不许留在一个新名字前面。
    const label = trigger.querySelector("span");
    if (label) mark(label, kind.logoFor(select.value), "trigger");

    // ② 展开的列表（portal 在 body 底下），靠 aria-controls 找回来 —— 只有这一个是我们的。
    const listId = trigger.getAttribute("aria-controls");
    const listbox = listId ? document.getElementById(listId) : null;
    if (!listbox) continue;
    for (const option of listbox.querySelectorAll(
      '[role="option"][data-key]'
    )) {
      const grid = option.firstElementChild;
      if (grid)
        mark(
          grid,
          kind.logoFor(option.getAttribute("data-key") ?? ""),
          "option"
        );
    }
  }
}

export function mountIconPreview(): void {
  // 这份配置服务端也会加载（/api/keystatic 那条路由），所以第一个判断是 document。
  if (typeof document === "undefined") return;
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    // ★ 地址从站上那一份拿（agentLogoUrls.ts）。找不到文件它会抛 —— 在后台里抛就是
    //   整个预览不装、控制台里留一行，而下拉照常能用；站上那一侧同一个抛是构建期红。
    try {
      style.textContent = previewStyleSheet(id =>
        agentLogoUrl(findAgentIcon(id)!)
      );
    } catch (e) {
      // eslint-disable-next-line no-console -- 预览静默不装的话，后台里只是"logo 没了"，没人会知道是哪个文件没了
      console.warn("[keystaticIconPreview] logo 预览没装上：", e);
      return;
    }
    document.head.append(style);
  }
  window.setInterval(tick, TICK_MS);
}
