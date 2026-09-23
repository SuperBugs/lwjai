/**
 * 模型登记表 —— 「这条内容底下**跑的是哪个模型**」。
 *
 * 【2026-09-20 从 agents.ts 拆出来】原来「智能体」一栏填的其实是模型名
 * （Gemini-3-Pro、GPT-5、Claude Opus 5）。现在真正在用的是 Codex、Claude、Spark
 * 这类**智能体产品**，同一个产品底下的模型可以换、也确实会换 ——
 * 所以标记分两维：`agent`（哪个智能体）+ `model`（哪个模型）。
 * 这张表管后一维；产品那张在 `agents.ts`。
 *
 * ## 【2026-09-21】两维**不再互相独立**：模型上多了一格「能在哪些智能体底下跑」
 *
 * 在这之前两格是两个毫不相干的下拉：选了 Google Spark，模型那格照样能选到
 * GPT-6-Pro —— 而那个组合根本不存在，且**四处全绿**（zod 只查两个枚举各自合法，
 * 闸门不看 frontmatter 的这两格，页面照印两张芯片）。读者拿这两格判断该不该信一条
 * 结论，印一个不存在的组合就是在编出处。
 *
 * 现在归属是**登记表里的数据**（`src/data/registry.json` 里模型那半张表的 `agents`），
 * 三档，判据只有下面 `modelScope()` 一处：
 *
 *   - 列了几个智能体 → **只在这几个底下跑**（完成态）。和别的智能体一起出现 = 构建红。
 *   - `["*"]`（`ANY_AGENT`） → **不限智能体**（完成态）。直接调 API 跑出来的就是这一档 ——
 *     "这里列着的模型不必在那边有对应的产品"这件事一直是真的，现在它是一个**说得出口的选项**，
 *     而不是"这一格空着"。
 *   - 空 / 没这个键 → **还没标**（待补）。构建期**不拦**（不知道就不许断言错配），
 *     但后台下拉里印「归属未标注」，和上面那档长得不一样。
 *
 * ⚠ 三档不许压成两档：把"待补"折进"不限"的话，后台加一个模型忘了勾归属，
 *   它就**自称能在任何智能体底下跑**，错配判据对它整条失效，而没有任何一处看得出来。
 *
 * ★ 【2026-09-20 用户定的】模型的显示名**用连字符连起来，不用空格**（GPT-6-Pro、
 *   Gemini-3-Pro、Opus-5）—— 和模型 id 的习惯一致，读起来就是一个型号；
 *   而且**不重复智能体名里的词**：智能体已经叫
 *   「Anthropic Claude」，底下的模型就叫 Opus-5 / Sonnet-5，不叫 Claude Opus 5；
 *   后台下拉框和芯片也不再缀厂商（「Anthropic Claude · Opus-5 · Anthropic」是三遍）。
 *   `id` 不跟着改（`claude-opus-5` 进了 frontmatter 和地址，定了不动），`vendor` 留给悬停提示。
 *
 * ## 和 agents.ts 同一套纪律
 *
 *   - 封闭枚举，`src/content.config.ts` 用 `z.enum()` 钉着，后台下拉框直接从它生成。
 *     自由文本会把同一个模型写成四个名字，而且哪儿都不报错；而且它上公网、闸门不扫。
 *   - 哨兵 `unspecified` 在这个数组里排第一（`z.enum` 的默认值、没写这个键的老文件
 *     都落在它上，`registry.test.ts` 钉着）。
 *     ⚠【2026-09-21 用户改了】**后台那一格的默认值不再是它**，而是
 *     **默认智能体底下的第一个模型**（下面的 `DEFAULT_MODEL`），下拉里哨兵挪到了最后。
 *     Keystatic 的 select 永远有值、没有"未选择"这一档，所以换了模型而忘了改就是
 *     **静默标错**，而闸门、zod、页面四处都看不出来 ——
 *     完整的取舍记在 keystatic.config.ts 那一格上。
 *   - **`id` 定了就不要再改**，它进 frontmatter。显示名随时可改。
 *
 * ## 「没有模型」分三种，页面上只有一种画成待补
 *
 *   判据在下面的 `modelSlot()`，芯片、分享卡、小红书封面都读它，
 *   **别在别处再写一份**（docs/engineering-notes.md 坑 8：同一句断言两处只改一处）。
 *   （.md 导出口原来也读它、写进文件头；【2026-09-23】导出件改成正文原文，不再写。）
 *
 * ## 【2026-09-20】数据挪进了 src/data/registry.json，后台「智能体与模型」那一页管
 *
 * 模型那几档不再写死在这里：后台加一个模型就是加一行 JSON（GPT-6、GPT-6-Pro 就是
 * 这么进来的；见 registry.ts 文件头）。数据那一半这个文件只做两件事：读进来、
 * 把哨兵 `unspecified` 钉在第一位（它**永远在代码里**，登记表不许碰）；
 * 判据那一半（上面说的归属三档、`modelSlot()` 的三档）全在这里，别处不许再写一份。
 * 登记表验不过在 import 时就抛，构建直接红。
 *
 * ★ 零 astro import：keystatic.config.ts 在 Astro 之外加载，导入脚本是裸 tsx 跑的。
 * ★【2026-09-21】多了一条 `./agents` —— 归属那一维两张表都要认（哪个模型属于哪个
 *   智能体、那个智能体是不是 AI 产品）。方向是 registry → agents → models，不成环；
 *   agents.ts **不许反过来 import 这个文件**。
 */
import { ANY_AGENT, REGISTRY } from "./registry";
import { DEFAULT_AGENT, findAgent } from "./agents";

export type ModelEntry = {
  /** 进 frontmatter 的稳定标识。**定了不改。** 小写、连字符。 */
  id: string;
  /** 页面上显示的名字。随时可改。 */
  name: string;
  vendor: string;
  /** 可选的一句补充，显示在悬停提示里。 */
  note?: string;
  /**
   * 能在哪些智能体底下跑（智能体 id，或者单独一个 `ANY_AGENT`）。
   * **`undefined` 是「还没标」那一档**（空数组在 registry.ts 里就折成它了）。
   * 别直接读这一格分档 —— 走 `modelScope()`，三档只有那一处。
   */
  agents?: readonly string[];
};

export const MODELS: readonly ModelEntry[] = [
  {
    /** ★ 哨兵档，必须排在第一位（见文件头）。 */
    id: "unspecified",
    name: "未标注",
    vendor: "—",
    note: "还没选，或者没记录是哪个模型",
  },
  // ★ 其余全部来自登记表（src/data/registry.json，后台「智能体与模型」页）。
  //   名字不带智能体里的词（Opus-5，不是 Claude Opus 5）—— 那是登记时的规矩，
  //   写在后台那一格的说明里。
  ...REGISTRY.models.map((m): ModelEntry => ({
    id: m.id,
    name: m.name,
    vendor: m.vendor,
    note: m.note,
    agents: m.agents,
  })),
];

/** 「还没选 / 没记录」的那个 id。schema 的默认值是它；
 *  ⚠ 后台那一格的默认值**从 2026-09-21 起不是它了**，见下面的 `DEFAULT_MODEL`。 */
export const UNSPECIFIED_MODEL = "unspecified";

/** 给 zod 的 enum 用。**至少两个元素**，否则 z.enum 的类型推断会塌。 */
export const MODEL_IDS = MODELS.map(m => m.id) as [string, string, ...string[]];

const BY_ID = new Map(MODELS.map(m => [m.id, m]));

/** 查不到返回 undefined，调用方自己处理 —— 不兜假对象，理由同 agents.ts 的 findAgent。 */
export function findModel(id: string | undefined): ModelEntry | undefined {
  return id ? BY_ID.get(id) : undefined;
}

// ── 归属那一维：哪个模型能在哪个智能体底下跑 ──────────────────────────────
// 【2026-09-21 加】文件头写着这三档各是什么、为什么不许压。下面四个函数是它的
// **唯一判据**：后台的下拉标签、后台的联动脚本、构建期那条拦截、默认值，四处都读它们。

/**
 * 一个模型的「归属」三档。★ 参数收的是**条目**不是 id，所以"表里查不到那个 id"
 * 这件事压根不进这个函数 —— 那是另一件事，由 `modelSlot()` 的 `orphanId` 那一档说。
 * 查不到（`undefined`）在这里一律落「还没标」：不知道就不许替它断言归属。
 */
export type ModelScope =
  /** 只在这几个智能体底下跑（**完成态**）。 */
  | { tier: "listed"; agentIds: readonly string[] }
  /** 显式「不限智能体」（**完成态**）—— 直接调 API 那一档。 */
  | { tier: "any" }
  /** 还没标（**待补**）。构建期不拦，后台下拉里印「归属未标注」。 */
  | { tier: "unspecified" };

export function modelScope(entry: ModelEntry | undefined): ModelScope {
  const ids = entry?.agents;
  if (!ids || ids.length === 0) return { tier: "unspecified" };
  // registry.ts 拦着"既勾了不限又勾了具体产品"，所以这里只要认得出第一种就行。
  if (ids.includes(ANY_AGENT)) return { tier: "any" };
  return { tier: "listed", agentIds: ids };
}

/**
 * 「这个智能体 + 这个模型」是不是一个**登记表里不存在的组合**。
 * 是 → 返回一句给构建期报错用的话；不是 → `null`。
 *
 * ★ 只有一种情况会返回非 null：模型**明确**登记在别的智能体底下。其余一律放行 ——
 *   - 模型是哨兵「未标注」：那是待补，由 `modelSlot()` / checkAgentModel 管，不是错配；
 *   - 智能体不是 AI 产品（「我自己」/「未标注」/ 查不到的 id）：归属无从谈起。
 *     ⚠ 判的是 `kind`，不是 `id === "human"` 这种字面量（docs/engineering-notes.md 第二节）。
 *     「我自己」却填了模型是另一条规矩（content.config.ts 的 checkAgentModel），
 *     在这里也返回非 null 的话，同一格会同时冒出两句话，而它们说的是同一件事。
 *   - 模型的归属还没标：**不知道就不许断言错配**。这是三档里最要紧的一档。
 *
 * 文案写在这里而不是 content.config.ts：它要把"这个模型登记在谁底下"摊出来，
 * 而那份数据只有这个文件有。（它是构建期报错，不是页面文案，和 i18n 无关。）
 */
export function agentModelMismatch(
  agentId: string | undefined,
  modelId: string | undefined
): string | null {
  if (!modelId || modelId === UNSPECIFIED_MODEL) return null;
  if (findAgent(agentId)?.kind !== "ai") return null;
  const entry = findModel(modelId);
  const scope = modelScope(entry);
  if (scope.tier !== "listed" || scope.agentIds.includes(agentId!)) return null;
  const modelName = entry?.name ?? modelId;
  const agentName = findAgent(agentId)?.name ?? agentId;
  return (
    `「${agentName}」底下没有「${modelName}」这个模型 —— 登记表里它只登记在 ` +
    `${scope.agentIds.map(agentLabel).join(" / ")} 底下。\n` +
    `改一格（多半是 agent 那格没跟着模型改），` +
    `或者去后台「智能体与模型」页给「${modelName}」勾上「${agentName}」。`
  );
}

/** 供上面那句话和后台下拉标签用的智能体名字。
 *  ★ 这里的 id 由 `parseRegistry` 保证在表里（对不上在 import 时就抛了），
 *    所以 `?? id` 只是类型上的兜底，**不是** `agentDisplayName()` 那条
 *    "查不到该显示什么"的判据的第二份 —— 那一档在这里不存在。 */
function agentLabel(id: string): string {
  return findAgent(id)?.name ?? id;
}

/**
 * 这个智能体底下**能选哪些模型**（不含哨兵「未标注」，它永远能选）。顺序 = 登记表的顺序。
 *
 * - 「我自己」→ 空的。人写的没有模型这回事（schema 拦着不许填）。
 * - 哨兵「未标注」→ 全部。"知道模型、不知道产品"是真会发生的（直接调 API）。
 * - AI 产品 → 显式登记了它的 + 显式「不限」的 + **归属还没标的**。
 *   ⚠ 最后那一档在这儿是放行而不是排除：那是"我不知道"，不是"不能用"。
 */
export function modelsForAgent(
  agentId: string | undefined
): readonly ModelEntry[] {
  if (findAgent(agentId)?.kind === "human") return [];
  return MODELS.filter(
    m =>
      m.id !== UNSPECIFIED_MODEL && agentModelMismatch(agentId, m.id) === null
  );
}

/**
 * 后台「换了智能体之后模型那一格该怎么办」的**判据**（纯函数，`nextModelFor()` 用它；
 * 实际去改表单的那段脚本在 `src/dev/keystaticAgentModel.ts`）。
 */
export interface AgentModelPlan {
  /** 这个智能体底下**允许**留着的模型 id（含哨兵「未标注」—— 它永远允许）。 */
  allowed: readonly string[];
  /** 当前那个不在 `allowed` 里时，换成它。 */
  fallback: string;
}

export function agentModelPlan(agentId: string | undefined): AgentModelPlan {
  const usable = modelsForAgent(agentId).map(m => m.id);
  return {
    // ★ 哨兵永远允许：一条「我没记是哪个模型」的内容，不该因为换了智能体
    //   就被**填上**一个模型 —— 那是替它编出处。
    allowed: [UNSPECIFIED_MODEL, ...usable],
    fallback: usable[0] ?? UNSPECIFIED_MODEL,
  };
}

/**
 * 换到 `agentId` 之后，模型那一格该换成什么。**`null` = 不动。**
 *
 * ★ 这个联动只**修矛盾**，从不**替人回答**：当前那个模型在新智能体底下讲得通
 *   （含「未标注」）就一个字不改。所以它换掉的永远是一个"登记表里不存在的组合"。
 */
export function nextModelFor(
  agentId: string | undefined,
  currentModelId: string | undefined
): string | null {
  const plan = agentModelPlan(agentId);
  if (currentModelId && plan.allowed.includes(currentModelId)) return null;
  return plan.fallback;
}

/**
 * 后台「底下跑的是哪个模型」那一格的**默认值** ——
 * **默认智能体（`DEFAULT_AGENT`）底下的第一个模型**。
 *
 * 【2026-09-21 用户定的】理由和代价同 `agents.ts` 的 `DEFAULT_AGENT`，那边写全了。
 * ★ 同一天晚些时候跟着联动改了一次：在那之前它是"整张表里排第一的模型"，
 *   而那个值**和默认智能体没有任何关系** —— 登记表里把 GPT-5 拖到最前，
 *   新建表单就会默认落在「Google Spark + GPT-5」这个不存在的组合上。
 * ★ 想换默认：在后台「智能体与模型」页把那一行拖到**它那个智能体底下的其他模型前面**。
 *   （换默认智能体则是把智能体那一行拖到最前。）
 * ⚠ 因此**下拉的第一项不再必然是默认值** —— 下拉是一整张表，没法按当前选中的智能体
 *   过滤（`fields.select` 的 options 在配置求值那一刻就定死了）。看得出"默认是哪个"
 *   靠的是每一项后面缀的归属（见 `modelOptions()`）。`registry.test.ts` 钉着这两条。
 * ★ 那个智能体底下一个模型都没登记 → 退回哨兵，**不是**退回"表里第一个"：
 *   退回表里第一个等于给出一个已知错配的默认值，而那一格还不填也有值。
 *   退回哨兵最坏是问答那边构建红（待补那条），红得早。
 */
export const DEFAULT_MODEL = agentModelPlan(DEFAULT_AGENT).fallback;

/**
 * 「模型这一格该画什么」—— 三档，**不许压成两档**（docs/engineering-notes.md 第二节）：
 *
 *   - `none`：什么都不画、不写。两种情况：
 *       · 智能体是「我自己」—— 人写的没有模型这回事，画一个「模型未标注」等于说
 *         "这里本该有个模型"（schema 拦着不许在这一档填模型）；
 *       · 智能体和模型都没标 —— 旁边那张「来源未标注」已经把话说完了，再挂一个只是噪音。
 *   - `unspecified`：**待补**。智能体是 AI 产品而模型没标；或者 id 在登记表里查不到
 *     （`orphanId` 带回去进悬停提示 —— 那是数据问题，不许兜一个假名字盖住）。
 *   - `known`：登记表里查到了。**不看智能体标没标** —— "知道模型、不知道产品"是真会发生的。
 *
 * `agentKind` 是 agents.ts 登记表里那条的 `kind`（"ai" / "human" / "unspecified"），
 * **由调用方 `findAgent(...)?.kind` 查好传进来**。判的是 `kind`，不是 id 字面量
 * （docs/engineering-notes.md 第二节）。
 * ⚠ 收 kind 而不是收 id、自己去查，是刻意的：调用方（芯片、分享卡）手上
 *   本来就有那条智能体，再查一遍只是多一次表查；而这一格的三档只和"是不是 AI 答的"
 *   有关，收 id 会让人以为它还看了别的。
 *   （【2026-09-21】这段原来写着"这个文件零 import，不认识那张表"—— 归属那一维
 *   加进来之后，这个文件是 import 了 `./agents` 的，那句话已经不成立，换成上面这条。）
 */
export type ModelSlot =
  | { tier: "known"; entry: ModelEntry }
  | { tier: "unspecified"; orphanId?: string }
  | { tier: "none" };

export function modelSlot(
  agentKind: string | undefined,
  modelId: string | undefined
): ModelSlot {
  if (agentKind === "human") return { tier: "none" };
  if (!modelId || modelId === UNSPECIFIED_MODEL) {
    return agentKind === "ai" ? { tier: "unspecified" } : { tier: "none" };
  }
  const entry = findModel(modelId);
  return entry
    ? { tier: "known", entry }
    : { tier: "unspecified", orphanId: modelId };
}

/**
 * 三档折成一个可见字符串：known → 模型名；unspecified → `unspecifiedLabel`
 * （`t.qa.unspecifiedModel`，调用方传，这里不认识 i18n）；none → **undefined，不是空串**。
 * 空串会被下游当成"有值但是空的"写进文件 —— 空值冒充"没有"是第二节点名的错误。
 */
export function modelSlotLabel(
  slot: ModelSlot,
  unspecifiedLabel: string
): string | undefined {
  switch (slot.tier) {
    case "known":
      return slot.entry.name;
    case "unspecified":
      return unspecifiedLabel;
    case "none":
      return undefined;
  }
}

/**
 * 后台下拉框用。名字后面缀**归属**，不缀厂商 —— 厂商在上面智能体那一格里已经有了（见文件头）。
 *
 * ★【2026-09-21】缀归属是因为这个下拉**没法按当前选中的智能体过滤**：
 *   `fields.select` 的 options 在配置求值那一刻就定死了，而可见的那个列表是 React
 *   （react-aria）渲的，在 DOM 里过滤它就是和 React 打架。所以联动那一步（换了智能体
 *   自动跟上，见 src/dev/keystaticAgentModel.ts）万一没跟上，人得自己挑得对 ——
 *   三档在标签上长得不一样正是为这一刻准备的：
 *     「Gemini-3-Pro（Google Spark）」/「Grok-4（不限智能体）」/「Foo（归属未标注）」。
 *   ⚠ 别把「归属未标注」那一档省掉写成没有后缀：没后缀和"我没细看"字节级相同，
 *     而前者是待补、后者是完成态。
 *
 * ★ 哨兵「未标注」排**最后一项**（理由同 `agentOptions()`：默认值在前面，
 *   哨兵不是挑不挑得中的问题，是"这一格我没答"）。它**不缀归属** ——
 *   "还没选是哪个模型"这件事和归属无关，缀一个「归属未标注」是两句话叠在一起。
 * ⚠ 下拉的顺序不等于 `MODELS` 数组的顺序（数组里哨兵排第一，`MODEL_IDS` / z.enum 认那个）；
 *   **也不再等于"第一项是默认值"**，见上面 `DEFAULT_MODEL`。
 */
export function modelOptions(): { label: string; value: string }[] {
  const suffix = (m: ModelEntry): string => {
    const scope = modelScope(m);
    switch (scope.tier) {
      case "listed":
        return `（${scope.agentIds.map(agentLabel).join(" / ")}）`;
      case "any":
        return "（不限智能体）";
      case "unspecified":
        return "（归属未标注）";
    }
  };
  return [
    ...MODELS.filter(m => m.id !== UNSPECIFIED_MODEL).map(m => ({
      label: `${m.name}${suffix(m)}`,
      value: m.id,
    })),
    ...MODELS.filter(m => m.id === UNSPECIFIED_MODEL).map(m => ({
      label: m.name,
      value: m.id,
    })),
  ];
}
