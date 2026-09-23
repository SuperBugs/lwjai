import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    // ★ 全站唯一的域名来源。`astro.config.ts` 的 `site` 由它派生，canonical 链接、
    // RSS（`rss.xml.ts`）、sitemap、og:url 全从那里往下拿 —— 所以改域名只改这一处。
    //
    // ⚠ 它必须和 Cloudflare 上绑的自定义域名**逐字节一致**（含 https、含末尾斜杠、
    // 含 www 与否）。不一致的表现是**页面上完全看不出来**：站照常打开，只有分享卡片、
    // RSS 阅读器、搜索引擎收录的是另一个地址。
    url: "https://lwj.ai/",
    title: "牢玩家",
    // ★【2026-09-20 加】站名的其他写法，进首页的 WebSite 结构化数据（alternateName）。
    //   人在 Google 里敲的是「牢玩家AI」「lwj.ai」，得告诉搜索引擎它们指的是同一个站。
    //   ⚠ 这里只管"别名"，收录本身（Search Console 验证、提交 sitemap）在 docs/deploy.md 2.6。
    alternateNames: ["牢玩家AI", "牢玩家 AI", "lwj.ai"],
    description:
      "记录分享 AI 分析结果，主要为美股标的。" +
      "网站无任何收费内容，以后也不会有任何收费。",
    // 站长的名字。提示词卡片 / 详情页上「作者：牢玩家」、<meta name="author">、
    // 研究稿 frontmatter 里 author 的默认值都读它；站名（title）是另一回事。
    author: "牢玩家",
    profile: "https://lwj.ai/",
    ogImage: "default-og.jpg",

    lang: "zh-CN",

    // ★【2026-09-21 用户定的】全站时间显示成**北京时间**，站上不再出现「美东」。
    //
    // 在这之前这里是 `America/New_York`，理由是"这个站上的每一个时间都是行情时间"
    // （财报在盘后、13D 有 10 天窗口、CPI 是 08:30）。那个理由没有消失，只是换了
    // 承担的人：站上给北京时间，读者自己往盘上对。
    //
    // ★ 时区那几个字在 `t.post.timezoneLabel`，和这一行是**一对**（改一处漏一处
    //   = 一个时区的读数贴另一个时区的名字，四处全绿）。它**不印在页面正文上**
    //   （用户定的：每张卡片后面缀三个字太吵），只进 `<time>` 的 title 和导出的
    //   .md —— 那份文件没有 hover。钉子 `scripts/gate/siteTimezone.test.ts`。
    //
    // ★ 这是全站唯一的时区来源：`<Datetime>`、归档分组、分享卡上的日期、
    //   导出的 .md、`pnpm content:prune` 的 `--from/--to` 日界全读它，改这里一起走。
    // ⚠ 它**不碰盘上存的字节**：frontmatter 里的 `pubDatetime` 仍然是 UTC（`...Z`），
    //   后台那两格填的仍然是北京时间（`keystatic.config.ts` 的 `beijingDatetime()`，
    //   判据 `src/config/beijingTime.ts`）。换的只有显示。
    timezone: "Asia/Shanghai",
    dir: "ltr",
  },
  posts: {
    // 一天可能出好几篇，4 篇一页翻得太碎。
    perPage: 10,
    perIndex: 6,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: true,

    /* ★ 【2026-09-20 重新打开】每篇一张分享卡（`/r/<号>/index.png` 等四条路由）。
     *
     * 2026-09-18 关掉它的原因是**中文**：satori 用的 `Google Sans Code` 是等宽拉丁字体，
     * 一个中文字形都没有，开着就是满屏豆腐块（□□□□），而且构建全绿、页面正常，
     * 只有分享到推特 / 微信 / Telegram 才看得见（docs/engineering-notes.md 坑 6）。
     *
     * 现在的解法不是往仓库塞 8MB 的 Noto Sans SC，而是**按这张卡上真正出现的那几十个字**
     * 去 Google Fonts 取子集（`css2?family=Noto+Sans+SC&text=…`，实测两种字重 6KB 上下，
     * 用老 UA 才拿得到 satori 认的 woff）—— 见 `src/utils/googleFontSubset.ts`、`ogCard.ts`。
     * 构建机本来就要访问 Google Fonts（下面 astro.config.ts 的 fonts 在构建期拉 Google Sans Code），
     * 没有新增依赖。
     *
     * ★ 画不出来（网络、限流、格式变了）**回落到 `public/default-og.jpg`，并在构建日志里
     *   warn 一行带条目 id**（`ogEndpoint.ts`）。回落和画成是两档：字节不同、日志不同，
     *   不许静默 —— 静默回落和静默豆腐块是同一种病。
     * ★ 关掉它（false）四条 index.png 路由和 /og.png 一起消失，页面回落到默认图，
     *   `entryOgImageUrl()` 返回 undefined。
     */
    dynamicOgImage: true,
    /* ★ 关掉（2026-09-18）。AstroPaper 自带的「按时间列出全部」，而这个站的
     * `/posts` 本来就是按时间倒序的分页列表 —— 归档页和它是同一份内容的两种排版。
     * 关掉之后导航图标、`/archives` 页面（会 rewrite 到 404）、
     * `astro.config.ts` 里 sitemap 的过滤三处自动跟着走，不用另外改。 */
    showArchives: false,
    showBackButton: true,
    editPost: {
      // ★ 关掉。内容仓库是**私有**的（发布闸的前提，见 docs/gate.md）——
      // 留着这个按钮等于在每篇文章底部挂一个指向私有仓库的 404。
      // 类型上 enabled:false 这一支不接受 url —— 这是个判别联合，刻意的。
      enabled: false,
    },
    search: "pagefind",
  },
  // 页脚右侧 + 首页简介下方那一行「找到我:」共用这一个数组（`src/components/Socials.astro`）。
  // `name` 必须对得上 `src/assets/icons/socials/` 下的 SVG 文件名 —— 对不上的那一条
  // **不报错，只是静默不渲染**（Socials.astro 里 `Icon ? … : null`）。
  // 数组顺序就是渲染顺序：Telegram、X、邮箱。
  socials: [
    {
      name: "telegram",
      // ★ 公开用户名（`t.me/<用户名>`），不是 `t.me/+<邀请码>`。
      // 这个区别是刻意的：邀请码链接在 Telegram 里点一下「撤销」就失效，
      // 而失效后站上这个链接**在页面、构建、闸门三处都是零症状**，只有点进去的人看得见。
      // 用户名跟着它走，改用户名才会断。真要换成邀请码链接，记得同时安排一个人去点它。
      url: "https://t.me/your_channel",
      // ★ 「频道」不是「群」。2026-09-18 打开 `t.me/your_channel` 核实过：预览页写的是
      // `1 subscriber` + `Preview channel` —— Telegram 对频道用 subscriber、对群用 member。
      // 频道是单向广播，进去**发不了言**，所以这里不许写成「加群交流」：
      // 那是在承诺一件做不到的事，而且页面、构建、闸门三处都看不出来。
      // 首页那行文案在 `src/i18n/lang/*.ts` 的 `home.joinChannel`，改口径时一起改。
      //
      // ★ 不写这行的话默认 title 是英文的 "牢玩家 on Telegram"。
      linkTitle: "关注牢玩家的 Telegram 频道",
    },
    {
      // 【2026-09-20 加】X（推特）账号。name 必须叫 x —— 图标按名字找
      // （src/assets/icons/socials/x.svg），叫 twitter 就静默没图标。
      name: "x",
      url: "https://x.com/your_handle",
      // ★ 不写这行的话默认 title 是英文的 "牢玩家 on X"。
      linkTitle: "关注牢玩家的 X（推特）",
    },
    {
      name: "mail",
      // ⚠ 这是公网静态站，`mailto:` 在产物 HTML 里就是明文，采集器照收。
      // 换地址只改这一处，别在别的页面上再手写一遍。
      url: "mailto:you@example.com",
      // ★ 不写这行的话默认 title 是英文的 "Send an email to 牢玩家"
      // （判据 `url.startsWith("mailto:") || name === "mail"`），中文站里挂个英文 aria-label。
      linkTitle: "给牢玩家发邮件",
    },
  ],
  // ⚠ 下面这个 telegram 和上面那个**不是一回事**，别改混：
  // 这里是文章页的「分享到」按钮（`t.me/share/url?url=` + 本文地址），
  // 上面那个是站方自己的频道。两处都叫 telegram、都用同一个图标，唯一的区别在 url。
  shareLinks: [
    { name: "x", url: "https://x.com/intent/post?url=" },
    { name: "telegram", url: "https://t.me/share/url?url=" },
    { name: "mail", url: "mailto:?subject=分享一篇研究&body=" },
  ],
});
