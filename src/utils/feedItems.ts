import { entryUrl } from "./getPostPaths";
import { getAssetPath } from "./withBase";
import config from "@/config";

/**
 * 浏览器渲染这份 feed 时用的样式表（`public/rss.xsl`）—— 两条 feed 共用。
 *
 * 为什么要有：点「RSS 订阅」在浏览器里是一屏 XML，顶上压着一行英文，
 * 对不用阅读器的读者和"点坏了一个链接"长得一模一样。理由全文在那个 .xsl 的文件头。
 * ★ 它**只影响浏览器**：阅读器不执行 XSL，拿到的字节一个都没变。
 *
 * ⚠ 必须是**根绝对**路径：分支 feed 在 `/s/<代码>/` 下面，相对路径会去取
 *   `/s/<代码>/rss.xsl` → 404 → 浏览器**静默**回落到裸 XML，而主 feed 一切正常。
 *   `getAssetPath()` 保证带上 base 且以 `/` 开头。
 */
export const feedStylesheet = getAssetPath("rss.xsl");

/**
 * `<atom:link rel="self">` —— 这份 feed 自己的地址。
 *
 * 两个用处：① 阅读器和校验器据此知道这份 feed 的正式地址（W3C Feed Validator
 * 少了它会警告）；② `rss.xsl` 那一页上印给读者复制的就是它 —— **不是拼出来的**，
 * 分支 feed 的地址没法从 `<channel><link>` 推出来。
 *
 * ⚠ 它和 `FEED_XMLNS` 是**一对**：`atom:` 前缀没有对应的 xmlns 声明，
 *   整份 feed 就是**格式错误的 XML**，每一个订阅者当场全炸（不是少一条内容，
 *   是整份解析不了）。别只搬走其中一半 —— `feed.test.ts` 钉着两者同时出现。
 */
export const FEED_XMLNS = { atom: "http://www.w3.org/2005/Atom" };

export function selfLink(path: string): string {
  const href = new URL(getAssetPath(path), config.site.url).href;
  return `<atom:link href="${href}" rel="self" type="application/rss+xml"/>`;
}

/**
 * RSS 条目的拼法 —— 主 feed（/rss.xml）和分支 feed（/s/<代码>/rss.xml）共用这一份。
 *
 * ★ 集合 → 标题前缀这张表**只有这一份**。加一个内容集合只改这里；散成三目运算符的那天，
 *   就是第四个集合悄悄地在阅读器里和研究稿混成一片的那天 —— 而订阅者那边完全没有症状。
 *   选前缀而不是 `<category>`：要挡的失败模式是"订阅者在阅读器里分不清研究、问答和教程"，
 *   而 `<category>` 在多数阅读器的列表视图里根本不显示，前缀一定看得见。
 *   研究稿不加前缀：它是这个站的主体，每行都顶一个「研究｜」只是噪音，
 *   而"一种没标记、其余各有标记"已经足够把它们分开。
 *
 * ★ 分支 feed 是**补充**，不是拆分：主 feed 仍然是全站完整的一条。
 *   拆分的代价（订阅者要订好几次，而漏订的那几种在他那边完全没有症状）写在 rss.xml.ts。
 */
export const TITLE_PREFIX: Record<string, string | undefined> = {
  qa: "问答",
  guides: "教程",
  prompts: "提示词",
};

export type FeedEntry = {
  collection: string;
  id: string;
  filePath?: string;
  data: {
    title: string;
    description: string;
    pubDatetime: Date;
  };
};

export function toFeedItems(entries: readonly FeedEntry[]) {
  return entries.map(({ collection, data, id, filePath }) => ({
    // ★ 这里**不能用 `getPostUrl`**：它把集合写死成 posts，问答条目会得到
    //   `/posts/src/content/qa/<slug>`（原因见 getPostPaths.ts 头部注释）——
    //   构建不报错、feed 校验也过，只是每一条问答的链接都 404。
    //   `entryUrl` 的集合是显式参数，登记表里查不到就抛。
    link: entryUrl(collection, id, filePath, config.site.lang),
    title: TITLE_PREFIX[collection]
      ? `${TITLE_PREFIX[collection]}｜${data.title}`
      : data.title,
    description: data.description,
    /**
     * ★【2026-09-23】**创建时间**，不是上游的 `modDatetime ?? pubDatetime`。
     *   条目的先后按创建时间排（`createdOrder.ts`），而阅读器是按 pubDate 自己排的 ——
     *   这里填更新时间的话，站上改过一个字的老稿子在阅读器里就是"最新一条"，
     *   和站上的顺序对不上。RSS 2.0 的 pubDate 本来就是"什么时候发的"。
     */
    pubDate: new Date(data.pubDatetime),
  }));
}
