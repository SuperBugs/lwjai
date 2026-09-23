import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { getSortedPosts } from "@/utils/getSortedPosts";
import {
  toFeedItems,
  feedStylesheet,
  selfLink,
  FEED_XMLNS,
} from "@/utils/feedItems";
import config from "@/config";

/**
 * 全站**完整**的那一条 feed：研究、问答、教程、提示词在同一条流里。
 *
 * 分成几个 feed 的代价是订阅者要订好几次，而漏订的那几种在他那边**完全没有症状** ——
 * 所以这一条永远是全量的。【2026-09-20 加的】分支 feed（/s/<代码>/rss.xml）
 * 是**补充**：只想跟一只票的人多一个入口，这一条一个条目都不少。
 *
 * 条目的拼法（链接、前缀、时间）在 `src/utils/feedItems.ts`，两条 feed 共用一份。
 */
export async function GET() {
  const posts = await getCollection("posts");
  const qaEntries = await getCollection("qa");
  const guides = await getCollection("guides");
  const prompts = await getCollection("prompts");
  // ★ 过 getSortedPosts（= postFilter）：草稿和定时未到的不进 feed。
  const sortedEntries = getSortedPosts([
    ...posts,
    ...qaEntries,
    ...guides,
    ...prompts,
  ]);

  return rss({
    title: config.site.title,
    description: config.site.description,
    site: config.site.url,
    // ★ 【2026-09-21】`@astrojs/rss` 默认给每条 link / guid **补一个末尾斜杠**
    //   （它自己的 trailingSlash 选项，默认 true），和全站口径
    //   （astro.config.ts 的 trailingSlash: "never"）正好相反。
    //   不关掉的话：页面 canonical 是 /posts/7，而订阅器里那条的 guid 是 /posts/7/ ——
    //   两个地址指同一篇，阅读器按 guid 去重，改口径那天全站条目会重新冒一遍。
    trailingSlash: false,
    // 浏览器里渲染成一张说明页（阅读器不执行它）。见 feedItems.ts 的 feedStylesheet。
    stylesheet: feedStylesheet,
    // ★ xmlns 和 customData 里的 `atom:` 前缀是一对，少一半整份 feed 就不是合法 XML。
    xmlns: FEED_XMLNS,
    customData: selfLink("rss.xml"),
    items: toFeedItems(sortedEntries),
  });
}
