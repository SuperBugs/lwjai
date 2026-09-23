/**
 * 列表里把**同一个问题的几条回答折成一项** —— /qa、首页、/s/<代码>、/tags 四处共用的判据。
 *
 * 【2026-09-20 加】在这之前，一个问题问了两个智能体，列表上就是两张一模一样标题的卡
 * 叠在一起（用户原话：「看起来很冗余」）。归组的钥匙不在这里，在 `related.ts` 的
 * `qaGroupKey()`：填了 `questionKey` 用键、没填用自己的地址 —— 详情页的「其他智能体的回答」
 * 和这里读的是同一把钥匙，两处不可能分家。
 *
 * ## 形状
 *
 * 喂进来的是**已经排好序**（新在前、已过 getSortedPosts）的条目，可以混着研究稿。
 * 吐出来的每一项是 `{ entry, answers }`：
 *   - 研究稿 / 教程 / 提示词：`answers` 就是 `[entry]`，卡片照旧；
 *   - 问答：同组的全部回答按原顺序收进 `answers`（第一条 = `entry` = 最新那条），
 *     整组占**第一次出现**的位置 —— 也就是按组里最新一条排。
 *
 * 所以「折」是无损的：`answers.length` 加起来仍等于喂进来的条数，只是分页按项数分。
 *
 * ★ 零 `@/`、零 `astro:*` import：`scripts/gate/qaGroups.test.ts` 用裸 tsx 跑它。
 */
import { sortAnswers } from "../config/answerOrder";
import { isGroupedCollection, qaGroupKey } from "./related";

export type ListItem<T> = {
  /** 这一项的代表：问答组里最新的那条；别的集合就是条目本身。 */
  entry: T;
  /** 同组的全部回答（含 entry，新在前）。长度 1 = 只问过一次或不是问答。 */
  answers: T[];
};

/** ⚠ `data` 保持 `object` —— 组内排序要读的 `agent` 由 `sortAnswers()` 自己去取，
 *  在这里写成 `{ agent?: string }` 会把泛型收窄、把调用方的 `title` / `filePath`
 *  一起丢掉（理由写在 answerOrder.ts 的 `WithData` 上）。 */
type Foldable = { id: string; collection: string; data: object };

export function foldQaGroups<T extends Foldable>(
  sorted: readonly T[]
): ListItem<T>[] {
  const items: ListItem<T>[] = [];
  const groups = new Map<string, ListItem<T>>();
  for (const entry of sorted) {
    if (!isGroupedCollection(entry.collection)) {
      items.push({ entry, answers: [entry] });
      continue;
    }
    /**
     * ★ 键要带集合前缀。后台写的是**扁平文件**，`posts/foo` 和 `qa/foo` 的 id
     *   一模一样 —— 不加前缀的话，一篇研究稿和一条同名问答会被折进同一张卡，
     *   而列表页、构建、测试四处全绿（只是卡上多出一行不相干的东西）。
     *   `qaGroupKey()` 本身刻意不带前缀：它是"组内比对"用的，见那边的注释。
     */
    const key = `${entry.collection}:${qaGroupKey(
      entry as T & { data: { questionKey?: string } }
    )}`;
    const group = groups.get(key);
    if (group) {
      group.answers.push(entry);
    } else {
      const item = { entry, answers: [entry] };
      groups.set(key, item);
      items.push(item);
    }
  }
  /**
   * 【2026-09-21 用户要的】组内按后台「回答排序」那张表重排（判据在
   * `src/config/answerOrder.ts`，表空着时它等于什么都没做 —— 稳定排序，
   * 名次一样就保持"新在前"）。
   *
   * ★ 只重排**组里那几条**，`items` 的顺序一个都不动：组在列表里的位置仍然是
   *   "组里最新那条"的位置。不然把某个智能体拖到最前，会把它参与过的每一组
   *   都顶到首页最上面 —— 那不是排序，那是置顶。
   * ★ 重排完要把 `entry` 换成新的第一条：卡片的标题、标的、链接都读 `entry`，
   *   而折叠卡的标题**链到 `answers[0]`**（Card.astro 里写着"answers[0] 就是本条"）。
   *   不换的话，标题印的是 A、点下去却跳到 B —— 页面、构建、测试四处全绿。
   */
  for (const item of groups.values()) {
    item.answers = sortAnswers(item.answers);
    item.entry = item.answers[0]!;
  }
  return items;
}
