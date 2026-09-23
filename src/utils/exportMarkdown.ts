/**
 * 把一条内容变成「读者能下载走 / 复制走的 .md」——
 * **就是正文原文，站方一个字都不加；正文里的本地图换成站上的完整地址。**
 *
 * ## 【2026-09-23 用户定的】是什么就下载什么
 *
 * 用户原话：「下载或者复制的时候会夹带平台私活，禁止，是什么就下载什么，保持原文」。
 *
 * 在这之前，这个函数在正文外面包了三层站方自己的话：
 *
 *   1. 一段 YAML frontmatter：站名、原文地址、集合名、发布 / 更新时间、
 *      谁答的 / 什么模型 / 谁分享的、标的和公司名、用的哪份提示词、标签；
 *   2. 一个 `# 标题` —— 而研究稿和一部分提示词的正文**本来就以自己的一级标题开头**，
 *      于是文件里连着两个标题（`# Oracle` 下面紧跟 `# ORCL｜甲骨文 (Oracle Corp)`）；
 *   3. 一段引用块：「这是 <地址> 的副本」、来路那一句（AI 生成 / 人写的）、免责三句，
 *      问答再加「以下是模型的原话」、提示词再加「以下是提示词原文，照抄就能用…」。
 *
 *   外加把本地图片换成一句「这里原本有一张图」、在文件头报张数。
 *   受害最直接的是提示词：「复制全文」粘进模型的东西，头上先是十几行 YAML 和六句
 *   站方的话，然后才是提示词本身。
 *
 * ## 现在只做四件事
 *
 *   1. 换行归一成 LF。本机 `core.autocrlf=true`、Cloudflare 构建机上是 LF，
 *      不归一的话同一篇在两边导出的字节不同；
 *   2. 去掉开头的空行和末尾的空白，末尾留一个换行（文件的惯例，不是内容）；
 *   3. **正文里的本地图，地址换成站上那张图的完整地址**（下一节）；
 *   4. 正文拿不到、或者是空的，就**抛**（构建红），不落一个空文件。
 *
 * ⚠ **别把站方的任何一句话加回来** —— 出处、免责、来路、「模型的原话」、图片说明、
 *   frontmatter，一样都不要。它们当初各有理由（「文件离开站之后没有上下文」），
 *   用户的决定是：这些话属于页面，不属于读者拿走的那一份。页面上的出处芯片、
 *   页脚那条「免责声明」、「关于」页那一整节都还在。
 *   `scripts/gate/export.test.ts` 的 B 组拿磁盘上**每一篇真实内容**对账
 *   「导出 = 正文（只有图片地址不同）」，C 组钉着四个端点吐的就是这个函数的返回值。
 *
 * ## 【2026-09-23 当天第二轮，用户要的】本地图换成站上的完整地址
 *
 * 后台写进正文的是 `![](../../assets/guides/<号>/2.jpg)` —— 相对于 `src/content/`
 * 下那个 .md，下到读者桌面就是一张裂图。现在换成**页面上那张图的地址**
 * （`https://lwj.ai/_astro/2.<hash>.webp`）：`alt`、标题、别的字一个都不动，只换地址。
 *
 *   - **哪些图算"本地图"，不在这里判** —— 用的是 Astro 渲染这一篇时自己认出来的那张清单
 *     （`entry.rendered.metadata.imagePaths`，判据是 `remark-collect-images.js`）。
 *     站上画成图的那些，文件里就换；站上没当成图的（代码块里的示例、HTML 块里的），
 *     文件里也原样留着 —— 那些本来就没有"站上的地址"。
 *   - **清单里的每一张都必须在正文里找到并换掉，找不到就抛**（`unused`）。
 *     两边认图的规矩对不上的那天，症状是某张图在文件里还是相对路径 —— 一张裂图，
 *     而页面、构建、闸门四处全绿。宁可红。
 *   - 地址是怎么算出来的、为什么**不许**用 `import.meta.glob` 自己去导图，
 *     在 `exportImageUrls.ts` 顶部（一句话：那样会把没人用的原图连 EXIF 一起发上公网）。
 *
 * ## 连带的几件事（刻意的，不是漏了）
 *
 *   - **标题不进文件**。标题是站上那一格（问答的标题就是那个问题），正文是正文；
 *     下载下来的文件名就是标题（`DownloadLinks.astro` 的 `downloadName`）。
 *   - **Keystatic 存盘时加的转义原样留着**（`\[`、`\<`）。那是这份 markdown
 *     本来的写法；去掉 `\<` 的话它回到后台就编不开（docs/engineering-notes.md 坑 19）。
 *   - 裸 HTML 的 `<img src="./x.png">` **不换**：站上它也没被当成图处理
 *     （不在 Astro 那张清单里），没有"站上的地址"可换。
 *
 * ## 这仍然是第四条出站通道
 *
 * 前三条（详情页 HTML / RSS / sitemap）吐的是渲染过的正文，这一条吐原始 markdown。
 * 发布闸扫的正是正文（docs/gate.md 7.5），所以它吐的字节就是闸门扫过的那些 ——
 * 唯一的例外是图片地址，而那是从构建产物算出来的地址（`/_astro/<文件名>.<hash>.webp`），
 * 不是任何人写的自由文本；文件名本身原来就在被扫的那条相对路径里。两条前提仍然成立：
 *
 *   1. 条目清单**必须**来自 `getSortedPosts()`（= postFilter）—— 在四个端点里，
 *      不在这儿。裸 `getCollection()` 会让草稿和未到点的定时稿变成一个
 *      **没有 HTML 页面兜底、却挂在公网上的 .md**（`export.test.ts` C 组钉着）。
 *   2. frontmatter 里的字段不上公网 —— 原来靠一张白名单（`EXPORTED_FIELDS` /
 *      `WITHHELD_FIELDS`），现在**结构上**就是这样：这个函数的入参里根本没有 frontmatter。
 *      新加一个字段不用来这儿表态，它进不来。
 *
 * ## 为什么这个文件不 import `@/` 和 `astro:*`
 *
 * `scripts/gate/export.test.ts` 用**裸 tsx** 跑它，那里既没有 `@/` 别名也没有
 * `astro:*` 虚拟模块。唯一的 import 是 `formatRules.ts`（零依赖）：什么算围栏、
 * 什么算行内代码，全仓库只许有那一份判据（`tidyPlan.ts` 用的也是它）。
 * 要碰 `astro:assets` 的那一半在 `exportImageUrls.ts`。
 */

import {
  fencedLines,
  INLINE_CODE_SRC,
} from "../../scripts/content/formatRules";

export type ExportEntryInput = {
  /** 条目标题。**只用在报错信息里**，不进文件（理由见文件顶部「标题不进文件」）。 */
  title: string;
  /** `entry.body` —— 去掉 frontmatter 的原始 markdown。 */
  body: string | undefined;
  /**
   * 正文里本地图的地址 → 站上那张图的完整地址。键是 Astro 自己认出来的那个字符串
   * （`entry.rendered.metadata.imagePaths` 里的本地那几条），由 `exportImageUrls()` 算好传进来。
   * 一张本地图都没有的条目传一张空表。
   *
   * ★ **必填**，不是可选：可选的话第五个端点漏传就是"那个集合的图在文件里全是裂图"，
   *   而 TS、构建、页面四处全绿。
   */
  imageUrls: ReadonlyMap<string, string>;
};

/**
 * 主函数：正文原文 → 导出文件的全部内容。
 *
 * ★ `body` 不是字符串、或者去掉空白之后什么都不剩，就**抛**，不许 `?? ""`。
 *   空串会落一个 0 字节的 .md（实测 `new Response("")` 照样写盘），读者点下载拿到
 *   一个空文件而站上一切正常 —— "空状态冒充完成态"正是这个项目第二节点名的那种错误。
 *   （在这个函数还往文件里加东西的时候，空正文至少还有一个文件头；现在没有了，
 *   所以空正文那一档是【2026-09-23】补的。）
 */
export function toExportMarkdown({
  title,
  body,
  imageUrls,
}: ExportEntryInput): string {
  const name = title || "(无标题)";

  if (typeof body !== "string") {
    throw new Error(
      `「${name}」拿不到正文（entry.body 是 ${body === null ? "null" : typeof body}）。` +
        `导出一个空的 .md 比不导出更糟 —— 读者会以为这篇就是空的。`
    );
  }

  const normalized = body
    .replaceAll("\r\n", "\n")
    // 只去掉开头的**空行**，不用 trimStart()：第一行行首的空格在 markdown 里
    // 是有意思的（四个空格 = 缩进代码块），那是正文，不归这里动。
    .replace(/^(?:[ \t]*\n)+/, "")
    .trimEnd();

  if (normalized === "") {
    throw new Error(
      `「${name}」的正文是空的。导出一个空的 .md 比不导出更糟 —— ` +
        `读者会以为这篇就是空的（空正文本来会被 pnpm content:check 拦下）。`
    );
  }

  const { text, unused } = rewriteImageUrls(normalized, imageUrls);
  if (unused.length > 0) {
    throw new Error(
      `「${name}」里有 ${unused.length} 张图，站上把它画成了图，导出口却在正文里没认出来：` +
        `${unused.join("、")}。\n` +
        `  放过去的话，这几张在下载的文件里还是相对路径 —— 一张裂图，而页面上一切正常。\n` +
        `  多半是这张图的写法特殊（标题里有括号、目标地址跨了行…），` +
        `去 src/utils/exportMarkdown.ts 的 rewriteImageUrls() 补一种写法。`
    );
  }

  return `${text}\n`;
}

/**
 * Astro 那张图片清单里的**本地**那几条。
 *
 * `rendered.metadata.imagePaths` = 本地 + 远程（`content-layer.js` 里 concat 的）。
 * 判据照抄 `@astrojs/markdown-remark` 的 `remark-collect-images.js`：
 * 能被 `URL.canParse` 解析的是远程；不能、而且不以 `/` 开头的才是本地。
 * （以 `/` 开头的是 `public/` 下的图，Astro 根本不处理 —— 坑 15。）
 */
export function localImagePaths(imagePaths: readonly string[]): string[] {
  return imagePaths.filter(p => !URL.canParse(p) && !p.startsWith("/"));
}

/** Astro 认的图片格式（`astro/dist/assets/consts.js` 的 `VALID_INPUT_FORMATS`）。 */
const VALID_INPUT_FORMATS = [
  "jpeg",
  "jpg",
  "png",
  "tiff",
  "webp",
  "gif",
  "svg",
  "avif",
];

/**
 * 一张正文本地图在 Astro 那张导入表（`astro:asset-imports`，
 * 盘上是 `.astro/content-assets.mjs`）里的键。认不出格式就返回 `undefined` ——
 * Astro 自己也是跳过（页面上那张图原样输出、不处理），导出口跟着不换。
 *
 * ⚠ **这是照抄 Astro 的内部实现**（`astro/dist/assets/utils/resolveImports.js` 的
 *   `imageSrcToImportId`，没有从包的公开入口导出）。Astro 7.0.3 时键长这样：
 *   `../../assets/guides/1005/2.jpg?astroContentImageFlag=&importer=src%2Fcontent%2Fguides%2F1005.md`
 *   升级之后格式变了的症状是**查不到** —— `exportImageUrls()` 会当场抛，不是静默出裂图。
 */
export function imageImportId(
  src: string,
  filePath: string
): string | undefined {
  const ext = src.split(".").at(-1)?.toLowerCase();
  if (!ext || !VALID_INPUT_FORMATS.includes(ext)) return undefined;
  const params = new URLSearchParams("astroContentImageFlag");
  params.set("importer", filePath);
  return `${src}?${params.toString()}`;
}

/** 行内图片 `![alt](地址 "标题")` —— 第二组是地址（尖括号写法或裸写法），只换它。 */
const INLINE_IMAGE = /(!\[(?:[^\]\\\n]|\\.)*\]\(\s*)(<[^>\n]*>|[^\s()<>]+)/g;

/** 引用式图片的定义行 `[名字]: 地址` —— `![alt][名字]` 的地址写在这里。 */
const DEFINITION = /^(\s{0,3}\[(?:[^\]\\\n]|\\.)+\]:\s*)(<[^>\n]*>|\S+)/;

const INLINE_CODE = new RegExp(INLINE_CODE_SRC, "g");

/**
 * 正文里写的地址 → Astro 拿来查表的那个字符串。
 * Astro 那边是 mdast 解析过的 `decodeURI(node.url)`：尖括号去掉、反斜杠转义解开、再 decodeURI。
 */
function destKey(raw: string): string {
  const inner =
    raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw;
  const unescaped = inner.replace(/\\([!-/:-@[-`{-~])/g, "$1");
  try {
    return decodeURI(unescaped);
  } catch {
    return unescaped;
  }
}

/**
 * 把正文里那几张本地图的地址换成站上的完整地址。**别的字一个都不动。**
 *
 * - 围栏里、行内代码里的不动（判据是 `formatRules.ts` 那一份）：那是给人看的示例，
 *   站上也没把它们画成图；
 * - 只换 `imageUrls` 里有的 —— 远程图、`public/` 下的图、站上没当成图的，都原样留着；
 * - 返回的 `unused` 是表里有、正文里却一次都没换到的那几条（调用方据此抛）。
 */
export function rewriteImageUrls(
  text: string,
  imageUrls: ReadonlyMap<string, string>
): { text: string; unused: string[] } {
  if (imageUrls.size === 0) return { text, unused: [] };

  const used = new Set<string>();
  const swap = (whole: string, head: string, dest: string): string => {
    const key = destKey(dest);
    const url = imageUrls.get(key);
    if (url === undefined) return whole;
    used.add(key);
    return `${head}${url}`;
  };
  const inSegment = (segment: string) => segment.replace(INLINE_IMAGE, swap);

  const lines = text.split("\n");
  const fenced = fencedLines(lines);
  const out = lines.map((line, i) => {
    if (fenced[i]) return line;
    const def = DEFINITION.exec(line);
    if (def) return swap(def[0], def[1]!, def[2]!) + line.slice(def[0].length);
    // 行内代码原样留着，只在它们之间的那几段里换。
    let rewritten = "";
    let last = 0;
    for (const m of line.matchAll(INLINE_CODE)) {
      rewritten += inSegment(line.slice(last, m.index)) + m[0];
      last = m.index + m[0].length;
    }
    return rewritten + inSegment(line.slice(last));
  });

  return {
    text: out.join("\n"),
    unused: [...imageUrls.keys()].filter(k => !used.has(k)),
  };
}
