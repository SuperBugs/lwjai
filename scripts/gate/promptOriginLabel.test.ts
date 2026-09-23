/**
 * 「这份提示词是谁写的」的可见文案（`src/utils/promptOriginLabel.ts`）。
 *
 * 【2026-09-20】站长的提示词从「站长自己在用的」改成「分享者：牢玩家」—— 名字来自
 * config.site.author，靠 `{{author}}` 占位符填进去。值得钉的失败形态只有一种：
 * 占位符没填上，页面上印出字面的 `{{author}}`，而构建全绿。三档仍然不许长得一样。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { promptOriginLabel } from "../../src/utils/promptOriginLabel";

// 和 zh-CN.ts 里的形状一致（这里不 import i18n：它走 @/ 别名，裸 tsx 加载不了）。
const LABELS = {
  site: "分享者：{{author}}",
  contributedBy: "分享者：{{name}}（网友投稿）",
  unspecified: "分享者未标注",
  author: "牢玩家",
};

test("站长自己写的：分享者：牢玩家，占位符填掉，完成态", () => {
  const got = promptOriginLabel("site", undefined, LABELS);
  assert.deepEqual(got, { label: "分享者：牢玩家", pending: false });
  assert.ok(!got.label.includes("{{"), "占位符没填上");
});

test("网友投稿带署名：分享者：某某（网友投稿），完成态；署名和「投稿」一起出现", () => {
  const got = promptOriginLabel("contributed", "老王", LABELS);
  assert.equal(got.label, "分享者：老王（网友投稿）");
  assert.equal(got.pending, false);
});

test("投稿但署名空着 / 哨兵 / 认不出来的值：都是待补，文案是「分享者未标注」", () => {
  for (const [origin, contributor] of [
    ["contributed", "  "],
    ["unspecified", undefined],
    [undefined, undefined],
    ["contribution", "老王"],
  ] as const) {
    const got = promptOriginLabel(origin, contributor, LABELS);
    assert.equal(got.label, "分享者未标注", `origin=${origin}`);
    assert.equal(got.pending, true, `origin=${origin}`);
  }
});

test("三档文案两两不同 —— 压成两档在页面上零症状", () => {
  const site = promptOriginLabel("site", undefined, LABELS).label;
  const contributed = promptOriginLabel("contributed", "老王", LABELS).label;
  const pending = promptOriginLabel("unspecified", undefined, LABELS).label;
  assert.equal(new Set([site, contributed, pending]).size, 3);
});
