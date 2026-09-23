/**
 * 智能体 logo（`src/config/agentIcons.ts` ＋ `src/assets/agent-logos/` ＋ 后台那一格 ＋
 * 三个调用点 ＋ 后台预览）的测试。
 *
 * 【2026-09-23】logo 从自己画的几何符号换成了从网上下载的品牌标（LobeHub 那套，
 * 来源和版本写在 agentIcons.ts 文件头）。于是多了三件以前不存在的事要钉：
 *   - 表和目录**对得上**（登记了没文件 = 构建期抛；有文件没登记 = 死文件）；
 *   - 这些文件是**别人写的 SVG**，每一个都要过一遍安全扫描；
 *   - 单色 / 彩色两种画法**选对了** —— 选错的症状只在深色模式下出现。
 *
 * 分组：
 *   A 表和文件（对账、安全、tone ⇔ currentColor、下拉选项、地址表那一对）
 *   B 四档判据两两不同，待补那几档不许回落到某个品牌标
 *   C 登记表读这一格：认不出来的抛、空和哨兵折成同一档、整条链子对到具体那个 logo
 *   D 接线 —— 三个调用点真的画了它、判据只有一份、两种画法各走各的、CSS 转义
 *   E 后台预览的判据（`src/dev/iconPreviewPlan.ts`）
 *
 * ★ D 组是这份文件里最值钱的一组：没接上是**零症状**的 ——
 *   页面照常渲染、构建全绿、A / B / C 三组也全绿，只是站上那个 logo 没了。
 *   和 docs/engineering-notes.md 第一节那个 `scan.length === 1` 是同一个形态。
 *
 * ★ 用例是从「人真的会怎么改坏它」来的：
 *     - 嫌"还没挑"那个虚线圈难看，给它回落一个品牌标           → B6 红
 *     - 把人形塞进可挑的表里（"这样『我自己』也能挑了"）      → B7 红
 *     - 新下一个 logo 放进目录、忘了登记（或者反过来）          → A2 红
 *     - 下了一个 `-color` 文件、其实里面写的是 currentColor    → A4 红（深色下隐身）
 *     - 在 keystatic.config.ts 里手抄一份图标选项              → D2 红
 *     - 在 Card.astro 里自己 `findAgentIcon(...)` 判一次       → D3 红
 *     - "单色的也用 <img> 吧，统一一点"                        → D4 红
 *     - 在组件里手拼 `url('…')`                               → D7 红（2026-09-23 真踩过）
 *     - 两个智能体挑了同一个 logo                              → C4 红
 *     - 后台预览只看 data-key 认选项                           → E1 红
 *
 * ⚠ **测不到的那一半，照实写在这**：一个彩色 logo 里恰好有一块**白色字形**，浅色底上
 *   就只剩它的彩色部分 —— `kimi-color.svg` 的 K 就是白的（白底上只剩一个蓝点）。
 *   这种只能**两个主题各看一眼**，"文件里有 #fff"判不出来（`codex-color.svg` 也有 `#fff`，
 *   那是 app 图标的白底方块，是对的）。
 *
 * 跑：`pnpm test`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AGENT_ICONS,
  AGENT_ICON_IDS,
  AGENT_ICON_UNSET,
  AGENT_LOGO_DIR,
  HUMAN_ICON_PATHS,
  UNKNOWN_ICON_LETTER,
  agentIconOptions,
  agentIconSlot,
  cssUrl,
  findAgentIcon,
  logoMaskStyle,
} from "../../src/config/agentIcons";
import { parseRegistry, REGISTRY } from "../../src/config/registry";
import { AGENTS, AGENT_IDS, findAgent } from "../../src/config/agents";
import {
  LOGO_ATTR,
  PICKERS,
  pickerFor,
  previewStyleSheet,
} from "../../src/dev/iconPreviewPlan";

const read = (p: string) => readFileSync(p, "utf8");
/** 先剥注释再 grep（同 chips.test.ts）：注释里正写着那些名字，不剥的话接线那几条永远绿。 */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

const LOGO = "src/components/AgentLogo.astro";
const URLS = "src/utils/agentLogoUrls.ts";
const PREVIEW = "src/dev/keystaticIconPreview.ts";
/** 三个调用点。**这张名单是手写的** —— 加第四处时 D3 会因为它自己判了一次而红。 */
const CALLERS = [
  "src/components/AgentModelChip.astro",
  "src/components/Card.astro",
  "src/components/QaAnswerSwitch.astro",
];

const logoFile = (file: string) => join(process.cwd(), ...AGENT_LOGO_DIR.split("/"), file);
const svgOf = (id: string) => read(logoFile(findAgentIcon(id)!.file));

// ── A 表和文件 ────────────────────────────────────────────────────────

test("A1 logo id：唯一、合法、不撞两个哨兵", () => {
  const ids = AGENT_ICONS.map(i => i.id);
  assert.equal(new Set(ids).size, ids.length, `logo id 有重复：${ids.join(" / ")}`);
  for (const id of ids) {
    assert.match(id, /^[a-z][a-z0-9-]*$/, `logo id「${id}」不合法（小写 + 连字符）`);
    assert.notEqual(
      id,
      AGENT_ICON_UNSET,
      `有一行 logo 叫「${AGENT_ICON_UNSET}」—— 那是"还没挑"的哨兵值，` +
        `撞上之后「挑了这一个」和「还没挑」在登记表里字节级相同`
    );
    assert.notEqual(id, "human", "有一行 logo 叫 human —— 见 B7");
  }
  assert.deepEqual([...AGENT_ICON_IDS], ids, "AGENT_ICON_IDS 和表对不上");
});

/**
 * ★ 表和目录**双向**对账。
 *   少一个文件：站上那一格在构建期抛（agentLogoUrl），而这里先在 `pnpm test` 那一步红。
 *   多一个文件：一张没人用的图照样被发进 dist（glob 会把整个目录都带上），
 *   而且下一个人会以为它是"已经接好的"。
 *   两行指向同一个文件：后台下拉里两个名字、站上一张图 —— 挑哪个都一样，C4 那条防撞就被绕开了。
 */
test("A2 ★ 表 ⇔ 目录双向对账：一行一个文件，没有死文件", () => {
  const onDisk = readdirSync(join(process.cwd(), ...AGENT_LOGO_DIR.split("/")))
    .filter(f => f.endsWith(".svg"))
    .sort();
  const listed = AGENT_ICONS.map(i => i.file);
  assert.equal(
    new Set(listed).size,
    listed.length,
    `有两行指向了同一个文件：${listed.join(" / ")}`
  );
  assert.deepEqual(
    [...listed].sort(),
    onDisk,
    `表和 ${AGENT_LOGO_DIR} 对不上：\n` +
      `  登记了、目录里没有：${listed.filter(f => !onDisk.includes(f)).join(" / ") || "（无）"}\n` +
      `  目录里有、没登记：  ${onDisk.filter(f => !listed.includes(f)).join(" / ") || "（无）"}\n` +
      `加一个 logo 是两步：文件放进目录 ＋ 在 src/config/agentIcons.ts 里加一行。`
  );
  assert.ok(AGENT_ICONS.length >= 4, "logo 表太短了");
});

/**
 * ★ 这些是从网上下载的 SVG。站上走 `<img>` / CSS mask，那两种里的 SVG 本来就不执行脚本 ——
 *   但"画法本身挡着"不该是唯一一道防线：哪天有人把它改成内联（D4 钉着不许），
 *   或者这个文件被别处拿去 `set:html`，扫描是剩下的那一道。
 */
test("A3 ★ 每个 logo 文件都干净：没有脚本、事件、外链、实体", () => {
  const DANGER: [RegExp, string][] = [
    [/<script/i, "<script>"],
    [/\son[a-z]+\s*=/i, "事件属性（onload= 之类）"],
    [/<foreignObject/i, "<foreignObject>（能塞任意 HTML）"],
    [/<image\b/i, "<image>（会去取别的资源）"],
    [/\bhref\s*=/i, "href（链接 / 外部引用）"],
    [/url\(\s*(?!["']?#)/i, "url() 指向文档外面"],
    [/@import/i, "@import"],
    [/<!ENTITY|<!DOCTYPE/i, "DTD / 实体"],
    [/javascript:/i, "javascript: 地址"],
  ];
  for (const icon of AGENT_ICONS) {
    const svg = svgOf(icon.id);
    assert.match(svg.trim(), /^<svg[\s>][\s\S]*<\/svg>$/, `${icon.file} 不是一个完整的 <svg>`);
    assert.match(svg, /viewBox="0 0 24 24"/, `${icon.file} 没有 24×24 的 viewBox —— 缩放出来会变形`);
    for (const [re, what] of DANGER) {
      assert.ok(!re.test(svg), `${icon.file} 里有 ${what} —— 这是从网上拿来的文件，别直接放进来`);
    }
  }
});

/**
 * ★ `tone` 必须和文件**对得上**，两个方向都钉：
 *   - 文件写的是 `currentColor` 却标成 color → 走 `<img>`，没有"周围的字"可跟，
 *     落回黑色 —— **深色模式下隐身，浅色下一切正常**。改的人多半在浅色下看。
 *   - 文件是彩色的却标成 mono → 走 mask，只剩一个剪影，那个 logo 的颜色全没了，
 *     而用户要的就是彩色。
 */
test("A4 ★ tone ⇔ 文件里有没有 currentColor（选错 = 深色下隐身 / 彩色变剪影）", () => {
  for (const icon of AGENT_ICONS) {
    const usesCurrentColor = /currentColor/.test(svgOf(icon.id));
    assert.equal(
      icon.tone === "mono",
      usesCurrentColor,
      usesCurrentColor
        ? `${icon.file} 写的是 currentColor，却标成了 color —— 它会走 <img>，` +
            `深色模式下是一块看不见的黑（浅色下看不出来）。改成 tone: "mono"。`
        : `${icon.file} 是自带颜色的，却标成了 mono —— 它会走 mask，只剩一个剪影。` +
            `改成 tone: "color"。`
    );
  }
});

test("A5 后台下拉：表里每一个都在、名字不重样，单色的标着，哨兵排最后而且只有一个", () => {
  const opts = agentIconOptions();
  assert.equal(opts.length, AGENT_ICONS.length + 1, "下拉的项数和表对不上（哨兵算一项）");
  assert.equal(
    opts.at(-1)!.value,
    AGENT_ICON_UNSET,
    "「还没挑」没排在最后 —— 它不是挑不挑得中的问题，是这一格还没答"
  );
  assert.equal(opts.filter(o => o.value === AGENT_ICON_UNSET).length, 1, "哨兵出现了不止一次");
  const labels = opts.map(o => o.label);
  assert.equal(new Set(labels).size, labels.length, `下拉里有两项同名：${labels.join(" / ")}`);
  for (const icon of AGENT_ICONS) {
    const hit = opts.find(o => o.value === icon.id);
    assert.ok(hit, `${icon.id} 不在下拉里 —— 表里有、后台挑不到`);
    assert.ok(hit!.label.startsWith(icon.label), `${icon.id} 的下拉标签里没有它的名字`);
    assert.equal(
      /单色/.test(hit!.label),
      icon.tone === "mono",
      `${icon.id} 的「单色」标记和 tone 对不上 —— 挑的人会以为 logo 没加载出来`
    );
  }
});

test("A6 地址表：glob 的路径和 AGENT_LOGO_DIR 是一对，而且不内联", () => {
  // ⚠ 这里**不能**先 stripComments：glob 字符串里的 `/*.svg` 会被那个朴素的去注释函数
  //   当成块注释的开头，一路吃到下一个 `*/` —— 写这条用例时当场踩到（断言拿到 undefined）。
  //   所以直接从原文里把**那一次调用**整段抠出来，只在这一段里断言。
  const call = /import\.meta\.glob<string>\(([\s\S]*?)\);/.exec(read(URLS))?.[1];
  assert.ok(call, `${URLS} 里找不到 import.meta.glob<string>(…) 那一次调用`);
  const glob = /^\s*"([^"]+)"/.exec(call!)?.[1];
  assert.equal(
    glob,
    `/${AGENT_LOGO_DIR}/*.svg`,
    `${URLS} 的 glob 路径和 AGENT_LOGO_DIR 对不上 —— 挪了目录只改一处的话，` +
      `站上每一个 logo 都会在构建期抛（或者整个目录一张都 glob 不到）`
  );
  assert.equal(
    /query:\s*"([^"]*)"/.exec(call!)?.[1],
    "?url&no-inline",
    `${URLS} 的 query 不是 ?url&no-inline —— 少了 no-inline，Vite 会把 4 KB 以下的 logo ` +
      `内联成 data URI（2026-09-23 那个"纯色方块"就是从这条路来的）；换成 ?raw 则是要把 ` +
      `SVG 源码塞进页面（见 D4）`
  );
  assert.match(call!, /eager:\s*true/, `${URLS} 的 glob 不是 eager —— 拿到的是一堆 Promise，不是地址`);
});

// ── B 四档判据 ────────────────────────────────────────────────────────

const ai = (icon?: string) => ({ kind: "ai", name: "Google Spark", icon });

test("B1 挑了 logo = 完成态，画那个品牌标", () => {
  const slot = agentIconSlot(ai("gemini"));
  assert.equal(slot.tier, "picked");
  assert.equal(slot.tier === "picked" && slot.icon.id, "gemini");
});

test("B2 AI 产品还没挑 = 待补，画名字首字（大写、按码点取）", () => {
  assert.deepEqual(agentIconSlot(ai(undefined)), { tier: "pending", letter: "G" });
  // 后台那个 select 永远有值，人选「还没挑」时写出来的就是哨兵 —— 和没这个键同一档。
  assert.equal(agentIconSlot(ai(AGENT_ICON_UNSET)).tier, "pending");
  // 表里删了一行而登记表还在用它：parseRegistry 会先抛，这里是第二道。
  assert.equal(agentIconSlot(ai("no-such-logo")).tier, "pending");
  const cjk = agentIconSlot({ kind: "ai", name: "深度求索" });
  assert.equal(cjk.tier === "pending" && cjk.letter, "深", "中文名的首字取错了");
});

test("B3 「我自己」= 完成态，画人形（不是任何一个品牌标）", () => {
  assert.deepEqual(agentIconSlot({ kind: "human", name: "我自己" }), { tier: "human" });
  assert.ok(HUMAN_ICON_PATHS.length > 0, "人形一条路径都没有 —— 画出来是空的");
});

test("B4 没标 / 查不到 = 不知道这是谁，画问号", () => {
  for (const subject of [
    undefined,
    { kind: "unspecified", name: "未标注" },
    // 登记表里查不到那个 id 时调用方传的就是 undefined（findAgent 返回它）。
    findAgent("no-such-agent"),
  ]) {
    assert.deepEqual(
      agentIconSlot(subject),
      { tier: "unknown", letter: UNKNOWN_ICON_LETTER },
      JSON.stringify(subject)
    );
  }
});

test("B5 ★ 四档两两不同：「还没挑」和「不知道是谁」圈里的字不撞", () => {
  const tiers = [
    agentIconSlot(ai("gemini")),
    agentIconSlot({ kind: "human", name: "我自己" }),
    agentIconSlot(ai(undefined)),
    agentIconSlot(undefined),
  ];
  assert.equal(new Set(tiers.map(s => s.tier)).size, 4);
  const pending = agentIconSlot(ai(undefined));
  const unknown = agentIconSlot(undefined);
  assert.notEqual(
    pending.tier === "pending" && pending.letter,
    unknown.tier === "unknown" && unknown.letter,
    "「还没挑 logo」和「来源未标注」圈里印着同一个字 —— " +
      "后台新加一个智能体忘了挑 logo，它在站上就长得和「不知道是谁答的」一模一样"
  );
});

test("B6 ★ 待补那两档、以及人形那一档，都不许回落到某个品牌标", () => {
  for (const slot of [
    agentIconSlot(ai(undefined)),
    agentIconSlot(undefined),
    agentIconSlot({ kind: "human", name: "我自己" }),
  ]) {
    assert.ok(
      !("icon" in slot),
      `${slot.tier} 那一档带回了一个品牌标 —— 那是替这条内容认领了一个厂商，` +
        `屏幕上再也没有任何东西能说"这个还没配 / 这是人写的"`
    );
  }
});

test("B7 ★ 人形不在可挑的表里", () => {
  assert.equal(
    findAgentIcon("human"),
    undefined,
    "「human」进了可挑的 logo 表 —— 那样能给一个 AI 产品挑上人形，" +
      "于是一条模型写的内容顶着「这是人写的」那个记号，而四处全绿"
  );
  assert.ok(!agentIconOptions().some(o => o.value === "human"), "人形出现在后台下拉里了");
});

// ── C 登记表读这一格 ──────────────────────────────────────────────────

const base = () => ({
  agents: [{ id: "spark", name: "Google Spark", vendor: "Google" }],
  models: [{ id: "gpt-6-pro", name: "GPT-6-Pro", vendor: "OpenAI" }],
});
const withIcon = (icon: unknown) => ({
  ...base(),
  agents: [{ ...base().agents[0], icon }],
});

test("C1 认不出来的 logo id 必须抛，不许悄悄丢掉", () => {
  assert.throws(() => parseRegistry(withIcon("no-such-logo"), "p"), /不在内置图标表里/);
  // 2026-09-22 那一版的几何符号 id：登记表里还留着它们的话必须红，不许静默退回虚线圈。
  assert.throws(() => parseRegistry(withIcon("sparkle"), "p"), /不在内置图标表里/);
  assert.throws(() => parseRegistry(withIcon(42), "p"), /icon 不是字符串/);
});

test("C2 空 / 哨兵 / 没这个键 折成同一档（undefined = 还没挑）", () => {
  for (const v of ["", "   ", AGENT_ICON_UNSET]) {
    assert.equal(
      parseRegistry(withIcon(v), "p").agents[0]!.icon,
      undefined,
      `「${v}」没折成 undefined —— 同一件事在判据里只许有一种写法`
    );
  }
  assert.equal(parseRegistry(base(), "p").agents[0]!.icon, undefined);
  assert.equal(parseRegistry(withIcon("gemini"), "p").agents[0]!.icon, "gemini");
});

test("C3 模型那半张表没有这一格", () => {
  const r = parseRegistry(
    { agents: base().agents, models: [{ ...base().models[0], icon: "gemini" }] },
    "p"
  );
  assert.equal(
    r.models[0]!.icon,
    undefined,
    "模型拿到了自己的 logo —— 它永远挂在某个智能体的括号里，" +
      "画一个自己的记号就是在那一行里多一个没有主语的符号"
  );
});

test("C4 磁盘上那份：挑过的都合法、两个智能体不许挑同一个、整条链子对到具体那个 logo", () => {
  const onDisk = parseRegistry(JSON.parse(read("src/data/registry.json")));
  assert.deepEqual(onDisk, REGISTRY, "import 进来的和磁盘上那份对不上");

  const used = new Map<string, string[]>();
  for (const a of onDisk.agents) {
    if (!a.icon) continue; // 还没挑是合法的一档，不在这儿逼人补
    assert.ok(findAgentIcon(a.icon), `${a.id} 挑了表里没有的「${a.icon}」`);
    used.set(a.icon, [...(used.get(a.icon) ?? []), a.name]);
  }
  const clashes = [...used].filter(([, who]) => who.length > 1);
  assert.deepEqual(
    clashes,
    [],
    `这几个 logo 被不止一个智能体挑了：\n  ${clashes
      .map(([icon, who]) => `${icon} ← ${who.join(" / ")}`)
      .join("\n  ")}\n` +
      `logo 的全部用处就是一眼分得开谁是谁 —— 撞了之后列表里两条内容顶着同一个标，` +
      `而登记表、构建、闸门四处全绿。去后台「智能体与模型」页给其中一个换一个。`
  );

  /**
   * ★ 整条链子：`registry.json` → `registry.ts` → `agents.ts` → `agentIconSlot()`。
   *
   * ⚠ 2026-09-22 那一版这几行写的是「tier 是 picked **或** pending 就行」—— 那条**钉的是
   *   另一件事**：`agents.ts` 里少一句 `icon: a.icon`，站上每一条都退回虚线圈，而它照样绿
   *   （破坏验证当场抓到的）。所以必须**逐条对到具体那个 logo**。
   */
  for (const a of onDisk.agents) {
    const slot = agentIconSlot(findAgent(a.id));
    if (a.icon) {
      assert.equal(
        slot.tier === "picked" ? slot.icon.id : `（${slot.tier}）`,
        a.icon,
        `${a.id} 在登记表里挑的是「${a.icon}」，走到组件那头成了别的 —— ` +
          `多半是 agents.ts 没把 icon 从登记表递过来（症状：站上每一条都退回虚线圈，而别的测试全绿）`
      );
    } else {
      assert.equal(slot.tier, "pending", `${a.id} 没挑 logo，却没落进待补那一档`);
    }
  }
  // 两个哨兵**不从登记表来**，它们的画法由 kind 决定。
  assert.equal(agentIconSlot(findAgent("human")).tier, "human");
  assert.equal(agentIconSlot(findAgent("unspecified")).tier, "unknown");
  assert.ok(
    AGENTS.filter(a => a.kind !== "ai").every(a => a.icon === undefined),
    "哨兵身上挂了 icon —— 它们的画法是分档，不是一个可以挑的 logo"
  );
});

// ── D 接线 / 画法 ──────────────────────────────────────────────────────

test("D1 三个调用点都真的画了它", () => {
  for (const rel of CALLERS) {
    const src = stripComments(read(rel));
    assert.match(src, /<AgentLogo\b/, `${rel} 没画那个 logo —— 这一处会安静地退回纯文字`);
    assert.match(src, /from "\.\/AgentLogo\.astro"/, `${rel} 没 import AgentLogo`);
  }
  // 折叠卡那一处坐在一段文字里、自己传 class：必须是 inline-block，不能是 inline ——
  // 单色 logo 是个 span，inline 的 span 宽高不生效，那一格缩成零宽（OpenAI 的 logo 凭空消失）。
  const card = stripComments(read("src/components/Card.astro"));
  const cls = /<AgentLogo[\s\S]*?class="([^"]*)"/.exec(card)?.[1] ?? "";
  assert.ok(
    !/(^|\s)inline(\s|$)/.test(cls),
    `Card.astro 给 AgentLogo 传了 inline（「${cls}」）—— 单色 logo 在那一行里会缩成零宽`
  );
});

// ⚠ keystatic.config.ts **不能**先 stripComments：里面有十几处字符串带「斜杠星号」
//   （`import.meta.glob("./src/content/qa/*.md")` 那几条），朴素的去注释会从那里一口吃到
//   下一个「星号斜杠」—— 这两条原来就是那么写的，**碰巧**落在没被吃掉的地方才是绿的。
//   所以直接从原文里把那一段抠出来（D2）、或者按行首锚定（D9）。
//   （这段用行注释写、而且不写出那两个字符的原样：写进块注释里的话，它自己就把注释截断了。）
test("D2 后台那一格：选项来自同一张表，默认是「还没挑」", () => {
  const src = /icon: fields\.select\(\{([\s\S]*?)\}\),/.exec(read("keystatic.config.ts"))?.[1];
  assert.ok(src, "后台「智能体与模型」页没有「图标」那一格了（找不到 icon: fields.select({…})）");
  assert.match(
    src!,
    /options: agentIconOptions\(\)/,
    "后台那一格的选项不是 agentIconOptions() —— 手抄一份的那天，" +
      "后台能挑到一个表里已经没有的 logo，而登记表读不进来、整个后台打不开"
  );
  assert.match(
    src!,
    /defaultValue: AGENT_ICON_UNSET/,
    "后台那一格的默认值不是哨兵 —— 新加一个智能体会被默认挑上表里第一个 logo，" +
      "等于替它认领了一个厂商"
  );
});

test("D3 ★ 判据只有一份：调用点不许自己去查 logo 表", () => {
  assert.match(
    stripComments(read(LOGO)),
    /agentIconSlot\(/,
    `${LOGO} 没走 agentIconSlot —— 四档判据被搬到组件里了`
  );
  for (const rel of CALLERS) {
    const src = stripComments(read(rel));
    assert.ok(
      !/agentIconSlot|findAgentIcon|AGENT_ICONS|agentLogoUrl/.test(src),
      `${rel} 自己去查 logo 表了 —— 四档判据从此有两份，` +
        `改一份漏一份的症状是"这一页的 logo 和别处不一样"，而四处全绿`
    );
  }
});

/**
 * ★ 两种画法各走各的，而且**都不内联 SVG 源码**。
 *   - 彩色 → `<img>`；单色 → `bg-current` ＋ mask（走 `logoMaskStyle`）。
 *     单色也走 `<img>` 的后果是深色模式下隐身（A4 那条说的同一件事，这里钉的是消费方）。
 *   - 不许 `set:html` / `?raw`：渐变 id 会在同一页里重复（第一份落进隐藏元素时后面全部
 *     掉色），而且那是从网上拿来的文件 —— `<img>` 和 mask 里的 SVG 不执行脚本。
 */
test("D4 ★ 彩色走 <img>、单色走 mask，两种都不内联 SVG 源码", () => {
  const src = stripComments(read(LOGO));
  assert.match(src, /tone === "color"/, `${LOGO} 没按 tone 分画法`);
  assert.match(src, /<img\b/, `${LOGO} 里没有 <img> —— 彩色 logo 画不出来了`);
  assert.match(src, /bg-current/, `${LOGO} 的单色那一档没有 bg-current —— mask 底下没有颜色`);
  assert.match(src, /logoMaskStyle\(/, `${LOGO} 的单色那一档没走 logoMaskStyle()`);
  assert.ok(!/set:html/.test(src), `${LOGO} 用了 set:html —— 那是把网上拿来的 SVG 源码塞进页面`);
  assert.ok(!/\?raw/.test(src), `${LOGO} 用了 ?raw`);
});

/**
 * ⚠ 这条**只在那三个元素自己的开标签里查**，不在整个文件里 grep：
 *   组件文件头的注释里正写着 `alt=""` 和 `aria-hidden` —— 第一版在全文上 grep，
 *   把 `<img>` 上的 `alt=""` 删掉它照样绿（破坏验证当场抓到的）。注释替代码背了书。
 */
test("D5 logo 是装饰：alt 为空、aria-hidden 在，读屏不念第二遍名字", () => {
  // 模板是第二个 `---` 之后那一段（前面是 frontmatter）。
  const template = read(LOGO).split(/^---$/m).slice(2).join("---");
  const openTag = (tag: string) => new RegExp(`<${tag}\\b[^>]*>`).exec(template)?.[0];
  for (const tag of ["img", "span", "svg"]) {
    const el = openTag(tag);
    assert.ok(el, `${LOGO} 的模板里找不到 <${tag}>（三种画法之一没了？）`);
    assert.match(
      el!,
      /aria-hidden="true"/,
      `${LOGO} 的 <${tag}> 没有 aria-hidden —— 三个调用点旁边永远印着智能体的名字，` +
        `再念一遍是同一件事念两遍`
    );
  }
  assert.match(openTag("img")!, /\salt=""/, `${LOGO} 的 <img> 没有 alt="" —— 读屏会去念那个文件名`);
});

/**
 * ★【2026-09-23 实测踩到的那个】Vite 把小 SVG 内联成 data URI 时属性用**单引号**
 *   （`fill='currentColor'`）。写成 `url('…')` 的话 CSS 字符串在第一个 `'` 就断了，
 *   整条 `mask` 声明作废 —— 屏幕上 ChatGPT 那一格是一块灰色实心方块。
 *   这里拿那个真实形状的地址喂进去，看拼出来的是不是一个完整的 CSS 字符串。
 */
test("D6 ★ cssUrl / logoMaskStyle：地址里带单引号、双引号、反斜杠都拼不坏", () => {
  const viteDataUri =
    "data:image/svg+xml,%3csvg%20fill='currentColor'%20viewBox='0%200%2024%2024'%3e%3c/svg%3e";
  const nasty = `/a"b\\c\nd.svg`;
  for (const url of [viteDataUri, nasty, "/_astro/openai.Bx3Kq.svg"]) {
    const css = cssUrl(url);
    const m = /^url\("((?:[^"\\\n]|\\.)*)"\)$/.exec(css);
    assert.ok(m, `cssUrl 拼出来的不是一个完整的 url("…")：${css}`);
    // 反转义回去必须一字不差（换行在 CSS 里转义成 `\a `）。
    const back = m![1]!.replace(/\\a /g, "\n").replace(/\\(.)/g, "$1");
    assert.equal(back, url, "转义之后内容变了");
  }
  const style = logoMaskStyle(viteDataUri);
  assert.match(style, /-webkit-mask: url\("/, "少了 -webkit-mask（Safari 15.4 之前是一块纯色方块）");
  assert.match(style, /(^|; )mask: url\("/, "少了不带前缀的 mask");
  assert.match(style, /print-color-adjust: exact/, "少了 print-color-adjust（打印出来那一格是空的）");
  assert.ok(!/url\('/.test(style), "又用回单引号了");
});

test("D7 ★ 组件和后台预览都不许手拼 url(…)", () => {
  for (const rel of [LOGO, PREVIEW, "src/dev/iconPreviewPlan.ts"]) {
    assert.ok(
      !/url\(\s*['"`]?\$\{/.test(stripComments(read(rel))),
      `${rel} 里手拼了 url(\${…}) —— 走 cssUrl()，碰上带单引号的地址整条声明作废`
    );
  }
});

test("D8 地址表只有一份：glob 只在 agentLogoUrls.ts，站上和后台都 import 它", () => {
  const walk = (dir: string): string[] =>
    readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap(d =>
      d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]
    );
  const globbers = walk("src")
    .filter(f => /\.(ts|astro)$/.test(f))
    .filter(f => /import\.meta\.glob[^(]*\(\s*["']\/?src\/assets\/agent-logos/.test(read(f)));
  assert.deepEqual(
    globbers,
    [URLS],
    `logo 目录的 glob 不止一份：${globbers.join(" / ")} —— 挪了目录只改一处，另一处静默取不到图`
  );
  for (const rel of [LOGO, PREVIEW]) {
    assert.match(
      stripComments(read(rel)),
      /import \{ agentLogoUrl \} from "[^"]*utils\/agentLogoUrls"/,
      `${rel} 没从 agentLogoUrls 拿地址`
    );
  }
});

test("D9 后台预览挂上了（keystatic.config.ts 里 import 并调用）", () => {
  // 行首锚定：注释行以 `//` / ` *` 开头，碰不上这两条（理由见 D2 上面那段）。
  const src = read("keystatic.config.ts");
  assert.match(
    src,
    /^import \{ mountIconPreview \} from "\.\/src\/dev\/keystaticIconPreview";$/m,
    "keystatic.config.ts 没 import mountIconPreview"
  );
  assert.match(src, /^mountIconPreview\(\);$/m, "import 了但没调用 —— 后台里一张 logo 都不画，零报错");
});

test("D10 后台预览的 I/O：只贴 data-*、不碰 style、轮询、靠 aria-controls 找列表", () => {
  const src = stripComments(read(PREVIEW));
  assert.match(src, /setInterval\(/, "不是轮询了 —— react-aria 改值不发事件，监听的那天整个预览安静地不工作");
  assert.match(src, /aria-controls/, "不靠 aria-controls 找展开的列表了 —— 会认错成别的下拉");
  assert.match(src, /pickerFor\(/, "认下拉的判据不走 iconPreviewPlan 了");
  assert.ok(!/\.style\./.test(src), "动了元素的 style —— React 在写那个 button 的 style，下一次渲染就被写回去");
  assert.ok(!/appendChild|insertBefore|\.before\(|\.after\(|\.prepend\(/.test(src.replace(/document\.head\.append/g, "")),
    "往 React 管的 DOM 里插节点了（只许往 <head> 挂那张样式表）");
});

// ── E 后台预览的判据（src/dev/iconPreviewPlan.ts）─────────────────────

test("E1 ★ 认下拉按选项集合**正好相等**，子集不算（智能体下拉里也有 claude / codex）", () => {
  const icon = PICKERS.find(k => k.name === "icon")!;
  const agent = PICKERS.find(k => k.name === "agent")!;
  assert.equal(pickerFor([...icon.values]), icon);
  assert.equal(pickerFor([...AGENT_IDS]), agent);
  assert.equal(pickerFor(["claude", "codex"]), undefined, "两个同名 key 的子集被认成了某一种");
  assert.equal(pickerFor([...icon.values, "extra"]), undefined, "多一项也被认出来了");
  assert.equal(pickerFor([]), undefined);
  // ★ 两个集合**有交集**（claude / codex 同名）—— 这正是"只看 key"会串的原因。
  //   钉住这件事本身，免得哪天有人读到"不相交"就把判据放宽成看 key。
  assert.ok(
    [...icon.values].some(v => agent.values.has(v)),
    "两张表不再有同名 id 了 —— 那这条用例的前提变了，回来看一眼 E1 还在防什么"
  );
  assert.notDeepEqual([...icon.values].sort(), [...agent.values].sort(), "两种下拉的选项集合一模一样了");
});

test("E2 智能体下拉那一种：画的就是站上那一格的 logo，哨兵和没挑的不画", () => {
  const agent = PICKERS.find(k => k.name === "agent")!;
  for (const a of AGENTS) {
    const slot = agentIconSlot(a);
    assert.equal(
      agent.logoFor(a.id),
      slot.tier === "picked" ? slot.icon.id : undefined,
      `${a.id}：后台预览和站上那一格给了两个答案 —— 判据被抄了第二份`
    );
  }
  assert.equal(agent.logoFor("human"), undefined);
  assert.equal(agent.logoFor("unspecified"), undefined);
  const icon = PICKERS.find(k => k.name === "icon")!;
  assert.equal(icon.logoFor(AGENT_ICON_UNSET), undefined, "「还没挑」那一项画了个 logo");
  assert.equal(icon.logoFor("gemini"), "gemini");
});

test("E3 样式表：每个 logo 一条，彩色是背景图、单色是 mask＋currentColor，地址都走 cssUrl", () => {
  const css = previewStyleSheet(id => `/probe/${id}.svg`);
  for (const icon of AGENT_ICONS) {
    const rule = new RegExp(`\\[${LOGO_ATTR}="${icon.id}"\\]::before \\{([^}]*)\\}`).exec(css)?.[1];
    assert.ok(rule, `样式表里没有 ${icon.id} 那一条`);
    assert.ok(rule!.includes(cssUrl(`/probe/${icon.id}.svg`)), `${icon.id} 的地址没走 cssUrl`);
    if (icon.tone === "color") {
      assert.match(rule!, /background-image:/, `${icon.id} 是彩色的，却没画成背景图`);
    } else {
      assert.match(rule!, /background-color: currentColor/, `${icon.id} 是单色的，没跟 currentColor`);
      assert.match(rule!, /-webkit-mask:[^;]*; mask:/, `${icon.id} 少了 mask（或者少了 -webkit- 那一份）`);
    }
  }
  // 列表里那一格放进 Keystar 自己留的 icon 区，不许画在文字 span 的伪元素上。
  assert.match(css, /\[data-lwj-logo-at="option"\]::before \{[^}]*grid-area: icon/);
});
