export interface UIStrings {
  nav: {
    home: string;
    posts: string;
    /** 问答模块。导航里排在 posts 之后 —— 两条都是内容，后面才是组织方式（标的 / 标签）。 */
    qa: string;
    symbols: string;
    guides: string;
    /** 提示词模块。和 posts / qa / guides 一样属于"内容"那一段，排在 guides 之后。 */
    prompts: string;
    tags: string;
    about: string;
    archives: string;
    search: string;
  };
  post: {
    /**
     * dayjs 的格式串，**不带时区那几个字** —— 页面上印的就是它。
     * 方括号里的字按字面输出（dayjs 的转义语法）。
     */
    dateFormat: string;
    /**
     * 列表卡片上那一格的短写法（只到日）。**必须是 `dateFormat` 的前缀** ——
     * 两个串各写各的那天，站上就会有两种写法的日期，而四处全绿。
     * 钉子在 `siteTimezone.test.ts`。
     */
    dateOnlyFormat: string;
    /**
     * 时区那几个字（「北京时间」）。**不进页面正文**，只进 `<time>` 的 title
     * （hover 才看得见）和导出的 .md。拼法只有 `format.ts` 的
     * `dateFormatWithZone()` 一处，别在别处再拼一遍。
     */
    timezoneLabel: string;
    publishedAt: string;
    updatedAt: string;
    sharePostIntro: string;
    sharePostOn: string;
    sharePostViaEmail: string;
    tagLabel: string;
    backToTop: string;
    /**
     * 「跳到末尾」—— 正文右上角那个小按钮，和右下角那个浮动圆钮**向下那一档**
     * 共用这一句（两处是同一个动作：滚到页面底部）。
     *
     * ★ 圆钮上一个字都不显示，这句话是它**向下那一档的无障碍名**（aria-label）——
     *   不跟着方向换的话，屏幕阅读器会对着一个往下滚的按钮念「回到顶部」。
     */
    jumpToEnd: string;
    goBack: string;
    editPage: string;
    previousPost: string;
    nextPost: string;
    /**
     * 研究稿正文前面那个标签「提示词：」，后面跟一个链到提示词的标题。
     * 只有 frontmatter 里填了 `prompt` 才显示；没填是"不是用站上的提示词跑的"（完成态），
     * 什么都不显示。引用了但解析不到是**构建失败**（src/utils/resolvePromptRef.ts），
     * 走不到这里。
     */
    promptUsed: string;
    /**
     * 【2026-09-20】研究稿也能「同一个选题几个智能体各写一份」了（和问答同一套判据，
     * 见 src/utils/related.ts 的 GROUPED_COLLECTIONS）。下面五句是问答那五句的
     * 研究稿版 —— **措辞必须不一样**：问答说「回答」，研究稿说「研究」。
     * ⚠ 别为了"省事"让两个集合共用一句：一页上写着「这个问题有 3 个回答」而正文是
     *   研究稿，读者会以为点错了地方。
     */
    /** 正文上方那排切换的标题，带 `{{count}}`。★ 连本条一起数。 */
    takesCount: string;
    /** 那一排的无障碍名字（`aria-label`）。屏幕上不显示。 */
    takesNavLabel: string;
    /** 切换研究时正文那一格先换成的话（转圈旁边那句）。 */
    switching: string;
    /** 页脚那块「同一个选题，其他智能体的研究」的标题。 */
    siblingsHeading: string;
    /**
     * ★ 填了选题组但**没有别的研究**时说的那句。不许留空、不许整块消失 ——
     *   和 qa 的 siblingsOnlyThis 同一条纪律。
     */
    siblingsOnlyThis: string;
  };
  qa: {
    /** 详情页上标住「这一段是问题」的那行小字。标题本身就是问题，这行是它的名牌。
     *  ⚠【2026-09-21】它的另一半 `answerLabel`（正文上面那行「回答」）**删了** ——
     *  用户原话「多此一举」：它上面就是那排「这个问题有 N 个回答」，下面就是回答本身。
     *  别顺手把它加回来当"对称"，两行小字对称不是理由。 */
    questionLabel: string;
    /** `{{agent}}` 占位符，用 tplStr 填。做成整句而不是"由"+名字+"回答"，
     *  是因为英文的语序和中文不一样（Answered by X），拼字符串会拼出病句。 */
    answeredBy: string;
    /**
     * ★ 智能体是哨兵值（未标注）时显示这一句，**不许显示成空白**。
     *   "我没记是谁答的"和"这是我自己写的"是两件不同的事 ——
     *   后者在 agents.ts 里有 `human` 这一档专门承担。
     *   合并成空白等于替模型撒谎，docs/engineering-notes.md 第二节点名禁止。
     */
    unspecifiedAgent: string;
    /**
     * ★ 模型那一格是哨兵值（未标注）时显示这一句 —— 但**只在智能体是 AI 产品时**：
     *   人写的（`human`）没有模型这回事，那一档什么都不显示；智能体和模型都没标时
     *   旁边那句「来源未标注」已经把话说完了。三档判据在 src/config/models.ts 的 modelSlot。
     */
    unspecifiedModel: string;
    /**
     * 「用的模型是 {{model}}」—— 问答详情页「由 X 回答」那句话后面缀的半句。
     * 做成整句占位而不是拼字符串，理由同 answeredBy。
     */
    modelUsed: string;
    /*
     * 【2026-09-23】这里原来还有一条 `modelWordsNotice`（「以下是模型的原话，没有改写…」）。
     * 页面上 2026-09-20 就不挂了（挪进「关于」页），最后一个家是问答的 .md 导出件 ——
     * 那一份也拿掉了（用户要的：导出件就是正文原文，站方一个字都不加）。
     * 「关于」页那一句（about.md 正文里的）是现在唯一的落点，detailParity.test.ts 钉着。
     */
    /**
     * 「同一个问题，其他智能体的回答」—— 问答详情页上那一块的标题。
     * 只有 frontmatter 里填了 `questionKey` 才渲染（src/config/questionKey.ts）。
     */
    siblingsHeading: string;
    /**
     * ★ 填了 `questionKey` 但**没有别的回答**时说的那句。**不许留空、不许整块消失**：
     *   "只问过一次"（没填键）和"填了键但没对上"（多半是键打错了一个字母）
     *   在别处长得一模一样，这一句是唯一的线索（docs/engineering-notes.md 第二节）。
     */
    siblingsOnlyThis: string;
    /**
     * 【2026-09-20】正文**上方**那一排回答切换（`QaAnswerSwitch.astro`）的标题，
     * 带 `{count}`。★ 数的是**连本条在内**的总数 —— 只说"另外 2 个"的话，
     * 读者得自己加一才知道一共几个，而这一排上明明摆着三个。
     */
    answersCount: string;
    /** 那一排的无障碍名字（`aria-label`）。屏幕上不显示。 */
    answersNavLabel: string;
    /**
     * 切换回答时正文那一格先换成的话（转圈旁边那句）。新回答到了再淡进来 ——
     * 没有这一步，换页就是整页一闪（用户原话「很生硬并且会闪屏」）。
     */
    switching: string;
  };
  pagination: {
    prev: string;
    next: string;
    page: string;
  };
  home: {
    // （【2026-09-20】`socialLinks`「找到我」删了：首页那组图标和紧挨着的页脚
    //   `<Socials />` 是同一组，两行之内画两遍。页脚那份没有文字标签，所以没有键要留。）
    // （【2026-09-21】`subscribe` / `joinChannel` 挪去 `footer` 了：那一行整块进了页脚，
    //   键留在 `home` 下就成了"名字说在首页、实际每页都画"的假话。）
    featured: string;
    /**
     * 四个模块右上角那条链接**屏幕上印的字**（【2026-09-21 用户要的】，一律「全部」）。
     * ⚠ 下面那四个 `all*` 没删，也不许删：它们现在是那四条链接的 `aria-label` /
     *   `title`。四条链接在读屏的链接列表里都叫「全部」的话，这个控件就废了。
     */
    all: string;
    recentPosts: string;
    allPosts: string;
    /** 首页第二块的标题与"看全部"入口。研究和问答各有一块，标题不共用 ——
     *  首页上两块内容长得一样、只有标题不同的话，读者分不清自己在看哪一种。 */
    recentQa: string;
    recentGuides: string;
    allGuides: string;
    recentPrompts: string;
    allPrompts: string;
    /** ★ 「这个集合一条都没有」和「有，但都被置顶区收走了」是**两档**。
     *  压成一句"还没写"的话，一个内容全被置顶的站会在首页对读者撒谎。 */
    allInFeatured: string;
    allQa: string;
    /** 首页 <title> 里站名后面那半句：「牢玩家 · AI 美股研究、问答与提示词」。
     *  【2026-09-20 加】只进 <title> / og:title，页面上不显示。它存在的理由是搜索引擎：
     *  首页原来的标题只有站名两个字，人敲「牢玩家 AI」「AI 美股研究」时没有一个词能对上。
     *  ⚠ 措辞说的是这个站**有什么**（研究、问答、提示词），不是**谁写的** ——
     *  不许写成「全站 AI 生成」那种全称断言（docs/engineering-notes.md 第二节 provenance 那条）。 */
    tagline: string;
  };
  /**
   * 页脚（`src/components/Footer.astro`）。【2026-09-21】它现在收两组东西：
   * **版权那一组**（版权 · 保留所有权利 · 免责声明）和
   * **联系方式那一组**（社交图标 · RSS 订阅 · Telegram 频道）。
   * 后三条原来在首页 `#outro` 那一行上，键也在 `home` 下 —— 一起搬过来了。
   */
  footer: {
    copyright: string;
    allRightsReserved: string;
    /**
     * 版权那一组末尾那条链接的文字，指向 /about 的「免责声明」那一节。
     *
     * ★ 【2026-09-21】从「完整免责声明」收成「免责声明」（用户要的），同时
     *   那句「本站所有内容都不构成任何投资建议」**删掉了** —— 于是页脚上
     *   免责这件事只剩这一条链接。
     * ⚠ 【2026-09-21 当天晚些时候】原来这里写着"撑住它的是另外两处"，
     *   其中①是「每一篇研究 / 问答 / 教程页脚那段完整免责」。**那一段四页一起删了**
     *   （用户要的），所以现在只剩**两处**：/about 那一整节，和这条链接。
     *   这条注释改过来是因为它原来指向一个已经不存在的落点 ——
     *   一句"还有别处兜着"的假话，正是下一个人放心删掉这条链接的理由。
     *
     * ⚠ **不许改成一个图标**，也不许省掉：它是全站唯一一条通往完整免责的入口，
     *   而且每一页都有（2026-09-21 之前只有首页有）。
     *   【2026-09-23】`.md` 导出件那一侧原来另有一份（`t.download.exportNotice`），
     *   随导出件改成「正文原文，站方一个字都不加」一起删了（用户要的）——
     *   所以全站的免责现在**只有**上面说的两处，这条链接是其中之一。
     */
    disclaimer: string;
    /** 页脚那个 RSS 入口的文字标签。
     *  ★ **不许改回"只有一个图标"** —— 一个孤零零的 RSS 图标，
     *  认得它的人本来就会去地址栏拼 /rss.xml，不认得的人永远不会点。
     *  带字的订阅入口是内容站的通行做法。 */
    subscribe: string;
    /** 页脚那条 Telegram 入口的文字（【2026-09-20】用户要的：就叫「Telegram 频道」，
     *  不带"欢迎关注"）。
     *
     *  ★ 文案里要**点名 Telegram**。【2026-09-21 更要紧了】同一行的 `<Socials />`
     *  原来还画着一个 Telegram logo，用户要求去掉那份重复（Footer.astro 的
     *  `NAMED_IN_FOOTER`）—— 所以现在**整个站里指出这个入口通向哪儿的只剩这一句**。
     *  改文案时别把 Telegram 去掉，也别把它缩回一个图标。
     *
     *  ★ 用「频道」，**不是「群 / 加群交流」**（2026-09-18 核实：
     *  `t.me/your_channel` 的预览页显示 `1 subscriber` + `Preview channel`，
     *  Telegram 对频道用 subscriber、对群才用 member）。频道是单向广播，
     *  读者进去**发不了言** —— 写成「加群交流」是在承诺一件做不到的事，
     *  而且这种失实在站上、构建里、闸门里都是零症状，只有真点进去的人撞得到。
     *  哪天真换成群（或者给频道开了讨论组），记得这里、`astro-paper.config.ts`
     *  的 `linkTitle`、以及两份语言文件一起改。 */
    joinChannel: string;
  };
  pages: {
    guidesTitle: string;
    guidesDesc: string;
    guidesEmpty: string;

    symbolsTitle: string;
    symbolsDesc: string;
    /** 一只标的都还没有时说的那句话。**不许留空 <ul>** ——
     *  "还没写"和"这页坏了"必须长得不一样。 */
    symbolsEmpty: string;

    tagTitle: string;
    tagDesc: string;

    tagsTitle: string;
    tagsDesc: string;

    postsTitle: string;
    postsDesc: string;
    /** 一篇研究稿都还没有时说的那句话。和 qaEmpty 对称 ——
     *  首页两个模块的空状态不许一个走 i18n、一个写死中文。 */
    postsEmpty: string;

    promptsTitle: string;
    promptsDesc: string;
    /** 一份提示词都还没有时说的那句话。和 qaEmpty / guidesEmpty 同一条纪律。 */
    promptsEmpty: string;

    qaTitle: string;
    qaDesc: string;
    /** 一条问答都还没有时说的那句话。和 symbolsEmpty 同一条纪律：
     *  **不许留空列表** —— "还没写"和"这页坏了"必须长得不一样。 */
    qaEmpty: string;

    archivesTitle: string;
    archivesDesc: string;

    searchTitle: string;
    searchDesc: string;
  };
  a11y: {
    skipToContent: string;
    openMenu: string;
    closeMenu: string;
    toggleTheme: string;
    searchPlaceholder: string;
    noResults: string;
    goToPreviousPage: string;
    goToNextPage: string;
  };
  /**
   * `/search` 那一页的界面文字。
   *
   * ★ 这一组**是给 PagefindUI 的 `translations` 用的**，不是我们自己渲染的。
   *   不传的话它回落到内置英文 —— 一个中文站的搜索页上写着
   *   「1 result for 研究」「Clear」（2026-09-18 在构建产物里核实过，
   *   而且 dev 里那一页永远是 "DEV mode Warning"，所以**只有构建后才看得见**）。
   *
   * ⚠ 方括号里的是 Pagefind 自己的占位符，**逐字保留**：
   *   `[SEARCH_TERM]` / `[COUNT]` / `[DIFFERENT_TERM]`。
   *   写错一个字母不报错，只是那一句里少一块内容。
   *   完整键名列表见 Pagefind 文档的 "Translations"。
   */
  searchUi: {
    clearSearch: string;
    loadMore: string;
    searchLabel: string;
    filtersLabel: string;
    zeroResults: string;
    manyResults: string;
    oneResult: string;
    altSearch: string;
    searchSuggestion: string;
    searching: string;
    /** 搜索结果里每条底下的两个小标签的**键名**：「智能体: Google Spark」「模型: Gemini-3-Pro」。
     *  值由研究稿 / 问答详情页的 data-pagefind-meta 写进索引（src/utils/searchMeta.ts），
     *  键名跟着写进去 —— 改了要重新 `pnpm build` 才生效。 */
    metaAgent: string;
    metaModel: string;
  };
  /** 各集合列表页顶部那个「只搜本集合」的框（CollectionSearch.astro）。 */
  collectionSearch: {
    /** `{{kind}}` = 集合名（研究 / 问答 / 教程）。 */
    placeholder: string;
    /** 屏幕阅读器用的标签，`{{kind}}` 同上。 */
    label: string;
    /** 去 `/search` 跨集合搜的那条链接。 */
    searchAll: string;
    /** `{{count}}` = 命中数。 */
    count: string;
    /** 搜了但没命中。`{{kind}}` / `{{term}}`。
     *  ★ 必须和 `unavailable` 是两句不同的话 —— 见那一条。 */
    empty: string;
    /** ★ 索引根本不存在（`pnpm dev` 里，或者忘了 `pnpm build`）。
     *  **不许和 `empty` 合并**：「没搜到」是结果，「搜不了」是故障，
     *  在界面上长一样的话，一个坏掉的搜索框会被当成"这个站没这内容"。 */
    unavailable: string;
  };
  /**
   * 「这一份东西是谁写的」**三档**。判据在 `src/config/provenance.ts`，
   * 这里只放显示文案。
   *
   * ⚠【2026-09-23】**这一组今天没有任何地方在印。** 页面页脚那一句 2026-09-21 删了，
   *   最后一个家是导出的 .md 文件头，2026-09-23 也拿掉了（用户要的：导出件就是
   *   正文原文）。留着是等站长决定这套判据删掉还是另找落点 —— 别把它当成
   *   "还有地方兜着来路"的证据。
   *
   * ★ 【2026-09-20】这一组是用来替掉那句全称断言「站内所有内容都是 AI 生成」的。
   *   那句话在只有研究稿和问答的时候是真的，加了教程和提示词（人写的、还收投稿）
   *   之后在全站范围内就是假的 —— 而它当时躺在六个地方，包括 /about 那份
   *   「完整免责声明」和每一份下载走的 .md。
   *
   * ★ 三句**必须两两不同、一句都不许空**：
   *   `ai` 和 `human` 压成一句 = 替内容认错作者；
   *   `unknown` 折进另外两档 = 把"没人确认过"说成一个笃定的结论。
   *   `export.test.ts` 的 E 组逐 locale 钉着这三条。
   */
  provenance: {
    /** 模型写的。 */
    ai: string;
    /** 人写的（**完成态**）。⚠ **不许写成「站长自己写的」** —— 提示词收读者投稿，
     *  那样会替投稿人认领。具体谁写的交给条目自己的来源标注（agent / origin）。 */
    human: string;
    /** **没人确认过**（"我不知道"）。【2026-09-20】教程改口径之后**没有集合常量落在这一档**了，
     *  但 `agent` 还是哨兵、或者登记表里查不到那个 id 的研究稿 / 问答仍然算到它。
     *  不许留空，也不许省略这一行 —— 删了它那些条目会掉进 `ai`，那是替内容认领出身。 */
    unknown: string;
  };
  guides: {
    /** 教程详情页底部那句。**不写成「N 天前核对」** —— 站是静态的，
     *  构建期算出来的天数不重新构建就不会更新，那种说法会随时间静默变成假话。 */
    staleNotice: string;
  };
  /**
   * 提示词模块。这个集合**收投稿**，所以下面前四条全是"谁写的"那件事的文案。
   *
   * ★ 三档来源在界面上必须长得不一样（docs/engineering-notes.md 第二节）：
   *   站长自己在用的（完成态）/ 读者投稿 + 署名（完成态）/ 还没标（待补）。
   */
  prompts: {
    /**
     * 这份是站长自己发的：「分享者：{{author}}」，`{{author}}` = 站长的名字
     * （config.site.author）。【2026-09-20】原来是「站长自己在用的」一张芯片挂在标题上面，
     * 用户要的：这一格和时间排一行，写成「分享者：牢玩家」。
     *
     * ★ 用「分享者」而不是「作者」（【2026-09-20 改的】）：提示词本身也是 AI 写的
     *   （`src/config/collections.ts` 里 prompts 的 `provenance` 是 `ai`），
     *   挂在这一格上的人是**把它发出来的那个**。写「作者」等于替他认领一份不是他写的东西。
     */
    originSite: string;
    /**
     * 网友投稿：「分享者：{{name}}（网友投稿）」，`{{name}}` = 署名。
     *
     * ★ 署名**必须和"投稿"这两个字一起出现**。只印一个名字，读者分不清
     *   那是投稿人还是站长的另一个马甲；只印"投稿"而不带名字，就是抹掉出处 ——
     *   而 schema 那边已经保证投稿一定有署名（要匿名就显式写「匿名」）。
     */
    contributedBy: string;
    // 【2026-09-23】`originContributed`（导出的 .md 里那一行 `origin:` 用的说法）
    // 随导出件的 frontmatter 一起删了。
    /** 哨兵档：还没标是谁发的。**不许留空** —— 留空会被读成"站长自己发的"。 */
    originUnspecified: string;
    /**
     * 详情页上挂在正文上方的那句：这是提示词原文。
     *
     * ★ 它约束的是**模型的输出格式和证据要求**，不保证模型说得对。
     *   这个区别在财经站上是要紧的：读者很容易把"一份严格的提示词"
     *   读成"跑出来的结论可信"。
     */
    verbatimNotice: string;
    /**
     * 【2026-09-21 用户要的】这里原来还有一条 `contributedNotice`，只对投稿显示：
     * 「这一份是网友投稿的。我只做了排版整理，没有逐条验证过它跑出来的结果。」
     * **删了** —— 页面（`prompts/[...slug]/index.astro`）和 `.md` 导出口两处一起。
     *
     * 删之前确认过它承担的两件事都还有落点：
     *   ① 「这一份是别人投来的」→ `contributedBy`（「分享者：某某（网友投稿）」），
     *      站上和导出件的 frontmatter 里都在；
     *   ② 「跑出来的结果别全信」→ 上面那条 `verbatimNotice` 就有，
     *      而且它对**每一份**都成立，不只是投稿。
     * 真正没了的是"站长本人没逐条验证过这一份"这层自述。
     */
    /**
     * 提示词详情页上「用这份提示词跑出来的研究」那一块的标题。
     * 一篇都没有时整块不渲染：交易规则手册本来就不出研究稿，"还没有"对读者没有信息量。
     */
    usedByHeading: string;
    /**
     * 【2026-09-20】这里原来还有六条 `submit*`（投稿那一块的标题 / 三步流程 /
     * 一条红线 / mailto 按钮 / 邮件主题 / 「投稿入口暂时不可用」），
     * 随 `src/components/PromptSubmit.astro` 一起删了 —— 用户要求把那一整块拿掉。
     *
     * ⚠ 最后那条 `submitUnavailable` 是 docs/engineering-notes.md 第二节在这一块上的落点
     *   （「渠道没配出来」不许表现成「这个站不收投稿」）。它消失**不是因为那条纪律
     *   失效了**，是因为它守的那一块不存在了：现在投稿入口是
     *   `t.pages.promptsDesc` 里的一句话，不读 socials、没有"配没配出来"这一档。
     *   哪天把带 mailto 的投稿块加回来，这六条要一起加回来。
     */
  };
  /**
   * 详情页上的「把这篇带走」那一块（下载 MD / 复制全文 / 另存 PDF）。
   *
   * ★【2026-09-23】这里原来还管着**导出的 .md 文件里的文字**（顶上那段引用块、
   *   图片被摘掉时留的话）。那些字整组删了：导出件现在就是正文原文，
   *   站方一个字都不加（`src/utils/exportMarkdown.ts` 顶部）。
   *   ⚠ 别把它们加回来 —— 用户原话「下载或者复制的时候会夹带平台私活，禁止」。
   */
  download: {
    /** 那一块的无障碍名（aria-label）。【2026-09-20】屏幕上不再显示 —— 三个按钮排一行，
     *  不需要引导语；但屏幕阅读器仍然靠它知道这一块是什么。 */
    intro: string;
    /** .md 下载按钮的文字。 */
    markdown: string;
    /** .md 按钮的悬停提示：说清楚下载到的是什么。【2026-09-20】从按钮下面那行小字
     *  挪进 title，另外两条 hint 同理。 */
    markdownHint: string;
    /**
     * 打印按钮的文字。
     *
     * ★ **不许写成「下载 PDF」。** 站上根本没有 .pdf 这个文件 —— 点下去打开的是
     *   浏览器的打印对话框，PDF 是读者自己在那里另存的。写「下载 PDF」是三重失实：
     *   没有下载、没有 PDF、按钮行为和文案对不上。
     */
    print: string;
    /** 打印按钮的悬停提示：说清楚点下去会发生什么。 */
    printHint: string;
    /**
     * 「复制全文」按钮平时的字。
     *
     * 它复制的是**上面那个 .md 的原样字节**（点下去 fetch 同一个地址），
     * 不是页面里另存的一份副本。理由写在 `DownloadLinks.astro` 顶部 ——
     * 一句话：那样复制出去的就是发布闸扫过的那些字节，不多一个。
     */
    copy: string;
    /** 复制按钮的悬停提示。 */
    copyHint: string;
    /** 取文件的那一瞬。网络慢的时候按钮不能看起来像没反应。 */
    copyWorking: string;
    /**
     * 复制成功，两秒多以后自己退回 `copy`。**`{{chars}}` = 字数，必须留着。**
     *
     * ★ 光写「已复制」说不清复制到的是一整篇还是一个空文件 / 一张 404 网页。
     *   "空的冒充完整的"是这个项目第二节点名的那类错误，报个数就挡住了。
     *   `export.test.ts` 的 D 组钉着这个占位符。
     */
    copied: string;
    /**
     * 失败档之一：**文件没取到**，剪贴板一个字节都没动过。
     *
     * ★ 和下面那档**不许共用一句**。两者读者要做的事完全不同：
     *   这一档剪贴板里还是他上次复制的东西（最容易被误当成"复制上了"的情况），
     *   下一档全文已经在手上、只差一个 Ctrl+C。
     */
    copyFailedFetch: string;
    /** 上一档下面那段说明：说清楚剪贴板没被动过，并把人指回 .md 下载链接。 */
    copyFailedFetchHint: string;
    /** 失败档之二：文件取到了，但浏览器不让写剪贴板（非安全上下文里就是这样）。 */
    copyFailedClipboard: string;
    /** 上一档下面那段说明：引出下面那个已经替读者选好的文本框。 */
    copyFailedClipboardHint: string;
    /** 兜底文本框的无障碍标签。 */
    copyFieldLabel: string;
  };
  /**
   * 详情页上那个「复制链接」按钮（`src/components/CopyLinkButton.astro`）。
   *
   * ★ 三档状态各有各的文案，**一档都不许省、也不许两档共用一句**：
   *   还没点 / 复制成功 / 复制失败。第三档不是假想的 —— 非安全上下文里
   *   `navigator.clipboard` 根本不存在，而那种失败在界面上没有任何痕迹，
   *   读者会以为复制上了。理由完整写在那个组件顶部。
   */
  share: {
    /** 按钮平时的字。 */
    copyLink: string;
    /** 复制成功，两秒后自己退回 `copyLink`。 */
    copied: string;
    /**
     * 复制失败。
     *
     * ★ 不许写成「复制链接」之外看不出区别的样子，也不许沉默 ——
     *   这一档出现时，读者手上是**没有**那个地址的。
     */
    failed: string;
    /** 失败时露出来的那块里的引导语：说清楚为什么要他自己动手。 */
    failedHint: string;
    /** 失败时那个只读输入框的无障碍名字（框里装的是本文地址）。 */
    fieldLabel: string;
  };
  /**
   * 详情页上的「相关条目」块（`src/components/RelatedEntries.astro`）和
   * 「去原始来源核对」那一行（`src/components/SymbolLookupLinks.astro`）。
   */
  related: {
    /** 「关于 {{symbol}} 的其他研究和问答」。 */
    bySymbolHeading: string;
    /**
     * ★ 这只票**没有别的条目**时说的那句。不许整块消失：读者需要知道"站上没别的"，
     *   而不是分不清"没有别的"和"这一块坏了"。（symbol 为空的稿子整块不渲染 ——
     *   那是"这篇不讲单只票"，完成态，和这一档是两件事。）
     */
    bySymbolOnlyThis: string;
    /**
     * 同上，但这一条**勾了好几只票**时（【2026-09-22】问答那一格改成多选之后才有这一档）。
     *
     * ★ 单独一条而不是把上面那句写成"这（几）只票"：中文里"这只票"和"这几只票"
     *   是两句话，而这一句要回答的恰恰是"我勾的那几只加起来也只有这一篇"。
     *   共用一句的话，多标的那一条会印出一句在说另一件事的话。
     */
    bySymbolOnlyThisMulti: string;
    /**
     * 标题行右端去 /s/<代码> 的入口，`{{symbol}}`。
     *
     * ⚠ **只有勾了一只票时才画**：站上没有"好几只票的合集页"这种地址，
     *   多标的那一条的入口是标题底下那排芯片（一只一张，各自链到自己那一页）。
     *   硬凑一个链接只能指向其中一只，那是替读者选了一只。
     */
    bySymbolAll: string;
    /** 「去原始来源核对：」—— 后面跟 SEC EDGAR · Yahoo Finance · Nasdaq 三个外链。 */
    lookupIntro: string;
    /** 每个外链的 title 属性，`{{source}}` / `{{symbol}}`。 */
    lookupTitle: string;
  };
  /** 目录（TableOfContents.astro）。从 render() 的 headings 生成，只取 h2 / h3。 */
  toc: {
    title: string;
    /** `{{count}}` = 节数。 */
    count: string;
    /**
     * 侧栏目录那个折叠钮的名字（`aria-label` + `title`），**两档都要有字**。
     *
     * 收起之后按钮上只剩一个图标，这两句是它唯一说得出自己是谁的地方 ——
     * 留空的话读屏软件念到的是「按钮」，鼠标悬停什么都不出。
     */
    collapse: string;
    expand: string;
  };
  /** 阅读时长 / 字数（readingTime.ts **估**的 —— 文案里带「预计」，别写成精确值）。 */
  reading: {
    /** `{{minutes}}`。**屏幕上那一格**，前面跟着一个眼睛图标，所以只有数字和单位。 */
    minutes: string;
    /**
     * `{{minutes}}`。**hover 的 `title` 和读屏念的整句** —— 表示"这是个估计"的那个词
     * （中文「预计」/ 英文 `~`）在这一条里，不在上面那条。
     * 两条是一对：`ReadingTime.astro` 同时用，`readingTime.test.ts` 分别钉着。
     */
    minutesTitle: string;
    /** `{{chars}}`，调用方已经加了千分位。 */
    chars: string;
  };

  /** 代码块复制按钮（ArticleEnhancements.astro，原来写死 "Copy" / "Copied"）。 */
  code: {
    copy: string;
    copied: string;
  };
  /** 图片灯箱的无障碍文案（ArticleEnhancements.astro）。`{{alt}}` = 图片 alt。 */
  lightbox: {
    zoom: string;
    zoomAlt: string;
    preview: string;
    previewAlt: string;
    close: string;
  };
  /**
   * 分支 RSS（/s/<代码>/rss.xml）。
   * 主 feed（/rss.xml）仍是全站完整的一条，这是**补充** —— 文案里别把它说成"替代"。
   */
  feed: {
    /** `{{symbol}}`。 */
    subscribeSymbol: string;
    symbolDesc: string;
  };
  notFound: {
    title: string;
    message: string;
    goHome: string;
  };
}
