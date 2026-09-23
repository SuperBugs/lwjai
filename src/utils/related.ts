/**
 * 详情页上「和这一条有关的其他条目」的判据 —— 三种关系，一个文件。
 *
 *   relatedBySymbol     同一只票的其他研究 / 问答（研究稿、问答详情页）
 *   qaSiblings          同一个问题、其他智能体的回答（问答详情页）
 *   entriesUsingPrompt  用了这份提示词的研究稿（提示词详情页）
 *
 * ## 为什么是纯函数、零 import
 *
 * 判据里最容易错的一处是「把自己也列进去」——「关于 TSLA 的其他研究」里第一条
 * 就是本篇，而页面、构建、闸门三处全绿。所以判据抽出来单测
 * （`scripts/gate/related.test.ts`），而测试是裸 tsx 跑的：这里不许 import `@/`、
 * `astro:*`，也不许 import `./postFilter`（它 import 了 `@/config`）。
 * ★【2026-09-22】唯一的例外是 `../config/symbol` —— 那个文件**自己也是零 import** 的
 *   纯判据，裸 tsx 加载得动（`sharePost.ts` 早就这么引它了）。这条例外是为了**减少**
 *   判据的份数，不是放宽规矩：代码归一那条规矩原来在这儿和 `getUniqueSymbols.ts` 里
 *   各写死了一份。
 * **草稿 / 定时稿的过滤由调用方先做**（喂进来的 pool 必须已经过了 `getSortedPosts()`），
 * 这里只管"关系"。
 *
 * ## 身份 = 集合 + id
 *
 * 后台写的是扁平文件，`qa/foo.md` 和 `posts/foo.md` 的 id 都是 `foo`。
 * 只比 id 会把一条问答当成"本篇"排除掉。
 */

import { symbolKey } from "../config/symbol";

export type EntryKey = { id: string; collection: string };

const sameEntry = (a: EntryKey, b: EntryKey) =>
  a.collection === b.collection && a.id === b.id;

/**
 * 代码归一：大写，点换成连字符（`BRK.B` 和 `BRK-B` 在 /s/brk-b 上是同一页，
 * 这里也得是同一只票）。
 *
 * ★【2026-09-22】判据本身搬进了 `src/config/symbol.ts` 的 `symbolKey()`，
 *   `getUniqueSymbols.ts` 的 `symbolSlug()` 读同一个 —— 在那之前两处各写死了一份
 *   相同的正则。这里留一个名字是为了不动 related.test.ts 的那几条用例。
 */
export const normalizeSymbol = (symbol: string): string => symbolKey(symbol);

/**
 * 同一只票的其他条目。**两边都是一串代码，只要有一只对上就算**
 * （【2026-09-22】一条问答可以讲好几只票）。本条一只都没勾 → 空数组
 * （这篇不讲单只票，完成态）。
 *
 * `exclude` 是**已经在同一页别处列出来**的条目（比如问答页的「其他智能体的回答」）。
 * 同一条在一页上出现两次不只是难看：两张卡片会带同一个 view-transition-name，
 * 浏览器直接跳过整个动画，而且不报错。
 *
 * ⚠ 交集判据用的是"有没有共同的票"，**不是"两边完全一样"**：一条同时讲
 *   ARM / INTC 的问答，和一篇只讲 ARM 的研究稿**是相关的** —— 要求全等的话
 *   多标的那一条会和谁都不相关，而页面上只会少一块，什么都不报错。
 */
export function relatedBySymbol<
  T extends EntryKey & { data: { symbols?: readonly string[] } },
>(
  pool: readonly T[],
  current: EntryKey,
  symbols: readonly string[] | undefined,
  exclude: readonly EntryKey[] = []
): T[] {
  const want = new Set((symbols ?? []).map(normalizeSymbol));
  if (want.size === 0) return [];
  return pool.filter(
    e =>
      (e.data.symbols ?? []).some(code => want.has(normalizeSymbol(code))) &&
      !sameEntry(e, current) &&
      !exclude.some(x => sameEntry(x, e))
  );
}

/**
 * 哪些集合支持「**同一个选题 / 问题，几个智能体各写一份**」。
 *
 * 【2026-09-20】一开始只有问答；同一天研究稿也加上了 —— 同一只票、同一个角度，
 * 换个智能体跑出来的结论不一样，那正是这个站要给读者看的东西。
 * 两边**共用 `questionKey` 这一个字段**和下面这一套判据（用户定的：不为改名
 * 去动二十来处引用）。界面上的措辞各写各的：问答说「回答」，研究稿说「研究」。
 *
 * ★ 判据只有这一处。Card.astro 的折叠卡、qaGroups.ts 的列表折叠、两个详情页的
 *   切换条都读它 —— 哪天加第三个集合，改这一行，不是去四个地方各加一个
 *   `collection === "…"`（那种写法漏一处的症状是"这一页不折叠"，而四处全绿）。
 */
export const GROUPED_COLLECTIONS: readonly string[] = ["posts", "qa"];

export const isGroupedCollection = (collection: string): boolean =>
  GROUPED_COLLECTIONS.includes(collection);

/**
 * 一条内容属于**哪个组**（问答的问题组 / 研究稿的选题组）。
 *
 * 【2026-09-20 改】以前是"`questionKey` 相同才算一组"，也就是说**同组的每一条都得
 * 手抄同一个键**，包括第一条。后台那一格现在是下拉（从已有的挑，见
 * keystatic.config.ts 的 `groupOptions()`），而一组里的第一条在被创建的时候
 * 还没有"已有的"可挑 —— 它只能留空。
 *
 * 所以归组的判据改成：**填了键就用键，没填就用自己的地址**。
 * 于是「第一条留空、后来的指向它」和「几条都填同一个键」两种写法都成立，
 * ★ 老稿子一个字都不用改（它们互相填的是同一个键，仍然同组）。
 *
 * ⚠ 返回值**不带集合名**：它是"组内比对"用的。跨集合的场合（列表折叠喂进来的
 *   是混合池）要自己加前缀，见 qaGroups.ts —— 后台写的是扁平文件，
 *   `posts/foo` 和 `qa/foo` 的 id 相同，不加前缀会把两个集合的东西折成一张卡。
 */
export const qaGroupKey = (
  entry: EntryKey & { data: { questionKey?: string } }
): string => entry.data.questionKey?.trim() || entry.id;

/**
 * 同一个组里的其他条目（问答：其他智能体的回答；研究稿：其他智能体的研究）。
 *
 * 返回空有**两种**来路，页面要分开处理（`questionKey` 传进来就是给页面分档用的）：
 *   - 没填键、也没有别的条目指向本条 → 只写过一份，**完成态**，整块不渲染；
 *   - 填了键却没对上 → 「目前只有这一份」，**待补**，多半是键打错或者指向的那条
 *     被删了。这一句是唯一的线索 —— 键打错的症状在别处和"真的只有一份"完全一样。
 *
 * ★ **只在同一个集合内部找**：后台写的是扁平文件，一篇研究稿和一条问答可能同名，
 *   不比集合的话「研究稿 foo」会把「问答 foo」拉进自己的选题组，而两边都不报错。
 */
export function qaSiblings<
  T extends EntryKey & { data: { questionKey?: string } },
>(pool: readonly T[], current: EntryKey, questionKey: string | undefined): T[] {
  const key = questionKey?.trim() || current.id;
  /**
   * ⚠ 这里**只管"谁是同一组的"，不管顺序** —— 吐出来的是 pool 的顺序（新在前）。
   *
   * 【2026-09-21】组内展示顺序由后台「回答排序」那张表说了算
   * （`src/config/answerOrder.ts` 的 `sortAnswers()`），但那一下**刻意不在这里做**：
   * 这个文件是零 import 的纯判据，它的单测直接断言 `qaSiblings()` 吐出来的 id 顺序
   * —— 把一张**人在后台随时会改的表**拉进来，那些用例就会被一次内容编辑改红。
   * 排序放在两个详情页取到 siblings 的那一行（`detailParity.test.ts` 钉着两页都做了），
   * 列表那边放在 `foldQaGroups()` 里，两处读的是同一个 `sortAnswers()`。
   */
  return pool.filter(
    e =>
      e.collection === current.collection &&
      qaGroupKey(e) === key &&
      !sameEntry(e, current)
  );
}

/** 用了这份提示词的条目。`prompt` 是 Astro `reference()` 解析后的 `{ id, collection }`。 */
export function entriesUsingPrompt<
  T extends EntryKey & {
    data: { prompt?: { id: string; collection: string } };
  },
>(pool: readonly T[], promptId: string): T[] {
  return pool.filter(e => e.data.prompt?.id === promptId);
}
