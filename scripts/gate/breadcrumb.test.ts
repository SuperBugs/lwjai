/**
 * 面包屑（`src/components/Breadcrumb.astro` + `src/utils/breadcrumb.ts`）的测试。【2026-09-23】
 *
 * ## 为什么有这一份
 *
 * 2026-09-21 那两轮改地址之后，面包屑那张「路径段 → 中文名」的表还按老地址写着，
 * 于是除了 /s，每一页都印着地址里那个字母（「首页 / r」「首页 / r / 2」「首页 / se」）。
 * 两天里没有任何东西红过：表查不中就原样输出路径段，而这个组件一条测试都没有。
 *
 * ★ 所以这里**每一个首段都从登记表推**（collections.ts 的 urlPrefix、routes.ts 的
 *   ROUTES），不写一个路径段字面量 —— 下一次改前缀、加路由，面包屑没跟上就红。
 *   真实样本只有首段后面那一段：一个站上真有的标签（财报）和一只票（ORCL）。
 *
 *   A 组跑判据本身；B 组拿判据和 `src/pages/` 下的真实文件对账；
 *   C 组 grep 组件和判据的源码（先剥注释，钉的是拼写不是行为 —— 同 toc.test.ts 的 B 组）。
 *
 * 破坏实跑过（2026-09-23，docs/engineering-notes.md 坑 17 那条纪律；在临时目录的隔离副本里跑 ——
 * 改 collections.ts / routes.ts 会让共享的 dev server 当场坏掉）：17 处，每处至少红一条，
 * 改回来 12 条全绿。其中两处就是这次 bug 的形状：组件退回改之前的版本（C 组两条红）；
 * 前缀 r → rr 而判据是一张写死的表（A 组三条、B1、C2 红）。只改前缀不搬路由文件是
 * B 组两条红 —— 面包屑跟着改名走了，是盘上的路由没跟上。其余：集合按集合名登记、
 * 标的不算按键分页、每一段都查表、条目号当页码、链接只拿这一段、缺名字不抛、
 * 组件里点名 t.nav.posts、组件里写 "/t/"、判据里写一行表、ROUTES 加键没给名字、
 * 语言包丢一格、404 页挂面包屑、列表页错成单页、单页错成按键分页。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  BREADCRUMB_ROOTS,
  breadcrumbTrail,
} from "../../src/utils/breadcrumb";
import { CONTENT_COLLECTIONS } from "../../src/config/collections";
import { ENTRY_NO_MIN } from "../../src/config/entryNo";
import { ROUTES, type RouteKey } from "../../src/config/routes";
import zhCN from "../../src/i18n/lang/zh-CN";
import en from "../../src/i18n/lang/en";

const ROOT = process.cwd();
const PAGES = join(ROOT, "src", "pages");
const COMPONENT = "src/components/Breadcrumb.astro";
const UTIL = "src/utils/breadcrumb.ts";

const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
/** 先剥注释再 grep —— 两个文件的注释里都逐字写着老的那几个段名和 `t.nav.<某一格>`。 */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Lang = typeof zhCN | typeof en;
const LANGS: readonly (readonly [string, Lang])[] = [
  ["zh-CN", zhCN],
  ["en", en],
];
const navOf = (lang: Lang, key: string): string | undefined =>
  (lang.nav as Readonly<Record<string, string>>)[key];
const pageSuffix = (lang: Lang, n: number | string) =>
  `(${lang.pagination.page.toLowerCase()} ${n})`;
const trail = (path: string, lang: Lang = zhCN) =>
  breadcrumbTrail(path, { nav: lang.nav, page: lang.pagination.page });
const labels = (path: string, lang: Lang = zhCN) =>
  trail(path, lang).map(c => c.label);

/** 有列表页的集合：集合名（= t.nav 的键）和地址前缀。 */
const LISTED = CONTENT_COLLECTIONS.flatMap(c =>
  c.urlPrefix === null ? [] : [{ key: c.key, prefix: c.urlPrefix }]
);
const ROUTE_KEYS = Object.keys(ROUTES) as RouteKey[];
/** 登记表说有的全部首段。 */
const DECLARED: readonly string[] = [
  ...LISTED.map(c => c.prefix),
  ...ROUTE_KEYS.map(k => ROUTES[k]),
];

/** 站上真有的标签。地址里是编码过的，面包屑上印解码后的。 */
const TAG = "财报";
const TAG_SEG = encodeURIComponent(TAG);

// ── A. 判据本身 ────────────────────────────────────────────────────────────

test("A · ★ 每个集合的列表页：/<前缀> 印 nav.<集合名>，/<前缀>/2 带页码", () => {
  assert.ok(LISTED.length > 0, "登记表里一个有列表页的集合都没有 —— 是读错了表");
  for (const [name, lang] of LANGS) {
    for (const { key, prefix } of LISTED) {
      const label = navOf(lang, key);
      assert.ok(
        label,
        `${name} 语言包的 nav 里没有「${key}」—— /${prefix} 的面包屑没有名字可印`
      );
      assert.deepEqual(
        trail(`/${prefix}`, lang),
        [{ label, path: prefix }],
        `/${prefix}（${name}）该印「${label}」，而不是地址里那个字母；第 1 页不带页码`
      );
      assert.deepEqual(
        trail(`/${prefix}/2`, lang),
        [{ label: `${label} ${pageSuffix(lang, 2)}`, path: `${prefix}/2` }],
        `/${prefix}/2（${name}）该是一格「${label} ${pageSuffix(lang, 2)}」`
      );
    }
  }
});

test("A · ★ ROUTES 里每一条：/<段> 印 nav.<同一个键>", () => {
  for (const [name, lang] of LANGS) {
    for (const key of ROUTE_KEYS) {
      const seg = ROUTES[key];
      const label = navOf(lang, key);
      assert.ok(
        label,
        `${name} 语言包的 nav 里没有「${key}」（ROUTES.${key} = "${seg}"）—— ` +
          `面包屑按同一个键取名字，/${seg} 没有名字可印`
      );
      assert.deepEqual(
        trail(`/${seg}`, lang),
        [{ label, path: seg }],
        `/${seg}（${name}）该印「${label}」，而不是地址里那个字母`
      );
    }
  }
});

test("A · ★ 标签页、标的页：/<段>/<键>/2 把页码并进最后一格，第 1 页不带页码", () => {
  const cases = [
    { key: "tags", seg: TAG_SEG, shown: TAG },
    { key: "symbols", seg: "orcl", shown: "orcl" },
  ] as const;
  for (const [name, lang] of LANGS) {
    for (const { key, seg, shown } of cases) {
      const root = ROUTES[key];
      const label = navOf(lang, key)!;
      assert.deepEqual(
        trail(`/${root}/${seg}/2`, lang),
        [
          { label, path: root },
          { label: `${shown} ${pageSuffix(lang, 2)}`, path: `${root}/${seg}/2` },
        ],
        `/${root}/${seg}/2（${name}）的页码没并进「${shown}」那一格`
      );
      assert.deepEqual(
        trail(`/${root}/${seg}`, lang),
        [
          { label, path: root },
          { label: shown, path: `${root}/${seg}` },
        ],
        `/${root}/${seg}（${name}）是第 1 页，不该带页码`
      );
    }
  }
});

test("A · ★ 只有首段查表：票代码 / 标签名和某个首段同名时原样印", () => {
  // 前缀短成一两个字母之后这是真会发生的：A（安捷伦）的页面是 /s/a、SE（Sea）是 /s/se、
  // T（AT&T）是 /s/t、AR（Antero）是 /s/ar。上游每一段都查表，照那样写这几页的
  // 最后一格会印成「关于」「搜索」「标签」「归档」。这里不挑那几只，每个首段都喂一遍。
  for (const key of ["tags", "symbols"] as const) {
    const root = ROUTES[key];
    for (const seg of DECLARED) {
      assert.equal(
        labels(`/${root}/${seg}`).at(-1),
        seg,
        `/${root}/${seg} 的最后一格被当成首段翻译了`
      );
      assert.equal(
        labels(`/${root}/${seg}/2`).at(-1),
        `${seg} ${pageSuffix(zhCN, 2)}`,
        `/${root}/${seg}/2 的最后一格被当成首段翻译了`
      );
    }
  }
});

test("A · ★ 条目号不是页码：/r/1002 是一篇研究稿，不许印成「研究 (第 1002)」", () => {
  // 2026-09-21 起详情页地址也是纯数字；和分页的分界是条目号从 ENTRY_NO_MIN 起。
  const entryNo = String(ENTRY_NO_MIN);
  const lastPageBefore = String(ENTRY_NO_MIN - 1);
  for (const { key, prefix } of LISTED) {
    const label = navOf(zhCN, key)!;
    assert.deepEqual(
      trail(`/${prefix}/${entryNo}`),
      [
        { label, path: prefix },
        { label: entryNo, path: `${prefix}/${entryNo}` },
      ],
      `/${prefix}/${entryNo} 是一条内容的详情页，被当成了列表的第 ${entryNo} 页`
    );
    assert.deepEqual(labels(`/${prefix}/${lastPageBefore}`), [
      `${label} ${pageSuffix(zhCN, lastPageBefore)}`,
    ]);
    // 老地址那种 slug 也不是页码（原来那条"必须是纯数字"的判断防的就是它）。
    assert.deepEqual(labels(`/${prefix}/some-slug`), [label, "some-slug"]);
  }
});

test("A · 每一格都链到当前地址从根数起的一截，最后一格就是当前地址", () => {
  const paths = [
    ...DECLARED.map(s => `/${s}`),
    ...LISTED.map(c => `/${c.prefix}/2`),
    ...LISTED.map(c => `/${c.prefix}/${ENTRY_NO_MIN}`),
    `/${ROUTES.tags}/${TAG_SEG}/2`,
    `/${ROUTES.symbols}/orcl`,
    // 今天没有第三层还挂面包屑的页面。上游"只拿这一段拼链接"的写法在这里会把
    // 「orcl」链到站根下的 /orcl（404）。
    `/${ROUTES.symbols}/orcl/rss.xml`,
  ];
  for (const p of paths) {
    const segs = p.split("/").filter(Boolean);
    const crumbs = trail(p);
    let depth = 0;
    for (const c of crumbs) {
      const n = c.path.split("/").length;
      assert.ok(n > depth, `${p}：「${c.label}」没有比前一格更深`);
      assert.equal(
        c.path,
        segs.slice(0, n).join("/"),
        `${p} 里「${c.label}」链到 /${c.path}，那不是这个地址的一截`
      );
      depth = n;
    }
    assert.equal(crumbs.at(-1)?.path, segs.join("/"), `${p}：最后一格不是当前页`);
  }
});

test("A · 首页本身没有格", () => {
  assert.deepEqual(trail("/"), []);
  assert.deepEqual(trail(""), []);
});

test("A · ★ 首段登记在册、语言包里却没有名字：抛，不许原样印那个字母", () => {
  const { key, prefix } = LISTED[0]!;
  const nav: Record<string, string> = { ...zhCN.nav };
  delete nav[key];
  assert.throws(
    () => breadcrumbTrail(`/${prefix}`, { nav, page: zhCN.pagination.page }),
    /面包屑/,
    `语言包里没有「${key}」时 /${prefix} 照样出了一格 —— 那一格只能是地址里那个字母`
  );
  // 没登记的首段不归这里管（src/pages 下每条顶层路由都得有主，routes.test.ts 钉着），原样印。
  assert.deepEqual(labels("/not-a-route"), ["not-a-route"]);
});

// ── B. 和盘上的路由文件对账 ─────────────────────────────────────────────────

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();
/** `src/pages/<段>/[...page].astro` —— 集合列表页那种分页。 */
const hasListPages = (seg: string) =>
  existsSync(join(PAGES, seg, "[...page].astro"));
/** `src/pages/<段>/[<键>]/[...page].astro` —— 按一个键再分页（不算 `[...slug]` 那种剩余参数）。 */
const hasKeyedPages = (seg: string) =>
  isDir(join(PAGES, seg)) &&
  readdirSync(join(PAGES, seg), { withFileTypes: true }).some(
    d =>
      d.isDirectory() &&
      /^\[(?!\.\.\.)[^\]]+\]$/.test(d.name) &&
      existsSync(join(PAGES, seg, d.name, "[...page].astro"))
  );

test("B · ★ 每个首段都在面包屑的表里，形状和盘上的路由文件对得上", () => {
  for (const seg of DECLARED) {
    const root = BREADCRUMB_ROOTS.get(seg);
    assert.ok(
      root,
      `/${seg} 在登记表里，面包屑的表里却没有 —— 那张表没从登记表推`
    );
    const onDisk = hasListPages(seg)
      ? "list"
      : hasKeyedPages(seg)
        ? "keyed"
        : "page";
    assert.equal(
      root.shape,
      onDisk,
      `/${seg}：面包屑按「${root.shape}」切页码，盘上的路由是「${onDisk}」` +
        `（list = ${seg}/[...page].astro，keyed = ${seg}/[<键>]/[...page].astro）`
    );
  }
  assert.equal(
    BREADCRUMB_ROOTS.size,
    new Set(DECLARED).size,
    `面包屑的表里有登记表之外的首段：${[...BREADCRUMB_ROOTS.keys()].join(" / ")}`
  );
});

/** src/pages 下所有 .astro（`_` 开头的目录是页面私有的组件，跳过）。 */
function astroFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return d.name.startsWith("_") ? [] : astroFiles(p);
    return d.name.endsWith(".astro") ? [p] : [];
  });
}

test("B · ★ 每个挂了 <Breadcrumb /> 的页面，首段都登记在册", () => {
  const withCrumbs = astroFiles(PAGES).filter(f =>
    /<Breadcrumb\b/.test(stripComments(readFileSync(f, "utf8")))
  );
  assert.ok(
    withCrumbs.length > 0,
    "一个挂了 <Breadcrumb /> 的页面都没找到 —— 是遍历写坏了，不是真的没有"
  );
  for (const f of withCrumbs) {
    const rel = relative(PAGES, f).split(sep).join("/");
    const seg = rel.split("/")[0]!.replace(/\.astro$/, "");
    assert.ok(
      BREADCRUMB_ROOTS.has(seg),
      `src/pages/${rel} 挂了面包屑，但首段 /${seg} 不在登记表里 —— 那一格会原样印「${seg}」`
    );
  }
});

// ── C. 源码：组件只画，判据不手写路径段 ──────────────────────────────────────

test("C · ★ 组件只画不判：每一格从 breadcrumbTrail 来，除了「首页」不点名任何一格 nav", () => {
  const src = stripComments(read(COMPONENT));
  assert.match(
    src,
    /breadcrumbTrail\(\s*currentUrlPath\s*,/,
    `${COMPONENT} 没调 breadcrumbTrail —— 又在组件里自己拼面包屑了`
  );
  assert.match(
    src,
    /\bnav:\s*t\.nav\s*[,}]/,
    `${COMPONENT} 递给判据的得是整个 t.nav（取哪一格由登记表决定）`
  );
  const named = [...src.matchAll(/\bt\.nav\.(\w+)/g)]
    .map(m => m[1])
    .filter(k => k !== "home");
  assert.deepEqual(
    named,
    [],
    `${COMPONENT} 又点名了 t.nav.${named.join(" / t.nav.")} —— 那是一张手写的表，下次改地址它不会跟着走`
  );
});

test("C · ★ 组件和判据里都没有手写的路径段", () => {
  const collectionKeys = LISTED.map(c => c.key);
  const scan = (rel: string, forbidden: readonly string[]) => {
    const src = stripComments(read(rel));
    for (const s of new Set(forbidden)) {
      // "t"、"/t"、"/t/"、`/t/${…}` 都算 —— 手写的路径段最常见的就是这几种样子。
      const handWritten = new RegExp(
        `["'\`]/?${escapeRe(s)}/?(?:["'\`]|\\$\\{)`
      );
      assert.ok(
        !handWritten.test(src),
        `${rel} 里手写了 "${s}" —— 首段从 collections.ts / routes.ts 推，这里写死的那天就是下一次改地址时被落下的那天`
      );
    }
  };
  // 组件连 ROUTES 的键都不该出现；判据里只许有 ROUTES 的键（KEYED_ROUTES，类型钉着），
  // 不许有路径段、也不许有集合名。
  scan(COMPONENT, [...DECLARED, ...collectionKeys, ...ROUTE_KEYS]);
  scan(UTIL, [...DECLARED, ...collectionKeys]);
});
