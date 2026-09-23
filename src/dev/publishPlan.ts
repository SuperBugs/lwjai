/**
 * 「提交推送」按钮的**判据**：这次点下去会把哪些文件带上、提交信息默认写什么。
 * 纯函数，零 astro import —— scripts/gate/publish.test.ts 用裸 tsx 喂真实的
 * `git status --porcelain` 输出测它。I/O（真跑 git）在 ./publish-run.ts。
 *
 * ## 只带内容，不带代码
 *
 * 按钮是给"发一篇稿子"用的，所以只提交**内容那几类文件**：
 *   - 登记表里各集合的目录（src/content/posts、qa、guides、prompts、pages）
 *   - 后台粘图落盘的目录（src/assets/<集合>/，见 keystatic.config.ts 的 imageOptions）
 *   - 后台那两页写出来的数据文件（src/data/registry.json 智能体与模型登记表、
 *     src/data/tags.json 标签表）—— 名单在 collections.ts 的 SCANNED_DATA_FILES
 * 工作树里别的改动（代码、配置、文档）**一律不碰**，页面上单独列出来说"这些不会随这次
 * 发布提交"。否则一次发稿会把半做完的代码一起推上 Cloudflare 去构建。
 *
 * 范围从 `src/config/collections.ts` 推，不在这里另写一份路径 —— 和发布闸同一条纪律
 * （两处各写一份，就是哪天一边漏了而全绿）。
 */
import { CONTENT_COLLECTIONS, SCANNED_DATA_FILES } from "../config/collections";

export interface Change {
  /** git 的两位状态码（"?? " 的是未跟踪）。 */
  code: string;
  /** 仓库根相对、正斜杠。改名时是**新**路径。 */
  path: string;
  /** 只有改名有。 */
  from?: string;
}

const CONTENT_PREFIXES: readonly string[] = CONTENT_COLLECTIONS.flatMap(c => [
  `${c.dir}/`,
  `src/assets/${c.key}/`,
]);

/** 这条路径是不是"内容"（会随发布一起提交）。 */
export function isContentPath(path: string): boolean {
  const p = path.split("\\").join("/");
  // 后台那两页写出来的数据文件（智能体与模型登记表、标签表）也算内容 ——
  // 名单从 collections.ts 来，和三道闸同一份：漏掉一份的症状是"后台改了标签、
  // 点发布、它没跟着走"，而页面上不会说。
  if (SCANNED_DATA_FILES.some(f => f.path === p)) return true;
  return CONTENT_PREFIXES.some(prefix => p.startsWith(prefix));
}

/** 解析 `git status --porcelain` 的输出（v1 格式，一行一条）。 */
export function parsePorcelain(output: string): Change[] {
  const out: Change[] = [];
  for (const raw of output.split("\n")) {
    if (raw.trim() === "") continue;
    const code = raw.slice(0, 2);
    let rest = raw.slice(3).trim();
    // git 会给带空格等特殊字符的路径加引号，这里只剥引号，不做转义处理（够用：
    // 后台写出来的文件名是 slug，不会有空格）。
    if (rest.startsWith('"') && rest.endsWith('"')) rest = rest.slice(1, -1);
    const arrow = rest.indexOf(" -> ");
    if (arrow >= 0) {
      out.push({
        code,
        from: rest.slice(0, arrow),
        path: rest.slice(arrow + 4),
      });
    } else {
      out.push({ code, path: rest });
    }
  }
  return out;
}

export interface Plan {
  /** 会被 `git add` 的（内容）。 */
  content: Change[];
  /** 工作树里其余的改动，这次**不动**。 */
  other: Change[];
}

export function classifyChanges(porcelain: string): Plan {
  const plan: Plan = { content: [], other: [] };
  for (const change of parsePorcelain(porcelain)) {
    const hit =
      isContentPath(change.path) ||
      (change.from !== undefined && isContentPath(change.from));
    (hit ? plan.content : plan.other).push(change);
  }
  return plan;
}

/** `git add` 要的路径：改名两头都要给，删掉的文件也要给（git add 会把删除暂存进去）。 */
export function pathsToStage(content: Change[]): string[] {
  const set = new Set<string>();
  for (const c of content) {
    set.add(c.path);
    if (c.from) set.add(c.from);
  }
  return [...set];
}

/**
 * 默认的提交信息：「发布：标题1；标题2」。标题太多或太长就退回「发布 N 条内容改动」——
 * 提交信息第一行超过一百来个字，git log 里就是一坨。
 */
export function defaultMessage(titles: string[], count: number): string {
  const clean = titles.map(t => t.trim()).filter(Boolean);
  if (clean.length > 0 && clean.length === count) {
    const joined = `发布：${clean.join("；")}`;
    if ([...joined].length <= 100) return joined;
  }
  return `发布 ${count} 条内容改动`;
}
