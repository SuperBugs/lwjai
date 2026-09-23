import type { APIRoute } from "astro";
import { ogCardResponse } from "@/utils/ogEndpoint";
import config from "@/config";

/**
 * 站点默认的分享卡，`/og.png`。
 *
 * ★ 上游这条路由**没有**跟着 `dynamicOgImage` 开关走（文章那条 index.png.ts 有）。
 *   关掉动态 OG 之后它照样生成，2026-09-18 那会儿生成的是一张满屏豆腐块的图
 *   （字体没有中文字形），挂在 /og.png 上等着哪天被人链过去。守卫照抄 index.png.ts。
 *
 * 【2026-09-20】画法换成 ogCard.ts 那套（中文字形按字取子集），这张图从此能看了。
 * 不过 Layout 的默认图仍然是 public/default-og.jpg（resolveDefaultOgImagePath：
 * 静态文件存在时优先用它）。这条路由只是别把一张坏图挂在公网上。
 */
export const GET: APIRoute = async context => {
  if (!config.features.dynamicOgImage) {
    return new Response(null, { status: 404, statusText: "Not found" });
  }

  return ogCardResponse(
    {
      title: config.site.description,
      siteTitle: config.site.title,
      host: new URL(config.site.url).hostname,
    },
    context.url,
    "og.png"
  );
};
