/**
 * 标的的「原始来源」直达链接 —— SEC EDGAR / Yahoo Finance / Nasdaq。
 *
 * 站上每一页免责都写着「每个数字都请自己回原始来源核对」，这张表就是把那条路
 * 铺到读者脚下：标的页和详情页上的「去原始来源核对」行读它。纯外链、零服务端、零密钥。
 *
 * ## 代码形态各家不一样，别拿一个字符串到处贴
 *
 *   - EDGAR 和 Yahoo 认 `BRK-B`（连字符）；
 *   - Nasdaq 认 `brk.b`（小写、保留点）。
 *   schema 里的 `symbol` 是 `BRK.B` 这种写法（content.config.ts 的 SYMBOL_RE），
 *   所以每家各自换算一次。换算错的表现是**链接能点开、但落在一个"找不到"页**——
 *   构建、页面、闸门三处零症状，`scripts/gate/symbolLookups.test.ts` 钉着换算。
 *
 * ★ 零 import：这张表要能被裸 tsx 的测试直接加载。
 * ⚠ 别和 content.config.ts 里的 `SYMBOL_SOURCES` 搞混 —— 那个是"标的是怎么认出来的"
 *   （subject_line / title / manual / unknown），和这里的"去哪儿核对"不是一回事。
 */

export type SymbolLookup = {
  /** 稳定标识，测试按它认人。 */
  id: string;
  /** 页面上的名字。 */
  name: string;
  /** 给一个 schema 口径的代码（`TSLA` / `BRK.B`），返回该站的直达地址。 */
  url: (symbol: string) => string;
};

/** `BRK.B` → `BRK-B`。EDGAR 和 Yahoo 的类别股写法。 */
const dashed = (symbol: string) =>
  symbol.trim().toUpperCase().replace(/\./g, "-");

export const SYMBOL_LOOKUPS: readonly SymbolLookup[] = [
  {
    id: "edgar",
    name: "SEC EDGAR",
    // 老式 browse-edgar 的 CIK 参数直接认代码（EDGAR 自己把代码解析成 CIK）。
    url: symbol =>
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(dashed(symbol))}&owner=include&count=40`,
  },
  {
    id: "yahoo",
    name: "Yahoo Finance",
    url: symbol =>
      `https://finance.yahoo.com/quote/${encodeURIComponent(dashed(symbol))}/`,
  },
  {
    id: "nasdaq",
    name: "Nasdaq",
    url: symbol =>
      `https://www.nasdaq.com/market-activity/stocks/${encodeURIComponent(symbol.trim().toLowerCase())}`,
  },
];

export type SymbolLookupLink = { id: string; name: string; url: string };

/** 一只票的全部直达链接，按上表顺序。 */
export function symbolLookupLinks(symbol: string): SymbolLookupLink[] {
  return SYMBOL_LOOKUPS.map(l => ({
    id: l.id,
    name: l.name,
    url: l.url(symbol),
  }));
}
