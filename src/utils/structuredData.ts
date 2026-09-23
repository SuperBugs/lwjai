/**
 * 结构化数据（JSON-LD）的唯一拼装点 —— 【2026-09-20 加】。
 *
 * 两种：
 *   - 首页一份 `WebSite` + `Organization`（`siteJsonLd`，index.astro 调）：站名、**站名别名**、
 *     地址、社交账号。Google 的「站点名称」读的就是这一块 —— 人在搜索框里敲的是「牢玩家AI」
 *     「lwj.ai」这些写法，得告诉它这些指的都是这个站（`alternateName`）。
 *   - 四个详情页各一份 `BlogPosting`（`blogPostingJsonLd`，PostLayout 调）：标题、摘要、
 *     发布 / 修改时间、分享图、作者、出版方、规范地址。
 *
 * ★ 纯函数，只 import 另一个纯判据模块（没有 `@/` 别名、没有 astro 虚拟模块）：
 *   `scripts/gate/seo.test.ts` 用裸 tsx 直接 import 它测，这一条是那样写的前提。
 *   拿 Astro 的东西（Astro.site、config、i18n）的活在调用方做，这里只收字符串。
 *
 * ★ `headline` 收的是**不带站名后缀**的标题。在这之前 PostLayout 拿 `<title>`
 *   （「… | 牢玩家」）直接当 headline，Google 看到的每篇标题后面都挂着站名。
 *
 * ★ `dateModified` 没有时退回 `datePublished`：没改过的稿子，最近一次改动就是发布那次。
 *   两个都没有时**这两个字段都不写** —— 不编一个日期出来。
 *   ⚠【2026-09-22】这句判据**搬去了 `src/config/lastModified.ts`**，下面调它：
 *   sitemap 里每条 `<lastmod>` 回答的是同一个问题，而那两个答案会被同一个抓取方
 *   在几秒内先后读到 —— 各写一份就是 docs/engineering-notes.md 坑 8 / 坑 22 那个形态。
 *
 * ★ 空数组不写进去：`alternateName: []` / `sameAs: []` 会被 Google 的校验器当成错。
 *   "没有别名"和"别名是空表"在输出里必须长得一样 —— 都是没有那个键。
 */

import { lastModifiedAt } from "../config/lastModified";

export type SiteJsonLdInput = {
  /** 站名（`site.title`）。 */
  name: string;
  /** 站名的其他写法（`site.alternateNames`）。空 / 不传 = 不写 alternateName。 */
  alternateNames?: readonly string[];
  /** 站点根地址，带末尾斜杠（`site.url`）。 */
  url: string;
  description: string;
  /** BCP 47，如 zh-CN。 */
  lang: string;
  /** 绝对地址的 logo。 */
  logoUrl?: string;
  /** 社交账号地址（Organization.sameAs）。`mailto:` 不是账号，由调用方先滤掉。 */
  sameAs?: readonly string[];
};

export function siteJsonLd(input: SiteJsonLdInput): Record<string, unknown> {
  const orgId = `${input.url}#organization`;

  const organization: Record<string, unknown> = {
    "@type": "Organization",
    "@id": orgId,
    name: input.name,
    url: input.url,
  };
  if (input.logoUrl) organization.logo = input.logoUrl;
  if (input.sameAs && input.sameAs.length > 0) {
    organization.sameAs = [...input.sameAs];
  }

  const website: Record<string, unknown> = {
    "@type": "WebSite",
    "@id": `${input.url}#website`,
    name: input.name,
    url: input.url,
    description: input.description,
    inLanguage: input.lang,
    publisher: { "@id": orgId },
  };
  if (input.alternateNames && input.alternateNames.length > 0) {
    website.alternateName = [...input.alternateNames];
  }

  return {
    "@context": "https://schema.org",
    "@graph": [website, organization],
  };
}

export type BlogPostingJsonLdInput = {
  /** 原标题，**不带**「| 站名」后缀。 */
  headline: string;
  description?: string;
  /** 规范地址（canonical）。 */
  url: string;
  /** 绝对地址的分享图。 */
  image?: string;
  datePublished?: Date;
  dateModified?: Date | null;
  /** BCP 47，如 zh-CN。 */
  lang: string;
  author: { name: string; url?: string };
  publisher: { name: string; url: string; logoUrl?: string };
};

export function blogPostingJsonLd(
  input: BlogPostingJsonLdInput
): Record<string, unknown> {
  const author: Record<string, unknown> = {
    "@type": "Person",
    name: input.author.name,
  };
  if (input.author.url) author.url = input.author.url;

  const publisher: Record<string, unknown> = {
    "@type": "Organization",
    name: input.publisher.name,
    url: input.publisher.url,
  };
  if (input.publisher.logoUrl) {
    publisher.logo = { "@type": "ImageObject", url: input.publisher.logoUrl };
  }

  const out: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.headline,
    url: input.url,
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    inLanguage: input.lang,
    author: [author],
    publisher,
  };
  if (input.description) out.description = input.description;
  if (input.image) out.image = input.image;
  if (input.datePublished) {
    out.datePublished = input.datePublished.toISOString();
  }
  // 「最后改的是哪一刻」只有一个判据（见文件头那条 ⚠）—— sitemap 的 <lastmod>
  // 读的是同一个函数。两个都没有时它返回 undefined，这里就一个字段都不写。
  const lastModified = lastModifiedAt(input.datePublished, input.dateModified);
  if (lastModified) out.dateModified = lastModified.toISOString();
  return out;
}
