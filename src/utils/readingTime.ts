/**
 * 阅读时长 / 字数 —— 从 `entry.body`（原始 markdown）估。
 *
 * 中文按**字**算、拉丁按**词**算，两种速度不同。研究稿两种都有（正文中文、表格里是
 * 代码和数字），所以分开数再相加。围栏代码块、图片语法、HTML 标签不算 —— 那些不是"读"的。
 *
 * 【2026-09-20 速度翻倍】原来按精读的舒适速度算（中文 400 字 / 分、英文 200 词 / 分），
 * 用户嫌估得太长：读者对一篇研究稿是**粗读**的 —— 扫结论表、跳到自己关心的那一节，
 * 不是逐字读。现在按粗读算：中文 800 字 / 分、英文 400 词 / 分，时长正好减半。
 *
 * 结果是**估计**，页面上写「阅读预计 N 分钟」（`t.reading.minutes`，
 * 【2026-09-21 用户定的措辞】），别把它说成精确值。
 * 零 import，`scripts/gate/readingTime.test.ts` 钉着几种真实形态。
 */

export type ReadingStats = {
  /** 汉字数。 */
  cjkChars: number;
  /** 拉丁词 / 数字串的个数（TSLA、10-Q、22.5% 各算一个）。 */
  latinWords: number;
  /** 页面上「N 字」用的那个数：汉字 + 拉丁词。 */
  chars: number;
  /** 至少 1。 */
  minutes: number;
};

const CJK_PER_MINUTE = 800;
const WORDS_PER_MINUTE = 400;

export function readingStats(body: string): ReadingStats {
  const text = (body ?? "")
    // 围栏代码块整块不算（提示词模块里成段的模板、研究稿里偶尔的表达式）。
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    // 图片语法：alt 文本不是正文。
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    // 裸 HTML 标签（模型有时会粘出 <br>、<sub>）。
    .replace(/<[^>]+>/g, " ")
    // 链接只留文字。
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

  const cjkChars = (text.match(/\p{Script=Han}/gu) ?? []).length;
  // 一个"词"：字母或数字开头，后面允许 .-%$'’ 这些财经文本里常见的连字。
  const latinWords = (text.match(/[A-Za-z0-9][A-Za-z0-9.%$'’-]*/g) ?? [])
    .length;

  const minutes = Math.max(
    1,
    Math.round(cjkChars / CJK_PER_MINUTE + latinWords / WORDS_PER_MINUTE)
  );

  return { cjkChars, latinWords, chars: cjkChars + latinWords, minutes };
}
