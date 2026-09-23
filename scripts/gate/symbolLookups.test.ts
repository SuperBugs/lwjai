/**
 * 「去原始来源核对」外链（`src/config/symbolLookups.ts`）的测试。
 *
 * 钉的是**代码换算**：EDGAR / Yahoo 认 `BRK-B`，Nasdaq 认 `brk.b`。
 * 换算错的表现是链接能点开、但落在一个"找不到"页 —— 构建、页面、闸门三处零症状。
 * 用例喂的是 schema 口径的代码（content.config.ts 的 SYMBOL_RE 允许 `BRK.B` / `RDS-A`）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { SYMBOL_LOOKUPS, symbolLookupLinks } from "../../src/config/symbolLookups";

const byId = (symbol: string) =>
  Object.fromEntries(symbolLookupLinks(symbol).map(l => [l.id, l.url]));

test("每家来源都是 https 直达地址，代码真的在地址里", () => {
  for (const link of symbolLookupLinks("TSLA")) {
    assert.match(link.url, /^https:\/\//, `${link.id} 不是 https`);
    assert.match(link.url, /tsla/i, `${link.id} 的地址里没有代码：${link.url}`);
    assert.ok(link.name.trim().length > 0, `${link.id} 没有显示名`);
  }
  assert.equal(
    new Set(SYMBOL_LOOKUPS.map(l => l.id)).size,
    SYMBOL_LOOKUPS.length,
    "id 不许重复"
  );
});

test("普通代码：EDGAR / Yahoo 大写，Nasdaq 小写", () => {
  const u = byId("TSLA");
  assert.match(u.edgar!, /CIK=TSLA(&|$)/);
  assert.match(u.yahoo!, /\/quote\/TSLA\/$/);
  assert.match(u.nasdaq!, /\/stocks\/tsla$/);
});

test("类别股 BRK.B：EDGAR / Yahoo 用连字符，Nasdaq 小写保留点", () => {
  const u = byId("BRK.B");
  assert.match(u.edgar!, /CIK=BRK-B(&|$)/, "EDGAR 认 BRK-B");
  assert.match(u.yahoo!, /\/quote\/BRK-B\/$/, "Yahoo 认 BRK-B");
  assert.match(u.nasdaq!, /\/stocks\/brk\.b$/, "Nasdaq 认 brk.b");
});

test("已经带连字符的类别股 RDS-A 不会被再改一次", () => {
  const u = byId("RDS-A");
  assert.match(u.edgar!, /CIK=RDS-A(&|$)/);
  assert.match(u.yahoo!, /\/quote\/RDS-A\/$/);
  assert.match(u.nasdaq!, /\/stocks\/rds-a$/);
});
