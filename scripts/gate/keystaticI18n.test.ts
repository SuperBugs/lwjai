/**
 * 后台悬停提示的中文化（`src/dev/keystaticI18n.ts`）。
 *
 * 钉三件事：
 *   ① 认不出的串**返回 undefined，不是空串** —— 调用方拿空串会把原文抹掉，
 *      那是把"我不认识这个串"伪装成"这里本来就没有提示"；
 *   ② 词表里的串**和后台里真实出现的那个逐字节相同**（省略号是 U+2026 不是三个点，
 *      对不上的话那一条永远不会命中而且零报错）；
 *   ③ 接线：挂载 import 和调用都在。
 *
 * ★ 「tooltip 不许被 keystaticHelp 收成角标」那条（这次显示 bug 的根因）不在这儿，
 *   在 `keystaticForm.test.ts` —— 那边跑的是真的 `collapse()`，比在这里 grep
 *   一句源码强（docs/engineering-notes.md 里 `SC 13D` 那个形态）。
 *
 * ⚠ 翻译本身（"Bold" 该不该叫"加粗"）没法测，也不该测。这里测的是**机制**。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DICT_SIZE, translate } from "../../src/dev/keystaticI18n";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("认不出的串返回 undefined，不是空串", () => {
  for (const unknown of ["Save", "Dashboard", "", "  ", "Bolder", "加粗"]) {
    assert.equal(
      translate(unknown),
      undefined,
      `「${unknown}」不在词表里，必须返回 undefined —— 返回空串会把原文抹掉，` +
        `屏幕上就是一个空的提示框，比留着英文糟得多`
    );
  }
});

test("认得出的串给中文；前后空白不影响命中", () => {
  assert.equal(translate("Reset changes"), "撤销改动");
  assert.equal(translate("Preview"), "预览");
  assert.equal(translate("  Bold  "), "加粗", "文本节点常带空白，得 trim 了再查");
});

test("★ 省略号是 U+2026，不是三个点", () => {
  // 实测抄下来的是「Delete entry…」。写成「Delete entry...」的话这一条永远不命中，
  // 而且没有任何一处会报错 —— 屏幕上就是"别的都中文了，只有这两条还是英文"。
  assert.equal(translate("Delete entry…"), "删除这一条…");
  assert.equal(translate("Duplicate entry…"), "复制成新的一条…");
  assert.equal(
    translate("Delete entry..."),
    undefined,
    "三个点那种写法不该命中 —— 后台里根本不是那么渲染的"
  );
});

test("每一条中文里不许再夹着英文原文（抄漏了会长这样）", () => {
  for (const en of ["Reset changes", "Preview", "Bold", "Table"]) {
    const zh = translate(en);
    assert.ok(zh && !/[A-Za-z]/.test(zh), `「${en}」译文里还有英文字母：${zh}`);
  }
  assert.ok(DICT_SIZE >= 20, `词表只剩 ${DICT_SIZE} 条，是不是被删了？`);
});

test("接线：挂载 import 和调用都在 keystatic.config.ts 里", () => {
  const ks = read("keystatic.config.ts");
  assert.match(
    ks,
    /^import \{ mountTooltipI18n \} from "\.\/src\/dev\/keystaticI18n";$/m,
    "挂载 import 不在了 —— 整个后台的提示会安静地退回英文"
  );
  assert.match(
    ks,
    /^mountTooltipI18n\(\);$/m,
    "import 了但没调用，等于没挂（注释掉那一行也会被这条抓到）"
  );
});
