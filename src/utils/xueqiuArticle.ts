import type { SocialPlatform } from "@/config/socialPlatforms";
import { cashtagLine, communityFooter } from "@/utils/communityPost";
import { fencedLines } from "../../scripts/content/formatRules";

/**
 * 推到雪球草稿箱的**长文** —— 标题 ＋ markdown 全文，以及**放不下时怎么办**。
 *
 * 【2026-09-23 用户要的】「雪球是有开源项目可以方便的发布长文章的，给我利用起来」。
 * 和 `/_share` 雪球那一块里那段短帖（`communityPost.ts`）是**两样东西**：
 * 那段是摘要 ＋ 链接，给你手动粘成一条「帖子」；这里是**全文**，走 Wechatsync
 * 进雪球的长文草稿箱（`src/dev/xueqiu-draft.ts`）。
 *
 * ## 正文从哪来
 *
 * **不在这儿拼**。每一份的全文是调用方从我们自己的 `.md` 导出端点取回来的
 * （`/r/<号>.md` 那一条，读者下载拿到的就是它），这里原样摆进去 ——
 * 和「复制全文」同一个办法（docs/gate.md 7.5）。截断**只在整节的边界上**，
 * 放进来的那一段仍然是导出件的**逐字节前缀**，一个字不改。
 *
 * ## ★ 标题 = 站上那条的标题，原样（`fitTitle()`）
 *
 * 【2026-09-23 用户定的】「标题就用系统标题」。在这之前是短帖那一份 `communityTitle()`
 * 拼出来的「苹果（AAPL）：<摘要>」，分开推时再缀「 · <谁写的>」—— 第二次真推（AAPL
 * 那一组）三篇全被雪球退回：「输入标题太长，请确认不超过50个字」。
 * ★ 上限跟着平台表（`titleMax`，雪球那一格就是那句原话量出来的 50）。站上最长的标题
 *   今天是 24 个字；那一刀留着是为了**保证存得上**：超了截到上限、末尾一个「…」，
 *   结果那一行会说出来（`titleCut`）。
 * ⚠ 同一组分开推的几篇**标题相同**（都是 `AAPL`）—— 用户要的就是这样；
 *   是谁写的印在每篇页脚第一行，`/_share` 的结果行和账本那一行也各带着名字。
 *
 * ## ★ 雪球单篇上限 2 万字，而且数的是 HTML 全长（2026-09-23 真撞上的）
 *
 * 第一次真推（MU 那一组，两份研究报告合成一篇）雪球回的是
 * 「输入文字太长，请确认不超过20000个字」。量过：那一篇**看得见的字**约 1.6 万（没超），
 * 发过去的 HTML 约 3.2 万 —— 所以它数的是 HTML 全长，连标签一起。
 * 而这个站的研究报告全是表格（每一格多一对 `<td>`），**38 篇里 22 篇单篇就超**。
 *
 * 【用户定的】按下面这个顺序处理（`planDrafts()`）：
 *   1. 合成一篇放得下 → 一篇；
 *   2. 放不下、而且是几份一组 → **每份各推一篇**（合在一起再截，第二个 AI 的那份
 *      会整篇被截掉 —— 那是替它抹掉了出处）。每篇用**它自己的**地址 / 日期 / 标的
 *      （`memberSource()`）；
 *   3. 单份还放不下 → **从头按整节放，放到放不下为止**，末尾写明截掉了哪几节 ＋ 全文链接。
 *      ★ 报告都是「## 一、结论速览」打头，所以从头截结论一定在。
 *   ⚠ **不许截在一节中间**（表格截一半比整节不放更糟），也**不许悄悄截** ——
 *     被截过的和完整的在雪球上必须长得不一样，截掉了什么要说出来（docs/engineering-notes.md 第二节）。
 *   4. 【用户定的第二轮】「正文少很多都行，要保证能上传」：
 *      预算压到 `XUEQIU_BUDGET`，而且雪球**明确说正文太长**时，按更小的预算重排
 *      那一篇再推（`shouldShrink()` / `replan()`）—— 那不是重试，理由在 `shouldShrink()` 上面。
 *
 * ## 形状
 *
 *     $美光科技(MU)$                               ← cashtag，跟平台表走（雪球最多 3 只）
 *
 *     <那一份的全文，原样>                          ← 只有一份时
 *
 *     ## 【OpenAI ChatGPT（GPT-6-Pro）】           ← 几份时每一份前面一个小标题
 *     <全文>
 *
 *     ——
 *     篇幅所限（雪球单篇不超过 2 万字），下面 3 节没放进来：   ← 只在截过时
 *     四、… / 五、… / 六、…
 *     全文（含这 3 节）：https://lwj.ai/r/1031
 *     研究报告 · OpenAI ChatGPT（GPT-6-Pro） · 2026-09-23   ← 只有一份时带上是谁写的
 *     以上为 AI 生成的研究记录，不构成投资建议。
 *
 * ★ 页脚和短帖**同一个** `communityFooter()`。
 * ★ 小标题 / 页脚里那一串是 `bylineOf()` 的**整串**「厂商 产品（模型）」。
 * ⚠ 雪球那个适配器会把**所有标题都压成 h4**、**删掉列表的圆点和序号**、**删掉分隔线**
 *   （读过源码）—— 那是它那一侧的事，这里不去迁就，推完**一定要在草稿里看一眼**再发布。
 *
 * ★ 零 astro import：`scripts/gate/wechatsync.test.ts` 裸 tsx 测它。
 *   量长度的那台渲染器由调用方传进来（`Measure`），测试传一个假的。
 */

/** 雪球单篇上限 —— 来自它的真回话：「输入文字太长，请确认不超过20000个字」。 */
export const XUEQIU_TEXT_MAX = 20_000;

/**
 * 我们自己的预算，按**我们的渲染器**量 HTML 全长（`Measure`）。
 *
 * ★ 实测（2026-09-23，8 篇）：扩展按它适配器的规则渲染出来的，是我们这一份的
 *   0.87～0.97 —— 我们这一份是**上界**。
 * ★【用户定的】「正文少很多都行，要保证能上传」：从 19000 压到 15000 —— 我们的尺子和
 *   它的差到 1.33 倍都还放得下。剩下那点不确定由 `replan()` 兜：雪球真说太长，
 *   就按更小的预算重排那一篇再推。
 * ⚠ **这个数是估的，不是对过的**（同 `SUCCESS_SIGNALS` 那条纪律）。
 */
export const XUEQIU_BUDGET = 15_000;

/** 雪球明确说正文太长之后，同一篇最多再截短几次（每次预算至少降两成）。 */
export const XUEQIU_MAX_SHRINKS = 3;

/** 量一段 markdown 渲染成 HTML 之后有多长。端点传站点那台渲染器，测试传假的。 */
export type Measure = (markdown: string) => Promise<number>;

export interface XueqiuSection {
  /** 「OpenAI ChatGPT（GPT-6-Pro）」。教程 / 提示词没有这一维，undefined。 */
  label?: string;
  /** 那一份的全文，**导出端点原样吐的那一份**。 */
  body: string;
  /** 这一份在站上的 key（`posts/1037`）—— 分开推的时候记账用。 */
  key?: string;
  /**
   * 这一份**自己的**落地页地址 / 日期 / 标的 —— 分开推的时候它自己就是一篇文章
   * （`memberSource()`）。合成一篇时用的是整组那几格。
   * ⚠ **类型上是必填的**，不许改成可选再回落到整组：截过的那篇末尾写着
   *   「全文（含这 N 节）：<地址>」，拿整组的地址（= 代表那一条的页面）去填，
   *   第二份的草稿就指向**第一份的报告** —— 那句话是假的，而四处全绿。
   *   【2026-09-23 写分开推那一版时自己查出来的】
   */
  url: string;
  date: string;
  symbols: readonly { code: string; name?: string }[];
}

export interface XueqiuArticleSource {
  kindLabel: string;
  /** 站上那条的标题（frontmatter 的 `title`）。同一组里是同一个。 */
  title: string;
  symbols?: readonly { code: string; name?: string }[];
  date: string;
  /** 落地页完整地址（页脚那一行，`urlInBody` 为假的平台不印）。 */
  url: string;
  /** 组里的每一份，新在前（`foldQaGroups()` 排好的）。至少一份。 */
  sections: readonly XueqiuSection[];
}

export interface XueqiuArticle {
  title: string;
  markdown: string;
  /** 标题超过平台上限、被截短了才有。 */
  titleCut?: true;
}

/** 截过的话截掉了什么。数的是 `## ` 那一级的节（开头那段引言不算一节）。 */
export interface Truncation {
  kept: number;
  total: number;
  /** 没放进来的那几节的标题，原样。 */
  cut: string[];
}

/** 要推的一篇。 */
export interface XueqiuDraftPlan {
  article: XueqiuArticle;
  /** 这一篇里装的是哪几份（`key`）。合成一篇时是整组。 */
  keys: string[];
  /** 截过才有。 */
  truncated?: Truncation;
  /** 按我们的渲染器量出来的长度（HTML 全长）。 */
  estimate: number;
  /** 这一篇是从哪份输入、按多少预算排出来的 —— 雪球说太长时 `replan()` 拿它重排。 */
  source: XueqiuArticleSource;
  budget: number;
  /** 雪球说太长、截短重排过几次。没有过就没有这一格。 */
  shrinks?: number;
}

/**
 * 按行首的 `## ` 切节 —— **围栏里的不算**（判据是 `formatRules.ts` 那一份 `fencedLines()`，
 * 不在这儿另写：一段示例代码里的 `## ` 不是这篇文章的一节）。
 * 第一节是第一个 `##` 之前那一段（`# 标题` ＋ 引言），可能是空串。
 * ★ `join("\n")` 起来就是原文，一个字节不差（测试钉着）。
 */
export function splitSections(body: string): string[] {
  const lines = body.split("\n");
  const inFence = fencedLines(lines);
  const out: string[] = [];
  let cur: string[] = [];
  lines.forEach((line, i) => {
    if (!inFence[i] && /^## /.test(line)) {
      out.push(cur.join("\n"));
      cur = [];
    }
    cur.push(line);
  });
  out.push(cur.join("\n"));
  return out;
}

/** 一节的标题（`## ` 后面那几个字）；开头那段引言返回空串。 */
export function sectionTitle(section: string): string {
  const m = /^## (.+)$/m.exec(section.split("\n", 1)[0] ?? "");
  return m ? m[1]!.trim() : "";
}

/** 截过的那几行：说清截掉了哪几节、去哪儿看全文。 */
export function truncationNote(t: Truncation, url: string): string[] {
  const lines = [
    `篇幅所限（雪球单篇不超过 ${XUEQIU_TEXT_MAX / 10_000} 万字），下面 ${t.cut.length} 节没放进来：`,
    t.cut.join(" / "),
  ];
  if (url.trim() !== "") {
    lines.push(`全文（含这 ${t.cut.length} 节）：${url.trim()}`);
  }
  return lines;
}

/**
 * 标题：站上那条的标题原样；超过平台上限才截（按码点数，和平台表 `titleMax` 同一个单位）。
 * ★ 截了要说出来（`cut`），不许悄悄截。
 */
function fitTitle(
  raw: string,
  max: number | undefined
): { title: string; cut: boolean } {
  const chars = [...raw.trim()];
  if (max === undefined || chars.length <= max) {
    return { title: chars.join(""), cut: false };
  }
  return { title: `${chars.slice(0, max - 1).join("")}…`, cut: true };
}

export function xueqiuArticle(
  src: XueqiuArticleSource,
  platform: SocialPlatform,
  opts: { truncated?: Truncation } = {}
): XueqiuArticle {
  if (src.sections.length === 0) {
    // 同 communityPost()：兜一个空的，"调用方忘了传"就变成一篇看起来正常的空文章。
    throw new Error(
      `xueqiuArticle: sections 是空的（${src.kindLabel} / ${src.title}）—— 一组里至少有一份。`
    );
  }
  if (platform.mode === "retired") {
    throw new Error(
      `xueqiuArticle: ${platform.name} 已经停用了 —— 不该还有入口走到这儿。`
    );
  }
  /**
   * ⚠ 正文**一个字都没有**的那一份要红，不许推一篇只有页脚的文章上去：
   *   多半是导出端点那一侧出了事（取回来一个空串），而草稿箱里多一篇空壳
   *   是人要自己去删的。
   */
  const empty = src.sections.filter(s => s.body.trim() === "");
  if (empty.length > 0) {
    throw new Error(
      `xueqiuArticle: 有 ${empty.length} 份正文是空的（${src.title}）—— ` +
        `多半是导出端点没取到东西，不推一篇空壳上去。`
    );
  }
  // 标题是用户定的唯一来源；空着就没有东西可用 —— 同空正文，红，不去编一个。
  if (src.title.trim() === "") {
    throw new Error(
      `xueqiuArticle: 标题是空的（${src.kindLabel} / ${src.url}）—— 先去后台把标题填上。`
    );
  }
  const { title, cut: titleCut } = fitTitle(src.title, platform.titleMax);

  const blocks: string[] = [];
  const cash = cashtagLine(src.symbols, platform);
  if (cash !== "") blocks.push(cash);

  const multi = src.sections.length > 1;
  for (const s of src.sections) {
    const body = s.body.trim();
    const label = s.label?.trim();
    /**
     * 只有一份时不挂小标题：那一份就是整篇文章（是谁写的印在页脚，见下面）。
     * ★ 几份时小标题**套一对【】**：每一份自己的正文里也有 `##`（「1. 最重要的新催化」
     *   那些），和这个小标题**同一级** —— 不套的话，读的人分不清"这里换了一个 AI 在答"
     *   和"这是同一个回答的第 2 节"，而雪球那边还会把所有标题压成 h4，更分不清。
     *   【2026-09-23 在隔离副本里真推了一篇、看载荷看出来的】
     * ⚠ 不许改成去降正文里的标题层级：那就是改了正文，和读者下载的不再逐字节相同。
     */
    blocks.push(multi && label ? `## 【${label}】\n\n${body}` : body);
  }

  /**
   * 页脚。
   * ★ 只有一份时把「是谁写的」印进第一行：站上每一条都有那张「智能体（模型）」芯片，
   *   雪球上没有 —— 不印的话读者只看得到一句「AI 生成」，不知道是哪个、什么模型。
   *   【2026-09-23 第一次真推时发现的】几份时每份的小标题已经带着，不重复。
   *   （标题换成站上的标题之后，分开推的几篇只剩这一行分得出是谁写的。）
   * ★ 截过的话，全文链接由截断那几行带（写明含哪几节），页脚里就不再印一遍。
   *   ⚠ 那个地址同样是正文里的外链，**跟着平台表的 `urlInBody` 走**，和页脚那一行同一格 ——
   *   平台不许正文带链接的话，截断那几行只说截掉了什么、不印地址。
   */
  const single =
    src.sections.length === 1 ? src.sections[0]!.label?.trim() : "";
  const footerSrc = {
    kindLabel: single ? `${src.kindLabel} · ${single}` : src.kindLabel,
    date: src.date,
    url: opts.truncated ? "" : src.url,
  };
  const footer = [
    ...(opts.truncated
      ? truncationNote(opts.truncated, platform.urlInBody ? src.url : "")
      : []),
    ...communityFooter(footerSrc, platform),
  ];
  blocks.push(`——\n\n${footer.join("\n\n")}`);

  return {
    title,
    markdown: `${blocks.join("\n\n")}\n`,
    ...(titleCut ? { titleCut: true as const } : {}),
  };
}

/**
 * 单份放不下时，从头按整节放 —— 放到放不下为止。
 * @throws 连开头那段加第一节都放不下（实测 25 篇超长的里没有这种，真撞上就要人来看）。
 */
async function fitOne(
  src: XueqiuArticleSource,
  platform: SocialPlatform,
  measure: Measure,
  budget: number
): Promise<XueqiuDraftPlan> {
  const section = src.sections[0]!;
  const keys = section.key ? [section.key] : [];
  const whole = xueqiuArticle(src, platform);
  const wholeLen = await measure(whole.markdown);
  if (wholeLen <= budget) {
    return { article: whole, keys, estimate: wholeLen, source: src, budget };
  }

  const parts = splitSections(section.body);
  const titled = parts.filter(p => sectionTitle(p) !== "").length;
  if (titled === 0) {
    // 和下面那句"第一节太大"是两件事：这一篇根本没有能按整节截的地方。
    throw new Error(
      `「${src.title}」超了雪球的 ${XUEQIU_TEXT_MAX} 字，而正文里没有 \`## \` 那一级的节` +
        `可以按整节截 —— 一个字都没推。这一篇要人来看。`
    );
  }
  let best: XueqiuDraftPlan | undefined;
  // parts[0] 是 `##` 之前那段引言；至少要带上第一节（结论速览）才算一篇。
  for (let k = 2; k < parts.length; k++) {
    const kept = parts.slice(0, k);
    const truncated: Truncation = {
      kept: kept.filter(p => sectionTitle(p) !== "").length,
      total: titled,
      cut: parts.slice(k).map(sectionTitle).filter(Boolean),
    };
    const article = xueqiuArticle(
      { ...src, sections: [{ ...section, body: kept.join("\n") }] },
      platform,
      { truncated }
    );
    const len = await measure(article.markdown);
    if (len > budget) break;
    best = { article, keys, truncated, estimate: len, source: src, budget };
  }
  if (!best) {
    throw new Error(
      `「${src.title}」连开头加第一节都放不下（按我们的尺子预算 ${budget}）—— ` +
        `一个字都没推。这一篇要人来看（多半是第一节里有一张特别大的表）。`
    );
  }
  return best;
}

/** 一份单独推的时候，它自己就是一篇文章：地址、日期、标的都用它自己的。 */
export function memberSource(
  src: XueqiuArticleSource,
  s: XueqiuSection
): XueqiuArticleSource {
  return {
    ...src,
    url: s.url,
    date: s.date,
    symbols: s.symbols,
    sections: [s],
  };
}

/**
 * 这一组要推成**几篇、每篇装什么**。顺序和理由见文件头「雪球单篇上限」那一节。
 * `budget` 平时就是 `XUEQIU_BUDGET`；雪球说太长之后 `replan()` 传更小的。
 */
export async function planDrafts(
  src: XueqiuArticleSource,
  platform: SocialPlatform,
  measure: Measure,
  budget: number = XUEQIU_BUDGET
): Promise<XueqiuDraftPlan[]> {
  const keys = src.sections.map(s => s.key).filter((k): k is string => !!k);
  const full = xueqiuArticle(src, platform);
  const fullLen = await measure(full.markdown);
  if (fullLen <= budget) {
    return [{ article: full, keys, estimate: fullLen, source: src, budget }];
  }
  const plans: XueqiuDraftPlan[] = [];
  for (const s of src.sections) {
    plans.push(await fitOne(memberSource(src, s), platform, measure, budget));
  }
  return plans;
}

/**
 * 雪球退回来的那句话说的是**哪一格太长**。两句真回话（2026-09-23，原样）：
 *   「输入标题太长，请确认不超过50个字」 / 「输入文字太长，请确认不超过20000个字」。
 *
 * ⚠【当天踩到的】第一版只认「太长」两个字（`isTooLongError()`），测试里只喂过正文那一句 ——
 *   结果 AAPL 那三篇明明是**标题**太长，页面上印的却是「正文预算估少了、把
 *   XUEQIU_BUDGET 往下调」，把人往错的方向带。认不出是哪一格就返回 undefined，**不猜**。
 */
export function lengthRejection(text: string): "title" | "body" | undefined {
  if (!/太长|不超过\s*\d+\s*个?字/.test(text)) return undefined;
  if (/标题/.test(text)) return "title";
  if (/文字|正文|内容/.test(text)) return "body";
  return undefined;
}

/**
 * 这一篇被退回来之后，要不要**截短一点再推一次**。
 *
 * ★ 这**不是重试**。端点不重试的理由是"超时的那一次可能已经存上了"；而这里只认一种回话：
 *   `failed` ＋ 雪球那句「文字太长」—— 雪球**拒收**了，一次 `draft/save.json` 被拒就是
 *   什么都没存，再推的是**更短的另一篇**，草稿箱里不会多出一份。
 *   超时 / 看不懂 / 别的失败 / 标题太长一律不重推。
 * ★ 同一篇最多截 `XUEQIU_MAX_SHRINKS` 次：雪球连着几次都说太长，说明我们的尺子和它的
 *   差得比预想的多，接着一轮一轮地推只是在它门口转悠 —— 停下来让人看。
 */
export function shouldShrink(
  result: { tier: string; detail: string; raw?: string },
  plan: XueqiuDraftPlan
): boolean {
  return (
    result.tier === "failed" &&
    lengthRejection(`${result.detail} ${result.raw ?? ""}`) === "body" &&
    (plan.shrinks ?? 0) < XUEQIU_MAX_SHRINKS
  );
}

/**
 * 雪球说这一篇正文太长之后，按更小的预算把它重排。
 * ★ 新预算**至少降两成，而且一定小于被拒那一篇的长度** —— 所以重排出来的一定更短
 *   （整节整节地少），不会原样再推一遍。合成的那一篇会拆成每份各一篇（同 `planDrafts()` 第 2 步）。
 * @throws 再小就连第一节都放不下了（`fitOne()` 那一句）
 */
export async function replan(
  plan: XueqiuDraftPlan,
  platform: SocialPlatform,
  measure: Measure
): Promise<XueqiuDraftPlan[]> {
  const budget = Math.min(Math.floor(plan.budget * 0.8), plan.estimate - 1);
  const next = await planDrafts(plan.source, platform, measure, budget);
  return next.map(p => ({ ...p, shrinks: (plan.shrinks ?? 0) + 1 }));
}
