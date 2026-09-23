/**
 * 组内展示顺序（`src/config/answerOrder.ts` + 后台「回答排序」那一页）。
 *
 * 钉四件事：
 *   ① **空表 = 恒等**。这是新装上这个控件时的样子 —— 没人动它之前，全站每一组的
 *      顺序一个都不许变（稳定排序，而且不改入参）；
 *   ② 有表时：列进来的按表排，**没列进来的排在后面且彼此保持原顺序**（原顺序 = 新在前）；
 *   ③ 坏数据**必须抛**，不许兜成空表 —— 兜了的话"文件坏了"和"还没排过"字节级相同，
 *      而后者是个完成态；
 *   ④ 接线：列表那边（`foldQaGroups`）和两个详情页都用了它，数据文件登记进了
 *      `SCANNED_DATA_FILES`（那张表同时决定 `/_publish` 提交哪些文件 ——
 *      漏了就是"后台排完序、点提交推送、那个文件根本不跟着走"，且零症状）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ANSWER_ORDER,
  answerRankIn,
  parseAnswerOrder,
  sortAnswers,
  sortAnswersWith,
} from "../../src/config/answerOrder";
import { ANSWER_ORDER_FILE, SCANNED_DATA_FILES } from "./inspect";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** 一条内容，只带排序要读的那一格。 */
const e = (id: string, agent?: string) => ({ id, data: { agent } });

test("★ 空表 = 恒等：顺序一个都不变，入参也不动", () => {
  /**
   * ⚠ 表**必须是这里自己造的空表**，不许调读磁盘那份的 `sortAnswers()`。
   *
   * 【2026-09-21 远程构建挂在这条】第一版调的就是 `sortAnswers()`：用例名写着
   * "空表"，而它读的是 `src/data/answerOrder.json` —— **一份人在后台随时会改的
   * 内容**。站长那天在「回答排序」里排了一次（chatgpt / claude / spark），
   * 这条当场红、`pnpm build` 第三步挂掉，**而产品代码一个字都没错**。
   *
   * 这正是 answerOrder.ts 那条"不放进 related.ts"记着的形态（把一张人随时会改的
   * 表拉进纯判据的断言里），只是那次防住了另一个文件、漏了自己这一条。
   * 判据要钉就钉**行为**：空表时是恒等 —— 那跟磁盘上今天排了谁毫无关系。
   */
  const empty = parseAnswerOrder({}, "probe");
  assert.deepEqual(empty.agents, [], "这张探针表本身得是空的");

  const pool = [e("a", "spark"), e("b", "chatgpt"), e("c")];
  const out = sortAnswersWith(empty, pool);
  assert.deepEqual(
    out.map(x => x.id),
    ["a", "b", "c"],
    "还没排过的时候，组内顺序必须原样 —— 一个新加的排序控件不许在没人动它的时候重排全站"
  );
  assert.notEqual(out, pool, "不许把调用方的数组原地排了");
  assert.deepEqual(
    pool.map(x => x.id),
    ["a", "b", "c"],
    "入参被改了"
  );
});

test("sortAnswers() 读的就是磁盘上那张表（不断言表里排了谁）", () => {
  /**
   * 上面那条改成自己造表之后，**没有任何东西再钉"那个不带表的版本到底读没读
   * ANSWER_ORDER"** —— 把它改成 `sortAnswersWith({ agents: [] }, list)`，
   * 全站排序当场失效而测试全绿。这一条补回那个钉子。
   *
   * ★ 探针 pool 从 `ANSWER_ORDER` **自己**倒着造：
   *   表里有东西时这是一条实打实的断言（倒序喂进去必须被排回表的顺序），
   *   表空着时两边都是空数组、退化成恒等。
   *   **自始至终不出现任何一个智能体的名字** —— 那是内容，不是判据。
   */
  const pool = [...ANSWER_ORDER.agents]
    .reverse()
    .map((agent, i) => e(`第${i}条`, agent));

  assert.deepEqual(
    sortAnswers(pool).map(x => x.data.agent),
    [...ANSWER_ORDER.agents],
    "sortAnswers() 排出来的顺序和磁盘上那张表对不上 —— 它是不是没读 ANSWER_ORDER？"
  );
  assert.deepEqual(
    sortAnswers(pool).map(x => x.id),
    sortAnswersWith(ANSWER_ORDER, pool).map(x => x.id),
    "带表的版本和不带表的版本排出了两种结果"
  );
});

test("有表时：列进来的按表排，没列进来的排最后且彼此保持原顺序", () => {
  /**
   * ★ 跑的是**真的** `sortAnswersWith()`，表由这里给 —— 所以既不依赖磁盘上那份
   *   （那是内容，人随时会在后台改），又确实钉着产品代码。
   *
   * ⚠ 这条用例第一版是自己写了一遍名次再 sort 的，于是把 `UNRANKED` 改成 `-1`
   *   （"没排过的反而排最前面"）它照样全绿 —— 测试自己喂了一份判据，
   *   docs/engineering-notes.md 开头 `SC 13D` 那个形态。为此给排序加了一个收表的版本。
   */
  const order = parseAnswerOrder({ agents: ["chatgpt", "spark"] }, "probe");
  assert.deepEqual(order.agents, ["chatgpt", "spark"]);

  const pool = [
    e("新的-spark", "spark"),
    e("旧的-human", "human"),
    e("更旧的-chatgpt", "chatgpt"),
    e("没标的"),
  ];
  assert.deepEqual(
    sortAnswersWith(order, pool).map(x => x.id),
    [
      "更旧的-chatgpt",
      "新的-spark",
      // 这两条都没列进表里 —— 必须排在**后面**，而且相对顺序还是喂进来那个（新在前）
      "旧的-human",
      "没标的",
    ]
  );

  // 名次本身也钉一下：没列进来的必须比任何一个列进来的都大。
  assert.ok(
    answerRankIn(order, undefined) > answerRankIn(order, "spark"),
    "没标智能体的条目跑到前面去了"
  );
  assert.ok(
    answerRankIn(order, "human") > answerRankIn(order, "spark"),
    "没列进表里的智能体跑到前面去了"
  );
  assert.equal(answerRankIn(order, "chatgpt"), 0, "表里第一个的名次必须是 0");
});

test("坏数据必须抛，不许兜成空表", () => {
  assert.throws(() => parseAnswerOrder(null, "p"), /顶层不是对象/);
  assert.throws(() => parseAnswerOrder({ agents: "spark" }, "p"), /不是数组/);
  assert.throws(() => parseAnswerOrder({ agents: [1] }, "p"), /不是字符串/);
  assert.throws(
    () => parseAnswerOrder({ agents: ["spark", "spark"] }, "p"),
    /两次/
  );
});

test("没有 agents 这个键 = 空表（不抛）；孤儿 id 也不抛", () => {
  assert.deepEqual(parseAnswerOrder({}, "p").agents, []);
  // ★ 刻意不核对 id 在不在智能体登记表里：在后台删掉一个智能体之后，
  //   这张表里那一行就成了孤儿 —— 为它抛的话，整个站会因为一条**排序偏好**
  //   构建不出来。孤儿排不到任何东西，天然无害。
  assert.deepEqual(parseAnswerOrder({ agents: ["已经删掉的"] }, "p").agents, [
    "已经删掉的",
  ]);
});

test("当前磁盘上那份读得进来", () => {
  const onDisk = JSON.parse(read(ANSWER_ORDER_FILE));
  assert.doesNotThrow(() => parseAnswerOrder(onDisk, ANSWER_ORDER_FILE));
});

test("接线：列表、两个详情页、数据文件名单、后台那一页，四处都在", () => {
  assert.match(
    read("src/utils/qaGroups.ts"),
    /sortAnswers\(item\.answers\)/,
    "列表卡片那边没排 —— 同一组在列表里和详情页会是两个顺序"
  );
  assert.match(
    read("src/utils/qaGroups.ts"),
    /item\.entry = item\.answers\[0\]/,
    "排完没把 entry 换成新的第一条 —— 折叠卡的标题读 entry、链接却指向 answers[0]，" +
      "会变成'标题印的是 A、点下去跳到 B'，而四处全绿"
  );
  for (const page of [
    "src/pages/q/[...slug]/index.astro",
    "src/pages/r/[...slug]/index.astro",
  ]) {
    assert.match(
      read(page),
      /sortAnswers\(\s*\n?\s*qaSiblings\(/,
      `${page} 里 qaSiblings 没被 sortAnswers 裹住 —— 这一页的切换排和页脚相关条目` +
        `会按时间排，而列表卡片按表排`
    );
  }
  assert.ok(
    SCANNED_DATA_FILES.some(f => f.path === ANSWER_ORDER_FILE),
    "回答排序表没进 SCANNED_DATA_FILES —— 那张表同时决定 /_publish 提交哪些文件，" +
      "漏了的后果是：后台排完序、点提交推送，这个文件根本不跟着走，而且零症状"
  );
  const ks = read("keystatic.config.ts");
  assert.match(ks, /answerOrder: singleton\(\{/, "后台没有「回答排序」那一页");
  assert.match(
    ks,
    /path: "src\/data\/answerOrder"/,
    "后台那一页写的文件路径和 ANSWER_ORDER_FILE 对不上"
  );
});
