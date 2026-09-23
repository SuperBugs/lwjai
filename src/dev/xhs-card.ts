import type { APIRoute } from "astro";
import { loadMonoFonts } from "@/utils/ogEndpoint";
import { renderCached } from "./xhsCache";
import { cardSourceOf, findXhsGroup } from "./xhsEntry";
import { useTranslations } from "@/i18n";

/**
 * 小红书封面图那张 PNG —— `GET /_xhs/card.png?c=<集合>&s=<号>`，
 * **只在 `pnpm dev` 里存在**（astro.config.ts 按 isDev 用 injectRoute 挂上；
 * 文件不在 src/pages 下，生产构建里没有这条路由）。
 *
 * 卡怎么摆在 `src/utils/xhsCard.ts`，每一格印什么在 `src/utils/xhsCardPlan.ts`，
 * **「`?c=&s=` 指的是哪一组、那一组该印什么」在 `./xhsEntry.ts`** ——
 * 和发帖那条端点（`/_xhs/publish`）读的是同一份，理由写在那个文件头：
 * 各查一次的话，图和文案可能描述的不是同一条内容，而四处全绿。
 *
 * ## 出不来的时候回 500，**不给图**
 *
 * 和分享卡（`ogEndpoint.ts` 回落到 default-og.jpg）**刻意相反**，理由写在
 * `xhsCard.ts` 文件头：这张卡自己就是全部内容，给一张"看起来能发"的图最坏。
 */

/**
 * ★ 必须显式关掉预渲染，理由和 `src/dev/preview.astro` 那条逐字相同：
 *   预渲染路由拿到的 `Astro.url.searchParams` 是**空的**，每次都落进"参数不对"那一档。
 */
export const prerender = false;

const text = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });

export const GET: APIRoute = async ({ url, currentLocale }) => {
  const collection = url.searchParams.get("c") ?? "";
  const slug = url.searchParams.get("s") ?? "";
  if (!collection || !slug) {
    return text(`要 ?c=<集合>&s=<号>，拿到的是 c=${collection} s=${slug}`, 400);
  }

  const { group, unknownCollection } = await findXhsGroup(collection, slug);
  if (unknownCollection) {
    return text(
      `没有「${collection}」这个集合，或者它没有详情路由（也就没有封面图）。`,
      404
    );
  }
  if (!group) {
    return text(
      `${collection} 里没有已发布的「${slug}」。\n` +
        `草稿没有公开地址，所以也不出封面图 —— 先在后台取消草稿。`,
      404
    );
  }

  const source = cardSourceOf(
    group,
    collection,
    useTranslations(currentLocale),
    currentLocale
  );

  try {
    const { png } = await renderCached(
      source,
      await loadMonoFonts(url),
      collection,
      slug
    );
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        // ★ 仍然不让浏览器缓存：新鲜度由**磁盘那层按内容哈希**的缓存保证
        // （xhsCache.ts）—— 内容改了指纹就变，这里不该再压一层猜不准的 TTL。
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    /**
     * ★ **不回落到一张默认图**，理由见 `xhs.astro` / `xhsCard.ts` 文件头：
     *   这张卡自己就是全部内容，一张"看起来能发"的图会被真的发出去。
     *   页面上 `<img>` 的 onerror 会把这一格画成红框，人点一下就看到下面这段话。
     */
    return text(
      `这张封面图没画出来：${err instanceof Error ? err.message : String(err)}\n\n` +
        `多半是中文字形取不到（Google Fonts 的按字子集接口，见 src/utils/googleFontSubset.ts）——\n` +
        `断网、被限流、或者 Google 换了返回格式都会这样。刷新重试；一直不行就先用别的办法出图。\n` +
        `⚠ 这里**刻意不给一张兜底图**：一张豆腐块或者比例不对的默认图发到小红书上，\n` +
        `  就是这条内容在那个平台上的全部样子，而且发出去收不回来。`,
      500
    );
  }
};
