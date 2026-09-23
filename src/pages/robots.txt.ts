import type { APIRoute } from "astro";
import { robotsTxt } from "@/config/sitemap";

/**
 * robots.txt。全文（以及"为什么没有 `Disallow`"）在 `src/config/sitemap.ts` 第 3 节 ——
 * 那里紧挨着 `SITEMAP_FILE`，也就是 `Sitemap:` 那一行指向的那个产物文件名。
 * 这一页只剩"把它发出去"这一件事。
 */
export const GET: APIRoute = ({ site }) => {
  if (!site) {
    // 站点根地址来自 astro.config.ts 的 `site`。没配的话 `Sitemap:` 只能写出一个
    // 相对地址，而 robots.txt 的规范要求那里是绝对地址 —— 宁可构建红。
    throw new Error(
      "astro.config.ts 的 `site` 没配，robots.txt 里的 Sitemap 行写不出绝对地址"
    );
  }
  return new Response(robotsTxt(site));
};
