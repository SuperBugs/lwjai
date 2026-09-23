/**
 * 后台里选了「② 补一份研究 / 补一个回答」之后，**把那一组的标题和标的自动带过来**，
 * 并让地址跟着重算一次。
 *
 * 【2026-09-21 加】在这之前，那两格的字段说明里写着一句「照着那条原样写」——
 * 也就是把一致性交给人手抄。而不一致的后果不是难看：同一个选题的几份研究，
 * 列表上折成一张卡、卡上只印**一个**标题（根那条的），于是手抄错的那一份
 * 在列表里**连自己的标题都看不见**；标的代码抄漏的那一份不会出现在 /s/<代码> 里。
 * 两种症状都不报错。
 *
 * 【2026-09-22】原来带三格（标的代码 / 公司中文名 / 公司英文名称），现在带两样：
 * 标题（文本框）和**标的**（一格多选）。公司名搬进了标的表，条目上不再有那两格 ——
 * 带一格勾选和带一格文字在 DOM 上是两种动作，所以下面分成 `labels` / `multi` 两半。
 *
 * ## 为什么是轮询，不是监听 change
 *
 * 【2026-09-21 实测】Keystar 的 Picker 底下那个隐藏 `<select>`（react-aria 的
 * HiddenSelect）**值会被改，但不发 `change` / `input` 事件** —— 在浏览器里选一项之后
 * `sel.value` 确实变成了组的键，而挂在它身上的两个监听器一次都没被调用。
 * 所以只能自己看着它。这是本机开发页上的一个 200ms 定时器，代价可以忽略。
 * ⚠ 别"优化"成监听 change：那样整个功能会安静地不工作 —— 选了没反应，没有任何报错。
 *
 * ## 只在**新建**页动手
 *
 * 编辑已有条目时不碰：那会把人正在改的标题覆盖掉。而且新建页上这一格排在最前面，
 * 选它的时候后面几格通常还是空的 —— 覆盖是预期内的。
 *
 * ## 为什么按**标签**找输入框
 *
 * Keystatic 渲染出来的表单里**没有字段名**（没有 `name`、没有 data 属性，id 是
 * `react-aria…` 随机串），唯一能认出"这是标的代码那一格"的只有它的 `<label>` 文字。
 * 所以标签文字由 `keystatic.config.ts` **同一组常量**同时喂给字段定义和这里 ——
 * 两处各写一份的那天，就是改了标签、自动填默默失效的那天。
 */

/** 一个集合要带的那几格：frontmatter 键 → 表单上那一格的标签。 */
export interface CarryLabels {
  [frontmatterKey: string]: string;
}

/** 多选那一格里的一项（和后台那一格的 options 是同一份，见 `CollectionCarry.multi`）。 */
export interface CarryOption {
  label: string;
  value: string;
}

/** 一组要带过去的值：单值那几格 + 多选那几格。 */
export interface GroupCarry {
  values: Record<string, string>;
  lists: Record<string, string[]>;
}

export interface CollectionCarry {
  /** 单值那几格（标题）：按 `<label>` 文字找输入框。 */
  labels: CarryLabels;
  /**
   * **多选**那几格（【2026-09-22】标的那一格换成了多选）：frontmatter 键 → 这一格的
   * 全部选项，和 `keystatic.config.ts` 里那一格的 `options` **是同一份**。
   *
   * ★ 认这一格靠的是**选项集合正好对得上**，不是标签文字 —— 和下面认「这一条是…」
   *   那个下拉（`groupSelect()`）、以及 `keystaticAgentModel.ts` 认智能体 / 模型
   *   那两格是同一个办法。表单里同时还有「标签」那一格，也是一个 `role="group"`
   *   的勾选框堆，只认"是个多选"会当场认错格子。
   */
  multi: Record<string, readonly CarryOption[]>;
  /** 组的键 → 那一组根条目上这几格的值。 */
  groups: Record<string, GroupCarry>;
}

const TICK_MS = 200;

/** 表单里按标签找那一格。标签上的 `*`（必填星号）不算名字的一部分。 */
function fieldByLabel(
  label: string
): HTMLInputElement | HTMLTextAreaElement | null {
  const fields = document.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement
  >("input[type='text'], textarea");
  for (const field of fields) {
    const text = field.labels?.[0]?.textContent?.trim().replace(/\*$/, "");
    if (text === label) return field;
  }
  return null;
}

/**
 * 往 React 管的输入框里写值。
 * ★ 直接 `el.value = x` **不行**：React 记着自己那份值，下一次渲染会把它写回去。
 *   要走原型上的 setter 再补一个 `input` 事件，React 才认（实测过）。
 */
function setValue(
  field: HTMLInputElement | HTMLTextAreaElement,
  value: string
): void {
  const proto =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * 找某个**多选**那一格底下的那几个勾选框，顺带认出每个框对应哪个值。
 *
 * 判据是**每个框的 `<label>` 文字都在这一格的 options 里、而且个数对得上** ——
 * 后台那张表单里「标签」也是一个 `role="group"` 的勾选框堆，只认"是个多选"会当场认错。
 * 认不出来返回 null，调用方**什么都不做**：带不过来顶多少勾一格，人自己补；
 * 而认错一格就是把标的勾成了标签，那是会写进盘的。
 *
 * ⚠ **只能按标签文字认，不能按 `input.value`** —— 2026-09-22 在浏览器里实测：
 *   Keystar 的 CheckboxGroup **不往 `input` 上放选项的值**，每个框的 `value` 都是
 *   浏览器默认的 `"on"`。第一版这里有一条"标签对不上就按 value 集合对"的兜底，
 *   看起来是双保险，实际上**永远不可能命中** —— 那正是这个仓库最在意的
 *   "以为有保障、其实钉的是另一件事"。量过之后删掉了。
 * ★ 所以标签文字（`symbolOptionLabel()` 拼的 `ARM Arm`）是**唯一**的钩子：
 *   后台那一格的 options 和这里收到的 options 必须是同一份 —— 它们是
 *   （`keystatic.config.ts` 的 `CARRY_MULTI` 和 `symbolsField()` 读的都是 `symbolOptions()`）。
 * ★【2026-09-23】导出给 `keystaticSymbolPicker.ts`（标的那一格的搜索框 + 滚动框）用：
 *   它认"哪一格是标的"用的就是这一个判据，不另写一份。那边把 Keystatic 的药丸
 *   藏起来（`display: none`）画自己的，**真勾选框原地不动** —— 所以这里照样数得到、
 *   照样点得动；而那边自己的药丸是 `<button>`，不是勾选框，不会把这里的个数数错。
 */
export function multiBoxes(
  options: readonly CarryOption[]
): { box: HTMLInputElement; value: string }[] | null {
  const byLabel = new Map(options.map(o => [o.label, o.value]));

  for (const group of document.querySelectorAll<HTMLElement>(
    '[role="group"]'
  )) {
    const boxes = [
      ...group.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ];
    if (boxes.length !== options.length) continue;

    const byText = boxes.map(box => ({
      box,
      value: byLabel.get(box.closest("label")?.textContent?.trim() ?? ""),
    }));
    if (byText.every(p => p.value !== undefined)) {
      return byText as { box: HTMLInputElement; value: string }[];
    }
  }
  return null;
}

/**
 * 把一格多选勾成 `want` 那个样子。
 *
 * ★ 用 `box.click()`，不是 `box.checked = true`：和上面 `setValue()` 同一条理由 ——
 *   React 记着自己那份状态，直接改 `checked` 下一次渲染就被写回去了。
 *   click 走的是真的 click → change 事件链，react-aria 那一层认它。
 * ⚠ 这几次点击的 `isTrusted` 是 false。**这是好事，而且是承重的**：
 *   `keystaticModTime.ts` 判"人改过没有"的闸就是 `isTrusted`，所以这里替人勾的几下
 *   不会被当成"人动过"。（那段脚本只在编辑页动手，而这里只在新建页 —— 两层都隔开了。）
 */
function setChecked(
  boxes: readonly { box: HTMLInputElement; value: string }[],
  want: ReadonlySet<string>
): void {
  for (const { box, value } of boxes) {
    if (box.checked !== want.has(value)) box.click();
  }
}

/** 当前页是哪个集合的**新建**页；不是新建页返回 undefined。 */
function creatingCollection(): string | undefined {
  const m = /^\/keystatic\/collection\/([^/]+)\/create\b/.exec(
    location.pathname
  );
  return m?.[1];
}

/**
 * 找「这一条是…」那一格底下的隐藏 `<select>`。
 * 判据是**选项集合正好等于这一组的键**（外加一个空串＝新选题），不认文案 ——
 * 和 `src/dev/keystaticAgentModel.ts` 认智能体 / 模型那两格是同一个办法。
 * （这里原来写的是「`keystatic.config.ts` 里的 `formSelectValue()`」，
 *  那个函数在 2026-09-21 地址换成条目号时就跟着老的 `autoSlug` 一起没了 ——
 *  主干上全仓搜不到它。指着一个不存在的东西说"同一个办法"，比不写更糟。）
 * ★【2026-09-23】导出给 `keystaticGroupPicker.ts`（这一格的搜索 + 分页）用 ——
 *   两边认的必须是同一格，判据只留这一份。
 */
export function groupSelect(keys: readonly string[]): HTMLSelectElement | null {
  const wanted = new Set(keys);
  for (const select of document.querySelectorAll("select")) {
    const values = [...select.options].map(o => o.value).filter(v => v !== "");
    if (values.length === wanted.size && values.every(v => wanted.has(v))) {
      return select;
    }
  }
  return null;
}

export function mountGroupAutofill(
  byCollection: Record<string, CollectionCarry>
): void {
  // 这份配置服务端也会加载（/api/keystatic 那条路由），所以第一个判断是 document。
  if (typeof document === "undefined") return;

  /** 上一拍看到的值。`undefined` = 这一页还没看过，**这一拍不算"变了"** ——
   *  不这样的话，打开一条已经选好组的条目会当场触发一次覆盖。 */
  let lastSeen: string | undefined;
  let lastPath = "";

  const tick = () => {
    const collection = creatingCollection();
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      lastSeen = undefined; // 换页了，重新认一次当前值
    }
    if (!collection) return;

    const carry = byCollection[collection];
    if (!carry) return;

    const keys = Object.keys(carry.groups);
    const select = keys.length > 0 ? groupSelect(keys) : null;
    if (!select) return;

    const value = select.value;
    if (lastSeen === undefined) {
      lastSeen = value;
      return;
    }
    if (value === lastSeen) return;
    lastSeen = value;

    // 选回「新选题 / 新问题」时**什么都不做**：那不是"清空表单"的意思，
    // 人可能已经在别的格子里写了东西。
    if (!value) return;

    const source = carry.groups[value];
    if (!source) return;

    for (const [key, label] of Object.entries(carry.labels)) {
      const field = fieldByLabel(label);
      if (!field) continue;
      // 根那条这一格是空的 → 这里也清空。"和那一组保持一致"包括"那一格本来就没有"。
      setValue(field, source.values[key] ?? "");
    }

    // 多选那几格（标的）。同一条口径：根那条一个都没勾 → 这里也全取消。
    for (const [key, options] of Object.entries(carry.multi)) {
      const boxes = multiBoxes(options);
      if (!boxes) continue;
      setChecked(boxes, new Set(source.lists[key] ?? []));
    }

    // 标的变了，地址也该跟着变。Keystatic 的 generate 只在**人手敲标题**时才跑，
    // 程序写进去的值不会触发它 —— 所以这里替人按一下那个 ↻。
    // ⚠ 只在新建页按：已发布的条目改地址等于把分享出去的链接打死。
    document
      .querySelector<HTMLButtonElement>('button[aria-label="regenerate"]')
      ?.click();
  };

  window.setInterval(tick, TICK_MS);
}
