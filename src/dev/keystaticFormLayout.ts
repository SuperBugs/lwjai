/**
 * 后台表单里把「地址（URL 里那一段）」那一格挪到**最后**。
 *
 * 【2026-09-21 用户要的】原话是「地址应该放后面」。那一格是自动算出来的
 * （`src/config/entryNo.ts` 的递增号），填表的人几乎从来不动它 ——
 * 而它偏偏挤在标题和摘要中间，每写一条都要从它身上 Tab 过去一次。
 * 同一批里「标的是怎么认出来的」是在 `keystatic.config.ts` 里改 key 顺序挪的，
 * 这一格不行，原因在下面。
 *
 * ## 为什么 schema 的 key 顺序管不到它
 *
 * 「标题」和「地址」是**同一个字段的两半**（`fields.slug({ name, slug })`）。
 * Keystatic 把这一个字段渲染成一棵固定的树（`@keystatic/core` 里那段
 * `Flex(direction:"column") → [ TextField(name), Flex(row) → [ TextField(slug), 重算按钮 ] ]`）,
 * 两半一起占**表单网格里的一格**。所以 key 顺序能挪的是「标题 + 地址」这一整格，
 * 挪了等于把标题也一起扔到最后 —— 而标题必须在最上面。
 *
 * ## 挪法：两层 `display: contents` ＋ 一个 `order`
 *
 * 外层那个表单容器**实测是 `display: grid`**（12 列、`row-gap: 24px`，
 * 每一格 `grid-column: span 12`）。于是：
 *
 *   ① 给装着「标题 + 地址」的那个网格项、以及它里面那个竖排都设 `display: contents`
 *      —— 这两个盒子消失，**标题那一行和地址那一块直接变成网格的子项**；
 *   ② 地址那一块 `order: 1`，别的格子都是默认的 `0`，于是它排到最后。
 *
 * 竖排原来的 `gap` 是 24px，网格的 `row-gap` 也是 24px（实测），所以标题和下一格
 * 之间的间距一个像素都没变。
 *
 * ★ **不许 `appendChild` / `insertBefore` 把节点搬过去。** 那棵 DOM 是 React
 *   （Keystar UI）管的，它 reconcile 时按自己记的引用做插删，节点被我们搬走之后
 *   轻则下一次渲染弹回原位，重则当场抛 `NotFoundError`。这里**只设 `data-*` 属性**，
 *   版面全部由下面这张 stylesheet 按属性选择器命中 —— 和 `keystaticHelp.ts`
 *   守的是同两条规矩（不插节点、不加 class，理由写在那个文件开头）。
 *
 * ## ⚠ 代价：**Tab 的顺序还是按 DOM 走，不跟着 `order` 走**
 *
 * CSS 的 `order` 只换画面，不换焦点序列（规范就是这么定的）。所以从「标题」
 * 按一下 Tab，焦点仍然是先跳到已经排在最底下的「地址」，再一下到 ↻，
 * 然后才回到「摘要」。**实测**（1600×900、研究稿新建页）整条侧栏都在视口里，
 * 那一跳不触发滚动；窗口再矮一些就会滚一下再滚回来。
 *
 * 这件事**没有便宜的解法**：真要让 Tab 也跟着走，要么搬 DOM（上面第一条红线），
 * 要么给整张表每一格都派一个正的 `tabindex`（一处漏派就把那一格踢到最后）。
 * 而账是划算的：改之前从「标题」到「摘要」要按 **5 下** Tab
 * （角标 → 地址 → ↻ → 角标 → 摘要），现在是 **3 下**（地址 → ↻ → 摘要）。
 * ★ 别为了"顺手"给地址那格和 ↻ 补个 `tabindex="-1"` 把这一跳也省掉：
 *   react-aria 自己会往那个 input 上写 `tabindex`，我们写的那份会被下一次渲染
 *   覆盖掉 —— 那就是"时有时无"的坏法，比现在这一跳难查得多。
 *
 * ## 怎么认出「地址那一块」：认重算按钮，不认标签文字
 *
 * `button[aria-label="regenerate"]` 是 `fields.slug` **独有**的那个 ↻
 * （`@keystatic/core` 里写死的 aria-label），它就在地址那一块里。
 * 从它往上走两级就是地址那一块 —— 这是 Keystatic 自己的语义钩子，
 * 和 `keystaticHelp.ts` 认 `aria-describedby` 是同一类办法。
 *
 * ⚠ 刻意**不**按 `<label>` 文字「地址（URL 里那一段）」找：那句话写在
 *   `keystatic.config.ts` 的四个集合里，这边再抄一份就是 docs/engineering-notes.md 坑 8 那个形态
 *   （同一句断言出现在两处、改一处漏一处，而漏掉的那一处不报错）。
 *   `keystaticGroupFill.ts` 里"按一下 ↻"认的也是这同一个按钮 —— 一个钩子，
 *   上游哪天改了名字两处一起失灵，而两处的失灵方向都是安全的那一头
 *   （那边不重算地址、这边地址留在原位）。
 *
 * ## ★ 认不出来就**原样不动**
 *
 * 版面判据（`slugSlotVerdict()`，纯函数、有单测）逐条核对那棵树长得对不对：
 * 外层是不是 grid、网格项里是不是只有那个竖排、竖排是不是正好两格、
 * 地址是不是排在第二格、第一格里有没有输入框。有一条对不上就一个属性都不设，
 * 地址就留在标题下面 —— 也就是回到 2026-09-21 之前的样子。
 *
 * 失败方向必须是这一头：**一个悄悄不见的地址栏没有任何人会发现**，
 * 而这一格是公开地址，发出去就改不了了。
 */

/** 装着「标题 + 地址」那一格的网格项。 */
const HOST = "data-lwj-slug-host";
/** 那一格里面的竖排（Keystatic 的 `Flex direction="column"`）。 */
const STACK = "data-lwj-slug-stack";
/** 竖排里第一块：标题那一行。放出来之后要自己占满一整行。 */
const TITLE_ROW = "data-lwj-title-row";
/** 竖排里第二块：地址那一块（输入框 ＋ ↻）。就是要挪到最后的这个。 */
const SLUG_ROW = "data-lwj-slug-row";
/**
 * 正文编辑器所在的那一格。
 *
 * ⚠ 它**不总是在这张网格里**：`entryLayout: "content"` 宽屏时正文在左边独立一栏，
 *   网格里只剩一个空占位（实测 1600px 下高度是 0）；窄屏会**静默退回**普通表单布局，
 *   正文就回到网格里、还是最后一格。不管它的话，地址（order:1）在窄屏下会排到
 *   整个正文编辑器**下面**去 —— 那不叫"放后面"，那叫找不着。
 *   所以给它 `order: 2`，地址永远夹在"最后一个字段"和"正文"之间。
 */
const BODY_CELL = "data-lwj-body-cell";

const STYLE_ID = "lwj-form-layout-style";

/**
 * ★ 每个属性选择器都写两遍（`[X][X]`），和 `keystaticHelp.ts` 同一个理由：
 *   上游那些样式挂在类上（同权重），而 emotion 是运行时往 <head> 里插的，
 *   谁排在后面不由我们决定。写两遍把权重抬到 (0,2,0)，不用 !important。
 *
 * ★ `grid-column: 1 / -1` 而不是抄上游的 `span 12`：放出来的这两块本来没有
 *   grid-column（原来那句在网格项上，而网格项已经 display:contents 了），
 *   写成"占满所有列"就不用跟着上游的列数走。
 */
const CSS = `
[${HOST}][${HOST}], [${STACK}][${STACK}] { display: contents; }
[${TITLE_ROW}][${TITLE_ROW}], [${SLUG_ROW}][${SLUG_ROW}] { grid-column: 1 / -1; }
[${SLUG_ROW}][${SLUG_ROW}] { order: 1; }
[${BODY_CELL}][${BODY_CELL}] { order: 2; }
`;

/**
 * 「地址那一格能不能挪」要核对的那几件事 —— 全是**量出来的数**，不是元素，
 * 所以这一层能被裸 tsx 测到（判据零 import，见 docs/engineering-notes.md 第三节）。
 */
export interface SlugSlotShape {
  /** 外层那个表单容器的 computed `display`。 */
  gridDisplay: string;
  /** 外层容器有几个直接子元素。 */
  gridChildCount: number;
  /** 网格项里有几个直接子元素（正常是 1：那个竖排）。 */
  hostChildCount: number;
  /** 竖排里有几个直接子元素（正常是 2：标题那一行、地址那一块）。 */
  stackChildCount: number;
  /** 地址那一块是不是竖排里**最后**一个。 */
  slugIsLastInStack: boolean;
  /** 竖排里**第一**块（要当成标题那一行的那个）里有没有输入框。 */
  titleRowHasInput: boolean;
}

export type SlugSlotVerdict = { move: true } | { move: false; why: string };

/**
 * 认得出这棵树就挪，认不出就一个属性都不设（地址留在标题下面）。
 *
 * 每一条都对应一种"挪过去会更糟"的结构：
 *   - 外层不是 grid：`order` 在普通块里不起作用，设了等于没设，但
 *     `display: contents` 已经把两个盒子拆了 —— 版面会散，而地址还在原地。
 *   - 网格项里不止那个竖排：`display: contents` 会把别的东西一起放进网格。
 *   - 竖排不是两格 / 地址不在第二格 / 第一格里没有输入框：那就不是
 *     `fields.slug` 那棵树，我们认错了 —— 认错的时候什么都不做。
 */
export function slugSlotVerdict(shape: SlugSlotShape): SlugSlotVerdict {
  if (shape.gridDisplay !== "grid") {
    return {
      move: false,
      why: `外层不是网格（display: ${shape.gridDisplay}）`,
    };
  }
  if (shape.gridChildCount < 2) {
    return { move: false, why: "外层只有一格，认错容器了" };
  }
  if (shape.hostChildCount !== 1) {
    return {
      move: false,
      why: `网格项里有 ${shape.hostChildCount} 样东西，不止那个竖排`,
    };
  }
  if (shape.stackChildCount !== 2) {
    return {
      move: false,
      why: `竖排里有 ${shape.stackChildCount} 格，不是「标题 + 地址」两格`,
    };
  }
  if (!shape.slugIsLastInStack) {
    return { move: false, why: "地址不在竖排的第二格" };
  }
  if (!shape.titleRowHasInput) {
    return { move: false, why: "竖排第一格里没有输入框，那不是标题那一行" };
  }
  return { move: true };
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

/** 量一棵树，交给上面那个判据。量不到（少一层父节点）就返回 undefined。 */
function measure(button: Element):
  | {
      shape: SlugSlotShape;
      block: HTMLElement;
      stack: HTMLElement;
      host: HTMLElement;
      grid: HTMLElement;
      titleRow: HTMLElement;
    }
  | undefined {
  // ↻ → 它自己那个竖排 → 地址那一块。层数是 @keystatic/core 里那棵树定的。
  const block = button.parentElement?.parentElement;
  const stack = block?.parentElement;
  const host = stack?.parentElement;
  const grid = host?.parentElement;
  const titleRow = stack?.firstElementChild;
  if (!block || !stack || !host || !grid || !titleRow) return undefined;
  if (!(titleRow instanceof HTMLElement)) return undefined;

  return {
    shape: {
      gridDisplay: getComputedStyle(grid).display,
      gridChildCount: grid.children.length,
      hostChildCount: host.children.length,
      stackChildCount: stack.children.length,
      slugIsLastInStack: stack.lastElementChild === block,
      titleRowHasInput: titleRow.querySelector("input") !== null,
    },
    block,
    stack,
    host,
    grid,
    titleRow,
  };
}

function markSlugSlot(button: Element): void {
  const found = measure(button);
  if (!found) return;
  if (found.block.hasAttribute(SLUG_ROW)) return; // 已经挪过了
  if (!slugSlotVerdict(found.shape).move) return; // 认不出来 → 原样不动

  found.host.setAttribute(HOST, "");
  found.stack.setAttribute(STACK, "");
  found.titleRow.setAttribute(TITLE_ROW, "");
  found.block.setAttribute(SLUG_ROW, "");

  /**
   * 正文那一格（如果它这会儿真的在这张网格里）。判据是"里面有没有
   * `contenteditable`" —— 认的是编辑器本身，不是某个类名或第几格。
   * 宽屏下找不到是正常的（正文在左边那一栏），那时网格最后一格是个 0 高的空占位，
   * 地址排在它前后都一样。
   */
  for (const cell of found.grid.children) {
    if (cell.querySelector('[contenteditable="true"]')) {
      cell.setAttribute(BODY_CELL, "");
      break;
    }
  }
}

function scan(): void {
  // 一页上正常只有一个 ↻（一个集合一个 slugField）。真有第二个就各挪各的。
  for (const button of document.querySelectorAll(
    'button[aria-label="regenerate"]'
  )) {
    markSlugSlot(button);
  }
}

function start(): void {
  ensureStyle();

  let queued: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    queued = undefined;
    scan();
  };
  /**
   * 后台是客户端渲染的 SPA，表单随路由进进出出 —— 扫一次不够。
   * `markSlugSlot()` 自己幂等，这里只要压一下频率（正文一敲字就是一串变更）。
   *
   * ⚠ 和 keystaticHelp.ts 同一条：**不能用 `requestAnimationFrame`**，
   *   标签页在后台时浏览器不发帧，扫描会被推进一个永远不到的帧里。
   */
  const observer = new MutationObserver(() => {
    if (queued !== undefined) return;
    queued = setTimeout(run, 50);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  run();
}

/**
 * 挂载点：`keystatic.config.ts` 顶上那句副作用 import，和 `keystaticHelp.ts`
 * 同一个位置、同一个理由（那是后台页面在浏览器里真的会加载的模块，
 * 范围正好是后台）。为什么不走 astro.config.ts 的 `injectScript`，
 * 写在 keystaticHelp.ts 文件末尾那段。
 *
 * ⚠ 那份配置**服务端也会加载**（/api/keystatic 那条路由），所以第一个判断是
 *   `typeof document` —— 裸写 `location` / `document` 在 Node 里当场抛。
 *   这也是 scripts/gate 里的测试能直接 import 这个文件的原因。
 */
if (typeof document !== "undefined") {
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}
