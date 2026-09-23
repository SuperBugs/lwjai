/**
 * Google Fonts 按字子集（`src/utils/googleFontSubset.ts`）的纯函数测试。
 * 不发网络请求；CSS 样本是 2026-09-20 用 LEGACY_UA 实际取回来的形状。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCssUrl,
  extractFontFaces,
  GOOGLE_FONT_FAMILY,
  SATORI_FORMATS,
  uniqueChars,
} from "../../src/utils/googleFontSubset";

const SAMPLE_CSS = `@font-face {
  font-family: 'Noto Sans SC';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/l/font?kit=AAA&skey=1&v=v40) format('woff');
}
@font-face {
  font-family: 'Noto Sans SC';
  font-style: normal;
  font-weight: 700;
  src: url(https://fonts.gstatic.com/l/font?kit=BBB&skey=1&v=v40) format('woff');
}
`;

test("uniqueChars：去重、去空白、顺序无关（同一批字 = 同一个缓存键）", () => {
  assert.equal(uniqueChars("特斯拉 特斯拉", "牢玩家"), uniqueChars("牢玩家", "拉斯特"));
  assert.ok(!uniqueChars("a b\nc").includes(" "));
});

test("buildCssUrl：家族名空格转加号，字重升序，text 做了百分号编码", () => {
  const url = buildCssUrl(GOOGLE_FONT_FAMILY, [700, 400], "牢玩家");
  assert.match(url, /^https:\/\/fonts\.googleapis\.com\/css2\?family=Noto\+Sans\+SC:wght@400;700&text=/);
  assert.ok(url.endsWith(encodeURIComponent("牢玩家")));
});

test("extractFontFaces：两种字重各一个 woff 地址，且都是 satori 认的格式", () => {
  const faces = extractFontFaces(SAMPLE_CSS);
  assert.deepEqual(faces.map(f => f.weight), [400, 700]);
  assert.ok(faces.every(f => SATORI_FORMATS.has(f.format)));
  assert.match(faces[1]!.url, /kit=BBB/);
});

test("extractFontFaces：woff2 不在 satori 认的格式里 —— 那是 UA 没起作用的症状", () => {
  const faces = extractFontFaces(SAMPLE_CSS.replaceAll("format('woff')", "format('woff2')"));
  assert.equal(faces.length, 2);
  assert.ok(faces.every(f => !SATORI_FORMATS.has(f.format)));
});

test("extractFontFaces：拿到一段不是 CSS 的东西（限流页、HTML）返回空数组，不抛", () => {
  assert.deepEqual(extractFontFaces("<html>Too Many Requests</html>"), []);
  assert.deepEqual(extractFontFaces(""), []);
});
