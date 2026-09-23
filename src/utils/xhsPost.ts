/**
 * 发到小红书的那条笔记 —— **标题 ＋ 正文 ＋ 话题标签**。
 *
 * 【2026-09-22 用户要的】封面图有了（`xhsCard.ts`），还差配图旁边那段字。
 *
 * ## ⚠ 不能复用 `/_share` 那套（那是 X 的）
 *
 * 两边的预算**完全不是一回事**，抄过来会得到一段处处别扭的字：
 *
 *   |  | X（`sharePost.ts`） | 小红书（这里） |
 *   |---|---|---|
 *   | 总量 | 280 **加权**（CJK 记 2、链接记 23） | 标题 20 字 ＋ 正文 1000 字，**分开算** |
 *   | 标题 | 没有"标题"这回事，全是一段 | **单独一格，20 字是硬上限** |
 *   | 标签 | 拼在正文里（`#财报`） | **单独一个数组**，不进正文 |
 *   | 模型名 | 剪掉（抢摘要的位置） | **留着**，1000 字根本不紧张 |
 *
 * ★ 所以「模型名不进帖子」那条规矩**只属于 X**。在这儿把它抄过来，就是又一次
 *   "照抄一个不适用的取舍"（卡片那边第四轮刚犯过一次，见 `xhsCard.ts` 的 `voiceRow`）。
 *
 * ## 图上是节选，正文给全
 *
 * 封面卡上每一份的摘要被截到 `XHS_VOICE_DESC_MAX`（62 个码点，两行放得下的量）。
 * 正文这边有 1000 字，**原样给全** —— 图负责让人停下来，正文负责让人看完。
 *
 * ## ⚠ 正文里**不放链接**
 *
 * 落地页地址已经印在封面图上了（`报告全文：https://lwj.ai/r/1009`）。
 * 正文再放一遍是两件坏事：重复，而且小红书对正文里的外链是有风控的。
 * ★ 这是一个**取舍，不是遗漏** —— 想放回去就在 `composeBody()` 里加一行，
 *   但先想清楚它换来的是什么。
 *
 * ★ 零 astro import：`scripts/gate/xhsPost.test.ts` 裸 tsx 测它，
 *   和 `sharePost.ts` / `xhsCardPlan.ts` 同一条纪律。
 */

/**
 * 标题的硬上限。**这个数不是我们定的**，是 `publish_content` 那个工具定的
 * （xiaohongshu-mcp 的文档：title ≤ 20 字）。超了会被平台截或者被接口拒。
 *
 * ⚠ 按**码点**算。小红书自己那一格到底怎么数（中英文是不是等价）没有公开口径，
 *   所以这里**按最严的来**：一个码点算一个。宁可短，不许被对面截。
 */
export const XHS_TITLE_MAX = 20;

/** 正文上限，同样来自那个工具（content ≤ 1000）。 */
export const XHS_BODY_MAX = 1000;

/**
 * 最多几个话题标签。`publish_content` 会把超出的**自己截掉**（文档：tags 最多 10）——
 * 与其让它在那一头悄悄丢，不如在这一头明着截。
 *
 * ⚠ 这个数和卡片上的 `XHS_TAG_LIMIT`（4）、X 的 `SHARE_TAG_LIMIT`（3）**是三个数**，
 *   别合并：一个是接口上限，一个是卡片一行放得下几个，一个是 280 字的预算。
 *   三者恰好都叫"最多几个标签"，但来源互不相干。
 */
export const XHS_TAG_MAX = 10;

/** 组里的一份：谁写的 ＋ 一句话概括。 */
export interface XhsPostVoice {
  /**
   * 「OpenAI ChatGPT（GPT-6-Pro）」—— 和封面卡、和站上那张 AgentModelChip
   * **同一个判据**算出来的整串（调用方的 `bylineOf()`）。
   * 集合没有这一维（教程 / 提示词）时 undefined，那一份只印摘要。
   */
  label?: string;
  description: string;
}

export interface XhsPostSource {
  /** 集合的中文名（研究报告 / 问答 / 教程 / 提示词）。 */
  kindLabel: string;
  title: string;
  /** 这一条讲哪几只票，名字已经从标的表查好。 */
  symbols?: readonly { code: string; name?: string }[];
  /** 组里的几份，新在前（`foldQaGroups()` 排好的）。长度至少 1。 */
  voices: readonly XhsPostVoice[];
  tags?: readonly string[];
  /** YYYY-MM-DD，北京时间。正文末尾那一行用它。 */
  date: string;
}

export interface XhsPost {
  /** ≤ `XHS_TITLE_MAX` 个码点。 */
  title: string;
  /** ≤ `XHS_BODY_MAX` 个码点。 */
  body: string;
  /** 单独传给接口的话题标签，**不在正文里**。 */
  tags: string[];
}

/** 截到 `cap` 个码点，截过的补 `…`（和 `xhsCardPlan.ts` 的 `clipText` 同一副形状）。 */
function clip(text: string, cap: number): string {
  const chars = [...text];
  if (chars.length <= cap) return text;
  if (cap <= 1) return chars.slice(0, cap).join("");
  return `${chars
    .slice(0, cap - 1)
    .join("")
    .replace(/[\s，。；：、,.;:!！?？]+$/, "")}…`;
}

/**
 * 标的那一段：`ZM Zoom` / `ARM · INTC · AMD`。
 *
 * ⚠ **不加 `$` 前缀**。cashtag 是 X 的习惯，小红书上没有这个约定，
 *   一个 `$ZM` 在那边只是一串看不懂的符号（发帖文案那边加 `$` 是对的，
 *   两处的习惯不一样 —— 这正是不该共用一个函数的地方）。
 * ★ 一只票带名字，几只票只列代码 —— 和封面卡同一条理由（名字挤不下，
 *   而多标的时读者要的是"讲了哪几只"）。
 */
export function symbolLine(
  symbols: readonly { code: string; name?: string }[]
): string {
  const list = symbols.filter(s => s.code.trim() !== "");
  if (list.length === 0) return "";
  if (list.length === 1) {
    const only = list[0]!;
    return [only.code.trim(), only.name?.trim()].filter(Boolean).join(" ");
  }
  return list.map(s => s.code.trim()).join(" · ");
}

/**
 * 标题 —— 20 个字里塞什么。
 *
 * 判据只有一条：**印信息最多的那一段，然后截**。
 *
 *   - 标题本身够用 → 就它。
 *   - 标题**就是票代码**（站上真有 `title: ZM` 的研究报告）→ 换成摘要：
 *     那一行的信息量比一个代码大得多，而代码在正文第一行还会再出现。
 *   - 摘要也是空的 → 仍然用标题（一个代码总比空标题强）。
 *
 * ★ 形状和封面卡的 `hookSource` 三档是**一路的**，但**刻意各写一份**：
 *   那边的"冗余"是和**同一张卡上印出来的标的行**比（版面问题），
 *   这边是和**正文第一行**比（另一段版面）。合成一个函数要先把两个"和什么比"
 *   也合并，而它们本来就不是同一件事。
 * ⚠ 两边都变的时候要一起想 —— 但别为此把它们焊在一起。
 */
export function xhsTitle(src: XhsPostSource): string {
  const title = src.title.trim();
  const codes = (src.symbols ?? []).map(s => s.code.trim().toUpperCase());
  const redundant = codes.length > 0 && codes.includes(title.toUpperCase());
  const first = src.voices[0]?.description.trim() ?? "";

  const pick = redundant && first !== "" ? first : title;
  return clip(pick, XHS_TITLE_MAX);
}

/**
 * 正文。形状：
 *
 *     ZM Zoom
 *
 *     OpenAI ChatGPT（GPT-6-Pro）
 *     ZM有现金流和Anthropic资产支撑，但主营仍低增长…
 *
 *     Google Spark（Gemini-3.1-Pro）
 *     当前处于AI新产品预期落地后的动能衰减与短线破位阶段…
 *
 *     ——
 *     研究报告 · 2026-09-21 · 全文见封面图上的网址
 *
 * ★ 每一份**原样给全**（不像封面卡那样截到 62）—— 1000 字够用，
 *   图是钩子、正文是内容。
 * ★ 末尾那一行**指回封面图**，而不是再贴一次链接（见文件头那一节）。
 * ⚠ 真超了 1000 才动手缩，而且**只缩摘要**：标的、名字、落款是认人用的，
 *   缩掉它们等于把这条笔记的出处抹了（和 `sharePost.ts` 的 280 那一节同一条）。
 */
function composeBody(src: XhsPostSource, descriptions: string[]): string {
  const blocks: string[] = [];

  const symbols = symbolLine(src.symbols ?? []);
  if (symbols !== "") blocks.push(symbols);

  src.voices.forEach((v, i) => {
    const label = v.label?.trim() ?? "";
    const desc = descriptions[i] ?? "";
    // 名字和摘要都空的那一份整块不要（印出来是一段空白）。
    if (label === "" && desc === "") return;
    blocks.push([label, desc].filter(Boolean).join("\n"));
  });

  blocks.push(`——\n${src.kindLabel} · ${src.date} · 全文见封面图上的网址`);
  return blocks.join("\n\n");
}

/** 话题标签：去空、去重、截到接口上限。**不进正文**，单独传。 */
export function xhsTags(tags: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  for (const t of tags ?? []) {
    const v = t.trim();
    if (v !== "") seen.add(v);
  }
  return [...seen].slice(0, XHS_TAG_MAX);
}

/**
 * 生成一条笔记。
 *
 * ★ 空数组不兜底 —— 和 `sharePost.ts` 的 `xPostText()` 同一条：兜一个"没有出处的
 *   单条"会让"调用方忘了传"变成一条**看起来正常**的笔记，而它少了这一组里
 *   所有人的名字。宁可红。
 */
export function xhsPost(src: XhsPostSource): XhsPost {
  if (src.voices.length === 0) {
    throw new Error(
      `xhsPost: voices 是空的（${src.kindLabel} / ${src.title}）—— 一组里至少有一份。`
    );
  }

  const full = src.voices.map(v => v.description.trim());
  let body = composeBody(src, full);

  if ([...body].length > XHS_BODY_MAX) {
    // 超了才缩，而且**所有摘要按同一个上限一起缩** —— 谁被砍掉多少不该取决于
    // 谁写得啰嗦（和 sharePost.ts 那边同一条规矩）。
    const longest = Math.max(...full.map(d => [...d].length));
    for (let cap = longest - 1; cap > 0; cap--) {
      body = composeBody(
        src,
        full.map(d => clip(d, cap))
      );
      if ([...body].length <= XHS_BODY_MAX) break;
    }
    // 摘要缩到一个字都不剩还超（名字太多太长）：硬截，保住接口不被拒。
    if ([...body].length > XHS_BODY_MAX) body = clip(body, XHS_BODY_MAX);
  }

  return { title: xhsTitle(src), body, tags: xhsTags(src.tags) };
}
