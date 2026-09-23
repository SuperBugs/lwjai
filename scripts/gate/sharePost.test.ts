/**
 * 发到 X 的那段话（src/utils/sharePost.ts）的测试。
 * 用例是站上真实的条目形状（ORCL 那篇、CRWV 那个被问了两遍的问题），
 * 不是照着实现反推的碎片。
 *
 * 【2026-09-21】这一组跟着两件事一起改：cashtag 挪到最前面、同一组折成一段。
 * A 组钉一份那一档（形状没变，只有 cashtag 换了位置），
 * B 组钉几份那一档，C 组钉 280 的账怎么缩。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SHARE_SYMBOL_LIMIT,
  SHARE_TAG_LIMIT,
  X_LIMIT,
  xIntentUrl,
  xPostText,
  xWeightedLength,
} from "../../src/utils/sharePost";
import { sameName } from "../../src/config/symbol";
import { AGENTS, agentProductName } from "../../src/config/agents";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

const ORCL = {
  kind: "posts" as const,
  title: "ORCL｜甲骨文 (Oracle Corp)",
  url: "https://lwj.ai/posts/orcl-20260916/",
  symbols: [{ code: "ORCL" }],
  voices: [
    {
      description: "ORCL｜甲骨文 (Oracle Corp) 分析",
      agentName: "Spark",
    },
  ],
};

/** 站上真实的那一组：同一个问题，两个智能体各答了一遍。 */
const CRWV = {
  kind: "qa" as const,
  title: "CoreWeave 发布 30 亿可转债，估算合理跌幅",
  url: "https://lwj.ai/qa/q-20260920-0443/",
  symbols: [{ code: "CRWV" }],
  voices: [
    {
      description: "短期内合理回调空间已在 $76～$79 附近得到充分消化",
      agentName: "Spark",
    },
    {
      description: "公告前价格下方 4%—7% 视为可以解释的短期折价区间",
      agentName: "ChatGPT",
    },
  ],
};

// ── A. 一份那一档 ─────────────────────────────────────────────────────────

test("A · 加权长度按 X 的规矩：拉丁 1、CJK 2、链接一律 23", () => {
  assert.equal(xWeightedLength("abc"), 3);
  assert.equal(xWeightedLength("中文"), 4);
  assert.equal(xWeightedLength("https://lwj.ai/posts/orcl-20260916/"), 23);
  assert.equal(
    xWeightedLength("看 https://lwj.ai/posts/orcl-20260916/ 全文"),
    2 + 1 + 23 + 1 + 4
  );
  assert.equal(xWeightedLength("😀"), 2);
});

test("A · 研究稿一份：cashtag + 标题同一行，然后摘要、出处 + 链接", () => {
  const text = xPostText(ORCL);
  assert.equal(
    text,
    [
      "$ORCL ORCL｜甲骨文 (Oracle Corp)",
      "ORCL｜甲骨文 (Oracle Corp) 分析",
      "由 Spark 生成，全文：https://lwj.ai/posts/orcl-20260916/",
    ].join("\n")
  );
  assert.ok(xWeightedLength(text) <= X_LIMIT);
});

test("A · cashtag 必须在**最前面** —— 不许再吊回最后一行", () => {
  // 【2026-09-21 用户要的】原来它是末行。X 上多数人只看第一行，
  // 排在末尾等于前三行读完才知道说的是哪只票。
  const text = xPostText(ORCL);
  assert.ok(text.startsWith("$ORCL "), `第一行不是 cashtag 开头：${text.split("\n")[0]}`);
  assert.ok(
    !text.split("\n").at(-1)!.startsWith("$"),
    "cashtag 又跑回最后一行了"
  );
  // 问答那一档同样：cashtag 仍然是**第一眼**看见的东西，「问：」在它底下一行。
  assert.ok(xPostText(CRWV).startsWith("$CRWV\n问："));
});

test("A · 没有标的就没有 cashtag，第一行原样是标题", () => {
  const text = xPostText({ ...ORCL, symbols: [] });
  assert.ok(!text.includes("$"), "没有标的却冒出来一个 cashtag");
  assert.equal(text.split("\n")[0], ORCL.title);
});

test("A · 出处按条目分档：只知道智能体就只写智能体；人写的 / 没标的不写出处", () => {
  const noModel = xPostText({
    ...ORCL,
    voices: [{ ...ORCL.voices[0]! }],
  });
  assert.match(noModel, /^由 Spark 生成，全文：/m);

  const mine = xPostText({
    ...ORCL,
    voices: [{ description: ORCL.voices[0]!.description }],
  });
  assert.ok(!mine.includes("生成"), "人写的不许说成生成的");
  assert.match(mine, /^全文：https:\/\/lwj\.ai\/posts\/orcl-20260916\/$/m);
});

test("A · 问答一份：问 / 答 / 回答的出处 + 链接", () => {
  const text = xPostText({
    kind: "qa",
    title: "CoreWeave 发布 30 亿可转债，估算合理跌幅",
    url: "https://lwj.ai/qa/q-20260920-0329-chatgpt-gpt-6-pro/",
    voices: [
      {
        description: "公告前价格下方 4%—7% 视为可以解释的短期折价区间",
        agentName: "ChatGPT",
      },
    ],
  });
  assert.equal(
    text,
    [
      "问：CoreWeave 发布 30 亿可转债，估算合理跌幅",
      "答：公告前价格下方 4%—7% 视为可以解释的短期折价区间",
      "ChatGPT 的回答，全文：https://lwj.ai/qa/q-20260920-0329-chatgpt-gpt-6-pro/",
    ].join("\n")
  );
});

// ── B. 几份那一档（同一个问题 / 同一个选题折成一段）──────────────────────

test("B · 两个回答折成一段：问题只印一遍，每家一行，一条链接", () => {
  const text = xPostText(CRWV);
  assert.equal(
    text,
    [
      "$CRWV",
      "问：CoreWeave 发布 30 亿可转债，估算合理跌幅",
      "Spark：短期内合理回调空间已在 $76～$79 附近得到充分消化",
      "ChatGPT：公告前价格下方 4%—7% 视为可以解释的短期折价区间",
      "全文：https://lwj.ai/qa/q-20260920-0443/",
    ].join("\n")
  );
  assert.ok(xWeightedLength(text) <= X_LIMIT, `${xWeightedLength(text)}`);
});

test("B · 问题只出现一次 —— 折叠存在的全部理由就是别刷两遍", () => {
  const text = xPostText(CRWV);
  const hits = text.split(CRWV.title).length - 1;
  assert.equal(hits, 1, `标题出现了 ${hits} 次`);
});

test("B · 只给一条链接（组里最新那条），不是一家一条", () => {
  const text = xPostText(CRWV);
  assert.equal(
    (text.match(/https?:\/\//g) ?? []).length,
    1,
    "一家一条链接的话光链接就 23 × N，正文一个字都写不下"
  );
});

test("B · 最后一行只剩链接 —— 不再报「N 份报告 / N 个回答」", () => {
  /**
   * 【2026-09-21 用户要的】原来那一行是「2 个回答，全文：…」。删掉是因为
   * **280 的账**（用户原话「因为字数限制」）：那几个字换成的是同样多的摘要，
   * 而"有几份"上面每份各占一行已经数得出来。
   *
   * ⚠ 这一条同时钉着"别顺手加回去"：加回去不会有任何报错，只是每条帖子的
   *   摘要少五六个字，而那是最不该被挤掉的一段。
   */
  const qaText = xPostText(CRWV);
  assert.match(qaText, /^全文：https:\/\/lwj\.ai\/qa\/q-20260920-0443\/$/m);
  const posts2 = xPostText({
    ...ORCL,
    voices: [ORCL.voices[0]!, { ...ORCL.voices[0]!, agentName: "ChatGPT" }],
  });
  for (const [label, text] of [
    ["问答", qaText],
    ["研究稿", posts2],
  ] as const) {
    assert.ok(
      !/\d+\s*(个回答|份报告|篇教程|份提示词)/.test(text),
      `${label}那一档又在报数了：${text.split("\n").at(-1)}`
    );
    assert.ok(
      text.split("\n").at(-1)!.startsWith("全文："),
      `${label}最后一行不是「全文：」`
    );
  }
});

test("B · 出处只印产品名，模型名不进帖子", () => {
  /**
   * 【2026-09-21 用户要的】`OpenAI ChatGPT · GPT-6-Pro：` → `ChatGPT：`。
   * 剪厂商那一步在 `agentProductName()`（下面单独一条钉它），**模型名整个不传** ——
   * `ShareVoice` 里已经没有那一格了，所以这里钉的是"文案不会再拼出那个 `·`"。
   */
  const text = xPostText(CRWV);
  assert.ok(
    !text.includes(" · "),
    `出处那一行又拼上了第二段（多半是模型名回来了）：${text}`
  );
  assert.match(text, /^ChatGPT：/m);
});

test("B · agentProductName：剪厂商，剪不掉就原样，永不返回空串", () => {
  /**
   * 判据在 `src/config/agents.ts`（显示名「厂商 产品」那条规矩的另一半），
   * 钉在这个文件里是因为**它存在的唯一理由就是这段帖子文案**。
   * ⚠ 用例喂的是登记表里真会出现的写法，不是照着实现反推的碎片。
   */
  assert.equal(agentProductName("OpenAI ChatGPT", "OpenAI"), "ChatGPT");
  assert.equal(agentProductName("Anthropic Claude", "Anthropic"), "Claude");
  assert.equal(agentProductName("Google Spark", "Google"), "Spark");
  assert.equal(agentProductName("OpenAI Codex", "OpenAI"), "Codex");
  // 名字本来就不带厂商 / 厂商是哨兵 / 名字就是厂商：原样返回，**不许返回空串**
  // —— 出处那一格空着会被读成"没标"，而那是另一档。
  assert.equal(agentProductName("Grok", "xAI"), "Grok");
  assert.equal(agentProductName("我自己", "—"), "我自己");
  assert.equal(agentProductName("Google", "Google"), "Google");
  assert.equal(agentProductName("DeepSeek", ""), "DeepSeek");
  // 登记表里每一条真实的智能体剪完都得剩下点东西。
  for (const a of AGENTS) {
    assert.ok(
      agentProductName(a.name, a.vendor).trim() !== "",
      `${a.id} 剪完是空的 —— 帖子里那一行会变成一个孤零零的冒号`
    );
  }
});

test("B · 组里某一份没有出处：那行用 `·` 起头，不许替它编一个名字", () => {
  // 人写的 / 没标的在调用方那儿就成了 undefined，两个档已经并了。
  // 在这儿补「我自己」或「来源未标注」是猜 —— 猜错就是替内容认领出身。
  const text = xPostText({
    ...CRWV,
    voices: [CRWV.voices[0]!, { description: "这一份没人标过是谁写的" }],
  });
  assert.match(text, /^· 这一份没人标过是谁写的$/m);
  assert.ok(!text.includes("我自己"), "替没标的那份认领了「我自己」");
  assert.ok(!text.includes("未标注"), "在发帖文案里编了一个「未标注」的档");
});

test("B · voices 空数组要抛 —— 不许兜出一段看起来正常的文案", () => {
  assert.throws(
    () => xPostText({ ...CRWV, voices: [] }),
    /voices 是空的/,
    "兜底的话会发出一段少了所有人名字、却看不出缺了东西的话"
  );
});

// ── C. 280 的账 ───────────────────────────────────────────────────────────

test("C · 一份：摘要太长只截摘要，标题和链接原样，截完补省略号", () => {
  const long = "这一段摘要写得非常长，".repeat(30);
  const text = xPostText({
    ...ORCL,
    voices: [{ ...ORCL.voices[0]!, description: long }],
  });
  assert.ok(xWeightedLength(text) <= X_LIMIT, `${xWeightedLength(text)}`);
  const lines = text.split("\n");
  assert.equal(lines[0], `$ORCL ${ORCL.title}`, "标题和 cashtag 不动");
  assert.ok(lines[1]!.endsWith("…"), "截过的摘要要有省略号");
  assert.ok(!lines[1]!.endsWith("，…"), "省略号前不留一个孤零零的逗号");
  assert.match(
    text,
    /全文：https:\/\/lwj\.ai\/posts\/orcl-20260916\/$/m,
    "链接不动"
  );
});

test("C · 几份：所有摘要共用一个上限，不是谁写得长就先砍谁", () => {
  const descLen = (line: string) => [...line.split("：")[1]!].length;
  /**
   * ⚠ 按**前缀**挑出那几行，不按下标。【2026-09-22】问答那一档的开头从一行变成了
   *   两行（`问：…` 自己占一行），原来写死的 `[, a, b]` 当场挑到的是问题那一行 ——
   *   而 `descLen()` 拿它照样算得出一个数，于是用例在别的地方红，指向完全错的方向。
   */
  const voice = (text: string, who: string) =>
    text.split("\n").find(l => l.startsWith(`${who}：`))!;

  // ① 两份都超长 → 砍到**一样长**。这是"共用一个上限"最直接的样子。
  const both = xPostText({
    ...CRWV,
    voices: CRWV.voices.map(v => ({ ...v, description: "长".repeat(200) })),
  });
  assert.ok(xWeightedLength(both) <= X_LIMIT, `${xWeightedLength(both)}`);
  const a = voice(both, "Spark");
  const b = voice(both, "ChatGPT");
  assert.equal(
    descLen(a!),
    descLen(b!),
    `两份都超长却砍成了不一样的长度：${descLen(a!)} vs ${descLen(b!)}`
  );
  assert.ok(a!.endsWith("…") && b!.endsWith("…"), "截过的都要有省略号");

  // ② 一短一长 → 短的**一个字都不动**（它本来就没超过上限），长的砍到上限。
  //    "共用上限"不是"砍成一样长"：短的那份只是没用完自己那份额度。
  const mixed = xPostText({
    ...CRWV,
    voices: [
      { ...CRWV.voices[0]!, description: "短".repeat(20) },
      { ...CRWV.voices[1]!, description: "长".repeat(200) },
    ],
  });
  assert.ok(xWeightedLength(mixed) <= X_LIMIT, `${xWeightedLength(mixed)}`);
  const short = voice(mixed, "Spark");
  const long = voice(mixed, "ChatGPT");
  assert.ok(!short.endsWith("…"), "短的那份没超过上限，不该被截");
  assert.ok(long.endsWith("…"), "长的那份要被截");
  assert.ok(
    descLen(long) >= descLen(short),
    `长的那份被砍得比短的还短（${descLen(long)} < ${descLen(short)}）—— 上限不是共用的`
  );
});

test("C · 几份：摘要全放不下时只剩名字，名字还在就还认得出是几家答的", () => {
  /**
   * ⚠ 标题那个倍数【2026-09-21】从 10 调到了 14：同一天出处那一行从
   * 「OpenAI ChatGPT · GPT-6-Pro」缩成了「ChatGPT」、最后一行也不再报数，
   * 于是 280 里**多出三十来个字的预算**，原来那个长度已经挤不掉摘要了
   * （屏幕上是 `Spark：摘要摘要摘要摘要摘…`）。
   * 调的是**用例的输入**，不是断言：这一条钉的始终是"摘要一个字都放不下时，
   * 名字那一行还在"，那一档的代码一个字没动。
   */
  const text = xPostText({
    ...CRWV,
    title: "问题本身就长得离谱".repeat(14),
    voices: CRWV.voices.map(v => ({ ...v, description: "摘要".repeat(50) })),
  });
  assert.match(text, /^Spark$/m);
  assert.match(text, /^ChatGPT$/m);
  assert.match(text, /^全文：/m, "链接那行永远在");
});

// ── D. 页面那一侧（src/dev/share.astro）─────────────────────────────────
//
// ⚠ 这一组是 grep 源码，钉**拼写不钉行为**（同 share.test.ts / detailParity.test.ts）。
//   先剥注释再 grep：页面注释里逐字写着这几条为什么必须在，不剥的话把真代码删掉、
//   注释留着，用例照样绿（share.test.ts 为这个形态被咬过一次）。

test("D · /_share 用 foldQaGroups 折组，不许在页面里另写一套归组", () => {
  const src = stripComments(read("src/dev/share.astro"));
  assert.match(
    src,
    /foldQaGroups\(/,
    "发帖文案页没走 foldQaGroups —— 同一个问题会再变回两段文案，\n" +
      "  而站上的列表卡片是折着的：两边分家，四处全绿。"
  );
  assert.ok(
    !/questionKey/.test(src),
    "页面里自己碰 questionKey 了 —— 归组的钥匙只许在 related.ts 的 qaGroupKey() 一处"
  );
});

test("D · 锚点认 data-share-keys（组里每一条），并且挂了 hashchange", () => {
  const src = stripComments(read("src/dev/share.astro"));
  assert.match(
    src,
    /data-share-keys=\{item\.keys\}/,
    "卡片没带上组里每一条的 key —— 从被折走那几条点「发帖文案」过来会落在页面顶上，\n" +
      "  什么都不发生，而按钮照常能点、零报错。"
  );
  assert.match(
    src,
    /dataset\.shareKeys/,
    "focusHash 没读 data-share-keys —— 只查 id 的话只认得组里的代表那一条"
  );
  assert.match(
    src,
    /"hashchange"/,
    "没挂 hashchange —— /_share 已经开着时再点另一条，地址只有 # 变了，\n" +
      "  页面不重载、astro:page-load 不触发，而折叠之后浏览器自己那套跳锚点也救不了。"
  );
});

test("C · intent 链接把换行和 $ 都编码进去", () => {
  const url = xIntentUrl("$ORCL 第一行\n第二行");
  assert.equal(
    url,
    "https://x.com/intent/post?text=%24ORCL%20%E7%AC%AC%E4%B8%80%E8%A1%8C%0A%E7%AC%AC%E4%BA%8C%E8%A1%8C"
  );
});

// ── E. 第一行要有中文 · 四个集合都能发（【2026-09-21 用户要的两条】）────────

/**
 * 用户截图里那一行是 `$NOK NOK` —— cashtag ＋ 标题，而标题就是那只票的代码，
 * 一整行没有一个汉字。刷到的人不点进来就不知道这是哪家公司。
 *
 * ⚠ 用例喂的是**站上真实的形状**：站长把研究稿标题写成了 `NOK` / `ZM` / `Oracle`
 *   这种短名（见 src/content/posts/*.md），公司中文名在 `symbolName` 那一格里。
 */
test("E · 第一行带上公司中文名，不再是 `$NOK NOK`", () => {
  const text = xPostText({
    kind: "posts",
    title: "NOK",
    url: "https://lwj.ai/r/1012",
    symbols: [{ code: "NOK", name: "诺基亚" }],
    voices: [{ description: "基本面温和修复。", agentName: "Google Spark" }],
  });
  const head = text.split("\n")[0]!;
  assert.equal(head, "$NOK 诺基亚");
  assert.ok(
    !/\$NOK NOK/.test(text),
    "标题就是标的代码时还印了一遍 —— cashtag 已经说过这件事了"
  );
});

test("E · 中文名已经在标题里就不再缀一遍", () => {
  const head = xPostText({
    kind: "posts",
    title: "ORCL｜甲骨文 投资可行性分析",
    url: "https://lwj.ai/r/1002",
    symbols: [{ code: "ORCL", name: "甲骨文" }],
    voices: [{ description: "一句话。", agentName: "Google Spark" }],
  }).split("\n")[0]!;
  assert.equal(head, "$ORCL ORCL｜甲骨文 投资可行性分析");
  assert.equal(
    head.split("甲骨文").length - 1,
    1,
    "「甲骨文」在第一行出现了两次"
  );
});

test("E · 没填公司中文名时仍然是 `$NOK NOK` —— 这一处没有信息可用", () => {
  /**
   * ★ 这条是**刻意钉住的取舍**，不是把 bug 写进测试：丢掉标题的话第一行只剩一个
   *   孤零零的 `$NOK`，比重复更糟。要治在内容那一侧（把公司中文名填上）。
   */
  const head = xPostText({
    kind: "posts",
    title: "NOK",
    url: "https://lwj.ai/r/1012",
    symbols: [{ code: "NOK" }],
    voices: [{ description: "一句话。" }],
  }).split("\n")[0]!;
  assert.equal(head, "$NOK NOK");
});

test("E · 问答：cashtag · 中文名 一行，问题在下一行", () => {
  const lines = xPostText({
    ...CRWV,
    title: "发债之后合理的跌幅区间是多少",
    symbols: [{ code: "CRWV", name: "CoreWeave" }],
  }).split("\n");
  assert.equal(lines[0], "$CRWV CoreWeave");
  assert.equal(lines[1], "问：发债之后合理的跌幅区间是多少");

  // ★ 问题本身提到了公司名时**不再缀一遍** —— 和研究稿那条去重规矩是同一条。
  //   （站上真实的那条问答标题就是「CoreWeave 发布 30 亿可转债…」。）
  const dup = xPostText({
    ...CRWV,
    symbols: [{ code: "CRWV", name: "CoreWeave" }],
  }).split("\n");
  assert.equal(dup[0], "$CRWV");
  assert.equal(dup[1], `问：${CRWV.title}`);
});

test("E · 教程 / 提示词也能发：没有出处那一行，标题不带「问：」", () => {
  const guide = xPostText({
    kind: "guides",
    title: "嘉信证券开户",
    url: "https://lwj.ai/g/1005",
    // 教程的 schema 里没有 agent / model / symbol，调用方传进来的就是 undefined。
    voices: [{ description: "开户流程，图文一步步来。" }],
  });
  assert.equal(
    guide,
    "嘉信证券开户\n开户流程，图文一步步来。\n全文：https://lwj.ai/g/1005"
  );

  const prompt = xPostText({
    kind: "prompts",
    title: "美股标的分析",
    url: "https://lwj.ai/p/1000",
    voices: [{ description: "公司值什么、上涨靠什么。" }],
  });
  assert.equal(
    prompt,
    "美股标的分析\n公司值什么、上涨靠什么。\n全文：https://lwj.ai/p/1000"
  );
  assert.ok(
    !/由 .* 生成/.test(`${guide}\n${prompt}`),
    "教程 / 提示词那两档不许写出处 —— 它们的 schema 里压根没有 agent 那一格，" +
      "印一句「由 X 生成」是替它认领出身"
  );
});

test("E · /_share 四个集合都收，而且名单和登记表对得上账", () => {
  const src = stripComments(read("src/dev/share.astro"));
  for (const key of ["posts", "qa", "guides", "prompts"]) {
    // 用 includes 不用正则：`getCollection("posts")` 里的括号是正则元字符，
    // 拼进 new RegExp 要转义，而转义符在这一步是最容易写错的东西（写错就永远不命中）。
    assert.ok(
      src.includes(`getCollection("${key}")`),
      `/_share 没收 ${key} —— 那个集合的内容在这一页上根本不出现，而页面照常渲染`
    );
  }
  // ★ 光有四行 getCollection 不够：加第五个有详情路由的集合时，这一页得**当场抛**。
  assert.match(
    src,
    /CONTENT_COLLECTIONS/,
    "没拿登记表反过来对账 —— 加第五个集合时漏掉它是零症状的"
  );
  assert.match(
    src,
    /symbols: symbolsOf\(entry\)/,
    "没把标的传给文案 —— 第一行的 cashtag 和公司名一起没了"
  );
});

/**
 * 【2026-09-21 用户要的】第一行的顺序是**标的 英文名 中文名 标签**。
 *
 * 用户看到的症状是 `$ZM ZM`（原话「名字不全」）：站长把标题写成 `ZM`、公司名只填了
 * `symbolNameEn`，而文案那时只读中文名那一格 —— 于是一整行两个代码、没有名字。
 * 下面这几条喂的都是 `src/content/posts/*.md` 里**真实的字段组合**。
 */
const headOf = (input: Parameters<typeof xPostText>[0]) =>
  xPostText(input).split("\n")[0]!;

test("E · 只填了英文名的票：$ZM Zoom，不是 $ZM ZM", () => {
  const head = headOf({
    kind: "posts",
    title: "ZM",
    url: "https://lwj.ai/r/1009",
    symbols: [{ code: "ZM", nameEn: "Zoom" }],
    voices: [{ description: "一句话。", agentName: "Google Spark" }],
  });
  assert.equal(head, "$ZM Zoom");
});

test("E · 两个名字都有：标的 → 英文名 → 中文名（顺序是用户定的）", () => {
  const head = headOf({
    kind: "posts",
    title: "NOK",
    url: "https://lwj.ai/r/1012",
    symbols: [{ code: "NOK", name: "诺基亚", nameEn: "Nokia" }],
    tags: ["个股研究"],
    voices: [{ description: "一句话。", agentName: "Google Spark" }],
  });
  assert.equal(head, "$NOK Nokia 诺基亚 #个股研究");
});

test("E · 中英文名一模一样（Zoom / Zoom）→ 只印一个", () => {
  /**
   * 【2026-09-21 用户要的】站上 ZM / DKNG 两格填的就是同一个词 ——
   * 没有通行中文译名的票本来就这样，不是手滑。不去重的话第一行是 `$ZM Zoom Zoom`。
   */
  const head = headOf({
    kind: "posts",
    title: "ZM",
    url: "https://lwj.ai/r/1017",
    symbols: [{ code: "ZM", name: "Zoom", nameEn: "Zoom" }],
    tags: ["个股研究"],
    voices: [{ description: "一句话。", agentName: "Google Spark" }],
  });
  assert.equal(head, "$ZM Zoom #个股研究");

  // 大小写不同也算同一个名字 —— 各印一遍就是屏幕上两个几乎一样的词。
  assert.equal(
    headOf({
      kind: "posts",
      title: "DKNG",
      url: "https://lwj.ai/r/1014",
      symbols: [{ code: "DKNG", name: "draftkings", nameEn: "DraftKings" }],
      voices: [{ description: "一句话。" }],
    }),
    "$DKNG DraftKings"
  );
});

test("E · 「中英同名」的判据只有一处，站上那张标的芯片读的是同一个", () => {
  assert.equal(sameName("Zoom", "zoom "), true, "大小写和空白不算区别");
  assert.equal(sameName("Zoom", "Zoom通讯"), false);
  // 两格都空时**不算同一个** —— 那时本来就没东西可印，返回 true 会让调用方
  // 以为"去过重了"。
  assert.equal(sameName(undefined, undefined), false);
  assert.equal(sameName("", ""), false);

  const chip = stripComments(read("src/components/SymbolChip.astro"));
  assert.match(
    chip,
    /sameName\(/,
    "标的芯片没用同一个判据 —— 那一处会继续印 `ZM Zoom Zoom`，而发帖文案这边是对的"
  );
});

test("E · 标题就是英文名（站上 Oracle 那几条）→ 不印两遍", () => {
  const head = headOf({
    kind: "posts",
    title: "Oracle",
    url: "https://lwj.ai/r/1011",
    symbols: [{ code: "ORCL", name: "甲骨文", nameEn: "Oracle" }],
    voices: [{ description: "一句话。", agentName: "Google Spark" }],
  });
  assert.equal(head, "$ORCL Oracle 甲骨文");
});

test("E · 英文名就是代码（DXYZ 那种没有别名的）→ 不印，但标题留下", () => {
  /**
   * ★ 刻意钉住的取舍，同下面那条「没填名字」：这一档丢了标题就只剩一个孤零零的
   *   `$DXYZ`。印两遍难看，但它至少还是一行字；要治在内容那一侧（把公司名填上）。
   */
  const head = headOf({
    kind: "posts",
    title: "DXYZ",
    url: "https://lwj.ai/r/1016",
    symbols: [{ code: "DXYZ", nameEn: "DXYZ" }],
    voices: [{ description: "一句话。" }],
  });
  assert.equal(head, "$DXYZ DXYZ");
});

test("E · 老式长标题：标题留下，被它包着的名字不再缀一遍", () => {
  const head = headOf({
    kind: "posts",
    title: "ORCL｜甲骨文 投资可行性分析",
    url: "https://lwj.ai/r/1002",
    symbols: [{ code: "ORCL", name: "甲骨文", nameEn: "Oracle Corp" }],
    voices: [{ description: "一句话。", agentName: "Google Spark" }],
  });
  assert.equal(head, "$ORCL Oracle Corp ORCL｜甲骨文 投资可行性分析");
  assert.equal(head.split("甲骨文").length - 1, 1, "「甲骨文」出现了两次");
});

/**
 * 【2026-09-22 问答那一格改成多选那天加的】一条内容讲好几只票时，
 * 第一行**只印 cashtag，名字整个不印**。
 *
 * ★ 这不是漏改：三只票各带一个中英文名，第一行光名字就四五十个字符，
 *   而 280 的账里那些字抢的是摘要的位置；更要紧的是**没有哪个名字能代表这一条**，
 *   印一个就是替读者挑了一只。名字在落地页那排芯片上一只一张，一个都没少。
 */
test("E · 好几只票：一排 cashtag，名字不印，问题在下一行", () => {
  const lines = xPostText({
    kind: "qa",
    title: "CPU 为什么突然暴涨",
    url: "https://lwj.ai/q/1022",
    symbols: [
      { code: "ARM", name: "Arm", nameEn: "Arm" },
      { code: "INTC", name: "英特尔", nameEn: "Intel Corporation" },
    ],
    voices: [{ description: "一句话。", agentName: "ChatGPT" }],
  }).split("\n");
  assert.equal(lines[0], "$ARM $INTC");
  assert.equal(lines[1], "问：CPU 为什么突然暴涨");
  assert.ok(!lines[0]!.includes("Arm"), "好几只票时不该印公司名");
  assert.ok(!lines[0]!.includes("英特尔"), "好几只票时不该印公司名");
});

test("E · 好几只票：最多挂 SHARE_SYMBOL_LIMIT 个 cashtag", () => {
  const codes = ["ARM", "INTC", "AMD", "NVDA", "TSM"];
  const head = headOf({
    kind: "qa",
    title: "CPU 为什么突然暴涨",
    url: "https://lwj.ai/q/1022",
    symbols: codes.map(code => ({ code })),
    voices: [{ description: "一句话。", agentName: "ChatGPT" }],
  });
  const shown = codes.filter(c => head.includes(`$${c}`));
  assert.equal(
    shown.length,
    SHARE_SYMBOL_LIMIT,
    `挂了 ${shown.length} 个 cashtag，上限是 ${SHARE_SYMBOL_LIMIT}：${head}`
  );
  // ★ 截掉的是**后面**那几只，不是随机挑 —— 顺序就是后台里勾的那个顺序，
  //   人能预料到哪几只会上，而随机挑谁也说不清。
  assert.equal(head, "$ARM $INTC $AMD", head);
});

test("E · 一只票那一档一个字都没变（多选不许顺手改掉单只票的第一行）", () => {
  // 这条是回归闸：`symbols.length !== 1` 那个分支写错边界的话，
  // 站上**绝大多数**条目（一只票）的第一行会一起丢掉公司名，而测试全绿。
  assert.equal(
    headOf({
      kind: "posts",
      title: "NOK",
      url: "https://lwj.ai/r/1012",
      symbols: [{ code: "NOK", name: "诺基亚", nameEn: "Nokia" }],
      voices: [{ description: "一句话。", agentName: "Spark" }],
    }),
    "$NOK Nokia 诺基亚"
  );
});

test("E · /_share 的公司名从标的表查 —— 不许在那一页上另写一份", () => {
  // 【2026-09-22】名字不在条目上了（symbolName / symbolNameEn 两格没了），
  // 所以这条钉的从"传没传英文名"换成"查名字用的是不是全站那一个判据"。
  // 在那一页上手写一份 `{ code, name: … }` 的话，帖子里的名字和站上芯片上的
  // 名字就可以不一样，而两边都不报错。
  const src = stripComments(read("src/dev/share.astro"));
  assert.match(src, /symbolNames/, "没调 symbolNames() —— 名字是从哪儿来的？");
  assert.match(
    src,
    /from "@\/config\/symbols"/,
    "没从标的表那一份判据里拿 —— 第二份查表就是两处可以各说各话"
  );
});

// ── F. 第一行名字后面那串话题标签（【2026-09-21 用户要的】）─────────────

test("F · 标签跟在第一行名字后面，不是吊在末尾", () => {
  const text = xPostText({ ...ORCL, tags: ["财报", "估值"] });
  const lines = text.split("\n");
  assert.ok(
    lines[0]!.endsWith("#财报 #估值"),
    `第一行末尾不是标签：${lines[0]}`
  );
  assert.ok(
    lines[0]!.startsWith("$ORCL "),
    "cashtag 仍然排最前面 —— 标签是缀在名字后面，不是顶掉它"
  );
  assert.ok(
    lines.at(-1)!.includes(ORCL.url),
    "最后一行仍然是链接那一行（标签挪走之后别把它也带走了）"
  );
  assert.ok(!lines.slice(1).some(l => l.includes("#")), "别处还留着一行标签");
});

test("F · 几份那一档也一样：标签在第一行，折叠那一行不动", () => {
  const text = xPostText({ ...CRWV, tags: ["估值"] });
  const lines = text.split("\n");
  assert.ok(lines[0]!.endsWith("#估值"), lines[0]);
  assert.match(text, /全文：/, "链接那一行不该被挤掉");
});

test("F · 没标签就什么都不缀 —— 第一行末尾不许留一个空格", () => {
  for (const input of [ORCL, { ...ORCL, tags: [] }, { ...ORCL, tags: ["  "] }]) {
    const text = xPostText(input);
    const first = text.split("\n")[0]!;
    assert.equal(first, first.trimEnd(), `第一行末尾多了空白：${JSON.stringify(first)}`);
    assert.ok(!text.includes("  "), "第一行里冒出了两个连着的空格");
    assert.ok(!text.includes("#"), "没有标签却印了 #");
  }
});

test("F · 最多三个 —— 多出来的不挂（它抢的是摘要的预算）", () => {
  const text = xPostText({
    ...ORCL,
    tags: ["财报", "估值", "宏观", "做空", "期权"],
  });
  assert.ok(text.split("\n")[0]!.endsWith("#财报 #估值 #宏观"));
  assert.ok(!text.includes("#做空"), "第四个标签也挂上了");
  assert.equal(SHARE_TAG_LIMIT, 3);
});

test("F · ★ 标签进 280 的账：挤的是摘要，不是把自己挤掉", () => {
  const long = {
    ...ORCL,
    voices: [{ ...ORCL.voices[0]!, description: "很长的一段摘要".repeat(20) }],
    tags: ["财报", "估值", "宏观"],
  };
  const text = xPostText(long);
  assert.ok(
    xWeightedLength(text) <= X_LIMIT,
    `没缩到 280 以内：${xWeightedLength(text)}`
  );
  assert.ok(
    text.split("\n")[0]!.endsWith("#财报 #估值 #宏观"),
    "缩摘要的时候把标签一起丢了 —— 它和标题、链接一样是不动的那一半"
  );
  assert.match(text, /…/, "摘要没被截 —— 那这条用例测的不是它想测的东西");
});

test("F · /_share 真的把标签传进来了（没传是零症状：文案照常生成，只是少几个 #）", () => {
  const src = stripComments(read("src/dev/share.astro"));
  assert.match(src, /tags:\s*tagsOf\(entry\)/);
});

// ── G. 问答那一档：「问：…」自己占一行（【2026-09-22 用户要的】）────────────
//
// 用户截图里那一行是
//   `$GRML Greenland Mines 格陵兰矿业 问：格陵兰相关标的的暴涨的原因？ #宏观`
// —— 一行里混着三种东西：这是哪只票、这问的是什么、这属于哪个话题。
// 原话「问应该单独占一行，在下一行」。

test("G · 问答：第一行是标的 ＋ 名字 ＋ 标签，问题在第二行", () => {
  // 用户截图里那一条的形状（GRML，两个智能体各答了一遍）。
  const lines = xPostText({
    kind: "qa",
    title: "格陵兰相关标的的暴涨的原因？",
    url: "https://lwj.ai/q/1033",
    symbols: [{ code: "GRML", name: "格陵兰矿业", nameEn: "Greenland Mines" }],
    tags: ["宏观"],
    voices: [
      { description: "安全协议点燃格陵兰资源题材。", agentName: "ChatGPT" },
      { description: "三方即将签署安全协议。", agentName: "Spark" },
    ],
  }).split("\n");
  assert.equal(lines[0], "$GRML Greenland Mines 格陵兰矿业 #宏观");
  assert.equal(lines[1], "问：格陵兰相关标的的暴涨的原因？");
  assert.equal(lines[2], "ChatGPT：安全协议点燃格陵兰资源题材。");
  assert.ok(
    !lines[0]!.includes("问："),
    "问题又缩回第一行了 —— 那一行是「这是哪只票 · 哪个话题」，不是问题本身"
  );
});

test("G · 一只票 / 好几只票**两个分支**都得换行 —— 拼装只许有一处", () => {
  /**
   * `headLines()` 里有两条路（`symbols.length !== 1` 提前返回，和底下那套去重）。
   * 各拼一份的话「问题单起一行」会在其中一档静默失效 ——
   * 而一只票那一档正好是站上**绝大多数**条目。
   */
  const q = (symbols: { code: string }[]) =>
    xPostText({
      kind: "qa",
      title: "CPU 为什么突然暴涨",
      url: "https://lwj.ai/q/1022",
      symbols,
      voices: [{ description: "一句话。", agentName: "ChatGPT" }],
    }).split("\n");
  assert.deepEqual(q([{ code: "ARM" }]).slice(0, 2), [
    "$ARM",
    "问：CPU 为什么突然暴涨",
  ]);
  assert.deepEqual(q([{ code: "ARM" }, { code: "INTC" }]).slice(0, 2), [
    "$ARM $INTC",
    "问：CPU 为什么突然暴涨",
  ]);
  // 一只票都没勾的那一档：第一行**就是**问题，不许在上面留一个空行。
  assert.equal(q([])[0], "问：CPU 为什么突然暴涨");
});

test("G · 只有问答这一档 —— 研究稿 / 教程 / 提示词的标题仍在第一行", () => {
  /**
   * ★ 这不是漏改：教程和提示词**没有标的那一格**，标题也挪走的话第一行就剩一串
   *   `#券商开户`，甚至整个空掉 —— 第一眼看见的那一行得是内容，不是标签。
   *   研究稿标题是个名词短语，跟在公司名后面读得通；问题是一句完整的话。
   */
  assert.equal(
    xPostText({
      kind: "posts",
      title: "投资可行性分析",
      url: "https://lwj.ai/r/1002",
      symbols: [{ code: "ORCL", name: "甲骨文", nameEn: "Oracle" }],
      tags: ["个股研究"],
      voices: [{ description: "一句话。", agentName: "Spark" }],
    }).split("\n")[0],
    "$ORCL Oracle 甲骨文 投资可行性分析 #个股研究"
  );
  assert.equal(
    xPostText({
      kind: "guides",
      title: "嘉信证券开户",
      url: "https://lwj.ai/g/1005",
      tags: ["券商开户"],
      voices: [{ description: "一句话。" }],
    }).split("\n")[0],
    "嘉信证券开户 #券商开户"
  );
  assert.equal(
    xPostText({
      kind: "prompts",
      title: "美股标的分析",
      url: "https://lwj.ai/p/1000",
      voices: [{ description: "一句话。" }],
    }).split("\n")[0],
    "美股标的分析"
  );
});

test("G · 去重那几条照旧管着标题：标题就是代码时整段不印", () => {
  /**
   * ⚠「它自己占一行了，重复一遍也不挤」是错的：那一行会是一个孤零零的 `问：NOK`，
   *   而上一行的 cashtag 已经说完了这件事。换行不等于换了一行就可以重复一遍。
   */
  const lines = xPostText({
    kind: "qa",
    title: "NOK",
    url: "https://lwj.ai/q/1030",
    symbols: [{ code: "NOK", name: "诺基亚" }],
    voices: [{ description: "一句话。", agentName: "ChatGPT" }],
  }).split("\n");
  assert.equal(lines[0], "$NOK 诺基亚");
  assert.ok(!lines.includes("问：NOK"), `冒出了一行 问：NOK：${lines}`);
  assert.equal(lines[1], "答：一句话。");
});

test("G · ★ 280 的账一个字都没变：空格换成换行，X 两者都记 1", () => {
  /**
   * 挪行**不该**从摘要那边偷预算 —— 那是这个文件里最贵的一格。
   * 一个空格和一个换行在 `charWeight()` 里都是 1（码点 32 / 10，都 ≤ 4351）。
   */
  assert.equal(xWeightedLength("a b"), xWeightedLength("a\nb"));
  const long = "这一段回答写得非常长，".repeat(30);
  const input = {
    ...CRWV,
    tags: ["估值", "财报"],
    voices: CRWV.voices.map(v => ({ ...v, description: long })),
  };
  const text = xPostText(input);
  assert.ok(xWeightedLength(text) <= X_LIMIT, `${xWeightedLength(text)}`);
  // 摘要被截到的长度，和"把问题拼回第一行"那版**一模一样**。
  const inlined = text.replace("\n问：", " 问：");
  assert.equal(xWeightedLength(inlined), xWeightedLength(text));
  assert.match(text, /…/, "摘要没被截 —— 这条用例测的不是它想测的东西");
});
