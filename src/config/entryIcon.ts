/**
 * 条目图标 —— 教程标题前面那个小方块（「嘉信证券开户」前面挂嘉信的 App 图标）。
 *
 * 【2026-09-23 用户要的】原话「在教程那里可以上传图片作为教程的icon，比如说嘉信开户
 * 我就想上传嘉信的icon」。教程几乎都是"在某一家券商 / 银行 / 汇款平台上办一件事"，
 * 那一家是谁就是这篇的主语 —— 列表里认 logo 比读完标题再认快
 * （和智能体 logo 同一条理由：扫出来的，不是读出来的）。
 *
 * 现在只有教程有这一格（后台「教程」表单里的「图标」）。组件和判据都按条目写，
 * 不按集合写：哪天别的集合也要，加一格字段就行，不用再造一个组件。
 *
 * ## 为什么是后台上传，不是智能体那样的内置表
 *
 * 智能体一共十几家，登记表里存一个 id 就够（`src/config/agentIcons.ts`）；
 * 教程涉及的机构是**开放集合**（券商、银行、汇款、税表……），每加一家改一次代码不现实。
 * 上传的图落在这一条自己的配图目录里（`src/assets/guides/<号>/icon.<扩展名>`），
 * 和正文截图同一个目录 —— 所以 /_publish（`publishPlan.ts` 认 `src/assets/<集合>/`）、
 * 批量清理（`prune.ts` 连配图目录一起备份、一起删）都不用改一行就认得它。
 *
 * ## 三档，屏幕上三个样子
 *
 *   | 那一格 | 画什么 | 哪一档 |
 *   |---|---|---|
 *   | 传了 | 那张图（白底圆角方块） | **完成态** |
 *   | 没传 | 什么都不画，卡片和原来一字不差 | **完成态**，不是待补 |
 *   | 填了但文件不在 / 格式不收 | 构建红，一个字节都不发 | 失败 |
 *
 * ★ 没传是完成态：图标是装饰，标题已经说了这篇讲哪一家；而且不是每篇教程都对应
 *   一家机构（"怎么填 W-8BEN"）。所以**不许给没传的画占位框** —— 虚线方块在全站的
 *   语言里是"这一格还空着、待补"（`app-chip-empty`），对这一格说的不是真话。
 * ★ 坏图不许画出来：文件不在由 Astro 的 `image()` 当场报错，格式不收由下面的
 *   `entryIconFormatIssue()` 报错（`src/content.config.ts` 接的线），两样都是构建红。
 *   一张裂开的图和"没传"长得不一样 —— 前者根本到不了页面上。
 *
 * ## 为什么不收 SVG
 *
 * Astro 7 的图片服务**不处理 SVG**：`<Image>` 碰到 SVG 源就原样透传（要转位图得打开
 * `image.dangerouslyProcessSVG`，名字已经说明了态度）。于是一张从网上下的 SVG logo
 * 会**逐字节**发到 `/_astro/icon.<hash>.svg` —— 和 docs/engineering-notes.md 坑 15 同一个形态
 * （没经 sharp = 原图直出），而且比 JPEG 的 EXIF 更糟：SVG 可以带 `<script>`，
 * 有人直接打开那个地址时它在本站的源下执行；设计软件导出的还常带着作者机器上的路径。
 * 位图走 sharp：重新编码成 webp、元数据全剥 —— 发出去的是我们生成的字节，不是原文件。
 *
 * ★ 所以下面是**白名单**（sharp 会重新编码的那几种），不是"拉黑 svg"：
 *   哪天 Astro 多透传一种格式，黑名单会安静地放它过去。
 *
 * ★ 零 import：`src/content.config.ts`（Astro）、`uploadFilename.ts`（后台，Vite 在
 *   浏览器里跑）、测试（裸 tsx）三处都读它。
 */

/**
 * 后台那一格的 key —— **同时也是盘上的文件名**。
 *
 * Keystatic 存 `fields.image` 时拿字段 key 当文件名（存盘那一步
 * `serializeProps(…, true)` 给的 `suggestedFilenamePrefix`），原始文件名直接丢掉：
 * 传一张叫 `schwab_account_12345678.png` 的图，盘上和公网地址里都只有 `icon`。
 * 正文截图那边要靠 `sanitizeUploadFilename()` 清洗文件名，这一格天然不用。
 *
 * ⚠ 它和正文截图**在同一个目录里**：正文里粘一张也叫 `icon.png` 的图，两张会写到
 *   同一个路径上，后写的**静默**盖掉先写的（Keystatic 按路径写盘、不查重）。
 *   所以正文图的文件名清洗把这个名字**让出来了**（`uploadFilename.ts`）。
 *   改这个 key 时两处一起改 —— `entryIcon.test.ts` 钉着 keystatic.config.ts 里
 *   那一格的 key 就是这个常量。
 */
export const ENTRY_ICON_FIELD = "icon";

/**
 * 收哪几种格式 —— 值是 Astro `ImageMetadata.format`（image-size 探出来的，
 * JPEG 报 `jpg`，`jpeg` 是给手改扩展名的那种留的）。
 * 每一种都是 sharp 会**重新编码**的位图；`svg` 刻意不在里面，理由见文件头。
 */
export const ENTRY_ICON_FORMATS: readonly string[] = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "avif",
  "gif",
];

/**
 * 这一格的值 → 它是什么格式。**两处拿同一个判据去比，但手上的东西不一样**：
 *
 *   - `src/content.config.ts`（校验时）：【2026-09-23 实测】Astro 7 的内容层里，
 *     `image()` 在校验那一刻**还没去读图**，交给 `superRefine` 的是一串占位符
 *     `__ASTRO_IMAGE_../../assets/guides/1005/icon.png`，图要到运行时才换成
 *     ImageMetadata（`astro/dist/content/utils.js` 的 `getEntryData`）。
 *     Astro 文档里那个 `image().refine(img => img.width >= 1080)` 的例子在这里
 *     拿到的是字符串 —— 照着写 `img.format`，**每一张图都会被拒**（第一版就是这么红的）。
 *     所以这一档按**扩展名**认。
 *   - `EntryIcon.astro`（渲染时）：手上是真的 ImageMetadata，`format` 是按**文件内容**
 *     探出来的 —— 改了扩展名的 SVG 在这里现形。这一档才是权威，上面那一档只是更早、
 *     报错更好读。
 *
 * ★ 第三种形状是**函数**：Astro 把内容集合里的 SVG 换成一个**组件**（元数据挂在函数上，
 *   `astro/dist/assets/runtime.js` 的 `createSvgComponent`），渲染出来是把 SVG 源码
 *   **原样内联进页面**的 `<svg>…</svg>` —— 正是最不能放过去的那一种，所以函数也要认。
 *
 * 认不出来返回 `undefined`（→ `entryIconFormatIssue` 当成不收）：宁可红，
 * 不许在认不出的时候放行。
 */
export function entryIconFormatOf(value: unknown): string | undefined {
  if (typeof value === "string") {
    const m = /\.([a-z0-9]+)$/i.exec(value);
    return m ? m[1].toLowerCase() : undefined;
  }
  if (
    value &&
    (typeof value === "object" || typeof value === "function") &&
    "format" in value
  ) {
    const f = (value as { format?: unknown }).format;
    return typeof f === "string" ? f.toLowerCase() : undefined;
  }
  return undefined;
}

/**
 * 格式不收时给人看的话（`src/content.config.ts` 的 `superRefine` 把它挂成一条 issue，
 * `EntryIcon.astro` 渲染时再拿真格式比一次、不收就抛）；收就返回 `undefined`。
 *
 * ★ SVG 单独一句：它是最常见的"从官网下的 logo"格式，报一句"不支持的格式"
 *   人只会去换一个名字再试一次；说清楚为什么、换成什么，一次就改对了。
 */
export function entryIconFormatIssue(
  format: string | undefined
): string | undefined {
  const f = format?.toLowerCase();
  if (f !== undefined && ENTRY_ICON_FORMATS.includes(f)) return undefined;

  const accepted = ENTRY_ICON_FORMATS.join(" / ");
  if (f === "svg") {
    return (
      "图标不收 SVG：Astro 不处理 SVG，会把原文件一个字节不改地发到公网" +
      "（SVG 里可以带脚本，也常带着导出它的那台机器上的路径）。" +
      `换成 PNG 再传一次 —— App Store 里那种正方形、自带底色的 App 图标最合适。收的格式：${accepted}。`
    );
  }
  return (
    `认不出这张图标是能用的格式（探出来的是 ${f ?? "空"}）。` +
    `收的格式：${accepted} —— 这几种会被重新编码成 webp、元数据全剥，别的格式会原样发出去或者根本画不出来。`
  );
}
