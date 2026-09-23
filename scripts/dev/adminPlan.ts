/**
 * 「一键起管理端」的**判据**：端口上那个进程是不是我们的、管理端是不是真的能用。
 * 纯函数、零 I/O —— ./admin.test.ts 喂的是真机上抓下来的 netstat / HTML / 模块源码 /
 * 网络面板。真去跑 netstat、taskkill、pnpm dev 的在 ./admin.ts。
 *
 * ## 为什么要有这一层判据，而不是"端口通了就算好"
 *
 * 【2026-09-20 踩到两次】后台白屏：`/keystatic` **HTTP 200、HTML 一字不差**，
 * 只有浏览器里那几个 `/node_modules/.vite/deps/*.js?v=<哈希>` 拿到 504
 * （`Outdated Optimize Dep`），React 岛水合不了，整页空白。起因是那台 dev server
 * 已经跑了 40 小时，而磁盘上的依赖预打包缓存在这期间被换掉了。
 *
 * 也就是说：**「端口在听」「HTTP 200」两条都为真，而管理端是坏的。**
 * 只看这两条的脚本会印一个绿勾 —— 这正是这个项目最忌讳的那种"看起来没事"。
 *
 * ## 判法：顺着页面自己的模块链走一遍，取不回来就是坏
 *
 * 不比哈希。第一版是拿页面引的 `?v=` 和 `node_modules/.vite/deps/_metadata.json`
 * 的 `browserHash` 对，**实测这个 oracle 是错的**：同一台好端端的服务器上，
 * 磁盘元数据写着 `db834041`，而页面真正在用的是 `13a477aa` / `8ab35016`，
 * 拿 `db834041` 去请求反而 504。三个数各有各的来历，谁也不等于谁。
 *
 * 现在只做一件事：从 `<astro-island>` 的模块地址出发，顺着 `import` 往下走两级，
 * 把页面**真正会去取的**那些依赖地址挨个请求一遍。
 *   - 有 504 → 就是白屏那一种（浏览器拿到的正是这个）
 *   - 全 2xx → 好的
 * 白屏的**症状定义**本来就是"页面引的那个地址取不回来"，照着症状查最省事，
 * 也不依赖 Vite 内部那几个哈希将来怎么改。
 *
 * ## 三档，不许压成两档
 *
 * `ok` / `stale-deps` 之外一定要有 `ok-unverified`：模块链上一个依赖地址都没找到时
 * （上游换了打包方式、Keystatic 换了挂载法），**我们是没查成，不是查过没事**。
 * 压成 `ok` 的后果是：哪天这条判据自己失效了，屏幕上还是那个绿勾。
 */

/** 页面模块链上真实引到的一条依赖地址，连同它的响应码。 */
export interface DepCheck {
  url: string;
  status: number;
}

/** 探针取回来的原料。全是字符串和数字，好让测试直接喂真实抓包。 */
export interface Probe {
  /** `/keystatic` 的响应码。 */
  status: number;
  /** `/keystatic` 的 HTML 正文。 */
  html: string;
  /** 顺着模块链取到的依赖地址各自的响应码。一条都没找到就是空数组。 */
  deps: DepCheck[];
}

export type Health =
  | { kind: "ok" }
  /** 页面在、但"依赖取不取得回来"这条**没查成**。不是"没事"。 */
  | { kind: "ok-unverified"; why: string }
  /** 200 但那不是管理端页面（比如路由没挂上，落到站内 404）。 */
  | { kind: "not-admin" }
  | { kind: "bad-status"; status: number }
  /** 就是白屏那一种：页面引的依赖取不回来（504 = 预打包缓存过期）。 */
  | { kind: "stale-deps"; bad: DepCheck[] }
  /** 连不上 / 超时。由 I/O 那层造，judge 不产出这一档。 */
  | { kind: "unreachable"; reason: string };

export function judge(probe: Probe): Health {
  if (probe.status !== 200) return { kind: "bad-status", status: probe.status };
  if (extractIslandUrls(probe.html).length === 0) return { kind: "not-admin" };

  if (probe.deps.length === 0) {
    return {
      kind: "ok-unverified",
      why: "模块链上没找到预打包依赖的地址（上游可能换了打包方式），没法核实",
    };
  }

  const bad = probe.deps.filter(d => d.status < 200 || d.status >= 300);
  if (bad.length > 0) return { kind: "stale-deps", bad };
  return { kind: "ok" };
}

/**
 * Astro 的 `<astro-island>` 上那两条模块地址。管理端页面**必然**有这个标签
 * （Keystatic 整个是个 React 岛）；站内 404 页没有 —— 这就是 not-admin 那一档的判据。
 */
export function extractIslandUrls(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/(?:component|renderer)-url="([^"]+)"/g)) {
    out.push(m[1]);
  }
  return [...new Set(out)];
}

/** 模块源码里引到的预打包依赖地址 —— 这些就是浏览器会去取、坏了就白屏的那批。 */
export function extractDepUrls(js: string): string[] {
  const out: string[] = [];
  for (const m of js.matchAll(/\/node_modules\/\.vite\/deps\/[^"'`\s)]+/g)) {
    out.push(m[0]);
  }
  return [...new Set(out)];
}

/**
 * 模块源码里引到的**其他** `/node_modules/` 模块（带 `?v=` 的那些）。
 * 依赖地址往往藏在第二级：岛屿模块只 import 一个
 * `@keystatic/astro/dist/keystatic-astro-ui.js?v=…`，`.vite/deps/*` 在它里面。
 */
export function extractVersionedModuleUrls(js: string): string[] {
  const out: string[] = [];
  for (const m of js.matchAll(/\/node_modules\/[^"'`\s)]*\?v=[0-9a-f]+/g)) {
    if (m[0].includes("/.vite/deps/")) continue;
    out.push(m[0]);
  }
  return [...new Set(out)];
}

/**
 * `netstat -ano` 里**正在监听**这个端口的 PID。
 *
 * ⚠ 比对的是整段端口号，不是 `endsWith(":4321")` —— `127.0.0.1:54321` 也以
 * `4321` 结尾，而那可能是别人的服务，误判的后果是**去杀一个不相干的进程**。
 * 只收 LISTENING：同一个端口上还会有一堆 ESTABLISHED / TIME_WAIT 行，
 * 它们的 PID 是**浏览器那一侧**的。
 */
export function parseWindowsListeners(netstat: string, port: number): number[] {
  const pids: number[] = [];
  for (const line of netstat.split("\n")) {
    const cols = line.trim().split(/\s+/);
    // TCP  <本地>  <远端>  <状态>  <PID>，UDP 行没有状态列，长度不够直接跳过。
    if (cols.length < 5) continue;
    if (cols[0].toUpperCase() !== "TCP") continue;
    if (cols[3].toUpperCase() !== "LISTENING") continue;
    const colon = cols[1].lastIndexOf(":");
    if (colon < 0) continue;
    if (cols[1].slice(colon + 1) !== String(port)) continue;
    const pid = Number(cols[4]);
    if (Number.isInteger(pid) && pid > 0) pids.push(pid);
  }
  return [...new Set(pids)];
}

/** `lsof -t` 那种一行一个 PID 的输出（mac / Linux 那条路）。 */
export function parsePidList(text: string): number[] {
  const pids = text
    .split("\n")
    .map(l => Number(l.trim()))
    .filter(n => Number.isInteger(n) && n > 0);
  return [...new Set(pids)];
}

/**
 * 端口上那个进程**是不是本项目的 astro dev**。
 *
 * 这条判据唯一的用处就是决定"能不能杀"。答案是"不是"的时候脚本**不动手**，
 * 把 PID 和命令行原样印出来让人自己决定 —— 端口上趴着的可能是别的项目的
 * dev server（这台机器上可能还有别的项目），也可能是完全不相干的服务。
 *
 * ⚠ 目录比对必须带结尾的 `/`：`c:/work/lwjai-old/...` 的命令行里
 * **包含** `c:/work/lwjai` 这个子串，不带边界就会把隔壁项目当成自己的。
 */
export function ownsProject(cmdline: string, projectDir: string): boolean {
  const norm = (s: string) => s.replace(/\\/g, "/").toLowerCase();
  const cmd = norm(cmdline);
  const dir = norm(projectDir).replace(/\/+$/, "") + "/";
  if (!cmd.includes(dir)) return false;
  // 只认 astro 的 dev：同一个目录下还会有 tsx 跑的闸门、测试、pagefind 等等，
  // 那些不该被"重启管理端"这个动作杀掉（它们也不会占着 4321，双保险）。
  return cmd.includes("astro") && /\bdev\b/.test(cmd);
}
