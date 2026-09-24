import type { SocialPlatform } from "@/config/socialPlatforms";

/**
 * 发到**股票社区**（雪球 / 富途牛牛）的那一篇 —— 标题 ＋ 正文。
 *
 * 【2026-09-23 用户定的】小红书停用之后换的两个落点。
 *
 * ## ★ 为什么这两家能共用一份，而 X 和小红书不能
 *
 * 这个仓库已经因为"照抄一个不适用的取舍"栽过两次（封面卡抄了 `sharePost.ts` 的
 * `agentProductName()`、小红书那份文案差点抄它的标签拼法），所以这一条要写明白：
 * （小红书那一列是历史：`xhsPost.ts` 2026-09-23 随小红书一起删了，留着这一列是为了记住差在哪。）
 *
 *   |  | X（`sharePost.ts`） | 小红书（已删） | 雪球 / 富途（这里） |
 *   |---|---|---|---|
 *   | 总量 | 280 **加权** | 标题 20 ＋ 正文 1000 | **长文原生**（雪球标题 50，服务端原话） |
 *   | 载体 | 一段字 | **图**，字是配图说明 | 字，图是插图 |
 *   | 外链 | 正常 | **风控红线**（图里也算） | 正常 |
 *   | 代码 | `$ZM` cashtag | 没有这种约定 | **`$名(代码)$` 会连到个股讨论区** |
 *   | 分发 | 话题标签 | 话题标签 | **靠 `$代码$`**，不靠标签 |
 *
 * ★ 雪球和富途在**每一行上都同档**：长文、外链正常、靠 cashtag 分发。
 *   差的只有两处参数（代码怎么写、标题上限多少），那是 `SocialPlatform`
 *   表里的两格，不是两套取舍。所以它们共用，而上面那两列不共用。
 *
 * ## ⚠ 这里**不发话题标签**
 *
 * 不是漏了：雪球 / 富途的分发靠 `$代码$` **关联到个股讨论区**，这比话题标签
 * 有效得多；而这两家的话题语法我没有官方依据，编一个出来最好的结果也只是
 * 一串没人点得动的字。条目上的标签在落地页上一个不少。
 *
 * ★ 零 astro import：`scripts/gate/communityPost.test.ts` 裸 tsx 测它。
 */

/** 组里的一份：谁写的 ＋ 它那段摘要。 */
export interface CommunityVoice {
  /** 「OpenAI ChatGPT（GPT-6-Pro）」，判据是调用方的 `bylineOf()`。 */
  label?: string;
  description: string;
}

export interface CommunityPostSource {
  /** 集合的中文名（研究报告 / 问答 / 教程 / 提示词）。 */
  kindLabel: string;
  title: string;
  symbols?: readonly { code: string; name?: string }[];
  /** 组里的几份，新在前。长度至少 1。 */
  voices: readonly CommunityVoice[];
  /** YYYY-MM-DD，北京时间。 */
  date: string;
  /** 落地页完整地址。`urlInBody` 为假的平台不会用到它。 */
  url: string;
}

export interface CommunityPost {
  title: string;
  body: string;
  /**
   * 标题那一格**超了平台上限没有**。`undefined` = 这个平台没有已知上限。
   * ★ 单独一格而不是直接截：这一段是**人手动粘**的，超了人粘之前自己改；
   *   而且富途那个 80 是**猜的**（`calibrated: false`）—— 拿一个没核过的数去截真标题，
   *   是把推测当成事实在改内容。雪球那个 50 是服务端原话，这里照样只报不截。
   */
  titleOver?: number;
}

/**
 * 标的那一行：`$Zoom(ZM)$` / `$苹果 (AAPL.US)$ $英伟达 (NVDA.US)$`。
 *
 * ★ 写法完全交给平台表里那个 `cashtag()` —— 两家不一样，而且富途那份
 *   **是反推的**（见 `socialPlatforms.ts`）。这儿一个字都不许自己拼。
 * ⚠ `symbolLimit` 是 `undefined` 时**全印，不截**：那表示"不知道上限"，
 *   不是"不限"，但**不知道就不许断言** —— 截掉的代价是少一条关联，
 *   而多印的代价只是多出来那个不变蓝（雪球官方：超出部分不生成有效链接）。
 */
export function cashtagLine(
  symbols: readonly { code: string; name?: string }[] | undefined,
  platform: SocialPlatform
): string {
  const write = platform.cashtag;
  if (!write) return "";
  const list = (symbols ?? []).filter(s => s.code.trim() !== "");
  const kept =
    platform.symbolLimit === undefined
      ? list
      : list.slice(0, platform.symbolLimit);
  return kept.map(s => write(s.code, s.name)).join(" ");
}

/**
 * 标题。
 *
 * ★ 「标题**就是票代码**（站上真有 `title: ZM` 的研究报告）→ 换成摘要」这一条
 *   和原来小红书那份 `xhsTitle()`（2026-09-23 删了）结论相同，**理由却不同**，所以当时各写一份：
 *   那边是 20 个字的预算问题（一个代码把整格占了），这边预算宽得多
 *   （雪球 50、富途 80）—— 这边的理由是**信息量**：一篇叫「ZM」的帖子谁也看不出
 *   讲了什么，而紧跟着的 cashtag 那一行已经把代码说了一遍。
 * ⚠【2026-09-23】这一条只管 `/_share` 上那段**手动粘**的短帖。推到雪球草稿箱的长文
 *   用的是站上的标题原样（用户定的，见 `xueqiuArticle.ts` 文件头）—— 两处不是同一个判据，
 *   别把这一个接过去。超了平台上限这里**只报**（`titleOver`），人粘之前自己改。
 * ⚠ 合成一个函数的话，得先把"和什么比冗余"也合并，而那是两件事。
 */
export function communityTitle(src: CommunityPostSource): string {
  const title = src.title.trim();
  const codes = (src.symbols ?? []).map(s => s.code.trim().toUpperCase());
  const redundant = codes.length > 0 && codes.includes(title.toUpperCase());
  const first = src.voices[0]?.description.trim() ?? "";
  if (!redundant || first === "") return title;

  /**
   * ⚠ **回落时要把票名带上**，不能光把摘要原样搬过来。
   *   【2026-09-23 在浏览器里看出来的】雪球 / 富途的标题和正文是两个独立输入框，
   *   而正文第一份的摘要**就是这一句** —— 原样搬的话屏幕上是一模一样的两行，
   *   看着像复读。带上名字之后它才像个标题，而且多了一维信息。
   * ★ 只取第一只票：标题不是清单，`$代码$` 那一行会把几只都列全。
   */
  const lead = (src.symbols ?? []).find(s => s.code.trim() !== "");
  if (!lead) return first;
  const name = lead.name?.trim();
  const code = lead.code.trim().toUpperCase();
  return `${name ? `${name}（${code}）` : code}：${first}`;
}

/**
 * 正文。形状：
 *
 *     $Zoom(ZM)$
 *
 *     OpenAI ChatGPT（GPT-6-Pro）
 *     ZM有现金流和Anthropic资产支撑，但主营仍低增长…
 *
 *     Google Spark（Gemini-3.1-Pro）
 *     当前处于AI新产品预期落地后的动能衰减与短线破位阶段…
 *
 *     ——
 *     研究报告 · 2026-09-23
 *     全文：https://lwj.ai/r/1009
 *     以上为 AI 生成的研究记录，不构成投资建议。
 *
 * ★ 每一份摘要**原样给全，一个字不截**：这两家是长文平台，而截断正是
 *   小红书那种图片载体逼出来的取舍。
 * ★ 链接、免责各自跟着平台表走 —— 都不是这儿的判断。
 */
export function communityBody(
  src: CommunityPostSource,
  platform: SocialPlatform
): string {
  const blocks: string[] = [];

  const cash = cashtagLine(src.symbols, platform);
  if (cash !== "") blocks.push(cash);

  for (const v of src.voices) {
    const label = v.label?.trim() ?? "";
    const desc = v.description.trim();
    // 名字和摘要都空的那一份整块不要（印出来是一段空白）。
    if (label === "" && desc === "") continue;
    blocks.push([label, desc].filter(Boolean).join("\n"));
  }

  blocks.push(`——\n${communityFooter(src, platform).join("\n")}`);

  return blocks.join("\n\n");
}

/**
 * 页脚那几行：`研究报告 · 2026-09-23` / `全文：<地址>` / 免责。
 *
 * ★ 抽出来是因为**雪球长文**（`xueqiuArticle.ts`）也要印同一个页脚 ——
 *   【2026-09-23】在那之前它只活在上面这个函数里，长文那边要么抄一份、要么没有。
 *   抄一份的那天，就是短帖和长文一个带免责、一个不带，而四处全绿（坑 8 的形态）。
 * ★ 链接和免责**各自跟着平台表走**（`urlInBody` / `disclaimer`），不是这儿的判断。
 */
export function communityFooter(
  src: Pick<CommunityPostSource, "kindLabel" | "date" | "url">,
  platform: SocialPlatform
): string[] {
  const footer = [`${src.kindLabel} · ${src.date}`];
  if (platform.urlInBody && src.url.trim() !== "") {
    footer.push(`全文：${src.url.trim()}`);
  }
  if (platform.disclaimer) footer.push(platform.disclaimer);
  return footer;
}

/**
 * 生成一篇。
 *
 * ★ 空数组不兜底（同 `xPostText()`）：兜一个"没有出处的单条"
 *   会让"调用方忘了传"变成一篇**看起来正常**的帖子，而它少了这一组里所有人的名字。
 * ★ `retired` 的平台**直接抛**：那一档在页面上根本不该有入口，真走到这儿
 *   说明接线漏了 —— 而它的症状会是"照常生成一篇发到一个已经停用的平台"。
 */
export function communityPost(
  src: CommunityPostSource,
  platform: SocialPlatform
): CommunityPost {
  if (src.voices.length === 0) {
    throw new Error(
      `communityPost: voices 是空的（${src.kindLabel} / ${src.title}）—— 一组里至少有一份。`
    );
  }
  if (platform.mode === "retired") {
    throw new Error(
      `communityPost: ${platform.name} 已经停用了（${platform.modeWhy ?? ""}）——` +
        `不该还有入口走到这儿。`
    );
  }

  const title = communityTitle(src);
  const over =
    platform.titleMax !== undefined && [...title].length > platform.titleMax
      ? [...title].length - platform.titleMax
      : undefined;

  return {
    title,
    body: communityBody(src, platform),
    titleOver: over,
  };
}
