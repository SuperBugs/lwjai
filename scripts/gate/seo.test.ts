/**
 * SEO 和站内搜索那几处的钉子 —— 【2026-09-20】Google 搜「牢玩家」「牢玩家AI」「lwj.ai」
 * 都是空的那天补的。仓库里能做的分两类：
 *
 *   - **纯函数**（src/utils/structuredData.ts、src/utils/searchMeta.ts）：直接跑，看输出。
 *   - **拼写**（og:type 只写一次、四页都传 headline、/search 两处一起、列表页都传 description、
 *     噪音组件挂 ignore、两个详情页写搜索 meta）：和 detailParity.test.ts 一样 grep 源码、
 *     先剥注释。每一条都是"漏了零症状"的形态 —— 页面正常、构建全绿，
 *     只有搜索引擎 / 搜索索引那头看得见。
 *
 * ⚠ 收录本身（Search Console 验证、提交 sitemap）不在仓库里，测不到，写在 docs/deploy.md 2.6。
 *
 * 破坏实跑过（2026-09-20，docs/engineering-notes.md 坑 17 那条纪律）：PostLayout 去掉 ogType="article" /
 * 加回一条 og:type、guides 页去掉 headline、search.astro 去掉 noindex、sitemap 不排除 /search/、
 * BackToTop 去掉 ignore、打印出处那行去掉 ignore —— 七处各自那条都红了，改回来又绿。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { siteJsonLd, blogPostingJsonLd } from "../../src/utils/structuredData";
import { searchMetaAttr } from "../../src/utils/searchMeta";
import {
  CONTENT_COLLECTIONS,
  requireCollectionSpec,
} from "../../src/config/collections";
import { ROUTES } from "../../src/config/routes";

/** 研究稿的地址前缀。集合叫 posts，地址是 /r —— 两样不是一回事。 */
const POSTS_PREFIX = requireCollectionSpec("posts").urlPrefix!;
/** 集合名 → 地址前缀。 */
const prefixOf = (key: string) => requireCollectionSpec(key).urlPrefix!;

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
/** 先剥注释再 grep —— 注释里写着"别把 og:type 加回这里"这种话，不剥的话删掉真东西照样绿。 */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

const ROUTED = CONTENT_COLLECTIONS.filter(c => c.urlPrefix !== null);
const detailPage = (prefix: string) =>
  `src/pages/${prefix}/[...slug]/index.astro`;

test("首页 WebSite 结构化数据：站名别名进 alternateName，Organization 挂 sameAs，空表不写", () => {
  const out = siteJsonLd({
    name: "牢玩家",
    alternateNames: ["牢玩家AI", "lwj.ai"],
    url: "https://lwj.ai/",
    description: "d",
    lang: "zh-CN",
    logoUrl: "https://lwj.ai/favicon.svg",
    sameAs: ["https://t.me/your_channel"],
  });
  const graph = out["@graph"] as Record<string, unknown>[];
  const site = graph.find(n => n["@type"] === "WebSite")!;
  const org = graph.find(n => n["@type"] === "Organization")!;
  assert.deepEqual(site.alternateName, ["牢玩家AI", "lwj.ai"]);
  assert.equal(site.url, "https://lwj.ai/");
  assert.equal(site.inLanguage, "zh-CN");
  assert.deepEqual(site.publisher, { "@id": org["@id"] });
  assert.deepEqual(org.sameAs, ["https://t.me/your_channel"]);
  assert.equal(org.logo, "https://lwj.ai/favicon.svg");

  // 别名 / 账号是空表时**不写那个键** —— `alternateName: []` 会被 Google 的校验器当成错。
  const bare = siteJsonLd({
    name: "x",
    url: "https://x/",
    description: "d",
    lang: "zh-CN",
    alternateNames: [],
    sameAs: [],
  });
  const [bareSite, bareOrg] = bare["@graph"] as Record<string, unknown>[];
  assert.ok(!("alternateName" in bareSite!), "空别名表写成了 alternateName: []");
  assert.ok(!("sameAs" in bareOrg!), "空账号表写成了 sameAs: []");
});

test("BlogPosting：headline 是原标题，dateModified 退回 datePublished，没日期 / 没摘要就不写", () => {
  const pub = new Date("2026-09-16T12:00:00.000Z");
  const out = blogPostingJsonLd({
    headline: "ORCL｜甲骨文 (Oracle Corp)",
    description: "d",
    url: "https://lwj.ai/posts/orcl-20260916/",
    image: "https://lwj.ai/posts/orcl-20260916/index.png",
    datePublished: pub,
    dateModified: null,
    lang: "zh-CN",
    author: { name: "牢玩家", url: "https://lwj.ai/" },
    publisher: {
      name: "牢玩家",
      url: "https://lwj.ai/",
      logoUrl: "https://lwj.ai/favicon.svg",
    },
  });
  assert.equal(out.headline, "ORCL｜甲骨文 (Oracle Corp)");
  assert.equal(out.datePublished, pub.toISOString());
  assert.equal(out.dateModified, pub.toISOString(), "没改过的稿子 dateModified 该退回发布时间");
  assert.deepEqual(out.mainEntityOfPage, {
    "@type": "WebPage",
    "@id": "https://lwj.ai/posts/orcl-20260916/",
  });
  assert.equal(
    (out.publisher as { logo: { url: string } }).logo.url,
    "https://lwj.ai/favicon.svg"
  );

  const mod = new Date("2026-09-18T00:00:00.000Z");
  const edited = blogPostingJsonLd({
    headline: "x",
    url: "https://lwj.ai/x/",
    datePublished: pub,
    dateModified: mod,
    lang: "zh-CN",
    author: { name: "a" },
    publisher: { name: "p", url: "https://lwj.ai/" },
  });
  assert.equal(edited.dateModified, mod.toISOString());

  const undated = blogPostingJsonLd({
    headline: "x",
    url: "https://lwj.ai/x/",
    lang: "zh-CN",
    author: { name: "a" },
    publisher: { name: "p", url: "https://lwj.ai/" },
  });
  assert.ok(!("datePublished" in undated), "没日期时编了一个 datePublished");
  assert.ok(!("dateModified" in undated), "没日期时编了一个 dateModified");
  assert.ok(!("description" in undated), "没摘要时写了空 description");
  assert.ok(!("image" in undated), "没图时写了空 image");
});

test("og:type 全站只在 Layout.astro 写一次、由 ogType 决定；PostLayout 传 article、不再自己写", () => {
  const layout = stripComments(read("src/layouts/Layout.astro"));
  const ogTypes = layout.match(/property="og:type"/g) ?? [];
  assert.equal(ogTypes.length, 1, `Layout.astro 里 og:type 出现了 ${ogTypes.length} 次，该是 1 次`);
  assert.match(layout, /property="og:type" content=\{ogType\}/, "Layout 的 og:type 没接 ogType prop");
  assert.match(layout, /name="robots" content=\{robots\}/, "Layout 没输出 <meta name=\"robots\">");
  assert.match(layout, /max-image-preview:large/, "robots 默认值没允许大图预览");
  // X 的文档写的是 name=，不是 property=
  assert.doesNotMatch(layout, /property="twitter:/, "twitter:* 又写回 property= 了");
  assert.match(layout, /name="twitter:card"/);

  const post = stripComments(read("src/layouts/PostLayout.astro"));
  assert.doesNotMatch(
    post,
    /property="og:type"/,
    "PostLayout 又写了一条 og:type —— OGP 冲突取第一个，文章页会被当成 website（坑 22）"
  );
  assert.match(post, /ogType="article"/, "PostLayout 没把 ogType=\"article\" 传给 Layout");
  assert.match(post, /blogPostingJsonLd\(/, "PostLayout 没走 structuredData.ts，JSON-LD 又开了第二份拼法");
});

test("四个详情页都把不带站名后缀的标题传给 PostLayout 的 headline", () => {
  for (const c of ROUTED) {
    const src = stripComments(read(detailPage(c.urlPrefix!)));
    assert.match(
      src,
      /<PostLayout\s[^>]*headline=\{title\}/,
      `${c.key} 的详情页没传 headline={title} —— Google 看到的标题会带「| 牢玩家」后缀`
    );
  }
});

test("首页：<title> 不再只是站名，挂了 WebSite 结构化数据，站名别名配在 astro-paper.config.ts", () => {
  const index = stripComments(read("src/pages/index.astro"));
  assert.match(index, /siteJsonLd\(/, "首页没挂 WebSite 结构化数据");
  assert.match(index, /alternateNames: config\.site\.alternateNames/, "首页结构化数据没读 site.alternateNames");
  assert.match(index, /<Layout title=\{homeTitle\}/, "首页 <title> 又变回只有站名两个字了");
  assert.match(index, /t\.home\.tagline/, "首页标题没接 home.tagline");
  const cfg = stripComments(read("astro-paper.config.ts"));
  assert.match(cfg, /alternateNames:\s*\[\s*"[^"]+"/, "astro-paper.config.ts 里没配 alternateNames");
});

test("/search：noindex 且不进 sitemap —— 两处要一起", () => {
  const search = stripComments(read(`src/pages/${ROUTES.search}.astro`));
  assert.match(search, /robots="noindex/, "search.astro 没给 Layout 传 robots=\"noindex…\"");
  const cfg = stripComments(read("astro.config.ts"));
  const sitemapBlock = cfg.match(/sitemap\(\{[\s\S]*?\}\)/)?.[0] ?? "";
  // ⚠ 比的形态**要和 trailingSlash 一致**：【2026-09-21】全站改成不带末尾斜杠之后，
  //   sitemap 喂给 filter 的是 `https://lwj.ai/search`，还按 `/search/` 比就一条都匹配不上
  //   —— 过滤器整个失效而构建全绿。所以这里认 `"/search"`，末尾斜杠可有可无。
  assert.match(sitemapBlock, /routePath\("search"\)|ROUTES\.search/, "astro.config.ts 的 sitemap filter 没排除搜索页 —— 会列一个自己声明不要收录的地址");
});

/**
 * 【2026-09-21】**末尾斜杠的口径只有一个，而它散在四处。**
 *
 * 地址是 `/posts/7`，不是 `/posts/7/`。这件事要四处同时成立，少一处就是
 * "每个链接多跳一次"或者"canonical 和真实地址对不上"，两种都零症状：
 *
 *   astro.config.ts   trailingSlash: "never"   —— 站内链接 / canonical / sitemap
 *   wrangler.jsonc    html_handling            —— 边缘认哪一个是正式形态
 *   两条 rss.xml.ts   trailingSlash: false     —— @astrojs/rss 默认自己补一个斜杠
 *
 * ⚠ wrangler.jsonc 那一行**测试只能看见它写没写**，它到底生不生效要线上 curl 一次
 *   （和 docs/deploy.md 2.5 那个 `Always Use HTTPS` 同一个形态：不在仓库里的那一半）。
 */
test("末尾斜杠：四处口径必须一致（/posts/7，不是 /posts/7/）", () => {
  const cfg = stripComments(read("astro.config.ts"));
  assert.match(
    cfg,
    /trailingSlash:\s*["']never["']/,
    "astro.config.ts 少了 trailingSlash: \"never\" —— 站内链接和 canonical 会带斜杠"
  );

  // wrangler 是 jsonc，带注释，stripComments 不一定认得它的注释风格，直接按文本找。
  const wrangler = read("wrangler.jsonc");
  assert.match(
    wrangler,
    /"html_handling"\s*:\s*"drop-trailing-slash"/,
    "wrangler.jsonc 没设 html_handling —— 默认会把 /posts/7 **307 到 /posts/7/**，" +
      "于是站上每个链接都多一跳，而且跳到的地址和 canonical 对不上"
  );

  for (const p of ["src/pages/rss.xml.ts", "src/pages/s/[symbol]/rss.xml.ts"]) {
    assert.match(
      stripComments(read(p)),
      /trailingSlash:\s*false/,
      `${p} 没关掉 @astrojs/rss 的 trailingSlash —— 它默认给每条 link/guid 补一个斜杠，` +
        `阅读器按 guid 去重，口径一变全站条目会重新冒一遍`
    );
  }
});

test("列表页、标签页、标的索引都给 Layout 传了 description —— 不传就全落到站点默认那句", () => {
  const pages = [
    // ★ 列表页的路径**从登记表推**：集合叫 posts，地址前缀是 r（/r/1002），
    //   写死 "src/pages/posts/..." 的那天这条测试会 ENOENT 而不是断言失败。
    ...CONTENT_COLLECTIONS.filter(c => c.urlPrefix).map(
      c => `src/pages/${c.urlPrefix}/[...page].astro`
    ),
    `src/pages/${ROUTES.tags}/index.astro`,
    `src/pages/${ROUTES.tags}/[tag]/[...page].astro`,
    "src/pages/s/index.astro",
    "src/pages/s/[symbol]/[...page].astro",
  ];
  for (const p of pages) {
    const src = stripComments(read(p));
    assert.match(src, /<Layout\s[^>]*description=/, `${p} 没给 Layout 传 description`);
  }
});

test("站内搜索噪音：回到顶部 / 分享到 / 打印出处那行都挂了 data-pagefind-ignore", () => {
  const btt = stripComments(read(`src/pages/${POSTS_PREFIX}/[...slug]/_components/BackToTopButton.astro`));
  assert.match(btt, /id="btt-btn-container"[^>]*data-pagefind-ignore/, "BackToTopButton 没挂 ignore —— 搜「回到顶部」命中全站每一页");
  // ⚠【2026-09-21】ShareLinks **四个详情页都不挂了**（用户：「分享就不要了」），
  //   文件按上游惯例留着。所以这一条现在守的是"重新挂回去的那一天" ——
  //   而不是"今天页面上有这个噪音"。别因为"反正没在用"把它删掉：
  //   加回来的人多半只会加 `<ShareLinks />`，不会回头补这个属性。
  const share = stripComments(read(`src/pages/${POSTS_PREFIX}/[...slug]/_components/ShareLinks.astro`));
  assert.match(share, /data-pagefind-ignore/, "ShareLinks 没挂 ignore —— 搜「分享」「Telegram」命中全站每一页");
  const dl = stripComments(read("src/components/DownloadLinks.astro"));
  assert.match(dl, /<p data-print-source[^>]*data-pagefind-ignore/, "打印出处那行没挂 ignore —— 每一页都索引着自己的地址");
});

test("搜索 meta：智能体 / 模型三档不合并，分隔符不进值；两个详情页写进索引，列表页搜索框画出来", () => {
  const labels = {
    agent: "智能体",
    model: "模型",
    unspecifiedAgent: "来源未标注",
    unspecifiedModel: "模型未标注",
  };
  assert.equal(searchMetaAttr(labels, "spark", "gemini-3-pro"), "智能体:Google Spark, 模型:Gemini-3-Pro");
  // 「我自己」写的：没有模型那一格（完成态，和 AgentModelChip 一样不画）
  assert.equal(searchMetaAttr(labels, "human", undefined), "智能体:我自己");
  // AI 写的没标模型：待补，画「模型未标注」
  assert.equal(searchMetaAttr(labels, "spark", undefined), "智能体:Google Spark, 模型:模型未标注");
  // 智能体和模型都没标：「来源未标注」已经说完了，不再挂第二个
  assert.equal(searchMetaAttr(labels, undefined, undefined), "智能体:来源未标注");
  // 逗号和冒号是 Pagefind 这个属性的分隔符，进了值整条就错位
  assert.equal(searchMetaAttr({ ...labels, agent: "a,b:c" }, "human", undefined), "a b c:我自己");

  // ★ 集合名 → 地址前缀（posts 的地址是 /r），别把两样当成一回事。
  for (const prefix of ["posts", "qa"].map(prefixOf)) {
    const src = stripComments(read(detailPage(prefix)));
    assert.match(src, /data-pagefind-body[\s\S]{0,200}data-pagefind-meta=\{searchMeta\}/, `${prefix} 详情页没把 searchMeta 写进 data-pagefind-meta`);
    assert.match(src, /searchMetaAttr\(/, `${prefix} 详情页没走 searchMetaAttr —— 又开了第二份拼法`);
  }
  const cs = stripComments(read("src/components/CollectionSearch.astro"));
  assert.match(cs, /"image_alt"/, "CollectionSearch 没把 meta 画出来（或者把 Pagefind 的保留键也画了）");
});
