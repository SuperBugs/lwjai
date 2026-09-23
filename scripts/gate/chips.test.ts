/**
 * 芯片的形状**只许有一处**（`app-chip` / `app-chip-empty`，src/styles/global.css）。
 *
 * 【2026-09-22 用户要的】四张芯片（标的 / 标签 / 出处 / 分享者）从
 * 「1px 边 + surface 底 + rounded-md」换成了**扁平**：一格底色、无边框。
 * 同一天第二轮他定了"淡底方角"那一版：底色淡一半（`bg-muted/60`）、
 * 药丸圆角换回 6px 方角（`rounded-md`，原话「太圆了」）、内外都松一档
 * （原话「感觉拥挤」）。下面第一条钉着**不许再变回药丸**。
 *
 * ## 为什么值得钉
 *
 * 换之前那副形状在**四个组件里各写了一份 class**，靠一句注释守着：
 * 「改其中一张的形状时**三张一起改**」—— 而那句话写的是"三张"，实际早就是四张了。
 * 一条只能靠人记的规矩，在它自己的注释里就已经失准了。
 *
 * 症状是**零报错**的：改一张的圆角 / 边框，另外三张照旧，页面照常渲染 ——
 * 一行里并排的几个小件长得不一样，而读者会以为它们是不同类的东西。
 *
 * ⚠ 这一组钉的是**拼写**（grep 源码），不是渲染结果 —— 这个仓库里没有 jsdom。
 *   先剥注释再 grep：注释里正写着那串老 class，不剥的话"没人再手写形状"那条永远绿。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

/** 四张芯片。**这张名单是手写的**：加第五张时，下面第二条会因为它手写了形状而红。 */
const CHIPS = [
  "src/components/SymbolChip.astro",
  "src/components/Tag.astro",
  "src/components/AgentModelChip.astro",
  "src/components/PromptOriginChip.astro",
];

test("形状定义在 global.css 里，而且是扁平的（无边框 + 底色）", () => {
  const css = read("src/styles/global.css");
  assert.match(css, /@utility app-chip \{/, "app-chip 没了 —— 四张芯片会一起失去形状");
  assert.match(
    css,
    /@utility app-chip-empty \{/,
    "app-chip-empty 没了 —— 「待补」那一档就没有画法了"
  );

  const chipRule = /@utility app-chip \{([\s\S]*?)\}/.exec(css)![1]!;
  assert.match(chipRule, /bg-muted/, "扁平那一档靠底色分层，底色没了就什么都不剩");
  assert.ok(
    !/\bborder\b/.test(chipRule),
    "app-chip 又有边框了 —— 用户要的就是去掉它（扁平），别顺手加回来"
  );
  // ★【2026-09-22 第二轮】用户看过药丸那一版，原话「太圆了」，改成了方角。
  //   这条钉的是**那次选择**：圆角具体几档随便调，但别再变回 `rounded-full`。
  assert.ok(
    !/rounded-full/.test(chipRule),
    "app-chip 又变回药丸了 —— 用户看过那一版，说的是「太圆了」"
  );

  // ★ 「待补」那一档**必须**还有虚线：两档的区别就在"有面" vs "一圈虚线"。
  const emptyRule = /@utility app-chip-empty \{([\s\S]*?)\}/.exec(css)![1]!;
  assert.match(emptyRule, /border-dashed/, "待补那一档的虚线没了");
  assert.ok(
    !/bg-muted|bg-surface/.test(emptyRule),
    "待补那一档给了填充 —— 它和「有确定答案」那一档就长得一样了"
  );
});

/**
 * 两档（有填充 / 一圈虚线）**只许差"有没有底、有没有虚线"这一件事**，
 * 圆角、内边距、内部间距要逐项一致。
 *
 * 症状是零报错的：改 `app-chip` 的圆角忘了改 `app-chip-empty`，一行里
 * 「Claude (Opus-5)」和「来源未标注」并排时，后者看着像**排版坏了**，
 * 而它要说的是「这一格还空着」。两档的区别从"信息"退化成"故障"。
 */
test("★ 两档的形状逐项一致（只差有没有底 / 有没有虚线）", () => {
  const css = read("src/styles/global.css");
  const shape = (name: string) => {
    const rule = new RegExp(`@utility ${name} \\{([\\s\\S]*?)\\}`).exec(css)![1]!;
    return (rule.match(/\b(?:rounded|px|py|gap)-[\w./[\]-]+/g) ?? []).sort();
  };
  assert.deepEqual(
    shape("app-chip-empty"),
    shape("app-chip"),
    "两档的圆角 / 内边距 / 间距对不上了 —— 「这一格还空着」会被读成「这里排版坏了」"
  );
});

test("四张芯片都用那个 utility，没有一处手写形状", () => {
  for (const rel of CHIPS) {
    const src = stripComments(read(rel));
    assert.match(
      src,
      /app-chip/,
      `${rel} 没用 app-chip —— 它的形状会和另外三张分家`
    );
  }
});

/**
 * ★【2026-09-22】组件里**不许再写自己的间距**。这不是洁癖，是一个赢家不定的冲突：
 *
 * `gap-1.5` 和 `gap-2` 都是普通 utility，同时挂在一个元素上时谁生效取决于
 * **生成的 CSS 里谁在后面**，不是 class 字符串的顺序 —— 改一次 Tailwind 版本
 * 就可能换个赢家，而四处全绿。
 *
 * 实际踩到的两处：SymbolChip 写着 `gap-1.5`（比另外三张窄 2px），
 * AgentModelChip 的括号写着 `ms-1`（和 `gap-2` **相加**成 12px）——
 * 一排芯片里只有那两张的内部节奏不一样，看着像没对齐。
 */
test("★ 四张芯片不再自己写间距 / 圆角（那是 app-chip 一处说了算）", () => {
  const offenders: string[] = [];
  for (const rel of CHIPS) {
    const found = stripComments(read(rel)).match(
      /\b(?:gap|ms|me|px|py|rounded)-[\w./[\]-]+/g
    );
    if (found) offenders.push(`${rel}: ${[...new Set(found)].join(" ")}`);
  }
  assert.deepEqual(
    offenders,
    [],
    `这几处又自己写了间距 / 圆角：\n  ${offenders.join("\n  ")}\n` +
      `芯片内部的节奏由 \`app-chip\`（src/styles/global.css）一处给。` +
      `真要改就去改那一处 —— 两个 \`gap-*\` 挂在同一个元素上时，` +
      `谁生效取决于生成的 CSS 顺序，不是这里写的顺序。`
  );
});

test("★ 全站没有第二处手写那副老形状（加第五张芯片时这条会红）", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${name.name}`;
      if (name.isDirectory()) walk(rel);
      else if (/\.astro$/.test(name.name)) {
        const src = stripComments(read(rel));
        // 老形状的指纹：`rounded-md` + `border` + `px-2.5` 同时出现在一串 class 里。
        if (/rounded-md[^"'`]*\bborder\b[^"'`]*px-2\.5/.test(src)) {
          offenders.push(rel);
        }
      }
    }
  };
  walk("src");
  assert.deepEqual(
    offenders,
    [],
    `这几处手写了老的芯片形状（1px 边 + rounded-md + px-2.5）：\n  ${offenders.join(
      "\n  "
    )}\n用 \`app-chip\` / \`app-chip-empty\`（src/styles/global.css）。`
  );
});
