import { entryUrl } from "./getPostPaths";
import config from "@/config";

/**
 * 一条内容的分享卡地址（绝对）。`features.dynamicOgImage` 关着时返回 undefined，
 * 页面就回落到 Layout 的默认图（public/default-og.jpg）。
 *
 * 四个详情页都走这一个函数；地址形状和 `[...slug]/index.png.ts` 那几条路由必须一致 ——
 * 这里拼错一段，分享出去的卡片是 404，而页面上零症状。
 */
export function entryOgImageUrl(
  collection: string,
  id: string,
  filePath: string | undefined,
  locale: string | undefined
): string | undefined {
  if (!config.features.dynamicOgImage) return undefined;
  const path = entryUrl(collection, id, filePath, locale).replace(/\/+$/, "");
  return new URL(`${path}/index.png`, config.site.url).href;
}
