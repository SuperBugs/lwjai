/**
 * RSS 那几处的钉子 —— 【2026-09-21 给 feed 加浏览器预览页那天立的】。
 *
 * 这一批全是**零症状**的形态：坏了之后 feed 照常 200、站照常构建、
 * 订阅者那边也大多没反应，只有"点开 /rss.xml 的那个人"或者"订了分支 feed 的那个人"
 * 撞得到。分三类：
 *
 *   - **样式表接线**：两条 feed 都得挂，路径必须根绝对。
 *     只挂主 feed 的话 `/s/<代码>/rss.xml` 还是裸 XML，而主 feed 一切正常；
 *     写成相对路径的话浏览器取 `/s/<代码>/rss.xsl` → 404 → **静默**回落到裸 XML。
 *   - **xmlns 和 atom: 前缀成对**：这一条是里面最贵的。`customData` 里用了
 *     `atom:` 而 `xmlns` 没传，整份 feed 就是**格式错误的 XML** ——
 *     不是少一条内容，是每一个订阅者的阅读器当场解析失败。
 *   - **那一页自己**：public/rss.xsl 得真的在（不在 = 两条 feed 指向 404）、
 *     它读 self 地址的 XPath 得和 feed 里写的 `rel` 对得上、里面不许有脚本。
 *
 * ⚠ 断言前**先剥 XML 注释**：那个 .xsl 的文件头里逐字写着
 *   `<atom:link rel="self">`、`/rss.xsl` 这些串（在解释为什么要这么做），
 *   不剥的话把真正的 XPath 删掉测试照样绿 —— 和 seo.test.ts 剥 JS 注释同一个理由。
 *
 * ⚠ 测不到的那一半（和 docs/deploy.md 2.2 那行构建命令同一个形态）：
 *   Cloudflare 把 `.xsl` 按什么 Content-Type 发出去。浏览器只在它是 XML 类
 *   （`application/xslt+xml` / `text/xml` 之类）时才应用样式表，是别的就**静默**
 *   回落到裸 XML。上线后 curl 一次：
 *     curl -sI https://lwj.ai/rss.xsl | grep -i content-type
 *
 * 破坏实跑过（2026-09-21，docs/engineering-notes.md 坑 17 那条纪律）：主 feed 去掉 stylesheet、
 * 分支 feed 去掉 stylesheet、feedStylesheet 改成相对路径 "rss.xsl"、
 * 路由里把路径写死成 "/rss.xsl"、分支 feed 去掉 xmlns 只留 customData、
 * 主 feed 去掉 customData、selfLink 的 rel 改成 alternate、
 * .xsl 的 XPath 改成 @rel='alternate'、删掉那份样式表 —— 九处各自那条都红了，
 * 还原回来又全绿。
 *
 * 复制按钮那一批同样实跑过（2026-09-21 晚些时候加的）：按钮去掉 hidden、
 * 脚本去掉 btn.hidden = false、把它挪到能力检查前面、writeText 只接成功分支、
 * 提示语去掉 hidden、地址格去掉 user-select: all —— 六处各自那条都红了。
 *
 * ⚠ 那一轮里有一处**第一遍是绿的，而错的是破坏用例自己**：拿
 *   `replace('rel="self"', …)` 去改 feedItems.ts，换掉的是**注释里**那个
 *   `<atom:link rel="self">`（它排在真代码前面），真那一行一个字没动。
 *   打到真代码上之后立刻就红了。和 docs/gate.md 第 7 节那个 `SC 13D` 同一个形态：
 *   **喂错输入的验证会让人以为钉子松了**，下次照着这条重来一遍时注意。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** 两条 feed 的路由。分支那条在 /s/<代码>/ 下面，是"相对路径会 404"的那一条。 */
const FEED_ROUTES = [
  "src/pages/rss.xml.ts",
  "src/pages/s/[symbol]/rss.xml.ts",
] as const;

/**
 * 样式表的正文，和把它发出去的那条路由。
 *
 * ⚠ 它**不在 `public/`**：【2026-09-21 实测】Astro 7 的 rolldown 会把 public/ 下
 *   扩展名不认识的文件当 JS 模块解析，放进去 `astro build` 当场红
 *   （`public/probe2.zzz` 也一样，和扩展名无关）。这条至少是响的，不是零症状 ——
 *   真正零症状的是**路由被删掉**：/rss.xsl 变 404，浏览器静默回落到裸 XML。
 */
const XSL_PATH = "src/assets/rss.xsl";
const XSL_ROUTE = "src/pages/rss.xsl.ts";

/** 剥 JS / TS 注释 —— 那两个路由的注释里写着"别把它挪走"这类话。 */
const stripJsComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** 剥 XML 注释 —— .xsl 的文件头里逐字写着它要断言的那几个串。 */
const stripXmlComments = (src: string) => src.replace(/<!--[\s\S]*?-->/g, "");

test("两条 feed 都挂了浏览器样式表 —— 只挂一条的话另一条还是裸 XML", () => {
  for (const route of FEED_ROUTES) {
    const src = stripJsComments(read(route));
    assert.match(
      src,
      /stylesheet:\s*feedStylesheet/,
      `${route} 没传 stylesheet：点开它在浏览器里是一屏 XML 加一行英文报错样的提示，` +
        `而另一条 feed 看起来完全正常 —— 漏的那条没有任何人会发现`
    );
  }
});

test("样式表路径只有一处，而且是根绝对的（分支 feed 在 /s/<代码>/ 下面）", () => {
  const util = stripJsComments(read("src/utils/feedItems.ts"));
  assert.match(
    util,
    /export const feedStylesheet = getAssetPath\("rss\.xsl"\)/,
    "feedStylesheet 不再走 getAssetPath('rss.xsl')：手写字符串要么丢掉 base，" +
      "要么写成相对路径 —— 后者在 /s/<代码>/rss.xml 上会去取 /s/<代码>/rss.xsl，" +
      "404 之后浏览器静默回落到裸 XML"
  );

  for (const route of FEED_ROUTES) {
    const src = stripJsComments(read(route));
    assert.doesNotMatch(
      src,
      /stylesheet:\s*["'`]/,
      `${route} 里把样式表路径写死成了字符串 —— 拼法必须只有 feedItems.ts 一份，` +
        `两处各写一份就是改一处漏一处（docs/engineering-notes.md 坑 8 / 坑 22 的形态）`
    );
  }
});

test("atom: 前缀和 xmlns 必须成对 —— 少一半整份 feed 就不是合法 XML", () => {
  for (const route of FEED_ROUTES) {
    const src = stripJsComments(read(route));
    // customData 里那个 `atom:` 前缀来自 selfLink()，所以这里认的是调用。
    assert.match(
      src,
      /customData:\s*selfLink\(/,
      `${route} 没写 <atom:link rel="self">：阅读器和校验器不知道这份 feed 的正式地址，` +
        `而 rss.xsl 那一页印给读者复制的就是它（取不到就只剩一句兜底的话）`
    );
    assert.match(
      src,
      /xmlns:\s*FEED_XMLNS/,
      `${route} 用了 atom: 前缀却没传 xmlns —— 这不是少一条内容，是整份 feed 变成` +
        `格式错误的 XML，每一个订阅者的阅读器当场解析失败`
    );
  }

  const util = stripJsComments(read("src/utils/feedItems.ts"));
  assert.match(
    util,
    /FEED_XMLNS\s*=\s*\{\s*atom:\s*"http:\/\/www\.w3\.org\/2005\/Atom"\s*\}/,
    "FEED_XMLNS 的命名空间 URI 变了：和 selfLink() 里那个 atom: 前缀对不上就是无效 XML"
  );
  assert.match(
    util,
    /rel="self"/,
    "selfLink() 不再写 rel=\"self\"：rss.xsl 按 rel='self' 取地址，" +
      "改了之后那一页印不出地址，而 feed 本身照常有效 —— 零报错"
  );
});

test("样式表本体在，而且真的是给这两条 feed 用的那一份", () => {
  assert.ok(
    existsSync(join(ROOT, XSL_PATH)),
    `${XSL_PATH} 不在：两条 feed 都会指向一个 404，浏览器静默回落到裸 XML —— ` +
      `构建全绿、feed 全绿，只有点开的人看得见`
  );

  const xsl = stripXmlComments(read(XSL_PATH));
  assert.match(
    xsl,
    /atom:link\[@rel='self'\]\/@href/,
    "rss.xsl 不再从 <atom:link rel='self'> 读地址 —— 分支 feed 的地址没法从 " +
      "<channel><link> 推出来，拼一个出来就是印给读者一个 404"
  );
  assert.match(
    xsl,
    /xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom"/,
    "rss.xsl 里 atom 的命名空间声明没了：XPath 匹配不上，地址那一格会静默走兜底分支"
  );
  assert.match(
    xsl,
    /<xsl:otherwise>/,
    "rss.xsl 少了兜底分支：取不到地址时必须说一句实话，" +
      "不许既不印地址也不说为什么（空白 = 把'我不知道'伪装成'这里本来就没有'）"
  );
});

test("发样式表的那条路由在，而且读的就是那一份正文", () => {
  assert.ok(
    existsSync(join(ROOT, XSL_ROUTE)),
    `${XSL_ROUTE} 不在：/rss.xsl 变成 404，浏览器**静默**回落到裸 XML —— ` +
      `feed 本身照常有效、构建全绿，屏幕上只是"又变回那一屏 XML 了"`
  );

  const route = stripJsComments(read(XSL_ROUTE));
  assert.match(
    route,
    /from\s+"@\/assets\/rss\.xsl\?raw"/,
    `${XSL_ROUTE} 不再用 ?raw 读 ${XSL_PATH}：把 XSL 抄成模板字符串就是第二份正文，` +
      `改一处漏一处（docs/engineering-notes.md 坑 8 的形态）。而且那一份原文里有注释解释这些边界`
  );
  assert.match(
    route,
    /application\/xslt\+xml/,
    `${XSL_ROUTE} 不再声明 XSLT 的 Content-Type：dev 和 astro preview 里浏览器` +
      `就不当它是样式表了（线上那一份由 Cloudflare 按扩展名给，仓库里测不到）`
  );
});

test("复制按钮默认 hidden，由脚本自己放出来 —— 不许出现死按钮", () => {
  const xsl = stripXmlComments(read(XSL_PATH));

  // ★ 这一条守的是"按钮存在 ⇒ 脚本真的跑起来了"。XSLT 结果树里的脚本执行与否
  //   取决于浏览器，剪贴板 API 还要安全上下文 —— markup 里直接给一个可见的按钮，
  //   在跑不了的那台机器上就是按了没反应，而且**零报错**（和右下角那个圆钮同形态）。
  assert.match(
    xsl,
    /id="copy"[\s\S]{0,200}?hidden="hidden"/,
    "复制按钮没带 hidden：脚本没跑 / 剪贴板 API 不在时它会一直亮着，" +
      "按下去什么也不发生 —— 宁可没有按钮，也不要一个死按钮"
  );
  assert.match(
    xsl,
    /btn\.hidden\s*=\s*false/,
    "脚本里没有解除 hidden 的那一行：按钮就永远不出现了 —— " +
      "页面看起来完全正常（地址还在、还能手动选中），只是用户要的那个图标没了"
  );

  // 解除 hidden 必须排在能力检查**后面**：先亮再检查等于没检查。
  const script = xsl.slice(xsl.indexOf("<script"));
  assert.ok(
    script.indexOf("navigator.clipboard.writeText") <
      script.indexOf("btn.hidden = false"),
    "按钮在检查剪贴板 API 之前就被放出来了 —— 非安全上下文（http://）和老浏览器上" +
      "又变回一个死按钮"
  );

  // ★ 写入被拒绝的那一档必须有人接。【2026-09-21 实测】writeText 存在不代表调用会成功：
  //   本机预览里它当场 NotAllowedError（嵌入式浏览器、企业策略、浏览器设置都可能拒）。
  //   没有 rejection 分支 = 按下去静默什么都不发生 = 死按钮，而且零报错。
  assert.match(
    xsl,
    /\.then\(\s*ok,\s*fallback\s*\)/,
    "writeText 没有接 rejection 分支：它被拒绝时（实测本机预览就会）按钮按下去" +
      "什么都不发生，而能力检查照样通过 —— 那就是一个真正的死按钮"
  );
  assert.match(
    xsl,
    /id="copyhint"[\s\S]{0,120}?hidden="hidden"/,
    "失败那一档的提示语不见了 / 不是默认隐藏：成功、失败、按钮根本不出现，" +
      "三者在屏幕上必须长得不一样"
  );

  // 没有脚本那一档必须仍然可用：地址靠 user-select: all 一点全选。
  assert.match(
    xsl,
    /user-select:\s*all/,
    "地址那一格没了 user-select: all：脚本跑不了的时候，读者要手动框选一段" +
      "会换行的长地址 —— 那正是这个按钮本来要解决的问题"
  );
});
