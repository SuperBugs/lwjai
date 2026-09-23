/**
 * 「清理特殊字符」—— 判据。**纯函数、零 I/O**，裸 tsx 能单测。
 *
 * 治的是同一件事的两种形状：**原样印在页面上、却什么也不表示的字符**。
 * 两种各有各的档（`TidyKind`），屏幕上长得不一样 —— 一个是整行没了，
 * 一个是那一行里少几个字符，压成一句「清掉了」的话人按下去之前不知道会发生什么。
 *
 * ## ① `slash_line`：整行只有反斜杠 / 斜杠
 *
 * 【2026-09-22 用户要的】模型（Spark / Gemini）把算式写成 LaTeX 时，会在段落之间
 * 留下**整行只有 `\\` 的行**（LaTeX 的换行）。站上没有数学渲染，那一行渲染出来
 * 就是一根孤零零的反斜杠杵在两段之间。实测站上 3 份稿子、10 行都是这个形状：
 * 上一行空、下一行空、本行 `\\`。
 *
 * ★ 这是 `stray_backslash`（稿件体检第六条）里**最好治的那一部分**：
 *   `3.76\\%` 那种嵌在算式里的，删掉反斜杠要改到数字旁边，机器不该替人决定；
 *   而**整行只有杠**的那一行，删掉它损失的信息是零 —— 所以只有这一种能一键删。
 *   ⚠ 别把这个函数"顺手"扩成"删掉正文里所有反斜杠"：那会吃掉 `\<`（坑 19 的正解）
 *   和 `\{`，后台从此编不开那一条，而站上零症状。
 *
 * ## ② `escaped_emphasis`：转义掉的 `\*\*`（【2026-09-22 用户要的第二种】）
 *
 * 用户看到的症状是页面上印着 `**最大的风险，…。**反过来，` —— 两个星号明晃晃地
 * 摆在正文里。盘上那一行是 `\*\*最大的风险，…。\*\*反过来，`。
 *
 * 根子是 **CJK 撞上 CommonMark 的 flanking 规则**：收尾那串 `**` 前面是个全角标点
 * （`。` / `：`），后面又紧跟着汉字，按规范它不算 right-flanking，于是**整段没被
 * 解析成粗体**，原样当普通文字。Keystatic 下一次存盘时照实把它转义成 `\*\*`。
 * 站上另一种触发形状是 `**−5.396**`（开头那串后面紧跟着 `−`）。
 *
 * ★ **判据就是"转义过"这件事本身**，不是"看起来像粗体"：
 *   真的粗体在盘上永远是**裸的** `**`，只有解析失败、退化成文字的那些才会被转义。
 *   这不是推理 —— 实测对过两份：`qa/1033.md` 盘上 16 串、渲染出来的页面上
 *   正好 16 个 `**`；`posts/1011.md` 36 对 36，而且页面上除了 `**` 没有别的星号形状。
 * ★ **删掉，而不是"修成真的粗体"。** 要让它真的加粗，得把作者写的标点挪到
 *   `**` 外面、或者在汉字中间塞一个空格 —— 那是机器替人改文章。
 *   删掉标记则是**页面上零损失**：那个粗体本来就没渲染出来过，读者看见的一直是
 *   两个星号。这和 ① 那条"删掉它损失的信息是零"是同一条理由。
 * ⚠ **孤零零的一个 `\*` 不碰**（所以是 `{2,}`）：那可能是脚注星号、乘号，
 *   是作者真想印的一个字符。今天站上一个都没有，这条边界现在不花钱，
 *   而哪天有了，吃掉它是在改意思。
 * ⚠ 别把它放宽成"所有 `\*`"，更别放宽到裸 `**` —— 站上 7000 多个裸 `**` 是
 *   **真的粗体**，吃掉它们的症状是整站排版塌掉，而构建、闸门四处全绿。
 *
 * ### 「剩下那些裸 `**` 会不会重新配对」是真渲染量过的
 *
 * 站上真有一行**字面的和裸的交错着**（posts/1009.md 第 37 行）：
 * `当季**12.772**，同比\*\*+4.9%**、环比约**+3.1%**；TTM约**49.9\*\*`。
 * 删掉字面那几个之后，要是剩下的裸 `**` 换了配对，**粗体范围整个挪位**，
 * 而字一个没少、四处全绿。按 CommonMark 转义过的 `\*` 根本不是分隔符，
 * 所以不该参与配对 —— 但"按规范推"正是这个项目不许的（同 `formatRules.ts`
 * 的 `bare_lt` 那一节）。
 * 【2026-09-22 实测】拿站上真用的 `@astrojs/markdown-remark` 把全部 35 份稿子
 * 清前清后各渲染一遍：**12 份会被清理，把字面 `**` 从两边一起抹掉之后，
 * 11 份 HTML 逐字节相同**；唯一不同的那份（qa/1032）差的是一个 `<p>\</p>`，
 * 那正是 ① 要删掉的东西。钉子在 `scripts/dev/tidy.test.ts`。
 *
 * ## 边界
 *
 *   1. **围栏里的一个字都不碰。** 代码块里一根 `\` 独占一行是 shell 的续行，
 *      是给人抄的字。判围栏用的是 `formatRules.ts` 那一份 `fencedLines()` ——
 *      **不许在这儿另写一个**（坑 7 那个形态：两处各写一份范围/边界判据）。
 *   2. **行内代码（`` `…` ``）里的也不碰**，同一条理由。那一段的正则源同样从
 *      `formatRules.ts` 拿（`INLINE_CODE_SRC`），不在这儿再写一份。
 *   3. **frontmatter 逐字节原样留着。** 这个函数不解析 YAML、更不重新序列化它 ——
 *      gray-matter 那条路会把 `tags` 的写法、引号、顺序全重排一遍，而人只是想删几个字符。
 *   4. **前后都是空行时顺手吃掉一个空行**（只有 ① 那一档）。删完留下两个连续空行，
 *      markdown 渲染一模一样，但下一次 Keystatic 存盘又会把它规整成一个 ——
 *      那会让"我清理过了"和"后台又动过一次"在 git diff 里混成一团。
 *   5. **② 那一档清完变成空行的话，整行删掉**（不是留一个空行）：
 *      `上一行 / \*\* / 下一行` 本来是**一段**，留个空行就把它劈成了两段 ——
 *      那是排版被改了，而不是"去掉两个星号"。
 *
 * ## 为什么删掉的东西不需要备份
 *
 * `content:prune` 那道**没有开关的备份**守的是"整篇稿子没了"。这里不一样：
 * 能被删掉的字节**被这两条正则完全描述**（一行里除了空白就只有 `\` 和 `/`；
 * 或者连着两个以上的 `\*`），而且调用方在按下去之前已经把每一行的行号、原文、
 * 以及这一行属于哪一档摆在屏幕上了。
 * 换句话说，这里没有"不知道删了什么"这一档 —— 那才是备份要救的东西。
 */

import { fencedLines, INLINE_CODE_SRC } from "./formatRules";

/**
 * 整行只有反斜杠 / 斜杠（前后可以有空白，含全角空格 U+3000）。
 *
 * ⚠ `[\\/]+` 是**一根或多根**：站上真有的是 `\\`（LaTeX 换行），
 *   而人手打的多半是一根 `\` 或 `/`。
 * ⚠ 不许放宽到"以反斜杠开头的行"：`\<div>` 开头的正文行是合法的（坑 19 的正解），
 *   那样写会把正文整行吃掉。
 */
export const SLASH_ONLY_LINE = /^[ \t　]*[\\/]+[ \t　]*$/;

/**
 * 连着两个以上**转义过的**星号（`\*\*`、`\*\*\*`）—— 没解析成粗体、原样印出来的
 * 那个标记。理由和"为什么只认转义过的、为什么 `{2,}`"写在文件头 ② 那一节。
 */
export const ESCAPED_EMPHASIS_SRC = String.raw`(?:\\\*){2,}`;

/**
 * 一行里**可以动的那几段**：行内代码（留着）＋ 转义粗体标记（删掉）。
 *
 * ★ 两者写在**同一条**正则里是承重的，不是图省事：先匹配行内代码，
 *   落在它里面的 `\*\*` 就再也不会被单独匹配到一次。分成两步（先找标记、
 *   再判断在不在代码里）要自己算区间，而算错的症状是**误删**。
 * ★ 行内代码那一段的源从 `formatRules.ts` 拿 —— 见那边 `INLINE_CODE_SRC` 上面那段。
 */
const CLEANABLE = new RegExp(`${INLINE_CODE_SRC}|${ESCAPED_EMPHASIS_SRC}`, "g");

/** frontmatter 那一块（含收尾的 `---` 和它后面那个换行），原样留着不解析。 */
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;

/**
 * 哪一种脏。**两档不许压成一档**：一个是这一行整个没了，一个是这一行里少几个
 * 字符、别的字原样 —— 人在按下去之前有权知道是哪一种。
 */
export type TidyKind = "slash_line" | "escaped_emphasis";

export interface TidyRemoval {
  /** **正文里的**行号（1 起，不含 frontmatter）—— 和稿件体检那一条报的是同一套号。
   *  两处说的是同一批行，号对不上的话人会以为是两回事。 */
  line: number;
  /** 那一行**改之前**的原文。摆出来是为了"按下去之前知道要删什么"。 */
  text: string;
  kind: TidyKind;
  /**
   * `escaped_emphasis` 那一档：这一行里去掉了几处标记。
   * `slash_line` 那一档整行都没了，这一格是 undefined —— **不许兜底成 1**，
   * 那会让屏幕上两档长得一样。
   */
  marks?: number;
}

export interface TidyResult {
  /** 清理之后的整份文件原文（frontmatter 逐字节没动）。没得清时和入参一模一样。 */
  text: string;
  removed: TidyRemoval[];
}

/**
 * 清理一份稿子的原文（连 frontmatter 一起进、一起出）。
 *
 * ★ 没得清的时候 `text` **就是入参本身**，调用方据此决定要不要写盘 ——
 *   "没什么可删"和"删完了"必须能分开，不许让调用方去比字符串。
 */
export function tidyText(raw: string): TidyResult {
  const front = FRONTMATTER.exec(raw)?.[0] ?? "";
  const body = raw.slice(front.length);
  const { body: tidied, removed } = tidyBody(body);
  return { text: removed.length === 0 ? raw : front + tidied, removed };
}

/**
 * 去掉一行里转义过的粗体标记，**行内代码原样留着**。
 * 还回改完的那一行和去掉了几处 —— 0 处就是这一行不用动。
 */
export function stripEscapedEmphasis(line: string): {
  line: string;
  marks: number;
} {
  let marks = 0;
  const text = line.replace(CLEANABLE, m => {
    if (m.startsWith("`")) return m; // 行内代码：一个字都不碰
    marks += 1;
    return "";
  });
  return { line: text, marks };
}

/** 只清正文那一半（不含 frontmatter）。行号从正文第一行算起。 */
export function tidyBody(body: string): { body: string; removed: TidyRemoval[] } {
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  const lines = body.split(/\r?\n/);
  const inFence = fencedLines(lines);
  const out: string[] = [];
  const removed: TidyRemoval[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (inFence[i]) {
      out.push(line);
      continue;
    }

    // ① 整行只有杠 → 整行删掉。
    if (SLASH_ONLY_LINE.test(line)) {
      removed.push({ line: i + 1, text: line, kind: "slash_line" });
      // 前后都是空行 → 连着吃掉下面那个空行（理由见文件头第 4 条）。
      const prevBlank = out.length > 0 && out[out.length - 1]!.trim() === "";
      const nextBlank = (lines[i + 1] ?? "").trim() === "";
      if (prevBlank && nextBlank) i += 1;
      continue;
    }

    // ② 转义掉的 `\*\*` → 只去掉那几个标记，这一行别的字节原样。
    const { line: cleaned, marks } = stripEscapedEmphasis(line);
    if (marks === 0) {
      out.push(line);
      continue;
    }
    removed.push({ line: i + 1, text: line, kind: "escaped_emphasis", marks });
    // 清完只剩空白（这一行本来就只有那个标记）→ 整行删掉。留一个空行会把
    // 本来的一段劈成两段 —— 那是改排版，不是"去掉两个星号"（文件头第 5 条）。
    if (cleaned.trim() !== "") out.push(cleaned);
  }

  return { body: out.join(eol), removed };
}
