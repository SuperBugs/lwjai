/**
 * 稿件体检 —— 判据。**纯函数、零依赖**，裸 tsx 能直接加载和单测。
 *
 * ## 它和发布闸是两件事，别合并
 *
 * 发布闸（`scripts/gate/`）管的是「**这段字该不该发出去**」—— 仓位、成本、凭证，
 * 发出去就收不回来。这一份管的是「**发出去之后长什么样**」：稿子会不会被解析成
 * 另一种东西、后台还能不能打开、目录里会不会少掉半篇。
 *
 * 和消毒层（`src/config/sanitize.ts`）是同一个关系，docs/gate.md 第 8 节那句话
 * 原样适用：闸门管该不该发，消毒管发出去会不会执行，这一份管发出去长不长歪。
 * 三者共用的只有**范围**（`src/config/collections.ts` 那张登记表），判据各是各的。
 *
 * ## 每一条规则都对应一次真出过的事
 *
 * 不是照着"markdown 最佳实践"列的清单 —— 那种清单会天天咬正确的句子，
 * 而闸门一旦天天误伤，人就会养成整体绕过它的习惯（docs/gate.md 第 7 节）。
 * 下面六条，每一条后面都跟着一个日期和一个真实症状：
 *
 * | 码 | 档 | 真实症状 |
 * |---|---|---|
 * | `empty_body`      | block | 【2026-09-21】`/posts/8` 建出来 `draft: false` 正文全空，闸门绿、astro check 绿、构建绿，站上一页只有标题 |
 * | `setext_eaten`    | block | 【2026-09-21 实测】`一段话` 下一行写 `---`，那段话**变成 `<h2>`**，分隔线消失，零报错 |
 * | `bare_lt`         | block | 【2026-09-20 坑 19】裸 `<` 后跟字母数字 → 后台那一条**编不开**，而站上 / 构建 / 闸门全绿 |
 * | `h1_in_body`      | warn  | 【2026-09-21】`/posts/8` 七个主段写成 `#`，`tocItems()` 只收 h2/h3 → 目录里少了六段，页面照画 |
 * | `stray_backslash` | warn  | 【2026-09-21 查实】模型把算式写成 LaTeX，而这个站没装数学渲染 —— `dist/r/1002/index.html` 里印出来的就是 `14.94\%$`，连反斜杠一起 |
 * | `unlabeled_source`| warn  | 【2026-09-21】`agent: unspecified` 发出去，芯片印「来源未标注」—— 合法的一档，但多半是忘了标 |
 *
 * ## 档位：坏页面拦，待补警（站长定的）
 *
 * block = 读者会看到一个**坏掉的页面**，或者作者自己回头**改不动这条稿子**。
 * warn  = **能发，但你要知道自己写了这几处**。里面是两类东西，别读成单一的"待补"：
 *           ① 还没填完（来源没标、章节级别不对）；
 *           ② 印出来难看，但**读得懂、改得动**（`stray_backslash`）。
 *         两类都不许拿来拦住发版。
 * ⚠ 两档不许互换着用来"figure 一下"：把 warn 提成 block 会让"还没来得及标"
 *   变成发不出去，人就会去找绕过的办法；把 block 降成 warn 则是明知页面是坏的还发。
 *
 * ## `stray_backslash` 长期就在 warn 档
 *
 * 【2026-09-21 立，2026-09-22 站长定死】立它那天写的是"有期限的妥协：站上已经有
 * 7 份这样的稿子（posts 1002 / 1006 / 1008 / 1013 / 1015 / 1018、qa 1003，共 40 行），
 * 清干净就提成 block"。**一天之后那笔账从 7 份涨到 8 份** —— 新交上来的 1020.md
 * 又带了 3 处。源头是每天的模型输出，那不是一批存量，是**常流**；
 * 一条写着"有期限"而到期条件永远不满足的规则，就是这个项目最在意的那种
 * 「以为有保障，其实没有」。所以它不再自称临时。
 *
 * ★ 按上面那条分法它本来也在 warn 这一侧：三条 block 各自**毁掉一样东西**
 *   （一页没有正文 / 一整段被吃成标题、意思变了 / 作者从此改不动那一条），
 *   而这一条**什么都没毁** —— 数字、单位、结论全在，多出来的是几根杠。
 *   难看，但读者读得懂、作者随时改得动。拿它拦住发版，换来的是人去找绕过的办法
 *   （文件头"宁可漏报"那一段的另一半）。
 * ⚠ 它**不是**"可以不管"：warn 逐条列在屏幕上正是为了让人顺手改掉，
 *   每条命中里都写着改法（算式改成普通文字，或整段包进代码围栏）。
 * ⚠ 哪天真要提成 block，那是**重新做一次决定**（清干净 ＋ 确认新稿不再带 LaTeX），
 *   不是自动到期 —— 连 `formatRules.test.ts` 里那条"必须是 warn"的断言一起改。
 *
 * ## `bare_lt` 那条的边界是**拿 MDX 真的编一遍量出来的**
 *
 * 【2026-09-21】判据写完之后拿后台用的那个解析器（`@mdx-js/mdx` 3.1.1，报错文案和
 * 坑 19 记的那句逐字一样）挨个编过一遍，两处原来靠"想当然"划的边界当场被推翻：
 *
 * | 写法 | 以为 | 实测 |
 * |---|---|---|
 * | `<https://sec.gov/x>`（自动链接） | markdown 语法，该豁免 | **编不开**（MDX 让你写 `[文字](url)`）|
 * | `<someone@example.com>` | 同上 | **编不开** |
 * | `<!-- 注释 -->` | 没想到 | **编不开**（MDX 让你改用大括号那种注释）—— 所以 `!` 也在字符类里 |
 * | 四空格缩进里的 `机构<20%` | 缩进是代码块，该豁免 | **编不开** —— MDX 根本没有缩进代码块这回事 |
 * | 围栏里的 `<div>`、行内码里的 `` `<div>` ``、`\<`、`< ` 带空格 | 应该没事 | 编得开 ✓ |
 *
 * 照"markdown 规范"写这条规则，会**同时**多出两个漏网（自动链接、HTML 注释）和
 * 一个误伤（缩进块）。这正是 docs/engineering-notes.md 第三节那条纪律的意思：用例要从真实行为来，
 * 不许照着正则或规范反推。
 *
 * ## 宁可漏报，不许误伤
 *
 * 这份判据会**拦住构建**，所以每条规则的边界都往"少报"那一侧划：上一行像是
 * 列表 / 表格 / 引用 / 标题的，`setext_eaten` 一律不报（实测那几种不会吃上一行，
 * 见 `formatRules.test.ts` 的 C 组）。漏掉一种变体的代价是"有一天页面长歪了"，
 * 误伤一次的代价是"这条规则从此被绕过"，后者贵得多。
 */

export type FormatTier = "block" | "warn";

export type FormatCode =
  | "empty_body"
  | "setext_eaten"
  | "bare_lt"
  | "h1_in_body"
  | "stray_backslash"
  | "unlabeled_source";

export interface FormatFinding {
  code: FormatCode;
  tier: FormatTier;
  /** 正文里的行号（1 起）。**0 = 不指向某一行**（整篇的事，比如正文全空）。 */
  line: number;
  /** 命中的那一行原文（截断过）。空串表示这条命中没有可摆的原文。 */
  excerpt: string;
  /** 这条规则为什么存在 —— 报告里逐条印出来。
   *  只说"不通过"等于让人去删掉正确的句子（docs/gate.md 第 4 节）。 */
  why: string;
}

export interface FormatInput {
  /** 去掉 frontmatter 的正文原文。 */
  body: string;
  /** 草稿不生成页面，所以"页面长歪"和"还没填完"这两类对它都不成立。 */
  draft: boolean;
  /**
   * 来源那两格的状态。
   *
   * ★ **调用方用登记表的 `kind` 判好再传进来**，这里不碰 `agent === "human"`
   *   这种字面量（docs/engineering-notes.md 第二节点名禁止）。哪天多一个"人"档或多一个 AI 档，
   *   改的是登记表，不是这个文件。
   * ★ 没有 `agent` 这一格的集合（教程 / 提示词 / 单页）两个都传 false ——
   *   "这个集合本来就不讲谁写的"是**完成态**，不是待补。
   */
  source: {
    /** 有 agent 这一格、而且填的是"还没标"那个哨兵。 */
    agentPending: boolean;
    /** AI 写的、但模型那一格是"还没标"。人写的不适用（modelSlot 的三档）。 */
    modelPending: boolean;
  };
}

/** 报告里每行原文最多摆这么多字，再长就截断。 */
const EXCERPT_MAX = 60;

const clip = (s: string): string => {
  const t = s.trim();
  return [...t].length <= EXCERPT_MAX ? t : `${[...t].slice(0, EXCERPT_MAX).join("")}…`;
};

/**
 * 每一行是不是在围栏代码块里面。
 *
 * ★ 围栏里的字**一个规则都不适用**：那里 `<div>` 是给人看的示例，`---` 是 YAML
 *   例子，`# 标题` 是 shell 注释。对着代码块报警是最典型的误伤。
 * 开合围栏按 CommonMark：``` 或 ~~~，开的那根多长，合的那根不许更短。
 */
export function fencedLines(lines: readonly string[]): boolean[] {
  const inFence: boolean[] = [];
  let fence: { char: string; len: number } | null = null;
  for (const line of lines) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence === null) {
      // 开围栏那一行本身算"在里面"：它不是正文。
      if (m) fence = { char: m[1]![0]!, len: m[1]!.length };
      inFence.push(fence !== null);
    } else {
      inFence.push(true);
      if (m && m[1]![0] === fence.char && m[1]!.length >= fence.len) fence = null;
    }
  }
  return inFence;
}

/**
 * 行内代码（`` `…` ``）那一段的正则**源**。
 *
 * ★ **只许有这一份**：`tidyPlan.ts` 拿它拼自己那条（那边要在行内做替换，
 *   而围栏之外还得躲开行内代码）。两处各写一个"什么算行内代码"，
 *   总有一天一处认得出另一处认不出 —— 而那一天的症状是**误删**，
 *   同坑 7 那个形态（两处各写一份范围 / 边界判据）。
 */
export const INLINE_CODE_SRC = "`[^`]*`";

/** 去掉行内代码（`` `…` ``）—— 里面的 `<` 不会被 MDX 当标签，`\approx` 也是给人抄的。 */
const INLINE_CODE_G = new RegExp(INLINE_CODE_SRC, "g");
const stripInlineCode = (line: string): string => line.replace(INLINE_CODE_G, "");

/**
 * 会**原样印在页面上**的反斜杠：`\` 后面跟字母（CommonMark 只许转义标点，
 * 所以 `\approx` 里那根杠是一个普通字符），或者 `\\`（转义出来还是一根真的杠）。
 *
 * ⚠ **标点那一档不许加进来。** `\<` `\{` `\&` 恰恰是 Keystatic 存盘时自己加的
 *   正确写法（`\<` 还是坑 19 的正解），它们在站上渲染成 `<` `{` `&`，一个字都不多。
 * ⚠ 行尾那根单独的 `\` 是 markdown 的硬换行，后面没东西，这个正则天然不碰它。
 */
const PRINTED_BACKSLASH = /\\(\\|[A-Za-z])/;

/**
 * 上一行是不是一段**普通段落文字**。
 *
 * 只有它成立时，下一行的 `-` / `=` 才会把它吃成标题（实测：列表项、表格行后面
 * 写 `---` 出来的是 `<hr>`，不吃）。判不准就当"不是" —— 见文件头"宁可漏报"。
 */
export function isParagraphLine(line: string): boolean {
  if (line.trim() === "") return false;
  // 四个空格以上是缩进代码块。
  if (/^ {4,}/.test(line)) return false;
  return !/^\s{0,3}(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|\||`{3,}|~{3,}|<)/.test(line);
}

export function checkFormat(input: FormatInput): FormatFinding[] {
  const found: FormatFinding[] = [];
  const body = input.body;
  const lines = body.split("\n");
  const inFence = fencedLines(lines);

  // ── 1. 正文全空（block）────────────────────────────────────────────────
  // 草稿空着是正常的（后台刚建出来就是这样）；**非草稿**空着就是一页只有标题的
  // 研究稿挂在公网上，而四处全绿。
  if (!input.draft && body.trim() === "") {
    found.push({
      code: "empty_body",
      tier: "block",
      line: 0,
      excerpt: "",
      why:
        "非草稿的条目正文是空的 —— 页面会渲染成只有标题、没有一个字。" +
        "【2026-09-21 真出过】后台建完忘了粘正文，闸门 / astro check / 构建三处全绿。" +
        "还没写完就把 draft 打开（草稿不生成页面）。",
    });
  }

  for (let i = 0; i < lines.length; i++) {
    if (inFence[i]) continue;
    const line = lines[i]!;

    // ── 2. `---` 把上一行吃成标题（block）───────────────────────────────
    // 实测（Astro 自己的处理器）：`-` / `--` / `---` 把上一行变成 <h2>，
    // `=` / `===` 变成 <h1>，而作者以为自己画了一条分隔线。
    if (/^\s{0,3}(-+|=+)\s*$/.test(line) && i > 0) {
      const prev = lines[i - 1]!;
      if (!inFence[i - 1] && isParagraphLine(prev)) {
        const isEq = line.trim().startsWith("=");
        found.push({
          code: "setext_eaten",
          tier: "block",
          line: i + 1,
          excerpt: `${clip(prev)} ⏎ ${line.trim()}`,
          why:
            `这一行紧跟在一段文字下面，markdown 会把上一行整段变成` +
            `${isEq ? "一级" : "二级"}标题（setext），分隔线不会出现 —— 实测过，零报错。` +
            "要分隔线就在它上面空一行；要标题就写成 ## 开头。",
        });
      }
    }

    // ── 3. 裸 `<` 后面跟字母或数字（block）──────────────────────────────
    // 坑 19：后台四个集合用的是 fields.mdx，`extension: "md"` 只管文件名、
    // 碰不到解析器。裸 `<` 对它是一次 JSX 开标签，那一条从此**编不开也改不了**，
    // 而 Astro 读 .md 走 CommonMark，站上一切正常 —— CI 永远不会替你发现。
    const probe = stripInlineCode(line);
    const lt = /(?<!\\)<(?=[A-Za-z0-9!])/.exec(probe);
    if (lt) {
      found.push({
        code: "bare_lt",
        tier: "block",
        line: i + 1,
        excerpt: clip(line),
        why:
          "裸 `<` 后面直接跟字母 / 数字 / `!`，后台（Keystatic 的 MDX 解析器）会把它当成" +
          "一次 JSX 开标签，这一条从此**在后台打不开也改不了**（坑 19，站上和构建零症状）。" +
          "写成 `\\<`（Keystatic 自己就是这么存的）；链接写成 [文字](url)，" +
          "注释写成 {/* … */}；整段示例包进代码围栏。",
      });
    }
  }

  // ── 4. 正文里不止一个一级标题（warn）──────────────────────────────────
  // 站上的既有写法是正文开头一个 `#` 复述标题（7.md 就是），那一个不算。
  // 多出来的每一个都是"本该是章节"的段落：tocItems() 只收 h2 / h3，
  // 它们不会进目录，而页面照常渲染 —— 看起来"有点不对"，说不出哪里不对。
  const h1Lines = lines
    .map((line, i) => ({ line, i }))
    .filter(({ line, i }) => !inFence[i] && /^#\s/.test(line));
  if (h1Lines.length > 1) {
    const second = h1Lines[1]!;
    found.push({
      code: "h1_in_body",
      tier: "warn",
      line: second.i + 1,
      excerpt: `${clip(second.line)}（正文里共 ${h1Lines.length} 个一级标题）`,
      why:
        "目录只收二级和三级标题（src/utils/tocItems.ts），所以这些段落**不会出现在目录里**，" +
        "而它们底下的小节看着像和上一节平级。章节写成 ## 开头就对了 —— 正文一个字都不用动。",
    });
  }

  // ── 5. 会原样印出来的反斜杠（warn）────────────────────────────────────
  //
  // 【2026-09-21 查出来的】模型（Spark / Gemini）爱把算式写成 LaTeX：
  // `$(P - B) / P = … \approx 3.76\\%$`、`\mathbf\{6.31\\%}`、`85\times1.25`。
  // 这个站**没有装数学渲染**（astro.config.ts 的 rehype 链里没有 katex），
  // `$…$` 整段是当普通文字印的，反斜杠也一样 —— 查实不是推理：已经构建出来的
  // `dist/r/1002/index.html` 里那一行是 `14.94\%$`。
  //
  // ★ 判据是「**这根杠会不会被印出来**」，不是「像不像 LaTeX」。照命令表
  //   （\approx / \mathbf / \frac …）写的话，下一个模型换个命令就漏网，而屏幕上
  //   照常印绿勾 —— 那正是 docs/gate.md 第 7 节 `SC 13D` 的形态。
  // ★ 整篇只报一条（和 h1_in_body 同一个理由）：一份稿子里这种行动辄十几二十行，
  //   逐行报会把 warn 档刷成噪音，而人对噪音的反应是整体不看。
  const backslashLines = lines
    .map((line, i) => ({ line, i }))
    .filter(({ line, i }) => !inFence[i] && PRINTED_BACKSLASH.test(stripInlineCode(line)));
  if (backslashLines.length > 0) {
    const first = backslashLines[0]!;
    found.push({
      code: "stray_backslash",
      tier: "warn",
      line: first.i + 1,
      excerpt: `${clip(first.line)}（正文里共 ${backslashLines.length} 处）`,
      why:
        "这些反斜杠会**原样印在页面上** —— markdown 里 `\\` 后面跟字母根本不是转义，" +
        "`\\\\` 转义出来的也是一根真的杠。多半是模型把算式写成了 LaTeX，" +
        "而这个站没装数学渲染，`$…$` 整段也是当普通文字印的" +
        "（查实：dist/r/1002/index.html 里印的就是 `14.94\\%$`）。" +
        "改法：算式改写成普通文字（≈ / × / %），整段公式包进代码围栏；" +
        "真要印一根反斜杠（Windows 路径之类）就包进行内代码，那里不报。" +
        "其中**整行只有杠**的那些（LaTeX 的换行）可以一键删：`pnpm dev` 开着时" +
        "打开 /_tidy，或者后台左侧菜单的「清理特殊字符」—— 它只碰整行只有杠的行，" +
        "算式里的 `3.76\\\\%` 不碰（那要改到数字旁边，机器不该替人决定）。",
    });
  }

  // ── 6. 来源还没标（warn）──────────────────────────────────────────────
  // 「来源未标注」是合法的一档（docs/engineering-notes.md 第二节的三档之一），所以只警不拦。
  // ★ 两格都没标时**只报一条**：站上那句「来源未标注」已经把话说完了，
  //   再挂一条「模型未标注」是同一件事说两遍（modelSlot 的三档就是这么分的）。
  if (!input.draft && input.source.agentPending) {
    found.push({
      code: "unlabeled_source",
      tier: "warn",
      line: 0,
      excerpt: "agent: 还没标",
      why:
        "这一条会在站上印「来源未标注」。那是合法的一档（待补），不是错 —— " +
        "但同一个问题 / 选题里别的条目多半标着是谁写的，卡片上一条有名字一条没有。",
    });
  } else if (!input.draft && input.source.modelPending) {
    found.push({
      code: "unlabeled_source",
      tier: "warn",
      line: 0,
      excerpt: "model: 还没标",
      why:
        "智能体标了、模型没标，站上印「模型未标注」。同一个产品底下的模型会换，" +
        "换了答案就不一样 —— 这一格正是读者判断「为什么两个答案不同」的依据。",
    });
  }

  return found;
}

/** 有没有拦住发版的那一档。 */
export const hasBlocking = (found: readonly FormatFinding[]): boolean =>
  found.some(f => f.tier === "block");
