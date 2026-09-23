import type { UIStrings } from "../types";

// 文件名就是 locale 标识（src/i18n/index.ts 按 ./lang/*.ts 扫出来），
// 所以这份对应 astro-paper.config.ts 里的 `lang: "zh-CN"`。
// 用 zh-CN 而不是 zh：它同时进 <html lang="">，搜索引擎靠它判简繁。

export default {
  nav: {
    home: "首页",
    posts: "研究",
    qa: "问答",
    symbols: "标的",
    guides: "教程",
    prompts: "提示词",
    tags: "标签",
    about: "关于",
    archives: "归档",
    search: "搜索",
  },
  post: {
    // ★【2026-09-21 用户定的】页面上**只印裸时间**：「北京时间」那三个字缀在每一张
    //   卡片、每一个页头后面太吵。时区名收进下面那一格，由 `<time>` 的 title 带着，
    //   鼠标放上去才出现；导出的 .md 里仍然原样印着（那份文件没有 hover）。
    /**
     * 【2026-09-22 用户定的】`2026/09/01 00:00:00` —— 换掉了「2026年9月1日 21:17」。
     *
     * ★ 全站每一处完整时间都从这一个串出去（`Datetime.astro`、归档、分享卡、
     *   导出的 .md 那一版是它加上时区名），所以换形状只改这里。
     * ⚠ 秒**永远是 00**：后台那一格（`fields.datetime`）只存到分钟，
     *   frontmatter 里也就没有秒。印出来的不是"精确到秒"，是这个格式自带的位数 ——
     *   真要让它有意义，得先让时间那一格存得下秒。
     */
    dateFormat: "YYYY/MM/DD HH:mm:ss",
    /**
     * 列表卡片上那一格（【2026-09-22 用户定的】）：**只到日**。
     * 一屏十几条内容，时分秒那一串在每一行末尾重复，而挑内容时没人用得上它 ——
     * 具体到几点几分是**详情页**和 hover 的事。
     *
     * ⚠ 它和上面那个是**一对**：`siteTimezone.test.ts` 钉着"短的必须是长的前缀"。
     *   哪天把日期形状改成别的（比如 `DD/MM/YYYY`）而只改一处，站上就会有两种
     *   写法的日期，而页面、构建、闸门四处全绿。
     */
    dateOnlyFormat: "YYYY/MM/DD",
    // ★ 这一格和 `astro-paper.config.ts` 的 timezone 是**一对**：那里换了时区、
    //   这里没跟着换，站上就会拿着一个时区的读数贴另一个时区的名字，而页面、构建、
    //   闸门四处全绿。**不许留空** —— 空着的话 hover 和下载下来的文件里都没有时区，
    //   读者只能猜，而猜错的方向正好是盘前 / 盘后。钉子 `siteTimezone.test.ts`。
    timezoneLabel: "北京时间",
    publishedAt: "发布于",
    updatedAt: "更新于",
    // 【2026-09-20】从「分享这篇：」改成「分享到：」—— 这一排现在接在
    // 「下载 Markdown / 复制全文 / 打印」后面同一行，前面那三个已经把"这篇"说完了。
    sharePostIntro: "分享到：",
    sharePostOn: "分享到 {{platform}}",
    sharePostViaEmail: "通过邮件分享",
    tagLabel: "标签",
    backToTop: "跳到开头",
    // 【2026-09-21】正文右上角那个小按钮 + 右下角圆钮向下那一档，共用这一句。
    jumpToEnd: "跳到末尾",
    goBack: "返回",
    editPage: "编辑",
    previousPost: "上一篇",
    nextPost: "下一篇",
    // 后面跟一个链到提示词的标题（标题里自带「…提示词 v2」，不用再套书名号）。
    // 【2026-09-20】从整句「这篇是用这份提示词跑出来的：」收成一个标签。
    promptUsed: "使用的提示词：",
    // ★ 连本条一起数（同 qa.answersCount）。措辞必须和问答那一组不一样：
    //   一页上写着「这个问题有 3 个回答」而正文是研究稿，读者会以为点错了地方。
    takesCount: "这个选题有 {{count}} 份报告，点一下换着看：",
    takesNavLabel: "同一个选题的几份报告",
    switching: "正在切换报告…",
    siblingsHeading: "同一个选题，其他智能体的报告",
    // ★ 填了组没对上那一档。不许改成空字符串：选错了的症状和"只写过一份"在别处一样。
    siblingsOnlyThis: "这个选题目前只有这一份报告。",
  },
  qa: {
    questionLabel: "问题",
    answeredBy: "由 {{agent}} 回答",
    // ★ 这一档是"我没记是谁答的"。**不许改成空字符串** ——
    //   页面上留白会被读成"这是站方自己写的"，而那是 agents.ts 里的 `human` 那一档。
    unspecifiedAgent: "来源未标注",
    // ★ 只在智能体是 AI 产品、模型没标时出现（src/config/models.ts 的 modelSlot）。
    //   不许改成空字符串：留白和"人写的、没有模型这回事"那一档长得一样。
    unspecifiedModel: "模型未标注",
    modelUsed: "用的模型是 {{model}}",
    siblingsHeading: "同一个问题，其他智能体的回答",
    // ★ 有键没兄弟那一档。不许改成空字符串：键打错一个字母的症状和"只问过一次"
    //   在别处一模一样，这一句是唯一的线索。
    siblingsOnlyThis: "这个问题目前只有这一条回答。",
    // ★ 连本条一起数。「另外 2 个」要读者自己加一，而那一排上就摆着三个。
    answersCount: "这个问题有 {{count}} 个回答，点一下换着看：",
    answersNavLabel: "同一个问题的几条回答",
    // 切换回答时正文那一格先显示的话：转圈 + 这一句，新回答到了再换掉。
    switching: "正在切换回答…",
  },
  pagination: {
    prev: "上一页",
    next: "下一页",
    page: "第",
  },
  home: {
    featured: "置顶",
    /**
     * 【2026-09-21 用户要的】四个模块右上角那条链接，**屏幕上一律只印「全部」**——
     * 旁边就是「最近的研究」那个标题，"全部什么"那一半在视觉上是重复的。
     *
     * ⚠ 但**无障碍名字不能跟着砍**：一页上四条链接如果都叫「全部」，
     *   读屏用户调出链接列表拿到的是四条一模一样的「全部」，而那正是这个控件
     *   唯一的用处（挑一个跳过去）。所以下面 `allPosts` / `allQa` / `allGuides` /
     *   `allPrompts` **一个都没删**，它们现在是 `aria-label` 和 `title`。
     *   和这个站处理时间、阅读时长是同一个做法：屏幕上印短的，完整那份留给
     *   hover 和读屏。`home.test.ts` 钉着四处都带了 aria-label。
     */
    all: "全部",
    recentPosts: "最近的研究",
    allPosts: "全部研究",
    recentQa: "最近的问答",
    recentGuides: "教程",
    allGuides: "全部教程",
    recentPrompts: "提示词",
    allPrompts: "全部提示词",
    allInFeatured: "这一块的内容都在上面的置顶区里了。",
    allQa: "全部问答",
    tagline: "AI 美股研究、问答与提示词",
  },
  footer: {
    copyright: "版权所有",
    allRightsReserved: "保留所有权利",
    // ★【2026-09-21】从首页那句「本站所有内容都不构成任何投资建议。完整免责声明」
    //   收成页脚上的这四个字（用户要的）。它是全站唯一通往完整免责的入口，
    //   而且现在每一页都有 —— 别省掉，也别改成一个图标。
    disclaimer: "免责声明",
    // 下面两条【2026-09-21】从 `home` 挪过来：那一行整块进了页脚。
    subscribe: "RSS 订阅",
    joinChannel: "Telegram 频道",
  },
  pages: {
    guidesTitle: "教程",
    // 后半句点名「网站底部的联系方式」：这个站没有表单、没有服务端，
    // 唯一的入口就是页脚 Socials 里那个邮箱。改口径时连 t.prompts 那句一起改。
    guidesDesc: "如需什么教程，可以通过网站底部的联系方式发起添加请求。",
    guidesEmpty: "还没有教程。（这不是出错，是真的还没写）",

    symbolsTitle: "标的",
    symbolsDesc: "这里写过的全部标的，按代码字母序排 —— 这一页是用来找票的。",
    symbolsEmpty: "还没有针对单只标的的研究。（这不是出错，是真的还没写）",

    tagTitle: "标签",
    tagDesc: "带有这个标签的全部研究",

    tagsTitle: "标签",
    tagsDesc: "研究里用过的全部标签。",

    postsTitle: "研究",
    // ⚠ 点名的这几个产品要和 src/data/registry.json 里的显示名对得上
    //   （「厂商 产品」，见 docs/content-model.md 第 3 节）——
    //   这一句和每条内容上的智能体芯片说的是同一件事，两处用词不一样只会让人以为是两码事。
    postsDesc:
      "使用 OpenAI ChatGPT、Anthropic Claude、Google Spark 等工具生成的研究结果。",
    postsEmpty: "还没有研究报告。（这不是出错，是真的还没写）",

    promptsTitle: "提示词",
    // ★ 【2026-09-20】投稿入口**只剩这一句**：页面下方那块「投稿：把你在用的提示词
    //   发过来」（PromptSubmit.astro）同日整块删掉了。所以这句里的
    //   「通过网站底部的联系方式」不是装饰 —— 拿掉它，这个站就再没有任何一处
    //   告诉读者投稿往哪儿发，而"不收投稿"和"入口没了"在页面上长得一模一样。
    promptsDesc: "提示词分享，欢迎通过网站底部的联系方式联系投稿。",
    promptsEmpty: "还没有提示词。（这不是出错，是真的还没写）",

    qaTitle: "问答",
    qaDesc: "使用主流 AI 工具生成的问答结果。",
    qaEmpty: "还没有问答。（这不是出错，是真的还没写）",

    archivesTitle: "归档",
    archivesDesc: "按时间排的全部研究。",

    searchTitle: "搜索",
    searchDesc: "搜代码、公司名、正文里的任何一句话 …",
  },
  a11y: {
    skipToContent: "跳到正文",
    openMenu: "打开菜单",
    closeMenu: "关闭菜单",
    toggleTheme: "切换深浅色",
    // 这个站的主力检索动作是敲代码，占位符要直说。
    searchPlaceholder: "搜代码或关键词，如 TSLA、做空、财报…",
    noResults: "没有找到匹配的内容",
    goToPreviousPage: "去上一页",
    goToNextPage: "去下一页",
  },
  // 方括号里的是 Pagefind 的占位符，逐字保留（见 types.ts 里那段）。
  searchUi: {
    clearSearch: "清空",
    loadMore: "加载更多",
    searchLabel: "搜索这个站",
    filtersLabel: "筛选",
    zeroResults: "没有找到匹配「[SEARCH_TERM]」的内容",
    manyResults: "[COUNT] 条结果匹配「[SEARCH_TERM]」",
    oneResult: "1 条结果匹配「[SEARCH_TERM]」",
    altSearch:
      "没有找到匹配「[SEARCH_TERM]」的内容。下面是「[DIFFERENT_TERM]」的结果",
    searchSuggestion: "没有找到匹配「[SEARCH_TERM]」的内容。试试这些搜索词：",
    searching: "正在搜索「[SEARCH_TERM]」…",
    metaAgent: "智能体",
    metaModel: "模型",
  },
  collectionSearch: {
    placeholder: "在{{kind}}里搜…",
    label: "搜索{{kind}}",
    searchAll: "搜全站",
    count: "{{count}} 条",
    empty: "{{kind}}里没有匹配「{{term}}」的内容",
    // ★ 和上面那句必须不一样：这是"搜不了"，不是"没搜到"。
    unavailable: "搜索索引还没生成 —— 它是构建产物，`pnpm build` 跑一次才有。",
  },
  provenance: {
    ai: "这一篇是 AI 生成的（模型会编数字）。",
    // ★ 不许写成「站长自己写的」：提示词收读者投稿，那样是替投稿人认领。
    //   具体谁写的交给条目自己的来源标注（研究稿 / 问答看 agent，提示词看 origin）。
    human: "这一份是人写的，不是 AI 生成的。",
    // ★ 第三档：「我不知道」。不许折进上面两档里的任何一个。
    unknown:
      "这一份没有标注是谁写的 —— 站上既有 AI 生成的内容，也有人写的内容，" +
      "这一份属于哪一种还没人确认过。",
  },
  guides: {
    staleNotice:
      "券商和银行的界面、费率、流程改得很勤。这篇写于上面标的时间，" +
      "动手前请对照官方页面再核一遍。",
  },
  prompts: {
    // {{author}} = 站长的名字（config.site.author，现在是 牢玩家）。
    // 【2026-09-20】「作者」改成「分享者」：提示词本身也是 AI 写的（见 collections.ts
    // 里 prompts 的 provenance），挂在这一格上的人是把它发出来的那个，不是写它的那个。
    originSite: "分享者：{{author}}",
    // ★ 署名必须和「投稿」两个字一起出现，理由见 types.ts 那条注释。
    contributedBy: "分享者：{{name}}（网友投稿）",
    // ★ 不许改成空字符串：页面上留白会被读成"这是站长自己发的"。
    originUnspecified: "分享者未标注",
    // ⚠ 下面这几句都走 textContent（页面上是 `{t.prompts.xxx}`），
    //   **不许写 markdown 强调** —— `**…**` 会原样印出四个星号，
    //   而且只有打开页面才看得见。要强调就靠措辞和断句。
    verbatimNotice:
      "以下是提示词原文，照抄就能用。它约束的是模型的输出格式和证据要求，" +
      "不保证模型说得对 —— 跑出来的每个数字仍然要自己回原始来源核对。",
    // 【2026-09-21 用户要的】`contributedNotice` 删了：
    // 「这一份是网友投稿的。我只做了排版整理，没有逐条验证过它跑出来的结果。」
    // 页面和 .md 导出口两处同日一起拿掉。出处仍然由标题底下那一格说
    // （`contributedBy`：「分享者：某某（网友投稿）」），"别全信跑出来的数字"
    // 由上面 `verbatimNotice` 那句说，而且它对每一份都成立。
    usedByHeading: "用这份提示词跑出来的研究",
    // 【2026-09-20】`submitTitle` / `submitSteps` / `submitRedline` / `submitCta` /
    // `submitSubject` / `submitUnavailable` 六条随 PromptSubmit.astro 一起删了
    // （用户要求把那一整块投稿说明拿掉）。投稿入口改成 t.pages.promptsDesc 里的一句话。
    //
    // ⚠ 跟着一起没了的是 submitRedline 那句「发之前自己过一眼：提示词里不要带你自己的
    //   持仓、成本、券商账户」—— docs/gate.md 第 7.6 节把它算作投稿这条链路上
    //   **闸门之前的那一道**（闸门只认得几种写法）。现在站上不再有这句提醒，
    //   那一道只剩人工：投稿进后台之前我自己看那一遍。
  },
  download: {
    intro: "把这篇带走：",
    // 【2026-09-21 用户要的】「下载 Markdown」→「下载 MD」。
    // ⚠ 只是**按钮上的字**短了；`markdownHint` 那句仍然说清楚它是「原始 .md 文件」，
    //   文件名也仍然是 `.md`（`downloadName`）。缩写省的是横向空间，不是信息。
    markdown: "下载 MD",
    markdownHint:
      "原始 .md 文件，可以存进笔记本，也可以直接喂给别的模型继续问。",
    // 【2026-09-21 用户要的】「打印 / 存成 PDF」→「另存 PDF」。
    // ★ **仍然不是「下载 PDF」**：站上没有 .pdf 这个文件，这个按钮打开的是浏览器的
    //   打印对话框（见 types.ts 那条注释）。「另存」正是那个对话框里目标那一栏的说法，
    //   所以它描述的还是同一件事；「下载」会让人以为服务器上躺着一个文件。
    print: "另存 PDF",
    printHint:
      "会打开浏览器的打印对话框，目标选「另存为 PDF」。图片会一起带进去。",
    copy: "复制全文",
    copyHint:
      "和左边那个 .md 一模一样的内容，直接进剪贴板 —— 粘到你自己的 AI 或笔记里接着问。",
    copyWorking: "正在取全文…",
    // ★ `{{chars}}` 不许拿掉，理由见 types.ts 那条注释。
    copied: "已复制 {{chars}} 字",
    copyFailedFetch: "没取到全文",
    // ★ 这两段是用 textContent 塞进 DOM 的，**不许写 markdown 强调**
    //   （`**这样**` 会原样显示成星号）。要强调就靠句子本身站住。
    //   export.test.ts 的 D 组钉着这一条。
    copyFailedFetchHint:
      "浏览器没能取到这篇的 .md 文件（多半是网断了）。" +
      "剪贴板一个字节都没有被动过 —— 里面还是你上次复制的东西，别直接去粘。" +
      "左边的「下载 Markdown」是同一份文件，可以直接下。",
    copyFailedClipboard: "没复制成功",
    copyFailedClipboardHint:
      "全文取到了，但浏览器没让这个页面写入剪贴板（用 http 打开时通常如此）。" +
      "下面这一整篇已经替你选好了，按 Ctrl/⌘ + C 即可：",
    copyFieldLabel: "本文全文",
    // 【2026-09-23 用户要的】这里原来还有三条：`exportNotice`（导出件顶上那段引用块：
    // 「这是 <地址> 的副本」+ 免责三句）、`exportImagesDropped`、`exportImagePlaceholder`
    // （本地图片被换成的那句话）。**整组删了** —— 用户原话「下载或者复制的时候会夹带
    // 平台私活，禁止，是什么就下载什么，保持原文」。导出件现在就是正文原文
    // （src/utils/exportMarkdown.ts 顶部）。免责在站上还有两处：/about 那一整节、
    // 每一页页脚那条「免责声明」。
  },
  share: {
    // 【2026-09-21 用户要的】从「复制本文链接」收成「复制链接」——
    // 这一排四个按钮（复制链接 · 下载 MD · 复制全文 · 另存 PDF）长度要能并排看齐。
    copyLink: "复制链接",
    // ★【2026-09-21 用户要的】从「已复制」改成「已复制该文链接」。
    //   元信息行那个转发按钮只有图标，点完之后**这一句是唯一的反馈** ——
    //   只说「已复制」的话，旁边还有一个「复制全文」按钮，读者分不清刚才复制走的
    //   是地址还是一整篇正文（两者都会进同一个剪贴板，粘出来才知道）。
    copied: "已复制该文链接",
    // ★ 「没复制成功」而不是「复制失败」：后者读起来像站出错了，实际是浏览器
    //   没放行（多半是用 http 打开的）。说清楚谁没成，读者才知道下一步做什么。
    failed: "没复制成功",
    failedHint:
      "浏览器没让这个页面写入剪贴板（用 http 打开时通常如此）。下面这行就是本文地址，已经替你选好了，按 Ctrl/⌘ + C 即可：",
    fieldLabel: "本文地址",
  },
  related: {
    bySymbolHeading: "关于 {{symbol}} 的其他研究和问答",
    // ★ 有 symbol 但站上没别的。不许改成空字符串，理由见 types.ts。
    bySymbolOnlyThis: "这只票目前只有这一篇。",
    // 勾了好几只票、而它们加起来仍然只有这一篇。和上面一句是两档，见 types.ts。
    bySymbolOnlyThisMulti: "这几只票目前只有这一篇。",
    bySymbolAll: "{{symbol}} 的全部内容",
    lookupIntro: "去原始来源核对：",
    lookupTitle: "在 {{source}} 上查 {{symbol}}",
  },
  toc: {
    title: "目录",
    count: "{{count}} 节",
    // 【2026-09-21 用户要的】侧栏目录的折叠钮。两句都说的是**按下去会发生什么**
    //（不是当前状态）—— 当前状态由 aria-expanded 说，两处各说一半才凑得齐。
    collapse: "收起目录",
    expand: "展开目录",
  },
  reading: {
    /**
     * 屏幕上那一格：**一个眼睛图标 + 这个串**（`src/components/ReadingTime.astro`）。
     *
     * 【2026-09-21 用户要的】「阅读预计」四个字换成图标，所以这个串只剩数字和单位。
     * ★ **「预计」没有被删掉，它挪到了下面那个串**（hover 和读屏念的就是那一句）——
     *   这个数是 readingTime.ts 按粗读速度估的，不是量出来的，写成事实读者分不出来。
     *   和这个站处理时间是同一个做法：屏幕上印裸的，完整那版收进 `title`。
     * ⚠ 两个串是**一对**：这个只管视觉，那个管无障碍名字。
     *   `readingTime.test.ts` 分别钉着它们该有什么。
     */
    /** ★【2026-09-22 用户要的】屏幕上那一格的单位从「分钟」换成 **min**：
     *  它紧挨着一个眼睛图标、和「10,221 字」并排，两个中文单位一长一短，
     *  而这一格本来就只是个数量级。
     *  ⚠ 下面那个 title 串**没跟着换** —— 它是读屏念出来的整句，
     *  「阅读预计 14 min」念起来是中英混读；那一句要的是说得清楚，不是短。 */
    minutes: "{{minutes}} min",
    /** hover / 读屏念的整句。**「预计」两个字在这儿是承重的**，见上面。 */
    minutesTitle: "阅读预计 {{minutes}} 分钟",
    chars: "{{chars}} 字",
  },

  code: {
    copy: "复制",
    copied: "已复制",
  },
  lightbox: {
    zoom: "放大图片",
    zoomAlt: "放大图片：{{alt}}",
    preview: "图片预览",
    previewAlt: "图片预览：{{alt}}",
    close: "关闭图片预览",
  },
  feed: {
    subscribeSymbol: "订阅 {{symbol}} 的 RSS",
    symbolDesc: "{{symbol}} 的全部研究与问答，新的在前。",
  },
  notFound: {
    title: "404",
    message: "这个地址上没有东西",
    goHome: "回首页",
  },
} satisfies UIStrings;
