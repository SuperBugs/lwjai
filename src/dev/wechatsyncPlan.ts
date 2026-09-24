/**
 * 推长文到雪球草稿箱那条路上**所有不碰 I/O 的判断** —— 纯函数、零 import、有单测
 * （`scripts/gate/wechatsync.test.ts`）。真正开 WebSocket、发请求的在
 * `wechatsyncBridge.ts` / `xueqiu-draft.ts`。
 *
 * 【2026-09-23 用户要的】「雪球是有开源项目可以方便的发布长文章的，给我利用起来」。
 * 那个项目是 **Wechatsync（文章同步助手）**：一个 Chrome 扩展，拿**你浏览器里现成的
 * 登录态**去调各平台自己编辑器用的那些接口，请求直接从你的浏览器发出。
 *
 * ## ★ 为什么这条路和小红书那次不一样（用户听过风险之后决定走的）
 *
 * 小红书 2026-09-23 被封，叠了四个条件：图里印外链、**机器替人按发布**、**批量高频**、
 * 无头浏览器。这条路上后三个都不在：
 *
 *   - 雪球那个适配器**只调 `draft/save.json`** —— 读过它的源码
 *     （`packages/core/src/adapters/platforms/xueqiu.ts`），从头到尾没有一个发布接口。
 *     **结构上只能存草稿**，发布那一下永远是人在雪球自己的编辑器里点的。
 *   - 跑在你**真的 Chrome** 里、用你**真的登录态**，不是无头浏览器。
 *   - 页面上**一次点一组、人来点**，不跨组排队（原来小红书那套批量队列不接到这儿 ——
 *     那一套 2026-09-23 按用户要求删了）。
 *
 * ⚠ 但它**仍然不是官方接口** —— 雪球要拦照样能拦。平台表里它是 `draft` 那一档
 *   （`src/config/socialPlatforms.ts`），不许写成 `official`：那是把一个第三方工具
 *   冒充成平台给的口子。
 *
 * ## 协议（从它的源码读出来的，不是猜的）
 *
 * `packages/mcp-server/src/types.ts` ＋ `ws-bridge.ts`：
 *   - **我们**在 9527 开 WebSocket 服务，**扩展是客户端**，自己连上来；
 *   - 发 `{ id, method, token, params }`，收 `{ id, result }` 或 `{ id, error: { code, message } }`；
 *   - 方法四个：`listPlatforms` / `checkAuth` / `syncArticle` / `extractArticle`。
 * ⚠ 那个包的许可写着 MIT、仓库顶层写着 GPL-3.0 —— **我们一行它的代码都没抄**，
 *   只实现了同一个 JSON 协议的另一端。别把它的文件 vendor 进来。
 */

/** 扩展连的那个端口（它设置页里的默认值，CLI 的 `SYNC_WS_PORT` 也是它）。 */
export const WECHATSYNC_WS_PORT = 9527;

/** 雪球在它那张平台表里的 id（`XueqiuAdapter.meta.id`）。 */
export const XUEQIU_PLATFORM = "xueqiu";

/**
 * 等扩展连上来最多等多久。
 * ★ 它的 CLI 默认 30 秒（`--timeout 30000`）。我们取 20 秒：页面一打开就先起桥
 *   （`/_xueqiu/status`），真按按钮的时候多半早就连上了，这个数只管第一次。
 */
export const CONNECT_WAIT_MS = 20_000;

/**
 * 一次 `syncArticle` 最多等多久。
 * ★ 它自己的桥给的是 6 分钟（`requestTimeout = 360000`，注释「图片多时需要更长时间」）——
 *   雪球适配器会把正文里**每一张图先下载、再转存到雪球**，一张一次往返。照抄它的数。
 */
export const SYNC_TIMEOUT_MS = 360_000;

/** 查登录状态那一下，短一点。 */
export const AUTH_TIMEOUT_MS = 30_000;

/**
 * 心跳：扩展连上之后每隔这么久发一条它**不认识的**方法。
 *
 * 【2026-09-23 对着真扩展撞上的】扩展是 Chrome MV3，干活的是后台 service worker ——
 * **闲置约 30 秒就被 Chrome 挂起**，WebSocket 跟着断，它的重连计时器也一起死掉
 * （读过它的 `packages/extension/src/mcp/client.ts`：重连靠 setTimeout，没有闹钟；
 * 后台那两个闹钟一个 24 小时、一个 6 小时）。实测：连上、查完登录，一分钟后推的时候
 * 已经断了，等 20 秒也没回来。它自己那座桥**也没有心跳**，同一个坑。
 * ★ Chrome 116 起的规则：WebSocket 上 30 秒内有消息来往，service worker 就不会被挂起。
 *   所以取 20 秒（Chrome 文档里的建议值），留足余量。
 */
export const KEEPALIVE_MS = 20_000;

/**
 * 心跳发的那个方法名 —— **故意是扩展不认识的**。
 *
 * 读过它的 `handleMethod()`：不认识的方法走 `default: throw new Error("Unknown method")`，
 * 回一个错误，**不碰网络、没有副作用**。这一来一回正好算 service worker 的活动。
 * ⚠ **绝不许换成 `checkAuth` / `listPlatforms`**：那两个会让扩展去雪球（或者它支持的
 *   每一个平台）读一次页面 —— 每 20 秒一次，就是一个在雪球门口转悠的机器人，
 *   正是小红书那次之后这条路要躲开的东西。
 */
export const KEEPALIVE_METHOD = "lwj.keepalive";

export interface RequestMessage {
  id: string;
  method: "listPlatforms" | "checkAuth" | "syncArticle";
  token: string;
  params?: Record<string, unknown>;
}

/**
 * 心跳那一条。token 照样带上 —— 不带的话扩展每 20 秒在它的控制台里记一句
 * 「Invalid token received」，看着像有人在撬它。
 */
export function keepaliveMessage(id: string, token: string) {
  return { id, method: KEEPALIVE_METHOD, token };
}

/** 拼一条发给扩展的消息。token 每条都带 —— 扩展是逐条验的。 */
export function requestMessage(
  id: string,
  method: RequestMessage["method"],
  token: string,
  params?: Record<string, unknown>
): RequestMessage {
  return params === undefined
    ? { id, method, token }
    : { id, method, token, params };
}

/**
 * 读 token。**空串当成没配**（`.env` 里写了 `WECHATSYNC_TOKEN=` 后面没东西，
 * 和压根没写是一回事，不许当成"配了一个空 token"发出去）。
 */
export function readToken(raw: string | undefined): string | undefined {
  const t = raw?.trim();
  return t ? t : undefined;
}

/**
 * `.env` 的编码对不对 —— 看文件**头几个字节**。
 *
 * 【2026-09-23 真撞上的】用户照着说明在 **Windows PowerShell** 里敲了
 * `echo "WECHATSYNC_TOKEN=…" > .env`，而 PowerShell 5.1 的 `>` 默认写 **UTF-16 LE（带 BOM）**。
 * Vite 按 UTF-8 读 `.env`，那个键名读出来是一串 `\0` 夹着的字母 —— **token 读不到**，
 * 页面上印「还没配 token」，而人明明配了。
 * ★ 所以「没配」和「配了但读不出来」**必须是两句话**（docs/engineering-notes.md 第二节）。
 * ⚠ UTF-8 **带 BOM** 也坏（`Out-File -Encoding utf8` 在 5.1 里就写成这样）：
 *   BOM 会粘在第一行的键名前面，`WECHATSYNC_TOKEN` 正好是第一行的时候就对不上。
 *
 * @returns 出问题的那一种，没问题返回 undefined。
 */
export function envEncodingProblem(
  head: Uint8Array
): "utf16" | "utf8-bom" | undefined {
  const [a, b, c] = head;
  if ((a === 0xff && b === 0xfe) || (a === 0xfe && b === 0xff)) return "utf16";
  if (a === 0xef && b === 0xbb && c === 0xbf) return "utf8-bom";
  return undefined;
}

/**
 * 读不到 token 的时候那句话。**有 `.env` 但编码坏了**要说出是哪一种、怎么改 ——
 * 不然人会照着「还没配 token」再配一遍，写出来的还是同一个坏文件。
 */
export function noTokenLabel(
  problem: "utf16" | "utf8-bom" | undefined
): string {
  if (problem === "utf16") {
    return (
      "读不到 token：仓库根的 .env 是 UTF-16 编码的（Windows PowerShell 的 `>` 默认就写成这样），" +
      "Vite 按 UTF-8 读不出来。把它另存成 UTF-8（不带 BOM），或者在 PowerShell 里用 " +
      '`[IO.File]::WriteAllText("$PWD\\.env", "WECHATSYNC_TOKEN=…")` 重写一次，然后重启 dev server。'
    );
  }
  if (problem === "utf8-bom") {
    return (
      "读不到 token：仓库根的 .env 是 UTF-8 带 BOM（`Out-File -Encoding utf8` 就写成这样），" +
      "BOM 粘在了第一个键名前面。另存成 UTF-8（不带 BOM）再重启 dev server。"
    );
  }
  return bridgeStateLabel("no_token");
}

/**
 * 这个 WebSocket 连接是不是一个**网页**发起的 —— 是就拒。
 *
 * ★ 扩展连上来带的 Origin 是 `chrome-extension://…`；我们自己的测试客户端不带 Origin。
 *   而任何一个网页都能在你浏览器里 `new WebSocket("ws://localhost:9527")` ——
 *   不拒的话，随便一个页面都能冒充扩展、收走我们要推的正文、再回一个假的"成功"。
 * ⚠ 读过它自己那座桥：**不查 Origin、绑所有网卡、另开一个 `Access-Control-Allow-Origin: *`
 *   而且不认证的 9528 HTTP 口**。我们这座桥这三样都不做。
 */
export function isWebOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  return /^https?:\/\//i.test(origin.trim());
}

/* ── 桥的状态：页面一打开就显示，四档 ──────────────────────────────── */

/**
 * 还没按按钮之前，页面上那一行说什么。**四档两两不同** —— 每一档你该做的事不一样。
 */
export type BridgeState =
  | "no_token" //   没配 token —— 连桥都不开（开了扩展也会拒）
  | "port_busy" //  9527 被别的程序占着
  | "waiting" //    桥开着，扩展还没连上来
  | "connected"; // 扩展连上了（雪球登没登录要另外问，见 `checkAuth`）

export function bridgeStateLabel(state: BridgeState): string {
  switch (state) {
    case "no_token":
      return (
        "还没配 token —— 在「文章同步助手」扩展的设置里打开 MCP / CLI 连接、填一个 token，" +
        "再把同一个值写进仓库根的 .env（WECHATSYNC_TOKEN=…），然后重启 dev server。"
      );
    case "port_busy":
      return (
        `${WECHATSYNC_WS_PORT} 端口被别的程序占着 —— 多半是你另外开着 wechatsync 的 CLI / MCP。` +
        "关掉它再刷新这一页。"
      );
    case "waiting":
      /**
       * ⚠ 原来这句写的是「它是隔一会儿自己来连的，等几秒刷新一下」—— **是错的**：
       *   扩展的后台闲置约 30 秒就被 Chrome 挂起，挂起之后等多久都不会自己回来连
       *   （见 `KEEPALIVE_MS`）。得有个事件把它叫醒，点它的图标就是最直接的那个。
       */
      return (
        "桥开着，扩展没连上来 —— 点一下浏览器工具栏上「文章同步助手」的图标（打开它的弹窗）" +
        "把它叫醒，几秒内就会连上，然后刷新这一页。" +
        "（它的后台闲置约 30 秒会被 Chrome 挂起，挂起之后不会自己回来连；" +
        "连上之后这边每 20 秒发一次心跳，就不会再被挂起。）" +
        "还是不行的话：Chrome 开着吗？扩展设置里 CLI / MCP 连接打开了吗？"
      );
    case "connected":
      return "扩展连上了。";
  }
}

/* ── 推一次的结果：七档 ──────────────────────────────────────────── */

/**
 * 推一次长文的结果。
 *
 * ★ **七档，一档都不许压**：每一档你接下来该做的事不一样，压掉任何一档都是让人
 *   在错的方向上找原因。尤其是：
 *   - `unconfirmed` ≠ `failed`：请求**发出去了**但没等到回话 —— 草稿箱里**可能已经有一份**，
 *     再点一次就是两份。和原来小红书发帖那边同一条教训（那一套 2026-09-23 删了）。
 *   - `not_logged_in` / `no_extension` / `no_token` / `port_busy` 都 ≠ `failed`：
 *     **还没轮到推**，是准备工作没做完，推的内容一个字都没出去。
 */
export type DraftTier =
  | "drafted"
  | "unconfirmed"
  | "failed"
  | "not_logged_in"
  | "no_extension"
  | "no_token"
  | "port_busy";

export interface DraftOutcome {
  tier: DraftTier;
  detail: string;
  /** 草稿的编辑地址（`https://mp.xueqiu.com/write/draft/<id>`）。只有 `drafted` 有。 */
  draftUrl?: string;
  /** 对面原样回了什么。看不懂的那几档全靠它。 */
  raw?: string;
}

/** 七档各自的一句开头 —— 页面和记账读同一份。 */
export const DRAFT_TIER_HEAD: Record<DraftTier, string> = {
  drafted: "✓ 草稿存好了 —— 去雪球编辑器里看一眼再发布",
  unconfirmed: "？不确定存上没有 —— 先去雪球草稿箱看一眼，别急着再点",
  failed: "✗ 没存上",
  not_logged_in: "— 雪球没登录（还没轮到推）",
  no_extension: "— 扩展没连上（还没轮到推）",
  no_token: "— 没配 token（还没轮到推）",
  port_busy: "— 端口被占着（还没轮到推）",
};

/** 扩展里那张平台信息（`PlatformInfo`）的形状，只取我们用得着的几格。 */
interface PlatformInfoLike {
  id?: unknown;
  isAuthenticated?: unknown;
  username?: unknown;
  error?: unknown;
}

/**
 * `checkAuth` 的回话 → 登没登录。
 * ★ 认不出来的回话**不当成已登录** —— 那样会往下走 `syncArticle`，然后收到一句
 *   「请先登录雪球」，人要多走一步才知道问题在哪。
 */
export function classifyAuth(
  result: unknown
): { ok: true; username?: string } | DraftOutcome {
  const info = (result ?? {}) as PlatformInfoLike;
  if (info.isAuthenticated === true) {
    return {
      ok: true,
      username: typeof info.username === "string" ? info.username : undefined,
    };
  }
  return {
    tier: "not_logged_in",
    detail:
      "扩展说雪球没登录。在这个 Chrome 里打开 https://mp.xueqiu.com/writeV2 登录一次，" +
      "回来再点。（它认登录态的办法就是去那一页读当前用户。）",
    raw: safeJson(result),
  };
}

interface SyncResultLike {
  platform?: unknown;
  success?: unknown;
  postId?: unknown;
  postUrl?: unknown;
  draftOnly?: unknown;
  error?: unknown;
}

/**
 * `syncArticle` 的回话 → 七档之一。
 *
 * 形状（读的源码）：`{ results: SyncResult[], syncId }`，每条
 * `{ platform, success, postId?, postUrl?, draftOnly?, error? }`。
 */
export function classifySync(result: unknown): DraftOutcome {
  const raw = safeJson(result);
  const list = (result as { results?: unknown } | null)?.results;
  if (!Array.isArray(list)) {
    return {
      tier: "unconfirmed",
      detail: "扩展回了一个认不出的东西（没有 results）—— 没法判断存上没有。",
      raw,
    };
  }
  const mine = list.find(
    (r): r is SyncResultLike =>
      !!r && (r as SyncResultLike).platform === XUEQIU_PLATFORM
  );
  if (!mine) {
    return {
      tier: "unconfirmed",
      detail: "回话里没有雪球那一条 —— 没法判断存上没有。",
      raw,
    };
  }

  if (mine.success === true) {
    const url = typeof mine.postUrl === "string" ? mine.postUrl : undefined;
    /**
     * ⚠ `draftOnly === false` 是**另一件事**：说明它这次不是存草稿而是直接发了。
     *   读过的那一版源码里雪球只会存草稿，真走到这儿说明扩展升级改了行为 ——
     *   必须说出来，而不是照样印一句"草稿存好了"。
     */
    if (mine.draftOnly === false) {
      return {
        tier: "failed",
        detail:
          "⚠ 扩展说这次不是存草稿，是直接发出去了（draftOnly: false）。" +
          "读过的那一版雪球适配器只会存草稿 —— 多半是扩展升级改了行为。" +
          "去雪球确认一下，然后先别再用这个按钮，回来看 src/dev/wechatsyncPlan.ts。",
        draftUrl: url,
        raw,
      };
    }
    return {
      tier: "drafted",
      detail: url
        ? "草稿在雪球编辑器里 —— 看一眼表格和列表有没有走样，再点发布。"
        : "扩展说存上了，但没给地址 —— 去雪球的草稿箱里找。",
      draftUrl: url,
      raw,
    };
  }

  const err = typeof mine.error === "string" ? mine.error : "";
  if (/登录/.test(err)) {
    return {
      tier: "not_logged_in",
      detail: `扩展说：${err}。在这个 Chrome 里打开 https://mp.xueqiu.com/writeV2 登录一次再点。`,
      raw,
    };
  }
  return {
    tier: "failed",
    detail: err ? `雪球那边说：${err}` : "扩展说没成功，但没说为什么。",
    raw,
  };
}

/**
 * 请求本身失败（没等到回话、扩展回了 error、连接断了）→ 七档之一。
 *
 * ★ **超时落 `unconfirmed`**：请求已经交给扩展了，雪球那边可能已经存上一份，
 *   只是没等到回话（图多的时候尤其慢）。说成"失败"，人会再点一次 —— 两份草稿。
 * ★ **token 对不上**是 `failed` 而不是"没连上"：连上了，只是被扩展拒了，
 *   人要去核对两边填的是不是同一个值。
 */
export function classifyRequestError(
  err: unknown,
  sent: boolean
): DraftOutcome {
  const msg = err instanceof Error ? err.message : String(err);
  if (/token/i.test(msg)) {
    return {
      tier: "failed",
      detail:
        "扩展拒了这条请求，多半是 token 对不上 —— 核对扩展设置里的 token 和 .env 里的 " +
        "WECHATSYNC_TOKEN 是不是同一个值（改完 .env 要重启 dev server）。",
      raw: msg,
    };
  }
  if (!sent) {
    return {
      tier: "no_extension",
      detail: "扩展没连上，请求没发出去。" + bridgeStateLabel("waiting"),
      raw: msg,
    };
  }
  return {
    tier: "unconfirmed",
    detail:
      "请求已经交给扩展了，但没等到回话（图多的时候会很慢）—— 草稿箱里可能已经有一份。" +
      "先去雪球草稿箱看一眼，别急着再点。",
    raw: msg,
  };
}

/**
 * 一次点击分成几篇推的时候（放不下，见 `xueqiuArticle.ts` 的 `planDrafts()`），
 * 这一篇的结果要不要**停下后面的**。
 *
 * ★ `failed`（雪球明确拒了**这一篇**）不停 —— 那是这一篇自己的事，凭它把后面几篇
 *   判死，人就得回来一篇一篇再点（原来小红书那套批量队列也是这么分的）。
 * ★ 其余都停：
 *   - `unconfirmed`：交出去了没回话 —— 通道可能断了，而且那一篇**可能还在路上**，
 *     接着推就是两篇同时在扩展里跑，撞了分不出是哪篇；
 *   - 「还没轮到推」那四档：通道本身没好，后面每一篇都会撞同一堵墙。
 */
export function stopsDraftBatch(tier: DraftTier): boolean {
  return tier !== "drafted" && tier !== "failed";
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
