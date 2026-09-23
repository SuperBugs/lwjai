/**
 * 智能体与模型登记表（src/data/registry.json + src/config/registry.ts）的测试。
 *
 * 钉三件事：坏数据**必须抛**（哨兵 id、重复 id、坏 id、缺名字）；
 * 当前那份文件读得进来、哨兵在代码里排在该排的位置；
 * 用户点名要的两个模型（GPT-6 / GPT-6-Pro）真的在表里。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ANY_AGENT,
  parseRegistry,
  REGISTRY,
  REGISTRY_ID_INPUT_RE,
} from "../../src/config/registry";
import {
  AGENTS,
  AGENT_IDS,
  DEFAULT_AGENT,
  agentOptions,
  findAgent,
} from "../../src/config/agents";
import {
  MODELS,
  MODEL_IDS,
  DEFAULT_MODEL,
  agentModelMismatch,
  findModel,
  modelOptions,
} from "../../src/config/models";

const good = () => ({
  agents: [{ id: "spark", name: "Google Spark", vendor: "Google", note: "" }],
  models: [{ id: "gpt-6-pro", name: "GPT-6-Pro", vendor: "OpenAI" }],
});

test("好数据读得进来；空 note 折成 undefined，不是空串", () => {
  const r = parseRegistry(good(), "probe");
  assert.equal(r.agents[0]!.id, "spark");
  assert.equal(r.agents[0]!.note, undefined, "空 note 不该以空串出现");
  assert.equal(r.models[0]!.name, "GPT-6-Pro");
});

test("坏数据必须抛：哨兵 id、重复 id、坏 id、缺名字、缺厂商、顶层不是对象", () => {
  const withAgent = (a: Record<string, unknown>) => ({
    ...good(),
    agents: [...good().agents, a],
  });
  assert.throws(
    () => parseRegistry(withAgent({ id: "human", name: "我", vendor: "—" }), "probe"),
    /保留 id/
  );
  assert.throws(
    () => parseRegistry(withAgent({ id: "unspecified", name: "x", vendor: "y" }), "probe"),
    /保留 id/
  );
  assert.throws(
    () => parseRegistry(withAgent({ id: "spark", name: "again", vendor: "y" }), "probe"),
    /重复/
  );
  assert.throws(
    () => parseRegistry(withAgent({ id: "GPT 6", name: "x", vendor: "y" }), "probe"),
    /不合法/
  );
  assert.throws(
    () => parseRegistry(withAgent({ id: "ok", name: "  ", vendor: "y" }), "probe"),
    /没有显示名/
  );
  assert.throws(
    () => parseRegistry(withAgent({ id: "ok", name: "x", vendor: "" }), "probe"),
    /没有厂商/
  );
  assert.throws(() => parseRegistry(null, "probe"), /顶层不是对象/);
  assert.throws(() => parseRegistry({ agents: "x", models: [] }, "probe"), /不是数组/);
});

/**
 * 【2026-09-21】模型那半张表多了一格「能在哪些智能体底下跑」（联动那一维的数据）。
 * 这里只钉**读进来这一步**的三件事；三档的语义和错配判据在 agentModel.test.ts。
 */
test("模型的归属：空折成 undefined，查不到的智能体要抛，不许悄悄丢掉", () => {
  const withModel = (m: Record<string, unknown>) => ({
    agents: good().agents,
    models: [{ ...good().models[0], ...m }],
  });

  // ① 空数组和"没这个键"都是**还没标**那一档，折成同一个形状。
  assert.equal(parseRegistry(withModel({ agents: [] }), "p").models[0]!.agents, undefined);
  assert.equal(parseRegistry(withModel({}), "p").models[0]!.agents, undefined);
  // ② 正常的两种写法。
  assert.deepEqual(
    parseRegistry(withModel({ agents: ["spark"] }), "p").models[0]!.agents,
    ["spark"]
  );
  assert.deepEqual(
    parseRegistry(withModel({ agents: [ANY_AGENT] }), "p").models[0]!.agents,
    [ANY_AGENT]
  );
  // ③ 查不到的智能体 id **必须抛**。悄悄丢掉的话，这个模型的归属会从
  //    「只在 A 底下」变成「只在 B 底下」，于是一批本来合法的条目突然构建失败，
  //    或者反过来一个真错配悄悄放行 —— 而登记表看上去一切正常。
  //    （最常见的来路：在后台删掉了一个还被模型勾着的智能体。）
  assert.throws(
    () => parseRegistry(withModel({ agents: ["gemini"] }), "p"),
    /查不到的智能体/
  );
  // ④ 勾了「不限」又勾了具体产品 —— 两句话互相矛盾，不许留着让判据去猜。
  assert.throws(
    () => parseRegistry(withModel({ agents: [ANY_AGENT, "spark"] }), "p"),
    /不限智能体/
  );
  assert.throws(
    () => parseRegistry(withModel({ agents: ["spark", "spark"] }), "p"),
    /重复/
  );
  assert.throws(() => parseRegistry(withModel({ agents: "spark" }), "p"), /不是数组/);
  assert.throws(() => parseRegistry(withModel({ agents: [1] }), "p"), /不是字符串/);

  // ⑤ 智能体那半张表**没有**这一格：一个智能体不"属于"某个模型，反过来才成立。
  const agentWithRefs = parseRegistry(
    { agents: [{ ...good().agents[0], agents: ["spark"] }], models: [] },
    "p"
  );
  assert.equal(agentWithRefs.agents[0]!.agents, undefined);
});

test("后台那一格的校验：形状对且不是保留字", () => {
  for (const ok of ["gpt-6", "gpt-6-pro", "spark", "deepseek-v4"]) {
    assert.ok(REGISTRY_ID_INPUT_RE.test(ok), ok);
  }
  for (const bad of ["human", "unspecified", "GPT-6", "gpt_6", "-gpt", "gpt-", ""]) {
    assert.ok(!REGISTRY_ID_INPUT_RE.test(bad), bad);
  }
});

test("当前那份 registry.json：读得进来，用户点名的 GPT-6 / GPT-6-Pro 在表里", () => {
  const onDisk = JSON.parse(readFileSync("src/data/registry.json", "utf8"));
  const r = parseRegistry(onDisk);
  assert.deepEqual(r, REGISTRY, "import 进来的和磁盘上那份对不上");
  assert.equal(findModel("gpt-6")?.name, "GPT-6");
  assert.equal(findModel("gpt-6-pro")?.name, "GPT-6-Pro");
  // 这几个 id 别处的测试和已发布的条目都在用（orcl 那篇是 spark + gemini-3-pro）。
  for (const id of ["spark", "chatgpt", "claude", "codex"]) {
    assert.equal(findAgent(id)?.kind, "ai", `${id} 不在登记表里了`);
  }
  assert.ok(findModel("gemini-3-pro"), "gemini-3-pro 不在登记表里了");
});

test("哨兵由代码套上：unspecified 排第一，human 排最后，登记表里的都是 ai 档", () => {
  assert.equal(AGENTS[0]!.id, "unspecified");
  assert.equal(AGENTS[AGENTS.length - 1]!.id, "human");
  assert.equal(AGENTS[0]!.kind, "unspecified");
  assert.equal(AGENTS[AGENTS.length - 1]!.kind, "human");
  for (const a of AGENTS.slice(1, -1)) assert.equal(a.kind, "ai", a.id);
  assert.equal(AGENT_IDS.length, REGISTRY.agents.length + 2);

  assert.equal(MODELS[0]!.id, "unspecified");
  assert.equal(MODEL_IDS.length, REGISTRY.models.length + 1);
  assert.equal(new Set(MODEL_IDS).size, MODEL_IDS.length, "模型 id 有重复");
  assert.equal(new Set(AGENT_IDS).size, AGENT_IDS.length, "智能体 id 有重复");
});

/**
 * 【2026-09-21 用户定的】后台那两格不再默认「未标注」，默认值是**登记表里排第一的那个**，
 * 下拉里哨兵挪到最后。三件事必须同时成立，缺一个就是界面在说谎：
 *
 *   ① 下拉的第一项就是默认值（"默认 = 第一个"这句话看得出来）
 *   ② 默认值在选项里 —— `fields.select` 在不在时**直接 throw，整个后台打不开**
 *   ③ 一项都没丢（哨兵只是挪位，不是被过滤掉了）
 *
 * ⚠ 这里**刻意不钉"第一个是哪一个"**：换默认值的正当做法就是去后台把那一行拖到最前，
 *   钉死具体 id 等于让一个支持的操作把测试搞红。今天排第一的是 Gemini-3-Pro（用户点的）。
 *
 * ★★【2026-09-21 晚些时候，两格联动之后】**模型那一格的 ① 变了**：默认值不再是
 *   "整张表里第一个"，而是**默认智能体底下的第一个**（`DEFAULT_MODEL`）——
 *   旧那条钉的是一个和上面那格毫无关系的值，把 GPT-5 拖到模型表最前，
 *   新建表单就默认落在「Google Spark + GPT-5」这个不存在的组合上，而测试全绿。
 *   模型下拉**没法按当前智能体过滤**（options 在配置求值那一刻就定死了），
 *   所以"第一项 = 默认值"对它已经不成立；换成钉两条更强的：
 *   默认值必须在选项里（②，不在就整个后台打不开），而且它是下拉里
 *   **第一个属于默认智能体的**那一项（"默认 = 该智能体底下的第一个"看得出来）。
 */
test("后台下拉：第一项 = 默认值，哨兵排最后，一项都没丢", () => {
  const agents = agentOptions();
  assert.equal(agents[0]!.value, DEFAULT_AGENT, "智能体下拉第一项不是默认值");
  assert.equal(agents.at(-1)!.value, "unspecified", "智能体的哨兵没排在最后");
  assert.equal(agents.length, AGENTS.length, "智能体下拉少了或多了选项");
  assert.equal(findAgent(DEFAULT_AGENT)?.kind, "ai", "默认智能体得是个 AI 产品");

  const models = modelOptions();
  assert.equal(models.at(-1)!.value, "unspecified", "模型的哨兵没排在最后");
  assert.equal(models.length, MODELS.length, "模型下拉少了或多了选项");
  assert.notEqual(DEFAULT_MODEL, "unspecified", "默认模型不该是哨兵");
  assert.ok(
    models.some(o => o.value === DEFAULT_MODEL),
    "默认模型不在选项里 —— fields.select 会当场 throw，整个后台打不开"
  );
  const firstOfDefaultAgent = models.find(
    o => o.value !== "unspecified" && !agentModelMismatch(DEFAULT_AGENT, o.value)
  );
  assert.equal(
    firstOfDefaultAgent?.value,
    DEFAULT_MODEL,
    "默认模型不是下拉里第一个属于默认智能体的那一项"
  );

  // 「我自己」是一档真实选项，不是哨兵 —— 它排在哨兵前面，没被一起扫到末尾去。
  assert.equal(agents.at(-2)!.value, "human");
});

/**
 * 模型下拉的每一项后面缀着**归属**，三档在标签上长得不一样。
 *
 * 这不是排版：那个下拉**没法按当前选中的智能体过滤**，联动万一没跟上，
 * 人得自己挑得对。而"还没标归属"和"看过了、不限"如果都印成没有后缀，
 * 待补就伪装成了完成态 —— docs/engineering-notes.md 第二节点名的那种错误。
 */
test("模型下拉的标签：三档归属看得出来，哨兵那一项不缀", () => {
  const byValue = new Map(modelOptions().map(o => [o.value, o.label]));
  assert.equal(byValue.get("gemini-3-pro"), "Gemini-3-Pro（Google Spark）");
  assert.equal(
    byValue.get("gpt-6-pro"),
    "GPT-6-Pro（OpenAI ChatGPT / OpenAI Codex）"
  );
  assert.equal(byValue.get("grok-4"), "Grok-4（不限智能体）");
  // 哨兵：「还没选是哪个模型」和归属无关，缀一个「归属未标注」是两句话叠在一起。
  assert.equal(byValue.get("unspecified"), "未标注");
});
