/**
 * Sitemap 的**构建期那一半** —— 扫盘算 `<lastmod>`、写 `dist/sitemap.xml`。
 * 【2026-09-22 加】
 *
 * 判据、文件名、robots.txt 全文都在隔壁 `src/config/sitemap.ts`，**先读那一份**。
 *
 * ## 为什么和它分开两个文件
 *
 * 隔壁那份被 `src/layouts/Layout.astro` import（每一页都要印一条
 * `<link rel="sitemap">`），所以它一个 `node:fs` 都不许碰。扫盘和写盘的活
 * 全落在这里，而这里**只有 astro.config.ts 和测试 import** ——
 * 一个 `node:fs` 都进不了页面的渲染图。理由写在隔壁文件头那一段。
 *
 * ★ 零 astro import（只有 node 内置 ＋ gray-matter ＋ 两个纯判据模块）：
 *   `scripts/gate/sitemap.test.ts` 用裸 tsx 直接 import 它测，
 *   而 astro.config.ts 也 import 它 —— 两边跑的是同一份字节。
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { CONTENT_COLLECTIONS } from "./collections";
import { frontmatterDate, lastModifiedAt } from "./lastModified";
import { SITEMAP_FILE, SITEMAP_INDEX_FILE, type LastmodIndex } from "./sitemap";

// ── `dist/sitemap.xml` ───────────────────────────────────────────────────

/**
 * 把 `dist/sitemap-index.xml` **逐字节抄**成 `dist/sitemap.xml`，返回它列了几份分卷。
 *
 * ★ 抄的是**索引**（`<sitemapindex>`），不是 `sitemap-0.xml`（`<urlset>`）。
 *   两者都是合法的 sitemap、Search Console 两种都收，但索引是**唯一对分卷数不敏感**
 *   的那一份：条目超过 `entryLimit`（默认 45000）时会出现 `sitemap-1.xml`、
 *   `sitemap-2.xml`…，而索引永远把它们全列着。抄 `sitemap-0.xml` 的话，
 *   越过那条线的那天 `/sitemap.xml` 会**静默**只剩前 45000 条 —— 而站、构建、
 *   闸门四处全绿，只有 Search Console 里"已发现的网页"少一截。
 *
 * ★ 读不到源文件就**抛**，不许静默跳过。两种情况会走到这里，都必须响：
 *     - 这个集成排到了 `sitemap()` **前面** —— `astro:build:done` 是按 integrations
 *       数组顺序 `for await` 跑的（astro 的 `runHookBuildDone`），排前面时
 *       索引还没生成；
 *     - `@astrojs/sitemap` 自己放弃了（没有 `site`、或者一页都没有，它只 warn 一行）。
 *   静默跳过的后果是 `/sitemap.xml` 回到 404，而构建日志里一句话都没有。
 */
export function writeSitemapAlias(distDir: string): number {
  const src = join(distDir, SITEMAP_INDEX_FILE);
  let xml: string;
  try {
    xml = readFileSync(src, "utf8");
  } catch (e) {
    throw new Error(
      `读不到 ${SITEMAP_INDEX_FILE}（${src}）：${(e as Error).message}\n` +
        `  → 这个集成必须排在 astro.config.ts 的 sitemap() **后面**（build:done 按数组顺序跑），\n` +
        `    而且 @astrojs/sitemap 本轮得真的生成了索引（它放弃时只 warn 一行）。`
    );
  }
  // 抄之前确认一眼它是索引而不是别的东西 —— 上游哪天改了产出形状，这里要红，
  // 不是安静地把一份 `<urlset>`（甚至一段错误页）挂到 /sitemap.xml 上。
  if (!xml.includes("<sitemapindex")) {
    throw new Error(
      `${SITEMAP_INDEX_FILE} 里没有 <sitemapindex> —— @astrojs/sitemap 的产出形状变了？\n` +
        `  开头 200 字：${xml.slice(0, 200)}`
    );
  }
  writeFileSync(join(distDir, SITEMAP_FILE), xml, "utf8");
  return (xml.match(/<loc>/g) ?? []).length;
}

// ── `<lastmod>` 那张表 ───────────────────────────────────────────────────

/**
 * 扫登记表里**有详情路由**的那几个集合，为每一条算出它的 `<lastmod>`。
 * 怎么查、哪些页刻意查不中，见隔壁 `sitemapLastmod()`。
 *
 * ★ 这张表是一份**按地址查的字典，不是"站上有哪些页"的第二份答案**。
 *   页面清单由 `@astrojs/sitemap` 从 Astro 的路由表拿，这里只回答
 *   "这个地址背后那份 .md 最后改于何时"；查不到就不写 `<lastmod>`。
 *   失败方向因此是安全的 —— 它**没有办法凭空造出一个 `<loc>`**：
 *   草稿和定时未到的稿子在这张表里也有一行，但它们**没有页面**
 *   （`src/utils/postFilter.ts`，docs/engineering-notes.md 坑 1），永远不会被查到。
 *
 * ⚠ 反方向的失败是零症状的：地址前缀改了、文件名不再是号、目录搬了，
 *   这张表会**整片查不中**，于是全站 `<lastmod>` 一起消失而构建全绿。
 *   `scripts/gate/sitemap.test.ts` 的 B1 拿真仓库的内容对账钉着这件事。
 *
 * ⚠ 登记在册的目录**读不到就抛**：一个空目录和一个"路径写错了的目录"在
 *   `readdirSync` 那一层长得不一样，而压成"没东西"之后症状同样是 lastmod 消失。
 *   （同 `/_tidy` 那三档：「扫不全」不许长得像「没东西」。）
 */
export function buildLastmodIndex(root: string = process.cwd()): LastmodIndex {
  const out = new Map<string, string>();
  for (const c of CONTENT_COLLECTIONS) {
    if (c.urlPrefix === null) continue;
    const dir = join(root, ...c.dir.split("/"));
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch (e) {
      throw new Error(
        `内容集合「${c.label}」登记的目录读不到：${c.dir}（${(e as Error).message}）\n` +
          `  → 表在 src/config/collections.ts。读不到 = 这个集合的 <lastmod> 会整片消失，` +
          `而构建全绿，所以这里宁可红。`
      );
    }
    for (const name of names) {
      if (!name.endsWith(".md")) continue;
      const { data } = matter(readFileSync(join(dir, name), "utf8"));
      const at = lastModifiedAt(
        frontmatterDate(data.pubDatetime),
        frontmatterDate(data.modDatetime)
      );
      if (!at) continue; // 两格都没有 → 省略，见 lastModified.ts 文件头
      const slug = name.slice(0, -".md".length);
      out.set(`/${c.urlPrefix}/${slug}`, at.toISOString());
    }
  }
  return out;
}
