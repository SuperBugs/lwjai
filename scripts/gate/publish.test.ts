/**
 * 「提交推送」按钮（src/dev/publishPlan.ts + publish-run.ts）的测试。
 *
 * 钉三件事：
 *   1. 判据只把**内容**归进这次提交（喂的是 `git status --porcelain` 真实形状的输出）；
 *   2. 跑 git 的那个文件里**没有 `--no-verify`** —— 按钮和终端手敲 commit 走同一条路，
 *      发布闸的第二道照拦；同时它查同源头（CSRF 那条）；
 *   3. 两条 dev 路由都挂在 astro.config.ts 的 devGate 集成里（只在 dev 存在）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyChanges,
  defaultMessage,
  isContentPath,
  pathsToStage,
} from "../../src/dev/publishPlan";

const read = (p: string) => readFileSync(p, "utf8");
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// 一次真实的工作树：后台存了一条问答、改了登记表、粘了一张教程截图，
// 同时代码和文档也有没做完的改动，还有一条改名。
const PORCELAIN = [
  "?? src/content/qa/q-20260920-0329-chatgpt-gpt-6-pro.md",
  " M src/content/posts/orcl-20260916.md",
  " M src/data/registry.json",
  "?? src/assets/guides/ibkr-open-1.png",
  " D src/content/prompts/old-prompt.md",
  "R  src/content/qa/a.md -> src/content/qa/b.md",
  " M src/components/Card.astro",
  " M docs/engineering-notes.md",
  "?? scripts/gate/publish.test.ts",
  " M keystatic.config.ts",
].join("\n");

test("内容路径从登记表推：五个集合目录、后台粘图目录、智能体与模型登记表", () => {
  for (const p of [
    "src/content/posts/x.md",
    "src/content/qa/x.md",
    "src/content/guides/x.md",
    "src/content/prompts/x.md",
    "src/content/pages/about.md",
    "src/assets/guides/shot.png",
    "src/data/registry.json",
  ]) {
    assert.ok(isContentPath(p), `${p} 该算内容`);
  }
  for (const p of [
    "src/components/Card.astro",
    "keystatic.config.ts",
    "src/content.config.ts", // 同名前缀，但不是内容目录下的文件
    "src/data/registry.json.bak",
    "docs/engineering-notes.md",
  ]) {
    assert.ok(!isContentPath(p), `${p} 不该算内容`);
  }
});

test("classifyChanges：内容进 content，其余进 other，改名两头都带", () => {
  const plan = classifyChanges(PORCELAIN);
  assert.deepEqual(
    plan.content.map(c => c.path),
    [
      "src/content/qa/q-20260920-0329-chatgpt-gpt-6-pro.md",
      "src/content/posts/orcl-20260916.md",
      "src/data/registry.json",
      "src/assets/guides/ibkr-open-1.png",
      "src/content/prompts/old-prompt.md",
      "src/content/qa/b.md",
    ]
  );
  assert.deepEqual(
    plan.other.map(c => c.path),
    ["src/components/Card.astro", "docs/engineering-notes.md", "scripts/gate/publish.test.ts", "keystatic.config.ts"]
  );
  const staged = pathsToStage(plan.content);
  assert.ok(staged.includes("src/content/qa/a.md"), "改名的旧路径也要 git add，否则删除不进提交");
  assert.ok(staged.includes("src/content/qa/b.md"));
  assert.ok(staged.includes("src/content/prompts/old-prompt.md"), "删掉的文件也要 git add");
});

test("提交信息：标题都齐就列标题，太长或缺标题就退回条数", () => {
  assert.equal(defaultMessage(["ORCL｜甲骨文 (Oracle Corp)"], 1), "发布：ORCL｜甲骨文 (Oracle Corp)");
  assert.equal(defaultMessage(["a", "b"], 2), "发布：a；b");
  assert.equal(defaultMessage(["a"], 2), "发布 2 条内容改动", "两条改动只有一个标题：别假装列全了");
  assert.equal(defaultMessage(["很长".repeat(60)], 1), "发布 1 条内容改动");
  assert.equal(defaultMessage([], 0), "发布 0 条内容改动");
});

test("publish-run.ts：没有 --no-verify，查同源头，只加内容文件", () => {
  const src = stripComments(read("src/dev/publish-run.ts"));
  assert.ok(!/no-verify/.test(src), "出现了 --no-verify —— 那是把发布闸第二道关掉");
  assert.match(src, /x-requested-with/i, "没查 X-Requested-With，别的网页能替你点这个按钮");
  assert.match(src, /sec-fetch-site/i);
  assert.match(src, /classifyChanges\(/, "没用 publishPlan 的判据，范围就成了第二份");
  assert.match(src, /\["commit", "-m", message\]/, "commit 的参数不该有别的开关");
  // 静态站里预渲染路由的 request.headers 是空的（连 dev 里也是），同源检查会永远过不了。
  assert.match(
    src,
    /export const prerender = false/,
    "publish-run.ts 没关预渲染 —— 三条同源检查读不到任何请求头，按钮永远 403"
  );
});

test("两条 dev 路由都挂在 astro.config.ts 的 devGate 集成里", () => {
  const src = read("astro.config.ts");
  const block = /const devGate: AstroIntegration = \{([\s\S]*?)\n\};/.exec(src)?.[1];
  assert.ok(block, "astro.config.ts 里找不到 devGate 集成");
  for (const [pattern, file] of [
    ["/_publish", "./src/dev/publish.astro"],
    ["/_publish/run", "./src/dev/publish-run.ts"],
    ["/_share", "./src/dev/share.astro"],
    ["/_gate", "./src/dev/gate.astro"],
    ["/_import", "./src/dev/import.astro"],
    ["/_import/run", "./src/dev/import-run.ts"],
  ]) {
    assert.ok(block.includes(`pattern: "${pattern}"`), `${pattern} 没挂`);
    assert.ok(block.includes(file), `${pattern} 指的不是 ${file}`);
  }
  assert.match(src, /isDev \? \[react\(\), keystatic\(\), devGate\]/, "devGate 不再只在 dev 挂了");
});
