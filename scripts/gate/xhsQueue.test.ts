/**
 * 批量发小红书那个队列（`src/dev/xhsQueuePlan.ts` ＋ `/_xhs` 上的接线）的测试。
 *
 * ## ★ 这一组里最要紧的一条：**"没轮到" 不是 "没勾选"**
 *
 * 一批十几条跑十几分钟，中途可能被 `offline` 掐掉、可能被人按停。
 * 没轮到的那几条如果和"压根没勾"长得一样，人会合上电脑以为全发完了 ——
 * 那是 docs/engineering-notes.md 第二节那条价值观在这个功能上的落点（A4 / A5 / B6 钉它）。
 *
 *   A 组 判据   —— 停不停整批 / 哪些能放心勾 / 收尾那句话怎么分档
 *   B 组 接线   —— 串行、单点和批量同一条路、跑起来锁住能改这批的控件
 *
 * ## ⚠【2026-09-23】这整套**今天渲染不出来**
 *
 * 小红书停用，平台表里那一行是 `retired`，`/_xhs` 上的批量工具栏、勾选框、
 * 「发小红书」按钮都跟着 `canAutoPublish` 收起来了
 * （判据 `src/config/socialPlatforms.ts`）。
 *
 * ★ 所以下面 B 组读源码那几条现在钉的是「**真渲染出来的时候，它是接对的**」，
 *   **不是**「队列今天还在工作」。别把它们读成后者。
 * ★ 「门控确实存在、而且撤掉之后页面上说得出原因」由
 *   `communityPost.test.ts` 的 **D4 / D5** 钉着 —— 那才是今天生效的那一条。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  QUEUE_GAP_DEFAULT_SEC,
  QUEUE_GAP_MAX_SEC,
  asQueueState,
  parseGapSeconds,
  queueSummary,
  queuedLabel,
  recordedTier,
  safeToQueue,
  skippedLabel,
  stopsQueue,
  type QueueEndState,
} from "../../src/dev/xhsQueuePlan";

const ROOT = join(import.meta.dirname, "..", "..");
const PAGE = readFileSync(join(ROOT, "src/dev/xhs.astro"), "utf8");

/**
 * 把注释剥掉再比。⚠ 这一条是**这一轮踩过三次**的（xhsCard / xhsPost / xhs.astro）：
 * 一条"不许这么写"的断言，会被**写着不许这么写的那句注释**接住，于是真改坏了也不红。
 */
const codeOnly = (src: string) =>
  src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** 页面里那段 `<script>`（接线都在这儿），注释已剥掉。 */
const SCRIPT = codeOnly(PAGE.slice(PAGE.indexOf("<script>")));
/**
 * `<script>` 之前那一段 —— 屏幕上真印出来的字。
 * ⚠ **这里也必须剥注释**：第一版没剥，于是 B6「间隔得自称是猜的」被**写着
 *   「间隔那个数是猜的」的那句 JSX 注释**接住了 —— 把屏幕上那句话整个换掉，
 *   测试照样绿。破坏验证当场抓到的，同一个形态这一轮是第四次。
 */
const MARKUP = codeOnly(PAGE.slice(0, PAGE.indexOf("<script>")));

/* ── A 组：判据 ─────────────────────────────────────────────────────── */

test("A1 只有 offline 停整批 —— 单条失败不许把剩下十几条判死", () => {
  // server 没起 / 没登录：后面每一条都会撞同一堵墙，接着跑只是十几个一样的红条。
  assert.equal(stopsQueue("offline"), true);

  // 而这三档是**这一条自己的事**：标题太长、图没画出来、回包看不懂。
  for (const t of ["published", "unconfirmed", "failed"] as const) {
    assert.equal(stopsQueue(t), false, `${t} 不该停整批`);
  }
});

test("A2 「选没发出去的」判的是**重发会不会发重**，不是发过没发过", () => {
  assert.equal(safeToQueue(undefined), true, "从来没试过 —— 该勾");
  assert.equal(safeToQueue("failed"), true, "明确没发出去 —— 重发是安全的");
  /**
   * ⚠【2026-09-22 在浏览器里跑出来的，第一版真漏了这一条】
   *   `offline` = server 没起，**连试都没试** —— 它和"没发过"是一回事。
   *   漏掉的症状很具体：整批停在第二条，人去把 server 起起来、回来再点一次，
   *   而那一条已经被取消勾选了，于是**被安静地跳过**。
   */
  assert.equal(safeToQueue("offline"), true, "还没轮到发布 —— 重发是安全的");

  // ⚠ 这两条是这个按钮唯一能造成的真实损害：一键把可能已经在小红书上的
  //   内容再发一遍，而那个接口说不清到底发没发。
  assert.equal(safeToQueue("unconfirmed"), false, "可能已经发出去了，不许勾");
  assert.equal(safeToQueue("published"), false);
});

test("A9 卡片上记哪一档，必须和 recordPublish() 记的一致", () => {
  /**
   * `xhsPublished.ts` 的 `recordPublish()` 对 `offline` 直接 return ——
   * "还没轮到发布"不是一次发布。页面那边如果记成 `offline`，卡片上带的就是
   * 一个**盘上根本不存在的状态**：刷新一下变回"没发过"，而刷新前后
   * 「选没发出去的」勾出来的东西不一样，两次都不报错。
   */
  assert.equal(recordedTier("offline"), undefined, "offline 不许记上去");
  assert.equal(recordedTier("skipped"), undefined, "没轮到就是没发生过");
  assert.equal(recordedTier("published"), "published");
  assert.equal(recordedTier("unconfirmed"), "unconfirmed");
  assert.equal(recordedTier("failed"), "failed");

  // 真去读那个文件，别让这条断言只活在注释里。
  const rec = readFileSync(join(ROOT, "src/dev/xhsPublished.ts"), "utf8");
  assert.ok(
    /if \(tier === "offline"\) return;/.test(rec),
    "recordPublish 不再跳过 offline 了 —— 两边的规矩得一起改"
  );
});

test("A3 认不出的 tier 归 unconfirmed（不是 failed），而且不许停整批", () => {
  // 和页面上单点那条路同一个答案（那边印琥珀色的「？认不出的结果」）。
  assert.equal(asQueueState("who-knows"), "unconfirmed");
  assert.equal(asQueueState(""), "unconfirmed");

  // 归成 failed 的话，safeToQueue 会说"可以放心重发" —— 下一批就发重了。
  assert.equal(safeToQueue(asQueueState("who-knows")), false);
  // 也不许让一个认不出的东西把剩下十几条判死。
  assert.equal(stopsQueue(asQueueState("who-knows")), false);

  for (const t of ["published", "unconfirmed", "failed", "offline"] as const) {
    assert.equal(asQueueState(t), t, "认识的那四档要原样带过去");
  }
});

test("A4 收尾那句话每一档各占一段，不许合并成「完成 N 条」", () => {
  const states: QueueEndState[] = [
    "published",
    "published",
    "unconfirmed",
    "failed",
    "skipped",
    "skipped",
    "offline",
  ];
  const s = queueSummary(states);
  for (const [n, what] of [
    ["2", "发出去了"],
    ["1", "不确定"],
    ["1", "没发出去"],
  ] as const) {
    assert.ok(s.includes(what), `收尾没说「${what}」：${s}`);
    assert.ok(s.includes(`${n} 条`), `「${what}」的条数没印：${s}`);
  }
  assert.ok(/没轮到/.test(s), `没轮到那几条被吞了：${s}`);
  // ★ 「不确定」那几条要**催人去看一眼**，不是报个数就完了。
  assert.ok(/去小红书看一眼/.test(s), `unconfirmed 没提示去核对：${s}`);

  // 全绿那一批不许还挂着那句催促 —— 那会让人以为有东西要查。
  assert.ok(!/去小红书看一眼/.test(queueSummary(["published"])));
});

test("A5 一条都没跑成，和「全发出去了」不许长得一样", () => {
  // 按停得早 / 第一条就 offline 的时候会走到这儿。印一句空的「这批完了」
  // 和"七条全成功"在屏幕上是同一个形状。
  const s = queueSummary([]);
  assert.ok(/一条都没发/.test(s), s);
  assert.notEqual(s, queueSummary(["published"]));
});

test("A6 没轮到的三种原因两两不同 —— 后两种不是人自己按的", () => {
  const said = (["stopped", "offline", "transport"] as const).map(skippedLabel);
  assert.equal(new Set(said).size, 3, `三种原因说了同一句话：${said}`);
  assert.ok(/停止/.test(said[0]!), "没说是人按的");
  assert.ok(/没起|没登录/.test(said[1]!), "没说是 server 的问题");
  assert.ok(/dev server/.test(said[2]!), "没说是自己这头断了");
});

test("A7 间隔认不出来回落到默认值，**不是 0**", () => {
  // ⚠ 方向很重要：把一个打错的输入读成"不用等"，正好是这个间隔存在时
  //   最不想要的那个结果（一口气连发）。
  for (const bad of ["", "abc", "-5", "NaN"]) {
    assert.equal(parseGapSeconds(bad), QUEUE_GAP_DEFAULT_SEC, `「${bad}」`);
  }
  assert.equal(parseGapSeconds("0"), 0, "填 0 就是不等，那是个明确的答案");
  assert.equal(parseGapSeconds("45"), 45);
  assert.equal(parseGapSeconds("9999"), QUEUE_GAP_MAX_SEC, "得有上限");
});

test("A8 排队中要带序号 —— 十条「排队中」看不出先后", () => {
  const s = queuedLabel(3, 12);
  assert.ok(s.includes("3"), s);
  assert.ok(s.includes("12"), s);
  assert.notEqual(queuedLabel(1, 12), queuedLabel(2, 12));
});

/* ── B 组：接线 ─────────────────────────────────────────────────────── */

test("B1 判据只有一份 —— 页面不许自己再判一次", () => {
  for (const fn of [
    "stopsQueue(",
    "safeToQueue(",
    "skippedLabel(",
    "queueSummary(",
    "asQueueState(",
    "parseGapSeconds(",
    "recordedTier(",
  ]) {
    assert.ok(SCRIPT.includes(fn), `页面没调 ${fn} —— 多半是自己抄了一份判据`);
  }
  // 页面里不许出现裸的 `=== "offline"` 这种就地判断（那就是第二份判据）。
  assert.ok(
    !/===\s*["']offline["']/.test(SCRIPT),
    "页面里自己比了一次 offline —— 判据应该只有 stopsQueue() 一处"
  );
});

test("B2 队列是**串行**的：上一条回来了才发下一条", () => {
  // 并行会撞上接口那把 running 锁（拿回一串假 409），而且那个接口说不清
  // "失败"到底发出去没有 —— 并发的时候连是哪一条撞了都分不出来。
  assert.ok(/await\s+publishOne\(/.test(SCRIPT), "没有 await，那就不是串行");
  assert.ok(!/Promise\.all/.test(SCRIPT), "用了 Promise.all —— 那是并行");
  assert.ok(
    !/\.map\([^)]*publishOne/.test(SCRIPT),
    "map 里调 publishOne —— 那会一次全发出去"
  );
});

test("B3 单点和批量走**同一个** publishOne（发请求的地方只许有一处）", () => {
  // 各写一份的那天，两条路会慢慢长成两套行为（一边把 403 当 unconfirmed、
  // 另一边当 failed），而屏幕上没有任何一处会说它们不一样。
  const hits = SCRIPT.match(/fetch\(\s*["']\/_xhs\/publish["']/g) ?? [];
  assert.equal(hits.length, 1, `发布请求出现了 ${hits.length} 处，应该只有 1 处`);
});

test("B4 队列跑着的时候，单条那个按钮必须禁掉", () => {
  // 不禁的话点下去撞上接口那把 running 锁，拿回一条 409「上一条还没发完」——
  // 屏幕上是一次凭空的失败，而其实什么都没错。
  assert.ok(/btn\.disabled\s*=\s*busy/.test(SCRIPT), "setBusy 没禁单条按钮");
  // publishOne 收尾也不许无条件放开（那会把 setBusy 刚锁上的解掉）。
  assert.ok(
    /btn\.disabled\s*=\s*wasDisabled/.test(SCRIPT),
    "publishOne 收尾把按钮无条件放开了 —— 队列跑着时它会被解锁"
  );
  assert.ok(
    !/btn\.disabled\s*=\s*false/.test(SCRIPT),
    "有一处把按钮无条件放开了"
  );
});

test("B5 「停止」必须说清它**停不掉正在发的那一条** —— 两处各说一次", () => {
  /**
   * 人默认会以为停止 = 取消，于是以为那条没发出去、回头又发一遍 ——
   * 而这个接口根本说不清它到底发出去没有。
   * ★ 两处**分开钉**：按之前（工具栏那段说明，人是照着它决定要不要按的）
   *   和按之后（按钮自己变成的那句话）。第一版把两处 `或` 在一起断言，
   *   于是删掉任一处都不红 —— 破坏验证当场抓到的。
   */
  assert.ok(
    /正在发的那条/.test(MARKUP),
    "按之前那段说明没提：停止拦不住正在路上的那一条"
  );
  assert.ok(
    /正在发的那条|还在跑完/.test(SCRIPT),
    "按下去之后那个按钮没说正在发的那条还在跑"
  );
});

test("B6 间隔那个数必须自称是猜的", () => {
  // 小红书没公开发帖频率限制，那个 MCP server 的 README 也没说。
  // 把一个猜出来的数印成知识，正是这个项目最忌讳的假确定。
  assert.ok(/是猜的/.test(MARKUP), "页面上没说那个间隔是猜的");
  const plan = readFileSync(join(ROOT, "src/dev/xhsQueuePlan.ts"), "utf8");
  assert.ok(/猜的/.test(plan), "判据文件里也得写着它没有依据");
});

test("B7 默认**一个都不勾** —— 一次误点不许变成十几条真的发出去", () => {
  assert.ok(/data-xhs-check/.test(MARKUP), "卡片上没有勾选框");
  assert.ok(
    !/\bchecked\b/.test(MARKUP),
    "markup 里有 checked —— 打开页面就是全选，一次误点发十几条"
  );
});

test("B8 空的 data-xhs-tier 是「没发过」，不许过 asQueueState", () => {
  // ⚠ 写这个功能时当场踩到：asQueueState("") 返回 unconfirmed，
  //   于是「选没发出去的」会**一张都不勾**，而按钮照常能点、零报错。
  assert.ok(
    !/safeToQueue\(\s*asQueueState\(/.test(SCRIPT),
    "空串被 asQueueState 归成了 unconfirmed —— 那会让「选没发出去的」一张都不勾"
  );
  assert.ok(/raw === ""/.test(SCRIPT), "没有把空属性单独折成 undefined");
});

test("B9 跑完要摊出收尾那句话，还要把没轮到的逐条标出来", () => {
  assert.ok(/say\(\s*queueSummary\(/.test(SCRIPT), "跑完没印收尾那句话");
  assert.ok(
    /note\([^)]*skippedLabel\(/.test(SCRIPT),
    "没轮到的那几条没在卡片上标出来 —— 它们会和「没勾」长得一样"
  );
});
