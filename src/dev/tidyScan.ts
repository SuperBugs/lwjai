import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import {
  SCANNED_SPECS,
  SCANNED_PATH_RE,
  scannedSpecForPath,
} from "../../scripts/gate/inspect";
import { tidyText, type TidyRemoval } from "../../scripts/content/tidyPlan";

/**
 * 「清理特殊字符」的**磁盘那一半** —— 扫一遍、写一遍。判据在
 * `scripts/content/tidyPlan.ts`（纯函数、有单测），这里一个字的判断都不许有。
 *
 * 页面（`tidy.astro`）和接口（`tidy-run.ts`）**读的是这一份**：
 * 屏幕上列出来的那几行和按下去真的会删的那几行，必须出自同一次扫描 ——
 * 两边各写一份的话，"你看到的"和"它删的"可以不是同一批，而且不会有任何报错。
 *
 * ★ **范围从发布闸拿**（`SCANNED_SPECS` / `SCANNED_PATH_RE`）：
 *   在这儿另写一份 `join(cwd, "src", "content", …)` 就是把坑 7 重挖一遍 ——
 *   新增一个集合时它会安静地漏掉那个目录，而屏幕上照常印"没得清"。
 */

export interface TidyFileReport {
  /** 仓库相对路径，正斜杠。 */
  path: string;
  /** 集合的中文名（「研究稿」「问答」…），认不出来是 undefined，不兜底。 */
  collection: string | undefined;
  /** frontmatter 里的 `title:`，读不到就是路径本身。 */
  title: string;
  removed: TidyRemoval[];
}

/**
 * 这条路径**允许不允许被这个功能写**。
 *
 * ★ 接口那一侧必须拿它挡一道：请求里的路径是浏览器发来的字符串，
 *   而这条接口能写磁盘。只认「登记在册的内容目录底下、`.md`/`.mdx`、
 *   路径里没有 `..`、没有下划线开头的段」。
 * ⚠ 下划线那一条跟的是 `content.config.ts` 的 glob（`**​/[^_]*.{md,mdx}`）——
 *   那些是模板片段，不是稿子。
 */
export function isTidyTarget(path: string): boolean {
  const p = path.split("\\").join("/");
  if (p.includes("..") || p.startsWith("/")) return false;
  if (!SCANNED_PATH_RE.test(p)) return false;
  return !p.split("/").some(seg => seg.startsWith("_"));
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith("_")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.mdx?$/i.test(name)) out.push(full);
  }
  return out;
}

/** frontmatter 里的标题。读不到就还路径 —— **不许还空串**：屏幕上一行没有名字的
 *  条目和"这一条没有标题"长得一样，而前者是这个函数没读懂。 */
export function titleOf(raw: string, fallback: string): string {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] ?? "";
  const line = /^title:\s*(.+?)\s*$/m.exec(front)?.[1];
  if (!line) return fallback;
  const s = line.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    try {
      return JSON.parse(s) as string;
    } catch {
      return s.slice(1, -1);
    }
  }
  return s.replace(/^'(.*)'$/, "$1");
}

const repoRel = (abs: string) =>
  relative(process.cwd(), abs).split(sep).join("/");

/**
 * 登记在册、但磁盘上**找不到**的目录。
 *
 * ★ 这一档是"扫不全"，和"没东西可清"完全两回事（docs/engineering-notes.md 第二节）。
 *   静静跳过的话：目录名拼错 / 新集合的 dir 写错，屏幕上照常印「一份都没有」，
 *   而它一个字节都没读 —— 和坑 7 同一个形态。`scanTidy()` 把它摊出来，
 *   页面上是一条红框。`content:check` 在同一处是 exit 2，这里没有退出码，
 *   所以只能靠屏幕。
 */
export function missingDirs(): string[] {
  return SCANNED_SPECS.filter(s => {
    const p = join(process.cwd(), ...s.dir.split("/"));
    return !existsSync(p) || !statSync(p).isDirectory();
  }).map(s => s.dir);
}

/** 扫一遍全部内容，只还**有东西可清**的那几份。找不到的目录跳过 —— 调用方
 *  必须同时问一句 `missingDirs()`，否则"扫不全"会伪装成"没东西可清"。 */
export function scanTidy(): TidyFileReport[] {
  const out: TidyFileReport[] = [];
  const missing = new Set(missingDirs());
  for (const spec of SCANNED_SPECS) {
    if (missing.has(spec.dir)) continue;
    const dir = join(process.cwd(), ...spec.dir.split("/"));
    for (const file of walk(dir)) {
      const raw = readFileSync(file, "utf8");
      const { removed } = tidyText(raw);
      if (removed.length === 0) continue;
      const path = repoRel(file);
      out.push({
        path,
        collection: scannedSpecForPath(path)?.label,
        title: titleOf(raw, path),
        removed,
      });
    }
  }
  return out;
}

export interface TidyWriteResult {
  path: string;
  /** 真动了几行。0 = 这一份现在没东西可清（多半是刚才已经清过了）。 */
  removed: number;
  lines: number[];
  /** 没写成的原因。有它就是**没动过盘**，`removed` 一定是 0。 */
  error?: string;
}

/**
 * 真去写盘。**只动判据说的那几行**，其余字节原样。
 *
 * ★ 逐个文件独立：一份写失败不影响别的，而且每一份的结果各自报 ——
 *   合成一句"清理完成"的话，"5 份全清了"和"4 份清了 1 份没权限"长得一样。
 */
export function tidyFiles(paths: readonly string[]): TidyWriteResult[] {
  return paths.map(path => {
    if (!isTidyTarget(path)) {
      return { path, removed: 0, lines: [], error: "不是登记在册的内容文件" };
    }
    const abs = join(process.cwd(), ...path.split("/"));
    try {
      const raw = readFileSync(abs, "utf8");
      const { text, removed } = tidyText(raw);
      if (removed.length === 0) return { path, removed: 0, lines: [] };
      writeFileSync(abs, text, "utf8");
      return { path, removed: removed.length, lines: removed.map(r => r.line) };
    } catch (e) {
      return {
        path,
        removed: 0,
        lines: [],
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });
}
