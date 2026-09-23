import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { getUniqueSymbols, symbolSlug } from "@/utils/getUniqueSymbols";
import { getSortedPosts } from "@/utils/getSortedPosts";
import {
  toFeedItems,
  feedStylesheet,
  selfLink,
  FEED_XMLNS,
  type FeedEntry,
} from "@/utils/feedItems";
import { tplStr, useTranslations } from "@/i18n";
import config from "@/config";

/**
 * 一只票的 feed —— `/s/<代码>/rss.xml`。「订阅这只票」是研究站最直接的钩子。
 *
 * 它是主 feed 的**补充**，不是拆分（/rss.xml 仍然全量）。条目拼法和主 feed 同一份
 * （`src/utils/feedItems.ts`）。
 */
export async function getStaticPaths() {
  // ★ 路径和 /s/[symbol] 那一页从**同一批**集合推：只喂 posts 的话，"只有问答提到过"
  //   的那只票有页面、没 feed，页面上的订阅链接就是一个 404。
  const posts = await getCollection("posts", ({ data }) => !data.draft);
  const qaEntries = await getCollection("qa", ({ data }) => !data.draft);
  const entries = [...posts, ...qaEntries];

  return getUniqueSymbols(entries).map(s => ({
    params: { symbol: s.slug },
    props: {
      code: s.code,
      name: s.name,
      // 过 getSortedPosts（= postFilter）：定时未到的不进 feed，和页面同一条口径。
      // 勾了好几只票的条目在每一只的 feed 里都出现（同 /s/<代码> 那一页的判据）。
      entries: getSortedPosts(
        entries.filter(({ data }) =>
          data.symbols.some(code => symbolSlug(code) === s.slug)
        )
      ),
    },
  }));
}

export const GET: APIRoute = ({ params, props }) => {
  const { code, name, entries } = props as {
    code: string;
    name?: string;
    entries: FeedEntry[];
  };
  // ★ 自身地址用的是**地址栏里那一段**（params），不是从 code 再算一次 slug ——
  //   算第二次就是"那一天两者不一致，而 feed 里印着一个 404 地址"的那天。
  //   拿不到就抛：静默拼出 /s/undefined/rss.xml 的代价是读者复制了一个死地址。
  const { symbol } = params;
  if (!symbol) throw new Error("分支 feed 缺少 symbol 参数");
  const t = useTranslations(config.site.lang);
  const label = name ? `${code}（${name}）` : code;

  return rss({
    title: `${config.site.title} · ${code}`,
    description: tplStr(t.feed.symbolDesc, { symbol: label }),
    site: config.site.url,
    // ★ 【2026-09-21】`@astrojs/rss` 默认给每条 link / guid **补一个末尾斜杠**
    //   （它自己的 trailingSlash 选项，默认 true），和全站口径
    //   （astro.config.ts 的 trailingSlash: "never"）正好相反。
    //   不关掉的话：页面 canonical 是 /posts/7，而订阅器里那条的 guid 是 /posts/7/ ——
    //   两个地址指同一篇，阅读器按 guid 去重，改口径那天全站条目会重新冒一遍。
    trailingSlash: false,
    // 和主 feed 同一份样式表 —— 路径是根绝对的，这一页在 /s/<代码>/ 下面。
    stylesheet: feedStylesheet,
    // ★ xmlns 和 customData 里的 `atom:` 前缀是一对，少一半整份 feed 就不是合法 XML。
    xmlns: FEED_XMLNS,
    customData: selfLink(`s/${symbol}/rss.xml`),
    items: toFeedItems(entries),
  });
};
