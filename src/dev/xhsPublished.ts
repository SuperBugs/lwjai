import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PublishTier } from "./xhsPublishPlan";

/**
 * 「哪几条我们已经发到小红书了」—— `/_xhs` 每张卡上那一行。
 *
 * 【2026-09-22 用户要的】在它之前**没有任何地方记这件事**：发了四条之后，
 * 页面上那四张卡和其余十二张长得一模一样，刷新一下、或者第二天再打开，
 * 分不出哪些发过 —— 而**重复发**正是这整套四档设计一直在防的那件事。
 *
 * ## ⚠ 它记的是「**我们发过**」，不是「**小红书上现在有**」
 *
 * 这两件事不一样，而且差别会真实发生：笔记可能被你删了、被平台删了，
 * 或者根本就没发出去（见下面那一档）。这个文件**没有任何办法知道**对面现在的状态
 * —— 它只是一本我们自己的流水账。屏幕上的措辞因此是「已发过」而不是「站上有」。
 *
 * ## 三档，跟着发布结果走（`PublishTier`）
 *
 *   `published`   已发过 ✓            —— 命中了已知成功信号
 *   `unconfirmed` **发过，结果不确定** —— 可能发出去了，也可能没有
 *   `failed`      试过没成            —— 明确失败，可以放心重发
 *
 * ⚠ 中间那一档**最不能省**：
 *   - 把它显示成「已发过」→ 你不会去补发一条**其实没发出去**的；
 *   - 把它显示成「没发过」→ 你可能**发重**。
 *   两个方向都有代价，所以它必须是自己一档。
 * ★ `offline` 那一档**不记**：那是"还没轮到发布"，压根没试过，记一笔
 *   只会让流水账里多一条什么都没发生的事。
 *
 * ## 为什么落在仓库里而不是 `node_modules/.astro/`
 *
 * 和封面图缓存（`xhsCache.ts`）**刚好相反**：那份是能重建的派生物，删了自己画回来；
 * 这份**丢了会让人发重**。放在 `node_modules` 下的话，一次
 * `pnpm install --force` 或者 `rm -rf node_modules` 就悄悄没了，而没有任何一处会说。
 * ⚠ 它在 `.gitignore` 里 —— 这是**这台机器的**流水账，不是内容：
 *   提交它会让两台机器互相覆盖对方的记录，而那比没有记录更难查。
 */

/** 仓库根目录下那本流水账。⚠ 在 .gitignore 里，见文件头最后一节。 */
export const PUBLISHED_FILE = ".xhs-published.json";

const FILE = join(process.cwd(), PUBLISHED_FILE);

/** 一条记录。`at` 是 ISO 时刻（记的是本机发出去的那一刻）。 */
export interface PublishRecord {
  tier: PublishTier;
  at: string;
  /** 发出去时那条笔记的标题 —— 之后内容改了也还知道当时发的是什么。 */
  title: string;
}

export type PublishedLog = Record<string, PublishRecord>;

/** `posts/1007` —— 和页面上卡片的 key 同一个形状。 */
export const logKey = (collection: string, slug: string) =>
  `${collection}/${slug}`;

/**
 * 读那本流水账。
 *
 * ★ **读不出来就当成空的，不抛** —— 这一条和 `registry.json` 那种"宁可红"
 *   刻意相反：那是内容，读错了会让站上说假话；这只是一本备忘，
 *   为了它让整个 `/_xhs` 打不开是不划算的。⚠ 但代价要知道：文件坏掉的那天
 *   屏幕上会显示"一条都没发过"，而你可能已经发了二十条。
 *   所以坏掉时**不是静默的** —— 下面那句 console.warn 会在 dev 终端里留一行。
 */
export function readPublished(): PublishedLog {
  if (!existsSync(FILE)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(FILE, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as PublishedLog) : {};
  } catch (err) {
    // eslint-disable-next-line no-console -- 坏掉时屏幕上会变成"一条都没发过"，那是个危险的谎，终端里必须留一行
    console.warn(
      `[xhs] ${PUBLISHED_FILE} 读不出来，这次当成空的：${err instanceof Error ? err.message : String(err)}\n` +
        `⚠ 页面上会显示成"一条都没发过" —— 别照着它去补发。`
    );
    return {};
  }
}

/**
 * 记一笔。`offline` 不记（还没轮到发布，见文件头）。
 * ★ 写盘失败**不让发布这件事失败** —— 帖子已经发出去了，这时候抛错只会让人
 *   以为没发成而去重发一次。只在终端里说一声。
 */
export function recordPublish(
  collection: string,
  slug: string,
  tier: PublishTier,
  title: string
): void {
  if (tier === "offline") return;
  try {
    const log = readPublished();
    log[logKey(collection, slug)] = {
      tier,
      at: new Date().toISOString(),
      title,
    };
    writeFileSync(FILE, `${JSON.stringify(log, null, 2)}\n`, "utf8");
  } catch (err) {
    // eslint-disable-next-line no-console -- 帖子已经发出去了，不能因为记账失败就报发布失败
    console.warn(
      `[xhs] 记不进 ${PUBLISHED_FILE}：${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** 卡片上那一行怎么写。没发过返回 undefined（整行不画 —— 那是完成态）。 */
export function publishedLabel(
  rec: PublishRecord | undefined
): string | undefined {
  if (!rec) return undefined;
  const when = rec.at.slice(0, 16).replace("T", " ");
  switch (rec.tier) {
    case "published":
      return `已发过 ✓ ${when}`;
    case "unconfirmed":
      // ⚠ 这一档的措辞要让人**去查**，不是让人放心。见文件头。
      return `发过，结果不确定 · ${when} —— 去小红书看一眼再决定要不要补发`;
    case "failed":
      return `试过没成 · ${when}`;
    default:
      return undefined;
  }
}
