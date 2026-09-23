import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { entrySlug } from "@/utils/getPostPaths";
import { getSortedPosts } from "@/utils/getSortedPosts";
import { ogCardResponse } from "@/utils/ogEndpoint";
import { promptOriginLabel } from "@/utils/promptOriginLabel";
import { SEARCH_KINDS } from "@/config/searchKinds";
import { useTranslations } from "@/i18n";
import config from "@/config";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * 提示词的分享卡，`/prompts/<slug>/index.png`。
 * 署名行走 promptOriginLabel（和页面上的芯片同一个判据）：这个集合收投稿，
 * 卡片被转发出去之后「投稿 · 某某」是别人能看到出处的唯一地方。
 */
export async function getStaticPaths() {
  if (!config.features.dynamicOgImage) {
    return [];
  }
  // ★ 过 getSortedPosts（= postFilter）：草稿和定时未到的不生成卡。
  const entries = getSortedPosts(await getCollection("prompts"));
  return entries.map(entry => ({
    params: {
      slug: entrySlug("prompts", entry.id, entry.filePath).replace(/^\/+/, ""),
    },
    props: entry,
  }));
}

export const GET: APIRoute = async ({ props, url, currentLocale }) => {
  if (!config.features.dynamicOgImage) {
    return new Response(null, { status: 404, statusText: "Not found" });
  }
  const entry = props as CollectionEntry<"prompts">;
  const t = useTranslations(currentLocale);
  const { label } = promptOriginLabel(
    entry.data.origin,
    entry.data.contributor,
    {
      site: t.prompts.originSite,
      contributedBy: t.prompts.contributedBy,
      unspecified: t.prompts.originUnspecified,
      author: config.site.author,
    }
  );

  return ogCardResponse(
    {
      title: entry.data.title,
      kindLabel: SEARCH_KINDS.prompts,
      siteTitle: config.site.title,
      host: new URL(config.site.url).hostname,
      byline: label,
      date: dayjs(entry.data.pubDatetime)
        .tz(config.site.timezone)
        .format("YYYY-MM-DD"),
    },
    url,
    `prompts/${entry.id}`
  );
};
