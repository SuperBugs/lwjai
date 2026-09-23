/**
 * 导出口（`.md` 下载 / 「复制全文」/ 打印）的测试。
 *
 * ## 【2026-09-23 用户定的】导出件就是正文原文
 *
 * 用户原话：「下载或者复制的时候会夹带平台私活，禁止，是什么就下载什么，保持原文」。
 * 在这之前导出件 = frontmatter（白名单裁过）+ `# 标题` + 一段站方的引用块
 * （出处 / 来路 / 免责 / 「模型的原话」…）+ 正文（本地图被换成一句话）。
 * 现在 = 正文原文，站方一个字都不加（`src/utils/exportMarkdown.ts` 顶部）。
 * 【同日第二轮，用户要的】唯一改动的是正文里本地图的**地址**：换成站上那张图的完整地址。
 *
 * ## 它仍然是这个站的**第四条出站通道**
 *
 * 前三条（详情页 HTML / RSS / sitemap）吐渲染过的正文，这一条吐原始 markdown，
 * 所以发布闸的两条隐含前提在这里仍要钉住：
 *
 *   1. 「草稿不会上公网」的前提是**草稿不生成页面**（`postFilter`）。
 *      一个裸 `getCollection()` 的导出端点会把草稿变成一个没有 HTML 页面兜底、
 *      却挂在公网上的 .md —— 而闸门、构建、页面四处零症状。→ C 组。
 *   2. 「`author` 不必扫」的前提是**它永远不上公网**。原来靠一张字段白名单
 *      （A 组对账 `EXPORTED_FIELDS` / `WITHHELD_FIELDS`）；现在是**结构上的**：
 *      `toExportMarkdown()` 的入参里根本没有 frontmatter，四个端点只递进去
 *      `title`（只用于报错）和 `body`。→ B 组 + C 组。
 *      （A 组 2026-09-23 随 frontmatter 一起删了：没有字段可以对账了。
 *       组的字母没挪，别的文件里写着「D 组钉着」「E 组钉着」。）
 *
 * ## 四组用例，钉四件不同的事 —— 不许合并
 *
 * | 组 | 钉什么 | 漏了会怎样 |
 * |---|---|---|
 * | B 序列化行为 | 导出 = 正文：磁盘上每一篇真实内容逐字对账（只许图片地址不同）；换图只换地址、代码里的不换、清单里的一张都不许漏；空的要抛 | 站方的话被加回来（这个函数的历史上加过一整段）；某张图在下载的文件里还是裂图 —— 两样都没有任何一处报错 |
 * | C 源码 parity | 四个端点都在、都过 postFilter、吐的就是 `toExportMarkdown()` 的返回值；详情页都挂了组件；算图片地址不许自己 glob 导图 | 端点在返回值前后拼东西；加第五个集合时那一个悄悄没有下载口；没人用的原图连 EXIF 一起上公网 |
 * | D 复制全文 | 它**取的是那条端点**、不在页面里另存正文；验的是"不是一张网页"且不误伤真实正文；五档状态两两不同 | 下载和复制两个出口当场分叉；某一篇的复制每一次都报失败 |
 * | E 来路 | 三档判据本身、详情页上"谁写的"、全站口径对磁盘上的内容成立 | 见那一组 |
 *
 * ★ B 组的用例**从磁盘上的真实内容、和"模型/后台真的会怎么写"来**，不是照着实现反推的。
 *   照实现反推的用例全绿而 bug 还在，是这个仓库最贵的那次事故的形态
 *   （docs/gate.md 第 7 节，`SC 13D` vs `SCHEDULE 13D`）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  imageImportId,
  localImagePaths,
  rewriteImageUrls,
  toExportMarkdown,
} from "../../src/utils/exportMarkdown";
import { looksLikeHtmlPage } from "../../src/utils/looksLikeHtmlPage";
import { CONTENT_COLLECTIONS } from "../../src/config/collections";
import { provenanceOf } from "../../src/config/provenance";
// D / E 组要逐 locale 查文案。这两份只 import 一个 type（相对路径），裸 tsx 加载得了 ——
// 换句话说别在 lang/*.ts 里 import `@/` 或 `astro:*`，那样这一组会在 import 阶段炸。
import zhCN from "../../src/i18n/lang/zh-CN";
import en from "../../src/i18n/lang/en";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const ROUTED = CONTENT_COLLECTIONS.filter(c => c.urlPrefix !== null);

/**
 * 磁盘上每一篇**会被导出**的真实内容：有详情路由的集合、不是草稿。
 *
 * 用正则切 frontmatter 而不是 gray-matter：这一组是裸 tsx 跑的，而这里要的只是
 * "`---` 那一块后面剩下的是什么" —— 和 Astro 的 glob loader 给 `entry.body` 的切法一致
 * （2026-09-23 对着 dev server 吐的 `/p/1000.md` 等四篇逐字节比过）。
 */
function realEntries(): { file: string; title: string; body: string }[] {
  const out: { file: string; title: string; body: string }[] = [];
  for (const c of ROUTED) {
    assert.ok(
      existsSync(join(ROOT, c.dir)),
      `登记表里的 ${c.dir} 不存在 —— 这一组会把"扫不到"读成"没东西"`
    );
    for (const f of readdirSync(join(ROOT, c.dir))) {
      if (!/\.md$/.test(f) || f.startsWith("_")) continue;
      const file = `${c.dir}/${f}`;
      const src = read(file).replaceAll("\r\n", "\n");
      const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(src);
      assert.ok(m, `${file} 切不出 frontmatter —— 先修这个用例的切法`);
      const front = m[1]!;
      // 草稿没有 .md 端点（postFilter），不在这一组的射程里。
      if (/^draft:\s*true\s*$/m.test(front)) continue;
      const title = /^title:\s*(.*)$/m.exec(front)?.[1] ?? file;
      out.push({ file, title, body: m[2]! });
    }
  }
  return out;
}

/**
 * **规格本身**：换行归一成 LF、去掉开头的空行和末尾的空白、末尾留一个换行 ——
 * 除此之外一个字节都不许动。写在测试里而不是从实现里 import，
 * 是为了让"导出件长什么样"有一份不跟着实现走的说法。
 */
const spec = (body: string) =>
  `${body
    .replaceAll("\r\n", "\n")
    .replace(/^(?:[ \t]*\n)+/, "")
    .trimEnd()}\n`;

/**
 * 给真实内容造一张"站上地址"表：正文里每条**相对路径**的图 → 一个一眼认得出的假地址。
 *
 * ★ 构建时这张表是 `exportImageUrls()` 从 Astro 自己那张图片清单算的（要 `astro:assets`，
 *   裸 tsx 跑不了）；这里用一条**独立**的正则去找，不借实现里的那一份 ——
 *   借了的话，实现认错一张图，测试就跟着认错同一张。
 */
function fakeImageUrls(body: string): Map<string, string> {
  const urls = new Map<string, string>();
  for (const m of body.matchAll(/!\[[^\]]*\]\(((?!https?:\/\/|\/)[^)\s]+)/g)) {
    const path = m[1]!;
    urls.set(path, `https://lwj.ai/_astro/FAKE-${urls.size}.webp`);
  }
  return urls;
}

/** 一篇真实内容走一遍导出口（图片表用上面那张假的）。 */
const exportOf = (e: { title: string; body: string }) =>
  toExportMarkdown({ ...e, imageUrls: fakeImageUrls(e.body) });

/** 纯文字的探针：没有本地图，图片表是空的。 */
const NO_IMAGES: ReadonlyMap<string, string> = new Map();

// ── B. 序列化行为：导出 = 正文原文 ──────────────────────────────────────

test("B · 导出件就是正文原文：磁盘上每一篇真实内容逐字对账（只许图片地址不同）", () => {
  const entries = realEntries();
  // 先自证这个扫描没瞎：扫出空集合的话下面的循环一次不跑，而用例**全绿**。
  assert.ok(entries.length > 0, "一篇真实内容都没扫到 —— 这条用例的前提没了");

  for (const e of entries) {
    const urls = fakeImageUrls(e.body);
    const out = toExportMarkdown({ ...e, imageUrls: urls });
    // 把换上去的地址换回原来那条相对路径 —— 剩下的必须和正文逐字节相同。
    let back = out;
    for (const [path, url] of urls) back = back.replaceAll(url, path);
    assert.equal(
      back,
      spec(e.body),
      `${e.file} 的导出件除了图片地址之外和正文对不上。\n` +
        `  【2026-09-23 用户定的】导出件就是正文原文，站方一个字都不加 ——\n` +
        `  出处、免责、来路、「模型的原话」、frontmatter、标题、图片说明，一样都不要。\n` +
        `  理由见 src/utils/exportMarkdown.ts 顶部。`
    );
    // 而且正文里那几条相对路径一条都不许剩 —— 剩下的那张下载下来就是裂图。
    for (const path of urls.keys()) {
      assert.ok(
        !out.includes(`](${path})`),
        `${e.file} 里 ${path} 没换成站上的地址 —— 下载下来是一张裂图`
      );
    }
  }
});

/**
 * 真实内容里今天**没有**、但后台和模型真的会写出来的几种东西。上面那条用例
 * 只证明得了今天磁盘上有的形状；这里补齐那几种 —— 哪天有人把"摘本地图""补标题"
 * 加回来，或者换图时顺手动了别的字，这一条当场红。
 */
test("B · 本地图只换地址；远程图、代码里的写法、裸 HTML、转义一个字都不动", () => {
  const A = "https://lwj.ai/_astro/2.AbCd1234.webp";
  const B = "https://lwj.ai/_astro/3.EfGh5678.webp";
  const TICK = "`";
  const FENCE = "```";
  const tail =
    `机构持股\\<20%，\\[代码]｜\\[公司简称]，\\*\\*小结：\\*\\*收盘；` +
    `行内的 ${TICK}![](../../assets/guides/1005/2.jpg)${TICK} 是在讲写法\n\n` +
    `${FENCE}markdown\n![围栏里的示例图](../../assets/guides/1005/2.jpg)\n${FENCE}`;
  const body =
    "# ORCL｜甲骨文 (Oracle Corp)\n\n" +
    "![](../../assets/guides/1005/2.jpg)\n\n" +
    '![登录页](../../assets/guides/1005/3.jpg "第一步")\n\n' +
    "| 步骤 | 截图 |\n|---|---|\n| 1 | ![](../../assets/guides/1005/2.jpg) |\n\n" +
    "![远程图](https://example.com/remote.png)\n\n" +
    '<img src="./local-raw.png" alt="裸 HTML 本地图">\n\n' +
    tail;
  const expected =
    "# ORCL｜甲骨文 (Oracle Corp)\n\n" +
    `![](${A})\n\n` +
    `![登录页](${B} "第一步")\n\n` +
    `| 步骤 | 截图 |\n|---|---|\n| 1 | ![](${A}) |\n\n` +
    "![远程图](https://example.com/remote.png)\n\n" +
    '<img src="./local-raw.png" alt="裸 HTML 本地图">\n\n' +
    tail +
    "\n";

  assert.equal(
    toExportMarkdown({
      title: "Oracle",
      body,
      imageUrls: new Map([
        ["../../assets/guides/1005/2.jpg", A],
        ["../../assets/guides/1005/3.jpg", B],
      ]),
    }),
    expected,
    "换图只许换地址。alt、标题、表格、远程图、裸 <img>（站上也没把它当图处理）、" +
      "行内代码和围栏里的写法（那是在讲写法）、Keystatic 的转义（`\\<`，去掉它回后台就编不开，" +
      "docs/engineering-notes.md 坑 19）—— 一个字都不许动。"
  );
});

test("B · 清单里的每一张都必须换到 —— 换不到就抛，不许留一张裂图", () => {
  // 清单来自 Astro 渲染这一篇时自己认出来的图（exportImageUrls.ts）。它说有、正文里却换不到，
  // 就是两边认图的规矩对不上 —— 放过去的症状是下载的文件里一张裂图，而页面一切正常。
  assert.throws(
    () =>
      toExportMarkdown({
        title: "探针",
        body: "正文里没有这张图。",
        imageUrls: new Map([
          ["../../assets/g/1/a.png", "https://lwj.ai/_astro/a.X.webp"],
        ]),
      }),
    /导出口却在正文里没认出来/
  );
});

test("B · 行内代码和围栏里的写法不换，而且会被报成\"没换到\"", () => {
  const key = "../../assets/g/1/a.png";
  const body =
    "用 `![](../../assets/g/1/a.png)` 这种写法插图：\n\n```\n![](../../assets/g/1/a.png)\n```";
  const { text, unused } = rewriteImageUrls(
    body,
    new Map([[key, "https://lwj.ai/_astro/a.X.webp"]])
  );
  assert.equal(text, body, "代码里的图片写法被换掉了 —— 那是在讲写法，不是一张图");
  assert.deepEqual(unused, [key], "只出现在代码里的那张没换到，必须报出来（调用方据此抛）");
});

test("B · 几种合法的图片写法都要认得：尖括号、百分号编码、反斜杠转义、引用式", () => {
  // 键 = Astro 清单里那个字符串（decodeURI(node.url)，解析器已经解开了尖括号和转义）。
  const url = "https://lwj.ai/_astro/a.X.webp";
  const cases: [body: string, key: string, expected: string][] = [
    ["![](<../../assets/g/1/a b.png>)", "../../assets/g/1/a b.png", `![](${url})`],
    ["![](../../assets/g/1/a%20b.png)", "../../assets/g/1/a b.png", `![](${url})`],
    ["![](../../assets/g/1/a\\_b.png)", "../../assets/g/1/a_b.png", `![](${url})`],
    [
      "![截图][s1]\n\n[s1]: ../../assets/g/1/a.png",
      "../../assets/g/1/a.png",
      `![截图][s1]\n\n[s1]: ${url}`,
    ],
  ];
  for (const [body, key, expected] of cases) {
    assert.equal(
      toExportMarkdown({ title: "探针", body, imageUrls: new Map([[key, url]]) }),
      `${expected}\n`,
      `这种写法没认出来：${body}`
    );
  }
});

test("B · 本地图的判据照抄 Astro：解析得成 URL 的是远程，/ 开头的是 public/，剩下的才是本地", () => {
  // remark-collect-images.js：URL.canParse → 远程；否则不以 / 开头 → 本地。
  assert.deepEqual(
    localImagePaths([
      "../../assets/guides/1005/2.jpg",
      "https://example.com/a.png",
      "/og.png",
      "data:image/png;base64,AAAA",
      "./same-dir.webp",
    ]),
    ["../../assets/guides/1005/2.jpg", "./same-dir.webp"]
  );
});

test("B · 查 Astro 图片导入表用的键，和 .astro/content-assets.mjs 里的逐字相同", () => {
  // 期望值是 2026-09-23 从 .astro/content-assets.mjs（Astro 7.0.3 生成）里原样抄下来的一行。
  // 键格式是 Astro 的内部实现（resolveImports.js 的 imageSrcToImportId，没有公开导出）：
  // 升级之后变了，构建时 exportImageUrls() 会当场抛；这一条是让改 imageImportId() 的人
  // 知道它原来长什么样。（不去读那个文件本身：测试跑在 astro check 之前，CI 上它还不存在。）
  assert.equal(
    imageImportId("../../assets/guides/1005/2.jpg", "src/content/guides/1005.md"),
    "../../assets/guides/1005/2.jpg?astroContentImageFlag=&importer=src%2Fcontent%2Fguides%2F1005.md"
  );
  // Astro 不认的格式它自己也跳过（页面上那张图原样输出），导出口跟着不换。
  assert.equal(imageImportId("../../assets/x.bmp", "src/content/guides/1005.md"), undefined);
  assert.equal(imageImportId("../../assets/noext", "src/content/guides/1005.md"), undefined);
  // 扩展名比的是小写（Astro 那边 toLowerCase 之后比）。
  assert.ok(imageImportId("../../assets/X.JPG", "src/content/guides/1005.md"));
});

test("B · 标题不进文件 —— 问答的标题就是那个问题，它在文件名里，不在正文里", () => {
  // 问答的正文就是回答本身（站上 8 条问答没有一条以标题开头）。原来导出口会在前面补
  // `# <问题>`，而研究稿的正文**自己就带一级标题**，于是那边是连着两个标题。
  const title = "昨晚CPU暴涨是因为什么，是否可持续？";
  const body = "昨晚（美东时间 2026 年 9 月 21 日）美股半导体板块出现剧烈重估行情。";
  const out = toExportMarkdown({ title, body, imageUrls: NO_IMAGES });
  assert.equal(out, `${body}\n`);
  assert.ok(!out.includes(title), "标题被写进了导出件");
});

test("B · 换行归一成 LF；只去开头的空行，第一行行首的空格留着；末尾恰好一个换行", () => {
  // entry.body 在本机是 CRLF（core.autocrlf=true）、在 Cloudflare 构建机上是 LF ——
  // 不归一的话同一篇在两边导出的字节不同。
  // 行首四个空格在 markdown 里是缩进代码块：用 trimStart() 会把它改成一个普通段落。
  assert.equal(
    toExportMarkdown({
      title: "探针",
      body: "\r\n\r\n    缩进的第一行\r\n正文。\r\n\r\n\r\n",
      imageUrls: NO_IMAGES,
    }),
    "    缩进的第一行\n正文。\n"
  );
});

test("B · 拿不到正文必须抛，不许落一个空文件", () => {
  // ⚠ 不许写成带默认参数的助手：默认值会把 undefined 吃掉，于是这条用例测的是
  //   默认那份正文，永远绿（docs/engineering-notes.md 坑 17）。
  for (const bad of [undefined, null]) {
    assert.throws(
      () =>
        toExportMarkdown({
          title: "探针",
          body: bad as unknown as string,
          imageUrls: NO_IMAGES,
        }),
      /拿不到正文/,
      `body 是 ${String(bad)} 时应该让构建红掉 —— 一个 0 字节的 .md 会让读者以为这篇就是空的`
    );
  }
});

test("B · 正文是空的也必须抛 —— 文件里没有站方的话之后，空正文就是一个空文件", () => {
  // 在导出口还往文件里加东西的时候，空正文至少还有一个文件头；现在没有了。
  for (const empty of ["", "   ", "\r\n\r\n", "\n \t\n"]) {
    assert.throws(
      () => toExportMarkdown({ title: "探针", body: empty, imageUrls: NO_IMAGES }),
      /正文是空的/,
      `body 是 ${JSON.stringify(empty)} 时应该抛，不许导出一个空文件`
    );
  }
});

// ── C. 源码 parity：加第五个集合时必须红 ─────────────────────────────────
//
// ⚠ 这一组钉的是**拼写，不是行为**：它 grep 源码，不跑 Astro。
//   能抓住"漏建一个端点""漏挂一个组件""复制粘贴时把 getSortedPosts 抄丢了"
//   "在返回值前后拼了东西"，抓不住"端点建了但逻辑是错的"。别拿它当行为测试的替身。

/**
 * 去掉注释再 grep。
 *
 * ★ 这个助手不是洁癖，是被咬出来的：`DownloadLinks.astro` 顶部那段注释里
 *   **原样写着**「不许塞进一个 `<script type="text/plain">`」——
 *   一个裸 grep 会把那句警告本身当成违规，于是用例对着一个写得完全正确的文件报红。
 *   反过来同样成立：一条注释里提到的写法会让"必须存在某某"那类断言假绿。
 *   `//` 要避开 `https://` 的双斜杠，所以要求它前面不是冒号。
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

test("C · 每个有详情路由的集合都必须有一个 .md 导出端点", () => {
  for (const c of ROUTED) {
    const p = `src/pages/${c.urlPrefix}/[...slug].md.ts`;
    assert.ok(
      existsSync(join(ROOT, p)),
      `${c.key}（${c.label}）没有导出端点：${p}\n` +
        `详情页上的下载链接是按 entryUrl 算的，端点不存在 = 那个链接 404，` +
        `而 Cloudflare 会返回一个 text/html 的 404 页，读者存下来是个后缀 .md 的网页。`
    );
  }
});

test("C · 每个导出端点都必须过 postFilter（走 getSortedPosts）", () => {
  for (const c of ROUTED) {
    const src = read(`src/pages/${c.urlPrefix}/[...slug].md.ts`);
    assert.match(
      src,
      /getSortedPosts\(\s*await getCollection\(/,
      `${c.key} 的导出端点没走 getSortedPosts —— 草稿和定时稿会变成挂在公网上的 .md，` +
        `而它们连 HTML 页面都没有。构建全绿、站上看不见，人眼发现不了。`
    );
  }
});

test("C · 四个端点吐的就是 toExportMarkdown() 的返回值，只递进去 title / body / 图片地址表", () => {
  // B 组管得住函数，管不住端点：`new Response(header + toExportMarkdown(…))`
  // 或者往入参里多递一格 `data`，B 组照样全绿，而下载下来的文件头上又多出站方的话。
  // 图片地址表必须是 exportImageUrls() 算的：自己拼一张的话，那张表里的地址和页面上的
  // 图对不上（或者干脆是空的 —— 教程的图在下载文件里全是裂图），四处全绿。
  for (const c of ROUTED) {
    const file = `src/pages/${c.urlPrefix}/[...slug].md.ts`;
    const src = stripComments(read(file));
    assert.match(
      src,
      /return new Response\(\s*toExportMarkdown\(\{\s*title: entry\.data\.title,\s*body: entry\.body,\s*imageUrls: await exportImageUrls\(entry, url\),?\s*\}\),/,
      `${file} 吐的不再是 toExportMarkdown({ title, body, imageUrls }) 的原样返回值。\n` +
        `  【2026-09-23 用户定的】导出件就是正文原文（图片换成站上地址）—— 端点里不许在它前后拼东西，\n` +
        `  也不许往入参里递 frontmatter，图片地址表只许是 exportImageUrls(entry, url) 算的\n` +
        `  （理由见 src/utils/exportMarkdown.ts 和 exportImageUrls.ts 顶部）。`
    );
    assert.equal(
      (src.match(/toExportMarkdown\(/g) ?? []).length,
      1,
      `${file} 里 toExportMarkdown( 出现了不止一次 —— 上面那条只认得一种写法`
    );
  }
});

test("C · 算图片地址只许用 Astro 已经导入过的那张表，不许自己 glob 导图", () => {
  // ★ 这一条钉的是一个**零症状的泄露**：Astro 的图片插件在构建时对每一个被导入的图
  //   都把原图发进产物，事后只删"做过变换、又没被直接引用"的那些。拿 import.meta.glob
  //   把 src/assets 下的图全导一遍，没有任何页面在用的截图（删掉的稿子留下的、换掉的旧图）
  //   就会**连 EXIF 一起逐字节上公网**（坑 15 那个形态），而页面、构建、闸门四处全绿。
  //   读图片对象的 `.src` 同理：静态构建里那是个 Proxy，读一下就把原图登记成"被直接引用"。
  // ⚠ 和别的 C 组一样是 grep 源码，抓拼写不抓行为。
  const file = "src/utils/exportImageUrls.ts";
  const src = stripComments(read(file));
  assert.doesNotMatch(
    src,
    /import\.meta\.glob/,
    `${file} 在用 import.meta.glob 自己导图 —— 没人用的原图会连 EXIF 一起进产物。` +
      `只许查 Astro 已经为正文导入过的那张表（astro:asset-imports），理由见该文件顶部。`
  );
  assert.match(src, /import\("astro:asset-imports"\)/, `${file} 不再查 Astro 的图片导入表了？`);
  assert.match(
    src,
    /getImage\(\{ src: image \}\)/,
    `${file} 递给 getImage 的不再是那张表里的原对象 —— 地址会和页面上的图对不上`
  );
  assert.doesNotMatch(
    src,
    /\bimage\.src\b/,
    `${file} 读了图片对象的 .src —— 静态构建里那一下会把原图登记成"被直接引用"，` +
      `原图就逐字节留在产物里（astro/dist/assets/utils/proxy.js）。`
  );
});

test("C · 四个详情页都必须挂了 DownloadLinks", () => {
  for (const c of ROUTED) {
    const p = `src/pages/${c.urlPrefix}/[...slug]/index.astro`;
    const src = read(p);
    assert.match(
      src,
      /<DownloadLinks\b/,
      `${p} 没挂 DownloadLinks。PostLayout 只管 <head>，四页各写一份正文结构，` +
        `所以漏插一页是完全零症状的 —— 那一页就是悄悄没有下载口。`
    );
  }
});

test("C · print.css 必须被 global.css 引入，且排在 theme.css 之后", () => {
  const css = read("src/styles/global.css");
  const theme = css.indexOf('@import "./theme.css"');
  const print = css.indexOf('@import "./print.css"');
  assert.ok(print >= 0, "global.css 没有引入 print.css —— 打印样式整个不生效，而构建全绿");
  assert.ok(
    print > theme,
    "print.css 必须排在 theme.css 之后：两边特异性都是 (0,1,0)，媒体查询不加特异性，" +
      "只由源码顺序决定谁赢。顺序反了，深色模式下打印出来还是灰字。"
  );
});

test("C · print.css 里不许出现 @layer", () => {
  // 实测：包进 @layer base 之后强制亮色对 getComputedStyle 零效果 ——
  // 无 layer 的规则永远赢过 layer 里的，与源码顺序无关，而 theme.css 的
  // [data-theme=dark] 正是无 layer 的。构建绿、类型绿、打印照旧是深色。
  // typography.css 用的就是 @layer base，照抄那个写法就会踩这一脚。
  const css = read("src/styles/print.css");
  assert.ok(
    !/^\s*@layer\b/m.test(css),
    "print.css 里出现了 @layer —— 强制亮色会静默失效，理由见该文件顶部那一大段"
  );
  assert.match(css, /@media print/, "print.css 里没有 @media print？");
});

// ── D. 「复制全文」按钮 ───────────────────────────────────────────────────
//
// 这个按钮**不是第五条出站通道**，它是第四条的一个触发器 —— 前提是它运行时去
// fetch `/r/<号>.md`，而不是把正文内联进页面。这一组钉的就是那个前提，
// 外加"验的是什么"和"五档状态不许压成三档"。
//
// ⚠ 前几条和 C 组一样是 grep 源码，抓拼写不抓行为。验钞机那条跑的是真函数。

const DL = "src/components/DownloadLinks.astro";

test("D · 复制按钮的地址必须就是下载链接那个 mdUrl，不许另拼一个", () => {
  const src = read(DL);
  assert.match(
    src,
    /data-md-url=\{mdUrl\}/,
    `${DL} 里复制按钮的地址不是 mdUrl。手拼 \`/r/\${id}.md\` 会在别的集合上` +
      `静默产出 404 链接 —— 而 404 返回的是一个 text/html 的页面，` +
      `fetch 照样 200 不了但就算 200 了也是一整页 HTML 被复制走。` +
      `地址一律由 entryUrl 算，只算一次。`
  );
  // 上面钉住了"按钮读的是 mdUrl"，这里钉住"mdUrl 自己是从 entryUrl 算出来的"。
  // 少了这一条，把 `const mdUrl = \`/r/${id}.md\`` 手拼出来照样能过上一条 ——
  // 而那正是组件注释里明令不许的写法，且它在别的集合上是静默 404。
  assert.match(
    stripComments(src),
    /const mdUrl = `\$\{pageUrl/,
    `${DL} 的 mdUrl 不是从 pageUrl（= entryUrl 的结果）算的。地址一律由 entryUrl 算，` +
      `手拼 \`/r/\${id}.md\` 会在别的集合上静默产出 404 链接。`
  );
});

test("D · DownloadLinks 不许拿到正文 —— 那会让下载和复制变成两个出口", () => {
  const src = read(DL);
  const props = /type Props = \{([\s\S]*?)\n\};/.exec(src)?.[1];
  assert.ok(props, `${DL} 里没找到 Props 定义？这条用例的前提没了，先修它。`);

  // ★ 内联正文是个**看起来更省**的写法（少一次网络请求），所以它一定会被提出来 ——
  //   尤其是 2026-09-23 之后：导出件就是正文原文，内联一份看起来"反正一样"。
  //   代价：那就是**两个出口**了，下载走端点、复制走页面里那一份，C 组只钉得住前者。
  //   端点那一侧在历史上被加过一整段东西，哪天任一侧再变，两者当场分叉，页面上零症状。
  //   docs/gate.md 7.5 的判据在这里就是字面意思。
  for (const field of ["body", "entry", "rendered", "content", "markdown"]) {
    assert.ok(
      !new RegExp(`^\\s*${field}\\??\\s*:`, "m").test(props),
      `${DL} 的 Props 里出现了 \`${field}\` —— 正文不许进这个组件。` +
        `复制按钮必须运行时 fetch 那条 .md 端点，理由见该文件顶部和 docs/gate.md 7.5。`
    );
  }
  assert.ok(
    !/<script[^>]*type=["']text\/plain["']/.test(stripComments(src)),
    `${DL} 里出现了 <script type="text/plain">，这是把正文内联进页面的典型写法。` +
      `同上：那是一个新的出口。`
  );
});

test("D · 取回来的东西必须被验过，不许 200 就当成功", () => {
  // ★ 必须 stripComments。这几句断言要找的字符串，在组件里**都有一份写在注释里**
  //   （注释解释的正是"不查会怎样"）—— 裸 grep 会被那份注释喂饱，
  //   于是删掉真正的检查之后用例照样全绿。实跑验证过：不 strip 时这一条是假绿的。
  const src = stripComments(read(DL));
  assert.match(
    src,
    /res\.ok/,
    `${DL} 没查 res.ok。Cloudflare 对不存在的路径返回一个 text/html 的 404 页，` +
      `await res.text() 照样给一大段字符串，按钮会写「已复制 8342 字」` +
      `而读者粘出来是一整页 HTML。`
  );
  assert.match(
    src,
    /looksLikeHtmlPage\(\s*res\.headers\.get\("content-type"\),\s*text\s*\)/,
    `${DL} 没验"取回来的是不是一张网页"。res.ok 挡不住「200 了但不是那个文件」` +
      `（宿主配错、中间层改写响应、连上的是一张登录页）。`
  );
  assert.match(
    src,
    /import \{ looksLikeHtmlPage \} from "@\/utils\/looksLikeHtmlPage"/,
    `${DL} 的验钞机不是 looksLikeHtmlPage.ts 那一份 —— 组件里另写一份的话，` +
      `下面那条"不误伤真实正文"的用例验的就不是浏览器里真在跑的那个。`
  );
  assert.doesNotMatch(
    src,
    /startsWith\("---"\)/,
    `${DL} 又在验「必须以 --- 开头」了。那是导出件还带 frontmatter 时的验法；` +
      `2026-09-23 起导出件就是正文原文，这一句会让**每一次**复制都报「没取到全文」。`
  );
});

test("D · 验钞机两个方向：网页必须认出来，真实正文一篇都不许误伤", () => {
  // 必须认出来的。第一条是 2026-09-23 对 lwj.ai 一个不存在的 .md 地址 curl 回来的开头。
  const CF_404 =
    '<!DOCTYPE html><html dir="ltr" lang="zh-CN" class="overflow-y-scroll scroll-smooth"><head>';
  assert.ok(looksLikeHtmlPage("text/html", CF_404), "线上真实的 404 页没认出来");
  assert.ok(looksLikeHtmlPage("text/markdown", CF_404), "头被改成了 markdown，但正文是一张网页");
  assert.ok(looksLikeHtmlPage(null, '\n  <html lang="zh"><body>请先登录</body></html>'));
  assert.ok(
    looksLikeHtmlPage("text/html; charset=utf-8", "# 看起来像 markdown"),
    "头说是 html 的就是网页（一个 200 的 HTML 错误页可以什么内容都有）"
  );

  // ★ 不许误伤的 —— 这一半比上面那一半贵：误伤一篇正文的症状是那一篇的
  //   「复制全文」**每一次**都报失败，而别的篇一切正常（docs/engineering-notes.md 坑 14：
  //   「不许误删」那一组比「必须挡住」那一组更容易出事）。
  //   ★ 头不认识（`application/octet-stream`）或干脆没有，都不许当成网页 ——
  //   线上 `.md` 今天是 `text/markdown`，但换个宿主、换个中间层就不一定。
  const entries = realEntries();
  assert.ok(entries.length > 0, "一篇真实内容都没扫到 —— 这条用例的前提没了");
  for (const e of entries) {
    const out = exportOf(e);
    for (const type of ["text/markdown", "text/markdown; charset=utf-8", "application/octet-stream", null]) {
      assert.ok(
        !looksLikeHtmlPage(type, out),
        `${e.file} 的导出件（Content-Type: ${String(type)}）被当成了一张网页 —— ` +
          `它的「复制全文」会每一次都报「没取到全文」。`
      );
    }
  }
  assert.ok(
    !looksLikeHtmlPage("text/markdown", "<div>正文开头就是一段 HTML</div>\n\n正文。"),
    "正文以别的 HTML 标签开头不是一张网页（模型的输出里真的会有裸 HTML）"
  );
});

const LOCALES = [
  ["zh-CN", zhCN],
  ["en", en],
] as const;

test("D · 成功档必须报字数：{{chars}} 占位符一个 locale 都不许丢", () => {
  for (const [name, t] of LOCALES) {
    assert.match(
      t.download.copied,
      /\{\{chars\}\}/,
      `${name} 的 download.copied 没有 {{chars}}。光写「已复制」说不清复制到的是` +
        `一整篇、一个空文件、还是一张 404 网页 —— 这三者在界面上必须长得不一样。`
    );
  }
});

test("D · 五档状态两两不同，尤其两个失败档不许共用一句", () => {
  for (const [name, t] of LOCALES) {
    const d = t.download;
    const states = {
      copy: d.copy,
      copyWorking: d.copyWorking,
      copied: d.copied,
      copyFailedFetch: d.copyFailedFetch,
      copyFailedClipboard: d.copyFailedClipboard,
    };
    const seen = new Map<string, string>();
    for (const [key, value] of Object.entries(states)) {
      assert.ok(
        value.trim() !== "",
        `${name} 的 download.${key} 是空的 —— 一档空文案 = 按钮点下去像没反应。`
      );
      const dup = seen.get(value);
      assert.ok(
        dup === undefined,
        `${name} 里 download.${key} 和 download.${dup} 是同一句「${value}」。\n` +
          `两个失败档合并的代价很具体：copyFailedFetch 那一档剪贴板**没被动过**，` +
          `读者按经验去粘，粘出来是上次复制的东西 —— 一段看起来完全正常、` +
          `但不是这篇文章的文字。docs/engineering-notes.md 第二节：两种"没有"不许合并成一种显示。`
      );
      seen.set(value, key);
    }
    // 两段失败说明同理：它们告诉读者的下一步动作是相反的（别去粘 / 按 Ctrl+C）。
    assert.notEqual(
      d.copyFailedFetchHint,
      d.copyFailedClipboardHint,
      `${name} 的两段失败说明是同一句 —— 但它们要读者做的事正好相反。`
    );
  }
});

test("D · 这几段文案走 textContent，不许写 markdown 强调", () => {
  // 【2026-09-18 浏览器里实测到的】`copyFailedFetchHint` 原本写着
  // 「**剪贴板没有被动过**」—— 照着当时旁边那组 `download.exportNotice` 写的
  // （那组字进的是 .md 文件，`**` 在那儿是对的；那组 2026-09-23 随导出件的文件头一起删了）。
  // 这几段是 setCopyState() 用 `textContent` 塞进 DOM 的，屏幕上显示的是**字面的星号**。
  // 构建全绿、类型全绿、测试当时也全绿 —— 只有把页面打开才看得见。
  const DOM_KEYS = [
    "copy",
    "copyHint",
    "copyWorking",
    "copied",
    "copyFailedFetch",
    "copyFailedFetchHint",
    "copyFailedClipboard",
    "copyFailedClipboardHint",
  ] as const;

  for (const [name, t] of LOCALES) {
    for (const key of DOM_KEYS) {
      const value = t.download[key];
      assert.ok(
        !/\*\*|(?:^|\s)[*_]\S/.test(value),
        `${name} 的 download.${key} 里有 markdown 标记：「${value}」\n` +
          `这一段是 textContent 塞进 DOM 的，星号会原样显示。`
      );
    }
  }
});

// ── E. 来路：「这一份是谁写的」 ─────────────────────────────────────────────
//
// 【2026-09-20 加的】在这一组出现之前，四个端点无条件铺一句**全称断言**
// 「站内所有内容都是 AI 生成」，而站上已经有两个集合不是（当时的口径）。
// 那之后导出件里是一句按条目分三档的来路声明（`provenanceOf()`）。
//
// 【2026-09-23】导出件里那一句也拿掉了（用户要的：导出件就是正文原文）——
// 原来钉"导出件里那句跟着集合走 / 排在第二行 / 拿不到要抛 / 四个端点按集合算"的
// 五条随之删掉，B 组的逐字对账已经保证导出件里**任何**站方的话都进不去。
// ⚠ 于是 `provenanceOf()` 今天**没有调用方**（页面那一句 09-21 就删了）。
//   下面前三条钉的是判据本身，留着是等站长决定这套判据删掉还是另找落点 ——
//   见 src/config/provenance.ts 顶部「现状」。
//
// ⚠ 这一组的用例**一律从真登记表 + 真 i18n 取值**，不写文案字面量。
//   写字面量的后果不是"不够优雅"，是断言变成"我传进去的那个字符串等于它自己"。

test("E · 三档判据：每个有详情路由的集合都算得出来，而且算的是该算的那一档", () => {
  // 登记表少填一个 provenance 其实是**类型错误**（StrictSpec），`astro check` 会红；
  // 这条是第二道，钉的是"算出来的那一档对不对"——类型管不着这件事。
  assert.equal(
    provenanceOf("prompts", {}),
    "ai",
    "【2026-09-20 站长定的口径】提示词本身也是 AI 写的 —— 发的人（站长或投稿的读者）" +
      "是分享者，不是作者。这一档是集合常量（collections.ts 里 prompts 的 provenance: \"ai\"），" +
      "哪天真收了一份人手写的提示词，那一行得换成逐条判据。"
  );
  assert.equal(
    provenanceOf("guides", {}),
    "ai",
    "【2026-09-20 站长定的口径】教程也是 AI 生成的。在这之前它是「没人确认过」那一档 ——" +
      "改的不是判据，是站长表了态（collections.ts 里 guides 的 provenance: \"ai\"）。" +
      "哪天真写了一篇人手写的教程，那一行得换成逐条判据。"
  );
  assert.equal(
    provenanceOf("posts", { agent: "claude" }),
    "ai",
    "agent 指向一个 AI 智能体的研究稿是 AI 生成的（判的是登记表的 kind: ai）"
  );
  assert.equal(
    provenanceOf("posts", { agent: "claude-opus-5" }),
    "unknown",
    "模型名不再是智能体 id（2026-09-20 拆成两维）—— 老写法查不到，落「不知道」，不许当成 AI"
  );
  assert.equal(
    provenanceOf("posts", { agent: "human" }),
    "human",
    "agent: human 的研究稿是人写的 —— 页面上原来写着「这篇由 我自己 生成。」"
  );
  assert.equal(
    provenanceOf("posts", { agent: "unspecified" }),
    "unknown",
    "哨兵是「还没标」，不许当成 AI 生成"
  );
  assert.equal(
    provenanceOf("qa", { agent: "no-such-agent-id" }),
    "unknown",
    "登记表里查不到的 id：我们并不知道它当初是模型还是人，落 unknown 而不是 ai"
  );
});

test("E · 没登记的集合必须抛，不许兜一个「AI 生成」", () => {
  // 兜底的后果很具体：新集合的每一条都被判成 AI 生成的，而页面、构建、闸门四处零症状。
  assert.throws(
    () => provenanceOf("notes-that-do-not-exist", {}),
    /登记表/,
    "查不到的集合应该抛，而且错误信息里要点名去哪张表补"
  );
});

test("E · 三档文案：两两不同、都不为空，一个 locale 都不许漏", () => {
  for (const [name, t] of LOCALES) {
    const { ai, human, unknown } = t.provenance;
    for (const [key, value] of Object.entries({ ai, human, unknown })) {
      assert.ok(
        (value ?? "").trim() !== "",
        `${name} 的 provenance.${key} 是空的 —— 空白会被读成"这事没什么好说的"`
      );
    }
    assert.notEqual(ai, human, `${name}：AI 生成和人写的压成了同一句`);
    assert.notEqual(
      unknown,
      ai,
      `${name}：「没人确认过」和「AI 生成」压成了同一句 —— 那是把"我不知道"说成一个结论`
    );
    assert.notEqual(unknown, human, `${name}：「没人确认过」和「人写的」压成了同一句`);
  }
});

test("E · 详情页和首页里不许再写死那句全称断言", () => {
  // 同一句断言在这个仓库里已经两次「两处只改一处」（docs/engineering-notes.md 坑 8）。
  for (const c of ROUTED) {
    const src = read(`src/pages/${c.urlPrefix}/[...slug]/index.astro`);
    assert.ok(
      !/站内所有内容都是 AI 生成/.test(stripComments(src)),
      `${c.key} 的详情页里还写死着「站内所有内容都是 AI 生成」。\n` +
        `  那是一句全称断言；来路要么按条目说（芯片），要么不说。`
    );
  }
  // ⚠ index.astro 要先 stripComments：那句话**作为改动说明**留在注释里
  //   （「原来这里是…」），而注释不渲染。不剥的话这条用例会对着一个
  //   写得完全正确的文件报红 —— D 组已经为这个形态被咬过一次。
  assert.ok(
    !/站内所有内容都是 AI 生成|站内所有内容由 AI 生成/.test(
      stripComments(read("src/pages/index.astro"))
    ),
    `src/pages/index.astro 里还有那句全称断言 —— 首屏那行小字是按条目说不了来路的地方，` +
      `要么不说，要么让读者点进条目自己看。`
  );

  // ★【2026-09-20 站长的决定】/about 那一份**不由这条用例管**：站长定了口径，
  //   免责声明首句就是「本站所有内容均为AI生成…」。换成一条**肯定断言**：
  //   那一页上最要紧的一句不许在改文案时被顺手删掉。
  //   【2026-09-23】导出件里那段免责拿掉之后，全站的免责只剩 /about 和页脚那条链接 ——
  //   这一句的分量更重了。
  assert.match(
    read("src/content/pages/about.md"),
    /不构成任何投资建议/,
    "about.md 的免责声明里「不构成任何投资建议」没了 —— 那是一个财经站最要紧的一句，" +
      "而这一页是「完整免责声明」的落点。"
  );
});

test("E · 页面那一侧：每个集合都得说清「谁写的」，而且说法不许悄悄消失", () => {
  /**
   * ★ 这一条是**肯定断言**，和上面那条"不许写回全称断言"（否定）配对。
   *
   * 【2026-09-20 审出来的】在它出现之前，E 组页面侧只有否定断言：把教程页那句
   * 来路整个删掉，**测试全绿、astro check 全绿、构建全绿**。
   * docs/engineering-notes.md 坑 14 记着这条规律：「不许误删」那一组比「必须挡住」那一组更容易出事。
   *
   * ⚠ **不许对 ROUTED 全表循环断言"都要调同一个东西"** —— 那会是假的：
   *   四页各有各的答法（见下表）。所以这里是一张**显式期望表**，而且用 ROUTED 对账：
   *   加第五个集合时，表里漏填那个集合会直接红，逼人回答"这一页拿什么说谁写的"。
   *
   * 【2026-09-21 用户要的】posts / guides 两页那句「这一篇是 AI 生成的（模型会编数字）。」
   * **删掉了**。`pattern: null` 是**显式的"这一页不说"**。
   * 【2026-09-23】导出件那一侧的来路声明也拿掉了（导出件就是正文原文），
   * 所以**页面上这一格就是读者唯一能看到"谁写的"的地方** —— 下面这张表的分量更重了。
   */
  const EXPECT: Record<string, { pattern: RegExp | null; why: string }> = {
    posts: {
      pattern: /<AgentModelChip/,
      why: "研究稿的 agent 有三档（模型 / 我自己 / 还没标），标题底下那张芯片逐条说",
    },
    guides: {
      pattern: null,
      why:
        "教程 schema 里没有作者字段，没有逐条事实可画 —— " +
        "2026-09-21 起这一页不说，全站口径由 /about 免责声明首句兜着" +
        "（2026-09-23 起 .md 那一侧也不说了）",
    },
    qa: {
      pattern: /<AgentModelChip/,
      why: "问答页逐条标着谁答的（AgentModelChip），再加一句同义的话只是噪音",
    },
    prompts: {
      pattern: /<PromptOriginChip/,
      why: "提示词页用来源芯片回答（分享者 / 投稿 · 署名）",
    },
  };

  // 双向对账：表里的键必须正好是有详情路由的那几个集合。
  assert.deepEqual(
    Object.keys(EXPECT).sort(),
    ROUTED.map(c => c.key).sort(),
    "详情页「谁写的」期望表和登记表对不上 —— 加集合时必须在这张表里表态（不说也要写成 null）"
  );

  for (const c of ROUTED) {
    const { pattern, why } = EXPECT[c.key]!;
    if (pattern === null) continue;
    assert.match(
      stripComments(read(`src/pages/${c.urlPrefix}/[...slug]/index.astro`)),
      pattern,
      `${c.key}（${c.label}）的详情页不再说「这一份是谁写的」了。\n` +
        `  这一页该走的是：${why}\n` +
        `  删掉它是零症状的 —— 而 2026-09-23 起导出件里也没有这句了，页面上这一格就是全部。`
    );
  }
});

test("E · 全站口径「所有内容均为 AI 生成」必须对磁盘上的内容成立", () => {
  /**
   * 【2026-09-20 站长定的口径】/about 和 README 的免责首句是一句**全称断言**：
   * 「本站所有内容均为AI生成，不构成任何投资建议、操作指导、要约或推荐。」
   *
   * ★ 这条用例**不管措辞，管事实**。只禁某几种字面量的否定断言，换个说法就绕过去了，
   *   而屏幕上还是那个绿勾（docs/engineering-notes.md 第一节最后那段记着这个形态）。
   *
   * 钉的是：**库里一旦真出现一条 `agent: human` 的内容，那句全称断言当场变成假话** ——
   * 那一条的芯片会说"我自己"写的，而 /about 说"所有内容均为AI生成"。
   * 这条用例是那一刻唯一的提示。
   */
  const claimed = /所有内容均为\s*AI\s*生成/;
  const pages = ["src/content/pages/about.md", "README.md"] as const;
  const claiming = pages.filter(p => claimed.test(read(p)));

  if (claiming.length > 0) {
    const humanEntries: string[] = [];
    for (const c of CONTENT_COLLECTIONS.filter(c => c.provenance === "by-agent")) {
      for (const f of readdirSync(join(ROOT, c.dir))) {
        if (!/\.mdx?$/.test(f) || f.startsWith("_")) continue;
        // 正则读 frontmatter 而不是 gray-matter：这一组是裸 tsx 跑的，
        // 而这里要的只是"有没有这一行"，不是完整解析。
        if (/^agent:\s*["']?human["']?\s*$/m.test(read(`${c.dir}/${f}`)))
          humanEntries.push(`${c.dir}/${f}`);
      }
    }
    assert.deepEqual(
      humanEntries,
      [],
      `${claiming.join(" 和 ")} 写着「所有内容均为 AI 生成」，而库里有 ${humanEntries.length} 条` +
        ` \`agent: human\` 的内容：\n  ${humanEntries.join("\n  ")}\n` +
        `  那几条的芯片会说是「我自己」写的 —— 和那句全称断言当面打架。\n` +
        `  两条出路：把那几条的 agent 改掉，或者把免责首句改成不是全称断言的说法。`
    );
  }

  // ★ 这一条和上面无关，原样留着：改来路措辞时最容易把它一起删掉，
  //   而它是一个财经站最要紧的一句。
  for (const p of pages) {
    assert.match(
      read(p),
      /不构成任何投资建议/,
      `${p} 里「不构成任何投资建议」没了 —— 改来路的时候最容易连它一起删掉。`
    );
  }
});
