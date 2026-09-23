/**
 * **发到哪些社区** —— 平台登记表。
 *
 * 【2026-09-23 用户定的】小红书停用，改发**雪球 ＋ 富途牛牛**。
 *
 * ## ★ 这张表存在的直接理由：小红书那条导流细则
 *
 * 小红书 2025-03 的《交易导流违规管理细则》把「**图片里含站外链接**（直接、变形
 * 或植入）」明列为违规，而且平台有 OCR；「批量高频发布」是加重情形。
 * 而封面卡**左下角印着完整的落地页地址**（`https://lwj.ai/r/<号>`）。
 *
 * ⚠ 也就是说：**同一张卡，在一个平台上是"给读者的行动指令"，在另一个平台上
 *   是违规理由。** 所以「印不印网址」不能再是卡片自己的属性，必须**跟着目标平台走**
 *   （`urlOnCard`）。这一格是这张表最贵的一格。
 *
 * ## 三档，不许压（`PostMode`）
 *
 *   `official`  有官方发布接口，我们能替你按下发送
 *   `manual`    **没有官方口子** —— 出图 ＋ 出文案，最后一下人自己按
 *   `retired`   **停用了**，而且说得出为什么
 *
 * ⚠ 最后一档最容易被省成"从表里删掉"，而删掉的代价是：
 *   「这个站不发小红书了」和「小红书那块坏了」在屏幕上字节级相同，
 *   半年后没人记得起为什么没有它。停用要**留在表里带着日期和原因**。
 * ⚠ **没有「模拟登录」这一档**，那不是漏了：拿 cookie / 无头浏览器替人按发送
 *   正是这次被封的那个形状，把它做成一个选项就是把踩过的坑铺成一条路。
 *
 * ## ⚠ 有几个数是**猜的**，标着 `calibrated: false`
 *
 * 和 `xhsPublishPlan.ts` 的 `SUCCESS_SIGNALS` 同一条纪律：**推测不许冒充确认**。
 * 雪球那几个来自官方帮助页；富途那几个来自一篇 2020 年的第三方竞品分析
 * （那篇自己就说可能过时），以及从 moomoo 社区页面反推的代码写法。
 * 页面上会把这一档画出来 —— 一个猜出来的上限长得像已知事实，
 * 就是 docs/engineering-notes.md 第三节那个 `SC 13D` 的形态。
 *
 * ★ 零 astro import：`scripts/gate/socialPlatforms.test.ts` 裸 tsx 测它。
 */

/** 这个平台上，最后按下发送那一下是谁做的。 */
export type PostMode = "official" | "manual" | "retired";

export interface SocialPlatform {
  id: string;
  /** 屏幕上叫什么。 */
  name: string;
  mode: PostMode;
  /**
   * **为什么是这一档**。`manual` / `retired` 必填 —— 一句"不能自动发"
   * 不足以让人判断该不该去想办法，而这里的原因恰恰是"想办法"会再封一次号。
   */
  modeWhy?: string;
  /**
   * 封面卡左下角印不印完整落地页地址。
   * ⚠ 见文件头：这一格正是小红书那条细则针对的东西。**默认关**，明确允许外链的平台才开。
   */
  urlOnCard: boolean;
  /** 文案里放不放可点的原文链接。和上面那格是**两件事**（一个在图里，一个在字里）。 */
  urlInBody: boolean;
  /** 点「去发帖」开哪儿。⚠ 只有 X 有官方的预填地址，其余都只是打开站点首页。 */
  siteUrl: string;
  /**
   * 股票代码在这个平台怎么写。`undefined` = 这个平台没有这种约定
   * （小红书就没有，硬加一个 `$ZM` 在那边只是一串看不懂的符号）。
   */
  cashtag?: (code: string, name?: string) => string;
  /** 一帖最多关联几只票。`undefined` = 不知道（**不是"不限"**）。 */
  symbolLimit?: number;
  /** 标题上限（码点）。`undefined` = 没有标题这一格，或者不知道。 */
  titleMax?: number;
  /** 正文上限（码点）。 */
  bodyMax?: number;
  /**
   * 上面那几个数是不是**对着官方口径核过**的。
   * ⚠ `false` 要在屏幕上看得出来，见文件头最后一节。
   */
  calibrated: boolean;
  /** `calibrated: false` 时说清楚哪几个数没核过、来源是什么。 */
  calibrationNote?: string;
  /**
   * 正文末尾那句免责。`undefined` = 不加。
   *
   * ★ 加它的理由是**平台规则**，不是礼貌：《富途牛牛社区通用管理规则》有一条
   *   证券行业特别限制 ——「不得向其他用户主动、直接地推荐股票代码」，
   *   而这个站的内容就是逐只票的研究 ＋ 估值。雪球宽松些但同类规则也有。
   * ⚠ 它**不改正文一个字**（那是模型写的，改它等于替内容换口径），
   *   只在末尾加一行说清这是什么。不想要就把这一格删掉。
   */
  disclaimer?: string;
}

/**
 * 雪球的代码写法：`$苹果(AAPL)$`。
 * 官方帮助页写着「金钱符号可以添加股票代码、关联股票…关联股票不能超过 3 只」。
 * ⚠ 没有公司名时**只放代码**（`$AAPL$`）：编不出一个名字来，而雪球那个 `$` 按钮
 *   自己补全出来的就是标准格式 —— 我们这一份是给人粘贴的底稿，不是替它补全。
 */
const xueqiuCashtag = (code: string, name?: string) => {
  const c = code.trim().toUpperCase();
  const n = name?.trim();
  return n ? `$${n}(${c})$` : `$${c}$`;
};

/**
 * 富途 / moomoo 的写法：`$苹果 (AAPL.US)$`（名字后面**有个空格**，代码带 `.US` 后缀）。
 * ⚠ **这是从 moomoo 社区页面反推的，不是官方文档**（`calibrated: false`）。
 *   粘进去之后看一眼它有没有变成蓝色的链接 —— 没变就是这条写错了，回来改这里。
 * ⚠ 后缀写死 `.US` 是因为这个站只有美股（`symbols.json` 里全是美股代码）。
 *   哪天收了港股 / A 股，这儿要按市场分档，别在调用方补。
 */
const futuCashtag = (code: string, name?: string) => {
  const c = `${code.trim().toUpperCase()}.US`;
  const n = name?.trim();
  return n ? `$${n} (${c})$` : `$${c}$`;
};

/**
 * 表本身。★ **顺序就是页面上的顺序**，第一个是默认选中的那个。
 */
export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  {
    id: "xueqiu",
    name: "雪球",
    mode: "manual",
    modeWhy:
      "雪球没有公开的发帖接口（那些 xq_a_token 的接口是读数据的）。" +
      "拿 cookie 模拟登录批量发帖，正是小红书那次被封的形状 —— 最后一下人自己按。",
    // 雪球是内容平台，帖子里带外链是常态。
    urlOnCard: true,
    urlInBody: true,
    siteUrl: "https://xueqiu.com/",
    cashtag: xueqiuCashtag,
    // 官方帮助页明写「关联股票不能超过 3 只」。
    symbolLimit: 3,
    // 官方：标题无限制、正文不能为空。所以这儿只有"正文不能空"这一条约束，
    // 没有上限可填 —— 留 undefined，别编一个数。
    calibrated: true,
    disclaimer: "以上为 AI 生成的研究记录，不构成投资建议。",
  },
  {
    id: "futu",
    name: "富途牛牛",
    mode: "manual",
    modeWhy:
      "富途 OpenAPI 只有交易和行情，没有社区发帖接口（官方和第三方 SDK 都没有）。" +
      "最后一下人自己按。",
    urlOnCard: true,
    urlInBody: true,
    siteUrl: "https://www.futunn.com/",
    cashtag: futuCashtag,
    titleMax: 80,
    calibrated: false,
    calibrationNote:
      "标题 80 字来自一篇 2020 年的第三方竞品分析（那篇自己说可能过时）；" +
      "代码写法 $名 (AAPL.US)$ 是从 moomoo 社区页面反推的，不是官方文档。" +
      "第一次发之前：在 App 的发帖页看一眼标题的实时提示，" +
      "粘完看一眼代码有没有变成蓝色链接。对上了就把这两条标成已核。",
    // ⚠ 富途是**持牌券商**的社区，那条「不得直接推荐股票代码」比雪球紧。
    disclaimer:
      "以上为 AI 生成的研究记录，仅作个人存档，不构成投资建议，也不构成任何证券的推荐。",
  },
  {
    id: "xhs",
    name: "小红书",
    mode: "retired",
    modeWhy:
      "停用。保留在表里是为了记住原因：" +
      "封面卡上印了完整网址（细则明列「图片里含站外链接」违规，平台有 OCR）＋" +
      "用队列批量发（「批量高频」是加重情形）＋ 无资质的逐只票研究。" +
      "要重开先把 urlOnCard 关掉、别用队列。",
    // ⚠ 这一格留着 false 不是摆设：哪天真重开，默认就是不印。
    urlOnCard: false,
    urlInBody: false,
    siteUrl: "https://www.xiaohongshu.com/",
    // 小红书没有 cashtag 这种约定，undefined 不是漏填。
    titleMax: 20,
    bodyMax: 1000,
    calibrated: true,
  },
];

/** 按 id 找。找不到返回 undefined —— 调用方自己说人话，别在这儿兜一个默认平台。 */
export function findPlatform(id: string): SocialPlatform | undefined {
  return SOCIAL_PLATFORMS.find(p => p.id === id);
}

/** 现在还在发的那几个（页面上列这些）。`retired` 单独一档，不混进来。 */
export const ACTIVE_PLATFORMS = SOCIAL_PLATFORMS.filter(
  p => p.mode !== "retired"
);

export const RETIRED_PLATFORMS = SOCIAL_PLATFORMS.filter(
  p => p.mode === "retired"
);

/**
 * 默认选中哪个 —— 就是表里第一个还在发的。
 * ⚠ 不许写死 `"xueqiu"`：换默认 = 把那一行拖到最前（同 `DEFAULT_AGENT` 那条）。
 */
export const DEFAULT_PLATFORM = ACTIVE_PLATFORMS[0];

if (!DEFAULT_PLATFORM) {
  // 宁可红：一张全是 retired 的表意味着"没地方发了"，那件事必须有人知道。
  throw new Error(
    "SOCIAL_PLATFORMS 里一个还在发的平台都没有 —— 发帖页会是空的，而它不会说为什么。"
  );
}
