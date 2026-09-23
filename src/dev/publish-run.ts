import type { APIRoute } from "astro";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { classifyChanges, pathsToStage } from "./publishPlan";

/**
 * 「提交推送」按钮真正干活的那条接口 —— `POST /_publish/run`，**只在 `pnpm dev` 里存在**
 * （astro.config.ts 按 isDev 用 injectRoute 挂上；文件不在 src/pages 下，生产构建里没有）。
 *
 * 做三件事，顺序固定：`git add <内容文件>` → `git commit` → `git push`。
 *
 * ## 三条不许破的
 *
 *   1. **不许 `--no-verify`。** `git commit` 会触发 pre-commit 钩子，也就是发布闸的
 *      第二道（scripts/hooks/pre-commit → check-staged.ts）。这个按钮存在的前提是它和
 *      终端里手敲 `git commit` 走的是**同一条路** —— 闸门拦下了，这里就得原样把话摊出来。
 *      scripts/gate/publish.test.ts 钉着这个文件里没有 no-verify。
 *   2. **只带内容。** 范围由 ./publishPlan.ts 从 collections.ts 推（研究稿 / 问答 / 教程 /
 *      提示词 / 单页、后台粘的图、智能体与模型登记表）。代码改动一律不碰。
 *   3. **只认同源请求。** 这条接口能改仓库、能推公网，而它跑在 localhost 上 ——
 *      浏览器里随便一个网页都能往 localhost 发一个表单 POST（CSRF）。所以要求
 *      我们自己页面上的 fetch 带 `X-Requested-With: lwj-publish` + JSON 正文：
 *      跨站表单发不出自定义头，跨站 fetch 会先撞预检（Vite 6 的 dev server 只放行
 *      localhost 来源）。再看一眼 `Sec-Fetch-Site`。三层都不是密码学，但足够把
 *      "别的网页替你点了这个按钮"这条路堵上。
 *
 * ## 结果分档，一档都不许压（docs/engineering-notes.md 第二节）
 *
 *   - `noop`          没有要发布的内容改动 —— 这是"没东西"，不是"成功"
 *   - `commit-failed` 提交没成（多半是闸门拦了）：文件**仍然暂存着**，改完再点一次
 *   - `push-failed`   提交成了、推送没成（远端更新过 / 网断了）：本地已经有这个提交，
 *                     去终端 `git pull --rebase && git push`
 *   - `pushed`        推上去了，Cloudflare 接着构建（两三分钟后站上才有）
 */

/**
 * ★ 必须显式关掉预渲染。这个站是 `output: "static"`，Astro 默认把每条路由都当成
 *   预渲染的 —— 而预渲染路由拿到的 `request.headers` 是**空的**（连 dev 里也是），
 *   于是上面那三条同源检查永远过不了，curl 明明带了头也报「缺 X-Requested-With」
 *   （2026-09-20 实测）。Keystatic 自己的 /api/keystatic 路由也是这么写的。
 *   生产构建里没有这条路由（只在 dev 注入），所以不需要 adapter。
 */
export const prerender = false;

const run = promisify(execFile);
const STRIP_ANSI = /\x1b\[[0-9;]*m/g;

async function git(args: string[]): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await run("git", args, {
      cwd: process.cwd(),
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      // 钩子里跑的是 `npx tsx …`，颜色码在页面上是乱码，关掉。
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    return { ok: true, output: `${stdout}${stderr}`.replace(STRIP_ANSI, "") };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      output:
        `${err.stdout ?? ""}${err.stderr ?? ""}`.replace(STRIP_ANSI, "") ||
        (err.message ?? String(e)),
    };
  }
}

/** 同一时刻只许跑一个：连点两下不能变成两次提交。 */
let running = false;

export const POST: APIRoute = async ({ request }) => {
  const site = request.headers.get("sec-fetch-site");
  const reasons = [
    request.headers.get("x-requested-with") !== "lwj-publish" &&
      "缺 X-Requested-With: lwj-publish",
    !(request.headers.get("content-type") ?? "").includes("application/json") &&
      "正文不是 JSON",
    site !== null && site !== "same-origin" && `Sec-Fetch-Site 是 ${site}`,
  ].filter((r): r is string => typeof r === "string");
  if (reasons.length > 0) {
    // 说清楚哪条没过：这一档是"请求不对"，不是"没权限"，排查时要能一眼看出来。
    return new Response(
      `只认 /_publish 页面自己发的请求（${reasons.join("；")}）。`,
      { status: 403 }
    );
  }
  if (running) {
    return json({ stage: "busy", detail: "上一次还没跑完，等它。" }, 409);
  }
  running = true;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      message?: unknown;
    };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return json({ stage: "bad-request", detail: "提交信息是空的。" }, 400);
    }

    const status = await git(["status", "--porcelain"]);
    if (!status.ok) {
      return json({ stage: "git-failed", detail: status.output }, 500);
    }
    const plan = classifyChanges(status.output);
    if (plan.content.length === 0) {
      return json(
        { stage: "noop", detail: "没有要发布的内容改动。", plan },
        200
      );
    }

    const files = pathsToStage(plan.content);
    const add = await git(["add", "--", ...files]);
    if (!add.ok) {
      return json({ stage: "add-failed", detail: add.output, plan }, 500);
    }

    // ★ 没有 --no-verify：pre-commit 钩子（发布闸第二道）在这里跑。
    const commit = await git(["commit", "-m", message]);
    if (!commit.ok) {
      return json(
        {
          stage: "commit-failed",
          detail: commit.output,
          plan,
          hint: "这些文件仍然暂存着（git add 过了）。照闸门说的改完，再点一次。",
        },
        200
      );
    }
    const head = await git(["log", "-1", "--format=%h %s"]);

    const push = await git(["push", "origin", "HEAD"]);
    if (!push.ok) {
      return json(
        {
          stage: "push-failed",
          detail: push.output,
          commit: head.output.trim(),
          plan,
          hint: "本地已经有这个提交，只是没推上去。去终端：git pull --rebase && git push",
        },
        200
      );
    }
    return json(
      {
        stage: "pushed",
        detail: `${commit.output}\n${push.output}`.trim(),
        commit: head.output.trim(),
        plan,
      },
      200
    );
  } finally {
    running = false;
  }
};

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
