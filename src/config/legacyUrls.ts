/**
 * 老地址 → 新地址。**2026-09-21 那天改了两轮地址，这张表把两轮的老链接都接住。**
 *
 * ## 为什么会有这张表
 *
 * 这个站的地址纪律是「**定了就不改**」（`entryNo.ts` 开头、docs/deploy.md 2.4）——
 * 改一个地址等于把已经分享出去的链接打死，而那件事在站外是**零症状**的：
 * 点的人看到 404，写代码的人看不到任何东西。
 *
 * 两轮都是**明知故犯**，前提是当时全站只有七八条内容、域名刚绑上、收录刚开始 ——
 * 代价是可数的十几条，而且当场接住了。
 *
 *   第一轮：`标的-日期时分-智能体-模型` → 全站递增数字（`/posts/3`）
 *   第二轮：前缀缩成一个字母 + 号从 1000 起（`/r/1002`）
 *
 * ## ★ 目标一律是**最终地址**，不许接力
 *
 * 第一轮那几行的 `to` 在第二轮**跟着改到了最终地址**（`/posts/3` → `/r/1002`）。
 * 这不违反「只增不改」—— 那条规矩护的是**源**（`from` 一行都不许删，删了就是把
 * 它当初救的链接重新打死）。目标必须跟着搬，否则老链接会先 301 到一个已经不存在的
 * 地址、再指望第二跳，而抓取方对链式跳转是打折甚至放弃的。
 * `legacyUrls.test.ts` 有一条专门钉「`to` 不许是另一条的 `from`」。
 *
 * ## 它生成的是什么：**两份，给两个不同的运行环境**
 *
 *   1. `astro.config.ts` 的 `redirects` —— `astro dev` 里就是真跳转；静态构建出来是
 *      一个 HTML 跳转页（`<meta http-equiv="refresh">` ＋ noindex ＋ canonical），
 *      落在 `dist/<老地址>/index.html`。
 *   2. `dist/_redirects` —— Cloudflare Workers Static Assets 认这个文件
 *      （Workers 文档 Static Assets → Redirects 那一页），在边缘直接回 **301**。
 *
 * ★ 两份**同源**。⚠ 唯一的差别：**通配那几行只进 `_redirects`** ——
 *   Astro 的 `redirects` 在静态构建里要为每条生成一个 HTML 页面，它没法为
 *   「`/tags/` 下面所有还没出现过的标签」生成页面。这个差别是**显式的**
 *   （`splat: true`），测试钉着它，不是漏了一处。
 */

/**
 * 一条老地址。
 *
 * `from` / `to` 都是站内绝对路径，不带域名、不带末尾斜杠。
 * `splat: true` = 整个前缀搬家（`/tags/x` → `/t/x`），只进 `_redirects`。
 */
export type LegacyUrl = {
  from: string;
  to: string;
  note: string;
  splat?: true;
};

/** 第一轮：换编号。第二轮把这几行的目标一起搬到了最终地址。 */
const R1 = "2026-09-21 换编号（原始 slug → 号）";
/** 第二轮：前缀缩成一个字母，号从 1000 起。 */
const R2 = "2026-09-21 缩前缀 + 号从 1000 起";

export const LEGACY_URLS: readonly LegacyUrl[] = [
  // ── 条目：每条有两代老地址，都直接指向最终地址 ────────────────────
  { from: "/prompts/stock-analysis", to: "/p/1000", note: R1 },
  { from: "/prompts/1", to: "/p/1000", note: R2 },

  { from: "/prompts/relative-valuation", to: "/p/1001", note: R1 },
  { from: "/prompts/2", to: "/p/1001", note: R2 },

  {
    from: "/posts/orcl-20260920-0857-spark-gemini-3-pro",
    to: "/r/1002",
    note: R1,
  },
  { from: "/posts/3", to: "/r/1002", note: R2 },

  {
    from: "/qa/q-20260920-0329-chatgpt-gpt-6-pro",
    to: "/q/1003",
    note: R1,
  },
  { from: "/qa/4", to: "/q/1003", note: R2 },

  { from: "/qa/q-20260920-0443", to: "/q/1004", note: R1 },
  { from: "/qa/5", to: "/q/1004", note: R2 },

  { from: "/guides/open_charles_schwab_account", to: "/g/1005", note: R1 },
  { from: "/guides/6", to: "/g/1005", note: R2 },

  { from: "/posts/qcom-20260920-0853", to: "/r/1006", note: R1 },
  { from: "/posts/7", to: "/r/1006", note: R2 },

  // 第二轮当天在后台新建的那一条，只存在过带旧前缀的形态。
  { from: "/posts/8", to: "/r/1007", note: R2 },

  // ── 列表页和其余单页 ──────────────────────────────────────────────
  { from: "/posts", to: "/r", note: R2 },
  { from: "/qa", to: "/q", note: R2 },
  { from: "/guides", to: "/g", note: R2 },
  { from: "/prompts", to: "/p", note: R2 },
  { from: "/tags", to: "/t", note: R2 },
  { from: "/about", to: "/a", note: R2 },
  { from: "/search", to: "/se", note: R2 },
  { from: "/archives", to: "/ar", note: R2 },

  // ── 整段搬家（只进 _redirects，见文件头）────────────────────────────
  // 标签页是**真会被贴出去**的（文章底下那排标签片点进去就是它），而且标签是
  // 中文、地址里是一串 %E7%AB%99，一条条列出来既长又会随内容变。
  // ⚠ 它必须排在上面那些精确行**后面**：`_redirects` 里先命中的赢，
  //   而 `/tags` 那一行要走精确规则（否则 `:splat` 是空的）。
  { from: "/tags", to: "/t", note: R2, splat: true },
];

/**
 * `astro.config.ts` 的 `redirects` 要的形状。
 * **通配那几行不在里面**（静态构建生成不了"还没出现过的地址"的跳转页）。
 */
export const legacyRedirects = (): Record<string, string> =>
  Object.fromEntries(
    LEGACY_URLS.filter(r => !r.splat).map(r => [r.from, r.to])
  );

/**
 * `dist/_redirects` 的全文 —— Cloudflare Workers Static Assets 的格式：
 * 每行 `<源> <目标> <状态码>`，`#` 开头是注释。
 *
 * ★ 写的是 **301**（永久），不是默认的 302：这些地址不会再回来了，
 *   302 会让抓取方一直保留老地址、一直回来问。
 * ★ **精确规则全部排在通配规则前面**（Cloudflare 的规矩：先命中的赢，
 *   而且官方就要求静态规则写在动态规则之前）。
 * ⚠ **源**两种写法都列（带斜杠和不带）：老链接是 `/posts/3/` 那种目录形态分享出去的。
 *   **目标一律不带斜杠** —— 全站口径就是不带（astro.config.ts 的 `trailingSlash: "never"`
 *   ＋ wrangler 的 `drop-trailing-slash`），目标带斜杠会变成两跳。
 */
export function legacyRedirectsFile(): string {
  const lines = [
    "# 老地址 → 新地址。**这个文件是构建产物，别手改** ——",
    "# 唯一的表在 src/config/legacyUrls.ts，由 astro.config.ts 的 astro:build:done 写出来。",
  ];
  const emit = (rows: readonly LegacyUrl[]) => {
    for (const r of rows) {
      lines.push(`# ${r.note}`);
      if (r.splat) {
        lines.push(`${r.from}/* ${r.to}/:splat 301`);
      } else {
        lines.push(`${r.from} ${r.to} 301`);
        lines.push(`${r.from}/ ${r.to} 301`);
      }
    }
  };
  emit(LEGACY_URLS.filter(r => !r.splat));
  emit(LEGACY_URLS.filter(r => r.splat));
  return `${lines.join("\n")}\n`;
}

/**
 * 这个地址是不是一条老地址生成的跳转页 —— sitemap 的 filter 用它。
 *
 * 传进来的是 sitemap 给的完整 URL（`https://lwj.ai/posts/3`），
 * 所以按"末尾是不是这一段"比，斜杠两种写法都认。
 * 通配那几行也算进来：`/tags/估值` 这种页面在新地址那边已经有一份了。
 */
export function isLegacyUrl(pageUrl: string): boolean {
  const path = pageUrl.replace(/\/+$/, "");
  return LEGACY_URLS.some(r =>
    r.splat ? path.includes(`${r.from}/`) : path.endsWith(r.from)
  );
}
