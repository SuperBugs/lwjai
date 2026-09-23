/**
 * 后台里**换了「哪个智能体」之后，让「底下跑的是哪个模型」那一格跟上**。
 *
 * 【2026-09-21 加】在这之前那两格是互相独立的两个下拉：选了 Google Spark，
 * 模型那格照样能停在 GPT-6-Pro —— 而那个组合根本不存在，且**四处全绿**
 * （zod 只查两个枚举各自合法、闸门不看 frontmatter 这两格、页面照印两张芯片）。
 * 归属现在是登记表里的数据，判据全在 `src/config/models.ts`（`modelScope()` /
 * `agentModelMismatch()` / `nextModelFor()`），这个文件只负责**去动那个表单**。
 *
 * ## 它做得到什么、做不到什么（照实写）
 *
 *   做得到：换了智能体，模型那一格和新智能体**矛盾**时自动换成该智能体底下的第一个；
 *          选「我自己」时自动换成「未标注」（那一档填了模型构建期会红）。
 *   ★ 做不到：**把模型下拉里不该出现的项过滤掉。** `fields.select` 的 options 在
 *     配置求值那一刻就定死了，而可见的那个列表是 react-aria 渲的 —— 在 DOM 里
 *     增删它的选项就是和 React 打架，这个仓库明令不许往 React 管的 DOM 里插节点。
 *     所以人仍然**挑得到**一个错配的组合；兜底是两层：每一项标签后面缀着归属
 *     （`modelOptions()`），以及构建期那条拦截（`content.config.ts` 的 checkAgentModel）。
 *
 * ## 三条脾气，和 keystaticGroupFill.ts 是同一套（那边先踩的）
 *
 *   ① **必须轮询，不许监听 change。** Keystar 的 Picker 底下那个隐藏 `<select>`
 *      （react-aria 的 HiddenSelect）值会被改，但**不发 change / input 事件**。
 *      改成监听的那天，这个功能会安静地不工作 —— 选了没反应，零报错。
 *   ② **按选项集合认那两格，不认标签文字。** 表单里没有字段名（没 name、没 data、
 *      id 是 react-aria 随机串）。标签文字是能认的，但那是给"输入框"用的招；
 *      两个下拉的**选项 value 集合**本来就是两张封闭登记表，拿它认更准 ——
 *      改了中文标签也不会失效。
 *      ⚠ HiddenSelect 会额外渲一个空 `<option>`，比集合时要把 `""` 滤掉。
 *   ③ **第一次看见不动手。** 打开一条已有条目时当前值是什么就是什么 ——
 *      那一刻"矛盾"也许正是作者要来修的，替他改掉等于把一条历史记录悄悄改了，
 *      而且会把表单弄成已修改状态。只有**人真的动了智能体那一格**才跟。
 *
 * ## 为什么新建页和编辑页都挂（和 groupFill 不同）
 *
 * groupFill 只在新建页动手，因为它**覆盖人正在写的标题**。这一段不一样：它只在
 * 人刚刚换了智能体、而模型和新智能体矛盾时改一格，改的正是那一下动作的直接后果。
 * 编辑页恰恰是最需要它的地方 —— 补标一条老内容时，换了智能体不改模型就是
 * 存下一个不存在的组合，然后下一次构建红在一个看起来无关的地方。
 */
import { AGENT_IDS } from "../config/agents";
import { MODEL_IDS, nextModelFor } from "../config/models";

const TICK_MS = 200;

/**
 * 找选项 value 集合正好等于 `ids` 的那个隐藏 `<select>`。
 * ⚠ react-aria 的 HiddenSelect 头一个是空 `<option>`，滤掉再比 —— 两张登记表里
 *   都不会有空 id（`REGISTRY_ID_RE` 不认空串，哨兵也是有名字的）。
 */
function selectWithValues(ids: readonly string[]): HTMLSelectElement | null {
  const wanted = new Set(ids);
  for (const select of document.querySelectorAll("select")) {
    const values = [...select.options].map(o => o.value).filter(v => v !== "");
    if (values.length === wanted.size && values.every(v => wanted.has(v))) {
      return select;
    }
  }
  return null;
}

/**
 * 往 React 管的 `<select>` 里写值。
 * ★ 直接 `el.value = x` **不行**：React 记着自己那份值，下一次渲染会把它写回去。
 *   要走原型上的 setter 再补一个 `change` 事件（react-aria 的 HiddenSelect 就是靠
 *   它的 `onChange` 把值同步回 Picker 的状态的，可见的那一行字也是那时候才更新）。
 * ★【2026-09-23】导出给 `keystaticGroupPicker.ts` 用（「这一条是…」那一格换成了
 *   自己的搜索 + 分页面板，选中之后就是靠它把值写回那个隐藏 `<select>`）。
 */
export function setSelectValue(select: HTMLSelectElement, value: string): void {
  Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value"
  )?.set?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

export function mountAgentModelLink(): void {
  // 这份配置服务端也会加载（/api/keystatic 那条路由），所以第一个判断是 document。
  if (typeof document === "undefined") return;

  /** 上一拍看到的智能体。`undefined` = 这一页还没看过，**这一拍不算"变了"**（脾气 ③）。 */
  let lastAgent: string | undefined;
  let lastPath = "";

  const tick = () => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      lastAgent = undefined; // 换页了，重新认一次当前值
    }

    const agentSel = selectWithValues(AGENT_IDS);
    const modelSel = selectWithValues(MODEL_IDS);
    if (!agentSel || !modelSel) {
      // 这一页没有这两格（别的集合、列表页、登记表页）。下次再看见时重新认一次。
      lastAgent = undefined;
      return;
    }

    const agent = agentSel.value;
    if (lastAgent === undefined) {
      lastAgent = agent;
      return;
    }
    if (agent === lastAgent) return;
    lastAgent = agent;

    // 判据不在这个文件里：`nextModelFor` 返回 null 就是"讲得通，别动"。
    // ★ 它只修矛盾，从不替人回答 —— 当前是「未标注」时一律返回 null。
    // 换掉时不另外提示：表单上那一行字当场就变了，人看得见；
    // 而选了「我自己」时换成的「未标注」是 schema 唯一允许的值，没什么好商量的。
    const next = nextModelFor(agent, modelSel.value);
    if (next === null || next === modelSel.value) return;
    setSelectValue(modelSel, next);
  };

  window.setInterval(tick, TICK_MS);
}
