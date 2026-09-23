import { defaultSchema } from "rehype-sanitize";

/**
 * Markdown 正文的消毒规则。
 *
 * ## 为什么需要它
 *
 * 【2026-09-18 实测】这个站的 Markdown **会执行裸 HTML**：
 * `@astrojs/markdown-remark` 里 `remarkRehype({allowDangerousHtml:true})`、
 * `rehypeRaw()`、`rehypeStringify({allowDangerousHtml:true})` 三处都是**无条件**的，
 * 没有任何配置开关，自定义 `processor` 也碰不到那一段。实测渲染结果：
 * `<script>alert(1)</script>` · `<img src=x onerror=…>` · `<a onclick=…>` ·
 * `<iframe>` **全部原样输出**。
 *
 * 而这个站的正文是**从模型的聊天框里粘进来的** —— 模型可以被它读到的网页内容
 * 诱导着把一段 `<script>` 原样抄进输出（提示词注入的经典落点就是
 * "让模型把这段字符原样写进回答"）。这不是理论风险，是这条内容管线的形状决定的。
 *
 * ## 为什么插在这个位置就够，而且很安全
 *
 * Astro 的 rehype 链顺序是（`@astrojs/markdown-remark/dist/index.js`）：
 *
 *     remarkRehype{allowDangerousHtml}   裸 HTML → **raw 节点**（还没解析成元素）
 *       → shiki 代码高亮
 *       → 【用户 rehype 插件 ← 我们在这里】
 *       → rehypeImages      注入 __ASTRO_IMAGE_ 占位属性
 *       → rehypeHeadingIds  给标题加 id
 *       → rehypeRaw         raw 节点在这里才变成真元素
 *       → rehypeStringify
 *
 * 三件事因此天然成立：
 *   ① 我们跑在 `rehypeRaw` **之前**，所以裸 HTML 此刻还是 `raw` 节点 ——
 *      `hast-util-sanitize` 的 `transform()` 对 `raw` 落到 `default:` 返回
 *      `undefined`，也就是**整个丢掉**。一行 schema 都不用写。
 *   ② 我们跑在 `rehypeImages` / `rehypeHeadingIds` **之前**，所以图片的
 *      `__ASTRO_IMAGE_` 占位属性和标题锚点是消毒之后才加的 —— **碰不到它们**。
 *      这一条对教程模块是生死攸关的：占位属性被删掉，图片会坏或失去优化。
 *   ③ 我们排在 `rehypeCallouts` **之前**，所以 callout 生成的结构不用进白名单。
 *
 * ## 为什么敢放开 `style` 和 `className`
 *
 * 在消毒发生的这一刻，树里的东西只有两个来源：**Markdown 语法**产生的元素，
 * 和 **shiki** 产生的高亮标记。Markdown 语法写不出 `style`、写不出 `onerror` ——
 * 想写只能用裸 HTML，而裸 HTML 在这一刻是已经被丢掉的 `raw` 节点。
 * 也就是说这两个属性在这里只可能来自 shiki 自己。
 *
 * ⚠ **这条推理依赖上面那个插件顺序。** 哪天 Astro 把 `rehypeRaw` 挪到用户插件
 * 之前，`style` 就会变成一个真的敞口。`scripts/gate/sanitize.test.ts` 钉着
 * 「裸 HTML 必须被中和」，那条测试会先红。
 *
 * ## 还挡住了什么
 *
 * `defaultSchema.protocols` 限制 `href` / `src` 的协议白名单，所以纯 Markdown 写的
 * `[点我](javascript:alert(1))` 也会被拆掉 —— 那条路**不经过裸 HTML**，
 * 只丢 `raw` 节点是挡不住的。
 */
export const MARKDOWN_SANITIZE_SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []),
      // shiki 的行号、行状态、主题切换全靠这几样。
      //
      // ★★【2026-09-18 踩到，很值得记】**两种拼法都要写。**
      //
      //   hast 的规范写法是 `className` / `tabIndex`（驼峰），
      //   而 **shiki 自己拼树时用的是原始 HTML 属性名 `class` / `tabindex`**
      //   —— 它没走 hast 的属性规范化。实测消毒前的树：
      //       { "class": "astro-code …", "tabindex": "0", "dataLanguage": "ts" }
      //   只有 data-* 那个是规范化过的。
      //
      //   所以只写驼峰那版的后果是：`style` 和 `data-language` 活下来，
      //   而 `class` 和 `tabindex` 被**静默**删掉 —— 代码块还在、缩进还在、
      //   颜色还在（style 是内联的），只有 `.astro-code`、`.line`、
      //   `.highlighted`、`.diff` 这些**靠 CSS 的**东西全失效。
      //   构建全绿、页面不报错，只是代码块看起来"有点不对"。
      //   这就是白名单最典型的翻车方式：名字差一格，东西悄悄少一半。
      "className",
      "class",
      "style",
      // `data*` 是 hast-util-sanitize 的特殊写法：放行所有 data-* 属性。
      // shiki 的 transformer（文件名、diff、高亮）往上挂的就是这些。
      "data*",
    ],
    // shiki 给 <pre> 加 tabindex="0"（让代码块能被键盘聚焦滚动）。
    // 同样两种拼法都要 —— 实测它写的是小写的 `tabindex`。
    pre: [...(defaultSchema.attributes?.pre ?? []), "tabIndex", "tabindex"],
  },
};
