/**
 * 从一堆 `.md` 原文里扫出「**组**」—— 后台那个「这一条是…」下拉的数据来源。
 *
 * 【2026-09-21】抽出来是为了能单测：这一段里最容易错的三件事都在这儿，
 * 而它们错了在界面上**都不报错**：
 *   ① 归组的规矩（填了键用键、没填用自己的地址）和 `related.ts` 的 `qaGroupKey()`
 *      对不上 —— 后台按一种规矩分组、站上按另一种，两边都"正常工作"；
 *   ② 挑错"根"那一条 —— 下拉里显示的标题不是这个组真正的题目；
 *   ③ 要带过去的那几格（标题、标的）读漏一个 —— 补的那一份少一格，
 *      而少的那一格恰好是"和别人保持一致"的理由。
 *
 * ★ 零 astro import：`keystatic.config.ts` 在 Astro 之外被 Vite 加载，而测试是裸 tsx 跑的
 *   （理由同 `promptOrigins.ts` / `questionKey.ts`）。
 *   【2026-09-21】多了一条 `./beijingTime` —— 下拉里那个日期要按北京时间显示，
 *   换算的判据全站只许有一处（那个文件），这边抄一次 +8 就是两处各说各话的开始。
 *   那个文件同样零 astro import，裸 tsx 加载得动。
 *
 * ⚠ 这里的 YAML 解析是**最简读法**（一行一个标量），够用是因为这几个键都是
 *   Keystatic 自己写出来的单行标量。要读嵌套结构的那天，别在这儿加正则，换个解析器。
 */

import { utcWallToBeijing } from "./beijingTime";

/** 一组在下拉里长什么样、选中之后要往表单里带什么。 */
export interface ScannedGroup {
  /** 组的键：填了 `questionKey` 用它，没填用自己的地址（和 qaGroupKey 同一条规矩）。 */
  key: string;
  /** 下拉里显示的标题 —— 取这一组**根**那条（地址 == 键）的标题。 */
  label: string;
  /** 这一组里见到过根那条没有。只影响 label 该不该被后来者顶掉。 */
  isRoot: boolean;
  /**
   * 这一组里**最新**那条的 `pubDatetime`（frontmatter 里的原样字符串，
   * Keystatic 写出来的是 `2026-09-21T03:37:00.000Z`）。读不到就是空串。
   *
   * ★ 取的是**组里最新的一条**，不是根那条：【2026-09-21 用户要的】下拉按时间排，
   *   而"刚动过的那个选题"才是下一次最可能要补的那个 —— 根可能是三个月前建的。
   * ⚠ 空串（一条都读不到时间）排在最后：位置得是确定的，
   *   否则同一份内容在不同机器上的排序会不一样（glob 顺序不是承诺）。
   */
  latest: string;
  /** 选中它时要带进表单的那几格：frontmatter 键 → 值。读不到的键**不出现**。 */
  carry: Record<string, string>;
  /**
   * 同上，但**多值**那几格（今天只有 `symbols`：标的那一格【2026-09-22】换成了多选）。
   *
   * ★ 和 `carry` 分开放，不是洁癖：那边的消费方是"往输入框里写字"，这边是
   *   "把勾选框逐个勾上 / 取消"，两种动作在 DOM 上完全不同（见
   *   `src/dev/keystaticGroupFill.ts`）。混成一个 `Record<string, string|string[]>`
   *   的话，类型上分得开、运行时分不开 —— 少判一次的症状是往一个不存在的输入框里
   *   写了个 `"ARM,INTC"`，而那一格屏幕上一个勾都没变。
   * ⚠ 读不到那个键 = 空数组（**不是"不出现"**）：和 `carry` 那边
   *   `source[key] ?? ""` 同一条口径 —— "和那一组保持一致"包括"那一组这一格本来就没勾"。
   */
  carryList: Record<string, string[]>;
}

/** YAML 标量的最简读法：双引号按 JSON 解，单引号只剥引号，裸的原样。 */
export function yamlScalar(raw: string): string {
  const s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    try {
      return JSON.parse(s) as string;
    } catch {
      return s.slice(1, -1);
    }
  }
  if (s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1).replaceAll("''", "'");
  }
  return s;
}

/** 从一份 .md 原文里取 frontmatter 里某个键的单行标量值。 */
function frontmatterValue(front: string, key: string): string | undefined {
  const line = new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m").exec(front)?.[1];
  const value = line === undefined ? undefined : yamlScalar(line);
  return value === undefined || value === "" ? undefined : value;
}

/**
 * 从 frontmatter 里取一个**列表**键（`symbols` 那种）。两种写法都认：
 *
 *     symbols:        symbols: []
 *       - ARM
 *       - INTC
 *
 * 【2026-09-22 加】在它之前这里只有 `frontmatterValue()`（一行一个标量），
 * 而文件头那句「要读嵌套结构的那天，别在这儿加正则，换个解析器」说的是**嵌套** ——
 * 块序列不是嵌套，它仍然是一行一个标量，只是前面多个 `- `。真要读嵌套结构那条仍然成立。
 *
 * ⚠ 认不出来（键在、但值既不是 `[]` 也不是紧跟着的块序列）时返回**空数组**，
 *   和"这个键不存在"同一档。这一格的消费方是"把勾选框勾上"，而空 = 一个都不勾 ——
 *   那正是"读不出来"时最不会造成伤害的方向（顶多少带一格，人自己勾）。
 */
function frontmatterList(front: string, key: string): string[] {
  const lines = front.split(/\r?\n/);
  const head = new RegExp(`^${key}:\\s*(.*)$`);
  const at = lines.findIndex(line => head.test(line));
  if (at < 0) return [];

  const inline = head.exec(lines[at]!)![1]!.trim();
  // 行内流式写法（`symbols: []` / `symbols: [ARM, INTC]`）。Keystatic 写出来的空表
  // 就是 `[]`（`tags: []` 站上一直是这个样子）。
  if (inline.startsWith("[")) {
    return inline
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map(part => yamlScalar(part))
      .filter(Boolean);
  }
  if (inline !== "") return [];

  const out: string[] = [];
  for (let i = at + 1; i < lines.length; i++) {
    const item = /^\s+-\s+(.*)$/.exec(lines[i]!);
    if (!item) break;
    const value = yamlScalar(item[1]!);
    if (value) out.push(value);
  }
  return out;
}

/**
 * @param sources `import.meta.glob(..., { query: "?raw" })` 的产物：路径 → 原文。
 * @param carryKeys 选中一组时要带进表单的**单值**键（title …）。
 * @param listKeys 同上，但**多值**的那几格（symbols）—— 结果在 `carryList` 里。
 *
 * 返回**新的排前面**的组（判据见 `ScannedGroup.latest`）。
 * `_` 开头的文件不算条目（和 content.config.ts 的 glob 同一条规则）。
 *
 * ★【2026-09-21 用户要的】排序从"按标题"换成了"按时间，新的在前"：
 *   下拉是用来"给刚写过的那个选题再补一份"的，按标题排等于每次都要在一列
 *   长得差不多的标题里找。时间在这个下拉里是**唯一有方向的信息**。
 */
export function scanGroups(
  sources: Record<string, string>,
  carryKeys: readonly string[],
  listKeys: readonly string[] = []
): ScannedGroup[] {
  const groups = new Map<string, ScannedGroup>();

  for (const [path, raw] of Object.entries(sources)) {
    const slug = (path.split("/").pop() ?? path).replace(/\.md$/, "");
    if (slug.startsWith("_")) continue;

    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] ?? "";
    const title = frontmatterValue(front, "title") ?? slug;
    // ★ 和 qaGroupKey() 同一条规矩：填了键用键，没填用自己的地址。
    const key = frontmatterValue(front, "questionKey") ?? slug;
    const isRoot = key === slug;
    const pub = frontmatterValue(front, "pubDatetime") ?? "";

    const carry: Record<string, string> = {};
    for (const k of carryKeys) {
      const value = frontmatterValue(front, k);
      if (value !== undefined) carry[k] = value;
    }
    const carryList: Record<string, string[]> = {};
    for (const k of listKeys) carryList[k] = frontmatterList(front, k);

    const seen = groups.get(key);
    // ★ 时间和"标题 / 要带的那几格"**各算各的**：
    //   标题和 carry 以**根**那条为准（组员不许覆盖），
    //   而时间取**全组最新**的那一条 —— 补进来的新一份正是最该把这一组顶上去的东西。
    //   混成一件事的话，"这一组最近动过"就会被根那条的老日期盖住。
    const latest = seen && seen.latest > pub ? seen.latest : pub;
    if (!seen || (isRoot && !seen.isRoot)) {
      groups.set(key, { key, label: title, isRoot, latest, carry, carryList });
    } else {
      seen.latest = latest;
    }
  }

  // 新的在前；一条时间都读不到的（空串）沉到最后，同一天 / 都读不到时按标题兜底 ——
  // 排序必须是**全序**，否则同一份内容在不同机器上的下拉顺序会不一样。
  // ⚠ 时间那一半用**裸比较**，不用 localeCompare：这几个值是 ISO 串
  //   （`2026-09-21T03:37:00.000Z`，Keystatic 写出来的），按字典序就是按时间序，
  //   而 localeCompare 对数字和标点有自己的一套规矩（区域设置一变就可能换顺序）。
  const newerFirst = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);
  return [...groups.values()].sort(
    (a, b) =>
      newerFirst(a.latest, b.latest) ||
      a.label.localeCompare(b.label, "zh-Hans-CN")
  );
}

/**
 * 下拉选项后面缀的那个日期（`（09-21）`）—— 传 `ScannedGroup.latest` 进来。
 *
 * 【2026-09-21 用户要的】下拉按时间排（新的在前）。★ 光排序是**看不见**的：
 * 一列标题，谁也说不出它是按什么排的；同一只票写过两轮时更分不出哪个是哪个。
 * 缀上日期，顺序就成了屏幕上看得见的东西。
 *
 * ★ 显示成**北京时间**，和后台那两格时间同一个口径（盘上存的是 UTC）——
 *   后台里所有时间读数都是北京时间，这里另来一套就是自找混乱。
 *   ⚠ 这不是"差几小时"那么轻：UTC `2026-09-21T20:00Z` 在后台那两格里显示的是
 *   **09-22 04:00**，不换算的话这儿会印 09-21 —— 同一条内容在同一个页面上
 *   两个日期，而两处都没错。
 * ⚠ 读不到时间（空串、或者手写的怪格式）就**什么都不缀**，不是「（未知）」：
 *   那一组已经沉到列表最后了，再挂一个日期形状只会让人以为它有时间。
 */
export function groupDateSuffix(latest: string): string {
  // ISO 串（2026-09-21T03:37:00.000Z）→ 墙钟（到分钟）→ 北京时间。
  // 认不出来的，utcWallToBeijing 原样返回，下面那条正则接着把它挡掉。
  const beijing = utcWallToBeijing(latest.slice(0, 16));
  const date = /^\d{4}-(\d{2}-\d{2})T\d{2}:\d{2}$/.exec(beijing);
  return date ? `（${date[1]}）` : "";
}
