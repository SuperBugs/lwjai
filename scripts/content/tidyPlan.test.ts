/**
 * 「清掉整行只有杠的行」判据（`scripts/content/tidyPlan.ts`）的测试。
 *
 * ## 用例从哪来
 *
 * A 组那几段是**从站上真实的稿子里抄的形状**（posts 1008 / 1015 / 1020：
 * 上一行空、下一行空、本行 `\\`），不是照正则造的碎片。
 *
 * ## B 组比 A 组重要
 *
 * 这个功能**会改人的稿子**。误删一次的代价不是难看 —— 是正文里少了一段而
 * 没有任何地方会报错。所以 B 组钉的是"不许碰"：围栏里的续行、`\<`（坑 19 的正解）、
 * 算式里的 `\\%`、frontmatter 的字节。
 *
 * ## C 组：拿站上所有稿子跑一遍
 *
 * 不断言"1008.md 应该删 2 行"—— 那是把人在后台随时会改的内容拉进断言
 * （2026-09-21 真红过一次）。断言的是**与内容无关的性质**：删掉的每一行确实
 * 只有杠、跑第二遍不再有任何改动（幂等）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CONTENT_COLLECTIONS } from "../../src/config/collections";
import {
  ESCAPED_EMPHASIS_SRC,
  SLASH_ONLY_LINE,
  stripEscapedEmphasis,
  tidyBody,
  tidyText,
} from "./tidyPlan";

// ── A. 该删的要真的删 ────────────────────────────────────────────────────

test("A · 站上真实的形状：上下都是空行，本行 `\\\\`", () => {
  // src/content/posts/1008.md 的形状（10 行里 10 行都是这个样子）。
  const body = "**推演分析：**\n\n\\\\\n\n* **买盘动力：** 追高动能衰竭。\n";
  const r = tidyBody(body);
  assert.deepEqual(r.removed, [
    { line: 3, text: "\\\\", kind: "slash_line" },
  ]);
  // 顺手吃掉一个空行 —— 留两个连续空行，下次后台存盘又会规整一遍。
  assert.equal(r.body, "**推演分析：**\n\n* **买盘动力：** 追高动能衰竭。\n");
});

test("A · 一根反斜杠、一根斜杠、多根混着，都算", () => {
  for (const junk of ["\\", "/", "\\\\", "///", "\\/\\", "  \\\\  ", "　\\　"]) {
    const r = tidyBody(`上一段\n\n${junk}\n\n下一段\n`);
    assert.deepEqual(
      r.removed.map(x => x.text),
      [junk],
      `这一行整行只有杠，没删：${JSON.stringify(junk)}`
    );
    assert.equal(r.body, "上一段\n\n下一段\n");
  }
});

test("A · 行号是**正文里的**行号，和稿件体检报的是同一套号", () => {
  const body = "第一行\n\n\\\\\n\n第五行\n\n\\\\\n";
  assert.deepEqual(
    tidyBody(body).removed.map(x => x.line),
    [3, 7]
  );
});

test("A · 连着好几行杠", () => {
  const r = tidyBody("上一段\n\n\\\\\n\\\\\n\\\\\n\n下一段\n");
  assert.equal(r.removed.length, 3);
  assert.equal(r.body, "上一段\n\n下一段\n");
});

test("A · frontmatter 逐字节原样留着", () => {
  // 故意写得"不规范"：单引号、多余空格、顺序怪 —— 重新序列化的话这里会变。
  const front = "---\ntitle: CRWV\ntags:\n  - 个股研究\nquestionKey: ''\n---\n";
  const r = tidyText(`${front}\n正文\n\n\\\\\n\n结尾\n`);
  assert.ok(r.text.startsWith(front), "frontmatter 被动过了");
  assert.equal(r.removed.length, 1);
  assert.equal(r.text, `${front}\n正文\n\n结尾\n`);
});

test("A · 没得清的时候，原文一个字节都不动", () => {
  const raw = "---\ntitle: x\n---\n\n正文里没有孤零零的杠。\n";
  const r = tidyText(raw);
  assert.equal(r.removed.length, 0);
  assert.equal(r.text, raw, "没得清却返回了一份新字符串 —— 调用方会照着它写盘");
});

test("A · CRLF 的文件还回 CRLF", () => {
  const r = tidyBody("上一段\r\n\r\n\\\\\r\n\r\n下一段\r\n");
  assert.equal(r.removed.length, 1);
  assert.equal(r.body, "上一段\r\n\r\n下一段\r\n");
  assert.ok(!/(?<!\r)\n/.test(r.body), "留下了裸 LF —— 半个文件换了行尾");
});

// ── B. 不许误删（比 A 组重要）────────────────────────────────────────────

const MUST_NOT_TOUCH: readonly [string, string][] = [
  ["围栏里的 shell 续行", "```sh\npnpm build \\\n  --force\n```\n"],
  ["围栏里独占一行的反斜杠", "```\n\\\n```\n"],
  ["围栏里的公式", "```\n\\frac{V}{S}\n\\\\\n```\n"],
  ["算式里的 `\\\\%`（要改得动数字旁边，机器不许替人决定）", "让出 3.76\\\\%$\n"],
  ["坑 19 的正解 `\\<`", "机构持股 \\<20% 的先不看。\n"],
  ["行尾的硬换行", "上一行\\\n下一行\n"],
  ["正常的分隔线", "一段话\n\n---\n\n下一段\n"],
  ["表格分隔行", "| a |\n| --- |\n| 1 |\n"],
  ["带杠的周期", "5/15 分钟重现更低高点时才考虑。\n"],
  ["路径独占一行但不只有杠", "src/content/posts/\n"],
];

for (const [label, body] of MUST_NOT_TOUCH) {
  test(`B · 不许误删：${label}`, () => {
    const r = tidyBody(body);
    assert.deepEqual(r.removed, [], `这一段被误删了：\n${body}`);
    assert.equal(r.body, body, "没报删除，正文却变了");
  });
}

test("B · 正则本身：有别的字的行一律不算", () => {
  for (const line of ["\\\\%", "\\approx", "a\\", "\\ b", "| \\\\ |", "> \\"]) {
    assert.ok(!SLASH_ONLY_LINE.test(line), `这一行不该命中：${JSON.stringify(line)}`);
  }
});

// ── D. 转义掉的粗体标记 `\*\*`（【2026-09-22 用户要的第二种】）──────────────
//
// 用户看到的症状是页面上印着 `**最大的风险，…。**反过来，`。盘上那一行是
// `\*\*…\*\*`（CJK 标点撞上 CommonMark 的 flanking 规则 → 整段没解析成粗体，
// Keystatic 存盘时照实转义）。
//
// ⚠ 这一组里 **E 那几条比 A 那几条重要**：吃掉一个裸 `**` 的症状是页面排版塌掉，
//   而构建、闸门四处全绿。

test("D · 站上真实的那一行（qa/1033 第 67 行）：去掉两处，别的字一个不动", () => {
  const line =
    "\\*\\*最大的风险，是市场提前把“美国可能支持开发”交易成了“这些公司一定能赚钱”。\\*\\*反过来，也不能仅因单日涨幅巨大，就认定马上适合做空。";
  const r = tidyBody(`${line}\n`);
  assert.deepEqual(r.removed, [
    { line: 1, text: line, kind: "escaped_emphasis", marks: 2 },
  ]);
  assert.equal(
    r.body,
    "最大的风险，是市场提前把“美国可能支持开发”交易成了“这些公司一定能赚钱”。反过来，也不能仅因单日涨幅巨大，就认定马上适合做空。\n"
  );
});

test("D · 站上另一种形状（posts/1011 表格里的 `\\*\\*−5.396\\*\\*`）", () => {
  const line =
    "| 资本支出与自由现金流 | 资本支出**28.499**，自由现金流\\*\\*−5.396\\*\\* | 说明 |";
  const r = tidyBody(`${line}\n`);
  assert.equal(r.removed[0]!.marks, 2);
  assert.equal(
    r.body,
    "| 资本支出与自由现金流 | 资本支出**28.499**，自由现金流−5.396 | 说明 |\n",
    "同一行里的裸 **28.499** 是真的粗体，被一起吃掉了"
  );
});

test("D · 三个以上也算一串（`\\*\\*\\*` 是粗斜体的标记）", () => {
  const r = tidyBody("\\*\\*\\*重点\\*\\*\\*后面\n");
  assert.equal(r.removed[0]!.marks, 2, "两串标记，不是六处");
  assert.equal(r.body, "重点后面\n");
});

test("D · 整行只有标记 → 整行删掉，不许留一个空行", () => {
  /**
   * ⚠ 留个空行会把本来的**一段**劈成两段 —— 那是改排版，不是"去掉两个星号"。
   *   这一档零报错：站上多出一个段落间距，没有任何地方会说。
   */
  const r = tidyBody("上一行\n\\*\\*\n下一行\n");
  assert.deepEqual(r.removed, [
    { line: 2, text: "\\*\\*", kind: "escaped_emphasis", marks: 1 },
  ]);
  assert.equal(r.body, "上一行\n下一行\n");
});

test("D · 两种脏在同一份稿子里：各报各的档", () => {
  const r = tidyBody("\\*\\*小结：\\*\\*收盘走弱。\n\n\\\\\n\n下一段\n");
  assert.deepEqual(
    r.removed.map(x => [x.line, x.kind, x.marks]),
    [
      [1, "escaped_emphasis", 2],
      [3, "slash_line", undefined],
    ]
  );
  assert.equal(r.body, "小结：收盘走弱。\n\n下一段\n");
});

// ── E. 不许误删（比 D 组重要）────────────────────────────────────────────

const STARS_MUST_NOT_TOUCH: readonly [string, string][] = [
  ["裸 `**`：真的粗体，全站 7000 多个", "**推演分析：**追高动能衰竭。\n"],
  ["裸 `*`：斜体 / 列表符号", "* **买盘动力：** 衰竭\n\n*强调*\n"],
  [
    "单独一个 `\\*`（脚注星号 / 乘号，作者真想印的字）",
    "净利率 12%\\*，按 85\\*1.25 折算。\n",
  ],
  ["围栏里的（给人抄的字）", "```md\n\\*\\*加粗\\*\\*\n```\n"],
  ["行内代码里的", "写成 `\\*\\*x\\*\\*` 就不会被解析。\n"],
  ["转义的别的标点（Keystatic 自己加的正解，坑 19）", "机构持股 \\<20% 的先不看。\n"],
];

for (const [label, body] of STARS_MUST_NOT_TOUCH) {
  test(`E · 不许误删：${label}`, () => {
    const r = tidyBody(body);
    assert.deepEqual(r.removed, [], `这一段被误删了：\n${body}`);
    assert.equal(r.body, body, "没报改动，正文却变了");
  });
}

test("E · 行内代码里的不碰，同一行**外面**的照清", () => {
  // 一条正则同时匹配"行内代码"和"标记"，先匹配到代码就把里面的挡住了 ——
  // 这条用例钉的就是那个顺序（分两步走、自己算区间的那版会在这里红）。
  const r = tidyBody("\\*\\*小结\\*\\*：写成 `\\*\\*x\\*\\*` 不会被解析。\n");
  assert.equal(r.removed[0]!.marks, 2);
  assert.equal(r.body, "小结：写成 `\\*\\*x\\*\\*` 不会被解析。\n");
});

test("E · stripEscapedEmphasis 自己：没得清时原样还回去，marks 是 0", () => {
  const line = "**真的粗体**，还有一个 \\* 星号。";
  assert.deepEqual(stripEscapedEmphasis(line), { line, marks: 0 });
});

// ── C. 拿站上所有稿子跑一遍（与内容无关的性质）──────────────────────────

test("C · 全站：清掉的每一行都对得上档，而且跑第二遍不再有改动", () => {
  let files = 0;
  let removed = 0;
  for (const spec of CONTENT_COLLECTIONS) {
    const dir = join(process.cwd(), ...spec.dir.split("/"));
    for (const name of readdirSync(dir)) {
      if (name.startsWith("_") || !/\.mdx?$/i.test(name)) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) continue;
      files += 1;
      const raw = readFileSync(full, "utf8");
      const first = tidyText(raw);
      for (const r of first.removed) {
        if (r.kind === "slash_line") {
          assert.match(
            r.text,
            SLASH_ONLY_LINE,
            `${spec.dir}/${name} 第 ${r.line} 行被整行删了，但它不只有杠：${JSON.stringify(r.text)}`
          );
          assert.equal(r.marks, undefined, "整行删掉那一档不该带 marks");
        } else {
          assert.match(
            r.text,
            new RegExp(ESCAPED_EMPHASIS_SRC),
            `${spec.dir}/${name} 第 ${r.line} 行报了星号那一档，但行里没有转义星号`
          );
          assert.ok((r.marks ?? 0) > 0, "去掉 N 处那一档必须说得出 N");
        }
      }
      removed += first.removed.length;

      /**
       * ★ **裸 `**`（真的粗体）一个都不许少。** 全站 7000 多个，吃掉它们的症状是
       *   整站排版塌掉，而构建、闸门四处全绿。这条断言和内容无关：不管站上今天
       *   有几个，清理前后必须一样多。
       */
      const bareStars = (s: string) => (s.match(/(?<!\\)\*\*/g) ?? []).length;
      assert.equal(
        bareStars(first.text),
        bareStars(raw),
        `${spec.dir}/${name} 的裸 ** 被动了 —— 那是真的粗体`
      );
      // 幂等：清过一遍的稿子再点一次「清理」，屏幕上必须是"没得清"。
      const second = tidyText(first.text);
      assert.deepEqual(
        second.removed,
        [],
        `${spec.dir}/${name} 清一遍之后还能再清 —— 那会变成每次都显示有东西要清`
      );
      assert.equal(second.text, first.text);
    }
  }
  assert.ok(files > 0, "一篇都没看到 —— 这条用例什么都没验（登记表的 dir 对不上？）");
  void removed;
});
