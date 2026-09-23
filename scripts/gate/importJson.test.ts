/**
 * 「粘贴导入」判据（src/dev/importJson.ts）的测试。
 * 喂的是模型真的会吐出来的形状：包在 ```json 围栏里、前面一句客套话、代码小写、
 * 多一个不认识的字段。不是照着实现反推的碎片。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractJson,
  fillPromptPlaceholders,
  parsePublishJson,
} from "../../src/dev/importJson";

const GOOD = {
  collection: "posts",
  title: "ORCL｜甲骨文 (Oracle Corp)",
  description: "云基础设施订单撑起的估值，和它的反证",
  symbol: "orcl",
  symbolName: "甲骨文",
  tags: ["财报", "估值", "财报"],
  agent: "spark",
  model: "gemini-3-pro",
  prompt: "stock-analysis",
  body: "# ORCL｜甲骨文\n\n## 一、结论速览\n\n一段正文。",
};

test("围栏、客套话、小写代码：全部能收；重复标签去重、代码转大写", () => {
  const pasted = `好的，这是整理好的 JSON：\n\n\`\`\`json\n${JSON.stringify(GOOD, null, 2)}\n\`\`\`\n\n需要我再调整吗？`;
  const r = parsePublishJson(pasted);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.value.symbol, "ORCL");
  assert.deepEqual(r.value.tags, ["财报", "估值"]);
  assert.equal(r.value.agent, "spark");
  assert.equal(r.value.model, "gemini-3-pro");
  assert.equal(r.value.prompt, "stock-analysis");
  assert.ok(r.value.body.startsWith("# ORCL"));
  assert.deepEqual(r.notes, []);
});

test("所有错一次摊出来，不是一次一条", () => {
  const r = parsePublishJson(
    JSON.stringify({
      collection: "post",
      title: "",
      body: "",
      symbol: "特斯拉",
      tags: "财报",
      agent: "Google Spark",
      model: "gemini 3 pro",
      questionKey: "TSLA Margin",
    })
  );
  assert.ok(!r.ok);
  const joined = r.errors.join("\n");
  for (const needle of [
    "collection",
    "title 是空的",
    "body",
    "symbol",
    "tags 必须是字符串数组",
    "agent「Google Spark」不在登记表里",
    "model「gemini 3 pro」不在登记表里",
    "questionKey",
  ]) {
    assert.ok(joined.includes(needle), `少报了：${needle}\n${joined}`);
  }
});

test("集合专属字段放错集合要报：问答不许带 prompt，研究稿不许带 questionKey", () => {
  const qa = parsePublishJson(JSON.stringify({ ...GOOD, collection: "qa" }));
  assert.ok(!qa.ok && qa.errors.some(e => e.includes("prompt 只有研究稿")));
  const posts = parsePublishJson(
    JSON.stringify({ ...GOOD, prompt: "", questionKey: "tsla-margin" })
  );
  assert.ok(!posts.ok && posts.errors.some(e => e.includes("questionKey 只有问答")));
});

test("空的可选项：智能体 / 模型记成未标注并提示；摘要空了提示；不认识的字段忽略并提示", () => {
  const r = parsePublishJson(
    JSON.stringify({
      collection: "qa",
      title: "为什么回购重要？",
      body: "因为……",
      agent: "",
      model: "",
      description: "",
      notes: "模型顺手多给的",
    })
  );
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.value.agent, "unspecified");
  assert.equal(r.value.model, "unspecified");
  assert.equal(r.value.description, undefined);
  assert.deepEqual(r.value.tags, []);
  assert.ok(r.notes.some(n => n.includes("agent 是空的")));
  assert.ok(r.notes.some(n => n.includes("model 是空的")));
  assert.ok(r.notes.some(n => n.includes("description 是空的")));
  assert.ok(r.notes.some(n => n.includes("「notes」")));
});

test("不是 JSON 就说清楚，不猜", () => {
  assert.throws(() => extractJson("这不是 json"), /不是合法 JSON/);
  const r = parsePublishJson("[1, 2]");
  assert.ok(!r.ok && r.errors[0]!.includes("顶层必须是一个对象"));
});

test("占位符换成登记表里的 id（名字）", () => {
  const out = fillPromptPlaceholders(
    "agent 填 {{agents}} 里的一个；model 填 {{models}} 里的一个",
    [{ id: "spark", name: "Google Spark" }],
    [{ id: "gpt-6-pro", name: "GPT-6-Pro" }]
  );
  assert.equal(out, "agent 填 spark（Google Spark） 里的一个；model 填 gpt-6-pro（GPT-6-Pro） 里的一个");
});
