import type { APIRoute } from "astro";
import { wechatGroupState } from "@/utils/wechatGroup";
import { renderWechatQr } from "@/utils/wechatQr";

/**
 * 微信群二维码，`/wechat-qr.png`（【2026-09-24】「关于」页和开源仓库 README 都引用这个地址）。
 *
 * ★ 只有 `active` 那一档生成。没配 / 已过期都回一个**没有 body** 的 404 ——
 *   静态构建遇到没有 body 的响应**不写文件**（`astro/dist/core/build/generate.js`），
 *   线上这个地址就是真的 404，README 那边显示替代文字，而不是一张扫不进去的旧码。
 * ⚠ 构建之后才过期的那种挡不住：文件已经发出去了，要等下一次构建。站上的页面有
 *   `WechatGroup.astro` 那段脚本兜着，README 没有 —— 所以 README 里那句
 *   「如已失效，请到 lwj.ai/a 获取最新」是承重的。
 */
export const GET: APIRoute = async () => {
  const state = wechatGroupState(new Date());
  if (state.tier !== "active") {
    if (state.tier === "expired") {
      // eslint-disable-next-line no-console -- 过期了**必须**在构建日志里留一行：站上只是换成一句提示，README 那边只是少一张图，都不报错。
      console.warn(
        `⚠ 微信群二维码已过失效时刻（${state.qr.expiresOn}）：/wechat-qr.png 这次不生成，` +
          `「关于」页画的是"已过期"那一档。去后台「微信群」那一页换一张新的。`
      );
    }
    return new Response(null, { status: 404, statusText: "Not found" });
  }
  const img = await renderWechatQr(state.qr);
  return new Response(new Uint8Array(img.png), {
    headers: { "Content-Type": "image/png" },
  });
};
