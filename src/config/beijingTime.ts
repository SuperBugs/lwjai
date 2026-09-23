/**
 * 后台那两格时间（发布时间 / 更新时间）的**时区换算**。
 *
 * ## 三头各是什么，别改混
 *
 *   .md 里存的      UTC（`pubDatetime: 2026-09-16T12:00:00.000Z`）—— 不变
 *   站上显示的      站点时区（astro-paper.config.ts 的 timezone）。
 *                   【2026-09-21 用户定的】现在也是北京时间 —— 但那是**另一条路**
 *                   （`<Datetime>` 的 dayjs.tz），和这里这个 +8 没有任何共享代码
 *   **后台里填的**  【2026-09-21 用户定的】**北京时间** —— 手表上几点就填几点
 *
 * ⚠ 后两行今天读数相同，**不许因此把这一层删掉**：盘上存的是 UTC，`fields.datetime`
 *   按 UTC 解释那一格里的值 —— 少了这一层，后台里填的就变回 UTC，每条稿子往未来
 *   偏 8 小时（往未来那一头的后果是**页面根本不生成而构建全绿**，见下面）。
 *   站点时区哪天又换走，这一层也一个字都不用动。
 *
 * 变的只有中间那一格输入框里的读数。换算只有这一处（`keystatic.config.ts` 的
 * `beijingDatetime()` 把 `fields.datetime` 包一层），**别在别的地方再写一个 +8**。
 *
 * ## 为什么是写死的 +8，不是读本机时区
 *
 * 北京时间**没有夏令时**（1991 年之后就没有了），一年到头都是 UTC+8 ——
 * 所以一个常数是对的，而且它不取决于跑这段代码的机器设在哪个时区。
 *
 * ⚠ 反例就在手边：Keystatic 自带的 `{ kind: "now" }` 走的是
 * `now.getTime() - now.getTimezoneOffset() * 60000`，**本机墙上时间**，
 * 然后被当成 UTC 存下去。在这台 UTC+8 的机器上等于每条新稿子都往未来偏 8 小时，
 * 而未来稿在 `pnpm build` 里**页面根本不生成、构建还是绿的**（docs/engineering-notes.md 坑 1）。
 * 默认值因此也走下面的 `beijingWallNow()`，不碰那个入参。
 *
 * ★ 零 import：`keystatic.config.ts` 在 Astro 之外被 Vite 加载，测试是裸 tsx 跑的。
 */

/** 北京时间对 UTC 的偏移，分钟。常数 —— 见文件头「为什么是写死的 +8」。 */
export const BEIJING_OFFSET_MINUTES = 8 * 60;

/**
 * Keystatic 那一格的值的形状：`2026-09-16T20:00`（到分钟，没有时区后缀）。
 *
 * ★ 和 `@keystatic/core` 里 `validateDatetime()` 的正则逐字相同。对不上的值下面
 *   **原样放行，不抛** —— 抛的后果是这一条在后台**整条编不开**（坑 19 那个形态）；
 *   放行则让它去撞 Keystatic 自己那条校验，在那一格上显示成一句人话的错误。
 */
const WALL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** 把一个「墙上时间」字符串挪 n 分钟。认不出来的原样返回（见 WALL_RE 那段）。 */
function shiftWall(wall: string, minutes: number): string {
  if (!WALL_RE.test(wall)) return wall;
  const ms = Date.parse(`${wall}:00.000Z`);
  if (Number.isNaN(ms)) return wall;
  return new Date(ms + minutes * 60_000).toISOString().slice(0, 16);
}

/** 盘上那个时刻（UTC 墙钟）→ 后台那一格里该显示的读数（北京时间）。 */
export function utcWallToBeijing(wall: string): string {
  return shiftWall(wall, BEIJING_OFFSET_MINUTES);
}

/** 后台那一格里填的读数（北京时间）→ 要写进 .md 的那个时刻（UTC 墙钟）。 */
export function beijingWallToUtc(wall: string): string {
  return shiftWall(wall, -BEIJING_OFFSET_MINUTES);
}

/**
 * 此刻的北京时间，`2026-09-21T20:30` 这个形状 —— 也就是能直接填进后台那一格的串。
 *
 * 【2026-09-21】给「改了就自动填更新时间」那段用（`src/dev/keystaticModTime.ts`）。
 * ⚠ 和「发布时间」那一格的默认值**刻意不是同一条路**：那个是页面加载那一刻算好的
 *   常量（`keystatic.config.ts` 的 `NOW_UTC`，故意让它往过去偏，理由在那儿），
 *   而这个每次填都现算 —— 它要回答的是"这一下改动发生在什么时候"。
 */
export function beijingWallNow(now: Date): string {
  return utcWallToBeijing(now.toISOString().slice(0, 16));
}
