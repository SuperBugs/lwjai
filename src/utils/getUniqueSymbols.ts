import { postFilter } from "./postFilter";
import { symbolKey } from "@/config/symbol";
import { findSymbolRow } from "@/config/symbols";

/**
 * 能进标的索引的条目：**结构类型**，posts 和 qa 都能喂。
 *
 * `collection` 是必须的 —— 见 `SymbolEntry` 上关于计数的注释。
 * glob loader 的 entry 自带这个字段，调用方不用额外拼。
 *
 * 【2026-09-22】`symbol?: string` 换成了 `symbols: string[]`（一条内容可以讲好几只票），
 * `symbolName` 整个没了 —— 名字在标的表里。
 */
export type SymbolizedEntry = {
  collection: string;
  data: {
    symbols: string[];
    pubDatetime: Date;
    draft?: boolean;
  };
};

export type SymbolEntry = {
  /** 地址里那一段，小写。`BRK.B` → `brk-b`。 */
  slug: string;
  /** 原始代码，大写，展示用。 */
  code: string;
  /** 公司中文名。**可能是 undefined，那是"不知道"** —— 页面上只显示代码，不编一个。 */
  name?: string;
  /** 研究稿篇数。 */
  postCount: number;
  /** 问答条数。 */
  qaCount: number;
  /** 两者之和。**只在"总量"确实是要说的那个数时用它**（比如分页总数）。 */
  total: number;
  /** 这只票最近一条的发布时间，给列表排序和展示用。 */
  latest: Date;
};

/**
 * ★ 为什么把 `count` 拆成 `postCount` + `qaCount`
 *
 * 合并两个集合之后，单独一个 `count` 的**语义变了而字段名没变** ——
 * `/s/[symbol]` 上那句「共 N 篇」会开始说一个研究稿和问答混在一起的数字，
 * 读者分不清哪个是哪个，而页面上一切正常、构建全绿。
 * 两种东西数到一个数里就是把两种信息压成一种，所以这里分开数。
 */
type SymbolAcc = Omit<SymbolEntry, "total">;

/** 代码 → 地址片段。点和连字符在路径里虽然合法，但 `BRK.B` 会让某些
 *  静态托管把它当成扩展名（`.B`）来猜 MIME 类型，所以统一压成连字符。
 *
 *  ★【2026-09-22】"点换连字符"这一步挪进了 `src/config/symbol.ts` 的 `symbolKey()`，
 *    这里只剩大小写那一层 —— `related.ts` 的 `normalizeSymbol()` 读的是同一个函数。
 *    在那之前两处各写死了一份相同的正则，改一边不会有任何报错（症状是详情页说
 *    "这只票还有 3 篇"而 /s/brk-b 上只有 1 篇）。 */
export function symbolSlug(code: string): string {
  return symbolKey(code).toLowerCase();
}

/**
 * 从研究稿和问答里汇总出「这个站 covered 过哪些标的」。
 *
 * - 草稿与定时未到的不算（走 `postFilter`，和标签页同一条口径）
 * - 一个都没勾的条目（宏观、方法论、复盘）**不出现在这里**，那不是遗漏 ——
 *   它们本来就不讲单只票，标的索引上多一个空条目只会碍事
 * - 【2026-09-22】一条内容**勾了几只票就进几只票的账**（问答的常态）；
 *   名字从**标的表**取，不再是"以最近写的那条为准"——
 *   那段 latest-wins 存在的唯一理由是名字散在每条内容上，现在它只有一处了
 * - 表里有、但站上一条内容都没有的票**不出现**：那一页上会一条内容都没有，
 *   而"预先登记一只还没写的票"是后台里完全正常的一步
 */
export function getUniqueSymbols(entries: SymbolizedEntry[]): SymbolEntry[] {
  const bucket = new Map<string, SymbolAcc>();

  for (const entry of entries.filter(postFilter)) {
    // ★ 认不出集合就抛，**不许随手归到 postCount 里**：那会让「共 N 篇研究」
    //   悄悄把别的东西数进去。新集合要带 symbols，就得先决定它在页面上怎么说。
    if (
      entry.data.symbols.length > 0 &&
      entry.collection !== "posts" &&
      entry.collection !== "qa"
    ) {
      throw new Error(
        `标的索引只会数 posts 和 qa，来了一个「${entry.collection}」集合的条目` +
          `（${entry.data.symbols.join(" / ")}）。` +
          `要让它进标的索引，先决定「共 N 篇」那句话怎么分档说。`
      );
    }
    const isQa = entry.collection === "qa";
    const when = new Date(entry.data.pubDatetime);

    for (const raw of entry.data.symbols) {
      const code = raw.toUpperCase();
      const slug = symbolSlug(code);
      const seen = bucket.get(slug);

      if (!seen) {
        bucket.set(slug, {
          slug,
          code,
          // 名字只有一处：标的表。查不到就没有名字（页面上只印代码，不编）。
          name: findSymbolRow(code)?.name,
          postCount: isQa ? 0 : 1,
          qaCount: isQa ? 1 : 0,
          latest: when,
        });
        continue;
      }

      if (isQa) seen.qaCount += 1;
      else seen.postCount += 1;
      if (when > seen.latest) seen.latest = when;
    }
  }

  // `total` 在出口处一次算出来，**不在累加过程里维护** —— 少一处会忘了同步的地方。
  return (
    [...bucket.values()]
      .map(entry => ({ ...entry, total: entry.postCount + entry.qaCount }))
      // 按代码字母序 —— 这一页的用途是**找一只票**，字母序才扫得快。
      // "最近写过什么"首页的时间流已经回答了，不用在这里再答一次。
      .sort((a, b) => a.code.localeCompare(b.code))
  );
}
