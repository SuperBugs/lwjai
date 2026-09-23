/**
 * 「粘贴导入」的**判据**：把智能体按「常用提示词」整理出来的那份 JSON，验成一条可以
 * 交给 planImport() 的输入。纯函数，零 astro import —— scripts/gate/importJson.test.ts
 * 用裸 tsx 喂模型真的会吐出来的形状测它（带 ```json 围栏、多一段客套话、字段大小写不对）。
 *
 * ## 为什么先验再导，而不是直接喂给 planImport
 *
 * planImport 是给 CLI 用的：一个参数错了就抛一条。粘贴进来的 JSON 会同时错好几处
 * （智能体 id 写成了产品名、tags 是个字符串、问答里塞了 prompt），一次只报一条要人
 * 来回粘四遍。这里把**所有**错一次摊出来；能修的自动修（代码转大写、去空白、去重）
 * 并记一条 note —— 修了什么要让人看见，静默"纠正"是另一种撒谎。
 *
 * ## 字段
 *
 *   collection   "posts" | "qa"                         必填
 *   title        标题 / 问题原文                          必填
 *   body         正文 Markdown                            必填
 *   description  一句话摘要                               可空（空了 planImport 会截首段并警告）
 *   symbol       美股代码（自动转大写；空 = 不讲单只票）
 *   symbolName   公司中文名。★ 它只属于 `symbol` 那一只 —— 名字现在住在标的表里
 *                （src/data/symbols.json），这一格只是"顺手把主要那只的名字带过来"
 *   symbols      还涉及哪几只别的票（字符串数组，【2026-09-22】问答可以讲好几只）。
 *                和 symbol 并起来去重；表里没有的会被自动登记一行（理由见 symbols.ts）
 *   tags         字符串数组，去重、最多 5 个。★ 标签是**封闭词表**（后台「标签」页）：
 *                这一层不查表（它只管这份 JSON 的形状），表里没有的在 planImport()
 *                里被丢掉并报一行 —— 判据只有 src/config/tags.ts 的 unknownTags() 一处
 *   agent        登记表里的智能体 id；空 = 未标注（待补）
 *   model        登记表里的模型 id；空 = 未标注
 *   prompt       只有 posts：站上提示词的 id（存不存在由接口那边查）
 *   questionKey  只有 qa：问题组键（小写 slug）
 *
 * 不认识的键忽略并记一条 note，不报错 —— 模型偶尔会多给一个 "notes" 字段。
 */
import { AGENT_IDS, UNSPECIFIED_AGENT } from "../config/agents";
import { MODEL_IDS, UNSPECIFIED_MODEL } from "../config/models";
import { QUESTION_KEY_HINT, QUESTION_KEY_RE } from "../config/questionKey";
import { SYMBOL_RE } from "../config/symbol";

export interface PublishJson {
  collection: "posts" | "qa";
  title: string;
  body: string;
  description?: string;
  symbol?: string;
  symbolName?: string;
  /**
   * 还涉及**哪几只别的票**（【2026-09-22】问答那一格改成多选之后加的）。
   * `symbol` 仍然是"主要那一只"，两处并起来去重 —— 名字那一格只属于 `symbol`。
   *
   * ★ 没把 `symbol` 直接换成 `symbols`：常用提示词里那一行写了很久，
   *   而模型交上来的 JSON 是**上一次会话里**那份提示词生成的。旧写法必须还能导。
   */
  symbols?: string[];
  tags: string[];
  agent: string;
  model: string;
  prompt?: string;
  questionKey?: string;
}

export type ParseResult =
  | { ok: true; value: PublishJson; notes: string[] }
  | { ok: false; errors: string[] };

const KNOWN_KEYS = new Set([
  "collection",
  "title",
  "body",
  "description",
  "symbol",
  "symbolName",
  "symbols",
  "tags",
  "agent",
  "model",
  "prompt",
  "questionKey",
]);
const MAX_TAGS = 5;

/**
 * 从粘贴的文本里把 JSON 抠出来：模型常把它包在 ```json 围栏里、前后再客套一句。
 * 先整段试；不行就取第一个 `{` 到最后一个 `}` 之间那段再试。
 */
export function extractJson(raw: string): unknown {
  const text = raw.replace(/\r\n/g, "\n").trim();
  const candidates = [text];
  const fenced = /```(?:json)?\s*\n([\s\S]*?)\n```/i.exec(text)?.[1];
  if (fenced) candidates.push(fenced.trim());
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* 下一个候选 */
    }
  }
  throw new Error("不是合法 JSON：找不到一段能解析的 { … }");
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v.trim() : undefined;

export function parsePublishJson(raw: string): ParseResult {
  const errors: string[] = [];
  const notes: string[] = [];

  let data: unknown;
  try {
    data = extractJson(raw);
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, errors: ["顶层必须是一个对象 { … }"] };
  }
  const o = data as Record<string, unknown>;

  for (const key of Object.keys(o)) {
    if (!KNOWN_KEYS.has(key)) notes.push(`忽略了不认识的字段「${key}」`);
  }

  const collectionRaw = str(o.collection)?.toLowerCase();
  const collection =
    collectionRaw === "posts" || collectionRaw === "qa"
      ? collectionRaw
      : undefined;
  if (!collection)
    errors.push('collection 只能是 "posts"（研究稿）或 "qa"（问答）');

  const title = str(o.title);
  if (!title) errors.push("title 是空的");

  const body = typeof o.body === "string" ? o.body.trim() : "";
  if (!body) errors.push("body（正文）是空的");

  const description = str(o.description) || undefined;
  if (!description)
    notes.push("description 是空的：会从正文第一段截一句当摘要，发布前改一下");

  let symbol = str(o.symbol)?.toUpperCase() || undefined;
  if (symbol && !SYMBOL_RE.test(symbol)) {
    errors.push(
      `symbol「${symbol}」不像美股代码（要像 TSLA / BRK.B：1~5 个大写字母）`
    );
    symbol = undefined;
  }
  const symbolName = str(o.symbolName) || undefined;

  /**
   * 还涉及哪几只别的票。和 `symbol` 同一条形状检查；形状不对的**一个个挑出来说**，
   * 不是整格作废 —— 模型把三只里的一只写成了公司名时，另外两只没有理由跟着丢。
   * ⚠ 这一层**不查标的表**（它只管这份 JSON 的形状）：表里没有的那几只由
   *   planImport / registerSymbols 登记进去，判据只有 src/config/symbols.ts 一处。
   */
  let symbols: string[] | undefined;
  if (o.symbols !== undefined) {
    if (!Array.isArray(o.symbols)) {
      errors.push('symbols 必须是字符串数组，如 ["ARM", "INTC"]');
    } else {
      const seen = new Set<string>();
      const ok: string[] = [];
      for (const raw of o.symbols) {
        const code = str(raw)?.toUpperCase();
        if (!code) continue;
        if (!SYMBOL_RE.test(code)) {
          errors.push(
            `symbols 里的「${code}」不像美股代码（要像 TSLA / BRK.B：1~5 个大写字母）`
          );
          continue;
        }
        if (seen.has(code)) continue;
        seen.add(code);
        ok.push(code);
      }
      if (ok.length > 0) symbols = ok;
    }
  }

  let tags: string[] = [];
  if (o.tags !== undefined) {
    if (!Array.isArray(o.tags)) {
      errors.push('tags 必须是字符串数组，如 ["财报", "估值"]');
    } else {
      const seen = new Set<string>();
      for (const t of o.tags) {
        const s = str(t);
        if (s && !seen.has(s)) {
          seen.add(s);
          tags.push(s);
        }
      }
      if (tags.length > MAX_TAGS) {
        notes.push(`tags 只留前 ${MAX_TAGS} 个（给了 ${tags.length} 个）`);
        tags = tags.slice(0, MAX_TAGS);
      }
    }
  }

  const agentRaw = str(o.agent) || "";
  let agent = UNSPECIFIED_AGENT;
  if (!agentRaw) {
    notes.push("agent 是空的：智能体先记成「未标注」，后台里选一个");
  } else if (!AGENT_IDS.includes(agentRaw)) {
    errors.push(
      `agent「${agentRaw}」不在登记表里。可选：${AGENT_IDS.join(" / ")}`
    );
  } else {
    agent = agentRaw;
  }

  const modelRaw = str(o.model) || "";
  let model = UNSPECIFIED_MODEL;
  if (!modelRaw) {
    notes.push("model 是空的：模型先记成「未标注」，后台里选一个");
  } else if (!MODEL_IDS.includes(modelRaw)) {
    errors.push(
      `model「${modelRaw}」不在登记表里。可选：${MODEL_IDS.join(" / ")}`
    );
  } else {
    model = modelRaw;
  }

  const prompt = str(o.prompt) || undefined;
  if (prompt && collection === "qa") {
    errors.push("prompt 只有研究稿（posts）有：问答不是拿提示词跑出来的");
  }

  const questionKey = str(o.questionKey) || undefined;
  if (questionKey && collection === "posts") {
    errors.push("questionKey 只有问答（qa）有");
  }
  if (questionKey && !QUESTION_KEY_RE.test(questionKey)) {
    errors.push(`questionKey「${questionKey}」格式不对：${QUESTION_KEY_HINT}`);
  }

  if (errors.length > 0 || !collection || !title) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    notes,
    value: {
      collection,
      title,
      body,
      description,
      symbol,
      symbolName,
      symbols,
      tags,
      agent,
      model,
      prompt,
      questionKey,
    },
  };
}

/**
 * 把「常用提示词」里的占位符换成当前登记表：{{agents}} / {{models}} / {{tags}}。
 *
 * ★【2026-09-21 加的 {{tags}}】标签是封闭词表了（后台「标签」那一页）。模型不知道
 *   这件事的话吐出来的标签全是它现编的词，而那些词会被 `planImport()` 原样丢掉
 *   （并报一行）—— 也就是每篇都得回后台重新勾一遍。把表喂给它，丢的就少了。
 *   ⚠ 提示词里没写 {{tags}} 也不要紧：这里只是替换，不强制。
 */
export function fillPromptPlaceholders(
  prompt: string,
  agents: { id: string; name: string }[],
  models: { id: string; name: string }[],
  tags: readonly string[] = []
): string {
  const list = (xs: { id: string; name: string }[]) =>
    xs.map(x => `${x.id}（${x.name}）`).join("、");
  return prompt
    .replaceAll("{{agents}}", list(agents))
    .replaceAll("{{models}}", list(models))
    .replaceAll("{{tags}}", tags.join("、"));
}
