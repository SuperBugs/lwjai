/**
 * 智能体图标表 —— 「这个智能体在站上画成哪个 logo」。
 *
 * 【2026-09-22 用户要的】列表卡片和详情页上那一排出处原来是纯文字：
 * 一屏里四五条内容，每一条的「谁写的」都是一串长度相近的拉丁字
 * （`OpenAI ChatGPT` / `OpenAI Codex` / `Anthropic Claude`），要分出这一条
 * 是谁答的只能**逐字读**。而这个站的核心信息之一就是"同一个问题不同智能体
 * 答得不一样" —— 那一维值得有个一眼认得出的记号。
 *
 * 【2026-09-23 用户要的】第一版是十二个自己画的单色几何符号（星芒 / 对话气泡 / 终端…），
 * 用户原话「图标太丑了，可以用彩色的，去网络上找合适的」。现在这张表里是**各家的品牌标**，
 * 文件在 `src/assets/agent-logos/`（下面 `AGENT_LOGO_DIR`）。
 *
 * ## 为什么是「从这张表里挑」，不是「自动从名字推」
 *
 * 最省事的做法是取首字母画个字母牌。**在这份数据上那是坏的**：
 * 现有四个智能体取显示名首字母是 G / O / A / O，取产品名首字母是 S / C / C / C ——
 * 两种取法都撞车，而且撞车之后**没有任何一处会报错**，屏幕上只是两条内容
 * 顶着同一个记号。所以图标必须是**挑出来的**，不能是推出来的。
 *
 * ## 为什么是内置的一张表，不是后台上传图片
 *
 * 和 agent / model / tags / symbols 四张表同一条理由：封闭词表。
 * 后台那一格是个下拉，**登记表里存的仍然是一个 id**（纯文本，三道闸照样扫得到那一行）；
 * logo 文件是**随代码提交**的资产，不是后台写出来的内容 ——
 * 所以 `/_publish` 不用认这个目录，发布闸也不用扫二进制。
 *
 * ## 这些文件从哪来【2026-09-23 下载，用户逐项点过头】
 *
 *   npm 包 `@lobehub/icons-static-svg@1.95.1`（MIT，<https://github.com/lobehub/lobe-icons>），
 *   经 jsDelivr 取：`https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.95.1/icons/<文件名>`。
 *   **字节未改**（20 个，共 35467 字节）。logo 本身是各家公司的商标，这里拿来标
 *   "这条是谁答的"，属于指称性使用。
 *   ★ **钉死了版本号**：`@latest` 的话哪天上游重画一版，同一个文件名下载回来是另一张图。
 *
 * ## 两种画法，由 `tone` 决定（组件是 `src/components/AgentLogo.astro`）
 *
 *   - `color` → `<img src>`：logo 自带颜色，深浅两个主题都用它本来的样子。
 *   - `mono`  → CSS mask + `background: currentColor`：logo 只取形状，颜色跟着周围的字走。
 *
 * ⚠ `mono` 那一档**不是审美取舍，是深色模式下会隐身**：那几个文件写的是
 *   `fill="currentColor"`，放进 `<img>` 里没有"周围的字"可跟，currentColor 落回黑色 ——
 *   深色底上一块黑，**浅色下一切正常**，改的人多半在浅色下看，看不出来。
 *   `agentIcons.test.ts` 钉着「文件里有 currentColor ⇔ 必须是 mono」。
 * ⚠ 反过来那一半测试钉不住，**只能两个主题各看一眼**：一个彩色 logo 里恰好有一块
 *   **白色的字形**，浅色底上就只剩它的彩色部分。实测撞到过一次 —— `kimi-color.svg`
 *   的那个 K 是白的，白底上只剩一个蓝点，所以 Kimi 用的是单色那份 `kimi.svg`。
 *   （`codex-color.svg` 也有 `#fff`，但那是 app 图标的白底方块，两个主题下都看得见，是对的。）
 *
 * ★ **为什么两种都不内联**（不把 SVG 源码塞进页面）：
 *   ① 八个彩色文件里带着渐变的 `id`（`lobe-icons-gemini-0-_R_0_` 那种）。同一页内联
 *     十几份就是十几个重复 id，`fill="url(#…)"` 全部解析到**第一份** —— 第一份一旦
 *     落在一个 `display:none` 的元素里（窄屏目录、只有一份时藏起来的切换排），
 *     后面每一个都**掉色成透明**，零报错。`<img>` 和 mask 里的每一张都是独立文档，没有这回事。
 *   ② 这是从网上拿来的 SVG。`<img>` / mask 里的 SVG **不执行脚本、不发外链请求**；
 *     内联进页面则是另一回事。`agentIcons.test.ts` 照样逐个扫文件（没有 script /
 *     事件属性 / foreignObject / 外链），但画法本身让那道扫描不是唯一一道防线。
 *
 * ## 四档，不许压
 *
 * 判据只有下面 `agentIconSlot()` 一处（芯片、列表折叠行、详情页切换排三处都读它）：
 *
 *   | 智能体那一格 | 图标那一格 | 画什么 | 是哪一档 |
 *   |---|---|---|---|
 *   | 登记表里的 AI 产品 | 挑了 | 那个品牌标 | **完成态** |
 *   | 登记表里的 AI 产品 | 还没挑 | 虚线圆 + 名字首字 | **待补** |
 *   | 「我自己」 | 不适用 | 人形（自己画的，单色） | **完成态** |
 *   | 没标 / 登记表里查不到 | — | 虚线圆 + `?` | **待补，但说的是另一件事** |
 *
 * ⚠ 后两档**不许合成一个**：「知道是谁、只是还没给它挑图标」和「根本不知道这是谁」
 *   是两回事，而它们在屏幕上都只有一个 16px 的小记号 —— 压成一档之后，
 *   后台新加一个智能体忘了挑图标，它在站上就长得和「来源未标注」一模一样，
 *   而四处全绿。虚线是全站统一的"这一格还空着"（同 `app-chip-empty`），
 *   圈里那个字负责说**空的是哪一格**。
 * ⚠ 待补那两档**不许回落到某个品牌标**（比如"没挑就先给个 Google 的"）：那就是把待补
 *   伪装成完成态 —— 而且比几何符号那一版更糟：它会替这条内容**认领一个厂商**。
 *
 * ## 加一个 logo
 *
 *   1. 从**同一个包、同一个版本**里下那个文件，放进 `src/assets/agent-logos/`，字节别改；
 *      优先挑 `-color` 那份，**两个主题下都看一眼**（见上面 kimi 那条）。
 *   2. 在下面数组里加一行：`id` 定了不改（它进 src/data/registry.json），
 *      `label` 是后台下拉里的名字，`file` 是文件名，`tone` 看文件里有没有 `currentColor`。
 *   3. `pnpm test` —— 表和目录是**双向对账**的：多一个没登记的文件、少一个登记了的文件都红。
 *
 * ★ 删一行之前先去后台把挑了它的智能体改掉 —— 否则登记表读不进来（`parseRegistry`
 *   那条对账会抛），而后台自己也读它，整个后台打不开。
 *   顺序和标签表、标的表那两条「删之前先取消勾选」是同一条。
 *
 * ★ 零 import（同 `collections.ts` / `agents.ts`）：这个文件要被三种环境读 ——
 *   Astro（组件）、Vite（keystatic.config.ts 在浏览器里跑）、裸 tsx（测试）。
 *   所以「id → 构建产物里的 URL」那一步**不在这里**（它要 `import.meta.glob`，
 *   裸 tsx 里没有），在 `src/utils/agentLogoUrls.ts`。
 */

/** logo 文件住的目录，仓库根相对、正斜杠。三处读它：地址表的 glob（那边必须写成字面量，
 *  见 agentLogoUrls.ts）、测试里的双向对账、以及报错信息。 */
export const AGENT_LOGO_DIR = "src/assets/agent-logos";

/** 后台那一格的「还没挑」哨兵。
 *
 *  ★ 它必须是一个**显式的值**，不能靠"这一格是空的"：Keystatic 的
 *    `fields.select` 的 `defaultValue` 是必填的、永远有值，压根没有"未选择"这一档
 *    （agents.ts 里哨兵那一段记着同一件事）。没有这个哨兵的话，新建一个智能体
 *    会被**默认挑上**表里第一个 logo —— 那是替它认领了一个厂商，
 *    而站上看不出那是默认值还是人挑的。
 *  ★ 下面 `AGENT_ICONS` 里不许有叫 `unset` 的一行（`agentIcons.test.ts` 钉着）。 */
export const AGENT_ICON_UNSET = "unset";

/** 待补那两档圈里印的字：不知道这是谁的时候印它。
 *  和「还没挑图标」那一档印的首字母是两个不同的字符 —— 这正是两档的区别所在。 */
export const UNKNOWN_ICON_LETTER = "?";

/** 见文件头「两种画法」。**不是审美开关** —— 选错了是深色模式下隐身。 */
export type AgentIconTone = "mono" | "color";

export type AgentIcon = {
  /** 进 src/data/registry.json 的稳定标识。**定了不改。** 和文件名刻意分开：
   *  哪天把 Kimi 从单色那份换成彩色那份，换的是 `file`，登记表一个字节都不用动。 */
  id: string;
  /** 后台下拉里的名字。随时可改，它不进任何文件。 */
  label: string;
  /** `AGENT_LOGO_DIR` 底下的文件名（带 `.svg`）。 */
  file: string;
  tone: AgentIconTone;
};

/**
 * 内置 logo 表。**顺序 = 后台下拉的顺序**：现在在用的四个排最前，
 * 然后是海外的、国内的。
 */
export const AGENT_ICONS: readonly AgentIcon[] = [
  // ── 现在登记表里那四个智能体在用的 ──
  // Google Spark（官方叫 Gemini Spark）的图标就是 Gemini 那颗星芒加一道拖尾；
  // 那个带拖尾的版本没有公开的矢量文件，用 Gemini 本身这颗。
  // ⚠ 同一个包里的 `spark-color.svg` 是**讯飞星火**，不是它 —— 别被文件名骗了。
  {
    id: "gemini",
    label: "Gemini（Google）",
    file: "gemini-color.svg",
    tone: "color",
  },
  // OpenAI 的品牌标本身就只有黑白一种，包里也没有 -color 版。
  { id: "openai", label: "OpenAI", file: "openai.svg", tone: "mono" },
  {
    id: "claude",
    label: "Claude（Anthropic）",
    file: "claude-color.svg",
    tone: "color",
  },
  {
    id: "codex",
    label: "Codex（OpenAI）",
    file: "codex-color.svg",
    tone: "color",
  },

  // ── 以后可能加进来的 ──
  {
    id: "claude-code",
    label: "Claude Code（Anthropic）",
    file: "claudecode-color.svg",
    tone: "color",
  },
  {
    id: "gemini-cli",
    label: "Gemini CLI（Google）",
    file: "geminicli-color.svg",
    tone: "color",
  },
  { id: "google", label: "Google", file: "google-color.svg", tone: "color" },
  { id: "grok", label: "Grok（xAI）", file: "grok.svg", tone: "mono" },
  {
    id: "deepseek",
    label: "DeepSeek（深度求索）",
    file: "deepseek-color.svg",
    tone: "color",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    file: "perplexity-color.svg",
    tone: "color",
  },
  {
    id: "copilot",
    label: "Copilot（Microsoft）",
    file: "copilot-color.svg",
    tone: "color",
  },
  { id: "meta-ai", label: "Meta AI", file: "metaai-color.svg", tone: "color" },
  { id: "mistral", label: "Mistral", file: "mistral-color.svg", tone: "color" },
  { id: "cursor", label: "Cursor", file: "cursor.svg", tone: "mono" },
  { id: "manus", label: "Manus", file: "manus.svg", tone: "mono" },
  {
    id: "qwen",
    label: "通义千问 Qwen（阿里）",
    file: "qwen-color.svg",
    tone: "color",
  },
  // ⚠ 单色那份，不是 kimi-color.svg：彩色那份的 K 是白的，浅色底上看不见（见文件头）。
  { id: "kimi", label: "Kimi（月之暗面）", file: "kimi.svg", tone: "mono" },
  {
    id: "doubao",
    label: "豆包（字节跳动）",
    file: "doubao-color.svg",
    tone: "color",
  },
  {
    id: "zhipu",
    label: "智谱清言（智谱）",
    file: "zhipu-color.svg",
    tone: "color",
  },
  { id: "minimax", label: "MiniMax", file: "minimax-color.svg", tone: "color" },
];

/**
 * 「我自己」那一档画的人形 —— **自己画的**，24×24 画布上的描边路径，跟 currentColor 走。
 *
 * ★ 它**不在上面那张表里**，和 agents.ts / models.ts 的两个哨兵同一条纪律：
 *   它是**分档的画法**，不是一个可以挑的 logo。放进表里的后果是有人给某个 AI 产品
 *   挑上人形 —— 于是一条模型写的内容顶着"这是人写的"那个记号，而四处全绿。
 * ★ 它刻意**不是彩色的**：彩色是品牌标的语言，"人写的"不属于任何一个品牌。
 */
export const HUMAN_ICON_PATHS: readonly string[] = [
  "M12 9m-3.2 0a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0",
  "M5.5 20a6.5 6.5 0 0 1 13 0",
];

/** 人形和两个待补圈共用的画布（它们是组件里内联画的；品牌标用的是文件自己的 viewBox）。 */
export const AGENT_ICON_VIEWBOX = "0 0 24 24";

const BY_ID = new Map(AGENT_ICONS.map(i => [i.id, i]));

/**
 * 按 id 取一个 logo。**查不到返回 undefined，调用方自己处理** ——
 * 理由同 agents.ts 的 `findAgent()`：不许在这里兜一个"随便给个 logo"的假对象，
 * 那会让"表里删掉了某一行，而登记表还在用它"这件事完全看不出来。
 * （`parseRegistry` 会先一步抛，这里是第二道。）
 */
export function findAgentIcon(id: string | undefined): AgentIcon | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** 这个 id 是不是表里真有的一个 logo。`parseRegistry` 拿它对账。 */
export function isAgentIconId(id: string): boolean {
  return BY_ID.has(id);
}

/** 报错信息里摊出来给人挑的清单。 */
export const AGENT_ICON_IDS: readonly string[] = AGENT_ICONS.map(i => i.id);

/**
 * 后台「图标」那一格的下拉选项。
 *
 * ★ 单色的那几个在标签后面缀「单色」：它们在后台的预览里和站上都是黑白的
 *   （跟着文字颜色走），不缀的话挑的人会以为是 logo 没加载出来。
 * ★ 哨兵「还没挑」排**最后一项**，和 `agentOptions()` / `modelOptions()` 同一条：
 *   它不是挑不挑得中的问题，是"这一格我没答"。
 * ⚠ 但它**是默认值**（和那两格不一样）：那两格默认落在真实选项上是因为站长每天
 *   都要填它们，而图标是加一个智能体时填一次的东西 —— 默认挑一个等于替他认领厂商。
 */
export function agentIconOptions(): { label: string; value: string }[] {
  return [
    ...AGENT_ICONS.map(i => ({
      label: i.tone === "mono" ? `${i.label} · 单色` : i.label,
      value: i.id,
    })),
    { label: "（还没挑图标）", value: AGENT_ICON_UNSET },
  ];
}

/**
 * 一个地址 → CSS 的 `url("…")`，**转义后放进双引号**。
 *
 * 两个消费方：下面的 `logoMaskStyle()`（站上单色 logo 的 mask）、
 * `src/dev/keystaticIconPreview.ts`（后台预览那张样式表）。各拼一份的话，
 * 哪天其中一处又写回 `url('…')`，碰上带单引号的地址就整条声明作废（见下面那段）。
 * CSS 字符串里要转义的只有三样：定界的引号、反斜杠本身、换行（CSS Syntax §4.3.5）。
 */
export function cssUrl(url: string): string {
  const body = url.replace(/["\\\n]/g, c => (c === "\n" ? "\\a " : `\\${c}`));
  return `url("${body}")`;
}

/**
 * 单色 logo 那一格的行内样式：拿 logo 当 CSS mask，颜色由 `background: currentColor` 给。
 *
 * ★ 地址**转义后放进双引号**。这不是洁癖，是实测踩到的：Vite 把小资源内联成
 *   `data:image/svg+xml,…` 时属性用单引号（`fill='currentColor'`），写成 `url('…')`
 *   的话 CSS 字符串在第一个 `'` 就断了，**整条 `mask` 声明作废** —— 那一格画成一块
 *   纯色方块，而彩色那几个（走 `<img>`）照常显示。`agentLogoUrls.ts` 已经改成不内联，
 *   这里是第二道：地址长成什么样都拼不坏这条 CSS。
 * ★ `-webkit-` 那一份不能省：Safari 15.4 之前只认带前缀的，省掉的后果同上（纯色方块）。
 * ★ `print-color-adjust: exact`：打印默认不印背景色，而这个 logo 的颜色**就是**背景色 ——
 *   不写的话打印出来那一格是空的（彩色那几个是 `<img>`，照常印）。
 */
export function logoMaskStyle(url: string): string {
  const mask = `${cssUrl(url)} center / contain no-repeat`;
  return [
    `-webkit-mask: ${mask}`,
    `mask: ${mask}`,
    `-webkit-print-color-adjust: exact`,
    `print-color-adjust: exact`,
  ].join("; ");
}

/**
 * 「这一格该画什么」的**唯一判据**，四档见文件头那张表。
 *
 * ★ 收的是**登记表里那一条**（`findAgent(id)` 的结果），不是 id ——
 *   和 `modelScope(entry)` 同一个形状：调用方手上本来就有那条，
 *   而"表里查不到这个 id"这件事由调用方传 `undefined` 表达，落进 `unknown` 档。
 * ★ 参数写成结构类型而不是 import `AgentEntry`：这个文件零 import（见文件头）。
 */
export type AgentIconSubject =
  { kind: string; name: string; icon?: string } | undefined;

export type AgentIconSlot =
  /** 登记表里的 AI 产品，挑了 logo。**完成态** */
  | { tier: "picked"; icon: AgentIcon }
  /** 「我自己」。**完成态** —— 人写的没有"哪个智能体"这回事，画人形。 */
  | { tier: "human" }
  /** 登记表里的 AI 产品，**还没挑 logo**。待补：虚线圆 + 名字首字。 */
  | { tier: "pending"; letter: string }
  /** 没标 / 登记表里查不到。待补，但说的是另一件事：虚线圆 + `?`。 */
  | { tier: "unknown"; letter: string };

export function agentIconSlot(agent: AgentIconSubject): AgentIconSlot {
  if (agent?.kind === "human") return { tier: "human" };
  // 哨兵「未标注」和"登记表里查不到这个 id"都落这一档：两者都是"不知道这是谁"。
  if (!agent || agent.kind !== "ai") {
    return { tier: "unknown", letter: UNKNOWN_ICON_LETTER };
  }
  const icon = findAgentIcon(agent.icon);
  if (icon) return { tier: "picked", icon };
  return { tier: "pending", letter: initialOf(agent.name) };
}

/**
 * 待补那一档圈里印的字：显示名的第一个字符（拉丁的转成大写）。
 *
 * ★ 它**只是个占位记号，不是身份**：两个智能体的首字撞车（现有四个里
 *   `OpenAI ChatGPT` 和 `OpenAI Codex` 都是 O）完全没关系 —— 旁边就印着全名，
 *   而这个圈要说的事只有一件：**这一个还没挑图标**。
 *   （反过来说，正是因为首字母会撞车，图标本身才不能从名字推 —— 见文件头。）
 * ⚠ 用 `[...name]` 逐**码点**取，不用 `name[0]`：emoji 和某些汉字是代理对，
 *   按 UTF-16 取会拿到半个字符，渲染出来是一个替换符号（�）。
 */
function initialOf(name: string): string {
  const first = [...name.trim()][0];
  // 名字为空在 parseRegistry 那边就抛了（「没有显示名」），这里兜到 `?` 只是类型上的
  // 兜底。⚠ 真落到这儿的话它会和「未标注」长得一样 —— 所以那条校验不许放松。
  return first ? first.toUpperCase() : UNKNOWN_ICON_LETTER;
}
