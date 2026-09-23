/**
 * 后台的字段说明收成一个「?」，**鼠标放上去**才展开。
 * （2026-09-21 之前这句写的是「鼠标放上去**或键盘聚焦**」—— 键盘那一半已经
 * 拿掉了，理由和代价在下面「角标不进 Tab 序列」那一节。）
 *
 * 【2026-09-20 加】这些说明每一句都有用，但它们**同时**挂在屏幕上的时候，
 * 一张发稿表单里有一半的高度是给说明的，真正要填的格子被挤得到处都是。
 * 收成一个角标之后，要看的时候还在，不看的时候不占地方。
 *
 * ## 为什么是"在 DOM 上盖一层"，不是 Keystatic 的某个选项
 *
 * 没有那个选项。`fields.*({ description })` 的类型就是 `string`（`@keystatic/core`
 * 的 `config.d.ts`），`ui` 那一块只有 `brand` / `navigation` 两个口子 ——
 * 既不能换字段的渲染，也不能塞自定义 CSS。所以只能在浏览器里改。
 *
 * ## ★ 只设属性，不插节点、不碰 className
 *
 * 后台那棵 DOM 是 React（Keystar UI）管的，所以这份脚本守两条：
 *
 *   ① **不往 React 管的容器里插节点。** 它在 reconcile 时按自己记的引用做
 *      `insertBefore` / `removeChild`，中间多一个它不知道的节点，轻则被清掉，
 *      重则当场抛 `NotFoundError`。唯一插进去的那个节点（提示气泡）挂在
 *      `document.body` 上，那块地方 React 不管。
 *   ② **不加 class。** React 每次渲染都会把 `className` 整个写回去，加上去的类
 *      下一次输入就没了 —— 而且是那种"时有时无"的坏法。`data-*` 属性它不认识，
 *      也就不会动。所有样式都挂在 `data-lwj-help*` 上。
 *
 * ## 怎么认出哪个元素是"说明"
 *
 * 不认 `kui-1kkx8b0` 这种类名 —— 那是 emotion 生成的哈希，上游一改就全变。两条路：
 *
 *   ① **常规字段**：控件上的 `aria-describedby` 指过去的就是说明。这是语义钩子，
 *      Keystatic 不会为了换皮肤把它拿掉。
 *   ② **勾选框**：Keystatic 偏偏**不给**它 `aria-describedby`（实测），说明是
 *      文字容器里第二个 `kui:Text`。`kui:Text` 是带语义的固定类名，不是哈希。
 *
 * ★ **认不出来就原样显示。** 上游哪天改了结构，最坏的结果是回到现在这个啰嗦版，
 *   不是表单坏掉、也不是说明消失 —— 写这类"盖一层"的东西，失败方向必须是这一头。
 *
 * ## 原文留在 DOM 里，不是 display:none
 *
 * `aria-describedby` 指着它，读屏要念。所以收起来的做法是 `font-size: 0`
 * （占 0 宽、看不见，但仍在无障碍树里），不是把它删掉或 `display:none`。
 *
 * ## ★【2026-09-21】角标**不进 Tab 序列**，这是一个有代价的决定
 *
 * 这里原来给角标设了 `tabindex="0"`，注释写着「键盘也要够得着」。实测下来
 * 那一格的后果是：后台的 Tab 序列变成 **角标 → 输入框 → 角标 → 输入框**——
 * 从「标题」按一下 Tab 落在地址那格的角标上（还顺带把气泡弹开了），
 * 再按一下才到地址那格。一张表填下来，每一格都要多按一次 Tab、多看一次气泡。
 * 实测那一页上有 15 个角标，也就是填一遍表多出 15 次。
 *
 * 现在**一个 tabindex 都不设**：`<span>` 天生不可聚焦，于是 Tab 一格一格地
 * 走输入框，和没有这份脚本时一模一样。
 *
 * ⚠ **代价要说出来，不许假装没有：** 看得见屏幕、但只用键盘的人，从此没法把
 *   气泡叫出来。换来的是这个站长每天填表少按十几次 Tab。这是本机后台
 *   （公网上不存在 /keystatic 这个地址，见 keystatic.config.ts 开头），
 *   只有一个使用者，所以键盘可达性让位给填表效率 —— 这是个决定，不是疏忽。
 *
 * ★ **读屏用户什么都没丢**：原文仍然原样留在 DOM 里（上面那节），
 *   控件的 `aria-describedby` 仍然指着它，聚焦到控件时照念不误。
 *   气泡从头到尾就只是给看得见的人的一个悬停便利。
 *
 * ## 两种角标
 *
 * 带 `⚠` 或 `★` 的说明画成**粗边、不透明的 `?`**，其余画成细边、半透明的 `?`。
 * 「这一格有个说明」和「这一格有句警告」不是一回事，压成一个角标就等于把警告藏了 ——
 * 而藏掉的正是"发出去就收不回来"那几句。
 *
 * ★【2026-09-20 改】重的那档原来是**橙色的 `!`**。用户实测把它当成了"这一格没填对"：
 *   它就挨着 Keystatic 画的红色必填 `*`，填完了 `!` 还在，看起来就是报错没消。
 *   角标说的是"这里有句要看的话"，不是这一格的**状态** —— 状态类的记号（`!`、红色）
 *   一个都不许用。两档的区别只靠粗细和透明度，颜色跟着文字走。
 */

/** 说明元素本身。值是两档：`tip` / `warn`。 */
const HELP = "data-lwj-help";
/** 原文，气泡从这里取（原文本身被 font-size:0 收起来了）。 */
const TIP = "data-lwj-tip";
/** 说明所在的那一行容器 —— 标题和角标要并排，靠它改成横排。 */
const HEAD = "data-lwj-help-head";
/** 那一行里的标题，和角标一起留在第一排；别的东西（报错槽）自己占一排。 */
const LABEL = "data-lwj-help-label";

const STYLE_ID = "lwj-help-style";
const TIP_ID = "lwj-help-tip";

const CSS = `
[${HELP}] {
  display: inline-flex; align-items: center; justify-content: center;
  flex: 0 0 auto; width: 15px; height: 15px;
  border: 1px solid currentColor; border-radius: 999px;
  /* ★ 不是 display:none：aria-describedby 指着它，读屏还要念这段字。 */
  font-size: 0; line-height: 0;
  cursor: help; opacity: .5; vertical-align: middle;
}
/* 只有 :hover —— 角标进不了焦点了（文件头「角标不进 Tab 序列」那一节）。 */
[${HELP}]:hover { opacity: 1; }
[${HELP}]::before { content: "?"; font-size: 10px; line-height: 1; font-weight: 700; }
/* 重的那档：还是 "?"，只是边粗一档、不透明 —— 不用 "!"、不用红橙色，
   那两样在表单里都读作"这一格有问题"（见文件头「两种角标」）。 */
[${HELP}="warn"] { border-width: 2px; opacity: .9; }

/**
 * ★ 只写 \`column-gap\`，**绝不写 \`gap\` 简写**。
 *
 * 【2026-09-20 踩到】这里原来是 \`gap: 0 6px\`，把 Keystatic 自己那句 \`gap: 12px\`
 * 的**行间距一起清成了 0** —— 标签直接贴在输入框上，整张表看着像挤在一起。
 * 简写会把没打算动的那一半也覆盖掉，这是 CSS 里最容易顺手犯的一种误伤。
 * 现在行距原样留给上游（12px / 勾选框那档 16px），只把横向那一半改窄。
 *
 * 属性选择器写两遍是为了抬权重：上游那句 \`gap\` 挂在类上（同权重），
 * 而 emotion 的样式是运行时插进 <head> 的，谁在后面不由我们决定。
 */
[${HEAD}][${HEAD}] {
  display: flex; flex-flow: row wrap; align-items: center; column-gap: 6px;
}
/* 报错槽、以及像"地址"那种把控件也放在这一层的字段：不跟标题挤一排。 */
[${HEAD}] > :not([${HELP}]):not([${LABEL}]) { flex-basis: 100%; }

#${TIP_ID} {
  position: fixed; z-index: 2147483000; display: none;
  max-width: min(520px, 92vw); padding: 8px 10px;
  border-radius: 8px; font-size: 12px; line-height: 1.75;
  background: #1f2024; color: #f3f4f6;
  box-shadow: 0 10px 28px rgb(0 0 0 / .3);
  white-space: pre-wrap; pointer-events: none;
}
#${TIP_ID}[data-kind="warn"] { background: #7c2d12; }
`;

/** 说明里有这两个记号的，角标画成粗边不透明的 `?`。两档在屏幕上必须长得不一样，
 *  但都不许长得像"报错"（见文件头）。 */
const WARNING_MARK = /[⚠★]/;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

/** ① 常规字段：控件的 `aria-describedby` 指向说明。 */
function fromAria(): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const control of document.querySelectorAll("[aria-describedby]")) {
    const ids = (control.getAttribute("aria-describedby") ?? "").split(/\s+/);
    for (const id of ids) {
      const el = id ? document.getElementById(id) : null;
      if (el) found.push(el);
    }
  }
  return found;
}

/**
 * ② 勾选框：Keystatic 不给它 `aria-describedby`。它的文字容器里
 * 第一个 `kui:Text` 是标题，第二个（有的话）才是说明 —— 只有一个就是没写说明。
 */
function fromCheckboxes(): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const box of document.querySelectorAll('input[type="checkbox"]')) {
    const group = box.closest("label")?.lastElementChild;
    if (!group) continue;
    const texts = Array.from(group.children).filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.classList.contains("kui:Text")
    );
    if (texts.length >= 2) found.push(texts[1]!);
  }
  return found;
}

/**
 * 把一条说明收成角标。**导出只是为了能测**（scripts/gate/keystaticForm.test.ts
 * 拿一个记账用的假元素跑它，钉"设出去的属性里没有 tabindex"）—— 页面上仍然只有
 * 下面那个 `scan()` 调它。
 */
export function collapse(el: HTMLElement): void {
  if (el.hasAttribute(HELP)) return;
  const text = (el.textContent ?? "").trim();
  // 空说明不画角标：一个点开是空的角标比没有角标更糟。
  if (!text) return;
  /**
   * ★ **tooltip 不是字段说明，一个字都不许动。**
   *
   * 【2026-09-21 用户报的显示 bug】Keystar 的 `TooltipTrigger` 把 tooltip 的 id
   * 挂在触发按钮的 `aria-describedby` 上 —— 和"字段说明"用的是同一个语义钩子。
   * 于是 `fromAria()` 把每一个弹出来的 tooltip 都收了：顶上那排图标（撤销改动 /
   * 删除 / 复制 / 粘贴 / 另存 / 预览）和正文编辑器那排（加粗 / 斜体 / 表格 …）
   * 一悬停，弹出来的不是提示，是一个 **15×15、`font-size: 0` 的灰色小方块** ——
   * 字还在 DOM 里，只是被我们自己的角标样式压成了 0 号字。
   *
   * 判据用 `role="tooltip"`（ARIA 角色，语义的），不认那串 emotion 类名哈希。
   * ⚠ 上面那条"本来就看不见的不收"挡不住它：tooltip 弹出来的时候是**看得见**的。
   */
  if (el.closest('[role="tooltip"]')) return;
  /**
   * ★ **本来就看不见的，不许被我们画成看得见的。**
   *
   * `aria-describedby` 指过去的不一定是"字段说明"。实测「智能体与模型」那一页上，
   * 每个拖拽手柄都挂着一句读屏专用的 `Click to start dragging.` —— 它本来是
   * 屏幕上不存在的东西，照收的话每行都会多出一个点开是英文的问号。
   *
   * 判据用「有没有盒子」而不是认类名：类名是 emotion 哈希，而"这东西本来就没显示"
   * 是我们真正想问的那件事。折叠面板里暂时没显示的字段也会落到这一档 ——
   * 没关系，collapse() 幂等、observer 还会再扫，它露出来那一刻就收了。
   */
  if (el.getClientRects().length === 0) return;

  el.setAttribute(TIP, text);
  el.setAttribute(HELP, WARNING_MARK.test(text) ? "warn" : "tip");
  /**
   * ★ 这里**刻意不设 `tabindex`**，别顺手加回来。
   *
   * 加上 `tabindex="0"` 的那半天，Tab 序列是「角标 → 输入框 → 角标 → 输入框」：
   * 从标题按一下 Tab 落在地址那格的角标上、气泡当场弹开，再按一下才进输入框。
   * 一页 15 个角标 = 填一遍表多按 15 次 Tab。完整的取舍（以及为什么读屏用户
   * 什么都没丢）写在文件头「角标不进 Tab 序列」那一节。
   * 钉子：scripts/gate/keystaticForm.test.ts 的「角标不许进 Tab 序列」。
   */

  const head = el.parentElement;
  if (!head) return;
  head.setAttribute(HEAD, "");
  for (const child of head.children) {
    if (child === el) continue;
    // 标题：常规字段是 <label>，勾选框是容器里第一个 kui:Text。
    if (child.tagName === "LABEL" || child.classList.contains("kui:Text")) {
      child.setAttribute(LABEL, "");
      break;
    }
  }
}

let bubble: HTMLElement | undefined;

function showTip(el: HTMLElement): void {
  if (!bubble) {
    bubble = document.createElement("div");
    bubble.id = TIP_ID;
    // ★ 挂在 body 上、position:fixed：插进表单里的话会被面板的 overflow 裁掉，
    //   而且那是 React 管的地方（见文件开头第 ① 条）。
    document.body.append(bubble);
  }
  bubble.textContent = el.getAttribute(TIP) ?? "";
  bubble.dataset.kind = el.getAttribute(HELP) ?? "tip";
  bubble.style.display = "block";

  // 先显示再量，否则拿到的是 0×0。
  const anchor = el.getBoundingClientRect();
  const box = bubble.getBoundingClientRect();
  const left = Math.max(
    8,
    Math.min(
      anchor.left + anchor.width / 2 - box.width / 2,
      window.innerWidth - box.width - 8
    )
  );
  const below = anchor.bottom + 8;
  const top =
    below + box.height > window.innerHeight - 8
      ? Math.max(8, anchor.top - box.height - 8)
      : below;
  bubble.style.left = `${left}px`;
  bubble.style.top = `${top}px`;
}

function hideTip(): void {
  if (bubble) bubble.style.display = "none";
}

function helpAt(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element
    ? target.closest<HTMLElement>(`[${HELP}]`)
    : null;
}

function start(): void {
  ensureStyle();

  let queued: ReturnType<typeof setTimeout> | undefined;
  const scan = () => {
    queued = undefined;
    for (const el of fromAria()) collapse(el);
    for (const el of fromCheckboxes()) collapse(el);
  };
  // 后台整个是客户端渲染的 SPA，字段随路由进进出出 —— 一次扫描不够。
  // collapse() 自己幂等，所以这里只要压一下频率就行（正文编辑器一敲字就是一串变更）。
  //
  // ⚠ 这里**不能用 `requestAnimationFrame`**：标签页在后台时浏览器不发帧，
  //   扫描就被推进一个永远不到的帧里 —— 症状是"切回来之前后台一个角标都没有"，
  //   而控制台干干净净。定时器在后台只是被节流，不会停。
  const observer = new MutationObserver(() => {
    if (queued !== undefined) return;
    queued = setTimeout(scan, 50);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  scan();

  document.addEventListener("pointerover", e => {
    const el = helpAt(e.target);
    if (el) showTip(el);
  });
  document.addEventListener("pointerout", e => {
    if (helpAt(e.target)) hideTip();
  });
  // ★【2026-09-21】这里原来还有一对 focusin / focusout：角标带着 tabindex="0"，
  //   Tab 到它身上就弹气泡。那个 tabindex 已经拿掉了（文件头那一节），
  //   `<span>` 现在根本聚不上焦，这两个监听器留着也永远不会被调用 ——
  //   留一段"看起来还在照顾键盘"的死代码，比明说这件事更坏。
  //
  // Escape 留着：React 重渲染时把正悬停的那个角标换掉的话，pointerout 不会来，
  // 气泡会卡在屏幕上 —— 这是唯一一条收掉它的路。
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") hideTip();
  });
  // 滚动时气泡会和角标脱节，直接收掉（capture：表单面板自己也会滚）。
  window.addEventListener("scroll", hideTip, true);
}

/**
 * 挂载点：`keystatic.config.ts` 顶上一句副作用 import。
 *
 * ★ 为什么不是 astro.config.ts 里的 `injectScript`（试过，不行）：
 *   Keystatic 那条路由渲染出来的 HTML **根本没有 `<head>`** —— 整页就是
 *   `<!DOCTYPE html>` ＋ astro-island 的运行时 ＋ 一个岛，而 Astro 的页面脚本
 *   是往 `<head>` 里插的，于是注了等于没注（站点自己的页面上倒是都有一份）。
 *   也不自己注一条 `/keystatic/[...params]` 去包住它：那条路由是 `keystatic()`
 *   注册的，同一个 pattern 注册两次是在赌谁后生效。
 *
 *   而 `keystatic.config.ts` 是**后台页面在浏览器里真的会加载的那个模块**，
 *   范围正好就是后台，不多不少。
 *
 * ⚠ 那份配置**服务端也会加载**（/api/keystatic 那条路由），所以第一个判断是
 *   `typeof document`，不是 `location` —— 裸写 `location` 在 Node 里当场抛。
 */
if (typeof document !== "undefined") {
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}
