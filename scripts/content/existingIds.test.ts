/**
 * 号池读盘口（./existingIds.ts）的测试。
 *
 * 值得测的只有一件事，而且它是**零症状**的：**少扫一个集合**。
 * 少扫的后果不是报错 —— 是那个集合的号不进池子，下一条新内容和它撞号，
 * 而撞号在后台是**静默**加 `-2` 后缀（那一层由 content.config.ts 的 generateId 兜）。
 *
 * 所以这里在临时目录里造一棵**四个集合各放一条**的树，每条一个不同的号：
 * 谁漏了，哪个号就不见了。用临时目录而不是仓库里的真实内容，是为了让这条断言
 * 不随"今天站上有几篇稿"变化 —— 那种测试迟早会被人用"改一下期望值"修掉。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  NUMBERED_COLLECTIONS,
  requireCollectionSpec,
} from "../../src/config/collections";
import { existingEntryIds } from "./existingIds";

/** 四个集合各放一条：posts→1、qa→2、guides→3、prompts→4（按登记表顺序发号）。 */
function fakeRepo(): { root: string; expected: string[] } {
  const root = mkdtempSync(join(tmpdir(), "lwj-ids-"));
  const expected: string[] = [];
  NUMBERED_COLLECTIONS.forEach((key, i) => {
    const dir = join(root, ...requireCollectionSpec(key).dir.split("/"));
    mkdirSync(dir, { recursive: true });
    const no = String(i + 1);
    writeFileSync(join(dir, `${no}.md`), "---\ntitle: x\n---\n", "utf8");
    // 每个集合都有一份 _keep.md（占位，不是条目）。
    writeFileSync(join(dir, "_keep.md"), "", "utf8");
    expected.push(no);
  });
  return { root, expected };
}

test("★ 四个编号集合一个都不许漏 —— 漏一个就是下一条内容和它撞号", () => {
  const { root, expected } = fakeRepo();
  try {
    assert.deepEqual(existingEntryIds(root).sort(), expected.sort());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("`_` 开头的不是条目；非 .md 不算", () => {
  const { root } = fakeRepo();
  const posts = join(root, ...requireCollectionSpec("posts").dir.split("/"));
  writeFileSync(join(posts, "_draft.md"), "", "utf8");
  writeFileSync(join(posts, "notes.txt"), "", "utf8");
  try {
    const ids = existingEntryIds(root);
    assert.ok(!ids.includes("_keep"), "_keep.md 被当成条目了");
    assert.ok(!ids.includes("_draft"), "_draft.md 被当成条目了");
    assert.ok(!ids.includes("notes"), ".txt 被当成条目了");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("★ 认不出是号的文件名照样返回，不在这里偷偷滤掉", () => {
  // 滤掉 = 号池默默跳过一条真实存在的内容。"盘上有个坏文件名"由
  // content.config.ts 的 generateId 去红，两件事两个落点。
  const { root } = fakeRepo();
  const posts = join(root, ...requireCollectionSpec("posts").dir.split("/"));
  writeFileSync(join(posts, "9-2.md"), "", "utf8");
  try {
    assert.ok(existingEntryIds(root).includes("9-2"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("目录读不到就抛，不当成空池子", () => {
  // 静默当空 = 从 1 开始重新发号，把已经分享出去的地址发给新内容。
  const root = mkdtempSync(join(tmpdir(), "lwj-empty-"));
  try {
    assert.throws(() => existingEntryIds(root), /号池少了一块/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
