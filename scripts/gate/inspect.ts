/**
 * 闸门的共用核心：给一份稿子的原文，判它能不能发，并把话说清楚。
 *
 * ★ **两道闸共用这一份，不许各写各的。**
 *     scripts/gate/check.ts         —— 查工作树，`pnpm gate` 和 `pnpm build` 用
 *     scripts/gate/check-staged.ts  —— 查 git 暂存区，pre-commit 钩子用
 *   这两道的输入不同（磁盘 vs 索引），判据必须完全相同。
 *   作者的另一个项目出过的最贵那个 bug 就是同一个判据在两处各写了一份、其中一处错了而全绿。
 *
 * 2026-09-18 起这里还多了一样共用的东西：**扫描范围**（`SCANNED_SPECS` /
 * `SCANNED_PATH_RE` / `scannedSpecForPath`）。在那之前范围是两道闸各写一份的，
 * 后果见下面那段注释 —— 判据同源但范围不同源，等于两道闸看的根本不是同一批稿子。
 */

import matter from "gray-matter";
import { scan, type Hit } from "./scan";
import {
  CONTENT_COLLECTIONS,
  REGISTRY_FILE,
  ANSWER_ORDER_FILE,
  SCANNED_DATA_FILES,
  SCANNED_DIRS,
  SYMBOLS_FILE,
  TAGS_FILE,
  type ContentCollectionSpec,
} from "../../src/config/collections";

// 不按篇算的那几份数据文件（智能体与模型登记表、标签表、回答排序表）路径也从登记表来
// （理由见 collections.ts 里 SCANNED_DATA_FILES 的注释）。
// 三道闸都从这里拿，不许各写一份字符串。
export {
  REGISTRY_FILE,
  TAGS_FILE,
  SYMBOLS_FILE,
  ANSWER_ORDER_FILE,
  SCANNED_DATA_FILES,
};
// ⚠ 相对路径，不是 `@/`。这两个脚本是裸 tsx 跑的（pre-commit 钩子、Cloudflare 构建
//   第一步），那里没有 Astro 的 tsconfig 别名解析 —— 用别名会在构建机上炸，
//   而本机 dev 里看起来一切正常。

// ── 扫描范围：两道闸从同一份登记表推出来 ────────────────────────────────
//
// ★ **范围不许两道闸各写一份。** 2026-09-18 之前就是各写一份：
//     check.ts        —— `join(cwd, "src", "content", "posts")`（路径片段拼的绝对路径）
//     check-staged.ts —— `/^src\/content\/posts\/.*\.mdx?$/`（字符串正则）
//   两者之间没有任何共享符号，所以 `src/content/pages/about.md` 两道闸都没扫过，
//   而屏幕上照常印「✓ 没命中已知的危险说法」、退出码 0。新建 src/content/qa/ 也一样：
//   `files.length` 因为 posts 还有稿所以 > 0，exit 2 不触发，**一个字的报错都没有**。
//   这正是 docs/gate.md 第 7 节那个 `SC 13D` 事故的形态 —— 两处各写一份、其中一处错了、
//   全绿。现在两道闸都只认下面这几个符号，改一边忘一边做不到了。
//   （scripts/gate/coverage.test.ts 还从磁盘反过来对一遍账。）

/** 要扫的集合，按登记表里的顺序 —— 报表也按这个顺序印。 */
export const SCANNED_SPECS: readonly ContentCollectionSpec[] =
  CONTENT_COLLECTIONS.filter(s => s.scanned);

/** 长目录排前面：万一哪天某个 dir 是另一个的前缀（`src/content/posts` 和
 *  `src/content/posts-archive`），不许让短的那个把长的抢走。 */
const BY_DEPTH = [...SCANNED_SPECS].sort((a, b) => b.dir.length - a.dir.length);

const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 暂存区闸用的路径过滤器：`git diff --cached` 给的是仓库相对的正斜杠路径。
 *
 * 放在这个模块里是刻意的 —— 它和 `SCANNED_SPECS`（构建期闸遍历的那份）出自同一份
 * 登记表，中间有共享符号钉着。目录名必须整段命中且后面跟一个 `/`，
 * 所以 `src/content/pageshadow/x.md` 不会被 `src/content/pages` 顺手捞进来。
 */
export const SCANNED_PATH_RE: RegExp = new RegExp(
  `^(?:${SCANNED_DIRS.map(reEscape).join("|")})/.*\\.mdx?$`
);

/**
 * 一个仓库相对路径属于哪个被扫的集合。
 *
 * ★ **认不出来返回 undefined，调用方必须自己处理。** 不许在这里兜一个"默认算研究稿"——
 *   那会让"扫了一个文件、但没人知道它属于哪个集合"这件事在报表里完全看不出来，
 *   而逐集合报数的那几个数字就成了假的。report() 会把合计对不上当闸门故障处理。
 */
export function scannedSpecForPath(
  path: string
): ContentCollectionSpec | undefined {
  const p = path.split("\\").join("/");
  return BY_DEPTH.find(s => p.startsWith(`${s.dir}/`));
}

export interface FileReport {
  file: string;
  isDraft: boolean;
  /** block 档的全部命中。非空 = 不能发。
   *
   *  ★【2026-09-18 删掉豁免机制之后】这里**没有任何放行口**了 ——
   *  以前它是"豁免之后仍然拦着的"，现在就是 block 档命中的全部。
   *  唯一的出路是改文案。 */
  blocked: Hit[];
  warnings: Hit[];
}

export function inspect(file: string, raw: string): FileReport {
  const { data, content } = matter(raw);

  /**
   * 扫什么：**所有会上公网的自由文本**，一个都不许少。
   *
   * 标题和摘要会出现在列表页、`<meta>`、OG 图里，这两项一直在扫。
   * 2026-09-18 补上后面两项 —— 它们同样上公网、同样是人手填的自由文本，
   * 而闸门原本一个字都不看：
   *
   *   - `tags` 渲染在详情页，而且撑起整套 /tags/ 公开页面。"我的持仓复盘"
   *     是一个人真的会随手打上的标签。
   *
   * ⚠【2026-09-22 搬家了，覆盖没断】这里原来还有两项：`symbolName`（公司中文名）和
   *   `symbolNameEn`（公司英文名称）—— 它们渲染在标的芯片的可见文本和 title 属性里，
   *   而且常常是从上游系统带出来的（"特斯拉（example_server 自动带出）"那种）。
   *   标的那一格改成多选之后，**名字从条目上搬进了标的表**（src/data/symbols.json，
   *   后台「标的」那一页），条目上只剩代码 —— 代码是封闭词表里的值，夹带不进自由文本。
   *   那两段字现在由 `inspectDataJson` 扫（`SCANNED_DATA_FILES` 里那一行），
   *   `registryGate.test.ts` 钉着那张名单和三道闸都在扫。
   *   ★ 所以这里**不该**再留着那两个键名："扫一个 schema 里已经不存在的字段"
   *     看起来像有保障，实际钉的是另一件事（docs/engineering-notes.md 第一节最后那段说的形态）。
   *
   * `contributor`（提示词的投稿人署名）是 2026-09-18 收投稿时补的：它同样渲染在
   * 页面可见文本里，而且**这一项的字不是我写的** —— 投稿人会在署名栏里写
   * "某某（嘉信账户实盘验证过）"这种东西。别人写的自由文本比自己写的更该扫。
   *
   * ⚠ `agent` 不用扫 —— 它是 `z.enum(AGENT_IDS)` 的封闭枚举，塞不进自由文本。
   *   （这也正是这一轮把 `sourceModel` 那个自由文本字段换掉的理由：
   *   它上公网而闸门不看，填「gemini-3-pro（跑在 example_server 上）」零症状。）
   *
   * ★ 下面这张清单是**白名单**：frontmatter 里没写进来的字段一律不扫。
   *   新增一个会上公网的自由文本字段却忘了加进来 = 零症状漏扫（docs/engineering-notes.md 坑 7 同形态）。
   *   `coverage.test.ts` 有一条负方向用例钉着它。
   */
  const tags: string[] = Array.isArray(data.tags) ? data.tags.map(String) : [];
  const subject = [
    data.title ?? "",
    data.description ?? "",
    data.contributor ?? "",
    // 标签之间用换行拼，**不是空格**：第一人称锚点把 \n 当硬边界，否则
    // ["为什么我看错了", "成本结构"] 两个各自无害的标签会被连成一条 own_cost 误伤。
    tags.join("\n"),
    content,
  ].join("\n\n");
  const result = scan(subject);

  return {
    file,
    isDraft: data.draft === true,
    // ★★ 这一行是 2026-09-18 删豁免时唯一改动的判据 ★★
    //    必须是 `result.blocking`（只有 block 档），**不许写成 `result.hits`**。
    //    写成 hits 会把 warn 档一并拦下 —— 而当时全部 139 条测试一条都不会红
    //    （样本里 warn 命中数恰好全是 0），症状要等下一篇带「底仓」或
    //    「我打算买」的稿子才出现，而且表现成"这句话怎么发不出去了"。
    //    coverage.test.ts 里有一条分档用例专门钉这一行，实跑破坏过。
    blocked: result.blocking,
    warnings: result.warnings,
  };
}

/**
 * 不按篇算的那几份数据文件过闸（`SCANNED_DATA_FILES`：智能体与模型登记表、
 * 【2026-09-21 加的】标签表）。
 *
 * 【2026-09-20】登记表从代码挪进了后台可编辑的 JSON，于是 name / vendor / note 变成了
 * 人手填的自由文本 —— 而它们上公网（芯片、悬停提示、问答署名、分享卡、导出的 .md）。
 * 标签表是同一副形状：人在后台打的字，渲染在卡片、详情页和 /t 两级页面上。
 * 按 docs/gate.md 7.5 的判据：**上公网的自由文本必须过闸**。原来"agent 不用扫"
 * 那句成立的前提是它是一份写死的封闭枚举；现在枚举的**值**仍然封闭（id），
 * 但每个 id 后面跟着三段自由文本，扫的就是这三段。
 *
 * 扫法：把 JSON 里**所有**字符串值（id 也算，无害）用换行拼起来交给 scan()。
 * 用换行不用空格：第一人称锚点把 \n 当硬边界，和 inspect() 里 tags 的拼法同一条理由。
 *
 * ⚠ 不是合法 JSON 就**抛**，不当成"空表通过"：agents.ts 那边 import 时也会抛，
 *   这里抛只是让报错更早、更近（提交那一刻，而不是构建那一刻）。
 *
 * 返回和 inspect() 同一个形状，报表里和普通条目一起列（isDraft 永远 false：
 * 登记表没有草稿这一档，改了就是改了）。
 */
export function inspectDataJson(file: string, raw: string): FileReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `${file} 不是合法 JSON（${e instanceof Error ? e.message : String(e)}）—— ` +
        `去后台对应那一页（「智能体与模型」/「标签」）存一次，或者手改回合法 JSON。`
    );
  }
  const strings: string[] = [];
  const collect = (v: unknown): void => {
    if (typeof v === "string") strings.push(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === "object")
      Object.values(v as Record<string, unknown>).forEach(collect);
  };
  collect(parsed);
  const result = scan(strings.join("\n"));
  return {
    file,
    isDraft: false,
    blocked: result.blocking,
    warnings: result.warnings,
  };
}

export const DIM = "\x1b[2m";
export const RED = "\x1b[31m";
export const YEL = "\x1b[33m";
export const GRN = "\x1b[32m";
export const BLD = "\x1b[1m";
export const OFF = "\x1b[0m";

/** 逐集合的扫描篇数。带上整个 spec 而不是只带一个 label ——
 *  报表要用 `spec.dir` 才能在 0 篇的时候把目录名摆出来给人对。 */
export interface ScanTally {
  spec: ContentCollectionSpec;
  count: number;
}

/**
 * 把一批判定结果打印出来，返回该用的退出码。
 *
 * 退出码三档，刻意分开：
 *   0 —— 放行（可能带 warn 档提醒）
 *   1 —— 有稿子没过闸
 *   2 —— **闸门自己没跑起来**（找不到目录、一篇都没扫到、自己的账对不上）。
 *        这一档绝不许和 0 合并：一次路径写错会表现成"扫描通过"，
 *        而闸门其实一个字节都没看过。
 *
 * ★ **篇数必须逐集合报，不许只报一个总数。** 把两三个集合混成「扫了 3 篇」之后，
 *   "问答 0 篇"就藏在一个不可读的数字里 —— 而 qa 目录名拼错（qas/ / QA/）
 *   恰恰表现成"总数还是那么多、扫过了、通过"。见 docs/gate.md 第 3 节。
 */
export function report(
  reports: FileReport[],
  opts: {
    scope: string;
    tally: readonly ScanTally[];
    /** 某个集合 0 篇要不要多解释一句。
     *  查工作树全量时要 —— 那里的 0 篇可能是目录名写错了；
     *  查单次提交时不要 —— 那里 0 篇是常态，天天印这句话它就变成背景噪音，
     *  真正该被看见的那次也一起被无视掉。 */
    explainEmpty?: boolean;
    /**
     * 不按篇算的东西（`SCANNED_DATA_FILES` 那几份，`inspectDataJson` 的结果：
     * 智能体与模型登记表、【2026-09-21 加的】标签表）。
     * 它们的命中和普通条目一起报、一起决定退出码，但**不进逐集合的账**——
     * 下面那条"合计对不上 = 故障"的判据只对按篇算的条目成立。
     */
    extra?: readonly FileReport[];
  }
): number {
  const extra = opts.extra ?? [];
  const all = [...reports, ...extra];
  // ★【2026-09-18 删掉豁免机制之后】这里只剩一条判据。
  //   以前还有两条（豁免码拼错、豁免了没写理由），它们随机制一起消失 ——
  //   退出码三档（0/1/2）一个没动，只是 exit 1 的入口从三条收窄成一条。
  const problems = all.filter(r => !r.isDraft && r.blocked.length > 0);
  const draftFlagged = all.filter(r => r.isDraft && r.blocked.length > 0);
  const warned = all.filter(r => !r.isDraft && r.warnings.length > 0);
  const drafts = all.filter(r => r.isDraft).length;

  const tallied = opts.tally.reduce((s, t) => s + t.count, 0);
  const breakdown =
    opts.tally.length === 0
      ? `${RED}没有任何登记在册的集合${OFF}`
      : opts.tally
          .map(t => {
            const n = `${t.spec.label} ${t.count} 篇`;
            // 0 篇在全量扫的时候是要被看见的东西，不许它长得和别的数字一样。
            return t.count === 0 && opts.explainEmpty ? `${YEL}${n}${OFF}` : n;
          })
          .join(` ${DIM}·${OFF} `);

  console.log(
    `\n${BLD}发布闸${OFF} ${DIM}(${opts.scope})${OFF}  ${breakdown}` +
      `  ${DIM}共 ${reports.length} 篇，其中草稿 ${drafts} 篇` +
      (extra.length > 0
        ? `；另扫了 ${extra.length} 份数据文件（${extra.map(r => r.file).join(" / ")}）`
        : "") +
      `${OFF}`
  );

  if (opts.explainEmpty) {
    for (const t of opts.tally.filter(t => t.count === 0)) {
      console.log(
        `${DIM}  ${t.spec.label} 一篇都没有（${t.spec.dir}）—— 如果这不是你预期的，` +
          `先核一眼目录名：拼错了在这里表现成"扫过了、通过"。${OFF}`
      );
    }
  }

  for (const r of problems) {
    console.error(`\n${RED}${BLD}✗ ${r.file}${OFF}`);
    for (const h of r.blocked) {
      console.error(`  ${BLD}${h.code}${OFF}  命中「${RED}${h.matched}${OFF}」`);
      console.error(`    ${DIM}…${h.context.replace(/\n/g, " ")}${OFF}`);
      console.error(`    ${DIM}为什么拦：${h.rule.why}${OFF}`);
    }
  }

  if (warned.length > 0) {
    console.log(`\n${YEL}${BLD}⚠ 能发，但你要知道自己写了这几句${OFF}`);
    for (const r of warned) {
      console.log(`  ${r.file}`);
      for (const h of r.warnings) {
        console.log(
          `    ${h.code} 「${h.matched}」 ${DIM}${h.context.replace(/\n/g, " ")}${OFF}`
        );
      }
    }
  }

  if (draftFlagged.length > 0) {
    console.log(
      `\n${DIM}草稿里有 ${draftFlagged.length} 篇命中了 block（草稿不生成页面，这次不拦）：${OFF}`
    );
    for (const r of draftFlagged) {
      console.log(
        `  ${DIM}${r.file} —— ${r.blocked.length} 处，去掉 draft 之前得先处理${OFF}`
      );
    }
  }

  if (problems.length > 0) {
    console.error(
      `\n${RED}${BLD}拦下了${OFF}：${problems.length} 篇没过发布闸。\n` +
        `唯一的出路是改掉上面那几句 —— 这道闸没有豁免口，也没有开关。\n` +
        `${DIM}  误伤也一样。每条命中都摆了三样东西：命中的原文、前后 24 字的上下文、\n` +
        `  以及这条规则为什么存在。照着换个说法（去掉第一人称，或者把话说成别人的），\n` +
        `  再跑一次 pnpm gate。\n` +
        `  ⚠ 别用"把这条规则降成 warn"来解决一次误伤 —— 那是拿全站换一句话。${OFF}\n`
    );
    return 1;
  }

  // ★ 逐集合合计和实际扫的篇数对不上 = **闸门自己的账错了**，按故障（2）处理。
  //   这两个数出自同一份文件清单，对不上只有一种原因：有文件被扫了、却没归进
  //   任何一个登记集合（`scannedSpecForPath` 认不出来）—— 也就是登记表和
  //   路径过滤器之间开始各说各话了。这一档放在"没过闸"后面：真有泄露要先报泄露。
  if (tallied !== reports.length) {
    console.error(
      `\n${RED}${BLD}✗ 发布闸自己的账对不上${OFF}：逐集合合计 ${tallied} 篇，实际扫了 ${reports.length} 篇。\n` +
        `  有文件被扫了但归不进任何一个登记集合。这不是"通过" —— 报表里那几个数字已经是假的了。\n` +
        `  ${DIM}对一眼 src/config/collections.ts 里的 dir 和 scripts/gate/inspect.ts 的 SCANNED_PATH_RE。${OFF}`
    );
    return 2;
  }

  // ★ 收尾**必须分两档**。压成一句「✓ 通过」是这个项目点名禁止的
  //   （docs/engineering-notes.md 第二节：空状态、失败状态、"我不知道"，三者必须长得不一样）。
  //
  //   【2026-09-18】中间那一档原来是"靠豁免过的"。豁免机制删掉之后换成 warn 档 ——
  //   **不是随便找个东西来填坑**：warn 档在这之前就一直被收尾那句绿 ✓ **当场否认**
  //   （屏幕上先逐条列出 own_intent / bare_position_term，紧接着印
  //   「✓ 没命中已知的危险说法」）。换过来顺手修掉了这个自相矛盾。
  const warnCount = warned.reduce((s, r) => s + r.warnings.length, 0);
  if (warnCount > 0) {
    console.log(
      `\n${YEL}${BLD}✓ 放行，但有 ${warnCount} 处 warn 档命中${OFF}${DIM}（上面逐条列着 —— 不是"没命中"）${OFF}\n`
    );
  } else {
    console.log(
      `${GRN}✓ 没命中已知的危险说法${OFF} ${DIM}—— 注意：这不等于"安全"，词表必然有漏网。${OFF}\n`
    );
  }
  return 0;
}
