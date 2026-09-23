import { WebSocketServer, type WebSocket } from "ws";
import {
  KEEPALIVE_MS,
  WECHATSYNC_WS_PORT,
  isWebOrigin,
  keepaliveMessage,
  requestMessage,
  type BridgeState,
  type RequestMessage,
} from "./wechatsyncPlan";

/**
 * 和「文章同步助手」（Wechatsync）扩展说话的那座桥 —— **我们开服务，扩展来连**。
 *
 * 判据全在 `wechatsyncPlan.ts`（纯函数、有单测）；这里只有 socket 和时序。
 * 协议是从它的源码读出来的（见那个文件头），**一行它的代码都没抄**。
 *
 * ## ★ 单例挂在 `globalThis` 上，不是模块变量
 *
 * 这个文件跑在 `astro dev` 进程里，Vite 改一个文件就可能把它重新求值一遍 ——
 * 模块变量会被清空、而旧的那个服务还绑着 9527，新的一绑就 `EADDRINUSE`，
 * 于是**自己把自己挡在门外**：屏幕上说「端口被别的程序占着」，而那个"别的程序"就是它自己。
 *
 * ## ★ 比它自己那座桥多守的三样
 *
 *   1. **只绑 127.0.0.1**（它的 `new WebSocketServer({ port })` 绑的是所有网卡，
 *      同一个局域网里的机器都连得上来）；
 *   2. **拒网页发起的连接**（`isWebOrigin()`）—— 任何网页都能 `new WebSocket(…9527)`；
 *   3. **不开那个 9528 的 HTTP 口**（它那个带 `Access-Control-Allow-Origin: *`、不认证，
 *      开着的时候随便一个网页都能用你的登录态往它支持的 29 个平台推东西）。
 */

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

interface BridgeSlot {
  wss: WebSocketServer | null;
  client: WebSocket | null;
  /** 起桥失败的原因（端口被占）。有值就不再重试 —— 除非人刷新页面让它再试一次。 */
  startError: "port_busy" | null;
  /**
   * 端口被占**以外**的绑定失败（EACCES 之类）。
   * ⚠ 单独一格而不是塞进 `startError`：塞不进四档里的任何一档 —— 说成「端口被占」
   *   是撒谎，落到「扩展没连上」更糟（真实原因是桥根本没起来）。所以让它**响**：抛出去。
   */
  bindFailure: Error | null;
  starting: Promise<void> | null;
  pending: Map<string, Pending>;
  waiters: Array<() => void>;
  seq: number;
  /** 心跳要带的 token（由 `ensureBridge({ token })` 带进来）。 */
  token: string | null;
  keepaliveMs: number;
  keepalive: ReturnType<typeof setInterval> | null;
}

const SLOT_KEY = "__lwjWechatsyncBridge";
const g = globalThis as unknown as Record<string, BridgeSlot | undefined>;

function slot(): BridgeSlot {
  let s = g[SLOT_KEY];
  if (!s) {
    s = {
      wss: null,
      client: null,
      startError: null,
      bindFailure: null,
      starting: null,
      pending: new Map(),
      waiters: [],
      seq: 0,
      token: null,
      keepaliveMs: KEEPALIVE_MS,
      keepalive: null,
    };
    g[SLOT_KEY] = s;
  }
  return s;
}

/**
 * 请求失败的时候，**发没发出去**是要带出来的 —— 判档靠它
 * （没发出去 = 还没轮到推；发出去了没回话 = 可能已经存上了）。
 */
export class BridgeRequestError extends Error {
  constructor(
    message: string,
    readonly sent: boolean
  ) {
    super(message);
    this.name = "BridgeRequestError";
  }
}

/**
 * 心跳：扩展连着的时候每隔 `keepaliveMs` 发一条它不认识的方法（`KEEPALIVE_METHOD`）。
 *
 * ★ 为什么要有它、为什么偏偏是一个"不认识的方法"，写在 `wechatsyncPlan.ts` 的
 *   `KEEPALIVE_MS` / `KEEPALIVE_METHOD` 上面 —— 一句话：扩展的后台闲置 30 秒会被 Chrome
 *   挂起，挂起之后不会自己回来连；而心跳要是用了 `checkAuth`，就是每 20 秒去雪球转一圈。
 * ★ 回话（一个 Unknown method 错误）不进 `pending`，`onMessage` 认不出它的 id，直接丢。
 * ⚠ `unref()`：不许因为一个心跳计时器让 Node 进程退不出去（测试跑完会挂住）。
 */
function startKeepalive(s: BridgeSlot): void {
  stopKeepalive(s);
  const timer = setInterval(() => {
    const ws = s.client;
    if (!ws || ws.readyState !== ws.OPEN || !s.token) return;
    try {
      ws.send(JSON.stringify(keepaliveMessage(`lwj-ka-${++s.seq}`, s.token)));
    } catch {
      // 发不出去就算了 —— 连接真断了的话 close 会接手收尾。
    }
  }, s.keepaliveMs);
  timer.unref?.();
  s.keepalive = timer;
}

function stopKeepalive(s: BridgeSlot): void {
  if (s.keepalive) clearInterval(s.keepalive);
  s.keepalive = null;
}

function start(s: BridgeSlot, port: number): Promise<void> {
  if (s.wss) return Promise.resolve();
  if (s.starting) return s.starting;

  s.starting = new Promise<void>(resolve => {
    const wss = new WebSocketServer({
      host: "127.0.0.1",
      port,
      // ★ 网页发起的连接在握手阶段就拒掉（见文件头第 2 条）。
      verifyClient: (info: { origin: string }) => !isWebOrigin(info.origin),
    });

    wss.on("listening", () => {
      s.wss = wss;
      s.startError = null;
      s.starting = null;
      resolve();
    });

    wss.on("error", (err: NodeJS.ErrnoException) => {
      // 绑不上就不留半个服务在那儿。
      s.wss = null;
      s.starting = null;
      if (err.code === "EADDRINUSE") s.startError = "port_busy";
      else s.bindFailure = err;
      try {
        wss.close();
      } catch {
        // 已经关了
      }
      resolve();
    });

    wss.on("connection", ws => {
      // 只认一个客户端：新的连上来就换掉旧的（扩展重连的时候旧的那条已经死了）。
      s.client = ws;
      for (const w of s.waiters.splice(0)) w();
      startKeepalive(s);

      ws.on("message", data => onMessage(s, String(data)));
      ws.on("close", () => {
        if (s.client === ws) {
          s.client = null;
          stopKeepalive(s);
        }
        // ★ 连接断了，还在等回话的那几条**都算发出去了**：扩展可能已经在干活。
        for (const [id, p] of s.pending) {
          clearTimeout(p.timer);
          p.reject(new BridgeRequestError("扩展在回话之前断开了连接", true));
          s.pending.delete(id);
        }
      });
      ws.on("error", () => {
        // close 会紧跟着来，收尾在那儿做。
      });
    });
  });
  return s.starting;
}

function onMessage(s: BridgeSlot, text: string): void {
  let msg: { id?: unknown; result?: unknown; error?: { message?: unknown } };
  try {
    msg = JSON.parse(text);
  } catch {
    return; // 不是 JSON 的（心跳之类）不理
  }
  if (typeof msg.id !== "string") return;
  const p = s.pending.get(msg.id);
  if (!p) return; // 不是我们等的那条（超时之后才回来的）
  s.pending.delete(msg.id);
  clearTimeout(p.timer);
  if (msg.error) {
    const m = typeof msg.error.message === "string" ? msg.error.message : "";
    p.reject(new BridgeRequestError(m || "扩展回了一个错误", true));
  } else {
    p.resolve(msg.result);
  }
}

/**
 * 起桥（幂等），返回**这一刻**的状态。页面打开时调一次，扩展就有时间先连上来。
 * `token` 不在这里判 —— 没 token 的时候调用方根本不该起桥（见 `xueqiu-status.ts`）。
 * @throws 端口被占以外的绑定失败 —— 见 `BridgeSlot.bindFailure`。
 */
export async function ensureBridge({
  /**
   * ★ 只有测试传这一格（传 0 = 让系统挑一个空闲端口）：dev server 开着桥的时候
   *   9527 就是被它占着的，测试写死 9527 会时灵时不灵。
   */
  port = WECHATSYNC_WS_PORT,
  /** 心跳要带的 token。端点每次都传 —— `.env` 改了、dev server 重启之后它会变。 */
  token,
  /** 只有测试传（用一个很短的间隔看心跳真的发出去了）。 */
  keepaliveMs = KEEPALIVE_MS,
}: {
  port?: number;
  token?: string;
  keepaliveMs?: number;
} = {}): Promise<BridgeState> {
  const s = slot();
  if (token) s.token = token;
  if (keepaliveMs !== s.keepaliveMs) {
    s.keepaliveMs = keepaliveMs;
    if (s.keepalive) startKeepalive(s);
  }
  // 上一次是端口被占：人刷新页面就是想让它再试一次。
  if (s.startError === "port_busy") s.startError = null;
  s.bindFailure = null;
  await start(s, port);
  if (s.startError === "port_busy") return "port_busy";
  // 已经连着、但心跳还没起（比如 token 是这一次才带进来的）—— 补起来。
  if (s.client && s.client.readyState === s.client.OPEN && !s.keepalive) {
    startKeepalive(s);
  }
  // ⚠ 重新读一次：上面那句置 null 之后 TS 会把它收窄成 null，而 start() 里会改它。
  const failure = s.bindFailure as Error | null;
  if (failure) {
    throw new Error(
      `推长文的桥起不来（${failure.message}）—— 不是端口被占，也不是扩展没连上。`
    );
  }
  return s.client && s.client.readyState === s.client.OPEN
    ? "connected"
    : "waiting";
}

/** 等扩展连上来；超时返回 false，不抛。 */
export function waitForExtension(ms: number): Promise<boolean> {
  const s = slot();
  if (s.client && s.client.readyState === s.client.OPEN) {
    return Promise.resolve(true);
  }
  return new Promise(resolve => {
    const done = (ok: boolean) => {
      clearTimeout(timer);
      const i = s.waiters.indexOf(onConnect);
      if (i >= 0) s.waiters.splice(i, 1);
      resolve(ok);
    };
    const onConnect = () => done(true);
    const timer = setTimeout(() => done(false), ms);
    s.waiters.push(onConnect);
  });
}

/**
 * 发一条请求，等它的回话。
 * @throws `BridgeRequestError` —— `sent` 说明请求到底交出去没有。
 */
export function request(
  method: RequestMessage["method"],
  token: string,
  params: Record<string, unknown> | undefined,
  timeoutMs: number
): Promise<unknown> {
  const s = slot();
  const ws = s.client;
  if (!ws || ws.readyState !== ws.OPEN) {
    return Promise.reject(new BridgeRequestError("扩展没连上", false));
  }
  const id = `lwj-${Date.now()}-${++s.seq}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      s.pending.delete(id);
      reject(
        new BridgeRequestError(
          `等了 ${Math.round(timeoutMs / 1000)} 秒没等到回话`,
          true
        )
      );
    }, timeoutMs);
    s.pending.set(id, { resolve, reject, timer });
    try {
      ws.send(JSON.stringify(requestMessage(id, method, token, params)));
    } catch (err) {
      clearTimeout(timer);
      s.pending.delete(id);
      reject(
        new BridgeRequestError(
          err instanceof Error ? err.message : String(err),
          false
        )
      );
    }
  });
}

/** 桥实际绑在哪儿（测试用：端口 0 时要知道系统挑了哪个，还要验它只绑了 127.0.0.1）。 */
export function bridgeAddress(): { address: string; port: number } | undefined {
  const a = slot().wss?.address();
  return a && typeof a === "object"
    ? { address: a.address, port: a.port }
    : undefined;
}

/** 测试用：把桥整个关掉，下一次 `ensureBridge()` 从头起。 */
export async function stopBridgeForTests(): Promise<void> {
  const s = slot();
  for (const [, p] of s.pending) clearTimeout(p.timer);
  s.pending.clear();
  stopKeepalive(s);
  s.token = null;
  s.keepaliveMs = KEEPALIVE_MS;
  s.waiters.splice(0);
  s.client?.terminate();
  s.client = null;
  const wss = s.wss;
  s.wss = null;
  s.startError = null;
  s.bindFailure = null;
  s.starting = null;
  if (wss) await new Promise<void>(r => wss.close(() => r()));
}
