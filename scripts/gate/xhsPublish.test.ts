/**
 * 发小红书（`src/dev/xhsPublishPlan.ts` ＋ 接线）的测试。
 *
 * ## ★ 这一组里最要紧的一条：**"看不懂" ≠ "成功"**
 *
 * `xiaohongshu-mcp` **没有公开的响应 schema**（README 只说「显示发布成功后」）。
 * 所以这条路上最容易出的错不是发失败，而是**发失败了却报成功** ——
 * 一个把"调用没抛"当成功的客户端会安静地不发帖，而屏幕上一片绿。
 * 那正是 docs/engineering-notes.md 第二节那条价值观在这个功能上的落点，A 组整组钉的就是它。
 *
 *   A 组 四档   —— 两两不同；认不出的回包一律落 unconfirmed
 *   B 组 回包   —— 整个 JSON / SSE 两种都得认
 *   C 组 图片   —— 路径必须纯 ASCII（那个工具的已知失败原因）
 *   D 组 接线   —— 同源闸、路由注了、页面四档长得不一样
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkImagePath,
  classifyFetchError,
  parseRpcBody,
  readLoginResult,
  readToolResult,
  toolCallBody,
  FAILURE_SIGNALS,
  LOGIN_TOOL,
  PUBLISH_TOOL,
  SUCCESS_SIGNALS,
  XHS_MCP_ENDPOINT,
} from "../../src/dev/xhsPublishPlan";
import { cacheFileName, cacheKey, stalePrefix } from "../../src/dev/xhsCache";
import { publishedLabel } from "../../src/dev/xhsPublished";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * 把注释剥掉再比 —— **这一轮踩了三次**（xhsCard / xhsPost / 这里）。
 * 一条禁止某种写法的断言，会被**写着禁止它的那句注释**接住，于是
 * 真把代码改坏了它也不红。⚠ 只剥块注释和整行 `//`，免得切掉 `https://`。
 */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** 拼一个 MCP `tools/call` 的成功回包（content 里就一段文本）。 */
const reply = (text: string, isError = false) => ({
  jsonrpc: "2.0",
  id: 2,
  result: { content: [{ type: "text", text }], isError },
});

/* ── A 组：四档 ─────────────────────────────────────────────────────── */

test("A1 认不出的回包落 unconfirmed —— **不是成功**", () => {
  // 这是整个功能的底线。那个接口没有公开 schema，今天大多数回包都会走到这儿。
  const got = readToolResult(reply("note_id=6512ab 已提交"));
  assert.equal(
    got.tier,
    "unconfirmed",
    "一段没见过的回包被当成了成功 —— 那就是「发失败了却报绿」的那条路"
  );
  assert.ok(got.raw?.includes("note_id=6512ab"), "看不懂就必须把原文摊出来");
});

test("A2 命中已知成功信号才算 published", () => {
  for (const sig of SUCCESS_SIGNALS) {
    assert.equal(readToolResult(reply(`…${sig}…`)).tier, "published", sig);
  }
});

test("A3 明确失败就是 failed（isError / 失败信号 / JSON-RPC error）", () => {
  assert.equal(readToolResult(reply("随便什么", true)).tier, "failed");
  for (const sig of FAILURE_SIGNALS) {
    assert.equal(readToolResult(reply(`…${sig}…`)).tier, "failed", sig);
  }
  assert.equal(
    readToolResult({ jsonrpc: "2.0", id: 2, error: { message: "no such tool" } })
      .tier,
    "failed"
  );
});

test("A4 四档的说明两两不同 —— 不许有两档说同一句话", () => {
  const outcomes = [
    readToolResult(reply("发布成功")),
    readToolResult(reply("看不懂的东西")),
    readToolResult(reply("发布失败")),
    readLoginResult(reply("未登录")),
  ];
  assert.deepEqual(
    outcomes.map(o => o.tier),
    ["published", "unconfirmed", "failed", "offline"]
  );
  const details = new Set(outcomes.map(o => o.detail));
  assert.equal(details.size, 4, "有两档的说明是同一句话 —— 那就等于少了一档");
});

test("A5 没登录是 offline，**不是 failed**", () => {
  // 屏幕上必须是另一句话：否则人会去查发布逻辑，而真正要做的是重新扫码。
  const off = readLoginResult(reply("当前未登录"));
  assert.equal(off.tier, "offline");
  assert.match(off.detail, /扫码|登录/);

  assert.equal(readLoginResult(reply("已登录")).tier, "published");
});

test("A6 回包里没有 result → unconfirmed（不是 failed，也不是 published）", () => {
  assert.equal(readToolResult({ jsonrpc: "2.0", id: 2 }).tier, "unconfirmed");
  assert.equal(readToolResult(null).tier, "unconfirmed");
  assert.equal(readToolResult("一段字").tier, "unconfirmed");
});

/**
 * ⚠ 这一条是**诚实标记**，不是功能测试。
 *
 * `SUCCESS_SIGNALS` 是照着 README 那句「显示发布成功后」推的，**没有对着真 server
 * 校准过**（写的时候本机没装它）。所以今天真发一条，大概率落 `unconfirmed`。
 * 这条测试把"还没校准"这件事钉在代码里 —— 哪天有人把推测当成确认、
 * 顺手删掉那段 ⚠ 注释，这里会红。
 */
test("A7 SUCCESS_SIGNALS 旁边必须标着「还没对着真 server 校准过」", () => {
  const src = read("src/dev/xhsPublishPlan.ts");
  assert.match(
    src,
    /还没对着真 server 校准过/,
    "那张成功信号表是推测出来的，删掉这句注释等于把推测冒充成确认"
  );
  assert.ok(SUCCESS_SIGNALS.length > 0 && FAILURE_SIGNALS.length > 0);
});

/**
 * 【2026-09-22 真发过一条之后补的】发一条实测 **54 秒**，所以"超时"是这条路上
 * **真会发生**的结局。在它之前所有 fetch 错误都落 `offline`（"连不上，server 没起？"）
 * —— 而超时和连不上是完全不同的两件事：
 *
 *   连不上 → 请求根本没出去，**一定没发**
 *   超时   → 请求出去了，**可能已经发出去了**
 *
 * ⚠ 报成"连不上"会让人去重发一次，而重发的代价是**发重**。
 */
test("A8 超时落 unconfirmed（可能已经发了），连不上才落 offline", () => {
  const timeout = classifyFetchError(
    Object.assign(new Error("The operation was aborted due to timeout"), {
      name: "TimeoutError",
    }),
    XHS_MCP_ENDPOINT
  );
  assert.equal(
    timeout.tier,
    "unconfirmed",
    "超时被当成了 offline —— 那是在说「一定没发」，而它可能已经发出去了"
  );
  assert.match(timeout.detail, /重发|看一眼/, "得劝人先去看一眼再决定");

  const refused = classifyFetchError(
    new TypeError("fetch failed"),
    XHS_MCP_ENDPOINT
  );
  assert.equal(refused.tier, "offline");
  assert.notEqual(timeout.detail, refused.detail, "两档不许说同一句话");
});

/* ── B 组：回包两种形状都得认 ─────────────────────────────────────── */

test("B1 整个 JSON 和 SSE 两种都得认", () => {
  const payload = reply("发布成功");
  assert.deepEqual(parseRpcBody(JSON.stringify(payload)), payload);

  // Streamable HTTP 可能回 SSE。只认一种的话，另一种会落进"看不懂"，
  // 而其实发出去了 —— 那是这个功能最贵的一种误报。
  const sse = [
    "event: message",
    `data: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { progress: 1 } })}`,
    "",
    "event: message",
    `data: ${JSON.stringify(payload)}`,
    "",
  ].join("\n");
  assert.deepEqual(parseRpcBody(sse), payload, "SSE 要取最后一个 data 块");
});

test("B2 解不开的回包返回 undefined，由 readToolResult 落 unconfirmed", () => {
  assert.equal(parseRpcBody(""), undefined);
  assert.equal(parseRpcBody("{坏的"), undefined);
  assert.equal(readToolResult(parseRpcBody("{坏的")).tier, "unconfirmed");
});

test("B3 请求体是合法的 JSON-RPC tools/call", () => {
  const body = JSON.parse(toolCallBody(2, PUBLISH_TOOL, { title: "x" }));
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.method, "tools/call");
  assert.equal(body.params.name, PUBLISH_TOOL);
  assert.deepEqual(body.params.arguments, { title: "x" });
});

/* ── C 组：图片路径 ─────────────────────────────────────────────────── */

/**
 * 【2026-09-22】原 C1 钉的是 `imageFileName()` ——「发出去的文件名是纯 ASCII」。
 * 接了按内容缓存之后那个函数没人调用了（文件名改由 `cacheFileName()` 起），
 * 留着它就是**一条钉着死代码的测试**：读起来像有保障，其实保的是另一件事。
 * 函数和用例一起删了，那条性质由下面 E2 钉着。
 */

test("C2 路径里混进中文要**发之前**就说清楚，不是等对面失败", () => {
  assert.equal(checkImagePath("C:/work/lwjai/x.png"), undefined);
  const msg = checkImagePath("D:/项目/laowanjia/x.png");
  assert.ok(msg, "中文路径没被挡住");
  assert.match(msg!, /项目/, "得说出是哪几个字有问题");
});

/* ── D 组：接线 ─────────────────────────────────────────────────────── */

test("D1 路由注进 astro.config.ts 了，而且只在 dev", () => {
  const astro = read("astro.config.ts");
  assert.ok(astro.includes(`pattern: "/_xhs/publish"`));
  assert.match(astro, /isDev \? \[react\(\), keystatic\(\), devGate\]/);
});

test("D2 接口只认同源请求（它往公网发内容，而且跑在 localhost 上）", () => {
  const src = read("src/dev/xhs-publish.ts");
  assert.match(src, /x-requested-with/i);
  assert.match(src, /sec-fetch-site/i);
  assert.match(src, /export const prerender = false/);
});

test("D3 发之前先问登录，而且草稿不发", () => {
  const src = read("src/dev/xhs-publish.ts");
  assert.match(src, /checkLogin\(/, "没先问登录 —— 没登录会变成一次莫名的发布失败");
  // 草稿那道闸在共用的 xhsEntry.ts 里（findXhsGroup 走 getSortedPosts）。
  assert.match(read("src/dev/xhsEntry.ts"), /getSortedPosts\(/);
});

test("D4 图没画出来就不发 —— 没有图的笔记等于没有内容", () => {
  const src = read("src/dev/xhs-publish.ts");
  /**
   * ⚠ 认的是**调用**（带括号），不是那个名字。
   *   【2026-09-22 重构时暴露的】原来写的是 `indexOf("publishNote")`，
   *   它撞上的是顶部那行 import —— 也就是说这条断言**一直在比两个 import 的位置**，
   *   而两个 import 的先后和真实调用顺序毫无关系。它当时是绿的，
   *   但把发帖挪到出图前面它照样绿：**钉的是另一件事**（同 docs/engineering-notes.md 第一节
   *   那个 `scan.length === 1` 的形态）。
   */
  const renderIdx = src.indexOf("renderCached(");
  const publishIdx = src.indexOf("publishNote(");
  assert.ok(renderIdx > 0, "没找到出图那一步");
  assert.ok(publishIdx > renderIdx, "出图必须排在发帖前面");
});

test("D5 页面上四档长得不一样（少一档就是把两种结果说成一种）", () => {
  const page = read("src/dev/xhs.astro");
  for (const tier of ["published", "unconfirmed", "failed", "offline"]) {
    assert.ok(page.includes(`${tier}:`), `页面的四档里少了 ${tier}`);
  }
  // 回包原文要摊出来 —— unconfirmed 那一档全靠它。
  assert.match(page, /data-xhs-raw/);
});

test("D6 默认地址和两个工具名就是那个 server 的", () => {
  assert.equal(XHS_MCP_ENDPOINT, "http://localhost:18060/mcp");
  assert.equal(PUBLISH_TOOL, "publish_content");
  assert.equal(LOGIN_TOOL, "check_login_status");
});

/**
 * 【2026-09-22 用户报的】「一直处在发布中，看不到详细日志和状态」——
 * 真发一条要 54 秒，而那中间页面只有一句「发布中…」：
 * **"正在干活"和"已经挂了"在屏幕上长得一模一样。**
 *
 * ⚠ 补上的那个步骤提示是**预估**（MCP 的日志在它自己的 stdout 里，页面拿不到），
 *   所以屏幕上必须写明这一点 —— 一个假装知道进度的进度条比没有进度更坏。
 *   这条钉的就是那句自白，以及那个**如实**的秒表。
 */
test("D8 发布中要有秒表和步骤，而且必须自称是预估的", () => {
  const page = read("src/dev/xhs.astro");
  assert.match(page, /已用 \$\{sec\} 秒/, "没有已用秒数 —— 那是唯一如实的数字");
  assert.match(page, /PUBLISH_STEPS/, "没有步骤提示");
  /**
   * ⚠ 比的是**剥掉注释之后**的源码，而且认的是那句**真会显示出来**的话。
   *   【第三次踩到】第一版写的是 `/不是真实进度/` —— 那句话在
   *   `PUBLISH_STEPS` 的文档注释里也有，所以**把界面上那句删掉之后它照样绿**。
   *   一条禁止某种写法的断言，被写着禁止它的那句注释接住了。
   */
  assert.match(
    codeOnly(page),
    /按上次实测的节奏推的/,
    "界面上那句「不是真实进度」的自白没了 —— 那就是拿编出来的进度冒充真相"
  );
  // ⚠ 秒表不停的话会一直盖掉结果，屏幕上永远是「发布中」。
  assert.match(page, /clearInterval\(timer\)/, "秒表没停 —— 它会盖掉结果");
});

test("D7 不许重试 —— 重试的代价是发重", () => {
  // 那个接口今天还说不清"失败"到底有没有发出去（unconfirmed 那一档存在的理由），
  // 所以自动重试可能变成发两条。宁可让人去看一眼再决定。
  const src = read("src/dev/xhsMcp.ts");
  assert.doesNotMatch(src, /for\s*\(.*retry|retries|maxAttempts/i);
  assert.match(src, /没有"重试"/);
});

/* ── E 组：按内容缓存 ＋ 发过什么的流水账（2026-09-22 用户要的） ────── */

/**
 * 用户最初的说法是「发布过的就不要再渲染了」。
 * ⚠ 那个键是错的：**改了一篇已经发过的稿子，恰恰最需要看到新图** ——
 *   按"发过"跳过的话屏幕上永远是过期那张，而且零报错。
 *   所以键是**内容**（整张白名单），这一组钉的就是这件事。
 */
test("E1 缓存的键是内容 —— 内容变一个字节，指纹就得变", () => {
  const base = {
    kindLabel: "研究报告",
    title: "原标题",
    voices: [{ label: "Claude", description: "摘要。" }],
    date: "2026-09-22",
    fullTextLabel: "报告全文：",
    url: "https://lwj.ai/r/1002",
  };
  const k0 = cacheKey(base as never);
  assert.equal(cacheKey({ ...base } as never), k0, "同样的内容必须同一个指纹");

  for (const [what, patch] of [
    ["标题", { title: "换了" }],
    ["摘要", { voices: [{ label: "Claude", description: "换了。" }] }],
    ["日期", { date: "2026-09-23" }],
    ["地址", { url: "https://lwj.ai/r/9999" }],
  ] as const) {
    assert.notEqual(
      cacheKey({ ...base, ...patch } as never),
      k0,
      `改了${what}而指纹没变 —— 那就会给出一张过期的图，零报错`
    );
  }
});

test("E2 缓存文件名纯 ASCII（它就是发出去的那一张）", () => {
  const n = cacheFileName("posts", "1009", "abc123");
  assert.equal(n, "posts-1009-abc123.png");
  assert.match(cacheFileName("qa", "中文", "k"), /^[A-Za-z0-9._-]+\.png$/);
  // 旧指纹前缀要能框住同一条内容的所有版本，否则改完内容磁盘上会越堆越多。
  assert.ok(n.startsWith(stalePrefix("posts", "1009")));
});

test("E3 出图和发帖共用同一份缓存（发出去的就是你看过的那张）", () => {
  // 各画一次的话，中间任何一处不确定（字体回落、跨零点）都会让你看到的
  // 和发出去的是两张图，而没有任何一处会说。
  for (const f of ["src/dev/xhs-card.ts", "src/dev/xhs-publish.ts"]) {
    assert.match(read(f), /renderCached\(/, `${f} 没走共用缓存`);
  }
});

test("E4 流水账三档两两不同，没发过整行不画", () => {
  const at = "2026-09-22T17:12:00.000Z";
  const labels = (["published", "unconfirmed", "failed"] as const).map(tier =>
    publishedLabel({ tier, at, title: "x" })
  );
  assert.equal(new Set(labels).size, 3, "有两档说了同一句话 = 少了一档");
  assert.equal(publishedLabel(undefined), undefined, "没发过该整行不画");

  // ⚠ 中间那一档必须让人**去查**，不是让人放心：
  //   说成「已发过」你不会去补发一条其实没发出去的；说成「没发过」你可能发重。
  assert.match(labels[1]!, /不确定/);
  assert.match(labels[1]!, /看一眼|补发/);
  assert.doesNotMatch(labels[1]!, /^已发过/);
});

test("E5 offline 不记流水账（那是还没轮到发布，不是发过）", () => {
  const src = codeOnly(read("src/dev/xhsPublished.ts"));
  assert.match(src, /if \(tier === "offline"\) return;/);
});

test("E6 流水账在仓库里而且被 gitignore —— 两件事都要", () => {
  // 在 node_modules 下的话，pnpm install --force 会悄悄清掉它，而丢了会让人发重。
  assert.doesNotMatch(
    codeOnly(read("src/dev/xhsPublished.ts")),
    /node_modules/,
    "流水账放进 node_modules 了 —— 那儿的东西会被清掉且一句话都不说"
  );
  // 但它是这台机器的备忘不是内容：提交会让两台机器互相覆盖。
  assert.match(read(".gitignore"), /\.xhs-published\.json/);
});

test("E7 记账失败不许让发布失败（帖子已经发出去了）", () => {
  const src = read("src/dev/xhs-publish.ts");
  // ⚠ 认的是**调用**不是那个名字：`indexOf("recordPublish")` 会先撞上顶部的 import，
  //   于是这条断言比的是 import 的位置 —— 钉的是另一件事。
  const pub = src.indexOf("publishNote(");
  const rec = src.indexOf("recordPublish(collection");
  assert.ok(rec > pub, "记账必须排在发帖之后 —— 先记的话失败了会记一笔假的");
  // recordPublish 自己吞异常，不往上抛。
  assert.match(codeOnly(read("src/dev/xhsPublished.ts")), /catch \(err\)/);
});
