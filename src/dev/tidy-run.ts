import type { APIRoute } from "astro";
import { scanTidy, tidyFiles } from "./tidyScan";

/**
 * 「清理特殊字符」按钮真正干活的那条接口 —— `POST /_tidy/run`，
 * **只在 `pnpm dev` 里存在**（astro.config.ts 按 isDev 用 injectRoute 挂上；
 * 文件不在 src/pages 下，生产构建里没有这条路由）。
 *
 * 它做的唯一一件事：把请求里点名的那几份稿子里**原样印在页面上、却什么也不表示**
 * 的字符清掉（整行只有反斜杠 / 斜杠的行、转义掉的粗体标记 —— 两档见 `tidyPlan.ts`）。
 * 判据在 `scripts/content/tidyPlan.ts`，磁盘那一半在 `./tidyScan.ts` ——
 * 这个文件里没有任何判断，它只负责"谁能调、调完怎么说"。
 *
 * ## 两条不许破的
 *
 *   1. **只认同源请求。** 和 `/_publish/run` 同一条理由：这条接口能改仓库里的稿子，
 *      而它跑在 localhost 上，浏览器里随便一个网页都能往这儿发一个表单 POST。
 *      所以要求自家页面的 fetch 带 `X-Requested-With: lwj-tidy` + JSON 正文，
 *      再看一眼 `Sec-Fetch-Site`。
 *   2. **只写登记在册的内容文件。** 路径是浏览器发来的字符串，`isTidyTarget()`
 *      拿发布闸那份范围挡一道（`..`、下划线段、非 .md 一律不写）。
 *
 * ## 结果分档，一档都不许压（docs/engineering-notes.md 第二节）
 *
 *   - `noop`     点名的这几份现在没东西可清 —— 这是"没有"，不是"清完了"
 *   - `partial`  清了一部分，另一部分报了错（逐份列出来）
 *   - `tidied`   全清了
 *   - `bad-request` / 403 —— 请求本身不对，和"没东西可清"完全是两回事
 */

/**
 * ★ 必须显式关掉预渲染，理由和 publish-run.ts 那条逐字相同：
 *   预渲染路由拿到的 `request.headers` 是空的，上面那三条同源检查永远过不了。
 */
export const prerender = false;

/** 同一时刻只许跑一个：连点两下不能变成两次写盘。 */
let running = false;

export const POST: APIRoute = async ({ request }) => {
  const site = request.headers.get("sec-fetch-site");
  const reasons = [
    request.headers.get("x-requested-with") !== "lwj-tidy" &&
      "缺 X-Requested-With: lwj-tidy",
    !(request.headers.get("content-type") ?? "").includes("application/json") &&
      "正文不是 JSON",
    site !== null && site !== "same-origin" && `Sec-Fetch-Site 是 ${site}`,
  ].filter((r): r is string => typeof r === "string");
  if (reasons.length > 0) {
    return new Response(
      `只认 /_tidy 页面自己发的请求（${reasons.join("；")}）。`,
      { status: 403 }
    );
  }
  if (running) {
    return json({ stage: "busy", detail: "上一次还没跑完，等它。" }, 409);
  }
  running = true;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      files?: unknown;
      all?: unknown;
    };

    // `all: true` 是「全部清理」那个按钮：范围现扫一遍，不信浏览器发来的清单 ——
    // 页面可能开了半小时，这中间后台又存过盘。
    const paths =
      body.all === true
        ? scanTidy().map(f => f.path)
        : Array.isArray(body.files)
          ? body.files.filter((f): f is string => typeof f === "string")
          : [];

    if (paths.length === 0) {
      return json(
        {
          stage: body.all === true ? "noop" : "bad-request",
          detail:
            body.all === true
              ? "现在一份都没有这两种字符 —— 这不是出错，是真的没东西可清。"
              : "请求里没有点名任何文件。",
          results: [],
        },
        200
      );
    }

    const results = tidyFiles(paths);
    const removed = results.reduce((s, r) => s + r.removed, 0);
    const failed = results.filter(r => r.error);
    const stage =
      failed.length > 0 ? "partial" : removed === 0 ? "noop" : "tidied";
    return json({ stage, removed, results }, 200);
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
