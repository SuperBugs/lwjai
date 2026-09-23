/**
 * 删之前**先打包备份**，并且证明那个包是可信的。
 *
 * 批量清理（./prune.ts）在真删（`--yes`）之前必须走这里一趟。包格式在 ./archive.ts，
 * 这个文件负责：从磁盘收字节 → 写包 → **验包** → 把结果如实报给调用方。
 *
 * ## 为什么"验包"这一步比"打包"那一步重要
 *
 * 一个静默失败的备份**比没有备份更坏**：没有备份时人知道自己在裸奔，会先提交、会犹豫；
 * 而"已经备份了"这个信念恰恰是他按下删除的**依据**。所以这里的规矩是：
 *
 *   包写完之后，把它**重新解开**，逐条和**磁盘上此刻的源文件**逐字节比对。
 *   任何一条对不上 —— 少一条、多一条、名字不同、一个字节不同 —— 都不删任何东西。
 *
 * 用"重新从磁盘读"而不是"和内存里刚才读的那份比"，是为了顺带堵住收集和写包之间
 * 文件被改动的那个窗口：比对的是**即将被删的那份字节**，不是几十毫秒前的快照。
 *
 * ## 验证分三档，屏幕上必须分得开
 *
 *   `cross-checked` —— 逐字节自校验通过，**而且**机器上一个独立的 tar 实现也能列出
 *                       同一份清单。这一档才敢说"别的工具也解得开"。
 *   `self-verified` —— 逐字节自校验通过，但机器上找不到 tar，**没能独立复核**。
 *                       包大概率是好的（格式层有单测，其中一条就在调系统 tar），
 *                       但这一次没被独立证明过 —— 屏幕上要说出这句话。
 *   **失败**        —— 抛 BackupError，调用方一个文件都不删。包括"独立的 tar 跑起来了、
 *                       而且它说这个包不对"——那不是"没能证明"，那是**证明了有问题**。
 *
 * ⚠【2026-09-18 这里原来是错的】最初只有两档，`crossCheck()` 返回 `{ok: boolean}`，
 *   于是"机器上没有 tar"和"tar 说这个包少了 3 条"走**同一条分支**：都只打一行黄字、
 *   然后照常把文件删掉。「我不知道」和「我知道它坏了」被合并成了一档 ——
 *   正是这个项目最不能接受的形状，而且发生在一个专门用来防不可逆操作的模块里。
 *
 * 压成一句「✓ 已备份」的话，"验过了"和"我写出去了但没法证明"就字节级相同了 ——
 * 而后者恰恰是该让人多看一眼的那一档。
 *
 * ## 备份没有开关
 *
 * 没有 `--no-backup`，也没有环境变量能跳过它。理由和 docs/engineering-notes.md 红线 3 说闸门的
 * 那句一样：一个能被关掉的备份，迟早会在赶时间的那天被关掉 —— 而"赶时间"和
 * "手滑删错"是同一天的事。`prune.test.ts` 里有一条钉着这件事。
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { tarGz, untarGz, type ArchiveEntry } from "./archive";

dayjs.extend(utc);
dayjs.extend(timezone);

/** 备份这一步出了任何问题。抛出来 = 一个文件都不许删。 */
export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupError";
  }
}

/** 默认落点。**在仓库里**，但进 .gitignore —— 它是本机的撤销点，不是仓库内容。 */
export const DEFAULT_BACKUP_DIR = ".backups/content";

export interface BackupTarget {
  /** 要删的 .md，仓库根相对、正斜杠。 */
  file: string;
  /** 跟着一起删的配图目录（仓库根相对），没有就 null。 */
  assetDir: string | null;
  /** 进清单用的元信息，纯展示。 */
  meta: Record<string, unknown>;
}

/** 包里的一个文件。`mtimeMs` / `bytes` 是**备份那一刻**盘上的样子 ——
 *  删之前再 stat 一次和它比，就能发现"验完到删掉之间又被改了"那个窗口。 */
export interface BackedUpFile {
  path: string;
  bytes: number;
  mtimeMs: number;
  sha256: string;
}

export interface BackupResult {
  /** 包的路径，仓库根相对、正斜杠。 */
  archive: string;
  /** 包里的条目数（含 MANIFEST.json）。 */
  entries: number;
  /** 源文件总字节。 */
  sourceBytes: number;
  /** 包的字节。 */
  archiveBytes: number;
  /** 验到哪一档。 */
  tier: "cross-checked" | "self-verified";
  /** `self-verified` 时说明为什么没能独立复核 —— 不许只留一个档位名让人猜。 */
  crossCheckSkipped?: string;
  /** 独立复核用的是哪个 tar（`cross-checked` 时有）。 */
  crossCheckTool?: string;
  /**
   * 包里逐个文件的记录。
   *
   * ★ 调用方**删之前**要拿它再核一次"盘上这份还不还是我备份的那份" ——
   *   验包和删除之间还有一个窗口，而这台机器上 dev server / Keystatic 常开着
   *   （docs/engineering-notes.md 坑 5），那一刻存一次盘是真会发生的事。
   *   不核的话：包里是 A 版、删掉的是 B 版，而屏幕上写着"已备份"。
   */
  files: readonly BackedUpFile[];
  /**
   * 包**外**那份验证记录（`.verified.json`）没写成时的说明；写成了就是 undefined。
   *
   * ★ 不许静默吞掉写失败：目录里可能躺着一份**旧的同名记录**（描述的是另一个包），
   *   拿它去核这个包，要么得到假警报「包被人改过」，要么得到假放行。
   *   包本身已经验过了，所以这不是失败 —— 但它必须被说出来。
   */
  sidecarNote?: string;
  /**
   * 这个包在不在 git 的忽略范围内。**三档，不许压成 boolean**：
   *   `true`  —— 忽略着，不会被顺手提交
   *   `false` —— **没被忽略**：它会出现在 `git status` 里，一个 `git add -A`
   *              就把刚清理掉的内容当二进制 blob 提回内容仓库（清理白做了一半）
   *   `null`  —— 问不出来（不在 git 仓库里、或者 git 调不起来）。
   *              这一档不许显示成 `true` —— "没问题"和"我不知道"是两件事。
   */
  gitIgnored: boolean | null;
}

const toPosix = (p: string) => p.split(sep).join("/");
/** 报错信息只取第一行。子进程的错误往往拖着一屏 usage，塞进一句话里没人读得下去。 */
const firstLine = (s: string) => s.split(/\r?\n/)[0] ?? s;
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/**
 * 目录下的所有文件（递归），仓库根相对、正斜杠。
 *
 * ★ 这里**不跳过**下划线开头的东西 —— "下划线开头不算内容"那条约定是给内容集合的
 *   （content.config.ts 的 glob、发布闸），资源目录不适用。备份要的是**这个目录里
 *   的每一个字节**，一个不能少。
 *
 * 导出是因为 prune.ts 删完之后要拿它看"配图目录里还剩什么没进包"。
 */
export function listAllFiles(repoRoot: string, dirRepoRel: string): string[] {
  return walkFiles(repoRoot, dirRepoRel);
}

function walkFiles(repoRoot: string, dirRepoRel: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(repoRoot, ...dirRepoRel.split("/")))) {
    const child = `${dirRepoRel}/${name}`;
    const abs = join(repoRoot, ...child.split("/"));
    if (statSync(abs).isDirectory()) out.push(...walkFiles(repoRoot, child));
    else out.push(child);
  }
  return out;
}

/**
 * 这一批删除会碰到的**全部**源文件，仓库根相对、正斜杠、已去重。
 *
 * ★ 导出它是为了让 dry-run 的体积预估和真正打包**走同一份枚举**。
 *   各写一份的话，dry-run 说"约 2 MB"而实际打出来 40 MB（漏了配图目录），
 *   两边都不报错 —— 而人是照着 dry-run 那个数字决定要不要按下去的。
 *
 * 去重不是洁癖：同一个文件收两遍，包里就有两条同名条目，解包时后者覆盖前者、
 * 看起来没事，但"条目数"和"源文件数"从此对不上，验包会报一个指不到真原因的错。
 */
export function collectSourcePaths(
  repoRoot: string,
  targets: readonly BackupTarget[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (p: string) => {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  };
  for (const t of targets) {
    push(t.file);
    if (t.assetDir) for (const f of walkFiles(repoRoot, t.assetDir)) push(f);
  }
  return out;
}

/** 这些路径在磁盘上一共多少字节。dry-run 用它报预估体积。 */
export function totalBytes(repoRoot: string, paths: readonly string[]): number {
  let n = 0;
  for (const p of paths) {
    try {
      n += statSync(join(repoRoot, ...p.split("/"))).size;
    } catch {
      // 预估而已，读不到就当 0 —— 真正打包时读不到会抛，那里才是该拦的地方。
    }
  }
  return n;
}

/** 只读地问一句 git，问不出来就算了（返回 null）。**不许在这里跑任何会改仓库状态的
 *  git 命令** —— docs/engineering-notes.md 红线 2。清单里少一行 HEAD 无所谓，自作主张 commit 不行。 */
function gitFact(repoRoot: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * 备份包落在哪里 —— 并且挡住几个会把它送上公网的落点。
 *
 * ★ `public/` 下面的东西**会被原样发布到公网**（`astro build` 把 public/ 整个拷进 dist）。
 *   一个装着刚被删掉的内容的 tar 包落在那儿，等于把"清理掉的东西"公开发布 ——
 *   这是这个项目最不能接受的一类错误，而且零症状：构建绿、页面正常、没有任何链接指向它。
 *   所以这里硬挡，不靠人记得。
 */
export function resolveBackupDir(repoRoot: string, requested?: string): string {
  const dir = requested?.trim() ? requested.trim() : DEFAULT_BACKUP_DIR;
  const abs = resolve(repoRoot, dir);
  const rel = toPosix(relative(repoRoot, abs));

  // 仓库之外（绝对路径、别的盘）是允许的 —— 那反而更安全。只挡仓库内的危险落点。
  const insideRepo = !rel.startsWith("../") && !/^[a-zA-Z]:/.test(rel);
  if (insideRepo) {
    // ★【2026-09-18 复核查出来的】比对必须**大小写不敏感**。
    //   Windows 和 macOS 的文件系统不区分大小写：`--backup-dir Public` 写出来的文件
    //   就落在真正的 `public/` 里（实测：建 `Public/` 之后文件出现在 `readdirSync("public")`
    //   里，根目录下只有一个 public），而纯字符串比较会放它过去 ——
    //   于是一个装着**刚被清理掉的全部内容**的 tar.gz 躺在 public/ 下，
    //   下一次 `pnpm build` 把它拷进 dist、`wrangler deploy` 发上**公网**：
    //   构建全绿、页面正常、没有任何链接指向它。
    //   这正是 docs/engineering-notes.md 坑 14 的形态 —— 白名单/黑名单只写了一种拼法。
    const relCmp = rel.toLowerCase();
    for (const forbidden of ["public", "src/content", "src/assets", "dist"]) {
      if (relCmp === forbidden || relCmp.startsWith(`${forbidden}/`)) {
        throw new BackupError(
          `备份不许落在 ${forbidden}/ 下面（你给的是 ${rel}）。\n` +
            (forbidden === "public"
              ? `  public/ 下的文件会被 astro build 原样拷进 dist、发布到**公网** ——\n` +
                `  那等于把刚清理掉的内容公开发出去，而且构建全绿、没有任何症状。`
              : forbidden === "dist"
                ? `  dist/ 每次构建都会被重建，备份放那儿等于放在一个随时会被清掉的地方。`
                : `  那是内容目录本身 —— 备份放进去会被下一次清理和发布闸一起扫到。`)
        );
      }
    }
  }
  return abs;
}

/**
 * 打包 + 验包。**成功返回 BackupResult，失败一律抛 BackupError**（调用方据此一个文件都不删）。
 */
export function backup(opts: {
  repoRoot: string;
  targets: readonly BackupTarget[];
  /** 备份目录，不给就用 DEFAULT_BACKUP_DIR。 */
  backupDir?: string;
  /** 进清单：这次清理的区间、时区、原始命令行。 */
  manifest: Record<string, unknown>;
  /** 文件名里的时间戳和清单里的"本地时间"按这个时区算 —— 和工具其他地方同一条口径。 */
  tz: string;
  /** 现在几点。**由调用方传进来**，这样测试能喂一个固定时刻。 */
  now: Date;
  /** 独立复核用哪个命令。**只为测试可注入**，生产路径不传（= PATH 上的 tar）。 */
  tarBin?: string;
}): BackupResult {
  const { repoRoot, targets, tz, now } = opts;
  if (targets.length === 0) {
    throw new BackupError("没有要备份的东西 —— 调用方不该走到这里");
  }

  // ── 1. 收字节 ──────────────────────────────────────────────────────
  const unique = collectSourcePaths(repoRoot, targets);

  const entries: ArchiveEntry[] = [];
  const digests: BackedUpFile[] = [];
  let sourceBytes = 0;
  for (const p of unique) {
    const abs = join(repoRoot, ...p.split("/"));
    let data: Buffer;
    let mtimeMs: number;
    try {
      data = readFileSync(abs);
      mtimeMs = statSync(abs).mtimeMs;
    } catch (e) {
      throw new BackupError(`读不了 ${p}：${(e as Error).message}`);
    }
    entries.push({ path: p, data, mtimeSec: Math.floor(mtimeMs / 1000), mode: 0o644 });
    digests.push({ path: p, bytes: data.length, mtimeMs, sha256: sha256(data) });
    sourceBytes += data.length;
  }

  // ── 2. 清单 ────────────────────────────────────────────────────────
  const stamp = dayjs(now).tz(tz);
  const manifest = {
    ...opts.manifest,
    createdAtUtc: now.toISOString(),
    createdAtSite: `${stamp.format("YYYY-MM-DD HH:mm:ss")} ${tz}`,
    // 时区由 backup() 自己写进清单，不靠调用方传：包名里那个时间戳是按它算的，
    // 清单里没有这一项的话，三个月后没人说得清 `prune-20260918-172233` 是哪个时区的 17:22。
    timezone: tz,
    gitHead: gitFact(repoRoot, ["rev-parse", "HEAD"]),
    gitBranch: gitFact(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]),
    // 三个月后打开这个包的人，第一眼要看到的就是"怎么把它放回去"。
    restore: "在仓库根目录跑：tar -xzf <这个包> -C .",
    files: digests,
  };
  entries.unshift({
    path: "MANIFEST.json",
    data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    mtimeSec: Math.floor(now.getTime() / 1000),
    mode: 0o644,
  });

  // ── 3. 写包 ────────────────────────────────────────────────────────
  const dirAbs = resolveBackupDir(repoRoot, opts.backupDir);
  const range = `${String(opts.manifest.from ?? "earliest")}_${String(opts.manifest.to ?? "latest")}`;
  const name = `prune-${stamp.format("YYYYMMDD-HHmmss")}-${range}.tar.gz`;
  const archiveAbs = join(dirAbs, name);
  // ★ 先写成 .partial，**验过才改名**。
  //   写到一半被 Ctrl-C（或者断电）会留下一个文件 —— 如果它直接叫 .tar.gz，
  //   那么"凡是叫 .tar.gz 的都是验过的包"这条约定就破了，而破的方式是沉默的：
  //   目录里躺着一个看起来完全正常的备份，解开才发现是半截。
  //   改名是原子的，所以崩溃只会留下一个一眼能认出来的 .partial。
  const partialAbs = `${archiveAbs}.partial`;

  let gz: Buffer;
  try {
    gz = tarGz(entries);
  } catch (e) {
    throw new BackupError(`打包失败：${(e as Error).message}`);
  }
  try {
    mkdirSync(dirAbs, { recursive: true });
    // ★ 先挡最终文件名。**`wx` 保护不到它** —— wx 管的是 .partial，而最后那步
    //   `renameSync(.partial → .tar.gz)` 在两个平台上都会**静默覆盖**同名文件。
    //   【2026-09-18 backup.test.ts 的「同名的包绝不覆盖」抓到的】改成先写 .partial
    //   之后这条保证一度丢了：同一秒跑两次清理，第二次会把第一次的包盖掉，
    //   而第一次删掉的那批文件从此没有任何副本 —— 屏幕上两次都印「✓ 已打包并验过」。
    if (existsSync(archiveAbs)) {
      throw new Error(`已经有一个同名的包了：${archiveAbs}`);
    }
    // wx：**存在就报错**，绝不覆盖。
    writeFileSync(partialAbs, gz, { flag: "wx" });
  } catch (e) {
    throw new BackupError(`写不了备份包 ${partialAbs}：${(e as Error).message}`);
  }

  // ── 4. 验包：把刚写出去的包重新解开，和**磁盘上此刻的源文件**逐字节比 ──
  let roundTrip: ArchiveEntry[];
  try {
    roundTrip = untarGz(readFileSync(partialAbs));
  } catch (e) {
    throw new BackupError(
      `刚写出去的包读不回来：${(e as Error).message}\n` +
        `  半成品留在 ${toPosix(relative(repoRoot, partialAbs))}，一个文件都没删。`
    );
  }
  const inPack = new Map(roundTrip.map(e => [e.path, e.data]));

  // ★ 空集合上"逐条比对"是**恒真**的 —— 一个什么都没装的包能通过下面每一条断言。
  //   这和发布闸「扫了 0 篇 ≠ 通过」是同一张脸，所以先把它挡在前面。
  if (unique.length === 0 || inPack.size <= 1) {
    throw new BackupError(
      `包里只有 ${inPack.size} 条（清单本身也算一条）—— 等于什么都没备份。\n` +
        `  逐条比对在空集合上恒真，所以这一档必须单独拦，不能靠后面那几条断言。`
    );
  }

  const expected = new Set(["MANIFEST.json", ...unique]);
  // 两个方向都要报。`多出来的` 抓的是枚举器漂移（收集范围和写包范围不一致），
  // 它最容易被当成无害 —— 而"包里多了一条"意味着这两份清单已经不是同一份了。
  const missing = [...expected].filter(p => !inPack.has(p));
  const extra = [...inPack.keys()].filter(p => !expected.has(p));
  if (missing.length > 0 || extra.length > 0) {
    throw new BackupError(
      `包里的清单和要备份的对不上 —— 不删任何东西。\n` +
        (missing.length > 0 ? `  少了 ${missing.length} 条：${missing.slice(0, 3).join(" / ")}\n` : "") +
        (extra.length > 0 ? `  多了 ${extra.length} 条：${extra.slice(0, 3).join(" / ")}\n` : "") +
        `  半成品留在 ${toPosix(relative(repoRoot, partialAbs))}。`
    );
  }

  for (const p of unique) {
    const packed = inPack.get(p)!;
    let onDisk: Buffer;
    try {
      onDisk = readFileSync(join(repoRoot, ...p.split("/")));
    } catch (e) {
      throw new BackupError(`复核时读不了 ${p}：${(e as Error).message}`);
    }
    if (!packed.equals(onDisk)) {
      throw new BackupError(
        `${p} 在包里的字节和磁盘上的不一致 —— 不删任何东西。\n` +
          `  （打包和复核之间这个文件被改过？包里 ${packed.length} 字节，磁盘上 ${onDisk.length} 字节）`
      );
    }
  }

  // ── 5. 独立复核：机器上有别的 tar 就让它也列一遍 ──────────────────
  // ⚠ 在 .partial 上做，名字无所谓 —— tar 不看扩展名。
  const cross = crossCheck(dirAbs, `${name}.partial`, [...inPack.keys()], opts.tarBin);
  if (cross.status === "disagrees") {
    // ★ 这一档**必须失败**，不许降档成"没能证明"。一个独立实现明确说这个包有问题，
    //   而我们正准备依据这个包去删东西 —— 没有任何理由继续。
    throw new BackupError(
      `独立复核不通过：${cross.detail}。\n` +
        `  半成品留在 ${toPosix(relative(repoRoot, partialAbs))}（没有改名成 .tar.gz），一个文件都没删。`
    );
  }

  // ── 6. 验过了才改名，并在包**外面**留一份验证记录 ──────────────────
  try {
    renameSync(partialAbs, archiveAbs);
  } catch (e) {
    throw new BackupError(`改名失败：${(e as Error).message}`);
  }

  let sidecarNote: string | undefined;
  const verification = {
    archive: name,
    sha256: sha256(gz),
    bytes: gz.length,
    entries: entries.length,
    verifiedAtUtc: new Date(now.getTime()).toISOString(),
    // ★ 验证结论只能写在包**外面**：包内那份物理上不可能包含自己的验证结果
    //   （写它的时候验证还没发生）。哪天谁把 tier 挪进 MANIFEST.json，
    //   那就是一份白纸黑字写着「已验证」而验证根本没跑过的清单。
    tier: cross.status === "confirmed" ? "cross-checked" : "self-verified",
    crossCheck:
      cross.status === "confirmed"
        ? { tool: cross.tool } // 这台机器 PATH 上可能是 GNU tar 也可能是 bsdtar，记下来
        : { skipped: cross.why },
  };
  try {
    writeFileSync(
      `${archiveAbs}.verified.json`,
      `${JSON.stringify(verification, null, 2)}\n`,
      { flag: "wx" }
    );
  } catch (e) {
    // ★ 写不出来不该让一个**已经验过**的包作废，但也**不许静默**：
    //   目录里可能躺着一份旧的同名记录（描述的是另一个包），拿它去核这个包
    //   要么得到假警报、要么得到假放行。所以照常返回，但把话说出来。
    //   【2026-09-18 复核查出来的：这里原来是 `catch {}`】
    sidecarNote =
      `验证记录没写成（${firstLine((e as Error).message)}）—— ` +
      `目录里那份 .verified.json 可能是**别的包**的，别拿它当这个包的凭据`;
  }

  return {
    archive: toPosix(relative(repoRoot, archiveAbs)),
    entries: entries.length,
    sourceBytes,
    archiveBytes: gz.length,
    tier: cross.status === "confirmed" ? "cross-checked" : "self-verified",
    crossCheckSkipped: cross.status === "confirmed" ? undefined : cross.why,
    crossCheckTool: cross.status === "confirmed" ? cross.tool : undefined,
    gitIgnored: isGitIgnored(repoRoot, archiveAbs),
    files: digests,
    sidecarNote,
  };
}

/**
 * git 忽略这个路径吗。**只读**（`git check-ignore`），不改任何状态。
 *
 * 问不出来返回 `null`，**不许兜成 `true`**：默认目录 `.backups/` 在 .gitignore 里，
 * 但 `--backup-dir` 可以指到仓库里任何地方 —— 指到一个没被忽略的目录时，
 * 那个包会静静地躺在 `git status` 里等着被 `git add -A` 一把提进内容仓库。
 * 那等于把刚清理掉的内容以二进制 blob 的形式永久留在仓库里，而清理的动作本身
 * 看起来是成功的。
 */
function isGitIgnored(repoRoot: string, pathAbs: string): boolean | null {
  const rel = toPosix(relative(repoRoot, pathAbs));
  if (rel === "" || rel.startsWith("../") || /^[a-zA-Z]:/.test(rel)) {
    // 仓库外面 —— git 管不着，这不是"没被忽略"，是这个问题不适用。
    return true;
  }
  try {
    execFileSync("git", ["check-ignore", "-q", "--", rel], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    return true; // 退出码 0 = 被忽略
  } catch (e) {
    // 退出码 1 = 没被忽略（这是个明确的答案）；其他退出码 = 问不出来。
    return (e as { status?: number }).status === 1 ? false : null;
  }
}

/**
 * 拿系统上的 tar 再列一遍包里的清单，和我们自己解出来的对账。
 *
 * ★ 这一步的价值**只有一个**：证明"一个和我完全无关的 tar 实现也读得懂这个包"。
 *   ./archive.ts 里的 reader 是我自己写的，它读我自己写的 writer —— 两边共享同一套
 *   假设，一个双向一致的 bug 它抓不到。独立实现能。
 *
 * ## 三档，**不许压成两档**
 *
 *   `confirmed`   —— 独立实现列出了同一份清单。
 *   `unavailable` —— 机器上没有 tar / 调不起来。**这不是失败，是"没能证明"**，
 *                     调用方降档提示后可以继续。
 *   `disagrees`   —— tar 跑起来了，**而且它和我说的不一样**。这是**失败**：
 *                     一个独立实现明确告诉你这个包有问题，没有任何理由继续删东西。
 *
 * ⚠【2026-09-18 这里原来是错的】最初写成了 `{ok: boolean}` 两档，于是
 *   "机器上没有 tar"和"tar 说这个包少了 3 条"走**同一条分支**：都只是打一行黄字、
 *   然后照常把文件删掉。那正是这个项目最不能接受的形状 ——
 *   "我不知道"和"我知道它坏了"在屏幕上和行为上都被合并了。
 *
 * ⚠ 调用方式里的 Windows 坑（2026-09-18 实测）：**不许把带盘符的绝对路径传给 tar**。
 *   Git Bash 里的 GNU tar 会把 `D:` 当成远程主机名
 *   （`tar (child): Cannot connect to D: resolve failed`）。所以这里 `cwd` 设成备份
 *   目录、只传文件名。这台机器上 PATH 里可能是 GNU tar 也可能是 bsdtar
 *   （C:\Windows\System32\tar.exe），两者 `-tzf` 都是一行一个路径，都能用。
 */
type CrossCheck =
  | { status: "confirmed"; tool: string }
  | { status: "unavailable"; why: string }
  | { status: "disagrees"; detail: string };

/**
 * 把 `tar -tzf` 吐出来的一行还原成文件名。**入参是字节，不是字符串。**
 *
 * ★【2026-09-18 实测，两条都不是推测】
 *
 * 1. GNU tar 1.35 在非 TTY 输出时用 `escape` 引用风格，而且它只转义**它认为不可打印的
 *    那几个字节**（C1 控制区 0x80–0x9F、0xAD 这些），其余字节原样输出。于是
 *    `开户第一步.png` 出来是 `345 274 \2 0 0 346 \2 1 0 267 ...` —— **转义和原始字节混在一起**。
 * 2. 所以这里**必须拿 Buffer**：Node 按 utf8 解码子进程输出时，`E5 BC` 后面跟一个 ASCII
 *    反斜杠不是合法 UTF-8，会被替换成 `U+FFFD` —— 原始字节在进这个函数之前就已经没了，
 *    再怎么还原都回不来。这个 bug 第一次修的时候就是栽在这儿：函数写对了，
 *    但喂给它的已经是烂的字符串。
 *
 * 不还原的后果不是"少验一道"，是**假阳性**：包里有一个中文名的截图（教程模块必然有），
 * 就会被判成"系统 tar 和我看到的不是同一份东西"，整批清理 exit 2。
 * 一个正常操作再也跑不起来，接下来发生的事就是有人去想办法绕过备份。
 *
 * bsdtar 不转义、原样输出字节，对它这个函数是恒等变换。
 */
export function unescapeTarName(line: Buffer): string {
  const bytes: number[] = [];
  const BACKSLASH = 0x5c;
  const simple: Record<number, number> = {
    0x6e: 10, // \n
    0x74: 9, //  \t
    0x72: 13, // \r
    0x62: 8, //  \b
    0x66: 12, // \f
    0x76: 11, // \v
    0x61: 7, //  \a
    0x5c: 92, // \\
    0x22: 34, // \"
  };
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== BACKSLASH) {
      bytes.push(line[i]);
      continue;
    }
    const isOctal = (b: number | undefined) => b !== undefined && b >= 0x30 && b <= 0x37;
    if (isOctal(line[i + 1]) && isOctal(line[i + 2]) && isOctal(line[i + 3])) {
      bytes.push(parseInt(line.subarray(i + 1, i + 4).toString("latin1"), 8));
      i += 3;
      continue;
    }
    const next = line[i + 1];
    if (next !== undefined && next in simple) {
      bytes.push(simple[next]);
      i += 1;
      continue;
    }
    bytes.push(BACKSLASH); // 单独一个反斜杠，原样留着
  }
  return Buffer.from(bytes).toString("utf8");
}

export function crossCheck(
  dirAbs: string,
  name: string,
  expected: readonly string[],
  /** 用哪个命令当"独立实现"。**只为测试可注入** —— 生产路径永远是 PATH 上的 tar。
   *  没有它的话，"没有 tar 就降档"和"tar 说包坏了就失败"这两档一条测试都钉不住，
   *  而那正是 backup.ts 里最要紧的两条分叉。 */
  tarBin = "tar"
): CrossCheck {
  let out: Buffer;
  try {
    // ⚠ **拿 Buffer，不要 encoding: "utf8"**。理由见 unescapeTarName 上面那段：
    //   GNU tar 会把转义和原始字节混着输出，utf8 解码会把原始字节换成 U+FFFD，
    //   还原就永远做不成了。
    out = execFileSync(tarBin, ["-tzf", name], {
      cwd: dirAbs,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    // ★【2026-09-18 复核查出来的，原来这里是错的】必须把两件事分开：
    //
    //   连 tar 都找不到（ENOENT）           → **没能证明**（unavailable），可以降档继续
    //   tar 真的跑了、非 0 退出（有 status）→ **它拒绝了这个包**（disagrees），必须失败
    //
    //   原来两者都归 unavailable，于是一个**真的坏掉的包**（tar 会报
    //   "Extended header length is out of range" 之类）只会让屏幕上多一行黄字
    //   「没能独立复核」，然后照常把文件删掉 ——「我不知道」和「我知道它坏了」
    //   在一个专门用来防不可逆操作的模块里被合并了。
    const err = e as { code?: string; status?: number; stderr?: Buffer | string };
    if (typeof err.status === "number") {
      const said =
        String(err.stderr ?? "")
          .split(/\r?\n/)
          .find(l => l.trim()) ?? "";
      return {
        status: "disagrees",
        detail:
          `系统 tar 跑起来了，但它读不了这个包（退出码 ${err.status}` +
          (said ? `：${said.trim()}` : "") +
          `）。这不是"没能证明"，是**证明了有问题**`,
      };
    }
    return {
      status: "unavailable",
      why: `机器上的 tar 列不出这个包（${(e as Error).message.split("\n")[0]}）`,
    };
  }

  const listed = new Set(
    out
      .toString("latin1") // 只为按行切；latin1 是字节↔字符一一对应的，不会丢字节
      .split(/\r?\n/)
      .filter(s => s.trim() !== "")
      .map(s => unescapeTarName(Buffer.from(s, "latin1")).trim())
      // bsdtar 对目录条目会带尾斜杠；我们不写目录条目，但保险起见归一化。
      .map(s => s.replace(/\/$/, ""))
  );
  const missing = expected.filter(p => !listed.has(p));
  const extra = [...listed].filter(p => !expected.includes(p));

  if (missing.length > 0 || extra.length > 0) {
    // ★【2026-09-18 实测踩到，而且是个会卡死正常使用的假阳性】
    //   配图起个中文名（教程模块必然会有），这里曾经直接判"包有问题"、整批 exit 2 ——
    //   而包**其实是好的**：GNU tar 列清单时把非 ASCII 字节按 C 转义印成 `\200\210`，
    //   我拿它去和 UTF-8 路径逐字比，当然对不上。
    //   下面 unescapeTarName() 把转义还原回去；万一还有别的 tar 用别的方式转码，
    //   就只能承认"这个 tar 的清单没法逐字比"，而**不是**说这个包坏了：
    //   逐字节自校验已经过了，我们知道字节是对的，不确定的只是这份清单的编码。
    //   「我不知道」和「我知道它坏了」在这里必须分开 —— 判错方向的代价是
    //   一个完全正常的清理再也跑不起来，然后人开始想办法绕过备份。
    const onlyNonAscii =
      missing.length === extra.length &&
      [...missing, ...extra].every(p => !/^[\x20-\x7e]*$/.test(p));
    if (onlyNonAscii) {
      return {
        status: "unavailable",
        why:
          `机器上的 tar 列非 ASCII 文件名时转了码（${missing.length} 条对不上，` +
          `例如 ${missing[0]}）—— 清单没法逐字比对，这次没能独立复核`,
      };
    }
    // ★ 两个方向都要报。`extra` 最容易被当成无害，而它抓的恰恰是"包里多出来一条" ——
    //   也就是枚举器漂了（walk 的范围、slug 的拼法在某处不一致）。
    return {
      status: "disagrees",
      detail:
        [
          missing.length > 0
            ? `它没看到 ${missing.length} 条（例如 ${missing[0]}）`
            : "",
          extra.length > 0
            ? `它多看到 ${extra.length} 条（例如 ${extra[0]}）`
            : "",
        ]
          .filter(Boolean)
          .join("；") + "。我自己读得懂这个包，但别的 tar 读到的不是同一份东西",
    };
  }

  let version = "tar";
  try {
    version =
      execFileSync(tarBin, ["--version"], { encoding: "utf8" })
        .split(/\r?\n/)[0]
        ?.trim() || "tar";
  } catch {
    // 版本问不出来不影响结论，清单已经对上了。
  }
  return { status: "confirmed", tool: version };
}
