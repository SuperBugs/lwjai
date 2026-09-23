/**
 * 暂存区闸「查哪几条路径」的判据。【2026-09-21 从 check-staged.ts 抽出来的】
 *
 * ## 为什么值得单独一个文件
 *
 * 这一处**出过一次真的洞**（docs/gate.md 第 2 节那条 ⚠）：`--diff-filter` 原来写的是
 * `ACM`，漏了 `R`（改名），于是"改名 + 重写将近一半正文"那种提交在暂存区闸这里
 * **一个文件都列不出来**，屏幕上照常一句「这次提交没有改动内容，跳过」。
 *
 * 抽出来是为了**让测试能跑真的 git**：`check-staged.ts` 是个顶层就执行、
 * 结尾 `process.exit` 的脚本，import 不了，测试只能去比源码字符串 ——
 * 而比字符串钉的是"今天这行字长什么样"，不是"它真的把改名列出来了"。
 * 那正是 `SC 13D` 事故的形态（docs/gate.md 第 7 节）。
 *
 * 现在 `stagedFilter.test.ts` 造一个临时仓库、真的 `git mv` 一次，
 * 拿**下面这同一个 `STAGED_DIFF_ARGS`** 去问 git，断言那条路径真的在清单里。
 *
 * 零 import：闸门是裸 tsx 跑的（pre-commit、Cloudflare 构建第一步）。
 */

/**
 * 问 git 要"即将被提交的路径"的那几个参数。
 *
 * ## ⚠ `--diff-filter=d` 是**小写**的，别"顺手"换成大写列举
 *
 * 小写字母是**排除**：`d` = 「除了删除，其余全要」。
 *
 * 【2026-09-21 实测】git 判"改名"的相似度阈值默认是 **50%** —— 一次提交里
 * 改名 + 重写将近一半正文，整条记录仍然是 `R`（实测 8 行里换掉 1 行报 `R066`）。
 * 写成 `ACM` 的那版因此会把这种提交整个漏掉，而且**零症状**：
 * 清单是空的 → 闸门走"没有东西要查"那条静默放行的路 → 退出码 0。
 *
 * **为什么是排除法而不是 `ACMR`**：列举法漏一个字母就是漏一类改动
 * （`T` 类型变更、`B` 配对断裂同样会进索引），而漏了不会有任何一处报错。
 * 排除法只排掉唯一一种"路径已经不存在、`git show :<path>` 会炸"的情况，
 * git 以后新增的字母天然被包含。闸门宁可多拦，不许放过。
 *
 * ★ 改名时 `--name-only` 给出的是**新路径**（实测），也就是即将进仓库的那一份，
 *   正是要查的那一条。
 */
export const STAGED_DIFF_ARGS: readonly string[] = [
  "diff",
  "--cached",
  "--name-only",
  "--diff-filter=d",
];

/** 把 `git diff --name-only` 的输出切成路径清单。 */
export function stagedPaths(gitOutput: string): string[] {
  return gitOutput
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);
}
