/**
 * 后台**列表页**的判据 —— 研究稿 / 问答 / 教程 / 提示词那几张表。【2026-09-23 用户要的】
 *
 * 原话「管理界面的研究、问答、教程 list 都应该是按照倒序分页展示，并且要可以搜索，
 * 现在文章会越来越多」。Keystatic 0.6.9 那张表（`CollectionTable`）三件事都做不到，
 * 而且三件都写死在它的 React 组件里、config 没有口子：
 *
 *   - **搜索只认地址**：`item.name.toLowerCase().includes(searchTerm)` —— 而地址早就是
 *     条目号了（`1037`），敲「美光」「MU」「ChatGPT」一律「No results」；
 *   - **每次进来都是旧的在前**：`useState({ column: SLUG, direction: "ascending" })`，
 *     点表头能倒过来，下次进来又回去了；
 *   - **不分页**：一张虚拟滚动的长表。
 *
 * 所以做法和「这一条是…」那个面板同一个思路：**Keystatic 那张表原地藏起来、不删，画自己的**。
 * DOM 那一半在 `keystaticEntryList.ts`；数据从 dev 专用的 `/_entries` 读
 * （`entries-run.ts` ＋ 扫盘的 `entryListScan.ts`）。
 *
 * ★ 零 DOM、零 astro import：裸 tsx 测得动（`scripts/gate/entryList.test.ts`）。
 *   `/_entries` 吐出来的每一行、浏览器里那张表"该画什么"，都从这个文件来。
 */

import {
  NUMBERED_COLLECTIONS,
  requireCollectionSpec,
} from "../config/collections";
import { utcWallToBeijing } from "../config/beijingTime";
import { frontmatterDate } from "../config/lastModified";
import { symbolNames } from "../config/symbols";
import { newestCreatedFirst } from "../utils/createdOrder";
import { clampPage, matchesQuery, pageCountOf, queryTerms } from "./pickerPlan";

// ── 哪几张表换成我们的、数据从哪儿来 ──────────────────────────────────────

/**
 * 换成这张列表的集合 = **有条目号的那几个**，从登记表推（`NUMBERED_COLLECTIONS`）。
 *
 * 用户点名的是研究 / 问答 / 教程三个；提示词是同一种集合（同一个号池、同一种
 * "地址就是号、所以按标题搜不到"的病），按登记表推就一起换了 —— 写死三个的话，
 * 第五个集合加进来时它的列表会**静默**停在 Keystatic 那张表上，没有任何一处会说。
 * 「常用提示词」（system-prompts）不在登记表里、地址也不是号，照旧用 Keystatic 的。
 */
export const LIST_COLLECTIONS: readonly string[] = NUMBERED_COLLECTIONS;

/**
 * 读列表数据的那条 dev 专用接口。astro.config.ts 的 `injectRoute` 和浏览器里的 `fetch`
 * **读同一个常量** —— 两边各写一份的话，改名那天列表页整张退回 Keystatic 的表
 * （404 → 读不到数据那一档），而屏幕上只会说"读不到"。
 */
export const ENTRIES_ROUTE = "/_entries";

/** 后台的根地址（local 模式，没有 `/branch/<名>` 那一段）。 */
const BASE = "/keystatic";

/**
 * 这一页是不是某个集合的**列表页**、是哪个。只认列表页本身
 * （`/keystatic/collection/posts`，末尾斜杠可有可无）—— 新建页、编辑页不归这里管。
 */
export function listCollection(pathname: string): string | undefined {
  const m = /^\/keystatic\/collection\/([^/?#]+)\/?$/.exec(pathname);
  if (!m) return undefined;
  let key: string;
  try {
    key = decodeURIComponent(m[1]!);
  } catch {
    return undefined; // 手敲一个孤零零的 `%`：不是我们的页，不许抛（这段每一拍都跑）
  }
  return LIST_COLLECTIONS.includes(key) ? key : undefined;
}

/** 点一行去哪儿：Keystatic 自己的编辑页。拼法照抄它的 `getItemPath()`（两段都 encode）。 */
export function itemHref(collection: string, slug: string): string {
  return `${BASE}/collection/${encodeURIComponent(collection)}/item/${encodeURIComponent(slug)}`;
}

/**
 * 这个集合的表上有没有「标的」「智能体（模型）」两列。
 *
 * 判据是登记表的 `provenance === "by-agent"`（研究稿 / 问答）—— 和 `bylineOf()`
 * 决定"那一串印不印"是**同一个判据**，所以不会出现"有这一列、每一格都空着"。
 * 标的跟着它走不是巧合：有智能体那一格的集合正好也是有标的那一格的两个
 * （教程 / 提示词两格都没有）。哪天真有一个"有智能体、没标的"的集合，
 * 那一列只会是一串「—」，不会画错。
 */
export function listColumns(collection: string): {
  symbols: boolean;
  byline: boolean;
} {
  const byAgent = requireCollectionSpec(collection).provenance === "by-agent";
  return { symbols: byAgent, byline: byAgent };
}

// ── 一行 ────────────────────────────────────────────────────────────────

export interface EntrySymbol {
  code: string;
  name?: string;
  nameEn?: string;
}

/** 列表上的一行。`/_entries` 吐的就是这个形状（已经排好序）。 */
export interface EntryRow {
  /** 文件名去掉 `.md` —— 就是条目号（`1037`），也是编辑页地址里那一段。 */
  slug: string;
  /** 读不到是空串：屏幕上印「（没有标题）」，**不是空白**（空白和"这一行坏了"长得一样）。 */
  title: string;
  description: string;
  /** 发布时间（= 创建时间），ISO UTC。读不出来是 `null`。 */
  pub: string | null;
  /** 同一个时刻的**北京时间**读数（`2026-09-23 10:52`），和后台那两格时间同一个口径。 */
  pubLabel: string;
  draft: boolean;
  featured: boolean;
  /** 发布时间在未来：dev 里看得见，`pnpm build` 里页面**根本不生成**（docs/engineering-notes.md 坑 1）。 */
  future: boolean;
  /** 文件名 `_` 开头：Keystatic 照样列它，站上不收它（content.config.ts 的 glob）。 */
  offSite: boolean;
  symbols: EntrySymbol[];
  /**
   * `symbolSource: unknown`：标的**没认出来**（待补）。
   * 和"一只都没勾"（讲宏观、讲方法论 —— 完成态）不是一回事，屏幕上也不许长得一样。
   */
  symbolsPending: boolean;
  /** 「OpenAI ChatGPT（GPT-6-Pro）」—— `bylineOf()` 给的。教程 / 提示词没有这一格。 */
  byline?: string;
  tags: string[];
  /** frontmatter 读不出来的原因。有它的时候上面那些格全是空的。 */
  problem?: string;
}

const text = (v: unknown): string =>
  typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(text).filter(s => s !== "") : [];

/**
 * 一个 ISO 时刻 → 北京时间读数（`2026-09-23 10:52`）。
 * 换算走 `beijingTime.ts`（后台时间读数的唯一一处 +8），这里只换个分隔符。
 * 认不出来返回空串 —— 调用方印「（没有发布时间）」，不许编一个。
 */
export function beijingLabel(iso: string): string {
  const wall = utcWallToBeijing(iso.slice(0, 16));
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wall)
    ? wall.replace("T", " ")
    : "";
}

/**
 * 一份 .md 的 frontmatter → 列表上的一行。
 *
 * ⚠ 时间那一格可能是 `Date` 也可能是字符串（YAML 把没加引号的时刻直接读成 Date，
 *   加了引号的还是字符串）—— 只许交给 `frontmatterDate()` 处理，那是全站唯一一处。
 */
export function rowFromFrontmatter(input: {
  slug: string;
  /** 读不出来就不给（同时给 `problem`）。 */
  data?: Record<string, unknown>;
  problem?: string;
  byline?: string;
  /** 判"未到发布时间"用的此刻（毫秒）。由调用方给：测试要钉得住。 */
  now: number;
}): EntryRow {
  const data = input.data ?? {};
  const pubDate = frontmatterDate(data.pubDatetime);
  const pub = pubDate ? pubDate.toISOString() : null;
  const row: EntryRow = {
    slug: input.slug,
    title: text(data.title),
    description: text(data.description),
    pub,
    pubLabel: pub ? beijingLabel(pub) : "",
    draft: data.draft === true,
    featured: data.featured === true,
    future: pubDate !== undefined && pubDate.getTime() > input.now,
    offSite: input.slug.startsWith("_"),
    symbols: strings(data.symbols).map(code => symbolNames(code)),
    symbolsPending: data.symbolSource === "unknown",
    tags: strings(data.tags),
  };
  if (input.byline !== undefined) row.byline = input.byline;
  if (input.problem) row.problem = input.problem;
  return row;
}

/**
 * **新的在前** —— 和站上列表**同一条规矩**（`src/utils/createdOrder.ts` 的
 * `newestCreatedFirst()`）：按发布时间（= 创建时间），晚的在前；同一分钟的按号，大的在前；
 * 读不出时间的沉到最后。
 *
 * ★ 不许在这儿另写一个比较函数：站上 /r 和后台列表两处的"新的在前"各算各的，
 *   总有一天会排出两种顺序，而两处都"没错"。
 * ⚠ `modDatetime`（更新时间）不参与：改个错字就把老稿子顶到最前，那正是站上
 *   刚换掉的那条规矩（见 createdOrder.ts 文件头）。
 */
export function sortRows(rows: readonly EntryRow[]): EntryRow[] {
  return [...rows].sort((a, b) =>
    newestCreatedFirst(
      { id: a.slug, pubDatetime: a.pub ?? "" },
      { id: b.slug, pubDatetime: b.pub ?? "" }
    )
  );
}

// ── 状态徽章 ─────────────────────────────────────────────────────────────

export type BadgeKind = "problem" | "offsite" | "draft" | "future" | "featured";

export interface RowBadge {
  kind: BadgeKind;
  text: string;
  /** 鼠标放上去那句：为什么挂这个徽章、它意味着什么。 */
  hint: string;
}

/**
 * 标题前面挂哪几个徽章。**已发布、没什么可说的那一档一个都不挂**（完成态）——
 * 和「草稿」「读不出来」长得不一样，就是这条的全部意义。
 *
 * ★ 徽章排在**标题前面**，不是后面：标题一长（问答的问题常常一整行），
 *   排在后面的徽章会被省略号吃掉，而"这是一篇草稿"恰恰是最不能被吃掉的那句话。
 */
export function rowBadges(row: EntryRow): RowBadge[] {
  const out: RowBadge[] = [];
  if (row.problem) {
    out.push({
      kind: "problem",
      text: "读不出来",
      hint: `${row.problem}。后台多半也打不开这一条，站上构建会红 —— 得去改 .md 文件本身。`,
    });
  }
  if (row.offSite) {
    out.push({
      kind: "offsite",
      text: "不是条目",
      hint: "文件名以 _ 开头：站上不收它（src/content.config.ts 的 glob 排掉了），Keystatic 照样列出来。",
    });
  }
  if (row.draft) {
    out.push({
      kind: "draft",
      text: "草稿",
      hint: "不生成页面。要发出去：点进去取消勾选「草稿」、存盘，再去「提交推送」。",
    });
  }
  if (row.future) {
    out.push({
      kind: "future",
      text: "未到发布时间",
      hint: "发布时间在未来：pnpm dev 里看得见，pnpm build 里这一页根本不生成（构建照样是绿的）。",
    });
  }
  if (row.featured) {
    out.push({ kind: "featured", text: "置顶", hint: "置顶到首页。" });
  }
  return out;
}

/** 整行的悬停提示：号 · 标题，底下是摘要（列表里那一格常常被截断）。 */
export function rowTooltip(row: EntryRow): string {
  const head = `${row.slug} · ${row.title || "（没有标题）"}`;
  const body = row.problem ?? row.description;
  return body ? `${head}\n${body}` : head;
}

/** 「标的」那一格的字：`MU 美光科技`，几只用「、」隔开。一只都没有 = 空串（调用方分档画）。 */
export function symbolsText(row: EntryRow): string {
  return row.symbols
    .map(s => [s.code, s.name].filter(Boolean).join(" "))
    .join("、");
}

// ── 搜索 ────────────────────────────────────────────────────────────────

/**
 * 一行能被搜到的全部字 —— **屏幕上看得见的东西**（外加悬停提示里那段摘要、那几只票的英文名）：
 * 号、标题、摘要、标的代码和中英文名、「智能体（模型）」、标签、北京时间读数、徽章上的字。
 *
 * ★ 搜不到看不见的东西（比如归组的键）：搜「1036」出来一条 1037，人看不出为什么。
 * ★ 徽章的字也在里面：敲「草稿」就是"只看草稿"，不用另做一个筛选器。
 * ★ 比较规矩和后台另外两个选择器是**同一条**（`pickerPlan.ts` 的 `matchesQuery()`：
 *   NFKC + 小写、空格隔开的几段都得命中）—— 全角的 `ＭＵ` 一样找得到。
 */
export function rowSearchText(row: EntryRow): string {
  return [
    row.slug,
    row.title,
    row.description,
    ...row.symbols.flatMap(s => [s.code, s.name ?? "", s.nameEn ?? ""]),
    row.byline ?? "",
    ...row.tags,
    row.pubLabel,
    ...rowBadges(row).map(b => b.text),
  ]
    .filter(s => s !== "")
    .join(" ");
}

/**
 * 按搜索词筛，**保序**（顺序是 `sortRows()` 排好的，这里不再排）。
 * `hay` 是每一行预先算好的 `rowSearchText()` —— 数据一来算一次，别每敲一个字都重算。
 */
export function filterRows(
  rows: readonly EntryRow[],
  query: string,
  hay: readonly string[] = rows.map(rowSearchText)
): EntryRow[] {
  if (queryTerms(query).length === 0) return [...rows];
  return rows.filter((_, i) => matchesQuery(hay[i] ?? "", query));
}

/** 搜索框里那行灰字。只列这个集合**真有**的东西 —— 教程没有标的和智能体。 */
export function searchPlaceholder(cols: {
  symbols: boolean;
  byline: boolean;
}): string {
  return [
    "搜索：标题、号",
    cols.symbols ? "代码、公司名" : "",
    cols.byline ? "智能体、模型" : "",
    "标签、日期",
  ]
    .filter(Boolean)
    .join("、");
}

// ── 分页 ────────────────────────────────────────────────────────────────

/** 一页几条。一行 45px，1280×720 的窗口里一页放不下时列表区自己滚，翻页那一行一直在。 */
export const LIST_PAGE_SIZE = 20;

/** 几页。**至少一页**（零条也是「第 1 / 1 页」）。 */
export function listPageCount(count: number): number {
  return pageCountOf(count, LIST_PAGE_SIZE);
}

/** 页码（从 0 起）夹进 [0, 页数)。 */
export function clampListPage(page: number, count: number): number {
  return clampPage(page, count, LIST_PAGE_SIZE);
}

/** 某一页上画哪几行。页码越界就夹到最后一页（地址栏里手敲的 `page=99`）。 */
export function listPageRows<T>(rows: readonly T[], page: number): T[] {
  const p = clampListPage(page, rows.length);
  return rows.slice(p * LIST_PAGE_SIZE, (p + 1) * LIST_PAGE_SIZE);
}

/**
 * 翻页那一行画哪几个页码（从 0 起）：第一页、最后一页、当前页前后各 `radius` 页；
 * 断开的地方画「…」（`null`）。**只隔一页的不画「…」，直接把那一页画出来** ——
 * 一个「…」和它代表的那个页码一样宽，省略它只会让人多点一下。
 */
export function pageWindow(
  current: number,
  count: number,
  radius = 2
): (number | null)[] {
  if (count <= 1) return [0];
  const cur = Math.min(Math.max(0, current), count - 1);
  const keep = new Set<number>([0, count - 1]);
  for (let p = cur - radius; p <= cur + radius; p++) {
    if (p >= 0 && p < count) keep.add(p);
  }
  const out: (number | null)[] = [];
  let prev = -1;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (prev >= 0 && p - prev === 2) out.push(prev + 1);
    else if (prev >= 0 && p - prev > 2) out.push(null);
    out.push(p);
    prev = p;
  }
  return out;
}

/**
 * 翻页那一行的字。三档，**长得都不一样**（和「这一条是…」面板的 `groupPagerText` 同一套）：
 *   - 没在搜：「共 27 条 · 第 1 / 2 页」
 *   - 在搜、有命中：「匹配 3 条（共 27 条）· 第 1 / 1 页」
 *   - 在搜、没命中：「匹配 0 条（共 27 条）」—— 列表区那一句由 `listEmptyText` 说
 *
 * ⚠ 在搜的时候必须把「共 N 条」也印出来：只印「匹配 3 条」的话，
 *   人分不出"一共就 3 条"和"筛剩 3 条"。
 */
export function listPagerText(
  query: string,
  matched: number,
  total: number,
  page: number
): string {
  const where = `第 ${clampListPage(page, matched) + 1} / ${listPageCount(matched)} 页`;
  if (queryTerms(query).length === 0) return `共 ${total} 条 · ${where}`;
  const count = `匹配 ${matched} 条（共 ${total} 条）`;
  return matched === 0 ? count : `${count} · ${where}`;
}

/**
 * 列表区一行都没画时那一句。**不是空白** —— 空白和"还在读""坏了"长得一样。
 * 两档：搜了没命中 / 一条都没读到（后者下面还会有一句对账的话说 Keystatic 数到几条）。
 */
export function listEmptyText(query: string, total: number): string {
  if (total === 0) return "这个目录里一条 .md 都没读到。";
  return `没有匹配「${query.trim()}」的条目。`;
}

// ── 地址栏：搜索词和页码 ─────────────────────────────────────────────────

/**
 * 搜索词和页码记在地址栏里（`?q=美光&page=2`）。
 *
 * ★ 为的是**点进一条、再按浏览器的后退**：回来还是刚才那一页、那个搜索词。
 *   记在内存里的话，Keystatic 换页时整块会被重建，回来就是第 1 页、空搜索框。
 * ⚠ 用自己的参数名，**不借** Keystatic 的 `search`：那个参数它自己也读（它那张表按地址
 *   过滤），我们退回它那张表的那一档里，「美光」会把它过滤成「No results」。
 * ★ 第 1 页、空搜索词**不写**进地址 —— 左侧菜单点进来的那个干净地址就是"默认状态"。
 */
export const QUERY_PARAM = "q";
export const PAGE_PARAM = "page";

export interface ListState {
  q: string;
  /** 从 0 起。 */
  page: number;
}

export function parseListState(search: string): ListState {
  const params = new URLSearchParams(search);
  const raw = params.get(PAGE_PARAM);
  const n = raw !== null && /^\d{1,6}$/.test(raw) ? Number(raw) : 1;
  return { q: params.get(QUERY_PARAM) ?? "", page: Math.max(0, n - 1) };
}

/** 把状态写回一个 `location.search`：别的参数原样留着（Keystatic 的 `search` 之类）。 */
export function withListState(search: string, state: ListState): string {
  const params = new URLSearchParams(search);
  if (state.q !== "") params.set(QUERY_PARAM, state.q);
  else params.delete(QUERY_PARAM);
  if (state.page > 0) params.set(PAGE_PARAM, String(state.page + 1));
  else params.delete(PAGE_PARAM);
  const s = params.toString();
  return s === "" ? "" : `?${s}`;
}

// ── 读回来的数据 ─────────────────────────────────────────────────────────

export interface EntryListPayload {
  collection: string;
  /** 这一份是什么时候读的（ISO）。刷新失败时屏幕上要说"下面是几点读到的"。 */
  readAt: string;
  entries: EntryRow[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function rowOf(v: unknown): EntryRow | undefined {
  if (!isObj(v) || typeof v.slug !== "string" || v.slug === "") return;
  const bool = (k: string) => v[k] === true;
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
  const symbols = Array.isArray(v.symbols)
    ? v.symbols.flatMap((s): EntrySymbol[] =>
        isObj(s) && typeof s.code === "string"
          ? [
              {
                code: s.code,
                ...(typeof s.name === "string" ? { name: s.name } : {}),
                ...(typeof s.nameEn === "string" ? { nameEn: s.nameEn } : {}),
              },
            ]
          : []
      )
    : [];
  const row: EntryRow = {
    slug: v.slug,
    title: str("title"),
    description: str("description"),
    pub: typeof v.pub === "string" ? v.pub : null,
    pubLabel: str("pubLabel"),
    draft: bool("draft"),
    featured: bool("featured"),
    future: bool("future"),
    offSite: bool("offSite"),
    symbols,
    symbolsPending: bool("symbolsPending"),
    tags: Array.isArray(v.tags)
      ? v.tags.filter((t): t is string => typeof t === "string")
      : [],
  };
  if (typeof v.byline === "string") row.byline = v.byline;
  if (typeof v.problem === "string" && v.problem !== "")
    row.problem = v.problem;
  return row;
}

/**
 * 浏览器拿到 `/_entries` 的 JSON 之后先过这一道。**形状不对就整份不认**（退回 Keystatic
 * 那张表，并把原因印出来）—— 认一半、画一张缺行的表，比退回去更糟：那是"少了几条"
 * 被说成了"就这么多条"。
 */
export function parsePayload(
  json: unknown,
  collection: string
): { ok: true; payload: EntryListPayload } | { ok: false; error: string } {
  if (!isObj(json)) return { ok: false, error: "回来的不是一个 JSON 对象" };
  if (typeof json.error === "string") return { ok: false, error: json.error };
  if (json.collection !== collection) {
    return {
      ok: false,
      error: `要的是「${collection}」，回来的是「${String(json.collection)}」`,
    };
  }
  if (!Array.isArray(json.entries)) {
    return { ok: false, error: "回来的数据里没有 entries 这张表" };
  }
  const entries: EntryRow[] = [];
  for (const [i, v] of json.entries.entries()) {
    const row = rowOf(v);
    if (!row) return { ok: false, error: `第 ${i + 1} 行不是一条条目` };
    entries.push(row);
  }
  return {
    ok: true,
    payload: {
      collection,
      readAt: typeof json.readAt === "string" ? json.readAt : "",
      entries,
    },
  };
}

// ── 屏幕上那几句话 ───────────────────────────────────────────────────────

/** 列表的表头。「发布时间」后面那个 ↓ 就是顺序本身 —— 光排序是看不见的（groupScan 那条同一个理由）。 */
export const LIST_HEAD = {
  no: "号",
  title: "标题",
  symbols: "标的",
  byline: "智能体（模型）",
  pub: "发布时间 ↓",
} as const;

export const ORDER_HINT =
  "按发布时间排，新的在前；同一分钟建的按号，大的在前 —— 和站上列表同一条规矩" +
  "（src/utils/createdOrder.ts）。更新时间不参与。";

/** 读不到数据、退回 Keystatic 那张表时，顶上那句话。**说清楚退回去的那张表缺什么**。 */
export function loadFailedText(error: string): string {
  return (
    `读不到列表数据（${error}）。下面是 Keystatic 原来那张表：旧的在前、` +
    "不分页，顶上那个搜索框只认号。"
  );
}

/** 第二次起读失败（手上还有上一次的数据）：列表照画，但得说清楚它是几点的。 */
export function refreshFailedText(error: string, readAt: string): string {
  const at = readAt ? beijingLabel(readAt) : "";
  return at
    ? `⚠ 刷新失败（${error}）—— 下面是 ${at} 读到的列表，之后的改动不在里面。`
    : `⚠ 刷新失败（${error}）—— 下面是上一次读到的列表，之后的改动不在里面。`;
}

/**
 * Keystatic 自己那张表数到几条：它的 `aria-rowcount` 减去表头那一行。读不出来 = undefined。
 * （表藏着也照样有这个属性 —— react-aria 按集合大小写它，不看版面。）
 */
export function keystaticCount(
  ariaRowCount: string | null
): number | undefined {
  if (ariaRowCount === null || !/^\d+$/.test(ariaRowCount)) return undefined;
  return Math.max(0, Number(ariaRowCount) - 1);
}

/**
 * 两边数的对不上时那句话；对得上返回 undefined。
 *
 * ★ 这是这张列表**唯一**能发现"自己漏了几条"的地方：我们读的目录（登记表的 `dir`）
 *   和 Keystatic 读的目录（keystatic.config.ts 的 `path`）是两处声明，
 *   哪天只改了一处，这张表会安静地少几条 —— 而少几条的列表看起来和完整的一模一样。
 * ⚠ 刚在别处（导入页、命令行、另一个标签页）新建的，Keystatic 那边要刷新才看得见，
 *   这时两边也会差一条 —— 所以第一句话是"先刷新"。
 */
export function countMismatchText(
  keystatic: number,
  ours: number
): string | undefined {
  if (keystatic === ours) return undefined;
  return (
    `⚠ Keystatic 自己数到 ${keystatic} 条，这张列表读到 ${ours} 条。` +
    "先刷新一下页面；还对不上，就是两边读的不是同一个目录" +
    "（keystatic.config.ts 里这个集合的 path 和 src/config/collections.ts 的 dir）。"
  );
}
