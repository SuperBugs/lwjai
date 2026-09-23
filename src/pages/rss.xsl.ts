import xsl from "@/assets/rss.xsl?raw";

/**
 * `/rss.xsl` —— 浏览器打开 feed 时渲染那一页用的样式表。正文在
 * `src/assets/rss.xsl`（那个文件头上写着它为什么存在、以及那几条边界）。
 *
 * ★ 为什么是一条**路由**而不是 `public/rss.xsl`：【2026-09-21 实测】Astro 7 的
 *   rolldown 会把 `public/` 下**扩展名不认识**的文件当 JS 模块解析，放进去
 *   `astro build` 当场红（`[PARSE_ERROR] Unexpected JSX expression`，
 *   拿 `public/probe2.zzz` 复现过，和扩展名、内容都无关）。
 *   走 `?raw` 就只是一个字符串，谁都不去解析它。
 *
 * ⚠ 静态构建里这里设的响应头**发不出去**：Astro 把 body 写成 `dist/rss.xsl`，
 *   线上那个 Content-Type 由 Cloudflare 按扩展名决定。浏览器只在它是 XML 类
 *   （`application/xslt+xml` / `text/xml`）时才应用样式表，是别的就**静默**回落到
 *   裸 XML —— 那半件事仓库里测不到，上线后 curl 一次（命令写在 feed.test.ts 头上）。
 *   头仍然照写：`astro dev` 和 `astro preview` 里它是真生效的，本机预览按的就是它。
 */
export function GET() {
  return new Response(xsl, {
    headers: { "Content-Type": "application/xslt+xml; charset=utf-8" },
  });
}
