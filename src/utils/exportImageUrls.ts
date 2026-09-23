import type { ImageMetadata } from "astro";
import { getImage } from "astro:assets";
import config from "@/config";
import { imageImportId, localImagePaths } from "./exportMarkdown";

/**
 * 导出的 .md 里，正文每张本地图该换成的**站上完整地址**。
 * 【2026-09-23 用户要的】「下载的把图片地址改成网站上的完整地址」。
 *
 * 四个 `.md` 端点各调一次，结果交给 `toExportMarkdown()` 去换（那边是纯函数、有单测）。
 *
 * ## 地址就是页面上那张图的地址，一个字节都不多生成
 *
 * 页面渲染正文时，Astro 对每张本地图调的是
 * `getImage({ ...{ src, alt, index }, src: <导入表里那张图> })`
 * （`astro/dist/content/runtime.js` 的 `updateImageReferencesInBody`）。
 * 这里对**同一个导入对象**调 `getImage({ src })`：`alt` / `index` 不参与 hash
 * （`DEFAULT_HASH_PROPS` 是 src / width / height / format / quality / fit / position /
 * background），所以算出来的是**同一个 `/_astro/<名>.<hash>.webp`**，构建时按 hash 去重 ——
 * 不会为下载多生成一张图。dev 里是同一个 `/_image?href=…&w=…&f=webp`（2026-09-23 对着
 * `/g/1005` 逐张比过）。
 *
 * ## ⚠ 为什么不许用 `import.meta.glob` 自己去导图
 *
 * 看起来最省事的写法是 `import.meta.glob("/src/assets/**\/*.{jpg,png…}")` 再按路径查。
 * 但 Astro 的图片插件在**构建时**对每一个被导入的图都会把**原图**发进产物
 * （`vite-plugin-assets.js` 的 `emitImageMetadata(id, fileEmitter)`），
 * 事后只删掉"做过变换、又没被直接引用"的那些（`build/generate.js`）。
 * 一张没有任何页面在用的截图（删掉的稿子留下的、换掉的旧图）被 glob 导进来之后
 * **没人给它做变换，也就没人删它** —— 原图连 EXIF 一起逐字节上公网（坑 15 那个形态），
 * 而页面、构建、闸门四处全绿。
 * 所以这里只用 Astro **已经为正文导入过的那张表**（`astro:asset-imports`），
 * 一张新的导入都不加。
 *
 * ⚠ 那张表和它的键格式都是 Astro 的**内部实现**（键格式抄在 `exportMarkdown.ts` 的
 *   `imageImportId()` 里）。升级 Astro 之后对不上的症状是下面那句 throw ——
 *   构建当场红，不是静默出一张裂图。
 * ⚠ 拿到的图片对象**只许原样递给 `getImage()`**，别读它的 `.src`：
 *   静态构建里那是一个 Proxy，读 `.src` 会把原图登记成"被直接引用"，
 *   构建就把原图逐字节留在产物里（`astro/dist/assets/utils/proxy.js`）。
 *   `getImage()` 自己只读 `.fsPath` 和 `.clone`，不会触发它。
 *
 * ## 地址的前半截
 *
 * 构建时是 `config.site.url`（`https://lwj.ai`）。dev 里 `getImage()` 给的是
 * `/_image?href=/@fs/D:/…` 这种只有本机 dev server 认得的地址，拼上线上域名就是一个
 * 打不开的假地址 —— 所以 dev 里用这次请求自己的 origin（`http://127.0.0.1:4321`），
 * 在本机点得开；这种地址只出现在 dev 里，构建产物里没有。
 */
export async function exportImageUrls(
  entry: {
    filePath?: string;
    rendered?: { metadata?: { imagePaths?: unknown } };
  },
  requestUrl: URL
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();

  const imagePaths = entry.rendered?.metadata?.imagePaths;
  // ★ 拿不到清单**不许当成"一张图都没有"** —— 那样哪天 Astro 改了这个字段的形状，
  //   每一篇带图的稿子在下载文件里都是一排裂图，而四处全绿。
  if (!Array.isArray(imagePaths) || !entry.filePath) {
    throw new Error(
      `拿不到 Astro 渲染这一篇时认出来的图片清单（entry.rendered.metadata.imagePaths），` +
        `或者这一篇没有 filePath（${entry.filePath ?? "undefined"}）。` +
        `导出口换图片地址靠的就是这两样 —— 多半是 Astro 升级改了形状，去看 src/utils/exportImageUrls.ts。`
    );
  }

  const local = localImagePaths(imagePaths as string[]);
  if (local.length === 0) return urls;

  // Astro 内部的虚拟模块（盘上是 .astro/content-assets.mjs），没有类型声明；
  // 它自己的运行时也是这么动态 import 的（astro/dist/content/runtime.js）。
  // @ts-expect-error —— 见上。哪天 Astro 给它补了类型，这一行会因为"没有错误可压"而红。
  const { default: imported } = (await import("astro:asset-imports")) as {
    default: Map<string, ImageMetadata>;
  };

  const origin = import.meta.env.DEV ? requestUrl.origin : config.site.url;

  for (const src of local) {
    const id = imageImportId(src, entry.filePath);
    // Astro 不认的格式：页面上那张图也没被处理（原样输出），文件里跟着不换。
    if (id === undefined) continue;
    const image = imported.get(id);
    if (image === undefined) {
      throw new Error(
        `「${entry.filePath}」里的 ${src} 在 Astro 的图片导入表里查不到（键：${id}）。\n` +
          `  页面上这张图是画出来了的，导出口却算不出它的地址 —— 多半是 Astro 升级改了键的格式，\n` +
          `  去对一眼 .astro/content-assets.mjs 里的键，改 src/utils/exportMarkdown.ts 的 imageImportId()。`
      );
    }
    const result = await getImage({ src: image });
    urls.set(src, new URL(result.src, origin).href);
  }

  return urls;
}
