/**
 * 后台那两格时间的时区换算（src/config/beijingTime.ts）。
 *
 * 钉四件事：
 *   ① 换算本身对（含跨日 / 跨月 / 跨年）；
 *   ② **默认值落在"此刻"上，一分钟都不许往未来偏** —— 未来稿在 `pnpm build` 里
 *      页面根本不生成而构建是绿的（docs/engineering-notes.md 坑 1），那是这一格最贵的失败模式；
 *   ③ 那个 +8 拿 **Intl 的 Asia/Shanghai 独立复核**一遍 —— 自己的常数自己验等于没验，
 *      这一条走的是系统的时区库，而且夏天冬天各取一天（北京不过夏令时，两处必须相等）；
 *   ④ 后台那边**只许有一处**走 `fields.datetime`（就是 `beijingDatetime()` 里那一句）。
 *      ★ 这条不是洁癖：再加一格时间而忘了包这一层，那一格就是 UTC，和隔壁那格差 8 小时，
 *      而后台、构建、闸门四处全绿 —— 零症状。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BEIJING_OFFSET_MINUTES,
  beijingWallToUtc,
  utcWallToBeijing,
} from "../../src/config/beijingTime";

test("盘上的 UTC ↔ 后台里的北京时间", () => {
  // 站上那篇 ORCL：frontmatter 是 2026-09-16T12:00:00.000Z，
  // 后台那一格现在该显示 20:00（也就是当初填它的时候手表上的读数）。
  assert.equal(utcWallToBeijing("2026-09-16T12:00"), "2026-09-16T20:00");
  assert.equal(beijingWallToUtc("2026-09-16T20:00"), "2026-09-16T12:00");
});

test("跨日 / 跨月 / 跨年 / 闰日都不许错位", () => {
  const pairs: [utc: string, beijing: string][] = [
    ["2026-09-16T23:30", "2026-09-17T07:30"], // 跨日（往后）
    ["2026-09-17T01:00", "2026-09-17T09:00"],
    ["2026-08-31T20:00", "2026-09-01T04:00"], // 跨月
    ["2025-12-31T20:00", "2026-01-01T04:00"], // 跨年
    ["2028-02-28T18:00", "2028-02-29T02:00"], // 闰日
    ["2026-09-16T00:00", "2026-09-16T08:00"], // 只写日期的老稿子（YAML 给的是 00:00Z）
  ];
  for (const [utc, beijing] of pairs) {
    assert.equal(utcWallToBeijing(utc), beijing, `${utc} → 北京`);
    assert.equal(beijingWallToUtc(beijing), utc, `${beijing} → UTC`);
  }
});

test("默认值那条链路：进去是此刻，存回盘上还是此刻，一分钟都不往未来偏", () => {
  // ★ 这一条是坑 1 的钉子。keystatic.config.ts 的 NOW_UTC 就是下面这个形状。
  const nowUtc = new Date("2026-09-21T07:58:33.123Z").toISOString().slice(0, 16);
  assert.equal(nowUtc, "2026-09-21T07:58");

  // 表单里显示成北京时间 —— 15:58 正是 Keystatic 自带的 { kind: "now" } 在这台
  // UTC+8 机器上填的那个数；区别在于它把这个读数**当成 UTC 存下去**（= 未来 8 小时，
  // 而未来稿在 pnpm build 里页面根本不生成、构建还是绿的）。
  assert.equal(utcWallToBeijing(nowUtc), "2026-09-21T15:58");

  // 原样存回去必须还是此刻，不是 15:58Z。
  assert.equal(beijingWallToUtc(utcWallToBeijing(nowUtc)), nowUtc);

  for (const iso of [
    "2026-01-01T00:00:00.000Z",
    "2026-06-30T16:00:00.000Z",
    "2026-12-31T23:59:00.000Z",
  ]) {
    const utc = iso.slice(0, 16);
    assert.equal(beijingWallToUtc(utcWallToBeijing(utc)), utc, iso);
  }
});

test("那个 +8 拿系统时区库复核：夏天冬天同一个答案（北京不过夏令时）", () => {
  // ★ 独立复核：这一条不读 BEIJING_OFFSET_MINUTES，走 Intl 的 Asia/Shanghai。
  //   两边不一致 = 要么常数错了，要么"北京不过夏令时"这个前提哪天不成立了。
  const viaIntl = (utcWall: string) => {
    const d = new Date(`${utcWall}:00.000Z`);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(d);
    const at = (t: string) => parts.find(p => p.type === t)?.value ?? "";
    return `${at("year")}-${at("month")}-${at("day")}T${at("hour")}:${at("minute")}`;
  };

  for (const utcWall of [
    "2026-01-15T03:00", // 冬（北半球）
    "2026-07-15T03:00", // 夏 —— 换成有夏令时的时区，这两行会给出不同的偏移
    "2026-03-08T18:30", // 美国那边换夏令时的那个周末
    "2026-11-01T18:30",
    "2025-12-31T20:00", // 跨年
  ]) {
    assert.equal(
      utcWallToBeijing(utcWall),
      viaIntl(utcWall),
      `${utcWall}：和 Asia/Shanghai 对不上`
    );
  }
  assert.equal(BEIJING_OFFSET_MINUTES, 480, "常数被改过就该在这里红");
});

test("认不出来的值原样放行，不抛 —— 抛一次就是这条内容在后台编不开", () => {
  for (const junk of ["", "不是时间", "2026-09-16", "2026-09-16T12:00:00Z"]) {
    assert.equal(utcWallToBeijing(junk), junk, `「${junk}」该原样返回`);
    assert.equal(beijingWallToUtc(junk), junk, `「${junk}」该原样返回`);
  }
});

test("后台只许有一处 fields.datetime（就是 beijingDatetime 里那一句）", () => {
  // ⚠ 这一条比的是源码文本，它只拦得住"又写了一个裸的 fields.datetime"这一种形态。
  //   够用：那正是再加一格时间时会顺手犯的错，而它的症状是零 ——
  //   新那一格是 UTC，和隔壁那格差 8 小时，四处全绿。
  const src = readFileSync(join(process.cwd(), "keystatic.config.ts"), "utf8");
  const hits = src.match(/fields\.datetime\(/g) ?? [];
  assert.equal(
    hits.length,
    1,
    `keystatic.config.ts 里出现了 ${hits.length} 处 fields.datetime( —— ` +
      `时间那几格只许走 beijingDatetime()，否则新那一格填的是 UTC 而隔壁那格是北京时间。`
  );
  assert.match(
    src,
    /beijingDatetime/,
    "keystatic.config.ts 里找不到 beijingDatetime —— 包那一层被拆掉了？"
  );
});
