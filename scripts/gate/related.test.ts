/**
 * 详情页「相关条目」判据（`src/utils/related.ts`）和计数文案（`coverageLabel.ts`）的测试。
 *
 * 这几个函数各自只有几行，值得测的是那几个**零症状**的错法：
 *   - 把本篇也列进「其他研究」里（页面、构建、闸门三处全绿）
 *   - `BRK.B` 和 `BRK-B` 被当成两只票（/s/brk-b 上是同一页，这里却分家）
 *   - `posts/foo` 和 `qa/foo` 因为 id 相同被当成同一条
 *   - 同一条在一页上列两次（两张卡带同一个 view-transition-name，动画整个跳过）
 * 用例喂的都是后台真会写出来的 frontmatter 形状。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  entriesUsingPrompt,
  normalizeSymbol,
  GROUPED_COLLECTIONS,
  isGroupedCollection,
  qaGroupKey,
  qaSiblings,
  relatedBySymbol,
} from "../../src/utils/related";
import { coverageLabel } from "../../src/utils/coverageLabel";

/** 一条内容讲哪几只票。【2026-09-22】schema 里这一格是 `symbols: string[]`，
 *  用例里写一只票时仍然允许直接给一个字符串（省得每处都套一层方括号）。 */
const syms = (s?: string | string[]): string[] =>
  s === undefined ? [] : Array.isArray(s) ? s : [s];

const post = (
  id: string,
  symbol?: string | string[],
  prompt?: { id: string; collection: string },
  // 【2026-09-20】研究稿也归组，和问答共用 questionKey 这一个字段。
  questionKey?: string
) => ({
  id,
  collection: "posts",
  data: { symbols: syms(symbol), prompt, questionKey },
});

const qa = (id: string, symbol?: string | string[], questionKey?: string) => ({
  id,
  collection: "qa",
  data: { symbols: syms(symbol), questionKey },
});

// ── 同一只票 ──────────────────────────────────────────────────────────

test("同标的：本篇不许出现在「其他研究」里", () => {
  const me = post("tsla-20260918", "TSLA");
  const pool = [me, post("tsla-20260901", "TSLA"), qa("tsla-margin", "TSLA")];
  const got = relatedBySymbol(pool, me, ["TSLA"]).map(e => e.id);
  assert.deepEqual(got, ["tsla-20260901", "tsla-margin"]);
});

test("同标的：BRK.B 和 BRK-B 是同一只票（和 /s/brk-b 同一个口径）", () => {
  const me = post("brk-20260918", "BRK.B");
  const pool = [me, post("brk-20260901", "BRK-B"), post("brka", "BRK.A")];
  assert.deepEqual(
    relatedBySymbol(pool, me, ["BRK.B"]).map(e => e.id),
    ["brk-20260901"],
    "点和连字符是同一只票的两种写法；BRK.A 是另一只"
  );
  assert.equal(normalizeSymbol(" brk.b "), "BRK-B");
});

test("同标的：一只票都没勾的条目返回空，也不把别的无标的条目扯进来", () => {
  const me = post("macro-20260918"); // 宏观稿，本来就不讲单只票
  const pool = [me, post("macro-20260901"), post("tsla", "TSLA")];
  assert.deepEqual(relatedBySymbol(pool, me, undefined), []);
  assert.deepEqual(relatedBySymbol(pool, me, []), []);
  assert.deepEqual(relatedBySymbol(pool, me, me.data.symbols), []);
});

test("同标的：已经在同一页别处列出的条目要排除", () => {
  // 问答页上「其他智能体的回答」已经列了 tsla-margin-claude，
  // 下面「关于 TSLA 的其他内容」再列一遍 = 同一条两张卡、同一个 transition 名。
  const me = qa("tsla-margin-gemini", "TSLA", "tsla-margin");
  const sibling = qa("tsla-margin-claude", "TSLA", "tsla-margin");
  const pool = [me, sibling, post("tsla-20260918", "TSLA")];
  assert.deepEqual(
    relatedBySymbol(pool, me, ["TSLA"], [sibling]).map(e => e.id),
    ["tsla-20260918"]
  );
});

test("同标的：身份按「集合 + id」比，posts/foo 和 qa/foo 不是同一条", () => {
  // 后台写扁平文件，两个集合里同名文件的 id 相同。只比 id 会把那条问答当成本篇排除掉。
  const me = post("tsla", "TSLA");
  const twin = qa("tsla", "TSLA");
  assert.deepEqual(relatedBySymbol([me, twin], me, ["TSLA"]), [twin]);
});

/**
 * 【2026-09-22 问答那一格改成多选那天加的】一条内容可以讲好几只票。
 *
 * ★ 判据是**有没有共同的票**（交集非空），不是"两边完全一样"。要求全等的话，
 *   那条同时讲 ARM / INTC 的问答会和谁都不相关 —— 而页面上只会少一块，
 *   不报错、不掉链接，正是这个仓库最在意的那种零症状。
 */
test("同标的：多只票按**交集**算 —— 有一只对上就算相关", () => {
  const cpu = qa("cpu-rally", ["ARM", "INTC", "AMD"], "cpu-rally");
  const armOnly = post("arm-20260922", "ARM");
  const intcOnly = post("intc-20260922", "INTC");
  const nvda = post("nvda-20260922", "NVDA");
  const pool = [cpu, armOnly, intcOnly, nvda];

  // 从那条多标的问答看出去：三只里有两只在站上有别的内容
  assert.deepEqual(
    relatedBySymbol(pool, cpu, cpu.data.symbols).map(e => e.id),
    ["arm-20260922", "intc-20260922"]
  );
  // 反过来：只讲 ARM 的那篇也该看得见它
  assert.deepEqual(
    relatedBySymbol(pool, armOnly, armOnly.data.symbols).map(e => e.id),
    ["cpu-rally"]
  );
  // 完全不沾边的那只仍然不相关
  assert.deepEqual(relatedBySymbol(pool, nvda, nvda.data.symbols), []);
});

test("同标的：多只票里的写法差异一样归一（BRK.B / brk-b）", () => {
  const me = qa("two-share-classes", ["BRK.B", "ARM"]);
  const pool = [me, post("brk", "brk-b"), post("arm", "ARM")];
  assert.deepEqual(
    relatedBySymbol(pool, me, me.data.symbols).map(e => e.id),
    ["brk", "arm"]
  );
});

// ── 同一个问题 ────────────────────────────────────────────────────────

test("问题组：只列同一个键的其他回答，本条排除，顺序照 pool", () => {
  const me = qa("tsla-margin-gemini", "TSLA", "tsla-margin");
  const pool = [
    qa("tsla-margin-claude", "TSLA", "tsla-margin"),
    me,
    qa("nvda-capex-gemini", "NVDA", "nvda-capex"),
    qa("tsla-margin-gpt", "TSLA", "tsla-margin"),
  ];
  assert.deepEqual(qaSiblings(pool, me, me.data.questionKey).map(e => e.id), [
    "tsla-margin-claude",
    "tsla-margin-gpt",
  ]);
});

test("问题组：没填键 → 空；填了键但没别的回答 → 空（那一档页面上要说出来）", () => {
  const alone = qa("why-buybacks", undefined, "why-buybacks");
  const unkeyed = qa("what-is-pe");
  const pool = [alone, unkeyed, qa("tsla-margin-claude", "TSLA", "tsla-margin")];
  assert.deepEqual(qaSiblings(pool, unkeyed, undefined), []);
  assert.deepEqual(qaSiblings(pool, alone, alone.data.questionKey), []);
  // 两档在这里长得一样是对的 —— 分档由页面按「有没有键」做，不由返回值做。
});

/**
 * 【2026-09-20】后台那一格换成下拉之后，**第一条问答没键可填**（那会儿还没有
 * "已有问题"可挑），后来的回答指向它的地址。所以归组是「填了键就用键，
 * 没填就用自己的地址」。下面这组钉的是这条判据本身。
 */
test("问题组：第一条留空、后来的指向它的地址 —— 双向都算同一组", () => {
  const root = qa("crwv-convertible", "CRWV"); // 第一条：没有键
  const claude = qa("crwv-convertible-claude", "CRWV", "crwv-convertible");
  const spark = qa("crwv-convertible-spark", "CRWV", "crwv-convertible");
  const pool = [root, claude, spark, qa("nvda-capex", "NVDA")];

  // 从第一条看出去：两条指向它的回答都在
  assert.deepEqual(
    qaSiblings(pool, root, root.data.questionKey).map(e => e.id),
    ["crwv-convertible-claude", "crwv-convertible-spark"]
  );
  // 从后来的那条看出去：第一条和另一条都在（★ 第一条容易被漏掉 —— 它没有键）
  assert.deepEqual(
    qaSiblings(pool, claude, claude.data.questionKey).map(e => e.id),
    ["crwv-convertible", "crwv-convertible-spark"]
  );
  // 归组的键：没填就是自己的地址
  assert.equal(qaGroupKey(root), "crwv-convertible");
  assert.equal(qaGroupKey(claude), "crwv-convertible");
});

test("问题组：老写法（几条互相填同一个键）一个字不改也照样同组", () => {
  // 2026-09-20 之前写进去的稿子就是这个形状：谁都不是"根"，共用一个手填的键。
  const me = qa("tsla-margin-gemini", "TSLA", "tsla-margin");
  const other = qa("tsla-margin-claude", "TSLA", "tsla-margin");
  const pool = [me, other];
  assert.deepEqual(qaSiblings(pool, me, "tsla-margin").map(e => e.id), [
    "tsla-margin-claude",
  ]);
  assert.equal(qaGroupKey(me), "tsla-margin");
});

test("问题组：两条各自留空、互不相干 —— 不许因为都没键就并成一组", () => {
  // ★ 归组退回"自己的地址"时最容易出的错：把所有没填键的条目并成一大组。
  const a = qa("what-is-pe");
  const b = qa("why-buybacks");
  const pool = [a, b];
  assert.deepEqual(qaSiblings(pool, a, undefined), []);
  assert.deepEqual(qaSiblings(pool, b, undefined), []);
});

test("问题组：键两边有空格也算同一个（下拉存进来的值不该因此分家）", () => {
  const root = qa("crwv-convertible", "CRWV");
  const answer = qa("crwv-claude", "CRWV", "  crwv-convertible  ");
  const pool = [root, answer];
  assert.deepEqual(qaSiblings(pool, root, undefined).map(e => e.id), [
    "crwv-claude",
  ]);
  assert.equal(qaGroupKey(answer), "crwv-convertible");
});

test("问题组：键是逐字比对的，tsla-margin 和 tsla-margins 不是一组", () => {
  const me = qa("a", "TSLA", "tsla-margin");
  const pool = [me, qa("b", "TSLA", "tsla-margins")];
  assert.deepEqual(qaSiblings(pool, me, "tsla-margin"), []);
});

// ── 用了这份提示词 ────────────────────────────────────────────────────

test("提示词：只认 prompt.id 相同的条目，没引用的和引用别份的都不算", () => {
  const ref = { id: "stock-analysis", collection: "prompts" };
  const pool = [
    post("tsla-20260918", "TSLA", ref),
    post("nvda-20260918", "NVDA"),
    post("aapl-20260918", "AAPL", {
      id: "relative-valuation",
      collection: "prompts",
    }),
  ];
  assert.deepEqual(entriesUsingPrompt(pool, "stock-analysis").map(e => e.id), [
    "tsla-20260918",
  ]);
  assert.deepEqual(entriesUsingPrompt(pool, "trading-strategy"), []);
});

// ── 计数文案 ──────────────────────────────────────────────────────────

test("coverageLabel：为 0 的那一档整段不出现，不许合并成一个总数", () => {
  assert.equal(coverageLabel(3, 2), "3 篇研究 · 2 条问答");
  assert.equal(coverageLabel(3, 0), "3 篇研究");
  assert.equal(coverageLabel(0, 2), "2 条问答");
  assert.ok(!coverageLabel(3, 2).includes("5"), "不许出现「共 5」这种合并数");
});

/**
 * 【2026-09-20】研究稿也归组了（同一个选题、几个智能体各写一份），
 * 和问答**共用 questionKey 这一个字段和这一套判据**。下面这组钉的是
 * "共用"本身：同一个函数喂 posts 也得对，而且**两个集合不许串**。
 */
test("选题组：研究稿走同一套判据 —— 第一条留空、后来的指向它的地址", () => {
  const root = post("orcl-20260916-spark", "ORCL");
  const claude = post(
    "orcl-20260917-claude",
    "ORCL",
    undefined,
    "orcl-20260916-spark"
  );
  const pool = [root, claude, post("nvda-20260901", "NVDA")];

  assert.deepEqual(
    qaSiblings(pool, root, undefined).map(e => e.id),
    ["orcl-20260917-claude"]
  );
  assert.deepEqual(
    qaSiblings(pool, claude, claude.data.questionKey).map(e => e.id),
    ["orcl-20260916-spark"]
  );
  assert.equal(qaGroupKey(root), "orcl-20260916-spark");
  assert.equal(qaGroupKey(claude), "orcl-20260916-spark");
});

test("选题组：同名的研究稿和问答**不许**互相拉进组（后台写的是扁平文件）", () => {
  // ★ 这是这次把判据铺到第二个集合时新开的一条路：posts/foo 和 qa/foo 的 id 相同，
  //   不比集合的话「研究稿 foo」会把「问答 foo」列进自己的选题组，而两边都不报错。
  const research = post("crwv-convertible", "CRWV");
  const answer = qa("crwv-convertible", "CRWV");
  const pool = [research, answer];
  assert.deepEqual(qaSiblings(pool, research, undefined), []);
  assert.deepEqual(qaSiblings(pool, answer, undefined), []);
});

test("GROUPED_COLLECTIONS：只有 posts 和 qa 归组，别的集合不许进来", () => {
  // 判据只有这一处；加第三个集合是改这一行，不是去四个地方各加一个 collection === "…"。
  assert.deepEqual([...GROUPED_COLLECTIONS].sort(), ["posts", "qa"]);
  assert.equal(isGroupedCollection("posts"), true);
  assert.equal(isGroupedCollection("qa"), true);
  assert.equal(isGroupedCollection("guides"), false);
  assert.equal(isGroupedCollection("prompts"), false);
  assert.equal(isGroupedCollection("pages"), false);
});
