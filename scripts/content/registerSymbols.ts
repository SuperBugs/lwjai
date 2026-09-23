/**
 * 把导入时认出来、而**标的表里还没有**的那几只票登记进去。
 * 【2026-09-22】两个导入口共用这一份：`pnpm content:import`（CLI）和 `/_import`。
 *
 * ## 为什么标的是"自动加一行"，而标签是"丢掉"
 *
 * 判据和完整理由写在 `src/config/symbols.ts` 文件头那张表底下，一句话：
 * **丢掉一个标签只是少一个分类，丢掉标的等于把这条内容从 `/s/<代码>` 上整个摘出去** ——
 * 而那正是它最该出现的地方。代码又是机器可验的（`SYMBOL_RE`），不像标签那样
 * 会长出「财报」「财报解读」这种同义写法，自动登记撑不坏这张表。
 *
 * ## 三条边界
 *
 * ★ **判据不在这儿**：加一行长什么样由 `withSymbolRow()` 说了算（纯函数、有单测），
 *   这个文件只管读盘、写盘。两个导入口各写一份"怎么拼那个对象"的话，
 *   两条路会长出两种表结构，而 `parseSymbols()` 只会在其中一条上红。
 * ★ **写不进去就抛**，不吞：稿子已经写了（或者正要写），而它勾着一只表里没有的票 ——
 *   静默失败的结果是那条草稿在后台打不开、构建也红，而报错指向的是内容那一侧，
 *   查起来要绕一圈。宁可在这儿当场说清楚。
 * ⚠ 后台正开着「标的」那一页时，这边写盘它是**看不见**的（Keystatic 读的是加载那一刻
 *   的快照）。刷新一次就好；不刷新而在那一页上存盘会把这几行盖掉。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SYMBOLS_FILE } from "../../src/config/collections";
import { parseSymbols, withSymbolRow } from "../../src/config/symbols";

export type NewSymbol = { code: string; name?: string };

/**
 * @returns 真的加进去的那几只（本来就在表里的不算）。一只都没加时返回空数组，
 *   而且**不碰那个文件** —— 一次"什么都没变"的导入不该在 git 里留下一个改动。
 */
export function registerSymbols(rows: readonly NewSymbol[]): string[] {
  if (rows.length === 0) return [];

  const path = join(process.cwd(), ...SYMBOLS_FILE.split("/"));
  const before = readFileSync(path, "utf8");
  let data: unknown = JSON.parse(before);
  const had = new Set(parseSymbols(data, SYMBOLS_FILE).map(s => s.code));

  for (const row of rows) data = withSymbolRow(data, row);
  const added = parseSymbols(data, SYMBOLS_FILE)
    .map(s => s.code)
    .filter(code => !had.has(code));
  if (added.length === 0) return [];

  // 和 Keystatic 写这个文件的格式对齐（2 空格 + 结尾换行）——
  // 不对齐的话，后台在那一页上存一次盘就是一次纯格式的 diff。
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return added;
}
