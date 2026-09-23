import type { APIRoute } from "astro";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureBridge, request, BridgeRequestError } from "./wechatsyncBridge";
import {
  AUTH_TIMEOUT_MS,
  XUEQIU_PLATFORM,
  bridgeStateLabel,
  classifyAuth,
  classifyRequestError,
  envEncodingProblem,
  noTokenLabel,
  readToken,
  type BridgeState,
} from "./wechatsyncPlan";

/**
 * 推雪球长文之前的那一行状态 —— `GET /_xueqiu/status`，**只在 `pnpm dev` 里存在**。
 *
 * `/_share` 一打开就调它一次：① 把桥起起来（扩展是隔一会儿自己来连的，早起早连上，
 * 真按按钮的时候就不用等）；② 告诉人**现在卡在哪一步**。
 *
 * ★ 四档加一档，两两不同（`bridgeStateLabel()`）：没配 token / 端口被占 /
 *   扩展没连上 / 连上了但雪球没登录 / **就绪**（带着登录的是谁）。
 *   只说一句「不可用」的话，人得自己去猜是这五样里的哪一样。
 */

/**
 * ★ 必须显式关掉预渲染：预渲染路由拿到的 `request.headers` 是空的，
 *   下面那条同源检查永远过不了（同 `xhs-publish.ts`）。
 */
export const prerender = false;

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

/** 读 token：`.env` 里的 `WECHATSYNC_TOKEN`，或者起 dev server 那个壳里的环境变量。 */
export function tokenFromEnv(): string | undefined {
  return readToken(
    (import.meta.env.WECHATSYNC_TOKEN as string | undefined) ??
      process.env.WECHATSYNC_TOKEN
  );
}

/**
 * 读不到 token 的时候，`.env` 是不是**编码坏了**（而不是没配）。
 * ★ 两句话必须不一样：人明明配了、页面却说「还没配」，他会照着再配一遍，
 *   写出来的还是同一个坏文件（2026-09-23 真撞上的：PowerShell 的 `>` 写成了 UTF-16）。
 */
export function envFileProblem(): ReturnType<typeof envEncodingProblem> {
  const file = join(process.cwd(), ".env");
  if (!existsSync(file)) return undefined;
  try {
    return envEncodingProblem(readFileSync(file).subarray(0, 3));
  } catch {
    return undefined;
  }
}

export const GET: APIRoute = async ({ request: req }) => {
  /**
   * 只认 `/_share` 自己发的请求。这一条 GET 有副作用（起桥、让扩展去雪球读一次登录态），
   * 所以和 POST 那条同一个闸：自定义头 `X-Requested-With` 跨站发不出来（要预检，
   * 而我们不回 CORS 头）。
   */
  const site = req.headers.get("sec-fetch-site");
  if (
    req.headers.get("x-requested-with") !== "lwj-xueqiu" ||
    (site !== null && site !== "same-origin")
  ) {
    return new Response("只认 /_share 页面自己发的请求。", { status: 403 });
  }

  const token = tokenFromEnv();
  if (!token) {
    return json({
      state: "no_token",
      ready: false,
      label: noTokenLabel(envFileProblem()),
    });
  }

  let state: BridgeState;
  try {
    state = await ensureBridge({ token });
  } catch (err) {
    // 端口被占以外的绑定失败 —— 原话摊出来，不塞进四档里的任何一档。
    return json({
      state: "error",
      ready: false,
      label: err instanceof Error ? err.message : String(err),
    });
  }
  if (state !== "connected") {
    return json({ state, ready: false, label: bridgeStateLabel(state) });
  }

  try {
    const auth = classifyAuth(
      await request(
        "checkAuth",
        token,
        { platform: XUEQIU_PLATFORM },
        AUTH_TIMEOUT_MS
      )
    );
    if ("ok" in auth) {
      return json({
        state,
        ready: true,
        label: `就绪 —— 扩展连上了，雪球登录的是「${auth.username ?? "（没读到用户名）"}」。`,
      });
    }
    return json({ state, ready: false, label: auth.detail });
  } catch (err) {
    const sent = err instanceof BridgeRequestError ? err.sent : false;
    return json({
      state,
      ready: false,
      label: classifyRequestError(err, sent).detail,
    });
  }
};
