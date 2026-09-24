/**
 * 小红书封面图 —— 「这张卡上每一格印什么」的**纯判据**。
 *
 * 【2026-09-22 用户要的】小红书发帖的载体是图片，不是文字。`/_share` 那一页解决的是
 * 「发到 X 的那段话」，这一份解决的是「发到小红书的那张图」—— 两者是同一个工作流的
 * 两半，入口挨着放（后台左侧菜单）。
 *
 * ## 为什么判据要单独成一个零依赖的文件
 *
 * 真正画图那一半（`xhsCard.ts`）要 import satori 和 sharp，那是两个几十 MB、
 * 带原生二进制的包。把"标题该多大字号""公司名印不印"这些判断混在里面，
 * 等于让每一条用例都先把 libvips 装起来。这里一个 astro / satori import 都没有，
 * `scripts/gate/xhsCard.test.ts` 裸 tsx 直接加载 —— 和 `sharePost.ts` 同一条纪律。
 *
 * ## 卡上每一个字节都必须是**闸门扫过的**（docs/gate.md 7.5）
 *
 * 这是一条新的内容出站通道：图片离开这台机器、发到一个公开平台上，而且
 * **图片里的字没有任何下游能再检查一遍**（.md 还能被搜、被 diff，PNG 里的字不能）。
 * 按 7.5 那一节的判据走一遍 —— 「这条通道吐的字节，是不是闸门扫过的那些字节？」：
 *
 *   | 卡上这一格 | 从哪来 | 谁扫的 |
 *   |---|---|---|
 *   | 标题 / 摘要 / 标签 | 条目 frontmatter | `scripts/gate/inspect.ts` 的白名单 |
 *   | 公司名 | `src/data/symbols.json` | `SCANNED_DATA_FILES`，三道闸 |
 *   | 智能体名 / 模型名 | `src/data/registry.json` | 同上 |
 *   | 集合名 / 日期 / 站名 / 域名 | 代码里的常量 | 站方自己写死的话 |
 *
 * ★ 所以下面那个 `XhsCardSource` 是一张**白名单**，不是 `entry.data`。
 *   哪天有人图省事把整个 `data` 塞进来，闸门不扫的字段（`author`、将来新加的任何
 *   自由文本格）就会被画进一张图里发出去，而页面、构建、闸门四处全绿 ——
 *   那正是 7.5「前提二」记下来的那个形态。`xhsCard.test.ts` 的 A 组钉着这件事。
 * ★ 另一条前提（7.5「前提一」）在调用方：**草稿不许出图**。草稿没有公开地址，
 *   一张印着草稿内容的图发出去，站上找不到对应的页面。端点和页面都走
 *   `getSortedPosts()`，`xhsCard.test.ts` 的 E 组钉着。
 */
import { symbolKey } from "../config/symbol";

/**
 * 1080×1440，也就是 3:4。
 *
 * ★ 小红书的推荐比例就是 3:4 —— 它在信息流里占的竖向面积最大。1:1 和 4:3 也能发，
 *   但同样一张卡在流里小一圈。这个数字是**成品像素**，不是排版单位：下面所有
 *   字号、间距都是按 1080 宽量出来的，改尺寸就得回来重量一遍字号分档。
 */
export const XHS_WIDTH = 1080;
export const XHS_HEIGHT = 1440;

/** 页底留白 + 卡片内边距。字号分档是按这两个数算出来的可用宽度推的，见 `CONTENT_WIDTH`。 */
export const XHS_PAGE_PAD = 36;
export const XHS_CARD_PAD_X = 76;

/** 标题和摘要真正能用的宽度。`xhsTitleSize()` 的四档全是从这个数除出来的。 */
export const CONTENT_WIDTH = XHS_WIDTH - 2 * XHS_PAGE_PAD - 2 * XHS_CARD_PAD_X;

/**
 * 主标题 / 摘要各自最多几行 —— satori 的 `lineClamp`，超出补省略号。
 *
 * ## ⚠ 这两个数只有配上 `display: "block"` 才算数（实测出来的）
 *
 * 【2026-09-22 实测】satori 里 `lineClamp` **在默认的 flex 容器上完全没有效果**：
 * 写 `lineClamp: 2` 照样渲染 5 行，一声不响。加上 `display: "block"` 才生效
 * （截到 2 行并补上 `…`）。两种写法**渲染都成功、退出码都是 0**，差别只有
 * 图上多出来的那几行 —— 而多出来的那几行会顶穿卡片。
 * ★ 所以 `xhsCard.ts` 里那**五处** `display: "block"`（主标题、一份那档的摘要、
 *   几份那档每一份的名字和摘要、页脚那行落款）是**承重的**，不是排版习惯。`xhsCard.test.ts` 的 B4
 *   钉着"有 lineClamp 的地方必须同时有 display: block"，连数量一起钉。
 * ⚠ 同一个形态在 `src/utils/ogCard.ts` 里也有一处（分享卡标题的 `lineClamp: 3`，
 *   同样没有 display: block，所以同样是死的）。那是 2026-09-20 就在的，
 *   不在这次的改动范围里 —— 记在这儿，别以为那边有保障。
 *
 * ## 数字怎么来的
 *
 * 见 `HOOK_AREA_BUDGET`：两块的最坏高度加起来必须落在中间那块可用高度里。
 */
export const XHS_HOOK_LINES = 5;
/**
 * 几份那一档主标题只给 2 行 —— 底下那几行要地方。
 * 【2026-09-22 第四轮从 3 收到 2】摘要放大之后每一份占两行大字，主标题再占三行
 * 就顶穿了（B1 当场算红）。这一档的主标题是**组的标签**，不是内容本身
 * —— 内容在底下那几行里，所以收得起。
 *
 * ★ 这个数是**算出来的，不是审美**：主标题最坏 60px × 1.28 × 5 行 = 384px，
 *   加上那几行「谁 + 概括」就顶穿 `HOOK_AREA_BUDGET`（810）——
 *   **卡片会被切掉一截，而 satori 不报错**（两次都是 B1 当场算红的，
 *   不是事后想到的：第一次收到 3 行，第四轮摘要放大之后又收到 2 行）。
 * ★ 收得起是因为这一档的主标题**只可能是标题**（摘要上位那一档只在一份时出现），
 *   而底下那几行本来就带着内容 —— 标题在这里是组的标签，不是唯一的信息源。
 */
export const XHS_HOOK_LINES_MULTI = 2;
export const XHS_DESC_LINES = 3;

/**
 * 中间那块（主标题 + 摘要）能用的高度，单位 px。
 *
 * ★ **是从真实渲染量出来的，不是推的**：1440 高减掉页底留白 2×36、卡片内边距
 *   2×56，再减掉眉题 / 横线 / 标的行 / 标签行 / 落款那些固定构件，
 *   中间剩下大约 810。留了余量，因为标的行在多只票时会换行。
 * ⚠ 调大 `XHS_HOOK_LINES` / `XHS_DESC_LINES` / 字号分档之前先看 B1：
 *   那条按最坏情况把两块的高度加起来和这个数比。顶穿了不会报错 ——
 *   satori 照常出图，只是字被卡片边缘切掉一截。
 */
export const HOOK_AREA_BUDGET = 810;

/**
 * 中间那块的排版数值。**渲染和测试读同一份** —— 在 `xhsCard.ts` 的样式里
 * 另写一个字面量，B1 那条算出来的就不是实际会渲染的高度，而它照样是绿的。
 */
export const HOOK_LINE_HEIGHT = 1.28;
export const DESC_LINE_HEIGHT = 1.6;

/**
 * 一份那一档摘要的字号 —— **跟着主标题走**，不是一个固定值。
 *
 * 【2026-09-22 第四轮】固定 44px 的时候，短标题那几张卡是这样的：标题两行、
 * 摘要两行，然后**底下一大片白**（用户原话「有很多的空白」）。
 * 标题短 → 字号大 → 说明这一条内容本来就短，那摘要也该跟着放大去吃那块地方；
 * 标题长 → 字号小 → 版面本来就紧，摘要不能再抢。
 *
 * ★ 比例 ＋ 下限，**不是一张新的分档表**：分档表已经有一张了（`HOOK_SIZE_TIERS`），
 *   再开第二张就是两处各自演化。
 * ⚠ 调这两个数之前看 B1：它对**每一档主标题**都算一遍这里的结果。
 */
export const DESC_HOOK_RATIO = 0.62;
export const DESC_FONT_MIN = 40;

export function descSizeFor(hookSize: number): number {
  return Math.max(DESC_FONT_MIN, Math.round(hookSize * DESC_HOOK_RATIO));
}
/** 主标题和摘要之间那道空。 */
export const HOOK_DESC_GAP = 36;

/**
 * 卡上最多印几只票。
 *
 * ★ 问答那一格是**多选**（「CPU 为什么暴涨」同时讲 ARM / INTC / AMD），
 *   所以这里必须有个上限。多出来的印成 `+2` —— **不许静默丢掉**：
 *   「这篇讲了三只票」和「这篇讲了五只票，卡上放不下两只」在读者眼里
 *   是两件事，而后者悄悄消失的话没有任何人会发现。
 */
export const XHS_SYMBOL_LIMIT = 3;

/**
 * 卡上最多挂几个标签。
 *
 * ⚠ 这个数**刻意和 `sharePost.ts` 的 `SHARE_TAG_LIMIT`（3）不一样**，不是漏改。
 *   那个 3 是 280 字的**预算**——标签抢的是摘要的位置，写在那个常量上面。
 *   这张卡上标签独占一行，不和任何东西抢地方，所以按"一行放得下几个"来定。
 *   两个数字将来各改各的；把它们合成一个常量才是错的（一个排版约束
 *   和一个字数预算恰好相等，那是巧合，不是同一件事）。
 */
export const XHS_TAG_LIMIT = 4;

/** 摘要最多几个码点。34px 字在 856 宽里一行约 25 个字，四行 100 —— 留一点余量。 */
export const XHS_DESC_MAX = 88;

/* ── 几份折成一张卡时，那几行「谁 + 说了什么」 ─────────────────────────
 *
 * 【2026-09-22 用户要的】「内容只有一个模型的摘要，要像 X 发帖一样有多个模型的回答，
 * 字体小一点没关系」。所以同一个问题 / 同一个选题的几份**折成一张卡**，
 * 一行一个智能体 —— 和 `sharePost.ts` 那段发到 X 的话同一个形状。
 *
 * ★ 这**推翻了这张卡最初「刻意不折叠」的设计**，而且推翻得有道理：当初不折的
 *   理由是"一张卡只能印代表那条的落款，等于替另外两个智能体认领 / 抹掉出处"。
 *   现在**每一行自己带着名字**，那个反对意见就不成立了 —— 折叠反而比原来更准确。
 *   （原来的设计和它的理由记在 `src/dev/cards.astro` 文件头，别当成漏改。）
 * ★ 归组的钥匙**不在这里**：调用方用 `foldQaGroups()` 折好再喂进来，和列表卡片、
 *   详情页那排切换、`/_share` 同一把（`related.ts` 的 `qaGroupKey()`）。
 *   在这儿另写一套"标题一样就算一组"是同一个判据的第二份拷贝。
 */

/**
 * 卡上最多列几份。多出来的印成「还有 N 份」—— **不许静默丢掉**
 * （和标的那个 `+N` 同一条理由）。
 *
 * ★【2026-09-22 第四轮，从 4 收到 3】用户说「有很多的空白…字体也可以大一点，
 *   摘要也要明显」。摘要要放大，那每一份占的地方就变大 —— 4 份 × 大字排不进
 *   中间那块（B1 会当场算红）。收到 3 之后 2～3 份那几张卡的摘要能用到
 *   48～60px，而站上今天最多就是 3 份。第 4 份没有消失，它在「还有 N 份」那一行。
 */
export const XHS_VOICE_LIMIT = 3;

/** 每一份的摘要最多几个码点。40px 字在 856 宽里一行约 21 个，两行 42；
 *  小字那档能到 60。取 62 让小字那档不被无谓截短，大字那档交给 lineClamp。 */
export const XHS_VOICE_DESC_MAX = 62;

/** 每一份的摘要最多几行。 */
export const XHS_VOICE_LINES = 2;
export const VOICE_LINE_HEIGHT = 1.5;

/**
 * 每一份画成**两行**：名字一行（小、灰）＋ 摘要（大、正文色）。
 *
 * 【2026-09-22 第四轮，用户要的】原来是一行 `ChatGPT：<摘要>`，摘要跟名字同号、
 * 还是灰的。用户原话：「应该是要把回答的模型写上去的，尽量利用空间，
 * 字体也可以大一点，摘要也要明显」。三条都落在这个形状上：
 *
 *   - **模型写得上**：名字那一行是「OpenAI ChatGPT（GPT-6-Pro）」整串，
 *     一行里挤不下的时候它自己占一行就行了；
 *   - **摘要明显**：摘要换成**正文色**、比名字大一半 —— 名字是出处，
 *     摘要才是让人读下去的那一段，原来的主次是反的；
 *   - **利用空间**：字号按「有没有主标题 × 几份」挑（`voiceDescSize()`），
 *     份数少就用大字把空间吃满，而不是留一片白。
 */
export const VOICE_NAME_RATIO = 0.62;
export const VOICE_NAME_MIN = 26;
export const VOICE_NAME_LINE_HEIGHT = 1.3;
/** 名字和它底下那段摘要之间。 */
export const VOICE_NAME_GAP = 8;
/** 两份之间那道空。 */
export const XHS_VOICE_GAP = 34;

/**
 * 摘要的字号 —— **四档**：有没有主标题 × 两份还是三份。
 *
 * ★ 这四个数**不是审美挑的，是按预算填出来的**：中间那块是
 *   `HOOK_AREA_BUDGET`，主标题占掉多少是已知的，剩下的除以份数就是每份能用的高度，
 *   再往回反推字号。B1 把四种组合都算一遍 —— 调大任何一个都会当场红。
 * ★ 没有主标题那一档（`hookSource === "none"`）能用到 60px：那一档主标题让位了，
 *   整块空间都是这几行的。不吃满的话卡上就是一片白（用户第四轮报的就是这个）。
 */
export const VOICE_SIZES = {
  /** 有主标题：主标题占掉两行，这几行分剩下的。 */
  hooked: { few: 48, many: 34 },
  /** 没有主标题：整块都是这几行的。 */
  solo: { few: 60, many: 48 },
} as const;

/** 「几份算少」的界。2 份用大字，3 份用小一档。 */
export const VOICE_FEW = 2;

export function voiceDescSize(count: number, hasHook: boolean): number {
  const tier = hasHook ? VOICE_SIZES.hooked : VOICE_SIZES.solo;
  return count <= VOICE_FEW ? tier.few : tier.many;
}

/** 名字那一行的字号。比摘要小一截 —— 出处是次要信息，摘要才是主角。 */
export function voiceNameSize(descSize: number): number {
  return Math.max(VOICE_NAME_MIN, Math.round(descSize * VOICE_NAME_RATIO));
}

/** 一份占多高（名字一行 ＋ 摘要 `XHS_VOICE_LINES` 行 ＋ 中间那道空）。B1 拿它算预算。 */
export function voiceBlockHeight(descSize: number): number {
  return (
    voiceNameSize(descSize) * VOICE_NAME_LINE_HEIGHT +
    VOICE_NAME_GAP +
    descSize * VOICE_LINE_HEIGHT * XHS_VOICE_LINES
  );
}

/**
 * 标的那一行的字号：代码 / 公司名。两档。
 *
 * ★ **主标题整个不画那一档（`hookSource === "none"`）用大的。**
 *   那一档的标题就是票代码，让位给底下那几行之后，卡上最大的元素只剩这一行 ——
 *   48px 的 `$ZM Zoom` 摆在小红书信息流里没有任何分量，整张卡是空的。
 *   把它顶上去，**主视觉就从"重复的标题"换成了"这只票"**，一个字都没多印。
 * ⚠ 放大的是**已有的那一行**，不是新编一段文案：卡上不许出现内容里没有的字
 *   （这是个财经站，docs/engineering-notes.md 红线 4）。
 */
export const SYMBOL_FONT_SIZE = 48;
export const SYMBOL_FONT_SIZE_LEAD = 76;

/** 一只票在卡上的样子。名字由调用方从**标的表**查好（`symbolNames()`）再传进来。 */
export interface XhsSymbol {
  code: string;
  name?: string;
  nameEn?: string;
}

/**
 * 组里的一份：**谁**写的 ＋ 一句话概括。
 *
 * ★ `agentName` 是**产品名**（`ChatGPT` / `Claude` / `Spark`），由调用方用
 *   `agentProductName()` 剪好再传进来 —— 和 `sharePost.ts` 的 `ShareVoice`
 *   同一条规矩、同一个理由：一行里「OpenAI ChatGPT · GPT-6-Pro：」这种
 *   长名字吃掉的是摘要的位置，而摘要才是让人看下去的那一段。
 * ★ 人写的 / 没标的传 `undefined` —— 这一行会以一个 `·` 起头，**什么都不说**，
 *   正合我们对这一份的了解。⚠ 不许在这儿补一句「我自己」或「来源未标注」：
 *   那是两个不同的档，而调用方传过来的 undefined 已经把它们合并了，
 *   在这儿猜是替内容认领出身。
 */
export interface XhsVoice {
  /**
   * 「OpenAI ChatGPT（GPT-6-Pro）」—— **和站上那张 AgentModelChip 同一个判据**
   * 算出来的整串（`findAgent()` ＋ `modelSlot()` / `modelSlotLabel()`），
   * 由调用方算好传进来（`xhsEntry.ts` 的 `bylineOf()`）。
   *
   * ★【2026-09-22 第四轮，用户要的】原来这一格是**只有产品名**的 `agentName`
   *   （`ChatGPT`），那是从 `sharePost.ts` 抄来的 —— 而那边剪掉厂商和模型的理由是
   *   **X 的 280 字预算**，这张卡上根本没有那个约束。用户原话：
   *   「应该是要把回答的模型写上去的」。照抄一个不适用的取舍，代价就是
   *   这张卡少了一维信息而没有任何一处会报错。
   * ★ 集合没有"谁写的"这一维时（教程 / 提示词）是 `undefined`，那一份就不画名字行。
   *   ⚠ 不许在这儿补一句「来源未标注」：那两个集合**压根没有这一格**，
   *     印它是在说"这里本该填而没填"。而 posts / qa 走到这儿永远有值
   *     （查不到时 `agentDisplayName()` 会给出「来源未标注」那一档）。
   */
  label?: string;
  description: string;
}

/**
 * 画一张卡要的全部输入 —— **一张白名单**，见文件头那张表。
 * ⚠ 不许加 `entry` / `data` / `body` 这类"把整条内容传进来"的口子。
 */
export interface XhsCardSource {
  /** 集合的中文名（研究报告 / 问答 / 教程 / 提示词），从登记表取。 */
  kindLabel: string;
  title: string;
  symbols?: readonly XhsSymbol[];
  tags?: readonly string[];
  /**
   * 这一组里的几份，**新在前**（`foldQaGroups()` 已经排好）。长度至少 1。
   * 只写过一份的条目就是长度 1 —— 那不是特例，是同一条路的一端。
   */
  voices: readonly XhsVoice[];
  /**
   * 只有一份时那行完整落款「Anthropic Claude（Opus-5）」，三档由调用方按
   * `modelSlot()` 算好（见 `xhsEntry.ts`）。
   *
   * ⚠ 几份那一档**传了也会被丢掉**（`planXhsCard()` 里强制），不是忘了画：
   *   名字已经在每一行上，页脚再印一个「某某（模型）」会被读成
   *   **整组都是它写的** —— 而那正好是替另外几个智能体抹掉出处。
   */
  byline?: string;
  /** YYYY-MM-DD，北京时间（`config.site.timezone`）。 */
  date: string;
  /**
   * 左下角那两行的第一行：「免费全文报告：」/「免费全文回答：」/…
   * 由调用方按集合算好（`fullTextLabelFor()`）再传进来，和 `kindLabel` 同一条路。
   */
  fullTextLabel: string;
  /**
   * 落地页的**绝对地址**（`https://lwj.ai/r/1002`）。
   *
   * ★【2026-09-22 用户要的】它换掉了原来左下角的「牢玩家 / lwj.ai」两行。
   *   理由是小红书**不给外链、也不能点** —— 印一个站名和一个光秃秃的域名，
   *   读者还得自己猜这一篇在哪儿；印完整地址他才抄得走。域名没丢，它在地址里。
   * ★ 这一格**不是自由文本**：调用方用 `entryUrl()` ＋ `config.site.url` 拼，
   *   两头都是代码里的东西，所以它没有把新的字节带上公网（docs/gate.md 7.5）。
   *   ⚠ 别改成从条目里读某个字段 —— 那就成了一个闸门不扫的自由文本格。
   * ⚠ 站点是 `trailingSlash: "never"`，所以这里**不带末尾斜杠**。
   *
   * ★【2026-09-23 改成可选的】`undefined` = **这张卡不印地址**，左下角那两行
   *   整块不画。这一档不是装饰：小红书那条导流细则针对的就是
   *   卡上印了完整网址（《交易导流违规管理细则》明列「图片里含站外链接
   *   （直接、变形或植入）」违规，平台有 OCR）。
   *   判据**不在这儿**，在 `src/config/socialPlatforms.ts` 的 `urlOnCard` ——
   *   印不印跟着**目标平台**走，同一张卡在雪球上是行动指令、在小红书上是违规理由。
   */
  url?: string;
}

/**
 * 主标题那一格印的是**哪一样东西**。三档。
 *
 * - `"title"` —— 正常那一档，印条目 / 组的标题。
 * - `"description"` —— **只有一份**、而且标题被标的那一行完全覆盖了
 *   （站上真有标题就叫 `ZM` 的研究报告），把那一份的摘要提上来当主角。
 * - `"none"` —— **几份**、而且标题冗余。这一档整个不画主标题：底下那几行
 *   本来就带着内容，再印一个巨大的 `ARM` 只是把 `$ARM` 芯片里的字重复一遍。
 *   作为补偿，那几行的字号放大一档（`VOICE_FONT_SIZE_SOLO`）——
 *   否则卡上最大的元素没了，信息流里没有东西能让人停下来。
 */
export type XhsHook = "title" | "description" | "none";

export interface XhsCardPlan {
  kindLabel: string;
  date: string;
  /** 印出来的那几只票（已按 `XHS_SYMBOL_LIMIT` 截断，名字已去重）。 */
  symbols: { code: string; name?: string }[];
  /** 没印出来的还有几只。0 = 全印上了，不画那个 `+N`。 */
  moreSymbols: number;
  /** 标的那一行的字号。主标题不画时顶上去当主视觉，见 `SYMBOL_FONT_SIZE_LEAD`。 */
  symbolSize: number;
  /** 主标题那一格的字。 */
  hook: string;
  /** 它是从哪一格来的，见 `XhsHook`。 */
  hookSource: XhsHook;
  hookSize: number;
  /** 主标题最多几行。几份那一档收到 3，见 `XHS_HOOK_LINES_MULTI`。 */
  hookLines: number;
  /**
   * **只有一份**那一档：主标题底下那段灰字。
   * 主标题已经是摘要时是空串（不重复印一遍）；**几份那一档恒为空串**
   * —— 那时内容在 `voices` 里，一行一个。
   */
  description: string;
  /**
   * **几份**那一档：一行一个「谁 · 说了什么」。只有一份时是**空数组**
   * （那一份走上面的 `description`，不套一个「ChatGPT：」前缀 ——
   * 绝大多数条目是这一档，套前缀只会让摘要短一截）。
   */
  voices: { label?: string; description: string }[];
  /** 没列出来的还有几份。0 = 全列上了，不画那一行。 */
  moreVoices: number;
  /** 那几行**摘要**的字号（正文色、主角）。判据 `voiceDescSize()`。 */
  voiceSize: number;
  /** 那几行**名字**的字号（灰、次要）。判据 `voiceNameSize()`。 */
  voiceNameFontSize: number;
  /** 一份那一档摘要的字号。跟着主标题走，判据 `descSizeFor()`。 */
  descSize: number;
  tags: string[];
  byline?: string;
  /** 左下角第一行「免费全文报告：」。⚠ `url` 没有时这一行也不画（它俩是一对）。 */
  fullTextLabel: string;
  /**
   * 左下角第二行：落地页的绝对地址。
   * `undefined` = **这张卡不印地址**（目标平台不许图里带外链），见 `XhsCardSource.url`。
   */
  url?: string;
}

/**
 * 这张卡上**所有走中文字体的字** —— 取字形子集要照着它来（`xhsCard.ts`）。
 *
 * ⚠ 漏掉任何一段的后果是那一段变成豆腐块（□□□□），而**其余部分完全正常** ——
 *   docs/engineering-notes.md 坑 6 最阴的形态：看起来只是"某几个字没显示"，而且要分享出去才看得见。
 * ★ 返回的是**真正会被画出去的那些字符串**，包括我们自己加的 `#`、`+3` 这些装饰，
 *   不是把 `plan` 的字段随手拼一遍。
 * ★ 等宽那一路（`$ARM` 的代码、日期、域名）走 Google Sans Code，不在这里面 ——
 *   那个字体是仓库自带的，不用取子集。
 *
 * ⚠ **这个函数和 `XhsCardPlan` 是一对。** 给 plan 加一格可见的中文字而忘了在这里
 *   表态，那一格就是豆腐块，零报错。`xhsCard.test.ts` 的 A 组拿 plan 的键集合
 *   和一张名单对账，加一格会当场红。
 */
export function xhsCardText(plan: XhsCardPlan): string[] {
  return [
    plan.kindLabel,
    ...plan.symbols.map(s => s.name ?? ""),
    plan.moreSymbols > 0 ? `+${plan.moreSymbols}` : "",
    plan.hook,
    plan.description,
    // 几份那一档：每一行的名字和摘要都要取字形。⚠ 这两段漏掉的话，
    // 整张卡只有那几行是豆腐块，而标题、标签、落款完全正常。
    ...plan.voices.flatMap(v => [v.label ?? "", v.description]),
    plan.moreVoices > 0 ? moreVoicesLabel(plan.moreVoices) : "",
    ...plan.tags.map(t => `#${t}`),
    // ⚠ 不印地址那一档连「免费全文报告：」也不画，所以它也不该占字形
    //   —— 取了不画只是多一次往返，但缓存键会因此对不上。
    plan.url ? plan.fullTextLabel : "",
    plan.byline ?? "",
    // ⚠ `plan.url` **刻意不在这里**：它是纯 ASCII，走等宽那一路（Google Sans Code，
    //   仓库自带），不占中文子集。把它加进来只会让每张卡的缓存键都不一样
    //   （地址逐条不同），白白多取一次字形。A4 钉着这一条。
  ].filter(Boolean);
}

/**
 * 左下角第一行那几个字 —— **按集合分词**。
 *
 * 【2026-09-22 用户要的】原话是「改为报告全文和文章网址」。⚠「报告」这个词
 * **只对研究报告成立** —— 印在一条问答上就是把回答叫成了报告，印在教程上更不对。
 * 所以这里和 `sharePost.ts` 的 `KIND_WORDS` 同一个形状：一张按集合的小词表。
 * ★【2026-09-23 用户要的】「图片上的全文报告加个免费，免费全文报告」—— 研究报告那一档
 *   **就是用户写的那几个字**「免费全文报告」，另外三档照同一个语序换词
 *   （免费全文回答 / 教程 / 提示词）。「免费」是实话：站上每一篇都不要钱、不要登录。
 *
 * ★ 表外的集合回落到「免费全文」。这一档是**安全的**，不是在猜：
 *   「全文」对任何一种内容都成立（`sharePost.ts` 全站就用这一个词）。
 *   ⚠ 别学 provenance 那种"不知道就得红" —— 那里回落是**替内容认领出身**，
 *     而这里回落只是少了一个更贴切的词，不会说出任何一句假话。
 */
export function fullTextLabelFor(collection: string): string {
  const word =
    { posts: "报告", qa: "回答", guides: "教程", prompts: "提示词" }[
      collection
    ] ?? "";
  return `免费全文${word}：`;
}

/**
 * 「还有 2 份」。**渲染和取字清单读同一个函数** —— 各写一份的那天，
 * 屏幕上那一行是豆腐块而其余一切正常。
 */
export function moreVoicesLabel(n: number): string {
  return `还有 ${n} 份`;
}

/**
 * 这串字大约占几个"全角宽"。汉字记 1，其余记 0.55。
 *
 * ★ 为什么不数码点：`Arm Holdings Q3 财报解读` 里 18 个拉丁字符只占 9 个汉字的宽，
 *   按码点分档会把它判成"很长"而缩到最小字号 —— 一张本来能用大字的封面
 *   白白小了两档，而且**没有任何一处会报错**。
 * ⚠ 0.55 是**估的**，不是量出来的（satori 里真实宽度取决于字体的每个字形）。
 *   它只用来挑字号，挑窄一档最坏是字小一点；真排不下时还有 `lineClamp` 兜底。
 *   别把这个数拿去算别的东西。
 */
export function displayWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += isFullWidth(ch.codePointAt(0) ?? 0) ? 1 : 0.55;
  return w;
}

/**
 * 这个码点占一个全角宽吗 —— 汉字、中文标点、全角符号。
 *
 * ★ 按**码点**判，不写成一个含汉字字面量的正则区间（`sharePost.ts` 的
 *   `charWeight()` 也是这么写的）：这个文件会被裸 tsx、Vite、Astro 三处加载，
 *   源码里的字面量区间在任何一处的编码上出岔子，都会变成一条永远不命中的规则 ——
 *   而症状只是封面上的字小了一档，零报错。
 */
function isFullWidth(cp: number): boolean {
  // 0x2E80–0x9FFF：部首补充一路到 CJK 统一汉字（中文标点 0x3000–0x303F 在里面）。
  if (cp >= 0x2e80 && cp <= 0x9fff) return true;
  // 0xFF00–0xFFEF：全角 ASCII 和半角片假名。
  return cp >= 0xff00 && cp <= 0xffef;
}

/**
 * 主标题的字号。四档，从"能用多大就多大"往下退。
 *
 * ★ 每一档的界都是 `CONTENT_WIDTH / 字号 × 行数` 算出来的，**不是拍脑袋的美学值**：
 *   856 宽里 96px 的字一行约 8.9 个，两行 17.8 —— 所以 17 是 96 那一档的界。
 *   改 `XHS_WIDTH` 或者内边距就得回来重算这四个数（`xhsCard.test.ts` 的 B 组
 *   拿 `CONTENT_WIDTH` 反算一遍，改了尺寸而忘了改这里会红）。
 */
export const HOOK_SIZE_TIERS: readonly {
  /** 到这个"全角宽"为止用这一档。最后一档是 Infinity（兜底）。 */
  maxWidth: number;
  size: number;
}[] = [
  { maxWidth: 17, size: 96 },
  { maxWidth: 30, size: 84 },
  { maxWidth: 47, size: 72 },
  { maxWidth: Infinity, size: 60 },
];

export function xhsTitleSize(text: string): number {
  const w = displayWidth(text);
  return (HOOK_SIZE_TIERS.find(t => w <= t.maxWidth) ?? HOOK_SIZE_TIERS.at(-1)!)
    .size;
}

/**
 * 这只票在卡上印哪个名字 —— 没有可印的就 `undefined`（**只印代码，不编一个**）。
 *
 * 两条规矩，都不是这里发明的：
 *
 *   ① **名字就是代码** → 不印。`ARM` 这一行表里填的中英文名都是 `Arm`，
 *      印出来是 `$ARM Arm`，一个字的新信息都没有。判据是 `symbolKey()`
 *      （全站唯一的"这两个写法是不是同一只票"）。
 *      ⚠ 这一档的**正解在内容那一侧**：去后台「标的」那一页把公司全名填上
 *      （`Arm Holdings`），卡上立刻就有名字了。和 `sharePost.ts` 的 headLine ①
 *      同一条规矩、同一个正解。
 *   ② **中文名优先，空了才退到英文名。** 卡是给中文读者看的。
 *
 * ★ 「中英同名只留一个」（`sameName()`，站上那张 lg 芯片和发帖文案第一行都要守的
 *   那条）在这里**不是一个会出现的问题**，所以这个函数没有、也不该有它的第二份：
 *   那条规矩存在的前提是"两个名字会同时印出来"，而这张卡**一只票只印一个名字**
 *   （版面就这么宽，见 `planXhsCard()` 里那段）。`ZM` 的两格都填 `Zoom` 时，
 *   上面那个"中文名优先"已经把它收成一个了。
 *   ⚠ 哪天真要在卡上同时画中英文名，`sameName()` 就得进来 —— 别现写一个。
 */
export function cardSymbolName(s: XhsSymbol): string | undefined {
  const code = s.code.trim();

  // ① 名字就是代码 → 这一格没有新信息。
  const keep = (n: string | undefined) => {
    const v = n?.trim() ?? "";
    return v !== "" && symbolKey(v) !== symbolKey(code) ? v : undefined;
  };

  return keep(s.name) ?? keep(s.nameEn);
}

/**
 * 截到最多 `cap` 个码点。够短就原样返回（不补省略号）。
 * 截过的补 `…`，并且先把末尾那个孤零零的标点抹掉 —— `，…` 读起来像漏了字。
 *
 * ★ `sharePost.ts` 里有一个形状相同的 `clip()`。**刻意各留一份**：
 *   那一份的上限是 X 的 280 加权字数算出来的、会随着标题长度动态变；
 *   这一份是排版上限、固定。合成一个函数要先把两种"上限"的来源也合并，
 *   而它们本来就是两回事。两边分家的后果也只是省略号位置不同，不是静默的错。
 */
export function clipText(text: string, cap: number): string {
  const chars = [...text];
  if (chars.length <= cap) return text;
  if (cap <= 0) return "";
  return `${chars
    .slice(0, cap)
    .join("")
    .replace(/[\s，。；：、,.;:!！?？]+$/, "")}…`;
}

/**
 * 算出这张卡上每一格印什么。
 *
 * ## 主标题那一格为什么会换成摘要
 *
 * 站上真有标题就叫 `ZM`、`NOK` 的研究报告（标题是站长顺手写的票代码）。
 * 那种条目上，标的那一行已经印了 `$ZM Zoom`，主标题再来一个巨大的 `ZM`
 * 就是把同一个词印两遍 —— 而封面上那一格是**唯一**能让人停下来的东西。
 *
 * 所以标题被标的那一行完全覆盖（标题 == 代码，或者标题 == 印出来的那个名字）
 * 时，把摘要提上来当主角。判据的形状和 `sharePost.ts` headLine ③ 是一路的
 * （"谁的信息多谁留下"），但**答案不一样**，因为版面不一样：那边五段挤一行、
 * 丢掉标题还剩四段；这边主标题是独占的一格，丢了就空着。
 *
 * ⚠ 所以有第三档：**标题冗余、但摘要也是空的** → 仍然印标题。
 *   一个空的主标题格比一个重复的词糟得多。
 *
 * ## 一份 / 几份是两种版面，不是同一种的两个长度
 *
 * 【2026-09-22 用户要的】几份折成一张卡时内容改成**一行一个智能体**
 * （像 X 那段发帖文案），所以：
 *
 *   - **一份**：主标题 ＋ 底下一段灰字摘要 ＋ 页脚完整落款「某某（模型）」。
 *     绝大多数条目是这一档；给它套一个「ChatGPT：」前缀只会让摘要短一截，
 *     而"谁写的"页脚已经说得更全（还带模型名）。
 *   - **几份**：主标题 ＋ 一行一个「ChatGPT：概括」，**页脚不印落款**。
 *
 * ⚠ 两档的分界只有 `voices.length >= 2` 一处。别在渲染那边再判一次 ——
 *   两边分家的症状是"页脚印着一个智能体，而上面列着三个"。
 */
export function planXhsCard(src: XhsCardSource): XhsCardPlan {
  const all = (src.symbols ?? []).filter(s => s.code.trim() !== "");
  const shown = all.slice(0, XHS_SYMBOL_LIMIT);

  /**
   * ★ **两只以上就只印代码**，不印名字。
   *   三只票各带一个公司名那一行怎么排都会折行或者被挤成省略号，而多标的的条目
   *   （问答）读者要的恰恰是"讲了哪几只"，不是"第一只叫什么"。
   *   一只票时名字很有用（`$ORCL 甲骨文`），所以两档分开。
   */
  const withNames = shown.length === 1;
  const symbols = shown.map(s => ({
    code: s.code.trim(),
    name: withNames ? cardSymbolName(s) : undefined,
  }));

  const title = src.title.trim();

  /**
   * 空壳的那几份剔掉：既没名字又没摘要的一行印出来是一个孤零零的 `·`。
   * ⚠ **只剔两样都空的**：有名字没摘要的那一份要留着 —— 它说的是
   *   "这个智能体也答了"，那是一条真信息。
   */
  const voices = src.voices.filter(
    v => (v.label?.trim() ?? "") !== "" || v.description.trim() !== ""
  );
  const multi = voices.length >= 2;
  /** 只有一份时那一份的摘要；几份时走下面的 voices。 */
  const description = multi ? "" : (voices[0]?.description.trim() ?? "");

  // 标题被标的那一行完全覆盖了吗（比的是印出来的那几段，不是表里填了什么）。
  const printed = symbols.flatMap(s => [s.code, s.name ?? ""]).filter(Boolean);
  const titleRedundant = printed.some(
    seg => symbolKey(seg) === symbolKey(title)
  );

  /**
   * 主标题那一格印什么 —— 三档，见 `XhsHook`。
   *
   *   正常                      → 标题
   *   一份 ＋ 标题冗余 ＋ 有摘要 → 摘要上位
   *   几份 ＋ 标题冗余          → 整个不画（底下那几行带着内容）
   *
   * ⚠ 还有一档不许漏：**一份 ＋ 标题冗余 ＋ 没摘要** → 仍然印标题。
   *   一个空的主标题格比一个重复的词糟得多。
   */
  const useDesc = !multi && titleRedundant && description !== "";
  const hookSource: XhsHook = useDesc
    ? "description"
    : multi && titleRedundant
      ? "none"
      : "title";
  // 先截断再挑字号。
  // ⚠ 【2026-09-22 破坏测试查出来的】**今天这个顺序看不出区别**，别以为它有保障：
  //   `XHS_DESC_MAX` 是 88，截断后恒为 89 个码点，而 89（哪怕全是拉丁字母，
  //   89 × 0.55 ≈ 49）已经落在 `xhsTitleSize()` 最小那一档里 —— 截断前后挑出来的
  //   字号一样。第一版在这儿写的是"顺序不能反，否则长标题会被判到最小档"，
  //   那句话描述的后果**不存在**，而它旁边那条测试反过来也就钉不住任何东西
  //   （实测：把顺序调反，24 条全绿）。
  //   顺序仍然按对的写，但真正在撑着的是那条余量 —— `xhsCard.test.ts` 的 B3
  //   钉的是它：把 `XHS_DESC_MAX` 调到 85 以下，拉丁长标题就会跨档，那时这个
  //   顺序才开始有后果，而 B3 会当场红、叫人回来重写用例。
  const hook =
    hookSource === "none"
      ? ""
      : clipText(useDesc ? description : title, XHS_DESC_MAX);

  const shownVoices = multi ? voices.slice(0, XHS_VOICE_LIMIT) : [];
  // 字号按「几份 × 有没有主标题」挑，见 `voiceDescSize()`。
  const descSize = voiceDescSize(shownVoices.length, hookSource !== "none");

  return {
    kindLabel: src.kindLabel,
    date: src.date,
    symbols,
    moreSymbols: all.length - shown.length,
    // 主标题让位那一档，标的行顶上去当主视觉（理由在那个常量上面）。
    symbolSize:
      hookSource === "none" ? SYMBOL_FONT_SIZE_LEAD : SYMBOL_FONT_SIZE,
    hook,
    hookSource,
    hookSize: xhsTitleSize(hook),
    // 几份那一档主标题收到 3 行，底下那几行要地方（算术写在那个常量上面）。
    hookLines: multi ? XHS_HOOK_LINES_MULTI : XHS_HOOK_LINES,
    // 摘要已经当了主角就不在底下再印一遍；几份那一档内容在 voices 里。
    description: useDesc || multi ? "" : clipText(description, XHS_DESC_MAX),
    voices: shownVoices.map(v => ({
      label: v.label?.trim() || undefined,
      description: clipText(v.description.trim(), XHS_VOICE_DESC_MAX),
    })),
    moreVoices: multi ? voices.length - shownVoices.length : 0,
    /**
     * 摘要 / 名字的字号 —— **按份数和有没有主标题挑**（`voiceDescSize()`），
     * 不是一个固定值。份数少就用大字把中间那块吃满，那正是用户第四轮
     * 报的「有很多的空白」。⚠ 调大之前看 B1：它把四种组合都算一遍。
     */
    voiceSize: descSize,
    voiceNameFontSize: voiceNameSize(descSize),
    descSize: descSizeFor(xhsTitleSize(hook)),
    tags: (src.tags ?? [])
      .map(t => t.trim())
      .filter(Boolean)
      .slice(0, XHS_TAG_LIMIT),
    // ⚠ 几份那一档**强制丢掉落款**，传了也不认：名字已经在每一行上，
    //   页脚再印一个「某某（模型）」会被读成整组都是它写的 —— 那正好是
    //   替另外几个智能体抹掉出处。理由写在 `XhsCardSource.byline` 上面。
    byline: multi ? undefined : src.byline?.trim() || undefined,
    fullTextLabel: src.fullTextLabel,
    url: src.url,
  };
}
