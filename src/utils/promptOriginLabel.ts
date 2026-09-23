import { ORIGIN_CONTRIBUTED, ORIGIN_SITE } from "../config/promptOrigins";

/**
 * 「这份提示词是谁写的」的**可见文案** —— 芯片（PromptOriginChip.astro）和
 * 分享卡（prompts/[...slug]/index.png.ts）共用这一个判据。
 *
 * 三档走枚举值，**不看"有没有 contributor"**：后者会把一条署名被清空的投稿
 * 显示成「站长自己在用的」—— 替自己认领别人的东西，而且零症状。
 * `pending` = 待补那一档（芯片画成虚线）。
 *
 * 文案由调用方从 i18n 取，这里不认识语言；相对路径 import，裸 tsx 也加载得了。
 */
export type PromptOriginLabels = {
  /** `{{author}}` = 站长的名字（config.site.author）。 */
  site: string;
  /** `{{name}}` = 署名。 */
  contributedBy: string;
  unspecified: string;
  /**
   * 站长的名字，填进 `site` 那句的 `{{author}}`。
   * 【2026-09-20】用户要的：站长自己的提示词印「作者：牢玩家」，不再印「站长自己在用的」。
   * 做成必填而不是可选：漏传的话页面上会印出字面的 `{{author}}`，而构建全绿。
   */
  author: string;
};

export function promptOriginLabel(
  origin: string | undefined,
  contributor: string | undefined,
  labels: PromptOriginLabels
): { label: string; pending: boolean } {
  if (origin === ORIGIN_SITE) {
    return {
      label: labels.site.replaceAll("{{author}}", labels.author),
      pending: false,
    };
  }
  const name = contributor?.trim();
  if (origin === ORIGIN_CONTRIBUTED && name) {
    return {
      label: labels.contributedBy.replaceAll("{{name}}", name),
      pending: false,
    };
  }
  // 哨兵、认不出来的值、投稿但署名空着 —— 都是"还没填完"。
  return { label: labels.unspecified, pending: true };
}
