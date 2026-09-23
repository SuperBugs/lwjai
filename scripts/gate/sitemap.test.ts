/**
 * Sitemap 的钉子 —— 【2026-09-22 做 `/sitemap.xml` 那天加的】。
 *
 * 这一批守的全是**零症状**的东西：站照常打开、构建全绿、闸门印绿 ✓，
 * 只有搜索引擎那头看得见。所以每一条都对应一个具体的失败模式：
 *
 *   A 组  「最后改的是哪一刻」只有一个判据 —— sitemap 的 `<lastmod>` 和详情页
 *         JSON-LD 的 `dateModified` 必须给出同一个答案（docs/engineering-notes.md 坑 8 / 坑 22 形态）
 *   B 组  拿**真仓库的内容**对账：地址前缀 / 文件名 / 目录一旦对不上，
 *         那张表会整片查不中，全站 `<lastmod>` 一起消失而四处全绿
 *   C 组  `/sitemap.xml` 真写盘（真临时目录、真字节），三档：抄成了 / 源文件没有 / 形状变了
 *   D 组  robots.txt 的真输出（不是 grep 源码）：指向的那个文件名和产物同源
 *   E 组  **接线** —— 集成排在 sitemap() 后面、serialize 真接上了。
 *         没接上一个字都不报错，sitemap 照常生成、只是一条 `<lastmod>` 都没有
 *
 * 破坏实跑过（2026-09-22，docs/engineering-notes.md 坑 17 那条纪律），**10 处**各自那条都红了、
 * 改回来又绿：`lastModifiedAt` 只认 modDatetime（A2/B1/B2）、JSON-LD 自己另写一份
 * dateModified（A3）、`sitemapLastmod` 按头两段查（B2）、`buildLastmodIndex` 拿集合名
 * 当地址前缀（A3/B1/B2）、目录读不到时静默当成空（B3）、`writeSitemapAlias` 抄
 * sitemap-0.xml（C1/C3）、robotsTxt 掉了 `Allow: /`（D1）、robots.txt.ts 手写回
 * "sitemap-index.xml"（D2/E3）、alias 集成挪到 sitemap() 前面（E1）、删掉 serialize（E2）。
 *
 * ⚠ 那一轮**抓出这份测试自己的一个假钉子**：B2 原来拿 `index.keys()` 里的键去拼探针
 *   地址，于是"键算错了"它也跟着错 —— 把 urlPrefix 换成集合名之后 B2 照常绿。
 *   现在探针是自己 readdir ＋ 登记表独立拼的。**"必须查得中"这类用例，
 *   输入不许来自被测代码。**
 *
 * ⚠ 同一轮还发现 A3 在"两边一起错"时**不会**红（两个消费方读同一个函数，
 *   一起错仍然一致）——那不是漏洞：A3 钉的是"有没有第二份判据"，
 *   correctness 那一半在 A2。别为此把 A3 改成再断言一遍具体值。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SITEMAP_FILE,
  SITEMAP_INDEX_FILE,
  robotsTxt,
  sitemapLastmod,
} from "../../src/config/sitemap";
import {
  buildLastmodIndex,
  writeSitemapAlias,
} from "../../src/config/sitemapBuild";
import { frontmatterDate, lastModifiedAt } from "../../src/config/lastModified";
import { blogPostingJsonLd } from "../../src/utils/structuredData";
import {
  CONTENT_COLLECTIONS,
  requireCollectionSpec,
} from "../../src/config/collections";
import { ROUTES } from "../../src/config/routes";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
/** 先剥注释再 grep —— 注释里写着"必须排在 sitemap() 后面"这种话，不剥的话删掉真东西照样绿。 */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

const SITE = "https://lwj.ai";
const ROUTED = CONTENT_COLLECTIONS.filter(c => c.urlPrefix !== null);

const tmp = () => mkdtempSync(join(tmpdir(), "lwj-sitemap-"));

/** 一份形状和 @astrojs/sitemap 真实产出一致的索引。 */
const INDEX_XML =
  `<?xml version="1.0" encoding="UTF-8"?><sitemapindex ` +
  `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
  `<sitemap><loc>${SITE}/sitemap-0.xml</loc>` +
  `<lastmod>2026-09-22T02:43:00.000Z</lastmod></sitemap>` +
  `<sitemap><loc>${SITE}/sitemap-1.xml</loc></sitemap></sitemapindex>`;

// ── A 组：「最后改的是哪一刻」只有一个判据 ────────────────────────────

test("A1 frontmatterDate：YAML 的 Date 和带引号字符串都认，空 / 垃圾一律 undefined", () => {
  // ⚠ 同一个字段在两条稿子里可能是两种类型：不带引号的 YAML 时间戳被解析成 Date
  //   （后台和 content:import 写出来的就是这种），带引号的还是字符串（手写的常带）。
  const iso = "2026-09-21T11:08:00.000Z";
  assert.equal(frontmatterDate(new Date(iso))?.toISOString(), iso);
  assert.equal(frontmatterDate(iso)?.toISOString(), iso);
  assert.equal(frontmatterDate(Date.parse(iso))?.toISOString(), iso);

  for (const bad of [undefined, null, "", "不是日期", {}, []]) {
    assert.equal(
      frontmatterDate(bad),
      undefined,
      `${JSON.stringify(bad)} 被当成了一个能用的时刻 —— 那会变成一条编出来的 <lastmod>`
    );
  }
});

test("A2 lastModifiedAt 三档：改过用 modDatetime、没改过退回 pubDatetime、两个都没有就没有答案", () => {
  const pub = new Date("2026-09-21T11:08:00.000Z");
  const mod = new Date("2026-09-22T02:43:00.000Z");

  assert.equal(lastModifiedAt(pub, mod)?.toISOString(), mod.toISOString());
  assert.equal(
    lastModifiedAt(pub, undefined)?.toISOString(),
    pub.toISOString(),
    "没改过的稿子该退回发布时间 —— 后台那一格留空是完成态，不是'还没填'"
  );
  assert.equal(lastModifiedAt(pub, null)?.toISOString(), pub.toISOString());
  assert.equal(
    lastModifiedAt(undefined, undefined),
    undefined,
    "两格都没有时编了一个时间出来 —— 一个永远等于构建时间的 lastmod 比没有更贵"
  );
  // 只有 modDatetime（frontmatter 写坏了的形态）仍然是个确定答案。
  assert.equal(lastModifiedAt(undefined, mod)?.toISOString(), mod.toISOString());
});

test("★ A3 sitemap 的 <lastmod> 和详情页 JSON-LD 的 dateModified 必须是同一个答案", () => {
  // 这两个值会被同一个抓取方在几秒内先后读到。两处各写一份的那天它们开始各说各话，
  // 而页面、构建、闸门四处全绿 —— docs/engineering-notes.md 坑 8 / 坑 22 同一个形态。
  const cases: [Date, Date | null][] = [
    [new Date("2026-09-21T11:08:00.000Z"), new Date("2026-09-22T02:43:00.000Z")],
    [new Date("2026-09-21T11:08:00.000Z"), null],
  ];
  const posts = requireCollectionSpec("posts");
  const url = `${SITE}/${posts.urlPrefix}/1002`;
  for (const [pub, mod] of cases) {
    const jsonLd = blogPostingJsonLd({
      headline: "x",
      url,
      datePublished: pub,
      dateModified: mod,
      lang: "zh-CN",
      author: { name: "a" },
      publisher: { name: "p", url: `${SITE}/` },
    });
    const dir = tmp();
    // 登记表里每个有详情路由的集合都要有目录 —— 少一个 buildLastmodIndex 会抛（B3）。
    for (const c of ROUTED) {
      mkdirSync(join(dir, ...c.dir.split("/")), { recursive: true });
    }
    writeFileSync(
      join(dir, ...posts.dir.split("/"), "1002.md"),
      `---\npubDatetime: ${pub.toISOString()}\n` +
        (mod ? `modDatetime: ${mod.toISOString()}\n` : "") +
        `---\n正文\n`,
      "utf8"
    );
    const lastmod = sitemapLastmod(buildLastmodIndex(dir), url);
    assert.equal(
      lastmod,
      jsonLd.dateModified,
      `同一条内容，sitemap 说 ${lastmod}、JSON-LD 说 ${jsonLd.dateModified}`
    );
  }
});

// ── B 组：拿真仓库对账 ────────────────────────────────────────────────

test("★ B1 真仓库：有详情路由的每一份 .md 都算得出 <lastmod>", () => {
  // ⚠ 这一条钉的是"映射一断、全站 lastmod 静默消失"。期望值在这里**独立数一遍**
  //   （自己 readdir），不复用被测代码去算 —— 否则它会和被测代码一起错。
  const index = buildLastmodIndex(ROOT);
  let counted = 0;
  for (const c of ROUTED) {
    const dir = join(ROOT, ...c.dir.split("/"));
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".md")) continue;
      counted++;
      const key = `/${c.urlPrefix}/${name.replace(/\.md$/, "")}`;
      const iso = index.get(key);
      assert.ok(
        iso,
        `${c.dir}/${name} 在 <lastmod> 表里没有 ${key} —— ` +
          `要么地址前缀 / 文件名的算法变了（那全站 lastmod 会一起消失而构建全绿），` +
          `要么这一条 frontmatter 里 pubDatetime 和 modDatetime 都读不出来`
      );
      assert.equal(
        new Date(iso).toISOString(),
        iso,
        `${key} 的 <lastmod> 不是规范 ISO：${iso}`
      );
    }
  }
  assert.ok(counted > 0, "一份内容都没数到 —— 这条测试自己失效了（目录空的？）");
  assert.equal(index.size, counted, "表里的条数和盘上的 .md 数对不上");
});

test("★ B2 真仓库：条目地址查得中，而聚合页刻意查不中（省略那一档）", () => {
  const index = buildLastmodIndex(ROOT);

  // ⚠ 探针地址**独立拼**（自己 readdir ＋ 登记表的 urlPrefix），**不许拿
  //   `index.keys()` 里的键当输入** —— 那样键算错了它也跟着错，测的是
  //   "被测代码和自己一致"。2026-09-22 实测：第一版就是那么写的，
  //   把 urlPrefix 改成集合名之后这条照常绿。
  const probe = ROUTED.flatMap(c =>
    readdirSync(join(ROOT, ...c.dir.split("/")))
      .filter(name => name.endsWith(".md"))
      .slice(0, 1)
      .map(name => `/${c.urlPrefix}/${name.replace(/\.md$/, "")}`)
  );
  assert.equal(probe.length, ROUTED.length, "有集合一份 .md 都没有，这条测试测不到东西");
  for (const path of probe) {
    assert.ok(
      sitemapLastmod(index, `${SITE}${path}`),
      `${path} 这条真地址查不中 —— 地址前缀 / 文件名的算法和登记表对不上了`
    );
    // base 配成子路径也要查得中：按末两段查的理由就在这（失配的症状是全站一起没）。
    assert.equal(
      sitemapLastmod(index, `${SITE}/子路径${path}`),
      sitemapLastmod(index, `${SITE}${path}`),
      `${path} 在 base 是子路径时查不中了`
    );
  }

  // 聚合页没有可靠的"最后修改时间"（要重算这一页上列着哪几条），一律不印。
  const aggregates = [
    `${SITE}/`, // 首页
    `${SITE}`, // 首页（trailingSlash: never 之后 sitemap 里就是这个形态）
    ...ROUTED.map(c => `${SITE}/${c.urlPrefix}`), // 列表页
    ...ROUTED.map(c => `${SITE}/${c.urlPrefix}/2`), // 列表页第 2 页
    `${SITE}/${ROUTES.tags}`,
    `${SITE}/${ROUTES.tags}/%E4%BC%B0%E5%80%BC`,
    `${SITE}/${ROUTES.tags}/%E4%BC%B0%E5%80%BC/2`,
    `${SITE}/${ROUTES.symbols}`,
    `${SITE}/${ROUTES.symbols}/orcl`,
    `${SITE}/${ROUTES.about}`, // about.md 的 schema 里压根没有那两格
    `${SITE}/${ROUTES.archives}`,
  ];
  for (const url of aggregates) {
    assert.equal(
      sitemapLastmod(index, url),
      undefined,
      `${url} 印了一个 <lastmod> —— 聚合页那个时间要靠重算"这一页列着哪几条"才知道，` +
        `编一个出来会让抓取方以后干脆不看这个字段`
    );
  }
});

test("★ B2b 列表页分页不许撞上条目号 —— 这一条靠 ENTRY_NO_MIN 撑着", () => {
  // 按末两段查的唯一风险是 `/r/2`（列表第 2 页）撞上键 `/r/<号>`。
  // 号从 1000 起（src/config/entryNo.ts 的 ENTRY_NO_MIN），要撞上得先有 1000 页。
  const index = buildLastmodIndex(ROOT);
  for (const c of ROUTED) {
    for (let page = 2; page <= 30; page++) {
      assert.equal(
        sitemapLastmod(index, `${SITE}/${c.urlPrefix}/${page}`),
        undefined,
        `/${c.urlPrefix}/${page} 是列表页的第 ${page} 页，却查到了一条条目的 <lastmod>`
      );
    }
  }
});

test("B3 登记在册的目录读不到就抛 —— 「扫不全」不许长得像「没东西」", () => {
  const dir = tmp(); // 空目录：一个内容集合的目录都没有
  assert.throws(
    () => buildLastmodIndex(dir),
    /登记的目录读不到/,
    "目录读不到时静默跳过了 —— 症状是这个集合的 lastmod 整片消失，而构建全绿"
  );
});

// ── C 组：/sitemap.xml ───────────────────────────────────────────────

test("★ C1 writeSitemapAlias 把索引逐字节抄成 sitemap.xml", () => {
  const dir = tmp();
  writeFileSync(join(dir, SITEMAP_INDEX_FILE), INDEX_XML, "utf8");

  const parts = writeSitemapAlias(dir);
  assert.equal(parts, 2, "返回的分卷数不对（日志里印的就是它）");
  assert.equal(
    readFileSync(join(dir, SITEMAP_FILE), "utf8"),
    INDEX_XML,
    "抄出来的字节和索引不一样"
  );
  // 抄的必须是**索引**：条目越过 entryLimit 时会出现 sitemap-1.xml，
  // 而索引永远把分卷全列着。抄 sitemap-0.xml 的话那天 /sitemap.xml 静默只剩前一卷。
  assert.match(readFileSync(join(dir, SITEMAP_FILE), "utf8"), /<sitemapindex/);
  assert.notEqual(SITEMAP_FILE, SITEMAP_INDEX_FILE, "两个文件名重合了，抄成了它自己");
});

test("★ C2 索引不存在就抛，而且话里要指出顺序 —— 不许静默少一个文件", () => {
  const dir = tmp();
  assert.throws(
    () => writeSitemapAlias(dir),
    (e: Error) =>
      /读不到 sitemap-index\.xml/.test(e.message) && /后面/.test(e.message),
    "索引不在时静默跳过（或者报了一句看不出原因的错）—— /sitemap.xml 会回到 404 而构建全绿"
  );
});

test("C3 索引形状变了就抛 —— 不许把一份 urlset 或一段错误页挂到 /sitemap.xml 上", () => {
  const dir = tmp();
  writeFileSync(
    join(dir, SITEMAP_INDEX_FILE),
    `<?xml version="1.0"?><urlset><url><loc>${SITE}</loc></url></urlset>`,
    "utf8"
  );
  assert.throws(() => writeSitemapAlias(dir), /没有 <sitemapindex>/);
});

// ── D 组：robots.txt ────────────────────────────────────────────────

test("★ D1 robots.txt 的真输出：保留 User-agent / Allow，Sitemap 指向 SITEMAP_FILE", () => {
  const txt = robotsTxt(new URL(`${SITE}/`));
  assert.match(txt, /^User-agent: \*$/m, "少了 User-agent —— 这一行是原来就有的");
  assert.match(txt, /^Allow: \/$/m, "少了 Allow: / —— 这一行是原来就有的");
  assert.match(
    txt,
    new RegExp(`^Sitemap: ${SITE}/${SITEMAP_FILE}$`, "m"),
    "Sitemap 那一行和产物文件名对不上 —— 症状是搜索引擎一直抓到 404，站上零症状"
  );
  // 字符串拼的和 URL 对象拼的必须一样（调用方给的是 Astro.site，是个 URL）。
  assert.equal(robotsTxt(`${SITE}/`), txt);

  // ⚠ 不许 Disallow 搜索页：那挡住的是**抓取**，于是抓取方读不到它自己那条
  //   `noindex` meta，反而更容易留下一条"已发现但未编入索引"。
  assert.doesNotMatch(
    txt,
    new RegExp(`Disallow:\\s*/${ROUTES.search}`),
    "robots.txt 把搜索页 Disallow 了 —— 它靠 noindex meta 声明不收录，两者不能同时来"
  );
});

test("D2 robots.txt 这一页不许再手写 sitemap 的文件名", () => {
  const src = stripComments(read("src/pages/robots.txt.ts"));
  assert.match(src, /robotsTxt\(/, "robots.txt.ts 没走 src/config/sitemap.ts 那份全文");
  // ⚠ 比的是"字符串里有个 .xml 文件名"，不是"字符串里有 sitemap 这个词" ——
  //   后者会把 `import ... from "@/config/sitemap"` 这行判成违规。
  assert.doesNotMatch(
    src,
    /["'`][^"'`]*sitemap[^"'`]*\.xml["'`]/i,
    "robots.txt.ts 里又出现了一个手写的 sitemap 文件名 —— 改产出文件名时它会静默指向 404"
  );
});

// ── E 组：接线（没接上是零症状的）────────────────────────────────────

test("★ E1 astro.config.ts：alias 集成在 integrations 里，而且排在 sitemap() 后面", () => {
  const cfg = stripComments(read("astro.config.ts"));
  const list = cfg.match(/integrations:\s*\[[\s\S]*?\n {2}\]/)?.[0] ?? "";
  assert.ok(list, "在 astro.config.ts 里找不到 integrations 数组了（这条测试自己该修）");

  const atSitemap = list.indexOf("sitemap({");
  const atAlias = list.indexOf("sitemapAliasIntegration");
  assert.ok(atSitemap >= 0, "integrations 里没有 sitemap({...}) —— 整个 sitemap 都没了");
  assert.ok(
    atAlias >= 0,
    "integrations 里没挂 sitemapAliasIntegration —— /sitemap.xml 会回到 404，而构建全绿"
  );
  assert.ok(
    atAlias > atSitemap,
    "sitemapAliasIntegration 排到了 sitemap() 前面 —— astro:build:done 按数组顺序跑，" +
      "那时索引还没生成（它会抛，但报错指不到这里）"
  );
});

test("★ E2 astro.config.ts：sitemap() 真接上了 serialize，而且判据只有一处", () => {
  const cfg = stripComments(read("astro.config.ts"));
  const block = cfg.match(/sitemap\(\{[\s\S]*?\n {4}\}\)/)?.[0] ?? "";
  assert.ok(block, "找不到 sitemap({...}) 那一块了");
  assert.match(
    block,
    /serialize:/,
    "sitemap() 没接 serialize —— sitemap 照常生成，只是一条 <lastmod> 都没有，零报错"
  );
  assert.match(
    block,
    /sitemapLastmod\(/,
    "serialize 没走 src/config/sitemap.ts 的 sitemapLastmod —— 又开了第二份判据"
  );
  // 「最后改的是哪一刻」不许在配置里另算一遍。
  assert.doesNotMatch(
    block,
    /modDatetime/,
    "astro.config.ts 里自己读起 modDatetime 了 —— 那是 src/config/lastModified.ts 的活"
  );
});

test("E3 src/ 里没有第二处手写 sitemap 产出文件名", () => {
  // 唯一许可的一处就是常量定义本身（src/config/sitemap.ts）。
  const offenders: string[] = [];
  const walk = (rel: string) => {
    for (const e of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        walk(child);
      } else if (/\.(ts|astro)$/.test(e.name)) {
        if (child.endsWith("src/config/sitemap.ts")) continue;
        const src = stripComments(read(child));
        if (/["'`]sitemap(-index)?\.xml["'`]/.test(src)) offenders.push(child);
      }
    }
  };
  walk("src");
  assert.deepEqual(
    offenders,
    [],
    `这几处手写了 sitemap 的产出文件名，该读 SITEMAP_FILE：${offenders.join(" / ")}`
  );
});
