import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import { getSortedPosts } from "@/utils/getSortedPosts";
import { entrySlug } from "@/utils/getPostPaths";
import { toExportMarkdown } from "@/utils/exportMarkdown";
import { exportImageUrls } from "@/utils/exportImageUrls";

/**
 * 教程的 .md 下载口 —— `/g/<号>.md`。详情页上「复制全文」取的也是这个地址。
 * 为什么是四份薄文件而不是一个工厂，见 `src/pages/r/[...slug].md.ts` 顶部。
 *
 * ★【2026-09-23 用户定的】吐的就是**正文原文**，站方一个字都不加。
 *   ⚠ 教程是这个站里**唯一图比字多**的集合，而正文里的本地图片是相对路径
 *   （`../../assets/guides/<号>/x.jpg`），下到读者桌面就解析不了。原来这里会把
 *   它们换成一句「这里原本有一张图」、在文件头报张数 —— 那也是站方加的话，
 *   和别的一起拿掉了。【同日第二轮，用户要的】图片那一行现在**只换地址**：
 *   换成站上那张图的完整地址（`exportImageUrls.ts`），下到桌面联网就看得到。
 *   理由见 `src/utils/exportMarkdown.ts` 顶部。
 */

const COLLECTION = "guides";

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
