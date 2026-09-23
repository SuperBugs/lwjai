import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { renderXhsCard } from "@/utils/xhsCard";
import type { MonoFonts } from "@/utils/ogCard";
import type { XhsCardSource } from "@/utils/xhsCardPlan";

/**
 * 封面图的**按内容缓存** —— `/_xhs` 打开一次要画 16 张，每张 satori 一遍。
 *
 * 【2026-09-22 用户问的】「这个每次都会重新渲染吗，图片，发布过的就不要再渲染了」。
 * 在这之前出图端点写的是 `Cache-Control: no-store`，所以**每次刷新全部重画**。
 *
 * ## ★ 键是**内容**，不是"发过没发过"
 *
 * 用户最初的想法是"发布过的就别再画了"。⚠ 那个键是错的，而且错得有代价：
 * **你改了一篇已经发过的稿子，恰恰最需要看到新图** —— 按"发过"跳过的话，
 * 屏幕上会一直是那张过期的图，而且没有任何一处会报错。
 * 而且它只加速已发的那几条，没发的照样慢。
 *
 * 所以键是 `XhsCardSource` 整个 —— 也就是那张**白名单**（标题 / 摘要 / 标的 /
 * 标签 / 落款 / 日期 / 地址）。内容一个字节没变就复用，改了就自动重画。
 * ★ 顺带保住了一条更值钱的性质：**出图端点和发帖端点共用这一份缓存**，
 *   所以**你发出去的就是你在页面上看过的那张图**，逐字节相同。
 *
 * ## ⚠ 缓存落在 `node_modules/.astro/` 下，是刻意的
 *
 * 它是**能重建的派生物**（删了下次自己画回来），和字形子集缓存同一个地方。
 * 这和 `.xhs-published.json`（发过什么的记录）**刚好相反** —— 那份丢了会让人发重，
 * 所以它在仓库里，见 `xhsPublished.ts`。两者别放一块。
 */

const CACHE_DIR = join(process.cwd(), "node_modules", ".astro", "xhs-cache");

/**
 * 这张卡的内容指纹。
 *
 * ⚠ 用 `JSON.stringify` 而不是逐字段拼：加一个字段时它**自动进指纹**。
 *   逐字段拼的那版会在"加了字段忘了加进指纹"那天给出一张过期的图，而四处全绿。
 *   （键的顺序是固定的 —— `cardSourceOf()` 一处构造，不是人手拼的对象。）
 */
export function cacheKey(source: XhsCardSource): string {
  return createHash("sha256")
    .update(JSON.stringify(source))
    .digest("hex")
    .slice(0, 16);
}

/**
 * 缓存文件名。**必须是纯 ASCII**：这一份**就是发出去的那一份**，而那个工具的
 * 排障清单里「路径编码（不要有中文）」是发布失败的已知原因之一 ——
 * 中文名换来的是一次**没有原因的失败**。（`/_xhs` 给人下载的那个名字
 * `牢玩家-r1009.png` 是另一回事，只在浏览器里用。）
 */
export function cacheFileName(
  collection: string,
  slug: string,
  key: string
): string {
  const safe = `${collection}-${slug}`.replace(/[^A-Za-z0-9._-]/g, "_");
  return `${safe}-${key}.png`;
}

/** 同一条内容的旧指纹文件名前缀 —— 改了内容之后拿它把旧的那张删掉。 */
export function stalePrefix(collection: string, slug: string): string {
  return `${`${collection}-${slug}`.replace(/[^A-Za-z0-9._-]/g, "_")}-`;
}

/**
 * 画一张卡，**内容没变就直接给磁盘上那张**。
 *
 * @returns `{ png, file, hit }` —— `hit` 是给日志/调试看的，说明这次有没有真画。
 */
export async function renderCached(
  source: XhsCardSource,
  mono: MonoFonts,
  collection: string,
  slug: string
): Promise<{ png: Buffer; file: string; hit: boolean }> {
  const key = cacheKey(source);
  const name = cacheFileName(collection, slug, key);
  const file = join(CACHE_DIR, name);

  if (existsSync(file)) {
    return { png: readFileSync(file), file, hit: true };
  }

  const png = await renderXhsCard(source, mono);
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(file, png);

  /**
   * 把这条内容的**旧指纹**那几张删掉。
   * ⚠ 不删的话，改一条内容改十次就在磁盘上留十张 —— 谁也不会去清，
   *   而它们除了占地方没有任何用（指纹变了就永远不会再命中）。
   */
  try {
    const prefix = stalePrefix(collection, slug);
    for (const f of readdirSync(CACHE_DIR)) {
      if (f.startsWith(prefix) && f !== name) {
        rmSync(join(CACHE_DIR, f), { force: true });
      }
    }
  } catch {
    // 清理失败不该让出图失败 —— 最坏是多占点磁盘。
  }

  return { png, file, hit: false };
}
