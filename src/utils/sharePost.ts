/**
 * 发到 X（推特）的那段话 —— 从**一组**内容生成，读者点链接进站。
 *
 * 【2026-09-21 用户要的两条】
 *   ① **四个集合都能发**（研究稿 / 问答 / 教程 / 提示词），不再只有前两个。
 *      教程和提示词没有 `agent` 那一格，所以它们那一档**不写出处**，
 *      和"人写的 / 没标的"走同一条分支（见下面 `voiceWho`）。
 *   ② **第一行要认得出是哪家公司**。原来的第一行是 `$NOK NOK`（cashtag ＋ 标题，
 *      而标题就是那只票的代码）—— 刷到的人不点进来就不知道这是哪家。
 *      现在这一行是**标的 ＋ 英文名 ＋ 中文名 ＋ 标题 ＋ 标签**，五段各自能不印就不印
 *      （顺序是用户定的；英文名那一段是当天晚些时候补的 —— 只填了英文名的票
 *      在那之前仍然是 `$ZM ZM`）。去重规矩见 `headLines()`。
 *
 * 【2026-09-20 加】用户发新稿之后要去 X 上说一声。这段话在 dev 专用的 `/_share`
 * 页上生成（src/dev/share.astro），点一下复制，或者直接点「打开 X 发帖」
 * （x.com 的 intent 链接会把文字预填进发帖框）。
 *
 * ## 【2026-09-21 改】同一个问题 / 同一个选题只发一条
 *
 * 在这之前每个**条目**各生成一段：同一个问题问了两个智能体，`/_share` 上就是
 * 两张卡、两段话，标题一模一样。真发出去就是同一个问题在时间线上刷两遍，
 * 而这个站的卖点恰恰是**同一个问题几个智能体答得不一样** —— 那得摆在一条里对比。
 *
 * ★ 归组的钥匙**不在这里**：调用方用 `foldQaGroups()`（src/utils/qaGroups.ts）折好
 *   再喂进来，和列表卡片、详情页那排切换是同一把钥匙（`related.ts` 的 `qaGroupKey()`）。
 *   在这儿再写一套"标题相同就算一组"是同一个判据的第二份拷贝，而两边分家的症状是
 *   "站上折了、发帖没折"，四处全绿。
 *
 * ## 形状
 *
 *   一份（`voices.length === 1`）：
 *     $ORCL Oracle 甲骨文 #个股研究
 *     <一句话摘要>
 *     由 Spark 生成，全文：https://lwj.ai/r/1002
 *
 *     $CRWV CoreWeave #基础概念
 *     问：<问题>
 *     答：<一句话概括>
 *     ChatGPT 的回答，全文：https://lwj.ai/q/1003
 *
 *     <教程标题> #券商开户
 *     <一句话摘要>
 *     全文：https://lwj.ai/g/1005
 *
 *   几份（`voices.length >= 2`，只有研究稿 / 问答会归组）：
 *     $NOK Nokia 诺基亚 #财报 #估值
 *     ChatGPT：<概括>
 *     Claude：<概括>
 *     Spark：<概括>
 *     全文：https://lwj.ai/r/1012
 *
 * ## 【2026-09-22 用户要的】问答那一档：「问：…」**自己占一行**
 *
 * 在这之前问题是缀在第一行名字后面的
 * （`$GRML Greenland Mines 格陵兰矿业 问：格陵兰相关标的的暴涨的原因？ #宏观`）——
 * 一整行里混着三种东西：这是哪只票、这问的是什么、这属于哪个话题。
 * 而**问题是一句完整的话**（带着问号），研究稿标题是个名词短语，两者不该同样排。
 * 现在第一行只剩「标的 ＋ 名字 ＋ 标签」，问题单起一行、紧挨着底下的回答。
 *
 * ★ **只有问答这一档**（`KIND_WORDS[kind].titleOwnLine`）。研究稿 / 教程 / 提示词的
 *   标题仍然在第一行：教程和提示词根本没有标的那一格，把标题也挪走的话第一行
 *   就剩一串 `#券商开户`（甚至整个空掉）—— 第一眼看见的那一行得是内容，不是标签。
 * ★ 280 的账**一个字都没变**：挪走的那一段前面原来有一个空格，现在是一个换行，
 *   两者在 X 的算法里都记 1（见 `charWeight`）。
 * ★ 去重那几条规矩（`headLines()` 里 ①～④）**照旧管着它**：标题就是代码 / 就是公司名
 *   的时候仍然整段不印 —— 换了行不等于换了一行就可以重复一遍。
 *
 * ## 【2026-09-21 用户要的】名字短、尾巴短 —— 省下的字全给摘要
 *
 * 两处同时改的，理由是同一个：**280 的账**（用户原话「因为字数限制」）。
 *
 *   - 出处只印**产品名**：`OpenAI ChatGPT · GPT-6-Pro：` → `ChatGPT：`。
 *     厂商那一段由 `agentProductName()` 剪掉（判据在 src/config/agents.ts），
 *     **模型名整个不进帖子**（见 `ShareVoice.agentName` 上那段）。
 *     一组三份的帖子光这一项就省出六七十个字。
 *   - 最后一行不再报数：「3 份报告，全文：…」→「全文：…」。
 *
 * ★ 两样东西都**没有消失，只是不在帖子里**：落地页上那排芯片写着「智能体（模型）」，
 *   那排切换摆着一共几份。帖子是入口，不是清单。
 *
 * ## 【2026-09-21 用户要的】话题标签跟在**第一行名字后面**
 *
 * 就是条目上的 `tags`（后台「标签」那一页管的那张封闭词表），原样加个 `#`，
 * 缀在第一行末尾（`assembleHead()`）。站上标签撑着 `/t/<标签>` 那套索引，
 * X 上它是同一件事的另一半：让刷到的人顺着话题找过来。
 *
 * ★ 位置是**第一行**，不是最后一行（同日先做成末尾那一行，用户当天改的）：
 *   和站上那排「名称 → 标签 → 智能体（模型）」逐项对齐 —— 同一组信息在站上和
 *   帖子里换个顺序，读者就得把它们当成两组东西重新认一遍。
 *   连带一条好处：它从此和标题、链接一样属于**不动的那一半**，缩的永远只有摘要
 *   （挂在最后一行时也是这样，但那时它看起来像"可以砍掉的尾巴"）。
 * ★ **最多三个**（`SHARE_TAG_LIMIT`）。不是排版洁癖：它吃的是**摘要的预算** ——
 *   280 的账里一个中文标签就是 2×字数 + 2，五个标签能把摘要挤掉十几个字，
 *   而摘要才是让人点进来的那一段。多出来的标签在落地页上一个不少。
 * ★ 标签里**不许有空格**（`src/config/tags.ts` 的 `parseTags` 拦着）——
 *   X 的话题标签在空格处就断了，`#个股 研究` 会变成话题「个股」加两个字。
 *   那条规矩写在表那一侧，所以这里不用再挑一遍。
 * ⚠ 几份那一档用的是**代表那条**（标题、链接的那条）的标签，不是把全组的标签并起来：
 *   并起来就是替这条帖子挂上另一份研究才有的话题。
 *
 * ★ **cashtag 排在最前面**（2026-09-21 用户要的，原来吊在最后一行）：X 上刷到这条的人
 *   第一眼要知道说的是哪只票；排在末尾的话，前面三行读完才看见，而多数人只看第一行。
 *
 * ★ 几份那一档只给**一条链接** —— 组里最新那条。详情页上本来就有一排切换
 *   （QaAnswerSwitch），读者落地之后自己换着看。每条各给一个链接的话，光链接就
 *   23 × N，两条回答就吃掉 46，而正文一个字都还没写。
 *
 * 出处那一行**按条目分档**，和站上芯片同一个判据：AI 智能体答的印它的产品名；
 * 人写的 / 没标的**不写出处** —— 对着一段不知道谁写的字说"由 X 生成"是撒谎
 * （docs/engineering-notes.md 第二节）。调用方按 findAgent 判好、`agentProductName()` 剪好再传进来。
 * ⚠ 帖子里**不再分到模型那一维**（2026-09-21 用户定的，理由见上面那节）——
 *   这不是把档压掉：模型那一格在站上、在 .md 导出口、在搜索索引里一个都没少。
 * ⚠ 几份那一档里，某一份没有出处时那行用一个 `·` 起头（`· <概括>`）：
 *   它**什么都不说**，正合我们对这一份的了解。不许在这儿补一句「我自己」或
 *   「来源未标注」——那是两个不同的档，而调用方传过来的 undefined 已经把它们合并了，
 *   在这儿猜是替内容认领出身。
 *
 * ## 280 的账按 X 的规矩算
 *
 * X 数的不是字符数：链接一律记 23，CJK 每个字记 2（twitter-text 的 ranges 规则）。
 * 超了就**只截摘要**，标题和链接不动 —— 标题是让人认出这是哪只票，链接是这条帖子
 * 存在的理由。几份那一档**所有摘要按同一个上限一起缩**，不是先砍最长的那份：
 * 谁的话被砍掉多少不该取决于谁写得啰嗦。摘要截到一个字都不剩还超（标题本身太长）
 * 就原样交出去，由人自己删。
 *
 * ★ 零 astro import：scripts/gate/sharePost.test.ts 用裸 tsx 测它。
 *   【2026-09-21】多了一条 `src/config/symbol.ts`（同样零 import，裸 tsx 加载得动）：
 *   「中英同名只显示一个」这条规矩站上那张标的芯片也要守，判据只许有一处。
 */
import { sameName } from "../config/symbol";

/** 组里的一份：谁写的 + 一句话概括。 */
export interface ShareVoice {
  /** 摘要 / 一句话概括（条目的 description）。 */
  description: string;
  /**
   * 智能体的**产品名**（`ChatGPT` / `Claude` / `Spark`）。人写的 / 没标的传 undefined。
   *
   * ★【2026-09-21 用户要的】传进来的是短名，不是站上那个全名「OpenAI ChatGPT」——
   *   剪厂商那一步的判据在 `src/config/agents.ts` 的 `agentProductName()`
   *   （调用方 src/dev/share.astro 剪好再喂进来，和 findAgent / 出处分档同一处）。
   * ⚠ **模型名不进帖子**（同日一起定的）：原来这一格旁边还有
   *   `modelName`，出处那一行是「OpenAI ChatGPT · GPT-6-Pro：」。一组三份就是
   *   三行这种，光名字六七十个字 —— 而 280 的账里那些字抢的是摘要的位置。
   *   两格在**落地页上一个都没少**（那排芯片就是「智能体（模型）」），
   *   帖子只是入口。这是一次**明知的取舍，不是把三档压成两档**：
   *   "谁写的"这件事在帖子里仍然分档（有名字 / 不写出处），只是不再细到模型。
   */
  agentName?: string;
}

/**
 * 能发帖的集合 —— **有详情路由的那四个**（`collections.ts` 里 `urlPrefix !== null`）。
 * 调用方（src/dev/share.astro）从登记表推出这批集合，这里只按 kind 换措辞。
 */
export type ShareKind = "posts" | "qa" | "guides" | "prompts";

/**
 * 每个集合的措辞。**这张表是唯一的分叉点** —— 别在下面的代码里再写
 * `kind === "qa" ? … : …` 的第二处判断。
 *
 * - `credit`：写出处那一行。教程 / 提示词的 schema 里**压根没有 `agent` 那一格**，
 *   调用方传进来的 `agentName` 恒为 undefined，所以它们也走不到这一支。
 *
 * ⚠【2026-09-21 用户要的】这张表里**没有 `count` 了**。几份折成一段时最后一行
 *   原来是「3 份报告，全文：…」，现在只剩「全文：…」—— 那五个字换成的是五个字的
 *   摘要，而"有几份"这件事**上面每份各占一行**已经数得出来，落地页上那排切换
 *   更是明摆着。删的是一句重复的话，不是一档信息。
 */
const KIND_WORDS: Record<
  ShareKind,
  {
    credit: (who: string) => string;
    /** 标题那一段（问答的标题就是问题本身，所以它带一个「问：」）。 */
    head: (title: string) => string;
    /**
     * 标题**自己占一行**（问答那一档，【2026-09-22 用户要的】），
     * 还是缀在第一行名字后面。理由见文件头那一节。
     *
     * ⚠ 这一格**没有默认值**（类型上是必填的 boolean）：加第五个能发帖的集合时
     *   TS 会当场要求它表态。写成可选的话新集合会**静默**落进"缀在第一行"那一档，
     *   而那正是这一行存在要治的形态。
     */
    titleOwnLine: boolean;
    /** 只有一份时，摘要那一行（问答是「答：…」）。 */
    body: (desc: string) => string;
  }
> = {
  posts: {
    credit: who => `由 ${who} 生成`,
    head: t => t,
    titleOwnLine: false,
    body: d => d,
  },
  qa: {
    credit: who => `${who} 的回答`,
    head: t => `问：${t}`,
    // 问题是一句完整的话，而且底下紧跟着的就是「答：…」/ 几家各自的回答。
    titleOwnLine: true,
    body: d => `答：${d}`,
  },
  guides: {
    credit: who => `由 ${who} 生成`,
    head: t => t,
    // ⚠ 教程 / 提示词没有标的那一格：标题挪走之后第一行只剩标签，甚至整个空掉。
    titleOwnLine: false,
    body: d => d,
  },
  prompts: {
    credit: who => `由 ${who} 生成`,
    head: t => t,
    titleOwnLine: false,
    body: d => d,
  },
};

export interface SharePostInput {
  kind: ShareKind;
  /** 组的标题 —— 就是组里最新那条的标题（同组的标题本来就是同一个问题 / 选题）。 */
  title: string;
  /** 绝对地址（https://lwj.ai/r/1002），组里**最新那条**的。 */
  url: string;
  /**
   * 这一条讲哪几只票。**一只**时第一行是「cashtag ＋ 英文名 ＋ 中文名 ＋ 标题 ＋ 标签」
   * （问答那一档标题挪到了第二行）；**好几只**时只印 cashtag（`$ARM $INTC $AMD`），
   * 名字整个不印 —— 见 `headLines()`。
   *
   * 【2026-09-22】从 `symbol` / `symbolName` / `symbolNameEn` 三格换成这一串：
   * 条目上现在只有代码，名字由调用方从标的表查好再传进来
   * （判据 `src/config/symbols.ts` 的 `symbolNames()`，站上那张芯片读同一个）。
   *
   * ⚠ 站上不少票只有英文名那一格（ZM / DKNG 没填中文名），少了它第一行就是
   *   `$ZM ZM` —— 用户原话「名字不全」。两格都空的票印不出名字来，
   *   那是内容那一侧的事（去后台「标的」那一页把公司名填上）。
   */
  symbols?: { code: string; name?: string; nameEn?: string }[];
  /** 同一组的几份，新在前。**长度至少 1** —— 空数组是调用方的 bug，见 xPostText。 */
  voices: ShareVoice[];
  /**
   * 条目上的标签（封闭词表，后台「标签」那一页）。第一行名字后面那串 `#财报 #估值`
   * 就是它，**最多取前 `SHARE_TAG_LIMIT` 个**，理由见文件头。没有就什么都不缀。
   */
  tags?: readonly string[];
}

/**
 * 一条帖子最多挂几个话题标签。
 *
 * ★ 这个数字是**预算**，不是审美：280 的账里一个三字中文标签是 8
 *   （`#` 记 1 + 三个字各记 2，外加一个空格），五个就是四十上下 —— 而它抢的是
 *   摘要的位置。摘要是让人点进来的那一段，标签只是让人找过来的入口，
 *   两者抢位置时让标签。
 */
export const SHARE_TAG_LIMIT = 3;

/**
 * 第一行最多挂几个 cashtag（【2026-09-22】问答那一格改成多选之后才有这件事）。
 *
 * ★ 和 `SHARE_TAG_LIMIT` 同一本账：一个 cashtag 是「$」+ 四五个字母 + 一个空格，
 *   四五个排过去就吃掉三十来个字符，而它们抢的是摘要的位置 —— 摘要才是让人
 *   点进来的那一段。**多出来的那几只在落地页上一个不少**（标题底下那排芯片，
 *   一只一张，各自链到自己那一页）。
 * ⚠ 这是一次明知的取舍：被截掉的那只票，关注它的人在 X 上刷不到这条。
 *   帖子是入口不是清单 —— 真要每只都露出来，那是发两条帖子的事。
 */
export const SHARE_SYMBOL_LIMIT = 3;

/** X 的上限，按加权长度算。 */
export const X_LIMIT = 280;
/** X 把每条链接记成 23，不管多长。 */
const URL_WEIGHT = 23;
const URL_RE = /https?:\/\/\S+/g;

/**
 * twitter-text 的规则：这四段码点记 1，其余记 2（CJK、emoji 全是 2）。
 * https://developer.x.com/en/docs/counting-characters
 */
function charWeight(cp: number): number {
  if (cp <= 4351) return 1;
  if (cp >= 8192 && cp <= 8205) return 1;
  if (cp >= 8208 && cp <= 8223) return 1;
  if (cp >= 8242 && cp <= 8247) return 1;
  return 2;
}

export function xWeightedLength(text: string): number {
  let total = 0;
  const rest = text.replace(URL_RE, () => {
    total += URL_WEIGHT;
    return "";
  });
  for (const ch of rest) total += charWeight(ch.codePointAt(0) ?? 0);
  return total;
}

/** 「ChatGPT」/ 空串（人写的、没标的）。模型名不进帖子，见 `ShareVoice.agentName`。 */
const voiceWho = (v: ShareVoice): string => v.agentName?.trim() ?? "";

/**
 * 摘要截到最多 `cap` 个**码点**。够短就原样返回（不补省略号）。
 * 截过的补 `…`，并且先把末尾那个孤零零的标点抹掉 —— `，…` 读起来像漏了字。
 */
function clip(text: string, cap: number): string {
  const chars = [...text];
  if (chars.length <= cap) return text;
  if (cap <= 0) return "";
  return `${chars
    .slice(0, cap)
    .join("")
    .replace(/[\s，。；：、,.;:!！?？]+$/, "")}…`;
}

/**
 * 开头那一两行：**标的（cashtag）＋ 英文名 ＋ 中文名 ＋ 标题 ＋ 话题标签**，
 * 五段各自**能不印就不印**。顺序是【2026-09-21 用户定的】：「标的 英文名 中文名 标签」。
 *
 * ★【2026-09-22 用户要的】**问答那一档标题自己占一行**，所以这里返回的是一到两行
 *   （拼装在 `assembleHead()` 一处，两个分支都走它）。分档的判据只有
 *   `KIND_WORDS[kind].titleOwnLine` 一处，理由见文件头。
 *
 * ★【2026-09-22】**勾了好几只票时只印 cashtag**（`$ARM $INTC` ＋ 底下一行 `问：…`），
 *   名字那两段整个不出现，理由写在下面那个 `symbols.length !== 1` 的分支上。
 *
 * ★ cashtag 排在最前面（同日用户要的，原来吊在最后一行）：X 上刷到这条的人
 *   第一眼要知道说的是哪只票；排在末尾的话，前面三行读完才看见，而多数人只看第一行。
 * ★ 英文名那一段是**同日补的**：在它之前这一行长成 `$ZM ZM`（用户原话「名字不全」）——
 *   站长把研究稿标题写成了 `ZM` / `NOK` 这种短名，公司名在
 *   `symbolNameEn` / `symbolName` 两格里，而文案只读了中文名那一格。
 *   ⚠ 所以这两格**空着的代价在这里看得见**：填了才有名字可印。
 *
 * ## 去重：同一个词不许在这一行里出现两次
 *
 * 判据只有一条 —— **谁的信息多谁留下**，都在下面那几行里：
 *
 *   ① 名字**就是代码**（`symbolNameEn: DXYZ`，那只票真的没有别的名字）→ 不印，
 *      cashtag 已经说过了。中英文两格**同一条规矩**。
 *   ② **中文名和英文名一模一样**（`symbolName: Zoom` + `symbolNameEn: Zoom`）→
 *      **只留一个**（【2026-09-21 用户要的】）。留下的是英文名那一格 ——
 *      它排在前面，而两段字节相同，留哪一格都是同一串字。
 *      ⚠ 这个组合在站上是常态，不是手滑：没有通行中文译名的票（Zoom / DraftKings）
 *        两格填的就是同一个词。不去重的话第一行是 `$ZM Zoom Zoom`。
 *   ③ 标题被别的段落**完全覆盖**（标题就是代码 `NOK` / 就是英文名 `Oracle` /
 *      是名字的一截）→ 丢标题。
 *      ⚠ 只有在**还有别的名字可印**时才丢：一个名字都没填的条目（只有代码）
 *        丢了标题就只剩一个孤零零的 `$DXYZ`，那比重复更糟 —— 那一档仍然印
 *        `$DXYZ DXYZ`。这不是漏改，是这一处没有信息可用；要治在内容那一侧。
 *   ④ 反过来，标题**包着**某个名字（老式标题「ORCL｜甲骨文 投资可行性分析」）→
 *      丢那个名字，标题留下：它带着更多上下文。
 *
 * ⚠ 换行之后这几条**照旧管着标题**：标题就是代码 / 就是公司名的时候整段不印。
 *   「它自己占一行了，重复一遍也不挤」是错的 —— 那一行会是 `问：NOK`，
 *   而上一行的 cashtag 已经说完了这件事。
 *
 * 问答的标题是问题本身，所以它那一档在标题前面加「问：」。
 */
function headLines(i: SharePostInput): string[] {
  const symbols = i.symbols ?? [];
  const title = i.title.trim();
  const tags = tagLine(i.tags);
  const cashtags = symbols
    .slice(0, SHARE_SYMBOL_LIMIT)
    .map(s => `$${s.code.trim().toUpperCase()}`)
    .join(" ");

  /**
   * **好几只票那一档：只印 cashtag，名字整个不印。**【2026-09-22】
   *
   * 不是漏改：三只票各带一个中英文名，第一行光名字就四五十个字符，而 280 的账里
   * 那些字抢的是摘要的位置。一只票那一档的整套去重规矩（下面那几行）说到底是在
   * 回答"标题和名字重复了印哪个"，而好几只票的时候**没有哪个名字能代表这一条** ——
   * 印一个就是替读者挑了一只。所以那一档就交给 cashtag 和标题。
   * ⚠ 这不是把档压掉：名字在落地页那排芯片上一只一张，一个都没少。
   */
  if (symbols.length !== 1) {
    return assembleHead(i, cashtags, "", title, tags);
  }

  const only = symbols[0]!;
  const symbol = only.code.trim().toUpperCase();
  const zh = only.name?.trim() ?? "";
  const en = only.nameEn?.trim() ?? "";
  const cashtag = cashtags;
  // ① 名字就是代码时不印（`$DXYZ DXYZ` 那一档）。两格同一条规矩。
  const enName = en && en.toUpperCase() !== symbol ? en : "";
  const zhName = zh && zh.toUpperCase() !== symbol ? zh : "";
  // ② 中英同名只留一个（留英文名那一格，它排在前面）。
  //    判据是 src/config/symbol.ts 的 `sameName()` —— 站上那张标的芯片读同一个。
  const zhUnique = zhName && !sameName(zhName, enName) ? zhName : "";

  // ③ 标题被别的段落完全覆盖 → 丢标题（但至少得留下一个名字，见上面那条 ⚠）。
  const covered = (name: string) =>
    name !== "" && (title === name || name.includes(title));
  const titleRedundant =
    (symbol !== "" && title.toUpperCase() === symbol) ||
    covered(enName) ||
    covered(zhUnique);
  const hasName = enName !== "" || zhUnique !== "";
  const titleShown = titleRedundant && hasName ? "" : title;

  // ④ 标题包着某个名字 → 丢那个名字（标题带着更多上下文）。
  const enShown = enName && !titleShown.includes(enName) ? enName : "";
  const zhShown = zhUnique && !titleShown.includes(zhUnique) ? zhUnique : "";

  return assembleHead(
    i,
    cashtag,
    [enShown, zhShown].filter(Boolean).join(" "),
    titleShown,
    tags
  );
}

/**
 * 把上面算好的几段摆成一行或两行。**拼装只有这一处** —— 一只票 / 好几只票
 * 两个分支都走它，各拼一份的话「问题单起一行」这条规矩会在其中一档静默失效
 * （而那一档正好是站上大多数条目）。
 *
 * ⚠ 两处 `filter(Boolean)` 都是承重的：没标的也没标签的问答（教程那种形状）
 *   第一行算出来是空串，不滤掉就是开头一个空行 —— 在 X 上那是实打实的一行，
 *   而且 280 的账里也记 1。
 */
function assembleHead(
  i: SharePostInput,
  cashtags: string,
  names: string,
  title: string,
  tags: string
): string[] {
  const words = KIND_WORDS[i.kind];
  const titleText = title ? words.head(title) : "";
  if (words.titleOwnLine) {
    return [
      [cashtags, names, tags].filter(Boolean).join(" "),
      titleText,
    ].filter(Boolean);
  }
  return [[cashtags, names, titleText, tags].filter(Boolean).join(" ")].filter(
    Boolean
  );
}

/**
 * 第一行末尾那串话题标签。空的（没标签 / 全是空白）就返回空串 ——
 * `assembleHead()` 用 `filter(Boolean)` 把它丢掉，所以不会多出一个尾随空格。
 */
function tagLine(tags: readonly string[] | undefined): string {
  return (tags ?? [])
    .map(t => t.trim())
    .filter(Boolean)
    .slice(0, SHARE_TAG_LIMIT)
    .map(t => `#${t}`)
    .join(" ");
}

function compose(i: SharePostInput, descriptions: string[]): string {
  const words = KIND_WORDS[i.kind];
  const lines: string[] = [...headLines(i)];

  if (i.voices.length === 1) {
    const only = i.voices[0]!;
    const desc = descriptions[0] ?? "";
    if (desc) lines.push(words.body(desc));
    const who = voiceWho(only);
    lines.push(who ? `${words.credit(who)}，全文：${i.url}` : `全文：${i.url}`);
    return lines.join("\n");
  }

  i.voices.forEach((v, idx) => {
    const who = voiceWho(v);
    const desc = descriptions[idx] ?? "";
    // 摘要被截没了就只剩名字（还认得出是几家答的）；名字和摘要都没有才整行不要。
    if (who && desc) lines.push(`${who}：${desc}`);
    else if (who) lines.push(who);
    else if (desc) lines.push(`· ${desc}`);
  });
  // 【2026-09-21 用户要的】最后一行只剩链接。原来是「3 份报告，全文：…」——
  // 那几个字在 280 的账里换成的是同样多的摘要，而"有几份"上面每份各占一行、
  // 落地页上那排切换更是明摆着。见 KIND_WORDS 上面那段。
  lines.push(`全文：${i.url}`);
  return lines.join("\n");
}

/** 生成那段话；超过 280（加权）就一起缩摘要，见文件头。 */
export function xPostText(i: SharePostInput): string {
  // ★ 空数组不兜底：兜一个"没有出处的单条"会让"调用方忘了传"变成一段**看起来正常**
  //   的文案，而它少了这一组里所有人的名字。宁可红。
  if (i.voices.length === 0) {
    throw new Error(
      `xPostText: voices 是空的（${i.kind} / ${i.title}）—— 一组里至少有一份。`
    );
  }

  const full = i.voices.map(v => v.description.trim());
  let text = compose(i, full);
  if (xWeightedLength(text) <= X_LIMIT) return text;

  // 所有摘要共用一个上限，从最长那份往下缩 —— 谁被砍多少不取决于谁写得啰嗦。
  const longest = Math.max(...full.map(d => [...d].length));
  for (let cap = longest - 1; cap > 0; cap--) {
    text = compose(
      i,
      full.map(d => clip(d, cap))
    );
    if (xWeightedLength(text) <= X_LIMIT) return text;
  }
  // 连一个字的摘要都放不下：只剩标题、出处和链接。可能仍超，那是标题的事，由人自己删。
  return compose(
    i,
    full.map(() => "")
  );
}

/** x.com 的发帖 intent：打开就是一个预填好文字的发帖框。 */
export function xIntentUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}
