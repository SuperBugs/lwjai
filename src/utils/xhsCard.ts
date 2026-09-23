import satori from "satori";
import sharp from "sharp";
import { GOOGLE_FONT_FAMILY } from "./googleFontSubset";
import { COLORS, loadCjkSubset, type MonoFonts } from "./ogCard";
import {
  moreVoicesLabel,
  planXhsCard,
  xhsCardText,
  DESC_LINE_HEIGHT,
  HOOK_DESC_GAP,
  HOOK_LINE_HEIGHT,
  VOICE_LINE_HEIGHT,
  VOICE_NAME_GAP,
  VOICE_NAME_LINE_HEIGHT,
  XHS_HEIGHT,
  XHS_CARD_PAD_X,
  XHS_DESC_LINES,
  XHS_PAGE_PAD,
  XHS_VOICE_GAP,
  XHS_VOICE_LINES,
  XHS_WIDTH,
  type XhsCardPlan,
  type XhsCardSource,
} from "./xhsCardPlan";

/**
 * 小红书封面图 —— 一张 1080×1440（3:4）的竖卡，画出来就能发。
 *
 * 判据一条都不在这个文件里，全在 `xhsCardPlan.ts`（纯函数、零依赖、有单测）。
 * 这里只有两件事：**怎么摆**，和**字形从哪来**。
 *
 * ## 中文字形（和分享卡同一条路，docs/engineering-notes.md 坑 6 的解法）
 *
 * satori 只认 TTF / OTF / WOFF，而一套中文字体 8MB 起。所以按**这张卡上真正出现的
 * 那几十个字**去 Google Fonts 取子集（`googleFontSubset.ts`），缓存复用
 * `ogCard.ts` 的 `loadCjkSubset()` —— 两张卡共用一个缓存目录和一份取字逻辑。
 *
 * ## ⚠ 这张卡取不到字体时**不许回落，必须抛**
 *
 * 这是它和分享卡（`ogEndpoint.ts`）**刻意不一样**的一处，别顺手抄过去：
 *
 *   - 分享卡回落到 `public/default-og.jpg` 是对的 —— 那是挂在 `<meta>` 里的缩略图，
 *     页面本身好好的，一张通用图只是少了点信息。
 *   - 这张卡**自己就是全部内容**。一张豆腐块（□□□□）或者一张比例不对的默认图
 *     发到小红书上，就是这条内容在那个平台上的全部样子，而且**发出去收不回来**。
 *     悄悄给一张"看起来能用"的图，比给不出图坏得多。
 *
 * 所以这里让 `loadCjkSubset()` 的 `OgFontError` 原样往上抛，`/_xhs/card.png`
 * 接住之后回 500 + 一句人话，页面上那一格画成红框。
 * 「图出来了 / 出不来（红框 ＋ 原因）/ 还在转」三档在屏幕上长得不一样。
 */

type Node = {
  type: string;
  props: { style?: Record<string, unknown>; children?: unknown };
};

/** satori 的规矩：有多个子节点的容器必须 `display: flex`。顺手滤掉 false / undefined。 */
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

const row = (style: Record<string, unknown>, children?: unknown) =>
  el("div", { display: "flex", ...style }, children);

const col = (style: Record<string, unknown>, children?: unknown) =>
  el("div", { display: "flex", flexDirection: "column", ...style }, children);

/** 一条细横线。卡上只有两条：眉题下面、落款上面。 */
const rule = (style: Record<string, unknown> = {}) =>
  el("div", { height: "3px", background: COLORS.border, ...style });

/** 等宽那一路（代码、日期、域名）。中文走 Noto Sans SC，见 `cjkStrings()`。 */
const MONO = "Google Sans Code";

/**
 * 几份那一档里的**一份**，画成两行：
 *
 *     OpenAI ChatGPT（GPT-6-Pro）     ← 小、灰：谁说的
 *     上涨仍在加速，退潮尚未确认。      ← 大、正文色：说了什么
 *
 * ★【2026-09-22 第四轮改成两行】原来是一行 `ChatGPT：<摘要>`：名字只有产品名
 *   （模型名被 `sharePost.ts` 那条 280 字预算剪掉了，而这张卡根本没有那个约束）、
 *   摘要和名字同号还是灰的。用户报的三件事 ——「模型要写上去 / 空白太多 /
 *   摘要要明显」—— 在这个形状上一起解决了。
 * ★ 两格都是 `display: "block"` ＋ `lineClamp`：少了 block 那个 clamp 是死的
 *   （实测，见 xhsCardPlan.ts 的 XHS_HOOK_LINES）。
 */
function voiceRow(
  v: { label?: string; description: string },
  plan: XhsCardPlan
): Node {
  return col({ width: "100%" }, [
    /**
     * 名字那一行：「OpenAI ChatGPT（GPT-6-Pro）」。小、灰 —— 它是**出处**。
     * ⚠ 挤不下就截一行补省略号，**不许折行**：折了的话它会把底下那段摘要
     *   往下推，而每一份的高度是按"名字一行"算进预算的（B1）。
     */
    v.label &&
      el(
        "div",
        {
          display: "block",
          fontSize: `${plan.voiceNameFontSize}px`,
          lineHeight: VOICE_NAME_LINE_HEIGHT,
          color: COLORS.muted,
          lineClamp: 1,
        },
        v.label
      ),
    /**
     * 摘要：大、**正文色**。
     * ★【2026-09-22 第四轮】原来它和名字同号、还是灰的 —— 主次是反的。
     *   名字是"谁说的"，摘要才是让人读下去的那一段（用户：「摘要也要明显」）。
     */
    el(
      "div",
      {
        display: "block",
        marginTop: v.label ? `${VOICE_NAME_GAP}px` : "0px",
        fontSize: `${plan.voiceSize}px`,
        lineHeight: VOICE_LINE_HEIGHT,
        color: COLORS.fg,
        lineClamp: XHS_VOICE_LINES,
      },
      v.description
    ),
  ]);
}

/** 卡的结构。纯函数、不碰 I/O —— `xhsCard.test.ts` 的 C 组直接遍历它数格子。 */
export function xhsCardTree(plan: XhsCardPlan): Node {
  return el(
    "div",
    {
      width: "100%",
      height: "100%",
      display: "flex",
      background: COLORS.page,
      padding: `${XHS_PAGE_PAD}px`,
      fontFamily: GOOGLE_FONT_FAMILY,
      color: COLORS.fg,
    },
    col(
      {
        width: "100%",
        height: "100%",
        background: COLORS.card,
        border: `3px solid ${COLORS.border}`,
        borderRadius: "40px",
        padding: `56px ${XHS_CARD_PAD_X}px`,
      },
      [
        // ── 眉题：这是什么 + 什么时候 ────────────────────────────────
        row({ justifyContent: "space-between", alignItems: "baseline" }, [
          el(
            "span",
            { fontSize: "38px", fontWeight: 700, letterSpacing: "0.02em" },
            plan.kindLabel
          ),
          el(
            "span",
            { fontSize: "32px", fontFamily: MONO, color: COLORS.muted },
            plan.date
          ),
        ]),
        rule({ marginTop: "22px" }),

        // ── 标的：一只票带名字，两只以上只印代码（判据在 planXhsCard） ──
        plan.symbols.length > 0 &&
          row(
            {
              marginTop: "44px",
              alignItems: "baseline",
              flexWrap: "wrap",
              gap: "26px",
            },
            [
              // 字号由 plan 给：主标题让位那一档这一行顶上去当主视觉
              // （`SYMBOL_FONT_SIZE_LEAD`）。⚠ 别在这儿写死 —— B7 钉着。
              ...plan.symbols.map(s =>
                row({ alignItems: "baseline", gap: "14px" }, [
                  el(
                    "span",
                    {
                      fontSize: `${plan.symbolSize}px`,
                      fontFamily: MONO,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                    },
                    `$${s.code}`
                  ),
                  s.name &&
                    el(
                      "span",
                      {
                        fontSize: `${Math.round(plan.symbolSize * 0.84)}px`,
                        color: COLORS.muted,
                      },
                      s.name
                    ),
                ])
              ),
              // 放不下的那几只印成 `+2` —— 静默丢掉的话，"讲了三只"和
              // "讲了五只、卡上放不下两只"在读者眼里一模一样。
              plan.moreSymbols > 0 &&
                el(
                  "span",
                  { fontSize: "34px", color: COLORS.muted },
                  `+${plan.moreSymbols}`
                ),
            ]
          ),

        // ── 主角那一格：占满中间，上下居中 ──────────────────────────
        col(
          {
            flexGrow: 1,
            justifyContent: "center",
            padding: "44px 0",
          },
          [
            // 主标题。`hookSource: "none"`（几份 ＋ 标题冗余）那一档整个不画。
            plan.hook !== "" &&
              el(
                "div",
                {
                  // ★ `display: "block"` 是**承重的**：satori 里 lineClamp 在默认的
                  //   flex 容器上一声不响地不生效（实测 lineClamp: 2 照出 5 行），
                  //   而多出来的行会顶穿卡片、被边缘切掉，退出码照样是 0。
                  //   理由和实测记录在 xhsCardPlan.ts 的 XHS_HOOK_LINES 上面。
                  display: "block",
                  fontSize: `${plan.hookSize}px`,
                  fontWeight: 700,
                  lineHeight: HOOK_LINE_HEIGHT,
                  // 几份那一档收到 3 行（底下那几行要地方）——
                  // 判据在 planXhsCard 一处，别在这儿再判一次 multi。
                  lineClamp: plan.hookLines,
                },
                plan.hook
              ),
            // 一份那一档：主标题底下一段灰字。
            plan.description !== "" &&
              el(
                "div",
                {
                  display: "block", // 同上，承重。
                  marginTop: `${HOOK_DESC_GAP}px`,
                  fontSize: `${plan.descSize}px`,
                  lineHeight: DESC_LINE_HEIGHT,
                  // ★【2026-09-22 第四轮】原来是 muted 的小灰字。用户：「摘要也要明显」——
                  //   这一段是让人读下去的内容，不是脚注。
                  color: COLORS.fg,
                  lineClamp: XHS_DESC_LINES,
                },
                plan.description
              ),
            // 几份那一档：一行一个「ChatGPT：概括」。
            plan.voices.length > 0 &&
              col(
                {
                  marginTop: plan.hook === "" ? "0px" : `${HOOK_DESC_GAP}px`,
                  gap: `${XHS_VOICE_GAP}px`,
                },
                [
                  ...plan.voices.map(v => voiceRow(v, plan)),
                  plan.moreVoices > 0 &&
                    el(
                      "span",
                      {
                        fontSize: `${plan.voiceNameFontSize}px`,
                        color: COLORS.muted,
                      },
                      moreVoicesLabel(plan.moreVoices)
                    ),
                ]
              ),
          ]
        ),

        // ── 标签 ────────────────────────────────────────────────────
        plan.tags.length > 0 &&
          row(
            {
              flexWrap: "wrap",
              gap: "20px",
              marginBottom: "30px",
              fontSize: "30px",
              color: COLORS.muted,
            },
            plan.tags.map(t => el("span", {}, `#${t}`))
          ),

        rule(),

        /**
         * ── 落款：左边「报告全文：」＋ 落地页地址，右边谁写的 ───────────
         *
         * ★【2026-09-22 用户要的】左边原来是「牢玩家 / lwj.ai」两行。
         *   换掉的理由是小红书**不给外链、也不能点**：一个站名加一个光秃秃的域名，
         *   读者还得自己猜这一篇在哪儿。印完整地址他才抄得走 ——
         *   站名没丢，它在地址里（`lwj.ai`）。
         * ★ 地址用等宽（`MONO`）：一串 ASCII 走中文字体会字距不匀，而这一行
         *   是要给人**照着敲**的。
         *
         * ⚠【2026-09-23】`plan.url` 是 `undefined` 时**这两行整块不画** ——
         *   目标平台不许图里带外链（小红书那条导流细则针对的就是这个，判据在
         *   `src/config/socialPlatforms.ts` 的 `urlOnCard`）。
         *   ★ 落款那一格**照画**：它不是外链，而且没有它这张卡就没有出处了。
         */
        row(
          {
            marginTop: "26px",
            width: "100%",
            justifyContent: plan.url ? "space-between" : "flex-end",
            alignItems: "baseline",
            gap: "24px",
          },
          [
            plan.url
              ? el(
                  "span",
                  { flexShrink: 0, fontSize: "30px", color: COLORS.muted },
                  plan.fullTextLabel
                )
              : null,
            /**
             * ⚠ 落款和地址**不许摆在同一行的两端**（第一版就是那样，真渲出来
             *   当场撞车）：「回答全文：/ https://lwj.ai/q/1028」左边是两行，
             *   右边的「OpenAI ChatGPT（GPT-6-Pro）」折了行之后 `Pro）`
             *   **直接压在地址上**，而 satori 不报错、退出码 0。
             *   现在落款和**标签那行**同一层，地址独占一整行。
             * ★ 还是收窄那一方（`flexShrink: 1` ＋ `minWidth: 0` ＋ `lineClamp: 1`）：
             *   真遇到一个特别长的名字，它会被截成省略号，**而不是去压地址**。
             *   地址是这张卡唯一的行动指令，别的都得给它让路。
             */
            plan.byline &&
              el(
                "div",
                {
                  display: "block",
                  flexShrink: 1,
                  minWidth: 0,
                  textAlign: "right",
                  fontSize: "28px",
                  color: COLORS.muted,
                  lineClamp: 1,
                },
                plan.byline
              ),
          ]
        ),
        plan.url
          ? el(
              "span",
              {
                marginTop: "8px",
                fontSize: "36px",
                fontFamily: MONO,
                fontWeight: 700,
                letterSpacing: "0.01em",
              },
              plan.url
            )
          : null,
      ]
    )
  );
}

/**
 * 画一张卡。中文子集取不到会抛 `OgFontError` —— **这里不接**，见文件头那一节。
 */
export async function renderXhsCard(
  source: XhsCardSource,
  mono: MonoFonts
): Promise<Buffer> {
  const plan = planXhsCard(source);
  const cjk = await loadCjkSubset(xhsCardText(plan).join(""));

  const svg = await satori(
    xhsCardTree(plan) as unknown as Parameters<typeof satori>[0],
    {
      width: XHS_WIDTH,
      height: XHS_HEIGHT,
      embedFont: true,
      fonts: [
        ...cjk.map(f => ({
          name: GOOGLE_FONT_FAMILY,
          data: f.data,
          weight: f.weight as 400 | 700,
          style: "normal" as const,
        })),
        {
          name: MONO,
          data: mono.regular,
          weight: 400 as const,
          style: "normal" as const,
        },
        {
          name: MONO,
          data: mono.bold,
          weight: 700 as const,
          style: "normal" as const,
        },
      ],
    }
  );

  return sharp(Buffer.from(svg)).png().toBuffer();
}
