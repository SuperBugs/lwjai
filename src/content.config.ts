import { defineCollection, reference } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";
import config from "@/config";
import { AGENT_IDS, findAgent, UNSPECIFIED_AGENT } from "./config/agents";
import {
  agentModelMismatch,
  MODEL_IDS,
  UNSPECIFIED_MODEL,
} from "./config/models";
import { QUESTION_KEY_HINT, QUESTION_KEY_RE } from "./config/questionKey";
import { SYMBOL_RE, SYMBOL_SOURCES } from "./config/symbol";
import { unknownSymbols, unknownSymbolsMessage } from "./config/symbols";
import {
  ORIGIN_CONTRIBUTED,
  ORIGIN_SITE,
  PROMPT_ORIGIN_IDS,
  UNSPECIFIED_ORIGIN,
} from "./config/promptOrigins";
import { requireCollectionSpec } from "./config/collections";
import { unknownTags, unknownTagsMessage } from "./config/tags";
import { idFromEntryPath, isEntryNo } from "./config/entryNo";
import { entryIconFormatIssue, entryIconFormatOf } from "./config/entryIcon";

/**
 * ★ 值从内容集合登记表来，**不再在这里写死一份路径字符串**。
 *
 * 【2026-09-18 侦察实测】之前这里是 `"src/content/posts"`，而
 * `scripts/gate/check.ts` 里另有一份 `join(process.cwd(), "src", "content", "posts")`
 * —— 两份各自写死，改一边不会有任何报错。更难看的是 check.ts 的故障文案还叫人
 * 「检查 content.config.ts 里的 BLOG_PATH」，而它从头到尾没读过这个常量。
 *
 * 常量本身继续导出：`src/utils/getPostPaths.ts` 在用它（上游合并友好）。
 */
export const BLOG_PATH = requireCollectionSpec("posts").dir;

/**
 * 有详情路由的四个集合共用的 loader —— 和 `pages` 的区别只有一件事：
 * **文件名必须是一个条目号**（`1002.md`），不是就抛。
 *
 * ## 为什么这道检查非有不可
 *
 * 【2026-09-21】地址换成全站统一的递增数字之后，"下一个号"在三个地方算
 * （后台、`pnpm content:import`、`/_import`），其中**后台那一处拿不到可靠的当前最大号**：
 * Keystatic 的 slug `generate` 是同步的、只拿得到标题，只能读 `import.meta.glob` 的快照。
 * 一次会话里连建两条、快照还没刷新，两条就会算出同一个号 —— 而 **Keystatic 撞名是
 * 静默加 `-2` 后缀**（keystatic.config.ts 那一段注释里记着）。地址于是变成 `/r/1008-2`：
 * 页面打得开、构建是绿的、闸门也不看文件名，**四处零症状**，只有编号体系整个失效了。
 *
 * 所以这一处必须会红，而且要红得早：`generateId` 在 `astro dev` 的内容同步阶段就跑，
 * 后台那边刚 Create 完，这边的终端就炸了 —— 等不到构建，更等不到部署。
 *
 * ★ 这和 `nextEntryNo()` 是**两件事、两个落点**：那个函数忽略认不出的 id（它跑在
 *   浏览器的表单里，抛一次就是一格永远填不出来的地址），"盘上有个坏文件名"由这里说。
 *   别让一个替另一个背书。
 */
function numberedGlob(key: string) {
  const spec = requireCollectionSpec(key);
  return glob({
    pattern: "**/[^_]*.{md,mdx}",
    base: `./${spec.dir}`,
    generateId: ({ entry }) => {
      const id = idFromEntryPath(entry);
      if (!isEntryNo(id)) {
        throw new Error(
          `${spec.dir}/${entry} 的文件名不是一个条目号。\n` +
            `${spec.label}的地址是全站统一的递增数字（/${spec.urlPrefix}/1002），` +
            `所以文件名只许是 1000、1001… 这样的十进制数字（至少四位，不许前导零 ——\n` +
            `  列表页的分页也是数字地址，/${spec.urlPrefix}/2 是第 2 页）。\n` +
            `两种常见来路：\n` +
            `  1. 后台建条目时撞了号 —— Keystatic 会静默加一个 -2 后缀（就是这一条）。` +
            `把它改名成下一个没被占用的号，或者删掉重建。\n` +
            `  2. 手写的文件名 —— 地址不再自己起名了，判据在 src/config/entryNo.ts。`
        );
      }
      return id;
    },
  });
}

/**
 * 标的代码的正则和「怎么认出来的」四档，【2026-09-20】挪到了 `src/config/symbol.ts`
 * （零 import：导入脚本 scripts/content/import.ts 是裸 tsx 跑的，也要用同一份）。
 * 这里 re-export，原来的调用方不用改。四档的说明在那边。
 */
export { SYMBOL_RE, SYMBOL_SOURCES };

// ── 三个集合共用的校验 ───────────────────────────────────────────────
// ★ 写成函数而不是在每个集合里抄一遍：判据抄第二份的那天，就是三个集合开始
//   各说各话的那天。作者的另一个项目出过的最贵那个 bug 正是"同一个判据两处各写一份、
//   其中一处错了而全绿"（docs/gate.md 第 7 节）。

/**
 * **指向另一条内容**的那几格（`prompt` / `questionKey`）共用的清洗。两件事：
 *
 *   - **空串折成 undefined。** 后台那两格都是 select，而 select 永远有值：
 *     「不用站上的提示词」/「这是一组里的第一条」存下来是空串。不折的话
 *     `reference()` 会包出一个 `{ id: "" }`，`resolvePromptRef` 当场抛
 *     「引用的提示词不存在」，而作者明明选的是"不用"。
 *   - **数字折成字符串。**【2026-09-21】地址换成数字之后，这两格存的值就是
 *     `"1000"` 这样的号。Keystatic 和 `content:import` 写出来的都是带引号的
 *     （`prompt: "1000"`），但手写一行 `prompt: 1000` 是必然会发生的事 —— YAML 把它读成
 *     **number**，zod 报一句「Expected string, received number」，而人看着那一行
 *     完全正常。折一下比让人对着一个不像错的错误发呆强。
 *     ⚠ 这也是 `entryNo.ts` 不许前导零的理由之一：`prompt: 01000` 会被 YAML 读成
 *     别的数，折出来就是个**指错的引用**，而且哪儿都不报错。
 */
const entryRefValue = (value: unknown) =>
  value === "" ? undefined : typeof value === "number" ? String(value) : value;

/**
 * 标签那一格 —— **四个集合共用这一个工厂**。【2026-09-21 用户要的】
 *
 * 标签从"四个手打的文本框"变成了**封闭词表**（后台左侧「标签」那一页，
 * 数据在 src/data/tags.json，判据在 src/config/tags.ts）。这里拦的是**不经后台**
 * 落进来的文件：手写的 frontmatter、`pnpm content:import`、/_import。
 *
 * ★ 判据只有 `unknownTags()` 一处，后台那一格的选项 `tagOptions()` 和它读的是同一张表 ——
 *   在这儿另写一份 `TAGS.includes(...)` 就是"后台说这个标签不存在、构建说没问题"的那天。
 * ★ 四处各写一份 `z.array(z.string())` 是这件事的**零症状**版本：漏掉的那个集合
 *   从此可以夹带任何标签，而 /t 上会多出一个只有一条内容的孤儿页面，
 *   后台、构建、闸门四处全绿。所以这里是一个工厂，不是四行抄出来的。
 */
const tagsField = () =>
  z
    .array(z.string())
    .default([])
    .superRefine((tags, ctx) => {
      const unknown = unknownTags(tags);
      if (unknown.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["tags"],
          message: unknownTagsMessage(unknown),
        });
      }
    });

/**
 * 标的那一格 —— **posts / qa 共用这一个工厂**。【2026-09-22 用户要的多选】
 *
 * 值是**一串代码**，每个都必须在标的表里（`src/data/symbols.json`，后台「标的」那一页）。
 * 名字（中文 / 英文）不在条目上，在那张表里 —— 理由写在 `src/config/symbols.ts` 文件头。
 *
 * ★ 判据只有 `unknownSymbols()` 一处，后台那一格的选项 `symbolOptions()` 读同一张表。
 *   在这儿另写一份 `SYMBOL_CODES.includes(...)` 就是"后台说这只票不存在、构建说没问题"的那天。
 *
 * @param max 最多几只。**研究稿传 1**：一篇研究稿至多一只主标的（想写两只就写两篇），
 *   否则 `/s/TSLA` 那一页上会出现"这篇其实主要在讲 NVDA"的条目。
 *   ⚠ 这条纪律原来是**结构性**的（那一格是单个字符串，填不下第二只）；
 *     两个集合的形状统一成列表之后，它变成了一条**会红的检查** ——
 *     也就是说后台里勾得到两只，要到构建那一刻才拦下来。这是那次统一的代价，
 *     写在这里免得下一个人以为是漏改。问答不传：一条问答涉及好几只票是常态
 *     （「CPU 为什么暴涨」同时讲 ARM / INTC / AMD），那正是这一格改成多选的理由。
 */
const symbolsField = (max?: number) =>
  z
    .array(z.string())
    .default([])
    .superRefine((codes, ctx) => {
      const unknown = unknownSymbols(codes);
      if (unknown.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["symbols"],
          message: unknownSymbolsMessage(unknown),
        });
      }
      if (new Set(codes).size !== codes.length) {
        ctx.addIssue({
          code: "custom",
          path: ["symbols"],
          message: "同一只票勾了两次 —— /s 那几页会把这一条数两遍。",
        });
      }
      if (max !== undefined && codes.length > max) {
        ctx.addIssue({
          code: "custom",
          path: ["symbols"],
          message:
            `一篇研究稿至多 ${max} 只主标的，这里有 ${codes.length} 只（${codes.join(" / ")}）。\n` +
            `想写两只就写两篇 —— 否则 /s/<代码> 那一页上会出现"这篇其实主要在讲另一只"的条目。\n` +
            `（一条内容真的同时讲好几只票，那是问答那一侧的形状，它没有这条上限。）`,
        });
      }
    });

/** 标的与"它是怎么认出来的"之间的一致性。posts / qa 共用。 */
function checkSymbolSource(
  data: { symbols: string[]; symbolSource: (typeof SYMBOL_SOURCES)[number] },
  ctx: z.RefinementCtx
) {
  if (data.symbols.length > 0 && data.symbolSource === "unknown") {
    ctx.addIssue({
      code: "custom",
      path: ["symbolSource"],
      message:
        "勾了标的就说明认出来了，symbolSource 不该还是 unknown（人工填的写 manual）。",
    });
  }
}

/**
 * 智能体与模型两维之间的一致性。posts / qa 共用。判的是登记表里的 `kind`，
 * 不是 id 字面量（docs/engineering-notes.md 第二节）。
 *
 *   - 「我自己」写的却填了模型 → 报错。人写的没有模型这回事，这一格填了只能是选错行。
 *   - **这个组合在登记表里不存在** → 报错。【2026-09-21 加】判据在 models.ts 的
 *     `agentModelMismatch()`（后台那两格的联动读同一份），三档里只有"模型明确登记在
 *     别的智能体底下"这一档会拦；"归属还没标"放行 —— 不知道就不许断言错配。
 *     ★ **和草稿无关，一律拦。** 和上面「我自己却填了模型」同一类：它不是"还没填完"，
 *       是**两格互相矛盾**，多半是换了模型忘了改智能体（反过来也一样）。
 *       待补那类（下面 requireModel 那条）才放草稿一马。
 *     ★ 拦得早比发出去强：这两格是读者判断该不该信一条结论的依据，印一个不存在的
 *       组合就是在编出处 —— 而 zod 的两个 z.enum 各自都是绿的，闸门不看 frontmatter
 *       这两格，页面照印两张芯片。在这一处红之前，没有任何一处会发现。
 *   - `requireModel`（qa 用）：非草稿 + 智能体是 AI 产品 + 模型还是哨兵 → 报错。
 *     问答的核心信息是"谁答的"，而现在"谁"是两维：Codex 底下跑 GPT-5 和跑别的，
 *     答案不一样。研究稿不拦 —— 页面上显示成「模型未标注」（待补），
 *     理由同它对 agent 的宽松：研究稿的作者信息是补充，不是内容本身。
 *   - 智能体没标、模型标了：放行。"知道模型、不知道产品"是真会发生的（直接调 API）。
 */
function checkAgentModel(
  data: { draft?: boolean; agent: string; model: string },
  ctx: z.RefinementCtx,
  requireModel: boolean
) {
  const kind = findAgent(data.agent)?.kind;
  const mismatch = agentModelMismatch(data.agent, data.model);
  if (mismatch) {
    ctx.addIssue({ code: "custom", path: ["model"], message: mismatch });
  }
  if (kind === "human" && data.model !== UNSPECIFIED_MODEL) {
    ctx.addIssue({
      code: "custom",
      path: ["model"],
      message:
        "agent 选的是「我自己」，model 却填了一个模型 —— 人写的没有模型这回事。" +
        "是 AI 写的就把 agent 改成那个智能体；真是自己写的就把 model 改回 unspecified。",
    });
  }
  if (
    requireModel &&
    data.draft !== true &&
    kind === "ai" &&
    data.model === UNSPECIFIED_MODEL
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["model"],
      message:
        "问答发布前必须标明底下跑的是哪个模型 —— 同一个智能体换个模型，答案就不一样。" +
        "不记得就先留草稿。",
    });
  }
}

const posts = defineCollection({
  loader: numberedGlob("posts"),
  schema: ({ image }) =>
    z
      .object({
        author: z.string().default(config.site.author),
        pubDatetime: z.date(),
        modDatetime: z.date().optional().nullable(),
        title: z.string(),
        featured: z.boolean().optional(),
        draft: z.boolean().optional(),
        tags: tagsField(),
        ogImage: image().or(z.string()).optional(),
        description: z.string(),
        canonicalURL: z.string().optional(),
        hideEditPost: z.boolean().optional(),
        timezone: z.string().optional(),

        // ── 牢玩家加的几项 ──────────────────────────────────────────

        /**
         * 研究对象的交易代码 —— **值是标的表里那几行的代码**（后台「标的」那一页）。
         *
         * 【2026-09-22】换掉了原来的 `symbol` / `symbolName` / `symbolNameEn` 三格：
         * 公司名搬进了那张表（`src/config/symbols.ts` 文件头写着为什么），
         * 条目上只留代码。研究稿这一格**至多一只**，见 `symbolsField()` 的 `max`。
         *
         * ★ 名字搬走之后，这一格再没有自由文本了 —— 原来那两格是
         *   `scripts/gate/inspect.ts` 的 subject 白名单成员（「Tesla, Inc.
         *   （example_server 自动带出）」那种），现在闸门改扫那张表本身
         *   （`SCANNED_DATA_FILES`）。覆盖没断，换了个落点。
         */
        symbols: symbolsField(1),

        symbolSource: z.enum(SYMBOL_SOURCES).default("unknown"),

        /**
         * 哪个智能体写的（Google Spark / OpenAI ChatGPT / Anthropic Claude / OpenAI Codex / 我自己）。**封闭枚举**
         * （登记表在 `src/config/agents.ts`）。
         *
         * 【2026-09-18 换掉了 `sourceModel: z.string().optional()`】那个字段是
         * **上公网的自由文本，而闸门一个字都不看** —— `scripts/gate/inspect.ts`
         * 只把 title + description + 正文拼进 `scan()`，frontmatter 的其余部分
         * 全在射程之外。于是往里填「gemini-3-pro（跑在 example_server 上）」
         * 本该命中 `internal_system` 规则，实际上完全不会触发，而这行字会
         * 原样印在文章底部。换成封闭枚举之后这个泄露向量直接消失 ——
         * 枚举里只有那么几个 id，没有一个能夹带自由文本。
         *
         * 默认值是哨兵 `unspecified`，页面上显示「来源未标注」而不是空白：
         * 那一档是"我没记"，不是"这是我自己写的"（"我自己写的"是 `human`）。
         */
        agent: z.enum(AGENT_IDS).default(UNSPECIFIED_AGENT),

        /**
         * 那个智能体底下**跑的是哪个模型**（GPT-5 / Opus-5 / Gemini-3-Pro …）。
         * 【2026-09-20】和 `agent` 拆成两维：同一个产品底下的模型会换，换了答案就不一样。
         * 同样是封闭枚举（`src/config/models.ts`），同样哨兵默认。
         * 和 agent 的一致性由下面 checkAgentModel 管：「我自己」写的不许填模型；
         * 【2026-09-21】**这个组合还得在登记表里存在** —— 每个模型登记着它能在哪些
         * 智能体底下跑，`agent: spark` + `model: gpt-6-pro` 这种构建期直接红。
         * 研究稿**不强制**填 —— AI 写的没标模型显示成「模型未标注」（待补）。
         */
        model: z.enum(MODEL_IDS).default(UNSPECIFIED_MODEL),

        /**
         * 这篇是用站上哪份提示词跑出来的。**引用，不是自由文本**：值是 prompts 集合里
         * 那一条的 id（文件名），页脚链过去，提示词那一页反向列出这篇。
         *
         * ⚠ Astro 7 的 `reference()` **不核对目标存在** —— 它只把字符串包成
         *   `{ id, collection }`（runtime.js 的 createReference）。存在与否、是不是草稿，
         *   由 `src/utils/resolvePromptRef.ts` 在详情页查，查不到就让构建红。
         *   （【2026-09-23】导出口不再带 frontmatter，那一处调用跟着删了。）
         *   没引用 = 这篇不是用站上的提示词跑的（完成态），页面上什么都不显示。
         *
         * 【2026-09-20】后台那个下拉框换成了 select（为了显示中文标题，见 keystatic.config.ts），
         * select 永远有值，「不用站上的提示词」存成**空串**。所以这里先把空串折成 undefined：
         * 不折的话 reference() 会包出一个 `{ id: "" }`，resolvePromptRef 当场抛
         * 「引用的提示词不存在」，而作者明明是选了"不用"。
         */
        prompt: z.preprocess(entryRefValue, reference("prompts").optional()),

        /**
         * 选题组：同一个选题让几个智能体各写一份研究时，详情页互相列出
         * 「其他智能体的研究」、列表里折成一张卡。
         *
         * 【2026-09-20】和 qa 的问题组**共用同一个字段名和同一套判据**
         * （`src/utils/related.ts` 的 `qaGroupKey()` / `qaSiblings()`，
         * 支持哪些集合写在那里的 `GROUPED_COLLECTIONS`）。
         * 名字沿用 `questionKey` 是刻意的：为了不给一个"换个名字"的改动
         * 去动二十来处引用（导入管线、常用提示词 JSON、导出口、五组测试、两份文档）。
         * ⚠ 所以**别按字面理解它** —— 在研究稿里它是「选题组」，界面上的措辞也是这么写的。
         *
         * 其余规矩逐条同 qa 那一份：封闭格式、空串折 undefined、没填 = 只写过一份
         * （完成态，且它可以当一组的根）、填了没对上 = 页面印「目前只有这一份」（待补）。
         */
        questionKey: z.preprocess(
          entryRefValue,
          z.string().regex(QUESTION_KEY_RE, QUESTION_KEY_HINT).optional()
        ),
      })
      .superRefine((data, ctx) => {
        checkSymbolSource(data, ctx);
        checkAgentModel(data, ctx, false);
      }),
});

/**
 * 问答：**标题是问题、正文是回答、必标哪个智能体答的**。
 *
 * ## 为什么问题存在 `title` 里，而不是一个叫 `question` 的字段
 *
 * `scripts/gate/inspect.ts` 只认 `data.title` / `data.description`，而且用的是
 * `?? ""` 兜底。换成别的键名的后果是：闸门会**"成功扫描"一个空标题** ——
 * 报告里照常计入「扫了 N 篇」、退出码 0、屏幕上一句「✓ 没命中已知的危险说法」，
 * 而问题文本从未进过 `scan()`。零症状漏扫，正是这个项目最不能接受的形态。
 *
 * 同理 `pubDatetime` / `modDatetime` / `timezone` / `draft` 是 `Datetime.astro`
 * 与 `postFilter.ts` 的接口，`tags` 在 `getUniqueTags` 里是必填 `string[]`。
 * 这些键名是既有工具链的接口，不是风格问题。
 */
const qa = defineCollection({
  loader: numberedGlob("qa"),
  schema: z
    .object({
      /** 问题本身。原样问、原样留着，不改写成陈述句。 */
      title: z.string(),
      /** 一句话概括这个回答。RSS / 列表 / OG 用它 —— 所以它和标题一样上公网、
       *  一样被闸门扫。 */
      description: z.string(),
      pubDatetime: z.date(),
      modDatetime: z.date().optional().nullable(),
      draft: z.boolean().optional(),
      timezone: z.string().optional(),
      tags: tagsField(),
      featured: z.boolean().optional(),

      /**
       * 这一条问的是哪几只票 —— **可以是好几只**（【2026-09-22 用户要的】：
       * 「一个问答可能涉及多个标的」，比如「CPU 为什么暴涨」同时讲 ARM / INTC / AMD）。
       * 研究稿那一格是同一个工厂、同一张表，只是那边有「至多一只」的上限。
       *
       * 值是标的表里那几行的代码；公司名在那张表里，不在这里（见 posts 那一格）。
       */
      symbols: symbolsField(),
      symbolSource: z.enum(SYMBOL_SOURCES).default("unknown"),

      /**
       * 哪个智能体答的。**这是这个模块的核心信息** —— 同一个问题不同智能体给的答案
       * 不一样，这个标记正是读者判断可信度的依据。所以下面 superRefine 里多一条：
       * 非草稿 + 还是哨兵 = 发不出去。
       */
      agent: z.enum(AGENT_IDS).default(UNSPECIFIED_AGENT),

      /**
       * 那个智能体底下跑的是哪个模型。问答里它和 agent 一样是**内容本身**：
       * 非草稿 + AI 答的 + 模型还是哨兵 = 发不出去（checkAgentModel 的第二条）。
       */
      model: z.enum(MODEL_IDS).default(UNSPECIFIED_MODEL),

      /**
       * 问题组：同一个问题问了几个智能体时，详情页互相列出「其他智能体的回答」。
       * **封闭格式**（小写 ASCII slug，`src/config/questionKey.ts`），不是自由文本 ——
       * 它上公网而闸门不扫，和文件名同一类东西。
       *
       * 【2026-09-20】值的含义变了一半：现在它是**这一组里第一条问答的地址**
       * （后台那一格是下拉，从已有问题里挑，见 keystatic.config.ts 的 `questionOptions()`）。
       * 第一条问答自己留空 —— 它被创建的时候还没有"已有问题"可挑。
       * 归组的判据因此是「填了用键、没填用自己的地址」（`src/utils/related.ts`
       * 的 `qaGroupKey()`），★ 所以**老稿子那种"几条互相填同一个键"一个字都不用改**。
       *
       * 没填 = 只问过一次（完成态，且它可以当一组的根）；填了但没对上 =
       * 页面印「目前只有这一条回答」（待补，多半是选的那条被删了）。两档不许长得一样。
       *
       * ⚠ 后台是 select，select **永远有值**，「这是一个新问题」存成**空串**。
       *   所以先把空串折成 undefined —— 不折的话下面那条正则会把它判成格式错误，
       *   而作者明明是选了"新问题"。（和上面 posts 的 `prompt` 同一个形状。）
       */
      questionKey: z.preprocess(
        entryRefValue,
        z.string().regex(QUESTION_KEY_RE, QUESTION_KEY_HINT).optional()
      ),
    })
    .superRefine((data, ctx) => {
      checkSymbolSource(data, ctx);
      // 模型那一维：「我自己」不许填模型；非草稿 + AI 答的必须标模型。
      checkAgentModel(data, ctx, true);

      // ★ 第四条，qa 独有。为什么要拦在这里而不是"页面上显示未标注就算了"：
      //   研究稿可以是我自己写的，"哪个模型"是补充信息；问答不行 ——
      //   一条不知道是谁答的回答，读者没有任何依据判断该不该信它。
      //   （哨兵档的存在就是为了让这一刻拦得下来，见 src/config/agents.ts。）
      if (data.draft !== true && data.agent === UNSPECIFIED_AGENT) {
        ctx.addIssue({
          code: "custom",
          path: ["agent"],
          message:
            "问答发布前必须标明是哪个智能体答的 —— 这是这个模块的核心信息，不是可选的元数据。",
        });
      }
    }),
});

/**
 * 教程：怎么开户、怎么出入金、怎么开美国银行账户。**图文并茂。**
 *
 * ★ **和研究稿在结构上没有区别**，所以这份 schema 就是 posts 去掉标的那几个字段
 *   （【2026-09-23】多了一格选填的 `icon`，用户要的，传一次就不用再管，见下）。
 *   刻意不加分类表、不加"最后核对日期"、不加图片审计字段 ——
 *   一篇教程本质就是一篇带图的文章，给它发明一套专属结构只会让每次写作多几个下拉框。
 *   要分类用 `tags`（和研究稿同一套），要排序用 `pubDatetime`（和研究稿同一套）。
 *
 * ⚠ 图片的安全性**不靠这里的字段**：截图里的账号 / 余额 / 持仓由作者自己在截图时
 *   裁掉或打码。发布闸只看文本，它结构上看不见像素 —— 这一点 docs/gate.md 第 8 节
 *   一直写着，不因为这个集合的存在而改变。
 */
const guides = defineCollection({
  loader: numberedGlob("guides"),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      pubDatetime: z.date(),
      modDatetime: z.date().optional().nullable(),
      draft: z.boolean().optional(),
      timezone: z.string().optional(),
      /** 分类就用标签：`券商开户` / `出金入金` / `美国银行` …
       *  单独做一套分类枚举的收益，抵不上"每加一类要改三个文件"的成本。 */
      tags: tagsField(),
      featured: z.boolean().optional(),

      /**
       * 标题前面那个小方块（【2026-09-23 用户要的】嘉信开户挂嘉信的图标）。
       * 后台上传，盘上是 `src/assets/guides/<号>/icon.<扩展名>`，这里存的是相对路径。
       * 三档（传了 / 没传 = 完成态 / 坏了 = 构建红）写在 `src/config/entryIcon.ts` 文件头。
       *
       * ★ `image()` 让这个相对路径走 Astro 的图片管线（运行时换成 ImageMetadata）。
       * ★ 格式白名单**要拦两道**：SVG 在 `<Image>` 里不报错，它是被**原样透传**出去的
       *   （理由见 entryIcon.ts「为什么不收 SVG」）。这一道按扩展名、在内容同步时就红；
       *   `EntryIcon.astro` 渲染时再按文件内容探出来的格式拦一道。
       * ⚠ `img` 在这里**不是** ImageMetadata，是一串占位符（Astro 7 内容层的实现，
       *   entryIcon.ts 的 `entryIconFormatOf` 那一段写着）—— 别改回 `img.format`，
       *   那样每一张图都会被拒。
       * ⚠ 页面上只许经 `<Image>` 用它（`EntryIcon.astro`），不许直接拿 `.src` 去画：
       *   引用了原图的 `src`，构建就会把**原文件**逐字节拷进 dist（坑 15 那个形态）。
       *
       * 它**不是**自由文本（闸门扫的是 title / description / tags / 正文，
       * docs/gate.md「扫哪些字段」）：值只是后台写的一条路径，文件名固定是 `icon`，
       * 站上不印这串字。图本身闸门看不见 —— 和正文截图同一条（docs/gate.md 第 8 节）。
       */
      icon: image()
        .superRefine((img: unknown, ctx) => {
          const issue = entryIconFormatIssue(entryIconFormatOf(img));
          if (issue) ctx.addIssue({ code: "custom", message: issue });
        })
        .optional(),
    }),
});

/**
 * 提示词：我自己在用的那几份研究 / 交易提示词，以及**读者投来的**，原样发出来给人抄走。
 *
 * ★ 结构上就是"一篇带格式的文章"，所以时间 / 标签这几项和 guides 逐字相同。
 *   多出来的只有 `origin` + `contributor` 两项 —— 那是投稿带来的，见上面。
 *
 * ★ 特别记一笔：**没有 `version` 字段**（v2 / v4 / v1 这种）。它看起来无害，
 *   但那会是一个"上公网、而闸门一个字都不看"的自由文本字段
 *   —— `scripts/gate/inspect.ts` 只扫 title / description / symbolName / tags /
 *   **contributor** / 正文。2026-09-18 刚因为同一个形状把 `sourceModel` 拆掉换成
 *   封闭枚举（见 posts 那节）。版本号写在标题里和正文头一行，两处都在射程内。
 *
 * ★ 也没有 `agent`：提示词是**人写的**（我或投稿人），不是模型答的。
 */
const prompts = defineCollection({
  loader: numberedGlob("prompts"),
  schema: z
    .object({
      title: z.string(),
      description: z.string(),
      pubDatetime: z.date(),
      modDatetime: z.date().optional().nullable(),
      draft: z.boolean().optional(),
      timezone: z.string().optional(),
      /** 分类就用标签：`个股研究` / `交易纪律` / `估值` … 和教程同一套。 */
      tags: tagsField(),
      featured: z.boolean().optional(),

      /**
       * 谁写的：站长自己在用的 / 读者投稿 / 还没标（哨兵）。
       * 三档的定义和"为什么必须有哨兵"写在 `src/config/promptOrigins.ts`。
       */
      origin: z.enum(PROMPT_ORIGIN_IDS).default(UNSPECIFIED_ORIGIN),

      /**
       * 投稿人署名。**自由文本，上公网，所以闸门扫它**
       * （`scripts/gate/inspect.ts` 的 subject 里有它，`coverage.test.ts` 钉着）——
       * 投稿人完全可能把自己的券商、邮箱或者一句"我持仓的那只"写进署名栏。
       */
      contributor: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      // ★ 和 qa 的 agent 同一条：一份不知道谁写的提示词，读者没有依据判断该不该用它。
      if (data.draft !== true && data.origin === UNSPECIFIED_ORIGIN) {
        ctx.addIssue({
          code: "custom",
          path: ["origin"],
          message:
            "提示词发布前必须标明是谁写的（站长自己 / 读者投稿）—— 收投稿的模块里这是内容，不是可选的元数据。",
        });
      }

      // ★ 「投稿但没署名」和「投稿人要求匿名」是两件事，不许都表现成空白。
      //   空 = 还没填（待补）；想匿名就显式写「匿名」，那是一个完成态。
      if (data.origin === ORIGIN_CONTRIBUTED && !data.contributor?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["contributor"],
          message:
            "投稿必须写署名。投稿人要求匿名就写「匿名」—— 留空是「还没填」，" +
            "两者在页面上不许长得一样。",
        });
      }

      // 站长自己写的却挂着投稿人署名 —— 页面上两处来源互相打架，且没有任何报错。
      if (data.origin === ORIGIN_SITE && data.contributor?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["contributor"],
          message:
            "标成「站长自己在用的」就不该有投稿人署名。是投稿就把 origin 改成 contributed。",
        });
      }
    }),
});

const pages = defineCollection({
  loader: glob({
    pattern: "**/[^_]*.{md,mdx}",
    base: `./${requireCollectionSpec("pages").dir}`,
  }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    ogImage: z.string().optional(),
    canonicalURL: z.string().optional(),

    // 【2026-09-18】闸门这一轮开始扫 src/content/pages，实跑 scan() 确认
    // about.md 当时是 block 档（"不写我自己的仓位"命中 own_size）——
    // 一个在**声明本站不写仓位**的句子被当成在陈述仓位，误伤是必然的
    // （docs/gate.md 第 4 节）。当天晚些时候整个豁免机制按站长决定删掉了，
    // 那句话改成了"不写站长自己的仓位"，实跑不再命中。
    // 现在这个集合和别的集合一样：**没有任何放行口，命中就只能改文案。**
  }),
});

export const collections = { posts, qa, guides, prompts, pages };
