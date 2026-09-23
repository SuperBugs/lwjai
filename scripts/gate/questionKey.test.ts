/**
 * 问答「问题组」键的格式（src/config/questionKey.ts）。
 *
 * 这个键**上公网**（进 frontmatter、进导出对账）而发布闸不扫它，所以它是**封闭格式**：
 * 小写 ASCII slug，和文件名同一类东西（docs/gate.md 第 4 节的规矩：
 * 会上公网的自由文本要么扫、要么封闭）。
 *
 * 【2026-09-20】后台那一格已经换成下拉（从已有问题里挑，值是那一组第一条的地址），
 * 所以**这条正则现在只在构建期兜底** —— 落到它，说明有人绕过后台手写了 frontmatter。
 * 归组本身的判据不在这里，在 `src/utils/related.ts` 的 `qaGroupKey()`，
 * 由 `related.test.ts` 钉着。
 *
 * ⚠ 这里曾经还有一条 `QUESTION_KEY_OR_EMPTY_RE`（"或者留空"版），是给手填文本框用的：
 *   `@keystatic/core` 的 `validateText()` 对 `pattern` 是**无条件**跑的，不看
 *   `isRequired` 也不看 `length.min`，于是空串过不了带 `+` 的正则、那一格永远留不了空。
 *   换成下拉之后没有文本框了，那条常量一起删了 —— 但那条 Keystatic 的脾气记在
 *   keystatic.config.ts 开头，**下次给任何选填文本框加 pattern 时还会撞上**。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { QUESTION_KEY_HINT, QUESTION_KEY_RE } from "../../src/config/questionKey";

test("认的：小写字母数字，连字符分段", () => {
  for (const ok of [
    "tsla-gross-margin",
    "crwv-convertible-discount",
    "orcl-oci-capex",
    "buyback-basics",
    "a",
    "q3",
    // ★【2026-09-21】下拉存进来的就是**一条问答的地址**，而地址现在是条目号。
    //   这一格是封闭格式（它上公网而闸门不扫它），纯数字必须在格式之内 ——
    //   不在的话后台里选一条已有问题就会存出一个 schema 拒收的值，
    //   而下拉自己是绿的（它的选项是从磁盘扫出来的，不过这个正则）。
    "4",
    "12",
    "q-20260920-0329-chatgpt-gpt-6-pro", // 换编号之前存的那种，老稿子里还有
  ]) {
    assert.equal(QUESTION_KEY_RE.test(ok), true, `「${ok}」该被认`);
  }
});

test("不认的：大写、下划线、空格、中文、连字符贴边或连着两个", () => {
  for (const bad of [
    "TSLA-Margin",
    "tsla_margin",
    "tsla margin",
    "特斯拉毛利率",
    "tsla--margin",
    "-tsla",
    "tsla-",
    "",
    " ",
  ]) {
    assert.equal(QUESTION_KEY_RE.test(bad), false, `「${bad}」不该被认`);
  }
});

test("没加 m 标志：换行不许被当成行尾放过去", () => {
  // `^…$` 加了 m 的话 "tsla\nTSLA" 会因为第一行合法而整体通过 —— 静默放进一个脏键。
  assert.equal(QUESTION_KEY_RE.test("tsla\nTSLA"), false);
  assert.equal(QUESTION_KEY_RE.multiline, false);
});

test("提示语要说得出「可以留空」—— 只问过一次是完成态，不是没填", () => {
  assert.match(QUESTION_KEY_HINT, /留空/);
});
