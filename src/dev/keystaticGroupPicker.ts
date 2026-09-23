/**
 * 后台「这一条是…」那一格：点开是一个**带搜索框、分页**的面板，不是那一长列原生下拉。
 *
 * 【2026-09-23 用户要的】原话「稿件类型应该也是要分页展示，稿件太多了」（问过一次，
 * 指的就是这一格，不是左侧的列表页）。那个下拉一个选题一行（`groupOptions()`，
 * 按全组最新那条排、新的在前），研究稿到了二十来组，要补三周前那个选题就得一直往下拖；
 * 而研究稿的选题标题常常就是一个代码，找「美光」那一组得先记得它叫 MU。
 * 这件事 2026-09-21 就记在 docs/engineering-notes.md 里（「等列表真长了再说」），现在长了。
 *
 * 判据全在 `./pickerPlan.ts`（怎么搜、一页几组、键盘怎么走、翻页那一行说什么），
 * 这个文件只管**拦下原来那个下拉、画自己的面板、把选中的值写回去**。
 *
 * ## 怎么接管的：拦住按钮上的事件，不碰它的 DOM
 *
 * Keystar 的 Picker 是 react-aria 的，展开的列表是虚拟滚动的 —— 往它里面塞搜索框、
 * 按页藏选项都是和 React 打架（`keystaticIconPreview.ts` 文件头量过：滚一下就换一批节点）。
 * 所以换个办法：
 *
 *   ① 那个按钮（`button[aria-haspopup="listbox"]`）照旧显示当前值，我们只给它设一个
 *      `data-lwj-gp-trigger` 属性；
 *   ② 在 `document` 的**捕获阶段**拦下落在它身上的按下 / 抬起 / 点击 / 回车空格方向键，
 *      `stopPropagation()` —— React 的监听挂在更里面（岛的根节点上），这些事件到不了它，
 *      原生那一长列就不会弹出来；
 *   ③ 改为弹出自己的面板，**挂在 `document.body` 上**（和 keystaticHelp 的气泡一个位置，
 *      那块地方 React 不管）；
 *   ④ 选中一项 → `setSelectValue()` 写回那个隐藏 `<select>`（和 `keystaticAgentModel.ts`
 *      换模型同一个办法）→ react-aria 同步回按钮上那行字 → Keystatic 的表单值跟着变。
 *      选组之后自动带标题和标的（`keystaticGroupFill.ts`）照常轮询到这个变化，一行都不用改。
 *
 * ★ 失败方向是"退回原生下拉"，不是"一个点了没反应的按钮"：
 *   - 认不出那一格（选项集合对不上、找不到按钮）→ 根本不设那个属性，不拦；
 *   - 弹面板那一步抛了 → **先不拦这一下**（事件照常到 React，原生列表弹出来），
 *     并且从此不再接管，控制台留一行。
 * ⚠ 右键 / 中键不拦：那不是"打开下拉"。Tab / Escape 这些键也不拦。
 *
 * ## 面板里的输入框不算"改了这条内容"
 *
 * 面板根上带着 `data-lwj-own-ui`（`./ownUi.ts`）—— 在搜索框里敲字不会让
 * `keystaticModTime.ts` 盖上更新时间；真的选了另一个组才算（隐藏 `<select>` 的值变了）。
 * 顺带：我们的拦截只 `stopPropagation()`，不 `stopImmediatePropagation()` ——
 * modTime 挂在同一个 `document` 捕获阶段上的那几个监听照样收得到"人真的点过"。
 *
 * ## 做不到的（照实写）
 *
 * - 按钮上的 `aria-expanded` 在面板开着时仍然是 false：那个属性是 React 在写，
 *   我们改了下一次渲染就被写回去。读屏用户靠的是面板里那个 combobox 自己的语义。
 * - 选项还是**配置求值那一刻**的快照：刚在别的标签页新建的研究稿，照旧要刷新一次后台
 *   才会出现在这个面板里（和原来的下拉同一个脾气，这一处没变）。
 */
import { setSelectValue } from "./keystaticAgentModel";
import { groupSelect } from "./keystaticGroupFill";
import { OWN_UI_ATTR } from "./ownUi";
import {
  cursorForQuery,
  filterGroups,
  formCollection,
  groupEmptyText,
  groupPagerText,
  moveCursor,
  openCursor,
  pageCountOf,
  pageSlice,
  queryTerms,
  splitGroupChoices,
  type ChoiceOption,
  type CursorMove,
  type GroupCursor,
} from "./pickerPlan";

/** 一个集合那一格要的东西。由 `keystatic.config.ts` 喂进来（组的数据只在那儿扫一次）。 */
export interface GroupPickerCollection {
  /** 「选题」/「问题」—— 搜索框的提示、翻页那一行的「共 N 个…」都用它。 */
  noun: string;
  /**
   * 组的键 → 除了那行字以外还能搜到的字（`groupSearchIndex()`）。
   * ★ **键 = 这个集合全部的组** —— 拿它去认那个隐藏 `<select>`（选项集合正好等于它）。
   */
  search: Record<string, string>;
}

const TICK_MS = 250;
const STYLE_ID = "lwj-group-picker-style";
/** 设在 Keystar 那个下拉按钮上：这一个的按下归我们管。 */
const TRIGGER_ATTR = "data-lwj-gp-trigger";
const POP_ATTR = "data-lwj-gp";
const LIST_ID = "lwj-gp-list";
const OPTION_ID_PREFIX = "lwj-gp-opt-";
/** 面板最窄多宽。侧栏那一档按钮只有 240px，问答的问题一行放不下。 */
const POP_MIN_WIDTH = 340;

const CSS = `
[${POP_ATTR}] {
  position: fixed; z-index: 2147482000; box-sizing: border-box;
  display: flex; flex-direction: column; gap: 6px; padding: 8px;
  border: 1px solid var(--kui-color-border-neutral);
  border-radius: var(--kui-size-radius-medium);
  background: var(--kui-color-background-surface);
  color: var(--kui-color-foreground-neutral);
  box-shadow: var(--kui-size-shadow-large) var(--kui-color-shadow-regular);
  font-family: var(--kui-typography-font-family-base); font-size: 14px; line-height: 1.4;
}
[${POP_ATTR}] input {
  box-sizing: border-box; width: 100%; height: 32px; margin: 0; padding: 0 10px; flex: 0 0 auto;
  border: 1px solid var(--kui-color-border-emphasis);
  border-radius: var(--kui-size-radius-regular);
  background: transparent; color: var(--kui-color-foreground-neutral-emphasis);
  font: inherit;
}
[${POP_ATTR}] input::placeholder { color: var(--kui-color-foreground-neutral-tertiary); }
[${POP_ATTR}] input:focus {
  outline: 2px solid var(--kui-color-background-accent-emphasis); outline-offset: -1px;
}
[${POP_ATTR}] [role="listbox"] {
  list-style: none; margin: 0; padding: 0; min-height: 0; flex: 1 1 auto; overflow-y: auto;
}
[${POP_ATTR}] [role="option"] {
  display: flex; align-items: flex-start; gap: 8px; padding: 6px 8px;
  border-radius: var(--kui-size-radius-regular); cursor: pointer;
}
[${POP_ATTR}] [role="option"][data-fresh] {
  margin-bottom: 4px; border-bottom: 1px solid var(--kui-color-border-muted);
  border-radius: var(--kui-size-radius-regular) var(--kui-size-radius-regular) 0 0;
}
[${POP_ATTR}] [role="option"][data-active] {
  background: color-mix(in srgb, var(--kui-color-foreground-neutral) 14%, transparent);
}
[${POP_ATTR}] [role="option"][aria-selected="true"] {
  color: var(--kui-color-foreground-neutral-emphasis); font-weight: 500;
}
[${POP_ATTR}] [role="option"] > span:first-child { flex: 1 1 auto; min-width: 0; }
[${POP_ATTR}] [role="option"] > span:last-child {
  flex: 0 0 auto; width: 1em; color: var(--kui-color-foreground-accent);
}
[${POP_ATTR}] [data-empty] {
  margin: 0; padding: 6px 8px; font-size: 12px; color: var(--kui-color-foreground-neutral-secondary);
}
[${POP_ATTR}] [data-pager] {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; flex: 0 0 auto;
  padding-top: 6px; border-top: 1px solid var(--kui-color-border-muted);
  font-size: 12px; color: var(--kui-color-foreground-neutral-secondary);
}
[${POP_ATTR}] [data-pager] > span { text-align: center; }
[${POP_ATTR}] [data-pager] button {
  flex: 0 0 auto; margin: 0; padding: 2px 8px; cursor: pointer;
  border: 1px solid var(--kui-color-border-neutral);
  border-radius: var(--kui-size-radius-regular);
  background: none; color: var(--kui-color-foreground-neutral); font: inherit;
}
[${POP_ATTR}] [data-pager] button:focus-visible {
  outline: 2px solid var(--kui-color-background-accent-emphasis); outline-offset: 1px;
}
[${POP_ATTR}] [data-pager] button[aria-disabled="true"] { opacity: .4; cursor: default; }
`;

/** 这一页上归我们管的那一格。 */
interface Target {
  select: HTMLSelectElement;
  trigger: HTMLElement;
  conf: GroupPickerCollection;
}

/** 面板开着时的全部状态。关掉就整个扔掉，下次打开重新读一遍那个 `<select>`。 */
interface Panel {
  target: Target;
  path: string;
  pop: HTMLElement;
  input: HTMLInputElement;
  list: HTMLElement;
  empty: HTMLElement;
  status: HTMLElement;
  prev: HTMLButtonElement;
  next: HTMLButtonElement;
  fresh: ChoiceOption | null;
  groups: ChoiceOption[];
  filtered: ChoiceOption[];
  cursor: GroupCursor;
  cleanup: () => void;
}

let byCollection: Record<string, GroupPickerCollection> = {};
let target: Target | null = null;
let panel: Panel | null = null;
/** 弹面板抛过一次就不再接管 —— 从此是原生下拉（见文件头「失败方向」）。 */
let broken = false;

/**
 * 隐藏 `<select>` 对应的那个可见的下拉按钮：往上找，第一个装着下拉按钮的祖先里**恰好一个**
 * 才算（实测往上两三层就是 Picker 自己的容器）。找到两个就是认错了容器 —— 宁可不接管。
 * （`keystaticIconPreview.ts` 的 `triggerOf()` 是同一个找法。）
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

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {}
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// ── 画 ───────────────────────────────────────────────────────────────

function optionId(active: number): string {
  return `${OPTION_ID_PREFIX}${active}`;
}

function optionEl(
  option: ChoiceOption,
  active: number,
  selected: string
): HTMLElement {
  const li = make("li", {
    role: "option",
    id: optionId(active),
    "data-value": option.value,
    "data-active-index": String(active),
    "aria-selected": option.value === selected ? "true" : "false",
  });
  if (active === 0) li.setAttribute("data-fresh", "");
  const text = make("span");
  text.textContent = option.label;
  // 当前选中的那一项后面画一个勾（颜色之外的第二处，和药丸那边保留勾选框同一条理由）。
  const tick = make("span", { "aria-hidden": "true" });
  tick.textContent = option.value === selected ? "✓" : "";
  li.append(text, tick);
  return li;
}

/** 整张列表重画：搜索词或页码变了的时候。只是换了高亮不走这里（`paintActive`）。 */
function render(p: Panel): void {
  const selected = p.target.select.value;
  const items: HTMLElement[] = [];
  if (p.fresh) items.push(optionEl(p.fresh, 0, selected));
  for (const { option, active } of pageSlice(p.filtered, p.cursor.page)) {
    items.push(optionEl(option, active, selected));
  }
  p.list.replaceChildren(...items);

  const q = p.input.value;
  const searching = queryTerms(q).length > 0;
  p.empty.hidden = !(searching && p.filtered.length === 0);
  p.empty.textContent = p.empty.hidden
    ? ""
    : groupEmptyText(q, p.target.conf.noun);
  p.status.textContent = groupPagerText(
    q,
    p.filtered.length,
    p.groups.length,
    p.cursor.page,
    p.target.conf.noun
  );
  const pages = pageCountOf(p.filtered.length);
  p.prev.setAttribute("aria-disabled", String(p.cursor.page <= 0));
  p.next.setAttribute("aria-disabled", String(p.cursor.page >= pages - 1));
  paintActive(p);
}

/** 只换高亮那一行（键盘上下、鼠标移过去）。 */
function paintActive(p: Panel): void {
  let activeEl: HTMLElement | null = null;
  for (const li of p.list.querySelectorAll<HTMLElement>('[role="option"]')) {
    const on = li.getAttribute("data-active-index") === String(p.cursor.active);
    if (on) activeEl = li;
    if (on !== li.hasAttribute("data-active")) {
      if (on) li.setAttribute("data-active", "");
      else li.removeAttribute("data-active");
    }
  }
  if (activeEl) {
    p.input.setAttribute("aria-activedescendant", activeEl.id);
    // 只滚面板自己的列表，不用 scrollIntoView（它会顺手去滚页面上别的祖先）。
    const top = activeEl.offsetTop - p.list.offsetTop;
    const bottom = top + activeEl.offsetHeight;
    if (top < p.list.scrollTop) p.list.scrollTop = top;
    else if (bottom > p.list.scrollTop + p.list.clientHeight) {
      p.list.scrollTop = bottom - p.list.clientHeight;
    }
  } else {
    p.input.removeAttribute("aria-activedescendant");
  }
}

/**
 * 摆位置：贴着按钮下沿，宽度至少 `POP_MIN_WIDTH`，放不下就往左挪、往上翻。
 * 侧栏在屏幕右边，所以按钮左对齐放不下时是往左伸出去（盖住一点正文，关掉就回来了）。
 */
function place(p: Panel): void {
  const r = p.target.trigger.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const width = Math.min(Math.max(r.width, POP_MIN_WIDTH), vw - 16);
  const left = Math.max(8, Math.min(r.left, vw - 8 - width));
  p.pop.style.width = `${width}px`;
  p.pop.style.left = `${left}px`;

  p.pop.style.maxHeight = "none";
  const natural = p.pop.offsetHeight;
  const below = vh - r.bottom - 12;
  const above = r.top - 12;
  if (natural <= below || below >= above) {
    p.pop.style.top = `${r.bottom + 4}px`;
    p.pop.style.maxHeight = `${Math.max(below, 160)}px`;
  } else {
    const h = Math.min(natural, above);
    p.pop.style.top = `${r.top - 4 - h}px`;
    p.pop.style.maxHeight = `${above}px`;
  }
}

// ── 动作 ─────────────────────────────────────────────────────────────

function activeOption(p: Panel): ChoiceOption | undefined {
  const a = p.cursor.active;
  if (a === 0) return p.fresh ?? undefined;
  return a >= 1 ? p.filtered[a - 1] : undefined;
}

function move(p: Panel, m: CursorMove): void {
  const before = p.cursor.page;
  p.cursor = moveCursor(p.cursor, m, p.filtered.length);
  if (p.cursor.page !== before) {
    render(p);
    place(p);
  } else {
    paintActive(p);
  }
}

function requery(p: Panel): void {
  p.filtered = filterGroups(p.groups, p.target.conf.search, p.input.value);
  p.cursor = cursorForQuery(p.input.value, p.filtered.length);
  render(p);
  place(p);
}

function close(refocus: boolean): void {
  const p = panel;
  if (!p) return;
  panel = null;
  p.cleanup();
  p.pop.remove();
  if (refocus && p.target.trigger.isConnected) {
    p.target.trigger.focus({ preventScroll: true });
  }
}

function choose(p: Panel, option: ChoiceOption): void {
  const { select } = p.target;
  close(true);
  // 值没变就不写：写一次同样的值也会让 react-aria 走一遍 onChange。
  // ⚠ 「新选题」是空串，而隐藏 <select> 里还有一个空串占位项 —— 写 "" 会落在占位项上，
  //   react-aria 读的是 value（""），对应的正是「新选题」那一项（浏览器里实测过）。
  if (select.value !== option.value) setSelectValue(select, option.value);
}

function openPanel(t: Target, seed: string): void {
  close(false);
  const { fresh, groups } = splitGroupChoices(
    [...t.select.options].map(o => ({
      value: o.value,
      label: (o.textContent ?? "").trim(),
    }))
  );

  const pop = make("div", {
    [POP_ATTR]: "",
    [OWN_UI_ATTR]: "",
    role: "dialog",
    "aria-label": `挑一个${t.conf.noun}`,
  });
  const input = make("input", {
    type: "search",
    role: "combobox",
    "aria-expanded": "true",
    "aria-controls": LIST_ID,
    "aria-autocomplete": "list",
    "aria-label": `搜索${t.conf.noun}`,
    // 面板 340px 宽：带「选题」两个字再用「 / 」隔开的那版，末尾的「号」会被截掉（实测）。
    placeholder: "搜索：标题、代码、公司名、日期、号",
    autocomplete: "off",
    spellcheck: "false",
  });
  input.value = seed;
  const list = make("ul", {
    id: LIST_ID,
    role: "listbox",
    "aria-label": `${t.conf.noun}列表`,
  });
  const empty = make("p", { "data-empty": "", "aria-live": "polite" });
  const pager = make("div", { "data-pager": "" });
  const prev = make("button", { type: "button", "aria-label": "上一页" });
  prev.textContent = "‹ 上一页";
  const status = make("span", { "aria-live": "polite" });
  const next = make("button", { type: "button", "aria-label": "下一页" });
  next.textContent = "下一页 ›";
  pager.append(prev, status, next);
  pop.append(input, list, empty, pager);

  const filtered = filterGroups(groups, t.conf.search, seed);
  const p: Panel = {
    target: t,
    path: location.pathname,
    pop,
    input,
    list,
    empty,
    status,
    prev,
    next,
    fresh,
    groups,
    filtered,
    cursor:
      queryTerms(seed).length > 0
        ? cursorForQuery(seed, filtered.length)
        : openCursor(groups, t.select.value),
    cleanup: () => {},
  };

  // 输入法拼音还没选字的时候不筛（同标的那一格）。
  input.addEventListener("input", e => {
    if (!(e as InputEvent).isComposing) requery(p);
  });
  input.addEventListener("compositionend", () => requery(p));

  pop.addEventListener("keydown", e => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.target !== input) return; // 翻页那两个按钮：回车空格走它们自己的 click
    let m: CursorMove | null = null;
    if (e.key === "ArrowDown") m = "down";
    else if (e.key === "ArrowUp") m = "up";
    else if (e.key === "PageDown") m = "pageDown";
    else if (e.key === "PageUp") m = "pageUp";
    if (m) {
      e.preventDefault();
      move(p, m);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = activeOption(p);
      if (o) choose(p, o);
    }
  });

  // 点面板里除了输入框以外的地方，焦点留在输入框上（不然一点就 focusout、面板就关了）。
  pop.addEventListener("pointerdown", e => {
    if (e.target !== input) e.preventDefault();
  });
  list.addEventListener("pointermove", e => {
    const li = (e.target as Element | null)?.closest?.('[role="option"]');
    const a = Number(li?.getAttribute("data-active-index") ?? NaN);
    if (!Number.isNaN(a) && a !== p.cursor.active) {
      p.cursor = { active: a, page: p.cursor.page };
      paintActive(p);
    }
  });
  list.addEventListener("click", e => {
    const li = (e.target as Element | null)?.closest?.('[role="option"]');
    const value = li?.getAttribute("data-value");
    const option =
      value === "" ? p.fresh : p.filtered.find(o => o.value === value);
    if (li && option) choose(p, option);
  });
  // ★ 翻页按钮用 aria-disabled 而不是 disabled：一个正拿着焦点的按钮被 disabled 掉，
  //   焦点会掉到 body 上 → focusout → 面板当场关掉（翻到最后一页的那一下）。
  const turn = (m: CursorMove, btn: HTMLButtonElement) => () => {
    if (btn.getAttribute("aria-disabled") === "true") return;
    p.cursor = moveCursor(p.cursor, m, p.filtered.length);
    render(p);
    place(p);
  };
  prev.addEventListener("click", turn("pageUp", prev));
  next.addEventListener("click", turn("pageDown", next));

  pop.addEventListener("focusout", e => {
    const to = e.relatedTarget;
    if (to instanceof Node && (pop.contains(to) || t.trigger.contains(to)))
      return;
    // 焦点去了别处（Tab 出去、点了页面别的地方）。等这一拍的焦点落定再看 ——
    // 切到别的窗口时 activeElement 还是这个输入框，那不算离开。
    window.setTimeout(() => {
      if (panel === p && !pop.contains(document.activeElement)) close(false);
    }, 0);
  });

  const onOutsidePointer = (e: Event) => {
    const at = e.target;
    if (!(at instanceof Node)) return;
    if (pop.contains(at) || t.trigger.contains(at)) return;
    close(false);
  };
  // 页面（或表单那一栏）滚了，面板就和按钮脱节了 —— 关掉，和原生下拉一个脾气。
  // 面板自己的列表滚动不算。
  const onScroll = (e: Event) => {
    if (e.target instanceof Node && pop.contains(e.target)) return;
    close(false);
  };
  const onResize = () => close(false);
  document.addEventListener("pointerdown", onOutsidePointer, true);
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", onResize);
  p.cleanup = () => {
    document.removeEventListener("pointerdown", onOutsidePointer, true);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onResize);
  };

  document.body.append(pop);
  panel = p;
  render(p);
  place(p);
  input.focus({ preventScroll: true });
  input.setSelectionRange(input.value.length, input.value.length);
}

// ── 拦截 ─────────────────────────────────────────────────────────────

/** 这个事件落在我们接管的那个按钮上吗。 */
function onTrigger(e: Event): Target | null {
  if (broken || !target || !(e.target instanceof Node)) return null;
  return target.trigger.contains(e.target) ? target : null;
}

function giveUp(err: unknown): void {
  broken = true;
  close(false);
  target?.trigger.removeAttribute(TRIGGER_ATTR);
  target = null;
  // eslint-disable-next-line no-console -- 退回原生下拉是安静的，不留一行的话没人知道搜索和分页为什么没了
  console.warn(
    "[keystaticGroupPicker] 选题面板出错，这一页退回原生下拉：",
    err
  );
}

/**
 * 按下（鼠标 / 触屏 / 笔）：react-aria 的 Picker 就是在按下那一刻展开的，所以在这一刻换成我们的。
 * 抬起、点击也一并拦下 —— 只拦按下的话，后面那个 click 会被 react-aria 当成
 * "虚拟点击"（读屏那种）再展开一次原生列表。
 */
function onPointerish(e: Event): void {
  const t = onTrigger(e);
  if (!t) return;
  if (e instanceof MouseEvent && e.button !== 0) return;
  if (e.type === "pointerdown") {
    try {
      if (panel && panel.target.trigger === t.trigger) close(true);
      else openPanel(t, "");
    } catch (err) {
      giveUp(err); // 这一下不拦：让 React 照常弹出原生列表
      return;
    }
  }
  e.stopPropagation();
  e.preventDefault();
}

/**
 * 键盘：回车 / 空格 / ↑↓ 打开；**直接打字**也打开，并且把那个字当成搜索词的开头 ——
 * 原生下拉在按钮上打字是"跳到那个字开头的项"（react-aria 的 typeahead），换成搜索更有用。
 * Tab、Escape、带 Ctrl / ⌘ / Alt 的组合键一律放过。
 */
function onKeyDown(e: KeyboardEvent): void {
  const t = onTrigger(e);
  if (!t || e.isComposing) return;
  const opens =
    e.key === "Enter" ||
    e.key === " " ||
    e.key === "ArrowDown" ||
    e.key === "ArrowUp";
  const typed =
    e.key.length === 1 &&
    e.key !== " " &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey;
  if (!opens && !typed) return;
  try {
    openPanel(t, typed ? e.key : "");
  } catch (err) {
    giveUp(err);
    return;
  }
  e.stopPropagation();
  e.preventDefault();
}

/** 空格在按钮上是**抬起**那一下才触发点击的，也拦掉（按下那一下已经打开了）。 */
function onKeyUp(e: KeyboardEvent): void {
  if (!onTrigger(e)) return;
  if (e.key === "Enter" || e.key === " ") {
    e.stopPropagation();
    e.preventDefault();
  }
}

// ── 认那一格 ─────────────────────────────────────────────────────────

function tick(): void {
  const path = location.pathname;
  if (panel && (panel.path !== path || !panel.target.trigger.isConnected)) {
    close(false);
  }
  if (broken) return;

  const collection = formCollection(path);
  const conf = collection ? byCollection[collection] : undefined;
  const keys = conf ? Object.keys(conf.search) : [];
  // 一组都没有 = 下拉里只有「新选题」一项，用不着搜索和分页 —— 不接管。
  const select = keys.length > 0 ? groupSelect(keys) : null;
  const trigger = select ? triggerOf(select) : null;

  if (target && target.trigger !== trigger) {
    target.trigger.removeAttribute(TRIGGER_ATTR);
    target = null;
  }
  if (select && trigger && conf) {
    if (!trigger.hasAttribute(TRIGGER_ATTR)) {
      trigger.setAttribute(TRIGGER_ATTR, "");
    }
    target = { select, trigger, conf };
  }
}

/**
 * 挂载点：`keystatic.config.ts` 里一句调用，紧挨着 `mountGroupAutofill()` ——
 * 两边吃的是同一次扫描出来的组（`postGroups` / `qaGroups`）。
 * ⚠ 那份配置**服务端也会加载**（/api/keystatic），所以先看 `document` 在不在。
 * ★ 拦截挂在 `document` 的捕获阶段：React 的监听在岛的根节点上，比 document 靠里，
 *   在这里 stopPropagation 它就收不到。挂在 `window` 上也行，但那样会连 modTime
 *   挂在 document 上的"人真的点过"一起拦掉。
 */
export function mountGroupPicker(
  collections: Record<string, GroupPickerCollection>
): void {
  if (typeof document === "undefined") return;
  byCollection = collections;

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head ?? document.documentElement).append(style);
  }

  for (const type of [
    "pointerdown",
    "mousedown",
    "pointerup",
    "mouseup",
    "click",
  ]) {
    document.addEventListener(type, onPointerish, true);
  }
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);
  window.setInterval(tick, TICK_MS);
}
