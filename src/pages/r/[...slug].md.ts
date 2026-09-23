import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import { getSortedPosts } from "@/utils/getSortedPosts";
import { entrySlug } from "@/utils/getPostPaths";
import { toExportMarkdown } from "@/utils/exportMarkdown";
import { exportImageUrls } from "@/utils/exportImageUrls";

/**
 * 研究稿的 .md 下载口 —— `/r/<号>.md`。详情页上「复制全文」取的也是这个地址。
 *
 * ★【2026-09-23 用户定的】吐的就是**正文原文**，站方一个字都不加
 *   （理由和原来加过什么，见 `src/utils/exportMarkdown.ts` 顶部）。
 *   所以这个文件里没有 i18n、没有站点配置、没有智能体 / 模型 / 提示词的解析 ——
 *   那些以前都是用来往文件里加东西的。**别把它们 import 回来。**
 *   `export.test.ts` 的 C 组钉着：Response 的 body 就是 `toExportMarkdown()` 的返回值。
 *
 * ## 四个端点为什么是四份几乎一样的文件，而不是一个工厂
 *
 * docs/engineering-notes.md 坑 11：打包器会把 `getStaticPaths` 提成单独的 chunk，而它引用的
 * **模块级 const** 不一定被带走 —— 上次就是这样让问答页和教程页**同时**炸的，
 * 而且在加第四个集合之前一直是好的。一个
 * `export const { getStaticPaths } = makeExportRoute("posts")` 的工厂，
 * 正是那个形态（getStaticPaths 是模块级 const 里的闭包）。
 *
 * 所以这里是"四份薄文件 + 一份共享的序列化器"：这四个文件里只剩集合名和 props 类型。
 * 漏改一处由 `scripts/gate/export.test.ts` 的 C 组钉着。
 */

const COLLECTION = "posts";

export async function getStaticPaths() {
  // ★ 清单必须走 getSortedPosts（= postFilter），不许裸 getCollection。
  //   裸取会把 `draft: true` 和未到发布时间的定时稿变成**没有 HTML 页面兜底、
  //   却挂在公网上的 .md**。发布闸对草稿网开一面的前提正是"草稿不生成页面"
  //   （docs/gate.md），这一行就是那个前提本身。全程零症状，人眼发现不了。
  const entries = getSortedPosts(await getCollection(COLLECTION));

  return entries.map(entry => ({
    // 去掉 entrySlug 的前导斜杠：这条路由是 `[...slug].md`，参数值带斜杠会拼出
    // `/r//1002.md`。`[...slug]/index.png.ts` 那条不需要是因为它后面还有一段。
    params: {
      slug: entrySlug(COLLECTION, entry.id, entry.filePath).replace(/^\/+/, ""),
    },
    props: entry,
  }));
}

export const GET: APIRoute = async ({ props, url }) => {
  const entry = props as CollectionEntry<typeof COLLECTION>;

  return new Response(
    toExportMarkdown({
      title: entry.data.title,
      body: entry.body,
      // 【2026-09-23 用户要的】正文里的本地图换成站上的完整地址（怎么算的见那个文件顶部）。
      imageUrls: await exportImageUrls(entry, url),
    }),
    {
      // ⚠ 这一行**只在 `pnpm dev` 里生效**。静态构建只把 body 写盘，
      //   Response 的 headers 整个丢掉（没有 adapter 就没有 staticHeaders）。
      //   线上的 Content-Type 由 Cloudflare 按扩展名给：`.md` → `text/markdown`
      //   （2026-09-23 curl 实测，不带 charset）。
      //   **所以别在这里写 `Content-Disposition`** —— 那会是一个只有你自己机器上
      //   才成立的假象。下载文件名走 `<a download>`，见 DownloadLinks.astro。
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    }
  );
};
