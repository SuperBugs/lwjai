import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { entrySlug } from "@/utils/getPostPaths";
import { getSortedPosts } from "@/utils/getSortedPosts";
import { ogCardResponse } from "@/utils/ogEndpoint";
import { agentDisplayName, findAgent } from "@/config/agents";
import { modelSlot } from "@/config/models";
import { symbolNames } from "@/config/symbols";
import { SEARCH_KINDS } from "@/config/searchKinds";
import { useTranslations } from "@/i18n";
import config from "@/config";

dayjs.extend(utc);
dayjs.extend(timezone);

/** 问答的分享卡，`/qa/<slug>/index.png`。形状照 posts 那份，见那边的注释。 */
export async function getStaticPaths() {
  if (!config.features.dynamicOgImage) {
    return [];
  }
  // ★ 过 getSortedPosts（= postFilter）：草稿和定时未到的不生成卡。
  const entries = getSortedPosts(await getCollection("qa"));
  return entries.map(entry => ({
    params: {
      slug: entrySlug("qa", entry.id, entry.filePath).replace(/^\/+/, ""),
    },
    props: entry,
  }));
}

export const GET: APIRoute = async ({ props, url, currentLocale }) => {
  if (!config.features.dynamicOgImage) {
    return new Response(null, { status: 404, statusText: "Not found" });
  }
  const entry = props as CollectionEntry<"qa">;
  const t = useTranslations(currentLocale);

  // 署名 = 智能体 + 查得到的模型（「Codex · GPT-5」）。为什么只缀 known 档，见 posts 那份。
  const slot = modelSlot(findAgent(entry.data.agent)?.kind, entry.data.model);
  const byline = [
    agentDisplayName(entry.data.agent, t.qa.unspecifiedAgent),
    ...(slot.tier === "known" ? [slot.entry.name] : []),
  ].join(" · ");

  return ogCardResponse(
    {
      title: entry.data.title,
      kindLabel: SEARCH_KINDS.qa,
      siteTitle: config.site.title,
      host: new URL(config.site.url).hostname,
      // 名字从标的表查（条目上只有代码）。判据只有 symbolNames() 一处。
      symbols: entry.data.symbols.map(symbolNames),
      byline,
      date: dayjs(entry.data.pubDatetime)
        .tz(config.site.timezone)
        .format("YYYY-MM-DD"),
    },
    url,
    `qa/${entry.id}`
  );
};
