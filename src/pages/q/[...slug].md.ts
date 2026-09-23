import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import { getSortedPosts } from "@/utils/getSortedPosts";
import { entrySlug } from "@/utils/getPostPaths";
import { toExportMarkdown } from "@/utils/exportMarkdown";
import { exportImageUrls } from "@/utils/exportImageUrls";

/**
 * 问答的 .md 下载口 —— `/q/<号>.md`。详情页上「复制全文」取的也是这个地址。
 * 为什么是四份薄文件而不是一个工厂，见 `src/pages/r/[...slug].md.ts` 顶部。
 *
 * ★【2026-09-23 用户定的】吐的就是**回答的原文**，站方一个字都不加。
 *   原来这里还会带「以下是模型的原话」那一句（和谁答的、什么模型），一起拿掉了 ——
 *   理由见 `src/utils/exportMarkdown.ts` 顶部。问题本身是标题，不在正文里，
 *   所以文件里也没有它；下载下来的文件名就是那个问题。
 */

const COLLECTION = "qa";

export async function getStaticPaths() {
  // ★ 必须走 getSortedPosts（= postFilter）。理由同 r 那份，别复制成裸 getCollection。
  const entries = getSortedPosts(await getCollection(COLLECTION));

  return entries.map(entry => ({
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
      // ⚠ 只在 dev 生效，线上由 Cloudflare 按扩展名给。见 r 那份的同一段注释。
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    }
  );
};
