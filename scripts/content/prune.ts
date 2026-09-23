/**
 * 批量清理：**按时间段删老稿**。
 *
 * ```
 * pnpm content:prune --to 2025-12-31                  # 只列出来，什么都不删
 * pnpm content:prune --from 2025-01-01 --to 2025-06-30 --collections posts,qa
 * pnpm content:prune --to 2025-12-31 --yes            # 真删
 * ```
 *
 * ⚠ 命令名**不能**叫 `prune`：`pnpm prune` 是 pnpm 的内置命令（删 node_modules 里
 *   多余的包），内置的优先 —— `pnpm prune --to 2025-12-31` 会去跑装包那套，
 *   **一句报错都没有**，只印两行「Already up to date」，而你以为自己清理过内容了。
 *
 * ## 这个工具的形状，以及为什么它不是后台里的一个按钮
 *
 * Keystatic 的 config 里 `ui` 只有 `brand` 和 `navigation` 两个口子
 * （`@keystatic/core` 的 `config.d.ts`）—— **没有自定义页面，也没有列表页的批量操作**。
 * 想在后台里加一个"批量清理"按钮就得 fork 它。另一条路（在 `astro dev` 里注入一条
 * 会删文件的 POST 路由）要在这个站里放一个服务端端点，和 README 那三个"没有"
 * 里的「没有服务端」直接相冲，还得靠一个 `isDev` 守卫拦着它别进生产构建 ——
 * 一个会删东西的端点，那道守卫的代价比它省下的点击多得多。
 *
 * 所以它是一条命令。代价是没有勾选框；收益是判据能单测、每次执行都留在 shell 历史里、
 * 而公网和生产构建**一个字节都没变**。
 *
 * ## 四道安全设计（每一条都对着一个真实的失败模式）
 *
 * 0. **删之前先打包备份，而且验过包才动手**（./backup.ts）。没有关掉它的参数。
 *    顺序不许调：先打包 → 验包 → 再删。反过来做省不了任何事，却会制造出
 *    "文件已经没了、包也没有"这个唯一不可挽回的状态。
 *    验证分三档，屏幕上和退出码上都长得不一样（理由见 backup.ts）：
 *      独立实现复核过 → 照常删；只自校验过 → 黄字说明，而且这一批里若有"只有包里有"
 *      的条目（git 里没有）就**停手**；独立实现说包有问题 → 失败，一个字节都不删。
 * 1. **默认只列不删。** 真删要 `--yes`。没有 `--dry-run` 这个参数 —— 默认就是。
 *    不认识的参数一律报错，免得"加上 --dry-run 就安全"变成一种肌肉记忆。
 * 2. **git 里没有备份的不删。** 这个站没有数据库，备份就是仓库本身
 *    （README：「备份 = 仓库本身」）。删一份从未提交过的文件是**真的没了**，
 *    而删一份已提交的只是 `git checkout --` 一句话 —— 两者在磁盘上长得一模一样，
 *    所以必须由工具分开：未跟踪 / 有未提交改动的条目会让**整批**中止，
 *    除非明确给 `--allow-uncommitted`。
 *    ⚠ 判据是"git 里有没有"，而且是**正着问**（`git ls-files` 列出它跟踪的那些），
 *    不是"不在 `git status` 里就算干净"。后者在 git 调不起来、或者路径对不上时
 *    会把**每一个文件都判成已备份**，安全闸静默打开。失败方向必须是"拒绝删"。
 * 3. **不碰 git，不自动提交。** docs/engineering-notes.md 红线 2。删完之后要不要提交、什么时候推，
 *    是人的决定。
 *
 * ## 时间口径
 *
 * `--from` / `--to` 是**站点时区的日界**（`astro-paper.config.ts`，现在是北京时间），
 * 两端都含。frontmatter 里的 `pubDatetime` 是 UTC，两者差 8 小时 ——
 * 换算、以及为什么不能图省事按 UTC 切，都写在 ./plan.ts 开头。
 * ★ 屏幕上那一行会把当前口径和换算出来的 UTC 区间一起印出来，别靠记忆。
 *
 * ## 退出码（三档，刻意分开）
 *
 *   0 —— 正常（列完了 / 删完了 / 命中 0 条）
 *   1 —— **拒绝执行**：参数不对，或者有候选条目在 git 里还没有备份
 *   2 —— **工具没跑起来**：登记目录不存在、git 问不出来、一个内容文件都没枚举到
 *
 * 第 2 档绝不许和 0 合并：一次目录名写错会表现成"这个区间里没有老稿"，
 * 而工具其实一个文件都没看见。
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, posix, relative, sep } from "node:path";
import matter from "gray-matter";
import siteConfig from "../../astro-paper.config";
import { requireCollectionSpec } from "../../src/config/collections";
import {
  backup,
  BackupError,
  collectSourcePaths,
  listAllFiles,
  resolveBackupDir,
  totalBytes,
  type BackupTarget,
} from "./backup";
import {
  formatInTz,
  parseArgs,
  parseDayRange,
  pick,
  plan,
  PRUNABLE_KEYS,
  UsageError,
  type Candidate,
  type DayRange,
  type GitState,
  type Planned,
  type PruneOptions,
} from "./plan";

// 和 scripts/gate/inspect.ts 里是同一组 ANSI 转义。**刻意不共享** ——
// 让一个会删文件的工具 import 发布闸的核心模块，等于把两件无关的东西绑在一起：
// 闸门那边一个语法错误就会让清理跑不起来。颜色不是判据，抄一份没有代价。
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const YEL = "\x1b[33m";
const GRN = "\x1b[32m";
const BLD = "\x1b[1m";
const OFF = "\x1b[0m";

const HELP = `
${BLD}批量清理${OFF} —— 按时间段删老稿。${BLD}默认只列不删。${OFF}

  pnpm content:prune --to 2025-12-31                     列出 2025-12-31（北京时间）及之前的全部
  pnpm content:prune --from 2025-01-01 --to 2025-06-30   列出这个区间的
  pnpm content:prune --to 2025-12-31 --yes               真删

  --from <YYYY-MM-DD>     起始日，含。**按站点时区的日界**（现在是北京时间）
  --to   <YYYY-MM-DD>     结束日，含。同上
  --collections a,b       只清理这几个集合（默认全部：${PRUNABLE_KEYS.join(" / ")}）
  --yes                   真的删。不给就只列出来
  --include-featured      把置顶的条目也纳入（默认保护）
  --allow-uncommitted     允许删 git 里还没有备份的那一份（默认拒绝整批）
  --backup-dir <目录>     备份包落在哪（默认 .backups/content/，可以指到别的盘）
  -h, --help              这段

至少要给 --from 或 --to 之一 —— 不给区间不会默认删全部。
删掉的 .md 和它的配图目录 src/assets/<集合>/<slug>/ 一起删。

${BLD}删之前一定会先打包备份，而且验过包才动手。${OFF}没有关掉它的参数 ——
包写不出来或者验不过，结果就是一个字节都不删。恢复：tar -xzf <包> -C .

不会碰 git：要让公网也消失，删完之后还得自己 commit + push（或本机构建 + 部署）。
`;

const abs = (repoRelative: string) =>
  join(process.cwd(), ...repoRelative.split("/"));
const toPosix = (p: string) => p.split(sep).join("/");
/** 报错信息只取第一行 —— 子进程和 fs 的错误常拖一屏堆栈，塞进报表里没人读得下去。 */
const firstLine = (s: string) => s.split(/\r?\n/)[0] ?? s;
/** 体积按 KiB / MiB 印。一个"约 40 MB"和"约 12 KB"对"要不要现在删"是不同的信息。 */
const kb = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/**
 * 工具没跑起来。**和"判据说不行"分开**（后者是退出码 1）——
 * 这一档的意思是屏幕上那几个数字本身不可信。
 */
function brokeDown(lines: string[]): never {
  console.error(`${RED}${BLD}✗ 清理没跑起来${OFF}：${lines[0]}`);
  for (const l of lines.slice(1)) console.error(l);
  process.exit(2);
}

/** 人把命令敲错了。印用法，退出码 1。 */
function usage(message: string): never {
  console.error(`${RED}${BLD}✗ ${message}${OFF}`);
  console.error(HELP);
  process.exit(1);
}

/** 内容目录下的 .md / .mdx，仓库根相对、正斜杠。下划线开头的不算内容。 */
function walk(dirRepoRel: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(abs(dirRepoRel))) {
    // 和 content.config.ts 的 glob（`**/[^_]*.{md,mdx}`）、两道发布闸同一条约定。
    // `_keep.md` 是让空目录进 git 的占位文件，不是内容 —— 删了它，目录在
    // Cloudflare 的 clone 里会压根不存在，闸门 exit 2 构建红（那个文件里写着）。
    if (name.startsWith("_")) continue;
    const full = `${dirRepoRel}/${name}`;
    if (statSync(abs(full)).isDirectory()) out.push(...walk(full));
    else if (/\.mdx?$/.test(name)) out.push(full);
  }
  return out;
}

/** 小写路径 → git 索引里那个真实拼法。只用来在"判成未跟踪"时解释大小写不一致。 */
const caseInsensitiveTracked = new Map<string, string>();

/**
 * 问 git：这些路径里哪些已经提交过、哪些有未提交的改动、哪些它压根不知道。
 *
 * ★ **正着问。** `git ls-files` 给的是"git 跟踪着的"，不在里面就是未跟踪 ——
 *   所以 git 调不起来（抛错）、或者路径算错（返回空）时，结论是**全部未跟踪**，
 *   而未跟踪默认拒绝删。失败方向是安全的那一边。
 *   反过来写（"不在 git status 里就算干净"）的话，同样的故障会让每个文件都判成
 *   已备份、安全闸静默全开 —— 而屏幕上没有任何区别。
 */
function gitStates(dirs: readonly string[]): Map<string, GitState> {
  const git = (args: string[]): string[] => {
    try {
      return execFileSync("git", args, {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      })
        .split("\0")
        .filter(Boolean);
    } catch (e) {
      return brokeDown([
        `问不出 git 状态 —— ${(e as Error).message}`,
        `  这个工具靠 git 判断"删了还能不能找回来"（README：备份 = 仓库本身）。`,
        `  ${DIM}问不出来就一条都不删：宁可拒绝执行，也不能把"不知道"当成"已备份"。${OFF}`,
      ]);
    }
  };

  // ★ 这个工具枚举出来的路径是**仓库根相对**的（`src/content/posts/x.md`），
  //   而 `git status --porcelain` 吐的也是仓库根相对的 —— 两边对得上的前提是
  //   cwd 就是仓库根。`pnpm content:prune` 一定满足（pnpm 在包根跑脚本），
  //   但直接 `cd src && npx tsx ../scripts/content/prune.ts` 就不满足了：
  //   那时每一个文件都会因为路径对不上而被判成「未跟踪」，于是整批被拒 ——
  //   失败方向是安全的，但屏幕上那句话是错的（说"git 里没有备份"，实际是路径算错了）。
  const prefix = git(["rev-parse", "--show-prefix"]).join("");
  if (prefix.trim() !== "") {
    brokeDown([
      `得在仓库根目录跑（现在在 ${prefix.trim()} 里）。`,
      `  ${DIM}这个工具的路径是仓库根相对的，git 吐的也是 —— 在子目录里两边对不上，`,
      `  每个文件都会被误判成"git 里没有备份"。用 \`pnpm content:prune\`。${OFF}`,
    ]);
  }

  const tracked = git(["ls-files", "-z", "--", ...dirs]);
  // ★ 大小写对不上时要能说出实话。Windows / macOS 的文件系统不区分大小写，
  //   而 git 索引区分：盘上是 `Old-One.md`、索引里是 `old-one.md` 时，
  //   下面的精确查表会判成「未跟踪」，于是工具说"git 里一份都没有"（**假的**，
  //   字节完整地在 HEAD 里），还叫人"先提交" —— 而 `git status` 是干净的，
  //   `git add` 什么都不会发生，那是一条死路。
  //   这里只做**识别**，不做自动回落：把状态判宽是危险方向，说清楚才是。
  for (const p of tracked) caseInsensitiveTracked.set(p.toLowerCase(), p);
  // --no-renames：加了它每条记录只有一个路径，不会出现 `旧\0新` 两段。
  const status = git([
    "status",
    "--porcelain",
    "-z",
    "--untracked-files=all",
    "--no-renames",
    "--",
    ...dirs,
  ]);

  const states = new Map<string, GitState>();
  for (const p of tracked) states.set(p, "committed");
  // porcelain -z 的每条记录是 `XY<空格>路径`。
  for (const rec of status) {
    states.set(rec.slice(3), rec.startsWith("??") ? "untracked" : "modified");
  }
  return states;
}

/** 正文里引用的、落在这条稿子自己的配图目录之外的相对图片。工具不猜，只报出来。 */
function outsideImages(
  file: string,
  body: string,
  assetDir: string
): string[] {
  const dir = posix.dirname(file);
  const found = new Set<string>();
  for (const m of body.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)/g)) {
    const url = m[1];
    // 绝对路径 / 外链 / data: 不经优化管线，也不是这条稿子的私产（docs/engineering-notes.md 坑 15）。
    if (/^(?:[a-z]+:|\/|#)/i.test(url)) continue;
    let decoded = url;
    try {
      decoded = decodeURIComponent(url);
    } catch {
      // 半个百分号转义的路径（`%zz`）。原样用，反正只是报出来给人看。
    }
    const resolved = posix.normalize(posix.join(dir, decoded));
    if (!resolved.startsWith(`${assetDir}/`)) found.add(resolved);
  }
  return [...found];
}

// ── 参数 ──────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

const opts: PruneOptions = (() => {
  try {
    return parseArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    return usage(e.message);
  }
})();

/** 站点时区的唯一一份在 astro-paper.config.ts（那里写着为什么是北京时间）。
 *  `?? "UTC"` 跟的是 src/config.ts 里同一条兜底 —— 那个文件 import 了
 *  `astro:env/client`，裸 tsx 这一侧读不了它，所以这个默认值只能在这里重复一次。 */
const tz = siteConfig.site.timezone ?? "UTC";

const range: DayRange = (() => {
  try {
    return parseDayRange({ from: opts.from, to: opts.to, tz });
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(`${RED}${BLD}✗ ${e.message}${OFF}\n`);
    process.exit(1);
  }
})();

// ── 枚举 ──────────────────────────────────────────────────────────────

const keys = opts.collections.length > 0 ? opts.collections : PRUNABLE_KEYS;
const specs = keys.map(k => requireCollectionSpec(k));

// ★ 登记在册的目录不存在 = 工具没跑起来，不是"这个集合没有内容"。
//   压成同一档的话，一次路径写错会表现成"这个区间里没有老稿，什么都不用删"。
const missing = specs.filter(s => {
  const p = abs(s.dir);
  return !existsSync(p) || !statSync(p).isDirectory();
});
if (missing.length > 0) {
  brokeDown([
    "有登记在册的内容目录找不到。",
    ...missing.map(s => `  ${s.label}（${s.key}）—— ${s.dir}`),
    `  ${DIM}这不是"这个集合还没有内容" —— 是工具根本没看到那个目录。`,
    `  去 src/config/collections.ts 核一眼 dir。${OFF}`,
  ]);
}

const states = gitStates([
  ...specs.map(s => s.dir),
  // 配图目录一起问：删 .md 的同时要删 src/assets/<集合>/<slug>/，
  // 那里面的截图同样是"删了可能找不回来"的字节。
  ...keys.map(k => `src/assets/${k}`).filter(d => existsSync(abs(d))),
]);

const candidates: Candidate[] = [];
const bodies = new Map<string, string>();
const tally: { key: string; label: string; dir: string; total: number }[] = [];

/** 两个 git 状态里"更差"的那个。差 = 删了越难找回来。 */
const RANK: Record<GitState, number> = { committed: 0, modified: 1, untracked: 2 };

for (const spec of specs) {
  const files = walk(spec.dir);
  tally.push({ key: spec.key, label: spec.label, dir: spec.dir, total: files.length });
  for (const file of files) {
    const parsed = matter(readFileSync(abs(file), "utf8"));
    bodies.set(file, parsed.content);
    const slug = file.slice(spec.dir.length + 1).replace(/\.mdx?$/, "");

    // ★ 判据的粒度要和**删除的粒度**对齐：删的是"这篇 .md + 它的配图目录"，
    //   那么"git 里还有没有"就得把配图目录里的每一个文件也算进去，取最差的那个。
    //   只看 .md 的话，一篇已提交的教程配着几张 git 从没见过的截图会被判成
    //   committed 一路删掉 —— 而教程模块里截图才是主要内容。
    const assetDir = `src/assets/${spec.key}/${slug}`;
    const related = [
      file,
      ...(existsSync(abs(assetDir)) ? listAllFiles(process.cwd(), assetDir) : []),
    ];
    let git: GitState = "committed";
    let gitFrom: string | undefined;
    for (const p of related) {
      const st = states.get(p) ?? "untracked";
      if (RANK[st] > RANK[git]) {
        git = st;
        gitFrom = p;
      }
    }

    candidates.push({
      file,
      collectionKey: spec.key,
      slug,
      data: parsed.data as Record<string, unknown>,
      git,
      gitFrom,
    });
  }
}

// ★ 一个内容文件都没枚举到。**这一档不许当成"没什么要清理的"** ——
//   目录真的空着、和目录名或 --collections 写错了，在屏幕上必须分得开，
//   而后者是"工具没看见任何东西"，退出码 2。
if (candidates.length === 0) {
  brokeDown([
    "一个内容文件都没看到。",
    ...tally.map(t => `  ${t.label} —— ${t.dir}`),
    `  这几个目录下没有 .md / .mdx（下划线开头的占位文件不算内容）。`,
    `  这**不是**"这个区间里没有老稿" —— 工具没有东西可看。`,
    `  ${DIM}先核一眼目录名和 --collections 的拼写：拼错了在这里表现成"什么都不用清理"。${OFF}`,
  ]);
}

// ── 判定 ──────────────────────────────────────────────────────────────

const planned = plan(candidates, range, opts);
const doomed = pick(planned, "delete");
const unreadable = pick(planned, "unreadable-time");
const keptFeatured = pick(planned, "kept-featured");
const unsafe = pick(planned, "unsafe-git");

const hitByKey = new Map<string, number>();
for (const p of doomed) {
  const k = p.candidate.collectionKey;
  hitByKey.set(k, (hitByKey.get(k) ?? 0) + 1);
}

/** 要打进备份包的东西。**dry-run 的体积预估和真正打包用的是这同一份** ——
 *  各算各的话，dry-run 说「约 2 MB」而实际打出 40 MB（漏了配图目录），两边都不报错，
 *  而人恰恰是照着 dry-run 那个数字决定要不要按下去的。 */
const targets: BackupTarget[] = doomed.map(p => {
  const assetDir = `src/assets/${p.candidate.collectionKey}/${p.candidate.slug}`;
  return {
    file: p.candidate.file,
    assetDir: existsSync(abs(assetDir)) ? assetDir : null,
    meta: {
      collection: p.candidate.collectionKey,
      slug: p.candidate.slug,
      title: p.candidate.data.title ?? null,
      pubDatetime: formatInTz(p.verdict.ms, tz),
      git: p.verdict.git,
      draft: p.candidate.data.draft === true,
    },
  };
});
const plannedBytes =
  targets.length > 0
    ? totalBytes(process.cwd(), collectSourcePaths(process.cwd(), targets))
    : 0;

// ── 报表 ──────────────────────────────────────────────────────────────

const mode = opts.apply
  ? `${RED}${BLD}真删${OFF}`
  : `${GRN}只列不删${OFF}${DIM}，加 --yes 才动手${OFF}`;

console.log(
  `\n${BLD}批量清理${OFF} ${DIM}(${OFF}${mode}${DIM})${OFF}  ` +
    `区间 ${range.from ?? "（不设下界）"} ~ ${range.to ?? "（不设上界）"} ` +
    `${DIM}按 ${tz} 的日界，两端都含${OFF}`
);
// 口径必须印在屏幕上。UTC 那一行是给人对 frontmatter 的 ——
// 站上显示北京时间、文件里存 UTC，差 8 小时（docs/engineering-notes.md 坑 1）。
console.log(
  `${DIM}  换算成 frontmatter 里的 UTC：` +
    `${range.fromMs === null ? "—" : new Date(range.fromMs).toISOString()} ~ ` +
    `${range.toMs === null ? "—" : new Date(range.toMs).toISOString()}${OFF}`
);
console.log(
  "  " +
    tally
      .map(t => {
        if (t.total === 0) return `${YEL}${t.label} 一条都没有${OFF}`;
        const hit = hitByKey.get(t.key) ?? 0;
        return (
          `${t.label} ${t.total} 条` +
          (hit > 0 ? ` ${BLD}命中 ${hit}${OFF}` : `${DIM} 命中 0${OFF}`)
        );
      })
      .join(` ${DIM}·${OFF} `)
);
for (const t of tally.filter(t => t.total === 0)) {
  console.log(
    `${DIM}  ${t.label} 一条都没有（${t.dir}）—— 如果这不是你预期的，先核一眼目录名：` +
      `拼错了在这里表现成"没什么要清理的"。${OFF}`
  );
}

/** 一行一条。时间按站点时区印，草稿 / 置顶 / git 状态标出来。 */
function line(p: Planned, ms?: number): string {
  const c = p.candidate;
  const flags = [
    c.data.draft === true ? "草稿" : "",
    c.data.featured === true ? "置顶" : "",
    c.git === "untracked" ? `${RED}未跟踪${OFF}` : "",
    c.git === "modified" ? `${YEL}有未提交改动${OFF}` : "",
  ].filter(Boolean);
  return (
    `  ${c.file}` +
    (ms === undefined ? "" : `${DIM}  ${formatInTz(ms, tz)}${OFF}`) +
    (flags.length > 0 ? `  ${flags.join(" ")}` : "") +
    `\n    ${DIM}${String(c.data.title ?? "（没有 title）")}${OFF}` +
    // 定调的不是这篇 .md 本身时要说出来 —— 否则屏幕上写着"未跟踪"，
    // 人打开那篇稿一看明明提交过，只会以为工具坏了。
    (c.gitFrom && c.gitFrom !== c.file
      ? `\n    ${DIM}↳ 这个状态是它的配图定的：${c.gitFrom}${OFF}`
      : "")
  );
}

if (unreadable.length > 0) {
  // ★ 这一档和"不在区间内"分开报。它说的是**我不知道这条是哪天的** ——
  //   frontmatter 坏掉的稿子每次清理都"没命中"，永远没人发现。
  console.log(
    `\n${YEL}${BLD}? 时间读不出来的 ${unreadable.length} 条${OFF}` +
      `${DIM}（不是"不在区间内" —— 是不知道它是哪天的。一条都不会删）${OFF}`
  );
  for (const p of unreadable) {
    console.log(line(p));
    console.log(`    ${YEL}${p.verdict.why}${OFF}`);
  }
}

if (keptFeatured.length > 0) {
  console.log(
    `\n${DIM}置顶保护，跳过 ${keptFeatured.length} 条（在区间内，但置顶着）：${OFF}`
  );
  for (const p of keptFeatured) console.log(line(p, p.verdict.ms));
  console.log(`${DIM}  真要清理置顶的条目，加 --include-featured。${OFF}`);
}

if (doomed.length === 0) {
  // ★ 「这几个集合里一条内容都没有」上面已经报过，而且那是退出码 2。
  //   这里是另一档：**有内容，但没有一条落在这个区间**。两句话不许合并成
  //   "没什么要清理的" —— 前者是工具没看见东西，后者是判过了。
  console.log(
    `\n${GRN}✓ 这个区间里没有要清理的${OFF} ${DIM}—— 看过 ${candidates.length} 条，` +
      `没有一条同时满足"在区间内"和"可以删"。${OFF}`
  );
} else {
  console.log(
    `\n${BLD}${opts.apply ? "将要删除" : "命中"} ${doomed.length} 条${OFF}` +
      (opts.apply ? "" : `${DIM}（这次不删，只是列出来）${OFF}`)
  );
  for (const p of doomed) {
    console.log(line(p, p.verdict.ms));
    const assetDir = `src/assets/${p.candidate.collectionKey}/${p.candidate.slug}`;
    if (existsSync(abs(assetDir))) {
      console.log(`    ${DIM}连配图目录一起删：${assetDir}/${OFF}`);
    }
    const outside = outsideImages(
      p.candidate.file,
      bodies.get(p.candidate.file) ?? "",
      assetDir
    );
    if (outside.length > 0) {
      // 不猜、不删。这条稿子引用了别处的图，那张图可能还有别人在用。
      console.log(
        `    ${YEL}引用了自己配图目录之外的图，没动它：${outside.join(" / ")}${OFF}`
      );
    }
  }
}

// ── git 里没有备份的：拒绝整批 ────────────────────────────────────────

if (unsafe.length > 0) {
  console.error(
    `\n${RED}${BLD}✗ 拒绝执行${OFF}：有 ${unsafe.length} 条在区间内，` +
      `但 git 里没有它这一份字节的备份。`
  );
  for (const p of unsafe) console.error(line(p, p.verdict.ms));

  // 大小写不一致那一档：说实话，并且给一条真的走得通的出路。
  const caseIssues = unsafe
    .map(p => p.candidate.gitFrom ?? p.candidate.file)
    .map(path => ({ path, inGit: caseInsensitiveTracked.get(path.toLowerCase()) }))
    .filter(x => x.inGit && x.inGit !== x.path);
  if (caseIssues.length > 0) {
    console.error(
      `  ${YEL}其中有 ${caseIssues.length} 条其实**在 git 里**，只是大小写对不上：${OFF}`
    );
    for (const c of caseIssues) {
      console.error(`${DIM}    盘上 ${c.path}${OFF}`);
      console.error(`${DIM}    索引里 ${c.inGit}${OFF}`);
    }
    console.error(
      `  ${DIM}这几条"先提交"是没用的（git status 是干净的）—— 用 \`git mv\` 把大小写改回一致。${OFF}`
    );
  }
  console.error(
    `  ${DIM}这个站没有数据库，备份就是仓库本身。已提交过的删了是 \`git checkout --\` 一句话，\n` +
      `  未跟踪的在 git 里**一份都没有**，而两者在磁盘上长得一模一样。\n` +
      `  正常顺序是**先提交再清理**；确实是不要的垃圾（比如看版式用的临时稿），\n` +
      `  加 --allow-uncommitted 明确放行。${OFF}`
  );
  // ★ 这里必须说清楚"打包备份"**不能**替代 git，否则上面那句"先提交再清理"
  //   会被读成一句可以跳过的客套话 —— 而两者的覆盖范围是真的不一样：
  //   包里什么都有但只在这台机器上（.gitignore + git clean -xdf 会删），
  //   git 只有已提交的那份但它跟着仓库走、在每一个克隆里。
  // ⚠ 这里**不许**提".gitignore" —— 包落在哪由 --backup-dir 决定，那句话不一定为真。
  //   而这一段恰恰是劝人"先提交再清理"的地方，人在这一刻最当真。
  console.error(
    `  ${DIM}（加了 --allow-uncommitted 的话，这几条**会**进备份包 —— 但那个包只是**本机的撤销点**，\n` +
      `  它和 git 历史不是一回事：git 跟着仓库走、在每一个克隆里，包只在这块盘上。替代不了"先提交"。）${OFF}`
  );
  console.error(
    `  ${DIM}这一档会让整批中止，不是跳过它们继续删剩下的 ——\n` +
      `  "删了大部分、剩下几条报个警告"是最容易被人一眼扫过去的形状。${OFF}\n`
  );
  process.exit(1);
}

// ── 动手 ──────────────────────────────────────────────────────────────

if (!opts.apply) {
  if (doomed.length > 0) {
    // dry-run 里也要把备份会落在哪说清楚 —— 一个人在按 --yes 之前有权先知道
    // 那个包会写到哪个盘、占多大。
    let where: string;
    try {
      where = toPosix(relative(process.cwd(), resolveBackupDir(process.cwd(), opts.backupDir)));
    } catch (e) {
      // 落点不合法（比如指到了 public/）要现在就说，不要等到 --yes 那一刻。
      console.error(`\n${RED}${BLD}✗ ${(e as Error).message}${OFF}\n`);
      process.exit(1);
    }
    console.log(
      `\n${DIM}真要删：同一条命令后面加 --yes。删之前会先把这 ${doomed.length} 条` +
        `（约 ${kb(plannedBytes)}）打成一个包放进 ${where || "."}/，\n` +
        `  包验过了才会动手 —— 验不过就一个字节都不删。${OFF}\n`
    );
  }
  process.exit(0);
}

if (doomed.length === 0) {
  console.log(`${DIM}没有要删的，什么都没做。${OFF}\n`);
  process.exit(0);
}

// ★ 顺序不许调：**先打包、先验包，再删**。
//   反过来（删了再从内存里的字节写包）省不了任何事，却让"写包失败"变成
//   "文件已经没了、包也没有"—— 这个工具唯一不可挽回的那种状态。
let saved;
try {
  saved = backup({
    repoRoot: process.cwd(),
    backupDir: opts.backupDir,
    tz,
    now: new Date(),
    targets,
    manifest: {
      tool: "pnpm content:prune",
      argv,
      from: range.from ?? null,
      to: range.to ?? null,
      rangeUtc: {
        from: range.fromMs === null ? null : new Date(range.fromMs).toISOString(),
        to: range.toMs === null ? null : new Date(range.toMs).toISOString(),
      },
      entries: doomed.map(p => ({
        file: p.candidate.file,
        collection: p.candidate.collectionKey,
        title: String(p.candidate.data.title ?? ""),
        pubDatetime: formatInTz(p.verdict.ms, tz),
        git: p.verdict.git,
      })),
    },
  });
} catch (e) {
  if (!(e instanceof BackupError)) throw e;
  brokeDown([
    `备份没做成，所以一个文件都没删。`,
    `  ${(e as Error).message}`,
    ``,
    `  ${DIM}这不是"清理失败"那么简单 —— 是这一步**本来就该在删除前面**：`,
    `  备份做不成的时候，正确的结果就是站上的东西原封不动。${OFF}`,
  ]);
}

// ★ 两档必须长得不一样。压成一句「✓ 已备份」的话，"独立实现复核过"和
//   "我自己读得懂但没人复核过"就字节级相同了 —— 而后者才是该多看一眼的那一档。
if (saved.tier === "cross-checked") {
  console.log(
    `\n${GRN}✓ 已打包并验过${OFF} ${saved.archive} ` +
      `${DIM}（${saved.entries} 条 / 源文件 ${kb(saved.sourceBytes)} → 包 ${kb(saved.archiveBytes)}）${OFF}`
  );
  // ⚠ 措辞要对得上这两步**各自证明了什么**，不许含糊地合成一句"验过了"：
  //   逐字节比对（我们自己做的，走 gunzip，**gzip 的 CRC 在这一步被验**）证明的是
  //   "包里的字节和盘上的一样"；`tar -tzf` 证明的是"一个和我无关的实现认得出同一批条目"
  //   —— 它**不保证**完整性（实测：bsdtar 对一个 CRC 已经坏掉的包也会 exit 0）。
  //   两句分开说，人才知道哪一句在替他担保什么。
  console.log(
    `${DIM}  逐字节比对通过（含 gzip 校验和）；另有一个独立实现认出了同一批条目：${saved.crossCheckTool}${OFF}`
  );
} else {
  console.log(
    `\n${YEL}✓ 已打包，逐字节比对通过${OFF} ${saved.archive} ` +
      `${DIM}（${saved.entries} 条 / 源文件 ${kb(saved.sourceBytes)} → 包 ${kb(saved.archiveBytes)}）${OFF}`
  );
  console.log(
    `${YEL}  但这一次**没能独立复核**${OFF}${DIM}：${saved.crossCheckSkipped}。\n` +
      `  校验用的 reader 是这个项目自己写的，它读自己写的包 —— 能证明字节没丢，\n` +
      `  不能证明别的 tar 也解得开。要自己确认一下：tar -tzf ${saved.archive}${OFF}`
  );

  // ★ 严格程度跟着**不可逆程度**走。
  //   这一批里凡是 git 状态不是 committed 的，这个包就是它**唯一的副本** ——
  //   而这个包恰恰是这一次没能被独立证明过的那个。两件不确定叠在一起时，
  //   正确的动作是停手，不是印一行黄字然后照删。
  //   （出路是"装个 tar"或者"先把那几条提交了"，不是给这里加一个放行开关。）
  const onlyInPack = doomed.filter(p => p.verdict.git !== "committed");
  if (onlyInPack.length > 0) {
    console.error(
      `\n${RED}${BLD}✗ 停手${OFF}：这一批里有 ${onlyInPack.length} 条**只有这个包里有**` +
        `（git 里没有它们），而这个包这一次没能被独立复核。`
    );
    for (const p of onlyInPack) console.error(line(p, p.verdict.ms));
    console.error(
      `  ${DIM}包已经写好了（${saved.archive}），一个文件都没删。两条出路：\n` +
        `    · 装一个 tar（Git Bash 自带；Windows 10 1803+ 在 C:\\Windows\\System32\\tar.exe），再跑一次\n` +
        `    · 或者先把这几条提交了 —— 那样 git 里就有第二份，这个包验没验过就没那么要紧了\n` +
        `  这里不提供放行开关：唯一副本 + 没验过，是这个工具里最不该被一个参数抹平的组合。${OFF}\n`
    );
    process.exit(2);
  }
}

// 包没被 git 忽略的话，现在就要说 —— 一个 `git add -A` 就能把刚清理掉的内容
// 当二进制 blob 提回内容仓库，而清理那一步看起来是成功的。
if (saved.gitIgnored === false) {
  console.log(
    `${YEL}  ⚠ 这个包**没有**被 git 忽略${OFF}${DIM}，它会出现在 git status 里。\n` +
      `    别顺手 \`git add -A\` —— 那等于把刚清理掉的内容以二进制形式提回仓库。\n` +
      `    默认目录（.backups/）是忽略着的；你用 --backup-dir 指到了别处。${OFF}`
  );
} else if (saved.gitIgnored === null) {
  console.log(
    `${DIM}  （问不出这个包在不在 git 的忽略范围内 —— 提交前自己看一眼 git status。）${OFF}`
  );
}

// ★ 删之前再核一遍：盘上这一份还是我刚才备份的那一份吗。
//   验包和删除之间有一个窗口，而这台机器上 dev server / Keystatic 常开着
//   （docs/engineering-notes.md 坑 5）—— 那一刻按一次保存，包里就是 A 版、要删的是 B 版，
//   而屏幕上刚刚印过"已打包并验过"。核不上就整批停手：备份已经在盘上了，
//   重跑一次的代价只是多一个包。
const drifted = saved.files.filter(f => {
  try {
    const st = statSync(abs(f.path));
    return st.size !== f.bytes || Math.abs(st.mtimeMs - f.mtimeMs) > 1;
  } catch {
    return true; // 读不到也算对不上 —— 不知道就当它变了
  }
});
if (drifted.length > 0) {
  console.error(
    `\n${RED}${BLD}✗ 停手${OFF}：备份验完之后，有 ${drifted.length} 个文件在盘上又变了。`
  );
  for (const f of drifted) console.error(`  ${f.path}`);
  console.error(
    `  ${DIM}包里存的是变之前那一版（${saved.archive}，没删任何东西）。\n` +
      `  多半是 dev server 或后台在这几秒里存了一次盘。重跑一次这条命令就行。${OFF}\n`
  );
  process.exit(1);
}

// ★ **按备份清单逐个删，不用 rmSync(dir, {recursive:true})。**
//   配图目录里如果有备份之后才出现的文件（或者枚举压根没覆盖到的文件），
//   recursive 会把它一起删掉 —— 而那一份**不在包里**，删了就真没了。
//   逐个删之后，目录里剩下的东西恰好是"包没覆盖到的"，报出来让人自己看。
// ★ 每一次删除都各自 try/catch，**成功了才打印**。
//   【2026-09-18 复核实测出来的】原来这一段是裸的：中途一个 EBUSY
//   （dev server 或资源管理器占着某个文件，docs/engineering-notes.md 坑 5 说这台机器上常有）
//   会让进程带着一坨 node 堆栈以**退出码 1** 结束 —— 而 1 在这个工具的契约里是
//   "拒绝执行，什么都没删"。实际状态却是删了一半，而且屏幕上一条「已删」都没有、
//   那段"怎么撤回"也没印出来 —— 恰恰在最需要它的时候。
//   打印也必须按**实际删掉的**来，不能事后照着 doomed 名单补印：那份名单和
//   真正删掉的东西不是一回事。
const failed: { path: string; why: string }[] = [];
let deletedFiles = 0;
for (const f of saved.files) {
  try {
    rmSync(abs(f.path));
    deletedFiles++;
    if (f.path.endsWith(".md") || f.path.endsWith(".mdx")) {
      console.log(`${RED}已删${OFF} ${f.path}`);
    }
  } catch (e) {
    failed.push({ path: f.path, why: firstLine((e as Error).message) });
  }
}

let deletedAssetDirs = 0;
const leftovers: string[] = [];
for (const t of targets) {
  if (!t.assetDir || !existsSync(abs(t.assetDir))) continue;
  const rest = listAllFiles(process.cwd(), t.assetDir);
  if (rest.length === 0) {
    // 已经空了才删目录本身（连带它下面可能剩的空子目录）。
    try {
      rmSync(abs(t.assetDir), { recursive: true });
      deletedAssetDirs++;
      console.log(`${RED}已删${OFF} ${t.assetDir}/`);
    } catch (e) {
      failed.push({ path: `${t.assetDir}/`, why: firstLine((e as Error).message) });
    }
  } else {
    leftovers.push(...rest);
  }
}

console.log(
  `\n${BLD}删了 ${deletedFiles} 个文件` +
    (deletedAssetDirs > 0 ? `、${deletedAssetDirs} 个配图目录` : "") +
    `${OFF}${DIM}（内容 ${doomed.length} 篇 + 配图）${OFF}`
);

// ★ 没删掉的要**单独报成一档**：这是"部分完成"，既不是成功也不是"什么都没做"。
//   它在退出码上也得和那两档分开 —— 见文件末尾。
if (failed.length > 0) {
  console.error(
    `${RED}  有 ${failed.length} 个没删掉（删除中途出错，前面那些是真删了）：${OFF}`
  );
  for (const f of failed) console.error(`${RED}    ${f.path}${OFF} ${DIM}${f.why}${OFF}`);
  console.error(
    `${DIM}    多半是 dev server 或资源管理器占着（docs/engineering-notes.md 坑 5）。先停掉再重跑；\n` +
      `    包里那一份是完整的，整体还原用下面那条 tar 命令。${OFF}`
  );
}
if (leftovers.length > 0) {
  console.log(
    `${YEL}  配图目录里还剩 ${leftovers.length} 个不在备份清单里的文件，没动它们：${OFF}`
  );
  for (const p of leftovers.slice(0, 10)) console.log(`${DIM}    ${p}${OFF}`);
  console.log(
    `${DIM}    它们是备份之后才出现的，或者枚举没覆盖到 —— 两种都不该被顺手删掉` +
      `（包里没有它们）。自己看一眼再决定。${OFF}`
  );
}
// ★ 「只有这个包里有」的那几条要**单独、逐条**列出来。
//   它们是这个包存在的全部理由 —— 和其余条目在屏幕上长得一样的话，
//   "删了还能从 git 找回来"和"删了只剩这个包"这两种又被合并了
//   （和 plan.ts 里「放行不等于忘掉」是同一条规矩）。
// ★ 而且 untracked 和 modified **不许合并**：
//   untracked —— git 里一份都没有，这个包是唯一副本；
//   modified  —— git 里有上一个提交版（`git checkout --` 能回到那一版），
//                只有"还没提交的那几处改动"是唯一的。
//   合并成一句"git 里从来没有过"，对 modified 那些就是**假话**，
//   而且和上半段报表里明明分了三档的显示自相矛盾。
const untracked = doomed.filter(p => p.verdict.git === "untracked");
const modified = doomed.filter(p => p.verdict.git === "modified");
const titleOf = (p: Planned) => String(p.candidate.data.title ?? "");
if (untracked.length > 0) {
  console.log(
    `${YEL}  其中 ${untracked.length} 条 git 里一份都没有 —— ${BLD}这个包是它们唯一的副本${OFF}${YEL}：${OFF}`
  );
  for (const p of untracked) {
    console.log(`${YEL}    ${p.candidate.file}${OFF}${DIM}  ${titleOf(p)}${OFF}`);
  }
}
if (modified.length > 0) {
  console.log(
    `${YEL}  另有 ${modified.length} 条 git 里有上一个提交版${OFF}${DIM}` +
      `（\`git checkout --\` 回得到那一版；**未提交的那几处改动**只在包里）：${OFF}`
  );
  for (const p of modified) {
    console.log(`${DIM}    ${p.candidate.file}  ${titleOf(p)}${OFF}`);
  }
}

// ★ 两条撤回路径，**分开说**。它们覆盖的范围不一样：
//   git 只有已提交的那份、但跨机器；包里什么都有、但只在这台机器上。
console.log(
  `${DIM}  撤回（两条路，覆盖范围不同）：\n` +
    // ⚠ 包落在**别的盘**时（`--backup-dir D:\Backups`），`relative()` 给的是带盘符的
    //   绝对路径，而 `tar -xzf D:/...` 在 Git Bash 的 GNU tar 里会被当成**远程主机**
    //   （实测 `Cannot connect to D: resolve failed`）。删完之后这是唯一的撤回路径，
    //   照抄一条跑不通的命令是最坏的时机。所以那种情况印 cd + 纯文件名
    //   —— 和 crossCheck 里规避同一个坑用的是同一条写法。
    (/^[a-zA-Z]:/.test(saved.archive)
      ? `    从包里：${BLD}cd "${posix.dirname(saved.archive)}" && tar -xzf "${posix.basename(saved.archive)}" -C "${toPosix(process.cwd())}"${OFF}${DIM}\n` +
        `           （包在别的盘上，所以不能直接 \`tar -xzf D:/…\` —— GNU tar 会把 \`D:\` 当远程主机）\n` +
        `           刚才删的**每一个字节**都在里面，包括 git 从来没见过的那些\n`
      : `    从包里：${BLD}tar -xzf ${saved.archive} -C .${OFF}${DIM}  ——` +
        ` 刚才删的**每一个字节**都在里面，包括 git 从来没见过的那些\n`) +
    `           （Win10 的资源管理器双击打不开 .tar.gz，那是 Win11 才有的；用 Git Bash，\n` +
    `            或者 cmd 里 \`tar -xf <包>\` —— 那边走的是 System32 的 bsdtar）\n` +
    `    从 git：\`git checkout -- <路径>\`  —— 只对**已经提交过**的那份有效，但它跟着仓库走\n` +
    `           （这台机器 core.autocrlf 开着：\`git show <commit>:<路径>\` 拿到的是 LF 版，\n` +
    `            字节数和盘上那份不一样。要**逐字节原样**只有包里这一份）\n` +
    // ⚠ 这里**不许**写死「.backups/ 在 .gitignore 里」——`--backup-dir` 可以指到别处，
    //   而那句话是否为真由上面 saved.gitIgnored 那三档回答。一行写死的断言在别的落点上
    //   就是假的，而它印在"怎么撤回"这一段里，恰恰是人最当真的地方。
    // ⚠ 这三句**跟着 saved.gitIgnored 那三档走**，不许写死。
    //   `--backup-dir` 能把包指到仓库外、或者指到一个没被忽略的目录 ——
    //   写死"不进 git"的那一版会在同一屏里和上面那条 ⚠ 打架，
    //   而人记住的是最后那句。（这是同一个错误的第二处拷贝，一起修的。）
    (saved.gitIgnored === false
      ? `  ⚠ ${BLD}这个包在 git status 里看得见${OFF}${DIM}（上面说过）：别顺手 \`git add -A\`。\n`
      : saved.gitIgnored === null
        ? `  ⚠ ${DIM}问不出这个包在不在 git 的忽略范围内 —— 提交前自己看一眼 git status。\n`
        : `  ⚠ ${BLD}这个包不进 git${OFF}${DIM}，只在这台机器上：\`git clean -xdf\` 会把它一起删掉。\n`) +
    `  ${BLD}没有自动提交${OFF}${DIM} —— 要让公网也消失，还得自己 commit + push，\n` +
    `  或者本机 pnpm build + 部署。build 链里的 \`rm -rf public/pagefind\` 和\n` +
    `  \`astro build --force\` 就是为了防止删掉的稿子从缓存里被重新发出去。${OFF}\n`
);

if (saved.sidecarNote) {
  console.log(`${YEL}  ⚠ ${saved.sidecarNote}${OFF}\n`);
}

// ★ 部分完成**不许**报成成功。退出码也不许用 1 —— 那一档的契约是"什么都没删"，
//   而这里已经删了一部分。归到 2（工具没跑完），和"什么都没发生"分得开。
process.exit(failed.length > 0 ? 2 : 0);
