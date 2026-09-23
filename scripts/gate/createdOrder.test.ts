/**
 * 列表的先后（`src/utils/createdOrder.ts` + `getSortedPosts()`）：**按创建时间，新建的在前**。
 *
 * 【2026-09-23 用户要的】原话「研究、问答、教程等都应该是按照创建时间倒序展示，
 * 不应该是更新时间，即优先展示新创建的」。
 *
 * 值得钉的都是**零症状**的错法 —— 排错了页面照常生成，只是顺序不对：
 *   A 判据本身：带着 `modDatetime` 的真实形状喂进去，改过的老稿子不许往前跳；
 *     同一分钟建的按条目号；读不出的时间沉底、不许把比较函数弄出 NaN。
 *   B 折叠之后（/r、/q 看到的就是这一层）：组的位置跟着组里**最新建的**那条走。
 *   C 接线：`getSortedPosts` 真的走这条判据；RSS 的 pubDate、列表卡片上印的
 *     日期是**同一个**创建时间 —— 排序换了而卡片还印更新时间，一列日期看起来就是乱的。
 *   D 上游那句 `modDatetime ?? pubDatetime` 只许留在 `lastModified.ts`（那是
 *     "最后什么时候改过"的判据）。这个站刻意保留上游的结构、好把上游的改动合过来 ——
 *     合 `getSortedPosts.ts` 那天，最容易被原样冲回去的就是这一句。
 *
 * 用例里的时间照抄盘上真实稿子的 frontmatter（研究稿 1002 / 1027 / 1030 / 1034，
 * 提示词 1000 / 1001），但**不读盘**：内容明天就会变，判据不该跟着红
 * （answerOrder.test.ts 开头记着那一次）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  newestCreatedFirst,
  sortNewestCreated,
} from "../../src/utils/createdOrder";
import { foldQaGroups } from "../../src/utils/qaGroups";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
/** 先剥注释再查（同 chips.test.ts）：这几份文件的注释里正写着 `modDatetime`。 */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

/** 一条内容，形状照 content collection 解析完的样子（`modDatetime` 该有的都带着）。 */
const entry = (
  collection: string,
  id: string,
  pub: string,
  mod?: string,
  questionKey = ""
) => ({
  id,
  collection,
  data: {
    pubDatetime: new Date(pub),
    modDatetime: mod ? new Date(mod) : undefined,
    questionKey,
  },
});
const ids = (list: readonly { id: string }[]) => list.map(e => e.id);

// ── A 判据本身 ──────────────────────────────────────────────────────────

test("★ A1 改过的老稿子不往前跳（研究稿 1002：09-16 建、09-22 改）", () => {
  /**
   * 换之前的真实症状：/r 上 1002 那一组排第三，压在好几组 09-21、09-22 才建的上面 ——
   * 它 09-22 20:24 改过一次，而上游按 `modDatetime ?? pubDatetime` 排。
   * 按旧规矩这四条是 1034 / 1002 / 1027 / 1030，按新规矩 1002 垫底。
   */
  const pool = [
    entry("posts", "1002", "2026-09-16T12:00:00.000Z", "2026-09-22T12:24:00.000Z"),
    entry("posts", "1027", "2026-09-22T03:02:00.000Z", "2026-09-22T11:29:00.000Z"),
    entry("posts", "1030", "2026-09-22T08:29:00.000Z"),
    entry("posts", "1034", "2026-09-22T13:21:00.000Z"),
  ];
  assert.deepEqual(ids(sortNewestCreated(pool)), ["1034", "1030", "1027", "1002"]);
});

test("A2 平铺的列表也一样（提示词 1000：09-11 建、09-23 改；1001：09-15 建）", () => {
  // /p 是平铺的，一眼就看得出：按旧规矩 1000 在前、卡片上印着 09/23，
  // 按新规矩 1001 在前。
  const pool = [
    entry("prompts", "1000", "2026-09-11T12:00:00.000Z", "2026-09-23T02:47:00.000Z"),
    entry("prompts", "1001", "2026-09-15T12:00:00.000Z"),
  ];
  assert.deepEqual(ids(sortNewestCreated(pool)), ["1001", "1000"]);
});

test("A3 同一分钟建的两条：号大的（后建的）在前，而且按数值不按字典序", () => {
  const t = "2026-09-22T08:29:00.000Z";
  assert.deepEqual(
    ids(sortNewestCreated([entry("posts", "1030", t), entry("posts", "1031", t)])),
    ["1031", "1030"]
  );
  // 字典序下 "10000" < "9999"，那样号过万的那天并列的两条会反过来。
  assert.deepEqual(
    ids(sortNewestCreated([entry("qa", "9999", t), entry("qa", "10000", t)])),
    ["10000", "9999"]
  );
});

test("A4 读不出的时间沉到最后；比较函数永远不给 NaN", () => {
  const good = { id: "1001", pubDatetime: "2026-09-15T12:00:00.000Z" };
  const empty = { id: "1005", pubDatetime: "" };
  const junk = { id: "1003", pubDatetime: "昨天下午" };
  const sorted = [empty, good, junk].sort(newestCreatedFirst);
  assert.deepEqual(ids(sorted), ["1001", "1005", "1003"], "坏的两条沉底，彼此之间按号");
  for (const a of [good, empty, junk]) {
    for (const b of [good, empty, junk]) {
      assert.ok(
        !Number.isNaN(newestCreatedFirst(a, b)),
        `${a.id} vs ${b.id} 给了 NaN —— sort 会把它当成"相等"，坏数据被随手插在中间`
      );
    }
  }
});

test("A5 Date 和 ISO 串是同一个时刻（站上拿到 Date，后台扫盘拿到串）", () => {
  const iso = "2026-09-23T02:52:00.000Z";
  assert.equal(
    newestCreatedFirst({ id: "1037", pubDatetime: new Date(iso) }, { id: "1037", pubDatetime: iso }),
    0
  );
  assert.ok(
    newestCreatedFirst(
      { id: "1036", pubDatetime: "2026-09-23T02:50:00.000Z" },
      { id: "1037", pubDatetime: new Date(iso) }
    ) > 0,
    "早两分钟建的那条应该排在后面"
  );
});

test("A6 返回新数组，不动入参", () => {
  const pool = [
    entry("posts", "1002", "2026-09-16T12:00:00.000Z"),
    entry("posts", "1034", "2026-09-22T13:21:00.000Z"),
  ];
  const out = sortNewestCreated(pool);
  assert.notEqual(out, pool);
  assert.deepEqual(ids(pool), ["1002", "1034"], "入参被原地排了");
});

// ── B 折叠之后 ──────────────────────────────────────────────────────────

test("★ B1 折叠卡的位置跟着组里最新建的那条走，改过的老组不往前跳", () => {
  /**
   * /r、/q 上看到的是这一层：`foldQaGroups(getSortedPosts(...))`。
   * 1002 那一组（1002 + 1011）里最新建的是 1011（09-21 09:01），
   * 所以它排在 1030 那一组（1031 是 09-22 08:32 建的）后面 —— 不管 1002 哪天改过。
   *
   * ⚠ 只比**每组有哪几条**，不比组内顺序：组内顺序归后台「回答排序」那张表管
   *   （src/data/answerOrder.json，人随时会改），那不是这里要钉的东西。
   */
  const pool = [
    entry("posts", "1002", "2026-09-16T12:00:00.000Z", "2026-09-22T12:24:00.000Z"),
    entry("posts", "1011", "2026-09-21T09:01:00.000Z", undefined, "1002"),
    entry("posts", "1030", "2026-09-22T08:29:00.000Z"),
    entry("posts", "1031", "2026-09-22T08:32:00.000Z", undefined, "1030"),
  ];
  const groups = foldQaGroups(sortNewestCreated(pool)).map(item =>
    ids(item.answers).sort()
  );
  assert.deepEqual(groups, [
    ["1030", "1031"],
    ["1002", "1011"],
  ]);
});

// ── C 接线 ──────────────────────────────────────────────────────────────

test("C1 getSortedPosts 走的是 sortNewestCreated，自己不碰 modDatetime", () => {
  const code = stripComments(read("src/utils/getSortedPosts.ts"));
  assert.match(
    code,
    /return\s+sortNewestCreated\(\s*posts\.filter\(\s*postFilter\s*\)\s*\)/,
    "getSortedPosts 没把过滤完的条目交给 sortNewestCreated —— 全站的列表顺序不归这条判据管了"
  );
  assert.doesNotMatch(code, /modDatetime/, "getSortedPosts 又读起更新时间了");
  assert.doesNotMatch(code, /\.sort\(/, "getSortedPosts 里另写了一份排序");
});

test("C2 RSS 的 pubDate 是创建时间 —— 阅读器按它自己排，和站上的顺序得是同一个键", () => {
  const code = stripComments(read("src/utils/feedItems.ts"));
  assert.match(code, /pubDate:\s*new Date\(\s*data\.pubDatetime\s*\)/);
  assert.doesNotMatch(
    code,
    /modDatetime/,
    "feedItems 又读起更新时间了：改过一个字的老稿子在阅读器里会变成最新一条"
  );
});

test("C3 列表卡片印的是创建时间：Card.astro 一处都不读 modDatetime", () => {
  /**
   * 列表按创建时间排，卡片上印更新时间的话，改过的老稿子印着新日期、却排在后面 ——
   * 一列日期看起来是乱序的（/p 上就是 09/15 在 09/23 上面）。
   * 单条卡和折叠卡每一行各有一个 `<Datetime>`，两处都得是创建时间。
   */
  const code = stripComments(read("src/components/Card.astro"));
  const tags = code.match(/<Datetime\b[\s\S]*?\/>/g) ?? [];
  assert.ok(tags.length >= 2, `Card.astro 里只找到 ${tags.length} 个 <Datetime>（单条卡 + 折叠卡每一行，应该是两处）`);
  for (const tag of tags) {
    assert.match(tag, /pubDatetime/, `这个 <Datetime> 没传创建时间：${tag}`);
  }
  assert.doesNotMatch(code, /modDatetime/, "Card.astro 又读起更新时间了");
});

// ── D 上游那一句 ────────────────────────────────────────────────────────

test("D1 `modDatetime ??` 只许出现在 lastModified.ts（合上游时最容易被冲回来的一句）", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|astro)$/.test(name)) files.push(p);
    }
  };
  walk(join(ROOT, "src"));
  assert.ok(files.length > 50, `src/ 下只扫到 ${files.length} 个文件 —— 路径不对，这条会空转着绿`);
  /**
   * ⚠ 这里**不能**用 stripComments：src/dev 下有 glob 串（`posts/*.md`），那个朴素的
   *   去注释函数会从串里的「斜杠星号」一口吃到下一个注释结尾 —— 这是一条"不许出现"的
   *   断言，被吃掉的那一段会空转着绿（agentIcons.test.ts 记着同一件事）。
   *   所以一行一行看、只跳过注释行：误报的方向是红，不是绿。
   */
  const isCode = (line: string) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line);
  const hits = files
    .filter(p =>
      readFileSync(p, "utf8")
        .split("\n")
        .some(line => isCode(line) && /modDatetime\s*\?\?/.test(line))
    )
    .map(p => relative(ROOT, p).replaceAll("\\", "/"));
  assert.deepEqual(
    hits.filter(p => p !== "src/config/lastModified.ts"),
    [],
    "按「最后更新」取时间的只该有 lastModified.ts 一处（sitemap / JSON-LD 用）。" +
      "别处出现这一句，多半是列表又按更新时间排了 —— 该用 src/utils/createdOrder.ts"
  );
});
