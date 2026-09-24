import { getCollection } from "astro:content";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { getSortedPosts } from "@/utils/getSortedPosts";
import { foldQaGroups } from "@/utils/qaGroups";
import { entrySlug, entryUrl } from "@/utils/getPostPaths";
import { fullTextLabelFor, type XhsCardSource } from "@/utils/xhsCardPlan";
import type { XueqiuArticleSource } from "@/utils/xueqiuArticle";
import { symbolNames } from "@/config/symbols";
import { agentDisplayName, findAgent } from "@/config/agents";
import { modelSlot, modelSlotLabel } from "@/config/models";
import {
  CONTENT_COLLECTIONS,
  requireCollectionSpec,
} from "@/config/collections";
import {
  DEFAULT_PLATFORM,
  type SocialPlatform,
} from "@/config/socialPlatforms";
import { useTranslations } from "@/i18n";
import config from "@/config";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * 「`?c=<集合>&s=<号>` 指的是哪一组内容，它的卡和它的长文分别该印什么」——
 * `/_cards/card.png`（出图）、`/_xueqiu/draft`（推雪球长文）、`/_share` 和 `/_cards`
 * 那两页**共用这一份**。
 * （文件名还叫 xhs 是历史原因：它最早是小红书出图 ＋ 发帖那两个端点共用的；
 *   小红书那一套 2026-09-23 按用户要求删了，出图留着。）
 *
 * ## ★ 为什么必须共用
 *
 * 几个出口各查一次、各拼一次的话，它们可能**描述的不是同一条内容**：
 * 归组的口径、取代表那条的口径、落款的算法……任何一处分家，结果就是
 * **图是 A 的、字是 B 的**，而页面、构建、测试四处全绿。
 * 发出去之后也看不出来 —— 读者只会觉得这张图和这段字对不上。
 *
 * ## 两条前提照旧（docs/gate.md 7.5）
 *
 *   1. **草稿进不来**：`getSortedPosts()` = postFilter。
 *   2. **给出去的是字段白名单**，不是 `entry.data`（下面几个 `...SourceOf` 逐格列）。
 *      图片里的字没有下游能再检查一遍。
 */

/** 折组之后手上那几条的形状（`foldQaGroups` 是泛型的，这里只用得着这几格）。 */
export type GroupEntry = {
  collection: string;
  id: string;
  filePath?: string;
  data: Record<string, unknown>;
};

export type XhsGroup = { entry: GroupEntry; answers: GroupEntry[] };

export const slugOf = (e: GroupEntry) =>
  entrySlug(e.collection, e.id, e.filePath).replace(/^\/+/, "");

/** 这一格在这个集合的 schema 里有没有。教程 / 提示词没有 agent / model / symbols。 */
const str = (
  data: Record<string, unknown>,
  key: string
): string | undefined => {
  const v = data[key];
  return typeof v === "string" && v !== "" ? v : undefined;
};

const list = (data: Record<string, unknown>, key: string): string[] => {
  const v = data[key];
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
};

type T = ReturnType<typeof useTranslations>;

/**
 * 「智能体（模型）」那一串。
 *
 * ★ 两维的判据**一个字都不在这里**：`findAgent()` ＋ `modelSlot()` /
 *   `modelSlotLabel()`，和站上那张 AgentModelChip、.md 导出口、分享卡同一份。
 * ★ **教程 / 提示词返回 undefined**（那两个集合压根没有 `agent` 这一格），
 *   不是印一句「来源未标注」—— 那是在说"这里本该填而没填"。
 *   判据是登记表的 `provenance === "by-agent"`，不是写死集合名。
 */
export function bylineOf(
  collection: string,
  data: Record<string, unknown>,
  t: T
): string | undefined {
  if (requireCollectionSpec(collection).provenance !== "by-agent") {
    return undefined;
  }
  const agentId = str(data, "agent");
  const agentLabel = agentDisplayName(agentId, t.qa.unspecifiedAgent);
  const modelLabel = modelSlotLabel(
    modelSlot(findAgent(agentId)?.kind, str(data, "model")),
    t.qa.unspecifiedModel
  );
  return modelLabel ? `${agentLabel}（${modelLabel}）` : agentLabel;
}

const voiceOf = (e: GroupEntry, t: T) => ({
  description: typeof e.data.description === "string" ? e.data.description : "",
  label: bylineOf(e.collection, e.data, t),
});

/**
 * ⚠ `getCollection()` 要的是**字面量**集合名，所以这四行没法从登记表推 ——
 *   和 `/_share` 同一个限制、同一个补法：写出来，然后**反过来对账**。
 */
async function routedEntries() {
  const byKey: Record<string, { collection: string }[]> = {
    posts: await getCollection("posts"),
    qa: await getCollection("qa"),
    guides: await getCollection("guides"),
    prompts: await getCollection("prompts"),
  };

  const routed = CONTENT_COLLECTIONS.filter(c => c.urlPrefix !== null).map(
    c => c.key
  );
  const missing = routed.filter(k => !(k in byKey));
  if (missing.length > 0) {
    throw new Error(
      `xhsEntry 漏了集合：${missing.join(" / ")}。\n` +
        `上面补一行 getCollection("<集合>") —— 漏掉的那个集合根本出不了图片卡片、` +
        `也推不了雪球长文，而页面照常渲染、一句话都不说。`
    );
  }
  return byKey;
}

/**
 * 找出 `?c=&s=` 指的那一组。找不到返回 undefined，调用方自己说人话。
 *
 * ★ 认的是**组里任意一条**的 slug，不只是代表那条：后台那个按钮带过来的是
 *   当前正编辑那一条，而折叠之后它可能不是代表 —— 只认代表的话，
 *   从那几条点过来就是 404，而按钮照常能点。
 */
export async function findXhsGroup(
  collection: string,
  slug: string
): Promise<{ group?: XhsGroup; unknownCollection?: boolean }> {
  const byKey = await routedEntries();
  if (!byKey[collection]) return { unknownCollection: true };

  // ★ getSortedPosts = postFilter：草稿进不来。
  // ★ 四个集合一起折 —— `qaGroupKey()` 自带集合前缀，不会把同名的研究报告
  //   和问答折进一组。
  const groups = foldQaGroups(
    getSortedPosts(Object.values(byKey).flat() as never[])
  ) as unknown as XhsGroup[];

  return {
    group: groups.find(g =>
      g.answers.some(a => a.collection === collection && slugOf(a) === slug)
    ),
  };
}

/**
 * 发出去的那段字里印的日期 —— **北京时间**（站上显示的口径，`site.timezone`）。
 *
 * ⚠ 盘上存的是 UTC。不换算的话 UTC 20:00 那条会印成前一天，
 *   而帖子和落地页上的日期对不上，两处都"没错"（同 `groupDateSuffix()` 那条）。
 * ★ 导出是因为 `/_share` 也要印同一个日期 —— 各算一份就是坑 8 的形态。
 */
export const beijingDate = (data: Record<string, unknown>) =>
  dayjs(data.pubDatetime as Date)
    .tz(config.site.timezone)
    .format("YYYY-MM-DD");

/**
 * 封面卡要印什么 —— **一张字段白名单**（docs/gate.md 7.5）。
 * 每一格都是闸门扫过的字节：标题 / 摘要 / 标签来自 frontmatter，
 * 公司名来自 symbols.json、智能体和模型名来自 registry.json（都在
 * `SCANNED_DATA_FILES` 里）。⚠ 不许改成 `...data`。
 */
export function cardSourceOf(
  group: XhsGroup,
  collection: string,
  t: T,
  locale: string | undefined,
  /**
   * 这张卡是给**哪个平台**出的。默认表里第一个还在发的（`DEFAULT_PLATFORM`）。
   *
   * ★ 它今天只决定一件事：**左下角印不印完整网址**（`urlOnCard`）。
   *   小红书那条导流细则针对的就是这一格（细则明列「图片里含站外链接」
   *   违规，平台有 OCR），所以它必须跟着目标平台走，而不是卡片自己的属性。
   * ⚠ 这个参数**不许省掉默认值之外的那一档**：一个"看起来有开关、其实没人读"
   *   的字段比没有开关更贵（docs/engineering-notes.md 第一节那个 `scan.length === 1`）。
   */
  platform: SocialPlatform = DEFAULT_PLATFORM
): XhsCardSource {
  const entry = group.entry;
  const data = entry.data;
  return {
    kindLabel: requireCollectionSpec(collection).label,
    title: typeof data.title === "string" ? data.title : "",
    symbols: list(data, "symbols").map(code => symbolNames(code)),
    tags: list(data, "tags"),
    voices: group.answers.map(a => voiceOf(a, t)),
    // 几份那一档 planXhsCard() 也会强制丢掉落款，这里再挡一道让理由两处都看得见。
    byline:
      group.answers.length === 1 ? bylineOf(collection, data, t) : undefined,
    date: beijingDate(data),
    fullTextLabel: fullTextLabelFor(collection),
    /**
     * 两头都是代码里的东西（entryUrl ＋ site.url），没往公网带新的字节。
     * ⚠ 平台不许图里带外链就**整个不给** —— 给了再让渲染那边挑，
     *   就是同一个答案落在两处（坑 8 的形态）。
     */
    url: platform.urlOnCard
      ? new URL(
          entryUrl(entry.collection, entry.id, entry.filePath, locale),
          config.site.url
        ).href
      : undefined,
  };
}

/**
 * 推到雪球草稿箱的那篇长文要带什么（`src/dev/xueqiu-draft.ts`）。
 * **和卡片、文案读同一个 group、同一个 `bylineOf()`** —— 理由见文件头。
 *
 * ★ 每一份的**全文不在这儿读**，由调用方从 `.md` 导出端点取回来传进来
 *   （`bodies` 和 `group.answers` 一一对齐）：推到雪球的正文要和读者下载的
 *   逐字节相同，理由在 `src/utils/xueqiuArticle.ts` 文件头。
 *   ⚠ 所以这里**不许**碰 `entry.body` —— 那是第二个出口（docs/gate.md 7.5
 *   「复制全文」那一节的同一条）。
 * ★ 仍然是一张字段白名单：标题、标的、日期、地址，以及每一份的落款和它自己的地址 / 日期 / 标的。
 *   （摘要原来也在 —— 标题回落要用；2026-09-23 标题改成站上的标题原样之后就不用了，删了。）
 */
export function xueqiuSourceOf(
  group: XhsGroup,
  collection: string,
  t: T,
  locale: string | undefined,
  bodies: readonly string[]
): XueqiuArticleSource {
  if (bodies.length !== group.answers.length) {
    // 对不齐就是某一份的全文张冠李戴了 —— 宁可红。
    throw new Error(
      `xueqiuSourceOf: 取回 ${bodies.length} 份全文，而这一组有 ${group.answers.length} 份。`
    );
  }
  const entry = group.entry;
  const data = entry.data;
  return {
    kindLabel: requireCollectionSpec(collection).label,
    title: typeof data.title === "string" ? data.title : "",
    symbols: list(data, "symbols").map(code => symbolNames(code)),
    date: beijingDate(data),
    url: new URL(
      entryUrl(entry.collection, entry.id, entry.filePath, locale),
      config.site.url
    ).href,
    sections: group.answers.map((a, i) => ({
      label: bylineOf(a.collection, a.data, t),
      body: bodies[i]!,
      // 放不下、分开推的时候每篇各记一笔账，要知道它是站上哪一条。
      key: `${a.collection}/${slugOf(a)}`,
      /**
       * 分开推的时候这一份自己就是一篇：「全文」链接必须指向**它自己的**页面，
       * 不是整组代表那一条的（理由在 `XueqiuSection.url` 上面）。
       */
      url: new URL(
        entryUrl(a.collection, a.id, a.filePath, locale),
        config.site.url
      ).href,
      date: beijingDate(a.data),
      symbols: list(a.data, "symbols").map(code => symbolNames(code)),
    })),
  };
}
