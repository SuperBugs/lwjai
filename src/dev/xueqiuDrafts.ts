import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DraftTier } from "./wechatsyncPlan";

/**
 * 「哪几篇已经推到雪球草稿箱了」—— `/_share` 雪球那一块上那一行。
 *
 * 【2026-09-23】和原来小红书那本流水账同一个理由（那一套当天按用户要求删了）：页面对"推过什么"
 * **没有记忆**的话，刷新一下就分不出哪篇推过了，于是同一篇推两遍、草稿箱里两份。
 * 小红书那一套里，"页面没记性"是能让人发重的那一环。
 *
 * ## 记三档，其余不记
 *
 *   `drafted`      推过了 ✓（带草稿地址 —— 你还要回去点发布）
 *   `unconfirmed`  **推过，结果不确定** —— 草稿箱里可能已经有一份
 *   `failed`       试过没成
 *
 * ★ 另外四档（没配 token / 扩展没连上 / 雪球没登录 / 端口被占）**不记**：
 *   那是还没轮到推，一个字都没出去，记一笔只会让流水账里多一条什么都没发生的事。
 * ⚠ 它记的是「**我们推过草稿**」，不是「雪球上现在有」—— 你在雪球里删了草稿、
 *   或者已经点了发布，这本账都不知道。
 *
 * ## 放哪儿
 *
 * 仓库根的 `.xueqiu-drafts.json`，**在 .gitignore 里**（这台机器的备忘，不是内容），
 * **不放 `node_modules` 下**（`pnpm install --force` 会一声不吭地清掉它）——
 * 前一条：提交它会让两台机器互相覆盖；后一条：它丢了会让人把推过的再推一遍，
 * 而 `node_modules` 下的东西随时会被一声不吭地清掉（和能自己画回来的图片卡片缓存正好相反）。
 */

export const DRAFTS_FILE = ".xueqiu-drafts.json";

const FILE = join(process.cwd(), DRAFTS_FILE);

/** 记进账里的那三档。 */
export type RecordedDraftTier = Extract<
  DraftTier,
  "drafted" | "unconfirmed" | "failed"
>;

export interface DraftRecord {
  tier: RecordedDraftTier;
  at: string;
  /** 推上去时那篇的标题 —— 之后内容改了也还知道当时推的是什么。 */
  title: string;
  draftUrl?: string;
  /** 这一篇是几份合成的（≥ 2 才记）。 */
  combined?: number;
  /**
   * 截过的话：放进去几节、一共几节。
   * ★ 卡片上要说出来 —— 截过的和完整的在账上长得一样，人就不知道雪球上那篇缺了东西。
   */
  truncated?: { kept: number; total: number };
  /**
   * 这一篇是谁写的（「Anthropic Claude（Opus-5-5）」）—— 只有一份的那种篇才有。
   * ★ 标题改成站上的标题之后，同一组分开推的几篇**标题一模一样**（都是 `AAPL`），
   *   卡片上那几行不带名字就分不出哪行是哪篇。
   */
  who?: string;
}

export type DraftLog = Record<string, DraftRecord>;

/** 这一档记不记。判据只有这一处，页面和端点都读它。 */
export function recordedDraftTier(
  tier: DraftTier
): RecordedDraftTier | undefined {
  return tier === "drafted" || tier === "unconfirmed" || tier === "failed"
    ? tier
    : undefined;
}

/**
 * 读那本账。**读不出来当成空的，不抛** ——
 * 但坏掉的那天屏幕上会显示"一篇都没推过"，所以终端里必须留一行。
 */
export function readDrafts(): DraftLog {
  if (!existsSync(FILE)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(FILE, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as DraftLog) : {};
  } catch (err) {
    // eslint-disable-next-line no-console -- 坏掉时屏幕上会变成"一篇都没推过"，那是个危险的谎
    console.warn(
      `[xueqiu] ${DRAFTS_FILE} 读不出来，这次当成空的：${err instanceof Error ? err.message : String(err)}\n` +
        `⚠ 页面上会显示成"一篇都没推过" —— 先去雪球草稿箱看一眼再推。`
    );
    return {};
  }
}

/**
 * 账上那一笔长什么样 —— 纯函数（测试直接调它，不碰那本真账）；`recordDraft()` 只管读写盘。
 * 不该记的那几档返回 undefined。
 */
export function draftRecord(
  tier: DraftTier,
  title: string,
  draftUrl?: string,
  extra: Pick<DraftRecord, "combined" | "truncated" | "who"> = {},
  at: Date = new Date()
): DraftRecord | undefined {
  const kept = recordedDraftTier(tier);
  if (!kept) return undefined;
  return {
    tier: kept,
    at: at.toISOString(),
    title,
    ...(draftUrl ? { draftUrl } : {}),
    ...(extra.combined && extra.combined >= 2
      ? { combined: extra.combined }
      : {}),
    ...(extra.truncated ? { truncated: extra.truncated } : {}),
    ...(extra.who ? { who: extra.who } : {}),
  };
}

/**
 * 记一笔。不该记的那几档直接返回。
 * ★ 写盘失败**不让推这件事失败** —— 草稿已经存上了，这时候报错只会让人再推一遍。
 */
export function recordDraft(
  key: string,
  tier: DraftTier,
  title: string,
  draftUrl?: string,
  extra: Pick<DraftRecord, "combined" | "truncated" | "who"> = {}
): void {
  const rec = draftRecord(tier, title, draftUrl, extra);
  if (!rec) return;
  try {
    const log = readDrafts();
    log[key] = rec;
    writeFileSync(FILE, `${JSON.stringify(log, null, 2)}\n`, "utf8");
  } catch (err) {
    // eslint-disable-next-line no-console -- 草稿已经存上了，不能因为记账失败就报没推成
    console.warn(
      `[xueqiu] 记不进 ${DRAFTS_FILE}：${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * 账里那个 ISO 时刻 → 屏幕上的读数。
 *
 * ⚠ **不许直接 `rec.at.slice(0, 16)`**：账里存的是 UTC，截出来的读数比北京时间慢 8 小时，
 *   而全站其余地方印的都是北京时间 —— 「刚推的」会显示成上午。
 * ★ 时区**由调用方传**（`config.site.timezone`），不在这儿写死：站点时区是一对判据
 *   （docs/engineering-notes.md「全站时间按北京时间显示」那条），写死一份就是第三处。
 */
export function draftWhen(at: string, timeZone: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(d)
      .map(p => [p.type, p.value])
  );
  // en-CA 在某些 ICU 版本里把午夜印成 24:00 —— 折回 00。
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute}`;
}

/** 卡片上那一行。没推过返回 undefined（整行不画 —— 那是完成态）。 */
export function draftLabel(
  rec: DraftRecord | undefined,
  timeZone: string
): string | undefined {
  if (!rec) return undefined;
  const when = draftWhen(rec.at, timeZone);
  // 谁写的放在最前面：同一组分开推的几行只有这一格不一样（标题都是站上那个）。
  const who = rec.who ? `${rec.who}：` : "";
  /** 这一篇是什么形状：合成的 / 截过的 / 完整一篇（完整的不说，那是完成态）。 */
  const shape = rec.combined
    ? `（${rec.combined} 份合成一篇）`
    : rec.truncated
      ? `（截到 ${rec.truncated.kept}/${rec.truncated.total} 节，全文链接在末尾）`
      : "";
  switch (rec.tier) {
    case "drafted":
      return `${who}已推到雪球草稿箱 ✓ ${when}${shape} —— 发布那一下还没点的话，去草稿里点`;
    case "unconfirmed":
      // ⚠ 这一档的措辞要让人**去查**，不是让人放心。
      return `${who}推过，结果不确定 · ${when} —— 先去雪球草稿箱看一眼再决定要不要再推`;
    case "failed":
      return `${who}试过没成 · ${when}`;
  }
}

/**
 * 一张卡片（一组）在账上的所有记录 —— 组里每一份的 key 都去查。
 *
 * ★ 合成一篇的那种，同一条记录在每一份的 key 下各存了一笔（`recordDraft()` 按份记），
 *   这里按「时刻 ＋ 草稿地址」去重，不然卡片上同一篇草稿会印两行。
 * ★ 新的在前。
 */
export function draftRecordsFor(
  keys: readonly string[],
  log: DraftLog
): DraftRecord[] {
  const seen = new Set<string>();
  const out: DraftRecord[] = [];
  for (const k of keys) {
    const r = log[k];
    if (!r) continue;
    const id = `${r.at}|${r.draftUrl ?? ""}|${r.title}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
