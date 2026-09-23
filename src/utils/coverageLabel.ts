/**
 * 「3 篇研究 · 2 条问答」。
 *
 * ★ **不许合并成一个「共 5 篇」** —— 研究稿和问答不是同一种东西（一个是分析，
 *   一个是模型的原话），混成一个数字会让读者以为这只票有 5 篇研究。
 *   为 0 的那一档整段不出现：「0 条问答」占一行字却不带任何信息。
 *
 * 【2026-09-20 抽出来】原来 /s 和 /s/[symbol] 两页各写一份（逐字相同），抽到这里。
 * （当天还有过一套智能体索引 /ai 也读它，后来连同索引一起拆掉了 —— 现在只有 /s 两页。）
 * 零 import，裸 tsx 测得了。
 */
export function coverageLabel(postCount: number, qaCount: number): string {
  const parts: string[] = [];
  if (postCount > 0) parts.push(`${postCount} 篇研究`);
  if (qaCount > 0) parts.push(`${qaCount} 条问答`);
  return parts.join(" · ");
}
