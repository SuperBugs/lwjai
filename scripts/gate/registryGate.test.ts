/**
 * **不按篇算的那几份数据文件**（`SCANNED_DATA_FILES`：智能体与模型登记表
 * src/data/registry.json、【2026-09-21 加的】标签表 src/data/tags.json）**过闸**的测试。
 *
 * 【2026-09-20】登记表从代码挪进后台可编辑的 JSON 之后，name / vendor / note 变成了
 * 人手填的自由文本，而它们上公网；标签表同理（人在后台打的词，渲染在卡片、详情页、
 * /t 两级页面上）。这里钉三件事：
 *   1. inspectDataJson 真的能从 JSON 里把字捞出来交给 scan()——用一句模型 / 人
 *      真的会写的话（把内部系统名抄进说明），看它红不红；
 *   2. 三道闸（构建期、暂存区、dev 预览页）都引用了 SCANNED_DATA_FILES 和
 *      inspectDataJson —— 少一道，那几份表就能从那一道安静地穿过去
 *      （docs/gate.md 第 7 节那个形态）；
 *   3. **每一份数据文件都真的在那张名单里**。这一条是 2026-09-21 加标签表那天
 *      长出来的：三道闸原来各写着一段只认 registry 的代码，加第二份数据文件时
 *      漏掉任何一处的症状是零 —— 那个文件安静地穿过那道闸，屏幕上照常印绿 ✓。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ANSWER_ORDER_FILE,
  inspectDataJson,
  REGISTRY_FILE,
  SCANNED_DATA_FILES,
  SYMBOLS_FILE,
  TAGS_FILE,
} from "./inspect";
import { COMMUNITY_FILE } from "../../src/config/collections";

const read = (p: string) => readFileSync(p, "utf8");
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("登记表里一句抄进来的内部系统名，闸门要拦（block 档）", () => {
  const leaking = JSON.stringify({
    agents: [
      {
        id: "spark",
        name: "Google Spark",
        vendor: "Google",
        // 模型会把上下文里的路径原样抄进输出，人也会顺手把它粘进说明栏。
        note: "跑在 example_server 上，结果直接写进 private.db",
      },
    ],
    models: [],
  });
  const r = inspectDataJson(REGISTRY_FILE, leaking);
  assert.ok(
    r.blocked.some(h => h.code === "internal_system"),
    `没拦下 internal_system：${JSON.stringify(r)}`
  );
  assert.equal(r.isDraft, false, "登记表没有草稿这一档");
});

test("标签表里一个夹带持仓的标签，闸门一样要拦", () => {
  // 「我的持仓复盘」正是人真的会随手加进标签表的那种词（inspect.ts 里
  // 「tags 也要扫」那条注释举的就是它）。
  const leaking = JSON.stringify({ tags: ["财报", "我持有的票"] });
  const r = inspectDataJson(TAGS_FILE, leaking);
  assert.ok(
    r.blocked.length > 0,
    `标签表没过闸门那一关：${JSON.stringify(r)}`
  );
});

/**
 * 【2026-09-22 标的表那天搬过来的】公司中英文名原来是**条目上**的两格自由文本
 * （`symbolName` / `symbolNameEn`），由 `inspect()` 的 subject 白名单扫；
 * 标的那一格改成多选之后名字搬进了这张表，扫它的路径也就跟着换成了这一条。
 *
 * ★ 语料一个字都没改，还是 `coverage.test.ts` 里那两条用的那个真实填法：
 *   **从上游那套系统粘过来时，连括号里的来源备注一起粘进去**。
 *   漏扫的症状是零 —— 页面照印公司名，闸门照常报「✓ 没命中已知的危险说法」。
 */
test("标的表里一个夹带内部系统名的公司名，闸门要拦", () => {
  const leaking = JSON.stringify({
    symbols: [
      { code: "TSLA", name: "特斯拉（example_server 自动带出的中文名）" },
    ],
  });
  const r = inspectDataJson(SYMBOLS_FILE, leaking);
  assert.ok(
    r.blocked.some(h => h.code === "internal_system"),
    `标的表没过闸门那一关：${JSON.stringify(r)}`
  );

  // 英文名那一格同一副形状 —— 别的系统导出的表里那一列就叫 "Tesla, Inc."。
  const leakingEn = JSON.stringify({
    symbols: [
      { code: "TSLA", nameEn: "Tesla, Inc.（example_client 导出的名字）" },
    ],
  });
  assert.ok(
    inspectDataJson(SYMBOLS_FILE, leakingEn).blocked.some(
      h => h.code === "internal_system"
    ),
    "英文名那一格没被扫到"
  );
});

test("干净的表：不命中，而且当前磁盘上那两份就是干净的", () => {
  const clean = JSON.stringify({
    agents: [{ id: "codex", name: "OpenAI Codex", vendor: "OpenAI", note: "" }],
    models: [{ id: "gpt-6-pro", name: "GPT-6-Pro", vendor: "OpenAI", note: "" }],
  });
  const r = inspectDataJson(REGISTRY_FILE, clean);
  assert.equal(r.blocked.length, 0);
  assert.equal(r.warnings.length, 0);

  for (const f of SCANNED_DATA_FILES) {
    const onDisk = inspectDataJson(f.path, read(f.path));
    assert.equal(
      onDisk.blocked.length,
      0,
      `${f.label}（${f.path}）命中了：${JSON.stringify(onDisk.blocked)}`
    );
  }
});

test("不是合法 JSON 要抛，不许当成空表通过", () => {
  assert.throws(
    () => inspectDataJson(REGISTRY_FILE, "{ agents: ["),
    /不是合法 JSON/
  );
});

test("名单里几份都在，路径只在 collections.ts 写一份", () => {
  assert.equal(REGISTRY_FILE, "src/data/registry.json");
  assert.equal(TAGS_FILE, "src/data/tags.json");
  assert.equal(SYMBOLS_FILE, "src/data/symbols.json");
  assert.equal(ANSWER_ORDER_FILE, "src/data/answerOrder.json");
  assert.equal(COMMUNITY_FILE, "src/data/community.json");
  assert.deepEqual(
    SCANNED_DATA_FILES.map(f => f.path),
    [REGISTRY_FILE, TAGS_FILE, SYMBOLS_FILE, ANSWER_ORDER_FILE, COMMUNITY_FILE],
    "数据文件名单变了 —— 加了一份就得确认三道闸都跟着扫（下面那条会查引用，但查不出你少登记了一份）"
  );
  for (const f of SCANNED_DATA_FILES) {
    assert.ok(f.label.trim().length > 0, `${f.path} 没有中文标签，报表里没法称呼它`);
  }
});

test("三道闸都引用了 SCANNED_DATA_FILES 和 inspectDataJson", () => {
  for (const p of [
    "scripts/gate/check.ts",
    "scripts/gate/check-staged.ts",
    "src/dev/gate.astro",
  ]) {
    const src = stripComments(read(p));
    assert.match(
      src,
      /inspectDataJson\(/,
      `${p} 没扫数据文件 —— 这一道闸登记表 / 标签表能安静穿过`
    );
    assert.match(
      src,
      /SCANNED_DATA_FILES/,
      `${p} 没用 SCANNED_DATA_FILES，名单是自己写的 —— 加第三份数据文件时它会漏掉`
    );
    for (const f of SCANNED_DATA_FILES) {
      assert.ok(
        !new RegExp(f.path.replace(/[.\\/]/g, "\\$&")).test(src),
        `${p} 里手写了 ${f.path} —— 路径只许在 src/config/collections.ts 写一份`
      );
    }
  }
});

test("/_publish 把这几份表当内容一起提交（否则后台改了标签点发布它不跟着走）", async () => {
  const { isContentPath } = await import("../../src/dev/publishPlan");
  for (const f of SCANNED_DATA_FILES) {
    assert.ok(isContentPath(f.path), `${f.label}（${f.path}）不会随发布提交`);
  }
  assert.ok(!isContentPath("src/data/tags.json.bak"), "只认那一条路径本身");
});
