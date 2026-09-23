import { fontData, experimental_getFontFileURL } from "astro:assets";
import { getFontPathByWeight } from "./getFontPathByWeight";
import {
  fallbackOgPng,
  renderOgCard,
  type MonoFonts,
  type OgCardInput,
} from "./ogCard";
import config from "@/config";

/**
 * 分享卡端点的共用一半：拿等宽字体、画卡、画不出来就回落。
 * 五条路由（四个集合的 `[...slug]/index.png.ts` + `/og.png`）各自只剩 getStaticPaths
 * 和"这张卡上写什么"。
 *
 * ⚠ 不做成"一个工厂返回 getStaticPaths"：docs/engineering-notes.md 坑 11（打包器会把 getStaticPaths
 *   引用的模块级 const 摇掉）。
 */
export async function loadMonoFonts(requestUrl: URL): Promise<MonoFonts> {
  const fonts = fontData["--font-google-sans-code"];
  const regularPath = getFontPathByWeight(fonts, 400);
  const boldPath = getFontPathByWeight(fonts, 700);
  if (regularPath === undefined || boldPath === undefined) {
    throw new Error("Cannot find the font path.");
  }
  const [regular, bold] = await Promise.all([
    fetch(experimental_getFontFileURL(regularPath, requestUrl)).then(r =>
      r.arrayBuffer()
    ),
    fetch(experimental_getFontFileURL(boldPath, requestUrl)).then(r =>
      r.arrayBuffer()
    ),
  ]);
  return { regular, bold };
}

/**
 * 画一张卡；画不出来回落到默认图，**但要说出来**。
 *
 * 两档在字节上不同（一张带标题的卡 / 一张全站共用的图），在构建日志里也必须不同：
 * 回落那一档 console.warn 一行带条目 id 和原因。静默回落 = 坑 6 的另一种形态，
 * 分享出去才看得见。
 */
export async function ogCardResponse(
  input: OgCardInput,
  requestUrl: URL,
  id: string
): Promise<Response> {
  let png: Buffer;
  try {
    png = await renderOgCard(input, await loadMonoFonts(requestUrl));
  } catch (err) {
    // eslint-disable-next-line no-console -- 回落**必须**在构建日志里留一行：静默回落和静默豆腐块是同一种病（docs/engineering-notes.md 坑 6），只有分享出去才看得见。
    console.warn(
      `[og] ${id}：分享卡没画出来，回落到 public/${config.site.ogImage}。` +
        `原因：${err instanceof Error ? err.message : String(err)}`
    );
    png = await fallbackOgPng(config.site.ogImage);
  }
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png" },
  });
}
