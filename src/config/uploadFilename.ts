import { ENTRY_ICON_FIELD } from "./entryIcon";

/**
 * 后台正文里粘进来的图：原始文件名 → 盘上 / 公网地址里的文件名。
 * `keystatic.config.ts` 的 `imageOptions()` 拿它当 `transformFilename`。
 *
 * 【2026-09-23】从 `imageOptions()` 里原样搬出来的（逻辑一个字符没改），为的是
 * 能被裸 tsx 测到 —— keystatic.config.ts 只能被 Vite 加载（`import.meta.glob`，
 * docs/engineering-notes.md 坑 18），在它里面的函数一条测试都钉不上。搬的同时多了一条规矩
 * （让出 `icon` 这个名字，见下）。
 *
 * ## 为什么要清洗
 *
 * **原始截图文件名会原样进公网地址**（Astro 保留 basename：
 * `schwab_account_12345678.png` → `/_astro/schwab_account_12345678.<hash>.webp`）。
 * 改 alt、改正文都盖不住它 —— 它是一条谁都想不到要去看的通道。
 * 所以：转小写、非 `[a-z0-9-]` 换成 `-`、**把长度 ≥6 的连续数字串换成 `x`**
 * （账号藏在那儿；日期 `2026-09-18` 是 4/2/2 位，时间 `14-20-33` 同理，都不受影响）。
 *
 * ⚠ 代价：两张不同的图如果清洗后同名，**后传的会覆盖先传的**（Keystatic 按名字写盘）。
 *
 * ## 让出 `icon` 这个名字【2026-09-23】
 *
 * 教程的「图标」那一格和正文截图落在**同一个目录**（`src/assets/guides/<号>/`），
 * 而那一格的文件名固定是字段 key（`icon.<扩展名>`，见 `entryIcon.ts`）。
 * 正文里粘一张原名就叫 `icon.png` 的图，清洗完还是 `icon.png` —— 存盘时两份写到
 * 同一个路径，谁后写谁赢，图标变成一张截图（或者反过来），**零报错**。
 * 所以这个名字让给那一格：正文图清洗出 `icon` 时改叫 `icon-shot`。
 * ★ 比对的是**清洗后**的主名：清洗已经转了小写，`ICON.PNG` 一样会撞 ——
 *   而 Windows 的文件系统不分大小写，`icon.PNG` 和 `icon.png` 本来就是同一个文件。
 */
export function sanitizeUploadFilename(original: string): string {
  const dot = original.lastIndexOf(".");
  const ext = dot > 0 ? original.slice(dot).toLowerCase() : "";
  const stem = (dot > 0 ? original.slice(0, dot) : original)
    .toLowerCase()
    .replace(/[0-9]{6,}/g, "x")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const safe = stem || "shot";
  return `${safe === ENTRY_ICON_FIELD ? `${safe}-shot` : safe}${ext}`;
}
