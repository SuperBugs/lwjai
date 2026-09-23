/**
 * 老地址表（`src/config/legacyUrls.ts`）的测试。
 *
 * 【2026-09-21】那天改了两轮地址（先换编号、再缩前缀），一共十几条已经上过公网的
 * 地址被改掉了。这张表是那些链接的全部保障 —— 而它坏掉的方式全是**零症状**的：
 *
 *   - 某条的 `to` 指向一个不存在的地址 → 跳过去 404，而构建全绿
 *     （Astro 的 `redirects` 不核对目标存在，和 `reference()` 一样）；
 *   - 第一轮那几行的 `to` 忘了跟着第二轮搬 → 老链接先 301 到一个已经没有的地址，
 *     **链式跳转**，抓取方打折甚至放弃；
 *   - `_redirects` 和 `redirects` 两份分了家 → 线上跳对了、`pnpm dev` 里 404
 *     （或者反过来），**本机验不出来**；
 *   - sitemap 的排除判据和表对不上 → sitemap 里列着一批自己声明 canonical
 *     指向别处的地址，Search Console 报「备用网页」，而站上一切正常。
 *
 * ★ "目标真的存在"这一条**不在这里测**：那要读磁盘，而且新内容随时在加。
 *   这里只钉**表自身的形状**和**两份产物同源**。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_URLS,
  isLegacyUrl,
  legacyRedirects,
  legacyRedirectsFile,
} from "../../src/config/legacyUrls";
import { isEntryNo } from "../../src/config/entryNo";

const EXACT = LEGACY_URLS.filter(r => !r.splat);
const SPLATS = LEGACY_URLS.filter(r => r.splat);

test("表的形状：站内绝对路径、不带末尾斜杠、不带域名、有理由", () => {
  for (const r of LEGACY_URLS) {
    for (const [name, p] of [
      ["from", r.from],
      ["to", r.to],
    ] as const) {
      assert.ok(p.startsWith("/"), `${name}「${p}」不是站内绝对路径`);
      assert.ok(
        !p.endsWith("/"),
        `${name}「${p}」带了末尾斜杠 —— 两种写法由 legacyRedirectsFile() 自己展开，` +
          `表里带一个会生成 \`//\``
      );
      assert.ok(
        !/^https?:/.test(p) && !p.includes("://"),
        `${name}「${p}」带了域名 —— 换域名那天这一行会把人送到旧主机上`
      );
    }
    assert.ok(r.note.trim().length > 0, `${r.from} 没写为什么改 —— 一年后没人敢动它`);
  }
});

test("★ 指向条目的那几行，末段必须是一个条目号", () => {
  // 列表页和单页（/r、/t、/a）没有号，跳过；只看"末段全是数字"的那些 ——
  // 手抄时把 /r/1002 抄成 /r/102 或者留着上一轮的 /r/3，就是这条抓。
  for (const r of LEGACY_URLS) {
    const last = r.to.split("/").at(-1) ?? "";
    if (!/^\d+$/.test(last)) continue;
    assert.ok(
      isEntryNo(last),
      `${r.from} 指向「${r.to}」，末段不是合法条目号（至少四位、从 1000 起）`
    );
  }
});

test("from 不许重复，也不许自己指自己", () => {
  // `/tags` 同时有一条精确行和一条通配行，是**刻意的**（见那个文件的说明），
  // 所以唯一性按「路径 + 是不是通配」算。
  const keys = LEGACY_URLS.map(r => `${r.from}${r.splat ? "/*" : ""}`);
  assert.equal(
    new Set(keys).size,
    keys.length,
    "同一个老地址列了两次 —— 两份产物里谁先命中取决于顺序，而顺序没人会去 review"
  );
  for (const r of LEGACY_URLS) {
    assert.notEqual(r.from, r.to, `${r.from} 指向自己，那是一个跳转循环`);
  }
});

test("★ 不许接力：某一条的目标不许是另一条的源", () => {
  // 两轮改地址最容易留下的就是这个：第一轮写的 `/posts/orcl-… → /posts/3`，
  // 第二轮把 `/posts/3` 也变成老地址却忘了回头改第一行。
  // 症状是老链接要跳两次，中间那一跳指向一个已经不存在的地址。
  const froms = new Set(LEGACY_URLS.map(r => r.from));
  for (const r of LEGACY_URLS) {
    assert.ok(
      !froms.has(r.to),
      `${r.from} → ${r.to}，而 ${r.to} 自己也是一条老地址 —— 直接指向最终那一个`
    );
  }
});

test("★ 两份产物同源：精确那几行两边都在，通配那几行只在 _redirects", () => {
  const inConfig = Object.keys(legacyRedirects()).sort();
  assert.deepEqual(
    inConfig,
    EXACT.map(r => r.from).sort(),
    "astro 的 redirects 和表里的精确行对不上"
  );
  for (const r of SPLATS) {
    assert.ok(
      !inConfig.includes(r.from) || EXACT.some(e => e.from === r.from),
      `通配行 ${r.from}/* 混进了 astro 的 redirects —— 静态构建没法为"还没出现过的地址"生成跳转页`
    );
  }

  const file = legacyRedirectsFile();
  for (const r of EXACT) {
    assert.ok(file.includes(`${r.from} ${r.to} 301`), `${r.from} 缺不带斜杠那一行`);
    assert.ok(
      file.includes(`${r.from}/ ${r.to} 301`),
      `${r.from} 缺带斜杠那一行 —— 老链接是目录形态分享出去的，多半带斜杠`
    );
  }
  for (const r of SPLATS) {
    assert.ok(
      file.includes(`${r.from}/* ${r.to}/:splat 301`),
      `${r.from} 的通配行没写进 _redirects`
    );
  }
  // ★ 目标一律不带斜杠：全站口径就是 /r/1002。目标带斜杠 = 老链接要跳两次才到位。
  assert.ok(
    !/^\S+ \S+\/ 301$/m.test(file),
    "有一条的目标带了末尾斜杠 —— 那会变成 301 到带斜杠、再被边缘 301 到不带斜杠，两跳"
  );
  assert.ok(
    !/ 302$/m.test(file),
    "写成 302 了 —— 这些地址不会再回来，302 会让抓取方一直保留老地址"
  );
});

test("★ 通配规则必须排在精确规则后面 —— Cloudflare 是先命中的赢", () => {
  // 反过来的话 `/tags` 自己会被 `/tags/*` 抢走（:splat 是空的），跳到 `/t/`。
  const body = legacyRedirectsFile()
    .split("\n")
    .filter(l => l.trim() !== "" && !l.startsWith("#"));
  const firstSplat = body.findIndex(l => l.includes("/:splat"));
  const lastExact = body.reduce(
    (at, l, i) => (l.includes("/:splat") ? at : i),
    -1
  );
  if (firstSplat >= 0) {
    assert.ok(
      firstSplat > lastExact,
      "通配行排到精确行前面了 —— 精确那几条会被它抢走"
    );
  }
});

test("★ sitemap 的排除判据认得出老地址，也不许误伤新地址", () => {
  for (const r of EXACT) {
    assert.ok(isLegacyUrl(`https://lwj.ai${r.from}`), `${r.from} 没被排除出 sitemap`);
    assert.ok(isLegacyUrl(`https://lwj.ai${r.from}/`), "带斜杠那种也要认");
  }
  for (const r of SPLATS) {
    assert.ok(
      isLegacyUrl(`https://lwj.ai${r.from}/%E4%BC%B0%E5%80%BC`),
      `${r.from}/<任意> 没被排除出 sitemap`
    );
  }
  for (const ok of [
    "https://lwj.ai/",
    "https://lwj.ai/r/1002",
    "https://lwj.ai/q/1003",
    "https://lwj.ai/g/1005",
    "https://lwj.ai/p/1000",
    "https://lwj.ai/a",
    "https://lwj.ai/t",
    "https://lwj.ai/t/%E4%BC%B0%E5%80%BC",
    "https://lwj.ai/s/orcl",
  ]) {
    assert.equal(isLegacyUrl(ok), false, `${ok} 被当成老地址排除掉了`);
  }
});
