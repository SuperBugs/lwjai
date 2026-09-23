/**
 * 列表的先后：**按创建时间，新建的在前** —— 全站列表共用这一条判据。
 *
 * 【2026-09-23 用户要的】原话「研究、问答、教程等都应该是按照创建时间倒序展示，
 * 不应该是更新时间，即优先展示新创建的」。
 *
 * 在这之前 `getSortedPosts()` 用的是上游 AstroPaper 的 `modDatetime ?? pubDatetime`
 * （按最后更新排）。它撞上了 2026-09-21 的「改了就自动填更新时间」
 * （`src/dev/keystaticModTime.ts`）：在后台改一个错字，那一条就被顶回列表最前 ——
 * 实测 `/r/1002`（09-16 建的）因为 09-22 改过一次，在 /r 上排到第三组，
 * 压在好几组 09-21、09-22 才建的研究上面。而后台「更新时间」那格的说明、
 * docs/content-model.md 写的一直是"按发布时间排"：说的和做的是两件事，四处全绿。
 *
 * ## 创建时间是哪一格
 *
 * `pubDatetime`（后台「发布时间」，新建时默认填好此刻）。`modDatetime` **不参与排序**，
 * 它只回答"最后什么时候改过"（sitemap 的 lastmod、JSON-LD 的 dateModified，
 * 判据在 `src/config/lastModified.ts`）—— 两个问题，两个判据，别合回一个。
 *
 * ## 同一分钟建的两条
 *
 * 后台的时间只到分钟，连着建两条（导入页一口气贴几份）就会并列。并列时比**条目号**：
 * 号是建的那一刻发的、只增不补（`src/config/entryNo.ts`），号大的就是后建的。
 * 没有这一层，并列的两条谁在前取决于读盘顺序 —— 那不是这条规矩管得住的东西。
 *
 * ★ 零 import、不认 CollectionEntry 类型，只吃普通值：站上（`getSortedPosts` →
 *   `sortNewestCreated`）和后台列表（`newestCreatedFirst`）读同一条规矩，
 *   测试是裸 tsx 跑的（`scripts/gate/createdOrder.test.ts`）。
 */

/** 排先后要看的两样东西。 */
export type CreatedStamp = {
  /** 条目号（`1037`）—— 同一分钟建的两条靠它分先后。 */
  id: string;
  /**
   * 创建时间（frontmatter 的 `pubDatetime`）。站上拿到的是 zod 解析过的 `Date`，
   * 后台扫盘拿到的是 ISO 串（`2026-09-23T02:52:00.000Z`），两种都认。
   * 读不出来的（空串、手写坏了）**沉到最后** —— 一格坏数据不许把一条顶到最前。
   */
  pubDatetime: Date | string;
};

function timeOf(value: Date | string): number {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? -Infinity : ms;
}

/**
 * 条目号的先后：位数多的大，位数一样按字典序。对合法的条目号（entryNo.ts：十进制、
 * 不补零）这就是数值序 —— `10000` 在 `9999` 后面，光按字典序比会反过来。
 * 别的 id（`1007-2` 那种撞名后缀）只求一个确定的全序。
 * ⚠ 裸比较，不用 localeCompare：区域设置一变，后者对数字和标点的规矩就可能跟着变
 *   （同 groupScan.ts 那条）。
 */
function idOrder(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 给 `Array.prototype.sort` 用的比较函数：**新建的在前**。
 * 先比创建时间（晚的在前），并列再比条目号（大的在前）。
 *
 * ★ 用比较不用相减：读不出的时间是 `-Infinity`，两个相减是 NaN，
 *   而 sort 把 NaN 当成"相等" —— 坏数据会被随手插在中间。
 */
export function newestCreatedFirst(a: CreatedStamp, b: CreatedStamp): number {
  const ta = timeOf(a.pubDatetime);
  const tb = timeOf(b.pubDatetime);
  if (ta !== tb) return ta > tb ? -1 : 1;
  return idOrder(b.id, a.id);
}

/**
 * 同上，直接排内容条目（`getSortedPosts` 用这个）。返回新数组，不动入参。
 *
 * ★ 入参只要求 `id` 和 `data.pubDatetime` —— 条目上的 `modDatetime` 这里**读不到**，
 *   也就不可能再参与排序。测试喂的就是带着 `modDatetime` 的真实形状。
 */
export function sortNewestCreated<
  T extends { id: string; data: { pubDatetime: Date | string } },
>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) =>
    newestCreatedFirst(
      { id: a.id, pubDatetime: a.data.pubDatetime },
      { id: b.id, pubDatetime: b.data.pubDatetime }
    )
  );
}
