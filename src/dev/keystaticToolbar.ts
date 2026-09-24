/**
 * 后台**左侧菜单最底下**那一块：几个 dev 专用页面的入口，外加一键重启脚本的绝对路径。
 *
 * 【2026-09-21 挪的位置】在这之前它是右下角一条浮在内容上的工具条。按用户要求
 * 整块挪进左侧菜单 —— 那几个入口本来就是"后台的功能"，和左边那排集合是一类东西；
 * 浮在右下角时它压着正文、而且和后台自己的导航长得毫无关系。
 *
 * 里面有什么（顺序就是屏幕上从上到下）：
 *   - 「粘贴导入」→ /_import  常用提示词 + 把智能体整理出来的 JSON 变成一条草稿
 *   - 「提交推送」→ /_publish 把后台存了盘的内容提交并推到 GitHub
 *   - 「清理特殊字符」→ /_tidy 【2026-09-22】清掉原样印在页面上、却什么也不表示的
 *                             字符：整行只有反斜杠 / 斜杠的行，和没解析成粗体的 `**`
 *   - 「图片卡片」→ /_cards   【2026-09-22 起】每条内容一张 1080×1440 的竖版卡，发雪球 / 富途配图用
 *                             （原来叫「封面图」→ /_xhs，是给小红书做的；2026-09-23 小红书删了，卡留着）
 *   - 「发帖文案」→ /_share   **常驻**；在编辑某一条时它多带一个
 *                             `#<集合>/<slug>` 锚点，直接落到那一条上
 *   - 最底下一行：一键重启脚本在磁盘上的绝对路径，点一下复制
 *
 * ★【2026-09-21 用户要的】「发帖文案」从"只在编辑某一条时出现"改成**常驻**。
 *   原来那个设计把入口和"当前正开着哪一条"绑在一起，可**这一页本身是一张全站清单**
 *   （每条已发布的内容一段文案）—— 想发上周那篇的时候，人得先随便点开一条稿子
 *   才看得见这个入口。锚点那件事没丢：在编辑页上它照旧带着锚点。
 *
 * 那行路径【2026-09-20 加】：后台白屏、或者新建的稿子在页面上不出现时要跑的就是
 * 那个脚本（`admin-restart.cmd` / `pnpm admin:restart`，见 docs/engineering-notes.md 坑 20、21）。
 * 绝对路径由 astro.config.ts 的 devGate 用 vite define 编进来 —— 浏览器里没有 cwd。
 *
 * ## 为什么是 DOM，不是 Keystatic 的某个选项
 *
 * 没有那个选项。`config({ ui })` 只有 `brand` / `navigation` 两个口子
 * （`@keystatic/core` 的 `config.d.ts`），而 `navigation` 的元素类型是
 * `(keyof Collections | keyof Singletons | "---")[]` —— **只能列内容集合和分隔线**，
 * 塞不进一条自定义链接。所以只能在浏览器里往那棵树上挂。
 *
 * ## 和 keystaticHelp.ts 同一套纪律，外加这里自己的一条
 *
 *   - **不加 class**：React 每次渲染都把 `className` 整个写回去。样式全挂在
 *     `data-lwj-*` 属性上，规则收在一张注进 `<head>` 的样式表里。
 *   - keystaticHelp 那边的硬规矩是"一个节点都不往 React 管的树里插"。这一件事做不到：
 *     要求就是"挂到左侧菜单里去"。退而求其次的做法是
 *     **所有东西收进一个自己的容器，整块挂成侧边栏那一列的最后一个孩子** ——
 *     React 那边看到的是一个它不认识的**兄弟**节点，而不是被打乱的孩子列表
 *     （它 reconcile 时按自己记着的引用做 insertBefore / removeChild，
 *     排在最后的陌生节点碰不到那几个引用）。真被某次重渲染抹掉了也不要紧：
 *     下面那个定时器认得出"自己那块没了"，会重新挂一次。
 *   - **轮询，不监听**：后台是 SPA，侧边栏是 React 水合之后才出现的，
 *     路由变了页面也不重载。和 keystaticGroupFill.ts 同一个理由。
 *
 * ## 认不出侧边栏就回落到右下角，而且**屏幕上看得出来是回落了**
 *
 * 上游改了结构 / 窄屏把侧边栏收成抽屉的时候，`sidebarColumn()` 返回 null，
 * 整块退回原来那个右下角浮层，并在顶上印一句「没认出后台左侧菜单」。
 * ★ 这一档**不许做成"什么都不显示"**：`/_publish` 是内容离开这台机器的唯一出口，
 *   入口静默消失的话，"这个后台没有这个按钮"和"上游把 DOM 改了"在屏幕上
 *   字节级相同，而后者没有任何人会发现（和 docs/engineering-notes.md 第二节投稿入口那条同一形态）。
 *
 * ⚠ 服务端也会加载这份配置（/api/keystatic），所以先判 `typeof document`。
 */

import { CONTENT_COLLECTIONS } from "../config/collections";

const BOX_ID = "lwj-nav";
const SHARE_ID = "lwj-share-link";
const STYLE_ID = "lwj-nav-style";

/** 后台的根地址。侧边栏是"含有一条指向它的链接的那个 `<nav>`"——认语义，不认类名。 */
const ROOT_PATH = "/keystatic";

/**
 * 正在编辑的是**哪一条** —— 「发帖文案」那条链接据此多带一个锚点。
 *
 * 创建页（`/create`）没有 slug、也还没存盘（没存的条目没有公开地址），
 * 集合列表页、Dashboard、单例页同理 —— 这几档都认不出条目，链接就退回不带锚点的
 * `/_share`（它**仍然在**，见文件头）。
 * ★ 判据是**地址栏**，不是 DOM：表单长什么样和"这条有没有公开地址"没关系。
 * ★ 集合名单从**登记表**推（有详情路由的那几个）：
 *   【2026-09-21】原来写死 `(posts|qa)`，而同一天 /_share 扩成四个集合之后，
 *   写死的那版会让教程 / 提示词的编辑页**悄悄没有锚点** —— 链接照常能点，
 *   只是落在页面顶上，零报错。名单只在 collections.ts 一处。
 */
const ROUTED_KEYS = CONTENT_COLLECTIONS.filter(c => c.urlPrefix !== null).map(
  c => c.key
);
const ITEM_RE = new RegExp(
  `^/keystatic/collection/(${ROUTED_KEYS.join("|")})/item/([^/?#]+)`
);

/** 一键重启脚本的文件名（仓库根目录，和 package.json 的 admin:restart 同一件事）。 */
const RESTART_SCRIPT = "admin-restart.cmd";

/** 每次看一眼侧边栏还在不在、自己那块还在不在。 */
const TICK_MS = 300;

/**
 * 看不见侧边栏时**先等一会儿再说**。后台是 React 岛，水合完才有左侧菜单；
 * 一上来就判"认不出"会让那个琥珀色的回落浮层闪一下再跳进侧边栏 ——
 * 屏幕上说了一句当时就不成立的话。
 */
const GRACE_MS = 5000;

/** 侧边栏那一列的宽度得落在这个区间里，否则当成"认不出"。理由见 `sidebarColumn()`。 */
const COLUMN_MIN_PX = 120;
const COLUMN_MAX_PX = 480;

const BOX_ATTR = "data-lwj-nav";
const HEAD_ATTR = "data-lwj-nav-head";
const NOTE_ATTR = "data-lwj-nav-note";
const LIST_ATTR = "data-lwj-nav-list";
const LINK_ATTR = "data-lwj-nav-link";
const ARROW_ATTR = "data-lwj-nav-arrow";
const RESTART_ATTR = "data-lwj-restart";
const RESTART_LABEL_ATTR = "data-lwj-restart-label";
const RESTART_PATH_ATTR = "data-lwj-restart-path";
const RESTART_STATUS_ATTR = "data-lwj-restart-status";

/** 挂在哪一档。两档在屏幕上长得不一样，见 `fallbackNote()`。 */
export type Placement = "sidebar" | "corner";

/** 「发帖文案」那条的地址（不带锚点的那一档）。 */
export const SHARE_ROUTE = "/_share";

/**
 * 菜单里那**五条**入口，顺序就是屏幕上从上到下。
 * ★【2026-09-22】「图片卡片」（原「封面图」）排在「发帖文案」前面：两条挨着放是因为
 *   它们是同一件事（发出去）的两半 —— 一边出图，一边出字。
 * ★ `href` 必须和 astro.config.ts 里 `injectRoute` 的 pattern 逐字对上 ——
 *   指向空气的入口比没有入口更坏（toolbar.test.ts 拿这张表去对账）。
 * ★【2026-09-21】「发帖文案」进了这张表（常驻）。它和另外两条的唯一区别是
 *   **href 会跟着地址栏变**：在编辑某一条时补一个 `#<集合>/<slug>` 锚点。
 */
export const NAV_LINKS: readonly {
  id: string;
  href: string;
  text: string;
  title: string;
}[] = [
  {
    id: "lwj-import-link",
    href: "/_import",
    text: "粘贴导入",
    title:
      "常用提示词 + 把智能体整理出来的 JSON 变成一条草稿（新标签页打开 /_import）",
  },
  {
    id: "lwj-publish-link",
    href: "/_publish",
    text: "提交推送",
    title:
      "把后台存了盘的内容提交并推到 GitHub（新标签页打开 /_publish，先看清单再点）",
  },
  {
    id: "lwj-tidy-link",
    href: "/_tidy",
    text: "清理特殊字符",
    title:
      "把原样印在页面上、却什么也不表示的字符清掉：整行只有反斜杠 / 斜杠的行" +
      "（模型写 LaTeX 留下的），和没解析成粗体的那两个星号" +
      "（新标签页打开 /_tidy，先看清单再点）。",
  },
  {
    id: "lwj-cards-link",
    href: "/_cards",
    text: "图片卡片",
    title:
      "每条已发布的内容一张 1080×1440（3:4）的图片卡片，发雪球 / 富途时配图用，点一下下载" +
      "（新标签页打开 /_cards）。和「发帖文案」是一对：那边出字，这边出图。",
  },
  {
    id: SHARE_ID,
    href: SHARE_ROUTE,
    text: "发帖文案",
    title:
      "每条已发布的内容一段发到 X 的话（新标签页打开 /_share）。" +
      "正在编辑某一条时，会直接落到那一条上。",
  },
];

/**
 * 仓库根目录的绝对路径，由 astro.config.ts 的 devGate 用 vite define 编进来
 * （浏览器里拿不到 cwd）。没注入的话这个标识符压根不存在，`typeof` 不会抛。
 */
declare const __LWJ_DEV_ROOT__: string | undefined;

/**
 * 要显示的那行路径。
 *
 * ★ 注入没成的时候**照样显示**，只是退回文件名并在旁边说清楚"绝对路径没注入" ——
 * 整块消失的话，"这个后台没有这个东西"和"注入断了"在屏幕上字节级相同，
 * 而后者没有任何人会发现（和 docs/engineering-notes.md 第二节投稿入口那条同一个形态）。
 */
export function restartPath(root: string | undefined): {
  text: string;
  exact: boolean;
} {
  if (typeof root !== "string" || root.trim() === "") {
    return { text: RESTART_SCRIPT, exact: false };
  }
  const trimmed = root.replace(/[\\/]+$/, "");
  const sep = trimmed.includes("\\") ? "\\" : "/";
  return { text: `${trimmed}${sep}${RESTART_SCRIPT}`, exact: true };
}

/**
 * 点一下之后那句话 —— **三档**，别把后两档说成同一句。
 *
 * 【2026-09-20 当场抓到】第一版失败时固定印「复制不了 —— 整条已选中，Ctrl-C」，
 * 而它挂在一个 `<button>` 上：点按钮**根本不产生选区**（实测
 * `getSelection().toString()` 是空串）。那句话是假的，照着它按 Ctrl-C 什么都没有。
 * 现在选中与否是**真去查**的（`selectAll()` 的返回值），查不着就老实说手动选。
 */
export function copyStatus(copied: boolean, selected: boolean): string {
  if (copied) return "已复制 ✓";
  return selected
    ? "复制不了 —— 已经帮你选中，按 Ctrl-C"
    : "复制不了，也没选中 —— 自己选一下这行";
}

export interface ShareTarget {
  collection: string;
  slug: string;
}

/**
 * 这个地址该不该有「发帖文案」，以及给哪一条。
 * 认地址栏不认 DOM（见 `ITEM_RE` 上面那段）。
 */
export function shareTarget(pathname: string): ShareTarget | undefined {
  const m = ITEM_RE.exec(pathname);
  if (!m) return undefined;
  return { collection: m[1]!, slug: decodePath(m[2]!) };
}

/**
 * 地址栏里的 slug 是百分号编码的（中文 slug 很常见）。
 * ⚠ 解不开**不许抛**：这段代码每 300ms 跑一次，抛一次就是从此不再更新整块，
 * 而手敲一个畸形地址（一个孤零零的 `%`）就能让 `decodeURIComponent` 抛。
 * 解不开就原样用 —— 这一条指向的页面多半也不存在，但整块菜单不该跟着陪葬。
 */
function decodePath(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function shareHref(target: ShareTarget): string {
  return `${SHARE_ROUTE}#${target.collection}/${target.slug}`;
}

/**
 * 回落那一档要在屏幕上多出来的那句话；正常那一档没有这句。
 *
 * ★ 两档不许长得一样。整块静默挪到右下角的话，"后台一直是这样"和
 *   "上游把侧边栏改了、我们认不出来了"在屏幕上没有任何区别。
 */
export function fallbackNote(where: Placement): string | undefined {
  return where === "corner"
    ? "⚠ 没认出后台左侧菜单 —— 这几个入口回落到了右下角"
    : undefined;
}

const FALLBACK_TITLE =
  "本来应该挂在左侧菜单最底下（src/dev/keystaticToolbar.ts 的 sidebarColumn()）。" +
  "认不出那一列的结构时整块回落到这里 —— 按钮还在，只是位置退了一档。";

const CSS = `
[${BOX_ATTR}] {
  display: flex; flex-direction: column; gap: 2px;
  flex: 0 0 auto;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--kui-color-border-muted, rgb(127 127 127 / .3));
}
/* 回落档：回到原来那个右下角浮层，外加一圈虚线和一句话（见 fallbackNote）。 */
[${BOX_ATTR}][data-lwj-where="corner"] {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;
  max-width: min(420px, 92vw);
  border: 1px dashed #a16207; border-radius: 10px;
  background: #1f2024; color: #f3f4f6;
  box-shadow: 0 6px 20px rgb(0 0 0 / .3);
}

[${HEAD_ATTR}] {
  padding: 6px 12px 2px;
  font-size: 12px; font-weight: 500; text-transform: uppercase;
  color: var(--kui-color-foreground-neutral-secondary, #909090);
}
[${NOTE_ATTR}] {
  padding: 6px 12px 4px;
  font-size: 12px; line-height: 1.5; color: #fbbf24;
}

[${LIST_ATTR}] { display: flex; flex-direction: column; gap: 2px; }
/* 尺寸照着上游导航项量的（内框 padding 4px 12px、min-height 32px、16px 字），
   这样它和上面那排集合看着是同一排东西，而不是贴上去的。 */
[${LINK_ATTR}] {
  display: flex; align-items: center; gap: 8px;
  min-height: 32px; padding: 4px 12px;
  border-radius: 6px; text-decoration: none; font-size: 16px;
  color: var(--kui-color-foreground-neutral, #b9b9b9);
}
[${LINK_ATTR}]:hover, [${LINK_ATTR}]:focus-visible {
  background: var(--kui-color-alias-background-hovered, rgb(255 255 255 / .08));
  color: var(--kui-color-foreground-neutral-emphasis, #e3e3e3);
}
[${ARROW_ATTR}] { margin-inline-start: auto; font-size: 12px; opacity: .6; }

[${RESTART_ATTR}] {
  margin-top: 8px; padding: 6px 12px; border-radius: 6px; cursor: pointer;
  font-size: 11px; line-height: 1.6; overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  color: var(--kui-color-foreground-neutral-tertiary, #6e6e6e);
  background: var(--kui-color-alias-background-idle, rgb(255 255 255 / .04));
}
[${RESTART_ATTR}]:hover {
  background: var(--kui-color-alias-background-hovered, rgb(255 255 255 / .08));
}
/* 绝对路径没注入的那一档（restartPath 的 exact: false）必须和正常档长得不一样。 */
[${RESTART_ATTR}][data-lwj-exact="no"] {
  border: 1px dashed #a16207; color: #fbbf24; background: none;
}
[${RESTART_LABEL_ATTR}] { display: block; }
[${RESTART_PATH_ATTR}] {
  display: block; user-select: all;
  color: var(--kui-color-foreground-neutral-secondary, #909090);
}
[${RESTART_ATTR}][data-lwj-exact="no"] [${RESTART_PATH_ATTR}] { color: inherit; }
[${RESTART_STATUS_ATTR}] { display: block; color: #fbbf24; }
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

/** 真去选中这个节点里的字，并**回报有没有选上**（别替调用方打包票）。 */
function selectAll(node: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel) return false;
  const range = document.createRange();
  range.selectNodeContents(node);
  sel.removeAllRanges();
  sel.addRange(range);
  return sel.toString().trim() !== "";
}

/**
 * 最底下那一行：`重启后台` ＋ 绝对路径，点一下复制。
 * 路径单独一个 span —— 提示语挂在下面一行，不覆盖路径本身（覆盖了就没法选、没法看）。
 */
function restartRow(): HTMLElement {
  const { text, exact } = restartPath(
    typeof __LWJ_DEV_ROOT__ === "string" ? __LWJ_DEV_ROOT__ : undefined
  );

  const el = document.createElement("div");
  el.setAttribute(RESTART_ATTR, "");
  el.setAttribute("data-lwj-exact", exact ? "yes" : "no");
  el.title = exact
    ? "一键重启后台：双击这个文件，或者在仓库里跑 pnpm admin:restart。点一下复制路径。"
    : "绝对路径没注入（astro.config.ts 的 __LWJ_DEV_ROOT__），这里只能给到文件名。" +
      "它在仓库根目录；也可以直接跑 pnpm admin:restart。";

  const label = document.createElement("span");
  label.setAttribute(RESTART_LABEL_ATTR, "");
  label.textContent = exact ? "重启后台" : "重启后台（脚本在仓库根目录）";

  const value = document.createElement("span");
  value.setAttribute(RESTART_PATH_ATTR, "");
  value.textContent = text;

  const status = document.createElement("span");
  status.setAttribute(RESTART_STATUS_ATTR, "");

  const flash = (msg: string) => {
    status.textContent = msg;
    window.setTimeout(() => (status.textContent = ""), 2400);
  };
  const fallback = () => flash(copyStatus(false, selectAll(value)));

  el.addEventListener("click", () => {
    const write = navigator.clipboard?.writeText(text);
    if (!write) return fallback();
    void write.then(() => flash(copyStatus(true, false)), fallback);
  });

  el.append(label, value, status);
  return el;
}

function navLink(
  id: string,
  href: string,
  text: string,
  title: string
): HTMLAnchorElement {
  const a = document.createElement("a");
  a.id = id;
  a.href = href;
  // 新标签页打开：这三个页面都是离开后台的，同标签页跳过去等于扔掉没存的表单。
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.title = title;
  a.setAttribute(LINK_ATTR, "");

  const label = document.createElement("span");
  label.textContent = text;
  const arrow = document.createElement("span");
  arrow.setAttribute(ARROW_ATTR, "");
  arrow.textContent = "↗";

  a.append(label, arrow);
  return a;
}

/**
 * 侧边栏那一列 —— 我们要把整块挂成它的**最后一个孩子**。认不出返回 null。
 *
 * 怎么认：先找那条指向后台根地址的链接（Dashboard），它所在的 `<nav>` 就是左侧菜单。
 * ⚠ 不能直接 `document.querySelector("nav")`：编辑页上有**两个** `<nav>`，
 *   第二个是正文上面那条面包屑（实测 `kui:Breadcrumbs`）。
 * 再往上两级：`nav` → 可滚动区 → 那一列（列是 flex column，可滚动区 `flex: 1 1 0`，
 * 所以挂在列的最后 = 钉在菜单最底下，而且上面那截会自己让出高度）。
 *
 * 宽度那道闸是防**两种**认错：上游把结构改了导致我们摸到一个巨大的容器（挂进去
 * 会横在正文中间），以及窄屏把侧边栏收成抽屉、那一列宽度是 0（挂进去等于看不见 ——
 * 而"看不见"正是这块东西最不能出现的状态）。两种都落到回落档，屏幕上会说话。
 */
function sidebarColumn(): HTMLElement | null {
  const home = document.querySelector<HTMLAnchorElement>(
    `nav a[href="${ROOT_PATH}"]`
  );
  const nav = home?.closest("nav");
  const column = nav?.parentElement?.parentElement;
  if (!nav || !(column instanceof HTMLElement) || !column.contains(nav)) {
    return null;
  }
  const width = column.getBoundingClientRect().width;
  if (width < COLUMN_MIN_PX || width > COLUMN_MAX_PX) return null;
  return column;
}

function buildBox(where: Placement): HTMLElement {
  const box = document.createElement("div");
  box.id = BOX_ID;
  box.setAttribute(BOX_ATTR, "");
  box.dataset.lwjWhere = where;

  const note = fallbackNote(where);
  const head = document.createElement("div");
  if (note) {
    head.setAttribute(NOTE_ATTR, "");
    head.textContent = note;
    head.title = FALLBACK_TITLE;
  } else {
    head.setAttribute(HEAD_ATTR, "");
    head.textContent = "工具";
  }

  const list = document.createElement("div");
  list.setAttribute(LIST_ATTR, "");
  for (const item of NAV_LINKS) {
    list.append(navLink(item.id, item.href, item.text, item.title));
  }

  box.append(head, list, restartRow());
  return box;
}

/** 上一次看见侧边栏是什么时候（起点算"刚刚见过"，给后台水合留出 GRACE_MS）。 */
let lastSeen = Date.now();

function render(): void {
  ensureStyle();

  const column = sidebarColumn();
  if (column) lastSeen = Date.now();
  else if (Date.now() - lastSeen < GRACE_MS) return;

  const where: Placement = column ? "sidebar" : "corner";
  const host = column ?? document.body;

  let box = document.getElementById(BOX_ID);
  // 被某次重渲染抹掉了、或者该换一档了：整块重建。重建比就地改样式便宜，
  // 也不会留下上一档的残样式。
  if (box && (box.parentElement !== host || box.dataset.lwjWhere !== where)) {
    box.remove();
    box = null;
  }
  if (!box) {
    box = buildBox(where);
    host.append(box);
  }

  /**
   * 「发帖文案」那条**一直在**（它在 NAV_LINKS 里，上面 buildBox 已经画了）。
   * 这里只管一件事：正在编辑某一条时，把 href 换成带锚点的那一档。
   *
   * ★ 换 href 而不是增删节点 —— 这条链接进出编辑页时不再出现 / 消失，
   *   上面两条固定入口也就不会跟着上下跳一格。
   * ⚠ 认不出条目时要**换回** `SHARE_ROUTE`：不换的话，从一条稿子退回列表页之后，
   *   那条链接还指着上一条的锚点，而屏幕上看不出任何区别。
   */
  const share = box.querySelector<HTMLAnchorElement>(`#${SHARE_ID}`);
  if (!share) return;
  const target = shareTarget(location.pathname);
  const href = target ? shareHref(target) : SHARE_ROUTE;
  if (share.getAttribute("href") !== href) share.setAttribute("href", href);
}

function start(): void {
  render();
  window.setInterval(render, TICK_MS);
}

if (typeof document !== "undefined") {
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}

export {};
