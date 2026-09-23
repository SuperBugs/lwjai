/**
 * 平台登记表（`src/config/socialPlatforms.ts`）＋ 股票社区发帖文案
 * （`src/utils/communityPost.ts`）的测试。
 *
 * ## ★ 这一组里最要紧的两条
 *
 * ① **封面卡上印不印网址，必须跟着平台走。** 小红书那条导流细则针对的
 *    就是卡上印的 `https://lwj.ai/…`（细则明列「图片里含站外链接」违规，
 *    平台有 OCR）。A2 钉着这一格。
 * ② **猜出来的数不许长得像已知事实。** 富途那两个（标题 80 字、代码写法）一个来自
 *    2020 年的第三方文章、一个是从社区页面反推的。A3 钉着它们必须自报家门 ——
 *    同 `SUCCESS_SIGNALS` 的 A7，也同 docs/engineering-notes.md 第三节那个 `SC 13D`。
 *
 *   A 组 平台表
 *   B 组 文案
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACTIVE_PLATFORMS,
  DEFAULT_PLATFORM,
  RETIRED_PLATFORMS,
  SOCIAL_PLATFORMS,
  findPlatform,
  type SocialPlatform,
} from "../../src/config/socialPlatforms";
import {
  cashtagLine,
  communityBody,
  communityPost,
  communityTitle,
  type CommunityPostSource,
} from "../../src/utils/communityPost";
import { planXhsCard, xhsCardText } from "../../src/utils/xhsCardPlan";

const ROOT = join(import.meta.dirname, "..", "..");

const need = (id: string): SocialPlatform => {
  const p = findPlatform(id);
  assert.ok(p, `表里没有 ${id}`);
  return p;
};

const SRC: CommunityPostSource = {
  kindLabel: "研究报告",
  title: "Zoom 还有没有戏",
  symbols: [{ code: "ZM", name: "Zoom" }],
  voices: [
    { label: "OpenAI ChatGPT（GPT-6-Pro）", description: "有现金流，但主营低增长。" },
    { label: "Google Spark（Gemini-3.1-Pro）", description: "动能衰减，短线破位。" },
  ],
  date: "2026-09-23",
  url: "https://lwj.ai/r/1009",
};

/* ── A 组：平台表 ───────────────────────────────────────────────────── */

test("A1 停用的平台留在表里，而且说得出为什么", () => {
  // ⚠ 从表里删掉的话，「这个站不发小红书了」和「小红书那块坏了」长得一模一样，
  //   半年后没人记得起为什么没有它。
  assert.ok(RETIRED_PLATFORMS.length > 0, "小红书被整个删掉了");
  for (const p of RETIRED_PLATFORMS) {
    assert.ok(p.modeWhy && p.modeWhy.length > 10, `${p.name} 没说为什么停用`);
  }
  // 停用的不许混进页面要列的那张表。
  assert.ok(!ACTIVE_PLATFORMS.some(p => p.mode === "retired"));
});

test("A2 小红书那一档 urlOnCard 必须是 false —— 那正是导流细则针对的东西", () => {
  // 细则：「发布其他平台的链接…以及包含上述信息（直接、变形或植入）的图文」，
  // 平台有 OCR。哪天真重开，默认就得是不印。
  assert.equal(need("xhs").urlOnCard, false);
  assert.equal(need("xhs").urlInBody, false);

  // 而明确允许外链的那两家照印 —— 这一格分档才是这张表存在的理由。
  assert.equal(need("xueqiu").urlOnCard, true);
  assert.equal(need("futu").urlOnCard, true);
});

test("A3 没核过的数必须自报家门，不许和已知事实长得一样", () => {
  for (const p of SOCIAL_PLATFORMS) {
    if (p.calibrated) continue;
    assert.ok(
      p.calibrationNote && p.calibrationNote.length > 20,
      `${p.name} 标着没核过，却没说哪几个数没核、来源是什么`
    );
  }
  // 富途那两个数（标题 80、$名 (AAPL.US)$）今天就是猜的 —— 真核对上了
  // 再把它翻成 true，而不是现在就写 true。
  assert.equal(need("futu").calibrated, false);
  assert.equal(need("xueqiu").calibrated, true, "雪球那几个有官方帮助页");
});

test("A4 manual / retired 都得说出为什么", () => {
  for (const p of SOCIAL_PLATFORMS) {
    if (p.mode === "official") continue;
    assert.ok(
      p.modeWhy && p.modeWhy.length > 10,
      `${p.name}（${p.mode}）没说为什么不能自动发`
    );
  }
});

test("A5 就是三档 —— 加第四档（比如「模拟登录」）会红", () => {
  /**
   * 把"拿 cookie / 无头浏览器替人按发送"做成一个选项，就是把 2026-09-23
   * 踩过的坑铺成一条路。
   * ⚠ 第一版这条是 grep 一句中文注释，而那四个字在文件里有两处 ——
   *   破坏掉屏幕上真正生效的那一处，断言被**另一处注释**接住了，照样绿。
   *   （这一轮第五次同一个形态。）现在钉的是**类型联合本身**。
   */
  const src = readFileSync(join(ROOT, "src/config/socialPlatforms.ts"), "utf8");
  const decl = src.match(/export type PostMode =([^;]+);/);
  assert.ok(decl, "PostMode 的声明找不着了");
  const tiers = [...decl[1]!.matchAll(/"([a-z]+)"/g)].map(m => m[1]!).sort();
  assert.deepEqual(tiers, ["manual", "official", "retired"]);

  // 表里每一行也得落在这三档里（类型之外再拦一道，表是手写的）。
  for (const p of SOCIAL_PLATFORMS) {
    assert.ok(tiers.includes(p.mode), `${p.name} 是一档没见过的 ${p.mode}`);
  }
});

test("A6 默认平台是表里第一个还在发的，不许写死 id", () => {
  const src = readFileSync(
    join(ROOT, "src/config/socialPlatforms.ts"),
    "utf8"
  );
  assert.equal(DEFAULT_PLATFORM.id, ACTIVE_PLATFORMS[0]!.id);
  assert.ok(
    !/DEFAULT_PLATFORM\s*=\s*["']/.test(src),
    "默认平台写死成字面量了 —— 换默认应该是把那一行拖到最前"
  );
});

test("A7 两家的代码写法就是它们自己的写法", () => {
  /**
   * ⚠ 这几个期望值**不是照着实现反推的**，是查来的（docs/engineering-notes.md 第三节那条
   *   `SC 13D` 的教训）：
   *     雪球  —— 官方帮助页「$苹果(AAPL)$」
   *     富途  —— moomoo 社区页面上的「$苹果 (AAPL.US)$」（名字后有空格、带 .US）
   *   富途那条标着 calibrated: false，改它之前先去 App 里粘一次看变不变蓝。
   */
  assert.equal(need("xueqiu").cashtag!("AAPL", "苹果"), "$苹果(AAPL)$");
  assert.equal(need("futu").cashtag!("AAPL", "苹果"), "$苹果 (AAPL.US)$");

  // 没填公司名时只放代码 —— 编不出一个名字来。
  assert.equal(need("xueqiu").cashtag!("ZM"), "$ZM$");
  assert.equal(need("futu").cashtag!("ZM"), "$ZM.US$");

  // 小红书没有这种约定，undefined 不是漏填（硬加一个 $ZM 在那边是乱码）。
  assert.equal(need("xhs").cashtag, undefined);
});

/* ── B 组：文案 ─────────────────────────────────────────────────────── */

test("B1 代码那一行走平台表；不知道上限就不截", () => {
  const three = [
    { code: "ARM", name: "Arm" },
    { code: "INTC", name: "Intel" },
    { code: "AMD" },
    { code: "NVDA", name: "英伟达" },
  ];
  // 雪球官方明写最多 3 只 —— 第四个印出来也不会变蓝，截掉。
  const xq = cashtagLine(three, need("xueqiu"));
  assert.equal(xq, "$Arm(ARM)$ $Intel(INTC)$ $AMD$");

  /**
   * ⚠ 富途的上限**没查到** = `symbolLimit: undefined`。那是"不知道"，
   *   不是"不限" —— 但**不知道就不许断言**：截掉的代价是真少一条关联，
   *   多印的代价只是那个不变蓝。所以全印。
   */
  const ft = cashtagLine(three, need("futu"));
  assert.equal(ft.match(/\$/g)!.length / 2, 4, "富途那档不该截");

  // 没有 cashtag 约定的平台整行不出现。
  assert.equal(cashtagLine(three, need("xhs")), "");
});

test("B2 标题就是票代码时换成摘要 —— 理由是信息量，不是预算", () => {
  // 站上真有 title: ZM 的研究报告。一篇叫「ZM」的帖子谁也看不出讲了什么，
  // 而紧跟着那行 cashtag 已经把代码说了一遍。
  const t = communityTitle({ ...SRC, title: "ZM" });

  /**
   * ⚠【2026-09-23 在浏览器里看出来的】回落**必须带上票名**：正文第一份的摘要
   *   就是这一句，原样搬过去屏幕上是一模一样的两行（雪球的标题和正文是两个框）。
   */
  assert.equal(t, "Zoom（ZM）：有现金流，但主营低增长。");
  assert.notEqual(t, SRC.voices[0]!.description, "标题和正文第一行一字不差");

  // 没填公司名时退到代码 —— 编不出一个名字来。
  assert.equal(
    communityTitle({ ...SRC, title: "ZM", symbols: [{ code: "ZM" }] }),
    "ZM：有现金流，但主营低增长。"
  );

  // 摘要也空的话仍然用标题（一个代码总比空标题强）。
  assert.equal(
    communityTitle({
      ...SRC,
      title: "ZM",
      voices: [{ description: "" }],
    }),
    "ZM"
  );

  // ⚠ 雪球标题**没有上限**，所以这儿不许截 —— 那是小红书 20 字逼出来的取舍。
  const long = "一".repeat(120);
  assert.equal(communityTitle({ ...SRC, title: long }), long);
});

test("B3 摘要原样给全，一个字不截（这两家是长文平台）", () => {
  const long = "甲".repeat(900);
  const body = communityBody(
    { ...SRC, voices: [{ label: "A", description: long }] },
    need("xueqiu")
  );
  assert.ok(body.includes(long), "摘要被截了 —— 那是图片载体逼出来的取舍");
});

test("B4 链接和免责都跟着平台表走，不是这儿的判断", () => {
  const xq = communityBody(SRC, need("xueqiu"));
  assert.ok(xq.includes("https://lwj.ai/r/1009"), "雪球那档该带可点的链接");
  assert.ok(xq.includes("不构成投资建议"), "免责没加上");

  // 富途是**持牌券商**社区，那条「不得直接推荐股票代码」更紧。
  assert.ok(/不构成任何证券的推荐/.test(communityBody(SRC, need("futu"))));

  // 把某个平台的 urlInBody 关掉，正文里就不该再出现地址。
  const noUrl = communityBody(SRC, { ...need("xueqiu"), urlInBody: false });
  assert.ok(!noUrl.includes("lwj.ai"), "urlInBody 关了还在印地址");

  // 没有 disclaimer 那一格就不加（不是印一句空的）。
  const bare = communityBody(SRC, {
    ...need("xueqiu"),
    disclaimer: undefined,
  });
  assert.ok(!/不构成/.test(bare));
});

test("B5 一组里一份都没有要抛，不许兜一个没出处的单条", () => {
  assert.throws(
    () => communityPost({ ...SRC, voices: [] }, need("xueqiu")),
    /voices/
  );
});

test("B6 停用的平台走到这儿要抛 —— 它根本不该有入口", () => {
  // 兜过去的症状是：照常生成一篇，发到一个已经停用的平台。
  assert.throws(() => communityPost(SRC, need("xhs")), /停用/);
});

test("B7 标题超了只报，不拿一个没核过的数去截真标题", () => {
  const futu = need("futu");
  assert.equal(futu.titleMax, 80);

  const short = communityPost({ ...SRC, title: "短标题" }, futu);
  assert.equal(short.titleOver, undefined, "没超就别报");

  const over = communityPost({ ...SRC, title: "字".repeat(85) }, futu);
  assert.equal(over.titleOver, 5, "超了几个字要说出来");
  assert.equal(
    [...over.title].length,
    85,
    "标题被截了 —— 那个 80 是猜的，拿推测去改内容不行"
  );

  // 雪球没有已知上限，那一档永远不报。
  assert.equal(
    communityPost({ ...SRC, title: "字".repeat(300) }, need("xueqiu"))
      .titleOver,
    undefined
  );
});

/* ── C 组：/_share 上的接线（没接上全是零症状的）────────────────────── */

const PAGE = readFileSync(join(ROOT, "src/dev/share.astro"), "utf8");
/**
 * 剥注释再比。⚠ 这一轮**同一个形态踩了五次**（xhsCard / xhsPost / xhs.astro /
 * xhsQueue 的 MARKUP / socialPlatforms 的 A5）：一条"不许这么写"的断言，
 * 会被写着不许这么写的那句注释接住。
 */
const code = PAGE.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/**
 * 每张卡片里那几块是怎么拼出来的 —— **只看这一段**。
 *
 * ⚠ 第一版这几条是在整份源码上 `includes("communityPost")` /
 *   `includes("ACTIVE_PLATFORMS")`，而那两个名字在 **import 行**和一个
 *   已经没人调用的 helper 里都还在 —— 把真正生成文案那一句换成假数据，
 *   测试照样绿（破坏验证当场抓到）。同上次 D4 撞上 import 那一族。
 */
const blocksRegion = (() => {
  const from = code.indexOf("blocks: [");
  assert.ok(from > 0, "找不到 blocks: [ —— 这几条测试自己失效了");
  return code.slice(from, code.indexOf("\n---", from));
})();

test("C1 判据只有一份 —— 页面不许自己再拼一套文案", () => {
  assert.ok(
    blocksRegion.includes("communityFor("),
    "那几块不是 communityPost() 生成的了"
  );
  assert.ok(
    blocksRegion.includes("ACTIVE_PLATFORMS.map("),
    "平台名单在这儿写死了 —— 加一家得改两处，而漏改那一处是零症状的"
  );
  // 页面里不许自己拼 cashtag（那是平台表里那两个函数的活，两家写法不一样）。
  assert.ok(
    !/\$\$\{/.test(code),
    "页面里自己拼了 $代码$ —— 抄一份必然有一家是错的"
  );
});

test("C2 复制按钮**逐块**绑，不是一条内容拿第一个", () => {
  /**
   * 一条内容现在有三块（X / 雪球 / 富途）。用 `[data-share-item]` 去
   * querySelector 的话拿到的永远是第一块 —— 切到雪球点复制，
   * **复制的还是 X 那段**，而按钮照常有反应、零报错。
   */
  assert.ok(
    /querySelectorAll<HTMLElement>\("\[data-share-block\]"\)/.test(code),
    "还在按 data-share-item 绑复制"
  );
});

test("C3 停用的平台在页面上说得出为什么", () => {
  /**
   * 静默消失的话，「不发小红书了」和「小红书那块坏了」长得一模一样。
   * ⚠ 只查名字在不在会被 **import 行**接住（破坏验证抓到的）—— 查的是
   *   markup 那一段里**真的在遍历它**。
   */
  const markup = code.slice(code.indexOf("\n---", code.indexOf("blocks: [")));
  assert.ok(
    markup.includes("RETIRED_PLATFORMS.map("),
    "页面上没有停用平台那一块"
  );
  assert.ok(/modeWhy/.test(markup), "列了但没印原因");
});

test("C4 没核对过的参数要印在屏幕上", () => {
  // 一个猜出来的上限长得像已知事实，正是 docs/engineering-notes.md 第三节那个 SC 13D。
  assert.ok(/calibrated/.test(code), "页面没把「没核过」这件事画出来");
  assert.ok(/calibrationNote/.test(code), "画了但没说是哪几个数");
});

test("C5 两种「去发帖」措辞不许统一 —— 只有 X 能预填", () => {
  /**
   * X 有官方 intent 链接（点过去字已经在发帖框里），雪球 / 富途点过去
   * 只是开站点。统一成「打开 X 发帖」那种话，就是许了一个它做不到的事。
   */
  assert.ok(code.includes("xIntentUrl("), "X 那条不走 intent 了");
  assert.ok(/粘进去/.test(code), "另两家没说明还得自己粘");
});

/* ── D 组：`urlOnCard` 真的接上了封面卡（不接上就是个假开关）────────── */

test("D1 不印地址那一档：整块不画，也不占中文字形", () => {
  // 左下角那两行是**一对**：地址不画了，「报告全文：」也不该单独留着。
  const base = {
    kindLabel: "研究报告",
    title: "测一测",
    voices: [{ description: "一句话。" }],
    tags: ["财报"],
    date: "2026-09-23",
    fullTextLabel: "报告全文：",
  };
  const on = planXhsCard({ ...base, url: "https://lwj.ai/r/1002" });
  const off = planXhsCard({ ...base, url: undefined });

  assert.equal(on.url, "https://lwj.ai/r/1002");
  assert.equal(off.url, undefined);

  assert.ok(xhsCardText(on).includes("报告全文："), "印地址那档得取这几个字");
  assert.ok(
    !xhsCardText(off).includes("报告全文："),
    "不画了还在取字形 —— 多一次往返，而且缓存键对不上"
  );
});

test("D2 渲染那边真的读 plan.url —— 判据算好了不等于有人读它", () => {
  /**
   * 同 `xhsCard.test.ts` 的 B7：一条"判据只写一处"的纪律，没有东西钉着
   * 消费方真去读它，就只活在注释里。写死一个地址的话这张卡在小红书那档
   * 照样印网址，而四处全绿。
   */
  const card = readFileSync(join(ROOT, "src/utils/xhsCard.ts"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    ""
  );
  const hits = card.match(/plan\.url/g) ?? [];
  assert.ok(
    hits.length >= 3,
    `渲染里只有 ${hits.length} 处读 plan.url —— 左边那行、地址本身、两端对齐各要一处`
  );
});

test("D3 出图那一路真的按平台决定印不印", () => {
  // 这一格正是小红书那条细则针对的东西。接不上的话那个开关只是一行注释。
  const entry = readFileSync(join(ROOT, "src/dev/xhsEntry.ts"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    ""
  );
  assert.ok(
    /platform\.urlOnCard\s*\?/.test(entry),
    "cardSourceOf 没按 urlOnCard 分档 —— 那个开关没人读"
  );
  assert.ok(
    /platform: SocialPlatform = DEFAULT_PLATFORM/.test(entry),
    "默认平台写死了或者没有默认 —— 调用方漏传会静默退回某一档"
  );
});

test("D4 /_xhs 上「替你按发送」的入口跟着平台表走，不是写死关掉", () => {
  /**
   * 【2026-09-23】停用，「发小红书」按钮和批量队列一起收起来了。
   * ★ 判据必须是**平台表里那一行的 mode**：写成一个永远 false 的常量的话，
   *   那张表就成了一句没人读的注释，而重新开张那天没有任何一处会跟着变
   *   （docs/engineering-notes.md 第一节那个 `scan.length === 1` 的形态）。
   */
  const page = readFileSync(join(ROOT, "src/dev/xhs.astro"), "utf8");
  const head = page.slice(0, page.indexOf("\n---", 10)).replace(
    /\/\*[\s\S]*?\*\//g,
    ""
  );
  assert.ok(
    /findPlatform\(\s*["']xhs["']\s*\)/.test(head),
    "没去平台表里查那一行"
  );
  assert.ok(
    /canAutoPublish\s*=\s*\w+\?\.mode === ["']official["']/.test(head),
    "门控不是按 mode 判的 —— 写死的开关不会跟着平台表变"
  );

  // 三处入口都得跟着它：工具栏、勾选框、那个按钮。
  const markup = page.slice(page.indexOf("\n---", 10));
  for (const [what, re] of [
    ["批量工具栏", /canAutoPublish && \(\s*<div\s+data-xhs-bar/],
    ["勾选框", /canAutoPublish && \(\s*<label[^>]*>\s*<input\s+type="checkbox"/],
    ["发小红书按钮", /canAutoPublish && \(\s*<button[\s\S]{0,200}data-xhs-publish/],
  ] as const) {
    assert.ok(re.test(markup), `${what}没跟着门控 —— 它还会渲染出来`);
  }
});

test("D5 撤掉之后必须说一句为什么，并指出现在该去哪儿", () => {
  /**
   * 按钮静默消失的话，「不发小红书了」和「那个按钮坏了」字节级相同，
   * 而后者没有任何人会发现。光说"没了"也不行 —— 那是把人晾在半路上。
   */
  const page = readFileSync(join(ROOT, "src/dev/xhs.astro"), "utf8");
  const markup = page
    .slice(page.indexOf("\n---", 10))
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
  assert.ok(/data-xhs-retired/.test(markup), "撤掉了但页面上一个字都没说");
  assert.ok(/modeWhy/.test(markup), "说了没了，但没印为什么");
  assert.ok(/\/_share/.test(markup), "没告诉人现在该去哪儿出文案");
});

test("C6 社区那两家的落款用整串，不许抄 X 的产品名", () => {
  /**
   * `agentProductName()` 剪掉厂商和模型的理由是 **X 的 280 字预算**，
   * 雪球 / 富途根本没有那个约束。抄过去的代价是帖子上少了一维信息而四处全绿
   * —— 封面卡那边 2026-09-22 已经犯过一次。
   */
  const fn = code.slice(code.indexOf("const communityFor"));
  const body = fn.slice(0, fn.indexOf("const items"));
  assert.ok(body.includes("bylineOf("), "社区文案没用 bylineOf()");
  assert.ok(
    !body.includes("agentProductName("),
    "社区文案抄了 X 那个只剩产品名的落款"
  );
});
