/**
 * 稿件体检 —— 入口与报告。判据在 ./formatRules.ts（纯函数、有单测）。
 *
 * ```
 * pnpm content:check            查工作树全量（pnpm build 第二步跑的就是它）
 * pnpm content:check --staged   查 git 暂存区（pre-commit 钩子跑的）
 * ```
 *
 * ## 它不是第四道发布闸
 *
 * 发布闸管「这段字该不该发出去」，它管「发出去之后长什么样」。两者**共用范围、
 * 不共用判据**：范围（扫哪些集合）从 `../gate/inspect` 拿现成的符号，
 * 因为 2026-09-18 那次事故的根因正是"两处各写一份扫描范围"——
 * `src/content/pages/about.md` 从建站起两道闸都没扫过，而屏幕上照常印绿勾
 * （docs/gate.md 第 7 节）。这里再写一份 `join(cwd, …)` 就是把那个坑重挖一遍。
 *
 * ## 为什么两处都卡
 *
 * pre-commit 那道给**即时反馈**（写完就知道），构建期那道**绕不过**
 * （`--no-verify` 跳过的钩子，Cloudflare 上还会再碰一次）。少了前者，问题要等到
 * 部署时才报；少了后者，它就只是一个提醒。
 *
 * ## `--staged` 不是开关
 *
 * 它换的是**读哪份字节**（索引 vs 磁盘），不是"要不要查"。这个脚本没有跳过它的
 * 办法 —— 没有环境变量、没有 `--force`，`formatRules.test.ts` 的 E 组钉着这件事
 * （docs/engineering-notes.md 红线 3：一个能被关掉的检查，迟早会在赶时间的那天被关掉）。
 *
 * ## 退出码三档，和发布闸对齐
 *
 *   0 —— 放行（可能带 warn 档提醒：还没填完，或者印出来难看但读得懂）
 *   1 —— 有稿子会长歪
 *   2 —— **体检自己没跑起来**（登记表空、目录找不到、一篇都没看到）
 *        这一档绝不许和 0 合并：路径写错会表现成"检查通过"，而它一个字节都没读。
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import matter from "gray-matter";
// ★ 范围（扫哪些集合、路径长什么样）和发布闸**共用这几个符号**，见文件头。
//   ⚠ 相对路径不是 `@/`：这个脚本是裸 tsx 跑的（pre-commit、Cloudflare 构建），
//     那里没有 Astro 的 tsconfig 别名解析。
import {
  SCANNED_SPECS,
  SCANNED_PATH_RE,
  scannedSpecForPath,
  BLD,
  DIM,
  GRN,
  OFF,
  RED,
  YEL,
} from "../gate/inspect";
import { findAgent } from "../../src/config/agents";
import { modelSlot } from "../../src/config/models";
import { checkFormat, type FormatFinding } from "./formatRules";

const STAGED = process.argv.includes("--staged");

interface FileReport {
  file: string;
  isDraft: boolean;
  found: FormatFinding[];
}

const abs = (dir: string) => join(process.cwd(), ...dir.split("/"));

const git = (args: string[]): string =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    // 下划线开头的不进 collection（content.config.ts 的 glob 是 `**/[^_]*.{md,mdx}`）。
    // 闸门跟的是同一条约定，这里也一样，否则会对着一堆模板片段报警。
    if (name.startsWith("_")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.mdx?$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * 一份稿子的原文 → 体检结果。
 *
 * ★ 「来源标没标」在这里判好再交给纯函数：判据是登记表的 `kind` 和 `modelSlot()`，
 *   **和站上那两张芯片同一份**。不许在 formatRules.ts 里比对 `agent === "human"`
 *   这种字面量（docs/engineering-notes.md 第二节）。
 */
function inspectFile(file: string, raw: string): FileReport {
  const { data, content } = matter(raw);
  const isDraft = data.draft === true;

  // 没有 agent 这一格的集合（教程 / 提示词 / 单页）两个都是 false ——
  // "这个集合本来就不讲谁写的"是完成态，不是待补。
  const hasAgentField = Object.hasOwn(data, "agent");
  const kind = hasAgentField
    ? findAgent(typeof data.agent === "string" ? data.agent : undefined)?.kind
    : undefined;
  const modelId = typeof data.model === "string" ? data.model : undefined;

  return {
    file,
    isDraft,
    found: checkFormat({
      body: content,
      draft: isDraft,
      source: {
        agentPending: hasAgentField && kind === "unspecified",
        modelPending:
          hasAgentField && modelSlot(kind, modelId).tier === "unspecified",
      },
    }),
  };
}

// ── 收集要看的文件 ────────────────────────────────────────────────────────

if (SCANNED_SPECS.length === 0) {
  console.error(
    `${RED}${BLD}✗ 稿件体检没跑起来${OFF}：登记表里没有任何 scanned: true 的集合。\n` +
      `  看 src/config/collections.ts —— 它现在一篇都不会看。`
  );
  process.exit(2);
}

const reports: FileReport[] = [];
const tally = new Map<string, number>(SCANNED_SPECS.map(s => [s.key, 0]));

if (STAGED) {
  const staged = git(["diff", "--cached", "--name-only", "--diff-filter=ACM"])
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean)
    .filter(p => SCANNED_PATH_RE.test(p))
    .filter(p => !p.split("/").some(seg => seg.startsWith("_")));

  if (staged.length === 0) {
    // 这次提交没动内容 —— 是"没有东西要看"，不是"看过了没问题"。把话说出来。
    console.log(
      `${DIM}稿件体检：这次提交没有改动内容（${SCANNED_SPECS.map(s => s.label).join(" / ")}），跳过。` +
        `（构建期还会全量再看一遍）${OFF}`
    );
    process.exit(0);
  }
  for (const path of staged) {
    // `git show :<path>` 读的是**索引里**那份 —— 和发布闸第二道同一条理由：
    // 暂存了坏的、又把工作树改好，查工作树会放过它。
    reports.push(inspectFile(path, git(["show", `:${path}`])));
    const key = scannedSpecForPath(path)?.key;
    if (key) tally.set(key, (tally.get(key) ?? 0) + 1);
  }
} else {
  const missing = SCANNED_SPECS.filter(s => {
    const p = abs(s.dir);
    return !existsSync(p) || !statSync(p).isDirectory();
  });
  if (missing.length > 0) {
    console.error(
      `${RED}${BLD}✗ 稿件体检没跑起来${OFF}：有登记在册的内容目录找不到。`
    );
    for (const s of missing) console.error(`  ${s.label}（${s.key}）—— 期望 ${abs(s.dir)}`);
    console.error(
      `  这不是"这个集合还没有内容" —— 是它根本没看到那个目录。\n` +
        `  ${DIM}去 src/config/collections.ts 把 dir 改对；登记表是唯一的一份。${OFF}`
    );
    process.exit(2);
  }
  for (const spec of SCANNED_SPECS) {
    const files = walk(abs(spec.dir));
    tally.set(spec.key, files.length);
    for (const file of files) {
      const rel = relative(process.cwd(), file).split(sep).join("/");
      reports.push(inspectFile(rel, readFileSync(file, "utf8")));
    }
  }
  if (reports.length === 0) {
    console.error(
      `${RED}${BLD}✗ 一篇都没看到${OFF}\n` +
        SCANNED_SPECS.map(s => `  ${s.label} —— ${s.dir}\n`).join("") +
        `  这**不是**"通过" —— 体检没有东西可看。`
    );
    process.exit(2);
  }
}

// ── 报告 ──────────────────────────────────────────────────────────────────
//
// ★ 篇数逐集合报，和发布闸同一条理由：混成一个总数之后，"问答 0 篇"就藏在一个
//   不可读的数字里，而目录名拼错恰恰表现成"总数还是那么多、看过了、通过"。

const breakdown = SCANNED_SPECS.map(s => `${s.label} ${tally.get(s.key) ?? 0} 篇`).join(
  ` ${DIM}·${OFF} `
);
const drafts = reports.filter(r => r.isDraft).length;

console.log(
  `\n${BLD}稿件体检${OFF} ${DIM}(${STAGED ? "本次提交" : "工作树"})${OFF}  ${breakdown}` +
    `  ${DIM}共 ${reports.length} 篇，其中草稿 ${drafts} 篇${OFF}`
);

const blocked = reports.filter(r => r.found.some(f => f.tier === "block"));
const warned = reports.filter(r => r.found.some(f => f.tier === "warn"));

const printFinding = (f: FormatFinding, log: (s: string) => void) => {
  const where = f.line > 0 ? `第 ${f.line} 行` : "整篇";
  log(`  ${BLD}${f.code}${OFF}  ${where}${f.excerpt ? `  「${f.excerpt}」` : ""}`);
  // 每条都摆出"为什么" —— 只说一句不通过，等于让人去删掉正确的句子。
  log(`    ${DIM}${f.why}${OFF}`);
};

for (const r of blocked) {
  console.error(`\n${RED}${BLD}✗ ${r.file}${OFF}`);
  for (const f of r.found.filter(f => f.tier === "block")) {
    printFinding(f, s => console.error(s));
  }
}

if (warned.length > 0) {
  // ⚠ 这句话**不许收窄回"还没填完"**：warn 档里是两类东西 —— 还没填完（来源没标、
  //   章节级别不对）和印出来难看但读得懂、改得动（stray_backslash，【2026-09-22】
  //   定死为长期 warn）。写成"还没填完"，后者在屏幕上就被说成了别的东西。
  console.log(`\n${YEL}${BLD}⚠ 能发，但这几处你要知道${OFF}`);
  for (const r of warned) {
    console.log(`  ${r.file}`);
    for (const f of r.found.filter(f => f.tier === "warn")) {
      printFinding(f, s => console.log(s));
    }
  }
}

if (blocked.length > 0) {
  console.error(
    `\n${RED}${BLD}拦下了${OFF}：${blocked.length} 篇发出去会是坏页面。\n` +
      `${DIM}  每条都写着坏在哪、怎么改。这道检查没有开关 —— 改稿子，不是改判据。\n` +
      `  真觉得某条规则的边界划错了：改 scripts/content/formatRules.ts，\n` +
      `  并往 formatRules.test.ts 的 B 组（不许误伤）补一条从真实稿子里抄来的用例。${OFF}\n`
  );
  process.exit(1);
}

// ★ 收尾必须分两档。压成一句 ✓ 是这个项目点名禁止的（docs/engineering-notes.md 第二节）：
//   "一处都没有"和"有 3 处待补"在屏幕上必须长得不一样。
const warnCount = warned.reduce(
  (s, r) => s + r.found.filter(f => f.tier === "warn").length,
  0
);
if (warnCount > 0) {
  console.log(
    `\n${YEL}${BLD}✓ 放行，但有 ${warnCount} 处要你看一眼${OFF}${DIM}（上面逐条列着 —— 不是"一处都没有"）${OFF}\n`
  );
} else {
  console.log(
    `${GRN}✓ 没发现会让页面长歪的写法${OFF} ${DIM}—— 注意：只钉了六种已知写法，这不等于"排版是对的"。${OFF}\n`
  );
}
process.exit(0);
