/**
 * `pnpm content:import` 的**判据核心**：把一段粘贴进来的模型输出，规划成一条草稿。
 *
 * ★ 纯内存 —— 不碰磁盘、不问 git、不 process.exit。I/O 全在 ./import.ts。
 *   分开是为了让 import.test.ts 能喂**真实形状的模型输出**去测判据
 *   （研究提示词交付的第一行是 `# TSLA｜特斯拉`，第二行是「分析：… 报价：…」）。
 *
 * ## 它替人做的几件事，以及每一件的边界
 *
 *   - 标题：第一个一级标题，**从正文里摘走**（站上标题是 <h1>，留在正文里会重复一遍）
 *   - 标的：先找「研究对象：CODE（公司名）」行（subject_line），再看标题
 *     `CODE｜公司名`（title），都没有就 **unknown + 警告** —— 那是待补，不是"不讲单只票"
 *   - 摘要：没给 `--description` 就从第一段截 120 字，**并警告** —— 它是占位，不是成品
 *   - 时间：导入时刻（`pubDatetime` 写的是 UTC，站上按北京时间显示 —— docs/engineering-notes.md 坑 1）
 *   - 地址：不给 `--slug` 就是**全站统一的下一个号**（`src/config/entryNo.ts`，
 *     后台里「地址」那一格读同一份判据）。★ 号从 `existingIds` 推，而这个函数
 *     不碰磁盘 —— **调用方必须把四个集合现有的 id 都喂进来**，少喂一个集合就是撞号
 *   - 智能体 / 模型：`--agent` / `--model` 两维，都对着登记表验；AI 写的没给模型**警告**
 *   - **后台打得开**：裸 `<`（「机构<20%」）转成 `\<` 并报一行 —— 后台正文按 MDX 解析，
 *     不转就是一条**编不开**的稿子，而站上和构建零症状。见 escapeForMdxBody()
 *   - **永远 draft: true。** 这个脚本产出的是半成品：摘要是截的、标的可能没认出来、
 *     智能体 / 模型可能没标。真正的发布动作仍然是人在后台看一遍、取消草稿、提交。
 *
 * 零 astro import（裸 tsx 跑）。SYMBOL_RE 从 src/config/symbol.ts 取 —— 和 schema 同一份。
 */

import {
  AGENT_IDS,
  findAgent,
  UNSPECIFIED_AGENT,
} from "../../src/config/agents";
import { isEntryNo, nextEntryNo } from "../../src/config/entryNo";
import { MODEL_IDS, UNSPECIFIED_MODEL } from "../../src/config/models";
import {
  QUESTION_KEY_HINT,
  QUESTION_KEY_RE,
} from "../../src/config/questionKey";
import {
  SYMBOL_RE,
  symbolKey,
  type SymbolSource,
} from "../../src/config/symbol";
import { requireCollectionSpec } from "../../src/config/collections";
import { TAGS, unknownTags } from "../../src/config/tags";
import { unknownSymbols } from "../../src/config/symbols";

export type ImportCollection = "posts" | "qa";

export interface ImportOptions {
  collection: ImportCollection;
  /** 粘贴进来的模型输出，原样。 */
  markdown: string;
  /** 导入时刻 = 发布时间。 */
  now: Date;
  /**
   * **全站四个编号集合**现有条目的 id（`["1", "2", …]`），号从这里推。
   *
   * ★ 必填，不给默认值：默认成 `[]` 的话第一次导入就会算出 `1`，
   *   而 `1` 早就有人了 —— 这个函数不碰磁盘，它没有第二条路知道这件事。
   *   I/O 层（`import.ts` / `src/dev/import-run.ts`）负责读盘喂进来。
   */
  existingIds: readonly string[];
  /** 哪个智能体写的 / 答的（src/config/agents.ts 的 id）。 */
  agent?: string;
  /** 那个智能体底下跑的是哪个模型（src/config/models.ts 的 id）。 */
  model?: string;
  slug?: string;
  title?: string;
  description?: string;
  /** 只有 posts 有：用的是站上哪份提示词（id）。存不存在由 I/O 层查。 */
  prompt?: string;
  /** 只有 qa 有：问题组。 */
  questionKey?: string;
  /** 显式给的标的（manual）。CLI 的 `--symbol` 只给得出一只。 */
  symbol?: string;
  symbolName?: string;
  /**
   * 显式给的**好几只**标的（manual）。【2026-09-22】粘贴导入那条路用它 ——
   * 一条问答可以讲好几只票。和 `symbol` 一起给就并起来去重。
   * ⚠ 名字只有 `symbolName` 一格（对应 `symbol` 那一只）：模型交上来的 JSON 里
   *   其余几只只有代码。表里没有的那几只会被登记成**只有代码的一行**，
   *   名字去后台补 —— 那比替它编一个名字好。
   */
  symbols?: string[];
  /** 标签。CLI 不给；粘贴导入（src/dev/import-run.ts）从 JSON 里带过来。 */
  tags?: string[];
}

export interface ImportPlan {
  /** 仓库根相对、正斜杠。 */
  file: string;
  slug: string;
  title: string;
  description: string;
  /** 这一条讲哪几只票（标的表里的代码）。一只都没认出来就是空数组。 */
  symbols: string[];
  /**
   * 这几只票**标的表里还没有**，I/O 层要替它们加一行（`withSymbolRow()`）。
   *
   * ★ 这是标的和标签**刻意不一样**的一处：表外的标签直接丢掉，表外的标的**登记进去**。
   *   丢掉一个标签只是少一个分类；丢掉标的等于把这条内容从 `/s/<代码>` 上整个摘出去，
   *   而那正是它最该出现的地方。代码又是机器可验的（SYMBOL_RE），不像标签那样
   *   会长出「财报」「财报解读」这种同义写法。完整理由在 src/config/symbols.ts 文件头。
   * ⚠ 这里只是**计划**：真正写盘的是 I/O 层（scripts/content/import.ts 和
   *   src/dev/import-run.ts），两处读同一个 `withSymbolRow()`。
   */
  newSymbols: { code: string; name?: string }[];
  symbolSource: SymbolSource;
  agent: string;
  /** 人写的（agent 是 human 档）时恒为哨兵，而且不写进 frontmatter。 */
  model: string;
  /** YAML 块，不含 `---` 围栏。 */
  frontmatter: string;
  body: string;
  /** 完整文件内容。 */
  text: string;
  /** 给人看的：哪些地方是脚本猜的、要回来补。 */
  warnings: string[];
}

/** 输入本身有问题（不是"猜不出来"）。I/O 层拿到它就报错退出，不写文件。 */
export class ImportError extends Error {}

const DESCRIPTION_MAX = 120;

/** 第一个一级标题；返回标题和**摘掉它之后**的正文。 */
function takeFirstHeading(md: string): { title?: string; rest: string } {
  const lines = md.split("\n");
  const at = lines.findIndex(l => /^#\s+\S/.test(l));
  if (at < 0) return { rest: md };
  const title = lines[at]!.replace(/^#\s+/, "")
    .replace(/\s*#+\s*$/, "")
    .trim();
  lines.splice(at, 1);
  return { title, rest: lines.join("\n").replace(/^\n+/, "") };
}

/** 摘要用：去掉行内 markdown 记号，只留字。 */
function plainText(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 第一段正文。跳过标题、表格、引用、列表、分隔线，以及提示词模板固定的那行
 * 「分析：…｜报价：…」—— 那一行是元数据，不是摘要。
 */
function firstParagraph(body: string): string | undefined {
  const lines = body.split("\n");
  let i = 0;
  const skip = (l: string) =>
    l.trim() === "" ||
    /^\s*(#|\||>|-\s|\*\s|\d+[.)]\s|---|\*\*\*)/.test(l) ||
    /^\s*(分析|報價|报价)[：:]/.test(l);
  while (i < lines.length && skip(lines[i]!)) i++;
  if (i >= lines.length) return undefined;
  const para: string[] = [];
  while (
    i < lines.length &&
    lines[i]!.trim() !== "" &&
    !/^\s*(#|\||>)/.test(lines[i]!)
  ) {
    para.push(lines[i]!.trim());
    i++;
  }
  const text = plainText(para.join(""));
  return text || undefined;
}

type Detected = {
  /** 认出来的那几只票（大写代码，已去重）。 */
  symbols: { code: string; name?: string }[];
  source: SymbolSource;
  warning?: string;
};

/** 代码去重 —— 按 `symbolKey()` 归一比（`BRK.B` 和 `BRK-B` 是同一只）。
 *  名字保留**第一次见到**的那个：显式给的 `--symbol-name` 排在最前面。 */
function dedupeSymbols(
  list: readonly { code: string; name?: string }[]
): { code: string; name?: string }[] {
  const out: { code: string; name?: string }[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const key = symbolKey(item.code);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function detectSymbol(o: ImportOptions, md: string, title: string): Detected {
  /** 显式给的那几只（`--symbol` 一只 + JSON 里的 `symbols` 若干）。 */
  const explicit = [o.symbol, ...(o.symbols ?? [])]
    .map(s => s?.trim())
    .filter((s): s is string => Boolean(s));
  if (explicit.length > 0) {
    const rows = explicit.map((raw, i) => {
      const code = raw.toUpperCase();
      if (!SYMBOL_RE.test(code)) {
        throw new ImportError(
          `标的「${raw}」不像美股代码（要像 TSLA / BRK.B：1~5 个大写字母）。`
        );
      }
      // 名字只有一格，它属于**第一只**（`--symbol` / JSON 里的 `symbol`）。
      return i === 0
        ? { code, name: o.symbolName?.trim() || undefined }
        : { code };
    });
    return { symbols: dedupeSymbols(rows), source: "manual" };
  }

  // 提示词自带的那一行：「研究对象：TSLA（特斯拉）」，全文任何位置。
  const subject =
    /研究对象[：:]\s*([A-Za-z]{1,5}(?:[.-][A-Za-z]{1,2})?)\b\s*(?:[（(]\s*([^（）()\n]{1,30}?)\s*[）)])?/.exec(
      md
    );
  if (subject) {
    const code = subject[1]!.toUpperCase();
    if (SYMBOL_RE.test(code)) {
      return {
        symbols: [
          { code, name: o.symbolName?.trim() || subject[2]?.trim() || undefined },
        ],
        source: "subject_line",
      };
    }
  }

  // 标题：`TSLA｜特斯拉` / `TSLA | Tesla` / `TSLA：三季度点评`。
  const fromTitle =
    /^([A-Za-z]{1,5}(?:[.-][A-Za-z]{1,2})?)\s*[｜|:：\-–—]\s*(.+)$/.exec(
      title.trim()
    );
  if (fromTitle) {
    const code = fromTitle[1]!.toUpperCase();
    if (SYMBOL_RE.test(code)) {
      const after = fromTitle[2]!.trim();
      // 分隔符后面那一截像公司名（短、不是一句话）才当名字；像一句话就不当。
      const looksLikeName =
        after.length <= 12 && !/[，。；！？,.;!?]/.test(after);
      return {
        symbols: [
          {
            code,
            name: o.symbolName?.trim() || (looksLikeName ? after : undefined),
          },
        ],
        source: "title",
      };
    }
  }

  return {
    symbols: [],
    source: "unknown",
    warning:
      "没认出这篇讲哪只票：标的留空、symbolSource: unknown（**待补**）。" +
      "讲单只票就在后台勾上；本来就不讲单只票（宏观、方法论）就把 symbolSource 改成 manual。",
  };
}

/** YAML 双引号标量：JSON.stringify 的产物恰好是合法的 YAML 1.2 双引号标量。 */
const yamlStr = (v: string) => JSON.stringify(v);

/**
 * 后台正文是 **MDX**（`keystatic.config.ts` 的 `fields.mdx`，那里记着为什么不能换成
 * markdoc），所以 `<` 后面直接跟字母或数字，对它就是一次 JSX 开标签。
 *
 * 【2026-09-20 踩到】一份提示词 里一句「机构\<20%」，
 * 后台打开那一条只有一行 `Unexpected character \`2\` … before name`，**整条编不开**。
 * 而站上一切正常 —— Astro 读 .md 是 CommonMark，`<20%` 在那边就是一段字。
 * 也就是说：导入时不转，是把一条打不开的稿子写进仓库，而屏幕上什么都不会说。
 *
 * 转成 `\<` 是 **Keystatic 自己存回来的写法**（`src/content/posts/orcl-20260916.md`
 * 那句 `GC \< 0.5%` 就是它写的），实测在后台存一次盘一个字不改；站上渲染成 `<`。
 *
 * ★ 代码围栏和行内代码里的 `<` **不许动**：那里面的字是原样发出去给人抄的，
 *   而且 MDX 本来就不解析围栏里的东西。
 *
 * ⚠ 这只治 `<` 这一种。花括号（LaTeX）是另一种坏法，而且**不能**照着转义成 `\{` ——
 *   `\frac\{V(S)\}` 跟着 .md 导出口到读者桌面上就是坏公式，正确改法是包进代码围栏。
 *   所以那一种只警告（`braceWarning()`），不自动改。
 */
export function escapeForMdxBody(md: string): { body: string; count: number } {
  let count = 0;
  // 先把围栏和行内代码整段切出来，只在"围栏之外"那些片段上替换。
  const parts = md.split(/(^```[\s\S]*?^```$|`[^`\n]*`)/gm);
  const body = parts
    .map((part, i) =>
      // split 的捕获组落在奇数位 —— 那些是代码，原样留着。
      i % 2 === 1
        ? part
        : part.replace(/(?<!\\)<(?=[0-9A-Za-z])/g, () => {
            count += 1;
            return "\\<";
          })
    )
    .join("");
  return { body, count };
}

/** 成段花括号：转义会毁掉公式，只能点名让人自己包围栏。 */
function braceWarning(md: string): string | undefined {
  const lines = md.split("\n");
  let inFence = false;
  const hit: number[] = [];
  for (const [i, line] of lines.entries()) {
    if (/^```/.test(line.trim())) inFence = !inFence;
    else if (!inFence && line.includes("{")) hit.push(i + 1);
  }
  if (!hit.length) return undefined;
  const where = hit.slice(0, 5).join("、") + (hit.length > 5 ? " …" : "");
  return (
    `正文第 ${where} 行有花括号，而后台正文是按 MDX 解析的：` +
    "括号里不是合法 JS 就整条编不开，恰好是合法 JS（`{5,i}`）会被编辑器**静默吃掉**。" +
    "公式这类请自己**包进代码围栏**（不要转义成 `\\{`，那样导出的 .md 里是坏公式）。"
  );
}

export function planImport(o: ImportOptions): ImportPlan {
  const warnings: string[] = [];
  const md = (o.markdown ?? "").replaceAll("\r\n", "\n").trim();
  if (!md) throw new ImportError("正文是空的 —— 没有东西可导入。");

  if (o.collection !== "posts" && o.collection !== "qa") {
    throw new ImportError(
      `--collection 只认 posts / qa，拿到的是「${String(o.collection)}」。`
    );
  }
  if (o.prompt && o.collection !== "posts") {
    throw new ImportError(
      "--prompt 只有研究稿（posts）有：问答不是拿提示词跑出来的。"
    );
  }
  if (o.questionKey && o.collection !== "qa") {
    throw new ImportError("--question-key 只有问答（qa）有。");
  }
  if (o.questionKey && !QUESTION_KEY_RE.test(o.questionKey)) {
    throw new ImportError(
      `--question-key「${o.questionKey}」格式不对：${QUESTION_KEY_HINT}。`
    );
  }

  // ── 标题 ──
  const { title: h1, rest } = takeFirstHeading(md);
  let title = o.title?.trim() || h1;
  let body = h1 !== undefined ? rest : md;
  if (!title) {
    const first = md.split("\n").find(l => l.trim() !== "") ?? "";
    title = plainText(first).slice(0, 60);
    body = md;
    warnings.push(
      "没找到一级标题（`# …`），拿第一行当标题了 —— 发布前改一下。"
    );
  }

  // ── 标的 ──
  const det = detectSymbol(o, md, title);
  if (det.warning) warnings.push(det.warning);

  // ── 摘要 ──
  let description = o.description?.trim() ?? "";
  if (!description) {
    const para = firstParagraph(body) ?? "";
    description =
      para.length > DESCRIPTION_MAX
        ? `${para.slice(0, DESCRIPTION_MAX - 1)}…`
        : para;
    if (description) {
      warnings.push(
        "摘要是从正文第一段截的，它是占位 —— 发布前改成一句像样的话（列表页、RSS、分享卡都用它）。"
      );
    } else {
      description = "（待补摘要）";
      warnings.push(
        "正文里找不到一段能当摘要的话，先写了「（待补摘要）」—— 发布前必须改。"
      );
    }
  }

  // ── 谁写的 / 谁答的 ──
  const agent = o.agent?.trim() || UNSPECIFIED_AGENT;
  if (!AGENT_IDS.includes(agent)) {
    throw new ImportError(
      `--agent「${agent}」不在登记表里。可选：${AGENT_IDS.join(" / ")}（src/config/agents.ts）。`
    );
  }
  if (agent === UNSPECIFIED_AGENT) {
    warnings.push(
      o.collection === "qa"
        ? "没标是哪个智能体答的（--agent）。问答**不标发不出去**：取消草稿前在后台选一个。"
        : "没标是哪个智能体写的（--agent）。页面上会显示「来源未标注」—— 那是待补，不是「我自己写的」。"
    );
  }

  // ── 第二维：底下跑的是哪个模型 ──
  // 和 schema（content.config.ts 的 checkAgentModel）同一套规矩：判 kind，不比 id 字面量。
  const model = o.model?.trim() || UNSPECIFIED_MODEL;
  if (!MODEL_IDS.includes(model)) {
    throw new ImportError(
      `--model「${model}」不在登记表里。可选：${MODEL_IDS.join(" / ")}（src/config/models.ts）。`
    );
  }
  const agentKind = findAgent(agent)?.kind;
  if (agentKind === "human" && model !== UNSPECIFIED_MODEL) {
    throw new ImportError(
      "--agent human 是「我自己写的」，不该再给 --model：人写的没有模型这回事。" +
        "是 AI 写的就把 --agent 换成那个智能体。"
    );
  }
  if (agentKind === "ai" && model === UNSPECIFIED_MODEL) {
    warnings.push(
      o.collection === "qa"
        ? "没标底下跑的是哪个模型（--model）。问答**不标发不出去**：取消草稿前在后台选一个。"
        : "没标底下跑的是哪个模型（--model）。页面上会显示「模型未标注」—— 那是待补。"
    );
  }

  // ── 地址 = 一个**全站统一的递增号**，判据在 src/config/entryNo.ts（后台那一格读同一份）。
  //    【2026-09-21】换掉了「标的-日期时分-智能体-模型」，理由写在那个文件开头。
  const slug = o.slug?.trim() || nextEntryNo(o.existingIds);
  if (!isEntryNo(slug)) {
    throw new ImportError(
      `地址「${slug}」不是一个条目号。这个站的地址是全站统一的递增数字（/posts/7），` +
        `只许 1、2、3… 这样的十进制数字，不许前导零。` +
        `不给 --slug 的话脚本自己算下一个号，一般不用管它。`
    );
  }

  // ── frontmatter ──
  const fm: string[] = [
    `title: ${yamlStr(title)}`,
    `description: ${yamlStr(description)}`,
    // 不加引号：Keystatic 就是这么写的，zod 的 z.date() 要的是 YAML 时间戳，不是字符串。
    `pubDatetime: ${o.now.toISOString()}`,
  ];
  /**
   * 标的：**表里没有的那几只，这里不丢，交给 I/O 层去登记一行**
   * （`ImportPlan.newSymbols` 上写着为什么和标签刚好相反）。
   *
   * ⚠ 所以这里写进 frontmatter 的代码可能**此刻还不在表里** —— 它在 I/O 层
   *   写完那一行之后才在。两件事必须一起做：只写稿子不登记，这条草稿在后台
   *   打不开、构建也红；只登记不写稿子，表里多一行没人用的票（无害但没意义）。
   */
  const newSymbols = det.symbols.filter(
    s => unknownSymbols([s.code]).length > 0
  );
  if (newSymbols.length > 0) {
    warnings.push(
      `这几只票不在标的表里，已经替你加进去了：` +
        `${newSymbols.map(s => `「${s.code}${s.name ? ` ${s.name}` : ""}」`).join("、")}。` +
        `${newSymbols.some(s => !s.name) ? "其中有没填公司名的 —— " : ""}` +
        `去后台左侧「标的」那一页把中英文名补上（站上只印代码，不编名字）。`
    );
  }
  const symbols = det.symbols.map(s => s.code);
  fm.push(`symbols: [${symbols.map(yamlStr).join(", ")}]`);
  fm.push(`symbolSource: ${det.source}`);
  fm.push(`agent: ${agent}`);
  // 人写的不写 model 行：那一格对它不适用，写一行 unspecified 会被读成"还没填"。
  if (agentKind !== "human") fm.push(`model: ${model}`);
  // ★ 这两格指向**另一条内容的地址**，而地址现在是数字 —— 不加引号的话
  //   `prompt: 1` 被 YAML 读成 number，schema 那边报一句
  //   「Expected string, received number」，而人看着这一行完全正常。
  //   （content.config.ts 的 entryRefValue 会把数字折回字符串兜一道，
  //    但**写出来的东西自己要是对的**，不该靠下游纠正。）
  if (o.prompt) fm.push(`prompt: ${yamlStr(o.prompt)}`);
  if (o.questionKey) fm.push(`questionKey: ${yamlStr(o.questionKey)}`);
  // 标签写成 YAML 流式序列（JSON 字符串是合法的 YAML 双引号标量）：`tags: ["财报", "估值"]`。
  // ★【2026-09-21】标签是**封闭词表**（后台「标签」那一页，判据 src/config/tags.ts）。
  //   模型吐出来的标签多半是它自己现编的词（「AI算力」「美股」），那些词：
  //   ① 在站上会各自生成一个只有一条内容的孤儿标签页；
  //   ② 写进 frontmatter 之后这条草稿在后台**打不开**（multiselect 对表外的值直接抛），
  //      而人正是要去后台把这条草稿改成成品的。
  //   所以表里没有的**丢掉并报一行**，不是静默丢 —— 丢了不说等于替它决定了分类。
  const given = (o.tags ?? []).map(t => t.trim()).filter(Boolean);
  const dropped = unknownTags(given);
  const tags = given.filter(t => !dropped.includes(t));
  if (dropped.length > 0) {
    warnings.push(
      `这几个标签不在标签表里，已经丢掉：${dropped.map(t => `「${t}」`).join("、")}。` +
        `留着的话这条草稿在后台打不开，站上也会多出几个只有一条内容的标签页。` +
        `真要用就去后台左侧「标签」那一页加一行，再回到这条稿子上勾。` +
        `（表里现在有：${TAGS.join(" / ") || "一个都没有"}）`
    );
  }
  fm.push(
    `tags: [${tags.map(yamlStr).join(", ")}]`,
    "featured: false",
    "draft: true"
  );

  const frontmatter = fm.join("\n");
  // ── 后台打不打得开 ──
  // 站上怎么渲染和后台能不能编开是两回事：下面这两条只影响后台，构建永远是绿的。
  const escaped = escapeForMdxBody(body.trim());
  if (escaped.count > 0) {
    warnings.push(
      `正文里 ${escaped.count} 处裸 \`<\` 转成了 \`\\<\`（如「机构<20%」）：` +
        "不转的话这一条在后台**编不开**，而站上和构建都看不出任何区别。" +
        "站上仍然渲染成 `<`，这也是 Keystatic 自己存回来的写法。"
    );
  }
  const braces = braceWarning(escaped.body);
  if (braces) warnings.push(braces);
  const cleanBody = `${escaped.body}\n`;
  const text = `---\n${frontmatter}\n---\n\n${cleanBody}`;
  const file = `${requireCollectionSpec(o.collection).dir}/${slug}.md`;

  return {
    file,
    slug,
    title,
    description,
    symbols,
    newSymbols,
    symbolSource: det.source,
    agent,
    model,
    frontmatter,
    body: cleanBody,
    text,
    warnings,
  };
}
