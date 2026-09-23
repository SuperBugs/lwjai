import type { UIStrings } from "../types";

export default {
  nav: {
    home: "Home",
    posts: "Posts",
    qa: "Q&A",
    symbols: "Tickers",
    guides: "Guides",
    prompts: "Prompts",
    tags: "Tags",
    about: "About",
    archives: "Archives",
    search: "Search",
  },
  post: {
    dateFormat: "D MMM, YYYY HH:mm",
    // List cards show the date only (see zh-CN for why). Must be a prefix of the above.
    dateOnlyFormat: "D MMM, YYYY",
    // ★ 跟着 astro-paper.config.ts 的 timezone 走（同 zh-CN 那一份）。这个站跑的是
    //   lang: "zh-CN"，英文这份今天没人看见 —— 但留着一个写死的 `ET` 就是一句
    //   在别处等着的假话。
    timezoneLabel: "UTC+8",
    publishedAt: "Published at",
    updatedAt: "Updated",
    sharePostIntro: "Share to:",
    sharePostOn: "Share this post on {{platform}}",
    sharePostViaEmail: "Share this post via email",
    tagLabel: "Tags",
    backToTop: "Jump to start",
    jumpToEnd: "Jump to end",
    goBack: "Go back",
    editPage: "Edit page",
    previousPost: "Previous Post",
    nextPost: "Next Post",
    promptUsed: "Prompt used:",
    // ★ 同 zh-CN：连本条一起数，措辞和问答那一组必须不一样。
    takesCount: "This topic has {{count}} reports — click to switch:",
    takesNavLabel: "Reports on this topic",
    switching: "Switching report…",
    siblingsHeading: "Same topic, other agents' reports",
    siblingsOnlyThis: "This topic has only this one report so far.",
  },
  qa: {
    questionLabel: "Question",
    answeredBy: "Answered by {{agent}}",
    // "Not recorded", 不是 "Written by me" —— 两种"没有"在英文里也不许合并。
    unspecifiedAgent: "Source not recorded",
    // 同 zh-CN：只在智能体是 AI 产品、模型没标时出现；不许留空。
    unspecifiedModel: "Model not recorded",
    modelUsed: "model: {{model}}",
    siblingsHeading: "Same question, other agents' answers",
    // ★ 同 zh-CN：有键没兄弟那一档不许留空。
    siblingsOnlyThis: "This question has only this one answer so far.",
    // ★ 同 zh-CN：连本条一起数。
    answersCount: "This question has {{count}} answers — click to switch:",
    answersNavLabel: "Answers to this question",
    switching: "Switching answer…",
  },
  pagination: {
    prev: "Prev",
    next: "Next",
    page: "Page",
  },
  home: {
    // Visible label on all four "see all" links; the specific phrases below
    // stay as the accessible name (see zh-CN for why).
    all: "All",
    featured: "Featured",
    recentPosts: "Recent Posts",
    allPosts: "All Posts",
    recentQa: "Recent Q&A",
    recentGuides: "Guides",
    allGuides: "All guides",
    recentPrompts: "Prompts",
    allPrompts: "All prompts",
    allInFeatured: "Everything in this section is pinned above.",
    allQa: "All Q&A",
    tagline: "AI-assisted US stock research, Q&A and prompts",
  },
  footer: {
    copyright: "Copyright",
    allRightsReserved: "All rights reserved.",
    disclaimer: "Disclaimer",
    // 下面两条【2026-09-21】从 `home` 挪过来：那一行整块进了页脚。
    subscribe: "Subscribe via RSS",
    joinChannel: "Follow the Telegram channel",
  },
  pages: {
    guidesTitle: "Guides",
    guidesDesc:
      "Need a guide that isn't here? Request one via the contact link in the footer.",
    guidesEmpty: "No guides yet. (Not an error — nothing written yet.)",

    symbolsTitle: "Tickers",
    symbolsDesc: "Every ticker covered here.",
    symbolsEmpty: "No ticker-specific research yet.",

    tagTitle: "Tag",
    tagDesc: "All the articles with the tag",

    tagsTitle: "Tags",
    tagsDesc: "All the tags used in posts.",

    postsTitle: "Posts",
    postsDesc:
      "Research produced with OpenAI ChatGPT, Anthropic Claude, Google Spark and other tools.",
    postsEmpty: "No research notes yet. (Not an error — nothing written yet.)",

    promptsTitle: "Prompts",
    // ★ 同 zh-CN：页面上那块投稿说明删掉之后，这一句是全站唯一的投稿入口指引。
    promptsDesc:
      "Prompts, shared. Submissions welcome — get in touch via the contact link in the footer.",
    promptsEmpty: "No prompts yet. (Not an error — nothing written yet.)",

    qaTitle: "Q&A",
    qaDesc: "Q&A produced with mainstream AI tools.",
    qaEmpty:
      "No questions here yet. (Nothing is broken — there really is nothing written yet.)",

    archivesTitle: "Archives",
    archivesDesc: "All the articles I've archived.",

    searchTitle: "Search",
    searchDesc: "Search any article ...",
  },
  a11y: {
    skipToContent: "Skip to content",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    toggleTheme: "Toggle theme",
    searchPlaceholder: "Search posts...",
    noResults: "No results found",
    goToPreviousPage: "Go to previous page",
    goToNextPage: "Go to next page",
  },
  // 这一组在 en 下和 Pagefind 的内置英文基本一致，写出来是为了**两种语言走同一条路**：
  // 少了它，en 是"内置默认"、zh-CN 是"我们传的"，哪天 Pagefind 改了默认文案，
  // 两边会不声不响地漂开。方括号里的占位符逐字保留。
  searchUi: {
    clearSearch: "Clear",
    loadMore: "Load more",
    searchLabel: "Search this site",
    filtersLabel: "Filters",
    zeroResults: "No results for [SEARCH_TERM]",
    manyResults: "[COUNT] results for [SEARCH_TERM]",
    oneResult: "1 result for [SEARCH_TERM]",
    altSearch:
      "No results for [SEARCH_TERM]. Showing results for [DIFFERENT_TERM] instead",
    searchSuggestion:
      "No results for [SEARCH_TERM]. Try one of these searches:",
    searching: "Searching for [SEARCH_TERM]…",
    metaAgent: "Agent",
    metaModel: "Model",
  },
  collectionSearch: {
    placeholder: "Search {{kind}}…",
    label: "Search {{kind}}",
    searchAll: "Search everything",
    count: "{{count}} result(s)",
    empty: "No {{kind}} matching “{{term}}”",
    emptyAll: "Nothing on this site matches “{{term}}”",
    viewAll: "See all {{count}} results",
    // Must read differently from `empty` / `emptyAll`: this is "can't search", not "found nothing".
    unavailable:
      "The search index has not been generated yet — it is a build artefact, run `pnpm build` once.",
  },
  symbolFilter: {
    label: "Search tickers",
    placeholder: "Ticker or company name, e.g. TSLA, Tesla…",
    count: "{{count}} of {{total}} tickers",
    empty: "No ticker matches “{{term}}”.",
    searchAll: "Search the whole site for “{{term}}”",
  },
  provenance: {
    ai: "This one is AI-generated (models make numbers up).",
    // ★ 同 zh-CN：不许写成 "written by the site author" —— 提示词收读者投稿。
    human: "This one was written by a person, not generated by AI.",
    // ★ 第三档：「我不知道」，不许折进上面两档。
    unknown:
      "Who wrote this one is not recorded — this site carries both AI-generated and " +
      "human-written material, and this one has not been confirmed either way.",
  },
  guides: {
    staleNotice:
      "Brokers and banks change their UI, fees and flows often. This was written at the date above — " +
      "check the official pages before you act on it.",
  },
  prompts: {
    // 【2026-09-20】"Author" → "Shared by"，同 zh-CN：提示词本身也是 AI 写的，
    // 挂在这一格上的人是把它发出来的那个。
    originSite: "Shared by: {{author}}",
    // ★ 同 zh-CN：署名不许单独出现，也不许只写"投稿"而不带名字。
    contributedBy: "Shared by: {{name}} (reader submission)",
    // ★ 不许改成空字符串：留白会被读成"站长自己发的"。
    originUnspecified: "Sharer not recorded",
    // ⚠ 同 zh-CN：这几句走 textContent，不许写 markdown 强调（会原样印出星号）。
    verbatimNotice:
      "Below is the prompt verbatim — copy it and use it as is. It constrains the model's output format and " +
      "evidence requirements; it does not make the model right. Check every figure it produces against the primary source.",
    // 【2026-09-21】`contributedNotice` 随 zh-CN 一起删，理由见那一份。
    usedByHeading: "Research produced with this prompt",
    // 【2026-09-20】六条 submit* 随 PromptSubmit.astro 一起删了，理由见 zh-CN 那份。
  },
  download: {
    intro: "Take this with you:",
    markdown: "Download Markdown",
    markdownHint:
      "The raw .md file — drop it in your notes, or feed it to another model to keep digging.",
    // "Print / Save as PDF", 不是 "Download PDF" —— 站上没有 .pdf 这个文件，
    // 英文这边同样不许把"打开打印对话框"说成"下载"。
    print: "Print / Save as PDF",
    printHint:
      "Opens your browser's print dialog — pick “Save as PDF” as the destination. Images are included.",
    copy: "Copy full text",
    copyHint:
      "Byte-for-byte the same as the .md on the left, straight to your clipboard — paste it into your own AI or notes and keep digging.",
    copyWorking: "Fetching the full text…",
    // ★ 同 zh-CN：`{{chars}}` 不许拿掉。
    copied: "Copied {{chars}} characters",
    copyFailedFetch: "Couldn't fetch the text",
    // ★ 同 zh-CN：这两段走 textContent，不许写 markdown 强调。
    copyFailedFetchHint:
      "The browser couldn't fetch this article's .md file (most likely the network dropped). " +
      "Your clipboard was not touched at all — it still holds whatever you copied last, so don't just paste. " +
      "“Download Markdown” on the left is the same file; grab it directly.",
    copyFailedClipboard: "Couldn't copy",
    copyFailedClipboardHint:
      "The text was fetched, but the browser wouldn't let this page write to the clipboard " +
      "(usually the case over plain http). The whole article is selected for you below — press Ctrl/⌘ + C:",
    copyFieldLabel: "Full text of this article",
    // 【2026-09-23】exportNotice / exportImagesDropped / exportImagePlaceholder 随 zh-CN 一起删，
    // 理由见那一份：导出件就是正文原文，站方一个字都不加。
  },
  share: {
    copyLink: "Copy link to this page",
    // ★ 同 zh-CN：说清楚复制走的是**链接**。元信息行那个转发按钮只有图标，
    //   旁边还有一个「复制全文」—— 只说 "Copied" 分不清刚才进剪贴板的是哪一个。
    copied: "Link copied",
    // "Couldn't copy", 不是 "Copy failed" —— 英文这边同样不许把"浏览器没放行"
    // 说成"站上出错了"，读者据此采取的下一步动作是不同的。
    failed: "Couldn't copy",
    failedHint:
      "Your browser blocked clipboard access for this page (usually the case over plain http). Here is the link, already selected for you — press Ctrl/⌘ + C:",
    fieldLabel: "Link to this page",
  },
  related: {
    bySymbolHeading: "More on {{symbol}}",
    bySymbolOnlyThis: "This is the only entry on this ticker so far.",
    bySymbolOnlyThisMulti: "This is the only entry on these tickers so far.",
    bySymbolAll: "Everything on {{symbol}}",
    lookupIntro: "Check the primary sources:",
    lookupTitle: "{{symbol}} on {{source}}",
  },
  toc: {
    title: "Contents",
    count: "{{count}} sections",
    // 同 zh-CN：说的是按下去会发生什么，当前状态由 aria-expanded 说。
    collapse: "Collapse contents",
    expand: "Expand contents",
  },
  reading: {
    // 视觉那一格只剩数字（前面是眼睛图标）；带 hedge 的整句在下面那个串里。
    minutes: "{{minutes}} min",
    minutesTitle: "~{{minutes}} min read",
    chars: "{{chars}} characters",
  },

  code: {
    copy: "Copy",
    copied: "Copied",
  },
  lightbox: {
    zoom: "Zoom image",
    zoomAlt: "Zoom image: {{alt}}",
    preview: "Image preview",
    previewAlt: "Image preview: {{alt}}",
    close: "Close image preview",
  },
  feed: {
    subscribeSymbol: "Subscribe to {{symbol}} via RSS",
    symbolDesc: "Everything on {{symbol}}, newest first.",
  },
  notFound: {
    title: "404 Not Found",
    message: "Page Not Found",
    goHome: "Go back home",
  },
} satisfies UIStrings;
