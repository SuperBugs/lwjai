import { config, fields, collection, singleton } from "@keystatic/core";
import {
  ANY_AGENT,
  REGISTRY,
  REGISTRY_ID_HINT,
  REGISTRY_ID_INPUT_RE,
} from "./src/config/registry";
import { agentOptions, DEFAULT_AGENT } from "./src/config/agents";
import { AGENT_ICON_UNSET, agentIconOptions } from "./src/config/agentIcons";
import { modelOptions, DEFAULT_MODEL } from "./src/config/models";
import {
  defaultTagsNote,
  POSTS_DEFAULT_TAGS,
  resolveDefaultTags,
  tagOptions,
} from "./src/config/tags";
import { symbolOptions } from "./src/config/symbols";
import { SYMBOL_RE } from "./src/config/symbol";
import { beijingWallToUtc, utcWallToBeijing } from "./src/config/beijingTime";
import { previewUrlFor } from "./src/dev/previewPlan";
import {
  COMMUNITY_ASSETS_DIR,
  COMMUNITY_FILE,
  NUMBERED_COLLECTIONS,
} from "./src/config/collections";
import {
  WECHAT_KIND_FIELD,
  WECHAT_QR_FIELD,
  WECHAT_QR_FORMATS,
  WECHAT_QR_PUBLIC_PATH,
} from "./src/config/community";
import { idFromEntryPath, nextEntryNo } from "./src/config/entryNo";
import { ENTRY_ICON_FORMATS } from "./src/config/entryIcon";
import { sanitizeUploadFilename } from "./src/config/uploadFilename";
import {
  ORIGIN_CONTRIBUTED,
  ORIGIN_SITE,
  UNSPECIFIED_ORIGIN,
} from "./src/config/promptOrigins";
/**
 * 【2026-09-20】下面每个字段的 `description` 在界面上收成一个「?」，
 * 鼠标放上去才展开 —— 说明一句没删，只是不再同时铺满半张表单。
 *
 * ★ 这句副作用 import **就是它的挂载点**：这份配置是后台页面在浏览器里真的会
 *   加载的那个模块，范围正好是后台、不多不少。为什么不走 astro.config.ts 的
 *   `injectScript`（试过、不行），写在那个文件开头。
 */
import "./src/dev/keystaticHelp";
// 【2026-09-21】左侧菜单最底下那一块：「粘贴导入」（/_import）、「提交推送」（/_publish）、
// 编辑页上的「发帖文案」（/_share），以及一键重启脚本的绝对路径。挂载方式同上。
import "./src/dev/keystaticToolbar";
// 【2026-09-21】把「地址（URL 里那一段）」挪到表单最后 —— 它是 fields.slug 的另一半，
// 下面那几个 schema 的 key 顺序管不到它，只能在浏览器里用 CSS order 挪。挂载方式同上。
import "./src/dev/keystaticFormLayout";
// 【2026-09-21 用户要的】表单控件的版面：多选那几格（标签 / 模型的归属）画成一排
// 可换行的药丸（9 个标签从 321px 压到 158px），下拉框铺满整行（默认固定 192px）。
// 挂载方式同上；⚠ 药丸那条压的是 keystaticHelp 自己那条 flex-basis:100%，
// 下拉那条只在字段里生效（不碰编辑器工具条）—— 两条的理由都写在那个文件开头。
import "./src/dev/keystaticFormControls";
// 【2026-09-21】选了「补一份研究 / 补一个回答」之后自动带标题和标的过来。
import { mountGroupAutofill } from "./src/dev/keystaticGroupFill";
import {
  groupDateSuffix,
  scanGroups,
  type ScannedGroup,
} from "./src/config/groupScan";
// 【2026-09-21】换了「哪个智能体」之后，让「底下跑的是哪个模型」跟上 ——
// 判据在 src/config/models.ts，那个文件只管去动表单，它做不到什么也写在那儿。
import { mountAgentModelLink } from "./src/dev/keystaticAgentModel";
// 【2026-09-21】改了一条已有内容就自动填「更新时间」。挂载在下面那个标签常量旁边
// （mountModTime 要那个标签，两处不许各写一份）。
import { mountModTime } from "./src/dev/keystaticModTime";
// 【2026-09-21】把悬停提示里的英文换成中文。Keystatic 的 `locale` 入参喂的是
// react-aria，翻不动它自己写死的那些界面字（理由写在那个文件开头）。
import { mountTooltipI18n } from "./src/dev/keystaticI18n";
// 【2026-09-23 用户要的】「智能体与模型」页那一格「图标」的预览：下拉框里、展开的列表里
// 每一项前面画着那个 logo。清单和地址都是站上那一份（agentIcons.ts / agentLogoUrls.ts），
// 那个文件只管认下拉、贴属性。
import { mountIconPreview } from "./src/dev/keystaticIconPreview";
// 【2026-09-23 用户要的】「标的」那一格：搜索框 + 「已勾了哪几只」+ 固定高度的滚动框
// （原话「当标的多了应该是要滚动框展示的，并且要支持搜索标的功能」）。Keystatic 自己那排
// 药丸只是藏起来、仍然是表单的真相 —— 为什么这么做、它碰了哪条红线，写在那个文件开头。
import { mountSymbolPicker } from "./src/dev/keystaticSymbolPicker";
// 【2026-09-23 用户要的】「这一条是…」那一格：搜索 + 分页的面板（原话「稿件太多了」）。
// 挂载在下面 mountGroupAutofill 旁边 —— 两边吃同一次扫描出来的组。
import { mountGroupPicker } from "./src/dev/keystaticGroupPicker";
import { groupSearchIndex } from "./src/dev/pickerPlan";
// 【2026-09-23 用户要的】研究稿 / 问答 / 教程 / 提示词的**列表页**：搜索 + 新的在前 + 分页
// （原话「管理界面的研究、问答、教程 list 都应该是按照倒序分页展示，并且要可以搜索」）。
// Keystatic 自己那张表藏起来、不删，读不到数据就露回来 —— 理由写在那个文件开头，
// 判据在 src/dev/entryListPlan.ts，数据从 dev 专用的 /_entries 读（astro.config.ts 挂的）。
import { mountEntryList } from "./src/dev/keystaticEntryList";

mountAgentModelLink();
mountTooltipI18n();
mountIconPreview();
mountSymbolPicker();
mountEntryList();

/**
 * 牢玩家的后台。
 *
 * ## 只在本机（`storage: local`）
 *
 * 后台只在 `astro dev` 里挂载（见 astro.config.ts 里那段），写的是**这台机器磁盘上的
 * .md 文件**。公网上不存在 /keystatic 这个地址，所以不存在"后台被攻破"这个场景。
 *
 * 发布的动作因此是 **粘贴 → 存盘 → 提交 → 推送 → Cloudflare 构建**。
 * "提交"那一步不是多余的仪式，它是内容离开这台机器的**唯一出口**，
 * 也是 pre-commit 那道闸唯一能站的位置。
 *
 * ## 正文落成 .md，但**是按 MDX 解析的**
 *
 * 【2026-09-20 查实】这一段原来写着「正文为什么是 markdoc 而不是 mdx」，
 * 说粘进来的裸 `<` 和 `{` 不要紧，因为「`extension: "md"` 让它落成普通 Markdown」。
 * **两句都是错的，而且正好互相掩护：** 下面四个集合用的一直是 `fields.mdx`
 * （不是 `fields.markdoc`），而 `extension` 只决定**文件叫什么名**，碰不到解析器。
 *
 * 后果就是 2026-09-20 撞上的那条：一份提示词 里
 * 一句「机构<20%」，后台打开那一条只有一行
 * 「Field validation failed: content: Unexpected character `2` … before name」，
 * **整条编不开也改不了**。三份提示词里两份中招，从建站起就是这样。
 *
 * ★ **零构建症状。** 站上这些文件是被 Astro 当普通 Markdown（CommonMark + GFM）读的，
 *   `<20%` 在那边就是一段字 —— 页面、`pnpm build`、发布闸全绿。坏的只有本机后台，
 *   而后台不在 CI 里，没有任何自动环节会替你发现。
 *
 * ## 那为什么不换成 `fields.markdoc`（它对裸 `<` 是宽容的）
 *
 * 因为它**存回来的时候把表格改写成 `{% table %}`**（`@keystatic/core` 的 `toMarkdoc()`：
 * `new Ast.Node('tag', {}, […], 'table')`）。这个站的正文几乎全是 GFM 竖线表格，
 * 而 Astro 不认 `{% table %}` —— 在后台按一次保存，站上那张表就变成一堆字面量。
 * **打得开、存回去是坏的**，比现在这个坏法安静得多。所以 mdx 是对的，
 * 要守的规矩在内容那一侧，三条：
 *
 *   - 裸 `<` 后面直接跟字母或数字 → 写成 `\<`。这也是 Keystatic 自己存回来的写法
 *     （`src/content/posts/orcl-20260916.md` 那句 `GC \< 0.5%` 就是它写的），
 *     实测存盘一个字不改。`<` 后面是空格（`P/E < 20`）不要紧。
 *   - 成段的花括号（LaTeX 之类）→ **包进代码围栏**，别逐个转义成 `\{`：
 *     `\frac\{V(S)\}` 跟着 .md 导出口走到读者桌面上就是一条坏公式。
 *     而且括号里恰好是合法 JS 的那些（`{5,i}`）根本不报错，会被编辑器**静默吃掉**。
 *   - `pnpm content:import` 进来的正文，`<` 那一条由 `escapeForMdxBody()` 自动处理
 *     （scripts/content/importPlan.ts）；花括号它只能警告，改法还是上面那条围栏。
 *
 * ⚠ **这里原来写着「裸 HTML 在 AstroPaper 默认配置里不执行」—— 那句话是错的。**
 * 2026-09-18 实测：`@astrojs/markdown-remark` 里 `remarkRehype({allowDangerousHtml:true})`
 * 和 `rehypeRaw()` 是**无条件**的，自定义 `processor` 碰不到那一段。
 * `<script>alert(1)</script>`、`<img src=x onerror=...>`、`<a onclick=...>`、`<iframe>`
 * 当时**全部原样输出**。而正文是从模型的聊天框里粘进来的 ——
 * 模型可以被它读到的网页内容诱导着把一段 `<script>` 原样抄进输出。
 *
 * **同日已堵**：`astro.config.ts` 的 rehype 链里加了一层消毒
 * （schema 在 `src/config/sanitize.ts`，测试在 `scripts/gate/sanitize.test.ts`）。
 * 裸 HTML 现在会被转义成死文本。但**别把这当成可以随便粘的理由** ——
 * 消毒挡的是渲染层，粘进来的字仍然要过发布闸。
 *
 * ## 三个集合
 *
 * `posts`（研究稿）、`qa`（问答）、`guides`（教程）。key 就是后台地址里那一段
 * （`/keystatic/collection/qa`），`label` 只是界面上的字。
 * 这里**故意不写 `ui.navigation`** —— 不写的话左侧导航自动列出全部集合，
 * 顺序就是下面对象 key 的书写顺序。写了反而多一处要同步的地方：
 * 加了集合忘了加导航项，它在后台就是**看不见**的，而且不报错。
 *
 * ## 字段顺序：**要动手填的在前**，默认就对的在后
 *
 * 【2026-09-20】后台表单是按下面这个对象的 **key 书写顺序**排的，所以顺序就是版面。
 * 规矩是两段，中间那行 `══ 以下全是选填 ══` 就是界碑，新加字段先想清楚放哪一段：
 *
 *   ① **必填**。又分两小档，都排在前面，但别把它们当成同一件事：
 *      - Keystatic 自己画 `*` 的（`validation: { isRequired: true }`）：
 *        地址 / 摘要 —— 不填当场就存不了盘。
 *      - **Keystatic 不画 `*`、构建期才拦的**：qa 的 `agent` / `model`、
 *        prompts 的 `origin` / `contributor`。`fields.select` 压根没有
 *        `validation` 这个入参（见各自那条注释），所以界面上它们和选填**长得一样** ——
 *        排在必填段里是目前唯一能把这件事说出来的地方。
 *   ② **选填**。缺了页面照常生成，多半显示成「待补」那一档。
 *
 * ★【2026-09-21 用户定的例外：时间那几格排在**标签后面**】
 *   `pubDatetime` 是必填（Keystatic 画 `*`），但它**默认已经填好此刻**，
 *   十条里有九条一个字都不用动 —— 排在第四格的代价是每写一条都要从它身上 Tab 过去，
 *   而"要动手填的"（标的、谁写的、提示词、标签）全被它挤到下面。
 *   所以判据不是"必不必填"，是**"要不要动手填"**：默认就对的往后放，
 *   和 `symbolSource`（「标的是怎么认出来的」，默认 manual）挪到最后是同一条。
 *   ⚠ 它仍然是必填：往后挪**不会**让"忘了填"变成一种可能 —— 那一格永远有值，
 *     真删空了 Keystatic 当场红框、存不了盘。
 *   ⚠ 也别因此把它当成"不重要"：填错方向的代价写在那一格上
 *     （未来时间的稿子 `pnpm build` 里页面根本不生成，而构建是绿的）。
 *
 * ⚠ 这个顺序也是**写进 .md frontmatter 的 key 顺序**（Keystatic 按 schema 序列化）。
 *   调整顺序之后，老稿子在后台存一次盘，frontmatter 的行序会跟着变 —— 只是难看，
 *   zod 和发布闸都按 key 取值，不看行序。
 *
 * ## Keystatic 两条会咬人的脾气，加字段之前先知道
 *
 * ① **`fields.text` 的 `pattern` 是无条件跑的。** `validateText()` 里
 *    `pattern.regex.test(val)` 既不看 `isRequired` 也不看 `length.min` ——
 *    给一个**选填**文本框配一条带 `+` 的正则，那一格就**永远留不了空**
 *    （红框卡着存不了盘）。2026-09-20 在「问题组」上踩过一次：
 *    「只问过一次就留空」这个完成态在界面上成了一个错误。
 *    要么让正则认空串，要么别在选填框上配 pattern。
 * ② **`fields.select` 的 `parse()` 对不在选项里的值直接抛**
 *    （`Must be a valid option`）。所以选项是从磁盘推出来的那几个下拉
 *    （提示词、问题组），一旦被引用的那条内容被删掉，引用它的条目在后台会
 *    **打不开并说明原因** —— 这是对的那一头：比静默重置回默认值强得多
 *    （那等于悄悄把一条回答从它所属的问题里摘出去）。
 *
 * 两个集合的字段名必须和 `src/content.config.ts` 里的 zod 逐字对上。
 * 尤其是 `title` / `description` —— 发布闸（scripts/gate/inspect.ts）只认这两个键，
 * 而且是 `?? ""` 兜底：换个键名，闸门会"成功扫描"一个空标题，报告里照常计入
 * 「扫了 N 篇」，而问题文本从未进过 scan()。零症状漏扫。
 */

/**
 * 「用的是哪份提示词」下拉框的选项 —— **中文标题**，不是英文 slug。
 *
 * 【2026-09-20 换掉了 fields.relationship】Keystatic 的关系字段只会列 slug
 * （@keystatic/core 源码里就是 `children: item.slug`，没有 label 入口），
 * 当时三份提示词的 slug 全是 `stock-analysis` 这种英文，后台里分不清哪份是哪份。
 * 改成 select：选项从 src/content/prompts/*.md 的 frontmatter 里读标题，值仍是 slug。
 * 【2026-09-21】地址换成条目号之后这条更要紧了 —— slug 现在是 `1000` / `1001`，
 * 一列 slug 在后台里连"英文名"这点线索都不剩。存进研究稿 frontmatter 的值
 * 跟着变成 `prompt: "1000"`（带引号：不加的话 YAML 把它读成 number，
 * 见 content.config.ts 的 entryRefValue）。
 *
 * `import.meta.glob` 是 Vite 的能力：这份配置只被 Vite 处理（dev 里的后台页面和它的
 * API 路由，两边都走 Vite），浏览器端拿到的是各文件的原始文本 —— 只在本机 dev 里，
 * 公网上没有这个页面。⚠ 因此**这个文件不能再被裸 tsx 加载**（scripts/ 里没有任何东西
 * import 它，保持这样；它引用的 src/config/*.ts 仍然零 import，那些是给 tsx 用的）。
 *
 * 草稿照样列出来、标明是草稿：不列的话，一篇已经引用了它的研究稿在后台会显示成
 * 空选项，那是把"引用了一份草稿"说成"没引用"。引用草稿在构建期会红（resolvePromptRef）。
 * `_` 开头的文件（_keep.md）不算条目，和 content.config.ts 的 glob 同一条规则。
 */
const NO_PROMPT = "";

/**
 * 「发布时间 / 更新时间」那两格 —— 四个集合共用下面这几个工厂
 * （`fields.*` 每次调用都返回全新对象）。
 *
 * ## ★ 默认值是**真 UTC 的此刻**，不是 `fields.datetime` 的 `{ kind: "now" }`
 *
 * 【2026-09-20 查实】`fields.datetime` 存下来的值**按 UTC 解释**（它的 `serialize`
 * 就是 `new Date(value + 'Z')`，盘上写出来是 `…T12:00:00.000Z`，
 * 站上那一条显示成「9月16日 20:00 北京时间」）。而 `{ kind: "now" }` 在
 * `@keystatic/core` 里是这么算的：
 *
 *     new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, -8)
 *
 * —— **本机墙上时间**，然后被当成 UTC 存下去。这台机器是 UTC+8，实测它会填
 * `15:58` 而真 UTC 是 `07:58`：**每一条新稿子都比真实时刻晚 8 小时，也就是未来稿**。
 * 而未来稿在 `pnpm build` 里**页面根本不生成，构建还是绿的**（docs/engineering-notes.md 坑 1）——
 * "发了但站上没有"，没有任何一处会报错。
 *
 * 所以这里填一个**算好的 UTC 字符串**。代价：它是**这个后台页面加载那一刻**的时间，
 * 不是点「Add」那一刻的 —— 标签页开着过了两小时再建稿，默认值就是两小时前。
 * ⚠ 这个偏差的方向是**往过去偏**，所以最坏只是时间流里排得靠后一点；
 * 往未来偏才是会让页面消失的那一头。别为了"更准"换回 `{ kind: "now" }`。
 *
 * ★ 【2026-09-21】表单里这个值**显示成北京时间**（下面 `beijingDatetime()` 包的
 *   那一层干的），但这个常量本身仍然是 UTC —— 换算只在那一层做。
 */
const NOW_UTC = new Date().toISOString().slice(0, 16);

/**
 * 时间那两格：**眼睛看到的、手填进去的都是北京时间，写进 .md 的仍然是 UTC。**
 *
 * 【2026-09-21 用户定的】在这之前这一格里的读数就是 UTC，说明里写着「和站上显示的
 * 差 4~5 小时」—— 也就是说每动它一次就得在脑子里减一次 8 小时，而算错的方向有一半
 * 是往未来，那一头的后果是**页面根本不生成而四处全绿**（上面那段）。
 *
 * ## 包法：里面那层全是 UTC，外面这层全是北京时间
 *
 *     base（fields.datetime）→ 表单：`defaultValue` / `parse` 出来的读数 **+8**
 *     表单 → base（写盘）：`serialize` 进去的读数 **−8**
 *
 * 换算的判据在 `src/config/beijingTime.ts`（纯函数、有测试）。
 * **别在别处再写一个 +8** —— 两处各写一份的那天就是它们开始各说各话的那天。
 *
 * ★ 传给 base 的 `defaultValue` **仍然是 UTC 串**（上面的 NOW_UTC）：一层里混两套
 *   规矩的话，下次加一格时必然有人搞反一次。
 * ★ `Input` / `validate` / `reader` 原样用 base 的。格式正则两边一模一样
 *   （到分钟、无时区后缀），所以校验照旧；`reader` 是 Keystatic 自己那套读取 API，
 *   这个站读内容走的是 Astro 的 content collections，它从来没被调用过 ——
 *   留着 base 那份，它给出的就是盘上那个 UTC 读数，和文件一致。
 */
type BeijingDatetimeOpts = {
  label: string;
  description: string;
  /** ⚠ 填 **UTC** 墙钟（`2026-09-21T07:58`），不是北京时间 —— 见上面那段。 */
  defaultValue?: string;
  /** ⚠ 这里写 `isRequired?: boolean` 而不是 `isRequired?: true` 是**必须的**：
   *  `fields.datetime` 的 `RequiredValidation<IsRequired>` 在 `IsRequired` 恰好推成
   *  `true` 时会反过来要求 `validation` 这一格**不许省略**，于是「更新时间」那一档
   *  （不传 validation）当场 ts(2345)。推成 `boolean` 时那个条件类型摊成 `unknown`，
   *  两种用法都过 —— 校验本身在运行时由 base 的 `validate` 照旧执行。 */
  validation?: { isRequired?: boolean };
};

const beijingDatetime = (opts: BeijingDatetimeOpts) => {
  const base = fields.datetime(opts);
  return {
    ...base,
    defaultValue: () => {
      const utc = base.defaultValue();
      return utc === null ? null : utcWallToBeijing(utc);
    },
    parse: (value: Parameters<typeof base.parse>[0]) => {
      const utc = base.parse(value);
      return utc === null ? null : utcWallToBeijing(utc);
    },
    serialize: (value: string | null) =>
      base.serialize(value === null ? null : beijingWallToUtc(value)),
  };
};

const pubDatetimeField = () =>
  beijingDatetime({
    label: "发布时间",
    description:
      "⚠ 这一格填的是**北京时间**（手表上几点就填几点），存进文件时自动换成 UTC，" +
      "站上也按**北京时间**显示 —— 填的、看到的、站上印的是同一个读数。" +
      "默认已经填好此刻，一般不用动。" +
      "★ 填成未来时间的稿子在 `pnpm dev` 里看得见，`pnpm build` 里**页面根本不生成**，" +
      "而且构建是绿的。",
    defaultValue: NOW_UTC,
    validation: { isRequired: true },
  });

/**
 * 「更新时间」那一格的标签。
 *
 * ★ 这个字符串**同时**喂给下面的字段定义和自动填那段脚本
 *   （`src/dev/keystaticModTime.ts` 只能按 `<label>` 文字找输入框 —— 表单里没有
 *   字段名可认）。两处各写一份的那天，就是改了标签、自动填默默失效的那天：
 *   编辑完那一格还是空的，而后台、构建、测试四处全绿。同 `POST_CARRY` 那条纪律。
 */
const MOD_DATETIME_LABEL = "更新时间";

/** 「回答排序」那一页的说明里要列出**当前有哪些智能体**（省得人回去对照另一页）。
 *  从同一份 `agentOptions()` 现算，所以加了智能体、这句话跟着变。 */
const AGENTS_FOR_HINT = agentOptions()
  .map(o => o.label)
  .join(" / ");

/**
 * 「更新时间」那一格 —— 四个集合各有各的叮嘱（教程和提示词尤其要勤填），
 * 所以那句话由调用方给；**时区那句是共同的，只写在这里**：
 * 同一句断言抄进四处、改的时候只改一处，是 docs/engineering-notes.md 坑 8 那个形态。
 */
const modDatetimeField = (description: string) =>
  beijingDatetime({
    label: MOD_DATETIME_LABEL,
    description:
      `${description}⚠ 和发布时间一样，这一格填的也是**北京时间**。` +
      "★【2026-09-21】改了这一条的任何一格，它会**自动填成此刻** —— " +
      "自己动过它（包括清空）之后就不再自动填了，那一下是你的答案。",
  });

/**
 * 【2026-09-21 用户要的】改了一条已有内容就自动把上面那一格填成此刻。
 * 只在编辑页动手、人动过就不再碰、没改就不写 —— 三条边界和"怎么知道表单变了"
 * 写在 `src/dev/keystaticModTime.ts` 开头。
 */
mountModTime({ label: MOD_DATETIME_LABEL });

/**
 * 「标签」那一格 —— **四个集合共用这一个工厂**，选项来自左侧「标签」那一页
 * （src/data/tags.json，判据 src/config/tags.ts）。【2026-09-21 用户要的】
 *
 * ## 为什么从手打文本框换成勾选
 *
 * 标签撑着 `/t` 索引页和每个 `/t/<标签>` 列表页，而那两页是按标签**折叠**的。
 * 手打的代价不是难看，是同一类内容被拆成两页：「财报」和「财报解读」在后台看起来
 * 只是手滑，在站上是两个各有一篇的孤儿页面，而后台、构建、闸门四处全绿。
 * 和 agent / model 从自由文本换成封闭枚举是同一条理由。
 *
 * ## 两条会咬人的
 *
 * ⚠ 刚在「标签」页加的标签，要**刷新一次**这个页面才会出现在这儿（选项是配置求值
 *   那一刻定死的，和提示词、问题组那两个下拉同一个脾气）。
 * ⚠ 在「标签」页**删掉或改名**一个还被用着的标签，用着它的条目在后台就
 *   **打不开并说明原因**（`fields.multiselect` 的 parse 对不在选项里的值直接抛），
 *   构建也会红（content.config.ts 的 tagsField）。这是对的那一头 —— 比静默把那几个
 *   标签丢掉强得多，后者等于悄悄把一条内容从它所属的分类里摘出去。要改就先改内容。
 *
 * ## 新建时预先勾上哪几个（第二个参数）【2026-09-23 用户要的】
 *
 * 只有研究稿传（`POSTS_DEFAULT_TAGS`，「个股研究」），另外三格不传 = 照旧一个都不勾。
 * ★ 喂给 Keystatic 的是**对着表滤过的那一份**（`resolveDefaultTags()`），不是原样那一份：
 *   多选不核对默认值在不在选项里，表里没有的默认值会勾不出来、却原样存进新稿子。
 *   滤掉的那几个由说明里那一句讲出来（`defaultTagsNote()`，三档）。理由都在 tags.ts。
 */
const tagsField = (hint: string, defaults: readonly string[] = []) => {
  const resolved = resolveDefaultTags(defaults);
  return fields.multiselect({
    label: "标签",
    // ⚠ 说明里**不许举具体标签当例子**（「财报 / 做空 / 宏观 …」）：表是后台管的，
    //   人删掉一行之后那句例子就在替一个不存在的标签打广告，而下面勾选框里根本没有它。
    //   要看有哪些标签，勾选框本身就是那张表。
    //   （默认值那一句不算例子：它是对着表算出来的，表里没有了它会改口。）
    description:
      `${hint}` +
      defaultTagsNote(resolved) +
      "★ 只能从表里勾：想要一个新标签，先去左侧「标签」那一页加一行，" +
      "再回来刷新这一页。⚠ 标的代码不用写进来，它有自己的字段。",
    options: tagOptions(),
    defaultValue: resolved.applied,
  });
};

/**
 * 那一格叫什么。**只写一处** —— 它同时是字段的 label 和文档 / 说明里提到的名字。
 * ⚠ 自动填那段脚本（keystaticGroupFill）**不认这个字符串**，它认的是"选项集合正好
 *   等于标的表"（多选那一格没有文本框可按标签找）。改这个名字不会弄坏自动填。
 */
const SYMBOL_LABEL = "标的";

/**
 * 「标的」那一格 —— **研究稿和问答共用这一个工厂**，选项来自左侧「标的」那一页
 * （src/data/symbols.json，判据 src/config/symbols.ts）。【2026-09-22 用户要的】
 *
 * ## 为什么从三个文本框换成一格多选
 *
 * 用户原话：「一个问答可能涉及多个标的」。原来那一格是**单个**文本框（代码），
 * 旁边还跟着两个手打的公司名 —— 一条问答同时讲 ARM / INTC / AMD 时，那三格
 * 一个都放不下第二只票。换成多选之后公司名没地方逐只填，所以它们搬进了那张表。
 *
 * ## 两条会咬人的（和标签那一格逐字相同的脾气）
 *
 * ⚠ 刚在「标的」页加的票，要**刷新一次**这个页面才会出现在这儿（选项是配置求值
 *   那一刻定死的，和标签、提示词、问题组那几个下拉同一个脾气）。
 * ⚠ 在「标的」页**删掉或改代码**，用着它的条目在后台**打不开并说明原因**
 *   （`multiselect` 的 parse 对不在选项里的值直接抛），构建也红。要改就先改内容。
 */
const symbolsField = (hint: string) =>
  fields.multiselect({
    label: SYMBOL_LABEL,
    description:
      `${hint}` +
      "★ 只能从表里勾：要写一只表里还没有的票，先去左侧「标的」那一页加一行，" +
      "再回来刷新这一页。公司中英文名也在那张表里填，不在这儿。" +
      "⚠ 讲宏观、讲方法论、问的是概念 —— 一个都不勾就行，那不是漏填。",
    options: symbolOptions(),
  });

const promptSources = import.meta.glob("./src/content/prompts/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

/** YAML 标量的最简读法：双引号按 JSON 解，单引号只剥引号，裸的原样。够用 ——
 *  标题是 Keystatic 自己写出来的，永远是双引号标量。 */
function yamlScalar(raw: string): string {
  const s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    try {
      return JSON.parse(s) as string;
    } catch {
      return s.slice(1, -1);
    }
  }
  if (s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1).replaceAll("''", "'");
  }
  return s;
}

/** 站上的提示词，按标题排。★ 下拉的**选项和默认值是同一次扫描**，不可能对不上。 */
const promptEntries = Object.entries(promptSources)
  .map(([path, raw]) => {
    const slug = (path.split("/").pop() ?? path).replace(/\.md$/, "");
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] ?? "";
    const titleLine = /^title:\s*(.+?)\s*$/m.exec(front)?.[1];
    // 读不到标题就退回 slug —— 一个英文名总比一个空选项强。
    const title = (titleLine && yamlScalar(titleLine)) || slug;
    const draft = /^draft:\s*true\s*$/m.test(front);
    return { slug, title, draft };
  })
  .filter(p => !p.slug.startsWith("_"))
  .sort((a, b) => a.title.localeCompare(b.title, "zh-Hans-CN"));

function promptOptions(): { label: string; value: string }[] {
  return [
    ...promptEntries.map(p => ({
      label: p.draft ? `${p.title}（草稿 —— 先发它，否则构建失败）` : p.title,
      value: p.slug,
    })),
    // ★ 【2026-09-21】「不用」这一档挪到了**最后**：默认值现在落在第一份提示词上，
    //   而"默认值就是列表里第一个"这件事得看得出来（见下面 DEFAULT_PROMPT）。
    { label: "（不用站上的提示词）", value: NO_PROMPT },
  ];
}

/**
 * 「用的是哪份提示词」那一格的默认值 —— **列表里第一份已发布的提示词**。
 *
 * 【2026-09-21 用户定的】几乎每篇研究稿都是拿同一份提示词跑的，每建一条就去下拉里
 * 挑一次是纯粹的手工活。默认值跟着列表走：想换默认就换标题（列表按标题排）。
 *
 * ⚠ 代价说清楚：这一格现在**不填也有值**。拿别的提示词跑的那一篇，忘了改就是
 *   替它认领了一份不是它用的提示词 —— 页面上会链过去、提示词那页也会反向列出它，
 *   而没有任何一处会报错。这是拿"每次少点一下"换来的，不是一个疏忽。
 * ★ 跳过草稿：默认值落在草稿上等于**每建一条新研究稿都让构建当场红**
 *   （引用草稿由 resolvePromptRef 拦）。一份都没有（或者全是草稿）就退回「不用」。
 */
const DEFAULT_PROMPT = promptEntries.find(p => !p.draft)?.slug ?? NO_PROMPT;

/**
 * 「问题组」那一格的选项 —— **站上已有的问题，按问题原文列出来**。
 *
 * 【2026-09-20 换掉了手填文本框】原来那一格要自己敲一个英文键，而且**同组的每一条
 * 都得敲成一模一样**。敲错一个字母不报错，只是那两条回答各自孤零零 ——
 * docs/engineering-notes.md 里专门记着这个失败模式。现在从已有问题里挑，那条路就没了。
 *
 * ## 值是什么
 *
 * 值 = 那一组**第一条问答的地址**（slug）。第一条自己留空（它被创建的时候
 * 还没有"已有问题"可挑），归组的判据是「填了用键、没填用自己的地址」——
 * `src/utils/related.ts` 的 `qaGroupKey()`，有单测。
 * ★ 所以 2026-09-20 之前那种"几条互相填同一个键"的老稿子一个字都不用改：
 *   它们共用的那个键在新判据下仍然把它们归在一起。
 *
 * ## 选项怎么来
 *
 * 扫 `src/content/qa/*.md`，按 `qaGroupKey` 的同一条规矩算出每条属于哪一组，
 * 每组只出现一次，标签取这一组里**根那条**（地址 == 键）的标题，取不到就用组里
 * 第一条的标题。和提示词那个下拉同一套做法（`import.meta.glob` + 读 frontmatter）。
 *
 * ⚠ 这份配置在浏览器里是**加载那一刻**的快照：刚在另一个标签页里新建的问答，
 *   要刷新一次后台才会出现在这个下拉里。
 */
const qaSources = import.meta.glob("./src/content/qa/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

/** 研究稿也归组（同一个选题、几个智能体各写一份），所以这里也要一份源。 */
const postSources = import.meta.glob("./src/content/posts/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const NEW_QUESTION = "";

/**
 * 「这一条是…」那一格的选项 —— **一个函数，两个集合共用**。
 *
 * 【2026-09-20】问答先有的（同一个问题问几个智能体），同一天研究稿也加上了
 * （同一个选题让几个智能体各写一份）。两边共用 `questionKey` 这一个字段和
 * `src/utils/related.ts` 那一套判据，所以这里也只该有一份选项构造逻辑 ——
 * 抄成两份的那天，就是两个集合的归组规矩开始各说各话的那天。
 *
 * 只有措辞按集合分（`newLabel` / `addLabel`）：问答说「回答」，研究稿说「研究」。
 */
/**
 * 一个集合的「这一条是…」那一格要带的几格：**frontmatter 键 → 表单上那一格的标签**。
 *
 * ★ 这几个字符串**同时**喂给下面的字段定义（`label:`）和自动填那段脚本 ——
 *   Keystatic 渲染出来的表单里没有字段名，脚本只能按标签找输入框
 *   （见 src/dev/keystaticGroupFill.ts）。两处各写一份的那天，就是改了标签、
 *   自动填默默失效的那天：选了组没反应，而后台、构建、测试四处全绿。
 */
const POST_CARRY = {
  title: "标题",
} as const;

const QA_CARRY = {
  ...POST_CARRY,
  // 问答的标题那一格叫「问题」—— 标题就是问题本身。
  title: "问题",
} as const;

/**
 * 同上，但**多选**那几格。【2026-09-22】标的从三个文本框变成一格多选之后，
 * 它从 `*_CARRY` 挪到了这里 —— 那边的消费方是"往输入框里写字"，这边是"逐个勾"。
 *
 * ★ 值就是上面 `symbolsField()` 用的那份 `symbolOptions()`：脚本认那一格靠的是
 *   **选项集合对得上**（表单里「标签」也是一堆勾选框），所以这两处必须是同一份。
 */
const CARRY_MULTI = { symbols: symbolOptions() } as const;

/** 扫一遍某个集合的 .md，算出它的组。判据在 src/config/groupScan.ts（纯函数、有单测）。 */
const CARRY_LIST_KEYS = Object.keys(CARRY_MULTI);
const postGroups = scanGroups(
  postSources,
  Object.keys(POST_CARRY),
  CARRY_LIST_KEYS
);
const qaGroups = scanGroups(qaSources, Object.keys(QA_CARRY), CARRY_LIST_KEYS);

function groupOptions(
  groups: readonly ScannedGroup[],
  newLabel: string,
  addLabel: string
): { label: string; value: string }[] {
  return [
    { label: newLabel, value: NEW_QUESTION },
    // 【2026-09-21 用户要的】按时间排（新的在前，判据在 groupScan.ts），
    // 每一项后面缀上那一组最新一条的日期 —— 排序得看得见，理由在 groupDateSuffix 上。
    ...groups.map(g => ({
      label: `${addLabel}${g.label}${groupDateSuffix(g.latest)}`,
      value: g.key,
    })),
  ];
}

/** 组的键 → 要带进表单的那几格的值。和上面的选项**同一次扫描**，不可能对不上。 */
const carryData = (groups: readonly ScannedGroup[]) =>
  Object.fromEntries(
    groups.map(g => [g.key, { values: g.carry, lists: g.carryList }])
  );

/**
 * 选了「补一份研究 / 补一个回答」之后把标题和标的带过来，并重算地址。
 * 只在**新建**页动手；为什么是轮询而不是监听 change，见那个文件开头。
 */
mountGroupAutofill({
  posts: {
    labels: POST_CARRY,
    multi: CARRY_MULTI,
    groups: carryData(postGroups),
  },
  qa: { labels: QA_CARRY, multi: CARRY_MULTI, groups: carryData(qaGroups) },
});

/**
 * 「这一条是…」那一格点开是**带搜索、分页**的面板（src/dev/keystaticGroupPicker.ts）。
 * 选项还是上面 `groupOptions()` 那一份（面板读的是隐藏 `<select>`，一行都不另拼），
 * 这里只多喂两样：怎么称呼一组（「选题」/「问题」），以及每一组除了那行字以外
 * 还能被搜到的字（组的号、标的代码和中英文名 —— 研究稿的标题常常就是一个代码）。
 * ★ `search` 的键就是这个集合**全部**的组：面板拿它去认那一格，少一组就认不出来、
 *   退回原生下拉。所以它和 `mountGroupAutofill` 一样从 postGroups / qaGroups 推。
 */
mountGroupPicker({
  posts: { noun: "选题", search: groupSearchIndex(postGroups) },
  qa: { noun: "问题", search: groupSearchIndex(qaGroups) },
});

/**
 * 「地址」那一格的自动生成：**全站统一的递增数字**（判据在 src/config/entryNo.ts，
 * `pnpm content:import` 和 /_import 读同一份）。
 *
 * 【2026-09-21 换掉了「标的-日期时分-智能体-模型」】旧那套的自解释只在填表顺序
 * 正确时成立 —— `generate` 只拿得到标题，智能体和模型是从表单里现读的，
 * 先写标题再选下拉框就少那两段，而回头补标又不许改地址。理由写在 entryNo.ts 开头。
 *
 * ## ⚠ 这一处的"当前最大号"是一张快照，不保证新鲜
 *
 * Keystatic 的 `generate` 是**同步**的、只拿得到标题，浏览器里也没有 fs ——
 * 只能读 `import.meta.glob` 的快照（和提示词、问题组那两个下拉同一个做法）。
 * 于是：**在同一个后台页面里连建两条、中间没刷新，两条会算出同一个号**，
 * 而 Keystatic 撞名是**静默**加 `-2` 后缀 → `/r/1008-2`。
 *
 * 这件事不在这里兜，在 `src/content.config.ts` 的 `generateId` 里兜：文件名不是
 * 条目号就抛，`astro dev` 的内容同步阶段当场炸，指得出是哪个文件。
 * ★ 两件事两个落点，别把其中一个改成"顺手修一下"——
 *   一个会自己纠正的编号器，出问题的那天不会有任何人知道。
 */

/**
 * 号池的输入：四个编号集合下所有 .md 的路径。
 *
 * ⚠ `import.meta.glob` 的模式**必须是字面量**（Vite 在编译期展开它），所以这四行
 *   没法从 `CONTENT_COLLECTIONS` 推出来 —— 这是这个仓库里少数"登记表管不到"的地方。
 *   下面那个自检就是为它准备的：`*.md` 会把每个目录里的 `_keep.md` 也扫进来，
 *   所以**只要目录在登记表里，它就一定至少出现一个文件**，覆盖面可以反过来对账。
 *   漏一个集合的后果不是报错，是那个集合的条目号不进池子 —— 两条内容抢同一个号。
 */
const entryFiles = import.meta.glob([
  "./src/content/posts/*.md",
  "./src/content/qa/*.md",
  "./src/content/guides/*.md",
  "./src/content/prompts/*.md",
]);

{
  const covered = new Set(
    Object.keys(entryFiles).map(p => p.split("/").at(-2) ?? "")
  );
  const missing = NUMBERED_COLLECTIONS.filter(k => !covered.has(k));
  if (missing.length > 0) {
    throw new Error(
      `后台的号池漏了集合：${missing.join(" / ")}。\n` +
        `keystatic.config.ts 里那几行 import.meta.glob 要补上对应的目录 —— ` +
        `漏掉的那个集合的条目号不进池子，下一条新内容会和它撞号。\n` +
        `（模式必须是字面量，没法从 src/config/collections.ts 推。）`
    );
  }
}

/** 下一个号。四个集合共用一个池子 —— `/posts/7` 和 `/qa/7` 不会同时存在。 */
function generateEntryNo(): string {
  return nextEntryNo(Object.keys(entryFiles).map(idFromEntryPath));
}

/** 「地址」那一格的说明 —— 四个集合逐字相同，所以只写一份。 */
const SLUG_FIELD_DESC =
  "自动填成**全站统一的下一个号**（研究稿 / 问答 / 教程 / 提示词共用一个号池，" +
  "所以 /r/1002 和 /q/1002 不会同时存在；号从 1000 起，四位以上）。写标题时自动算，也可以点这一格旁边的 ↻ 重算。" +
  "⚠ 发布之后不要再改 —— 改了等于把已经分享出去的链接打死。" +
  "⚠ 在同一个后台页面里连建两条、中间没刷新的话，第二条可能算出同一个号；" +
  "撞号时 Keystatic 会静默加一个 -2 后缀，而 astro dev 的终端会当场报错指出是哪个文件。";

/** 闸门的规则清单直接从规则表推 —— 后台下拉框里的选项和闸门认的码**永远是同一份**。
 *  手抄一份到这里，就是"界面上列着的码闸门不认"的那一天。 */
/**
 * 正文编辑器的图片配置。**三个集合共用这一个工厂**，别各写各的。
 *
 * ## 为什么必须显式配，不能留默认
 *
 * `fields.mdx` 的插图能力**默认就是开的**（还支持截图直接 Ctrl+V 粘贴），
 * 但不配 `directory` / `publicPath` 的话：写进 .md 的是**裸文件名**，
 * 而图片二进制落在 `src/content/<集合>/<slug>/` 这个**子目录**里 ——
 * 两边对不上，图是坏的。
 *
 * ## 这组值是实测验过的，改之前先看懂
 *
 *   directory:  src/assets/<集合>
 *   publicPath: ../../assets/<集合>/
 *
 * Keystatic 会在 publicPath 后面**自动再加一层 slug**，所以 .md 里写出来的是
 * `../../assets/guides/<slug>/shot.png`，盘上落在 `src/assets/guides/<slug>/shot.png`。
 * 而 .md 自己在 `src/content/guides/<slug>.md` —— 从它出发 `../../` 正好是 `src/`。对得上。
 *
 * ## ★ 为什么必须是**相对路径**（这条是整条管线里最安静的一次翻车）
 *
 * Astro 只优化**相对路径**的正文图（判据就一个字符：
 * `remark-collect-images.js` 里的 `!url.startsWith("/")`）。走优化管线 =
 * 转 webp + **EXIF / ICC / XMP 全部剥掉**（实测：带 EXIF 的 JPEG 进去，出来 stripped）。
 *
 * 一旦有人为了"整洁"把 `publicPath` 改成 `/guides` 这种绝对路径、或者把
 * `directory` 挪到 `public/` 下，**每一张新截图就从「剥 EXIF 的 webp」变成原图
 * 逐字节直出** —— 而后台、页面、构建、闸门**四处都不会有任何变化**。
 * 肉眼、构建日志、`astro check` 全都区分不出来，只有 URL 和字节里有区别。
 *
 * ## transformFilename
 *
 * **原始截图文件名会原样进公网 URL**，所以要清洗（长数字串换成 `x` 那一套）。
 * 【2026-09-23】函数搬进了 `src/config/uploadFilename.ts`（逻辑没改，为了能被测到），
 * 为什么这么洗、以及为什么让出 `icon` 这个名字，都写在那边。
 *
 * ⚠ 代价：两张不同的图如果清洗后同名，**后传的会覆盖先传的**（Keystatic 按名字写盘）。
 */
const imagePaths = (collectionKey: string) => ({
  directory: `src/assets/${collectionKey}`,
  publicPath: `../../assets/${collectionKey}/`,
});

const imageOptions = (collectionKey: string) => ({
  ...imagePaths(collectionKey),
  transformFilename: sanitizeUploadFilename,
});

/** 两个集合共用这一份选项数组是安全的：`fields.*` 每次调用都返回全新对象，
 *  options 只是被读的纯数据，Keystatic 没有全局注册表会把它们串起来。 */

export default config({
  storage: { kind: "local" },
  ui: {
    brand: { name: "牢玩家 · 后台" },
  },

  /**
   * 「智能体与模型」配置页（【2026-09-20 加】）—— 一个 singleton，写 src/data/registry.json。
   *
   * 研究稿 / 问答里「哪个智能体」「哪个模型」两个下拉框的选项就从这份文件来
   * （src/config/agents.ts、models.ts 读它，见 src/config/registry.ts 文件头）。
   * 在这里加一行，存盘，下拉框里就有了；改显示名同理。
   *
   * ★【2026-09-21】模型那半张表多了一格「**能在哪些智能体底下跑**」——
   *   那两个下拉的联动、以及构建期那条"这个组合不存在"的拦截，输入都是它。
   *   三档（列了几个 / 不限 / 还没标）的说明写在那一格上，判据在 src/config/models.ts。
   *
   * ★ 两个哨兵（「未标注」「我自己」）**不在这一页**，它们写死在代码里：
   *   它们是分档的判据，不是产品，删掉的后果是整站的三档一起塌。
   * ★ id 定了不改：它进 frontmatter 和地址。改了 = 库里所有用着旧 id 的条目
   *   一起变成「来源未标注」。想改名只改「显示名」。
   * ★ 这一页写的字**上公网**（芯片、悬停提示、导出件），所以发布闸也扫它
   *   （scripts/gate/inspect.ts 的 inspectRegistry）—— 说明里别写内部系统的名字。
   *
   * ⚠ 改完登记表，`pnpm dev` 里正在开着的研究稿 / 问答编辑页要刷新一次才能看到新选项
   *   （下拉框的选项是打开页面那一刻从配置里取的）。构建期永远读最新的一份。
   */
  singletons: {
    registry: singleton({
      label: "智能体与模型",
      path: "src/data/registry",
      format: { data: "json" },
      schema: {
        agents: fields.array(
          fields.object(
            {
              id: fields.text({
                label: "id（进 frontmatter 和地址，定了不改）",
                description: REGISTRY_ID_HINT,
                validation: {
                  isRequired: true,
                  pattern: { regex: REGISTRY_ID_INPUT_RE, message: REGISTRY_ID_HINT },
                },
              }),
              name: fields.text({
                label: "显示名",
                description: "写成「厂商 产品」：Google Spark、OpenAI Codex。芯片、署名、分享卡上印的就是它。",
                validation: { isRequired: true },
              }),
              vendor: fields.text({
                label: "厂商",
                description: "Google / OpenAI / Anthropic …",
                validation: { isRequired: true },
              }),
              note: fields.text({
                label: "一句说明（悬停提示里）",
                description: "可空。别写内部系统的名字 —— 这一句上公网，发布闸扫它。",
              }),
              /**
               * 【2026-09-22 用户要的】站上那个 16px 的 logo —— 列表卡片、
               * 详情页那张出处芯片、以及详情页顶上那排切换，三处都画它。
               * 【2026-09-23 用户要的】从自己画的几何符号换成了**各家的品牌标**
               * （LobeHub 那套，文件在 src/assets/agent-logos/，来源和版本写在
               * src/config/agentIcons.ts 文件头）。
               *
               * ★ 是**从一张内置表里挑**，不是上传图片：登记表里存的仍然是一个 id
               *   （纯文本 → 发布闸照样扫得到这一行），logo 文件随代码提交，
               *   所以 /_publish 不用管那个目录。要加一家 → 那个文件开头「加一个 logo」三步。
               * ★ 选中之后下拉框里、以及展开的列表里每一项前面都画着那个 logo
               *   （src/dev/keystaticIconPreview.ts）—— 挑之前就看得见长什么样。
               * ★ **默认是「还没挑」**，和上面「哪个智能体」那一格刻意相反：
               *   那一格站长每天都要填，默认落在真实选项上省事；图标是加一个
               *   智能体时填一次的东西，默认挑一个等于替它**认领了一个厂商**。
               *   还没挑的那几个在站上画成**虚线圆 + 名字首字**（待补），
               *   和「来源未标注」那一档（虚线圆 + ?）长得不一样。
               * ⚠ 改图标不影响任何一条已发布内容 —— 它不进 frontmatter，
               *   只影响站上画出来的那个 logo。
               */
              icon: fields.select({
                label: "图标",
                description:
                  "站上列表和详情页那个 logo（各家的品牌标，彩色；标着「单色」的几个跟着文字颜色走）。" +
                  "★ 两个智能体别挑同一个 —— 那样列表里分不出谁是谁，构建会红。" +
                  "★ 留「还没挑」也能发，站上画成一个虚线圆 + 首字（待补），" +
                  "和「来源未标注」那一档长得不一样。",
                options: agentIconOptions(),
                defaultValue: AGENT_ICON_UNSET,
              }),
            },
            { label: "智能体" }
          ),
          {
            label: "AI 智能体",
            description:
              "Google Spark、OpenAI ChatGPT、Anthropic Claude、OpenAI Codex 这类产品。" +
              "「未标注」和「我自己」两档是内置的，不在这里。",
            itemLabel: props =>
              props.fields.name.value || props.fields.id.value || "（新条目）",
          }
        ),
        models: fields.array(
          fields.object(
            {
              id: fields.text({
                label: "id（进 frontmatter 和地址，定了不改）",
                description: REGISTRY_ID_HINT,
                validation: {
                  isRequired: true,
                  pattern: { regex: REGISTRY_ID_INPUT_RE, message: REGISTRY_ID_HINT },
                },
              }),
              name: fields.text({
                label: "显示名",
                description:
                  "用连字符连起来，不用空格（GPT-6-Pro、Gemini-3-Pro、Opus-5）；" +
                  "不重复智能体名里的词：Anthropic Claude 底下写 Opus-5，不写 Claude Opus 5。",
                validation: { isRequired: true },
              }),
              vendor: fields.text({
                label: "厂商",
                description: "OpenAI / Anthropic / Google / xAI …",
                validation: { isRequired: true },
              }),
              note: fields.text({
                label: "一句说明（悬停提示里）",
                description: "可空。同上：这一句上公网。",
              }),
              /**
               * 【2026-09-21】归属 —— 研究稿 / 问答里那两个下拉的**联动就靠这一格**。
               *
               * 三档，不许压成两档（判据在 src/config/models.ts 的 modelScope）：
               *   勾了几个产品 = 只在这几个底下跑（完成态，配错了构建期直接红）；
               *   只勾「不限智能体」 = 看过了，哪儿都能跑（完成态，直接调 API 那种）；
               *   一个都不勾 = **还没标**（待补，构建期不拦，下拉里印「归属未标注」）。
               *
               * ⚠ 选项是**这个页面加载那一刻**的智能体表（和提示词、问题组那两个下拉
               *   同一个做法）：刚在上面加的智能体，要刷新一次才能在这儿勾上。
               * ⚠ 要删一个智能体，**先把下面勾着它的模型取消勾选**。反过来的话
               *   登记表读不进来（registry.ts 那条对账会抛），而后台自己也读它 ——
               *   整个后台打不开，只能手改 src/data/registry.json。这是"宁可红"的代价，
               *   不是 bug：静默丢掉一个认不出来的归属，等于悄悄改写这个模型属于谁。
               */
              agents: fields.multiselect({
                label: "能在哪些智能体底下跑",
                description:
                  "★ 填了之后，后台建研究稿 / 问答时换智能体，模型那一格会自动跟上；" +
                  "而「Google Spark + GPT-6-Pro」这种不存在的组合构建期会直接红。" +
                  "一个都不勾是「还没标」（待补，不拦），和勾「不限智能体」（看过了，哪儿都能跑）" +
                  "是两回事，下拉里长得也不一样。" +
                  "⚠ 刚在上面新加的智能体，要刷新一次这个页面才会出现在这里。" +
                  "⚠ 删一个智能体之前，先把这儿勾着它的模型取消勾选 —— 否则登记表读不进来，后台打不开。",
                options: [
                  // ★ 哨兵那一档排最前：它是"我看过了"，不是"没填"，得先被看见。
                  { label: "（不限智能体 · 直接调 API 也算）", value: ANY_AGENT },
                  // ★ 只列**登记表里的 AI 产品**：「未标注」「我自己」不是产品，
                  //   一个模型不可能"跑在我自己底下"。所以这里读 REGISTRY.agents，
                  //   不是 agentOptions()（那份带着两个哨兵）。
                  ...REGISTRY.agents.map(a => ({ label: a.name, value: a.id })),
                ],
              }),
            },
            { label: "模型" }
          ),
          {
            label: "模型",
            description:
              "GPT-6、GPT-6-Pro、Opus-5、Gemini-3-Pro 这类。「未标注」那一档是内置的，不在这里。",
            itemLabel: props =>
              props.fields.name.value || props.fields.id.value || "（新条目）",
          }
        ),
      },
    }),

    /**
     * 「标签」配置页（【2026-09-21 用户要的】）—— 一个 singleton，写 src/data/tags.json。
     *
     * 四个集合的「标签」那一格就是从这张表里勾的（上面的 `tagsField()`）。
     * 在这里加一行、存盘、回去刷新一次编辑页，那一格就多一个可勾的标签。
     *
     * ★ **一行就是标签本身那几个字**，没有 id 这一层：标签的地址 `/t/<标签>` 是从
     *   这几个字算出来的，显示名就是它的身份（和智能体 / 模型那张表刻意不一样，
     *   理由写在 src/config/tags.ts 文件头）。
     * ★ 所以**改名 = 改所有用着它的条目里的那个词**：改完那些条目在后台打不开、
     *   构建也红（两处都会指出是哪一条用着哪个表里没有的标签）。红得早，不是坏得安静 ——
     *   真要改名就先把内容里的标签一起改掉，删一个还在用的标签同理。
     * ★ 顺序 = 编辑页里那一格的勾选顺序，拖一行就能换。
     * ★ 这一页写的字**上公网**（卡片、详情页、/t 两级页面），所以三道发布闸都扫它
     *   （src/config/collections.ts 的 SCANNED_DATA_FILES）。
     */
    tags: singleton({
      label: "标签",
      path: "src/data/tags",
      format: { data: "json" },
      schema: {
        tags: fields.array(
          fields.text({
            label: "标签",
            validation: { isRequired: true },
          }),
          {
            label: "标签表",
            description:
              "全站可用的标签，四个集合共用这一张表。" +
              "★ 一行一个，写成读者看得懂的词（财报 / 估值 / 券商开户）；" +
              "标的代码不要写进来，它有自己的字段。" +
              "⚠ 改名或删掉一个还被用着的标签，用着它的条目会在后台打不开、构建也会红 —— " +
              "那是故意的（比悄悄把内容从分类里摘出去强）。" +
              "★ 所以**顺序是反的**：要删一个标签，**先**去用着它的条目上把那一格的勾去掉" +
              "（那时它们还打得开），**再**回来删这一行。反过来做的话那几条就进不去了，" +
              "只能先把这一行加回来、或者手改 .md。" +
              "⚠ 大小写不算区别：「ETF」和「etf」在地址里是同一页，表里只留一个。",
            itemLabel: props => props.value || "（新标签）",
          }
        ),
      },
    }),

    /**
     * 「标的」配置页（【2026-09-22 用户要的】）—— 一个 singleton，写 src/data/symbols.json。
     *
     * 研究稿和问答的「标的」那一格就是从这张表里勾的（上面的 `symbolsField()`）。
     * 在这里加一行、存盘、回去刷新一次编辑页，那一格就多一只可勾的票。
     *
     * ★ **公司中英文名在这里填，不在条目上**。在这之前它们是每条内容自己的
     *   `symbolName` / `symbolNameEn` 两格 —— 同一只票在两条里写成两个名字不报错，
     *   `/s/<代码>` 只能"以最近写的那条为准"。多选之后更是没处放：一格勾三只票，
     *   名字逐只填不下。完整理由写在 src/config/symbols.ts 文件头。
     * ★ **代码就是身份**（进 frontmatter、进 `/s/<代码>` 那段地址），定了不要改；
     *   名字随时可以改。改代码 = 用着它的条目在后台打不开、构建也红。
     * ★ 顺序 = 编辑页里那一格的勾选顺序，拖一行就能换。
     * ★ 这一页写的名字**上公网**（标的芯片、/s 两级页面、分享卡、发帖文案、
     *   导出的 .md），所以三道发布闸都扫它（collections.ts 的 SCANNED_DATA_FILES）——
     *   那两段字原来在闸门的 subject 白名单里，搬家之后覆盖靠那一行接上。
     */
    symbols: singleton({
      label: SYMBOL_LABEL,
      path: "src/data/symbols",
      format: { data: "json" },
      schema: {
        symbols: fields.array(
          fields.object({
            code: fields.text({
              label: "代码",
              description:
                "1~5 个大写字母，如 TSLA / BRK.B。★ 它是这只票的身份 —— " +
                "进 frontmatter，也是 /s/<代码> 那段地址。定了就别改：" +
                "改了用着它的条目在后台打不开、构建也红。",
              validation: { isRequired: true, pattern: { regex: SYMBOL_RE } },
            }),
            name: fields.text({
              label: "公司中文名",
              description: "展示用。**不知道就留空，不编一个** —— 站上只印代码。",
            }),
            nameEn: fields.text({
              label: "公司英文名称",
              description:
                "如 Oracle / Qualcomm Incorporated。不知道就留空，不编。" +
                "⚠ 这一格上公网、闸门扫它 —— 从别的系统导出的表里粘过来时，" +
                "别把来源备注一起粘进来。",
            }),
          }),
          {
            label: "标的表",
            description:
              "全站写过的票，研究稿和问答的「标的」那一格共用这一张表。" +
              "★ 研究稿至多勾一只（想写两只就写两篇），问答可以勾好几只。" +
              "⚠ 改代码或删掉一行还被用着的票，用着它的条目会在后台打不开、构建也会红 —— " +
              "那是故意的（比悄悄把内容从 /s 上摘出去强）。" +
              "★ 所以**顺序是反的**：要删一只票，**先**去用着它的条目上取消勾选，" +
              "**再**回来删这一行。" +
              "★ 粘贴导入（/_import）遇到表里没有的代码会**自动加一行**并在报告里说一句 —— " +
              "和标签那张表刻意不一样：丢掉一个标的等于把那条内容从 /s 上整个摘掉。",
            itemLabel: props =>
              [props.fields.code.value, props.fields.name.value]
                .filter(Boolean)
                .join(" ") || "（新标的）",
          }
        ),
      },
    }),

    /**
     * 「回答排序」（【2026-09-21 用户要的】）—— 同一组里**几个智能体的结果谁排前面**。
     *
     * 在这之前组内顺序就是"新在前"，没有任何地方能调；而同一个选题下几份研究的
     * 先后本身是一种编排（站长想让哪一份先被读到），不该由"谁最后改过"决定。
     *
     * ★ **空着 = 还没排过**（完成态）：一切照旧按时间新在前。一个新装上的排序控件
     *   不许在没人动它的时候，悄悄把全站每一组的顺序重排一遍。
     * ★ 没列进来的智能体排在**最后**，彼此之间仍按时间 —— 后台加了个新智能体
     *   忘了来排，它只是排在后面，不会消失也不会把别人挤掉。
     * ★ 它**不**动组在列表里的位置（那仍然按"组里最新那条"）：把某个智能体拖到最前
     *   就把它参与过的每一组顶到首页最上面，那不是排序，是置顶。
     *
     * 判据、以及这几档的完整理由写在 `src/config/answerOrder.ts`。
     */
    answerOrder: singleton({
      label: "回答排序",
      path: "src/data/answerOrder",
      format: { data: "json" },
      schema: {
        agents: fields.array(
          fields.select({
            label: "智能体",
            // 选项从登记表来 —— 和下面两个集合里那两个下拉同一份 `agentOptions()`，
            // 手抄一份到这里就是"这儿列着的智能体库里不认"的那一天。
            options: agentOptions(),
            defaultValue: DEFAULT_AGENT,
          }),
          {
            label: "从上到下就是展示顺序",
            description:
              "同一个选题 / 同一个问题下有好几份结果时，它们在列表卡片和详情页那排切换里" +
              "**按这个顺序排**。拖动左边的手柄调顺序。" +
              "★ **一条都不加 = 还没排过**，按时间新在前（现在就是这样），不是出错。" +
              "★ 没加进来的智能体排在最后，彼此之间仍按时间。" +
              `当前登记表里有：${AGENTS_FOR_HINT}。` +
              "⚠ 刚在「智能体与模型」页加的智能体，要刷新一次后台才会出现在这个下拉里。" +
              "⚠ 它不改变条目在列表里的**位置**（那仍然按这一组里最新那条算）——" +
              "把谁拖到最前都不会把内容顶到首页最上面。",
            itemLabel: props =>
              agentOptions().find(o => o.value === props.value)?.label ||
              props.value ||
              "（还没选）",
          }
        ),
      },
    }),

    /**
     * 【2026-09-24 用户要的】「关于」页的微信群二维码 ＋ 页脚那条「微信交流群」，
     * 开源仓库的 README 也引用站上那张图（`/wechat-qr.png`）。
     *
     * 四档、为什么「是哪种二维码」必须显式选、失效时刻按哪一刻算，都在
     * `src/config/community.ts` 文件头。字段名、路径全从那里和 collections.ts 拿 ——
     * 读这份表的 `parseCommunity()` 按同一组常量验路径，两边各写一份就是哪天对不上而后台照常存盘。
     * ★ 字段名就是盘上的文件名（`wechatQr.png`）。
     * ★ 图落在 src/assets/community/，**不在 public/ 下**：站上发出去的是重新编码过、
     *   去掉元数据的那一份（src/utils/wechatQr.ts），原图的字节一个都不出去（坑 15）。
     * ⚠ 这一页**不 import 读那份 JSON 的模块**（src/utils/wechatGroup.ts）：表坏了的时候，
     *   能修它的地方就是这一页。
     */
    community: singleton({
      label: "微信群",
      path: COMMUNITY_FILE.replace(/\.json$/, ""),
      format: { data: "json" },
      schema: {
        [WECHAT_QR_FIELD]: fields.image({
          label: "二维码",
          description:
            "群二维码：在群聊里点右上角「…」→「群二维码」→ 再点右上角 →「保存图片」，把存下来的那张整张传上来，不用裁。" +
            "也可以传个人微信的二维码（「我」→ 头像 →「我的二维码」），读者加你好友后你再拉他进群。" +
            `只收 ${WECHAT_QR_FORMATS.join(" / ")}。` +
            "★ 留空 = 站上不显示微信群（页脚那条和「关于」页那一节都不画），不算缺东西。" +
            "⚠ 群满 200 人之后群二维码就扫不进去了（微信的限制，只能邀请）—— 到那时换成个人二维码。" +
            "⚠ 传上去的码是公开的：个人二维码上印着你的微信昵称和头像。",
          directory: COMMUNITY_ASSETS_DIR,
          publicPath: WECHAT_QR_PUBLIC_PATH,
        }),
        [WECHAT_KIND_FIELD]: fields.conditional(
          fields.select({
            label: "这是哪种二维码",
            description:
              "群二维码 7 天失效，要填失效日期；个人微信二维码不会失效。" +
              "★ 这一格没有「不知道」那一档是刻意的：群二维码忘了填日期，过期之后站上会一直挂着一张扫不进去的码。",
            options: [
              { label: "微信群二维码（7 天后失效）", value: "group" },
              { label: "个人微信二维码（不失效，加好友后拉进群）", value: "personal" },
            ],
            defaultValue: "group",
          }),
          {
            group: fields.date({
              label: "失效日期",
              description:
                "群二维码下面印着「该二维码7天内(X月X日前)有效」—— 填那一天。" +
                "从那天北京时间 0 点起，站上不再显示这张码，改成一句「已过期、站长更新后换成新的」；" +
                "换新码的时候这里跟着改。",
              validation: { isRequired: true },
            }),
            personal: fields.empty(),
          }
        ),
      },
    }),
  },

  collections: {
    posts: collection({
      label: "研究稿",
      slugField: "title",
      path: "src/content/posts/*",
      // 【2026-09-21】编辑页「…」菜单里那条 Preview（四档判据在 src/dev/previewPlan.ts）。
      previewUrl: previewUrlFor("posts"),
      format: { data: "yaml", contentField: "content" },
      // 列表页上一眼要看到的几列。
      // ★【2026-09-21 用户要的】加了 agent / model：同一个选题往往有好几份
      //   （几个智能体各写一份），列表里只印标题的话**分不出要改的是哪一份** ——
      //   标题是一样的。和 qa 那边同一个理由、同一组列（那边从一开始就有）。
      // ⚠【2026-09-22】原来这里还有一列 `symbol`。标的那一格换成多选之后**它进不了列** ——
      //   `columns` 只吃 text / select / datetime / date / checkbox / number / url / slug，
      //   `fields.multiselect` 放进来是配置求值那一刻就抛（同 tags 一直进不来）。
      //   这一列在 **Keystatic 自己那张表**里是真的丢了，不是被什么东西替代了。
      //   【2026-09-23】列表页换成了自己画的（src/dev/keystaticEntryList.ts）：「标的」那一列
      //   在那边回来了（从 .md 直接读，不走 columns），搜索也搜得到代码和公司名。
      //   这里的 columns 从此只在一种时候看得见 —— 那张表读不到数据、退回 Keystatic 原来的表。
      //   换来的是一条内容可以讲好几只票 —— 这是那次改动付的账，写在这免得被当成漏改。
      columns: ["title", "agent", "model", "pubDatetime"],
      entryLayout: "content",
      schema: {
        /**
         * ── 先选这个：新选题，还是给已有选题补一份别的智能体的研究 ──────────
         *
         * 【2026-09-20】和问答那一格**一模一样的东西**（同一个字段、同一个
         * `groupOptions()`、同一套归组判据），只是措辞换成「选题 / 研究」。
         * 同一只票同一个角度，换个智能体跑出来的结论不一样 —— 那正是这个站
         * 要给读者看的东西，所以研究稿也归组。
         *
         * ★ 和问答一样**刻意排在必填前面**（上面那条「必填在前」的例外）：
         *   它是这张表的模式开关，选「补一份研究」意味着标题、标的都照着已有那条抄。
         * ⚠ 字段名是 `questionKey`（问答先有的）。在研究稿里它是「选题组」——
         *   不为改名去动二十来处引用是定过的，理由写在 src/content.config.ts。
         */
        questionKey: fields.select({
          label: "这一条是…",
          description:
            "同一个选题想对比几个智能体写出来的研究时，第二份起在这里挑那个选题 —— " +
            "详情页会把同一组的研究并排列出来，读者点一下就能换着看，列表里也折成一张卡。" +
            "★ 只写过一份就选「这是一个新选题」，那是完成态，不是没填。" +
            "⚠ 刚在别的标签页里新建的研究稿，要刷新一次后台才会出现在这个下拉里。",
          options: groupOptions(
            postGroups,
            "① 这是一个新选题",
            "② 补一份研究："
          ),
          // select 永远有值：「新选题」存成空串，schema 那边用 z.preprocess 折成 undefined。
          defaultValue: NEW_QUESTION,
        }),

        // ★ 一个字段两件事：`title` 进 frontmatter（页面上显示的中文标题），
        //   `slug` 是**文件名**，也就是公开地址里那一段。
        //   AstroPaper 的路由就是拿文件名当 URL 的（src/utils/getPostPaths.ts），
        //   所以这里不需要另存一个 slug 字段。
        title: fields.slug({
          name: {
            label: "标题",
            description:
              "中文标题，显示在页面上。模型一般会自己写一个一级标题，直接用它。" +
              "★ 上面选了「补一份研究」的话，这一格连同标的代码、公司名**会被自动填成那一组的**，" +
              "地址也跟着重算一次 —— 不用自己抄（src/dev/keystaticGroupFill.ts）。" +
              "⚠ 填完还可以改，但改了就和同组的其他几份不一致了：列表里同一组折成一张卡、" +
              "卡上只印根那条的标题，改过的那一份在列表里连自己的标题都看不见。",
          },
          slug: {
            label: "地址（URL 里那一段）",
            description: SLUG_FIELD_DESC,
            generate: generateEntryNo,
          },
        }),
        description: fields.text({
          label: "摘要",
          multiline: true,
          description:
            "列表页和搜索引擎摘要里显示的一两句话。⚠ 它会出现在公网上，闸门一样扫它。",
          validation: { isRequired: true },
        }),
        // ══ 以下全是选填 ═══════════════════════════════════════════════
        // （时间那两格**不在这一段**：它们排在标签后面，见文件头「字段顺序」。）

        // ── 标的 ────────────────────────────────────────────────────
        symbols: symbolsField(
          "这一篇研究的是哪只票。**至多勾一只** —— 想写两只就写两篇，" +
            "否则 /s/TSLA 那页会混进「其实主要在讲 NVDA」的条目。" +
            "⚠ 勾了两只这里不会拦你，构建那一刻才会红（那条上限在 " +
            "src/content.config.ts 的 symbolsField(1) 上）。"
        ),
        // ★【2026-09-21 用户要的】「标的是怎么认出来的」挪到了这张表的**最后**
        //   （`draft` 下面）。它默认就是对的（后台填的都是「我自己填的」），
        //   放在标的那几格中间只是让每次填表多 tab 过一格。

        // ── 谁写的 ──────────────────────────────────────────────────
        // ★【2026-09-18 查出来的】这里原来是自由文本 `sourceModel`，换成了封闭枚举。
        //   那个字段**会上公网，而发布闸一个字都不看它** —— inspect.ts 只把
        //   title + description + 正文交给 scan()。于是「gemini-3-pro（跑在 example_server 上）」
        //   这种随手的备注本该命中 internal_system 规则，却根本不会触发：
        //   零症状泄露，闸门报告里照样是绿的。
        //   枚举还顺手治了另一个病：`Gemini-3-Pro` / `gemini-3-pro` / `Gemini3Pro`
        //   会把同一个模型拆成三个，而且哪一处都不报错。
        agent: fields.select({
          label: "哪个智能体写的",
          description:
            "★ 默认是**登记表里排第一的那个智能体**（要换默认就去左侧「智能体与模型」页" +
            "把那一行拖到最前）。这一篇不是它写的就记得改。" +
            "★ 改了这一格，下面「底下跑的是哪个模型」会跟着换到这个智能体底下的模型 —— " +
            "除非当前那个模型在新智能体底下也讲得通。" +
            "不记得是谁写的就选最后那项「未标注」—— 页面上显示成「来源未标注」。" +
            "那是「我没记」这一档，不是「这是我自己写的」；后者请选「我自己」。" +
            "两者不许压成同一个显示。",
          options: agentOptions(),
          // ★【2026-09-21 用户定的】默认值从哨兵换成了**登记表里排第一的那个智能体**。
          //   这里原来写着"默认值必须指向哨兵，指向一个真实智能体的话，人忘了选就会被
          //   静默标成那一个，那是替模型撒谎"—— 那个代价没有消失，只是被换掉了：
          //   select 永远有值、没有"未选择"这一档，所以这一格**不填也有值**，
          //   换了智能体而忘了改的话，文件上看不出是默认值还是人挑的，闸门不管、
          //   zod 不管、页面上和真填过的一模一样。站长每天用的就是那一个，
          //   这是拿"每次少点两下"换来的，是个决定，不是疏忽。
          //   ⚠ 连带：qa 那条「非草稿 + 还是哨兵 → 构建失败」从此**在后台这条路上
          //     再也触发不了**（它拦的是哨兵，而默认值不再是哨兵）。它仍然拦手写的
          //     frontmatter 和 `pnpm content:import` / `/_import` 进来的 ——
          //     那两条路的默认值还是哨兵（importPlan.ts / importJson.ts），刻意没跟着改：
          //     那边的值是模型吐出来的，猜错一个智能体名的代价和这里不是一回事。
          defaultValue: DEFAULT_AGENT,
        }),
        // 【2026-09-20】第二维：那个智能体底下跑的是哪个模型。登记表 src/config/models.ts。
        // ★【2026-09-21】这一格和上面那格**联动**了：换了智能体，这里和新智能体
        //   矛盾时会自动跟上（src/dev/keystaticAgentModel.ts）。判据、以及它
        //   **做不到**什么（下拉列表本身没法过滤），写在那个文件开头。
        model: fields.select({
          label: "底下跑的是哪个模型",
          description:
            "★ 换了上面那格，这一格会**自动跟上**（换成那个智能体底下的第一个模型）—— " +
            "但只在当前这个和新智能体**矛盾**时才动；停在「未标注」就一直是「未标注」，" +
            "它不会替你猜一个模型。" +
            "★ 每一项后面缀着它属于谁（「Gemini-3-Pro（Google Spark）」/「Grok-4（不限智能体）」/" +
            "「（归属未标注）」）—— 下拉**没法按当前智能体过滤**（选项在后台加载那一刻就定死了），" +
            "所以挑的时候自己看一眼后缀。挑了个不存在的组合，构建期会直接红。" +
            "★ 默认是**默认智能体底下的第一个模型**（要换默认就去左侧「智能体与模型」页" +
            "把那一行拖到它那个智能体底下其他模型的前面）。这一篇不是它跑的就记得改。" +
            "⚠ 上面选「我自己」时这一格会自动变成「未标注」—— 人写的没有模型这回事，" +
            "留着一个模型名构建会当场拦下来（那是对的：它红得早，不会悄悄发出去）。" +
            "AI 写的选了「未标注」会显示成「模型未标注」—— 那是待补。",
          options: modelOptions(),
          // ⚠ 同 agent：默认值不是哨兵，代价见上面那段。
          //   【2026-09-21】它从"登记表里第一个模型"换成了"默认智能体底下的第一个" ——
          //   前者和上面那格的默认值毫无关系，两者凑出来的可以是个不存在的组合。
          defaultValue: DEFAULT_MODEL,
        }),

        // ── 用的是哪份提示词 ────────────────────────────────────────
        // 存的是提示词的 slug（文件名）。选项标签是**中文标题**，从 src/content/prompts/ 读
        // （见文件上方 promptOptions）。「不用站上的提示词」存成空串，schema 那边把空串当没填。
        // ⚠ Astro 的 reference() 不核对目标存在；引用一份草稿或不存在的提示词会在
        //   构建期被 src/utils/resolvePromptRef.ts 拦下 —— 宁可红，不要 404 链接。
        prompt: fields.select({
          label: "用的是哪份提示词",
          description:
            "这篇研究是拿站上哪份提示词跑出来的。选了之后正文前面会链过去，提示词那一页也会反向列出这篇。" +
            "★ 默认已经选好**列表里第一份**（最常用的那份）—— 这一篇不是拿它跑的就记得换掉，" +
            "不换就等于替它认领了一份没用过的提示词，而哪一处都不会报错。" +
            "不是用站上的提示词跑的就选最后那项「不用站上的提示词」。" +
            "⚠ 标着「草稿」的那份要先发出去，否则构建失败。",
          options: promptOptions(),
          defaultValue: DEFAULT_PROMPT,
        }),

        // ── 分类与状态 ──────────────────────────────────────────────
        // 【2026-09-23 用户要的】新建时默认勾上「个股研究」—— 只有研究稿有，理由在 tags.ts。
        tags: tagsField("这一篇的策略类别、主题。", POSTS_DEFAULT_TAGS),

        // ── 时间 ────────────────────────────────────────────────────
        // 【2026-09-21 用户要的】这两格排在**标签后面**，理由见文件头「字段顺序」。
        pubDatetime: pubDatetimeField(),
        modDatetime: modDatetimeField(
          "改过正文才填。**不要动发布时间** —— 时间流按它排序，改个错字不该把三个月前的稿子顶到最前。"
        ),

        featured: fields.checkbox({
          label: "置顶到首页",
          defaultValue: false,
        }),
        draft: fields.checkbox({
          label: "草稿（不生成页面）",
          description:
            "勾上就不会有公开地址，构建期的闸门也只提醒不拦。" +
            "默认不勾：真正的发布动作是 git 提交 + 推送，那一步本身就够审慎了。",
          defaultValue: false,
        }),

        // ── 几乎不用动的那一格，排在最后 ─────────────────────────────
        symbolSource: fields.select({
          label: "标的是怎么认出来的",
          description:
            "★ 「没认出来」和「本来就不讲单只票」不是一回事：前者是待办，后者是完成态。压成一档就分不清了。" +
            "后台填的默认就是「我自己填的」，一般不用动 —— 所以它排在最后。",
          options: [
            { label: "正文里的「研究对象：」行", value: "subject_line" },
            { label: "标题里的代码", value: "title" },
            { label: "我自己填的", value: "manual" },
            { label: "没认出来（待补）", value: "unknown" },
          ],
          defaultValue: "manual",
        }),

        // ── 正文 ────────────────────────────────────────────────────
        content: fields.mdx({
          label: "正文",
          // 截图可以直接 Ctrl+V 粘进来。配置见文件上方 imageOptions 那段注释 ——
          // 尤其是"为什么必须是相对路径"那一节。
          options: { image: imageOptions("posts") },
          // ★ `extension` 只管文件叫什么名，**正文仍然按 MDX 解析**（文件开头那段）。
          extension: "md",
        }),
      },
    }),

    /**
     * 问答：**标题就是问题，正文就是回答**，必须标明是哪个智能体答的。
     *
     * 和研究稿的区别不只是长短。研究稿是"我拿 AI 做的研究"，这里是
     * "**模型的原话**，我没改写" —— 所以 `agent` 在这个集合里不是元数据，
     * 是内容本身：同一个问题不同智能体给的答案不一样，谁答的正是读者判断可信度的依据。
     * 因此它在构建期是**必填**的（content.config.ts 里有一条 superRefine 钉着：
     * 非草稿 + agent 还是哨兵 → 直接构建失败）。
     */
    qa: collection({
      label: "问答",
      slugField: "title",
      // 【2026-09-21】编辑页「…」菜单里那条 Preview（四档判据在 src/dev/previewPlan.ts）。
      previewUrl: previewUrlFor("qa"),
      // ⚠ 结尾不许再多一个斜杠。`"src/content/qa/*"` 落成扁平的
      //   src/content/qa/<slug>.md；写成 `".../*/"` 就变成 <slug>/index.md 了，
      //   而 getPostPaths 那套是按文件名算地址的。
      path: "src/content/qa/*",
      // format.data 只管 frontmatter 用 YAML 还是 JSON。
      // **落成 .md 是下面 fields.mdx({extension:"md"}) 决定的**，不是这里。
      format: { data: "yaml", contentField: "content" },
      // ★ `agent` 一定要在列表页上看得见 —— 这个集合里它是内容。
      //   （columns 只吃 text / select / datetime / date / checkbox / number / url / slug；
      //   fields.array 和 fields.multiselect 放进来是不行的，所以 tags 这类多值字段进不了列。）
      // ⚠【2026-09-22】原来这里还有一列 `symbol`。标的那一格换成多选之后**它进不了列** ——
      //   `columns` 只吃 text / select / datetime / date / checkbox / number / url / slug，
      //   `fields.multiselect` 放进来是配置求值那一刻就抛（同 tags 一直进不来）。
      //   这一列在 **Keystatic 自己那张表**里是真的丢了，不是被什么东西替代了。
      //   【2026-09-23】列表页换成了自己画的（src/dev/keystaticEntryList.ts）：「标的」那一列
      //   在那边回来了（从 .md 直接读，不走 columns），搜索也搜得到代码和公司名。
      //   这里的 columns 从此只在一种时候看得见 —— 那张表读不到数据、退回 Keystatic 原来的表。
      //   换来的是一条内容可以讲好几只票 —— 这是那次改动付的账，写在这免得被当成漏改。
      columns: ["title", "agent", "model", "pubDatetime"],
      // 屏幕窄的时候它会**静默退回**普通表单布局，不报错 —— 不是配错了。
      entryLayout: "content",
      schema: {
        /**
         * ── 先选这个：这一条是新问题，还是给已有问题补一个回答 ──────────
         *
         * 【2026-09-20】★ **这一格刻意排在必填前面**，是上面那条「必填在前」的
         * 唯一例外：它是这张表的**模式开关** —— 选「补一个回答」意味着标题、标的
         * 都照着已有那条抄，先知道这件事再动手，比填完一圈回头补要省事。
         *
         * ⚠ Keystatic 没有向导、没有自定义页面（config 里只有 ui.brand / ui.navigation），
         *   所以做不到"选完模式再换一张表"。一个排在最前面的下拉是能做到的最接近的东西。
         *
         * 值 = 那一组**第一条问答的地址**；「新问题」存空串。选项和归组规矩见
         * 上面 `groupOptions()`（研究稿那一格和它共用），判据在
         * src/utils/related.ts 的 `qaGroupKey()`。
         */
        questionKey: fields.select({
          label: "这一条是…",
          description:
            "问同一个问题、想对比几个智能体的回答时，第二条起在这里挑那个问题 —— " +
            "详情页会把同一组的回答并排列出来，读者点一下就能换着看。" +
            "★ 只问过一次就选「这是一个新问题」，那是完成态，不是没填。" +
            "⚠ 刚在别的标签页里新建的问答，要刷新一次后台才会出现在这个下拉里。",
          options: groupOptions(
            qaGroups,
            "① 这是一个新问题",
            "② 补一个回答："
          ),
          // select 永远有值：「新问题」存成空串，schema 那边用 z.preprocess 折成 undefined。
          defaultValue: NEW_QUESTION,
        }),

        title: fields.slug({
          name: {
            label: "问题",
            description:
              "问题原文，就照你问模型的那句写。它会当成页面标题显示，闸门也扫它。" +
              "★ 上面选了「补一条回答」的话，这一格连同标的代码、公司名**会被自动填成那一组的**，" +
              "地址也跟着重算一次 —— 不用自己抄（src/dev/keystaticGroupFill.ts）。" +
              "⚠ 填完还可以改，但改了就和同组的其他几条不一致了：列表里同一组折成一张卡、" +
              "卡上只印根那条的问题，改过的那一条在列表里连自己的问题都看不见。",
          },
          slug: {
            label: "地址（URL 里那一段）",
            description: SLUG_FIELD_DESC,
            generate: generateEntryNo,
          },
        }),
        description: fields.text({
          label: "一句话概括回答",
          multiline: true,
          description:
            "列表页、RSS、分享卡片用的就是这一句。⚠ 它会出现在公网上，闸门一样扫它。",
          validation: { isRequired: true },
        }),

        // ── 谁答的：Keystatic 不画 `*`，但构建期拦得死死的 ─────────────
        agent: fields.select({
          label: "哪个智能体答的",
          description:
            "★ 这个集合里「谁答的」**是内容本身**，不是元数据 —— 读者判断该不该信这条回答" +
            "靠的就是它。默认是登记表里排第一的那个智能体，**换了智能体一定要改这一格**。" +
            "★ 改了这一格，下面「底下跑的是哪个模型」会跟着换到这个智能体底下的模型 —— " +
            "除非当前那个模型在新智能体底下也讲得通。" +
            "不是模型答的、是你自己写的，就选「我自己」；那和「忘了标」是两回事。" +
            "选最后那项「未标注」的话构建期会拦，发不出去。",
          options: agentOptions(),
          // ★【2026-09-21】默认值换成登记表里第一个智能体，理由和代价见 posts 那一份
          //   （同一件事只写一处）。这里多一条：qa 的 superRefine 拦的是哨兵，
          //   而后台这条路现在填不出哨兵了 —— 那条拦截对后台建的条目**已经不会触发**。
          // ⚠ select() 在被调用那一刻就检查 defaultValue 在不在 options 里，不在就直接
          //   throw（整个后台打不开）。所以 DEFAULT_AGENT 必须是 agentOptions() 里的一项 ——
          //   登记表一条 AI 智能体都没有时它退回哨兵，那一项永远在（src/config/agents.ts）。
          defaultValue: DEFAULT_AGENT,
        }),
        // 【2026-09-20】第二维。问答里它和 agent 一样是内容本身：
        //   AI 答的、非草稿、这一格还是「未标注」→ 构建期拦（content.config.ts 的 checkAgentModel）。
        // ★【2026-09-21】和上面那格联动，同 posts（判据在 src/config/models.ts，
        //   动表单的那段在 src/dev/keystaticAgentModel.ts）。
        model: fields.select({
          label: "底下跑的是哪个模型",
          description:
            "★ AI 答的必填：同一个智能体换个模型，答案就不一样，读者要靠它判断。" +
            "换了上面那格，这一格会自动跟上（只在和新智能体矛盾时才动）；" +
            "默认是**默认智能体底下的第一个模型**，**换了模型一定要改这一格**。" +
            "★ 每一项后面缀着它属于谁 —— 下拉没法按当前智能体过滤，挑的时候自己看一眼；" +
            "挑了个不存在的组合，构建期会直接红。" +
            "上面选「我自己」时这一格会自动变成「未标注」（留着模型名构建期会拦）。",
          options: modelOptions(),
          // ⚠ 同 agent：默认值不是哨兵，代价见 posts 那一份；
          //   【2026-09-21】它现在是"默认智能体底下的第一个"，不是"表里第一个"。
          defaultValue: DEFAULT_MODEL,
        }),

        // ══ 以下全是选填 ═══════════════════════════════════════════════
        // （时间那几格**不在这一段**：它们排在标签后面，见文件头「字段顺序」。）

        // ── 标的 ────────────────────────────────────────────────────
        symbols: symbolsField(
          "这一条问的是哪几只票。**可以勾好几只** —— 一个问题同时讲 " +
            "ARM / INTC / AMD 是常态，勾上的每一只的 /s/<代码> 页都会收进这一条。" +
            "问的是宏观、概念、方法论就一个都不勾。"
        ),
        // ★【2026-09-21 用户要的】「标的是怎么认出来的」挪到了这张表的最后，同 posts。

        // ── 分类与状态 ──────────────────────────────────────────────
        tags: tagsField("这一条问的是什么主题。"),

        // ── 时间 ────────────────────────────────────────────────────
        // 【2026-09-21 用户要的】这几格排在**标签后面**，理由见文件头「字段顺序」。
        pubDatetime: pubDatetimeField(),
        modDatetime: modDatetimeField(
          "改过回答才填。**不要动发布时间** —— 时间流按它排序，改个错字不该把三个月前的问答顶到最前。"
        ),
        timezone: fields.text({
          label: "时区（几乎总是留空）",
          description:
            "IANA 名字，如 America/New_York。留空 = 跟站点设置（北京时间）。" +
            "只有这一条要按别的时区显示时才填。" +
            "⚠ 鼠标放在时间上时出现的那几个字「北京时间」（以及下载的 .md 里那一行）" +
            "是**写死的字面量**（i18n 的 `post.timezoneLabel`），**不跟着这一格走**：" +
            "填了别的时区，站上就是一个时区的读数配另一个时区的名字，" +
            "而页面、构建、闸门四处全绿。真要按别的时区显示，先去改那个标签。",
        }),

        featured: fields.checkbox({
          label: "置顶到首页",
          defaultValue: false,
        }),
        draft: fields.checkbox({
          label: "草稿（不生成页面）",
          description:
            "勾上就不会有公开地址，构建期的闸门也只提醒不拦，「必须标智能体」那条也不查。" +
            "默认不勾：真正的发布动作是 git 提交 + 推送，那一步本身就够审慎了。",
          defaultValue: false,
        }),

        // ── 几乎不用动的那一格，排在最后 ─────────────────────────────
        symbolSource: fields.select({
          label: "标的是怎么认出来的",
          description:
            "★ 「没认出来」和「本来就不讲单只票」不是一回事：前者是待办，后者是完成态。压成一档就分不清了。" +
            "后台填的默认就是「我自己填的」，一般不用动 —— 所以它排在最后。",
          options: [
            { label: "正文里的「研究对象：」行", value: "subject_line" },
            { label: "标题里的代码", value: "title" },
            { label: "我自己填的", value: "manual" },
            { label: "没认出来（待补）", value: "unknown" },
          ],
          // 后台里填的都是人手填的，所以默认 manual。
          // （schema 那侧的默认值是 unknown —— 那一档管的是**不经后台**落进来的文件：
          //   frontmatter 里压根没有这个 key 时才轮到它。）
          defaultValue: "manual",
        }),

        // ── 回答 ────────────────────────────────────────────────────
        content: fields.mdx({
          label: "回答",
          options: { image: imageOptions("qa") },
          description:
            "模型的原话，粘进来就行，不要改写。要补充自己的话就另起一段写明是你补的。",
          // ★ `extension` 只管文件叫什么名，**正文仍然按 MDX 解析**（文件开头那段）。
          //   问答这边尤其要紧：模型答"什么是市盈率"时满屏都是 `P/E < 20` ——
          //   带空格的那种不要紧，`市盈率<20` 这种会让这一条在后台编不开。
          extension: "md",
        }),
      },
    }),

    /**
     * 教程：怎么开户、怎么出入金、怎么开美国银行账户。
     *
     * ★ **字段比研究稿还少。** 一篇教程本质就是一篇带图的文章 ——
     *   给它发明分类枚举、"最后核对日期"、"图片审计"之类的专属结构，
     *   只会让每次写作多几个下拉框，而写作频率恰恰是这个模块的命门。
     *   分类用标签（和研究稿同一套），排序用时间（和研究稿同一套）。
     *
     * ⚠ 后台列表页的搜索框**只过滤 slug**（中文标题搜不到），而且 Keystatic
     *   完全没有分组能力、默认按 slug 升序。
     *   【2026-09-21】地址换成条目号之后，这个搜索框对教程**彻底没用了** ——
     *   以前 slug 写成「分类前缀-主题」（`broker-ibkr-open` / `funding-wire`），
     *   搜一个 `broker` 就等于筛出那一类，那是这个后台唯一能当分类筛选用的东西。
     *   换编号是站长在"地址短"和"后台能按前缀筛"之间的取舍，**这一条是真的丢了**，
     *   不是被什么东西替代了。要按类找就用下面的标签，或者直接在列表里翻
     *   （教程这个集合本来就不会有几十条）。
     */
    guides: collection({
      label: "教程",
      slugField: "title",
      path: "src/content/guides/*",
      // 【2026-09-21】编辑页「…」菜单里那条 Preview（四档判据在 src/dev/previewPlan.ts）。
      previewUrl: previewUrlFor("guides"),
      format: { data: "yaml", contentField: "content" },
      columns: ["title", "pubDatetime"],
      entryLayout: "content",
      schema: {
        title: fields.slug({
          name: {
            label: "标题",
            description: "中文标题，显示在页面上。",
          },
          slug: {
            label: "地址（URL 里那一段）",
            description: SLUG_FIELD_DESC,
            generate: generateEntryNo,
          },
        }),
        description: fields.text({
          label: "摘要",
          multiline: true,
          description:
            "列表页和搜索引擎摘要里的一两句话。⚠ 它会出现在公网上，闸门一样扫它。",
          validation: { isRequired: true },
        }),
        // ══ 以下全是选填 ═══════════════════════════════════════════════
        // （时间那两格**不在这一段**：它们排在标签后面，见文件头「字段顺序」。）

        tags: tagsField("教程的分类就用它。"),

        // 【2026-09-23 用户要的】标题前面那个小方块（嘉信开户挂嘉信的图标）。
        // 三档、为什么不收 SVG、为什么和截图同一个目录：src/config/entryIcon.ts 文件头。
        // ★ key 就是盘上的文件名（`icon.png`，Keystatic 拿字段 key 当文件名）——
        //   改名先读那个文件里 ENTRY_ICON_FIELD 那一段，正文截图的清洗让出了这个名字。
        // ★ 目录和 publicPath 跟正文截图走**同一个工厂**：相对路径才进 sharp（坑 15），
        //   同一个目录才让 /_publish 和批量清理不用改就认得它。
        icon: fields.image({
          label: "图标",
          description:
            "选填。列表卡片和详情页标题前面那个小方块 —— 讲哪一家就传哪一家的（嘉信开户传嘉信的）。" +
            "最合适的是 App Store 里那种正方形、自带底色的 App 图标，至少 256×256；" +
            "透明底的 logo 会垫一块白底，深色模式下也看得清。" +
            "没有对应机构的教程就留空 —— 留空什么都不画，不算缺东西。" +
            `⚠ 只收 ${ENTRY_ICON_FORMATS.join(" / ")}：SVG 会在构建时报错` +
            "（Astro 会把 SVG 原样发到公网，里面可以带脚本）。",
          ...imagePaths("guides"),
        }),

        // ── 时间 ────────────────────────────────────────────────────
        // 【2026-09-21 用户要的】这两格排在**标签后面**，理由见文件头「字段顺序」。
        pubDatetime: pubDatetimeField(),
        modDatetime: modDatetimeField(
          "改过就填。教程尤其要填 —— 券商的界面和流程改得很勤，" +
            "读者要靠这个时间判断这篇还作不作数。"
        ),

        featured: fields.checkbox({
          label: "置顶到首页",
          defaultValue: false,
        }),
        draft: fields.checkbox({
          label: "草稿（不生成页面）",
          defaultValue: false,
        }),

        // ── 正文 ────────────────────────────────────────────────────
        content: fields.mdx({
          label: "正文",
          description:
            "截图直接 Ctrl+V 粘进来就行。选中图片点铅笔可以填 alt（读屏和搜索会用它，" +
            "也是搜索结果里那张图的说明）。" +
            "⚠ 截图里的账号 / 余额 / 持仓请在截图时就裁掉或打码 —— " +
            "发布闸只看文本，它看不见图片内容。",
          options: { image: imageOptions("guides") },
          extension: "md",
        }),
      },
    }),

    /**
     * 提示词：我自己在用的那几份研究 / 交易提示词，以及**读者投来的**。
     *
     * ## 投稿是怎么进来的
     *
     * 这个站没有服务端、没有公网后台（Keystatic 只在 `pnpm dev` 里挂着），
     * 所以**没有"提交表单"这回事**。投稿走的是：
     *
     *     读者发邮件 → 我看一遍 → 在这个后台建一条 → 提交 → 构建 → 上站
     *
     * 也就是说**每一条投稿都经过人手和三道发布闸**，和我自己写的走完全同一条路。
     * 页面上那块投稿说明在 `src/components/PromptSubmit.astro`，
     * 邮箱地址从 `astro-paper.config.ts` 的 socials 取，**不在任何地方手抄第二份**。
     *
     * ⚠ 投稿的正文是**别人写的字**，比我自己粘进来的更该过一眼：
     *   闸门只认几种第一人称写法（docs/gate.md 第 8 节列着它挡不住什么），
     *   而"提示词"这种体裁天然会夹带作者的交易背景。
     *
     * ★ **字段和教程一模一样，只多了「谁写的」+「投稿人署名」。**
     *   尤其是**没有「版本」这个字段** ——
     *   它会是一个上公网、而发布闸一个字都不看的自由文本框
     *   （闸门只扫 title / description / symbolName / tags / 正文）。
     *   版本号写进标题（「…提示词 v4」）和正文第一行，那两处都在射程内。
     *
     * ⚠ slug **发布后不要改，也不要跟着版本号走**：一份提示词一个地址，
     *   出了新版是改同一条（正文换掉、填「更新时间」），这样分享出去的链接
     *   永远指向当前在用的那一版。slug 里带 v2 的话，每升一版就把旧链接打死一次。
     */
    prompts: collection({
      label: "提示词",
      slugField: "title",
      path: "src/content/prompts/*",
      // 【2026-09-21】编辑页「…」菜单里那条 Preview（四档判据在 src/dev/previewPlan.ts）。
      previewUrl: previewUrlFor("prompts"),
      format: { data: "yaml", contentField: "content" },
      columns: ["title", "pubDatetime"],
      entryLayout: "content",
      schema: {
        title: fields.slug({
          name: {
            label: "标题",
            description:
              "显示在页面上。版本号直接写进标题（「…提示词 v4」）—— " +
              "这个集合刻意没有单独的版本字段，理由见 src/content.config.ts。",
          },
          slug: {
            label: "地址（URL 里那一段）",
            description:
              SLUG_FIELD_DESC +
              "⚠ **不要把版本号写进地址** —— 出新版是改同一条，地址不变，" +
              "已经分享出去的链接才不会每升一版就死一次。",
            generate: generateEntryNo,
          },
        }),
        description: fields.text({
          label: "摘要",
          multiline: true,
          description:
            "这份提示词是干什么用的、交付什么。⚠ 它会出现在公网上，闸门一样扫它。",
          validation: { isRequired: true },
        }),
        // ── 谁写的（投稿模块的核心信息）──────────────────────────────
        // ★ 三档，和问答的「哪个智能体答的」同一个位置、同一条纪律：
        //   一份来路不明的交易提示词，读者没有任何依据判断该不该照着用。
        //   Keystatic 不给 select 画 `*`，但构建期拦得死死的 —— 所以它排在必填那一段。
        //   ⚠ **value 一律从 src/config/promptOrigins.ts 取，不在这里写字面量**：
        //     后台存 "contributed"、判据比 "contribution" 的后果是每一条投稿都
        //     显示成「来源未标注」，而后台、构建、闸门四处全绿。
        //     （文案是另一回事 —— 后台这几句只有中文、只给我自己看，所以写在这。）
        origin: fields.select({
          label: "这份提示词是谁写的",
          description:
            "★ 必填：**留在「未标注」就发不出去**，构建期会拦。" +
            "网友投来的选「网友投稿」并在下面写署名；自己写的选「站长自己在用的」。",
          options: [
            { label: "未标注（还没选 · 发不出去）", value: UNSPECIFIED_ORIGIN },
            { label: "站长自己在用的", value: ORIGIN_SITE },
            { label: "网友投稿", value: ORIGIN_CONTRIBUTED },
          ],
          // ⚠ 同 posts / qa：select 的 defaultValue 必填、没有 validation 入参，
          //   所以这个字段永远有值。默认值必须落在哨兵上，让「还没选」成为一个
          //   能被 schema 拦下来的**显式状态**。
          defaultValue: UNSPECIFIED_ORIGIN,
        }),
        contributor: fields.text({
          label: "投稿人署名",
          description:
            "只有「网友投稿」才填，而且**必填**。投稿人要求匿名就写「匿名」—— " +
            "留空是「还没填」，两者在页面上不许长得一样。" +
            "⚠ 这一行会上公网，闸门照样扫它（投稿人可能顺手把券商或一句持仓写进署名）。",
        }),

        // ══ 以下全是选填 ═══════════════════════════════════════════════
        // （时间那两格**不在这一段**：它们排在标签后面，见文件头「字段顺序」。）

        tags: tagsField("提示词的分类就用它。"),

        // ── 时间 ────────────────────────────────────────────────────
        // 【2026-09-21 用户要的】这两格排在**标签后面**，理由见文件头「字段顺序」。
        pubDatetime: pubDatetimeField(),
        modDatetime: modDatetimeField(
          "改过正文才填。提示词尤其要填 —— 读者要靠它判断手上这份是不是最新的那一版。" +
            "**不要动发布时间。**"
        ),

        featured: fields.checkbox({
          label: "置顶到首页",
          defaultValue: false,
        }),
        draft: fields.checkbox({
          label: "草稿（不生成页面）",
          defaultValue: false,
        }),

        // ── 正文 ────────────────────────────────────────────────────
        content: fields.mdx({
          label: "正文",
          description:
            "提示词全文，原样粘进来。⚠ 提示词里最容易夹带的是**你自己的交易背景**" +
            "（在哪家券商、哪一笔亏过、常用多大风险）—— 那几句对读者没有用，" +
            "而且发布闸多半抓不到它们（它只认第一人称锚点）。粘之前自己过一眼。",
          options: { image: imageOptions("prompts") },
          extension: "md",
        }),
      },
    }),

    /**
     * 常用提示词（【2026-09-20 加】）—— 给站长自己用的一组提示词，**不上公网、不过闸**。
     *
     * 第一条是「整理成发布用 JSON」：和智能体聊完一篇研究 / 一个问题，把它贴过去，
     * 智能体把上面的内容整理成一份 JSON；再把那份 JSON 粘到 dev 页 /_import
     * （src/dev/import.astro），就会生成一条字段填好的草稿 —— 标题、摘要、标的、标签、
     * 智能体、模型、提示词 / 问题组一次到位，不用在表单里逐格填。
     *
     * 提示词里可以写 {{agents}} / {{models}} 两个占位符，/_import 那页会换成当前登记表里的
     * id 和名字 —— 后台加了模型不用回来改这段字。
     *
     * 存成 src/data/system-prompts/<id>.json：不在 src/content 下（它不是内容集合，
     * 不生成页面，coverage.test.ts 的对账不认它），也不在 src/config 下（它是数据）。
     * 正文用多行文本，不用 mdx —— 提示词里满是 `<`、`{`，MDX 会把它们当标签（docs/engineering-notes.md 坑 19）。
     */
    systemPrompts: collection({
      label: "常用提示词",
      slugField: "title",
      path: "src/data/system-prompts/*",
      format: { data: "json" },
      columns: ["title"],
      schema: {
        title: fields.slug({
          name: {
            label: "名称",
            description: "给自己看的名字，如「整理成发布用 JSON」。",
          },
          slug: {
            label: "id（文件名）",
            description: "纯 ASCII，如 publish-json。",
          },
        }),
        note: fields.text({
          label: "什么时候用",
          multiline: true,
          description: "一两句话：这段提示词在哪一步贴给谁、拿回来的东西往哪儿放。",
        }),
        prompt: fields.text({
          label: "提示词全文",
          multiline: true,
          description:
            "原样贴给智能体的那段字。可以写 {{agents}} / {{models}} 两个占位符，" +
            "/_import 页会换成当前登记表里的智能体和模型 id。",
          validation: { isRequired: true },
        }),
      },
    }),
  },
});
