/**
 * 后台「标的」那一格：**搜索框 + 「已勾了哪几只」+ 一个固定高度的滚动框**。
 *
 * 【2026-09-23 用户要的】原话「当标的多了应该是要滚动框展示的，并且要支持搜索标的功能」。
 * 那一格是 `fields.multiselect`，药丸是一排可换行的（`keystaticFormControls.ts`）——
 * 表越长这一格越高，而它挤在 `entryLayout: "content"` 那条 240px 宽的侧栏里：
 * 14 只票就是 7 行，下面的「智能体」「模型」被推出屏幕。
 *
 * ## 为什么是"藏起 Keystatic 的药丸、画自己的"，而不是给它套一个滚动框
 *
 * 套不上。Keystar 的 CheckboxGroup 把**标签、说明和 N 个选项**平铺在同一个
 * `role="group"` 里（`keystaticFormControls.ts` 文件头量过），滚动框只能套在
 * "一个盒子"上 —— 要么把标签也关进框里一起滚走，要么把选项搬进一个新盒子。
 * 后者就是搬 React 的节点，这个仓库明令不许（`keystaticFormLayout.ts` 第一条红线）。
 *
 * 所以：
 *   ① Keystatic 的药丸**原地不动、只是 `display: none`**。它们仍然是这一格唯一的
 *      真相 —— 表单的值、存盘、`keystaticGroupFill.ts` 选组时替人勾票、
 *      `keystaticModTime.ts` 的指纹，读的全是那几个真勾选框。
 *   ② 我们在同一个 `role="group"` 里**追加一个自己的容器**（最后一个孩子），
 *      里面是搜索框、一行「已勾」、一个滚动框装着自己的药丸。
 *   ③ 点自己的药丸 = `真勾选框.click()`（和 groupFill 勾票同一个办法），
 *      然后照真勾选框的状态重画；另有一个 250ms 的轮询兜着别人改了真勾选框的情况。
 *
 * ★ **只在自己的容器真的挂上之后**才藏 Keystatic 的药丸（`READY_ATTR` 是挂好之后才设的）。
 *   认不出那一格、或者哪一步抛了，最坏是回到原来那一排药丸 —— 不会出现"两排都没有"。
 *
 * ## ⚠ 往 React 管的节点里挂了一个陌生孩子 —— 为什么这里可以
 *
 * `keystaticHelp.ts` 的硬规矩是"一个节点都不往 React 管的树里插"，理由是它 reconcile 时
 * 按自己记的引用做 insertBefore / removeChild。这里的容器挂在**最后**，而这个
 * `role="group"` 的孩子列表在一页之内是**不变的**（选项是配置求值那一刻定死的，
 * 勾一下只改每个 `<label>` 里面）—— React 没有理由去动这一层的孩子。
 * 和 `keystaticToolbar.ts` 挂左侧菜单是同一个取舍、同一个兜底：真被重渲染抹掉了，
 * 下一拍认得出"自己那块没了"，重新挂一次。
 *
 * ## 自己的药丸为什么是 `<button role="checkbox">`，不是 `<input type="checkbox">`
 *
 * `keystaticGroupFill.ts` 的 `multiBoxes()` 认"哪一格是标的"靠的是**这个 `role="group"`
 * 里勾选框的个数正好等于选项数** —— 我们再放 N 个勾选框进去，它就数成 2N、认不出来，
 * 选了「补一份研究」之后标的**静默不跟着带过来**。`modTime` 的指纹也会把它们多算一遍。
 *
 * ## 搜索框不许算"改了这条内容"
 *
 * 容器根上带着 `data-lwj-own-ui`（`./ownUi.ts`），`keystaticModTime.ts` 的指纹跳过它 ——
 * 否则在搜索框里敲一个字，这条老稿子的更新时间就被盖成此刻。
 */
import { SYMBOLS, symbolOptions } from "../config/symbols";
import { multiBoxes } from "./keystaticGroupFill";
import { OWN_UI_ATTR } from "./ownUi";
import {
  matchesQuery,
  nextVisible,
  symbolChoices,
  symbolEmptyText,
  symbolSummary,
} from "./pickerPlan";

const TICK_MS = 250;
const STYLE_ID = "lwj-symbol-picker-style";

/** 设在 Keystatic 那个 `role="group"` 上：自己的容器挂好了，它那排药丸可以藏了。 */
const READY_ATTR = "data-lwj-sym-ready";
const ROOT_ATTR = "data-lwj-sym";
const SEARCH_ATTR = "data-lwj-sym-search";
const SUMMARY_ATTR = "data-lwj-sym-summary";
const BOX_ATTR = "data-lwj-sym-box";
const PILL_ATTR = "data-lwj-sym-pill";
const MARK_ATTR = "data-lwj-sym-mark";
const TEXT_ATTR = "data-lwj-sym-text";
const EMPTY_ATTR = "data-lwj-sym-empty";

/**
 * ★ 藏的只是 `role="group"` **直接孩子里的 `<label>`**（Keystatic 的药丸）：
 *   那一格的标题是个 `<span>`（实测 `span.kui:Text`），不受影响；说明角标也是 `<span>`。
 * ★ 属性写两遍抬权重 (0,2,1)：Keystar 的 `display` 挂在 emotion 类上 (0,1,0)，
 *   谁排在后面不由我们决定（同 keystaticHelp / keystaticFormControls 的手法）。
 * ⚠ 滚动框的高度（164px ≈ 五排药丸）是**按侧栏那一档**定的：
 *   窄屏退回普通表单时这一格有 680px 宽，一排能放五六只，框根本满不了 —— 那是对的。
 */
export const SYMBOL_PICKER_CSS = `
[${READY_ATTR}][${READY_ATTR}] > label { display: none; }
[${ROOT_ATTR}] {
  flex: 1 1 100%; min-width: 0; box-sizing: border-box;
  display: flex; flex-direction: column; gap: 8px;
}
[${SEARCH_ATTR}] {
  box-sizing: border-box; width: 100%; height: 32px; margin: 0; padding: 0 10px;
  border: 1px solid var(--kui-color-border-emphasis);
  border-radius: var(--kui-size-radius-regular);
  background: transparent; color: var(--kui-color-foreground-neutral-emphasis);
  font: inherit; font-size: 14px;
}
[${SEARCH_ATTR}]::placeholder { color: var(--kui-color-foreground-neutral-tertiary); }
[${SEARCH_ATTR}]:focus {
  outline: 2px solid var(--kui-color-background-accent-emphasis); outline-offset: -1px;
}
[${SUMMARY_ATTR}] {
  font-size: 12px; line-height: 1.4; color: var(--kui-color-foreground-neutral-emphasis);
}
[${SUMMARY_ATTR}][data-empty] { color: var(--kui-color-foreground-neutral-secondary); }
[${BOX_ATTR}] {
  box-sizing: border-box; display: flex; flex-wrap: wrap; align-content: flex-start; gap: 6px;
  max-height: 164px; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain;
  scrollbar-gutter: stable; padding: 8px;
  border: 1px solid var(--kui-color-border-muted);
  border-radius: var(--kui-size-radius-medium);
}
[${PILL_ATTR}] {
  display: inline-flex; align-items: center; gap: 8px; flex: 0 1 auto; margin: 0;
  box-sizing: border-box; max-width: 100%; min-width: 0;
  padding: 2px 12px 2px 8px; border: 1px solid var(--kui-color-border-neutral);
  border-radius: 999px; background: none; cursor: pointer;
  color: var(--kui-color-foreground-neutral); font: inherit; font-size: 14px; line-height: 1.4;
}
/* 侧栏那一档 240px：「HOOD Robinhood Markets」一颗就比框宽（竖滚动条一出来更是），
   不截断的话框底下会多出一条横滚动条（2026-09-23 实测）。截断的只是公司名的尾巴，
   代码在最前面永远看得见；完整的一行在悬停提示里（title），勾上的那几只在「已勾」那一行里也是全的。 */
[${TEXT_ATTR}] { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[${PILL_ATTR}][hidden] { display: none; }
[${PILL_ATTR}]:hover { border-color: var(--kui-color-border-emphasis); }
[${PILL_ATTR}]:focus-visible {
  outline: 2px solid var(--kui-color-background-accent-emphasis); outline-offset: 1px;
}
[${PILL_ATTR}][aria-checked="true"] {
  border-color: var(--kui-color-background-accent-emphasis);
  background: var(--kui-color-background-surface);
  color: var(--kui-color-foreground-neutral-emphasis);
}
[${MARK_ATTR}] {
  flex: 0 0 auto; width: 16px; height: 16px; box-sizing: border-box;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 4px; box-shadow: inset 0 0 0 1px var(--kui-color-border-emphasis);
}
[${PILL_ATTR}][aria-checked="true"] [${MARK_ATTR}] {
  background: var(--kui-color-background-accent-emphasis); box-shadow: none;
}
[${PILL_ATTR}][aria-checked="true"] [${MARK_ATTR}]::after {
  content: ""; width: 8px; height: 4px; margin-top: -2px;
  border-left: 2px solid #fff; border-bottom: 2px solid #fff; transform: rotate(-45deg);
}
[${EMPTY_ATTR}] {
  margin: 0; font-size: 12px; line-height: 1.5; color: var(--kui-color-foreground-neutral-secondary);
}
`;

/**
 * 认那一格用的选项 —— **就是后台那一格的 `options`**（`symbolsField()` 读的也是
 * `symbolOptions()`）。认法（标签文字、个数对得上）在 `multiBoxes()` 里，这里不另写。
 */
const OPTIONS = symbolOptions();
/** 代码 → 能搜到的全部字（含英文名，那行字里没有它）。 */
const SEARCH_TEXT = new Map(
  symbolChoices(SYMBOLS).map(c => [c.value, c.search])
);

interface Pill {
  el: HTMLButtonElement;
  /** Keystatic 那个真勾选框（藏着的）。点它才是真的改了表单。 */
  real: HTMLInputElement;
  label: string;
  search: string;
}

interface Mounted {
  group: HTMLElement;
  root: HTMLElement;
  search: HTMLInputElement;
  summary: HTMLElement;
  empty: HTMLElement;
  pills: Pill[];
  /** 方向键那一套里"能被 Tab 到的那一颗"（其余 tabindex=-1）。 */
  rover: number;
  /** 挂的时候在哪一页。换了一条稿子（SPA 里表单可能原地复用）就清掉搜索词。 */
  path: string;
}

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function setFlag(el: Element, name: string, on: boolean): void {
  if (on && !el.hasAttribute(name)) el.setAttribute(name, "");
  if (!on && el.hasAttribute(name)) el.removeAttribute(name);
}

/** 照真勾选框重画：每颗药丸勾没勾、「已勾」那一行。值没变就不动 DOM（每 250ms 一拍）。 */
function sync(m: Mounted): void {
  const checked: string[] = [];
  for (const p of m.pills) {
    const want = p.real.checked ? "true" : "false";
    if (p.el.getAttribute("aria-checked") !== want) {
      p.el.setAttribute("aria-checked", want);
    }
    if (p.real.checked) checked.push(p.label);
  }
  const s = symbolSummary(checked);
  if (m.summary.textContent !== s.text) m.summary.textContent = s.text;
  setFlag(m.summary, "data-empty", s.empty);
}

/** 让"能被 Tab 到的那一颗"落在第 i 颗上（-1 = 一颗都不可见，谁都不进 Tab 序列）。 */
function setRover(m: Mounted, i: number): void {
  m.rover = i;
  m.pills.forEach((p, j) => {
    const want = j === i ? "0" : "-1";
    if (p.el.getAttribute("tabindex") !== want)
      p.el.setAttribute("tabindex", want);
  });
}

function visibility(m: Mounted): boolean[] {
  return m.pills.map(p => !p.el.hidden);
}

/** 按搜索框里的字筛药丸。勾上了但被筛掉的那几只，「已勾」那一行照样列着。 */
function applyFilter(m: Mounted): void {
  const q = m.search.value;
  let any = false;
  for (const p of m.pills) {
    const show = matchesQuery(p.search, q);
    if (p.el.hidden === show) p.el.hidden = !show;
    if (show) any = true;
  }
  m.empty.hidden = any;
  if (!any) m.empty.textContent = symbolEmptyText(q);
  const vis = visibility(m);
  if (!vis[m.rover]) setRover(m, nextVisible(vis, -1, 1));
}

function toggle(m: Mounted, i: number): void {
  const p = m.pills[i];
  if (!p || !p.real.isConnected) return;
  // ★ 点**真的**那一个：React 走它自己的 click → change 那条链，表单的值才会变。
  //   直接改 checked 的话下一次渲染就被写回去（groupFill 的 setChecked 同一条理由）。
  p.real.click();
  sync(m);
}

function mount(
  group: HTMLElement,
  boxes: readonly { box: HTMLInputElement; value: string }[]
): Mounted {
  const root = make("div", { [ROOT_ATTR]: "", [OWN_UI_ATTR]: "" });
  const search = make("input", {
    type: "search",
    [SEARCH_ATTR]: "",
    "aria-label": "搜索标的",
    placeholder: "搜索：代码 / 中文名 / 英文名",
    autocomplete: "off",
    spellcheck: "false",
  });
  const summary = make("div", { [SUMMARY_ATTR]: "", "aria-live": "polite" });
  const box = make("div", { [BOX_ATTR]: "" });
  const empty = make("p", { [EMPTY_ATTR]: "" });
  empty.hidden = true;

  const pills: Pill[] = boxes.map((b, i) => {
    // 这行字就是 multiBoxes() 刚刚拿来认它的那行字（`symbolOptionLabel()`）。
    const label = b.box.closest("label")?.textContent?.trim() || b.value;
    const el = make("button", {
      type: "button",
      role: "checkbox",
      "aria-checked": b.box.checked ? "true" : "false",
      tabindex: i === 0 ? "0" : "-1",
      title: label,
      [PILL_ATTR]: b.value,
    });
    const mark = make("span", { [MARK_ATTR]: "", "aria-hidden": "true" });
    const text = make("span", { [TEXT_ATTR]: "" });
    text.textContent = label;
    el.append(mark, text);
    return {
      el,
      real: b.box,
      label,
      search: `${label} ${SEARCH_TEXT.get(b.value) ?? ""}`,
    };
  });

  box.append(...pills.map(p => p.el), empty);
  root.append(search, summary, box);

  const m: Mounted = {
    group,
    root,
    search,
    summary,
    empty,
    pills,
    rover: pills.length > 0 ? 0 : -1,
    path: location.pathname,
  };

  // 输入法拼音还没选字的时候不筛：不然屏幕上会闪一下「没有匹配 mei」。
  search.addEventListener("input", e => {
    if (!(e as InputEvent).isComposing) applyFilter(m);
  });
  search.addEventListener("compositionend", () => applyFilter(m));
  search.addEventListener("keydown", e => {
    if (e.isComposing || e.keyCode === 229) return;
    const vis = visibility(m);
    if (e.key === "Enter") {
      // Enter = 勾 / 取消第一个命中的。敲「mu」回车就勾上了，不用去框里找。
      e.preventDefault();
      const first = nextVisible(vis, -1, 1);
      if (first >= 0) toggle(m, first);
    } else if (e.key === "ArrowDown") {
      const first = nextVisible(vis, -1, 1);
      if (first < 0) return;
      e.preventDefault();
      setRover(m, first);
      m.pills[first]!.el.focus();
    } else if (e.key === "Escape" && search.value !== "") {
      // 只在真的清了东西时才吞掉 Escape —— 空着的时候它是别人的键。
      e.preventDefault();
      e.stopPropagation();
      search.value = "";
      applyFilter(m);
    }
  });

  pills.forEach((p, i) => {
    p.el.addEventListener("click", () => toggle(m, i));
    p.el.addEventListener("focus", () => setRover(m, i));
    p.el.addEventListener("keydown", e => {
      const vis = visibility(m);
      let to = -2;
      if (e.key === "ArrowRight" || e.key === "ArrowDown")
        to = nextVisible(vis, i, 1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        to = nextVisible(vis, i, -1);
        if (to < 0) {
          // 走到最前面再往回 → 回到搜索框（它就画在这一排上面）。
          e.preventDefault();
          search.focus();
          return;
        }
      } else if (e.key === "Home") to = nextVisible(vis, -1, 1);
      else if (e.key === "End") to = nextVisible(vis, vis.length, -1);
      if (to === -2) return;
      e.preventDefault();
      if (to < 0) return;
      setRover(m, to);
      m.pills[to]!.el.focus();
    });
  });

  group.append(root);
  // ★ 挂好了才藏 Keystatic 那一排（见文件头）。
  group.setAttribute(READY_ATTR, "");
  sync(m);
  applyFilter(m);
  return m;
}

/** 还是不是那一套：容器还挂在那个 group 里、真勾选框一个都没被换掉。 */
function healthy(m: Mounted): boolean {
  return (
    m.group.isConnected &&
    m.root.parentElement === m.group &&
    m.pills.every(p => p.real.isConnected && m.group.contains(p.real))
  );
}

function unmount(m: Mounted): void {
  m.root.remove();
  // 先撤"可以藏"那个属性：这一拍要是认不回来，Keystatic 那一排得露出来。
  m.group.removeAttribute(READY_ATTR);
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = SYMBOL_PICKER_CSS;
  document.head.append(style);
}

/**
 * 挂载点：`keystatic.config.ts` 里一句调用（和 mountIconPreview 那几个同一处）。
 * ⚠ 那份配置**服务端也会加载**（/api/keystatic），所以先看 `document` 在不在。
 * ★ 轮询不监听：表单是 SPA 里进进出出的，真勾选框被别人改（选了组自动带票）也不发
 *   我们能靠得住的事件 —— 和 groupFill / agentModel 同一套理由。
 */
export function mountSymbolPicker(): void {
  if (typeof document === "undefined") return;

  let mounted: Mounted | null = null;
  /** 挂失败过一次就不再试：每 250ms 抛一次、印一行，控制台就没法看了。刷新页面重来。 */
  let broken = false;
  const tick = () => {
    if (broken) return;
    if (mounted && healthy(mounted)) {
      if (mounted.path !== location.pathname) {
        // 同一张表单换了一条稿子：搜索词是上一条的事。
        mounted.path = location.pathname;
        if (mounted.search.value !== "") {
          mounted.search.value = "";
          applyFilter(mounted);
        }
      }
      sync(mounted);
      return;
    }
    if (mounted) unmount(mounted);
    mounted = null;

    const boxes = multiBoxes(OPTIONS);
    const group = boxes?.[0]?.box.closest<HTMLElement>('[role="group"]');
    if (!boxes || !group) return;
    try {
      mounted = mount(group, boxes);
    } catch (err) {
      // 挂到一半抛了：把挂上去的撤掉，Keystatic 那一排原样露着（还能用，只是没有搜索框）。
      broken = true;
      group.querySelector(`[${ROOT_ATTR}]`)?.remove();
      group.removeAttribute(READY_ATTR);
      // eslint-disable-next-line no-console -- 静默失败的话，屏幕上只是"搜索框没了"，没人知道是为什么
      console.warn("[keystaticSymbolPicker] 标的搜索框没挂上：", err);
    }
  };

  if (document.head) ensureStyle();
  else
    document.addEventListener("DOMContentLoaded", ensureStyle, { once: true });
  window.setInterval(tick, TICK_MS);
}
