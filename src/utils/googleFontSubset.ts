/**
 * Google Fonts 的**按字子集**接口 —— 给分享卡（OG 图）取中文字形用。
 *
 * ## 为什么能解决 docs/engineering-notes.md 坑 6
 *
 * satori 只认 TTF / OTF / WOFF，而一套完整的中文字体 8MB 起，不可能进仓库；
 * Google Fonts 的 CSS 接口有一个 `text=` 参数：只返回**这几个字**的子集
 * （实测 20 个汉字两种字重 6KB 上下），正是 vercel/og 处理 CJK 的做法。
 * 每篇稿子的标题就那几十个字，构建期按篇取一次、缓存在 node_modules/.astro 下。
 *
 * ## 两件必须知道的事
 *
 *   1. **UA 决定格式。** 现代浏览器的 UA 会拿到 woff2，satori 不认。要用一个老 UA
 *      （下面 `LEGACY_UA`），Google 会退回给 woff / ttf。这一条实测过（2026-09-20）。
 *   2. **取不到就回落，不许豆腐块。** 网络、限流、格式变了 —— 任何一种失败都让
 *      调用方拿到 null，然后用 public/default-og.jpg 顶上。一张所有页共用的静态图，
 *      比一张满屏 □□□□ 好得多（坑 6 那次是后者，而且构建全绿）。
 *
 * 这个文件只管**拼地址、解析 CSS**，不发请求 —— 零依赖，裸 tsx 测得了
 * （`scripts/gate/googleFontSubset.test.ts`）。真正的取和缓存在 `ogCard.ts`。
 */

export const GOOGLE_FONT_FAMILY = "Noto Sans SC";

/** 老式 UA：Google 据此给 woff（而不是 satori 不认的 woff2）。 */
export const LEGACY_UA =
  "Mozilla/5.0 (Windows NT 6.1; rv:5.0) Gecko/20100101 Firefox/5.0";

/** 去重、去空白、按码点排序 —— 同一批字无论顺序如何都得到同一个缓存键。 */
export function uniqueChars(...texts: string[]): string {
  const set = new Set<string>();
  for (const t of texts)
    for (const ch of t ?? "") if (!/\s/u.test(ch)) set.add(ch);
  return [...set].sort().join("");
}

export function buildCssUrl(
  family: string,
  weights: readonly number[],
  text: string
): string {
  const fam = `${family.replaceAll(" ", "+")}:wght@${[...weights].sort((a, b) => a - b).join(";")}`;
  return `https://fonts.googleapis.com/css2?family=${fam}&text=${encodeURIComponent(text)}`;
}

export type FontFace = { weight: number; url: string; format: string };

/** 从 Google 返回的 CSS 里抠出每个字重的字体文件地址。解析不到就是空数组。 */
export function extractFontFaces(css: string): FontFace[] {
  const faces: FontFace[] = [];
  for (const block of css.split("@font-face").slice(1)) {
    const weight = /font-weight:\s*(\d+)/.exec(block)?.[1];
    const src = /src:\s*url\(([^)]+)\)\s*format\(['"]([^'"]+)['"]\)/.exec(
      block
    );
    if (!weight || !src) continue;
    faces.push({ weight: Number(weight), url: src[1]!, format: src[2]! });
  }
  return faces;
}

/** satori 认的格式。woff2 不在里面 —— 拿到它说明 UA 没起作用。 */
export const SATORI_FORMATS = new Set(["truetype", "opentype", "woff"]);
