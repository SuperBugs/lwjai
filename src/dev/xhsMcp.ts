import {
  classifyFetchError,
  parseRpcBody,
  readLoginResult,
  readToolResult,
  toolCallBody,
  LOGIN_TOOL,
  PUBLISH_TOOL,
  XHS_MCP_ENDPOINT,
  type PublishOutcome,
} from "./xhsPublishPlan";

/**
 * 跟 `xiaohongshu-mcp` 说话的那一半 —— **只够调两个工具，不是一个通用 MCP 客户端**。
 *
 * 判断一条都不在这里（全在 `xhsPublishPlan.ts`，纯函数有单测）；
 * 这个文件只管发请求、接住网络错误、把 server 没起那一档翻译成人话。
 *
 * ## 为什么自己拼 JSON-RPC 而不是装 MCP SDK
 *
 * 要的只是"POST 一个 `tools/call` 上去、把回包读回来"。为这点事给一个
 * **dev 专用**功能加一个运行时依赖不划算，而且 SDK 会把 SSE / session 这些
 * 细节藏起来 —— 而这次恰恰需要**看得见**回包原文（见 `readToolResult()` 那一节：
 * 那个接口没有公开的响应 schema，今天只能把原文摊给人看）。
 *
 * ## 握手：**已对着真 server 验过**（2026-09-22）
 *
 * 实测 v2.5.2：`tools/call` **不需要 initialize 握手、不需要 session id**，
 * 回包是**普通 JSON 不是 SSE**，信封就是 `result.content[].text`。
 * 下面那个 `initialize` 因此是**多余但无害**的一次请求 —— 留着是因为
 * Streamable HTTP 规范里有状态的 server 需要它，而它失败也不致命。
 * ★ 两种都兼容的写法保住了一条底线：握手真不对时症状会落在
 *   `offline` / `unconfirmed` 两档，**不会冒充成功**。
 */

/**
 * 发一条实测 **54 秒**（2026-09-22 第一次真发：开浏览器 5s → 传图 12s →
 * 填正文 30s → 等发布按钮 5s）。给三倍余量。
 * ⚠ 真超了**不是** `offline` —— 见 `classifyFetchError()`，超时落 `unconfirmed`。
 */
const TIMEOUT_MS = 180_000;

export interface McpOptions {
  endpoint?: string;
  /** server 用 `-token=` 起的话要带。 */
  token?: string;
}

function headers(token: string | undefined): Record<string, string> {
  return {
    "Content-Type": "application/json",
    // 两种都接受：server 可能回整个 JSON，也可能回 SSE（parseRpcBody 两种都认）。
    Accept: "application/json, text/event-stream",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * 握手。拿到 `Mcp-Session-Id` 就返回它，没有就返回 undefined（无状态 server）。
 * ⚠ 握手本身失败**不当成致命**：无状态的 server 可能根本不认 `initialize`，
 *   那就直接去调工具。真不通的话下一步会落进 `offline`，而不是在这儿假装失败。
 */
async function initialize(
  endpoint: string,
  token: string | undefined
): Promise<string | undefined> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: headers(token),
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "laowanjia-xhs", version: "1" },
        },
      }),
    });
    return res.headers.get("Mcp-Session-Id") ?? undefined;
  } catch {
    return undefined;
  }
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  opts: McpOptions
): Promise<{ payload: unknown } | { outcome: PublishOutcome }> {
  const endpoint = opts.endpoint ?? XHS_MCP_ENDPOINT;
  try {
    const session = await initialize(endpoint, opts.token);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...headers(opts.token),
        ...(session ? { "Mcp-Session-Id": session } : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: toolCallBody(2, name, args),
    });

    const body = await res.text();
    if (!res.ok) {
      return {
        outcome: {
          tier: "failed",
          detail: `${endpoint} 回了 ${res.status} ${res.statusText}`,
          raw: body.slice(0, 800),
        },
      };
    }
    return { payload: parseRpcBody(body) };
  } catch (err) {
    return { outcome: classifyFetchError(err, endpoint) };
  }
}

/** 登录了没有。没登录是 `offline` 档 —— 和发布失败分开。 */
export async function checkLogin(opts: McpOptions): Promise<PublishOutcome> {
  const r = await callTool(LOGIN_TOOL, {}, opts);
  return "outcome" in r ? r.outcome : readLoginResult(r.payload);
}

export interface PublishArgs {
  title: string;
  content: string;
  /** **本地绝对路径**，而且必须是纯 ASCII（见 `checkImagePath()`）。 */
  images: string[];
  tags: string[];
}

/**
 * 发一条图文笔记。
 *
 * ★ 返回的是四档之一，**永远不抛**：调用方（端点）要把每一档原样摊到页面上。
 * ⚠ 没有"重试"。发帖这种动作重试的代价是**发重**，而这个接口今天还说不清
 *   "失败"到底有没有发出去（`unconfirmed` 那一档存在的理由）。
 *   宁可让人去看一眼再决定。
 */
export async function publishNote(
  args: PublishArgs,
  opts: McpOptions
): Promise<PublishOutcome> {
  const r = await callTool(
    PUBLISH_TOOL,
    {
      title: args.title,
      content: args.content,
      images: args.images,
      ...(args.tags.length > 0 ? { tags: args.tags } : {}),
    },
    opts
  );
  return "outcome" in r ? r.outcome : readToolResult(r.payload);
}
