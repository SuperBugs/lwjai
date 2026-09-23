/**
 * 发布闸 · 第三道：**构建期硬拦**（查工作树）。
 *
 * `pnpm build` 的第一步就是它 —— 命中就直接失败，`astro build` 根本不会跑，
 * 站上留着上一次的内容。这是"内容已经进了私有仓库、但还没进公网"那一格的最后一道闸。
 *
 * 为什么它必须排在 `astro check` **前面**：类型错误是"修一下再发"，
 * 泄露是"发出去就收不回来"。先跑贵的那一道。
 *
 * ## 扫哪些目录
 *
 * 从 `src/config/collections.ts` 的登记表推（`scanned: true` 的全都扫），
 * **不是写死一个 posts 目录**。2026-09-18 之前这里是一行
 * `const POSTS_DIR = join(cwd, "src", "content", "posts")`，于是
 * `src/content/pages/about.md` 从来没被扫过 —— 而 about 正文里就有一句
 * 「不写我自己的仓位」（own_size，block 档）。屏幕上当时印的是「扫了 1 篇」+
 * 「✓ 没命中已知的危险说法」+ 退出码 0。**漏扫零症状**，这是最坏的一种。
 * 范围的共享符号在 ./inspect.ts，两道闸都从那里拿。
 *
 * ## 草稿不拦，但会报出来
 *
 * `draft: true` 的稿子在 AstroPaper 里**永远不会生成页面**（`src/utils/postFilter.ts`
 * 第一个条件就是 `!data.draft`，dev 和生产都一样）—— 所以草稿里有危险说法不构成泄露，
 * 拦下来只会让人没法存半成品。但它仍然单独列一档：等你把 draft 去掉的那天，
 * 这道闸会在构建期拦住你，**不如现在就让你看见**。
 *
 * 判据本身在 ./inspect.ts，和 pre-commit 那道共用同一份。
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  inspect,
  inspectDataJson,
  report,
  SCANNED_DATA_FILES,
  SCANNED_SPECS,
  BLD,
  DIM,
  RED,
  OFF,
  type ScanTally,
} from "./inspect";

/** 登记表里的 dir 是仓库根相对、POSIX 正斜杠的，这里按平台分隔符拼回绝对路径。 */
const abs = (dir: string) => join(process.cwd(), ...dir.split("/"));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    // AstroPaper 约定：下划线开头的文件和目录不进 collection（content.config.ts 的 glob
    // 是 `**/[^_]*.{md,mdx}`）。闸门跟着同一条约定，否则会对着一堆模板片段报警。
    if (name.startsWith("_")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.mdx?$/.test(name)) out.push(full);
  }
  return out;
}

// ★ 登记表里一个要扫的集合都没有 —— 这是闸门没跑起来，不是"没有文章"。
//   （把所有 spec 都写成 `scanned: false` 就会走到这里。只靠后面"0 篇"那档兜的话，
//   屏幕上说的是"目录里没稿子"，而真正的原因是"闸门没有要扫的东西"。）
if (SCANNED_SPECS.length === 0) {
  console.error(
    `${RED}${BLD}✗ 发布闸没跑起来${OFF}：登记表里没有任何 scanned: true 的集合。\n` +
      `  看 src/config/collections.ts —— 闸门现在一个目录都不扫。`
  );
  process.exit(2);
}

// ★ 第一档：**任一登记目录不存在（或不是目录）是故障**，不是"这个集合还没有内容"。
//   压成同一档的话，一次路径写错会表现成"扫描通过"，而闸门其实一个字节都没看。
const missing = SCANNED_SPECS.filter(s => {
  const p = abs(s.dir);
  return !existsSync(p) || !statSync(p).isDirectory();
});
if (missing.length > 0) {
  console.error(
    `${RED}${BLD}✗ 发布闸没跑起来${OFF}：有登记在册的内容目录找不到。`
  );
  for (const s of missing) {
    console.error(`  ${s.label}（${s.key}）—— 期望 ${abs(s.dir)}`);
  }
  console.error(
    `  这不是"这个集合还没有内容" —— 是闸门根本没看到那个目录。\n` +
      `  ${DIM}要么把目录建出来（空目录也行，空着会被逐集合报成 0 篇），\n` +
      `  要么去 src/config/collections.ts 把 dir 改对。**注册表是唯一的一份，两道闸都读它。**${OFF}`
  );
  process.exit(2);
}

const tally: ScanTally[] = [];
const files: string[] = [];
for (const spec of SCANNED_SPECS) {
  const found = walk(abs(spec.dir));
  tally.push({ spec, count: found.length });
  files.push(...found);
}

// ★ 第二档：所有登记目录加起来一篇都没有。这同样不是"通过"。
//   注意这里是**加起来**：某一个集合空着（qa 上线第一天目录建好了、还没第一条问答）
//   是正常状态，不许因此让构建失败 —— 那一档靠逐集合报数让人看见，不靠退出码。
if (files.length === 0) {
  console.error(
    `${RED}${BLD}✗ 一篇都没扫到${OFF}\n` +
      SCANNED_SPECS.map(s => `  ${s.label} —— ${s.dir}\n`).join("") +
      `  这几个目录下都没有 .md / .mdx（下划线开头的不算）。\n` +
      `  这**不是**"通过" —— 闸门没有东西可看。空站就该空着，但别让它看起来像扫过了。`
  );
  process.exit(2);
}

const reports = files.map(file =>
  inspect(
    relative(process.cwd(), file).split(sep).join("/"),
    readFileSync(file, "utf8")
  )
);

// ★ 不按篇算的那几份数据文件也过闸（智能体与模型登记表、标签表）：里面是人手填的
//   自由文本，上公网（芯片、悬停提示、标签、/t 两级页面、导出件）。它们不是集合，
//   不按篇算，走 report 的 extra。
//   ⚠ 名单从 src/config/collections.ts 的 SCANNED_DATA_FILES 来，**不许在这儿另写一份** ——
//     三道闸各写各的那天，就是新加的数据文件从其中一道安静穿过去的那天。
//   文件找不到 = 闸门没跑起来（2），不是"表是空的"：agents.ts / tags.ts 在 import 时
//   就会因为它不存在而炸，这里只是把同一件事说得更早、更清楚。
const extra = SCANNED_DATA_FILES.map(f => {
  const path = abs(f.path);
  if (!existsSync(path)) {
    console.error(
      `${RED}${BLD}✗ 发布闸没跑起来${OFF}：${f.label}找不到 —— 期望 ${path}\n` +
        `  ${DIM}后台对应那一页存一次就会生成；路径在 src/config/collections.ts 的 SCANNED_DATA_FILES。${OFF}`
    );
    process.exit(2);
  }
  return inspectDataJson(f.path, readFileSync(path, "utf8"));
});

// explainEmpty: 全量扫的时候，某个集合 0 篇要多解释一句 —— 那可能是目录名拼错。
process.exit(
  report(reports, { scope: "工作树", tally, explainEmpty: true, extra })
);
