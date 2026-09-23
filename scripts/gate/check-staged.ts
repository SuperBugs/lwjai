/**
 * 发布闸 · 第二道：**提交前拦**（查 git 暂存区）。
 *
 * 装法：`pnpm hooks:install`（把 core.hooksPath 指到 scripts/hooks）。
 *
 * ## 为什么查暂存区，不查工作树
 *
 * 这两者会不一样，而且**差错的方向是致命的那一边**：
 *
 *   暂存了带泄露的版本 → 又把工作树改干净 → 查工作树：通过 → **泄露照样进了 commit**
 *
 * 反过来（暂存干净、工作树脏）只会多拦一次，是安全的方向。
 * 闸门宁可多拦，不许放过 —— 所以这里读的是 `git show :<path>`，也就是**即将被提交的
 * 那份字节**，不是磁盘上那份。
 *
 * ## 它拦不住什么（得说清楚）
 *
 *   - `git commit --no-verify` 能绕过。这是 git 的设计，钩子挡不住存心绕的人。
 *     真正的兜底是构建期那道（scripts/gate/check.ts），它跑在 Cloudflare 上，绕不过。
 *   - 它只看这次提交里**改动过的**稿子。历史里已经躺着的东西由构建期那道全量兜。
 *
 * ## 查哪些路径
 *
 * 过滤器从 `src/config/collections.ts` 的登记表生成（./inspect.ts 里的
 * `SCANNED_PATH_RE`），**不是手写一条锚定 posts 的正则**。2026-09-18 之前这里是
 * `/^src\/content\/posts\/.*\.mdx?$/`，而构建期那道是 `join()` 拼的绝对路径 ——
 * 两者之间没有任何共享符号，于是 pages 和后来新增的 qa 两道闸都不查，
 * 而且**改一边忘一边没有任何测试或类型会发现**。见 docs/gate.md 第 7 节的 `SC 13D` 事故。
 */

import { execFileSync } from "node:child_process";
import {
  inspect,
  report,
  scannedSpecForPath,
  SCANNED_PATH_RE,
  SCANNED_SPECS,
  BLD,
  DIM,
  RED,
  OFF,
  inspectDataJson,
  SCANNED_DATA_FILES,
  type ScanTally,
} from "./inspect";
import { STAGED_DIFF_ARGS, stagedPaths } from "./stagedPaths";

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

// ★ 登记表里一个要扫的集合都没有 = 这道闸的过滤器谁都匹配不上，
//   于是它会永远走"这次提交没有改动内容"那条静默放行的路。按故障处理。
if (SCANNED_SPECS.length === 0) {
  console.error(
    `${RED}${BLD}✗ 发布闸没跑起来${OFF}：登记表里没有任何 scanned: true 的集合。\n` +
      `  看 src/config/collections.ts —— 这道闸现在什么都不会查。`
  );
  process.exit(2);
}

/**
 * 即将被提交的路径清单。
 *
 * ★ 参数和切法都在 `./stagedPaths.ts` —— **`stagedFilter.test.ts` 读的是同一份**，
 *   它造一个临时仓库、真的 `git mv` 一次，断言改名过的那条路径确实在清单里。
 *   那个文件开头记着这一处 2026-09-21 出过的洞（`--diff-filter` 漏了 `R`）
 *   以及为什么用排除法而不是列举法。
 */
const stagedAll = stagedPaths(git([...STAGED_DIFF_ARGS]));

const staged = stagedAll
  // 范围和构建期那道同源，见文件开头。
  .filter(p => SCANNED_PATH_RE.test(p))
  // 下划线开头的不进 collection，跟着 content.config.ts 的 glob 走。
  .filter(p => !p.split("/").some(seg => seg.startsWith("_")));

// ★ 不按篇算的那几份数据文件（智能体与模型登记表、标签表）改了也要过闸：它们的字上公网。
//   名单从 collections.ts 来（SCANNED_DATA_FILES），和构建期那道同一份。
const dataStaged = SCANNED_DATA_FILES.filter(f => stagedAll.includes(f.path));

// ★ 这次提交没动任何内容 —— 这是"没有东西要查"，不是"查过了没问题"。
//   直接静默放行，但把话说出来，免得人以为闸门跑过了。
//   ⚠ 这句话里的集合名从登记表来，不是写死的"研究稿"。写死的那版在只提交 qa 的
//   commit 里会照常印「没有改动研究稿，跳过」—— **字面正确、语义骗人**：
//   稿子确实不是研究稿，但它也确实没被查，而人看到的是一句安心的话。
if (staged.length === 0 && dataStaged.length === 0) {
  console.log(
    `${DIM}发布闸：这次提交没有改动内容（${[
      ...SCANNED_SPECS.map(s => s.label),
      ...SCANNED_DATA_FILES.map(f => f.label),
    ].join(" / ")}），跳过。` + `（构建期还会全量再查一遍）${OFF}`
  );
  process.exit(0);
}

// 那几份数据文件同样读**索引里**那份。
const extra = dataStaged.map(f =>
  inspectDataJson(f.path, git(["show", `:${f.path}`]))
);

const reports = staged.map(path =>
  // `git show :<path>` 读的是**索引里**那份，不是磁盘上那份 —— 见文件开头。
  inspect(path, git(["show", `:${path}`]))
);

// 逐集合报数：这次提交里研究稿几篇、问答几篇。混成一个总数的话，
// "这次改的全是 qa"和"这次改的全是 posts"在屏幕上字节级相同。
const tally: ScanTally[] = SCANNED_SPECS.map(spec => ({
  spec,
  count: staged.filter(p => scannedSpecForPath(p)?.key === spec.key).length,
}));

// explainEmpty 不开：单次提交里某个集合 0 篇是常态，天天印"目录名是不是拼错了"
// 那句话，它就变成背景噪音，真正该被看见的那一次也会被一起无视掉。
const code = report(reports, { scope: "本次提交", tally, extra });
if (code !== 0) {
  console.error(
    `${DIM}（真要绕过：git commit --no-verify —— 但构建期那道拦得住，站不会更新。）${OFF}`
  );
}
process.exit(code);
