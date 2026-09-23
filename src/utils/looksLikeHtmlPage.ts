/**
 * 「复制全文」取回来的东西是不是**一张网页**，而不是那份导出件（`/r/<号>.md` 这些）。
 * `DownloadLinks.astro` 的**客户端脚本** import 它 —— 所以这个文件**一个 import 都不许有**：
 * 它会被打进浏览器的包里，而且 `scripts/gate/export.test.ts` 用裸 tsx 跑它。
 *
 * 【2026-09-23】从 `exportMarkdown.ts` 挪出来单独成一个文件：那边为了把正文里的
 * 本地图换成站上的完整地址，要 import 围栏 / 行内代码的判据（`formatRules.ts`），
 * 客户端不该跟着背那些。
 *
 * 两条任一成立就算：
 *   - 响应头说它是 HTML —— 线上 `.md` 是 `text/markdown`、不存在的地址是一张
 *     `text/html` 的 404 页（2026-09-23 对 lwj.ai curl 实测）；
 *   - 头被中间层改掉了，但正文以 `<!doctype html` / `<html` 开头。
 *
 * ★ 它换掉的是「必须以 `---` 开头」—— 那时导出件永远带 frontmatter。
 *   现在导出件就是正文原文，开头是什么取决于作者写了什么（研究稿是 `# `、问答是
 *   一段话、教程是一张图），**任何一种"必须以 X 开头"都会让某个集合的复制每一次都失败**。
 *   能验的只剩"它不是一张网页"。
 * ⚠ 两个方向的错代价不一样：放过一张网页 = 读者粘出一整页 HTML；误伤一篇正文 =
 *   那一篇的复制**永远**报失败。后者更安静，所以 `export.test.ts` D 组拿磁盘上每一篇
 *   真实内容验它不误伤。
 */
export function looksLikeHtmlPage(
  contentType: string | null,
  text: string
): boolean {
  return (
    /html/i.test(contentType ?? "") ||
    /^\s*<(?:!doctype\s+html|html)[\s>]/i.test(text)
  );
}
