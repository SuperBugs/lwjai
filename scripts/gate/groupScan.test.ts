/**
 * 后台「这一条是…」那个下拉的数据来源（`src/config/groupScan.ts`）。
 *
 * 值得钉的是三件**在界面上都不报错**的事：
 *   ① 归组的规矩和站上那份（`related.ts` 的 `qaGroupKey()`）对不上 ——
 *      后台按一种分组、站上按另一种，两边都"正常工作"；
 *   ② 挑错"根"那一条 —— 下拉里显示的标题不是这个组真正的题目；
 *   ③ 要带过去的那几格读漏一个 —— 补的那一份少一格，
 *      而少的那一格恰好是"和别人保持一致"的理由。
 *
 * 用例喂的是**后台真会写出来的 frontmatter**（双引号标量、折行摘要、
 * 没有 questionKey 的第一条），不是照着正则反推的碎片。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupDateSuffix,
  scanGroups,
  yamlScalar,
} from "../../src/config/groupScan";

const CARRY = ["title"];
/** 多值那几格（【2026-09-22】标的从三个文本框换成了一格多选）。 */
const CARRY_LIST = ["symbols"];

/** 后台存盘出来的样子。 */
const ROOT = `---
title: ORCL｜甲骨文 样例标题
description: >-
  折行的摘要，第二行还在缩进里，
  不许被当成别的键。
pubDatetime: 2026-09-16T12:00:00.000Z
symbols:
  - ORCL
agent: spark
---

正文。
`;

const MEMBER = `---
questionKey: orcl-20260920-0857-spark-gemini-3-pro
title: ORCL｜甲骨文 样例标题
pubDatetime: 2026-09-20T09:30:00.000Z
symbols:
  - ORCL
agent: claude
---

正文。
`;

const OTHER = `---
title: QCOM｜高通 样例标题
pubDatetime: 2026-09-20T08:53:00.000Z
symbols:
  - QCOM
  - AVGO
---

正文。
`;

const files = (m: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(m).map(([slug, raw]) => [
      `./src/content/posts/${slug}.md`,
      raw,
    ])
  );

test("一组只出一项，标题取根那条；组员不另占一项", () => {
  const groups = scanGroups(
    files({
      "orcl-20260920-0857-spark-gemini-3-pro": ROOT,
      "orcl-20260921-claude": MEMBER,
      "qcom-20260920-0853": OTHER,
    }),
    CARRY
  );
  assert.deepEqual(
    groups.map(g => g.key),
    ["orcl-20260920-0857-spark-gemini-3-pro", "qcom-20260920-0853"],
    "两组：ORCL 那一组两条折成一项，QCOM 自己一项（新的在前：ORCL 组里那条 09-20 09:30 最新）"
  );
  assert.equal(groups[0]!.label, "ORCL｜甲骨文 样例标题");
});

test("★ 根那条**后**出现也要顶掉组员的标题 —— 文件顺序不该影响结果", () => {
  // glob 的顺序不是承诺。组员先被扫到时它的标题会先占位，根出现时必须替换掉。
  const groups = scanGroups(
    files({
      "a-member": `---\nquestionKey: the-root\ntitle: 组员的标题（不该出现在下拉里）\n---\n`,
      "the-root": `---\ntitle: 根那条的标题\n---\n`,
    }),
    CARRY
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.label, "根那条的标题");
  assert.equal(groups[0]!.isRoot, true);
});

test("要带的那几格从根那条读；根上没有的键**不出现**（不是空串）", () => {
  const groups = scanGroups(
    files({ "orcl-20260920-0857-spark-gemini-3-pro": ROOT }),
    ["title", "agent", "canonicalURL"],
    CARRY_LIST
  );
  // 根上有的两格照读；`canonicalURL` 根上没有 —— 那个键**不该出现**。
  // 出现成空串的话，页面那侧分不清"根上就没有"和"读漏了"。
  assert.deepEqual(groups[0]!.carry, {
    title: "ORCL｜甲骨文 样例标题",
    agent: "spark",
  });
  assert.ok(!("canonicalURL" in groups[0]!.carry));
});

/**
 * 【2026-09-22 标的换成多选那天加的】多值那几格读的是 YAML 块序列。
 *
 * ★ 和单值那几格**刻意不一样**：读不到那个键是**空数组**，不是"这个键不出现"。
 *   消费方（keystaticGroupFill）拿它去勾选框 —— 空 = 一个都不勾，
 *   而那正是"和这一组保持一致"在"这一组一只票都没勾"时该有的样子。
 */
test("多值那几格：块序列读得出来，几只票都要带", () => {
  const groups = scanGroups(
    files({
      "orcl-20260920-0857-spark-gemini-3-pro": ROOT,
      "qcom-20260920-0853": OTHER,
    }),
    CARRY,
    CARRY_LIST
  );
  const byKey = Object.fromEntries(groups.map(g => [g.key, g]));
  assert.deepEqual(
    byKey["orcl-20260920-0857-spark-gemini-3-pro"]!.carryList,
    { symbols: ["ORCL"] }
  );
  assert.deepEqual(byKey["qcom-20260920-0853"]!.carryList, {
    symbols: ["QCOM", "AVGO"],
  });
});

test("多值那几格：`symbols: []` 和「根本没有这个键」都是空数组（不是缺键）", () => {
  const groups = scanGroups(
    files({
      empty: `---\ntitle: 一条宏观稿\nsymbols: []\n---\n`,
      missing: `---\ntitle: 另一条宏观稿\n---\n`,
    }),
    CARRY,
    CARRY_LIST
  );
  for (const g of groups) {
    assert.deepEqual(
      g.carryList,
      { symbols: [] },
      `${g.key} 的多值那一格不是空数组 —— 消费方是"把勾选框勾成这样"，缺键会被读成"别动它"`
    );
  }
});

test("多值那几格：只吃紧跟着的那几行，下一个键开始就停", () => {
  // ★ 这一条钉的是最容易写坏的边界：块序列的收尾。多吃一行的话，
  //   下面那个键的值会被当成一只票带进勾选框，而它在标的表里根本不存在。
  const groups = scanGroups(
    files({
      x: `---\ntitle: 一条\nsymbols:\n  - ARM\n  - INTC\ntags:\n  - 行业\nagent: spark\n---\n`,
    }),
    CARRY,
    CARRY_LIST
  );
  assert.deepEqual(groups[0]!.carryList, { symbols: ["ARM", "INTC"] });
});

test("归组的规矩和站上那份一致：填了键用键，没填用自己的地址", () => {
  const groups = scanGroups(
    files({
      "the-root": `---\ntitle: 根\n---\n`,
      "member-a": `---\nquestionKey: the-root\ntitle: A\n---\n`,
      "member-b": `---\nquestionKey: the-root\ntitle: B\n---\n`,
      "loner": `---\ntitle: 独一份\n---\n`,
    }),
    CARRY
  );
  assert.deepEqual(
    groups.map(g => g.key).sort(),
    ["loner", "the-root"],
    "三条同组的只出一项；没填键的自己成一组"
  );
});

test("`_` 开头的文件不算条目（和 content.config.ts 的 glob 同一条规则）", () => {
  const groups = scanGroups(
    files({ _keep: `---\ntitle: 占位\n---\n`, real: `---\ntitle: 真的\n---\n` }),
    CARRY
  );
  assert.deepEqual(
    groups.map(g => g.key),
    ["real"]
  );
});

test("读不到标题就退回地址 —— 下拉里一个英文名也比一个空选项强", () => {
  const groups = scanGroups(files({ "no-title": `---\nsymbol: TSLA\n---\n` }), CARRY);
  assert.equal(groups[0]!.label, "no-title");
});

test("YAML 标量：双引号按 JSON 解，单引号只剥引号，裸的原样", () => {
  assert.equal(yamlScalar('"带\\"引号\\"的标题"'), '带"引号"的标题');
  assert.equal(yamlScalar("'单引号里的 '' 两个撇'"), "单引号里的 ' 两个撇");
  assert.equal(yamlScalar("  裸的  "), "裸的");
  // 双引号里不是合法 JSON 时不许抛，退回"剥掉两头"。
  assert.equal(yamlScalar('"没闭合的 \\x"'), "没闭合的 \\x");
});

/**
 * 【2026-09-21 用户要的】下拉**按时间排、新的在前**。这一组钉三件事：
 *   ① 顺序真的是按时间来的（不是碰巧和标题序一致）；
 *   ② 一组的时间取**全组最新**那一条 —— 刚补进去的那一份要把整组顶上去，
 *      而不是被根那条的老日期压住（这正是"补一份研究"那个动作最需要的顺序）；
 *   ③ 一条时间都读不到的组**沉到最后**，位置是确定的 ——
 *      不确定的话，同一份内容在不同机器上的下拉顺序会不一样（glob 顺序不是承诺）。
 */
test("★ 按时间排、新的在前；一组取全组最新那一条", () => {
  const groups = scanGroups(
    files({
      "old-root": `---\ntitle: 老选题\npubDatetime: 2026-01-01T00:00:00.000Z\n---\n`,
      // 老选题上个月补了一份 —— 整组要跟着被顶到最前。
      "old-root-member": `---\nquestionKey: old-root\ntitle: 老选题\npubDatetime: 2026-09-30T00:00:00.000Z\n---\n`,
      "mid": `---\ntitle: 中间那条\npubDatetime: 2026-05-05T00:00:00.000Z\n---\n`,
      "no-time": `---\ntitle: 没写时间的\n---\n`,
    }),
    CARRY
  );
  assert.deepEqual(
    groups.map(g => g.key),
    ["old-root", "mid", "no-time"],
    "补进来的那一份没把它那一组顶上去，或者没时间的那条没沉底"
  );
  assert.equal(
    groups[0]!.latest,
    "2026-09-30T00:00:00.000Z",
    "组的时间该是全组最新，不是根那条的"
  );
  assert.equal(groups[0]!.label, "老选题", "标题仍然以根那条为准");
  assert.equal(groups[2]!.latest, "", "读不到时间就是空串，不许瞎填一个");
});

test("时间一样时按标题兜底 —— 排序必须是全序", () => {
  const same = `pubDatetime: 2026-09-21T00:00:00.000Z`;
  const groups = scanGroups(
    files({
      b: `---\ntitle: 乙\n${same}\n---\n`,
      a: `---\ntitle: 甲\n${same}\n---\n`,
    }),
    CARRY
  );
  assert.deepEqual(groups.map(g => g.label), ["甲", "乙"]);
});

test("选项后面那个日期：按北京时间，跨 8 小时那一头要跟着翻天", () => {
  // UTC 20:00 在后台那两格里显示的是次日 04:00 —— 这儿不换算就会印前一天，
  // 同一条内容在同一页上出现两个日期，而两处都"没错"。
  assert.equal(groupDateSuffix("2026-09-21T20:00:00.000Z"), "（09-22）");
  assert.equal(groupDateSuffix("2026-09-21T03:37:00.000Z"), "（09-21）");
  // 读不到时间就什么都不缀 —— 不是「（未知）」，那一组已经沉到最后了。
  assert.equal(groupDateSuffix(""), "");
  assert.equal(groupDateSuffix("去年秋天"), "");
});
