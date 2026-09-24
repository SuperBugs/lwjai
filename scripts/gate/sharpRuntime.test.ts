/**
 * **整个进程里只许有一份 sharp。**
 *
 * ## 【2026-09-23 实测踩到】两份 sharp = 所有出图路由 500，而且时灵时不灵
 *
 * 症状：`/og.png`、`/r/<号>/index.png`、`/_xhs/card.png`（现在是 `/_cards/card.png`）全部 500，返回的是
 * Astro 的裸错误页（错误发生在**模块加载期**，没进处理函数的 try/catch）：
 *
 *     Could not load the "sharp" module using the win32-x64 runtime
 *     ERR_DLOPEN_FAILED: The specified procedure could not be found.
 *
 * 根因是**两条永不重叠的版本范围**：
 *
 *     astro 7.0.3  optionalDependencies: sharp = ^0.34.0
 *     我们         dependencies:         sharp = ^0.35.2   ← 建站起就是这个
 *
 * pnpm 于是装两份，**两份各自带一个不同的 `libvips-42.dll`**（实测三份的
 * sha256 和大小互不相同）。而 Windows 加载 DLL **按文件名**去认已经加载过的模块：
 * dev server 里 astro 的图片优化先把 0.34.5 那份装进进程，随后我们的 0.35.2 的
 * `.node` 去它里面找导出 —— 找不到，就是那句 "specified procedure could not be found"
 * （Win32 的 `ERROR_PROC_NOT_FOUND`）。
 *
 * ## ⚠ 它为什么能潜伏好几天没被发现
 *
 * **看谁先加载**：先打 `/og.png` 的那次，我们这份先进进程，一切正常；
 * 先打一个带优化图片的页面（也就是正常用站的顺序），astro 那份先进，出图全挂。
 * 所以它在同一台机器上时好时坏，而 `node -e "require('sharp')"` **永远是好的**
 * （那个进程里只有一份）—— 这正是最难查的那种。
 *
 * ## 这条测试钉的是**真实解析结果**，不是版本字符串
 *
 * ★ 比"两个 range 写得一样"强：range 怎么写不重要，**解析到不到同一个文件**才重要。
 * ⚠ astro 哪天把范围抬到 `^0.35`，这条会红 —— 那时把 package.json 里那条
 *   跟着抬上去，别去改这条测试。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

const ROOT = join(import.meta.dirname, "..", "..");
const req = createRequire(join(ROOT, "package.json"));

const read = (p: string) =>
  JSON.parse(readFileSync(p, "utf8")) as {
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };

test("sharp 在整个进程里只许有一份（两份 = 出图全 500，而且时灵时不灵）", () => {
  /**
   * 我们的 src（`ogCard.ts` / `xhsCard.ts`）解析到哪一份，
   * astro 自己的图片优化又解析到哪一份。
   * ⚠ 找不到要**红**，不许跳过 —— 一条悄悄不跑的测试比没有更坏。
   */
  const ours = req.resolve("sharp");

  const astroPkg = req.resolve("astro/package.json");
  const theirs = createRequire(astroPkg).resolve("sharp");

  const ourRange = read(join(ROOT, "package.json")).dependencies?.sharp;
  const astroRange = read(astroPkg).optionalDependencies?.sharp;

  assert.equal(
    ours,
    theirs,
    `我们和 astro 解析到了两份不同的 sharp —— 出图路由会在模块加载期 500，\n` +
      `而且看哪份先进进程，时灵时不灵（见这个文件头）。\n` +
      `  我们  ${ourRange} → ${ours}\n` +
      `  astro ${astroRange} → ${theirs}\n` +
      `改法：把 package.json 里 sharp 那条改成和 astro 同一个范围（${astroRange}）。`
  );
});

test("范围写法也得跟着 astro —— 不然下次 pnpm 解析时又会分家", () => {
  /**
   * 上面那条钉的是"这一刻解析到同一份"。这一条钉的是**范围本身相容** ——
   * 两者都要：范围不相容时，换一台机器、或者删掉 node_modules 重装，
   * 就又会装成两份，而上面那条在装好之前是跑不到的。
   */
  const ourRange = read(join(ROOT, "package.json")).dependencies?.sharp;
  const astroRange = read(req.resolve("astro/package.json"))
    .optionalDependencies?.sharp;

  assert.ok(ourRange, "package.json 里没有 sharp 这条了？两个出图文件还 import 着它");
  assert.ok(astroRange, "astro 不再依赖 sharp 了 —— 那这条约束可以整个删掉");

  const major = (r: string) => r.replace(/^[\^~]/, "").split(".").slice(0, 2).join(".");
  assert.equal(
    major(ourRange),
    major(astroRange),
    `sharp 的大版本和 astro 对不上（我们 ${ourRange} / astro ${astroRange}）——\n` +
      `pnpm 会装两份，两份各带一个不同的 libvips-42.dll，Windows 只认其中一个。`
  );
});
