/**
 * Sitemap 的**纯判据** —— 【2026-09-22 加】。
 *
 * 生成 sitemap 这件事本身是 `@astrojs/sitemap` 干的（astro.config.ts 里那个
 * `sitemap({...})`），**这两个文件不重新实现它**：页面清单必须来自 Astro 自己的
 * 路由表（`astro:routes:resolved` ＋ 构建出来的 `pages`），自己数一遍"站上有哪些页"
 * 就是手抄一份分页 / 标签 / 标的的生成规则，而漏一页是零症状的。
 *
 * 这里只补它不管的三件事：
 *
 *   1. **`/sitemap.xml` 这个地址**（`SITEMAP_FILE` ＋ `sitemapBuild.ts` 的
 *      `writeSitemapAlias`）—— 见下面第 1 节。
 *   2. **每条 `<lastmod>`**（`sitemapLastmod` ＋ `sitemapBuild.ts` 的
 *      `buildLastmodIndex`）—— 第 2 节。
 *   3. **robots.txt 的全文**（`robotsTxt`）—— 第 3 节。它只说一件事：sitemap 在哪。
 *      放在这个文件里是为了让那一行和它指向的那个文件名**在同一屏里**。
 *
 * 排除哪些页（搜索页 / 老地址跳转页 / 关掉的归档）是第四件事，它留在 astro.config.ts
 * 的 `filter` 里 —— `seo.test.ts` 和 `legacyUrls.test.ts` 已经各钉着一条，
 * 搬过来只会让那两条钉子指空。
 *
 * ## ⚠ 为什么扫盘和写盘在**另一个文件**里（`sitemapBuild.ts`）
 *
 * 这一份被 `src/layouts/Layout.astro` import（每一页都要印一条
 * `<link rel="sitemap">`，文件名不许再手写第二遍）。所以它**必须一个
 * `node:fs` 都不碰** —— 否则 `node:fs` 和 `gray-matter` 就跟着进了每一页的
 * 渲染图。今天是纯静态构建（全在 node 里跑），不出事；哪天真按 wrangler.jsonc
 * 里写的那样加一个 fetch handler（Workers 运行时没有 `node:fs`），
 * 坏的会是**整站每一页**，而原因隔着两层。
 *
 * ★ 零 import，纯函数：`scripts/gate/sitemap.test.ts` 用裸 tsx 直接 import 它测。
 */

// ── 1. `/sitemap.xml` ────────────────────────────────────────────────────

/**
 * 对外宣传的那一个 sitemap 地址。三处都读这一个常量：robots.txt 的 `Sitemap:` 行、
 * 每一页 `<head>` 里那条 `<link rel="sitemap">`、以及 `writeSitemapAlias` 写出来的
 * 那个产物。（Search Console 里手填的那一条在仓库外，见 docs/deploy.md 2.6。）
 *
 * ★ 为什么要有它：`@astrojs/sitemap` 的文件名**写不成 `sitemap.xml`**。
 *   它只有一个 `filenameBase` 选项（默认 `"sitemap"`），产出永远是
 *   `<base>-index.xml` ＋ `<base>-0.xml`（见它的 `write-sitemap.js`）——
 *   凑不出一个不带后缀的 `sitemap.xml`。而 `/sitemap.xml` 是人和工具会直接敲的
 *   那个地址（实测 2026-09-22：线上 `/sitemap.xml` 返回 **404**，
 *   `/sitemap-index.xml` 才是 200）。
 *
 * ⚠【2026-09-22】在这之前这个名字在仓库里有**三份各自写死的**：
 *   `src/pages/robots.txt.ts`、`src/layouts/Layout.astro`（每一页都印）、
 *   还有 docs 里那句"提交 sitemap"。`sitemap.test.ts` 的 E3 钉着
 *   "src/ 里没有第二处手写"。
 */
export const SITEMAP_FILE = "sitemap.xml";

/** `@astrojs/sitemap` 真正写出来的那个索引文件名（= `filenameBase` 默认值推出来的）。 */
export const SITEMAP_INDEX_FILE = "sitemap-index.xml";

// ── 2. `<lastmod>` ───────────────────────────────────────────────────────

/**
 * 站内路径（`/r/1002`）→ ISO 时刻。**只有"背后正好是一份 .md"的那些页面在里面。**
 * 建表的活在 `sitemapBuild.ts` 的 `buildLastmodIndex()`。
 */
export type LastmodIndex = ReadonlyMap<string, string>;

/**
 * `@astrojs/sitemap` 的 `serialize` 拿到的是完整地址（`https://lwj.ai/r/1002`，
 * 首页是 `https://lwj.ai/`）。把它换成上面那张表的键去查，查不到返回 `undefined`。
 *
 * ★ 按**末两段**查，不按整条 pathname 比：这样 `base` 哪天配成子路径
 *   （`/x/r/1002`）也照样查得中 —— 而那种失配的症状是"全站 lastmod 一起没了"，
 *   零报错。
 *
 * ★ 这么查**不会误伤列表页**，而那件事靠的是另一条纪律：条目号从 1000 起
 *   （`src/config/entryNo.ts` 的 `ENTRY_NO_MIN`）。列表页的分页地址是 `/r/2`、`/r/3`，
 *   要和键 `/r/1002` 撞上得先有 1000 页 —— 编号从 1000 起的理由正是这一条，
 *   见那个文件开头。**改 `ENTRY_NO_MIN` 之前先回来看这里。**
 *
 * ⚠ 首页（`https://lwj.ai/`）和一级页面（`/r`、`/t`）只有一段或零段，查不出键 ——
 *   它们**本来就该没有 `<lastmod>`**：一个聚合页的"最后修改时间"要靠重算
 *   "这一页上列着哪几条"才知道，而那是把站上的排序、折叠、分页规则再抄一遍
 *   （`getSortedPosts()` ＋ `foldQaGroups()` ＋ `paginate()`）。抄错了没人看得见。
 *   与其印一个可能是错的时间，不如不印（理由见 `lastModified.ts` 文件头最后一段）。
 */
export function sitemapLastmod(
  index: LastmodIndex,
  itemUrl: string
): string | undefined {
  const segments = new URL(itemUrl).pathname.split("/").filter(Boolean);
  if (segments.length < 2) return undefined;
  return index.get(`/${segments.slice(-2).join("/")}`);
}

// ── 3. robots.txt ────────────────────────────────────────────────────────

/**
 * robots.txt 的全文。`site` 是站点根地址（`Astro.site`）。
 *
 * ★ `Sitemap:` 那一行的文件名读上面那个 `SITEMAP_FILE`。写死一份的症状是：
 *   改了产出文件名之后 robots.txt 指着一个 404，而站、构建、闸门四处全绿，
 *   只有搜索引擎那头一直抓不到。
 *
 * ⚠ **刻意没有 `Disallow`。** 两个看着该挡的其实都不该写进来：
 *
 *     - `/se`（搜索页）—— 它靠 `robots="noindex, follow"` 那条 meta 声明不收录。
 *       robots.txt 里 Disallow 掉挡住的是**抓取**、不是收录，抓取方因此
 *       **根本读不到那条 meta**，反而更容易留下一条"已发现但未编入索引"。
 *       两处一起管同一件事的口径写在 `seo.test.ts` 的 /search 那条里。
 *     - 后台 `/keystatic`、`/_gate`、`/_publish` 这些 —— 它们**只在 `astro dev` 里
 *       存在**，生产构建里根本没有这些路由（astro.config.ts 顶上那段）。
 *       在公网 robots.txt 里列一串本地开发入口，等于把它们写给所有人看。
 */
export function robotsTxt(site: URL | string): string {
  const sitemapUrl = new URL(SITEMAP_FILE, site).href;
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
}
