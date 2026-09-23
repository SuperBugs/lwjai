/**
 * 后台**列表页**（研究稿 / 问答 / 教程 / 提示词）：**搜索 + 新的在前 + 分页**。
 *
 * 【2026-09-23 用户要的】原话「管理界面的研究、问答、教程 list 都应该是按照倒序分页展示，
 * 并且要可以搜索，现在文章会越来越多」。Keystatic 自己那张表为什么三件都做不到、
 * 为什么提示词也跟着换了，写在 `./entryListPlan.ts` 开头；判据全在那个文件，
 * 这里只管**藏起 Keystatic 那张表、画自己的、点一行时交给 Keystatic 的路由**。
 *
 * ## 怎么接管的：表不删、只藏，失败就露回来
 *
 *   ① 认出列表页那张表（`main#keystatic-main-panel` 的直接孩子 `[role="grid"]`），
 *      只给它设一个 `data-lwj-el-grid` 属性；
 *   ② 在同一个 `<main>` 里**最后**挂一个自己的 `<section>`（和 keystaticToolbar / 标的那一格
 *      同一个取舍：React 看到的是一个它不认识的兄弟节点，碰不到它记着的那几个引用）；
 *   ③ 藏表、藏它顶上那个搜索框全靠一张样式表，条件是**我们的面板就挂在那张表后面、
 *      而且不在「读不到」那一档**（`:has()` ＋ `~`）。所以：
 *      - 数据读不到 → 面板进 failed 档 → 表和搜索框**自己露回来**，顶上一句话说为什么；
 *      - Keystatic 换页把表拿走 → 那条 `~` 当场不成立 → 面板**同一帧**就不显示了；
 *      - 哪一步抛了 → 不挂面板 → 什么都没藏。
 *   ★ 失败方向永远是"退回 Keystatic 那张表"，不是"一片空白"或"两张表都没有"。
 *
 * ## 点一行：交给 Keystatic 自己的路由，不整页重载
 *
 * 行是真的 `<a href="/keystatic/collection/…/item/…">`（中键 / Ctrl+点 = 新标签页，浏览器自己管）。
 * 普通左键点击时拦下来，`pushState` ＋ 派一个 `popstate` —— Keystatic 的 RouterProvider
 * 只听这个（`@keystatic/core` 的 `index-*.js`：`addEventListener("popstate", …setUrl(location.href))`），
 * 效果和它自己的 `router.push` 一样。五秒后还停在这张表上（上游哪天不听了）就整页载入那个地址 ——
 * **不许变成一个点了没反应的链接**。
 *
 * ## 别的
 *
 * - 面板根上带 `data-lwj-own-ui`（`./ownUi.ts`）：搜索框是个 `<input>`，而 `keystaticModTime.ts`
 *   的指纹压的是页面上每一个 input —— 换页那一拍面板还在 DOM 里，不排掉就会被算进编辑页的底数。
 * - 搜索词和页码记在地址栏（`?q=…&page=2`，理由在 `parseListState` 上）：点进一条再后退，
 *   回来还是那一页。
 * - Ctrl+F：Keystatic 在 document 上挂着"Ctrl+F 选中它的搜索框"，而那个框被我们藏了 ——
 *   不接过来的话 Ctrl+F 什么都不做（它 preventDefault 了浏览器的查找）。第二下交给浏览器。
 * - 条数和 Keystatic 自己那张表对账（`countMismatchText()`），对不上就在顶上说。
 *
 * ## 做不到的（照实写）
 *
 * - 没法按列排序了：顺序只有一种，新的在前（用户要的就是这个）。要别的顺序得点进
 *   Keystatic 那张表 —— 它只在读不到数据时露出来。
 * - 数据是**进列表页那一刻**读的（切回这个标签页会再读一次）。在别的标签页、命令行、
 *   导入页新建的，切回来就有；同一个标签页里一直开着不动的话，不会自己变。
 */
import { OWN_UI_ATTR } from "./ownUi";
import {
  clampListPage,
  countMismatchText,
  ENTRIES_ROUTE,
  filterRows,
  itemHref,
  keystaticCount,
  LIST_HEAD,
  listCollection,
  listColumns,
  listEmptyText,
  listPageCount,
  listPageRows,
  listPagerText,
  loadFailedText,
  ORDER_HINT,
  pageWindow,
  parseListState,
  parsePayload,
  refreshFailedText,
  rowBadges,
  rowSearchText,
  rowTooltip,
  searchPlaceholder,
  symbolsText,
  withListState,
  type EntryRow,
} from "./entryListPlan";

const TICK_MS = 250;
const FETCH_TIMEOUT_MS = 8000;
/** 两边条数对不上要持续这么久才说：刚存盘、刚换页的那一拍两边本来就可能差一条。 */
const MISMATCH_GRACE_MS = 1500;
/** 点了一行、这么久之后还停在这张表上 = Keystatic 的路由没接住 → 整页载入。 */
const NAV_FALLBACK_MS = 5000;
const MAIN_ID = "keystatic-main-panel";
const STYLE_ID = "lwj-entry-list-style";

const PANEL_ATTR = "data-lwj-el";
const GRID_ATTR = "data-lwj-el-grid";
const BAR_ATTR = "data-lwj-el-bar";
const NOTE_ATTR = "data-lwj-el-note";
const HEAD_ATTR = "data-lwj-el-head";
const SCROLL_ATTR = "data-lwj-el-scroll";
const LOADING_ATTR = "data-lwj-el-loading";
const LIST_ATTR = "data-lwj-el-list";
const ROW_ATTR = "data-lwj-el-row";
const CELL_ATTR = "data-lwj-el-cell";
const BADGE_ATTR = "data-lwj-el-badge";
const TITLE_ATTR = "data-lwj-el-title";
const DESC_ATTR = "data-lwj-el-desc";
const NONE_ATTR = "data-lwj-el-none";
const PENDING_ATTR = "data-lwj-el-pending";
const EMPTY_ATTR = "data-lwj-el-empty";
const PAGER_ATTR = "data-lwj-el-pager";
const STATUS_ATTR = "data-lwj-el-status";
const PAGES_ATTR = "data-lwj-el-pages";

/** 「面板挂在表后面、而且没退回」—— 藏表、藏搜索框的条件只写这一份。 */
const ACTIVE = `main:has(> [${GRID_ATTR}] ~ [${PANEL_ATTR}]:not([data-state="failed"]))`;

/**
 * ★ 藏 Keystatic 的东西一律 `!important`：它顶上那个搜索框的 `display` 是**内联样式**
 *   （`style={{ display: searchVisible ? "block" : "none" }}`），样式表不加 important 压不过。
 * ★ 列宽：号 / 标题 / 标的 / 智能体（模型）/ 发布时间。教程和提示词没有中间那两列（`data-cols`）。
 * ★ 边距照 Keystatic 那张表量的（740px 以下 8px、以上 12px、992px 以上 20px，
 *   格子里再 12px）—— 字和顶上那个标题左对齐。
 */
export const ENTRY_LIST_CSS = `
[${PANEL_ATTR}] { display: none; }
main > [${GRID_ATTR}] ~ [${PANEL_ATTR}] {
  display: flex; flex-direction: column; gap: 8px; order: 1;
  flex: 1 1 0%; min-height: 0; margin: 0 8px 8px;
  font-family: var(--kui-typography-font-family-base); font-size: 14px; line-height: 1.4;
  color: var(--kui-color-foreground-neutral);
}
@media (min-width: 740px) { main > [${GRID_ATTR}] ~ [${PANEL_ATTR}] { margin: 16px 12px 24px; } }
@media (min-width: 992px) { main > [${GRID_ATTR}] ~ [${PANEL_ATTR}] { margin: 16px 20px 24px; } }

${ACTIVE} > [${GRID_ATTR}],
${ACTIVE} > header [role="search"],
${ACTIVE} > header button[aria-label="show search"] { display: none !important; }
/* 窄窗口（< 740px）里 Keystatic 认为"搜索框开着"时会把「Add」藏起来给它腾地方，
   要等人点进那个框再点出去才还回来 —— 而那个框被我们藏了，「Add」就永远回不来（实测）。
   我们的面板在的时候，腾地方这件事不成立，按钮照常显示。 */
${ACTIVE} > header a[href$="/create"] { display: flex !important; }

/* 读不到数据：面板只剩顶上那句话，排在露回来的那张表上面。 */
main > [${GRID_ATTR}] ~ [${PANEL_ATTR}][data-state="failed"] { flex: 0 0 auto; margin-bottom: 0; }
main:has(> [${PANEL_ATTR}][data-state="failed"]) > [${GRID_ATTR}] { order: 2; }
[${PANEL_ATTR}][data-state="failed"] > :not([${NOTE_ATTR}]) { display: none; }

[${BAR_ATTR}] { display: flex; align-items: center; gap: 12px; flex: 0 0 auto; }
[${BAR_ATTR}] input {
  box-sizing: border-box; width: min(100%, 440px); height: 32px; margin: 0; padding: 0 10px;
  border: 1px solid var(--kui-color-border-emphasis); border-radius: var(--kui-size-radius-regular);
  background: transparent; color: var(--kui-color-foreground-neutral-emphasis); font: inherit;
}
[${BAR_ATTR}] input::placeholder { color: var(--kui-color-foreground-neutral-tertiary); }
[${BAR_ATTR}] input:focus { outline: 2px solid var(--kui-color-background-accent-emphasis); outline-offset: -1px; }

[${NOTE_ATTR}] {
  margin: 0; padding: 6px 12px; flex: 0 0 auto; font-size: 13px; line-height: 1.6;
  border-radius: var(--kui-size-radius-regular);
}
[${NOTE_ATTR}][data-tone="critical"] {
  color: var(--kui-color-foreground-critical);
  background: color-mix(in srgb, var(--kui-color-foreground-critical) 12%, transparent);
}
[${NOTE_ATTR}][data-tone="caution"] {
  color: var(--kui-color-foreground-caution);
  background: color-mix(in srgb, var(--kui-color-foreground-caution) 12%, transparent);
}
[${NOTE_ATTR}] button {
  margin: 0 0 0 8px; padding: 0 8px; height: 24px; cursor: pointer; font: inherit;
  border: 1px solid currentColor; border-radius: var(--kui-size-radius-regular);
  background: none; color: inherit;
}

/* 宽度是量出来的（1280 宽的窗口、13px 字）：「2026-09-23 10:52」连内边距 149px，
   「OpenAI ChatGPT（GPT-6-Pro）」221px。标的那一列的英文名常常放不下，靠悬停提示补全。
   ★ 标题那一列的**下限**（16em）是承重的：grid 分剩余宽度时先把 minmax(0, …) 那几列
     撑到上限、fr 那一列只拿剩下的 —— 没有下限的话，768 宽的窗口里标题只剩 130px，
     而它是这张表上最要紧的一列（实测）。 */
[${PANEL_ATTR}][data-cols="agent"] {
  --lwj-el-cols: 4.5em minmax(16em, 1fr) minmax(0, 10em) minmax(0, 17em) 11em;
}
[${PANEL_ATTR}][data-cols="plain"] { --lwj-el-cols: 4.5em minmax(0, 1fr) 11em; }
[${HEAD_ATTR}], [${ROW_ATTR}] {
  display: grid; grid-template-columns: var(--lwj-el-cols); align-items: center;
}
[${HEAD_ATTR}] {
  flex: 0 0 auto; min-height: 36px; overflow: hidden; scrollbar-gutter: stable;
  border-bottom: 1px solid var(--kui-color-border-muted);
  color: var(--kui-color-foreground-neutral-secondary);
}
[${HEAD_ATTR}] > span, [${ROW_ATTR}] > span {
  padding: 0 12px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
[${SCROLL_ATTR}] { flex: 1 1 auto; min-height: 0; overflow-y: auto; scrollbar-gutter: stable; }
[${LIST_ATTR}] { list-style: none; margin: 0; padding: 0; }
[${LIST_ATTR}] > li + li { border-top: 1px solid var(--kui-color-border-muted); }
[${ROW_ATTR}] {
  min-height: 44px; color: inherit; text-decoration: none;
  border-radius: var(--kui-size-radius-regular);
}
[${ROW_ATTR}]:hover { background: var(--kui-color-alias-background-hovered); }
[${ROW_ATTR}]:focus-visible {
  outline: 2px solid var(--kui-color-background-accent-emphasis); outline-offset: -2px;
}
[${CELL_ATTR}="no"], [${CELL_ATTR}="pub"] {
  font-variant-numeric: tabular-nums; color: var(--kui-color-foreground-neutral-secondary);
}
[${CELL_ATTR}="pub"], [${CELL_ATTR}="symbols"], [${CELL_ATTR}="byline"] { font-size: 13px; }
[${ROW_ATTR}] > [${CELL_ATTR}="title"] { display: flex; align-items: baseline; gap: 8px; }
[${TITLE_ATTR}] {
  flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  color: var(--kui-color-foreground-neutral-emphasis); font-weight: 500;
}
[${TITLE_ATTR}][data-missing] {
  font-style: italic; font-weight: 400; color: var(--kui-color-foreground-neutral-tertiary);
}
[${DESC_ATTR}] {
  flex: 1 1 0%; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  font-size: 13px; color: var(--kui-color-foreground-neutral-tertiary);
}
[${ROW_ATTR}][data-problem] [${DESC_ATTR}] { color: var(--kui-color-foreground-critical); }
[${NONE_ATTR}] { color: var(--kui-color-foreground-neutral-tertiary); }
[${PENDING_ATTR}] {
  padding: 0 6px; font-size: 12px; border: 1px dashed var(--kui-color-border-emphasis);
  border-radius: 4px; color: var(--kui-color-foreground-neutral-secondary);
}
[${BADGE_ATTR}] {
  flex: none; padding: 0 6px; border-radius: 4px; font-size: 12px; line-height: 18px; font-weight: 500;
}
[${BADGE_ATTR}="problem"] {
  color: var(--kui-color-foreground-critical);
  background: color-mix(in srgb, var(--kui-color-foreground-critical) 16%, transparent);
}
[${BADGE_ATTR}="draft"] {
  color: var(--kui-color-foreground-caution);
  background: color-mix(in srgb, var(--kui-color-foreground-caution) 16%, transparent);
}
[${BADGE_ATTR}="future"] {
  color: var(--kui-color-foreground-pending);
  background: color-mix(in srgb, var(--kui-color-foreground-pending) 16%, transparent);
}
[${BADGE_ATTR}="featured"] {
  color: var(--kui-color-foreground-accent);
  background: color-mix(in srgb, var(--kui-color-foreground-accent) 16%, transparent);
}
[${BADGE_ATTR}="offsite"] {
  color: var(--kui-color-foreground-neutral-secondary);
  border: 1px solid var(--kui-color-border-neutral);
}

[${LOADING_ATTR}], [${EMPTY_ATTR}] {
  margin: 0; padding: 16px 12px; color: var(--kui-color-foreground-neutral-secondary);
}
[${LOADING_ATTR}] { display: none; }
/* 读得快（本机几十毫秒）就一个字都不闪；慢了才出来说"正在读"。 */
[${PANEL_ATTR}][data-state="loading"] [${LOADING_ATTR}] { display: block; animation: lwj-el-in .2s .3s both; }
@keyframes lwj-el-in { from { opacity: 0; } to { opacity: 1; } }

[${PAGER_ATTR}] {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; flex: 0 0 auto;
  padding-top: 8px; border-top: 1px solid var(--kui-color-border-muted);
  font-size: 13px; color: var(--kui-color-foreground-neutral-secondary);
}
[${PANEL_ATTR}][data-state="loading"] [${PAGER_ATTR}] { visibility: hidden; }
[${STATUS_ATTR}] { margin-inline-end: auto; }
[${PAGES_ATTR}] { display: flex; align-items: center; gap: 4px; }
[${PAGES_ATTR}] button {
  min-width: 30px; height: 28px; margin: 0; padding: 0 8px; cursor: pointer;
  border: 1px solid var(--kui-color-border-neutral); border-radius: var(--kui-size-radius-regular);
  background: none; color: var(--kui-color-foreground-neutral); font: inherit;
  font-variant-numeric: tabular-nums;
}
[${PAGES_ATTR}] button:hover { background: var(--kui-color-alias-background-hovered); }
[${PAGES_ATTR}] button:focus-visible {
  outline: 2px solid var(--kui-color-background-accent-emphasis); outline-offset: 1px;
}
[${PAGES_ATTR}] button[aria-current="page"] {
  cursor: default; border-color: transparent; color: #fff;
  background: var(--kui-color-background-accent-emphasis);
}
[${PAGES_ATTR}] button[aria-disabled="true"] { opacity: .4; cursor: default; }

/* 窄屏：标的、智能体两列让位给标题（点进去照样看得见）。 */
@media (max-width: 739px) {
  [${PANEL_ATTR}][data-cols="agent"] { --lwj-el-cols: 4.5em minmax(0, 1fr) 11em; }
  [${PANEL_ATTR}] :is([${CELL_ATTR}="symbols"], [${CELL_ATTR}="byline"]) { display: none; }
}
`;

/** 一次读回来的数据。`hay` 是每一行预先算好的搜索文本（每敲一个字不用重算）。 */
interface Fetched {
  rows: EntryRow[];
  hay: string[];
  readAt: string;
}

interface Panel {
  collection: string;
  cols: { symbols: boolean; byline: boolean };
  root: HTMLElement;
  input: HTMLInputElement;
  note: HTMLElement;
  scroll: HTMLElement;
  list: HTMLElement;
  empty: HTMLElement;
  status: HTMLElement;
  pages: HTMLElement;
  /** loading：第一次还没读回来；ready：手上有数据；failed：第一次就没读到（退回 Keystatic 那张表）。 */
  state: "loading" | "ready" | "failed";
  data: Fetched | null;
  /** 最近一次读失败的原因。ready 档里有它 = 刷新失败（列表照画，顶上说是几点的）。 */
  error: string | null;
  q: string;
  page: number;
  /** 最后一次读到 / 写进去的 `location.search` —— 和它不一样就是别人改了地址栏（后退、前进）。 */
  search: string;
  token: number;
  mismatch: string | null;
  mismatchSince: number | null;
}

/** 每个集合最近一次读到的。回到列表页时先画它（马上就有东西），同时再读一遍。 */
const latest = new Map<string, Fetched>();
const inflight = new Map<string, Promise<Fetched>>();
let panel: Panel | null = null;
/** 挂面板那一步抛过一次，就再也不接管（这一页从此是 Keystatic 原来的表）。 */
let broken = false;

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {}
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── 读数据 ────────────────────────────────────────────────────────────

function fetchRows(collection: string): Promise<Fetched> {
  const running = inflight.get(collection);
  if (running) return running;

  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const job = (async (): Promise<Fetched> => {
    let res: Response;
    try {
      res = await fetch(
        `${ENTRIES_ROUTE}?c=${encodeURIComponent(collection)}`,
        {
          cache: "no-store",
          signal: ctrl.signal,
          headers: { Accept: "application/json" },
        }
      );
    } catch (err) {
      throw new Error(
        ctrl.signal.aborted
          ? `${ENTRIES_ROUTE} ${FETCH_TIMEOUT_MS / 1000} 秒没有回音`
          : `请求没发出去：${errorText(err)}`
      );
    }
    const body = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new Error(
        `${ENTRIES_ROUTE} 回了 HTTP ${res.status}，而且不是 JSON` +
          (res.status === 404
            ? "（dev server 还没重启过？这条路由是 astro.config.ts 挂的）"
            : "")
      );
    }
    const parsed = parsePayload(json, collection);
    if (!parsed.ok) throw new Error(`HTTP ${res.status}：${parsed.error}`);
    const { entries, readAt } = parsed.payload;
    const data: Fetched = {
      rows: entries,
      hay: entries.map(rowSearchText),
      readAt,
    };
    latest.set(collection, data);
    return data;
  })();
  const tracked = job.finally(() => {
    window.clearTimeout(timer);
    inflight.delete(collection);
  });
  inflight.set(collection, tracked);
  return tracked;
}

function load(p: Panel): void {
  const token = ++p.token;
  fetchRows(p.collection).then(
    data => {
      if (panel !== p || token !== p.token) return;
      p.data = data;
      p.error = null;
      p.state = "ready";
      render(p);
    },
    (err: unknown) => {
      if (panel !== p || token !== p.token) return;
      p.error = errorText(err);
      if (!p.data) p.state = "failed";
      render(p);
    }
  );
}

// ── 地址栏 ────────────────────────────────────────────────────────────

function writeUrl(p: Panel): void {
  const next = withListState(location.search, { q: p.q, page: p.page });
  if (next !== location.search) {
    history.replaceState(
      history.state,
      "",
      `${location.pathname}${next}${location.hash}`
    );
  }
  p.search = location.search;
}

function adoptUrl(p: Panel): void {
  const s = parseListState(location.search);
  p.search = location.search;
  p.q = s.q;
  p.page = s.page;
  if (p.input.value !== s.q) p.input.value = s.q;
  render(p);
}

// ── 画 ───────────────────────────────────────────────────────────────

function cell(kind: string, text = ""): HTMLSpanElement {
  const el = make("span", { [CELL_ATTR]: kind });
  el.textContent = text;
  return el;
}

function rowEl(p: Panel, row: EntryRow): HTMLLIElement {
  const li = make("li");
  const a = make("a", {
    href: itemHref(p.collection, row.slug),
    [ROW_ATTR]: "",
  });
  a.title = rowTooltip(row);
  if (row.problem) a.setAttribute("data-problem", "");

  const title = cell("title");
  for (const b of rowBadges(row)) {
    const badge = make("span", { [BADGE_ATTR]: b.kind, title: b.hint });
    badge.textContent = b.text;
    title.append(badge);
  }
  const name = make("span", { [TITLE_ATTR]: "" });
  if (row.title) {
    name.textContent = row.title;
  } else {
    // 没有标题 ≠ 空白：空白和"这一行坏了"长得一样。读不出来的那条印文件名，好去找。
    name.setAttribute("data-missing", "");
    name.textContent = row.problem ? `${row.slug}.md` : "（没有标题）";
  }
  title.append(name);
  const sub = row.problem ?? row.description;
  if (sub) {
    const desc = make("span", { [DESC_ATTR]: "" });
    desc.textContent = sub;
    title.append(desc);
  }

  a.append(cell("no", row.slug), title);

  if (p.cols.symbols) {
    const sym = cell("symbols");
    const text = symbolsText(row);
    if (text) {
      sym.textContent = text;
      sym.title = row.symbols
        .map(s => [s.code, s.name, s.nameEn].filter(Boolean).join(" · "))
        .join("\n");
    } else if (!row.problem) {
      // 三档不许长得一样：没认出来（待补，虚线）/ 一只都没勾（完成态，一道横）/ 读不出来（空着，徽章在说）。
      const mark = make(
        "span",
        row.symbolsPending ? { [PENDING_ATTR]: "" } : { [NONE_ATTR]: "" }
      );
      mark.textContent = row.symbolsPending ? "标的待补" : "—";
      if (row.symbolsPending)
        mark.title = "symbolSource: unknown —— 标的还没认出来";
      sym.append(mark);
    }
    a.append(sym);
  }
  if (p.cols.byline) {
    const by = cell("byline", row.byline ?? "");
    if (row.byline) by.title = row.byline; // 窄窗口里会被截断
    a.append(by);
  }

  const pub = cell("pub", row.pubLabel);
  if (!row.pubLabel && !row.problem) {
    const none = make("span", { [NONE_ATTR]: "" });
    none.textContent = "（没有发布时间）";
    pub.append(none);
  }
  a.append(pub);

  li.append(a);
  return li;
}

function pageButton(
  label: string,
  target: number,
  opts: { current?: boolean; disabled?: boolean; aria?: string } = {}
): HTMLButtonElement {
  const b = make("button", { type: "button", "data-page": String(target) });
  b.textContent = label;
  if (opts.aria) b.setAttribute("aria-label", opts.aria);
  if (opts.current) b.setAttribute("aria-current", "page");
  // aria-disabled 而不是 disabled：一个拿着焦点的按钮被 disabled 掉，焦点会掉到 body 上。
  if (opts.disabled) b.setAttribute("aria-disabled", "true");
  return b;
}

function renderNote(p: Panel): void {
  let text: string | null = null;
  let tone: "critical" | "caution" = "caution";
  let retry = false;
  if (p.state === "failed") {
    text = loadFailedText(p.error ?? "");
    tone = "critical";
    retry = true;
  } else if (p.error && p.data) {
    text = refreshFailedText(p.error, p.data.readAt);
    retry = true;
  } else if (p.mismatch) {
    text = p.mismatch;
  }
  if (text === null) {
    p.note.hidden = true;
    p.note.replaceChildren();
    return;
  }
  p.note.hidden = false;
  p.note.setAttribute("data-tone", tone);
  const span = make("span");
  span.textContent = text;
  const parts: Node[] = [span];
  if (retry) {
    const b = make("button", { type: "button", "data-retry": "" });
    b.textContent = "重试";
    parts.push(b);
  }
  p.note.replaceChildren(...parts);
}

function render(p: Panel): void {
  p.root.setAttribute("data-state", p.state);
  renderNote(p);
  if (p.state !== "ready" || !p.data) {
    p.list.replaceChildren();
    p.empty.hidden = true;
    p.status.textContent = "";
    p.pages.replaceChildren();
    return;
  }

  const { rows, hay } = p.data;
  const filtered = filterRows(rows, p.q, hay);
  const page = clampListPage(p.page, filtered.length);
  if (page !== p.page) {
    p.page = page;
    writeUrl(p); // 地址栏里的 page=99 夹回最后一页
  }

  p.list.replaceChildren(
    ...listPageRows(filtered, page).map(row => rowEl(p, row))
  );
  p.empty.hidden = filtered.length > 0;
  p.empty.textContent = p.empty.hidden ? "" : listEmptyText(p.q, rows.length);
  p.status.textContent = listPagerText(p.q, filtered.length, rows.length, page);

  const count = listPageCount(filtered.length);
  if (count <= 1) {
    p.pages.replaceChildren();
    return;
  }
  const buttons: Node[] = [
    pageButton("‹", page - 1, { disabled: page <= 0, aria: "上一页" }),
  ];
  for (const n of pageWindow(page, count)) {
    if (n === null) {
      const gap = make("span", { "aria-hidden": "true" });
      gap.textContent = "…";
      buttons.push(gap);
    } else {
      buttons.push(
        pageButton(String(n + 1), n, {
          current: n === page,
          aria: `第 ${n + 1} 页`,
        })
      );
    }
  }
  buttons.push(
    pageButton("›", page + 1, { disabled: page >= count - 1, aria: "下一页" })
  );
  p.pages.replaceChildren(...buttons);
}

// ── 动作 ─────────────────────────────────────────────────────────────

function setQuery(p: Panel, q: string): void {
  if (q === p.q) return;
  p.q = q;
  p.page = 0;
  writeUrl(p);
  render(p);
  p.scroll.scrollTop = 0;
}

function goPage(p: Panel, page: number): void {
  if (page === p.page) return;
  // 翻页那一排按钮是整排重画的：焦点在其中一个上的话，画完找回"同一个"（按 aria-label 认），
  // 不然用键盘翻页的人每翻一次焦点就掉回 body。
  const focused = document.activeElement;
  const label =
    focused instanceof HTMLElement && p.pages.contains(focused)
      ? focused.getAttribute("aria-label")
      : null;
  p.page = page;
  writeUrl(p);
  render(p);
  p.scroll.scrollTop = 0;
  if (label !== null) {
    const again = [...p.pages.querySelectorAll<HTMLElement>("button")].find(
      b => b.getAttribute("aria-label") === label
    );
    (
      again ?? p.pages.querySelector<HTMLElement>('[aria-current="page"]')
    )?.focus();
  }
}

/** 点一行：交给 Keystatic 的路由（见文件头）。 */
function openItem(href: string, grid: Element | null): void {
  try {
    history.pushState(null, "", href);
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  } catch {
    location.assign(href);
    return;
  }
  window.setTimeout(() => {
    if (location.href === href && grid?.isConnected) {
      // eslint-disable-next-line no-console -- 退回整页载入是安静的，不留一行没人知道点一下为什么变慢了
      console.warn(
        "[keystaticEntryList] Keystatic 的路由没接住这次换页，改成整页载入：",
        href
      );
      location.assign(href);
    }
  }, NAV_FALLBACK_MS);
}

function createPanel(collection: string, main: HTMLElement): Panel {
  const cols = listColumns(collection);
  const root = make("section", {
    [PANEL_ATTR]: "",
    [OWN_UI_ATTR]: "",
    "data-collection": collection,
    "data-cols": cols.byline || cols.symbols ? "agent" : "plain",
    "data-state": "loading",
    "aria-label": "条目列表",
  });

  const bar = make("div", { [BAR_ATTR]: "" });
  const input = make("input", {
    type: "search",
    placeholder: searchPlaceholder(cols),
    "aria-label": "搜索这个集合",
    title:
      "号、标题、摘要、标签、日期都搜得到" +
      (cols.symbols ? "，还有标的代码和中英文名" : "") +
      (cols.byline ? "、智能体和模型" : "") +
      "；敲「草稿」「置顶」「未到发布时间」就是只看那一种。空格隔开的几段要同时命中。",
    autocomplete: "off",
    spellcheck: "false",
  });
  bar.append(input);

  const note = make("p", { [NOTE_ATTR]: "", "aria-live": "polite" });
  note.hidden = true;

  const head = make("div", { [HEAD_ATTR]: "", "aria-hidden": "true" });
  const headCells = [
    cell("no", LIST_HEAD.no),
    cell("title", LIST_HEAD.title),
    ...(cols.symbols ? [cell("symbols", LIST_HEAD.symbols)] : []),
    ...(cols.byline ? [cell("byline", LIST_HEAD.byline)] : []),
    cell("pub", LIST_HEAD.pub),
  ];
  headCells[headCells.length - 1]!.title = ORDER_HINT;
  head.append(...headCells);

  const scroll = make("div", { [SCROLL_ATTR]: "" });
  const loading = make("p", { [LOADING_ATTR]: "" });
  loading.textContent = "正在读取…";
  const list = make("ul", { [LIST_ATTR]: "", "aria-label": "条目" });
  const empty = make("p", { [EMPTY_ATTR]: "" });
  empty.hidden = true;
  scroll.append(loading, list, empty);

  const pager = make("div", { [PAGER_ATTR]: "" });
  const status = make("span", { [STATUS_ATTR]: "", "aria-live": "polite" });
  const pages = make("span", { [PAGES_ATTR]: "", "aria-label": "翻页" });
  pager.append(status, pages);

  root.append(bar, note, head, scroll, pager);

  const p: Panel = {
    collection,
    cols,
    root,
    input,
    note,
    scroll,
    list,
    empty,
    status,
    pages,
    state: "loading",
    data: null,
    error: null,
    q: "",
    page: 0,
    search: "",
    token: 0,
    mismatch: null,
    mismatchSince: null,
  };

  // 输入法拼音还没选字的时候不筛（同另外两个选择器）。
  input.addEventListener("input", e => {
    if (!(e as InputEvent).isComposing) setQuery(p, input.value);
  });
  input.addEventListener("compositionend", () => setQuery(p, input.value));

  root.addEventListener("keydown", e => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = [
      ...list.querySelectorAll<HTMLAnchorElement>(`a[${ROW_ATTR}]`),
    ];
    if (e.target === input) {
      if (e.key === "ArrowDown" && rows[0]) {
        e.preventDefault();
        rows[0].focus();
      }
      return;
    }
    const i = rows.indexOf(e.target as HTMLAnchorElement);
    if (i < 0) return;
    e.preventDefault();
    if (e.key === "ArrowDown") rows[i + 1]?.focus();
    else (rows[i - 1] ?? input).focus();
  });

  list.addEventListener("click", e => {
    const a = (e.target as Element | null)?.closest?.(`a[${ROW_ATTR}]`);
    if (!(a instanceof HTMLAnchorElement) || e.defaultPrevented) return;
    // 中键、Ctrl / ⌘ / Shift / Alt + 点：新标签页、新窗口、下载 —— 浏览器自己管。
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    openItem(a.href, main.querySelector(`:scope > [${GRID_ATTR}]`));
  });

  pages.addEventListener("click", e => {
    const b = (e.target as Element | null)?.closest?.("button[data-page]");
    if (!b || b.getAttribute("aria-disabled") === "true") return;
    const n = Number(b.getAttribute("data-page"));
    if (Number.isInteger(n)) goPage(p, n);
  });

  note.addEventListener("click", e => {
    if ((e.target as Element | null)?.closest?.("button[data-retry]")) load(p);
  });

  // 上一次读到的先画上（回到列表页马上就有东西），同时再读一遍。
  const cached = latest.get(collection);
  if (cached) {
    p.data = cached;
    p.state = "ready";
  }
  main.append(root);
  panel = p;
  adoptUrl(p);
  load(p);
  return p;
}

function dispose(): void {
  const p = panel;
  if (!p) return;
  panel = null;
  p.token++;
  p.root.remove();
}

/** 两边条数对账（见 `countMismatchText()`）。只在手上有新数据、Keystatic 那张表没被它自己的搜索词筛过时比。 */
function checkCount(p: Panel, grid: Element): void {
  let text: string | null = null;
  if (
    p.state === "ready" &&
    p.data &&
    !p.error &&
    !new URLSearchParams(location.search).get("search")
  ) {
    const theirs = keystaticCount(grid.getAttribute("aria-rowcount"));
    if (theirs !== undefined) {
      text = countMismatchText(theirs, p.data.rows.length) ?? null;
    }
  }
  if (text === null) {
    p.mismatchSince = null;
    if (p.mismatch !== null) {
      p.mismatch = null;
      renderNote(p);
    }
    return;
  }
  const now = Date.now();
  p.mismatchSince ??= now;
  if (now - p.mismatchSince >= MISMATCH_GRACE_MS && p.mismatch !== text) {
    p.mismatch = text;
    renderNote(p);
  }
}

// ── 认那张表 ─────────────────────────────────────────────────────────

/** 任何一个集合的列表页（包括不归我们管的「常用提示词」）。 */
const LIST_PATH_RE = /^\/keystatic\/collection\/[^/?#]+\/?$/;

function sync(): void {
  if (broken) return;
  const main = document.getElementById(MAIN_ID);
  const grid =
    main?.querySelector<HTMLElement>(':scope > [role="grid"]') ?? null;
  const path = location.pathname;
  const key = listCollection(path);

  if (panel) {
    // ★ 点了一行、地址已经换成编辑页，但 Keystatic 还在后台渲染新页（它用 startTransition，
    //   新页没准备好之前旧页原样留着）—— 这时**不许拆面板**：拆了那张表就露出来，
    //   人会看到"旧的在前"那张表闪一下。等它真把表拿走再拆。
    // ⚠ 换到**另一张列表**不算这种情况：那张表多半是 React 接着用的同一个节点，
    //   等它"被拿走"要等到天荒地老 —— 面板会一直盖在别的集合上面。
    const gone =
      !main ||
      panel.root.parentElement !== main ||
      !grid ||
      (key !== panel.collection && LIST_PATH_RE.test(path));
    if (gone) dispose();
  }
  if (!key || !main || !grid) return;

  if (!grid.hasAttribute(GRID_ATTR)) grid.setAttribute(GRID_ATTR, "");
  if (!panel) {
    try {
      createPanel(key, main);
    } catch (err) {
      broken = true;
      dispose();
      // eslint-disable-next-line no-console -- 退回 Keystatic 那张表是安静的，不留一行没人知道搜索和分页为什么没了
      console.warn(
        "[keystaticEntryList] 列表面板出错，退回 Keystatic 原来的表：",
        err
      );
      return;
    }
  }
  const p = panel;
  if (!p || p.collection !== key) return;
  // 面板必须排在表**后面**（样式表那条 `~` 靠这个）。React 哪天把表换成一个新节点
  // 追加到最后，就把面板挪回末尾 —— 挪的是我们自己的节点，React 不认识它。
  if (grid.compareDocumentPosition(p.root) & Node.DOCUMENT_POSITION_PRECEDING) {
    main.append(p.root);
  }
  // 地址栏被别人改了（后退 / 前进 / 左侧菜单点回这一页）→ 照地址栏重读搜索词和页码。
  // ⚠ 只在**还停在这张列表上**时读：点了一行、Keystatic 还在渲染编辑页的那几拍里，
  //   地址已经是编辑页的了 —— 照它重读会把正显示着的列表翻回第 1 页、清空搜索词。
  if (location.search !== p.search) adoptUrl(p);
  checkCount(p, grid);
}

function safeSync(): void {
  try {
    sync();
  } catch (err) {
    broken = true;
    dispose();
    // eslint-disable-next-line no-console -- 同上：出错之后整页退回 Keystatic 的表，得留一行
    console.warn(
      "[keystaticEntryList] 出错，这一页退回 Keystatic 原来的表：",
      err
    );
  }
}

let scheduled = false;
/** DOM 一变就在**这一帧画出来之前**对一次（微任务）—— 表刚出现的那一帧就得是藏着的。 */
function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    safeSync();
  });
}

/** Ctrl / ⌘ + F：接到我们的搜索框上（见文件头）；已经在框里了就交给浏览器自己的查找。 */
function onFindKey(e: KeyboardEvent): void {
  const p = panel;
  if (!p || p.state === "failed" || !p.root.isConnected) return;
  if (listCollection(location.pathname) !== p.collection) return;
  if (e.key.toLowerCase() !== "f" || !(e.ctrlKey || e.metaKey)) return;
  if (e.altKey || e.shiftKey || document.activeElement === p.input) return;
  e.preventDefault();
  e.stopPropagation();
  p.input.focus();
  p.input.select();
}

/**
 * 挂载点：`keystatic.config.ts` 里一句 `mountEntryList()`（和另外几个 mount 挨着）。
 * ⚠ 那份配置**服务端也会加载**（/api/keystatic），所以先看 `document` 在不在。
 */
export function mountEntryList(): void {
  if (typeof document === "undefined") return;
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = ENTRY_LIST_CSS;
    (document.head ?? document.documentElement).append(style);
  }

  new MutationObserver(records => {
    const p = panel;
    // 我们自己重画列表引起的变动不算（不然每画一次就再对一次）。
    if (p && records.every(r => p.root.contains(r.target))) return;
    schedule();
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("popstate", schedule);
  document.addEventListener("keydown", onFindKey, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && panel) load(panel);
  });
  window.setInterval(safeSync, TICK_MS);
  schedule();
}
