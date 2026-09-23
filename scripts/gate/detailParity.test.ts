/**
 * 四个详情页的 parity —— 【2026-09-20】第二、三梯队加的东西，每一样都是"漏挂一页零症状"：
 *
 *   - ArticleEnhancements（进度条 / 锚点 / 代码复制 / 灯箱）—— 漏一页 = 那一页没有灯箱
 *   - TableOfContents —— 漏一页 = 那一页的长文没有目录
 *   - 时效 / 「模型的原话」两句在「关于」页 —— 【2026-09-20】从两个详情页挪过去的，
 *     漏了 = 全站没有一处说"数据会过期、模型会编数字"
 *   - 问答详情页的回答切换：正文有固定 transition 名、切换组件挂了 before-preparation ——
 *     漏一样 = 切换回答又变回整页一闪
 *   - `[...slug]/index.png.ts` 分享卡端点 —— 漏一页 = 详情页 og:image 指向 404
 *   - 分支 feed 和主 feed 用同一份 toFeedItems —— 各拼各的 = 前缀表悄悄分叉
 *   - rehypeTableScroll 排在消毒之后 —— 排在之前 = class 被白名单吃掉，宽表不滚
 *
 * ⚠ 和 share.test.ts 一样：这一组钉的是**拼写，不是行为**。grep 源码，不跑 Astro。
 *   先剥注释再 grep —— 组件的注释里写着它自己的名字，不剥的话删掉真正的挂载点照样绿。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTENT_COLLECTIONS,
  requireCollectionSpec,
} from "../../src/config/collections";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

const ROUTED = CONTENT_COLLECTIONS.filter(c => c.urlPrefix !== null);
const detailPage = (prefix: string) => `src/pages/${prefix}/[...slug]/index.astro`;

/**
 * 集合名 → 地址前缀。【2026-09-21】
 *
 * ⚠ 这两样**不是一回事**：集合叫 `posts`，地址前缀是 `r`（`/r/1002`）。
 *   原来这个文件里几处直接写 `detailPage(prefixOf("qa"))`，把集合名当成了前缀 ——
 *   前缀一改，那几条测试就去读一个不存在的文件（ENOENT，不是"断言失败"），
 *   看起来像测试坏了而不是代码坏了。
 */
const prefixOf = (key: string) => {
  const prefix = requireCollectionSpec(key).urlPrefix;
  assert.ok(prefix, `${key} 没有详情路由，取不到地址前缀`);
  return prefix;
};

test("每个详情页都挂了 ArticleEnhancements 和 TableOfContents", () => {
  for (const c of ROUTED) {
    const src = stripComments(read(detailPage(c.urlPrefix!)));
    assert.match(src, /<ArticleEnhancements\b/, `${c.key} 的详情页没挂 ArticleEnhancements —— 那一页没有灯箱、进度条、代码复制`);
    assert.match(src, /<TableOfContents\b/, `${c.key} 的详情页没挂 TableOfContents`);
    assert.match(src, /entryOgImageUrl\(/, `${c.key} 的详情页没用 entryOgImageUrl 算 og:image —— 分享出去是默认图，而卡片端点白画了`);
  }
});

test("正文首尾那两个跳转和右下角的圆钮必须成对出现 —— 少了谁都是零症状", () => {
  /**
   * 【2026-09-21】`JumpLink.astro`（正文右上角「跳到末尾」、正文底部右侧「跳到开头」）
   * **自己不写滚动逻辑**：它只挂 `data-jump-end` / `data-jump-top`，实现在
   * `BackToTopButton.astro` 那段脚本里（三处共用一个动作、一个
   * `prefers-reduced-motion` 判断）。
   *
   * 这让三样东西绑在了一起，而**三个方向漏掉任何一个都零症状**：
   *   - 少了 BackToTopButton → 两行字画得出来、点下去什么都不发生，零报错。
   *   - 少了 `to="top"` 那个 → 圆钮到底之后**没有东西接手**；而圆钮恰恰是
   *     "看见那行字才让位"的，看不见就一直显示 —— 两边都以为对方在负责。
   *   - 实现那侧把某个 data 钩子改名 → 那个方向的文字跳转全站变成死按钮。
   *
   * 纯 grep：抓的是"挂漏了一个"，不是"逻辑写错了"。
   */
  for (const c of ROUTED) {
    const src = stripComments(read(detailPage(c.urlPrefix!)));
    const jumps = [...src.matchAll(/<JumpLink\b[^>]*>/g)].map(m => m[0]);
    assert.ok(
      jumps.some(m => /to="end"/.test(m)),
      `${c.key} 的详情页没挂正文右上角那个「跳到末尾」（<JumpLink to="end">）`
    );
    assert.ok(
      jumps.some(m => /to="top"/.test(m)),
      `${c.key} 的详情页没挂正文底部右侧那个「跳到开头」（<JumpLink to="top">）。\n` +
        `  少了它，右下角那个圆钮到底之后没有东西接手，而且它自己也不会让位。`
    );
    assert.ok(
      /<BackToTopButton\b/.test(src),
      `${c.key} 的详情页挂了 JumpLink 却没挂 BackToTopButton。\n` +
        `  滚动那段脚本在 BackToTopButton 里，少了它那两行字都是点不动的死按钮（零报错）。`
    );
  }

  // 反过来也钉一次：实现那一侧不许把两个钩子、或者"让位"那一段弄丢。
  const fab = stripComments(
    read(`src/pages/${prefixOf("posts")}/[...slug]/_components/BackToTopButton.astro`)
  );
  for (const hook of ["[data-jump-end]", "[data-jump-top]"]) {
    assert.ok(
      fab.includes(hook),
      `BackToTopButton 不再绑 ${hook} 了 —— 四页里那个方向的文字跳转会一起变成死按钮`
    );
  }
  assert.match(
    fab,
    /takenOver/,
    "圆钮不再让位给正文底部那行「跳到开头」—— 到底时两个东西同时指着同一个动作"
  );

  /**
   * ★ 那段 `is:inline` 脚本**不许在解析到它的当场就绑**。
   *
   * 【2026-09-21 实测踩到】它要找的两个文字入口一个在它上面、一个在它下面：
   * `<JumpLink to="top">` 在页面更靠后的位置，脚本同步执行的那一刻**还不存在**。
   * 后果两个，都零报错：底部那个「跳到开头」是死按钮；`handoff` 为 null 导致
   * 圆钮到底也不让位。
   *
   * ⚠ 而且它**在站内跳转时是好的** —— ClientRouter 换页后脚本重跑，DOM 已经齐了。
   *   只有直接打开 / 刷新才坏，所以点着点着很容易以为没问题。
   */
  assert.match(
    fab,
    /readyState|DOMContentLoaded/,
    "BackToTopButton 的 is:inline 脚本又变成解析到就绑了 —— 它下面那个「跳到开头」\n" +
      "  那一刻还没进 DOM：按钮点不动、圆钮到底不让位，两条都不报错，\n" +
      "  而且站内跳转过去时一切正常，只有刷新这一页才坏。"
  );
});

test("时效和「模型的原话」两句在「关于」页，研究稿 / 问答详情页上不再挂", () => {
  // 【2026-09-20】用户要的：这两句研究和回答页都不要，挪进「关于」。
  // 钉的是**关于页真的说了**（挪走之后再丢掉就是全站没有一处说），而不只是详情页没了。
  const about = read("src/content/pages/about.md");
  assert.match(about, /模型的原话/, "关于页没说「正文是模型的原话」—— 这句从详情页挪走之后就只剩这一处");
  assert.match(about, /先看日期/, "关于页没说「读之前先看日期」—— 时效提示从详情页挪走之后就只剩这一处");
  // ★ 集合名 → 地址前缀（posts 的地址是 /r），别把两样当成一回事。
  for (const prefix of ["posts", "qa"].map(prefixOf)) {
    const src = stripComments(read(detailPage(prefix)));
    assert.doesNotMatch(src, /<AgeNotice\b/, `${prefix} 的详情页又挂回了 AgeNotice`);
    assert.doesNotMatch(src, /modelWordsNotice/, `${prefix} 的详情页又印回了「以下是模型的原话」`);
  }
  // 【2026-09-23】导出的 .md 里原来还留着一份（「文件离站之后关于页不跟着去」）——
  // 用户要的：下载 / 复制拿到的就是正文原文，站方一个字都不加，那一份也拿掉了，
  // `t.qa.modelWordsNotice` 这个键跟着删了。所以上面「关于页真的说了」那一条
  // 现在钉的是**全站唯一**的落点。导出件不许加字由 export.test.ts 的 B / C 组钉着。
});

test("问答详情页：回答切换不闪 —— 正文带固定 transition 名，切换组件接管那次换页", () => {
  const page = stripComments(read(detailPage(prefixOf("qa"))));
  assert.match(page, /<QaAnswerSwitch\b/, "问答详情页没挂 QaAnswerSwitch");
  assert.match(page, /id="answer"[\s\S]{0,80}transition:name="qa-answer"/, "#answer 没带 transition:name=\"qa-answer\" —— 切换回答时正文不会从转圈淡进来");
  assert.match(page, /qa-group-\$\{qaGroupKey\(entry\)\}/, "问答 <h1> 的 transition 名没按问题组起 —— 切换回答时标题会淡出再淡入");
  const nav = stripComments(read("src/components/QaAnswerSwitch.astro"));
  for (const hook of ["astro:before-preparation", "astro:before-swap", "astro:after-swap"]) {
    assert.ok(nav.includes(`"${hook}"`), `QaAnswerSwitch 没挂 ${hook}`);
  }
  assert.match(nav, /data-qa-switching\]::view-transition-old\(root\)/, "带 data-qa-switching 时整页那组的交叉淡化没关 —— 还是整屏一闪");

  /**
   * 【2026-09-22 用户要的】本条的**摘要摆进了这个框里**（切换那排下面）。
   * 于是这一块的渲染条件必须是"有同组的 **或者** 有摘要" ——
   *
   * ⚠ 退回只看 `siblings.length > 0` 的那天，**只写过一份的那些条目会连摘要一起没有**：
   *   页面照常渲染、构建全绿，只是那一页从此没有提要。
   *   站上今天每条研究稿都有同组的，所以这一档**在真实内容里触发不到** ——
   *   没有这条断言，它坏了也不会有人看见。
   */
  assert.match(
    nav,
    /siblings\.length > 0 \|\| description/,
    "切换框的渲染条件退回只看 siblings 了 —— 只写过一份的条目会连摘要一起不见"
  );

  /**
   * 【2026-09-23 用户问的「详情页摘要为什么是灰的」】这个框是 `app-note`
   * （global.css：灰字 + text-sm，"样板话 / 背景信息"那一档）。摘要那一段
   * **必须自己写颜色和不带断点的字号**，不许从框上继承 ——
   * 挪进框里那一版就是这么变成灰字、手机上 14px（比 17px 的正文还小）的，
   * 页面、构建、测试全绿；而列表卡片上那一句 9-21 刚按用户要求从灰字提成正文色。
   * ⚠ `sm:text-lg` 不算数：它只管 640px 以上，手机上照样是框的 text-sm。
   */
  const summary = nav.match(/<p\b(?:(?!<p\b)[\s\S])*?\{description\}\s*<\/p>/)?.[0];
  assert.ok(summary, "QaAnswerSwitch 里找不到摘要那一段 <p>{description}</p>");
  assert.match(
    summary,
    /\btext-foreground\b/,
    "摘要那一段没写 text-foreground —— 会继承 app-note 的灰字，读起来像一句附注"
  );
  assert.match(
    summary,
    /(?<![\w:-])text-(?:base|lg|xl)\b/,
    "摘要那一段没写不带断点前缀的字号 —— 手机上会继承 app-note 的 text-sm，比正文还小"
  );
  for (const [kind, page] of [
    ["问答", stripComments(read(detailPage(prefixOf("qa"))))],
    ["研究稿", stripComments(read(detailPage(prefixOf("posts"))))],
  ] as const) {
    assert.match(
      page,
      /<QaAnswerSwitch[\s\S]{0,200}\{description\}/,
      `${kind}详情页没把 description 传给 QaAnswerSwitch —— 那一页顶上不会有摘要`
    );
  }
  const card = stripComments(read("src/components/Card.astro"));
  // 【2026-09-20】研究稿也归组之后这个名字按集合拼（集合-group-键），
  // 两个详情页的 <h1> 分别是 qa-group-… / posts-group-…，对得上。
  assert.match(
    card,
    /\$\{collection\}-group-\$\{qaGroupKey\(/,
    "列表卡片的 transition 名没按「集合-组」起 —— 和两个详情页的 <h1> 对不上"
  );
});

test("每个集合都有分享卡端点，且过 postFilter、走 ogCardResponse", () => {
  for (const c of ROUTED) {
    const p = `src/pages/${c.urlPrefix}/[...slug]/index.png.ts`;
    assert.ok(existsSync(join(ROOT, p)), `${c.key} 没有分享卡端点：${p}`);
    const src = stripComments(read(p));
    assert.match(src, /getSortedPosts\(\s*await getCollection\(/, `${p} 没走 getSortedPosts —— 草稿 / 定时稿会生成一张没有页面兜底的卡`);
    assert.match(src, /ogCardResponse\(/, `${p} 没走 ogCardResponse —— 画不出来时没有回落，会是豆腐块或构建炸`);
  }
});

test("ArticleEnhancements：inline + rerun，锚点只找正文，文案从 i18n 绑进 data-*", () => {
  const src = read("src/components/ArticleEnhancements.astro");
  const code = stripComments(src);
  assert.match(code, /<script is:inline data-astro-rerun>/, "换页后这段要重跑，少了 data-astro-rerun 第二篇文章上灯箱就是死的");
  assert.match(code, /querySelector\("main \.app-prose"\)/, "锚点和灯箱必须只在正文里找，否则页脚相关条目的卡片标题也会被挂上 # 锚点");
  for (const attr of ["data-copy", "data-copied", "data-zoom", "data-preview", "data-close"]) {
    assert.match(code, new RegExp(`${attr}=\{t\.`), `${attr} 没有从 i18n 取 —— 中文站里又会冒出英文`);
  }
});

test("两条 feed 用同一份 toFeedItems，主 feed 里不许再有自己的前缀表", () => {
  // 【2026-09-20】原来还有第三条 /ai/<id>/rss.xml，随智能体索引一起拆掉了。
  const feeds = ["src/pages/rss.xml.ts", "src/pages/s/[symbol]/rss.xml.ts"];
  for (const p of feeds) {
    assert.ok(existsSync(join(ROOT, p)), `feed 端点不存在：${p}`);
    const src = stripComments(read(p));
    assert.match(src, /toFeedItems\(/, `${p} 没用 toFeedItems —— 条目拼法分叉，前缀表就有了第二份`);
    assert.match(src, /getSortedPosts\(/, `${p} 没过 getSortedPosts —— 草稿会进 feed`);
  }
  assert.ok(
    !/TITLE_PREFIX\s*[:=]/.test(stripComments(read("src/pages/rss.xml.ts"))),
    "rss.xml.ts 里又定义了一份 TITLE_PREFIX —— 那张表只许在 feedItems.ts 里有"
  );
});

test("rehypeTableScroll 挂在 astro.config.ts 里，且排在消毒之后", () => {
  const src = stripComments(read("astro.config.ts"));
  const sanitizeAt = src.indexOf("[rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA]");
  const scrollAt = src.indexOf("rehypeTableScroll,");
  assert.ok(sanitizeAt >= 0, "找不到消毒插件的挂载点");
  assert.ok(scrollAt >= 0, "rehypeTableScroll 没挂进 rehype 链 —— 宽表在手机上被压成一格一个字");
  assert.ok(scrollAt > sanitizeAt, "rehypeTableScroll 排在消毒之前 —— 它加的 class 会被白名单吃掉，而构建全绿");
});

test("宽表的样式：typography.css 有 .table-scroll，print.css 让它在纸上不被裁掉", () => {
  assert.match(read("src/styles/typography.css"), /\.table-scroll\s*\{/, "typography.css 里没有 .table-scroll —— 包了层 div 但不滚");
  assert.match(read("src/styles/print.css"), /\.table-scroll[\s\S]*?overflow:\s*visible/, "print.css 没把 .table-scroll 的 overflow 放开 —— 打印时宽表会被裁掉后半截");
});

/**
 * 【2026-09-20】研究稿也归组了（同一个选题、几个智能体各写一份），走的是和问答
 * **同一个组件**。这一条钉的是研究稿那一半的三个接口 —— 漏任何一个都是零症状：
 *   - 没挂组件 → 那一页永远不显示同选题的其他研究；
 *   - 正文那一格没有 transition 名 → 切换时整屏一闪（组件的脚本照样跑）；
 *   - <h1> 不按选题组起名 → 切换时同一行标题淡出再淡入。
 */
test("研究稿详情页：切换不闪 —— 正文带固定 transition 名，<h1> 按选题组起名", () => {
  const page = stripComments(read(detailPage(prefixOf("posts"))));
  assert.match(page, /<QaAnswerSwitch\b/, "研究稿详情页没挂 QaAnswerSwitch");
  assert.match(
    page,
    /id="article"[\s\S]{0,80}transition:name="post-body"/,
    "#article 没带 transition:name=\"post-body\" —— 切换研究时正文不会从转圈淡进来"
  );
  assert.match(
    page,
    /posts-group-\$\{qaGroupKey\(post\)\}/,
    "研究稿 <h1> 的 transition 名没按选题组起 —— 切换时标题会淡出再淡入"
  );
});

test("切换组件：正文那一格的 id 由这一排自己带过来，不许写死一个", () => {
  const nav = stripComments(read("src/components/QaAnswerSwitch.astro"));
  assert.match(
    nav,
    /data-body-id=/,
    "组件没把正文那一格的 id 带给脚本 —— 写死 #answer 的话研究稿那边转圈根本不出现，而链接照常能点、零报错"
  );
  assert.ok(
    !/getElementById\("answer"\)/.test(nav),
    "脚本里还写死着 getElementById(\"answer\")"
  );
});

/**
 * 【2026-09-21 用户要的】「谁写的 · 什么模型」从**并排两张芯片**合成了一张
 * （`AgentModelChip.astro`，写成「智能体（模型）」）。这一条钉两件事：
 *
 *   - posts / qa 两个详情页和列表卡片用的是**同一张**合并芯片。漏掉一处的症状是
 *     那一处的出处信息消失或者变回两张，而别的地方正常 —— 典型的 parity 缺口。
 *   - 旧的两个组件**不许回来**。它们不是被删着玩的：两套并存意味着同一件事
 *     有两种画法，而"这一页为什么长得不一样"没有人会当成 bug 报。
 *     （三档 × 三档的判据没动，仍然是 agents.ts 的 findAgent + models.ts 的 modelSlot。）
 */
test("出处芯片：两个详情页和卡片共用 AgentModelChip，旧的两张不许回来", () => {
  for (const key of ["posts", "qa"]) {
    const src = stripComments(read(detailPage(prefixOf(key))));
    assert.match(
      src,
      /<AgentModelChip\b/,
      `${key} 的详情页没挂 AgentModelChip —— 这一页不说是谁写的`
    );
  }
  const card = stripComments(read("src/components/Card.astro"));
  assert.match(card, /<AgentModelChip\b/, "列表卡片上没有出处芯片");

  for (const gone of [
    "src/components/AgentChip.astro",
    "src/components/ModelChip.astro",
  ]) {
    assert.ok(
      !existsSync(join(ROOT, gone)),
      `${gone} 又回来了 —— 同一件事两种画法，而"这一页长得不一样"没人会当成 bug 报`
    );
  }
  for (const rel of [
    "src/components/Card.astro",
    detailPage(prefixOf("posts")),
    detailPage(prefixOf("qa")),
  ]) {
    const src = stripComments(read(rel));
    assert.ok(
      !/<(Agent|Model)Chip\b/.test(src),
      `${rel} 里还用着旧的单张芯片`
    );
  }
});

/**
 * 【2026-09-21 用户要的】标题底下那行里的四个图标（下载 MD / 复制全文 / 另存 PDF /
 * 复制链接）**靠那一行的最右边**。漏掉一页是典型的 parity 缺口：那一页的按钮
 * 仍然紧跟在「使用的提示词：…」后面，而那段字每篇长短不一 —— 翻页时按钮在跳，
 * 而别的页都好好的，没有人会把它当成 bug 报。
 */
test("四个详情页：标题底下那排图标都靠右（ms-auto）", () => {
  for (const c of ROUTED) {
    const src = stripComments(read(detailPage(c.urlPrefix!)));
    assert.match(
      src,
      /<div class="ms-auto flex flex-wrap items-center gap-1">\s*<DownloadLinks\b/,
      `${c.key} 的详情页那排图标没靠右 —— 四页里只有它停在别的横坐标上`
    );
  }
});
