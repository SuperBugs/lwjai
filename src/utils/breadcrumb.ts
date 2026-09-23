/**
 * 面包屑「首页后面那几格印什么、各自链到哪」—— **全站唯一的判据**。
 * `src/components/Breadcrumb.astro` 只管画。
 *
 * ## 为什么拎出来
 *
 * 【2026-09-23 查出来的】2026-09-21 那两轮改地址之后，组件里那张「路径段 → 中文名」
 * 的表还按**老地址**写着（posts / qa / guides / prompts / tags / about / archives /
 * search），分页集合的名单也是。于是除了 /s，每一页的面包屑都印着地址里那个字母：
 * 「首页 / r」「首页 / r / 2」「首页 / se」。表查不中就原样输出路径段、不报错 ——
 * 构建、类型检查、闸门、测试四处全绿（/s 没坏，只是因为那一段恰好没改过名）。
 *
 * 所以首段认什么、叫什么，现在**从两张登记表推**，这个文件里一个路径段都不写：
 *   - 集合的列表页：`collections.ts` 的 `urlPrefix` → `t.nav.<集合名>`
 *   - 其余页面：`routes.ts` 的 `ROUTES` → `t.nav.<同一个键>`
 * ⚠ 也就是说**集合名、ROUTES 的键同时是 `t.nav` 的键**（导航栏本来就是这么配对的）。
 *   改其中一边的名字另一边跟着改 —— 漏了的话那一页的面包屑当场抛，
 *   `scripts/gate/breadcrumb.test.ts` 也红。
 *
 * ## 零 `@/` import
 *
 * 裸 tsx（`pnpm test`）要能加载它。三个依赖本身都是零 import 的纯数据 / 纯函数。
 */

import { CONTENT_COLLECTIONS } from "../config/collections";
import { isEntryNo } from "../config/entryNo";
import { ROUTES, type RouteKey } from "../config/routes";

/**
 * 首段的三种形状 —— 决定页码在第几段。
 *
 *   - `list`  集合的列表页：`/r`、`/r/2`，页码在第 2 段。
 *   - `keyed` 按一个键再分页的索引：`/t/<标签>/2`、`/s/<代码>/2`，页码在第 3 段。
 *   - `page`  单页：`/a`、`/se`、`/ar`，没有页码。
 *
 * 每条路由是哪一种，测试拿 `src/pages/` 下的真实文件对账（breadcrumb.test.ts 的 B 组）。
 */
export type BreadcrumbRootShape = "list" | "keyed" | "page";

export type BreadcrumbRoot = {
  /** `t.nav` 里的键：集合名，或者 ROUTES 的键。 */
  navKey: string;
  shape: BreadcrumbRootShape;
};

/**
 * 页码在第 3 段的那几条（盘上是 `src/pages/<段>/[<键>]/[...page].astro`）。
 * 写的是 ROUTES 的**键**，不是路径段 —— 段从 ROUTES 查，改前缀这里不用动。
 *
 * ★ 标的是【2026-09-23】加进来的：它和标签页同一个形状，原来那条分支只认标签，
 *   /s/orcl/2 会印成「标的 / orcl / 2」，中间那格还链到 /orcl（404）——
 *   只是还没有哪只票多到第 2 页，所以没人撞见过。
 */
const KEYED_ROUTES: readonly RouteKey[] = ["tags", "symbols"];

function buildRoots(): Map<string, BreadcrumbRoot> {
  const roots = new Map<string, BreadcrumbRoot>();
  for (const c of CONTENT_COLLECTIONS) {
    if (c.urlPrefix !== null) {
      roots.set(c.urlPrefix, { navKey: c.key, shape: "list" });
    }
  }
  for (const key of Object.keys(ROUTES) as RouteKey[]) {
    roots.set(ROUTES[key], {
      navKey: key,
      shape: KEYED_ROUTES.includes(key) ? "keyed" : "page",
    });
  }
  return roots;
}

/**
 * 首段 → 它是谁。
 *
 * 前缀撞车由 `routes.test.ts` 拦（撞了 Astro 静默只留一条路由），这里不另判一次。
 */
export const BREADCRUMB_ROOTS: ReadonlyMap<string, BreadcrumbRoot> =
  buildRoots();

/** 首页后面的一格。 */
export type Crumb = {
  /** 印在页面上的字。 */
  label: string;
  /**
   * 这一格链到哪：从根到它为止的**整段**路径，不带前导斜杠（交给 `getRelativeLocaleUrl`）。
   * 最后一格是当前页，组件不链它。
   *
   * ★ 不是"单独这一段"：上游写的是 `getRelativeLocaleUrl(locale, 这一段)`，
   *   只在中间那格恰好是首段时才对 —— 到了第三层，中间那格会链到站根下的同名地址（404）。
   */
  path: string;
};

/** 组件从语言包里递进来的那两样。 */
export type BreadcrumbStrings = {
  /** `t.nav` 整个传进来 —— 取哪一格由上面那张表决定，组件里不点名。 */
  nav: Readonly<Record<string, string>>;
  /** `t.pagination.page`（「第」/「Page」）。 */
  page: string;
};

/** 分页的页码：正整数、不带前导零（Astro 的 paginate 不生成 /r/0、/r/01）。 */
const PAGE_NO_RE = /^[1-9][0-9]*$/;

/**
 * 集合列表页的第 2 段是不是页码。
 *
 * ⚠ 不能只看"是不是纯数字"：2026-09-21 起详情页的地址也是纯数字（`/r/1002`，条目号）。
 *   原来那条 `/^\d+$/` 是为了不把 /qa/some-slug 印成「问答 (第 some-slug)」写的，
 *   地址改成数字那天它就挡不住了 —— 哪天有人往详情页挂一个面包屑，
 *   印出来的是「研究 (第 1002)」。分界是条目号从 1000 起（`entryNo.ts`，
 *   sitemap 靠的是同一条），所以这里认"长得像页码、而且不是一个条目号"。
 */
const isListPageNo = (seg: string): boolean =>
  PAGE_NO_RE.test(seg) && !isEntryNo(seg);

const decodeSegment = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * 「研究」+ 第 2 页 → 「研究 (第 2)」。
 * 第 1 页**不带页码**：一个每个模块首页都有、永远是 1 的数字不带任何信息（2026-09-20 定的）。
 */
const withPage = (
  label: string,
  pageSeg: string | undefined,
  page: string
): string =>
  pageSeg === undefined || pageSeg === "1"
    ? label
    : `${label} (${page.toLowerCase()} ${pageSeg})`;

/**
 * 登记在册的首段 → 它的名字。
 *
 * ★ 语言包里查不到**就抛**，不原样印那个字母 —— 原样印出来正是这次的症状，而它不报错。
 *   只抛在用到它的那一页上、不是一加载就验整张表：改到一半（登记表加了、语言包还没加）
 *   的时候，坏的只是那一条路由的页面，别的页面照常。
 */
function rootLabel(
  seg: string,
  root: BreadcrumbRoot,
  nav: BreadcrumbStrings["nav"]
): string {
  const label = nav[root.navKey];
  if (typeof label !== "string" || label === "") {
    throw new Error(
      `面包屑：/${seg} 登记在册（对应 t.nav.${root.navKey}），但语言包的 nav 里没有「${root.navKey}」这一格 —— ` +
        `去 src/i18n/types.ts 和 src/i18n/lang/ 下每一份语言包的 nav 里加上它。` +
        `原样印「${seg}」正是 2026-09-23 修掉的那个症状（src/utils/breadcrumb.ts 开头）。`
    );
  }
  return label;
}

/**
 * 一段逻辑路径（已剥掉 base 和语言前缀，比如 `/r/2`、`/t/%E8%B4%A2%E6%8A%A5/2`）
 * → 首页后面那几格。首页自己（`/`）是空表。
 *
 * ★ **只有首段查表**。后面那几段是标签名、票代码，解码后原样印 ——
 *   前缀改成一两个字母之后，真实的票代码会和它们撞上：A（安捷伦）的页面是 /s/a、
 *   SE（Sea）是 /s/se、T（AT&T）是 /s/t。上游是每一段都查表，照那样写的话
 *   这三页的最后一格会印成「关于」「搜索」「标签」，同样不报错。
 * ★ 没登记的首段原样印：src/pages 下每条顶层路由都得在登记表里有主，
 *   那是 `routes.test.ts` 的事，这里不替它再判一次。
 */
export function breadcrumbTrail(
  path: string,
  strings: BreadcrumbStrings
): Crumb[] {
  const segs = path.split("/").filter(Boolean);
  const [head, second, third] = segs;
  if (head === undefined) return [];

  const upTo = (n: number) => segs.slice(0, n).join("/");
  const root = BREADCRUMB_ROOTS.get(head);
  const headLabel = root
    ? rootLabel(head, root, strings.nav)
    : decodeSegment(head);

  // /r、/r/2 → 「研究」「研究 (第 2)」：首段和页码并成一格。
  if (
    root?.shape === "list" &&
    segs.length <= 2 &&
    (second === undefined || isListPageNo(second))
  ) {
    return [
      { label: withPage(headLabel, second, strings.page), path: upTo(2) },
    ];
  }

  // /t/<标签>/2 → 「标签」/「<标签> (第 2)」：键和页码并成一格。
  if (
    root?.shape === "keyed" &&
    segs.length === 3 &&
    second !== undefined &&
    third !== undefined &&
    PAGE_NO_RE.test(third)
  ) {
    return [
      { label: headLabel, path: upTo(1) },
      {
        label: withPage(decodeSegment(second), third, strings.page),
        path: upTo(3),
      },
    ];
  }

  return segs.map((seg, i) => ({
    label: i === 0 ? headLabel : decodeSegment(seg),
    path: upTo(i + 1),
  }));
}
