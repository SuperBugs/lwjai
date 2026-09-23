/**
 * 标的表 —— 「这个站一共写过哪几只票，它们分别叫什么名字」。
 * 数据在 `src/data/symbols.json`，后台左侧「标的」那一页写它。【2026-09-22 用户要的】
 *
 * ## 为什么要有这张表（在这之前每条内容自己填代码 + 中文名 + 英文名）
 *
 * 直接的理由是用户那句话：**一条问答可能涉及好几只票**（「CPU 为什么暴涨」同时讲
 * ARM / INTC / AMD），所以那一格得能多选。而 Keystatic 的多选（`fields.multiselect`，
 * 就是标签那一格那排药丸）**必须有一张封闭的选项表** —— 没有表就只能是
 * "一行一只票的可增删小表单"，那不是用户要的形状。
 *
 * 顺带解决的是一件老问题：**公司名原来是每条内容各填一份**。同一只票在两条里写成
 * 两个名字不会有任何报错，`/s/<代码>` 那一页只能"以最近写的那条为准"
 * （`getUniqueSymbols.ts` 里那段 latest-wins 就是为此存在的）。更要命的是多选之后
 * 这条路根本走不通：一格里勾了三只票，名字没地方逐只填。
 * **所以名字搬进这张表，条目上只留代码。**
 *
 * ## 和标签表刻意不一样的一处：表外的值怎么办
 *
 * | | 标签 | 标的 |
 * |---|---|---|
 * | 后台 | 从表里勾 | 从表里勾 |
 * | 构建期遇到表外的值 | 红 | 红 |
 * | **粘贴导入遇到表外的值** | **丢掉并报一行** | **自动加一行并报一行** |
 *
 * ★ 最后一格是故意分开的，理由在"丢掉它的代价"上：一个模型现编的标签丢掉只是少一个
 *   分类；而**丢掉标的等于把这条内容从 `/s/<代码>` 上整个摘出去** —— 那正是它最该
 *   出现的地方。而且标的代码是**机器可验的标识符**（`SYMBOL_RE`），不像标签那样
 *   会长出「财报」「财报解读」这种同义写法，自动登记不会把表撑坏。
 *   判据是下面的 `withSymbolRow()`，两个导入口（CLI 和 /_import）读同一份。
 *
 * ## 这张表上公网，所以过闸
 *
 * 名字渲染在标的芯片、`/s` 两级页面、分享卡、导出的 .md、发帖文案里 —— 也就是
 * `symbolName` / `symbolNameEn` 原来那几处。它们原来在 `scripts/gate/inspect.ts` 的
 * subject 白名单里（「特斯拉（example_server 自动带出）」那种），**搬家之后闸门的
 * 覆盖不许断**：路径登记在 `src/config/collections.ts` 的 `SCANNED_DATA_FILES`，
 * 三道闸都扫它（`inspectDataJson` 把 JSON 里所有字符串值捞出来交给 `scan()`）。
 *
 * ★ 零 astro import（理由同 tags.ts / registry.ts）：这个文件要被 Astro、
 *   Vite 浏览器端（keystatic.config.ts）和裸 tsx（测试、导入 CLI）三处加载。
 */
import raw from "../data/symbols.json";
import { SYMBOL_RE, symbolKey } from "./symbol";

const FILE = "src/data/symbols.json";

/** 表里的一行。`code` 是身份（进 frontmatter，定了不改），两个名字随时能改。 */
export interface SymbolRow {
  /** 交易代码，大写原样（`BRK.B` 保留那个点）。 */
  code: string;
  /**
   * 公司中文名。**空 = 不知道**（站上只印代码，不编一个）——
   * 今天站上真有这一档（`CRWV` 一开始就只有代码）。
   */
  name?: string;
  /** 公司英文名称（Oracle / Qualcomm Incorporated）。空同上。 */
  nameEn?: string;
}

function fail(where: string, msg: string): never {
  throw new Error(
    `标的表坏了（${where}）：${msg}。去后台「标的」那一页改，或者直接改 ${FILE}。`
  );
}

/**
 * 把一份原始 JSON 验成标的表。**验不过就抛**（宁可红：一张读不进来的表如果被静默
 * 当成空表，站上每一条内容的标的会一起变成"表里没有"，而构建全绿）。
 *
 * 拆成纯函数是为了让 `scripts/gate/symbols.test.ts` 能喂坏数据进来看它红不红
 * （docs/engineering-notes.md 坑 17：不故意破坏一次，"必须抛"那条用例永远绿）。
 */
export function parseSymbols(
  input: unknown,
  where: string = FILE
): SymbolRow[] {
  if (!input || typeof input !== "object") fail(where, "顶层不是对象");
  const list = (input as Record<string, unknown>).symbols;
  if (!Array.isArray(list)) fail(where, "symbols 不是数组");

  const out: SymbolRow[] = [];
  /** 归一后的代码 → 原文。`/s/<代码>` 是按归一后的写法算的，见下面那段。 */
  const seen = new Map<string, string>();

  list.forEach((item, i) => {
    const at = `symbols[${i}]`;
    if (!item || typeof item !== "object") fail(where, `${at} 不是对象`);
    const o = item as Record<string, unknown>;
    const code = typeof o.code === "string" ? o.code.trim().toUpperCase() : "";
    if (!code) fail(where, `${at} 没填代码`);
    if (!SYMBOL_RE.test(code)) {
      fail(
        where,
        `${at} 的代码「${code}」不像美股代码 —— 要像 TSLA / BRK.B 这样：` +
          `1~5 个大写字母，后面最多跟一段 .A / -B 的类别股后缀`
      );
    }
    // ★ 判重用归一后的写法（symbolKey）：`BRK.B` 和 `BRK-B` 在 /s 上是**同一页**
    //   （`symbolSlug()` 把点压成连字符），表里同时留着两行就是两行抢同一个地址，
    //   而后台、构建、闸门四处全绿 —— 和标签表里「ETF / etf」那一条同一个形态。
    const key = symbolKey(code);
    const dup = seen.get(key);
    if (dup !== undefined) {
      fail(
        where,
        dup === code
          ? `「${code}」出现了两次`
          : `「${code}」和「${dup}」在地址里是同一只票（/s/${key.toLowerCase()}），留一个`
      );
    }
    seen.set(key, code);

    const name = typeof o.name === "string" ? o.name.trim() : "";
    const nameEn = typeof o.nameEn === "string" ? o.nameEn.trim() : "";
    const row: SymbolRow = { code };
    // 空串折成"没有这个键"：`""` 和 undefined 在页面和判据上必须只有一种写法，
    // 否则 deepEqual(磁盘那份, 读进来那份) 这类对账会在一个无意义的差别上红。
    if (name) row.name = name;
    if (nameEn) row.nameEn = nameEn;
    out.push(row);
  });

  return out;
}

/** 当前这一份。import 时就验过了。顺序 = 后台里那张表的顺序 = 勾选框的顺序。 */
export const SYMBOLS: readonly SymbolRow[] = parseSymbols(raw);

/** 进 frontmatter 的那几个代码，**原样**（表里怎么写就怎么存）。 */
export const SYMBOL_CODES: readonly string[] = SYMBOLS.map(s => s.code);

const BY_KEY = new Map(SYMBOLS.map(s => [symbolKey(s.code), s]));
const CODE_SET = new Set(SYMBOL_CODES);

/**
 * 按代码查这一行。查不到返回 undefined —— 调用方自己决定怎么说
 * （站上的做法一律是"只印代码，不编名字"）。
 *
 * ★ 查的时候按 `symbolKey()` 归一，所以手写的 `brk-b` 也找得到那一行；
 *   但**构建期的成员判定（下面 `unknownSymbols`）是字面量比对**，见那里的注释。
 */
export function findSymbolRow(code: string | undefined): SymbolRow | undefined {
  return code ? BY_KEY.get(symbolKey(code)) : undefined;
}

/** 这只票在站上叫什么 —— 查得到就用表里的名字，查不到就只有代码。 */
export function symbolNames(code: string): {
  code: string;
  name?: string;
  nameEn?: string;
} {
  const row = findSymbolRow(code);
  return { code: row?.code ?? code, name: row?.name, nameEn: row?.nameEn };
}

/**
 * 后台那一格的选项。标签上把名字缀在代码后面（`ARM Arm`）——
 * 一列光秃秃的代码在勾选的时候认不出是哪家，而这一格恰恰是"多选"的。
 * 名字没填的就只有代码，**不补一个「未命名」**：那是在给"还没填名字"发明一个名字。
 */
export function symbolOptions(): { label: string; value: string }[] {
  return SYMBOLS.map(s => ({ label: symbolOptionLabel(s), value: s.code }));
}

/** 一行在下拉 / 勾选框里长什么样。后台那一格和自动填那段脚本读**同一个**
 *  —— 两处各写一份的那天，脚本就认不出那一格了（判据是"选项集合正好对得上"）。 */
export function symbolOptionLabel(row: SymbolRow): string {
  return [row.code, row.name].filter(Boolean).join(" ");
}

/**
 * 这几个代码里，哪些**不在表里** —— 全站唯一判据。
 *
 * 读它的地方：`src/content.config.ts` 两个集合的 schema（构建期拦）、
 * 粘贴导入（表外的那几个由 `withSymbolRow()` 自动登记，不是丢掉，见文件头）。
 *
 * ★ **字面量比对，不走 `symbolKey()` 归一**（和 `findSymbolRow` 刻意不一样）：
 *   后台那一格是从表里勾的，存下来的一定是表里那个写法。手写一个 `BRK-B` 而表里是
 *   `BRK.B` 时要红 —— 归一放行的话，站上会同时存在两种写法，而后台**打不开**那一条
 *   （`multiselect` 的 parse 对不在选项里的值直接抛）。构建绿、后台红是最难查的一种。
 */
export function unknownSymbols(codes: readonly string[]): string[] {
  return codes.filter(code => !CODE_SET.has(code));
}

/** 构建期拦下来时说的那句话 —— schema 和导入口共用，措辞只写一份。 */
export function unknownSymbolsMessage(unknown: readonly string[]): string {
  return (
    `这几个标的代码不在标的表里：${unknown.map(c => `「${c}」`).join("、")}。\n` +
    `去后台左侧「标的」那一页加一行，或者把条目上的代码换成表里已有的` +
    `（现在表里有：${SYMBOL_CODES.join(" / ") || "一个都没有"}）。\n` +
    `⚠ 大小写和那个点也算数：表里是 BRK.B 就得写 BRK.B —— 写成 BRK-B 构建能过，` +
    `而那一条在后台打不开。`
  );
}

/**
 * 往一份原始表 JSON 里**加一行**，返回新的那一份（不改入参）。
 * 已经有这只票（按 `symbolKey()` 归一比）就原样返回 —— 幂等。
 *
 * ★ 这是**粘贴导入**那条路专用的：模型交上来一只表里还没有的票时，
 *   与其把标的丢掉（那条内容就从 `/s/<代码>` 上消失了），不如替它登记一行，
 *   并在报告里说一句。理由和"为什么标签不这么做"写在文件头那张表底下。
 * ★ 判据只有这一处：CLI（`scripts/content/import.ts`）和 `/_import`
 *   （`src/dev/import-run.ts`）两个写盘口读它，各写一份的那天两条路就会长出
 *   两种表结构，而 `parseSymbols()` 只会在其中一条上红。
 * ⚠ 新行**加在最后**，不按字母序插：表里的顺序是人在后台拖出来的（= 勾选框的顺序），
 *   自动插队等于替人重排他排过的东西。
 */
export function withSymbolRow(input: unknown, row: SymbolRow): unknown {
  const rows = parseSymbols(input, "（导入时要加一行的那份）");
  if (rows.some(r => symbolKey(r.code) === symbolKey(row.code))) return input;
  const code = row.code.trim().toUpperCase();
  const added: SymbolRow = { code };
  if (row.name?.trim()) added.name = row.name.trim();
  if (row.nameEn?.trim()) added.nameEn = row.nameEn.trim();
  return { ...(input as Record<string, unknown>), symbols: [...rows, added] };
}
