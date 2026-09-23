/**
 * 暂存区闸「查哪几条路径」的测试 —— **跑真的 git，不比源码字符串**。
 *
 * ## 它钉的是哪一次事故
 *
 * 【2026-09-21】`check-staged.ts` 的 `--diff-filter` 原来是 `ACM`，漏了 `R`（改名）。
 * git 判"改名"的相似度阈值默认是 **50%**，所以**改名 + 重写将近一半正文**那种提交
 * 整条记录仍然是 `R` —— 那版过滤器一个文件都列不出来，闸门照常印一句
 * 「这次提交没有改动内容，跳过」、退出码 0。当天一次大改名提交里 7 个内容文件
 * 全被判成 `R`，暂存区闸只扫了 1 篇。
 *
 * ## 为什么造一个真仓库，而不是断言那行字长什么样
 *
 * `assert.match(src, /--diff-filter=d/)` 钉的是**今天这行字的写法**，不是
 * "它真的把改名列出来了"。换成 `ACMR`、或者 git 哪天改了改名检测的默认行为，
 * 那种断言照样绿 —— 正是 docs/gate.md 第 7 节 `SC 13D` 的形态：
 * **以为有保障，其实钉的是另一件事**。
 *
 * 所以这里 `git init` 一个临时仓库、真的 `git mv` + 改内容、
 * 拿**闸门自己那份 `STAGED_DIFF_ARGS`** 去问 git。
 *
 * ⚠ 造出来的相似度要**刻意压到阈值附近**（下面那条实测是 `R066`）：
 *   造一个 `R100` 的纯改名当然也会被漏掉，但那种情况内容没变、之前扫过，
 *   钉它证明不了这条闸真的堵上了。
 *
 * ## ⚠ 这几条**钉不住什么**（免得下一个人以为钉住了）
 *
 * 四处破坏实跑过（2026-09-21）：改回 `ACM` 红、丢掉 `--cached` 红、
 * 完全不加过滤（删除进清单）红 —— 但**换成 `ACMR` 是绿的**。
 *
 * 那是对的：`ACMR` 对今天的 git 来说行为正确，测试钉的是**行为**，不是写法。
 * 选排除法（`d`）的理由是"git 以后新增的字母天然被包含"，而那件事**今天没有
 * 任何输入可以触发** —— 它只能靠 `stagedPaths.ts` 里那段注释守。
 * 别为了让这条测试"也钉住写法"去 `assert.match` 那行字：
 * 那样钉的就又是"今天这行长什么样"了。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { STAGED_DIFF_ARGS, stagedPaths } from "./stagedPaths";
import { SCANNED_PATH_RE } from "./inspect";
import { scan } from "./scan";

/** 一句**实测是 block 档**的泄露（下面第一条用例会先验这件事）。 */
// 例句，数字是编的（不是任何人的真实仓位）。
const LEAK = "我持有 300 股特斯拉。";

/** 一篇干净稿子的正文，八行 —— 换掉其中一行大约就是 R066。 */
const CLEAN = Array.from({ length: 8 }, (_, i) => `第 ${i + 1} 段正文。`);

const git = (cwd: string, args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" });

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "lwj-staged-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "t"]);
  // 改名检测要能认出来，工作树得先有一份提交过的原件。
  mkdirSync(join(root, "src", "content", "posts"), { recursive: true });
  writeFileSync(
    join(root, "src", "content", "posts", "1000.md"),
    `${CLEAN.join("\n")}\n`,
    "utf8"
  );
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "init"]);
  return root;
}

/** 拿闸门自己那份参数问 git —— 两处各写一份的那天，这条测试就只是在测自己。 */
const listStaged = (root: string) =>
  stagedPaths(git(root, [...STAGED_DIFF_ARGS]));

test("探针本身必须是 block 档 —— 否则下面几条钉的是空气", () => {
  // 规则表收窄过好几次（docs/gate.md 第 4 节）。哪天这句不再是 block，
  // 要在这里红，而不是让"改名会被扫到"那条用例悄悄变成一句废话。
  assert.equal(scan(LEAK).verdict, "block", `「${LEAK}」不再是 block 档了`);
});

test("★ 改名 + 改内容：新路径必须进清单（2026-09-21 那个洞）", () => {
  const root = repo();
  try {
    git(root, [
      "mv",
      "src/content/posts/1000.md",
      "src/content/posts/1001.md",
    ]);
    // 八行里换掉一行 —— 相似度还在 50% 以上，git 仍然判改名。
    writeFileSync(
      join(root, "src", "content", "posts", "1001.md"),
      `${[...CLEAN.slice(0, 7), LEAK].join("\n")}\n`,
      "utf8"
    );
    git(root, ["add", "-A"]);

    // 前提：git 真的把它判成了改名。不是的话这条用例测的就不是那个洞了。
    const status = git(root, ["diff", "--cached", "--name-status"]);
    assert.match(
      status,
      /^R\d+\t/m,
      `git 没把它判成改名（实际是：${status.trim()}）—— 这条用例的前提不成立了，` +
        `换个改动幅度重新造`
    );

    const paths = listStaged(root);
    assert.ok(
      paths.includes("src/content/posts/1001.md"),
      `改名过的新路径不在清单里 —— 暂存区闸会印一句「没有改动内容，跳过」，` +
        `而那一份正文里有一句 block 档的泄露。实际清单：${JSON.stringify(paths)}`
    );
    // 列出来还不够：它得落在扫描范围里，闸门才会真的读它。
    assert.ok(
      SCANNED_PATH_RE.test("src/content/posts/1001.md"),
      "新路径没落进扫描范围 —— 列出来了也不会被读"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("普通的新增和修改照样在清单里 —— 别把常见那条一起关掉", () => {
  const root = repo();
  try {
    writeFileSync(
      join(root, "src", "content", "posts", "1000.md"),
      `${[...CLEAN.slice(0, 7), "改了一行。"].join("\n")}\n`,
      "utf8"
    );
    writeFileSync(
      join(root, "src", "content", "posts", "1002.md"),
      `${CLEAN.join("\n")}\n`,
      "utf8"
    );
    git(root, ["add", "-A"]);
    const paths = listStaged(root);
    assert.ok(paths.includes("src/content/posts/1000.md"), "改过的那篇不在清单里");
    assert.ok(paths.includes("src/content/posts/1002.md"), "新增的那篇不在清单里");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("★ 删掉的路径不许进清单 —— `git show :<已删除>` 会炸", () => {
  // 这是排除法唯一要排掉的那一种。进了清单的话闸门不是"拦下"，是**崩掉**，
  // 而崩掉的钩子在 git 那边同样是非零退出 —— 人看到的是一堆栈，不是一句话。
  const root = repo();
  try {
    git(root, ["rm", "-q", "src/content/posts/1000.md"]);
    const paths = listStaged(root);
    assert.deepEqual(
      paths,
      [],
      `删除进了清单：${JSON.stringify(paths)}`
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
