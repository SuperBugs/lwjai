/**
 * 推长文到雪球草稿箱（Wechatsync 扩展）那条路的测试。
 *
 * ## ★ 这一组里最要紧的三条
 *
 * ① **只存草稿**：端点向扩展要的方法只许是 `checkAuth` / `syncArticle`，
 *    扩展回 `draftOnly: false`（说明它这次直接发了）时**不许**印"草稿存好了"（A3 / D3）。
 *    这是这条路和小红书被封那次差着的第一件事。
 * ② **正文只有一个出口**：推到雪球的全文从我们自己的 `.md` 导出端点取，
 *    不读 `entry.body`（D2）—— docs/gate.md 7.5「复制全文」那一节的同一条。
 * ③ **"没等到回话"不是"失败"**：交出去了没回话落 `unconfirmed`（A4 / B6）——
 *    说成失败，人会再点一次，草稿箱里就是两份。
 *
 *   A 组 判据（wechatsyncPlan.ts）
 *   B 组 桥（真的 WebSocket ＋ 一个假扩展）
 *   C 组 长文怎么拼、放不下（雪球单篇 2 万字）怎么分（xueqiuArticle.ts）
 *   D 组 接线（端点 / 页面 / 平台表 / 账本）
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { WebSocket } from "ws";
import {
  CONNECT_WAIT_MS,
  DRAFT_TIER_HEAD,
  KEEPALIVE_METHOD,
  KEEPALIVE_MS,
  SYNC_TIMEOUT_MS,
  XUEQIU_PLATFORM,
  bridgeStateLabel,
  classifyAuth,
  classifyRequestError,
  classifySync,
  envEncodingProblem,
  isWebOrigin,
  noTokenLabel,
  readToken,
  requestMessage,
  stopsDraftBatch,
  type BridgeState,
  type DraftTier,
} from "../../src/dev/wechatsyncPlan";
import {
  BridgeRequestError,
  bridgeAddress,
  ensureBridge,
  request,
  stopBridgeForTests,
  waitForExtension,
} from "../../src/dev/wechatsyncBridge";
import {
  XUEQIU_BUDGET,
  isTooLongError,
  planDrafts,
  sectionTitle,
  splitSections,
  truncationNote,
  xueqiuArticle,
  type Measure,
} from "../../src/utils/xueqiuArticle";
import { communityFooter } from "../../src/utils/communityPost";
import { findPlatform } from "../../src/config/socialPlatforms";
import {
  draftLabel,
  draftRecordsFor,
  draftWhen,
  recordedDraftTier,
  type DraftLog,
} from "../../src/dev/xueqiuDrafts";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * 剥注释再比 —— 这一轮**同一个形态踩了五次**：一条"不许这么写"的断言，
 * 会被写着"不许这么写"的那句注释接住。
 */
const codeOnly = (src: string) =>
  src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const xueqiu = () => {
  const p = findPlatform(XUEQIU_PLATFORM);
  assert.ok(p, "平台表里没有雪球");
  return p;
};

/* ── A 组：判据 ─────────────────────────────────────────────────────── */

test("A1 七档两两不同，桥的四档也两两不同", () => {
  const heads = Object.values(DRAFT_TIER_HEAD);
  assert.equal(new Set(heads).size, heads.length, `有两档说了同一句话：${heads}`);
  assert.equal(heads.length, 7);

  const states: BridgeState[] = ["no_token", "port_busy", "waiting", "connected"];
  const labels = states.map(bridgeStateLabel);
  assert.equal(new Set(labels).size, 4, "桥的四档有两档说了同一句话");
  // 没配 token 那一档要说出**两边都得填**：扩展里一份、.env 里一份。
  assert.match(labels[0]!, /\.env/);
  assert.match(labels[0]!, /WECHATSYNC_TOKEN/);
});

test("A2 syncArticle 的回话 → 各就各位", () => {
  const ok = classifySync({
    results: [
      {
        platform: "xueqiu",
        success: true,
        postId: "123",
        postUrl: "https://mp.xueqiu.com/write/draft/123",
        draftOnly: true,
      },
    ],
    syncId: "s",
  });
  assert.equal(ok.tier, "drafted");
  assert.equal(ok.draftUrl, "https://mp.xueqiu.com/write/draft/123");

  // 真的会这么回：它适配器里 `throw new Error('请先登录雪球')`。
  const login = classifySync({
    results: [{ platform: "xueqiu", success: false, error: "请先登录雪球" }],
  });
  assert.equal(login.tier, "not_logged_in");

  // 它适配器里另一句：`res.error_description || '保存失败'`。
  const saved = classifySync({
    results: [{ platform: "xueqiu", success: false, error: "保存失败" }],
  });
  assert.equal(saved.tier, "failed");
  assert.match(saved.detail, /保存失败/, "雪球的原话要带出来");

  // 认不出的形状 → 不确定，不是失败也不是成功。
  assert.equal(classifySync({}).tier, "unconfirmed");
  assert.equal(classifySync(null).tier, "unconfirmed");
  assert.equal(
    classifySync({ results: [{ platform: "zhihu", success: true }] }).tier,
    "unconfirmed",
    "回话里没有雪球那一条"
  );
});

test("A3 扩展说「这次不是草稿、直接发了」—— 不许印「草稿存好了」", () => {
  /**
   * 读过的那一版雪球适配器只调 `draft/save.json`。真回来一个 `draftOnly: false`，
   * 说明扩展升级改了行为 —— 那正是这条路和小红书那次差着的那件事，必须响。
   */
  const o = classifySync({
    results: [
      {
        platform: "xueqiu",
        success: true,
        postUrl: "https://xueqiu.com/1/2",
        draftOnly: false,
      },
    ],
  });
  assert.notEqual(o.tier, "drafted");
  assert.match(o.detail, /直接发/);
});

test("A4 交出去了没等到回话 = 不确定，不是失败（再点一次就是两份）", () => {
  const timeout = classifyRequestError(
    new BridgeRequestError("等了 360 秒没等到回话", true),
    true
  );
  assert.equal(timeout.tier, "unconfirmed");
  assert.match(timeout.detail, /草稿箱/, "得让人先去草稿箱看一眼");

  // 没交出去 = 还没轮到推（扩展没连上），不是失败也不是不确定。
  assert.equal(
    classifyRequestError(new BridgeRequestError("扩展没连上", false), false).tier,
    "no_extension"
  );

  // token 对不上是**连上了但被拒了** —— 失败档，而且要说出去核对哪两处。
  const tok = classifyRequestError(new Error("Invalid token"), true);
  assert.equal(tok.tier, "failed");
  assert.match(tok.detail, /WECHATSYNC_TOKEN/);
});

test("A5 认不出的登录回话不当成已登录", () => {
  const ok = classifyAuth({ id: "xueqiu", isAuthenticated: true, username: "牢玩家" });
  assert.ok("ok" in ok && ok.username === "牢玩家");
  for (const bad of [{}, null, { isAuthenticated: "true" }, { isAuthenticated: false }]) {
    const r = classifyAuth(bad);
    assert.ok(!("ok" in r), `${JSON.stringify(bad)} 被当成了已登录`);
  }
});

test("A6 空 token 当成没配，不许把一个空串发出去", () => {
  assert.equal(readToken(undefined), undefined);
  assert.equal(readToken(""), undefined);
  assert.equal(readToken("   "), undefined);
  assert.equal(readToken(" abc "), "abc");
});

test("A7 网页发起的连接要拒，扩展的不拒", () => {
  assert.equal(isWebOrigin("https://evil.example"), true);
  assert.equal(isWebOrigin("http://localhost:4321"), true, "连我们自己的页面也不许冒充扩展");
  assert.equal(isWebOrigin("chrome-extension://abcdef"), false);
  assert.equal(isWebOrigin(undefined), false);
});

test("A8 每一条消息都带 token（扩展是逐条验的）", () => {
  const m = requestMessage("1", "checkAuth", "tok", { platform: "xueqiu" });
  assert.deepEqual(m, {
    id: "1",
    method: "checkAuth",
    token: "tok",
    params: { platform: "xueqiu" },
  });
  // 等待上限照抄它自己那座桥的 6 分钟（图多的时候要逐张下载再转存）。
  assert.equal(SYNC_TIMEOUT_MS, 360_000);
  assert.ok(CONNECT_WAIT_MS >= 10_000, "扩展是隔一会儿自己来连的，等太短必误报");
});

test("A9 .env 配了但编码坏了 ≠ 没配 —— 两句话不许一样", () => {
  /**
   * 【2026-09-23 真撞上的】用户在 Windows PowerShell 里照着说明敲了
   * `echo "WECHATSYNC_TOKEN=…" > .env`，PowerShell 5.1 的 `>` 写成了 UTF-16 LE。
   * 下面这几个字节**就是那个真文件的开头**（`ff fe 57 00` = BOM ＋ "W\0"），
   * 不是照着判据反推的。
   */
  assert.equal(envEncodingProblem(new Uint8Array([0xff, 0xfe, 0x57, 0x00])), "utf16");
  assert.equal(envEncodingProblem(new Uint8Array([0xfe, 0xff, 0x00, 0x57])), "utf16");
  // PowerShell 5.1 的 `Out-File -Encoding utf8` 写的是这个。
  assert.equal(envEncodingProblem(new Uint8Array([0xef, 0xbb, 0xbf, 0x57])), "utf8-bom");
  // 正常的 UTF-8：`W`。
  assert.equal(envEncodingProblem(new TextEncoder().encode("WECHATSYNC_TOKEN=x")), undefined);
  assert.equal(envEncodingProblem(new Uint8Array([])), undefined);

  const plain = noTokenLabel(undefined);
  const u16 = noTokenLabel("utf16");
  const bom = noTokenLabel("utf8-bom");
  assert.equal(new Set([plain, u16, bom]).size, 3, "三种情况说了同一句话");
  assert.match(u16, /UTF-16/);
  assert.match(u16, /PowerShell/, "要说出是怎么变成这样的，不然人会照原样再写一遍");
  assert.ok(!/还没配/.test(u16), "明明配了，不许说「还没配」");
  // 页面是按纯文本印的：不许夹 markdown 的星号。
  for (const l of [plain, u16, bom]) assert.ok(!/\*\*/.test(l), `屏幕上会露出 **：${l}`);
});

/* ── B 组：桥（真的 WebSocket ＋ 一个假扩展）──────────────────────────── */

/** 一个假扩展：连上来，按 method 回话。 */
function fakeExtension(
  port: number,
  reply: (msg: Record<string, unknown>, ws: WebSocket) => void,
  origin = "chrome-extension://fake"
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
    ws.on("unexpected-response", (_req, res) =>
      reject(new Error(`握手被拒：HTTP ${res.statusCode}`))
    );
    ws.on("message", data => reply(JSON.parse(String(data)), ws));
  });
}

async function withBridge(fn: (port: number) => Promise<void>) {
  await stopBridgeForTests();
  try {
    assert.equal(await ensureBridge({ port: 0, token: "tok" }), "waiting");
    const addr = bridgeAddress();
    assert.ok(addr, "桥没起来");
    await fn(addr.port);
  } finally {
    await stopBridgeForTests();
  }
}

test("B1 一来一回：请求带着 token 到了扩展，回话原样回来", async () => {
  await withBridge(async port => {
    let seen: Record<string, unknown> | undefined;
    const ext = await fakeExtension(port, (msg, ws) => {
      seen = msg;
      ws.send(JSON.stringify({ id: msg.id, result: { isAuthenticated: true } }));
    });
    assert.equal(await waitForExtension(2000), true);
    const r = await request("checkAuth", "tok-123", { platform: "xueqiu" }, 2000);
    assert.deepEqual(r, { isAuthenticated: true });
    assert.equal(seen?.token, "tok-123", "token 没带过去 —— 扩展会拒");
    assert.equal(seen?.method, "checkAuth");
    ext.close();
  });
});

test("B2 只绑 127.0.0.1（它自己那座桥绑的是所有网卡）", async () => {
  await withBridge(async () => {
    assert.equal(bridgeAddress()?.address, "127.0.0.1");
  });
});

test("B3 网页发起的连接在握手阶段就被拒", async () => {
  await withBridge(async port => {
    await assert.rejects(
      fakeExtension(port, () => {}, "https://evil.example"),
      /握手被拒|401|Unexpected server response/,
      "一个网页冒充扩展连上来了"
    );
    assert.equal(await waitForExtension(200), false, "被拒的连接不许算成扩展连上了");
  });
});

test("B4 扩展没连上：请求**没发出去**（sent=false，落「还没轮到推」）", async () => {
  await withBridge(async () => {
    await assert.rejects(
      request("syncArticle", "t", {}, 500),
      (e: unknown) => e instanceof BridgeRequestError && e.sent === false
    );
  });
});

test("B5 扩展回 error：带着原话、而且算发出去了", async () => {
  await withBridge(async port => {
    await fakeExtension(port, (msg, ws) =>
      ws.send(JSON.stringify({ id: msg.id, error: { code: 401, message: "Invalid token" } }))
    );
    await waitForExtension(2000);
    await assert.rejects(
      request("checkAuth", "wrong", { platform: "xueqiu" }, 2000),
      (e: unknown) =>
        e instanceof BridgeRequestError && e.sent && /Invalid token/.test(e.message)
    );
  });
});

test("B6 交出去了没回话 → sent=true（判档落 unconfirmed，不许说成失败）", async () => {
  await withBridge(async port => {
    await fakeExtension(port, () => {
      /* 收下但不回 —— 图多的时候就是这样 */
    });
    await waitForExtension(2000);
    const err = await request("syncArticle", "t", {}, 300).catch(e => e);
    assert.ok(err instanceof BridgeRequestError && err.sent === true);
    assert.equal(classifyRequestError(err, err.sent).tier, "unconfirmed");
  });
});

test("B7 扩展在回话之前断开 → 也算发出去了", async () => {
  await withBridge(async port => {
    await fakeExtension(port, (_msg, ws) => ws.close());
    await waitForExtension(2000);
    const err = await request("syncArticle", "t", {}, 3000).catch(e => e);
    assert.ok(err instanceof BridgeRequestError && err.sent === true, String(err));
  });
});

test("B8 端口被别的程序占着 → port_busy，而不是「扩展没连上」", async () => {
  await stopBridgeForTests();
  const blocker = createServer();
  await new Promise<void>(r => blocker.listen(0, "127.0.0.1", () => r()));
  const port = (blocker.address() as { port: number }).port;
  try {
    assert.equal(await ensureBridge({ port }), "port_busy");
  } finally {
    blocker.close();
    await stopBridgeForTests();
  }
});

test("B9 心跳：连上之后按间隔发，带 token，而且发的**不是**会碰雪球的方法", async () => {
  /**
   * 【2026-09-23 对着真扩展撞上的】扩展的后台闲置约 30 秒被 Chrome 挂起，连接跟着断、
   * 重连计时器也一起死掉。心跳让它一直有活干。
   * ⚠ 心跳要是用了 checkAuth / listPlatforms，就是每 20 秒去雪球读一次页面。
   */
  await stopBridgeForTests();
  try {
    await ensureBridge({ port: 0, token: "tok-ka", keepaliveMs: 80 });
    const port = bridgeAddress()!.port;
    const got: Record<string, unknown>[] = [];
    const ext = await fakeExtension(port, msg => got.push(msg));
    await waitForExtension(2000);
    await new Promise(r => setTimeout(r, 400));
    assert.ok(got.length >= 2, `400ms 里只收到 ${got.length} 条心跳`);
    for (const m of got) {
      assert.equal(m.method, KEEPALIVE_METHOD);
      assert.equal(m.token, "tok-ka", "心跳没带 token —— 扩展会每次记一句 Invalid token");
    }

    // 断开之后停；换一个新连接上来又重新开始（不许漏掉、也不许两份叠着发）。
    ext.close();
    await new Promise(r => setTimeout(r, 200));
    const again: Record<string, unknown>[] = [];
    await fakeExtension(port, msg => again.push(msg));
    await new Promise(r => setTimeout(r, 400));
    assert.ok(again.length >= 2, "重连之后心跳没重新开始");
    assert.ok(again.length <= 8, `心跳叠了两份（400ms 里 ${again.length} 条）`);
  } finally {
    await stopBridgeForTests();
  }
});

test("A10 心跳的方法名不许是扩展真的会干活的那几个", () => {
  // 读过它的 handleMethod()：这几个都会去平台读页面或者推东西。
  for (const real of ["listPlatforms", "checkAuth", "syncArticle", "extractArticle", "uploadImage"]) {
    assert.notEqual(KEEPALIVE_METHOD, real);
  }
  assert.ok(KEEPALIVE_MS < 30_000, "Chrome 的挂起窗口是 30 秒，心跳间隔必须比它短");
  // 没连上时那句话要说出怎么叫醒它，而不是"等几秒刷新"（等多久都不会自己回来）。
  const w = bridgeStateLabel("waiting");
  assert.match(w, /图标/);
  assert.ok(!/等几秒刷新一下/.test(w), "又写回了那句错的：挂起之后等多久都不会自己回来连");
});

test("A11 分几篇推时：只有「存上了」和「这一篇被拒了」往下推，其余都停", () => {
  const all = Object.keys(DRAFT_TIER_HEAD) as DraftTier[];
  assert.equal(all.length, 7, "档位变了 —— 回来看一眼新那档该不该停");
  assert.deepEqual(
    all.filter(t => !stopsDraftBatch(t)).sort(),
    ["drafted", "failed"],
    "「不确定」接着推 = 上一篇可能还在路上，两篇同时在扩展里跑；「还没轮到推」接着推 = 撞同一堵墙"
  );
});

/* ── C 组：长文怎么拼 ─────────────────────────────────────────────────── */

const ZM = [{ code: "ZM", name: "Zoom" }];
/** 组里两份各有**自己的**地址和日期 —— 分开推时要用的正是这两格（C11）。 */
const SECTION_A = {
  label: "OpenAI ChatGPT（GPT-6-Pro）",
  description: "有现金流，但主营低增长。",
  body: "# Zoom 研究\n\n| 指标 | 数值 |\n|---|---|\n| 市盈率 | 示例 |\n\n- 一\n- 二\n",
  key: "posts/1009",
  url: "https://lwj.ai/r/1009",
  date: "2026-09-23",
  symbols: ZM,
};
const SECTION_B = {
  label: "Google Spark（Gemini-3.1-Pro）",
  description: "动能衰减，短线破位。",
  body: "## 结论\n\n短线破位。",
  key: "posts/1010",
  url: "https://lwj.ai/r/1010",
  date: "2026-09-21",
  symbols: ZM,
};
const SRC = {
  kindLabel: "研究报告",
  title: "Zoom 还有没有戏",
  symbols: ZM,
  date: "2026-09-23",
  url: "https://lwj.ai/r/1009",
  sections: [SECTION_A],
};

test("C1 只有一份：全文原样，不挂小标题；是谁写的印在页脚", () => {
  const a = xueqiuArticle(SRC, xueqiu());
  assert.equal(a.title, "Zoom 还有没有戏");
  assert.ok(a.markdown.includes(SECTION_A.body.trim()), "全文不是原样");
  assert.ok(!a.markdown.includes(`【${SECTION_A.label}】`), "只有一份也挂了小标题");
  assert.match(a.markdown, /\$Zoom\(ZM\)\$/, "cashtag 走的是平台表那个写法");
  assert.match(a.markdown, /全文：https:\/\/lwj\.ai\/r\/1009/);
  assert.match(a.markdown, /不构成投资建议/);
  /**
   * ★ 雪球上没有站上那张「智能体（模型）」芯片 —— 不印的话读者只看得到一句
   *   「AI 生成」，不知道是哪个、什么模型。【2026-09-23 第一次真推时发现的】
   */
  const footer = a.markdown.slice(a.markdown.lastIndexOf("——"));
  assert.ok(footer.includes(SECTION_A.label), `只有一份时页脚没说是谁写的：${footer}`);
});

test("C2 几份：每份前面一个「智能体（模型）」小标题，顺序不变", () => {
  const a = xueqiuArticle({ ...SRC, sections: [SECTION_A, SECTION_B] }, xueqiu());
  const ia = a.markdown.indexOf(`## 【${SECTION_A.label}】`);
  const ib = a.markdown.indexOf(`## 【${SECTION_B.label}】`);
  assert.ok(ia >= 0 && ib > ia, "小标题没挂上或者顺序乱了");
  /**
   * ★ 【】是承重的：每一份自己的正文里也有同一级的 `##`（实测 /q/1028 里有五个），
   *   不套的话读的人分不清"换了一个 AI"和"同一个回答的下一节"。
   */
  assert.ok(
    !new RegExp(`^## ${SECTION_A.label.replace(/[()（）]/g, ".")}$`, "m").test(a.markdown),
    "分隔小标题没套【】—— 和正文自己的 ## 长得一样"
  );
  // 小标题是整串（厂商 产品（模型）），不是 X 那个只剩产品名的。
  assert.match(a.markdown, /OpenAI ChatGPT（GPT-6-Pro）/);
});

test("C3 全文一个字不截、不改（这是长文，不是摘要）", () => {
  const long = `${"段落。".repeat(3000)}\n\n| a | b |\n|---|---|\n| 1 | 2 |`;
  const a = xueqiuArticle(
    { ...SRC, sections: [{ ...SECTION_A, body: long }] },
    xueqiu()
  );
  assert.ok(a.markdown.includes(long), "全文被截或者被改了");
});

test("C4 空的不推：没有一份、或者某一份正文是空的，都要红", () => {
  assert.throws(() => xueqiuArticle({ ...SRC, sections: [] }, xueqiu()), /至少有一份/);
  assert.throws(
    () => xueqiuArticle({ ...SRC, sections: [{ ...SECTION_A, body: "  \n" }] }, xueqiu()),
    /空壳/
  );
});

test("C5 停用的平台走不到这儿", () => {
  const xhs = findPlatform("xhs");
  assert.ok(xhs && xhs.mode === "retired");
  assert.throws(() => xueqiuArticle(SRC, xhs), /停用/);
});

test("C6 页脚和短帖**同一个** communityFooter()", () => {
  // 行为：几份合成一篇时，页脚就是 communityFooter() 吐的那几行，一行不差。
  const two = { ...SRC, sections: [SECTION_A, SECTION_B] };
  const a = xueqiuArticle(two, xueqiu());
  for (const line of communityFooter(two, xueqiu())) {
    assert.ok(a.markdown.includes(line), `页脚少了「${line}」`);
  }
  // 出处：同一个函数，不是抄了一份（抄的那份今天一样，改一边的那天就不一样了）。
  const src = codeOnly(read("src/utils/xueqiuArticle.ts"));
  assert.ok(/communityFooter\(footerSrc, platform\)/.test(src), "长文另写了一份页脚");
  const post = codeOnly(read("src/utils/communityPost.ts"));
  assert.ok(/communityFooter\(src, platform\)/.test(post), "短帖没走 communityFooter");
});

test("C7 标题就是票代码 → 换成带票名的摘要（和短帖同一条判据）", () => {
  const a = xueqiuArticle({ ...SRC, title: "ZM" }, xueqiu());
  assert.equal(a.title, "Zoom（ZM）：有现金流，但主营低增长。");
});

/* ── C 组续：雪球单篇 2 万字，放不下怎么分 ─────────────────────────────── */

/** 假尺子：markdown 多长就算多长。真的那把是站点渲染器量 HTML（端点里）。 */
const byLength: Measure = async md => md.length;

/** 一节：`## 标题` ＋ n 个字。 */
const sec = (title: string, n: number) => `## ${title}\n\n${"字".repeat(n)}\n`;

test("C8 切节：拼回去一个字节不差；围栏里的 ## 不算一节", () => {
  const body = [
    "# 美光研究",
    "",
    "引言。",
    "",
    "## 一、结论速览",
    "",
    "```bash",
    "## 这是 shell 注释，不是一节",
    "```",
    "",
    "## 二、估值",
    "",
    "| a | b |",
    "|---|---|",
    "| 1 | 2 |",
    "",
    "### 2.1 细节",
    "##没有空格的不是标题",
    "",
    "## 三、风险",
    "",
    "风险。",
    "",
  ].join("\n");
  const parts = splitSections(body);
  assert.equal(parts.join("\n"), body, "切开再拼回去不是原文");
  assert.deepEqual(parts.map(sectionTitle), ["", "一、结论速览", "二、估值", "三、风险"]);
  assert.ok(parts[1]!.includes("## 这是 shell 注释"), "围栏里那一行被当成了一节");
});

test("C9 切节：站上每一篇真实内容切开再拼回去都是原文", () => {
  /**
   * ★ 截断之后放进去的那一段必须是导出件的**逐字节前缀**（文件头「正文从哪来」）。
   *   这一条拿盘上每一篇真的正文验「切开 → 拼回去」，不是拿我自己编的样例。
   */
  let n = 0;
  for (const dir of ["posts", "qa", "guides", "prompts"]) {
    const abs = join(ROOT, "src", "content", dir);
    for (const f of readdirSync(abs).filter(x => x.endsWith(".md"))) {
      const raw = readFileSync(join(abs, f), "utf8");
      const body = raw.replace(/^---\n[\s\S]*?\n---\n/, "");
      assert.equal(splitSections(body).join("\n"), body, `${dir}/${f} 切开再拼回去变了`);
      n++;
    }
  }
  assert.ok(n >= 5, `只验了 ${n} 篇 —— 目录读错了？`);
});

test("C10 放得下：合成一篇，装着整组，不截", async () => {
  const plans = await planDrafts({ ...SRC, sections: [SECTION_A, SECTION_B] }, xueqiu(), byLength);
  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0]!.keys, ["posts/1009", "posts/1010"]);
  assert.equal(plans[0]!.truncated, undefined);
  assert.ok(!plans[0]!.article.markdown.includes("篇幅所限"), "没截也印了截断说明");
  // 量的就是要推的那一份（不是另一份的长度）。
  assert.equal(plans[0]!.estimate, plans[0]!.article.markdown.length);
});

test("C11 合起来放不下：每份各推一篇 —— 地址、日期是它自己的，标题带着是谁写的", async () => {
  const A = { ...SECTION_A, body: sec("一、结论速览", 10_000).replace("字", "甲") };
  const B = { ...SECTION_B, body: sec("一、结论速览", 10_000).replace("字", "乙") };
  const plans = await planDrafts({ ...SRC, sections: [A, B] }, xueqiu(), byLength);
  assert.equal(plans.length, 2, "合起来超了却没分开推");
  assert.deepEqual(plans.map(p => p.keys), [["posts/1009"], ["posts/1010"]]);
  assert.ok(plans.every(p => !p.truncated), "单份放得下却被截了");

  const [pa, pb] = [plans[0]!.article, plans[1]!.article];
  assert.ok(pa.markdown.includes(A.body.trim()) && !pa.markdown.includes("乙"), "第一篇里混进了第二份");
  assert.ok(pb.markdown.includes(B.body.trim()) && !pb.markdown.includes("甲"), "第二篇里混进了第一份");
  /**
   * ★ 地址必须是**它自己的**页面：拿整组的地址（= 代表那一条）去填，
   *   第二份的草稿就指向第一份的报告。
   */
  assert.ok(pb.markdown.includes(SECTION_B.url), "第二份的全文链接不是它自己的页面");
  assert.ok(!pb.markdown.includes(SECTION_A.url), "第二份的草稿指向了第一份的页面");
  assert.ok(pb.markdown.includes(SECTION_B.date), "第二份印的是整组那个日期");
  // 分开推的每一篇自己就是一整篇：不挂【】小标题，是谁写的印在页脚。
  assert.ok(!pb.markdown.includes(`【${B.label}】`));
  // ★ 同一组的标题本来就相同 —— 不带上是谁写的，草稿箱里就是两篇一模一样的标题。
  assert.notEqual(pa.title, pb.title, "分开推的两篇标题一模一样");
  assert.equal(pa.title, `${SRC.title} · ${SECTION_A.label}`);
  assert.equal(pb.title, `${SRC.title} · ${SECTION_B.label}`);
});

test("C12 单份放不下：从头按整节放到放不下为止，截掉什么说出来", async () => {
  const body = [
    "# 美光研究\n\n引言。\n",
    sec("一、结论速览", 5000),
    sec("二、估值", 5000),
    sec("三、催化剂", 5000),
    sec("四、风险", 5000),
    sec("五、附录", 5000),
  ].join("\n");
  const plans = await planDrafts(
    { ...SRC, sections: [{ ...SECTION_A, body }] },
    xueqiu(),
    byLength
  );
  assert.equal(plans.length, 1);
  const p = plans[0]!;
  // 放得下三节（1.5 万），放不下四节（2 万）—— 要的是**最多的那个**，不是第一个放得下的。
  assert.deepEqual(p.truncated, { kept: 3, total: 5, cut: ["四、风险", "五、附录"] });
  assert.ok(p.estimate <= XUEQIU_BUDGET, `截完还是超：${p.estimate}`);

  const md = p.article.markdown;
  // ★ 放进去的是原文的逐字节前缀，截在整节的边界上（不截在一节中间）。
  const kept = splitSections(body).slice(0, 4).join("\n").trim();
  assert.ok(md.includes(kept), "放进去的那一段不是原文的前缀");
  assert.ok(!/^## 四、风险$/m.test(md), "截掉的那一节还在正文里");
  // ⚠ 不许悄悄截：截掉了哪几节、全文在哪，都要写出来。
  assert.match(md, /篇幅所限/);
  assert.ok(md.includes("四、风险 / 五、附录"), "没说截掉了哪几节");
  assert.ok(md.includes(`全文（含这 2 节）：${SECTION_A.url}`), "没给全文链接");
  // 全文链接只印一次（截断那几行带了，页脚就不再印「全文：」）。
  assert.equal(md.split(SECTION_A.url).length - 1, 1, "全文链接印了两遍");
});

test("C13 截不了：一个字都不推，抛出来让人看 —— 两种截不了说的不是同一句", async () => {
  const push = (body: string) =>
    planDrafts({ ...SRC, sections: [{ ...SECTION_A, body }] }, xueqiu(), byLength);
  // 第一节自己就超了。
  await assert.rejects(
    push(`${sec("一、结论速览", 25_000)}\n${sec("二、估值", 10)}`),
    /连开头加第一节都放不下/
  );
  // 根本没有 `## ` 那一级的节（2026-09-23 站上 8 条问答里 4 条就没有，只是都不长）——
  // 说成"第一节太大"就是在指错地方。
  await assert.rejects(push(`${"字".repeat(25_000)}\n\n### 小节\n`), /没有 `## ` 那一级的节/);
});

test("C14 截断那几行的链接也跟着平台表的 urlInBody 走", async () => {
  const body = [sec("一、结论速览", 12_000), sec("二、估值", 12_000)].join("\n");
  const noLinks = { ...xueqiu(), urlInBody: false };
  const plans = await planDrafts({ ...SRC, sections: [{ ...SECTION_A, body }] }, noLinks, byLength);
  const md = plans[0]!.article.markdown;
  assert.match(md, /篇幅所限/, "截了却没说");
  assert.ok(!md.includes("https://"), "平台不许正文带链接，截断那几行还是印了地址");
  // 平台许的时候照印（同一份输入，只换平台那一格）。
  assert.equal(truncationNote({ kept: 1, total: 2, cut: ["二、估值"] }, "").length, 2);
  assert.match(
    truncationNote({ kept: 1, total: 2, cut: ["二、估值"] }, SECTION_A.url).join("\n"),
    /全文（含这 1 节）：https:\/\/lwj\.ai\/r\/1009/
  );
});

test("C15 认得出雪球那句「太长」（真回话原样），别的失败不算", () => {
  // 2026-09-23 真推 MU 那一组时雪球回的原话。
  assert.ok(isTooLongError("输入文字太长，请确认不超过20000个字"));
  assert.ok(!isTooLongError("请先登录雪球"));
  assert.ok(!isTooLongError("保存失败"));
});

/* ── D 组：接线 ─────────────────────────────────────────────────────── */

const DRAFT = codeOnly(read("src/dev/xueqiu-draft.ts"));
const STATUS = codeOnly(read("src/dev/xueqiu-status.ts"));

test("D1 草稿进不来：端点走 findXhsGroup（= getSortedPosts）", () => {
  assert.ok(/findXhsGroup\(/.test(DRAFT), "端点没走 findXhsGroup —— 草稿会被推上去");
  const entry = codeOnly(read("src/dev/xhsEntry.ts"));
  assert.ok(/getSortedPosts\(/.test(entry), "findXhsGroup 不再过 postFilter 了");
});

test("D2 全文从 .md 导出端点取，**不读 entry.body**（正文只许一个出口）", () => {
  assert.ok(/`\$\{entryUrl\([^`]*\)\}\.md`/.test(DRAFT), "没去取 .md 导出端点");
  assert.ok(
    !/\b(entry|a|answer|e|group\.entry)\.body\b/.test(DRAFT),
    "端点直接读了 entry.body —— 那是第二个出口"
  );
  // xueqiuSourceOf 也不许碰条目的 body。
  const entry = read("src/dev/xhsEntry.ts");
  const fn = codeOnly(entry.slice(entry.indexOf("export function xueqiuSourceOf")));
  assert.ok(!/\b(entry|a|data)\.body\b/.test(fn), "xueqiuSourceOf 读了条目的 body");
});

test("D3 只存草稿：端点向扩展要的方法只有 checkAuth / syncArticle", () => {
  const methods = [...DRAFT.matchAll(/request\(\s*"(\w+)"/g)].map(m => m[1]).sort();
  assert.deepEqual(
    [...new Set(methods)],
    ["checkAuth", "syncArticle"],
    `冒出来一个没见过的方法：${methods}`
  );
  // 状态接口只许问登录，不许推东西。
  const sm = [...STATUS.matchAll(/request\(\s*"(\w+)"/g)].map(m => m[1]);
  assert.deepEqual([...new Set(sm)], ["checkAuth"]);
});

test("D4 不重试：每一篇的 syncArticle 只发一次", () => {
  const n = (DRAFT.match(/request\(\s*"syncArticle"/g) ?? []).length;
  assert.equal(n, 1, "syncArticle 出现了不止一次 —— 超时那次可能已经存上了，重试就是两份");
});

test("D5 渲染时套站上那份消毒 schema（导出件是原文，裸 HTML 还在里面）", () => {
  assert.ok(
    /rehypePlugins:\s*\[\[rehypeSanitize,\s*MARKDOWN_SANITIZE_SCHEMA\]\]/.test(DRAFT),
    "没套消毒 —— 正文里一段 <img onerror> 就顺着这条路进了雪球"
  );
});

test("D6 两个端点都只认同源请求", () => {
  for (const [name, src] of [
    ["draft", DRAFT],
    ["status", STATUS],
  ] as const) {
    assert.ok(/x-requested-with/.test(src), `${name} 没查自定义头`);
    assert.ok(/sec-fetch-site/.test(src), `${name} 没查 Sec-Fetch-Site`);
  }
  assert.ok(/application\/json/.test(DRAFT), "POST 那条没查正文是不是 JSON");
});

test("D7 平台表：雪球是 draft 那一档，而且就这四档", () => {
  assert.equal(xueqiu().mode, "draft", "雪球不在 draft 档 —— 写成 official 是冒充平台给的口子");
  // 端点那边也按平台表判，不是写死"雪球能推"。
  assert.ok(/platform\.mode !== "draft"/.test(DRAFT), "端点没按平台表判能不能推");
});

test("D8 路由注进了 astro.config.ts，而且只在 dev", () => {
  const astro = read("astro.config.ts");
  assert.ok(astro.includes(`pattern: "/_xueqiu/draft"`));
  assert.ok(astro.includes(`pattern: "/_xueqiu/status"`));
  assert.match(astro, /isDev \? \[react\(\), keystatic\(\), devGate\]/);
});

test("D9 页面：按钮跟着平台表的 mode 走，而且说清楚推的是全文", () => {
  const page = read("src/dev/share.astro");
  const head = codeOnly(page.slice(0, page.indexOf("\n---", 10)));
  assert.ok(/draftable:\s*p\.mode === "draft"/.test(head), "按钮不是按平台表的 mode 挂的");
  const markup = codeOnly(page.slice(page.indexOf("\n---", 10)));
  assert.ok(/全文/.test(markup) && /不是上面这段/.test(markup), "没说清推的是全文不是那段短帖");
  // 推的时候所有推长文的按钮一起锁上（端点同一时刻只收一篇）。
  assert.ok(/for \(const b of all\) b\.disabled = true/.test(markup), "推的时候没把别的按钮锁上");
});

test("D11 读不到 token 时两个端点都去看 .env 的编码（不许只印「还没配」）", () => {
  for (const [name, src] of [
    ["status", STATUS],
    ["draft", DRAFT],
  ] as const) {
    assert.ok(
      /noTokenLabel\(envFileProblem\(\)\)/.test(src),
      `${name} 读不到 token 时没去看 .env 的编码`
    );
  }
  assert.ok(/envEncodingProblem\(/.test(STATUS), "envFileProblem 没走 envEncodingProblem 那个判据");
});

test("D10 账本：三档记、还没轮到推的四档不记；读数按站点时区", () => {
  for (const t of ["drafted", "unconfirmed", "failed"] as const) {
    assert.equal(recordedDraftTier(t), t);
  }
  for (const t of ["not_logged_in", "no_extension", "no_token", "port_busy"] as const) {
    assert.equal(recordedDraftTier(t), undefined, `${t} 被记进账了 —— 那一次什么都没推`);
  }

  // ⚠ 账里存 UTC。直接截字符串的读数比北京时间慢 8 小时。
  assert.equal(draftWhen("2026-09-23T07:40:00.000Z", "Asia/Shanghai"), "2026-09-23 15:40");
  // 跨零点那一下（en-CA 在某些 ICU 里把午夜印成 24:00）。
  assert.equal(draftWhen("2026-09-22T16:00:00.000Z", "Asia/Shanghai"), "2026-09-23 00:00");

  const labels = (["drafted", "unconfirmed", "failed"] as const).map(t =>
    draftLabel({ tier: t, at: "2026-09-23T07:40:00.000Z", title: "x" }, "Asia/Shanghai")
  );
  assert.equal(new Set(labels).size, 3, "账本三档说了同一句话");
  /**
   * ⚠ 光测 `draftWhen()` 不够 —— 卡片上那一行得**真的读它**。破坏验证抓到过：
   *   把 `draftLabel()` 改回直接截 UTC 字符串，上面几条全绿（`draftWhen` 本身还是对的）。
   *   同封面卡 B7 那个形态：判据算好了不等于有人读它。
   */
  for (const l of labels) {
    assert.ok(l!.includes("15:40"), `卡片上印的不是北京时间：${l}`);
    assert.ok(!l!.includes("07:40"), `卡片上印的是 UTC 的读数（慢 8 小时）：${l}`);
  }
  assert.match(labels[1]!, /草稿箱看一眼/, "「不确定」那档要让人去查，不是让人放心");

  assert.ok(/^\.xueqiu-drafts\.json$/m.test(read(".gitignore")), "账本没进 .gitignore");
});

/* ── D 组续：放不下时分几篇推的接线 ─────────────────────────────────────── */

test("D12 端点走 planDrafts；量长度和推之前渲染是同一台；一篇一篇推", () => {
  assert.ok(
    /planDrafts\(\s*xueqiuSourceOf\(/.test(DRAFT),
    "端点没走 planDrafts —— 超长的整篇会被原样推过去，雪球拒"
  );
  // ★ 尺子就是推之前渲染 HTML 的那一台：换一台量，估的数和推过去的就对不上。
  assert.ok(/async md => \(await renderHtml\(md\)\)\.length/.test(DRAFT), "量长度用的不是 renderHtml");
  assert.ok(
    /const html = await renderHtml\(plan\.article\.markdown\)/.test(DRAFT),
    "推过去的 HTML 不是按计划里那一篇渲染的"
  );
  assert.ok(/for \(const \[i, plan\] of plans\.entries\(\)\)/.test(DRAFT), "不是一篇一篇推的");
  assert.ok(!/Promise\.all/.test(DRAFT), "并发推了 —— 撞了分不出是哪篇");
  // 停不停只读 stopsDraftBatch 一处；停下时没推的那几篇要列出来（不许悄悄不推）。
  assert.ok(
    /if \(stopsDraftBatch\(result\.tier\)\) \{[\s\S]{0,200}?notPushed\.push[\s\S]{0,80}?break;/.test(DRAFT),
    "停下来的时候没把没推的列出来"
  );
  // 一篇里装了几份，账就记几笔（卡片按组里每一份的 key 去查）。
  assert.ok(/for \(const key of plan\.keys\) \{\s*recordDraft\(\s*key,/.test(DRAFT), "没按份记账");
  // 雪球说太长要单独说（去调预算），不和别的"没存上"混成一句。
  assert.ok(/isTooLongError\(/.test(DRAFT) && /XUEQIU_BUDGET/.test(DRAFT));
});

test("D13 每一份的地址 / 日期 / 标的取它**自己的**，不是整组代表那一条的", () => {
  const entry = read("src/dev/xhsEntry.ts");
  const start = entry.indexOf("sections: group.answers.map(");
  assert.ok(start > 0, "xueqiuSourceOf 里找不到 sections 那一段");
  const fn = codeOnly(entry.slice(start, entry.indexOf("})),", start)));
  assert.ok(/entryUrl\(a\.collection, a\.id, a\.filePath, locale\)/.test(fn), "每一份的地址不是它自己的");
  assert.ok(/date: beijingDate\(a\.data\)/.test(fn), "每一份的日期不是它自己的");
  assert.ok(/symbols: list\(a\.data, "symbols"\)/.test(fn), "每一份的标的不是它自己的");
  assert.ok(!/\bentry\b|group\.entry/.test(fn), "每一份那一段里读了整组代表那一条");
  // 记账的 key 和卡片查账的 key 是同一个写法 —— 对不上的话卡片永远"没推过"，人会再推一遍。
  assert.ok(/key: `\$\{a\.collection\}\/\$\{slugOf\(a\)\}`/.test(fn));
  const slugOf = 'entrySlug(e.collection, e.id, e.filePath).replace(/^\\/+/, "")';
  assert.ok(entry.includes(slugOf), "slugOf 的写法变了");
  const page = read("src/dev/share.astro");
  assert.ok(
    page.includes(slugOf.replaceAll("e.", "a.")),
    "页面查账的 key 和端点记账的 key 不是同一个写法"
  );
});

test("D14 账本：合成一篇的那条卡片上只印一行；分开推的各印一行、新的在前", () => {
  const merged = {
    tier: "drafted" as const,
    at: "2026-09-23T07:40:00.000Z",
    title: "合",
    draftUrl: "https://mp.xueqiu.com/write/draft/1",
    combined: 2,
  };
  const log: DraftLog = { "posts/1009": merged, "posts/1010": { ...merged } };
  assert.equal(
    draftRecordsFor(["posts/1009", "posts/1010"], log).length,
    1,
    "同一篇草稿在卡片上印了两行"
  );

  const older = {
    tier: "drafted" as const,
    at: "2026-09-23T07:40:00.000Z",
    title: "甲",
    draftUrl: "https://mp.xueqiu.com/write/draft/2",
  };
  const newer = { tier: "failed" as const, at: "2026-09-23T08:00:00.000Z", title: "乙" };
  const split: DraftLog = { "posts/1009": older, "posts/1010": newer };
  assert.deepEqual(
    draftRecordsFor(["posts/1009", "posts/1010"], split).map(r => r.title),
    ["乙", "甲"],
    "分开推的两篇少了一篇，或者不是新的在前"
  );
  assert.equal(draftRecordsFor(["posts/9999"], split).length, 0, "别的卡片的账印到这张上了");

  // 形状要说出来：合成的 / 截过的 / 完整的，卡片上长得不一样。
  const tz = "Asia/Shanghai";
  const whole = draftLabel(older, tz)!;
  const comb = draftLabel(merged, tz)!;
  const cut = draftLabel({ ...older, truncated: { kept: 3, total: 5 } }, tz)!;
  assert.equal(new Set([whole, comb, cut]).size, 3, "合成的 / 截过的 / 完整的说了同一句话");
  assert.match(cut, /3\/5/, "截过的没说截到哪");
});

test("D15 页面：一次点击出几篇就印几篇、各有各的「打开草稿」；没轮到推的也列出来", () => {
  const page = read("src/dev/share.astro");
  const head = codeOnly(page.slice(0, page.indexOf("\n---", 10)));
  // 卡片那几行按组里每一份去查（分开推的记在各自的 key 下）。
  assert.ok(/draftRecordsFor\(keys, draftLog\)/.test(head), "卡片只查了代表那一条");
  const script = codeOnly(page.slice(page.indexOf("async function pushDraft")));
  assert.ok(/Array\.isArray\(data\.results\)/.test(script), "只读了单条结果");
  assert.ok(/results\.forEach\(/.test(script), "只报了第一篇");
  assert.ok(/for \(const np of notPushed\)/.test(script), "没轮到推的没列出来 —— 和推过了长得一样");
  assert.ok(/results\.map\(r => r\.draftUrl\)/.test(script), "只给了第一篇的草稿链接");
});
