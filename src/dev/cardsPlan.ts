import type { SocialPlatform } from "@/config/socialPlatforms";

/**
 * 图片卡片那一页（`/_cards`）、出图那条接口（`/_cards/card.png`）和 `/_share` 上那两个
 * 「图片卡片」链接的判据 —— 纯函数、零 astro import（`scripts/gate/xhsCard.test.ts` 裸 tsx 测它）。
 *
 * 【2026-09-23 用户要的】「小红书不要了，但是之前的图片生成逻辑还是要的，发到富途有时候
 * 我要发图片卡片」。卡本身一个像素没改（`src/utils/xhsCard.ts` / `xhsCardPlan.ts` ——
 * 文件名还叫 xhs 是历史原因，它们最早是给小红书做的），变的是**给谁出**：
 * 原来是小红书一家，现在是平台表里还在发的每一家（雪球 / 富途牛牛）。
 *
 * ★ 卡片上唯一跟着平台走的一格是**左下角印不印完整网址**（`urlOnCard`）——
 *   小红书那条导流细则（「图片里含站外链接」违规）针对的就是这一格，所以它不是卡片自己的属性
 *   （见 `socialPlatforms.ts` 文件头）。
 */

/** 那一页的地址。`astro.config.ts` 里 injectRoute 写的是字面量，测试拿两边对账。 */
export const CARDS_ROUTE = "/_cards";

/** 出图那条接口。 */
export const CARD_PNG_ROUTE = `${CARDS_ROUTE}/card.png`;

/**
 * 一张卡的图片地址。★ **一定带平台**：同一组内容给两个平台出的卡可能不一样
 * （印不印网址），`/_share` 上雪球那一块和富途那一块各自带自己的 id。
 */
export function cardPngUrl(
  collection: string,
  slug: string,
  platformId: string
): string {
  const q = new URLSearchParams({ c: collection, s: slug, p: platformId });
  return `${CARD_PNG_ROUTE}?${q.toString()}`;
}

/** 下载下来叫什么。带站名前缀，一堆图混在下载目录里还认得出是哪个站的（`牢玩家-r1039.png`）。 */
export function cardFileName(
  siteTitle: string,
  urlPrefix: string | null,
  slug: string
): string {
  return `${siteTitle}-${urlPrefix ?? ""}${slug}.png`;
}

/**
 * `?p=` → 给哪个平台出卡。三档：
 *   - 没给（`null` / 空串）→ 默认平台（表里第一个还在发的）；
 *   - 给了、而且是还在发的那几家之一 → 就是它；
 *   - 给了但**不认识 / 已经停用** → `undefined`，调用方说人话（接口回 400、页面画一句）。
 * ⚠ 第三档**不许悄悄回落到默认平台**：回落的方向正好是危险的那一边 —— 拿一个
 *   "不许图里带链接"的平台去要卡，拿回来一张印着网址的（默认平台允许），
 *   发出去就是小红书那次的形状，而屏幕上一切正常。
 */
export function pickCardPlatform(
  p: string | null,
  active: readonly SocialPlatform[],
  fallback: SocialPlatform
): SocialPlatform | undefined {
  const id = (p ?? "").trim();
  if (id === "") return fallback;
  return active.find(a => a.id === id);
}
