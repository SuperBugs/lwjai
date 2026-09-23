/**
 * 地址和**盘上真实路由文件**的对账。【2026-09-21】
 *
 * ## 为什么必须有这一份
 *
 * Astro 的路由是**按文件名**来的：`/a` 之所以存在，是因为盘上有 `src/pages/a.astro`。
 * 而站内链接是另一套判据算出来的（`src/config/routes.ts` 的 `ROUTES`、
 * `src/config/collections.ts` 的 `urlPrefix`）。这两套**没有任何东西把它们绑在一起** ——
 * 改一边不改另一边的后果是：
 *
 *   - 改了判据没改文件名 → 全站链接指向 404，而 `astro check`、闸门、`pnpm build`
 *     四处全绿（Astro 不核对 `<a href>` 指向的地址存不存在）；
 *   - 改了文件名没改判据 → 新地址上确实有页面，但**没有任何入口指向它**，
 *     站看上去只是少了几个链接。
 *
 * 两种都得靠人点一遍才发现，而这个站的地址已经在一天里改过两轮了。
 *
 * ★ 对账是**双向**的：判据里的每个前缀都要有文件；`src/pages` 下每个顶层路由
 *   也都要在判据里找得到（否则就是有一条没人管的路由，下一次改地址它会被落下）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROUTES, routePath } from "../../src/config/routes";
import { CONTENT_COLLECTIONS } from "../../src/config/collections";

const PAGES = join(process.cwd(), "src", "pages");

/** `src/pages/<seg>.astro` 或 `src/pages/<seg>/` 存在。 */
const routeExists = (seg: string) =>
  existsSync(join(PAGES, `${seg}.astro`)) ||
  existsSync(join(PAGES, `${seg}.ts`)) ||
  existsSync(join(PAGES, seg));

/** 判据算出来的全部顶层路由段。 */
const declared = (): string[] => [
  ...Object.values(ROUTES),
  ...CONTENT_COLLECTIONS.map(c => c.urlPrefix).filter(
    (p): p is string => p !== null
  ),
];

test("★ 判据里的每个前缀，盘上都要有对应的路由文件", () => {
  for (const seg of declared()) {
    assert.ok(
      routeExists(seg),
      `判据说有 /${seg}，但 src/pages/ 下既没有 ${seg}.astro 也没有 ${seg}/ —— ` +
        `站内每一个指向它的链接都是 404，而构建和类型检查全绿`
    );
  }
});

test("★ 反过来：src/pages 下的每条顶层路由都要在判据里有主", () => {
  // 没人管的路由 = 下一次改地址时它会被落下，而"少了一条路由"没有任何一处会响。
  const OWNED_ELSEWHERE = new Set([
    "index.astro", // 首页
    "404.astro", // 上游的 404
    "og.png.ts", // 默认分享卡
    "robots.txt.ts",
    "rss.xml.ts",
    // feed 在浏览器里渲染那一页用的样式表。它是 /rss.xml 的附属品、没有导航入口，
    // 所以不进 ROUTES；接没接上由 feed.test.ts 钉着。
    "rss.xsl.ts",
  ]);
  const known = new Set(declared());
  for (const entry of readdirSync(PAGES, { withFileTypes: true })) {
    const name = entry.name;
    if (OWNED_ELSEWHERE.has(name)) continue;
    if (name.startsWith("_") || name.startsWith("[")) continue;
    const seg = entry.isDirectory() ? name : name.replace(/\.(astro|ts)$/, "");
    assert.ok(
      known.has(seg),
      `src/pages/${name} 这条路由在判据里没有主 —— ` +
        `要么把它加进 src/config/routes.ts 的 ROUTES，` +
        `要么它是某个集合的 urlPrefix 而登记表没对上`
    );
  }
});

test("routePath 带前导斜杠、不带末尾斜杠", () => {
  // 全站口径（astro.config.ts 的 trailingSlash: "never"）。带了末尾斜杠的话
  // sitemap 的 filter（`page.endsWith(routePath("search"))`）会一条都匹配不上。
  for (const key of Object.keys(ROUTES) as (keyof typeof ROUTES)[]) {
    const p = routePath(key);
    assert.ok(p.startsWith("/"), `${key} 的路径没有前导斜杠：${p}`);
    assert.ok(!p.endsWith("/"), `${key} 的路径带了末尾斜杠：${p}`);
    assert.ok(p.length > 1, `${key} 的路径是空的`);
  }
});

test("★ 前缀之间不许撞车：集合前缀和其余页面各占各的第一段", () => {
  // `/p` 给提示词、`/s` 给标的…… 撞一个的后果是其中一条路由整个消失，
  // 而 Astro 对"两条路由同一个地址"是**静默**取其一。
  const all = declared();
  assert.equal(
    new Set(all).size,
    all.length,
    `有前缀重复了：${all.join(" / ")} —— 撞车时 Astro 静默只留一条`
  );
});
