/**
 * 条目号（`src/config/entryNo.ts`）的测试 —— 地址里那一段数字。
 *
 * 【2026-09-21】换掉了 `autoSlug.test.ts`（「标的-日期时分-智能体-模型」那一套）；
 * 同一天号又从 1 起改成**从 1000 起、至少四位**。
 *
 * 值得测的是那几个**零症状**的错法。每一条用例都对着一个真实的失败模式：
 *   - 按字典序取最大值（`"9999" > "10000"`）→ 下一个号撞在已有条目上 →
 *     后台静默加 `-2` 后缀 → `/r/10000-2`，四处全绿；
 *   - 补豁口 → 一个已经分享出去过的地址指向另一篇内容（`content:prune` 删完老稿
 *     之后豁口是常态）；
 *   - 位数放宽到一位 → `/r/2` 既是"第 2 篇研究稿"又是"研究稿列表第 2 页"
 *     （`[...page].astro` 的 `paginate`），谁先生成谁赢而两边都不报错；
 *   - 盘上有个不是号的文件名时抛错 → 后台那一格永远填不出地址。
 *     那件事该由 `content.config.ts` 的 `generateId` 去红，不是这里。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ENTRY_NO_MIN,
  ENTRY_NO_RE,
  idFromEntryPath,
  isEntryNo,
  nextEntryNo,
} from "../../src/config/entryNo";

// ── 下一个号 ─────────────────────────────────────────────────────────

test("空站从 1000 开始 —— 不是 1（理由在 ENTRY_NO_MIN 上面：分页也是数字地址）", () => {
  assert.equal(nextEntryNo([]), String(ENTRY_NO_MIN));
  assert.equal(nextEntryNo([]), "1000");
});

test("下一个号是最大号 + 1", () => {
  assert.equal(nextEntryNo(["1000", "1001", "1002"]), "1003");
});

test("★ 按数值比，不是按字典序", () => {
  // 字典序的最大值是 "9999"，照它算下一个就是 "10000"，而 "10000" 已经有人了。
  // 后台撞名是**静默**加 -2 后缀，地址变成 /r/10000-2，页面照常打得开。
  assert.equal(nextEntryNo(["9999", "10000"]), "10001");
  assert.equal(nextEntryNo(["1010", "1009", "1002"]), "1011");
  assert.equal(nextEntryNo(["1100", "1099"]), "1101");
});

test("★ 豁口不补 —— 删掉中间那条之后，下一条接着最大号走", () => {
  // 补豁口 = 把那条已经分享出去过的地址发给另一篇内容。
  assert.equal(nextEntryNo(["1000", "1002"]), "1003");
  assert.equal(nextEntryNo(["1002"]), "1003");
});

test("跨集合是同一个号池：四个集合的 id 一起喂进来", () => {
  // 调用方把 posts / qa / guides / prompts 的 id 合成一个数组喂进来。
  assert.equal(
    nextEntryNo(["1000", "1001", "1002", "1003", "1004", "1005", "1006"]),
    "1007"
  );
});

test("认不出的 id 忽略掉，不抛 —— 它跑在后台的表单里", () => {
  // 盘上有个不是号的文件名（迁移没做完 / 有人手写）该由 generateId 去红，
  // 这里抛一次就是后台那一格永远填不出地址。
  assert.equal(nextEntryNo(["1000", "about", "orcl-20260916-1200"]), "1001");
  assert.equal(nextEntryNo(["foo", "bar"]), "1000");
  // 后台撞名加的 -2 后缀不是号（它正是我们要发现的那个坏状态）。
  assert.equal(nextEntryNo(["1007-2"]), "1000");
  assert.equal(nextEntryNo(["1007", "1007-2"]), "1008");
  // ★ 上一轮那些一位数的号也不算 —— 它们早就被改名了，盘上再出现一个就是有人手写。
  assert.equal(nextEntryNo(["7"]), "1000");
});

test("前导零不是号：01007 和 1007 是两个地址、同一个号", () => {
  assert.equal(nextEntryNo(["01007"]), "1000");
  assert.equal(nextEntryNo(["1007", "01007"]), "1008");
});

// ── 什么算一个号 ─────────────────────────────────────────────────────

test("isEntryNo 认的和不认的", () => {
  for (const ok of ["1000", "1007", "9999", "12345"]) {
    assert.equal(isEntryNo(ok), true, ok);
  }
  for (const bad of [
    "0",
    // ★ 一到三位一律不是号：列表页的分页也是数字地址（/r/2 = 第 2 页）。
    //   号从四位起，分页要撞上它得先有 1000 页。
    "1",
    "7",
    "99",
    "999",
    "01007", // 前导零：两个地址、同一个号
    "1007-2", // 后台撞名加的后缀 —— 正是要被发现的那个状态
    "1007.md", // 带扩展名（调用方忘了剥）
    "-1",
    "1.5",
    "",
    " 1007",
    "1007 ",
    "orcl-20260916-1200-spark-gemini-3-pro", // 最早那一套
    "about",
  ]) {
    assert.equal(isEntryNo(bad), false, JSON.stringify(bad));
  }
});

test("ENTRY_NO_RE 是整串匹配，不是「里面有数字就行」", () => {
  // ^ $ 掉了的话 "a1007b" 会通过，而它当文件名完全合法。
  assert.equal(ENTRY_NO_RE.test("a1007"), false);
  assert.equal(ENTRY_NO_RE.test("1007b"), false);
  assert.equal(ENTRY_NO_RE.test("1007-1008"), false);
});

test("★ ENTRY_NO_MIN 和位数要对得上 —— 它们是一对", () => {
  // 改了起点却没改正则（或反过来）的后果：第一条新内容的号自己就不合法，
  // 而那件事要等到 astro dev 同步内容时才炸。
  assert.equal(isEntryNo(String(ENTRY_NO_MIN)), true, "起点本身不是个合法号");
  assert.equal(
    isEntryNo(String(ENTRY_NO_MIN - 1)),
    false,
    "起点减一居然也算号 —— 那位数就白限制了"
  );
});

// ── 文件名 → id ──────────────────────────────────────────────────────

test("idFromEntryPath 剥扩展名和目录", () => {
  assert.equal(idFromEntryPath("1007.md"), "1007");
  assert.equal(idFromEntryPath("1007.mdx"), "1007");
  assert.equal(idFromEntryPath("src/content/posts/1007.md"), "1007");
  // Windows 上 glob 的 entry 可能带反斜杠。
  assert.equal(idFromEntryPath(String.raw`src\content\posts\1007.md`), "1007");
  // 坏文件名原样返回 —— 判断是不是号是 isEntryNo 的事，这里只负责剥。
  assert.equal(idFromEntryPath("1007-2.md"), "1007-2");
  assert.equal(
    idFromEntryPath("open_charles_schwab_account.md"),
    "open_charles_schwab_account"
  );
});
