import type { APIRoute } from "astro";
import { useTranslations } from "@/i18n";
import config from "@/config";
import { LIST_COLLECTIONS } from "./entryListPlan";
import { scanEntryRows } from "./entryListScan";
import { bylineOf } from "./xhsEntry";

/**
 * 后台列表页的数据 —— `GET /_entries?c=<集合>`，**只在 `pnpm dev` 里存在**
 * （astro.config.ts 按 isDev 用 injectRoute 挂上；文件不在 src/pages 下，生产构建里没有这条路由）。
 *
 * 浏览器里那张表（`keystaticEntryList.ts`）每次进列表页读一次、切回这个标签页再读一次。
 * 扫盘在 `entryListScan.ts`，判据在 `entryListPlan.ts` —— 这个文件只管"谁能调、吐什么"。
 *
 * ★ 「智能体（模型）」那一串走 `bylineOf()`：和 /_share、封面卡、站上那张芯片同一份判据，
 *   后台列表里不许冒出第三种写法。
 * ★ 只读：这条接口一个字节都不写。所以它不要 publish-run 那种 `X-Requested-With` 口令，
 *   只挡**别的站点**发来的请求（`Sec-Fetch-Site: cross-site`）—— 草稿的标题和摘要也在里面，
 *   而 dev server 跑在 localhost 上。地址栏里直接敲（`none`）照样给看，排查的时候用得上。
 */

/**
 * ★ 必须显式关掉预渲染（同 tidy-run.ts / preview.astro）：预渲染路由拿到的
 *   `url.searchParams` 和请求头都是空的，`?c=` 永远读不到。
 */
export const prerender = false;

export const GET: APIRoute = ({ request, url }) => {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") {
    return json(
      { error: `只认后台自己的请求（Sec-Fetch-Site 是 ${site}）` },
      403
    );
  }

  const collection = url.searchParams.get("c") ?? "";
  if (!LIST_COLLECTIONS.includes(collection)) {
    return json(
      {
        error: `不认识的集合「${collection}」—— 只认 ${LIST_COLLECTIONS.join(" / ")}`,
      },
      400
    );
  }

  const t = useTranslations(config.site.lang);
  try {
    const entries = scanEntryRows(collection, {
      now: Date.now(),
      byline: data => bylineOf(collection, data, t),
    });
    return json({ collection, readAt: new Date().toISOString(), entries }, 200);
  } catch (err) {
    // 目录不在、读不动：回一句人话（不是 Astro 那张 HTML 错误页 —— 浏览器那头要把它印出来）。
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: `读「${collection}」失败：${msg}` }, 500);
  }
};

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
