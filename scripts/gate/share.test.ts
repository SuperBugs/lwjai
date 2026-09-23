/**
 * 「复制链接」按钮（`src/components/CopyLinkButton.astro`）的测试。
 *
 * ## 为什么这个按钮值得一组测试
 *
 * 它是个**只有点下去才知道坏没坏**的东西，而且四种坏法在构建期全是绿的：
 *
 *   1. 三个详情页漏挂一页 —— 那一页悄悄没有复制按钮（`PostLayout` 只管 `<head>`，
 *      正文结构三页各写一份，没有"写一层三处都有"的办法）。
 *   2. 忘了 `data-pagefind-ignore` —— 全站每一篇都能被搜到「复制链接」四个字。
 *   3. 忘了 `data-print-hide` —— 读者打印出来的 PDF 上印着一个按不动的按钮。
 *   4. 三档文案里有两档写成了一样 / 留空 —— 复制失败看起来和成功一模一样，
 *      而那正是 docs/engineering-notes.md 第二节点名禁止的那件事。
 *
 * ## ⚠ 这一组钉的是**拼写，不是行为**
 *
 * 除了文案那两条是真的 import 了语言包，其余都在 grep 源码，不跑 Astro、
 * 不开浏览器。能抓住"漏挂一页""复制粘贴时把属性抄丢了"，
 * **抓不住**"挂了但剪贴板逻辑是错的"。别拿它当行为测试的替身 ——
 * 和 `export.test.ts` 的 C 组同一个性质，同一条免责。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTENT_COLLECTIONS } from "../../src/config/collections";
import zhCN from "../../src/i18n/lang/zh-CN";
import en from "../../src/i18n/lang/en";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const COMPONENT = "src/components/CopyLinkButton.astro";
const ROUTED = CONTENT_COLLECTIONS.filter(c => c.urlPrefix !== null);

/**
 * 剥掉注释再 grep。**两个方向都要剥，而且"必须出现"那个方向更要命。**
 *
 * 【写这条测试时当场踩到，两次，形态相反】
 *
 * 反向（不许出现 location）：组件顶部那段注释里**讲的就是**不许读 location，
 * 照原文 grep，说明文字自己被判成了违规。后果是下一个人想在注释里解释
 * "为什么不用它"都做不到，只能把解释删掉 —— 而那段解释正是这条规矩唯一的出处。
 * 这一档至少是**红的**，会被发现。
 *
 * 正向（必须有 data-pagefind-ignore / astro:page-load）：这两个词在组件注释里
 * 各出现过一次。于是把**真正的属性和监听整个删掉**，两条测试**照样全绿** ——
 * 它们钉的其实是我写的注释。故意破坏一次才照出来（docs/engineering-notes.md 坑 17：
 * 写完就去破坏它，这是唯一能证明它钉着东西的办法）。
 * 这一档是**绿的**，不主动破坏永远发现不了 —— 和 docs/engineering-notes.md 第一节
 * 那条「以为有保障，其实钉的是另一件事」同一个形态。
 *
 * 只剥整段 `/* *​/` 和**行首**的 `//`，不碰行中间的 `//` —— 免得把
 * `https://…` 从中间剁开。宁可少剥（漏判）也不能多剥（把真代码剥掉，
 * 那会让正向用例变成永远绿的摆设）。
 */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

/** 组件源码，注释已剥。所有 grep 都走这一份，别再直接 read(COMPONENT)。 */
const componentCode = () => stripComments(read(COMPONENT));

// ── A. parity：每个详情页都得挂 ─────────────────────────────────────────

test("A · 每个有详情路由的集合，详情页都必须挂了 CopyLinkButton", () => {
  for (const c of ROUTED) {
    const p = `src/pages/${c.urlPrefix}/[...slug]/index.astro`;
    // 同样先剥注释：三页的挂载点上方各有一段注释在讲这个组件，
    // 不剥的话哪天真把 <CopyLinkButton /> 删了、注释留着，这条照样绿。
    assert.match(
      stripComments(read(p)),
      /<CopyLinkButton\b/,
      `${p} 没挂 CopyLinkButton。PostLayout 只管 <head>，三页各写一份正文结构，` +
        `所以漏插一页是完全零症状的 —— 那一页就是悄悄没有复制按钮，` +
        `构建全绿、其他页面照常。加第五个集合时这条会红。`
    );
  }
});

// ── B. 组件自身那几条硬性属性 ───────────────────────────────────────────

test("B · 按钮那一块必须带 data-pagefind-ignore", () => {
  assert.match(
    componentCode(),
    /data-pagefind-ignore/,
    `${COMPONENT} 少了 data-pagefind-ignore —— 「复制链接」这几个字会进 Pagefind 索引，` +
      `于是全站每一篇文章都能被搜到它，而它不是任何一篇的内容。` +
      `（DownloadLinks.astro 顶部记着同一条。）`
  );
});

test("B · 按钮那一块必须带 data-print-hide", () => {
  assert.match(
    componentCode(),
    /data-print-hide/,
    `${COMPONENT} 少了 data-print-hide —— 读者「打印 / 存成 PDF」出来的那份里` +
      `会印着一个按不动的按钮。print.css 认的就是这个钩子。`
  );
});

test("B · 地址必须由 entryUrl 算，不许读 location", () => {
  const src = componentCode();
  assert.match(
    src,
    /entryUrl\(/,
    `${COMPONENT} 没用 entryUrl 算地址。手拼 \`/posts/\${id}\` 会在 qa / guides 上` +
      `静默产出错的链接 —— 而且是复制出去、发给别人之后才发现。`
  );
  assert.ok(
    !/location\.(href|pathname)/.test(src),
    `${COMPONENT} 读了 location —— 读者手上那个地址可能带 ?utm_source=…、带 #锚点，` +
      `也可能是预览域名或局域网 IP。分享出去点开可能 404。复制的必须是规范地址。`
  );
});

test("B · 按钮默认 hidden，且必须由脚本放出来", () => {
  const src = componentCode();
  // ★ 必须只看 `<button …>` 那一个开标签，**不许**在整份源码里 grep `hidden`：
  //   失败档那个 <div> 也带 hidden，脚本里还有两处 `.hidden = `。
  //   一开始就是这么写的，结果把按钮的 hidden 整个删掉、测试照样全绿
  //   （破坏一次才发现）—— 又一遍"钉的是另一件事"。
  const buttonTag = src.match(/<button\b[\s\S]*?>/)?.[0] ?? "";
  assert.match(
    buttonTag,
    /\bhidden\b/,
    `${COMPONENT} 的按钮不是默认隐藏的 —— 关掉 JS 的读者会看到一个点了` +
      `毫无反应的按钮，那是这个项目最不许出现的东西：看不出坏了的坏按钮。`
  );
  assert.match(
    src,
    /\.hidden\s*=\s*false/,
    `${COMPONENT} 的脚本里没有把按钮放出来的那一句 —— 按钮会永远隐藏，` +
      `整个功能凭空消失，而构建、类型、页面四处全绿。`
  );
});

test("B · 绑定必须挂 astro:page-load", () => {
  assert.match(
    componentCode(),
    /astro:page-load/,
    `${COMPONENT} 没监听 astro:page-load。ClientRouter 按脚本内容去重，` +
      `站内跳到第二篇文章时那段脚本不会再执行，而 DOM 已经换了一批 —— ` +
      `按钮会一直保持 hidden。第一篇上一切正常，只有点进第二篇才看得见。`
  );
});

// ── C. 三档文案：两两不同、都不为空 ─────────────────────────────────────
//
// 这一条是 docs/engineering-notes.md 第二节在这个按钮上的落点：
// 「还没点」「复制成功」「复制失败」在界面上必须长得不一样。
// 两档共用一句 = 复制失败看起来像成功 —— 读者以为地址在剪贴板里，
// 粘出来是上一次剪贴板里的东西。

const LANGS: Record<string, { share: Record<string, string> }> = {
  "zh-CN": zhCN,
  en,
};

for (const [lang, t] of Object.entries(LANGS)) {
  test(`C · ${lang}：复制链接的三档文案不许为空`, () => {
    for (const key of [
      "copyLink",
      "copied",
      "failed",
      "failedHint",
      "fieldLabel",
    ]) {
      assert.ok(
        (t.share[key] ?? "").trim().length > 0,
        `${lang} 的 share.${key} 是空的。空白会被读成"什么都没发生"，` +
          `而这里每一档都有话要说 —— 尤其是失败档：那一刻读者手上并没有那个地址。`
      );
    }
  });

  test(`C · ${lang}：三档文案必须两两不同`, () => {
    const { copyLink, copied, failed } = t.share;
    assert.notEqual(
      copied,
      copyLink,
      `${lang}：「复制成功」和「还没点」写成了同一句 —— 点下去界面没变化，` +
        `读者不知道到底复制上没有。`
    );
    assert.notEqual(
      failed,
      copyLink,
      `${lang}：「复制失败」和「还没点」写成了同一句 —— 失败被伪装成"还没点"。`
    );
    assert.notEqual(
      failed,
      copied,
      `${lang}：「复制失败」和「复制成功」写成了同一句。这是 docs/engineering-notes.md 第二节` +
        `点名禁止的那件事：失败态和完成态在界面上长得一样，` +
        `读者会拿着一个空剪贴板去粘贴。`
    );
  });
}
