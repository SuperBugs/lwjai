/**
 * 一键起管理端：`pnpm admin`（起/复用）· `pnpm admin:restart`（强制重起）。
 *
 * 判据全在 ./adminPlan.ts（纯函数、有测试），这里只做 I/O：查端口、认进程、杀、
 * 清依赖缓存、起 `pnpm dev`、等到管理端真的能用了再开浏览器。
 *
 * ## 它比 `pnpm dev` 多干的三件事
 *
 * 1. **端口上已经有一台的时候不盲目再起一台。** 直接 `pnpm dev` 会因为 4321 被占
 *    而换端口（或者直接失败），于是你对着一个**不是后台那台**的地址发呆。
 * 2. **查一眼管理端是不是真的能用，而不是"端口通了就算好"。**
 *    【2026-09-20 踩到两次】白屏：HTTP 200、HTML 完好，只有依赖预打包缓存过期，
 *    React 岛水合不了。判据和那次的抓包都记在 adminPlan.ts 顶上。
 * 3. **重起的时候顺手删 `node_modules/.vite`。** 那次白屏就是靠这个治好的；
 *    `--restart` 走的正是同一条路。
 *
 * ## 不许动的边界：端口上不是我们的进程就不动手
 *
 * 这台机器上可能还有别的项目，端口上也可能趴着完全不相干的服务。
 * 所以杀之前一定先读进程命令行核对是不是**本项目的 astro dev**：
 *   - 是我们的 → 杀
 *   - 是别人的 → **不杀**，把 PID 和命令行原样印出来，退出码 3
 *   - 读不出来命令行（wmic/powershell 都没给出东西）→ **也不杀**，退出码 2
 * 第三档不许折进前两档：折进"别人的"是让你以为端口被占死了，折进"我们的"是拿
 * 一条猜测去 `taskkill /F`。
 *
 * ## ⚠ Astro 7 的 `astro dev` 会**自己转后台**，而且退出码是 0
 *
 * 【2026-09-20 实测】stdout 不是 TTY 的时候（脚本里 spawn、CI、被别的程序拉起来），
 * `astro dev` 打一行
 *   `Dev server running at http://127.0.0.1:4321 (pid 50564)`
 * 就**让父进程退出**，服务留在后台常驻。在真终端里双击 .cmd 跑则是前台挂着。
 *
 * 所以这里**不许把"子进程退了"当成失败**：第一版就是这么写的，屏幕上印
 * 「dev server 自己退了」+ 退出码 2，而 `astro dev status` 说它跑得好好的 ——
 * **谎报没起来**。现在只认一件事：**端口上那个管理端探着好不好使**。
 * 后台那一档起来之后还要把停的办法印出来（`astro dev stop`），
 * 否则下次就是"端口被一个我也不知道哪来的进程占着" —— 这个脚本要治的正是那个病。
 *
 * ## 退出码
 *
 *   0 管理端可用（新起的或复用的）
 *   2 我们这边没弄起来，或者拿不准（读不到命令行 / 探不动 / 起了但一直不健康）
 *   3 端口被**别的**进程占着 —— 一个字节都没动，等你自己决定
 */

import { execFileSync, spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  extractDepUrls,
  extractIslandUrls,
  extractVersionedModuleUrls,
  judge,
  ownsProject,
  parsePidList,
  parseWindowsListeners,
  type DepCheck,
  type Health,
} from "./adminPlan";

/** astro dev 的默认端口，也是 .claude/launch.json 里写的那个。 */
const PORT = 4321;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ADMIN_PATH = "/keystatic";
const WIN = process.platform === "win32";
const ROOT = process.cwd();

const BLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GRN = "\x1b[32m";
const YEL = "\x1b[33m";
const OFF = "\x1b[0m";

const say = (s = "") => console.log(s);
const tag = `${DIM}[管理端]${OFF}`;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  say(`用法：
  pnpm admin              起管理端；已经在跑而且好用就直接复用
  pnpm admin:restart      强制重起（杀掉旧的 + 删 node_modules/.vite + 重新起）

  --no-open               不要自动开浏览器
  --help                  这段

退出码：0 可用 · 2 没弄起来/拿不准 · 3 端口被别的进程占着（没动手）`);
  process.exit(0);
}
const FORCE_RESTART = args.includes("--restart");
const NO_OPEN = args.includes("--no-open");

// ── 查端口 ────────────────────────────────────────────────────────────────

function listeners(): number[] {
  try {
    if (WIN) {
      const out = execFileSync("netstat", ["-ano"], { encoding: "utf8" });
      return parseWindowsListeners(out, PORT);
    }
    const out = execFileSync(
      "lsof",
      ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN", "-t"],
      { encoding: "utf8" }
    );
    return parsePidList(out);
  } catch {
    // lsof 在没有任何匹配时退出码非 0；netstat 正常不会失败。两种都当"没人占"。
    return [];
  }
}

/** 拿不到就是 null —— 那是"不知道"，不是"不是我们的"。 */
function commandLineOf(pid: number): string | null {
  const tries: Array<() => string> = WIN
    ? [
        () =>
          execFileSync(
            "wmic",
            ["process", "where", `ProcessId=${pid}`, "get", "CommandLine"],
            { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
          ),
        () =>
          execFileSync(
            "powershell",
            [
              "-NoProfile",
              "-Command",
              `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
            ],
            { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
          ),
      ]
    : [
        () =>
          execFileSync("ps", ["-o", "command=", "-p", String(pid)], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
          }),
      ];

  for (const run of tries) {
    try {
      const out = run().trim();
      // wmic 会把表头 "CommandLine" 一起印出来，只有表头等于什么都没拿到。
      const body = out.replace(/^CommandLine\s*/i, "").trim();
      if (body !== "") return body;
    } catch {
      // 换下一种问法
    }
  }
  return null;
}

// ── 探健康 ────────────────────────────────────────────────────────────────

const get = (path: string) =>
  fetch(ORIGIN + path, { signal: AbortSignal.timeout(8000) });

/**
 * 顺着页面自己的模块链找出**浏览器真正会去取**的那些依赖地址，挨个请求一遍。
 *
 * 两级：`<astro-island>` 上的模块 → 它 import 的 `…?v=…` 模块 → `.vite/deps/*`。
 * 岛屿模块本身只 import 一个 `keystatic-astro-ui.js?v=…`，依赖藏在第二级里
 * （实测，2026-09-20）。取到的地址**原样**请求 —— 白屏的定义就是这些取不回来。
 */
async function collectDeps(html: string): Promise<DepCheck[]> {
  const depUrls = new Set<string>();

  for (const url of extractIslandUrls(html).slice(0, 4)) {
    const r = await get(url);
    // 岛屿模块自己就取不回来的话，白屏已经发生了，它自己就是一条坏依赖。
    if (!r.ok) return [{ url, status: r.status }];
    const js = await r.text();
    extractDepUrls(js).forEach(u => depUrls.add(u));

    for (const next of extractVersionedModuleUrls(js).slice(0, 3)) {
      const r2 = await get(next);
      if (!r2.ok) return [{ url: next, status: r2.status }];
      extractDepUrls(await r2.text()).forEach(u => depUrls.add(u));
    }
  }

  const out: DepCheck[] = [];
  for (const url of [...depUrls].slice(0, 8)) {
    const r = await get(url);
    out.push({ url, status: r.status });
  }
  return out;
}

async function probe(): Promise<Health> {
  try {
    const res = await get(ADMIN_PATH);
    if (res.status !== 200) return { kind: "bad-status", status: res.status };
    const html = await res.text();
    return judge({ status: res.status, html, deps: await collectDeps(html) });
  } catch (err) {
    return {
      kind: "unreachable",
      reason: (err as Error).message ?? String(err),
    };
  }
}

function describe(h: Health): string {
  switch (h.kind) {
    case "ok":
      return `${GRN}✓ 管理端可用${OFF} ${DIM}（页面引的依赖挨个取过，都在）${OFF}`;
    case "ok-unverified":
      return `${YEL}✓ 管理端页面在，但没查成${OFF}：${h.why}`;
    case "not-admin":
      return `${RED}✗ ${ADMIN_PATH} 返回 200，但那不是管理端页面${OFF}（HTML 里没有 astro-island）`;
    case "bad-status":
      return `${RED}✗ ${ADMIN_PATH} 返回 ${h.status}${OFF}`;
    case "stale-deps": {
      const lines = h.bad
        .map(d => `    ${d.status}  ${d.url.replace("/node_modules/.vite/deps/", "")}`)
        .join("\n");
      const what = h.bad.every(d => d.status === 504)
        ? "依赖预打包缓存过期"
        : "页面引的依赖取不回来";
      return (
        `${RED}✗ ${what}${OFF} ${DIM}（浏览器里的症状就是后台白屏）${OFF}\n${lines}`
      );
    }
    case "unreachable":
      return `${RED}✗ 探不动${OFF}：${h.reason}`;
  }
}

// ── 动手 ──────────────────────────────────────────────────────────────────

/**
 * 按 PID 硬杀。前台跑的和转了后台的都吃这一招。
 * 【2026-09-20 实测】硬杀之后 `astro dev status` 老实说 "No dev server is running."，
 * 不会留一份骗人的状态文件 —— 所以不用先去跑 `astro dev stop`。
 */
function kill(pid: number): void {
  if (WIN) {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    process.kill(pid, "SIGTERM");
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitPortFree(): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    if (listeners().length === 0) return true;
    await sleep(400);
  }
  return false;
}

function clearViteCache(): void {
  const dir = join(ROOT, "node_modules", ".vite");
  if (!existsSync(dir)) {
    say(`${tag} ${DIM}node_modules/.vite 本来就没有，不用删${OFF}`);
    return;
  }
  rmSync(dir, { recursive: true, force: true });
  say(`${tag} 删掉 node_modules/.vite ${DIM}（下次启动重新预打包，白屏就是这儿来的）${OFF}`);
}

function openBrowser(url: string): void {
  if (NO_OPEN) return;
  try {
    const [cmd, cmdArgs] = WIN
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
    spawn(cmd as string, cmdArgs as string[], {
      detached: true,
      stdio: "ignore",
    }).unref();
  } catch {
    // 开不了浏览器不算失败 —— 地址已经印在屏幕上了。
  }
}

function printRoutes(): void {
  say("");
  say(`  ${BLD}管理端${OFF}      ${ORIGIN}${ADMIN_PATH}`);
  say(`  ${DIM}发布闸预览    ${ORIGIN}/_gate${OFF}`);
  say(`  ${DIM}粘贴导入      ${ORIGIN}/_import${OFF}`);
  say(`  ${DIM}提交推送      ${ORIGIN}/_publish${OFF}`);
  say(`  ${DIM}发帖文案      ${ORIGIN}/_share${OFF}`);
  say("");
}

/**
 * 起一台，等到管理端真的能用为止。
 *
 * 两种结局都正常，取决于 astro 转不转后台（见文件顶上那一段）：
 *   - 前台：这个进程挂着 astro 的输出，Ctrl-C 一起停；
 *   - 后台：`pnpm dev` 立刻退（退出码 0），服务留着 —— 这时要把停的办法印出来。
 * 判"起没起来"只看端口上那个管理端探着好不好使，**不看子进程死活**。
 */
async function start(): Promise<void> {
  say(`${tag} 起 dev server…`);
  const child = spawn("pnpm dev", {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });

  // 放在对象里是为了躲开 TS 的控制流收窄（回调里赋的值它看不见）。
  const state: { exit: number | null } = { exit: null };
  const done = new Promise<void>(resolve => {
    child.on("exit", code => {
      state.exit = code ?? 0;
      resolve();
    });
  });

  // 冷启动要预打包 Keystatic 那一大坨依赖，给到 ~90 秒。
  let health: Health = { kind: "unreachable", reason: "还没开始探" };
  for (let i = 0; i < 45; i++) {
    await sleep(2000);
    health = await probe();
    if (health.kind === "ok" || health.kind === "ok-unverified") break;
    // 子进程非 0 退出**且**端口上没人 = 真没起来，不用等满 90 秒。
    if (state.exit !== null && state.exit !== 0 && listeners().length === 0) {
      break;
    }
  }

  say("");
  say(`${tag} ${describe(health)}`);

  if (health.kind !== "ok" && health.kind !== "ok-unverified") {
    say(
      `${tag} ${YEL}管理端一直没好${OFF}。${DIM}上面是 astro 的输出；` +
        `后台那一档看日志：pnpm exec astro dev logs${OFF}`
    );
    process.exitCode = 2;
    return;
  }

  printRoutes();
  openBrowser(ORIGIN + ADMIN_PATH);

  if (state.exit !== null) {
    // 后台常驻：这个脚本这就退了，服务还在。
    say(
      `${tag} ${DIM}dev server 在后台常驻（不占这个窗口）。` +
        `停：pnpm exec astro dev stop · 看日志：pnpm exec astro dev logs${OFF}`
    );
    return;
  }

  say(`${tag} ${DIM}Ctrl-C 停。${OFF}`);
  await done;
}

// ── 主流程 ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const pids = listeners();

  if (pids.length > 0) {
    const infos = pids.map(pid => ({ pid, cmd: commandLineOf(pid) }));

    const unknown = infos.filter(i => i.cmd === null);
    if (unknown.length > 0) {
      say(
        `${tag} ${RED}${BLD}不知道 ${PORT} 上是什么${OFF}：读不到 PID ` +
          `${unknown.map(i => i.pid).join(" / ")} 的命令行。`
      );
      say(`  ${DIM}没动它。自己看一眼再决定：${OFF}`);
      for (const i of unknown) say(`    tasklist /FI "PID eq ${i.pid}"`);
      process.exit(2);
    }

    const strangers = infos.filter(i => !ownsProject(i.cmd as string, ROOT));
    if (strangers.length > 0) {
      say(`${tag} ${RED}${BLD}端口 ${PORT} 被别的进程占着${OFF} —— 一个字节都没动。`);
      for (const i of strangers) {
        say(`  PID ${i.pid}  ${DIM}${i.cmd}${OFF}`);
      }
      say(
        `  ${DIM}这不是本项目的 astro dev。要真想让位，自己来：${OFF}\n` +
          strangers
            .map(i => `    ${WIN ? `taskkill /PID ${i.pid} /T /F` : `kill ${i.pid}`}`)
            .join("\n")
      );
      process.exit(3);
    }

    if (!FORCE_RESTART) {
      const health = await probe();
      say(`${tag} ${PORT} 上已经有一台本项目的 dev server（PID ${pids.join(" / ")}）`);
      say(`${tag} ${describe(health)}`);

      if (health.kind === "ok" || health.kind === "ok-unverified") {
        say(`${tag} ${DIM}复用它，没有重起。${OFF}`);
        printRoutes();
        openBrowser(ORIGIN + ADMIN_PATH);
        return;
      }

      if (health.kind === "stale-deps") {
        say(`${tag} 这一档是能自动治的 —— 杀掉重起。`);
      } else {
        // ★ 其余几种（探不动 / 不是管理端页面 / 非 200）**不自动杀**：
        //   原因多半不在"跑了太久"，杀一遍只是把证据一起扔掉。
        say(
          `${tag} ${YEL}没自动重起${OFF}：这一档的毛病不一定是"跑太久"，` +
            `先看上面那行。${DIM}确定要重来：pnpm admin:restart${OFF}`
        );
        process.exit(2);
      }
    }

    for (const pid of pids) {
      kill(pid);
      say(`${tag} 杀掉 PID ${pid}`);
    }
    if (!(await waitPortFree())) {
      say(`${tag} ${RED}端口 ${PORT} 一直没放开${OFF}，没接着起。`);
      process.exit(2);
    }
    clearViteCache();
  } else if (FORCE_RESTART) {
    say(`${tag} ${DIM}${PORT} 上本来就没人${OFF}`);
    clearViteCache();
  }

  await start();
}

void main();
