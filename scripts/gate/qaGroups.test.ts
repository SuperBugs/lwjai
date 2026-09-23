/**
 * 列表折叠（`src/utils/qaGroups.ts`）的测试。
 *
 * 值得钉的是几个**零症状**的错法：
 *   - 折丢一条（分页数对不上，而页面、构建、闸门三处全绿）
 *   - 组的位置按最旧那条排（新答案沉到第二页，首页看不见）
 *   - 研究稿被当成问答折进去（`posts/foo` 和 `qa/foo` id 相同）
 *   - 第一条（没填键）和后来的（填了它的地址）没归到一组 —— 那正是后台现在的写法
 * 用例喂的都是后台真会写出来的 frontmatter 形状。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { foldQaGroups } from "../../src/utils/qaGroups";

const qa = (id: string, questionKey?: string) => ({
  id,
  collection: "qa",
  data: { questionKey },
});
const post = (id: string) => ({ id, collection: "posts", data: {} });

test("第一条没填键、后来的指向它的地址：折成一项，最新那条打头", () => {
  // 新在前：spark 那条是 9/20 答的，chatgpt 那条是 9/17 的、填的键是 spark 那条的地址
  const spark = qa("q-20260920-0329-chatgpt-gpt-6-pro");
  const chatgpt = qa("q-20260920-0443", "q-20260920-0329-chatgpt-gpt-6-pro");
  const items = foldQaGroups([chatgpt, spark]);
  assert.equal(items.length, 1, "同一个问题两条回答应当只占一项");
  assert.equal(items[0].entry.id, chatgpt.id, "代表是最新那条（喂进来排最前的）");
  assert.deepEqual(
    items[0].answers.map(e => e.id),
    [chatgpt.id, spark.id],
    "组里的顺序就是喂进来的顺序（新在前）"
  );
});

test("几条都填同一个键（老写法）也是一组；不同键各归各的", () => {
  const items = foldQaGroups([
    qa("a-claude", "tsla-margin"),
    qa("b-other", "nvda-capex"),
    qa("a-spark", "tsla-margin"),
    qa("a-codex", "tsla-margin"),
  ]);
  assert.deepEqual(
    items.map(i => i.answers.map(e => e.id)),
    [["a-claude", "a-spark", "a-codex"], ["b-other"]]
  );
});

test("折是无损的：answers 加起来等于喂进来的条数，没填键也没人指向的每条各占一项", () => {
  const input = [qa("x"), qa("y"), qa("z", "x"), qa("w")];
  const items = foldQaGroups(input);
  assert.equal(
    items.reduce((n, i) => n + i.answers.length, 0),
    input.length
  );
  assert.deepEqual(
    items.map(i => i.entry.id),
    ["x", "y", "w"],
    "z 指向 x，折进 x 那一项；其余各自一项，顺序不变"
  );
});

test("组占第一次出现的位置：新答案把整组顶到前面，不沉到最旧那条的位置", () => {
  const items = foldQaGroups([
    qa("new-answer", "old-question"),
    post("some-post"),
    qa("unrelated"),
    qa("old-question"),
  ]);
  assert.deepEqual(
    items.map(i => i.entry.id),
    ["new-answer", "some-post", "unrelated"]
  );
});

test("研究稿不折：posts/foo 和 qa/foo 只是 id 相同，不是一组", () => {
  const items = foldQaGroups([post("foo"), qa("foo"), post("bar")]);
  assert.equal(items.length, 3);
  assert.deepEqual(
    items.map(i => [i.entry.collection, i.answers.length]),
    [
      ["posts", 1],
      ["qa", 1],
      ["posts", 1],
    ]
  );
});

test("键两头的空白不算数（和 qaGroupKey 同一个口径）", () => {
  const items = foldQaGroups([qa("b", " a "), qa("a")]);
  assert.equal(items.length, 1);
});

test("空列表折出来还是空，不抛", () => {
  assert.deepEqual(foldQaGroups([]), []);
});

/**
 * 【2026-09-20】研究稿也折。下面两条钉的是**把判据铺到第二个集合时新开的两条路**：
 * 研究稿要真的折，而同名的研究稿和问答**不许**折进同一张卡。
 */
test("研究稿也折：同一个选题的几份研究占一项", () => {
  const root = { id: "orcl-20260916-spark", collection: "posts", data: {} };
  const claude = {
    id: "orcl-20260917-claude",
    collection: "posts",
    data: { questionKey: "orcl-20260916-spark" },
  };
  const items = foldQaGroups([claude, root]);
  assert.equal(items.length, 1, "同一个选题两份研究应当只占一项");
  assert.deepEqual(
    items[0].answers.map(e => e.id),
    [claude.id, root.id]
  );
});

test("同名的研究稿和问答不许折进同一张卡（键要带集合前缀）", () => {
  // 后台写的是扁平文件：posts/foo 和 qa/foo 的 id 一模一样。
  // 不加前缀的话这两条会被折成一项，而列表页、构建、测试四处全绿 ——
  // 卡上只是多出一行不相干的东西。
  const research = { id: "foo", collection: "posts", data: {} };
  const answer = { id: "foo", collection: "qa", data: {} };
  const items = foldQaGroups([research, answer]);
  assert.equal(items.length, 2, "两个集合的同名条目是两项");
  assert.deepEqual(
    items.map(i => i.entry.collection),
    ["posts", "qa"]
  );
});

test("教程 / 提示词不参与折叠：一条一项，原样穿过", () => {
  const g = { id: "broker-ibkr-open", collection: "guides", data: {} };
  const p = { id: "stock-analysis", collection: "prompts", data: {} };
  const items = foldQaGroups([g, p]);
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map(i => i.answers.length),
    [1, 1]
  );
});
