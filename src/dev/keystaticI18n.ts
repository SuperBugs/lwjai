/**
 * 把后台那些**悬停提示**里的英文换成中文。
 *
 * 【2026-09-21 用户要的】「后端管理页面的所有这个 hover…还是英文」。
 *
 * ## 为什么只能在 DOM 这一层做
 *
 * Keystatic 的 config 有一个 `locale` 入参，但它喂的是 **react-aria** 的 locale
 * （日期怎么排、读屏念什么、要不要 RTL），**不翻 Keystatic 自己的界面字**：
 * 「Reset changes」「Delete entry…」这些在 `@keystatic/core` 的打包产物里就是
 * 写死的字面量（`label: "Reset changes"`），没有任何 i18n 入口。
 * `zh-CN` 在它的 locale 清单里是有的 —— 但设上去这几个串一个都不会变。
 *
 * ## 规矩
 *
 *   - **只翻 `role="tooltip"` 里面的字。** 按钮本身的可见文案、菜单项、Save
 *     这些不动：那是 React 自己的渲染结果，去改它就是和 React 抢同一个节点。
 *   - **按文本节点逐个翻，整段不认就整段不动。** 实测「加粗」那条 tooltip 是
 *     三个文本节点：`Bold` / `Ctrl+` / `B` —— 逐个翻正好把快捷键原样留下，
 *     不用为"标签后面可能跟着快捷键"写任何特例。
 *   - **词表里没有的，原样留着英文。** 认不出就留空 / 留一个问号的话，
 *     那是把"我不认识这个串"伪装成"这里本来就没有提示"（docs/engineering-notes.md 第二节）。
 *     所以词表只收**实测真的在后台出现过的串**（照着 DOM 抄的，不是照着上游源码猜的），
 *     漏掉的那些最坏还是今天这个样子：英文，但看得见。
 *
 * ★ 这件事的前提是那些 tooltip **能正常显示**。在这之前它们全是一个 15×15 的灰方块 ——
 *   `keystaticHelp.ts` 把它们当成字段说明收成角标了（那个 bug 和这个文件是同一天修的，
 *   判据在那边的 `collapse()` 里）。
 */

/**
 * 英文 → 中文。**只收实测见过的串。**
 *
 * 收集方式：在后台编辑页上把所有图标按钮的 `textContent` / `aria-label` 和
 * 当时弹出来的 tooltip 全部 dump 了一遍 —— 下面这些就是那次 dump 的结果。
 * ⚠ 加词条之前先去后台把那个串**照着 DOM 抄下来**（连省略号 `…` 一起，
 *   它是 U+2026 不是三个点），对不上的话这一条永远不会命中，而且零报错。
 */
const DICT = new Map<string, string>([
  // 条目编辑页右上角那一排
  ["Reset changes", "撤销改动"],
  ["Delete entry…", "删除这一条…"],
  ["Copy entry", "复制到剪贴板"],
  ["Paste entry", "从剪贴板粘贴"],
  ["Duplicate entry…", "复制成新的一条…"],
  ["Preview", "预览"],
  // 地址那一格旁边的 ↻
  ["Regenerate", "重新生成"],
  ["regenerate", "重新生成"],
  // 正文编辑器那一排
  ["Bold", "加粗"],
  ["Italic", "斜体"],
  ["Strikethrough", "删除线"],
  ["Code", "行内代码"],
  ["Clear formatting", "清除格式"],
  ["Bullet list", "无序列表"],
  ["Numbered list", "有序列表"],
  ["Divider", "分隔线"],
  ["Quote", "引用"],
  ["Code block", "代码块"],
  ["Table", "表格"],
  ["Image", "图片"],
  ["Text block", "段落样式"],
  // 外壳
  ["theme", "主题"],
  ["Open app navigation", "打开导航"],
  ["Close app navigation", "收起导航"],
]);

/**
 * 认识就给中文，不认识返回 `undefined`（**不是空串**）——
 * 调用方拿 `undefined` 的意思是"别动这个节点"，拿空串会把原文抹掉。
 */
export function translate(text: string): string | undefined {
  return DICT.get(text.trim());
}

/** 词表里一共有多少条。给测试用，免得它自己再数一遍。 */
export const DICT_SIZE = DICT.size;

/** 把一个 tooltip 里认得出的文本节点换成中文。导出只是为了能单测。 */
export function translateTooltip(tip: Element): void {
  const walker = document.createTreeWalker(tip, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const zh = translate(node.nodeValue ?? "");
    // ⚠ 相同就不写：写一次就是一次 characterData 变更，
    //   而下面那个 observer 盯着同一棵树。
    if (zh !== undefined && node.nodeValue !== zh) node.nodeValue = zh;
  }
}

export function mountTooltipI18n(): void {
  // 这份配置服务端也会加载（/api/keystatic 那条路由），所以第一个判断是 document。
  if (typeof document === "undefined") return;

  const apply = () => {
    for (const tip of document.querySelectorAll('[role="tooltip"]')) {
      translateTooltip(tip);
    }
  };

  /**
   * tooltip 是 React 在 portal 里现挂现拆的，所以只能盯着 body 的子树。
   *
   * ★ 只在"真的多出了一个 tooltip"时才动手：后台整个是编辑器，正文里敲一个字
   *   就是一串 DOM 变更，每一次都去全表扫一遍是白烧 CPU。
   * ⚠ 不用轮询（别的几段脚本用的是轮询）：tooltip 是悬停才出现、一两百毫秒就够人
   *   读到的东西，轮询会让它**先闪一下英文再变中文**。这一处要的是"挂上去那一刻就对"。
   */
  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const added of record.addedNodes) {
        if (!(added instanceof HTMLElement)) continue;
        if (
          added.matches('[role="tooltip"]') ||
          added.querySelector('[role="tooltip"]')
        ) {
          apply();
          return;
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  apply();
}
