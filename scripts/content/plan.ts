/**
 * 批量清理的**判据核心**：一条稿子在不在这次清理的射程内、能不能删、为什么不能。
 *
 * ★ 纯内存 —— 不碰磁盘、不问 git、不 `process.exit`。所有 I/O 都在 ./prune.ts 里。
 *   分开是为了让 `prune.test.ts` 能喂**真实的 frontmatter 字面量**去测判据，
 *   而不是去测"我构造的假文件树"。判据和 I/O 混在一个文件里的话，
 *   唯一还能测的就是"删对了没有" —— 而那个测试本身就要删文件。
 *
 * ## 这个工具的时间口径（整件事里最容易错的一处）
 *
 * frontmatter 里的 `pubDatetime` 是 **UTC**（`2026-09-17T18:30:00Z`），
 * 而站上每一个时间都按**站点时区**显示（`astro-paper.config.ts` 的 `site.timezone`，
 * 【2026-09-21 用户定的】现在是 `Asia/Shanghai`，也就是北京时间 +8）。
 *
 * 所以 `--to 2026-09-17` 只有一种讲得通的解释：**站上的 9 月 17 日结束之前**，
 * 也就是 `2026-09-17T15:59:59.999Z`。如果这里图省事按 UTC 日界切：
 *
 *   - 北京 9/17 早上发的稿（UTC 还是 9/16）会被 `--from 2026-09-17` **漏掉**，
 *     人看着列表里明明有一篇 9/17 的稿没被列出来，而工具报告一切正常；
 *   - 反过来，北京 9/18 早上的稿（UTC 还是 9/17）会被 `--to 2026-09-17` 当成
 *     9/17 的**删掉**。
 *
 * 两个方向都零症状。docs/engineering-notes.md 坑 1 记的就是同一个时差在另一处咬人。
 * ⚠ 这里**不许把 +8 写死**：换时区只改上面那一处配置，而写死的偏移量既不跟着走、
 *   也不认夏令时（换回一个有夏令时的时区时，一年里有一半日子的日界会错一小时，
 *   错的那一小时正好是"深夜那篇稿子"所在的地方 —— `prune.test.ts` 里那条
 *   23 小时 / 25 小时的用例钉的就是这个）。
 * 换算用的是 `dayjs` + `utc` + `timezone` 插件 —— 和 `Datetime.astro`、
 * `archives/index.astro` **同一条口径**，不是另写一份偏移量。
 */

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { CONTENT_COLLECTIONS } from "../../src/config/collections";
import { frontmatterDate } from "../../src/config/lastModified";
// ⚠ 相对路径，不是 `@/`。这个脚本是裸 tsx 跑的，那里没有 Astro 的 tsconfig 别名解析。
//   （登记表本身一个 import 都没有，正是为了能被这一侧引用 —— 见那个文件开头。）

dayjs.extend(utc);
dayjs.extend(timezone);

// ── 谁参与批量清理 ────────────────────────────────────────────────────

export type PruneScopeEntry = {
  /** 集合名，必须是 `src/config/collections.ts` 登记表里的 key。 */
  key: string;
  /** 按哪个时间字段判区间。`null` = 这个集合不参与批量清理。 */
  timeField: "pubDatetime" | null;
  /** `timeField: null` 时**必填**：为什么不清理它。见下面那句 `satisfies`。 */
  pruneExempt?: string;
};

/**
 * 收紧版类型：不参与清理的集合必须写明理由。
 *
 * ★ 和登记表里 `scanned` / `scanExempt` 同一个形态，理由也同一条：一条"不清理"
 *   没有理由，过一阵就没人知道它是想清楚了的取舍还是手滑漏了。
 *   区别是这条的失败方向是**安全的**（漏掉 = 少删东西），所以它不在登记表里
 *   而在这个工具旁边 —— 登记表是四处共读的最小共享面，不该为一个维护工具变胖。
 *   对账靠 prune.test.ts：登记表里每一个集合都必须在下面出现恰好一次。
 */
type StrictScope = PruneScopeEntry &
  (
    | { timeField: "pubDatetime"; pruneExempt?: undefined }
    | { timeField: null; pruneExempt: string }
  );

export const PRUNE_SCOPE: readonly PruneScopeEntry[] = [
  { key: "posts", timeField: "pubDatetime" },
  { key: "qa", timeField: "pubDatetime" },
  { key: "guides", timeField: "pubDatetime" },
  {
    key: "prompts",
    timeField: null,
    /** 提示词**不是时间流里的稿子**，是当前在用的工具 —— 一份 2026 年写的提示词
     *  到了 2027 年可能仍然是我天天在跑的那一版。它的"时间轴"是版本（改同一条、
     *  换正文、填更新时间），不是 pubDatetime；按发布日期扫一遍老稿，
     *  扫掉的恰恰是正在用的那几份。
     *
     *  还有一半理由和批量清理这个动作本身有关：这个集合**收读者投稿**。
     *  一条按日期批量删除的命令把别人投来的东西删掉，和删掉自己的旧稿
     *  完全不是一件事 —— 前者应当是一次看着删的、单独的决定。
     *
     *  ⚠ 所以它和 `pages` 落在同一档，但**理由不同**：pages 是 schema 里压根没有
     *    pubDatetime（读不出时间），prompts 是有时间但那个时间不该当作过期依据。 */
    pruneExempt:
      "提示词是当前在用的工具、而且收投稿，不按发布日期算老稿；要删手动删",
  },
  {
    key: "pages",
    timeField: null,
    /** 单页不是按时间流走的内容 —— `about.md` 的 schema 里**压根没有 pubDatetime**
     *  （`src/content.config.ts` 的 pages 那节）。拿一个不存在的字段去判区间，
     *  结果只能是"整个集合永远读不出时间"，那不是保护，是每次清理都多一屏噪音。
     *  要删单页就手动删，那是一次性的、看着删的动作。 */
    pruneExempt:
      "单页没有 pubDatetime 字段，按时间批量清理对它没有意义；要删手动删",
  },
] satisfies readonly StrictScope[];

/** 参与清理的集合名，按登记表顺序 —— 报表也按这个顺序印。 */
export const PRUNABLE_KEYS: readonly string[] = CONTENT_COLLECTIONS.filter(c =>
  PRUNE_SCOPE.some(s => s.key === c.key && s.timeField !== null)
).map(c => c.key);

// ── 用法错误 ──────────────────────────────────────────────────────────

/**
 * 参数不对。**和"工具跑起来了但拒绝执行"分开**：这一档是人把命令敲错了，
 * 屏幕上要印用法；那一档是判据说不行，屏幕上要印哪几篇为什么不行。
 */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

// ── 参数 ──────────────────────────────────────────────────────────────

export interface PruneOptions {
  /** 起始日（含），`YYYY-MM-DD`，**按站点时区的日界**。不给 = 不设下界。 */
  from?: string;
  /** 结束日（含），`YYYY-MM-DD`，**按站点时区的日界**。不给 = 不设上界。 */
  to?: string;
  /** 只清理这几个集合。空数组 = 全部参与清理的集合。 */
  collections: string[];
  /** 真的删。不给就只列出来（dry-run）。 */
  apply: boolean;
  /** 把置顶的条目也纳入。默认不纳入。 */
  includeFeatured: boolean;
  /** 允许删 git 里还没有备份的那一份字节。默认不允许。 */
  allowUncommitted: boolean;
  /**
   * 备份包落在哪个目录。不给就用 `backup.ts` 的 `DEFAULT_BACKUP_DIR`。
   *
   * ★ 注意这里**没有**"不要备份"这个选项，而且不许加。理由和 docs/engineering-notes.md 红线 3
   *   说闸门的那句一样：一个能被关掉的备份，迟早会在赶时间的那天被关掉 ——
   *   而"赶时间"和"手滑删错"通常是同一天。`prune.test.ts` 里有一条钉着这件事。
   */
  backupDir?: string;
  /** 只印用法。 */
  help: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 解析命令行。**纯函数**，所以 prune.test.ts 里能直接喂 argv 数组。
 *
 * ★ 不认识的参数一律报错，不许静默忽略。这里最典型的一次是 `--dry-run`：
 *   这个工具默认就是 dry-run，咽掉这个参数**恰好碰对**，于是人学会了
 *   "加上 --dry-run 就安全"，而哪天参数改名或拼错一个字母
 *   （`--dryrun` / `--yes --dry-run`）时，删除照常发生。
 */
export function parseArgs(argv: readonly string[]): PruneOptions {
  const opts: PruneOptions = {
    collections: [],
    apply: false,
    includeFeatured: false,
    allowUncommitted: false,
    help: false,
  };

  /** 取 `--x=v` 或 `--x v` 的值。取不到就是用法错误，不许当成空字符串。 */
  const valueOf = (i: number, name: string, inline?: string): [string, number] => {
    if (inline !== undefined) {
      if (inline === "") throw new UsageError(`${name} 后面是空的`);
      return [inline, i];
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("-")) {
      throw new UsageError(`${name} 后面要跟一个值`);
    }
    return [next, i + 1];
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.indexOf("=");
    const name = eq > 0 ? arg.slice(0, eq) : arg;
    const inline = eq > 0 ? arg.slice(eq + 1) : undefined;

    switch (name) {
      case "--from":
      case "--to": {
        const [v, ni] = valueOf(i, name, inline);
        opts[name === "--from" ? "from" : "to"] = v;
        i = ni;
        break;
      }
      case "--collections":
      case "--collection": {
        const [v, ni] = valueOf(i, name, inline);
        opts.collections.push(
          ...v
            .split(",")
            .map(s => s.trim())
            .filter(Boolean)
        );
        i = ni;
        break;
      }
      case "--backup-dir": {
        const [v, ni] = valueOf(i, name, inline);
        opts.backupDir = v;
        i = ni;
        break;
      }
      case "--yes":
      case "--apply":
        opts.apply = true;
        break;
      case "--include-featured":
        opts.includeFeatured = true;
        break;
      case "--allow-uncommitted":
        opts.allowUncommitted = true;
        break;
      case "--help":
      case "-h":
        opts.help = true;
        break;
      default:
        throw new UsageError(
          `不认识的参数 ${arg}。` +
            `（这个工具默认就是只列不删，没有 --dry-run 这个参数；真要删是 --yes）`
        );
    }
  }

  if (opts.help) return opts;

  // ★ 不给区间不许默认成"全删"。一个"什么都不指定就删全部"的清理命令，
  //   迟早会在某次手滑里把整个站清空 —— 而这个动作在 dry-run 里看起来
  //   只是"列得有点多"。
  if (!opts.from && !opts.to) {
    throw new UsageError("至少要给 --from 或 --to 之一 —— 不给区间不会默认删全部");
  }

  const unknown = opts.collections.filter(k => !PRUNABLE_KEYS.includes(k));
  if (unknown.length > 0) {
    throw new UsageError(
      `--collections 里有不参与清理的集合：${unknown.join(" / ")}。` +
        `能清理的是：${PRUNABLE_KEYS.join(" / ")}`
    );
  }

  return opts;
}

// ── 区间 ──────────────────────────────────────────────────────────────

export interface DayRange {
  /** 起始瞬间（含），UTC 毫秒。`null` = 不设下界。 */
  fromMs: number | null;
  /** 结束瞬间（含），UTC 毫秒。`null` = 不设上界。 */
  toMs: number | null;
  /** 换算用的时区，报表里要原样印出来给人对。 */
  tz: string;
  from?: string;
  to?: string;
}

/**
 * 把 `YYYY-MM-DD` 的两个端点按**指定时区的日界**换成 UTC 瞬间，两端都含。
 *
 * ⚠ 严格校验日期，不许滚。`new Date("2026-02-31")` 会**静默**变成 3 月 3 日 ——
 *   人以为自己划了二月的区间，实际删到了三月。所以格式过正则之后还要回写一遍比对。
 */
export function parseDayRange(opts: {
  from?: string;
  to?: string;
  tz: string;
}): DayRange {
  const day = (input: string, edge: "start" | "end"): number => {
    if (!DATE_RE.test(input)) {
      throw new UsageError(`日期要写成 YYYY-MM-DD（收到的是「${input}」）`);
    }
    const wall = `${input} ${edge === "start" ? "00:00:00.000" : "23:59:59.999"}`;
    let d;
    try {
      d = dayjs.tz(wall, opts.tz);
    } catch (e) {
      // 时区名是从站点配置来的。配错了这里必须炸，不许悄悄退回 UTC ——
      // 那会让整个区间偏 4~5 小时，而屏幕上一切正常。
      throw new UsageError(
        `时区「${opts.tz}」无效（astro-paper.config.ts 的 site.timezone）：${(e as Error).message}`
      );
    }
    if (!d.isValid() || d.format("YYYY-MM-DD") !== input) {
      throw new UsageError(
        `没有「${input}」这一天` +
          (d.isValid() ? `（它会被滚成 ${d.format("YYYY-MM-DD")}）` : "")
      );
    }
    return d.valueOf();
  };

  const fromMs = opts.from ? day(opts.from, "start") : null;
  const toMs = opts.to ? day(opts.to, "end") : null;

  if (fromMs !== null && toMs !== null && fromMs > toMs) {
    throw new UsageError(
      `区间是反的：--from ${opts.from} 晚于 --to ${opts.to}。` +
        `反区间一条都不会命中，而那看起来和"这个区间里没有老稿"一模一样`
    );
  }

  return { fromMs, toMs, tz: opts.tz, from: opts.from, to: opts.to };
}

/** 按站点时区格式化一个瞬间。报表里每一条都印它 —— 让口径始终在屏幕上。 */
export function formatInTz(ms: number, tz: string): string {
  return dayjs(ms).tz(tz).format("YYYY-MM-DD HH:mm");
}

// ── 时间字段 ──────────────────────────────────────────────────────────

export type EntryTime =
  | { ok: true; ms: number }
  | { ok: false; why: string };

/**
 * 从 frontmatter 里读发布时间。
 *
 * ★ **读不出来是独立一档，不是"不在区间内"。** 这两件事在清理工具里差别极大：
 *   「不在区间内」是判过了、结论是不动它；「读不出来」是**我不知道它是哪天的**，
 *   而这种条目恰恰最可能是需要人看一眼的坏数据。压成同一档的话，
 *   一篇 frontmatter 写坏了的稿子会永远安静地留在那里，每次清理都"没命中"。
 */
export function entryTime(data: Record<string, unknown>): EntryTime {
  const raw = data.pubDatetime;
  if (raw === undefined || raw === null || raw === "") {
    return { ok: false, why: "frontmatter 里没有 pubDatetime" };
  }
  // YAML 会把 `2026-09-17T18:30:00Z` 直接解析成 Date；加了引号的就还是字符串。
  // ⚠【2026-09-22】这两种形态的处理**搬去了 `src/config/lastModified.ts`** ——
  //   sitemap 的 <lastmod> 也要从 frontmatter 里读时间，在那边另写一份三元表达式
  //   就是同一个 YAML 怪癖有两处判据。这里只保留"读不出来的理由"那一档，
  //   因为它是给清理报告看的（见上面那段注释），那一半判据仍然只在这里。
  const at = frontmatterDate(raw);
  if (!at) {
    return { ok: false, why: `pubDatetime 解析不出来：${JSON.stringify(raw)}` };
  }
  return { ok: true, ms: at.getTime() };
}

// ── 判定 ──────────────────────────────────────────────────────────────

/**
 * 这一份字节在 git 里的状态。**判据是"git 里有没有备份"，不是"干净不干净"。**
 *
 * 这个站没有数据库，备份就是仓库本身（README 那句「备份 = 仓库本身」）。
 * 所以删一份**从未提交过**的文件是不可逆的，而删一份已提交的只是一次
 * `git checkout --` 就能撤回的改动。两者在文件系统层面长得一模一样。
 */
export type GitState = "committed" | "modified" | "untracked";

export interface Candidate {
  /** 仓库根相对、POSIX 正斜杠。 */
  file: string;
  collectionKey: string;
  /** 文件名去扩展名 —— 也就是公开地址里那一段，以及配图目录名。 */
  slug: string;
  data: Record<string, unknown>;
  /**
   * 这一条**整体**的 git 状态：`.md` 和它配图目录里每一个文件里**最差的那个**。
   *
   * ★【2026-09-18 复核查出来的，原来只看 .md】教程模块里截图才是主要内容，
   *   而配图目录里的字节当时完全不参与这条安全判据：一篇已提交的教程配着几张
   *   **git 从没见过**的截图，会被判成 committed 一路删掉 —— 而「唯一副本 + 没验过
   *   就停手」那一档也因此永远不会为配图触发。判据的粒度必须和删除的粒度对齐：
   *   删的是"这篇 + 它的配图目录"，判的就得是同一个集合。
   */
  git: GitState;
  /** `git` 不是 committed 时，是**哪个文件**定的调。报表要说得出来 ——
   *  否则屏幕上写着"未跟踪"而人打开那篇 .md 一看明明提交过，只会以为工具坏了。 */
  gitFrom?: string;
}

export type Verdict =
  /** 删。`git` 带着走，报表上要标出来这一条是靠 --allow-uncommitted 过的。 */
  | { kind: "delete"; ms: number; git: GitState }
  /** 判过了，不在区间内。 */
  | { kind: "out-of-range"; ms: number }
  /** **不知道**它是哪天的。一条都不会删。 */
  | { kind: "unreadable-time"; why: string }
  /** 在区间内，但置顶着，默认保护。 */
  | { kind: "kept-featured"; ms: number }
  /** 在区间内，但 git 里没有这一份字节的备份 —— 删了找不回来。 */
  | { kind: "unsafe-git"; ms: number; git: "modified" | "untracked" };

/**
 * 一条稿子的判定。
 *
 * ★ 检查顺序是判据的一部分，别调：
 *   1. 时间读不出来 —— 连"它是不是老稿"都不知道，后面几档全都无从谈起；
 *   2. 不在区间内 —— **必须排在保护档前面**。一篇区间外的置顶稿要报成
 *      「不在区间内」，不是「置顶保护」：后者在屏幕上长得像"本来会删，被拦住了"，
 *      于是人会去加 `--include-featured`，而那个参数对它根本没有影响。
 *      「不在射程内」和「在射程内但被拦住」是两件事，不许合并。
 *   3. 置顶保护 / 4. git 没备份 / 5. 删。
 */
export function judge(
  c: Candidate,
  range: DayRange,
  opts: { includeFeatured: boolean; allowUncommitted: boolean }
): Verdict {
  const t = entryTime(c.data);
  if (!t.ok) return { kind: "unreadable-time", why: t.why };

  const inRange =
    (range.fromMs === null || t.ms >= range.fromMs) &&
    (range.toMs === null || t.ms <= range.toMs);
  if (!inRange) return { kind: "out-of-range", ms: t.ms };

  if (c.data.featured === true && !opts.includeFeatured) {
    return { kind: "kept-featured", ms: t.ms };
  }

  if (c.git !== "committed" && !opts.allowUncommitted) {
    return { kind: "unsafe-git", ms: t.ms, git: c.git };
  }

  return { kind: "delete", ms: t.ms, git: c.git };
}

export interface Planned {
  candidate: Candidate;
  verdict: Verdict;
}

/** 逐条判定，保持输入顺序。 */
export function plan(
  candidates: readonly Candidate[],
  range: DayRange,
  opts: { includeFeatured: boolean; allowUncommitted: boolean }
): Planned[] {
  return candidates.map(candidate => ({
    candidate,
    verdict: judge(candidate, range, opts),
  }));
}

/** 按判定分档取。报表和执行两侧都用它，不许各自 filter 一遍。 */
export function pick<K extends Verdict["kind"]>(
  planned: readonly Planned[],
  kind: K
): (Planned & { verdict: Extract<Verdict, { kind: K }> })[] {
  return planned.filter(
    (p): p is Planned & { verdict: Extract<Verdict, { kind: K }> } =>
      p.verdict.kind === kind
  );
}
