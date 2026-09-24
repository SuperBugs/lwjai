# 工程笔记：工作纪律与已知的坑

> 这一份是给**动代码的人**（以及他用的 AI 助手）看的。代码注释里写的
> 「docs/engineering-notes.md 坑 8」「红线 3」「第四节」，指的就是这里的节号和坑号。
>
> 先读 [README](../README.md) 知道它长什么样，再读这一份知道动手之前要守什么。

## 一、红线

### 1. 持仓、成本、数量、方向、凭证 —— 一个字节都不许上站

这个站发的是每天用 AI 做的个股研究，而写研究的人自己在交易：研究是在装着自己仓位的上下文里
跑出来的。结构化的数据能靠"schema 里根本没有这个字段"挡住；**这一层的载荷是人和模型写的
自由文本**，挡不住。所以有三道闸守着，详见 [gate.md](gate.md)。

**动闸门相关的代码之前必须先读那份文档。** 尤其是"误伤是必然的"和"三档不许压成两档"两节 ——
每一条都对应一个真实的失败模式。

### 2. 不许自作主张 `git commit`；内容仓库必须私有

只有两种情况可以提交：站长说"提交"，或者站长在这次会话里已经点名让你提交。
`git push` / `checkout` / `reset` / `stash` 同理。

**内容仓库必须保持私有。** 公开的只有构建产物。这不是偏好，是发布闸的前提 ——
git 型后台是"先落盘、再构建"，内容在提交那一刻就进了仓库，闸门站在它后面。
（这个公开仓库只有代码和编的样例，所以能公开；用它建站时，放内容的那一个必须私有。）

### 3. 不许让闸门可以被关掉

`scan()` 没有第二个参数，没有环境变量能跳过它，构建脚本里它排在 `astro check` 前面。
一个能被关掉的闸门，迟早会在赶时间的那天被关掉。

这是**两件事，两条测试**，别让一条替另一条背书：

| 钉什么 | 哪条测试 |
|---|---|
| `scan()` 没有开关（不许有第二个参数） | `gate.test.ts` 的 `闸门没有开关` |
| 闸门排在 `astro check` / `astro build` 前面；`rm -rf public/pagefind` 排在 `astro build` 前面 | `coverage.test.ts` 的 `构建链：发布闸必须排在 astro check / astro build 前面` |

第二条**以前不存在**，而这一节当时写着"有一条测试钉着这件事（`闸门没有开关`）"——
那条断言的是 `scan.length === 1`，和构建脚本顺序毫无关系。也就是说：把闸门从 build 里删掉，
测试全绿、构建全绿，而"唯一一道绕不过的闸"就这么没了。
**以为有保障，其实钉的是另一件事** —— 这个形态在这个仓库里反复出现，下面还会看到好几次。

还有一件测试钉不住的：部署平台控制台里那一行构建命令（[deploy.md](deploy.md) 2.2）。
它不在仓库里、没有版本、没人 review，填成 `astro build` 就等于把闸门关掉，而站照常发布。
这一条只能靠人守，所以写在这。

### 4. 不许在站上编数字

这是个财经站。示例内容、占位文案、演示数据里**不许出现看起来像真实财报的数字**。
要样例就写清楚它是样例，或者干脆留空 —— 空状态比假数据便宜得多。

## 二、核心价值观

> **空状态、失败状态、"我不知道"，三者在界面上必须长得不一样。**

几个具体的落点：

- 闸门说的是「**没命中已知说法**」，不是「安全」。词表必然有漏网。
- 「扫了 0 篇」和「扫了 40 篇没命中」退出码不同（2 和 0）—— 前者是闸门没跑起来。
- 「没命中」和「有 3 处 warn 档命中」分两档报，不许合并成一句 ✓（`inspect.ts` 的 `report()` 收尾）。
- `symbolSource: unknown`（没认出是哪只票，**待补**）≠ 一只都没勾（这篇本来就不讲单只票，**完成态**）。
  标的那一格是多选（`symbols: string[]`），研究稿至多一只由一条会红的检查守着（`symbolsField(1)`）。
  公司中英文名在标的表里（`src/data/symbols.json`），不在条目上。
- `agent`（哪个智能体写的 / 答的）**三档**：某个 AI 智能体 / `human`（我自己写的，**完成态**）/
  `unspecified`（还没标，**待补**，显示「来源未标注」而不是空白）。判据用登记表的 `kind` 字段，
  **不许比对 `id === "human"` 这种字面量**。
- `model`（那个智能体底下跑的是哪个模型）的"没有"分三种，只有一种画成待补：人写的 → 不适用，
  什么都不画；AI 写的没标 → 「模型未标注」；两维都没标 → 「来源未标注」已经说完了。
  判据只有 `src/config/models.ts` 的 `modelSlot()` 一处。页面上两维画成**一张芯片**「智能体（模型）」
  （`AgentModelChip.astro`）—— 合并不许把档位压掉。
- 一个模型「能在哪些智能体底下跑」也**三档**：勾了几个 / 勾「不限」/ 一个都没勾（还没标）。
  后两档压成一档的后果：加一个模型忘了勾，它自称能在任何智能体底下跑，错配拦截对它整条失效。
  所以构建期只拦第一档里的真矛盾 —— **不知道就不许断言错配**（`modelScope()`）。
- `origin`（提示词谁写的）**三档**：`site` / `contributed`（必带署名）/ `unspecified`（非草稿时构建失败）。
  压成两档的后果是**替别人认领东西**。投稿人要匿名就显式写「匿名」—— 空着是"还没填"。
- `provenance`（这一份是谁写的）**三档**：`ai` / `human` / `unknown`（没人确认过）。
  第三档不许折进另外两档：折进 `ai` 是替内容认领出身，折进 `human` 是替它背书。
- 「这个集合一条都没有」和「有，但都被首页置顶区收走了」是两档，不许都说成"还没写"。
- 详情页的「相关条目」：没填键、也没有别的条目指向本条 = 只写过一份（**完成态**，整块不渲染）；
  填了键但没对上 = 印「目前只有这一条」（**待补**）。那个判断**不能写成 `questionKey &&`** ——
  一组里的第一条没有键。
- 投稿入口**不许在页面上一个字都不提**：页面上不说的话，"这个站不收投稿"和"入口没了"长得一样。

写代码时如果你发现自己在把两种"没有"合并成一种显示，停下来。

## 三、动代码之前

| 你要动 | 先读 |
|---|---|
| `scripts/gate/` | [gate.md](gate.md) —— **必读**，那是这个项目最贵的东西 |
| `src/content.config.ts` · `src/config/` · `keystatic.config.ts` | [content-model.md](content-model.md) —— 字段名是接口，改名的后果多半是零症状 |
| 新增一个内容集合 | [content-model.md](content-model.md) 第 1 节。**登记表忘了改 = 那个集合永远不过闸** |
| 部署、域名、Cloudflare | [deploy.md](deploy.md) |
| `package.json` 的 `build` · `scripts/hooks/` · `scripts/content/formatRules.ts` | [release.md](release.md) —— 一次发版要过哪四道关、顺序为什么是那样 |
| `src/` 里 AstroPaper 自带的东西 | 上游 README：<https://github.com/satnaing/astro-paper> |

**改了闸门的规则表，必须补一条测试，而且用例要从"模型真的会这么写"来。**
不许照着正则反推用例 —— 另一个项目出过一次最贵的 bug 正是这个形态（`SC 13D` vs `SCHEDULE 13D`，
87 条测试全绿，因为测试自己喂的也是错的写法）。

写完"必须拦下 / 必须红"这类用例，**故意把代码改坏一次**，看它红不红。这是唯一能证明它钉着东西的办法
（坑 17）。

## 四、在 AstroPaper 之上加了什么

上游是 [satnaing/astro-paper](https://github.com/satnaing/astro-paper)（MIT）。
**刻意保留了它的目录结构和命名**，这样上游改了还能对照着合过来。自己加的东西集中在下面这几处，
动上游文件时留意别把它们冲掉。每一处的来龙去脉写在对应文件的文件头里。

**发布与检查**

- `scripts/gate/` —— 发布闸。暂存区那道查哪几条路径的判据在 `stagedPaths.ts`（`--diff-filter=d`，
  小写 = 排除删除 —— 写成 `ACM` 会漏掉改名）。
- `scripts/hooks/` —— pre-commit。
- `scripts/content/formatRules.ts` · `check.ts` —— **稿件体检**。它不是第四道发布闸：闸门管
  "这段字该不该发出去"，它管"发出去之后长什么样"。两档：坏页面拦（exit 1），能发但你要知道的只警（exit 0）。
- `scripts/content/prune.ts` —— **批量清理**（`pnpm content:prune`）。删之前那道打包备份**没有开关**，
  验不过就一个字节都不删。脚本名不能叫 `prune`（那是 pnpm 的内置命令）。
- `scripts/content/importPlan.ts` · `import.ts` —— **粘贴导入**：模型输出 → 一条 `draft: true` 的稿子。
- `scripts/dev/` —— **一键起管理端**（`pnpm admin`）。它比 `pnpm dev` 多干的是查一眼管理端是不是真能用：
  端口通、HTTP 200 都不算数，要把页面真正会去取的依赖挨个请求一遍（坑 20）。

**内容模型与登记表**

- `src/config/collections.ts` —— 内容集合登记表（上游没有这个概念）。加集合忘了登记 = `pnpm test` 直接红。
- `src/data/registry.json` · `src/config/registry.ts` · `agents.ts` · `models.ts` —— 智能体与模型的登记数据，
  后台「智能体与模型」那一页写它。两个哨兵 `unspecified` / `human` 写死在代码里，不在数据里。
- `src/config/agentIcons.ts` · `src/components/AgentLogo.astro` —— 智能体 logo：从一张内置表里挑，
  **两种画法**（彩色 `<img>` / 单色 mask）由表里的 `tone` 决定，选错是深色模式下隐身。四档：挑了 /
  「我自己」/ 还没挑（虚线圆 ＋ 首字）/ 查不到（虚线圆 ＋ `?`）。
- `src/data/tags.json` · `src/config/tags.ts` —— 标签是封闭词表。删标签的顺序是反的：先去条目上取消勾选。
- `src/data/symbols.json` · `src/config/symbols.ts` —— 标的表。一行 = 代码 ＋ 中英文名，条目上只存代码。
- `src/config/promptOrigins.ts` · `provenance.ts` · `answerOrder.ts` —— 提示词来源、「是谁写的」、
  同一组里几个智能体谁排前面。
- `src/config/entryNo.ts` · `routes.ts` · `legacyUrls.ts` —— 地址的两张表（条目 = 前缀一个字母 ＋ 全站统一
  的递增号，从 1000 起）和老地址表。站内链接一律走 `entryUrl()` / `collectionUrl()` / `ROUTES`，
  不许手写路径字符串。
- **末尾斜杠：全站不带。** 散在四处（astro.config.ts、wrangler.jsonc、两条 rss、老地址表），少一处都零症状。

**页面**

- 研究稿 `/r` · 问答 `/q` · 教程 `/g` · 提示词 `/p`（唯一**收读者投稿**的集合）· 标的 `/s`。
- `src/components/QaAnswerSwitch.astro` —— 同一组里的几条摆成一排、点一下换一条。问答和研究稿共用。
- `src/utils/qaGroups.ts` —— 列表里同一组的几条折成一张卡。折之前先给键加集合前缀。
- `src/utils/createdOrder.ts` —— 列表按**创建时间**排，新建的在前（不是更新时间）。
- `src/utils/related.ts` —— 详情页「相关条目」。判据零 import、有单测。
- `src/components/TableOfContents.astro` —— 目录，两种画法一个组件（窄屏折叠块 / 宽屏钉在左边的侧栏）。
- `src/components/ArticleEnhancements.astro` —— 进度条、锚点、代码复制、灯箱，四个详情页共用。
- `src/utils/exportMarkdown.ts` 等 —— **导出口**（.md 下载 ＋ 复制全文 ＋ 打印成 PDF），第四条内容出站通道，
  见 [gate.md](gate.md) 7.5。下载和复制拿到的就是**正文原文**，站方一个字都不加；本地图片只换成站上的完整地址。
- `src/utils/feedItems.ts` · `src/assets/rss.xsl` —— 分支 RSS（一只票一条）＋ 浏览器里看 feed 的说明页。
- `src/utils/ogCard.ts` 等 —— **分享卡**：中文按卡上出现的字去取字体子集，取不到回落默认图并在构建日志 warn（坑 6）。
- `src/styles/global.css` 的 `app-chip*` —— 四张芯片的形状只许有这一处。
- `src/utils/structuredData.ts` · `src/config/sitemap*.ts` —— SEO 与 sitemap。
- `src/i18n/` —— 全站时间按北京时间显示，时区名只在鼠标放上去时出现（`site.timezone` ＋ `post.timezoneLabel` 是一对）。

**只在 `astro dev` 里存在的东西（`src/dev/`）**

- `/_gate` 发布闸预览、`/_publish` 提交推送（**没有 `--no-verify`**，接口只认同源请求）、
  `/_import` 粘贴导入、`/_tidy` 清理特殊字符、`/_share` 发帖文案、`/_cards` 图片卡片、`/_preview` 预览跳转。
- 后台增强：左侧菜单的工具条、字段说明收成角标、悬停提示汉化、改了就自动填「更新时间」
  （闸是 `isTrusted`）、选组之后自动带标题和标的、换智能体时模型跟上、标的和"这一条是…"的搜索选择器。
- 发帖：`src/config/socialPlatforms.ts` 是平台表，**四档**（`official` / `draft` / `manual` / `retired`）。
  「卡上印不印网址」跟着目标平台走（`urlOnCard`）：小红书的导流细则明列「图片里含站外链接」违规
  （平台有 OCR），这一格就是为此设的。小红书已从平台表和代码中移除；图片卡片（`/_cards`）保留，
  供雪球 / 富途配图使用，按所选平台决定是否印网址。

## 五、已知的坑

1. **定时发布在 dev 里看得见，构建出来没有，且不报错。**
   `src/utils/postFilter.ts`：`!data.draft && (import.meta.env.DEV || 已过发布时间)`。
   `pubDatetime` 写成未来时间的稿子在 `pnpm dev` 里正常显示，`pnpm build` 里**页面根本不生成**，构建是绿的。
   文件里存的是 UTC（`...Z`），站上按北京时间显示；后台那两格填的是北京时间（`beijingDatetime()`）——
   手写 frontmatter 时别把手表上的读数直接抄成 `...Z`，那正好是一条 8 小时后的未来稿。

2. **装 Keystatic 带进 `@types/react`，satori 的类型会红。**
   传给 satori 的是普通对象字面量，装了 React 类型之后 TS 拿 `ReactNode` 去比它。不是代码错了，
   是两份类型定义打架 —— 两处各有一条 `@ts-expect-error` 压着，别去改那棵结构树。

3. **pnpm 9 不认 `pnpm-workspace.yaml` 里的 `allowBuilds`**（那是 pnpm 10 的写法），会让 `pnpm run`
   整个跑不了。已经挪进 `package.json` 的 `pnpm.onlyBuiltDependencies`。**别把那个文件加回来。**

4. **中文标签会生成中文路径**（`/t/站务`）。浏览器能处理，但分享出去是一串 `%E7%AB%99%E5%8A%A1`。
   真要治就在 `src/utils/slugify.ts` 里加一层拼音或英文映射。

5. **Windows 上 `pnpm dev` 开着时 `pnpm build` 会 EPERM。** dev server 锁着 `.astro/`。先停 dev 再 build。

6. **动态 OG 图对中文是满屏豆腐块，而且构建全绿。** satori 用的等宽拉丁字体一个中文字形都没有，
   页面上一切正常，只有分享出去才看得见。现在的解法是按卡上的字去取中文子集；上游那条 `/og.png`
   路由**不跟开关走**，已经补了守卫。

7. **新增内容目录而不动闸门 = 零症状漏扫。** 闸门以前只走一个写死的目录；新建集合之后两道闸都不扫它，
   屏幕照常印「✓ 没命中已知的危险说法」。现在范围从 `src/config/collections.ts` 推，
   `coverage.test.ts` 双向对账。**别把范围改回写死的路径。**

8. **同一句断言出现在两处、只改了一处。** 按 `agent` 分档时只改了正文上方那份「以下是模型的原话」，
   于是人写的条目页脚写着"上面的回答是模型的原话"。教训：同一句断言再出现第二处时，两处必须读同一个判据。

9. **首页把"都在置顶区里"说成"还没写"。** 最近列表排除了置顶条目，全站只有两条且都置顶时，
   两个模块都显示「还没有…」。现在按集合总数分两档。

10. **`markdown.smartypants` 写在顶层不生效。** 自定义 `processor: unified({...})` 时顶层那个选项
    不报错也不起作用，要写在里面。（关它是因为 SmartyPants 按英文规则判引号开合，中文里两个引号都被判成右引号。）
    改完 `astro.config.ts` 后 **dev server 要重启**才生效。

11. **打包器会把 `getStaticPaths` 引用的模块级 `const` 摇掉。** 产物里只剩调用、没有声明，
    构建期报 `xxx is not defined`。最阴的地方：它一开始是好的，能不能活取决于打包器当天怎么分块。
    → `getStaticPaths` 用到的小助手一律**定义在函数内部**。

12. **三条规则收窄过**：裸券商名、`拿着|握着`、第一人称锚点跨过「建议」。开始写开户教程之后，
    「在嘉信（Schwab）开户，盈透 IBKR 的流程放在下一篇」一句四处 block。`gate.test.ts` 的 `MUST_NOT_BLOCK`
    里钉了教程语料，**别把裸券商名加回去**。

13. **正文里的裸 HTML 会执行 —— 所以加了消毒层。** `@astrojs/markdown-remark` 里放行裸 HTML 的三处
    **都是无条件的**，而正文是从模型的聊天框里粘进来的。`rehype-sanitize` 的 schema 在 `src/config/sanitize.ts`。
    ★ 消毒**必须排在 `rehypeRaw` 之前**（Astro 的用户插件位恰好在那儿）。**别把它挪到别的位置。**

14. **shiki 用的是 `class` / `tabindex`，不是 hast 规范的 `className` / `tabIndex`。** 白名单只写驼峰那版时
    代码块还在、颜色还在，只有靠 CSS 的东西全失效。构建全绿，只是"看起来有点不对"。
    **写消毒 / 过滤类的东西时，"不许误删"那一组比"必须挡住"那一组更容易出事。**

15. **正文图片只有相对路径会进优化管线。** `![](/x.png)` 和 `public/` 下的图**原图逐字节发布**（连 EXIF）。
    后台靠 `imageOptions()` 保证写出相对路径。**别为了"整洁"把图片目录挪到 `public/`。**
    判断走没走优化：产物是 `/_astro/<名>.<hash>.webp` = 走了。

16. **给站加 PDF 导出时，两条"正常"的路都会在 CI 上产出豆腐块，而本机全绿。** `jsPDF` 写中文不抛异常、
    产出乱码；`html2canvas` 不认 Tailwind 4 的 `oklch()`；构建期 headless Chrome 在构建镜像里一个中文字体都没有。
    → 现在走 `@media print` ＋ `window.print()`，字体是读者系统里的。改打印样式前先读 `src/styles/print.css`
    顶部那段（尤其是"这个文件不许被包进 `@layer`"）。

17. **默认参数会把 `undefined` 吃掉，于是"必须抛错"那条用例永远绿。** 测试助手写成
    `render(data, body = PROBE_BODY)`，用例里 `render({}, undefined)` 想验"拿不到正文要抛"——
    默认值接管了。写完"必须抛 / 必须红"这类用例，**故意破坏一次看它红不红**。

18. **Keystatic 的 `fields.relationship` 只显示 slug，没有 label 入口。** 所以提示词那一格是 `fields.select`，
    选项用 `import.meta.glob` 读中文标题。连带：`keystatic.config.ts` 从此只能被 Vite 加载，
    scripts/ 里别 import 它；「不用提示词」存成空串，schema 里用 `z.preprocess` 折成 undefined。

19. **后台正文是按 MDX 解析的，一句「机构\<20%」就让那一条编不开，而站上、构建、发布闸全绿。**
    裸 `<` 后面直接跟字母或数字，对 MDX 就是 JSX 开标签。**别换 `fields.markdoc`**（它存回来会把
    GFM 表格改写掉）。改法在内容那一侧：裸 `<` 写成 `\<`；成段花括号包进代码围栏。
    `pnpm content:import` 已经自动转 `<`。

20. **后台白屏：HTTP 200、HTML 一字不差，坏的是依赖预打包缓存。** 浏览器去取
    `/node_modules/.vite/deps/*.js?v=<旧哈希>` 拿到 504 `Outdated Optimize Dep`，React 岛水合不了。
    "端口在听" ＋ "HTTP 200" 两条都为真，而管理端是坏的。判法在 `scripts/dev/adminPlan.ts`；
    **别改成"比哈希"**（三样哈希在好的服务器上也互不相等）。治法是删 `node_modules/.vite` 重起。

21. **Astro 7 的 `astro dev` 在 stdout 不是 TTY 时会自己转后台，而且退出码是 0。** 把"子进程退了"当成失败，
    就会谎报没起来。→ 判"起没起来"只看端口上那个管理端探着好不好使。停它：`pnpm exec astro dev stop`。

22. **`og:type` 写了两遍，文章页一直被当成普通网页。** OGP 冲突时取第一个。现在 Layout 接受 `ogType` prop，
    全站只有那一处写它，`seo.test.ts` 钉着数量是 1。和坑 8 同一个教训。

23. **`public/` 下放一个扩展名不认识的文件，`astro build` 当场红**（被当成 JS 模块解析，报错指向 JSX）。
    → 样式表正文在 `src/assets/rss.xsl`，由 `src/pages/rss.xsl.ts` 用 `?raw` 读进来发出去。别挪回 `public/`。

24. **装了两份 sharp，所有出图路由 500 —— 而且时灵时不灵。** 自己写的 sharp 版本范围和 astro 依赖的
    永不重叠，pnpm 装两份，两份各带一个不同的 `libvips-42.dll`；Windows 按文件名认已加载的 DLL，
    谁先进进程谁赢（`ERR_DLOPEN_FAILED`）。`node -e "require('sharp')"` 永远是好的（那个进程里只有一份）。
    → `package.json` 里那条**跟着 astro 的范围走**；astro 哪天抬了范围，是跟着抬，不是去改测试。
