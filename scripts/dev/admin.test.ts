/**
 * `pnpm admin` / `pnpm admin:restart` 的判据测试（scripts/dev/adminPlan.ts）。
 *
 * 喂进去的都是**真机上抓下来的**东西：2026-09-20 那台 dev server 的 netstat 行、
 * wmic 给的命令行、`/keystatic` 的 HTML 片段、岛屿模块的头几行、
 * `node_modules/.vite/deps/_metadata.json` 里的 browserHash。
 * 不照着正则反推用例 —— 那是 docs/engineering-notes.md 第三节点名的那种翻车法。
 *
 * 钉四件事：
 *   1. 端口只认整段端口号 + 只认 LISTENING（认错 = 去杀一个不相干的进程）；
 *   2. 只有**本项目**的 astro dev 算"我们的"（含 laowanjia-old 这种前缀陷阱）；
 *   3. 白屏那一次（页面引旧哈希）必须判成 stale-deps；
 *   4. **查不成的时候不许说 ok** —— 元数据读不到 / 引用取不到都走 ok-unverified。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractDepUrls,
  extractIslandUrls,
  extractVersionedModuleUrls,
  judge,
  ownsProject,
  parsePidList,
  parseWindowsListeners,
} from "./adminPlan";

// 2026-09-20 真机 `netstat -ano` 的片段：一台 dev server 在听 4321，浏览器那边
// 一堆 ESTABLISHED，外加一个**端口尾巴长得很像**的 54321 和一行 UDP。
const NETSTAT = [
  "",
  "活动连接",
  "",
  "  协议  本地地址          外部地址        状态           PID",
  "  TCP    127.0.0.1:4321         0.0.0.0:0              LISTENING       46172",
  "  TCP    127.0.0.1:4321         127.0.0.1:55160        ESTABLISHED     46172",
  "  TCP    127.0.0.1:4321         127.0.0.1:55161        TIME_WAIT       0",
  "  TCP    127.0.0.1:54321        0.0.0.0:0              LISTENING       9999",
  "  TCP    [::1]:4321             [::]:0                 LISTENING       46172",
  "  UDP    127.0.0.1:4321         *:*                                    1234",
].join("\n");

// wmic 真实输出（去掉表头之后）。注意中间那串 `.bin\..\astro`：pnpm 的 shim 就长这样。
const OUR_DEV =
  'node   "C:\\work\\lwjai\\node_modules\\.bin\\\\..\\astro\\bin\\astro.mjs" dev';

// `/keystatic` 的 HTML 里那对模块地址（真实，含 pnpm 的长目录名）。
const ADMIN_HTML = `<astro-island uid="1oQZSW" component-url="/node_modules/.pnpm/@keystatic+astro@6.0.0_@keystatic+core@0.6.9_@keystar+ui@0.10.0_react-aria@3.50.0_react-dom@1_brl73azt4cniovqtdidw7xrkle/node_modules/@keystatic/astro/internal/keystatic-page.js" component-export="Keystatic" renderer-url="/node_modules/.pnpm/@astrojs+react@6.0.6_@types+node@22.20.3_@types+react-dom@19.3.0_@types+react@19.3.0__@types+_un45wbu6xcyaggpjav7bvyxvoq/node_modules/@astrojs/react/dist/client.js" props="{}"></astro-island>`;

// 岛屿模块的真实头部（Vite 转换过的）。
const ISLAND_JS = `import { makePage } from "/node_modules/.pnpm/@keystatic+astro@6.0.0_@keystatic+core@0.6.9_@keystar+ui@0.10.0_react-aria@3.50.0_react-dom@1_brl73azt4cniovqtdidw7xrkle/node_modules/@keystatic/astro/dist/keystatic-astro-ui.js?v=09032672";
// eslint-disable-next-line import/no-unresolved
import config from "/keystatic.config.ts";
export const Keystatic = makePage(config);`;

// 第二级模块（keystatic-astro-ui.js）里引的预打包依赖，地址是真实抓到的。
const UI_JS = `import { jsxs, jsx } from "/node_modules/.vite/deps/react_jsx-runtime.js?v=8ab35016";
import * as React from "/node_modules/.vite/deps/react.js?v=8ab35016";
import { Config } from "/node_modules/.vite/deps/@keystatic_core_ui.js?v=13a477aa";
export function makePage(config) { return () => jsx(Config, { config }); }`;

/** 2026-09-20 白屏那次，网络面板里 504 的那条地址。 */
const STALE_URL = "/node_modules/.vite/deps/react.js?v=06b390fb";

test("端口：只收 LISTENING，且端口号整段相等", () => {
  assert.deepEqual(parseWindowsListeners(NETSTAT, 4321), [46172]);

  // ★ 54321 那行不许被算进来。写成 endsWith(":4321") 就会把它收进去，
  //   而下一步是 taskkill /F —— 杀的是别人的 9999。
  assert.ok(!parseWindowsListeners(NETSTAT, 4321).includes(9999));

  // 反过来查 54321 只应该拿到 9999，拿不到 dev server 那台。
  assert.deepEqual(parseWindowsListeners(NETSTAT, 54321), [9999]);

  // 没人占的端口：空数组，不是抛错。
  assert.deepEqual(parseWindowsListeners(NETSTAT, 4322), []);
});

test("端口：lsof -t 那种一行一个 PID 的输出", () => {
  assert.deepEqual(parsePidList("46172\n46172\n\n881\n"), [46172, 881]);
  assert.deepEqual(parsePidList(""), []);
});

test("认进程：只有本项目的 astro dev 算我们的", () => {
  assert.equal(ownsProject(OUR_DEV, "C:\\work\\lwjai"), true);
  // 结尾多一个分隔符、正反斜杠混写都要认。
  assert.equal(ownsProject(OUR_DEV, "C:/work/lwjai/"), true);

  // 隔壁项目（同一台机器上的另一个项目）。
  assert.equal(
    ownsProject(
      'node "C:\\work\\other-project\\node_modules\\astro\\bin\\astro.mjs" dev',
      "C:\\work\\lwjai"
    ),
    false
  );

  // ★ 前缀陷阱：laowanjia-old 的命令行里**包含** "c:/work/lwjai" 这个子串。
  //   目录比对不带结尾斜杠的话，这里会返回 true，然后去杀隔壁那台。
  assert.equal(
    ownsProject(
      'node "C:\\work\\lwjai-old\\node_modules\\astro\\bin\\astro.mjs" dev',
      "C:\\work\\lwjai"
    ),
    false
  );

  // 本项目目录下、但不是 dev server 的进程（闸门、测试、构建）一律不算。
  assert.equal(
    ownsProject(
      'node "C:\\work\\lwjai\\node_modules\\tsx\\dist\\cli.mjs" scripts/gate/check.ts',
      "C:\\work\\lwjai"
    ),
    false
  );
  assert.equal(
    ownsProject(
      'node "C:\\work\\lwjai\\node_modules\\.bin\\..\\astro\\bin\\astro.mjs" build',
      "C:\\work\\lwjai"
    ),
    false
  );
});

test("页面：认得出管理端那个岛，站内 404 页认不出来", () => {
  assert.equal(extractIslandUrls(ADMIN_HTML).length, 2);
  assert.ok(
    extractIslandUrls(ADMIN_HTML)[0].includes("@keystatic/astro/internal")
  );
  assert.deepEqual(
    extractIslandUrls('<main><h1>404</h1><p>这个地址上没有东西</p></main>'),
    []
  );
});

test("模块链：第一级只引下一个模块，依赖在第二级", () => {
  // 岛屿模块里没有 .vite/deps —— 只看第一级就会得出"一个依赖都没有"。
  assert.deepEqual(extractDepUrls(ISLAND_JS), []);
  assert.deepEqual(extractVersionedModuleUrls(ISLAND_JS), [
    "/node_modules/.pnpm/@keystatic+astro@6.0.0_@keystatic+core@0.6.9_@keystar+ui@0.10.0_react-aria@3.50.0_react-dom@1_brl73azt4cniovqtdidw7xrkle/node_modules/@keystatic/astro/dist/keystatic-astro-ui.js?v=09032672",
  ]);

  // 第二级才是浏览器真正要取的那批。
  assert.deepEqual(extractDepUrls(UI_JS), [
    "/node_modules/.vite/deps/react_jsx-runtime.js?v=8ab35016",
    "/node_modules/.vite/deps/react.js?v=8ab35016",
    "/node_modules/.vite/deps/@keystatic_core_ui.js?v=13a477aa",
  ]);
  // .vite/deps 的地址不许再被当成"下一级要跟进去的模块"（会多跑一轮）。
  assert.deepEqual(extractVersionedModuleUrls(UI_JS), []);
});

test("判据：页面引的依赖挨个取回来了就是好的", () => {
  assert.deepEqual(
    judge({
      status: 200,
      html: ADMIN_HTML,
      deps: extractDepUrls(UI_JS).map(url => ({ url, status: 200 })),
    }),
    { kind: "ok" }
  );
});

test("判据：2026-09-20 那次白屏必须判成 stale-deps", () => {
  // 当时的现场：HTTP 200、HTML 完好、岛也在，只有依赖回 504。
  const h = judge({
    status: 200,
    html: ADMIN_HTML,
    deps: [
      { url: "/node_modules/.vite/deps/@keystatic_core.js?v=06b390fb", status: 504 },
      { url: STALE_URL, status: 504 },
    ],
  });
  assert.equal(h.kind, "stale-deps");
  assert.ok(h.kind === "stale-deps" && h.bad.length === 2);
});

test("判据：只要有一条取不回来就是坏的（别被其余的 200 盖过去）", () => {
  const h = judge({
    status: 200,
    html: ADMIN_HTML,
    deps: [
      { url: "/node_modules/.vite/deps/react.js?v=8ab35016", status: 200 },
      { url: STALE_URL, status: 504 },
    ],
  });
  assert.equal(h.kind, "stale-deps");
  assert.deepEqual(h.kind === "stale-deps" && h.bad, [
    { url: STALE_URL, status: 504 },
  ]);
});

test("判据：一条依赖地址都没找到 —— 没查成，不许说 ok", () => {
  // 上游换了打包方式、或者 Keystatic 换了挂载法就会走到这。
  // 压成 ok 的后果是：这条判据自己失效了，屏幕上还是那个绿勾。
  const h = judge({ status: 200, html: ADMIN_HTML, deps: [] });
  assert.equal(h.kind, "ok-unverified");
});

test("判据：不是管理端页面 / 非 200 各自一档", () => {
  assert.deepEqual(
    judge({ status: 200, html: "<main><h1>404</h1></main>", deps: [] }),
    { kind: "not-admin" }
  );
  assert.deepEqual(judge({ status: 500, html: "", deps: [] }), {
    kind: "bad-status",
    status: 500,
  });
});
