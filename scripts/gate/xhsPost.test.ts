/**
 * 小红书笔记文案（`src/utils/xhsPost.ts`）的测试。
 *
 *   A 组 上限 —— 20 / 1000 / 10 是**接口定的**，越界那一头会截或者拒
 *   B 组 标题 —— 20 个字里塞什么；标题就是票代码那一档（站上真有）
 *   C 组 正文 —— 形状、给全、超了只缩摘要
 *   D 组 不许抄 X —— 模型名要留着、标签不进正文、不加 cashtag
 *
 * ★ 用例来自站上真实的条目（`src/content/posts/1008.md`、qa/1023 那一组），
 *   不是照着实现反推的（docs/engineering-notes.md 第三节那条 `SC 13D`）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  symbolLine,
  xhsPost,
  xhsTags,
  xhsTitle,
  XHS_BODY_MAX,
  XHS_TAG_MAX,
  XHS_TITLE_MAX,
  type XhsPostSource,
} from "../../src/utils/xhsPost";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const len = (s: string) => [...s].length;

/**
 * 把注释剥掉再比。⚠ **第二次踩到了**：D5「不许引另外两个标签上限」一上来就红，
 * 命中的是 `xhsPost.ts` 里**那段解释它们为什么不是同一件事**的注释。
 *
 * ★ 一条禁止某种写法的断言，会被**写着禁止它的那句注释**触发；反过来更糟 ——
 *   真写了那种代码的人只要顺手删掉旁边那句注释，断言反而从红变绿。
 *   （同 `xhsCard.test.ts` 顶上那一份，那边是 2026-09-22 当天先踩的。）
 */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** qa/1023 那一组的真实形状：同一个问题，两个智能体答的。 */
const cpu: XhsPostSource = {
  kindLabel: "问答",
  title: "昨晚CPU暴涨是因为什么，是否可持续？",
  symbols: [{ code: "ARM", name: "Arm" }],
  voices: [
    {
      label: "OpenAI ChatGPT（GPT-6-Pro）",
      description: "CPU 需求重估有依据，短线股价已抢跑。",
    },
    {
      label: "Google Spark（Gemini-3.1-Pro）",
      description: "AI智能体引爆CPU需求；长线逻辑坚实，短线过热透支。",
    },
  ],
  tags: ["行业"],
  date: "2026-09-22",
};

/** posts/1008 那一组的真实形状：标题就是票代码。 */
const zm: XhsPostSource = {
  kindLabel: "研究报告",
  title: "ZM",
  symbols: [{ code: "ZM", name: "Zoom" }],
  voices: [
    {
      label: "Google Spark（Gemini-3.1-Pro）",
      description:
        "当前处于AI新产品预期落地后的动能衰减与短线破位阶段，首要风险是85美元价值托底买盘强劲。",
    },
  ],
  tags: ["个股研究"],
  date: "2026-09-21",
};

/* ── A 组：上限是接口定的 ─────────────────────────────────────────────── */

test("A1 标题不许超过接口上限（超了对面会截或者拒）", () => {
  const long = xhsPost({ ...cpu, title: "很长的标题".repeat(20) });
  assert.ok(
    len(long.title) <= XHS_TITLE_MAX,
    `标题 ${len(long.title)} 个码点，超过了 ${XHS_TITLE_MAX}`
  );
  assert.ok(long.title.endsWith("…"), "截过的标题要补省略号");
});

test("A2 正文不许超过接口上限", () => {
  const many: XhsPostSource = {
    ...cpu,
    voices: Array.from({ length: 6 }, (_, i) => ({
      label: `厂商 产品${i}（模型-${i}）`,
      description: "很长的一段摘要。".repeat(40),
    })),
  };
  const post = xhsPost(many);
  assert.ok(
    len(post.body) <= XHS_BODY_MAX,
    `正文 ${len(post.body)} 个码点，超过了 ${XHS_BODY_MAX}`
  );
  // ★ 缩的是摘要，**名字不许被缩掉** —— 那是这条笔记的出处。
  for (const v of many.voices) {
    assert.ok(
      post.body.includes(v.label!),
      `缩正文的时候把「${v.label}」弄丢了 —— 那是把出处抹了`
    );
  }
});

test("A3 标签去空去重、截到接口上限", () => {
  assert.deepEqual(xhsTags(["财报", " ", "财报", "估值"]), ["财报", "估值"]);
  assert.equal(
    xhsTags(Array.from({ length: XHS_TAG_MAX + 5 }, (_, i) => `t${i}`)).length,
    XHS_TAG_MAX
  );
  assert.deepEqual(xhsTags(undefined), []);
});

test("A4 一份都没有要抛，不许兜出一条看起来正常的笔记", () => {
  // 兜底会让"调用方忘了传"变成一条少了所有人名字的笔记，而四处全绿。
  assert.throws(() => xhsPost({ ...cpu, voices: [] }), /voices 是空的/);
});

/* ── B 组：标题 ─────────────────────────────────────────────────────── */

test("B1 标题够用就用标题（站上真实的那条问答）", () => {
  const post = xhsPost(cpu);
  assert.equal(post.title, "昨晚CPU暴涨是因为什么，是否可持续？");
  assert.ok(len(post.title) <= XHS_TITLE_MAX);
});

test("B2 标题就是票代码 → 换成摘要（站上真有 title: ZM 的研究报告）", () => {
  const post = xhsPost(zm);
  assert.notEqual(post.title, "ZM", "一个光秃秃的代码当标题，信息量约等于零");
  assert.ok(
    post.title.startsWith("当前处于AI新产品"),
    `拿到的是「${post.title}」—— 应该换成摘要那一段`
  );
  // 代码没丢：正文第一行还有它。
  assert.ok(xhsPost(zm).body.startsWith("ZM Zoom"));
});

test("B3 标题是代码、摘要也空 → 仍然用标题（空标题最糟）", () => {
  const t = xhsTitle({
    ...zm,
    voices: [{ label: "Google Spark（Gemini-3.1-Pro）", description: "" }],
  });
  assert.equal(t, "ZM");
});

/* ── C 组：正文 ─────────────────────────────────────────────────────── */

test("C1 正文形状：标的 → 每份「名字换行摘要」→ 落款", () => {
  const body = xhsPost(cpu).body;
  assert.equal(
    body,
    [
      "ARM Arm",
      "",
      "OpenAI ChatGPT（GPT-6-Pro）",
      "CPU 需求重估有依据，短线股价已抢跑。",
      "",
      "Google Spark（Gemini-3.1-Pro）",
      "AI智能体引爆CPU需求；长线逻辑坚实，短线过热透支。",
      "",
      "——",
      "问答 · 2026-09-22 · 全文见封面图上的网址",
    ].join("\n")
  );
});

test("C2 摘要**原样给全**，不像封面卡那样截", () => {
  // 封面卡把每份截到 62 个码点（两行放得下的量）；正文有 1000 字，图是钩子、
  // 正文是内容。这一条钉着别把那个截断抄过来。
  assert.ok(zm.voices[0]!.description.length > 40);
  assert.ok(xhsPost(zm).body.includes(zm.voices[0]!.description));
});

test("C3 两样都空的那一份整块不要（印出来是一段空白）", () => {
  const body = xhsPost({
    ...cpu,
    voices: [cpu.voices[0]!, { description: "  " }],
  }).body;
  assert.ok(body.includes("CPU 需求重估有依据"));
  assert.ok(!body.includes("\n\n\n"), "留下了一段空白块");
});

test("C4 落款指回封面图，**不在正文里贴链接**", () => {
  const body = xhsPost(cpu).body;
  assert.ok(!/https?:\/\//.test(body), "正文里出现了外链 —— 小红书对此有风控");
  assert.ok(body.includes("封面图"), "得告诉读者去哪看全文");
});

/* ── D 组：不许把 X 那套抄过来 ─────────────────────────────────────── */

/**
 * 【2026-09-22】这一组是**吃过一次亏才写的**。
 *
 * 封面卡第一版每一份只印产品名（`ChatGPT`），因为我从 `sharePost.ts` 抄了
 * 那个形状 —— 而那边剪掉厂商和模型的理由是 **X 的 280 字预算**，卡片上
 * 根本没有那个约束。用户当场报了「应该是要把回答的模型写上去的」。
 *
 * 小红书这边预算更宽（正文 1000 字），再抄一次就是同一个错误犯第三遍。
 */
test("D1 模型名留在正文里 —— 那条「剪掉模型」的规矩只属于 X", () => {
  const body = xhsPost(cpu).body;
  assert.ok(body.includes("GPT-6-Pro"), "模型名被剪掉了");
  assert.ok(body.includes("OpenAI"), "厂商也被剪掉了");
});

test("D2 标签单独传，**不进正文**", () => {
  const post = xhsPost({ ...cpu, tags: ["财报", "估值"] });
  assert.deepEqual(post.tags, ["财报", "估值"]);
  assert.ok(!post.body.includes("#财报"), "标签是单独一个数组，不该拼进正文");
});

test("D3 标的不加 `$` 前缀（cashtag 是 X 的习惯）", () => {
  assert.equal(symbolLine([{ code: "ZM", name: "Zoom" }]), "ZM Zoom");
  assert.ok(!xhsPost(cpu).body.includes("$"), "小红书上没有 cashtag 这个约定");
});

test("D4 一只票带名字，几只票只列代码", () => {
  assert.equal(
    symbolLine([{ code: "ARM", name: "安谋" }, { code: "INTC" }]),
    "ARM · INTC"
  );
  assert.equal(symbolLine([]), "");
});

test("D5 三个「最多几个标签」是三个常量，别合并", () => {
  // 接口上限（10）/ 卡片一行放得下几个（4）/ X 的 280 字预算（3）——
  // 三者恰好都叫"最多几个标签"，来源互不相干。
  assert.match(read("src/utils/xhsPost.ts"), /XHS_TAG_MAX = 10/);
  assert.match(read("src/utils/xhsCardPlan.ts"), /XHS_TAG_LIMIT = 4/);
  assert.match(read("src/utils/sharePost.ts"), /SHARE_TAG_LIMIT = 3/);
  // ⚠ 比的是**代码**，不是注释：文件头那段正是在解释它们为什么不该合并。
  const code = codeOnly(read("src/utils/xhsPost.ts"));
  assert.ok(
    !code.includes("XHS_TAG_LIMIT") && !code.includes("SHARE_TAG_LIMIT"),
    "xhsPost.ts 引了另外两个标签上限之一 —— 它们不是同一件事"
  );
});
