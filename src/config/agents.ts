/**
 * 智能体登记表 —— 「这条内容是**哪个智能体**写的 / 答的」。
 *
 * 【2026-09-20 改成产品档】这张表原来列的是模型（Gemini-3-Pro、GPT-5、Claude Opus 5），
 * 而现在真正在用的是 Codex、Claude、Spark 这类**智能体产品**：同一个产品底下的模型
 * 会换，换了之后答案就不一样。所以标记拆成两维 ——
 * `agent`（这张表：哪个智能体）+ `model`（`src/config/models.ts`：哪个模型）。
 * 站上原来那套「智能体索引」（/ai 三条路由、导航项、按智能体的分支 RSS）一并拆掉了：
 * 标记是给读者看出处的，不是一种组织内容的方式。
 *
 * 【2026-09-20 四个产品，名字带厂商】用户定的四档：Google Spark、OpenAI ChatGPT、
 * Anthropic Claude、OpenAI Codex。`name` 直接就是「厂商 产品」—— OpenAI 有两个产品，
 * 光写 Codex / ChatGPT 分不出是一家的；页面上芯片、问答署名、分享卡、后台下拉框
 * 印的都是这个 `name`。`vendor` 单独留着给悬停提示和将来按厂商分组用，
 * 显示时不再另缀一次（「OpenAI Codex（OpenAI）」是重复）。
 * ★ 模型那张表里的名字**不重复这里的词**：Anthropic Claude 底下是 Opus-5 / Sonnet-5，
 *   不是 Claude Opus 5（见 models.ts 文件头）。
 *
 * ## 为什么是封闭枚举，不是自由文本
 *
 * 问答模块的核心信息之一就是**谁答的**：同一个问题不同智能体给的答案不一样，
 * 这个标记正是读者判断可信度的依据。如果它是自由文本，
 * `Claude Code` / `claude-code` / `ClaudeCode` / `Claude` 会把同一个智能体
 * 拆成四个，而且**任何一处都不报错** —— 屏幕上只是多出几个看起来陌生的名字。
 *
 * 所以这里是一张表，`src/content.config.ts` 用 `z.enum()` 钉着它，
 * `keystatic.config.ts` 的下拉框也直接从它生成 —— 后台能选的和库里认的**永远是同一份**。
 *
 * ## 加一个新智能体
 *
 * 在下面数组里加一行就行，写全 `id` / `name` / `vendor` / `kind`。
 * **`id` 定了就不要再改** —— 它进 frontmatter，改了等于把已经发出去的条目打死。
 * 显示名（`name`）随时可以改，那只影响页面上的字。
 *
 * ## 为什么带 `vendor`
 *
 * 不是为了好看。读者判断"两个答案为什么不一样"时，**同厂不同产品**和
 * **不同厂**是完全不同的两件事：前者多半是产品形态的差异，后者可能是训练数据和
 * 对齐取向的差异。所以厂商是一个独立的字段 —— 哪怕显示名里已经有它。
 *
 * ## 【2026-09-20】数据挪进了 src/data/registry.json，后台「智能体与模型」那一页管
 *
 * AI 产品那几档不再写死在这里：后台加一个智能体就是加一行 JSON（见 registry.ts 文件头）。
 * 这个文件只做三件事：读进来、套上两个哨兵（`unspecified` 排第一、`human` 排最后，
 * 这两档**永远在代码里**，登记表不许碰）、把登记表里的每一条标成 `kind: "ai"`。
 * 登记表验不过（坏 id、重复、碰了哨兵 id）在 import 时就抛，构建直接红。
 *
 * ★ 零 astro import：keystatic.config.ts 在 Astro 之外加载，导入脚本是裸 tsx 跑的。
 */
import { REGISTRY } from "./registry";

/**
 * 这一条**是不是 AI 答的**。封闭枚举，三档。
 *
 * ★ 加这个字段是因为：判"要不要显示『以下是模型的原话』那句提示"不该靠比对
 *   `id === "human"` 这种字面量。字面量散在各处之后，哪天加一个「自建的多步研究
 *   智能体」（是 AI）或者「某位朋友」（不是 AI），就得去翻每一处比对点 ——
 *   而漏掉一处的症状是**页面上对着一段人写的字说"以下是模型的原话"**，即撒谎，
 *   且没有任何报错。语义写进表里，判据只有一处。
 *
 * 【2026-09-20】这一档原来叫 `"model"`。改名是因为"模型"现在是另一维
 * （`src/config/models.ts`），同一个词指两件事迟早有人比错。
 */
export type AgentKind =
  /** AI 智能体答的。要显示"以下是模型原话、可能编数字"那句提示；模型那一格**该填**。 */
  | "ai"
  /** 人自己写的。**完成态** —— 那句提示对它是假话，不许显示；模型那一格**不适用**。 */
  | "human"
  /** 哨兵：还没选 / 没记录。既不是 ai 也不是 human，两者都不能假设。 */
  | "unspecified";

export type AgentEntry = {
  /** 进 frontmatter 的稳定标识。**定了不改。** 小写、连字符。 */
  id: string;
  /** 页面上显示的名字（「厂商 产品」）。随时可改。 */
  name: string;
  vendor: string;
  /** 见 AgentKind。**新增条目必须显式写** —— 没有默认值是刻意的。 */
  kind: AgentKind;
  /** 可选的一句补充，显示在悬停提示里。比如"自建的多步研究智能体"。 */
  note?: string;
  /**
   * 站上画成哪个符号（`src/config/agentIcons.ts` 那张表的 id）。
   *
   * ★ **`undefined` 是「还没挑」那一档**（待补，画成虚线圆 + 名字首字）。
   *   别直接读它分档 —— 走 `agentIconSlot()`，四档只有那一处。
   * ★ 两个哨兵没有这一格：它们的画法（人形 / 问号）由 `kind` 决定，
   *   写死在 agentIcons.ts 里 —— 那是分档，不是一个可以挑的图标。
   */
  icon?: string;
};

export const AGENTS: readonly AgentEntry[] = [
  {
    /**
     * ★ 哨兵档：**「还没选 / 没记录是谁答的」**。在这个数组里必须排第一位
     * （`z.enum` 的默认值落在它上，`registry.test.ts` 钉着）；后台下拉里它排**最后**，
     * 见文件末尾的 `agentOptions()`。
     *
     * 【2026-09-18 实测】Keystatic 的 `fields.select` 的 `defaultValue` 是
     * **必填的、永远有值**（类型定义里没有 `?`，而且 select 完全没有 validation 入参）。
     * 也就是说后台不存在"这个下拉框是空的"这一档 —— 人忘了选，存盘时就会带着
     * 清单里的某一个真实智能体名字写进 frontmatter。
     *
     * 那是**替模型撒谎**：文件上看不出这是默认值还是人挑的，闸门不管、zod 不管、
     * 页面上显示得和真填过的一模一样。比留空糟糕得多 ——
     * 留空至少在屏幕上是「来源未标注」。
     *
     * 这一档的存在就是为了让"还没选"成为一个**显式、能被 schema 拦下来**的状态
     * （qa 的 superRefine：非草稿 + agent 是哨兵 → 直接报错，发不出去）。
     *
     * ★【2026-09-21 用户改了这一条】**后台那一格的默认值不再是哨兵**，而是登记表里
     *   排第一的那个智能体（见下面的 `DEFAULT_AGENT`）。也就是说上面那个代价
     *   ——"文件上看不出这是默认值还是人挑的"—— 是**现在正在付的**，不是被躲开了。
     *   别把它当成已经解决的问题，完整的取舍记在 keystatic.config.ts 那一格的注释里。
     *   哨兵本身一点没变：zod 的默认值、没写这个键的老文件、以及 qa 那条拦截
     *   （拦得住手写的 frontmatter 和导入进来的，拦不住后台建的）都还在它身上。
     */
    id: "unspecified",
    name: "未标注",
    vendor: "—",
    kind: "unspecified",
    note: "还没选，或者没记录是谁答的",
  },
  // ★ AI 产品那几档来自登记表（src/data/registry.json，后台「智能体与模型」页）。
  //   登记表里没有 kind 这一列：能在后台加的**只有 AI 产品**，所以一律 "ai"。
  //   「我自己」和「未标注」不是产品，是分档 —— 它们在这个数组的两头，写死。
  ...REGISTRY.agents.map((a): AgentEntry => ({
    id: a.id,
    name: a.name,
    vendor: a.vendor,
    kind: "ai",
    note: a.note,
    icon: a.icon,
  })),
  {
    /** ★ 这一档是"人自己答的"，不是"忘了填"。
     *  没有这一档的话，人写的回答只能硬套一个智能体名 —— 那是在撒谎；
     *  或者留空 —— 那和"忘了标"字节级相同。 */
    id: "human",
    name: "我自己",
    vendor: "—",
    kind: "human",
    note: "不是 AI 答的，是我自己写的",
  },
];

/**
 * 「还没选 / 没记录」的那个 id。**它是 schema 的默认值，也是 Keystatic 下拉框的默认值。**
 *
 * 判"这条到底标了没有"必须比对这个常量，不许在各处写字面量 `"unspecified"` ——
 * 改一个字母就会变成"哪儿都不报错，只是所有未标注的条目突然被当成标注过了"。
 */
export const UNSPECIFIED_AGENT = "unspecified";

/**
 * 后台「哪个智能体」那一格的**默认值** —— 登记表里排第一的那个 AI 智能体。
 *
 * 【2026-09-21 用户定的】在这之前默认值是哨兵。换掉的理由是手工活：站长每天用的
 * 就是排第一的那个，每建一条内容都要去下拉里点两下。代价（换了智能体忘了改 =
 * 静默标错，而四处全绿）原样记在上面哨兵那一档和 keystatic.config.ts 那一格上。
 *
 * ★ 判的是 `kind === "ai"`，不是"数组的第一项"：第一项是哨兵、最后一项是「我自己」，
 *   两头都不是能拿来当默认值的东西。登记表里一个 AI 智能体都没有时退回哨兵 ——
 *   `fields.select` 在 defaultValue 不在选项里时**直接 throw，整个后台打不开**。
 * ★ 想换默认：在后台「智能体与模型」页把那一行拖到最前。登记表的顺序 = 下拉的顺序 =
 *   默认值，三件事是同一件，别把它们拆开。
 */
export const DEFAULT_AGENT =
  AGENTS.find(a => a.kind === "ai")?.id ?? UNSPECIFIED_AGENT;

// 【2026-09-23】这里原来有一个 `isAiAnswer()`：决定问答要不要挂「以下是模型的原话」。
// 那句话 2026-09-20 从页面挪进了「关于」页，最后一个家是问答的 .md 导出件 ——
// 2026-09-23 导出件改成正文原文（站方一个字都不加），它就没有调用方了，删掉。
// 真要再判"是不是 AI 写的"，读 `findAgent(id)?.kind`（查不到就当"不知道"，别当成 AI）。

/** 给 zod 的 enum 用。**至少两个元素**，否则 z.enum 的类型推断会塌。 */
export const AGENT_IDS = AGENTS.map(a => a.id) as [string, string, ...string[]];

const BY_ID = new Map(AGENTS.map(a => [a.id, a]));

/**
 * 按 id 取一个智能体。
 *
 * ★ **查不到返回 undefined，调用方必须自己处理。**
 *   不许在这里兜一个 `{ name: id }` 的假对象 —— 那会让"登记表里删掉了某个 id
 *   但库里还有用着它的条目"这件事在页面上完全看不出来，而那正是需要有人去处理的状况。
 *   （schema 里的 z.enum 会在构建期先拦住它，这里是第二道。）
 */
export function findAgent(id: string | undefined): AgentEntry | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/**
 * 「谁答的」那个**可见名字**的唯一判据。
 *
 * 三档合成一个字符串（分档本身不变，见 docs/engineering-notes.md 第二节）：
 *   - 登记表里有 → 它的 `name`（"Anthropic Claude" / "我自己"）
 *   - 空 / `unspecified` / **登记表里查不到** → `unspecifiedLabel`（「来源未标注」）
 *
 * ★ 查不到的 id 走"未标注"而不是把 id 印出来：页面上冒出一个假名字，比承认
 *   "我不知道这是谁答的"更糟。那个 id 只进 `AgentModelChip` 的悬停提示，作排查线索。
 *
 * ★ `unspecifiedLabel` 必须由调用方传（`t.qa.unspecifiedAgent`）——
 *   这个文件是纯登记表，不认识 i18n。**不许在这里返回空字符串兜底**：
 *   界面上留白会被读成"这是站方自己写的"，而那是 `human` 那一档。
 *
 * 读它的地方：`src/components/AgentModelChip.astro`（页面上）和分享卡。
 * 两处必须给出同一个名字 —— docs/engineering-notes.md 坑 8 记的就是「同一句断言出现在两处、只改了一处」。
 * （.md 导出端点原来也读它、印在文件头里；【2026-09-23】导出件改成正文原文，不再印。）
 */
export function agentDisplayName(
  id: string | undefined,
  unspecifiedLabel: string
): string {
  if (!id || id === UNSPECIFIED_AGENT) return unspecifiedLabel;
  return findAgent(id)?.name ?? unspecifiedLabel;
}

/**
 * **只要产品名那一段**：`OpenAI ChatGPT` → `ChatGPT`，`Anthropic Claude` → `Claude`。
 *
 * 【2026-09-21 用户要的】发到 X 的那段话（`src/utils/sharePost.ts`）里用它。
 * 理由只有一个：**280 个字的预算**。一组三个智能体的帖子，出处那三行原来是
 * 「OpenAI ChatGPT · GPT-6-Pro：」这种，光名字就吃掉六七十 —— 而那些字
 * 抢的是摘要的位置，摘要才是让人点进来的那一段。
 *
 * ★ 判据是**把开头那个厂商词剪掉**，不是另记一张短名表：显示名的规矩
 *   （「厂商 产品」，见文件头）已经把这件事说清楚了，再开一张表就是同一件事
 *   两处各写一份，而后台加一个智能体时没人会想起来去补第二处。
 * ★ **剪不掉就原样返回**（名字本来就不带厂商、厂商是哨兵 `—`、或者名字和厂商
 *   一模一样）—— 宁可长一点，也不许返回空串：出处那一格空着会被读成"没标"，
 *   而那是另一档（见 `agentDisplayName` 上面那段）。
 *
 * ⚠ 这个短名**只给帖子**。站上的芯片、分享卡仍然印全名 ——
 *   那几处没有字数压力，而「Claude」不说清是哪家的产品。
 */
export function agentProductName(name: string, vendor: string): string {
  const full = name.trim();
  const brand = vendor.trim();
  if (!brand || brand === "—" || full === brand) return full;
  const prefix = `${brand} `;
  if (!full.startsWith(prefix)) return full;
  const rest = full.slice(prefix.length).trim();
  return rest || full;
}

/**
 * 后台下拉框用。`name` 本身就是「厂商 产品」，不再另缀厂商。
 *
 * ★【2026-09-21】哨兵「未标注」在这里挪到了**最后一项**：默认值现在是第一项
 *   （`DEFAULT_AGENT`），而"列表里第一个就是默认选中的那个"必须一眼看得出来。
 * ⚠ 变的只有下拉的顺序。`AGENTS` 数组本身哨兵仍然排第一 —— `AGENT_IDS`（z.enum）、
 *   查表、`registry.test.ts` 钉的都是那个顺序，两处别搞混。
 */
export function agentOptions(): { label: string; value: string }[] {
  const toOption = (a: AgentEntry) => ({ label: a.name, value: a.id });
  return [
    ...AGENTS.filter(a => a.id !== UNSPECIFIED_AGENT).map(toOption),
    ...AGENTS.filter(a => a.id === UNSPECIFIED_AGENT).map(toOption),
  ];
}
