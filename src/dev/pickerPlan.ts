/**
 * 后台两个选择器的判据 —— 【2026-09-23 用户要的】
 *
 *   ① 「这一条是…」那个下拉：**搜索 + 分页**。原话「稿件类型应该也是要分页展示，稿件太多了」——
 *      那个下拉一个选题一行，按时间新的在前，稿子一多就是一长列，要找三周前那个选题得一直往下拖。
 *      DOM 那一半在 `keystaticGroupPicker.ts`。
 *   ② 「标的」那一格：**搜索框 + 滚动框**。原话「当标的多了应该是要滚动框展示的，
 *      并且要支持搜索标的功能」—— 药丸是一排可换行的，表越长这一格越高，
 *      而它挤在 240px 宽的侧栏里。DOM 那一半在 `keystaticSymbolPicker.ts`。
 *
 * ★ 零 DOM、零 astro import：裸 tsx 测得动（`scripts/gate/pickers.test.ts`）。
 *   这个文件里的每一条都是"屏幕上该画什么"的判据，那两个 DOM 文件只管照着画。
 */

import type { ScannedGroup } from "../config/groupScan";
import {
  symbolNames,
  symbolOptionLabel,
  type SymbolRow,
} from "../config/symbols";

// ── 搜索：两个选择器共用这一条规矩 ────────────────────────────────────────

/**
 * 比较之前两边都过一遍：**NFKC + 小写**。
 *
 * NFKC 不是讲究：中文输入法下敲出来的常常是全角（`ＭＵ`、`０９`），而选项里的
 * 括号和冒号本来就是全角的（「补一份研究：MU（09-23）」）。只转小写的话，
 * 半角的 `(09` 找不到全角的 `（09`，屏幕上是「没有匹配」而那一项明明就在。
 * 两边同一个函数，所以全角半角怎么混着敲都对得上。
 * ⚠ NFKC 会把 `①` `②` 折成 `1` `2` —— 两边一起折，不影响匹配，只是别拿它做显示。
 */
export function searchKey(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

/** 搜索词按空白切开：**每一段都得命中**（`mu 09` = 既有 mu 又有 09）。 */
export function queryTerms(query: string): string[] {
  return searchKey(query)
    .split(/\s+/u)
    .filter(t => t !== "");
}

/** 空搜索词 = 全都算命中（搜索框空着就是"不筛"）。 */
export function matchesQuery(haystack: string, query: string): boolean {
  const terms = queryTerms(query);
  if (terms.length === 0) return true;
  const h = searchKey(haystack);
  return terms.every(t => h.includes(t));
}

// ── ① 「这一条是…」：搜索 + 分页 ──────────────────────────────────────────

/** 一页几组。8 组 + 顶上那一项 + 搜索框 + 翻页那一行，在 768px 高的窗口里放得下。 */
export const GROUP_PAGE_SIZE = 8;

/** 隐藏 `<select>` 里的一项：值 + 屏幕上那行字（就是下拉里原来那一行）。 */
export interface ChoiceOption {
  value: string;
  label: string;
}

/**
 * 把那个隐藏 `<select>` 的选项拆成两半：**「新的一组」那一项**，和**已有的那几组**（原序）。
 *
 * ⚠ 值为空串的有**两个**（2026-09-23 在浏览器里量的）：react-aria 的 HiddenSelect
 *   自己垫的一个占位项（字是空白），和 `keystatic.config.ts` 里那个
 *   「① 这是一个新选题 / 新问题」（`NEW_QUESTION`，也是空串）。
 *   认后者靠"**有字**"，不靠位置 —— 哪天上游不垫占位项了，按位置认就会把
 *   「新选题」当成占位项扔掉。
 * ★ 已有的那几组**原样保序**：顺序是 `groupScan.ts` 排好的（全组最新那条在前），
 *   这里再排一次就是两处各说各话。
 */
export function splitGroupChoices(options: readonly ChoiceOption[]): {
  fresh: ChoiceOption | null;
  groups: ChoiceOption[];
} {
  let fresh: ChoiceOption | null = null;
  const groups: ChoiceOption[] = [];
  for (const o of options) {
    if (o.value === "") {
      if (fresh === null && o.label.trim() !== "") fresh = o;
      continue;
    }
    groups.push(o);
  }
  return { fresh, groups };
}

/**
 * 每一组**除了那行字以外**还能被搜到的东西：组的键（= 根那条的号，后台列表里那一列就是它）、
 * 这一组勾的标的代码、以及那几只票的中英文名。
 *
 * 为什么要这个：研究稿的选题标题常常**就是代码**（「MU」「ZM」），那一行字里没有
 * 「美光」两个字 —— 只搜那行字的话，敲公司名永远是「没有匹配」。名字从标的表查
 * （`symbolNames()`，站上叫什么的唯一判据），不在这儿另存一份。
 *
 * ★ 返回的键 = 这个集合**全部**的组，哪怕一组什么都搜不到额外的（值是空串）——
 *   `keystaticGroupPicker.ts` 拿这份键去认那个隐藏 `<select>`
 *   （选项集合正好等于它），少一个键就认不出来，整个选择器退回原生下拉。
 */
export function groupSearchIndex(
  groups: readonly Pick<ScannedGroup, "key" | "carryList">[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of groups) {
    const words = [g.key];
    for (const code of g.carryList.symbols ?? []) {
      const n = symbolNames(code);
      words.push(n.code, n.name ?? "", n.nameEn ?? "");
    }
    out[g.key] = words.filter(w => w !== "").join(" ");
  }
  return out;
}

/** 按搜索词筛。那行字 + `groupSearchIndex()` 给的那些一起搜。 */
export function filterGroups(
  groups: readonly ChoiceOption[],
  extra: Readonly<Record<string, string>>,
  query: string
): ChoiceOption[] {
  return groups.filter(g =>
    matchesQuery(`${g.label} ${extra[g.value] ?? ""}`, query)
  );
}

/** 几页。**至少一页** —— 零组的时候也是「第 1 / 1 页」，不是「第 1 / 0 页」。 */
export function pageCountOf(count: number, pageSize = GROUP_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(count / pageSize));
}

/** 页码夹进 [0, 页数)。 */
export function clampPage(
  page: number,
  count: number,
  pageSize = GROUP_PAGE_SIZE
): number {
  return Math.min(Math.max(0, page), pageCountOf(count, pageSize) - 1);
}

/**
 * 键盘上的「当前项」—— 一个数，编号规矩和屏幕从上到下一致：
 *
 *   -1 = 没有（搜了但一组都没命中，这时按 Enter 什么都不做）
 *    0 = 顶上那一项「① 这是一个新选题」（**钉在每一页顶上**，不参与分页）
 *    k = 筛过之后的第 k 组（从 1 起）
 *
 * 页码是另一个数：「新选题」那一项在每一页上都有，停在它身上时翻页不会带着它走。
 */
export interface GroupCursor {
  active: number;
  page: number;
}

/**
 * 打开的那一刻停在哪儿：**停在当前选中的那一项上**，页码跟着它走。
 *
 * 编辑一条老稿子时它属于哪个选题，打开就该看得见那一行（带着勾）——
 * 永远从第 1 页开始的话，三周前那个选题打开来是看不见的，人会以为这条没归组。
 * 当前值是「新选题」、或者在列表里找不到（不该发生）→ 第 1 页、停在顶上那一项。
 */
export function openCursor(
  groups: readonly ChoiceOption[],
  selected: string,
  pageSize = GROUP_PAGE_SIZE
): GroupCursor {
  const i = selected === "" ? -1 : groups.findIndex(g => g.value === selected);
  if (i < 0) return { active: 0, page: 0 };
  return { active: i + 1, page: Math.floor(i / pageSize) };
}

/**
 * 搜索词变了之后停在哪儿：回到第 1 页。
 * 有搜索词 → 停在第一个命中上（按 Enter 就是它）；一个都没命中 → -1（Enter 什么都不做）；
 * 搜索框清空 → 停回顶上那一项。
 *
 * ⚠ 有搜索词时**不许**停在「新选题」上：人敲了「mu」再按 Enter，要的是 MU 那一组，
 *   而「新选题」钉在最上面、永远"命中" —— 停在它身上等于敲什么都选成新选题。
 */
export function cursorForQuery(query: string, matched: number): GroupCursor {
  if (queryTerms(query).length === 0) return { active: 0, page: 0 };
  return { active: matched > 0 ? 1 : -1, page: 0 };
}

export type CursorMove = "down" | "up" | "pageDown" | "pageUp";

/**
 * 键盘怎么走。**跟着屏幕走**，不是跟着一条看不见的长列表走：
 *
 *   - ↓ 从顶上那一项 → 这一页第一组；从这一页最后一组 → **翻到下一页**的第一组；
 *   - ↑ 从这一页第一组 → 顶上那一项（它就画在这一组上面）；在顶上那一项 → 不动；
 *   - PageDown / PageUp → 翻一页，停在那一页第一组。
 *
 * ★ ↑ 不会往回翻页：屏幕上第一组上面画着的是「新选题」，不是上一页的最后一组。
 *   往回翻用 PageUp（或者点「上一页」）。
 * ⚠ 一组都没命中（`matched === 0`）时只剩顶上那一项可停，翻页键什么都不做。
 * ★ 停在某一组上时，页码**由它推出来**（不信入参里那个 page）：两个数各记各的，
 *   总有一天会记出"高亮的那一行不在这一页上"—— 按 Enter 选中一个屏幕上看不见的东西。
 */
export function moveCursor(
  cur: GroupCursor,
  move: CursorMove,
  matched: number,
  pageSize = GROUP_PAGE_SIZE
): GroupCursor {
  const active = Math.min(Math.max(cur.active, -1), matched);
  const page =
    active >= 1
      ? Math.floor((active - 1) / pageSize)
      : clampPage(cur.page, matched, pageSize);
  const first = matched > 0 ? page * pageSize + 1 : -1;
  const last = matched > 0 ? Math.min(matched, (page + 1) * pageSize) : -1;

  switch (move) {
    case "down": {
      if (active <= 0) return { active: first > 0 ? first : 0, page };
      if (active < last) return { active: active + 1, page };
      if (active < matched) return { active: active + 1, page: page + 1 };
      return { active, page };
    }
    case "up": {
      if (active <= 0 || active === first) return { active: 0, page };
      return { active: active - 1, page };
    }
    case "pageDown":
    case "pageUp": {
      if (matched === 0) return { active, page };
      const to = clampPage(
        page + (move === "pageDown" ? 1 : -1),
        matched,
        pageSize
      );
      return { active: to * pageSize + 1, page: to };
    }
  }
}

/** 某一页上画哪几组 —— 带着它们在筛过的序列里的编号（和 `GroupCursor.active` 同一套）。 */
export function pageSlice(
  filtered: readonly ChoiceOption[],
  page: number,
  pageSize = GROUP_PAGE_SIZE
): { option: ChoiceOption; active: number }[] {
  const p = clampPage(page, filtered.length, pageSize);
  return filtered
    .slice(p * pageSize, (p + 1) * pageSize)
    .map((option, i) => ({ option, active: p * pageSize + i + 1 }));
}

/**
 * 翻页那一行的字。三档，**长得都不一样**：
 *   - 没在搜：「第 2 / 3 页 · 共 20 个选题」
 *   - 在搜、有命中：「匹配 3 个（共 20 个选题）· 第 1 / 1 页」
 *   - 在搜、没命中：「匹配 0 个（共 20 个选题）」—— 列表区那一句由 `groupEmptyText` 说
 *
 * ⚠ 后两档必须把「共 N 个」也印出来：只印「匹配 3 个」的话，人分不出
 *   "一共就 3 个"和"筛剩 3 个"，而那正是他决定要不要清掉搜索词的依据。
 */
export function groupPagerText(
  query: string,
  matched: number,
  total: number,
  page: number,
  noun: string,
  pageSize = GROUP_PAGE_SIZE
): string {
  const where = `第 ${clampPage(page, matched, pageSize) + 1} / ${pageCountOf(matched, pageSize)} 页`;
  if (queryTerms(query).length === 0) {
    return `${where} · 共 ${total} 个${noun}`;
  }
  const count = `匹配 ${matched} 个（共 ${total} 个${noun}）`;
  return matched === 0 ? count : `${count} · ${where}`;
}

/** 搜了、一组都没命中时列表区那一句。**不是空白** —— 空白和"还在加载""坏了"长得一样。 */
export function groupEmptyText(query: string, noun: string): string {
  return `没有匹配「${query.trim()}」的${noun}`;
}

/**
 * 这一页是不是**编辑页或新建页**、是哪个集合的。选择器两种页面都挂
 * （和 `keystaticGroupFill.ts` 不同：那边只在新建页动手，因为它会覆盖标题；
 * 这边只是换了个挑选的方式，编辑页上一样要挑）。
 */
export function formCollection(pathname: string): string | undefined {
  return /^\/keystatic\/collection\/([^/]+)\/(?:create(?:$|[/?#])|item\/[^/]+)/.exec(
    pathname
  )?.[1];
}

// ── ② 「标的」：搜索框 + 滚动框 ──────────────────────────────────────────

/** 标的那一格里的一项：值（代码）、屏幕上那行字、以及能被搜到的全部字。 */
export interface SymbolChoice {
  value: string;
  /** 就是后台那一格原来的那行字（`symbolOptionLabel()`：`MU 美光科技`）。 */
  label: string;
  /** 代码 + 中文名 + **英文名**。英文名不在那行字里（格子太窄），但要搜得到。 */
  search: string;
}

/**
 * 标的表 → 选择器的每一项。**顺序 = 表的顺序**（后台「标的」那一页拖出来的顺序），
 * 这里不排：自动排序等于替人重排他排过的东西（和 `withSymbolRow()` 不按字母插队同一条）。
 * ★ `label` 必须就是 `symbolOptionLabel()` —— DOM 那一半靠这行字把自己的药丸和
 *   Keystatic 那个真勾选框对上（`keystaticGroupFill.ts` 的 `multiBoxes()` 也是按它认的）。
 */
export function symbolChoices(rows: readonly SymbolRow[]): SymbolChoice[] {
  return rows.map(r => ({
    value: r.code,
    label: symbolOptionLabel(r),
    search: [r.code, r.name, r.nameEn].filter(Boolean).join(" "),
  }));
}

/**
 * 搜索框底下那一行「已勾了哪几只」。
 *
 * ★ 它存在的理由是**滚动框**：勾上的那只可能滚在框外、或者被搜索词筛掉了 ——
 *   没有这一行，人就得把框从头滚到尾才知道勾了什么。
 * ★ 一只都没勾印「一只都没勾」，**不是空白、也不画成警告色**：讲宏观、讲方法论的内容
 *   本来就不勾（docs/engineering-notes.md 第二节：「一只都没勾」是**完成态**，和 `symbolSource: unknown`
 *   那个待补不是一回事）。空白的话，"没勾"和"这一行坏了"长得一样。
 */
export function symbolSummary(checkedLabels: readonly string[]): {
  text: string;
  empty: boolean;
} {
  if (checkedLabels.length === 0) return { text: "一只都没勾", empty: true };
  return {
    text: `已勾 ${checkedLabels.length} 只：${checkedLabels.join("、")}`,
    empty: false,
  };
}

/** 搜了、一只都没命中时框里那一句。顺带告诉人表外的票该去哪儿加（和那一格的说明同一件事）。 */
export function symbolEmptyText(query: string): string {
  return (
    `没有匹配「${query.trim()}」的标的。` +
    "表里没有的票，先去左侧「标的」那一页加一行，再回来刷新这一页。"
  );
}

/**
 * 药丸之间用方向键走：从 `from` 往 `dir` 方向找**下一个看得见的**。
 * 找不到返回 -1（走到头了 —— 往回走到头时 DOM 那一半把焦点交回搜索框）。
 * `from` 可以是 -1 / 长度（从外面进来），这时找的是第一个 / 最后一个看得见的。
 */
export function nextVisible(
  visible: readonly boolean[],
  from: number,
  dir: 1 | -1
): number {
  for (let i = from + dir; i >= 0 && i < visible.length; i += dir) {
    if (visible[i]) return i;
  }
  return -1;
}
