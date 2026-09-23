/**
 * `pnpm content:import` 判据（./importPlan.ts）的测试。
 *
 * 用例喂的是**模型真的会吐出来**的形状：研究提示词交付的第一行是 `# TSLA｜特斯拉`，
 * 第二行是「分析：… 报价：…」，接着是「一、结论速览」那张表。
 * 不是照着正则反推的碎片（docs/gate.md 第 7 节）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeForMdxBody, ImportError, planImport } from "./importPlan";
import { SYMBOL_CODES, unknownSymbols } from "../../src/config/symbols";

/**
 * 「表里有 / 表里没有」这两个探针**从标的表自己推出来**，不许点名写某只票。
 *
 * 【2026-09-23 红过一次】原来三条用例里写着「INTC / AMD 表里没有」「ARM 表里有」——
 * 写的那天是真的，而那张表是**人在后台随时会加行的内容**：这天一次批量登记
 * 把它从十几只扩到 181 只，三条用例当场红、`pnpm build` 第三步挂掉，
 * **而产品代码一个字都没错**。
 *
 * 同一个形态这是第三次（9-21 的 `answerOrder.test.ts` 读了人排过序的表、
 * `importTags.test.ts` 点名断言「财报」在标签表里）。判据要钉的是**行为** ——
 * 「表里有的不记进 newSymbols，表里没有的记」—— 那跟今天表里登记了哪几只票无关。
 */
/** 表里真有的第一只。表是空的时候这一组用例没有意义，下面有自检。 */
const IN_TABLE = SYMBOL_CODES[0];
/** 形状合法、但不可能被登记的代码。真被登记了，下面那句自检会大声红。 */
const NOT_IN_TABLE = "ZZQQ";
const NOT_IN_TABLE_2 = "ZZWW";

/**
 * 号池：盘上已经有 1000~1002（四个集合共用一个池子，所以这里**不分集合**）。
 * 默认给这一串，于是每个用例里"下一个号"都是 1003 —— 和 `nextEntryNo` 的单测
 * （scripts/content/entryNo.test.ts）分工明确：那边测算法，这边只测"接上了没有"。
 */
const POOL = ["1000", "1001", "1002"];

/** 一条最短的问答，只在"这个用例不关心正文"的地方用。 */
const QUICK_QA = ["# 问？", "", "答。"].join("\n");

/** 研究提示词的交付形状。 */
const RESEARCH = [
  "# TSLA｜特斯拉",
  "",
  "分析：2026-09-19 16:10 美东｜报价：16:00 ET 收盘｜数据覆盖：日线、期权",
  "",
  "## 一、结论速览",
  "",
  "| 项目 | 研究判断 | 决定性依据或缺口 |",
  "| --- | --- | --- |",
  "| 公司与证券 | 电动车与储能，纳斯达克 | 核心收入来自汽车 |",
  "",
  "样例段落：这一段只是占位，不是真的研究判断，也不是任何人的操作。",
  "",
  "## 二、公司与估值",
  "",
  "第二节正文。",
].join("\n");

const base = (over: Partial<Parameters<typeof planImport>[0]> = {}) =>
  planImport({
    collection: "posts",
    markdown: RESEARCH,
    now: new Date("2026-09-19T20:10:00Z"), // 美东 16:10
    existingIds: POOL,
    ...over,
  });

test("标题取第一个一级标题并从正文摘走；标的从标题认出（title 档）", () => {
  const p = base({ agent: "spark", model: "gemini-3-pro" });
  assert.equal(p.title, "TSLA｜特斯拉");
  assert.deepEqual(p.symbols, ["TSLA"]);
  assert.equal(p.symbolSource, "title");
  assert.ok(!p.body.includes("# TSLA｜特斯拉"), "一级标题还留在正文里，站上会印两遍");
  assert.ok(p.body.startsWith("分析："), "摘掉标题后正文从第二行开始");
});

test("摘要跳过「分析：」那行和表格，取第一段；截的摘要要警告", () => {
  const p = base({ agent: "spark", model: "gemini-3-pro" });
  assert.ok(p.description.startsWith("样例段落"), p.description);
  assert.ok(p.warnings.some(w => w.includes("摘要")), "截出来的摘要必须警告");
});

test("永远是草稿，tags 空数组，标题按 YAML 双引号标量写", () => {
  const p = base({ agent: "spark", model: "gemini-3-pro", title: '英伟达 Q3：三件事，和一句"不好说"' });
  assert.match(p.frontmatter, /^draft: true$/m);
  assert.match(p.frontmatter, /^tags: \[\]$/m);
  assert.match(p.frontmatter, /^featured: false$/m);
  const titleLine = p.frontmatter.split("\n").find(l => l.startsWith("title:"))!;
  assert.equal(JSON.parse(titleLine.slice("title: ".length)), '英伟达 Q3：三件事，和一句"不好说"');
  assert.match(p.frontmatter, /^pubDatetime: 2026-09-19T20:10:00\.000Z$/m, "时间戳不加引号");
  assert.ok(p.text.startsWith("---\n"), "完整文件以 frontmatter 开头");
});

test("地址 = 号池里的下一个号；和标的 / 时间 / 智能体 / 模型全都无关", () => {
  // 【2026-09-21】换掉了「标的-美东日期时分-智能体-模型」，理由在 src/config/entryNo.ts。
  // ★ 这几条断言的意思是：**填表顺序再也影响不到地址了**。旧那套里，先写标题
  //   再选智能体，地址就永远少那两段，而回头补标又不许改地址。
  assert.equal(base({ agent: "spark", model: "gemini-3-pro" }).slug, "1003");
  assert.equal(base({ agent: "spark" }).slug, "1003");
  assert.equal(base().slug, "1003");
  assert.equal(base({ agent: "human" }).slug, "1003");
  // 换个时刻、换只票、换个集合，号还是号池说了算。
  assert.equal(base({ now: new Date("2026-09-20T02:00:00Z") }).slug, "1003");
  assert.equal(base({ symbol: "NVDA" }).slug, "1003");
  assert.equal(base({ existingIds: ["1000", "1001", "1009"] }).slug, "1010");
  // 空站从 1000 起，不是 1 —— 列表页的分页也是数字地址。
  assert.equal(base({ existingIds: [] }).slug, "1000");
  assert.equal(base().file, "src/content/posts/1003.md");
  assert.equal(
    base({ collection: "qa", markdown: QUICK_QA }).file,
    "src/content/qa/1003.md",
    "★ 一个号池：同一批 id 喂给 qa，算出来的还是 1003 —— /r/1003 和 /q/1003 不会同时存在"
  );
});

test("显式给号：必须是个号，别的一律抛", () => {
  assert.equal(base({ slug: "4200" }).slug, "4200");
  // 旧那套的地址、后台撞名加的 -2 后缀、前导零 —— 都不是号。
  assert.throws(() => base({ slug: "tsla-20260919-1610-spark" }), ImportError);
  assert.throws(() => base({ slug: "1003-2" }), ImportError);
  assert.throws(() => base({ slug: "01003" }), ImportError);
  assert.throws(() => base({ slug: "0" }), ImportError);
  // ★ 三位以下会和列表页的分页地址（/r/2）撞车。
  assert.throws(() => base({ slug: "42" }), ImportError);
});

test("「研究对象：NVDA（英伟达）」那一行优先于标题（subject_line 档）", () => {
  const md = `# 一篇标题里没有代码的稿子\n\n研究对象：NVDA（英伟达）\n\n正文一段。`;
  const p = base({ markdown: md, agent: "claude", model: "claude-opus-5" });
  assert.deepEqual(p.symbols, ["NVDA"]);
  assert.equal(p.symbolSource, "subject_line");
});

test("认不出标的 → 留空 + unknown + 警告", () => {
  const p = base({ markdown: "# 宏观：利率与估值\n\n一段正文。", agent: "codex", model: "gpt-5" });
  assert.deepEqual(p.symbols, []);
  assert.equal(p.symbolSource, "unknown");
  assert.ok(p.warnings.some(w => w.includes("没认出")));
  assert.match(
    p.frontmatter,
    /^symbols: \[\]$/m,
    "没认出来要写一行空的 symbols —— 后台那一格是多选，缺键和空表在它眼里不一样"
  );
});

test("显式 --symbol 是 manual 档，并且要像个代码", () => {
  const p = base({ agent: "codex", symbol: "brk.b", symbolName: "伯克希尔" });
  assert.deepEqual(p.symbols, ["BRK.B"]);
  assert.equal(p.symbolSource, "manual");
  assert.throws(() => base({ symbol: "特斯拉" }), ImportError);
});

/**
 * 【2026-09-22】问答可以讲好几只票，所以导入口也收一串。两条判据：
 *   ① 并起来去重（`symbol` 那一只排在最前面，名字只属于它）；
 *   ② **表里没有的不丢，登记进去** —— 和标签刚好相反，理由在
 *      `ImportPlan.newSymbols` 和 src/config/symbols.ts 文件头。
 */
test("好几只标的：并起来去重，表里没有的记进 newSymbols", () => {
  // 前提自检：探针得真的一个在表里、两个不在，否则下面测的是另一件事
  // （docs/engineering-notes.md 坑 17 那个形态）。
  assert.ok(IN_TABLE, "标的表是空的 —— 这一组用例没有可用的探针");
  assert.deepEqual(unknownSymbols([IN_TABLE!]), [], `${IN_TABLE} 不在表里`);
  assert.deepEqual(
    unknownSymbols([NOT_IN_TABLE, NOT_IN_TABLE_2]).sort(),
    [NOT_IN_TABLE, NOT_IN_TABLE_2].sort(),
    "探针代码被登记进标的表了，给这一组换两个"
  );

  const p = base({
    agent: "codex",
    symbol: IN_TABLE, // 表里有
    symbolName: "某某",
    // 两个表里没有的；小写那个和上面是同一只，要被去重
    symbols: [NOT_IN_TABLE, IN_TABLE!.toLowerCase(), NOT_IN_TABLE_2],
  });
  assert.deepEqual(p.symbols, [IN_TABLE, NOT_IN_TABLE, NOT_IN_TABLE_2]);
  assert.deepEqual(p.newSymbols, [
    { code: NOT_IN_TABLE },
    { code: NOT_IN_TABLE_2 },
  ]);
  assert.match(
    p.frontmatter,
    new RegExp(`^symbols: \\["${IN_TABLE}", "${NOT_IN_TABLE}", "${NOT_IN_TABLE_2}"\\]$`, "m")
  );
  assert.ok(
    p.warnings.some(w => w.includes("标的表")),
    `新登记了两只票却没在报告里说一句：${JSON.stringify(p.warnings)}`
  );
});

test("标的表里已经有的那只，不再报「已经替你加进去了」", () => {
  // ★ 反面用例：`newSymbols` 要是不过滤，每导一条都会说一遍"新登记了 X"，
  //   而那句话会被当成背景噪音 —— 真正新加一只票的那次也就一起被无视了。
  assert.ok(IN_TABLE, "标的表是空的 —— 这条用例没有可用的探针");
  const p = base({ agent: "codex", symbol: IN_TABLE });
  assert.deepEqual(p.symbols, [IN_TABLE]);
  assert.deepEqual(p.newSymbols, []);
  assert.ok(!p.warnings.some(w => w.includes("标的表")));
});

test("表里没有的那只**要**记进 newSymbols（和标签刚好相反）", () => {
  // 这一条是上面那条的正面：丢掉一个标的等于把这条内容从 /s/<代码> 上整个摘出去，
  // 所以导入口不丢、自动登记并说一句。理由在 src/config/symbols.ts 文件头。
  assert.deepEqual(unknownSymbols([NOT_IN_TABLE]), [NOT_IN_TABLE]);
  const p = base({ agent: "codex", symbol: NOT_IN_TABLE, symbolName: "某某" });
  assert.deepEqual(p.symbols, [NOT_IN_TABLE]);
  assert.deepEqual(p.newSymbols, [{ code: NOT_IN_TABLE, name: "某某" }]);
  assert.ok(p.warnings.some(w => w.includes("标的表")));
});

test("智能体：不在登记表里就抛；没给就是哨兵 + 警告（问答的警告要说明发不出去）", () => {
  // 2026-09-20 之前登记表里填的是模型名 —— 老习惯写出来的 id 现在必须被拦下，不许静默接受。
  assert.throws(() => base({ agent: "gemini-3-pro" }), /登记表/);
  assert.throws(() => base({ agent: "gemini-pro-3" }), /登记表/);
  const p = base();
  assert.equal(p.agent, "unspecified");
  assert.ok(p.warnings.some(w => w.includes("--agent")));
  const q = base({ collection: "qa", markdown: "# 为什么回购重要？\n\n因为……" });
  assert.ok(q.warnings.some(w => w.includes("发不出去")));
});

test("模型（第二维）：不在登记表里就抛；「我自己」不许带模型；AI 写的没标要警告", () => {
  assert.throws(() => base({ agent: "spark", model: "gemini-pro-3" }), /登记表/);
  assert.throws(() => base({ agent: "human", model: "gpt-5" }), /我自己写的/);

  const p = base({ agent: "codex", model: "gpt-5" });
  assert.equal(p.model, "gpt-5");
  assert.match(p.frontmatter, /^agent: codex$/m);
  assert.match(p.frontmatter, /^model: gpt-5$/m);
  assert.ok(!p.warnings.some(w => w.includes("--model")), "标全了不该再催");

  // AI 写的、没给模型：写哨兵进去（待补），并警告；问答的警告要说明发不出去。
  const noModel = base({ agent: "claude" });
  assert.equal(noModel.model, "unspecified");
  assert.match(noModel.frontmatter, /^model: unspecified$/m);
  assert.ok(noModel.warnings.some(w => w.includes("--model")));
  const q = base({
    collection: "qa",
    markdown: "# 为什么回购重要？\n\n因为……",
    agent: "claude",
  });
  assert.ok(q.warnings.some(w => w.includes("--model") && w.includes("发不出去")));

  // 人写的：没有模型这一格 —— 不写 model 行（写一行 unspecified 会被读成"还没填"），也不催。
  const mine = base({ agent: "human" });
  assert.equal(mine.model, "unspecified");
  assert.ok(!/^model:/m.test(mine.frontmatter), "人写的不该有 model 行");
  assert.ok(!mine.warnings.some(w => w.includes("--model")), "人写的不该被催着补模型");

  // 智能体没标、模型标了：放行（知道模型、不知道产品是真会发生的），只催 --agent。
  const apiOnly = base({ model: "gpt-5" });
  assert.match(apiOnly.frontmatter, /^model: gpt-5$/m);
  assert.ok(apiOnly.warnings.some(w => w.includes("--agent")));
  assert.ok(!apiOnly.warnings.some(w => w.includes("--model")));
});

test("问答：questionKey 只有 qa 有且格式要对；prompt 只有 posts 有", () => {
  const q = base({
    collection: "qa",
    markdown: "# 特斯拉的毛利率还能回到多少？\n\n研究对象：TSLA\n\n模型的回答。",
    agent: "spark",
    model: "gemini-3-pro",
    questionKey: "tsla-margin",
    now: new Date("2026-09-19T20:10:00Z"),
  });
  // ★ 带引号：这一格指向另一条内容的**地址**，而地址现在是数字。
  //   不加引号的话 `questionKey: 1003` 被 YAML 读成 number，schema 那边报一句
  //   「Expected string, received number」，而人看着那一行完全正常。
  assert.match(q.frontmatter, /^questionKey: "tsla-margin"$/m);
  assert.match(
    base({ collection: "qa", markdown: QUICK_QA, questionKey: "1003" }).frontmatter,
    /^questionKey: "1003"$/m
  );
  assert.throws(() => base({ collection: "qa", questionKey: "TSLA Margin" }), ImportError);
  assert.throws(() => base({ questionKey: "tsla-margin" }), /只有问答/);
  assert.throws(() => base({ collection: "qa", prompt: "1000" }), /只有研究稿/);
  assert.match(base({ prompt: "1000" }).frontmatter, /^prompt: "1000"$/m);
});

test("显式摘要原样用、不截不警告；自动摘要超过 120 字截断", () => {
  const p = base({ agent: "codex", description: "一句像样的摘要。" });
  assert.equal(p.description, "一句像样的摘要。");
  assert.ok(!p.warnings.some(w => w.includes("摘要")));
  const long = "长".repeat(300);
  const q = base({ agent: "codex", markdown: `# T\n\n${long}` });
  assert.equal(q.description.length, 120);
  assert.ok(q.description.endsWith("…"));
});

test("CRLF 归一化；空正文抛；地址不是号就抛；一级标题缺失时用第一行并警告", () => {
  const p = base({ agent: "codex", markdown: RESEARCH.replaceAll("\n", "\r\n") });
  assert.ok(!p.text.includes("\r"));
  assert.throws(() => base({ markdown: "   " }), /空的/);
  assert.throws(() => base({ slug: "TSLA_2026" }), /不是一个条目号/);
  const noH1 = base({ agent: "codex", markdown: "**没有标题的一段**\n\n正文。" });
  assert.equal(noH1.title, "没有标题的一段");
  assert.ok(noH1.warnings.some(w => w.includes("一级标题")));
});

/**
 * 后台正文是 MDX（keystatic.config.ts 开头那段），裸 `<` 后面直接跟字母数字
 * 就是一次 JSX 开标签，那一条在后台**编不开**，而站上和构建零症状。
 *
 * ★ 下面的语料是**照着真的坏掉的那两份提示词的形状写的**（原句来自一份已经删掉的稿子，公开版换成了编的）
 *   （一份提示词的筛选表），
 *   不是照着正则反推的碎片 —— docs/gate.md 第 7 节那个 `SC 13D` 形态。
 *
 * ⚠ 这一组钉的是「转义做没做对」，**不是**「后台真的打得开」：后者只能拿
 *   Keystatic 自己那份解析器验，那是 2026-09-20 在 /keystatic 里手工过的一遍
 *   （两份提示词都从报错变成能编能存，存回来 `\<` 和代码围栏一个字不改）。
 */
test("裸 `<` 转成 `\\<`；`< ` 和代码里的不动（后台按 MDX 解析）", () => {
  // 模型写筛选条件就是这个样子，一行里能出现好几处。
  const cell = "样例条件：甲<20%，乙<15%；丙<300张时丁≥300";
  const r = escapeForMdxBody(cell);
  assert.equal(
    r.body,
    "样例条件：甲\\<20%，乙\\<15%；丙\\<300张时丁≥300"
  );
  assert.equal(r.count, 3);

  // 带空格的比较式 MDX 本来就不管，别动它 —— 动了等于在正文里平白加反斜杠。
  assert.deepEqual(escapeForMdxBody("估值上 P/E < 20 就算便宜"), {
    body: "估值上 P/E < 20 就算便宜",
    count: 0,
  });
  // `>` 从来不是问题，别顺手一起转。
  assert.equal(escapeForMdxBody("潜在新增供给>Float的10%").count, 0);
  // 已经转过的不许再转一次（导入两遍不该越转越多）。
  assert.equal(escapeForMdxBody("机构\\<20%").count, 0);

  // 代码围栏和行内代码里的字是原样发出去给人抄的，一个字都不许动。
  const withCode = [
    "行内的 `if (pe<20)` 不算正文。",
    "",
    "```python",
    "if pe < 20 and float_shares<3e6:",
    "    pass",
    "```",
    "",
    "围栏外面的 机构<20% 要转。",
  ].join("\n");
  const c = escapeForMdxBody(withCode);
  assert.equal(c.count, 1, "只有围栏外那一处该转");
  assert.ok(c.body.includes("`if (pe<20)`"), "行内代码被改了");
  assert.ok(c.body.includes("float_shares<3e6"), "代码围栏里被改了");
  assert.ok(c.body.includes("机构\\<20%"));
});

test("导入：裸 `<` 自动转并报一行；花括号只警告、不替人改", () => {
  const md = [
    "# TSLA｜特斯拉",
    "",
    "机构<20%、优选<15% 时才进池子。",
  ].join("\n");
  // 显式给号：这一组测的是正文转义，和号池无关 —— 别让它跟着编号一起红。
  const p = base({ agent: "codex", model: "gpt-5", markdown: md, slug: "1011" });
  assert.ok(p.body.includes("机构\\<20%、优选\\<15%"), p.body);
  assert.ok(
    p.warnings.some(w => w.includes("裸 `<`") && w.includes("2 处")),
    "转了几处必须报出来，不许悄悄改"
  );

  // 花括号是另一种坏法：转义会毁掉公式，所以只点名行号让人自己包围栏。
  const latex = [
    "# 期权损耗",
    "",
    "\\[",
    "L_{5,i}=1-\\frac{V(N_i-h)}{V(N_i)}",
    "\\]",
  ].join("\n");
  const q = base({ agent: "codex", model: "gpt-5", markdown: latex, slug: "1012" });
  assert.ok(
    q.warnings.some(w => w.includes("花括号") && w.includes("代码围栏")),
    "花括号必须警告"
  );
  assert.ok(q.body.includes("L_{5,i}"), "花括号不许被替人转义 —— 那样公式就坏了");

  // 已经包进围栏的公式不再警告（那是正确写法，别追着人喊）。
  const fenced = [
    "# 期权损耗",
    "",
    "```latex",
    "L_{5,i}=1-\\frac{V(N_i-h)}{V(N_i)}",
    "```",
  ].join("\n");
  const f = base({ agent: "codex", model: "gpt-5", markdown: fenced, slug: "1013" });
  assert.ok(!f.warnings.some(w => w.includes("花括号")), f.warnings.join("\n"));
});
