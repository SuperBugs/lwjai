/**
 * 后台**填表那件事**的两颗钉子（`src/dev/keystaticHelp.ts` ·
 * `src/dev/keystaticFormLayout.ts`）。两条都是【2026-09-21 用户提的】：
 *
 *   ① 「我 tab 换行会在问号 hover 触发，没法直接到下一个输入框」——
 *      说明角标带着 `tabindex="0"`，于是 Tab 序列成了
 *      **角标 → 输入框 → 角标 → 输入框**，一页 15 个角标就是多按 15 次。
 *   ② 「地址应该放后面」—— 那一格是 `fields.slug` 的另一半，
 *      schema 的 key 顺序挪不动它，只能在浏览器里用 CSS `order` 挪。
 *
 * ## 这两条为什么非得有测试
 *
 * 都是**零症状**的回退：
 *   - 谁哪天"顺手"给角标补回一个 `tabindex`（看着很像无障碍的好事），
 *     后台照常渲染、控制台干干净净，只有真去按 Tab 的人撞得到；
 *   - 版面判据放宽一条（比如不再核对"竖排正好两格"），认错结构时就会去动
 *     一棵不该动的树 —— 而它设的是 `display: contents`，**盒子会消失**。
 *     地址那一格是公开地址，悄悄不见没有任何人会发现。
 *
 * ## 第一组怎么测：跑真的 `collapse()`，不比源码字符串
 *
 * 这个仓库里没有 jsdom（也不打算为一个本机后台加一个），所以用一个**记账用的
 * 假元素**：把 `setAttribute` 收进一个 Map，然后核对这一堆属性里**没有 tabindex**。
 * 跑的是浏览器里真正会跑的那个函数，不是 `src.includes("tabindex")` ——
 * 后者钉的是"源码里没出现过这个词"，和"角标能不能被 Tab 到"是两件事
 * （docs/engineering-notes.md 里 `SC 13D` 那个形态）。
 *
 * ⚠ 因此这一组必须同时断言「角标**确实画出来了**」：不然哪天 `collapse()`
 *   第一行就 return，属性一个都没设，"没有 tabindex" 照样绿。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collapse } from "../../src/dev/keystaticHelp";
import {
  slugSlotVerdict,
  type SlugSlotShape,
} from "../../src/dev/keystaticFormLayout";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * 先把注释去掉再对账。
 * ⚠ 这一步不是讲究：**注释掉的那一行照样 `includes` 得到** ——
 *   `// import "./src/dev/keystaticFormLayout";` 会让接线那条测试继续绿，
 *   而后台里这份脚本一次都不会加载。和 publish.test.ts 那几条同一个做法。
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

// ── A. 角标不许进 Tab 序列 ──────────────────────────────────────────────

/** 一个够 `collapse()` 用的假元素：只记账，不渲染。 */
interface FakeEl {
  tagName: string;
  textContent: string;
  /** 被 setAttribute 设过的东西，属性名**原样**收着（大小写不动）。 */
  attrs: Map<string, string>;
  parentElement: FakeEl | null;
  children: FakeEl[];
  classList: { contains: (c: string) => boolean };
  hasAttribute: (name: string) => boolean;
  setAttribute: (name: string, value: string) => void;
  /** `collapse()` 用它判"这东西本来看不见吗"，给一个非空数组＝看得见。 */
  getClientRects: () => unknown[];
  /** `collapse()` 用它判"这是不是一个 tooltip"。默认谁都不是。 */
  closest: (selector: string) => unknown;
}

function fake(
  tagName: string,
  opts: {
    text?: string;
    classes?: string[];
    visible?: boolean;
    /** 这一格在一个 `role="tooltip"` 里面（Keystar 的悬停提示就是这样）。 */
    inTooltip?: boolean;
  } = {}
): FakeEl {
  const attrs = new Map<string, string>();
  const classes = new Set(opts.classes ?? []);
  const el: FakeEl = {
    tagName,
    textContent: opts.text ?? "",
    attrs,
    parentElement: null,
    children: [],
    classList: { contains: c => classes.has(c) },
    hasAttribute: name => attrs.has(name),
    setAttribute: (name, value) => void attrs.set(name, value),
    getClientRects: () => (opts.visible === false ? [] : [{}]),
    closest: selector =>
      opts.inTooltip === true && selector.includes("tooltip") ? {} : null,
  };
  return el;
}

/**
 * 后台里一格常规字段真正的样子（实测 2026-09-21，研究稿新建页）：
 * 一个横排容器里依次是 `<label>标题</label>`、说明那个 `<span>`、输入框的壳。
 */
function field(description: string) {
  const label = fake("LABEL", { text: "标题", classes: ["kui:Text"] });
  const desc = fake("SPAN", { text: description, classes: ["kui:Text"] });
  const control = fake("DIV");
  const head = fake("DIV");
  head.children = [label, desc, control];
  for (const child of head.children) child.parentElement = head;
  return { head, label, desc };
}

/** 说明里真的会出现的两种写法 —— 抄自 keystatic.config.ts 里的原句。 */
const WARN_TEXT =
  "★ 默认是**登记表里排第一的那个智能体**（要换默认就去左侧「智能体与模型」页把那一行拖到最前）。";
const TIP_TEXT = "展示用。不知道就留空，不编。";

/**
 * 【2026-09-21 用户报的显示 bug】后台每一个悬停提示都变成了一个灰色小方块。
 *
 * 根因是我们自己：Keystar 的 `TooltipTrigger` 把 tooltip 的 id 挂在触发按钮的
 * **`aria-describedby`** 上 —— 和字段说明用的是同一个语义钩子。于是 `fromAria()`
 * 把弹出来的 tooltip 也当成说明收了，套上 15×15 + `font-size: 0` 的角标样式：
 * 字还在 DOM 里，只是被压成了 0 号字。顶上那排图标和正文编辑器那排全中招。
 *
 * ⚠ 已有的那条"本来就看不见的不收"（`getClientRects().length === 0`）挡不住它：
 *   tooltip 弹出来的那一刻是**看得见**的。
 */
test("★ tooltip 不许被收成角标：collapse() 对它一个属性都不设", () => {
  const tip = fake("SPAN", {
    text: "Delete entry…",
    classes: ["kui:Text"],
    inTooltip: true,
  });
  const head = fake("DIV");
  head.children = [tip];
  tip.parentElement = head;

  collapse(tip as unknown as HTMLElement);

  assert.deepEqual(
    [...tip.attrs.keys()],
    [],
    "tooltip 被收成角标了 —— 屏幕上就是那个 15×15 的灰方块"
  );
  assert.deepEqual(
    [...head.attrs.keys()],
    [],
    "连它外面那一层都被改了（`data-lwj-help-head`）"
  );

  // ★ 反面：同样形状、只是不在 tooltip 里的说明**必须照收**。
  //   少了这一条，哪天 collapse() 第一行就 return，上面两句照样绿。
  const { desc } = field(TIP_TEXT);
  collapse(desc as unknown as HTMLElement);
  assert.ok(
    desc.attrs.size > 0,
    "正常的字段说明没被收 —— 这条用例证明不了任何事"
  );
});

test("角标不许进 Tab 序列：collapse() 设出去的属性里没有 tabindex", () => {
  for (const text of [WARN_TEXT, TIP_TEXT]) {
    const { desc } = field(text);
    collapse(desc as unknown as HTMLElement);

    const names = [...desc.attrs.keys()];

    // ★ 先证明它真的干活了 —— 否则下面那条"没有 tabindex"是白绿的。
    assert.ok(
      names.some(n => n.startsWith("data-lwj-")),
      `collapse() 一个角标属性都没设，这条用例证明不了任何事：${names.join(",")}`
    );

    // 正题：一个 tabindex 都不许有。写法两种都查（HTML 属性名大小写不敏感，
    // 而 React/TS 那边习惯写成 tabIndex —— 两种都能让它进 Tab 序列）。
    const tabbish = names.filter(n => n.toLowerCase() === "tabindex");
    assert.deepEqual(
      tabbish,
      [],
      `角标又进 Tab 序列了：${tabbish.join(",")}=${tabbish
        .map(n => desc.attrs.get(n))
        .join(",")}。` +
        `Tab 会变成「角标 → 输入框 → 角标 → 输入框」，见 keystaticHelp.ts 文件头。`
    );
  }
});

test("悬停那条路没断：角标身上得留着 data-lwj-help（pointerover 就是靠它命中的）", () => {
  const { desc } = field(TIP_TEXT);
  collapse(desc as unknown as HTMLElement);
  assert.equal(desc.attrs.get("data-lwj-help"), "tip");
  assert.equal(desc.attrs.get("data-lwj-tip"), TIP_TEXT);
});

test("两档还是两档：带 ⚠★ 的画粗边，其余画细边", () => {
  const warn = field(WARN_TEXT).desc;
  const tip = field(TIP_TEXT).desc;
  collapse(warn as unknown as HTMLElement);
  collapse(tip as unknown as HTMLElement);
  assert.equal(warn.attrs.get("data-lwj-help"), "warn");
  assert.equal(tip.attrs.get("data-lwj-help"), "tip");
  assert.notEqual(
    warn.attrs.get("data-lwj-help"),
    tip.attrs.get("data-lwj-help")
  );
});

// ── B. 「地址」那一格挪不挪 ─────────────────────────────────────────────

/**
 * ★ 这组数**是从跑着的后台上量下来的**，不是照着判据反推的
 * （2026-09-21，`/keystatic/collection/posts/create` 和
 * `/keystatic/collection/posts/item/1002` 两页量出来一模一样）：
 * 12 列的网格、16 格、网格项里只有那个竖排、竖排正好两格、地址排第二、
 * 第一格里有输入框。
 */
const MEASURED: SlugSlotShape = {
  gridDisplay: "grid",
  gridChildCount: 16,
  hostChildCount: 1,
  stackChildCount: 2,
  slugIsLastInStack: true,
  titleRowHasInput: true,
};

test("后台真实量出来的那棵树：认得出，挪", () => {
  assert.deepEqual(slugSlotVerdict(MEASURED), { move: true });
});

/**
 * 每一条都是一种"上游改了结构"的样子。★ 逐条**单独**破坏，
 * 因为判据是短路的 —— 一次改两处的话，后面那条永远测不到。
 */
const BROKEN: [string, Partial<SlugSlotShape>][] = [
  // 上游把表单容器从 grid 换成 flex / block：order 挪不动它。
  ["外层不是网格", { gridDisplay: "flex" }],
  ["外层是普通块", { gridDisplay: "block" }],
  // 整张表只剩一格 —— 多半是我们顺着 DOM 走错了层。
  ["外层只有一格", { gridChildCount: 1 }],
  // 网格项里除了竖排还有别的：display:contents 会把那些一起放进网格。
  ["网格项里不止竖排", { hostChildCount: 2 }],
  // fields.slug 那棵树被换了：不是「标题 + 地址」两格了。
  ["竖排只有一格", { stackChildCount: 1 }],
  ["竖排有三格", { stackChildCount: 3 }],
  // 两半的顺序反了（地址在上、标题在下）：再按"第一格是标题"去标就标反了。
  ["地址不在第二格", { slugIsLastInStack: false }],
  // 第一格里没有输入框 —— 那就不是标题那一行，我们认错了。
  ["第一格不是标题行", { titleRowHasInput: false }],
];

test("认不出来就原样不动 —— 失败方向只能是「地址留在原位」", () => {
  for (const [name, patch] of BROKEN) {
    const verdict = slugSlotVerdict({ ...MEASURED, ...patch });
    assert.equal(
      verdict.move,
      false,
      `「${name}」这种结构不该去挪它（${JSON.stringify(patch)}）`
    );
    // 判据必须说得出为什么。只回一个 false 的话，哪天它悄悄不干活了，
    // 屏幕上和"上游没变、就是不挪"长得一模一样。
    assert.ok(
      !verdict.move && verdict.why.length > 0,
      `「${name}」没给出理由`
    );
  }
});

// ── C. 接线：没接上是零症状的 ───────────────────────────────────────────

test("keystatic.config.ts 真的加载了这份脚本", () => {
  const config = stripComments(read("keystatic.config.ts"));
  assert.ok(
    config.includes('import "./src/dev/keystaticFormLayout"'),
    "keystatic.config.ts 里没有那句副作用 import —— 文件在、测试全绿，" +
      "而后台里地址还在标题底下，没有任何一处会报错"
  );
  // 同一个位置的老邻居也得还在：它们是同一种挂载方式。
  assert.ok(config.includes('import "./src/dev/keystaticHelp"'));
});

test("版面脚本不许去抄那句标签文字（docs/engineering-notes.md 坑 8 的形态）", () => {
  // 「地址（URL 里那一段）」这句话写在 keystatic.config.ts 的四个集合里。
  // 在版面脚本里再抄一份，就是改标签那天它默默失效 —— 而且不报错。
  // 现在它认的是 Keystatic 自己的 aria-label（那个 ↻），和 keystaticGroupFill.ts 同一个钩子。
  const code = stripComments(read("src/dev/keystaticFormLayout.ts"));
  assert.ok(
    !code.includes("地址（URL"),
    "keystaticFormLayout.ts 的代码里抄了那句标签文字，改标签那天它会默默失效"
  );
  assert.ok(
    code.includes('button[aria-label="regenerate"]'),
    "keystaticFormLayout.ts 不再认那个 ↻ 按钮了，那它是怎么找到地址那一格的？"
  );
});
