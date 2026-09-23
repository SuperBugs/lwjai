import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { requireCollectionSpec } from "../config/collections";
import { rowFromFrontmatter, sortRows, type EntryRow } from "./entryListPlan";

/**
 * 后台列表页的**磁盘那一半**：把一个集合目录下的 .md 读成 `EntryRow[]`（已排好序）。
 * `/_entries`（`entries-run.ts`）调它；判据全在 `entryListPlan.ts`，这里一个字的判断都不许有。
 *
 * ## ★ 为什么扫盘，不用 `getCollection()`
 *
 * 那是**站上**的视角，而这张表是**后台**的视角 —— 两者在三处不一样，每一处都是
 * "列表上少了一条而没有任何一处说"：
 *
 *   ① schema 过不去的条目（手改坏了一格、引用了一个删掉的标签）在内容层里是
 *     **没有**的，而 Keystatic 照样把它列出来 —— 那恰恰是最需要被看见、被点开的那一条；
 *   ② 刚在后台存盘的那一条，内容层要等 watcher 同步一轮，这时点回列表就是一张少一条的表；
 *   ③ 改过 content.config.ts 之后，共享的那台 dev server 可能一直吐旧数据（记在 memory 里）。
 *
 * 所以范围和 Keystatic **逐字对齐**：目录下**每一个** `*.md`（不递归，`_` 开头的也列，
 * 只是挂个「不是条目」），读不出来的也占一行、挂「读不出来」。
 * 条数因此能和 Keystatic 自己那张表对账（`countMismatchText()`）。
 *
 * ## 按修改时间缓存
 *
 * 稿子一多，每进一次列表页就把几百份正文从头读一遍是白花的 —— 只要 frontmatter，
 * 而没改过的文件不会变。所以按「路径 + mtime + 大小」记住上一次解析的结果，
 * 只重读变过的。删掉的文件顺手从缓存里清掉。
 *
 * ★ 零 astro import（node 内置 ＋ gray-matter ＋ 两个纯判据）：测试裸 tsx 造临时目录跑它。
 *   `bylineOf()` 要 i18n、要 astro:content，所以「智能体（模型）」那一串由调用方传进来。
 */

/** 一份 .md 的 frontmatter 读出来是什么：要么是数据，要么是读不出来的原因。 */
export type ParsedEntry =
  | { data: Record<string, unknown>; problem?: undefined }
  | { data?: undefined; problem: string };

/**
 * 解析一份 .md 的 frontmatter。**不抛** —— 读不出来的那一条要作为一行出现在列表上。
 *
 * ⚠ 传一个空选项对象给 gray-matter 不是手滑：它在**不传选项**时按原文把每一份结果
 *   缓存进一张全局表、永不清理，而这里读的是会被一改再改的文件（缓存交给下面那张按 mtime 的表）。
 */
export function parseEntrySource(raw: string): ParsedEntry {
  if (!/^\uFEFF?---\r?\n/.test(raw)) {
    return { problem: "没有 frontmatter（文件开头不是 ---）" };
  }
  try {
    const { data } = matter(raw, {});
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return { problem: "frontmatter 不是「键: 值」的表" };
    }
    return { data: data as Record<string, unknown> };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { problem: `frontmatter 解析失败：${msg.split(/\r?\n/)[0]}` };
  }
}

const cache = new Map<
  string,
  { mtimeMs: number; size: number; parsed: ParsedEntry }
>();

function readParsed(abs: string): ParsedEntry {
  const st = statSync(abs);
  const hit = cache.get(abs);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
    return hit.parsed;
  }
  const parsed = parseEntrySource(readFileSync(abs, "utf8"));
  cache.set(abs, { mtimeMs: st.mtimeMs, size: st.size, parsed });
  return parsed;
}

export interface ScanOptions {
  /** 仓库根。默认 `process.cwd()`（dev server 就是在仓库根起的）。测试传临时目录。 */
  root?: string;
  /** 判"未到发布时间"用的此刻（毫秒）。 */
  now: number;
  /**
   * 「智能体（模型）」那一串。接口那一侧传 `bylineOf()`（和 /_share、封面卡同一份）；
   * 不传就不画这一格。⚠ 它抛了就让整次读失败 —— 屏幕上退回 Keystatic 那张表、
   * 把原因印出来；吞掉的话，那一列会**静默**变成一串空格。
   */
  byline?: (data: Record<string, unknown>) => string | undefined;
}

/**
 * 读一个集合。目录从**登记表**拿（`requireCollectionSpec().dir`），不在这儿另拼一份路径 ——
 * 另拼一份就是 docs/engineering-notes.md 坑 7 那个形态（加了集合、改了目录，这里安静地读空气）。
 * 目录不存在就抛：接口回 500，屏幕上是"读不到"那一档，不是一张空表。
 */
export function scanEntryRows(
  collection: string,
  opts: ScanOptions
): EntryRow[] {
  const dir = join(
    opts.root ?? process.cwd(),
    ...requireCollectionSpec(collection).dir.split("/")
  );
  const names = readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith(".md"))
    .map(d => d.name);

  const seen = new Set<string>();
  const rows = names.map(name => {
    const abs = join(dir, name);
    seen.add(abs);
    const parsed = readParsed(abs);
    return rowFromFrontmatter({
      slug: name.slice(0, -".md".length),
      data: parsed.data,
      problem: parsed.problem,
      byline: parsed.data && opts.byline ? opts.byline(parsed.data) : undefined,
      now: opts.now,
    });
  });

  // 这个目录里已经不在的文件，从缓存里清掉。
  const prefix = join(dir, "x").slice(0, -1);
  for (const key of cache.keys()) {
    if (key.startsWith(prefix) && !seen.has(key)) cache.delete(key);
  }
  return sortRows(rows);
}
