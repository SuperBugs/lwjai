import satori from "satori";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildCssUrl,
  extractFontFaces,
  GOOGLE_FONT_FAMILY,
  LEGACY_UA,
  SATORI_FORMATS,
  uniqueChars,
} from "./googleFontSubset";

/**
 * 分享卡（OG 图）：一张 1200×630 的卡，站名 + 类型 + 标的 + 标题 + 谁答的 + 日期。
 *
 * ## 中文字形从哪来（docs/engineering-notes.md 坑 6 的解法）
 *
 * 不进仓库塞一套 8MB 的中文字体。构建期按**这张卡上真正出现的那几十个字**去 Google Fonts
 * 取一个子集（`googleFontSubset.ts`，实测两种字重 6KB 上下），缓存在
 * node_modules/.astro/og-fonts 下。Cloudflare 的构建机本来就要访问 Google Fonts
 * （astro.config.ts 的 fonts 配置在构建期拉 Google Sans Code），没有新增依赖。
 *
 * ## 画不出来就抛，调用方回落 —— 不许豆腐块
 *
 * 网络、限流、Google 改了格式，任何一种失败这里都**抛 OgFontError**，
 * `ogEndpoint.ts` 接住之后回落到 public/default-og.jpg 并在构建日志里说一声。
 * 静默回落和静默豆腐块是同一种病：分享出去才看得见。
 *
 * ## 为什么这个文件不 import `astro:*`
 *
 * 等宽字体（Google Sans Code）来自 Astro 的 fontData，只有端点里拿得到，
 * 所以它作为参数传进来。这个文件本身只依赖 satori / sharp / node —— 将来要给它写
 * 一条离线测试（喂一份缓存好的字体），不用起 Astro。
 */

export type OgCardInput = {
  title: string;
  /** 集合的短标签：研究 / 问答 / 教程 / 提示词。站点默认卡不传。 */
  kindLabel?: string;
  siteTitle: string;
  /** 左下角的小字：lwj.ai。 */
  host: string;
  /**
   * 这一条讲哪几只票。【2026-09-22】从 `symbol` + `symbolName` 两格换成一串 ——
   * 一条问答可以讲好几只（名字由调用方从标的表查好再传进来）。
   *
   * ★ **名字只在一只票时印**（见 `OG_SYMBOL_LIMIT` 那一段）：三只票各带一个公司名
   *   会把眉题行挤爆，而卡是缩略图不是清单。这不是把档压掉 —— 名字在落地页上一个不少。
   */
  symbols?: { code: string; name?: string }[];
  /** 谁答的 / 谁写的。 */
  byline?: string;
  /** YYYY-MM-DD。 */
  date?: string;
};

export type MonoFonts = { regular: ArrayBuffer; bold: ArrayBuffer };

export class OgFontError extends Error {}

const WEIGHTS = [400, 700] as const;
const CACHE_DIR = join(process.cwd(), "node_modules", ".astro", "og-fonts");
const FETCH_TIMEOUT_MS = 15_000;

/**
 * 和 theme.css 浅色那一组同一套值：分享卡也是这个站的脸。
 *
 * ★【2026-09-22】导出了 —— 小红书封面图（`xhsCard.ts`）读的是**同一份**。
 *   两张卡各写一套色值的话，改了主题只改一处，站上两种分享图从此是两个色调，
 *   而页面、构建、闸门四处全绿。
 */
export const COLORS = {
  page: "#f5f5f7",
  card: "#ffffff",
  border: "#d2d2d7",
  fg: "#1d1d1f",
  muted: "#6e6e73",
};

async function fetchOk(url: string, headers: Record<string, string>) {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new OgFontError(
      `${res.status} ${res.statusText}，地址：${url.slice(0, 100)}`
    );
  }
  return res;
}

const toArrayBuffer = (buf: Buffer): ArrayBuffer =>
  buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength
  ) as ArrayBuffer;

/**
 * 这几个字的中文字体子集，两种字重。按字集缓存；任何一步失败抛 OgFontError。
 */
export async function loadCjkSubset(
  text: string
): Promise<{ weight: number; data: ArrayBuffer }[]> {
  const chars = uniqueChars(text);
  const key = createHash("sha256")
    .update(`${GOOGLE_FONT_FAMILY}|${WEIGHTS.join(",")}|${chars}`)
    .digest("hex")
    .slice(0, 24);
  const cachePaths = WEIGHTS.map(w => join(CACHE_DIR, `${key}-${w}.font`));

  if (cachePaths.every(p => existsSync(p))) {
    return WEIGHTS.map((weight, i) => ({
      weight,
      data: toArrayBuffer(readFileSync(cachePaths[i]!)),
    }));
  }

  const css = await (
    await fetchOk(buildCssUrl(GOOGLE_FONT_FAMILY, WEIGHTS, chars), {
      "User-Agent": LEGACY_UA,
    })
  ).text();
  const faces = extractFontFaces(css);

  const result: { weight: number; data: ArrayBuffer }[] = [];
  for (const weight of WEIGHTS) {
    const face = faces.find(f => f.weight === weight);
    if (!face) {
      throw new OgFontError(
        `Google Fonts 的 CSS 里没有字重 ${weight}（拿到 ${faces.length} 个 @font-face）`
      );
    }
    if (!SATORI_FORMATS.has(face.format)) {
      throw new OgFontError(
        `拿到的是 ${face.format}，satori 不认。UA 没起作用？`
      );
    }
    result.push({
      weight,
      data: await (await fetchOk(face.url, {})).arrayBuffer(),
    });
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  result.forEach((r, i) => writeFileSync(cachePaths[i]!, Buffer.from(r.data)));
  return result;
}

type Node = {
  type: string;
  props: { style?: Record<string, unknown>; children?: unknown };
};

/** satori 的规矩：有多个子节点的容器必须 display: flex。这个助手顺手过滤掉 false / undefined。 */
const el = (
  type: string,
  style: Record<string, unknown>,
  children?: unknown
): Node => ({
  type,
  props: {
    style,
    children: Array.isArray(children) ? children.filter(Boolean) : children,
  },
});

const chip = (style: Record<string, unknown>, children: unknown) =>
  el(
    "div",
    {
      display: "flex",
      alignItems: "baseline",
      gap: "14px",
      border: `3px solid ${COLORS.border}`,
      borderRadius: "14px",
      padding: "6px 20px",
      fontSize: "30px",
      ...style,
    },
    children
  );

/**
 * 眉题行上最多摆几张标的芯片。多出来的收成一张「+N」。
 *
 * ★ 卡是 1200×630 的**缩略图**：眉题行还并排着类型芯片，四五张代码排过去就顶到
 *   标题的位置，而 satori 不会换行提醒你 —— 它直接画出去、裁掉。
 *   收成「+N」的那一档至少还说了"这一条不止这几只"，而裁掉的那一档
 *   看起来就像那几只票根本不存在。
 */
export const OG_SYMBOL_LIMIT = 3;

/**
 * 标的芯片：一只一张。
 * ★ **名字只在只有一只票时印**（见 `OgCardInput.symbols`）—— 多只票各带一个公司名
 *   会把这一行挤爆，而名字在落地页上一个都没少。
 */
function symbolChips(symbols: { code: string; name?: string }[]): unknown[] {
  const shown = symbols.slice(0, OG_SYMBOL_LIMIT);
  const rest = symbols.length - shown.length;
  const chips: unknown[] = shown.map(s =>
    chip({}, [
      el(
        "span",
        {
          fontFamily: "Google Sans Code",
          fontWeight: 700,
          letterSpacing: "0.04em",
        },
        s.code
      ),
      symbols.length === 1 &&
        s.name &&
        el("span", { color: COLORS.muted }, s.name),
    ])
  );
  if (rest > 0) {
    chips.push(chip({ color: COLORS.muted }, el("span", {}, `+${rest}`)));
  }
  return chips;
}

export function ogCardTree(input: OgCardInput): Node {
  const titleSize =
    input.title.length > 34 ? 44 : input.title.length > 22 ? 50 : 58;

  return el(
    "div",
    {
      width: "100%",
      height: "100%",
      display: "flex",
      background: COLORS.page,
      padding: "44px",
      fontFamily: GOOGLE_FONT_FAMILY,
      color: COLORS.fg,
    },
    el(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        background: COLORS.card,
        border: `3px solid ${COLORS.border}`,
        borderRadius: "28px",
        padding: "48px 60px",
      },
      [
        // 眉题行：类型芯片 + 标的芯片（几只票就几张）。和站上卡片的眉题同一个顺序。
        el("div", { display: "flex", alignItems: "center", gap: "18px" }, [
          input.kindLabel &&
            chip({ fontWeight: 700 }, el("span", {}, input.kindLabel)),
          ...symbolChips(input.symbols ?? []),
        ]),
        // 标题：最多三行，超出截断。
        el(
          "div",
          {
            display: "flex",
            flexGrow: 1,
            alignItems: "center",
            padding: "24px 0",
          },
          el(
            "div",
            {
              // ⚠ `display: "block"` 是**承重的**：satori 的 `lineClamp` 在默认的
              //   flex 容器上一声不响地不生效（实测：写 2 行照样渲染 5 行，
              //   退出码 0、图照出）。少了这一行，长标题不会被截成三行 ——
              //   它会往下顶、被卡片边缘切掉，而构建全绿。
              //   （这条是 2026-09-22 做小红书封面卡时在 satori 上量出来的，
              //    那边 `src/utils/xhsCard.ts` 两处同理，`xhsCard.test.ts` 的 B4
              //    钉着"有 lineClamp 就必须有 display: block"。）
              display: "block",
              fontSize: `${titleSize}px`,
              fontWeight: 700,
              lineHeight: 1.32,
              lineClamp: 3,
            },
            input.title
          )
        ),
        // 底行：左边站名 + 域名，右边谁答的 + 日期。
        el(
          "div",
          {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          },
          [
            el("div", { display: "flex", flexDirection: "column" }, [
              el(
                "span",
                { fontSize: "40px", fontWeight: 700 },
                input.siteTitle
              ),
              el(
                "span",
                {
                  fontFamily: "Google Sans Code",
                  fontSize: "24px",
                  color: COLORS.muted,
                  marginTop: "6px",
                },
                input.host
              ),
            ]),
            el(
              "div",
              {
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                fontSize: "26px",
                color: COLORS.muted,
              },
              [
                input.byline && el("span", {}, input.byline),
                input.date &&
                  el(
                    "span",
                    { fontFamily: "Google Sans Code", marginTop: "6px" },
                    input.date
                  ),
              ]
            ),
          ]
        ),
      ]
    )
  );
}

/** 画一张卡。中文子集取不到会抛 OgFontError，调用方决定回落。 */
export async function renderOgCard(
  input: OgCardInput,
  mono: MonoFonts
): Promise<Buffer> {
  // 子集要覆盖卡上**每一个**经中文字体渲染的字：标题、站名、类型、公司名、署名，
  // 以及它们里面的英文和数字（Noto Sans SC 自带拉丁字形，走这一路省得两套字体混排对不齐基线）。
  const cjk = await loadCjkSubset(
    [
      input.siteTitle,
      input.kindLabel,
      input.title,
      // 公司名（只有一只票时才画，但子集多取几个字不要紧 —— 少取才会变豆腐块）。
      ...(input.symbols ?? []).map(s => s.name),
      input.byline,
    ]
      .filter(Boolean)
      .join("")
  );

  const svg = await satori(
    ogCardTree(input) as unknown as Parameters<typeof satori>[0],
    {
      width: 1200,
      height: 630,
      embedFont: true,
      fonts: [
        ...cjk.map(f => ({
          name: GOOGLE_FONT_FAMILY,
          data: f.data,
          weight: f.weight as 400 | 700,
          style: "normal" as const,
        })),
        {
          name: "Google Sans Code",
          data: mono.regular,
          weight: 400,
          style: "normal",
        },
        {
          name: "Google Sans Code",
          data: mono.bold,
          weight: 700,
          style: "normal",
        },
      ],
    }
  );

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** 回落图：public/ 下那张静态图转成 PNG（路由是 .png，字节也得是 PNG，别让内容类型和扩展名打架）。 */
export async function fallbackOgPng(publicFile: string): Promise<Buffer> {
  return sharp(join(process.cwd(), "public", publicFile))
    .png()
    .toBuffer();
}
