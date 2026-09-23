import {
  defineConfig,
  envField,
  fontProviders,
  svgoOptimizer,
} from "astro/config";
import type { AstroIntegration } from "astro";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { unified } from "@astrojs/markdown-remark";
import remarkToc from "remark-toc";
import remarkCollapse from "remark-collapse";
import rehypeCallouts from "rehype-callouts";
import rehypeSanitize from "rehype-sanitize";
import rehypeTableScroll from "./src/utils/rehypeTableScroll";
import {
  isLegacyUrl,
  legacyRedirects,
  legacyRedirectsFile,
  LEGACY_URLS,
} from "./src/config/legacyUrls";
import { routePath } from "./src/config/routes";
import {
  sitemapLastmod,
  SITEMAP_FILE,
  type LastmodIndex,
} from "./src/config/sitemap";
import {
  buildLastmodIndex,
  writeSitemapAlias,
} from "./src/config/sitemapBuild";
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import react from "@astrojs/react";
import keystatic from "@keystatic/astro";
import { transformerFileName } from "./src/utils/transformers/fileName";
import config from "./astro-paper.config";
// ★ 消毒规则住在 src/config/sanitize.ts，因为 scripts/gate/sanitize.test.ts
//   要 import 同一份去测。抄一份到这里，就是"测的和跑的不是同一个 schema"。
import { MARKDOWN_SANITIZE_SCHEMA } from "./src/config/sanitize";

/**
 * 后台**只在 `astro dev` 里存在**。
 *
 * Keystatic 要跑服务端代码（它要读写你磁盘上的 .md），挂进生产构建就必须上
 * SSR adapter，站点从"一堆静态文件"变成"一个要维护的服务"，而且公网上从此
 * 有一个 /keystatic 入口等着被人敲。
 *
 * 换成只在 dev 挂载之后：
 *   - 生产构建 100% 静态，公网**没有后台这个东西**，不存在"后台被攻破"这个场景；
 *   - 你粘进去的内容先落到本机磁盘，**提交之前根本没离开这台机器** ——
 *     所以 pre-commit 那道闸是真的能拦住它的（见 docs/gate.md 三道闸那节）。
 *
 * 代价：发稿必须在这台开着 `pnpm dev` 的机器上，手机上发不了。
 * 要手机发稿就得换 GitHub 模式 + SSR adapter，那是另一套取舍，写在 docs/deploy.md。
 */
const isDev = process.argv.includes("dev");

/**
 * sitemap 的 `<lastmod>` 那张表，**本轮构建只建一次**（`serialize` 是逐条调的）。
 *
 * ★ 懒建而不是模块顶层建：这个文件在 `astro dev` 启动时也会被求值一遍，
 *   而 dev 里根本不生成 sitemap —— 没必要为此扫一遍四个内容目录。
 */
let _lastmods: LastmodIndex | undefined;
const lastmods = (): LastmodIndex => (_lastmods ??= buildLastmodIndex());

/**
 * 把老地址表写成 `dist/_redirects` —— Cloudflare Workers Static Assets 认这个文件，
 * 在边缘直接回 301（比 Astro 静态构建出来的 meta refresh 跳转页干净一档）。
 *
 * ★ 和上面那个 `redirects:` **同源**，都从 `src/config/legacyUrls.ts` 推 ——
 *   两份各写一份的那天，就是其中一份漏掉一条老地址而没有任何一处会响的那天。
 * ★ 写进 `dist/` 而不是 `public/`：它是构建产物，不该有一份能被人手改、
 *   然后和那张表悄悄分家的副本躺在仓库里。
 */
const legacyRedirectsFileIntegration: AstroIntegration = {
  name: "laowanjia:legacy-redirects",
  hooks: {
    // ⚠ `writeFileSync` 在文件顶上静态 import，**不许在这里 `await import(...)`**：
    //   跑到 astro:build:done 的时候 Vite 的 module runner 已经关了，
    //   动态 import 当场抛「Vite module runner has been closed」，
    //   而构建的其余部分全是绿的 —— 只有这一个文件没写出来。
    "astro:build:done": ({ dir, logger }) => {
      writeFileSync(new URL("_redirects", dir), legacyRedirectsFile(), "utf8");
      logger.info(`写了 _redirects（${LEGACY_URLS.length} 条老地址 → 301）`);
    },
  },
};

/**
 * 把 `dist/sitemap-index.xml` 抄一份成 `dist/sitemap.xml`。
 *
 * 为什么需要这一步（`@astrojs/sitemap` 的文件名凑不出 `sitemap.xml`）、
 * 为什么抄的是索引而不是 `sitemap-0.xml`、以及为什么读不到源文件要抛，
 * 全写在 `src/config/sitemap.ts` 第 1 节。
 *
 * ⚠ 它**必须排在下面 integrations 数组里的 `sitemap()` 后面** ——
 *   `astro:build:done` 是按数组顺序 `for await` 跑的。排错了会抛（构建红），
 *   不会悄悄少一个文件。
 */
const sitemapAliasIntegration: AstroIntegration = {
  name: "laowanjia:sitemap-alias",
  hooks: {
    "astro:build:done": ({ dir, logger }) => {
      const parts = writeSitemapAlias(fileURLToPath(dir));
      logger.info(`写了 ${SITEMAP_FILE}（索引，${parts} 份分卷）`);
    },
  },
};

/**
 * dev 专用的发布闸预览页 `/_gate`（src/dev/gate.astro）：刷新即重扫工作树，
 * 判据和 pre-commit / 构建期那两道闸是同一份（scripts/gate/inspect.ts）。
 *
 * 和 Keystatic 同一条纪律：只在 `astro dev` 里注入。文件不在 src/pages 下，
 * 生产构建里**根本没有这条路由**，不是"构建了再藏起来"。
 */
const devGate: AstroIntegration = {
  name: "laowanjia:dev-gate",
  hooks: {
    "astro:config:setup": ({ injectRoute, updateConfig }) => {
      // 【2026-09-20】把**仓库的绝对路径**编进 dev 的客户端代码里：后台左侧菜单底部要显示
      // 一键重启脚本在磁盘上的完整位置（src/dev/keystaticToolbar.ts）——
      // 浏览器里没有 cwd 这个东西，不在这一步注入就只能印一个相对路径。
      // 只在 dev 这条路上：生产构建连这个集成都不加载，绝对路径进不了公网产物。
      updateConfig({
        vite: {
          define: { __LWJ_DEV_ROOT__: JSON.stringify(process.cwd()) },
        },
      });
      injectRoute({
        pattern: "/_gate",
        entrypoint: new URL("./src/dev/gate.astro", import.meta.url),
      });
      // 【2026-09-20】发帖文案页 /_share（src/dev/share.astro）：每条已发布的研究稿 / 问答
      // 各生成一段发到 X 的话，一键复制或直接打开 x.com 的发帖框。同样只在 dev 里存在。
      injectRoute({
        pattern: "/_share",
        entrypoint: new URL("./src/dev/share.astro", import.meta.url),
      });
      // 【2026-09-20】提交推送页 /_publish（src/dev/publish.astro）和它的接口
      // /_publish/run（publish-run.ts）：把后台存了盘的内容 git add / commit / push。
      // 跑的是真 git，pre-commit 钩子（发布闸第二道）照跑。同样只在 dev 里存在。
      injectRoute({
        pattern: "/_publish",
        entrypoint: new URL("./src/dev/publish.astro", import.meta.url),
      });
      injectRoute({
        pattern: "/_publish/run",
        entrypoint: new URL("./src/dev/publish-run.ts", import.meta.url),
      });
      // 【2026-09-20】粘贴导入页 /_import（src/dev/import.astro）和它的接口 /_import/run
      // （import-run.ts）：常用提示词 + 把智能体整理出来的 JSON 变成一条草稿。同样只在 dev 里。
      injectRoute({
        pattern: "/_import",
        entrypoint: new URL("./src/dev/import.astro", import.meta.url),
      });
      injectRoute({
        pattern: "/_import/run",
        entrypoint: new URL("./src/dev/import-run.ts", import.meta.url),
      });
      // 【2026-09-22】清杠页 /_tidy（src/dev/tidy.astro）和它的接口 /_tidy/run
      // （tidy-run.ts）：把稿子里「整行只有反斜杠 / 斜杠」的行删掉 —— 模型写 LaTeX
      // 时留下的那些（站上没有数学渲染，那一行印出来就是一根孤零零的杠）。
      // 判据在 scripts/content/tidyPlan.ts（纯函数、有单测）。同样只在 dev 里存在。
      injectRoute({
        pattern: "/_tidy",
        entrypoint: new URL("./src/dev/tidy.astro", import.meta.url),
      });
      injectRoute({
        pattern: "/_tidy/run",
        entrypoint: new URL("./src/dev/tidy-run.ts", import.meta.url),
      });
      // 【2026-09-22】小红书封面图 /_xhs（src/dev/xhs.astro）和出图那条接口
      // /_xhs/card.png（xhs-card.ts）：每条已发布的内容各生成一张 1080×1440（3:4）
      // 的封面卡，点一下下载，直接发小红书。判据在 src/utils/xhsCardPlan.ts
      // （纯函数、有单测），satori 那一半在 src/utils/xhsCard.ts。同样只在 dev 里存在。
      // ★ 和分享卡（/r/<号>/index.png）刻意不一样的一处：这张画不出来**不回落**到
      //   默认图，直接回 500 —— 理由写在 xhs-card.ts 文件头（图自己就是全部内容）。
      injectRoute({
        pattern: "/_xhs",
        entrypoint: new URL("./src/dev/xhs.astro", import.meta.url),
      });
      injectRoute({
        pattern: "/_xhs/card.png",
        entrypoint: new URL("./src/dev/xhs-card.ts", import.meta.url),
      });
      // 【2026-09-22】发帖接口 /_xhs/publish（xhs-publish.ts）：出图 ＋ 生成文案 ＋
      // 调 xiaohongshu-mcp（默认 http://localhost:18060/mcp）直接发。
      // ★ 结果**四档**（published / unconfirmed / failed / offline）——
      //   那个接口没有公开的响应 schema，"看不懂"必须是独立一档，
      //   理由写在 src/dev/xhsPublishPlan.ts 文件头。
      injectRoute({
        pattern: "/_xhs/publish",
        entrypoint: new URL("./src/dev/xhs-publish.ts", import.meta.url),
      });
      // 【2026-09-23】推长文到雪球草稿箱：/_xueqiu/status（页面一打开就起桥、报状态）＋
      // /_xueqiu/draft（推一篇）。走「文章同步助手」（Wechatsync）扩展 —— **我们开 WebSocket、
      // 扩展来连**，只存草稿不发布。理由和那两个安全洞（它自己的桥不查来源、开了个
      // 不认证的 9528）写在 src/dev/wechatsyncPlan.ts / wechatsyncBridge.ts 文件头。
      injectRoute({
        pattern: "/_xueqiu/status",
        entrypoint: new URL("./src/dev/xueqiu-status.ts", import.meta.url),
      });
      injectRoute({
        pattern: "/_xueqiu/draft",
        entrypoint: new URL("./src/dev/xueqiu-draft.ts", import.meta.url),
      });
      // 【2026-09-21】预览中转页 /_preview（src/dev/preview.astro）：后台编辑页
      // 「…」菜单里那条 Preview 链到这里（Keystatic 原生的 previewUrl）。能看的直接
      // 302 跳到真实地址；草稿 / 还没存盘 / 参数不对三档分别说明 —— 为什么不直接
      // 指向 /r/{slug}，写在 src/dev/previewPlan.ts 开头（草稿在 dev 里也没有页面）。
      injectRoute({
        pattern: "/_preview",
        entrypoint: new URL("./src/dev/preview.astro", import.meta.url),
      });
      // 【2026-09-23】后台列表页的数据 /_entries（src/dev/entries-run.ts）：研究稿 / 问答 /
      // 教程 / 提示词那几张表换成了自己画的（搜索 + 新的在前 + 分页，src/dev/keystaticEntryList.ts），
      // 数据从这里读。只读、同样只在 dev 里存在。
      // ⚠ 这个地址和浏览器那头 fetch 的是同一个常量（entryListPlan.ts 的 ENTRIES_ROUTE），
      //   这里写字面量是为了不让这份配置 import 一串会被后台改动的数据文件 ——
      //   两边对得上由 scripts/gate/entryList.test.ts 钉着。
      injectRoute({
        pattern: "/_entries",
        entrypoint: new URL("./src/dev/entries-run.ts", import.meta.url),
      });
    },
  },
};

export default defineConfig({
  site: config.site.url,
  /**
   * 2026-09-21 那天改了两轮地址，这里接住两代老链接。表在 `src/config/legacyUrls.ts`，
   * 那里写着为什么源只增不改、目标却要跟着搬，以及为什么同一批地址要从 sitemap 里排掉。
   */
  redirects: legacyRedirects(),
  /**
   * 地址**不带末尾斜杠**：`/r/1002`，不是 `/r/1002/`。【2026-09-21】
   *
   * 这一条管的是**站自己印出来的每一个地址**：`getRelativeLocaleUrl()`（站内链接）、
   * `Astro.url.pathname`（Layout.astro 的 canonical / og:url / twitter:url）、
   * sitemap 的 `<loc>`、RSS 的 link 和 guid、JSON-LD 的 url。
   *
   * ⚠ 它和 `wrangler.jsonc` 里的 `html_handling: "drop-trailing-slash"` 是**一对**。
   *   产物仍然是 `dist/r/1002/index.html`（`build.format` 保持默认的 directory ——
   *   换成 file 的话 Pagefind 给出的结果地址会变成 `/r/1002.html`），
   *   靠边缘那一行把 `/r/1002` 认成正式形态。只改一边的后果写在 wrangler.jsonc 那段里。
   *
   * ⚠ `pnpm dev` 里带斜杠的地址直接 **404**（Astro 的 "never" 在 dev 是严格匹配，
   *   它没有边缘那一层去跳转）。线上不是这样 —— Cloudflare 会 301 过来。
   *   本机看到 `/r/1002/` 404 **不是坏了**，别为此改回 "ignore"。
   */
  trailingSlash: "never",
  integrations: [
    mdx(),
    sitemap({
      /**
       * 【2026-09-21 查过了，别再查一遍】`trailingSlash: "never"` 之后，sitemap 里
       * **首页那一条是光秃秃的 `https://lwj.ai`**，而首页的 canonical 是
       * `https://lwj.ai/`（`new URL("/", site).href` 永远带那个斜杠，拿不掉）。
       *
       * 看着像"两处对不上"，实际不是，而且**从这里也修不了**：
       *   - `serialize` 拿到的 item 是 `https://lwj.ai/`，**带着斜杠**（实测打印过）——
       *     斜杠是再往下一层、`sitemap` 那个包写 `<loc>` 时去掉的，插不进手；
       *   - 而 RFC 3986 §6.2.3 说得明白：http(s) 下空路径和 `/` 是**同一个资源**，
       *     抓取方一律归一化。所以这不是 `/search` 那种真的对不上。
       *
       * ★ 写在这里是为了**挡住下一次"顺手修一下"**：加一个 serialize 去补那个斜杠，
       *   结果是一段永远不匹配的死代码，而看它的人会以为那件事被处理过了。
       */
      /**
       * 每条 `<lastmod>`。判据全在 `src/config/sitemap.ts` 第 2 节 ——
       * **哪些页有、哪些页刻意没有**，以及为什么 `modDatetime` 没填要退回
       * `pubDatetime`（`src/config/lastModified.ts`，和详情页 JSON-LD 的
       * `dateModified` 读的是同一个判据）。
       *
       * ⚠ 那张表**只在这一轮构建里建一次**：`serialize` 是逐条调的，
       *   不缓存的话每条 `<loc>` 都要把四个内容目录重扫一遍。
       */
      serialize: item => {
        const at = sitemapLastmod(lastmods(), item.url);
        return at ? { ...item, lastmod: at } : item;
      },
      // /search 是工具页：search.astro 给它 noindex，这里同时把它从 sitemap 里排除。
      // 两处要一起改 —— 只 noindex 不排除 = sitemap 列着一个自己声明不要收录的地址，
      // Search Console 会报「已提交但被 noindex 排除」（seo.test.ts 钉着两处）。
      // ⚠ 比的是**不带末尾斜杠**的形态（trailingSlash: "never"）——
      //   还按 `/search/` 比的话这个过滤器一条都匹配不上，而构建全绿。
      // ⚠ 路径从 `ROUTES` 取，**不许在这儿手写 `/se`**：地址一改这里就静默失效，
      //   而它失效的症状是"sitemap 里多了一页"，没有人会注意到。
      filter: page =>
        !page.endsWith(routePath("search")) &&
        // 老地址生成的是跳转页（canonical 指向新地址），列进 sitemap 等于自己
        // 提交一批"备用网页" —— 和 /search 那条 noindex 是同一个形态。
        !isLegacyUrl(page) &&
        (config.features?.showArchives !== false ||
          !page.endsWith(routePath("archives"))),
    }),
    // ⚠ 必须紧跟在 sitemap() 后面（`astro:build:done` 按这个数组的顺序跑）——
    //   它要抄的那个索引文件是上面那一位刚写出来的。
    sitemapAliasIntegration,
    legacyRedirectsFileIntegration,
    ...(isDev ? [react(), keystatic(), devGate] : []),
  ],
  i18n: {
    locales: ["zh-CN"],
    defaultLocale: "zh-CN",
    routing: {
      prefixDefaultLocale: false,
    },
  },
  markdown: {
    processor: unified({
      // ★ 关掉 SmartyPants。它按**英文**规则判直引号是开还是合（看前一个字符是不是空白），
      //   而中文正文里引号前面永远是汉字，于是 `命中"我持有"` 两个引号都被判成右引号，
      //   渲染出来是 `命中”我持有"`。中文标点本来也不该由一个英文排版器来改。
      //   实测于 2026-09-18 的开站说明那篇。
      //
      // ⚠ 必须写在 `unified({...})` **里面**。`markdown.smartypants` 那个顶层选项在
      //   自定义 processor 下不生效（写在那儿不报错、也不起作用 —— 两种"没效果"里
      //   最难查的那种）。
      smartypants: false,
      remarkPlugins: [
        remarkToc,
        [remarkCollapse, { test: "Table of contents" }],
      ],
      /**
       * ★ 消毒**排在第一位**，在 rehypeCallouts 之前。理由见文件末尾
       *   `MARKDOWN_SANITIZE_SCHEMA` 那一大段。
       */
      rehypePlugins: [
        [rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA],
        rehypeCallouts,
        // 宽表包一层横向滚动容器（手机上一张三列以上的表不该被压成一格一个字）。
        // ★ 必须排在消毒**之后**：它加的 div / class 不在白名单里，排在之前会被
        //   静默吃掉（docs/engineering-notes.md 坑 14 那个形态）。detailParity.test.ts 钉着顺序。
        rehypeTableScroll,
      ],
    }),
    shikiConfig: {
      themes: { light: "min-light", dark: "night-owl" },
      defaultColor: false,
      wrap: false,
      transformers: [
        transformerFileName({ style: "v2", hideDot: false }),
        transformerNotationHighlight(),
        transformerNotationWordHighlight(),
        transformerNotationDiff({ matchAlgorithm: "v3" }),
      ],
    },
  },
  /**
   * 图片。教程模块（开户 / 出入金）是截图为主的，一篇几十张，所以这一段值钱。
   *
   * ## layout: "constrained" —— 唯一的批量体积杠杆
   *
   * 不配的话（Astro 默认 `layout: "none"`）每张正文图输出**一张原尺寸图、
   * 没有 srcset**：手机上也在下 1920 宽的截图。
   * Markdown 的 `![]()` **传不了** width / widths / quality —— 逐图调参这条路在
   * .md 里根本不存在（后台写出来的是 .md，不是 .mdx，用不了 `<Image>`），
   * 所以全站级的这两个旋钮是仅有的口子。
   *
   * ## ⚠ 只有**相对路径**的正文图会走到这里
   *
   * 判据是 `@astrojs/markdown-remark` 里 `remark-collect-images.js` 的
   * `!url.startsWith("/")` —— 一个字符之差。`![](/x.png)` 和 `public/` 下的图
   * **一步都不经 sharp，原图逐字节发布**（连 EXIF 一起）。
   * 后台那边靠 `keystatic.config.ts` 的 `imageOptions()` 保证写出来的是相对路径，
   * 见那段注释。
   *
   * ## ⚠ 两件不会报错、但会让原图带着 EXIF 上公网的事
   *
   * 1. `astro/dist/assets/services/sharp.js` 里 transform 失败时是
   *    `catch {}` → **返回原始字节**，只印一行 `console.warn(... will be used
   *    unoptimized)`、退出码 0。Cloudflare 的构建日志里这一行会淹掉。
   * 2. `package.json` 写的是 `sharp: ^0.35.2`，而 astro 自己依赖 `^0.34.0`，
   *    pnpm 装了两份（构建时跑的是 astro 那份）。正常构建只加载一份不会出事，
   *    但任何让两份同进程的脚本都会让 libvips 互踩，症状恰好就是上面那个 fallback。
   *
   * 判断一张图到底走没走优化：看产物路径和扩展名。
   * `/_astro/<名字>.<hash>.webp` = 走了；`/<名字>.png` = 没走。
   */
  image: {
    layout: "constrained",
    service: {
      entrypoint: "astro/assets/services/sharp",
      config: {
        // 截图是 UI 界面（大片纯色 + 文字边缘），不是照片 —— 它比照片更耐压。
        // 默认等效 80；70 在界面截图上肉眼看不出差别，体积能省一截。
        webp: { quality: 70 },
      },
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },
  fonts: [
    {
      name: "Google Sans Code",
      cssVariable: "--font-google-sans-code",
      provider: fontProviders.google(),
      fallbacks: ["monospace"],
      weights: [300, 400, 500, 600, 700],
      styles: ["normal", "italic"],
      formats: ["woff", "ttf"],
    },
  ],
  env: {
    schema: {
      PUBLIC_GOOGLE_SITE_VERIFICATION: envField.string({
        access: "public",
        context: "client",
        optional: true,
      }),

      /**
       * Cloudflare Web Analytics 的 beacon token。**默认不填，而且多数情况下不该填。**
       *
       * ## 先走自动注入，那条路零代码
       *
       * 站挂在 Cloudflare 自定义域名上（= 被代理），后台
       * 「Analytics & Logs → Web Analytics → Add a site」打开开关之后，
       * Cloudflare 会**在边缘往 HTML 里插 beacon**，源站一个字节都不用改。
       * 它统计的是日活 / UV / PV / 热门页面 / 来源，**看板在 Cloudflare 后台**，
       * 站上不显示任何数字。
       *
       * ## ⚠ 这一项是自动注入**不生效时**的逃生口，不是补充
       *
       * 两条路同时开 = **同一次访问被记两遍**，而且两边都不报错 ——
       * 你只会看到一份 2 倍的数字，找不到原因。所以规矩是二选一：
       *   - 后台开关开着 → 这里**留空**
       *   - 后台开关不生效（或者你刻意关掉边缘注入）→ 才把 token 填进 `.env`
       *
       * 判断自动注入到底生效没有：打开线上任意一页看网页源码，
       * 搜 `beacon.min.js`。有 = 生效了，这里就别填。
       *
       * ## 已知会让自动注入失效的一件事
       *
       * 响应头带 `Cache-Control: public, no-transform` 时，Cloudflare 不能改写
       * 响应体，beacon 注入不了、统计也就没有 —— 而页面一切正常，
       * 只是后台永远是 0。真遇到就用这一项。
       *
       * ⚠ 两条路的上报地址不一样（自动是同源 `/cdn-cgi/rum`，手动是跨域
       * `cloudflareinsights.com`）。以后要是加了 CSP，切换设置时得同步改 `connect-src`。
       */
      PUBLIC_CF_BEACON_TOKEN: envField.string({
        access: "public",
        context: "client",
        optional: true,
      }),
    },
  },
  experimental: {
    svgOptimizer: svgoOptimizer(),
  },
});
