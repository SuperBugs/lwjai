/**
 * 稿件体检判据（`scripts/content/formatRules.ts`）的测试。
 *
 * ## 用例从哪来
 *
 * **从站上真实的稿子里抄的**，不是照着正则反推的碎片 —— docs/gate.md 第 7 节
 * 那个 `SC 13D` 事故就是照正则造用例造出来的（87 条全绿，因为测试自己喂的也是
 * 错的写法）。下面 B 组每一行都能在 `src/content/posts/7.md`、`8.md` 里找到原型：
 * GFM 表格、`$76～$79` 这种价格区间、`4%—7%`、`5/15 分钟`、带括号的英文名。
 *
 * ## B 组比 A 组重要
 *
 * A 组是"必须报"，B 组是"不许误伤"。这份判据**会拦住构建**，误伤一次的代价不是
 * 难看，是**这条规则从此被绕过**（docs/gate.md 第 7 节末尾那段，坑 14 同一个形态：
 * 写白名单/过滤器时，"不许误删"那一组比"必须挡住"那一组更容易出事）。
 *
 * ## E 组钉的是接线，不是判据
 *
 * 一份判据写得再对，没接进构建链和钩子就等于不存在 —— 而"没接上"是零症状的
 * （`pnpm test` 全绿、构建全绿、站照发）。这正是 coverage.test.ts 里那条
 * 「构建链：发布闸必须排在 astro check 前面」存在的理由，E 组是它的同款。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTENT_COLLECTIONS } from "../../src/config/collections";
import {
  checkFormat,
  fencedLines,
  hasBlocking,
  isParagraphLine,
  type FormatCode,
  type FormatInput,
} from "./formatRules";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/** 默认是一篇已发布、来源标全了的稿子 —— 只有被测的那一项是变量。 */
const doc = (body: string, over: Partial<FormatInput> = {}): FormatInput => ({
  body,
  draft: false,
  source: { agentPending: false, modelPending: false },
  ...over,
});

const codes = (body: string, over?: Partial<FormatInput>): FormatCode[] =>
  checkFormat(doc(body, over)).map(f => f.code);

// ── A. 每一条规则都要真的报 ──────────────────────────────────────────────

test("A · 非草稿正文全空 = block（2026-09-21 /posts/8 真出过）", () => {
  const found = checkFormat(doc(""));
  assert.deepEqual(
    found.map(f => f.code),
    ["empty_body"]
  );
  assert.equal(found[0]!.tier, "block");
  assert.ok(hasBlocking(found));
  // 只有空白也算空 —— 后台存出来的空正文常常带一个换行。
  assert.deepEqual(codes("\n  \n\n"), ["empty_body"]);
});

test("A · `---` 紧跟一段文字 = block（那段文字会变成 <h2>，实测）", () => {
  const found = checkFormat(
    doc("高通的护城河在专利授权。\n---\n下面说风险。\n")
  );
  assert.deepEqual(
    found.map(f => f.code),
    ["setext_eaten"]
  );
  assert.equal(found[0]!.tier, "block");
  assert.equal(found[0]!.line, 2, "行号要指向那条下划线，不是整篇");
  // 一根 `-`、两根 `--`、`=` / `===` 实测同样吃上一行。
  for (const rule of ["-", "--", "----", "=", "==="]) {
    assert.deepEqual(codes(`一段话\n${rule}\n`), ["setext_eaten"], `${rule} 漏报了`);
  }
});

test("A · 裸 `<` 后跟字母或数字 = block（坑 19：后台编不开）", () => {
  // 坑 19 的原始语料：三份提示词里两份从建站起就这样。
  const found = checkFormat(doc("机构持股比例低于<20%的标的先不看。\n"));
  assert.deepEqual(
    found.map(f => f.code),
    ["bare_lt"]
  );
  assert.equal(found[0]!.tier, "block");
  assert.match(found[0]!.why, /后台/, "得说清楚坏在哪 —— 站上是看不出来的");
  // 后面跟字母同理（模型很爱写裸标签）。
  assert.deepEqual(codes("用 <br> 换行。\n"), ["bare_lt"]);
});

test("A · 正文里不止一个一级标题 = warn（目录只收 h2/h3）", () => {
  // /posts/8 的形状：开头一个 `#` 复述标题，后面章节又写成 `#`。
  const body = "# QCOM｜Qualcomm\n\n## 一、结论速览\n\n# 二、公司与估值\n\n# 三、治理\n";
  const found = checkFormat(doc(body));
  assert.deepEqual(
    found.map(f => f.code),
    ["h1_in_body"]
  );
  assert.equal(found[0]!.tier, "warn", "页面是好的，只是目录少了几段 —— 不许拦住发版");
  assert.match(found[0]!.excerpt, /共 3 个一级标题/);
  assert.match(found[0]!.why, /tocItems/, "得指到判据那一处，别让人自己找");
});

/**
 * A · 会原样印出来的反斜杠。
 *
 * 语料**从站上真实的稿子里抄的**（posts 1018 / 1006 / 1013 / 1008、qa 1003），
 * 不是照正则造的碎片 —— 模型交上来的就是这几种写法。
 * ★ 用 `String.raw` 是为了**让用例和稿子里的字节一模一样**：这一组全是反斜杠，
 *   普通字符串里要数着写 `\\\\`，数错一根用例就永远绿（坑 17 那个形态）。
 */
const PRINTED_BACKSLASH_CORPUS: readonly [string, string][] = [
  ["约等于（1018.md 原文）", String.raw`| $(P - B) / P = (82.25 - 79.16) / 82.25 \approx 3.76\\%$ |`],
  ["粗体百分比（1006.md 原文）", String.raw`| $(H - B) / H = \mathbf\{6.31\\%}$ |`],
  ["LaTeX 里的美元号（1013.md 原文）", String.raw`$W(\\$23.70)$ 到 $B(\\$22.50)$ 差距为 $\\$1.20$`],
  ["乘号（qa/1003.md 原文）", String.raw`85\times1.25=106.25美元`],
  ["独占一行的 LaTeX 换行（1008.md 原文）", String.raw`\\`],
  ["求和式（1008.md 原文）", String.raw`累计 $\sum(Price \times Volume) / \sum Volume$`],
];

for (const [label, line] of PRINTED_BACKSLASH_CORPUS) {
  test(`A · 反斜杠会被印出来必须报：${label}`, () => {
    const found = checkFormat(doc(`${line}\n`)).filter(f => f.code === "stray_backslash");
    assert.equal(
      found.length,
      1,
      `这一行在站上会连反斜杠一起印出来，判据却放过了：\n${line}`
    );
    assert.equal(
      found[0]!.tier,
      "warn",
      "★【2026-09-22 站长定死】这一条**长期**就在 warn，不是在等一次清理：" +
        "立它那天写的是'清干净就提 block'，一天之后那笔账从 7 份涨到 8 份 —— " +
        "模型输出是常流不是存量。而且它什么都没毁（数字、单位、结论全在，多的是几根杠），" +
        "读者读得懂、作者改得动。真要提成 block 是重新做一次决定，不是自动到期。"
    );
  });
}

test("A · 反斜杠整篇只报一条，而且数出来共几处", () => {
  // 1015.md 那一份有 15 行。逐行报会把 warn 档刷成噪音，而人对噪音的反应是整体不看。
  const body = [
    String.raw`$(P - B) / P \approx 2.27\\%$`,
    "中间夹一段正常的中文，没有反斜杠。",
    String.raw`$(B - D) / B \approx 8.50\\%$`,
  ].join("\n");
  const found = checkFormat(doc(body)).filter(f => f.code === "stray_backslash");
  assert.equal(found.length, 1);
  assert.equal(found[0]!.line, 1, "行号指向第一处，不是整篇");
  assert.match(found[0]!.excerpt, /共 2 处/);
  assert.match(found[0]!.why, /数学渲染/, "得说清楚为什么会印出来 —— 站上看着像公式");
});

test("A · 来源还没标 = warn，而且两格都没标只报一条", () => {
  const body = "正文。\n";
  assert.deepEqual(codes(body, { source: { agentPending: true, modelPending: false } }), [
    "unlabeled_source",
  ]);
  assert.deepEqual(codes(body, { source: { agentPending: false, modelPending: true } }), [
    "unlabeled_source",
  ]);
  // ★ 两格都没标时只报一条：站上那句「来源未标注」已经把话说完了。
  const both = checkFormat(
    doc(body, { source: { agentPending: true, modelPending: true } })
  );
  assert.equal(both.length, 1, "同一件事说了两遍");
  assert.match(both[0]!.excerpt, /agent/);
});

/**
 * A · `bare_lt` 的边界 —— 这一组的每一行都**拿后台那个解析器真的编过一遍**。
 *
 * 【2026-09-21】判据写完之后用 `@mdx-js/mdx` 3.1.1（报错文案和坑 19 记的逐字一样）
 * 挨个 compile，结果推翻了两处想当然：自动链接和 HTML 注释**也编不开**（原本打算
 * 豁免它们，那会是两个漏网），而四空格缩进**保护不了**任何东西 —— MDX 根本没有
 * 缩进代码块这回事。
 *
 * ⚠ 改这条规则之前，先照着 formatRules.ts 文件头那段把样例重新 compile 一遍，
 *   **别照 markdown 规范推**。规范说的是 CommonMark（Astro 读 .md 走的那套），
 *   而这条规则守的是后台那套，两者恰恰在这几处不一样。
 */
const MDX_BREAKS: readonly [string, string][] = [
  ["裸标签", "用 <br> 换行。\n"],
  ["裸的小于号加数字（坑 19 原型）", "机构<20% 的先不看。\n"],
  ["表格格子里的 <20%", "| 指标 |\n| --- |\n| <20% |\n"],
  ["自动链接（MDX 要求写成 [文字](url)）", "来源：<https://www.sec.gov/x>\n"],
  ["邮箱自动链接", "投稿请发 <someone@example.com>\n"],
  ["HTML 注释（MDX 要求写成 {/* */}）", "正文\n\n<!-- 备注 -->\n"],
  ["四空格缩进里的小于号（MDX 没有缩进代码块）", "示例：\n\n    机构<20%\n"],
];

for (const [label, body] of MDX_BREAKS) {
  test(`A · 后台编不开的写法必须报：${label}`, () => {
    const found = checkFormat(doc(body)).filter(f => f.code === "bare_lt");
    assert.equal(
      found.length,
      1,
      `实测这段用 @mdx-js/mdx 编不开，判据却放过了 —— 那一条稿子会在后台打不开：\n${body}`
    );
    assert.equal(found[0]!.tier, "block");
  });
}

// ── B. 不许误伤（比 A 组更重要）──────────────────────────────────────────
//
// 每一行都是站上真有的写法。这一组红了，说明这份判据开始咬正确的句子 ——
// 到那时人会去绕过它，而不是去改稿子。

const MUST_NOT_FLAG: readonly [string, string][] = [
  ["GFM 表格", "| 项目 | 研究判断 |\n| ------ | ------ |\n| 公司定位 | 无线通信芯片 |\n"],
  ["表格分隔行独占一行", "| a |\n| --- |\n| 1 |\n"],
  ["正常分隔线（上面空一行）", "一段话\n\n---\n\n下一段\n"],
  ["列表后面画分隔线", "- 第一条\n- 第二条\n\n---\n"],
  ["价格区间", "短期合理回调空间已在 $76～$79 附近得到消化。\n"],
  ["百分比区间", "公告前价格下方 4%—7% 视为可以解释的短期折价。\n"],
  ["带斜杠的周期", "5/15 分钟重现更低高点（Lower High）时才考虑。\n"],
  ["小于号两边有空格", "只看机构持股 < 20% 的标的。\n"],
  ["已经转义过的小于号", "机构持股 \\<20% 的先不看。\n"],
  // ↓ 这四行是 Keystatic 存盘时**自己加的**转义：站上渲染成 `&` `{` `<`，一个字不多。
  //   把标点那一档也算成"会印出来的反斜杠"，就是对着后台的正确输出报警 ——
  //   而人改不动它（下次保存它还会加回来），只能去关掉这道检查。
  [
    "存盘加的 & 转义（2026-09-21 查实：href 里是对的）",
    String.raw`见 [Google Finance](https://www.google.com/finance/quote/CRWV:NASDAQ?utm_source=gemini\&authuser=2)。` + "\n",
  ],
  ["存盘加的花括号转义", String.raw`区间写成 \{5,i\} 这种。` + "\n"],
  ["行尾单根反斜杠（markdown 的硬换行）", "上一行\\\n下一行\n"],
  ["行内代码里的 LaTeX（那里的字是给人抄的）", "写成 `\\approx` 就行。\n"],
  ["围栏里的公式（这就是推荐改法）", "```\n\\frac{V}{S} \\approx 1.2\n```\n"],
  ["行内代码里的标签", "用 `<div>` 包一层就行。\n"],
  ["只有一个一级标题（站上既有写法）", "# QCOM｜高通 (Qualcomm Incorporated)\n\n## 一、结论速览\n"],
  [
    "围栏里的标签 / 分隔线 / 标题",
    "```html\n<script>alert(1)</script>\n```\n\n```yaml\ntitle: x\n---\n```\n\n```sh\n# 这是注释\n# 这也是\n```\n",
  ],
];

for (const [label, body] of MUST_NOT_FLAG) {
  test(`B · 不许误伤：${label}`, () => {
    assert.deepEqual(
      checkFormat(doc(body)),
      [],
      `这段是站上真有的写法，被判据咬了：\n${body}`
    );
  });
}

test("B · 站上现有的稿子里，没有一篇触发 block 档", () => {
  // 拿真实内容兜一次底：判据边界划错时，这一条会在改判据的当天就红，
  // 而不是等到下一次发版被拦住才发现。
  // ★ 只看 block 档：warn 是"待补"，站上本来就允许有。
  //
  // ⚠ 范围**从登记表推、扫整个目录**，不许写死几个文件名（2026-09-21 改的）：
  //   原来这里列着 `src/content/posts/7.md`，那天地址改成条目号、文件跟着改名，
  //   这条测试就 ENOENT 了。写死文件名的兜底测试有两种坏法都难看 ——
  //   改名时直接报错（这次），或者有人顺手换成另一个文件名、覆盖面悄悄缩水。
  for (const spec of CONTENT_COLLECTIONS) {
    const dir = join(process.cwd(), ...spec.dir.split("/"));
    for (const file of readdirSync(dir)) {
      if (file.startsWith("_") || !/\.mdx?$/i.test(file)) continue;
      const rel = `${spec.dir}/${file}`;
      const raw = read(rel);
      const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] ?? "";
      // 草稿还没发出去，它可以是半成品。
      if (/^draft:\s*true\s*$/m.test(front)) continue;
      const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
      const blocking = checkFormat(doc(body)).filter(f => f.tier === "block");
      assert.deepEqual(
        blocking.map(f => `${f.code}@${f.line}`),
        [],
        `${rel} 被 block 档咬了 —— 它是已经发出去的稿子`
      );
    }
  }
});

// ── C. 各条规则的边界（实测出来的，不是照规范写的）─────────────────────

test("C · 没有反斜杠的 $…$ 刻意不报 —— 这是决定，不是遗漏", () => {
  // 判据是"这根杠会不会被印出来"，不是"像不像公式"。而这是个财经站：
  // `$76～$79`、`现价 $82.25` 满站都是，拿 `$…$` 当判据就是天天误伤，
  // 而天天误伤的规则会被整体绕过（文件头 B 组那段）。
  // ⚠ 代价照实记在这儿：`$P = 82.25$` 这种纯字母公式漏报。它在页面上读作
  //   "P = 82.25 美元"，难看但不坏 —— 而误伤一次的代价比它贵。
  assert.deepEqual(codes("记当前盘前价 $P = 82.25$，近期阻力高点 $H = 83.05$。\n"), []);
  assert.deepEqual(codes("短期合理回调空间已在 $76～$79 附近得到消化。\n"), []);
  assert.deepEqual(codes("现价 $82.25（前收盘 $79.88，盘前 +2.97%）。\n"), []);
});

// ── C. setext 那条的边界（实测出来的，不是照规范写的）──────────────────

test("C · 上一行不是普通段落时不报 —— 实测那几种不会吃上一行", () => {
  // 实测：列表项 / 表格行 / 标题 / 引用 后面写 `---`，出来的是 <hr>，不吃上一行。
  for (const prev of ["- 一条", "| a |", "## 小标题", "> 引用", "1. 第一", "    缩进代码"]) {
    assert.deepEqual(codes(`${prev}\n---\n`), [], `${prev} 后面那条被误报了`);
  }
});

test("C · isParagraphLine：空行和块级开头都不算段落", () => {
  assert.ok(isParagraphLine("高通的护城河在专利授权。"));
  assert.ok(isParagraphLine("2026 年的数据"), "数字开头但不是有序列表");
  for (const line of ["", "   ", "# 标题", "> 引用", "- 项", "* 项", "+ 项", "1. 项", "| a |", "```", "<div>", "    代码"]) {
    assert.ok(!isParagraphLine(line), `「${line}」被当成段落了`);
  }
});

test("C · fencedLines：围栏开合两根都算在里面", () => {
  const lines = ["正文", "```js", "const a = 1;", "```", "正文2"];
  assert.deepEqual(fencedLines(lines), [false, true, true, true, false]);
  // 合的那根不许比开的短（CommonMark）。
  assert.deepEqual(fencedLines(["````", "x", "```", "y", "````"]), [
    true,
    true,
    true,
    true,
    true,
  ]);
});

// ── D. 草稿：这两条对它都不成立 ─────────────────────────────────────────

test("D · 草稿正文空着、来源没标，都不报", () => {
  // 草稿不生成页面（src/utils/postFilter.ts），所以"页面长歪"和"还没填完"
  // 对它都不成立。后台刚建出来的那一条就是这个样子。
  assert.deepEqual(codes("", { draft: true }), []);
  assert.deepEqual(
    codes("正文。\n", { draft: true, source: { agentPending: true, modelPending: true } }),
    []
  );
  // ⚠ 但"会让后台编不开"和"会被解析成别的东西"对草稿照样成立 ——
  //   那两条不是"还没写完"，是**已经坏了**，越早报越好。
  assert.deepEqual(codes("机构<20%\n", { draft: true }), ["bare_lt"]);
  assert.deepEqual(codes("一段话\n---\n", { draft: true }), ["setext_eaten"]);
});

// ── E. 接线：判据接没接进发版路径 ───────────────────────────────────────
//
// ★ 这一组钉的是"那道检查到底在不在链路里"，和 coverage.test.ts 里
//   「构建链：发布闸必须排在 astro check 前面」是同款。没接上是零症状的。

test("E · 构建链里必须有稿件体检，而且排在 astro build 前面", () => {
  const pkg = JSON.parse(read("package.json"));
  const build: string = pkg.scripts?.build ?? "";
  const at = build.search(/scripts\/content\/check\.ts|pnpm (run )?content:check\b/);
  assert.ok(
    at >= 0,
    `package.json 的 build 里没有稿件体检。\n` +
      `  删掉它 = 坏页面重新可以发上公网，而且零症状：测试全绿、构建全绿。\n` +
      `  当前 build: ${build}`
  );
  assert.ok(
    at < build.indexOf("astro build"),
    `稿件体检排到 astro build 后面了 —— 那就成了"发完了再说"。\n  当前 build: ${build}`
  );
  // 发布闸仍然排第一：泄露是发出去就收不回来的，坏页面只是难看。
  const gateAt = build.search(/scripts\/gate\/check\.ts|pnpm (run )?gate\b/);
  assert.ok(
    gateAt >= 0 && gateAt < at,
    `发布闸必须仍然排在稿件体检前面。\n  当前 build: ${build}`
  );
});

test("E · 构建链里必须跑 pnpm test", () => {
  const pkg = JSON.parse(read("package.json"));
  const build: string = pkg.scripts?.build ?? "";
  assert.match(
    build,
    /pnpm (run )?test\b/,
    `构建链里没有 pnpm test。\n` +
      `  在 2026-09-21 之前它哪一层都不在：353 条测试全红也照样能发版，\n` +
      `  因为 Cloudflare 跑的只是 build 这一条链子。\n  当前 build: ${build}`
  );
});

test("E · pre-commit 钩子里两道都要跑", () => {
  const hook = read("scripts/hooks/pre-commit");
  assert.match(hook, /scripts\/gate\/check-staged\.ts/, "pre-commit 里没有发布闸");
  assert.match(
    hook,
    /scripts\/content\/check\.ts/,
    "pre-commit 里没有稿件体检 —— 那就只剩构建期那一道，问题要等到部署时才报"
  );
  assert.match(hook, /^set -e$/m, "少了 set -e：前一道失败也会继续往下跑");
});

test("E · 稿件体检的范围和发布闸同源，不许另写一份", () => {
  const src = read("scripts/content/check.ts");
  assert.match(
    src,
    /from "\.\.\/gate\/inspect"/,
    "范围没有从 gate/inspect 拿 —— 两处各写一份扫描范围正是 2026-09-18 那次\n" +
      "  about.md 从建站起没被扫过的原因（docs/gate.md 第 7 节）"
  );
  assert.ok(
    !/src\/content\/(posts|qa|guides|prompts)/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")),
    "check.ts 里写死了内容目录 —— 范围只许从 src/config/collections.ts 的登记表推"
  );
});

test("E · 体检没有开关", () => {
  const src = read("scripts/content/check.ts");
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const escape of ["SKIP", "--force", "process.env.CI", "--no-check"]) {
    assert.ok(
      !noComments.includes(escape),
      `check.ts 里出现了 ${escape} —— 一个能被关掉的检查，迟早会在赶时间的那天被关掉（docs/engineering-notes.md 红线 3）`
    );
  }
  // 只认一个命令行参数：--staged（换的是"读哪份字节"，不是"要不要查"）。
  // ⚠ 只看 process.argv 那一处，不是全文 grep `"--xxx"` —— 那样会把喂给 git 的
  //   --cached / --name-only 一起算进来，而它们和开关毫无关系（第一版就是这么写的，
  //   当场假红）。
  const argvUses = [...noComments.matchAll(/process\.argv[^\n]*/g)].map(m => m[0]);
  assert.equal(
    argvUses.length,
    1,
    `check.ts 读了 ${argvUses.length} 处命令行参数：${argvUses.join(" | ")}`
  );
  assert.match(
    argvUses[0]!,
    /"--staged"/,
    `唯一认的参数不是 --staged：${argvUses[0]}`
  );
});
