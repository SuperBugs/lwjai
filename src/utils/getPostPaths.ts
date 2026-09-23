import { getRelativeLocaleUrl } from "astro:i18n";
import {
  requireCollectionSpec,
  type ContentCollectionSpec,
} from "@/config/collections";
import { slugifyStr } from "./slugify";
import config from "@/config";

/**
 * 条目地址的计算。**集合是显式的第一个参数，不再隐含成 posts。**
 *
 * ★【2026-09-18 踩到】原来剥内容根前缀用的是写死的 BLOG_PATH：
 *   `filePath?.replace(BLOG_PATH, "")`，BLOG_PATH = "src/content/posts"。
 *   qa 条目的 filePath 是 "src/content/qa/foo.md"，这个 replace **是个空操作，
 *   而且不抛错** —— 路径段变成 ["src","content","qa"]，最终 href
 *   `/posts/src/content/qa/foo`。构建全绿、链接 404，没有任何一处会响。
 *   所以现在目录前缀从 `src/config/collections.ts` 的登记表里取，
 *   而且**对不上就抛**：宁可构建红，也不要一个看起来正常的坏链接。
 */

/**
 * 把 filePath 剥成"集合目录之内"的相对路径。
 *
 * 用 indexOf 而不是 startsWith：filePath 在不同调用上下文里可能带 "./" 或者
 * 绝对路径前缀，但"在不在这个集合的目录里"只由那一段决定。
 * 找不到那一段就抛 —— 那说明传进来的条目属于另一个集合（见文件头注释）。
 */
function relativeToDir(filePath: string, spec: ContentCollectionSpec): string {
  // Windows 上拿到反斜杠路径的时候，下面的 split("/") 会整条路径变成一段。
  const normalized = filePath.replaceAll("\\", "/");
  const prefix = spec.dir.endsWith("/") ? spec.dir : `${spec.dir}/`;
  const at = normalized.indexOf(prefix);
  if (at < 0) {
    throw new Error(
      `filePath「${filePath}」不在 ${spec.key}（${spec.label}）的内容目录「${spec.dir}」里 —— ` +
        `八成是把另一个集合的条目传给了它，那样算出来的地址是 404。`
    );
  }
  return normalized.slice(at + prefix.length);
}

/** 子目录层级（不含文件名）。`_` 开头的按上游约定不进地址。 */
function getEntryPathSegments(
  collection: string,
  filePath: string | undefined
): string[] {
  if (!filePath) return [];
  return relativeToDir(filePath, requireCollectionSpec(collection))
    .split("/")
    .filter(path => path !== "")
    .filter(path => !path.startsWith("_"))
    .slice(0, -1)
    .map(segment => slugifyStr(segment));
}

function getIdSlug(id: string): string {
  const postId = id.split("/");
  return postId.length > 0 ? String(postId[postId.length - 1]) : id;
}

function getEntrySlugPath(
  collection: string,
  id: string,
  filePath: string | undefined
): string {
  const pathSegments = getEntryPathSegments(collection, filePath);
  const slug = getIdSlug(id);
  return pathSegments.length > 0
    ? [...pathSegments, slug].join("/")
    : String(slug);
}

/**
 * `getStaticPaths` 里当路由参数用的那一段：没有集合前缀、没有语言前缀。
 * e.g. `/examples/my-post`
 */
export function entrySlug(
  collection: string,
  id: string,
  filePath?: string
): string {
  return `/${getEntrySlugPath(collection, id, filePath)}`;
}

/**
 * `<a href>` / RSS 里能直接用的完整地址：带集合前缀、语言路由和 Astro base。
 * e.g. `/posts/my-post`、`/qa/my-question`、`/en/posts/my-post`
 *
 * ★ `urlPrefix` 为 null 的集合（单页）**抛错，不静默返回一个坏地址**。
 *   那种集合没有"按条目的详情页"这回事，调这个函数本身就是调用方搞错了。
 */
export function entryUrl(
  collection: string,
  id: string,
  filePath?: string,
  locale: string | undefined = config.site.lang
): string {
  const spec = requireCollectionSpec(collection);
  if (spec.urlPrefix === null) {
    throw new Error(
      `${spec.key}（${spec.label}）没有按条目的详情路由，算不出条目地址。` +
        `它的页面是单独写的路由，链接请直接写死那个路径。`
    );
  }
  return getRelativeLocaleUrl(
    locale,
    `${spec.urlPrefix}/${getEntrySlugPath(collection, id, filePath)}`
  );
}

/**
 * 一个集合的**列表页**地址（`/r`、`/q`、`/g`、`/p`）。
 *
 * 【2026-09-21】加这个函数是因为导航栏和首页原来各写一份
 * `getRelativeLocaleUrl(locale, "posts")` —— 前缀从 `posts` 改成 `r` 那天，
 * 登记表改了、详情页地址跟着变了，而这些**手写的列表链接会安静地指向 404**
 * （Astro 不核对 `<a href>`，构建、类型检查、闸门四处全绿）。
 *
 * ★ `urlPrefix` 为 null 的集合抛错，理由同 `entryUrl`。
 */
export function collectionUrl(
  collection: string,
  locale: string | undefined = config.site.lang
): string {
  return getRelativeLocaleUrl(locale, collectionPrefix(collection));
}

/**
 * 同上，但**不带语言前缀和 base** —— 导航栏拿它和当前路径比（`isActive`）。
 * `/r`、`/q`、`/g`、`/p`。
 */
export function collectionPath(collection: string): string {
  return `/${collectionPrefix(collection)}`;
}

function collectionPrefix(collection: string): string {
  const spec = requireCollectionSpec(collection);
  if (spec.urlPrefix === null) {
    throw new Error(
      `${spec.key}（${spec.label}）没有列表页 —— 它没有按条目的详情路由，也就没有"这个集合的地址"。`
    );
  }
  return spec.urlPrefix;
}

/**
 * Returns the slug-only path for use as a route param in `getStaticPaths`.
 * No base prefix, no locale — Astro handles those at a higher level.
 * e.g. `/examples/my-post`
 *
 * （签名保持不变，方便上游 AstroPaper 的改动对照合过来。）
 */
export function getPostSlug(id: string, filePath: string | undefined): string {
  return entrySlug("posts", id, filePath);
}

/**
 * Returns a fully navigable URL for use in `<a href>` and RSS links.
 * Applies both locale routing and the configured Astro base via
 * `getRelativeLocaleUrl`.
 * e.g. `/posts/my-post` or `/en/posts/my-post`
 *
 * （签名保持不变，同上。新代码直接用 `entryUrl`。）
 */
export function getPostUrl(
  id: string,
  filePath: string | undefined,
  locale: string | undefined = config.site.lang
): string {
  return entryUrl("posts", id, filePath, locale);
}
