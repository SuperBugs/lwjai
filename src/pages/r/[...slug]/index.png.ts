import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { getPostSlug } from "@/utils/getPostPaths";
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

/**
 * 研究稿的分享卡，`/posts/<slug>/index.png`。
 *
 * 【2026-09-20】原来这里是上游那套 satori 模板（只有拉丁字体，中文是豆腐块，
 * 靠 `dynamicOgImage: false` 休眠着）。现在卡怎么画、中文字形从哪来、画不出来怎么办，
 * 全在 src/utils/ogCard.ts / ogEndpoint.ts，四个集合共用；这里只剩"这张卡上写什么"。
 */
export async function getStaticPaths() {
  if (!config.features.dynamicOgImage) {
    return [];
  }

  // ★【2026-09-18 修】原来是 `!data.draft && !data.ogImage`，**漏了定时稿**。
  //   `pubDatetime` 还没到的稿子在这里会生成一张 `/posts/<slug>/index.png`，
  //   而它的 HTML 详情页根本不存在（postFilter 挡掉了）：一张挂在公网上、
  //   印着未发布标题的图，没有任何页面兜底，构建全绿。
  //   全站"凡是吐内容的路由一律过 postFilter"这条规矩只有一个判据：getSortedPosts。
  const posts = getSortedPosts(await getCollection("posts")).filter(
    ({ data }) => !data.ogImage
  );

  return posts.map(post => ({
    params: { slug: getPostSlug(post.id, post.filePath) },
    props: post,
  }));
}

export const GET: APIRoute = async ({ props, url, currentLocale }) => {
  if (!config.features.dynamicOgImage) {
    return new Response(null, { status: 404, statusText: "Not found" });
  }
  const entry = props as CollectionEntry<"posts">;
  const t = useTranslations(currentLocale);

  // 署名 = 智能体（三档之一：某个智能体 / 我自己 / 来源未标注，判据走登记表）
  //        + 查得到的模型（「Anthropic Claude · Opus-5」）。
  // 卡上**只缀查得到的模型**：known 档永远会缀上，所以单独一个「Claude」在卡上只有
  // 一种读法 —— 模型没记。它不是把两档压成一档，只是把「待补」那个字样留给页面
  // 上的 AgentModelChip 和 .md 导出件（那两处印「模型未标注」）；卡是缩略图，不是清单。
  const slot = modelSlot(findAgent(entry.data.agent)?.kind, entry.data.model);
  const byline = [
    agentDisplayName(entry.data.agent, t.qa.unspecifiedAgent),
    ...(slot.tier === "known" ? [slot.entry.name] : []),
  ].join(" · ");

  return ogCardResponse(
    {
      title: entry.data.title,
      kindLabel: SEARCH_KINDS.posts,
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
    `posts/${entry.id}`
  );
};
