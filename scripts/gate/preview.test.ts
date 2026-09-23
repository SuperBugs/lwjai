/**
 * 后台那条 Preview（`src/dev/previewPlan.ts` + `/_preview` 那条路由）。
 *
 * 钉四件事：
 *   ① 四档**两两不同**，而且顺序对（先"盘上有没有"再"是不是草稿"）；
 *   ② `previewUrlFor()` 里那个 `{slug}` **原样留着** —— Keystatic 是拿它做字面量
 *      替换的，顺手编码一下就会静默失配（菜单里那条照常在，点开是个带
 *      字面量 `{slug}` 的地址）；
 *   ③ 接线：四个集合都配了 previewUrl，路由真的注进去了；
 *   ④ 那条路由的入口文件真的存在（injectRoute 的 entrypoint 写错只会在
 *      访问那一刻才炸，而那时候人正想预览）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { previewTier, previewUrlFor } from "../../src/dev/previewPlan";
import { NUMBERED_COLLECTIONS } from "../../src/config/collections";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** 把块注释和行注释剥掉，剩下的算"代码"。够用 —— 这几个文件里没有含 `//` 的字符串。 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("四档：能看的跳走，其余三档各说各的", () => {
  assert.equal(
    previewTier({ routable: true, found: true, draft: false }),
    "open"
  );
  assert.equal(
    previewTier({ routable: true, found: true, draft: true }),
    "draft"
  );
  assert.equal(
    previewTier({ routable: true, found: false, draft: false }),
    "missing"
  );
  assert.equal(
    previewTier({ routable: false, found: false, draft: false }),
    "unknown"
  );
  // 集合不对时就算盘上"有"也轮不到它 —— 那条路算不出地址。
  assert.equal(
    previewTier({ routable: false, found: true, draft: false }),
    "unknown"
  );
});

test("★ 盘上没有这一条时不许落进 open —— 那会跳向一张 404", () => {
  // draft 的默认值是 false，先判 draft 再判 found 的话，一条还没存盘的条目
  // （found: false, draft: false）会被判成"能看"，于是预览跳去一个不存在的地址，
  // 又变回那张什么都说不清的 404。这一条钉的就是那个顺序。
  assert.equal(
    previewTier({ routable: true, found: false, draft: false }),
    "missing"
  );
  assert.equal(
    previewTier({ routable: true, found: false, draft: true }),
    "missing"
  );
});

test("previewUrlFor：{slug} 必须原样留着，集合名要编码", () => {
  const url = previewUrlFor("posts");
  assert.ok(
    url.includes("{slug}"),
    `${url} 里没有字面量 {slug} —— Keystatic 是拿它做字符串替换的，` +
      `失配的话菜单里那条 Preview 会打开一个带字面量 {slug} 的地址，而且零报错`
  );
  assert.equal(url, "/_preview?c=posts&s={slug}");
  // 集合名进查询串要编码（今天四个都是纯 ASCII，但这一行钉的是"走了编码"这件事）。
  assert.ok(previewUrlFor("a b").includes("c=a%20b"));
});

test("接线：四个编号集合都配了 previewUrl，路由注进去了，入口文件在", () => {
  const ks = read("keystatic.config.ts");
  for (const key of NUMBERED_COLLECTIONS) {
    assert.ok(
      ks.includes(`previewUrlFor("${key}")`),
      `keystatic.config.ts 里 ${key} 没配 previewUrl —— 那个集合的编辑页就没有 Preview，` +
        `而别的集合有，没有任何一处会报错`
    );
  }
  const cfg = read("astro.config.ts");
  assert.match(
    cfg,
    /pattern:\s*"\/_preview"/,
    "astro.config.ts 里没注 /_preview 这条路由"
  );
  assert.match(cfg, /src\/dev\/preview\.astro/);
  assert.ok(
    existsSync(join(process.cwd(), "src/dev/preview.astro")),
    "injectRoute 指着的 src/dev/preview.astro 不存在"
  );
});

test("/_preview 是 dev 专用：不在 src/pages 下，而且是现取查询串的", () => {
  assert.ok(
    !existsSync(join(process.cwd(), "src/pages/_preview.astro")),
    "这一页不许出现在 src/pages 下 —— 那样它会被打进公网产物"
  );
  const page = read("src/dev/preview.astro");
  assert.match(
    page,
    /Astro\.url\.searchParams/,
    "它得从查询串里现取 c / s —— 改成静态参数路由的话，静态输出模式下要 getStaticPaths，" +
      "而这一页要的正是'那一条还不存在也能开'"
  );
  // ★ 比之前先把注释剥掉：那个文件的注释里**就写着**这一行字（在解释它为什么必须在），
  //   连注释一起比的话这条断言等于没比。
  assert.match(
    stripComments(page),
    /export const prerender = false;/,
    "prerender = false 被删了 —— 【2026-09-21 实测】没有它 Astro.url.searchParams 是空的" +
      "（静态输出模式把这一页当预渲染），于是**每一次预览都落进「这个地址预览不了」那一档**，" +
      "看起来像后台那条链接坏了。⚠ astro/no-prerender-export-outside-pages 对它报错是误报，" +
      "那条规则按路径判断，而这一页是 injectRoute 挂上去的真路由 —— 用显式 disable，别删代码。"
  );
});
