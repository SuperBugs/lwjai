/**
 * 研究稿 / 问答详情页写进 Pagefind 索引的两条 meta：「智能体: Google Spark」「模型: Gemini-3-Pro」。
 *
 * 【2026-09-20 加】同一个问题的几条回答在 /search 里标题一模一样，结果列表里看不出是谁答的。
 * 这两条由 PagefindUI 画成每条结果底下的小标签（它对 title / image 之外的 meta 就是这么画的），
 * 列表页的 CollectionSearch 是自渲染的，自己画一行。
 *
 * ★ 名字和页面上两张芯片读**同一份判据**（agentDisplayName / modelSlot），三档不合并：
 *   「我自己」写的没有模型那一格，和 AgentModelChip 一样不写；没标的写「来源未标注」/「模型未标注」；
 *   智能体和模型都没标时只写前一条 —— 「来源未标注」已经把话说完了（docs/engineering-notes.md 第二节）。
 *
 * ★ 值里的英文逗号和冒号换成空格：那是 Pagefind 这个属性的分隔符（`key:value, key:value`）。
 *   登记表里现在没有这种名字；真有的话在这里被换掉，而不是让整条属性错位、两个标签合成一个。
 *
 * ★ 键名是 i18n 里的两个词，**写进索引**；改了要重新 `pnpm build` 才生效。
 */
import { agentDisplayName, findAgent } from "@/config/agents";
import { modelSlot, modelSlotLabel } from "@/config/models";

export type SearchMetaLabels = {
  /** 标签的键名，如「智能体」。 */
  agent: string;
  /** 标签的键名，如「模型」。 */
  model: string;
  unspecifiedAgent: string;
  unspecifiedModel: string;
};

const clean = (s: string) =>
  s.replace(/[,:]/g, " ").replace(/\s+/g, " ").trim();

export function searchMetaAttr(
  labels: SearchMetaLabels,
  agent: string | undefined,
  model: string | undefined
): string {
  const pairs = [
    `${clean(labels.agent)}:${clean(agentDisplayName(agent, labels.unspecifiedAgent))}`,
  ];
  const modelLabel = modelSlotLabel(
    modelSlot(findAgent(agent)?.kind, model),
    labels.unspecifiedModel
  );
  if (modelLabel !== undefined) {
    pairs.push(`${clean(labels.model)}:${clean(modelLabel)}`);
  }
  return pairs.join(", ");
}
