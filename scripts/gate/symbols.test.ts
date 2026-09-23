/**
 * 标的表（`src/data/symbols.json` + `src/config/symbols.ts`）的测试。
 * 【2026-09-22 用户要的多选那天立的】
 *
 * 用户那句话是「问答添加文章的时候…还可以 label list group 选择多个标的，
 * 因为一个问答可能涉及多个标的」。落成两件事：**一张封闭的标的表**（多选必须有
 * 选项表）＋ **公司名从条目上搬进那张表**（一格勾三只票，名字没处逐只填）。
 *
 * 值得钉的都是**零症状**的错法：
 *   A 表本身：读不进来被当成空表、`BRK.B` 和 `BRK-B` 两行抢同一个 /s 地址
 *   B 判据：`unknownSymbols` 放宽成归一比对（构建绿、后台打不开）
 *   C 自动登记：导入口把表外的代码丢掉（那条内容就从 /s 上消失了）
 *   D 接线：两个集合的那一格、后台那一页、三道闸 —— 少一处都不报错
 *
 * ★ 裸 tsx 跑：这里只 import 零 astro import 的那几个模块。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseSymbols,
  symbolOptionLabel,
  symbolOptions,
  symbolNames,
  SYMBOLS,
  SYMBOL_CODES,
  unknownSymbols,
  unknownSymbolsMessage,
  withSymbolRow,
} from "../../src/config/symbols";
import { symbolKey } from "../../src/config/symbol";
import { SCANNED_DATA_FILES, SYMBOLS_FILE } from "../../src/config/collections";

const abs = (p: string) => join(process.cwd(), ...p.split("/"));
const read = (p: string) => readFileSync(abs(p), "utf8");
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

// ── A. 表本身 ─────────────────────────────────────────────────────────

test("磁盘上那份能读进来，而且不是空表", () => {
  assert.ok(SYMBOLS.length > 0, "标的表是空的 —— 后台那一格会一只票都勾不出来");
  for (const row of SYMBOLS) {
    assert.match(row.code, /^[A-Z]{1,5}(?:[.-][A-Z]{1,2})?$/, row.code);
  }
});

test("坏表一律抛，不许被当成空表通过", () => {
  // ★ 每一条都实跑过：不故意破坏一次，"必须抛"那条用例永远绿（docs/engineering-notes.md 坑 17）。
  const bad: [string, unknown][] = [
    ["顶层不是对象", "["],
    ["symbols 不是数组", { symbols: "ARM" }],
    ["行不是对象", { symbols: ["ARM"] }],
    ["没填代码", { symbols: [{ name: "Arm" }] }],
    ["代码不像代码", { symbols: [{ code: "特斯拉" }] }],
    ["代码重复", { symbols: [{ code: "ARM" }, { code: "ARM" }]}],
    [
      "两种写法抢同一个地址",
      { symbols: [{ code: "BRK.B" }, { code: "BRK-B" }] },
    ],
  ];
  for (const [why, input] of bad) {
    assert.throws(
      () => parseSymbols(input, "（测试）"),
      /标的表坏了/,
      `「${why}」这一档没抛 —— 一张读不进来的表被当成空表，站上每条内容的标的会一起变成"表里没有"`
    );
  }
});

test("名字空着 = 不知道（不是报错），空串折成没有这个键", () => {
  const rows = parseSymbols({
    symbols: [
      { code: "CRWV" }, // 名字都没填 —— 站上真有这一档
      { code: "ORCL", name: "  甲骨文  ", nameEn: "" },
    ],
  });
  assert.deepEqual(rows[0], { code: "CRWV" });
  assert.deepEqual(rows[1], { code: "ORCL", name: "甲骨文" });
});

// ── B. 判据 ───────────────────────────────────────────────────────────

test("unknownSymbols 是**字面量**比对，不走归一（构建绿、后台打不开最难查）", () => {
  const inTable = SYMBOL_CODES[0]!;
  assert.deepEqual(unknownSymbols([inTable]), []);
  assert.deepEqual(unknownSymbols(["ZZZZ"]), ["ZZZZ"]);
  // ★ 大小写 / 点连字符的变体**必须算"表里没有"**：后台那一格是从表里勾的，
  //   放宽的话手写一个变体能过构建，而那一条在后台打不开（multiselect 的 parse 直接抛）。
  assert.deepEqual(unknownSymbols([inTable.toLowerCase()]), [
    inTable.toLowerCase(),
  ]);
  const msg = unknownSymbolsMessage(["ZZZZ"]);
  assert.ok(msg.includes("ZZZZ") && msg.includes("标的"), msg);
});

test("findSymbolRow / symbolNames 反过来**走归一** —— 查得到就用表里的名字", () => {
  const row = SYMBOLS.find(s => s.name)!;
  assert.equal(symbolNames(row.code).name, row.name);
  assert.equal(symbolNames(row.code.toLowerCase()).name, row.name);
  // 表里没有的：只有代码，**不编名字**（站上那张芯片就只印代码）。
  assert.deepEqual(symbolNames("ZZZZ"), {
    code: "ZZZZ",
    name: undefined,
    nameEn: undefined,
  });
});

test("后台那一格的标签带着名字（一列光代码认不出是哪家）", () => {
  assert.equal(symbolOptionLabel({ code: "ORCL", name: "甲骨文" }), "ORCL 甲骨文");
  // 名字没填就只有代码 —— **不补一个「未命名」**，那是在给"还没填"发明一个名字。
  assert.equal(symbolOptionLabel({ code: "CRWV" }), "CRWV");
  assert.equal(symbolOptions().length, SYMBOLS.length);
  assert.deepEqual(
    symbolOptions().map(o => o.value),
    SYMBOL_CODES,
    "选项的值必须原样是代码（存进 frontmatter 的就是它）"
  );
});

// ── C. 自动登记（导入口那条路）────────────────────────────────────────

test("withSymbolRow：加在最后、幂等、不改入参", () => {
  const before = { symbols: [{ code: "ARM", name: "Arm" }] };
  const after = withSymbolRow(before, { code: "INTC", name: "英特尔" }) as {
    symbols: { code: string; name?: string }[];
  };
  assert.deepEqual(after.symbols.map(s => s.code), ["ARM", "INTC"]);
  assert.deepEqual(
    before.symbols.map(s => s.code),
    ["ARM"],
    "改了入参 —— 调用方手里那份会跟着变"
  );
  // 幂等：已经有了就原样返回（大小写 / 点连字符的变体也算"已经有了"）。
  assert.equal(withSymbolRow(after, { code: "INTC" }), after);
  assert.equal(withSymbolRow(after, { code: "intc" }), after);
});

test("导入口是**登记**不是丢掉 —— 和标签刻意相反", () => {
  // 这条钉的是"两条路的判据都在，而且不是同一种处理"。
  const plan = stripComments(read("scripts/content/importPlan.ts"));
  assert.match(plan, /unknownSymbols/, "导入口没查标的表");
  assert.match(plan, /newSymbols/, "没把表外的那几只交给 I/O 层登记");
  assert.ok(
    /已经替你加进去了/.test(plan),
    "登记了却不在报告里说一句 —— 那次导入会在 git 里多改一个文件而没人知道为什么"
  );
  // 两个写盘口读同一份 withSymbolRow（各写一份 = 两条路长出两种表结构）。
  for (const p of ["scripts/content/import.ts", "src/dev/import-run.ts"]) {
    assert.match(
      stripComments(read(p)),
      /registerSymbols/,
      `${p} 没登记新标的 —— 那条草稿会在后台打不开、构建也红`
    );
  }
  assert.match(
    stripComments(read("scripts/content/registerSymbols.ts")),
    /withSymbolRow/,
    "登记那一步另写了一份"
  );
});

// ── D. 接线（少一处都不报错）──────────────────────────────────────────

test("两个集合的那一格都走 symbolsField()，研究稿带着「至多一只」的上限", () => {
  const src = stripComments(read("src/content.config.ts"));
  const uses = [...src.matchAll(/^\s+symbols:\s*symbolsField\(([^)]*)\)/gm)].map(
    m => m[1]!.trim()
  );
  assert.deepEqual(
    uses,
    ["1", ""],
    "posts 必须是 symbolsField(1)（至多一只主标的）、qa 必须不带上限（一条问答可以讲好几只）"
  );
  // ★ 判据只有 unknownSymbols 一处：在 schema 里另写一份 includes 就是
  //   "后台说这只票不存在、构建说没问题"的那天。
  assert.match(src, /unknownSymbols/);
  assert.ok(
    !/SYMBOL_CODES\.includes/.test(src),
    "schema 里另写了一份成员判定"
  );
});

test("后台：那一格是多选（不是文本框），选项来自标的表", () => {
  const src = stripComments(read("keystatic.config.ts"));
  assert.match(
    src,
    /symbolsField = \([\s\S]{0,400}?fields\.multiselect\(/,
    "标的那一格不是 fields.multiselect —— 用户要的就是那排可勾的药丸"
  );
  assert.match(src, /options: symbolOptions\(\)/);
  assert.equal(
    [...src.matchAll(/^\s+symbols: symbolsField\(/gm)].length,
    2,
    "研究稿和问答那两格必须都走同一个工厂"
  );
  // 后台「标的」那一页写的就是站上读的那份文件。
  assert.match(
    src,
    /path: "src\/data\/symbols"/,
    "后台那一页写的不是 src/data/symbols.json"
  );
  assert.equal(SYMBOLS_FILE, "src/data/symbols.json");
  // 条目上那三格必须真的没了（留着 = 两处来源，而且新那处闸门不扫）。
  for (const dead of ["symbolName:", "symbolNameEn:"]) {
    assert.ok(!src.includes(dead), `keystatic.config.ts 里还留着 ${dead}`);
  }
});

/**
 * 后台「选了一组就把标的带过来」那段脚本（`src/dev/keystaticGroupFill.ts`）
 * 认那一格**只能靠标签文字** —— 2026-09-22 在浏览器里实测：Keystar 的 CheckboxGroup
 * 不往 `input.value` 上放选项的值（每个框都是默认的 `"on"`）。
 *
 * ★ 所以后台那一格的 options 和喂给脚本的 options **必须是同一份**。
 *   各写一份的症状是：选了组，标题带过来了、标的一格没动，而后台、构建、测试四处全绿。
 */
test("自动填：后台那一格和脚本读的是同一份 symbolOptions()", () => {
  const src = stripComments(read("keystatic.config.ts"));
  assert.match(
    src,
    /const CARRY_MULTI = \{ symbols: symbolOptions\(\) \}/,
    "喂给自动填脚本的选项不是 symbolOptions() —— 标签文字对不上，那一格就再也认不出来了"
  );
  const fill = stripComments(read("src/dev/keystaticGroupFill.ts"));
  assert.match(fill, /byLabel/, "脚本不按标签文字认那一格了？");
  assert.ok(
    !/values\.has\(box\.value\)/.test(fill),
    "又加回了按 input.value 认的兜底 —— 实测过：Keystar 不往上面放值，那条永远不命中"
  );
});

test("这张表上公网，所以在 SCANNED_DATA_FILES 里（少这一行 = 公司名从三道闸底下走掉）", () => {
  const listed = SCANNED_DATA_FILES.find(f => f.path === SYMBOLS_FILE);
  assert.ok(listed, "标的表不在名单里");
  assert.ok(listed!.label.trim().length > 0, "没有中文标签，报表里没法称呼它");
});

test("站上每一条用着的代码都在表里（表里删了 / 改了会在这里先红）", () => {
  const dirs = ["src/content/posts", "src/content/qa"];
  const used = new Map<string, string>();
  for (const dir of dirs) {
    for (const name of readdirSync(abs(dir))) {
      if (!name.endsWith(".md") || name.startsWith("_")) continue;
      const raw = read(`${dir}/${name}`);
      const front = /^---\n([\s\S]*?)\n---/.exec(raw)?.[1] ?? "";
      const block = /^symbols:\s*$([\s\S]*?)^(?=\S|$)/m.exec(front)?.[1] ?? "";
      for (const m of block.matchAll(/^\s+-\s+(.+?)\s*$/gm)) {
        used.set(m[1]!.replace(/^["']|["']$/g, ""), `${dir}/${name}`);
      }
    }
  }
  assert.ok(used.size > 0, "一条都没扫到 —— 这个扫描器坏了（别让它静默扫出空集合）");
  for (const [code, where] of used) {
    assert.deepEqual(
      unknownSymbols([code]),
      [],
      `${where} 用着「${code}」，而标的表里没有它。\n` +
        `  删一只票的顺序是**反的**：先去用着它的条目上取消勾选，再回来删这一行。`
    );
  }
});

test("代码归一只有一处判据（/s 那段地址和「是不是同一只票」不许各写一份）", () => {
  assert.equal(symbolKey(" brk.b "), "BRK-B");
  assert.match(
    stripComments(read("src/utils/related.ts")),
    /symbolKey/,
    "related.ts 又自己写了一份归一 —— 两处分家的症状是详情页说「还有 3 篇」而 /s 上只有 1 篇"
  );
  assert.match(
    stripComments(read("src/utils/getUniqueSymbols.ts")),
    /symbolKey/,
    "symbolSlug 又自己写了一份归一"
  );
});
