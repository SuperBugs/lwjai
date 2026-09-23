/**
 * 发小红书那条路上**所有不碰 I/O 的判断** —— 纯函数、零 import、有单测
 * （`scripts/gate/xhsPublish.test.ts`）。真正发请求、写临时文件的在
 * `xhsMcp.ts` / `xhs-publish.ts`。
 *
 * 【2026-09-22 用户要的】接 `xpzouying/xiaohongshu-mcp`（Apache-2.0，Go ＋ Playwright，
 * MCP over Streamable HTTP，默认 `http://localhost:18060/mcp`），自动发帖。
 *
 * ## ★ 这个文件存在的理由：那个接口**没有公开的响应 schema**
 *
 * 它的 README 只给了 MCP 的 JSON-RPC 形状和一句「显示发布成功后」，
 * **没有说成功时返回什么**。所以这里绝不许写成"调用没抛 = 发布成功" ——
 * 那正是这个仓库最在意的那种假绿：一个把按钮点击当成功的脚本会**安静地不发帖**，
 * 而日志全绿（docs/engineering-notes.md 第二节）。
 *
 * 四档，两两不同（见 `PublishTier`）：
 *
 *   `published`   —— 命中了**已知的**成功信号
 *   `unconfirmed` —— 调通了，但**看不懂它说了什么**。不是成功，也不是失败。
 *   `failed`      —— 明确的失败（JSON-RPC error / isError / HTTP 非 200）
 *   `offline`     —— server 没起、或者没登录。**这不是发布失败**，是还没轮到发布。
 *
 * ⚠ `unconfirmed` 那一档**必须把原文摊在屏幕上**：今天多半每一条都落在这儿
 *   （`SUCCESS_SIGNALS` 还没对着真 server 校准过）。看到真实回包之后，
 *   把那句话加进下面那张表，它才会升到 `published`。
 *   **在校准之前不许把这一档粉饰成绿的。**
 */

/** 默认地址。改端口 / 换机器在 `/_xhs/publish` 的请求里带 `endpoint`。 */
export const XHS_MCP_ENDPOINT = "http://localhost:18060/mcp";

/** 发图文笔记那个工具的名字（xiaohongshu-mcp 的 13 个工具之一）。 */
export const PUBLISH_TOOL = "publish_content";
/** 查登录状态那个工具。发之前先问它 —— 没登录和发失败是两件事。 */
export const LOGIN_TOOL = "check_login_status";

export type PublishTier = "published" | "unconfirmed" | "failed" | "offline";

export interface PublishOutcome {
  tier: PublishTier;
  /** 给人看的一句话。 */
  detail: string;
  /** 对面**原样**回了什么。`unconfirmed` 那一档全靠它，所以永远带上。 */
  raw?: string;
}

/**
 * 已知的成功信号 —— 命中其中一条才算 `published`。
 *
 * ⚠ **这张表还没对着真 server 校准过**（2026-09-22 写的时候本机没装那个 server）。
 *   它来自 README 里那句「显示发布成功后」和工具的中文界面用语，是**推测**。
 *   ★ 推测不许冒充确认：没命中就落 `unconfirmed`，把原文印出来让人自己看。
 *     第一次真发成功之后，照抄回包里那句话进这张表 —— 那时这一档才名副其实。
 */
export const SUCCESS_SIGNALS: readonly string[] = [
  "发布成功",
  "publish success",
  "published successfully",
];

/** 明确的失败信号。命中就是 `failed`，不必等 `isError`。 */
export const FAILURE_SIGNALS: readonly string[] = [
  "发布失败",
  "登录已失效",
  "未登录",
  "publish failed",
];

/**
 * 一段 MCP `tools/call` 的回包 → 四档。
 *
 * @param payload 解析好的 JSON-RPC 响应对象（`xhsMcp.ts` 负责把 SSE 拆成它）
 */
export function readToolResult(payload: unknown): PublishOutcome {
  if (!payload || typeof payload !== "object") {
    return {
      tier: "unconfirmed",
      detail: "对面回了一个不是对象的东西 —— 没法判断发出去没有。",
      raw: String(payload),
    };
  }
  const obj = payload as Record<string, unknown>;

  // JSON-RPC 层的错误：参数不对、工具不存在、server 内部炸了。
  const err = obj.error as { message?: unknown } | undefined;
  if (err && typeof err === "object") {
    return {
      tier: "failed",
      detail: `接口报错：${String(err.message ?? "（没给原因）")}`,
      raw: JSON.stringify(obj.error),
    };
  }

  const result = obj.result as Record<string, unknown> | undefined;
  if (!result || typeof result !== "object") {
    return {
      tier: "unconfirmed",
      detail: "回包里没有 result —— 调通了，但看不出发出去没有。",
      raw: JSON.stringify(payload).slice(0, 800),
    };
  }

  const text = toolText(result);

  // 工具自己说它失败了。
  if (result.isError === true) {
    return {
      tier: "failed",
      detail: text || "工具报了 isError，但没给原因。",
      raw: text,
    };
  }
  if (FAILURE_SIGNALS.some(s => text.includes(s))) {
    return { tier: "failed", detail: text, raw: text };
  }
  if (SUCCESS_SIGNALS.some(s => text.includes(s))) {
    return { tier: "published", detail: text, raw: text };
  }

  // ★ 走到这儿 = 调通了、没报错、但**没命中任何已知信号**。
  //   这一档是这整个功能里最重要的一档，理由写在文件头。
  return {
    tier: "unconfirmed",
    detail:
      "调通了，但回包里没有我认得的成功信号 —— **不确定发出去没有**。\n" +
      "去小红书看一眼；确认发出去了的话，把下面这段原文里那句成功提示" +
      "加进 src/dev/xhsPublishPlan.ts 的 SUCCESS_SIGNALS。",
    raw: text || JSON.stringify(payload).slice(0, 800),
  };
}

/** 把 MCP 的 `result.content[]` 拼成一段人能读的字。认不出结构就返回空串。 */
export function toolText(result: Record<string, unknown>): string {
  const content = result.content;
  if (!Array.isArray(content)) return "";
  return content
    .map(part => {
      if (!part || typeof part !== "object") return "";
      const p = part as Record<string, unknown>;
      return typeof p.text === "string" ? p.text : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * 登录状态那一档。**没登录不是发布失败** —— 屏幕上必须是另一句话，
 * 否则人会去查发布逻辑，而真正要做的是重新扫码。
 */
export function readLoginResult(payload: unknown): PublishOutcome {
  const base = readToolResult(payload);
  if (base.tier === "failed" || base.tier === "unconfirmed") {
    // 登录这一步只要没有明确说"已登录"，一律当成没登录 —— 在这一档上
    // 乐观是没有代价的（大不了让人多扫一次码），而悲观的代价是发出去半条。
    const said = base.raw ?? "";
    if (/已登录|logged ?in|true/i.test(said) && !/未登录|not/i.test(said)) {
      return { tier: "published", detail: "已登录。", raw: said };
    }
    return {
      tier: "offline",
      detail: "看起来没登录 —— 先跑一次 xiaohongshu-login 扫码。",
      raw: said,
    };
  }
  return base;
}

/**
 * 【2026-09-22 删掉的】这儿原来有个 `imageFileName()`：发之前把图落成一个
 * 纯 ASCII 名字的临时文件。接了按内容缓存（`xhsCache.ts`）之后，**发出去的就是
 * 缓存里那一份**，文件名由 `cacheFileName()` 起，这个函数从此没人调用了。
 *
 * ⚠ 删它是因为留着比没有更贵：它那条测试（原 C1）读起来像在保证
 *   「发出去的文件名是纯 ASCII」，而真正决定文件名的已经换成了另一个函数 ——
 *   **以为有保障，其实钉的是另一件事**（同 docs/engineering-notes.md 第一节那个 `scan.length === 1`）。
 *   那条性质现在由 `cacheFileName()` 自己的用例钉着。
 */

/**
 * 这个绝对路径喂给那个工具安全吗。
 *
 * ★ 返回的是**理由**，不是一个 boolean —— 路径里混进中文时，屏幕上要说得出
 *   是哪一段有问题，否则人只会看到一次莫名其妙的发布失败。
 * ⚠ 仓库路径不由我们决定（别人 clone 到 `D:\项目\…` 就会踩到），所以这一层
 *   必须**发之前**查，而不是等对面失败。
 */
export function checkImagePath(abs: string): string | undefined {
  const bad = [...abs].filter(ch => /[^\u0000-\u007F]/.test(ch));
  if (bad.length === 0) return undefined;
  return (
    `图片路径里有非 ASCII 字符（${[...new Set(bad)].join("")}）：${abs}\n` +
    `xiaohongshu-mcp 的排障清单里，路径带中文是发布失败的已知原因之一。\n` +
    `把仓库放到一个纯英文路径下，或者改 xhsCache.ts 里那个缓存目录。`
  );
}

/**
 * fetch 抛出来的错 → 哪一档。
 *
 * ## ★ 超时**不是** `offline`
 *
 * 【2026-09-22 真发过一条之后才看出来】第一次真发实测 **54 秒**（开浏览器、传图、
 * 填正文、点标签、等发布按钮）。所以"超时"在这条路上是个**真会发生**的结局 ——
 * 而它和"server 没起"是完全不同的两件事：
 *
 *   - **连不上**（`ECONNREFUSED` / `fetch failed`）→ `offline`：请求根本没出去，
 *     **一定没发**。
 *   - **超时 / 被中断** → `unconfirmed`：请求出去了，对面可能已经发完了只是没回话。
 *     **可能已经发出去了。**
 *
 * ⚠ 把超时报成"连不上 server"会让人去重发一次 —— 而这个接口说不清失败到底
 *   发出去没有，重发的代价是**发重**。这正是四档存在的理由，压成一档就白设计了。
 */
export function classifyFetchError(
  err: unknown,
  endpoint: string
): PublishOutcome {
  const name = err instanceof Error ? err.name : "";
  const msg = err instanceof Error ? err.message : String(err);
  const timedOut =
    name === "TimeoutError" ||
    name === "AbortError" ||
    /timeout|aborted/i.test(msg);

  if (timedOut) {
    return {
      tier: "unconfirmed",
      detail:
        "等了太久没等到回话 —— **不确定发出去没有**。\n" +
        "发一条实测要 50 秒上下（开浏览器、传图、填正文），超时多半是对面还在忙，\n" +
        "也可能它已经发完了只是没回话。⚠ 先去小红书看一眼再决定要不要重发 ——\n" +
        "直接重发的话，很可能发重一条。",
      raw: msg,
    };
  }
  return {
    tier: "offline",
    detail:
      `连不上 ${endpoint}。xiaohongshu-mcp 还没起？\n` +
      `先跑 start-login.cmd 扫码，再跑 start-mcp.cmd（默认监听 18060）。`,
    raw: msg,
  };
}

/** 一次 `tools/call` 的请求体。 */
export function toolCallBody(
  id: number,
  name: string,
  args: Record<string, unknown>
): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  });
}

/**
 * Streamable HTTP 的回包可能是**一整个 JSON**，也可能是 **SSE**（`data: {...}` 几行）。
 * 两种都得认 —— 只认一种的话，另一种会落进"看不懂"那一档，而其实发出去了。
 *
 * ★ 取**最后一个**能解析出来的 data 块：SSE 里前面可能是进度事件。
 */
export function parseRpcBody(body: string): unknown {
  const trimmed = body.trim();
  if (trimmed === "") return undefined;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  let last: unknown;
  for (const line of trimmed.split(/\r?\n/)) {
    const m = /^data:\s*(.+)$/.exec(line.trim());
    if (!m) continue;
    try {
      last = JSON.parse(m[1]!);
    } catch {
      /* 这一行不是 JSON，跳过 —— SSE 里有注释行和心跳 */
    }
  }
  return last;
}
