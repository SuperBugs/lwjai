/**
 * 只给搜索引擎看的那几格 —— 【2026-09-24 用户要的】「SEO 优化，增加美股分析、AI 研报等关键词」。
 *
 * 三样：详情页的 `<title>`（`detailSeo`）、列表页的 `<title>` / description（`listSeo`）、
 * 每一页的 `<meta name="keywords">`（`mergeKeywords`，Layout.astro 调）。措辞全在 i18n 的
 * `t.seo`，这里只拼。零 astro import：`scripts/gate/seoKeywords.test.ts` 用裸 tsx 直接跑它。
 *
 * ★ 研究稿的标题多半就是一个代码（`AAPL`），`<title>` 原来是「AAPL | 牢玩家」——
 *   搜「苹果 研报」的人一个字都对不上，而同一只票三个智能体各写一份，三页同名。
 *   现在补上代码和中文名（`symbolSubject`），再带上是哪个智能体写的。
 * ★ `<title>` 里的「AI」**跟着 `provenanceOf()` 走**（「是不是 AI 生成的」全站唯一判据）：
 *   `agent: human` 的研究稿标成「AI 研报」是替它认领出身。人写的和还没标的都用 `other`
 *   那一版 —— 它对谁写的不下断言，不是把两档压成一档（三档照旧画在页面的芯片上）。
 */

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { tplStr } from "../i18n/format";
import type { UIStrings } from "../i18n/types";
import { findAgent } from "../config/agents";
import { provenanceOf } from "../config/provenance";
import { symbolNames } from "../config/symbols";

dayjs.extend(utc);
dayjs.extend(timezone);

export type SeoWords = UIStrings["seo"];
export type SeoCollection = keyof SeoWords["detail"];

/**
 * 合并几张关键词表：去掉首尾空白和空项、去重（不分大小写，留第一次出现的写法）、保持顺序。
 * 调用方把页面自己的（标的、标签）排在站点那张前面 —— 越具体的越靠前。
 */
export function mergeKeywords(
  ...lists: readonly (readonly (string | undefined)[])[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const word = raw?.trim();
      if (!word) continue;
      const key = word.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(word);
    }
  }
  return out;
}

/** 几只票各自能被搜到的名字：代码、中文名、英文名（名字只从标的表来，`symbolNames()`）。 */
export function symbolKeywords(codes: readonly string[]): string[] {
  return codes.flatMap(code => {
    const { name, nameEn } = symbolNames(code);
    return [code, name ?? "", nameEn ?? ""];
  });
}

/**
 * `hay` 里是不是已经说过 `needle`（不分大小写）。纯 ASCII 的按词边界比：
 * 否则一个字母的代码（`A` 是安捷伦）会被随便哪个英文单词"包含"掉。
 */
function mentions(hay: string, needle: string): boolean {
  const h = hay.toLowerCase();
  const n = needle.toLowerCase();
  if (!/^[\x20-\x7e]+$/.test(n)) return h.includes(n);
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(h);
}

/**
 * 研究稿和 `/s/<代码>` 的 `<title>` 主语：**代码 ＋ 中文名 ＋ 标题**，各段能不印就不印 ——
 * 谁的信息多谁留下（同 `sharePost.ts` 第一行那条规矩）：
 *   `AAPL` ＋ AAPL / 苹果            → 「AAPL 苹果」（标题就是代码）
 *   `Oracle` ＋ ORCL / 甲骨文        → 「ORCL 甲骨文 Oracle」
 *   `ORCL｜甲骨文 投资可行性分析`   → 原样（标题包着代码和名字）
 * 英文名不进（`<title>` 的长度留给关键词，英文名在 keywords 里）；
 * 没勾票或者勾了好几只（研究稿至多一只，那一档是兜底）就是标题本身。
 */
export function symbolSubject(
  title: string,
  symbols: readonly { code: string; name?: string }[]
): string {
  const head = title.trim();
  if (symbols.length !== 1) return head;
  const parts: string[] = [];
  for (const raw of [symbols[0]!.code, symbols[0]!.name, head]) {
    const part = raw?.trim();
    if (!part || parts.some(p => mentions(p, part))) continue;
    for (let i = parts.length - 1; i >= 0; i--) {
      if (mentions(part, parts[i]!)) parts.splice(i, 1);
    }
    parts.push(part);
  }
  return parts.join(" ");
}

/** 详情页要的那几格 frontmatter。type 而不是 interface：`provenanceOf()` 收的是松散记录。 */
export type DetailSeoData = {
  title: string;
  pubDatetime: Date;
  /** 条目自己那格时区（几乎总是空）。填了就用它，同 `Datetime.astro`。 */
  timezone?: string;
  symbols?: readonly string[];
  tags?: readonly string[];
  agent?: string;
};

export type DetailSeoContext = {
  siteTitle: string;
  /** `site.timezone`。 */
  timezone: string;
  /** `t.post.dateOnlyFormat` —— 和列表卡片上那个日期同一个格式串，同一个读数。 */
  dateFormat: string;
};

/**
 * 详情页的 `<title>` 和 keywords（keywords 不含站点那张，Layout 会接上）。
 *
 * `{{date}}` 是**创建**那天（`pubDatetime`，按站点时区），和列表卡片上印的是同一个日期。
 * 研究稿的模板用它：同一个智能体隔几天再写同一只票，不带日期的话两页同名
 * （2026-09-24 站上就有四对：DXYZ、HOOD）。
 */
export function detailSeo(
  collection: SeoCollection,
  data: DetailSeoData,
  words: SeoWords,
  ctx: DetailSeoContext
): { title: string; keywords: string[] } {
  const symbols = data.symbols ?? [];
  const subject =
    collection === "posts"
      ? symbolSubject(data.title, symbols.map(symbolNames))
      : data.title.trim();
  const agentName =
    provenanceOf(collection, data) === "ai"
      ? findAgent(data.agent)?.name
      : undefined;
  const date = dayjs(data.pubDatetime)
    .tz(data.timezone ?? ctx.timezone)
    .format(ctx.dateFormat);
  const template = words.detail[collection];
  const chosen =
    typeof template === "string"
      ? template
      : agentName
        ? template.ai
        : template.other;
  return {
    title: `${tplStr(chosen, { subject, agent: agentName ?? "", date })} | ${ctx.siteTitle}`,
    keywords: mergeKeywords(symbolKeywords(symbols), data.tags ?? [], [
      agentName,
    ]),
  };
}

/** 列表页：`<title>` 是 `t.seo.lists.<集合>`，description 是它接上页面上那句说明（说明只有一份）。 */
export function listSeo(
  lead: string,
  pageDesc: string,
  words: SeoWords,
  siteTitle: string
): { title: string; description: string } {
  return {
    title: `${lead} | ${siteTitle}`,
    description: tplStr(words.listDesc, { lead, desc: pageDesc }),
  };
}
