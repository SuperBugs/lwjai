import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { entrySlug } from "@/utils/getPostPaths";
import { getSortedPosts } from "@/utils/getSortedPosts";
import { ogCardResponse } from "@/utils/ogEndpoint";
import { SEARCH_KINDS } from "@/config/searchKinds";
import config from "@/config";

dayjs.extend(utc);
dayjs.extend(timezone);

/** 教程的分享卡，`/guides/<slug>/index.png`。教程没有标的、没有作者字段，卡上就不写。 */
export async function getStaticPaths() {
  if (!config.features.dynamicOgImage) {
    return [];
  }
  // ★ 过 getSortedPosts（= postFilter）：草稿和定时未到的不生成卡。
  const entries = getSortedPosts(await getCollection("guides"));
  return entries.map(entry => ({
    params: {
      slug: entrySlug("guides", entry.id, entry.filePath).replace(/^\/+/, ""),
    },
    props: entry,
  }));
}

export const GET: APIRoute = async ({ props, url }) => {
  if (!config.features.dynamicOgImage) {
    return new Response(null, { status: 404, statusText: "Not found" });
  }
  const entry = props as CollectionEntry<"guides">;

  return ogCardResponse(
    {
      title: entry.data.title,
      kindLabel: SEARCH_KINDS.guides,
      siteTitle: config.site.title,
      host: new URL(config.site.url).hostname,
      date: dayjs(entry.data.pubDatetime)
        .tz(config.site.timezone)
        .format("YYYY-MM-DD"),
    },
    url,
    `guides/${entry.id}`
  );
};
