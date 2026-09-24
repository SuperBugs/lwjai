/**
 * 把后台传的那张二维码**重新编码**成 `/wechat-qr.png`（「关于」页和开源仓库 README 都引用它）。
 *
 * ★ 为什么不走 Astro 的图片管线（`import` / `<Image>`）：那条路会先把**原图**发进产物、
 *   事后只删做过变换的（坑 15）—— 目录里留着一张旧码（换过扩展名的那次），它就连
 *   EXIF 逐字节上公网。这里按 JSON 里那一条路径**只读那一个文件**，自己过一遍 sharp：
 *   产物里只有重新编码过的这一份，原图的字节一个都不出去。
 * ★ sharp 默认**丢掉全部元数据**（EXIF / XMP / ICC）。手机截的图常带设备型号、时间。
 *   码上**印着的**昵称、头像、群名是画面的一部分，这里管不着；这里管的是文件里**藏着的**。
 *   先 `rotate()`：按 EXIF 的方向转正之后再丢元数据，否则横着截的图丢了方向就是歪的。
 * ★ 格式**按内容**查（`metadata().format`），不信扩展名：改了扩展名的 SVG 在这一步现形。
 */
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import sharp from "sharp";
import type { WechatQr } from "../config/community";

/** 出图宽度的上限：页面上画 14rem（224px），三倍屏 672 —— 640 足够扫。
 *  更小的原图不放大（`withoutEnlargement`），放大只会让码糊。 */
export const WECHAT_QR_MAX_WIDTH = 640;

/** sharp 认出来的格式名里，收这几种（jpg / jpeg 在 sharp 那边都叫 jpeg）。 */
const ACCEPTED = new Set(["png", "jpeg", "webp"]);

export interface WechatQrImage {
  png: Buffer;
  width: number;
  height: number;
  /** 输出字节的指纹，页面挂在 `?v=` 上：换了码，浏览器不会拿缓存里那张旧的。 */
  version: string;
}

/** 读图、按内容验格式、转正、缩到上限以内、编码成 PNG。**任何一步不对都抛**（构建红）。 */
export async function renderWechatQr(
  qr: WechatQr,
  root: string = process.cwd()
): Promise<WechatQrImage> {
  const abs = join(root, qr.file);
  if (!existsSync(abs)) {
    throw new Error(
      `微信群二维码找不到：${qr.file} —— src/data/community.json 指着它，盘上没有。` +
        `去后台「微信群」那一页重传一次（提交的时候图要和 JSON 一起走，/_publish 会带上它）。`
    );
  }
  const input = readFileSync(abs);
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch (e) {
    throw new Error(
      `微信群二维码读不出来：${qr.file}（${e instanceof Error ? e.message : String(e)}）` +
        ` —— 换一张 PNG / JPG 截图重传。`
    );
  }
  if (!format || !ACCEPTED.has(format)) {
    throw new Error(
      `微信群二维码 ${qr.file} 按内容看是 ${format ?? "认不出的格式"}，只收 PNG / JPEG / WebP` +
        ` —— 换一张截图重传（改扩展名没用，这里看的是文件内容）。`
    );
  }
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: WECHAT_QR_MAX_WIDTH, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  return {
    png: data,
    width: info.width,
    height: info.height,
    version: createHash("sha256").update(data).digest("hex").slice(0, 12),
  };
}
