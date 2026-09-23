/**
 * 「时间的格式串」+「时区那几个字」拼成一条**自带时区**的 dayjs 格式串。
 *
 * ## 为什么是两个字符串，不是一个
 *
 * 【2026-09-21 用户定的】**页面上只印裸时间**（每张卡片、每个页头后面都缀三个字
 * 太吵），时区名收进 `<time>` 的 `title`，鼠标放上去才出现。
 *
 * 而**导出的 .md 没有 hover** —— 那份文件离开这个站之后，人眼能读的时间就只剩
 * 那一行字。所以导出口印的是这个带时区的版本，页面印的是裸的：
 * **两条出口的答案不同，但拼法只有这一处。**
 *
 * ⚠ 别把带时区那版直接写进语言包当第二个格式串：两份格式串里有一份含另一份，
 *   改了日期形状只改一处的那天，站上和下载下来的文件会长得不一样，而四处全绿。
 */
export const dateFormatWithZone = (post: {
  dateFormat: string;
  timezoneLabel: string;
}): string => `${post.dateFormat} [${post.timezoneLabel}]`;

/**
 * Replace `{{key}}` placeholders in UI strings.
 * Translators can reorder placeholders freely within the sentence.
 */
export function tplStr(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value !== undefined && value !== null ? String(value) : "";
  });
}
