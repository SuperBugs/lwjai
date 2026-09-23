/**
 * 站标（logo / favicon）的**两处一致性**测试。
 *
 * ★ 为什么需要它：同一套几何写在两个文件里 ——
 *     public/favicon.svg          浏览器标签页那一份（16px，读不到 CSS 变量）
 *     src/assets/icons/IconLogo.svg  页眉那一份（28/32px，跟 currentColor 走）
 *   只改一处的后果是**零症状**：谁都不会同时盯着标签页和页眉看，而且两处
 *   分别在两种尺寸、两种取色方式下渲染，页面不报错、构建全绿。
 *   这正是 docs/engineering-notes.md 坑 8 的形态（「以下是模型的原话」在两处、只改了一处）。
 *
 * ★ 为什么放在 scripts/gate/：`pnpm test` 的 glob 就是 `scripts/gate/*.test.ts`
 *   （package.json）。这一份和发布闸没有关系 —— 它只是搭了同一班车。
 *   sanitize.test.ts 也是这么来的。真要分家就把那个 glob 一起改。
 *
 * ★ 用例是从「人真的会怎么改坏它」来的，不是从现有坐标反推的
 *   （gate.test.ts 开头那段 SC 13D 说的就是后者的下场）：
 *     - 嫌两个引号「没对齐」，把它们调成等大等高  → 第 3 条红
 *     - 微调坐标找手感，落到 8 的倍数之外          → 第 2 条红
 *     - 只改了页眉那份 / 只改了 favicon 那份       → 第 1 条红
 *     - 给页眉那份写死一个 fill                    → 第 4 条红
 *     - 重新调色板，忘了 favicon 读不到 CSS 变量   → 第 5 条红
 *
 * 跑：`pnpm test`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FAVICON = "public/favicon.svg";
const HEADER_MARK = "src/assets/icons/IconLogo.svg";
const LAYOUT = "src/layouts/Layout.astro";
const THEME_CSS = "src/styles/theme.css";

const abs = (p: string) => join(process.cwd(), ...p.split("/"));
const read = (p: string) => readFileSync(abs(p), "utf8");

type Rect = { x: number; y: number; width: number; height: number };

/** 两份文件都是手写的、结构固定，所以用正则取矩形足够了。
 *  但**必须由调用方断言条数**：正则一条都没匹配到时，下面那些 deepEqual([], [])
 *  会安静地通过 —— 断言和代码一起漏，就是这个项目最怕的那种绿。 */
function rectsOf(file: string): Rect[] {
  const src = read(file);
  const out: Rect[] = [];
  for (const m of src.matchAll(/<rect\b([^>]*?)\/?>/g)) {
    const attrs = m[1];
    const pick = (name: string) => {
      const hit = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(attrs);
      assert.ok(hit, `${file} 有一个 <rect> 缺 ${name}：${m[0]}`);
      const n = Number(hit[1]);
      assert.ok(
        Number.isFinite(n),
        `${file} 的 ${name}="${hit[1]}" 不是数字 —— 这两份文件只允许纯数字坐标`
      );
      return n;
    };
    out.push({
      x: pick("x"),
      y: pick("y"),
      width: pick("width"),
      height: pick("height"),
    });
  }
  return out;
}

const key = (r: Rect) => `${r.x},${r.y},${r.width},${r.height}`;

/** 横臂 = 宽大于高，竖臂 = 高大于宽；开引号是靠左上的那一支。
 *  刻意**不按文件里的出现顺序**取 —— 顺序是可以合法重排的，含义不行。 */
function arms(rects: Rect[], file: string) {
  const horizontal = rects.filter(r => r.width > r.height);
  const vertical = rects.filter(r => r.height > r.width);
  assert.equal(
    horizontal.length,
    2,
    `${file} 里横臂不是 2 条（拿到 ${horizontal.length} 条）—— 一对引号各一条横臂`
  );
  assert.equal(
    vertical.length,
    2,
    `${file} 里竖臂不是 2 条（拿到 ${vertical.length} 条）—— 一对引号各一条竖臂`
  );
  const byCorner = (a: Rect, b: Rect) => a.x + a.y - (b.x + b.y);
  const [openH, closeH] = [...horizontal].sort(byCorner);
  const [openV, closeV] = [...vertical].sort(byCorner);
  return { openH, closeH, openV, closeV };
}

// ── 两处一致 ──────────────────────────────────────────────────────────

test("站标：页眉那份和 favicon 那份，几何必须逐个数字一致", () => {
  const fav = rectsOf(FAVICON);
  const mark = rectsOf(HEADER_MARK);

  // 先钉住"真的读到了东西"。少了这两条，下面的 deepEqual 在正则失效时是恒真的。
  assert.equal(
    fav.length,
    4,
    `${FAVICON} 里应该有 4 个 <rect>，实际 ${fav.length} 个。\n` +
      `  改成 <path> 或者别的画法也行，但那样这份测试就看不见它了 —— 记得一起改。`
  );
  assert.equal(
    mark.length,
    4,
    `${HEADER_MARK} 里应该有 4 个 <rect>，实际 ${mark.length} 个。\n` +
      `  注意：Astro 的 SVG 管线（svgo）会在**渲染结果**里把 rect 压成 path，\n` +
      `  那是产物、不是源文件。这条查的是源文件。`
  );

  assert.deepEqual(
    fav.map(key).sort(),
    mark.map(key).sort(),
    `两份站标的几何对不上：\n` +
      `  ${FAVICON}:     ${fav.map(key).join(" | ")}\n` +
      `  ${HEADER_MARK}: ${mark.map(key).join(" | ")}\n` +
      `  只改一处是**零症状**的：一个挂在标签页上、一个挂在页眉上，\n` +
      `  没人会同时盯着这两个地方看，页面和构建都不会有任何反应。`
  );

  for (const file of [FAVICON, HEADER_MARK]) {
    assert.match(
      read(file),
      /viewBox\s*=\s*"0 0 128 128"/,
      `${file} 的 viewBox 不是 "0 0 128 128" —— 两份用同一套坐标，viewBox 必须也一样，` +
        `否则"几何一致"是假的：同样的数字在不同 viewBox 里是不同的形状。`
    );
  }
});

// ── 16px 那一档的像素不变量 ────────────────────────────────────────────

test("站标：所有坐标必须是 8 的倍数", () => {
  const fav = rectsOf(FAVICON);
  assert.equal(fav.length, 4, `${FAVICON} 没读到 4 个 <rect>`);

  const offGrid = fav
    .filter(r => [r.x, r.y, r.width, r.height].some(n => n % 8 !== 0))
    .map(key);

  assert.deepEqual(
    offGrid,
    [],
    `这些坐标不是 8 的倍数：${offGrid.join(" | ")}\n` +
      `  viewBox 是 128，浏览器把它光栅到 16px（标签页那一档）时除以 8。\n` +
      `  不整除 = 边落在半个像素上 = 16px 下出现半透明灰边，而 128px 下一切正常。\n` +
      `  想微调手感就整格挪（8 / 16 / 24…），别挪 4 和 12。`
  );
});

// ── 这个标记的**含义**在哪 ─────────────────────────────────────────────

test("站标：闭引号必须明显比开引号小", () => {
  const { openH, closeH, openV, closeV } = arms(rectsOf(FAVICON), FAVICON);

  const why =
    `\n  「一大一小」是这个标记的全部含义：一句话 + 一句更短的按语。\n` +
    `  调成等大等高之后它就变成了取景框 / 裁剪工具图标 —— 四个角等大正是那类图标的铁律，\n` +
    `  而且那时页面上什么都不会变，只是这个 logo 换了个意思。`;

  assert.ok(
    closeH.width < openH.width,
    `闭引号的横臂（${closeH.width}）没比开引号的（${openH.width}）短。${why}`
  );
  assert.ok(
    closeV.height < openV.height,
    `闭引号的竖臂（${closeV.height}）没比开引号的（${openV.height}）短。${why}`
  );

  // 16px 下 1 个像素的差看不见。当初把「三处不对称」砍成一处、
  // 并把量级放大到像素可见，换来的就是这个下限。
  const gapH = (openH.width - closeH.width) / 8;
  const gapV = (openV.height - closeV.height) / 8;
  assert.ok(
    gapH >= 2 && gapV >= 2,
    `16px 下的臂长差只有 横 ${gapH}px / 竖 ${gapV}px。${why}\n` +
      `  差不到 2 个像素 = 在标签页那一档看不出来，等于没有。`
  );

  // 线宽两边必须完全相同：小的那个是"更短的一句"，不是"缩小的复制品"。
  // 顺带也是 16px 零灰边的前提 —— 两笔同粗才都落在整数像素上。
  assert.equal(
    closeH.height,
    openH.height,
    `两个引号的线宽不一样（${openH.height} vs ${closeH.height}）—— 小的那个不许跟着一起变细`
  );
  assert.equal(
    closeV.width,
    openV.width,
    `两个引号的线宽不一样（${openV.width} vs ${closeV.width}）—— 小的那个不许跟着一起变细`
  );

  // 横臂比竖臂长，两个引号都是。反过来标记会立起来，不再像一对引号。
  assert.ok(
    openH.width > openV.height && closeH.width > closeV.height,
    `横臂没比竖臂长（开 ${openH.width}/${openV.height}，闭 ${closeH.width}/${closeV.height}）`
  );
});

// ── 取色：两份文件走两条完全不同的路 ────────────────────────────────────

test("站标：页眉那份必须是 currentColor", () => {
  const src = read(HEADER_MARK);
  assert.match(
    src,
    /fill\s*=\s*"currentColor"/,
    `${HEADER_MARK} 没用 fill="currentColor"。\n` +
      `  页眉那份靠外层的 color（--foreground）驱动，深浅两个主题共用同一套 path。\n` +
      `  写死一个 fill 的后果是**只在另一个主题里**看得见：你改的时候在哪个主题，\n` +
      `  哪个主题就是对的，另一个是深底深图或浅底浅图。`
  );
  assert.doesNotMatch(
    src,
    /<style/,
    `${HEADER_MARK} 里有 <style>。页眉那份不需要它 —— 取色交给 currentColor。\n` +
      `  （favicon 那份才需要，因为它是独立文件、读不到页面的 CSS 变量。）`
  );
});

test("站标：favicon 那份必须自己带深浅两档，而且和 theme.css 对齐", () => {
  const svg = read(FAVICON);
  const css = read(THEME_CSS);

  assert.match(
    svg,
    /@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)/,
    `${FAVICON} 里没有 prefers-color-scheme 那一档。\n` +
      `  它是独立文件，读不到 --foreground，也读不到站内的 data-theme ——\n` +
      `  只能自己判断。缺了这一档，深色系统的标签栏上就是一个近黑底上的近黑图标。`
  );

  // theme.css 里 --foreground 出现两次：先浅色那组，再 [data-theme="dark"] 那组。
  const darkAt = css.indexOf('[data-theme="dark"]');
  assert.ok(
    darkAt > 0,
    `${THEME_CSS} 里找不到 [data-theme="dark"] —— 下面的取色比对失去了参照物，` +
      `别让这条测试退化成恒真断言`
  );
  const fgOf = (chunk: string) =>
    /--foreground:\s*(#[0-9a-fA-F]{3,8})/.exec(chunk)?.[1];
  const lightFg = fgOf(css.slice(0, darkAt));
  const darkFg = fgOf(css.slice(darkAt));

  assert.ok(lightFg && darkFg, `${THEME_CSS} 里没读到成对的 --foreground`);

  for (const [hex, which] of [
    [lightFg!, "浅色"],
    [darkFg!, "深色"],
  ] as const) {
    assert.ok(
      svg.toLowerCase().includes(hex.toLowerCase()),
      `${FAVICON} 里没有${which}主题的前景色 ${hex}。\n` +
        `  调色板改了而 favicon 没跟着改 = 标签页上那个图标停在旧配色上，\n` +
        `  站上一切正常，只有标签栏里那 16 个像素不对 —— 没人会因此报 bug。`
    );
  }
});

// ── <link rel="icon"> 指的东西必须真的存在 ──────────────────────────────

test("favicon：<link rel=\"icon\"> 指的文件必须真的在 public/ 下", () => {
  // 【2026-09-18 查实】建站起 Layout.astro 就挂着一条 `favicon.ico`，
  // 而仓库里一个 .ico 都没有（上游 AstroPaper 发了一个，这个仓库没有）。
  // 表现：每次开页都打一个 404，而页面完全正常 —— 浏览器拿 SVG 那条顶上了。
  // 那行已经删掉，这条测试是防它以后被谁顺手加回来。
  const src = read(LAYOUT);
  const links = src
    .split("\n")
    .filter(l => /rel\s*=\s*"icon"/.test(l))
    .map(l => /getAssetPath\("([^"]+)"\)/.exec(l)?.[1])
    .filter((v): v is string => Boolean(v));

  assert.ok(
    links.length > 0,
    `${LAYOUT} 里一条 <link rel="icon"> 都没读到。\n` +
      `  要么图标链接被删光了，要么 href 换了写法（不再是 getAssetPath("…")）——\n` +
      `  后一种情况下这条测试会变成恒真断言，请一起改。`
  );

  for (const href of links) {
    assert.ok(
      existsSync(abs(`public/${href}`)),
      `${LAYOUT} 指向 public/${href}，但这个文件不存在。\n` +
        `  症状是零：浏览器会退回到别的 <link rel="icon">，页面照常，\n` +
        `  只是每次开页白打一个 404。`
    );
  }
});
