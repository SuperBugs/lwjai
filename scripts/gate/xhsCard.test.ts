/**
 * 小红书封面图的测试。
 *
 * 画出来好不好看测不了（那要人眼）。能钉住的是**判据**和**接线**，
 * 而这个功能里真正会安静出错的正是后两者：
 *
 *   A 组 白名单 —— 卡上印的每一格必须是闸门扫过的字节（docs/gate.md 7.5），
 *        而且加一格新的必须**当场红**（不表态 = 豆腐块 / 漏扫）
 *   B 组 字号   —— 四档界值是从版面宽度算出来的，不是拍脑袋；改尺寸忘了改这里会红
 *   C 组 标的   —— 公司名印不印，用例全部来自 `src/data/symbols.json` 里**真实的行**
 *   D 组 主标题 —— 标题就是代码那一档（站上真有），摘要上位；没摘要时不许留空
 *   E 组 接线   —— 草稿不出图、画不出来不回落、路由注了、入口在菜单里
 *
 * ★ C / D 两组的用例**不是照着实现反推的**，是从站上真实的内容和标的表里抄的
 *   （docs/engineering-notes.md 第三节那条 `SC 13D`：照正则反推的用例只能证明正则等于它自己）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cardSymbolName,
  clipText,
  CONTENT_WIDTH,
  DESC_LINE_HEIGHT,
  descSizeFor,
  displayWidth,
  fullTextLabelFor,
  HOOK_AREA_BUDGET,
  HOOK_DESC_GAP,
  HOOK_LINE_HEIGHT,
  HOOK_SIZE_TIERS,
  moreVoicesLabel,
  planXhsCard,
  voiceBlockHeight,
  voiceDescSize,
  voiceNameSize,
  VOICE_FEW,
  VOICE_SIZES,
  xhsCardText,
  xhsTitleSize,
  XHS_DESC_LINES,
  XHS_DESC_MAX,
  XHS_HEIGHT,
  XHS_HOOK_LINES,
  XHS_HOOK_LINES_MULTI,
  XHS_SYMBOL_LIMIT,
  XHS_TAG_LIMIT,
  XHS_VOICE_GAP,
  XHS_VOICE_LIMIT,
  XHS_WIDTH,
  type XhsCardSource,
} from "../../src/utils/xhsCardPlan";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * 把注释剥掉再比 —— **这不是洁癖，是当场踩到的**。
 *
 * 【2026-09-22 写这组测试时】A2「端点不许把 `entry.data` 摊进来」和 E4「不许比 id
 * 字面量」两条一上来就红了，而代码里一处都没有：命中的是我在那两处写的**警告注释**
 * （「⚠ 不许改成 `...data`」「不是在这儿写死 `=== "qa"`」）。
 *
 * ★ 这是"源码字符串测试"最典型的假钉子：一条禁止某种写法的断言，会被**写着
 *   禁止它的那句注释**触发。反过来更糟 —— 真去写了那种代码的人，只要顺手把
 *   旁边那句注释删了，这条断言反而**从红变绿**。
 * ⚠ 只剥块注释和整行 `//` 注释：行尾注释留着，免得把 `https://` 这种也切掉。
 */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** 一份最小的、字段填满的输入。各组按需覆盖。 */
const base: XhsCardSource = {
  kindLabel: "研究报告",
  title: "授权模式还能撑多久",
  voices: [{ label: "Claude", description: "一句话摘要。" }],
  symbols: [{ code: "ORCL", name: "甲骨文", nameEn: "Oracle" }],
  tags: ["财报", "估值"],
  byline: "Anthropic Claude（Opus-5）",
  date: "2026-09-22",
  fullTextLabel: "报告全文：",
  url: "https://lwj.ai/r/1002",
};

/** 几份那一档的样子：同一个问题问了三个智能体。 */
const threeVoices: XhsCardSource = {
  ...base,
  title: "昨晚CPU暴涨是因为什么，是否可持续？",
  voices: [
    { label: "ChatGPT", description: "需求重估有依据，短线已抢跑。" },
    { label: "Claude", description: "产业逻辑成立，但估值不便宜。" },
    { label: "Spark", description: "别外推昨晚的斜率。" },
  ],
};

/* ── A 组：白名单 ─────────────────────────────────────────────────────── */

test("A1 卡的输入是一张白名单，不许开「把整条内容传进来」的口子", () => {
  const src = read("src/utils/xhsCardPlan.ts");
  const iface = /export interface XhsCardSource \{([\s\S]*?)\n\}/.exec(src)?.[1];
  assert.ok(iface, "找不到 XhsCardSource 的定义");

  // 图片里的字没有任何下游能再检查一遍（.md 还能被搜、被 diff，PNG 里的字不能），
  // 所以"顺手把整个 data 塞进去"在这条通道上比在导出口更贵。
  for (const banned of ["entry", "data", "body", "frontmatter"]) {
    assert.doesNotMatch(
      iface!,
      new RegExp(`^\\s*${banned}\\??:`, "m"),
      `XhsCardSource 里出现了 ${banned} —— 闸门不扫的字段会被画进一张图发到公开平台上`
    );
  }
});

test("A2 端点不许把 entry.data 摊进卡的输入", () => {
  const src = codeOnly(read("src/dev/xhsEntry.ts"));
  assert.doesNotMatch(
    src,
    /\.\.\.\s*(data|entry\.data|entry)\b/,
    "xhsEntry.ts 里有 `...data` —— 那是 docs/gate.md 7.5「前提二」记下来的形态"
  );
});

/**
 * ★ 这一条是 A 组的**钉子**：plan 多一格可见的中文字而忘了在 `xhsCardText()` 里
 *   表态，那一格在图上就是豆腐块，零报错、构建全绿、只有发出去才看得见（坑 6）。
 *   所以键集合钉死 —— 加一格必须回来重新想一遍。
 */
test("A3 plan 的每一格都在 xhsCardText() 里表过态（加一格必须红）", () => {
  const plan = planXhsCard(base);
  assert.deepEqual(
    Object.keys(plan).sort(),
    [
      "byline",
      "date",
      "descSize",
      "description",
      "fullTextLabel",
      "hook",
      // hookLines / hookSize / voiceSize 是**排版数字**，不是字 —— 刻意不进取字清单。
      "hookLines",
      "hookSize",
      "hookSource",
      "kindLabel",
      "moreSymbols",
      "moreVoices",
      "symbolSize",
      "symbols",
      "tags",
      // url 走 Google Sans Code（等宽），刻意**不**进中文取字清单 —— 见 A4。
      "url",
      "voiceNameFontSize",
      "voiceSize",
      "voices",
    ],
    "XhsCardPlan 的字段变了 —— 去 xhsCardText() 里表态：这一格要不要中文字形？\n" +
      "不表态的后果是那一格印出来是豆腐块，而其余部分完全正常。"
  );

  // 表过态的那几格，内容真的在取字清单里。
  const text = xhsCardText(plan).join("");
  for (const seg of [
    "研究报告",
    "甲骨文",
    "授权模式还能撑多久",
    "一句话摘要。",
    "#财报",
    "报告全文：",
    "Anthropic Claude（Opus-5）",
  ]) {
    assert.ok(text.includes(seg), `取字清单里漏了「${seg}」—— 它会印成豆腐块`);
  }
});

test("A4 等宽那一路不进取字清单（代码 / 日期 / 地址用仓库自带的字体）", () => {
  const text = xhsCardText(planXhsCard(base)).join("");
  assert.ok(
    !text.includes("2026-09-22"),
    "日期走 Google Sans Code，不该占中文子集"
  );
  // ⚠ 地址**逐条不同**：把它加进取字清单，每张卡的缓存键都不一样，
  //   于是每张卡都要多往 Google Fonts 跑一趟，而一个 ASCII 字形都用不上。
  assert.ok(
    !text.includes("https://lwj.ai/r/1002"),
    "落地页地址走 Google Sans Code，不该占中文子集（而且它逐条不同，会把缓存打散）"
  );
});

/* ── B 组：字号分档是算出来的 ─────────────────────────────────────────── */

/**
 * ★ 这条按**每一档能实际达到的行数**算，不是拿最大字号 × 最大行数硬乘。
 *   96px 那一档的界是 17 个全角宽，一行放得下 8.9 个 —— 它**不可能**排到 5 行。
 *   照着 96 × 5 去算会得出一个假的"顶穿"结论，然后有人来把字号调小，
 *   而真实的最坏情况根本不在那一档。
 *
 * ⚠ 顶穿了**不会报错**：satori 照常出图、退出码 0，只是字被卡片边缘切掉一截。
 */
test("B1 最坏情况下主标题 + 摘要放得进中间那块（顶穿了不报错，只是被切掉）", () => {
  /**
   * **一份**和**几份**是互斥的两种版面，各算各的 ——
   * 合成一个 `Math.max` 会得出一个不可能出现的组合（一段灰字摘要和四行
   * 「谁：概括」同时在场），然后有人来把字号调小，而真实的最坏情况不在那儿。
   */
  /** 几份那一档底下那几块的高度（份数 → 字号 → 每块多高，判据全在 plan 模块）。 */
  const voicesH = (count: number, hasHook: boolean) =>
    count * voiceBlockHeight(voiceDescSize(count, hasHook)) +
    (count - 1) * XHS_VOICE_GAP +
    (hasHook ? HOOK_DESC_GAP : 0);

  const MODES = [
    {
      name: "一份（主标题 + 摘要）",
      hookLines: XHS_HOOK_LINES,
      /** 摘要字号跟着主标题走，所以这一格在下面循环里按 tier 现算。 */
      bodyH: null as number | null,
    },
    // ★ 几份那一档**按份数逐个算**：字号是跟着份数变的（`voiceDescSize()`），
    //   拿一个固定字号乘上限会算出一个根本不会出现的组合。
    ...Array.from({ length: XHS_VOICE_LIMIT - 1 }, (_, i) => {
      const count = i + 2; // 几份那一档至少 2
      return {
        name: `${count} 份（主标题 + 每份两行）`,
        hookLines: XHS_HOOK_LINES_MULTI,
        bodyH: voicesH(count, true),
      };
    }),
  ];

  for (const mode of MODES) {
    for (const tier of HOOK_SIZE_TIERS) {
      const perLine = CONTENT_WIDTH / tier.size;
      // 有界的档：最多排到 ceil(界 / 每行) 行。兜底那档没有界，靠 lineClamp 收住。
      const natural = Number.isFinite(tier.maxWidth)
        ? Math.ceil(tier.maxWidth / perLine)
        : mode.hookLines;
      const lines = Math.min(natural, mode.hookLines);
      // 一份那一档的摘要字号是跟着这一档主标题算出来的（descSizeFor）。
      const bodyH =
        mode.bodyH ??
        descSizeFor(tier.size) * DESC_LINE_HEIGHT * XHS_DESC_LINES +
          HOOK_DESC_GAP;
      const total = tier.size * HOOK_LINE_HEIGHT * lines + bodyH;

      assert.ok(
        total <= HOOK_AREA_BUDGET,
        `${mode.name}：${tier.size}px 那一档最坏要 ${Math.round(total)}px，` +
          `超过了中间那块的 ${HOOK_AREA_BUDGET}px —— 卡片会被顶穿，而 satori 不会报错`
      );
    }
  }
});

test("B6 有界的那几档不该被 lineClamp 无谓地切掉", () => {
  // 那几档的内容本来就排得下，切掉等于凭空少字，而屏幕上只是多个省略号。
  // ⚠ 只管**一份**那一档：几份那一档的 3 行是刻意收紧的（给底下那几行让地方），
  //   在那儿被切是设计，不是 bug。
  for (const tier of HOOK_SIZE_TIERS) {
    if (!Number.isFinite(tier.maxWidth)) continue;
    const natural = Math.ceil(tier.maxWidth / (CONTENT_WIDTH / tier.size));
    assert.ok(
      natural <= XHS_HOOK_LINES,
      `${tier.size}px 那一档自然要 ${natural} 行，超过了 lineClamp 的 ${XHS_HOOK_LINES}`
    );
  }
});

test("B5 没有主标题那一档：那几行放大之后仍然放得进去", () => {
  // `hookSource: "none"`（几份 ＋ 标题冗余）时主标题整个不画，那几行用大一档的字号。
  // 这一档没有主标题占地方，所以单独算 —— 混进 B1 会得出一个不可能出现的组合。
  for (let count = 2; count <= XHS_VOICE_LIMIT; count++) {
    const h =
      count * voiceBlockHeight(voiceDescSize(count, false)) +
      (count - 1) * XHS_VOICE_GAP;
    assert.ok(
      h <= HOOK_AREA_BUDGET,
      `没有主标题 + ${count} 份最坏要 ${Math.round(h)}px，超过了 ${HOOK_AREA_BUDGET}px`
    );
  }

  // ★ 没有主标题时必须**放大**：否则卡上最大的元素没了，信息流里没人会停。
  //   （用户第四轮报的「有很多的空白」就是这一档没吃满空间。）
  for (const count of [VOICE_FEW, XHS_VOICE_LIMIT]) {
    assert.ok(
      voiceDescSize(count, false) > voiceDescSize(count, true),
      `${count} 份时，没有主标题那一档的摘要字号没有比有主标题时大`
    );
  }
});

test("B8 份数越多字号越小，而且摘要永远比名字大（主次不许反过来）", () => {
  for (const hasHook of [true, false]) {
    assert.ok(
      voiceDescSize(VOICE_FEW, hasHook) >
        voiceDescSize(VOICE_FEW + 1, hasHook),
      "份数多了字号没跟着降 —— 那就该顶穿了（B1 会红）"
    );
  }
  // ★【2026-09-22 第四轮，用户：「摘要也要明显」】名字是出处、摘要是内容，
  //   原来两者同号同色，主次是反的。这一条钉着别再反回去。
  for (const size of Object.values(VOICE_SIZES).flatMap(t => [t.few, t.many])) {
    assert.ok(
      voiceNameSize(size) < size,
      `摘要 ${size}px 而名字 ${voiceNameSize(size)}px —— 名字不该比摘要大或相等`
    );
  }
});

/**
 * 【2026-09-22 破坏测试查出来的漏洞，补的这一条】
 *
 * B1 算的是 **plan 里那几个常量**撑不撑得住版面。但渲染那边完全可以**无视 plan**
 * ——实测：把 `lineClamp: plan.hookLines` 改成写死的 `lineClamp: 5`，35 条全绿，
 * 而卡片在"几份"那一档会被顶穿（B1 算的是 3 行，画出来是 5 行）。
 *
 * ★ 也就是说：一个"判据只写一处"的纪律，如果没有任何东西钉着**消费方真的去读它**，
 *   那条纪律只活在注释里。这和 docs/engineering-notes.md 第一节那个 `scan.length === 1` 同形态。
 */
test("B7 渲染必须读 plan 里算好的那几个数，不许写死", () => {
  const src = codeOnly(read("src/utils/xhsCard.ts"));
  for (const [field, why] of [
    [
      "plan.hookLines",
      "几份那一档主标题要收到 3 行给底下让地方；写死 5 行会顶穿卡片，而 B1 照样绿",
    ],
    ["plan.voiceNameFontSize", "名字那一行的字号，写死就和摘要脱钩了"],
    [
      "plan.voiceSize",
      "没有主标题时那几行要放大一档；写死一个字号会让那一档的卡没有主视觉",
    ],
    ["plan.hookSize", "字号分档的结果，写死就等于四档全失效"],
    ["plan.descSize", "一份那档摘要的字号，跟着主标题走；写死就又变回一片白"],
    [
      "plan.symbolSize",
      "主标题让位那一档标的行要顶上去当主视觉；写死就没有主视觉了",
    ],
  ] as const) {
    assert.ok(
      src.includes(field),
      `xhsCard.ts 没读 ${field} —— ${why}。判据只许在 planXhsCard 里算一次。`
    );
  }
});

test("B4 有 lineClamp 的地方必须同时有 display: block（否则 clamp 是死的）", () => {
  // 【2026-09-22 实测】satori 里 lineClamp 在默认的 flex 容器上**一声不响地不生效**：
  // 写 lineClamp: 2 照样渲染 5 行。加 display: "block" 才截断并补省略号。
  // 两种写法渲染都成功、退出码都是 0 —— 差别只有顶穿卡片的那几行。
  const src = codeOnly(read("src/utils/xhsCard.ts"));
  const blocks = src.split("lineClamp");
  assert.equal(
    blocks.length - 1,
    5,
    "xhsCard.ts 里应该有五处 lineClamp（主标题、一份那档的摘要、" +
      "几份那档每一份的名字和摘要、页脚右边那行落款）"
  );
  for (let i = 1; i < blocks.length; i++) {
    // 同一个样式对象里（往前找到最近的 `{`）必须有 display: "block"。
    const styleObj = blocks[i - 1]!.slice(-400);
    assert.match(
      styleObj,
      /display:\s*"block"/,
      "有一处 lineClamp 旁边没有 display: \"block\" —— 那个 clamp 不生效，" +
        "而它不生效的症状是卡片被顶穿，零报错"
    );
  }
});

test("B2 拉丁标题不许被当成「很长」而白白缩小两档", () => {
  // 18 个拉丁字符只占 9 个汉字的宽。按码点分档会把它判到最小那一档，
  // 而它本来放得下大字 —— 零报错，只是封面小了两档。
  const latin = "Arm Holdings Q3";
  const cjk = "安谋控股第三季度财报解读要点";
  assert.ok(
    xhsTitleSize(latin) >= xhsTitleSize(cjk),
    "拉丁标题的字号不该比字数相近的中文标题小"
  );
  assert.ok(displayWidth("ABCD") < displayWidth("中文字符"));
});

/**
 * 【2026-09-22 这条是破坏测试逼出来的，原样记着】
 *
 * 第一版写的是「先截断再挑字号，顺序反了会把长标题判到最小档」，24 条全绿。
 * 然后按 docs/engineering-notes.md 坑 17 故意把顺序调反 —— **照样全绿**。
 *
 * 原因：`XHS_DESC_MAX` 是 88，截断后恒为 89 个码点，而 89 个码点**哪怕全是
 * 拉丁字母**（89 × 0.55 ≈ 49）也已经落在最小那一档（> 47）里。截断前更长、
 * 同样是最小档 —— 两种顺序挑出来的字号一模一样，那条断言**结构上不可能红**。
 *
 * 也就是说：那句注释描述了一个不存在的后果，那条测试钉的是另一件事
 * （和 docs/engineering-notes.md 第一节 `scan.length === 1` 那个形态一模一样）。
 *
 * ★ 所以这条改成钉**真正在撑着的那条余量**：截断后最窄的情况仍然落在最小档。
 *   余量只有 4 个字左右 —— `XHS_DESC_MAX` 调到 85 以下，拉丁长标题就会跨档，
 *   那时顺序才开始有后果，这条会红并叫人回来把用例换成真能区分顺序的。
 */
test("B3 截断上限落在最小那一档里 —— 顺序这件事今天没有后果（余量只有 4 个字）", () => {
  const plan = planXhsCard({ ...base, title: "很长的标题".repeat(40) });
  assert.equal(
    [...plan.hook].length,
    XHS_DESC_MAX + 1,
    "截断后应该是上限 + 一个省略号"
  );

  // 截断后**最窄**的那一种：全是拉丁字母（每个记 0.55）。
  const narrowest = "a".repeat(XHS_DESC_MAX) + "…";
  assert.equal(
    xhsTitleSize(narrowest),
    xhsTitleSize("很长的标题".repeat(40)),
    "截断后的串跨到了更大的字号档 —— 从这一刻起「先截断还是先挑字号」有区别了，\n" +
      "planXhsCard 里那个顺序开始承重，而这条用例区分不出它。回去把用例换成\n" +
      "真的能区分顺序的（拿一条截断前后跨档的标题，分别断言两种顺序的结果）。"
  );
});

/* ── C 组：公司名印不印（用例来自真实的标的表） ───────────────────────── */

test("C1 名字就是代码 → 不印（站上 ARM 这一行两格填的都是 Arm）", () => {
  // src/data/symbols.json 里真实的一行。印出来会是 `$ARM Arm`，一个字新信息都没有。
  assert.equal(cardSymbolName({ code: "ARM", name: "Arm", nameEn: "Arm" }), undefined);
  // 正解在内容那一侧：把公司全名填上，卡上立刻就有名字。
  assert.equal(
    cardSymbolName({ code: "ARM", name: "安谋控股", nameEn: "Arm Holdings" }),
    "安谋控股"
  );
});

test("C2 中英同名 → 只留一个（ZM 两格填的都是 Zoom，是常态不是手滑）", () => {
  assert.equal(cardSymbolName({ code: "ZM", name: "Zoom", nameEn: "Zoom" }), "Zoom");
});

test("C3 中文名优先，空了才退到英文名（CRWV 只有一个名字）", () => {
  assert.equal(
    cardSymbolName({ code: "ORCL", name: "甲骨文", nameEn: "Oracle" }),
    "甲骨文"
  );
  assert.equal(
    cardSymbolName({ code: "QCOM", nameEn: "Qualcomm Incorporated" }),
    "Qualcomm Incorporated"
  );
  // 表里查不到那一行时只有代码 —— 不编一个名字出来。
  assert.equal(cardSymbolName({ code: "TSLA" }), undefined);
});

test("C4 一只票带名字，两只以上只印代码", () => {
  const one = planXhsCard({ ...base, symbols: [{ code: "NOK", name: "诺基亚" }] });
  assert.equal(one.symbols[0]!.name, "诺基亚");

  // 问答那一格是多选（「CPU 为什么暴涨」同时讲 ARM / INTC / AMD）。
  const many = planXhsCard({
    ...base,
    symbols: [
      { code: "ARM", name: "安谋" },
      { code: "INTC", name: "英特尔" },
      { code: "AMD", name: "超微" },
    ],
  });
  assert.deepEqual(
    many.symbols.map(s => s.name),
    [undefined, undefined, undefined],
    "两只以上不该印公司名 —— 那一行会被挤爆"
  );
});

test("C5 放不下的那几只印成 +N，不许静默丢掉", () => {
  const five = planXhsCard({
    ...base,
    symbols: ["ARM", "INTC", "AMD", "NVDA", "QCOM"].map(code => ({ code })),
  });
  assert.equal(five.symbols.length, XHS_SYMBOL_LIMIT);
  assert.equal(five.moreSymbols, 5 - XHS_SYMBOL_LIMIT);
  // 全放得下时不画那个 +N（0 不是"有 0 只放不下"，是"没有这回事"）。
  assert.equal(planXhsCard(base).moreSymbols, 0);
  assert.ok(xhsCardText(five).includes(`+${5 - XHS_SYMBOL_LIMIT}`));
});

/* ── D 组：主标题那一格 ───────────────────────────────────────────────── */

test("D1 标题就是代码 → 摘要上位（站上真有 title: ZM 的研究报告）", () => {
  // src/content/posts/1008.md 的真实形状：标题是票代码，摘要才是内容。
  const plan = planXhsCard({
    ...base,
    title: "ZM",
    voices: [{ label: "Spark", description: "当前处于动能衰减与短线破位阶段。" }],
    symbols: [{ code: "ZM", name: "Zoom", nameEn: "Zoom" }],
  });
  assert.equal(plan.hookSource, "description");
  assert.equal(plan.hook, "当前处于动能衰减与短线破位阶段。");
  assert.equal(plan.description, "", "摘要当了主角就不在底下再印一遍");
});

test("D2 标题和印出来的公司名重复时也算冗余", () => {
  const plan = planXhsCard({
    ...base,
    title: "甲骨文",
    symbols: [{ code: "ORCL", name: "甲骨文", nameEn: "Oracle" }],
  });
  assert.equal(plan.hookSource, "description");
});

test("D3 标题冗余但没摘要 → 仍然印标题（空的主标题格最糟）", () => {
  const plan = planXhsCard({
    ...base,
    title: "ZM",
    voices: [{ label: "Spark", description: "" }],
    symbols: [{ code: "ZM", name: "Zoom" }],
  });
  assert.equal(plan.hookSource, "title");
  assert.equal(plan.hook, "ZM");
});

test("D4 正常标题不受影响", () => {
  const plan = planXhsCard(base);
  assert.equal(plan.hookSource, "title");
  assert.equal(plan.hook, "授权模式还能撑多久");
  assert.equal(plan.description, "一句话摘要。");
});

test("D5 截断补省略号，并且抹掉末尾那个孤零零的标点", () => {
  assert.equal(clipText("短", 10), "短", "够短就原样返回，不补省略号");
  assert.equal(clipText("一二三，四五", 4), "一二三…");
  assert.equal(clipText("一二三四五", 3), "一二三…");
});

test("D6 标签最多几个", () => {
  const plan = planXhsCard({
    ...base,
    tags: ["财报", "估值", "个股研究", "期权", "宏观"],
  });
  assert.equal(plan.tags.length, XHS_TAG_LIMIT);
  // ⚠ 这个数刻意和 sharePost 的 SHARE_TAG_LIMIT 不一样（那个是 280 字的预算，
  //   这个是"一行放得下几个"）。合成一个常量才是错的。
  assert.notEqual(
    XHS_TAG_LIMIT,
    0,
    "标签上限不能是 0 —— 那等于这一行永远不画"
  );
});

/* ── G 组：左下角那两行（2026-09-22 用户要的） ────────────────────────── */

/**
 * 用户的原话是「左下角的牢玩家和域名改为**报告全文**和文章网址」。
 *
 * ⚠「报告」这个词**只对研究报告成立**。照字面把「报告全文：」套到四个集合上，
 *   问答卡上就是把一条回答叫成了报告、教程卡上更不对 —— 而那是**零报错**的，
 *   图照出、测试照绿，只有读到那张卡的人会觉得哪里不对。
 *   所以按集合分词（同 `sharePost.ts` 的 `KIND_WORDS`），研究报告那一档
 *   **就是用户写的那四个字**。
 */
test("G1 左下角那行按集合分词 —— 问答卡上不许出现「报告」", () => {
  assert.equal(fullTextLabelFor("posts"), "报告全文：");
  assert.equal(fullTextLabelFor("qa"), "回答全文：");
  assert.equal(fullTextLabelFor("guides"), "教程全文：");
  assert.equal(fullTextLabelFor("prompts"), "提示词全文：");

  // 这一条是上面那段 ⚠ 的钉子：照字面套的那版会在这里红。
  for (const c of ["qa", "guides", "prompts"]) {
    assert.ok(
      !fullTextLabelFor(c).includes("报告"),
      `${c} 的那一行说了「报告」—— 那是把这一篇叫成了另一种东西`
    );
  }
});

test("G2 表外的集合回落到「全文：」—— 这一档是安全的，不是在猜", () => {
  // 「全文」对任何一种内容都成立（sharePost 全站就用这一个词），所以回落
  // 不会说出任何一句假话。⚠ 别学 provenance 那种"不知道就得红"：
  // 那里回落是**替内容认领出身**，这里只是少了一个更贴切的词。
  assert.equal(fullTextLabelFor("somethingNew"), "全文：");
  assert.ok(fullTextLabelFor("somethingNew").trim() !== "", "不许回落成空串");
});

test("G3 地址进 plan 且原样不动（它不是自由文本，是拼出来的）", () => {
  const plan = planXhsCard(base);
  assert.equal(plan.url, "https://lwj.ai/r/1002");
  assert.equal(plan.fullTextLabel, "报告全文：");
  // ⚠ 站点是 trailingSlash: "never"，地址不许带末尾斜杠 —— 带了的话读者
  //   照着敲进去在 dev 里是 404（线上靠 Cloudflare 301 兜，但那是多一跳）。
  assert.ok(!plan.url.endsWith("/"), "落地页地址不该带末尾斜杠");
});

test("G4 端点用 entryUrl() 拼地址，不许从条目里读一个字段", () => {
  // 从条目里读就成了一个**闸门不扫的自由文本格**被画进图里发到公开平台上
  // （docs/gate.md 7.5 那条判据）。两头都是代码里的东西才不带新字节上公网。
  const src = codeOnly(read("src/dev/xhsEntry.ts"));
  assert.match(src, /entryUrl\(/, "xhsEntry.ts 没用 entryUrl() 拼落地页地址");
  assert.match(src, /fullTextLabelFor\(/, "左下角那行的词表没被读到");
});

/* ── F 组：几份折成一张卡（2026-09-22 用户要的） ──────────────────────── */

test("F1 几份：一行一个智能体，页脚那行落款**强制丢掉**", () => {
  const plan = planXhsCard(threeVoices);
  assert.deepEqual(
    plan.voices.map(v => v.label),
    ["ChatGPT", "Claude", "Spark"],
    "几份那一档要一行一个，顺序就是喂进来的顺序（foldQaGroups 排好的）"
  );
  assert.equal(plan.description, "", "内容在 voices 里，不再有那段灰字");
  // ★ 这一条是这组里最要紧的：名字已经在每一行上，页脚再印一个「某某（模型）」
  //   会被读成**整组都是它写的** —— 那正好是替另外两个智能体抹掉出处。
  assert.equal(
    plan.byline,
    undefined,
    `几份时传了 byline 也必须丢掉（传进来的是「${threeVoices.byline}」）`
  );
});

test("F2 只有一份：主标题 + 摘要 + 完整落款，不进 voices", () => {
  const plan = planXhsCard(base);
  assert.deepEqual(plan.voices, [], "一份走 description，不套一个名字行");
  assert.equal(plan.description, "一句话摘要。");
  assert.equal(
    plan.byline,
    "Anthropic Claude（Opus-5）",
    "一份时落款照印，带模型名"
  );
});

test("F3 几份 + 标题冗余 → 主标题整个不画，那几行用大一档的字号", () => {
  const plan = planXhsCard({
    ...threeVoices,
    title: "ARM",
    symbols: [{ code: "ARM", name: "Arm", nameEn: "Arm" }],
  });
  assert.equal(plan.hookSource, "none");
  assert.equal(plan.hook, "", "标题就是 $ARM 芯片里那个词，再印一遍是纯重复");
  // 三份、没有主标题 → VOICE_SIZES.solo.many
  assert.equal(plan.voiceSize, voiceDescSize(3, false));
  // 对照：有主标题时小一档。
  assert.equal(planXhsCard(threeVoices).voiceSize, voiceDescSize(3, true));
  assert.ok(
    plan.voiceSize > planXhsCard(threeVoices).voiceSize,
    "主标题让位了，那几行没跟着变大 —— 那一档就是一片白（用户第四轮报的）"
  );
});

test("F4 超过上限的那几份印成「还有 N 份」，不许静默丢掉", () => {
  const many = planXhsCard({
    ...threeVoices,
    voices: Array.from({ length: XHS_VOICE_LIMIT + 2 }, (_, i) => ({
      label: `A${i}`,
      description: "概括。",
    })),
  });
  assert.equal(many.voices.length, XHS_VOICE_LIMIT);
  assert.equal(many.moreVoices, 2);
  assert.ok(
    xhsCardText(many).includes(moreVoicesLabel(2)),
    "「还有 2 份」也要进取字清单，否则那一行是豆腐块"
  );
  // 全列得下时不画那一行（0 不是"有 0 份没列出来"，是"没有这回事"）。
  assert.equal(planXhsCard(threeVoices).moreVoices, 0);
});

test("F5 没有「谁写的」这一维的那一份不画名字行 —— 不许补一句「来源未标注」", () => {
  // 教程 / 提示词**压根没有 agent 这一格**（`provenance !== "by-agent"`），
  // 印「来源未标注」是在说"这里本该填而没填"。而 posts / qa 走到这儿永远有值
  // （查不到时 `agentDisplayName()` 会给出「来源未标注」那一档）——
  // 两件事不许在这一层合并（docs/engineering-notes.md 第二节）。
  const plan = planXhsCard({
    ...threeVoices,
    voices: [
      { label: "ChatGPT", description: "甲。" },
      { description: "乙。" },
    ],
  });
  assert.equal(plan.voices[1]!.label, undefined);
});

test("F6 两样都空的那一份剔掉，只空一样的留着", () => {
  // 有名字没摘要的那一份说的是"这个智能体也答了"，那是一条真信息。
  const kept = planXhsCard({
    ...threeVoices,
    voices: [
      { label: "ChatGPT", description: "甲。" },
      { label: "Claude", description: "   " },
    ],
  });
  assert.equal(kept.voices.length, 2);

  // 两样都空的那一份印出来是一整块空白，剔掉。
  const dropped = planXhsCard({
    ...threeVoices,
    voices: [
      { label: "ChatGPT", description: "甲。" },
      { label: "Claude", description: "乙。" },
      { description: "  " },
    ],
  });
  assert.equal(dropped.voices.length, 2);
});

test("F7 每一份的名字和摘要都进取字清单（漏了就只有那几块是豆腐块）", () => {
  const text = xhsCardText(planXhsCard(threeVoices)).join("");
  for (const seg of [
    "ChatGPT",
    "需求重估有依据，短线已抢跑。",
    "Spark",
    "别外推昨晚的斜率。",
  ]) {
    assert.ok(text.includes(seg), `取字清单里漏了「${seg}」—— 它会印成豆腐块`);
  }
});

/**
 * 【2026-09-22 第四轮，用户要的】「应该是要把回答的模型写上去的」。
 *
 * ⚠ 在它之前，每一份的名字用的是 `agentProductName()`（只剩 `ChatGPT`）——
 *   那是从 `sharePost.ts` 抄来的，而那边剪掉厂商和模型的理由是
 *   **X 的 280 字预算**，这张卡上根本没有那个约束。
 *   ★ 照抄一个**不适用的取舍**，代价就是这张卡少了一维信息而四处全绿。
 */
test("F9 每一份的名字带模型，和站上那张芯片同一个判据", () => {
  const src = codeOnly(read("src/dev/xhsEntry.ts"));
  assert.match(
    src,
    /label:\s*bylineOf\(/,
    "每一份的名字没走 bylineOf() —— 它是「智能体（模型）」那两维三档的唯一判据，" +
      "另拼一份就会和站上那张 AgentModelChip、和页脚落款说出不同的话"
  );
  assert.doesNotMatch(
    src,
    /agentProductName/,
    "又用回只剩产品名的短名了 —— 那条取舍是 X 的 280 字预算逼的，这张卡上不适用"
  );
});

test("F8 渲染画的字和取字清单取的字是同一批", () => {
  const card = codeOnly(read("src/utils/xhsCard.ts"));
  // 名字和摘要都是**原样**画出去的（`v.label` / `v.description`），中间没有任何
  // 拼接，所以不存在"取的和画的不是同一串"那种豆腐块。唯一拼过的是「还有 N 份」，
  // 它由 `moreVoicesLabel()` 一处给，渲染和取字清单都读它。
  assert.match(
    card,
    /moreVoicesLabel\(/,
    "xhsCard.ts 没调 moreVoicesLabel —— 它自己拼了一份「还有 N 份」，" +
      "而取字清单取的是另一份：屏幕上那一行会变成豆腐块，其余一切正常"
  );
  assert.match(card, /v\.label/, "渲染没画名字那一行");
});

/* ── E 组：接线（少哪一处都是零症状的） ──────────────────────────────── */

test("E1 草稿不出图 —— 端点和页面都必须走 getSortedPosts", () => {
  // docs/gate.md 7.5「前提一」：闸门对草稿网开一面（block 档也退出码 0）的**全部依据**
  // 就是"草稿不生成页面"。少这一句，草稿就变成一张能发到公开平台的图。
  for (const f of ["src/dev/xhsEntry.ts", "src/dev/xhs.astro"]) {
    assert.match(
      read(f),
      /getSortedPosts\(/,
      `${f} 没走 getSortedPosts —— 草稿会出图，而草稿没有公开地址`
    );
  }
});

test("E2 画不出来**不许**回落到默认图", () => {
  const src = read("src/dev/xhs-card.ts");
  assert.doesNotMatch(
    src,
    /fallbackOgPng|ogImage/,
    "小红书封面回落到 default-og.jpg 就是给了一张「看起来能发」的图 —— " +
      "而这张卡自己就是全部内容，发出去收不回来。分享卡那边回落是对的，别抄过来。"
  );
  assert.match(src, /\b500\b/, "画不出来那一档要回 500，让页面画成红框");
});

test("E3 两条路由都注进 astro.config.ts 了", () => {
  const astro = read("astro.config.ts");
  for (const pattern of ["/_xhs", "/_xhs/card.png"]) {
    assert.ok(
      astro.includes(`pattern: "${pattern}"`),
      `astro.config.ts 里没有 injectRoute ${pattern}`
    );
  }
  // 只在 dev 里挂：devGate 整个集成只在 isDev 时进 integrations（同 /_share、/_tidy）。
  assert.match(astro, /isDev \? \[react\(\), keystatic\(\), devGate\]/);
});

test("E4 端点的落款读的是全站那两个判据，不是自己判一遍", () => {
  const src = codeOnly(read("src/dev/xhsEntry.ts"));
  assert.match(src, /modelSlot\(/, "模型那一格该画什么只有 modelSlot() 一个判据");
  assert.match(src, /findAgent\(/);
  // ⚠ 判的是登记表里的 kind / provenance，不是 id 字面量（docs/engineering-notes.md 第二节）。
  assert.doesNotMatch(
    src,
    /=== "human"|=== "posts" \|\| .*=== "qa"/,
    "别比 id / 集合名字面量 —— 加第五个集合时写死的那版会让它悄悄没有落款"
  );
  assert.match(src, /provenance !== "by-agent"/);
});

test("E5 尺寸就是 3:4（小红书信息流里占竖向面积最大的那一档）", () => {
  assert.equal(XHS_WIDTH, 1080);
  assert.equal(XHS_HEIGHT, 1440);
  assert.equal(XHS_HEIGHT / XHS_WIDTH, 4 / 3);
  // 改尺寸就得回来重算字号分档（B 组会红），这一条只是把意图钉住。
  assert.ok(CONTENT_WIDTH > 0 && CONTENT_WIDTH < XHS_WIDTH);
});

test("E6 两张卡共用一套色值（改主题不许只改一处）", () => {
  assert.match(
    read("src/utils/xhsCard.ts"),
    /import \{[^}]*COLORS[^}]*\} from "\.\/ogCard"/,
    "小红书卡自己写了一套色值 —— 改了主题两种分享图会变成两个色调，四处全绿"
  );
});
