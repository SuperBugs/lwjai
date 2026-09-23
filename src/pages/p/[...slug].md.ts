import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import { getSortedPosts } from "@/utils/getSortedPosts";
import { entrySlug } from "@/utils/getPostPaths";
import { toExportMarkdown } from "@/utils/exportMarkdown";
import { exportImageUrls } from "@/utils/exportImageUrls";

/**
 * 提示词的 .md 下载口 —— `/p/<号>.md`。详情页上「复制全文」取的也是这个地址。
 * 为什么是四份薄文件而不是一个工厂，见 `src/pages/r/[...slug].md.ts` 顶部。
 *
 * ★【2026-09-23 用户定的】吐的就是**提示词原文**，站方一个字都不加 ——
 *   这个集合是"拿走粘进你自己的模型"的，文件头上多出来的每一行都会跟着粘进去。
 *   理由见 `src/utils/exportMarkdown.ts` 顶部。
 *   ⚠ 连带拿掉的：分享者 / 投稿署名那两行（原来在 frontmatter 里）和
 *   「以下是提示词原文，照抄就能用…」那句。两样在详情页上都还在
 *   （`PromptOriginChip` 和正文上方那句 `t.prompts.verbatimNotice`），
 *   只是不再跟着文件走 —— 这是用户的决定，不是漏了。
 */

const COLLECTION = "prompts";

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
