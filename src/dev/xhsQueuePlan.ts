import type { PublishTier } from "./xhsPublishPlan";

/**
 * 批量发小红书那个队列里**所有不碰 DOM 的判断** —— 纯函数、有单测
 * （`scripts/gate/xhsQueue.test.ts`）。真正勾选、串起来跑的在 `xhs.astro` 里。
 *
 * 【2026-09-22 用户要的】原话：「做一个可以勾选然后批量发布的功能，但是是线性的，
 * 有队列，节省我一个一个去点然后等待」。一条真发实测 **54 秒**，十几条就是
 * 十几分钟 —— 人不该坐在那儿盯着点。
 *
 * ## ★ 它省的是**人的注意力**，不是墙上时间
 *
 * 队列**严格串行**：上一条回来了才发下一条。⚠ 这不是保守，是那个接口的性质决定的：
 *   - 发布端点自己有一把 `running` 锁（并发第二条直接 409），并行只会拿到一串假失败；
 *   - 更要命的是**这个接口说不清"失败"到底发出去没有**（见 `xhsPublishPlan.ts`），
 *     而并行发的时候你连"是哪一条撞了"都分不出来。
 *
 * ## 状态七档，一档都不许压
 *
 *   `idle`        没勾，不在这批里
 *   `queued`      勾了，**排在后面等**（屏幕上带序号）
 *   `running`     正在发（秒表 ＋ 预估步骤那一套）
 *   `published` / `unconfirmed` / `failed` / `offline`   —— 发布结果那四档
 *   `skipped`     **排进来了，但没轮到** —— 队列在它前面停了
 *
 * ⚠ `skipped` 最容易被省掉，而省掉的代价最直接：它会长得和 `idle` 一模一样，
 *   于是「我没勾它」和「我勾了它但它没发出去」在屏幕上字节级相同 ——
 *   人合上电脑，以为十六条都发完了。
 */

/** 一条内容在这一批里的状态。 */
export type QueueState =
  "idle" | "queued" | "running" | "skipped" | PublishTier;

/**
 * 一批**跑完之后**每条停在哪一档 —— `QueueState` 去掉三个过程态。
 * ★ 单独一个类型不是洁癖：跑完之后还能读出 `queued` / `running` 的话，
 *   那是状态机漏了一处没收尾，而屏幕上会停在"排队中"不动。类型在这儿拦住它。
 */
export type QueueEndState = PublishTier | "skipped";

/**
 * 两条之间隔多久（秒）。
 *
 * ⚠ **这个数是猜的，我没有任何依据。** 小红书没公开发帖频率限制，那个 MCP
 *   server 的 README 也没说。留这个间隔的理由只有一条：一口气以机器速度连发
 *   十几条，是最容易被风控盯上的形状，而**被限流的时候那个接口大概率什么都不会说**
 *   （它连成功都说不清楚）—— 也就是说，出了事你是看不见的。
 * ★ 所以它做成页面上一个**看得见、改得动**的输入框，而不是藏在代码里的常数：
 *   一个猜出来的数不该假装成知识。填 0 就是不等。
 */
export const QUEUE_GAP_DEFAULT_SEC = 30;

/** 间隔最多填到这儿 —— 再大就不如分两批发了。 */
export const QUEUE_GAP_MAX_SEC = 600;

/**
 * 这一条的结果要不要**停掉整批**。
 *
 * ★ 只有 `offline` 停：server 没起 / 没登录，**后面每一条都会撞同一堵墙**。
 *   接着跑下去得到的是十几个一模一样的红条和十几分钟，而问题在第一条就说清楚了。
 * ⚠ `failed` / `unconfirmed` **不停**：那是这一条自己的事（标题太长、图没画出来、
 *   回包看不懂），凭它一条把剩下十几条判死，人得重新来一遍。
 * ⚠ 反过来也不行 —— 把 `offline` 也放过去，屏幕上会是一整批"失败"，
 *   而真正的原因（**根本没轮到发布**）被淹在里面。
 */
export function stopsQueue(tier: PublishTier): boolean {
  return tier === "offline";
}

/**
 * 「选没发出去的」那个按钮该勾中哪些。
 *
 * ★ 判据是**再发一次会不会发重**，不是"发过没发过"：
 *
 *   没记录      → 勾（从来没试过）
 *   `failed`    → 勾（**明确没发出去**，重发是安全的）
 *   `offline`   → 勾（**根本没轮到发布** —— server 没起，连试都没试）
 *   `unconfirmed` → **不勾**（可能已经在小红书上了，重发就是发重）
 *   `published` → 不勾
 *
 * ⚠ 把 `unconfirmed` 并进"没发出去"是这个按钮唯一能造成的真实损害：
 *   它会让人一键把一批**可能已经发过**的内容再发一遍，而那个接口
 *   说不清到底发没发（见 `xhsPublishPlan.ts` 文件头）。不确定的那几条
 *   必须人自己去小红书看一眼再手动勾。
 * ⚠【2026-09-22 在浏览器里跑出来的】`offline` 那一档第一版漏了，症状很具体：
 *   server 没起的时候整批停在第二条，人去把 server 起起来、回来再点一次 ——
 *   而那条 `offline` 已经被取消勾选了，于是**它被安静地跳过**。
 *   `recordPublish()` 本来就不记这一档（"还没轮到发布"不是一次发布），
 *   这里得和它一致。
 */
export function safeToQueue(tier: PublishTier | undefined): boolean {
  if (tier === undefined) return true;
  return tier === "failed" || tier === "offline";
}

/**
 * 跑完之后，这一条在卡片上该记成哪一档（`undefined` = 什么都没记）。
 *
 * ★ **必须和 `xhsPublished.ts` 的 `recordPublish()` 一致**：那边 `offline`
 *   直接 return、不落盘。页面这边如果记成 `offline`，卡片上带的就是一个
 *   **盘上根本不存在的状态** —— 刷新一下它变回"没发过"，而刷新前后
 *   「选没发出去的」勾出来的东西不一样，两次都不报错。
 * ⚠ `skipped` 同理：没轮到就是没发生过。
 */
export function recordedTier(
  state: QueueEndState
): Exclude<PublishTier, "offline"> | undefined {
  if (state === "skipped" || state === "offline") return undefined;
  return state;
}

/**
 * 接口回来的那个 `tier` 字符串 → 队列认识的一档。
 *
 * ★ **认不出的归 `unconfirmed`，不是 `failed`** —— 和页面上单点那条路同一个答案
 *   （那边印的是琥珀色的「？认不出的结果」）。归成 `failed` 的话，屏幕上会说
 *   "没发出去"，而我们其实不知道；更要命的是 `safeToQueue()` 会把它算成
 *   "可以放心重发"，于是下一批一键把它再发一遍。
 * ⚠ 也**不许让它停整批**：`stopsQueue()` 只认 `offline`，认不出的东西
 *   没有资格把剩下十几条判死。
 */
export function asQueueState(tier: string): PublishTier {
  return tier === "published" ||
    tier === "unconfirmed" ||
    tier === "failed" ||
    tier === "offline"
    ? tier
    : "unconfirmed";
}

/** 排队中那一条上印什么。带序号 —— 没有序号的话十条「排队中」看不出先后。 */
export function queuedLabel(pos: number, total: number): string {
  return `排队中 · 第 ${pos}/${total} 个`;
}

/** 整批停下来的三种原因。 */
export type StopReason = "stopped" | "offline" | "transport";

/**
 * 停了之后，**没轮到**的那几条上印什么。
 *
 * ★ 要说出**为什么**没轮到，三种原因在屏幕上两两不同：人按了停止 /
 *   前面一条说 server 没起 / 连自己的 dev server 都请求不到了。
 *   只印一句"没轮到"的话，人会默认是自己按的 —— 而后两种他什么都没做，
 *   得去修一个他还不知道存在的问题。
 */
export function skippedLabel(reason: StopReason): string {
  switch (reason) {
    case "stopped":
      return "— 没轮到：你按了停止";
    case "offline":
      return "— 没轮到：前面一条说 server 没起 / 没登录，整批停了";
    case "transport":
      return "— 没轮到：前面一条连请求都没发出去（dev server 掉了？），整批停了";
  }
}

/** 一批跑完之后的那句话。每一档各占一段，**不许合并成"完成 N 条"**。 */
export function queueSummary(states: readonly QueueState[]): string {
  const n = (s: QueueState) => states.filter(x => x === s).length;
  const parts = [
    [n("published"), "✓ 发出去了"],
    [n("unconfirmed"), "？不确定"],
    [n("failed"), "✗ 没发出去"],
    [n("offline"), "— 没轮到发布"],
    [n("skipped"), "— 没轮到"],
  ] as const;

  const said = parts.filter(([c]) => c > 0).map(([c, w]) => `${w} ${c} 条`);

  /**
   * ⚠ 一条都没跑成时**不许印一句空的「这批完了」**：那和"全发出去了"
   *   在屏幕上长得一样。这一档单独说。
   */
  if (said.length === 0) return `这批一条都没发（${states.length} 条全没跑）。`;

  const risky = n("unconfirmed");
  const tail =
    risky > 0
      ? `\n⚠ 那 ${risky} 条「不确定」要去小红书看一眼 —— 可能发出去了，也可能没有。`
      : "";
  return `这批完了：${said.join(" · ")}。${tail}`;
}

/** 跑的过程中顶上那条进度。`cur` 是正在发的那条的标题。 */
export function queueProgress(
  done: number,
  total: number,
  cur: string | undefined
): string {
  return cur === undefined
    ? `队列 ${done}/${total}`
    : `队列 ${done + 1}/${total} · 正在发：${cur}`;
}

/**
 * 间隔那个输入框里填的字 → 真正等几秒。
 *
 * ★ **认不出来就回落到默认值，不当成 0** —— 把一个打错的输入读成"不用等"，
 *   正好是这个间隔存在时最不想要的那个方向（一口气连发）。
 */
export function parseGapSeconds(raw: string): number {
  /**
   * ⚠ **空串要单独挡掉**：`Number("")` 是 `0`，不是 `NaN` —— 也就是说
   *   人把输入框清空（很自然的一个动作）会被读成"不用等"，正好是这里
   *   最不想要的那个方向。写这条判据时就是这么写的，A7 当场抓住了。
   */
  const s = raw.trim();
  if (s === "") return QUEUE_GAP_DEFAULT_SEC;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return QUEUE_GAP_DEFAULT_SEC;
  return Math.min(Math.round(n), QUEUE_GAP_MAX_SEC);
}
