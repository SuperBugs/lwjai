/**
 * 阅读时长估算（`src/utils/readingTime.ts`）的测试。用例是研究稿真实的形态：
 * 中文正文 + 带代码和数字的表格 + 一段围栏。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readingStats } from "../../src/utils/readingTime";
import { tplStr } from "../../src/i18n/format";
import zhCN from "../../src/i18n/lang/zh-CN";
import en from "../../src/i18n/lang/en";

test("中文按字算，围栏代码块不算", () => {
  const body = [
    "## 这是什么",
    "",
    "特斯拉的交付量和产能利用率之间的关系。".repeat(10), // 18 个汉字 × 10（句号不算）
    "",
    "```ts",
    "const x = 1; // 这一行汉字不算",
    "```",
  ].join("\n");
  const s = readingStats(body);
  assert.equal(s.cjkChars, 184, "180 个正文汉字 + 小标题「这是什么」4 个");
  assert.equal(s.minutes, 1, "不到一分钟也报 1，不报 0");
});

test("表格里的代码和数字按词算，一篇长稿约等于汉字数除以 800（粗读速度）", () => {
  const para = "研究判断只给证据和可观察条件，不推荐具体合约。".repeat(100); // 21 个汉字 × 100
  const table = [
    "| 项目 | 数据 |",
    "| --- | --- |",
    "| 代码 | TSLA |",
    "| 口径 | 10-Q 与 TTM |",
    "| 比率 | 22.5% |",
  ].join("\n");
  const s = readingStats(`${para}\n\n${table}`);
  assert.equal(s.cjkChars, 2111, "2100 个正文汉字 + 表头和表格里的 11 个");
  assert.ok(s.latinWords >= 4, `拉丁词至少 TSLA / 10-Q / TTM / 22.5%：${s.latinWords}`);
  // 2026-09-20 速度翻倍（粗读）：原来 5~7 分钟，现在 2~4。
  assert.ok(s.minutes >= 2 && s.minutes <= 4, `2100 多字粗读应该在 2~4 分钟：${s.minutes}`);
});

test("图片语法和 HTML 标签不算字，链接只留文字", () => {
  const s = readingStats("![一张有很多字的截图说明](../../assets/x.png) <br> [点这里](https://x.y)");
  assert.equal(s.cjkChars, 3, "只有链接文字「点这里」三个字");
});

test("空正文也报 1 分钟，不炸", () => {
  assert.equal(readingStats("").minutes, 1);
  assert.equal(readingStats(undefined as unknown as string).minutes, 1);
});

// ── 屏幕上那句话 ──────────────────────────────────────────────────────
//
// 上面几条钉的是"这个数算得对不对"，下面这条钉的是"它在页面上被说成了什么"。
// 【2026-09-21 用户定的措辞】「阅读预计 N 分钟」（换掉了「约 N 分钟」）。
// 全站只有 `t.reading.minutes` 一个串，卡片 ×2 + 四个详情页都读它。

test("估计那两个字还在（挪到了 title 那一串），占位符真的被填上", () => {
  // ★ 两件事，都是零症状的：
  //   ① 措辞 —— 这个数是按粗读速度估出来的（上面那几条用例钉的就是那个估法）。
  //      写成「阅读 14 分钟」是把一个估计说成事实，而读者没有任何办法看出区别。
  //   ② 占位符 —— `tplStr()` 对认不出来的键**静默替换成空串**（format.ts），
  //      把 `{{minutes}}` 手滑写成 `{{minute}}`，屏幕上就是「阅读预计 分钟」，
  //      而页面、构建、闸门四处全绿。
  //
  // ⚠【2026-09-21 用户要的】屏幕上那几个字换成了一个眼睛图标，所以
  //   `reading.minutes` 只剩「14 分钟」——**那个 hedge 没有被删掉，它挪到了
  //   `reading.minutesTitle`**（hover 的 title 和读屏念的整句）。
  //   这条断言因此跟着挪，**不是放宽**：少了它，哪天有人把 title 那句也改成
  //   「阅读 14 分钟」，全站就再没有一处说过这个数是估的。
  for (const [lang, title] of [
    ["zh-CN", zhCN.reading.minutesTitle],
    ["en", en.reading.minutesTitle],
  ] as const) {
    assert.match(
      title,
      /预计|约|~|about/i,
      `${lang} 的 reading.minutesTitle（${title}）里没有表示估计的词 —— ` +
        `这个数是估的，而它是唯一还会被人读到的完整说法`
    );
  }

  for (const [lang, fmt] of [
    ["zh-CN", zhCN.reading.minutes],
    ["en", en.reading.minutes],
    ["zh-CN/title", zhCN.reading.minutesTitle],
    ["en/title", en.reading.minutesTitle],
  ] as const) {
    const rendered = tplStr(fmt, { minutes: 14 });
    assert.ok(
      rendered.includes("14"),
      `${lang} 的 reading.minutes（${fmt}）里没有 {{minutes}} 这个键，` +
        `tplStr 把它替换成了空：屏幕上会是「${rendered}」`
    );
    assert.ok(
      !rendered.includes("{{"),
      `${lang} 渲染完还剩一个没填的占位符：${rendered}`
    );
  }
});

/**
 * 【2026-09-21 用户要的】屏幕上那一格现在是**图标 + 数字**，整句只在 title / 读屏里。
 *
 * 钉的是那个组件真的把两件事都做了 —— 少了 `sr-only` 那一句，读屏用户听到的
 * 是一个孤零零的「14 分钟」（图标是 aria-hidden 的），既不知道是什么的 14 分钟，
 * 也不知道它是个估计。而那一处在屏幕上**完全看不出来**。
 */
test("ReadingTime.astro：图标进 aria-hidden，整句进 title 和 sr-only", () => {
  const src = readFileSync(
    join(process.cwd(), "src", "components", "ReadingTime.astro"),
    "utf8"
  );
  assert.match(src, /t\.reading\.minutesTitle/, "整句那个串没被用上");
  assert.match(src, /title=\{full\}/, "hover 上去什么都没有");
  assert.match(
    src,
    /class="sr-only">\{full\}/,
    "读屏拿不到整句 —— 只会念一个光秃秃的数字"
  );
  assert.match(
    src,
    /<IconEye\s+aria-hidden="true"/,
    "眼睛图标没标 aria-hidden：读屏会把它当成一个未命名的图形念出来"
  );
});
