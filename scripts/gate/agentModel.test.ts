/**
 * 智能体与模型**两格的联动**（2026-09-21 加）。
 *
 * 在这之前那两格是两个毫不相干的下拉：选了 Google Spark，模型那格照样能停在
 * GPT-6-Pro —— 而那个组合根本不存在，**四处全绿**（zod 只查两个枚举各自合法、
 * 闸门不看 frontmatter 这两格、页面照印两张芯片）。现在归属是登记表里的数据，
 * 判据全在 `src/config/models.ts`。这份测试钉五件事：
 *
 *   A 归属三档认得出来（列了几个 / 不限 / 还没标），**不许压成两档**；
 *   B 错配判据只拦"模型明确登记在别的智能体底下"这一档，别的一律放行；
 *   C 联动只**修矛盾**，从不**替人回答**（当前是「未标注」就不动）；
 *   D **站上已经发出去的内容一条都不许被这条新判据拦下来**（现状对账，读真文件）；
 *   E 接线：后台挂了那段脚本、脚本是轮询不是监听 change、判据没在别处再写一份。
 *
 * ⚠ 用例全是"人真的会这么点"的组合（把 spark 的稿子改成 chatgpt 而忘了改模型、
 *   选了「我自己」、直接调 API 的 Grok-4），不是照着实现反推的
 *   —— docs/gate.md 第 7 节那个 `SC 13D` 事故就是反推用例反推出来的。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { CONTENT_COLLECTIONS } from "../../src/config/collections";
import { ANY_AGENT } from "../../src/config/registry";
import { UNSPECIFIED_AGENT } from "../../src/config/agents";
import {
  agentModelMismatch,
  agentModelPlan,
  findModel,
  modelScope,
  modelsForAgent,
  nextModelFor,
  DEFAULT_MODEL,
  UNSPECIFIED_MODEL,
} from "../../src/config/models";

const read = (p: string) => readFileSync(p, "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ── A 组：归属三档 ───────────────────────────────────────────────────

test("A · 归属三档：列了产品 / 不限 / 还没标，三个不一样", () => {
  assert.deepEqual(modelScope(findModel("gemini-3-pro")), {
    tier: "listed",
    agentIds: ["spark"],
  });
  assert.deepEqual(modelScope(findModel("gpt-6-pro")), {
    tier: "listed",
    agentIds: ["chatgpt", "codex"],
  });
  // 直接调 API 那一档 —— 这是**完成态**，不是没填。
  assert.equal(modelScope(findModel("grok-4")).tier, "any");
  // 还没标：空数组和"没这个键"在 registry.ts 里都折成 undefined，两者同一档。
  assert.equal(
    modelScope({ id: "x", name: "X", vendor: "v" }).tier,
    "unspecified"
  );
  assert.equal(
    modelScope({ id: "x", name: "X", vendor: "v", agents: [] }).tier,
    "unspecified"
  );
  // 登记表里查不到那个 id：也落"还没标"。那是**另一件事**（modelSlot 的 orphanId
  // 那一档在说它），在这儿不许被算成一次错配。
  assert.equal(modelScope(findModel("no-such-model")).tier, "unspecified");
});

// ── B 组：错配判据 ───────────────────────────────────────────────────

test("B · 把 spark 的稿子改成 chatgpt 而忘了改模型 —— 这一条要拦", () => {
  const msg = agentModelMismatch("spark", "gpt-6-pro");
  assert.ok(msg, "spark + gpt-6-pro 是个不存在的组合，没拦下来");
  // 报错要指得出"它到底登记在谁底下"，否则人只知道错了、不知道该改哪一格。
  assert.match(msg!, /OpenAI ChatGPT/);
  assert.match(msg!, /OpenAI Codex/);
  assert.match(msg!, /Google Spark/);
});

test("B · 登记表里成立的组合一律放行", () => {
  assert.equal(agentModelMismatch("spark", "gemini-3-pro"), null);
  assert.equal(agentModelMismatch("chatgpt", "gpt-6-pro"), null);
  assert.equal(agentModelMismatch("codex", "gpt-6-pro"), null);
  assert.equal(agentModelMismatch("claude", "claude-opus-5"), null);
});

test("B · 「不限智能体」那一档：谁底下都放行", () => {
  for (const agent of ["spark", "chatgpt", "claude", "codex"]) {
    assert.equal(agentModelMismatch(agent, "grok-4"), null, agent);
    assert.equal(agentModelMismatch(agent, "deepseek-v4"), null, agent);
  }
});

test("B · 三种「不知道」都不许被当成错配", () => {
  // ① 模型的归属还没标 —— 不知道就不许断言这个组合不存在。
  //    （拿一个真登记表里没有归属的条目来问：走 modelsForAgent，它认的是同一条判据。）
  const unlisted = { id: "future-1", name: "Future-1", vendor: "某厂" };
  assert.equal(modelScope(unlisted).tier, "unspecified");
  // ② 模型那一格是哨兵「未标注」—— 那是待补，由 modelSlot / checkAgentModel 说。
  for (const agent of ["spark", "chatgpt", UNSPECIFIED_AGENT, "human"]) {
    assert.equal(agentModelMismatch(agent, UNSPECIFIED_MODEL), null, agent);
  }
  // ③ 智能体那一格不是 AI 产品。
  //    ★「我自己」填了模型是**另一条规矩**（content.config.ts 的 checkAgentModel）。
  //      这里也报一句的话，同一格上会同时冒出两句话，而它们说的是同一件事。
  assert.equal(agentModelMismatch("human", "gpt-6-pro"), null);
  //    ★ 智能体还没标、模型标了：放行 —— "知道模型、不知道产品"是真会发生的（直接调 API）。
  assert.equal(agentModelMismatch(UNSPECIFIED_AGENT, "gpt-6-pro"), null);
});

// ── C 组：联动 ───────────────────────────────────────────────────────

test("C · 换了智能体，模型矛盾时才换，而且换成那个智能体底下的第一个", () => {
  /**
   * ⚠【2026-09-22 改】这两条原来钉的是**具体 id**（`"gpt-5"` / `"gemini-3-pro"`）。
   * 那一天用户在后台把 GPT-6-Pro 拖到了 GPT-5 前面 —— 一次**纯粹的排序操作**
   * （那张表的行序就是下拉顺序和默认值，拖行是它被设计出来的用法），
   * 测试当场红，而代码一个字都没错。
   *
   * 钉死数据里"今天谁排第一"和钉住判据是两件事。现在钉的是后者：
   * **换过去之后那一个，必须正好是登记表里第一个属于新智能体的模型** ——
   * 拖行不会红，而判据要是改成"随便挑一个属于它的"就会红。
   * （同一个道理在 `registry.test.ts` 那条下拉用例里写过一次。）
   */
  const firstOf = (agent: string) => modelsForAgent(agent)[0]?.id;
  assert.equal(nextModelFor("chatgpt", "gemini-3-pro"), firstOf("chatgpt"));
  assert.equal(nextModelFor("spark", "gpt-6-pro"), firstOf("spark"));
  // 而且那个"第一个"确实是按登记表的行序来的，不是碰巧：
  assert.ok(firstOf("chatgpt"), "ChatGPT 底下一个模型都没有？");
  assert.notEqual(
    firstOf("chatgpt"),
    firstOf("spark"),
    "两个智能体算出同一个第一个 —— 那这两条断言就什么都没验"
  );
  // 反过来：讲得通就一个字不动。
  assert.equal(nextModelFor("chatgpt", "gpt-6-pro"), null);
  assert.equal(nextModelFor("codex", "gpt-6-pro"), null);
  // 「不限」的模型换谁都讲得通。
  assert.equal(nextModelFor("claude", "grok-4"), null);
});

test("C · 联动不替人回答：停在「未标注」就一直是「未标注」", () => {
  // ★ 这一条是这个联动最要紧的边界。自动填上一个模型 = 替这条内容编出处，
  //   而"我没记是哪个模型"是一个**真实的档**（modelSlot 的 unspecified）。
  for (const agent of ["spark", "chatgpt", "claude", "codex"]) {
    assert.equal(nextModelFor(agent, UNSPECIFIED_MODEL), null, agent);
  }
});

test("C · 选「我自己」→ 模型换成「未标注」；选「未标注」→ 什么都不动", () => {
  // 人写的没有模型这回事，留着模型名构建期会红（checkAgentModel 第一条）。
  assert.equal(nextModelFor("human", "gpt-6-pro"), UNSPECIFIED_MODEL);
  assert.deepEqual(modelsForAgent("human"), []);
  // 哨兵智能体：什么模型都讲得通（直接调 API），所以不动。
  assert.equal(nextModelFor(UNSPECIFIED_AGENT, "gpt-6-pro"), null);
  assert.equal(nextModelFor(UNSPECIFIED_AGENT, "grok-4"), null);
});

test("C · 每个智能体底下都算得出「第一个模型」，而且它自己不是错配", () => {
  for (const agent of ["spark", "chatgpt", "claude", "codex"]) {
    const plan = agentModelPlan(agent);
    assert.ok(plan.allowed.includes(UNSPECIFIED_MODEL), `${agent} 不许禁掉哨兵`);
    assert.notEqual(plan.fallback, UNSPECIFIED_MODEL, `${agent} 底下一个模型都没有`);
    assert.equal(agentModelMismatch(agent, plan.fallback), null, agent);
  }
  // 后台那一格的默认值 = 默认智能体底下的第一个，所以它必然不是错配。
  assert.notEqual(DEFAULT_MODEL, UNSPECIFIED_MODEL);
});

// ── D 组：站上已经发出去的内容 ───────────────────────────────────────

test("D · 现状对账：站上每一条内容的「智能体 + 模型」都得在登记表里成立", () => {
  const front = (raw: string) => /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] ?? "";
  const field = (f: string, key: string) =>
    new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m").exec(f)?.[1]?.replace(/["']/g, "");

  let checked = 0;
  for (const spec of CONTENT_COLLECTIONS) {
    for (const name of readdirSync(spec.dir)) {
      if (!name.endsWith(".md") || name.startsWith("_")) continue;
      const f = front(read(`${spec.dir}/${name}`));
      const agent = field(f, "agent");
      const model = field(f, "model");
      // 没有这两格的集合（教程 / 提示词 / 单页）跳过 —— 它们本来就没有这一维。
      if (!agent || !model) continue;
      checked += 1;
      assert.equal(
        agentModelMismatch(agent, model),
        null,
        `${spec.dir}/${name} 的 ${agent} + ${model} 被新判据拦下了 —— ` +
          `要么是登记表里那个模型漏勾了这个智能体，要么这条内容本来就标错了`
      );
    }
  }
  // ★ 扫了 0 篇和"扫了 N 篇都没问题"必须分得开：前者是这条测试自己没跑起来
  //   （文件名规则变了、目录挪了），而它在屏幕上会长得和全绿一模一样。
  assert.ok(checked > 0, "一条带 agent/model 的内容都没扫到 —— 这条测试没跑起来");
});

// ── E 组：接线（漏一处都是零症状的）─────────────────────────────────

test("E · 后台真的挂了那段联动脚本", () => {
  const src = stripComments(read("keystatic.config.ts"));
  assert.match(src, /mountAgentModelLink\(\)/, "keystatic.config.ts 没调用挂载函数");
  assert.match(
    src,
    /from "\.\/src\/dev\/keystaticAgentModel"/,
    "没 import 那个模块 —— 联动整个不存在，而后台一切正常"
  );
});

test("E · 构建期那条拦截接在 schema 上", () => {
  const src = stripComments(read("src/content.config.ts"));
  assert.match(
    src,
    /agentModelMismatch\(/,
    "content.config.ts 没调错配判据 —— 一个不存在的组合能一路发到公网，四处全绿"
  );
});

test("E · 联动脚本必须轮询，不许监听 change", () => {
  const src = read("src/dev/keystaticAgentModel.ts");
  const code = stripComments(src);
  // 【2026-09-21 实测，keystaticGroupFill.ts 先踩的】react-aria 的 HiddenSelect
  // 值会被改但**不发事件**。改成监听的那天这个功能会安静地不工作：选了没反应、零报错。
  assert.match(code, /setInterval\(/, "没有定时器 —— 这段脚本不可能被触发");
  assert.ok(
    !/addEventListener\(\s*["'](change|input)["']/.test(code),
    "改成监听 change 了 —— 实测收不到事件，功能会安静地不工作"
  );
  // 写值那一步得走原型 setter + 派发 change，不然 React 下一次渲染会把值写回去。
  assert.match(code, /getOwnPropertyDescriptor\(/);
  assert.match(code, /dispatchEvent\(/);
});

test("E · 归属判据没在联动脚本里再写一份", () => {
  const code = stripComments(read("src/dev/keystaticAgentModel.ts"));
  assert.match(code, /nextModelFor\(/, "脚本没调判据");
  // ★ 判据抄第二份的那天，就是后台和构建期开始各说各话的那天：
  //   表单里自动换成了一个组合，构建期却说它不存在。
  assert.ok(
    !code.includes(ANY_AGENT) && !/\.agents\b/.test(code),
    "联动脚本自己读了归属数据 —— 判据只许在 src/config/models.ts 一处"
  );
});
