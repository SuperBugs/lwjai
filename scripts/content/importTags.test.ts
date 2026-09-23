/**
 * planImport 的 tags：粘贴导入从 JSON 里带过来的标签要按 YAML 流式序列写进 frontmatter，
 * 不给就还是空数组（CLI 那条路不变）。
 *
 * ★【2026-09-21】标签成了**封闭词表**之后这里多了一条：表里没有的标签**丢掉并报一行**。
 *   为什么不能留着（留着构建就红、后台那条草稿也打不开），以及为什么不能静默丢，
 *   写在 importPlan.ts 那一段上。
 *   ⚠ 用例里的标签**必须是 src/data/tags.json 里真有的**，不然第一条测的就不是
 *     "写进去了"而是"被丢掉了"，而它照样绿（docs/engineering-notes.md 坑 17 那个形态）。
 *
 * ★【2026-09-21 改的】所以探针标签**从表里取**（`TAGS.slice(0, 2)`），
 *   不许点名写「财报」「估值」。原来是点名的，还顺手断言了一次表里确实有它们 ——
 *   那个自检方向是对的，但代价是：**站长在后台把标签改个名，`pnpm test` 当场红、
 *   远程构建挂掉**，而代码一个字都没错。同一天 `answerOrder.test.ts` 正是这么炸的
 *   （用例名写着"空表"，却读了人在后台排过序的那份文件）。
 *   判据要钉就钉**行为**：表里有的写进去、表里没有的丢掉并报一行 ——
 *   那跟今天表里排着哪几个词毫无关系。而改标签名是这个站的日常操作
 *   （docs/engineering-notes.md 里那一条写着"改名 = 改所有用着它的条目里的那个词"）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { planImport } from "./importPlan";
import { TAGS } from "../../src/config/tags";

const base = (over: Partial<Parameters<typeof planImport>[0]> = {}) =>
  planImport({
    collection: "posts",
    markdown: "# TSLA｜特斯拉\n\n一段正文。",
    now: new Date("2026-09-19T20:10:00Z"),
    existingIds: ["1000", "1001", "1002"],
    agent: "spark",
    model: "gemini-3-pro",
    ...over,
  });

const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 探针：表里真有的前两个标签。**不点名** —— 理由见文件头。 */
const SAMPLE = TAGS.slice(0, 2);

/** 表里绝对没有的写法。冒号那个连格式都不合法，模型却真会现编出来。 */
const BOGUS = ["表里根本没有这个标签", "带:冒号的标签"];

test("给了表里有的 tags 就写成 YAML 流式序列，带引号，空白和空串去掉", () => {
  // 前提自检：得有可用的探针，否则下面测的是另一件事（同 docs/engineering-notes.md 坑 17）。
  assert.ok(SAMPLE.length > 0, "标签表是空的 —— 这条用例没有可用的探针");

  // 最后一个故意两边带空白，验 trim；再塞一个空串，验它被丢掉。
  const p = base({ tags: [...SAMPLE.slice(0, -1), ` ${SAMPLE.at(-1)} `, ""] });
  const expected = SAMPLE.map(t => `"${reEscape(t)}"`).join(", ");
  assert.match(p.frontmatter, new RegExp(`^tags: \\[${expected}\\]$`, "m"));
  assert.equal(
    p.warnings.filter(w => w.includes("标签表")).length,
    0,
    "全都在表里，不该报标签那一行"
  );
});

test("表里没有的标签丢掉，并且**说出来**（模型最爱现编标签）", () => {
  assert.ok(SAMPLE.length > 0, "标签表是空的 —— 这条用例没有可用的探针");
  for (const b of BOGUS) {
    assert.ok(!TAGS.includes(b), `探针「${b}」居然真被加进标签表了，给这条换一个`);
  }

  const good = SAMPLE[0]!;
  const p = base({ tags: [good, ...BOGUS] });
  assert.match(
    p.frontmatter,
    new RegExp(`^tags: \\["${reEscape(good)}"\\]$`, "m"),
    "表里有的那个没写进去，或者表里没有的混进去了"
  );
  const note = p.warnings.find(w => w.includes("标签表"));
  assert.ok(note, "丢了两个标签却一声不吭 —— 那是替它决定了分类");
  for (const b of BOGUS) assert.ok(note!.includes(b), `丢了「${b}」却没说`);
});

test("不给 tags 还是空数组", () => {
  assert.match(base().frontmatter, /^tags: \[\]$/m);
  assert.match(base({ tags: [] }).frontmatter, /^tags: \[\]$/m);
});
