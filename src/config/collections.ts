/**
 * 内容集合登记表 —— 「这个站一共有几种内容、各自住在哪个目录、地址长什么样、
 * 发布闸扫不扫它」。
 *
 * ## 为什么这个文件里一个 import 都没有
 *
 * 它同时被两边引用，而这两边的模块解析能力不一样：
 *
 *   - Astro 侧（`src/content.config.ts`、`src/utils/`）—— 有 `@/` 别名、
 *     能 import `astro:content` 这类虚拟模块；
 *   - **裸 tsx 侧（`scripts/gate/`）** —— `pnpm gate` / pre-commit 直接用
 *     `tsx scripts/gate/check.ts` 跑，那里**既没有 `@/` 别名也没有 astro 虚拟模块**。
 *     这个文件只要 import 了其中任何一样，闸门就会在 import 阶段直接炸
 *     （而闸门炸掉的那个场景恰恰是 pre-commit，最容易被 `--no-verify` 一把绕过去）。
 *
 * ⚠【2026-09-18 更新】以前这里还写着第二条理由：「依赖方向**已经**是
 * `src/content.config.ts` → `scripts/gate/rules.ts`（schema 要拿 `BLOCK_CODES`
 * 校验豁免码），这张表反过来 import src/ 就成环」。**那条依赖随豁免机制一起没了** ——
 * 今天 `src/` 对 `scripts/gate/` 的 import 是**零**（全仓只剩注释里的引用）。
 * 留着那句话会让人以为有个环在拦着，而实际上没有。
 *
 * 所以这条规矩现在只靠上面那一条撑着，而它已经够硬了：**一个 import 都不许有**，
 * 纯数据、纯函数。加一个 `@/` 的 import，闸门就会在 pre-commit 那一刻炸 ——
 * 而那正是最容易被 `--no-verify` 一把绕过去的时刻。
 *
 * ## 为什么要有这张表
 *
 * 【2026-09-18 侦察实测】在它出现之前，"文章目录"这个字符串在仓库里有**两份各自写死的**：
 * `src/content.config.ts` 的 `BLOG_PATH` 和 `scripts/gate/check.ts` 的
 * `join(process.cwd(), "src", "content", "posts")`。改一边不会有任何报错 ——
 * 更糟的是 check.ts 的报错文案还叫人「检查 content.config.ts 里的 BLOG_PATH」，
 * 而它从头到尾没读过那个常量。同一个形态的第二个实例：`src/content/pages/about.md`
 * 是一个上公网的页面，却因为不在 posts 目录下，**两道闸一个字节都没扫过它**，
 * 而闸门照常打印「✓ 没命中已知的危险说法」。
 *
 * 所以范围必须从这一份表推出来：闸门扫哪些目录、URL 前缀是什么、报表里叫什么名字。
 */

export type ContentCollectionSpec = {
  /** 集合名。和 `src/content.config.ts` 里 `collections` 导出的键**必须一致**。 */
  key: string;
  /** 内容目录，**仓库根相对 + POSIX 正斜杠**。
   *  不用 `path.join` 拼，因为这张表要喂给 git（`git diff --name-only` 吐的就是正斜杠），
   *  Windows 上 `\` 会对不上。要绝对路径的一方自己 `dir.split("/")` 再 join。 */
  dir: string;
  /** 详情页地址前缀（不带斜杠）。`null` = 这个集合**没有按条目的详情路由**。 */
  urlPrefix: string | null;
  /** 中文标签。报表和错误信息里用它称呼这个集合 —— 屏幕上写「研究稿」比写 `posts` 好读。 */
  label: string;
  /** 发布闸扫不扫它。 */
  scanned: boolean;
  /** `scanned: false` 时**必填**：为什么不扫。
   *  见下面那句 `satisfies` —— 少写这条理由是个类型错误，不是个约定。 */
  scanExempt?: string;
  /**
   * 这个集合的内容**是谁写的** —— 更准确地说：**怎么判断**一条内容是谁写的。
   *
   * ★ 这里存的是**判据的名字，不是答案**。三档里有两档是集合常量，
   *   第一档是逐条算的 —— 因为"谁写的"在 posts / qa 上**本来就是条目级事实**
   *   （`agent` 是三档封闭枚举，`agents.ts` 里 `human` 那一档的存在理由就是
   *   "不是模型答的，是我自己写的"）。写死一个 `"ai"` 会把那件条目级事实
   *   压成集合常量，于是一篇 `agent: human` 的研究稿被替它认领 AI 出身。
   *
   *   - `"by-agent"` —— 逐条看 `agent` 字段（posts / qa）。
   *   - `"ai"`       —— 整个集合都是模型写的（prompts）。**只有在这件事对整个集合
   *     都成立的时候才许填** —— 它是一句集合级的全称断言，填错了就是替每一条
   *     认领出身，而页面、构建、闸门四处零症状。
   *   - `"human"`    —— 人写的。**今天没有集合填它**，但 `by-agent` 那一档逐条
   *     算出来会落在这里（`agent: human` 的研究稿 / 问答），所以它不是死代码。
   *   - `"unknown"`  —— **没人确认过**（"我不知道"）。【2026-09-20】**今天没有集合
   *     填它**（教程当天改成了 `"ai"`），但 `by-agent` 会逐条算到它：`agent` 还是
   *     哨兵、或者登记表里查不到那个 id 的研究稿 / 问答。它不是死代码，
   *     也不许因为"没人用"被删掉 —— 删了之后那几条会掉进 `ai` 或 `human`，
   *     而那正是替内容认领出身。
   *
   * 判据落地在 `src/config/provenance.ts`，页面页脚和导出的 .md **读同一个函数** ——
   * 同一句断言在这个仓库里已经两次出现"两处只改一处"（docs/engineering-notes.md 坑 8）。
   * ⚠【2026-09-23】那两个读的地方**今天都没有了**（页脚那句 09-21 删、.md 文件头
   *   09-23 删 —— 导出件现在就是正文原文）。这一格还在，是等站长决定这套判据
   *   删掉还是另找落点；见 provenance.ts 顶部「现状」。
   *
   * ★ **有详情路由的集合必须填，少填一个是类型错误**（见下面 StrictSpec）。
   *   为什么要用类型而不是一条测试钉：`pnpm test` **不在任何自动链路里** ——
   *   pre-commit 只跑暂存区闸，`pnpm build` 跑的是闸门 + `astro check` + 构建。
   *   靠测试钉的话，漏填一个集合在提交、构建、部署三处全绿，只有有人想起来
   *   敲一次 `pnpm test` 才会红。类型错误会被 `astro check` 拦在构建链里。
   */
  provenance?: "by-agent" | "ai" | "human" | "unknown";
};

/**
 * 只在本文件内用的收紧版类型：`scanned: false` 必须给出 `scanExempt`。
 *
 * ★ 为什么要用类型钉住而不是写在注释里：一条"不扫"没有理由，过一阵就没人知道它是
 *   深思熟虑过的取舍还是手滑漏了。而"上公网却不扫"正是这个项目最贵的那种错误
 *   —— `src/content/pages/about.md` 已经真实地当过一次这样的漏网（它是公网页，
 *   却因为不在 posts 目录下而从未被扫过）。
 */
type StrictSpec = ContentCollectionSpec &
  (
    | { scanned: true; scanExempt?: undefined }
    | { scanned: false; scanExempt: string }
  ) &
  /**
   * ★ 有详情路由 = 有详情页页脚、有 `.md` 导出口，两处都要说"这一份是谁写的"，
   *   所以**必须表态**；没有详情路由的（单页）不许填 —— 它的免责是手写在
   *   正文里的（`about.md`），填一个没人读的值只会让下一个人以为那里有判据。
   */
  (
    | { urlPrefix: string; provenance: "by-agent" | "ai" | "human" | "unknown" }
    | { urlPrefix: null; provenance?: undefined }
  );

export const CONTENT_COLLECTIONS: readonly ContentCollectionSpec[] = [
  {
    key: "posts",
    dir: "src/content/posts",
    urlPrefix: "r",
    /** 【2026-09-22 用户定的】原来是「研究稿」。
     *  ⚠ 站上那一套短标签是**另一处**（`searchKinds.ts` 的 `SEARCH_KINDS.posts` =「研究」，
     *  导航、页面标题、搜索筛选都读它，而且它的值**写进了 Pagefind 索引**）——
     *  这两处刻意不合并：这里是"报表和工具里怎么称呼这个集合"，那里是"读者在站上看到的词"。 */
    label: "研究报告",
    scanned: true,
    /** 逐条看 `agent`：研究稿可以是模型写的，也可以是我自己写的
     *  （content.config.ts 里 posts 刻意没有 qa 那条"必须标"的 superRefine）。 */
    provenance: "by-agent",
  },
  {
    key: "qa",
    dir: "src/content/qa",
    urlPrefix: "q",
    label: "问答",
    scanned: true,
    /** 逐条看 `agent`。这个集合非草稿必须标（schema 里有 superRefine 钉着），
     *  所以实际只会落在"模型答的"和"我自己写的"两档上。 */
    provenance: "by-agent",
  },
  {
    /** 教程：怎么开户、怎么出入金、怎么开美国银行账户。**图文并茂，截图是主要内容。**
     *
     *  它和研究稿在结构上没有区别 —— 都是"标题 + 摘要 + 正文"，所以 schema 几乎一样，
     *  只是去掉了标的那几个字段（教程不讲某一只票）。单独成一个集合只为两件事：
     *  地址空间干净（`/guides/...`）、后台是独立的一张列表。 */
    key: "guides",
    dir: "src/content/guides",
    urlPrefix: "g",
    label: "教程",
    scanned: true,
    /** 【2026-09-20 站长定的口径】教程也是 AI 生成的。
     *
     *  ★ 在这之前这一行是 `"unknown"`（**没人确认过**）—— 教程 schema 里没有作者
     *    字段，说它是 AI 写的、或者说它是人写的，当时都是在说一件不知道的事。
     *    改成 `"ai"` 的**不是判据变聪明了，是站长表了态**：全站口径就是
     *    /about 免责声明首句那一句「本站所有内容均为AI生成」。
     *
     *  ⚠ 所以这一行和 prompts 那一行一样是**集合级的全称断言**，靠的是人守。
     *    哪天真写了一篇人手写的教程，这一行就得换成逐条判据（加作者字段 +
     *    `by-agent`）—— 否则页面和每一份下载走的 .md 都会替它认错出身。
     *
     *  ★ `"unknown"` 那一档**没有随之消失**：posts / qa 的 `agent` 还是哨兵、
     *    或者登记表里查不到时仍然算到它（`provenanceOf` 的 by-agent 分支）。
     *    三档文案两两不同那条纪律照旧（`export.test.ts` E 组钉着）。 */
    provenance: "ai",
  },
  {
    /** 提示词：我自己写的那几份研究 / 交易提示词，原样发出来给人抄走。
     *
     *  ★ 它和教程一样是"一篇带格式的文章"，所以 schema 和 guides 逐字相同 ——
     *    **刻意没有 `version` 字段**。理由不是省事：那会是一个上公网的自由文本字段，
     *    而闸门只扫 title / description / contributor / tags / 正文
     *    （`scripts/gate/inspect.ts`）。一个"闸门不看的公开字段"正是 2026-09-18
     *    刚拆掉的 `sourceModel` 那个泄露向量的形状。版本写在标题和正文里，
     *    两处都在射程内。
     *
     *  ★ 地址空间单独一块（`/prompts/...`）而不是塞进 guides：教程是"照着做一遍"，
     *    提示词是"拿走粘进你自己的模型"，两种读者、两种读法。 */
    key: "prompts",
    dir: "src/content/prompts",
    urlPrefix: "p",
    label: "提示词",
    scanned: true,
    /** 【2026-09-20 站长定的口径】**提示词本身也是 AI 写的** —— 站上这几份是让模型
     *  写出来的，发的人（站长自己或投稿的读者）是把它拿来用、再发出来的那个。
     *  所以条目的 `origin` / `contributor` 回答的是**谁发的**，不是谁写的
     *  （页面上那一格因此从「作者：X」改成了「分享者：X」，见 t.prompts）。
     *
     *  ⚠ 这是一句**集合级的全称断言**，它成立的前提是"这个集合只收 AI 写的提示词"。
     *    哪天真收了一份人手写的，这一行就得换成 `by-agent` 那种逐条判据 ——
     *    否则它会当着投稿人署名的面说这不是他写的，而那份 .md 已经离开这个站了。 */
    provenance: "ai",
  },
  {
    /** 「关于」这类单页。`urlPrefix: null` —— 它们的路由是一个个手写的
     *  （`src/pages/about.astro` 读 `about.md`），没有"按 id 拼地址"这回事。
     *  拿 null 去算链接的调用方是**自己搞错了**，`entryUrl` 会抛错而不是返回一个坏地址。 */
    key: "pages",
    dir: "src/content/pages",
    urlPrefix: null,
    label: "单页",
    /** ★ 扫。单页和研究稿一样是公网明面 —— about.md 正文里那句"不写我自己的仓位"
     *  实跑 `scan()` 是 **block 档**（命中 own_size）。
     *  不扫它等于把"这一页碰巧不在 posts 目录下"当成安全理由。 */
    scanned: true,
  },
] satisfies readonly StrictSpec[];

/**
 * 智能体与模型的登记表（后台「智能体与模型」页写它，agents.ts / models.ts 读它）。
 *
 * ★ 它不是集合（没有页面、不按篇算），但它**上公网**：name / vendor / note 是人手填的
 *   自由文本，渲染在芯片、悬停提示、问答署名、分享卡和导出的 .md 里。所以发布闸的
 *   三道（构建期 check.ts、暂存区 check-staged.ts、dev 预览页）都拿它过一遍 `scan()`
 *   （`scripts/gate/inspect.ts` 的 inspectRegistry）。路径只在这里写一份，
 *   和 SCANNED_DIRS 同一条纪律：两道闸各写一份路径，就是哪天一边漏扫而全绿。
 *   `coverage.test.ts` 钉着三处都引用了它。
 */
export const REGISTRY_FILE = "src/data/registry.json";

/**
 * 标签表（后台「标签」页写它，src/config/tags.ts 读它）。【2026-09-21 加】
 *
 * 和 REGISTRY_FILE 同一副形状、同一条纪律：不是集合、不按篇算，但**上公网**
 * （标签渲染在卡片、详情页、/t 两级页面上），所以三道闸都扫它。
 */
export const TAGS_FILE = "src/data/tags.json";

/**
 * 标的表（后台「标的」页写它，src/config/symbols.ts 读它）。【2026-09-22 加】
 *
 * 同 TAGS_FILE 那副形状。它上公网的那部分是**公司中英文名** —— 那两段字原来是
 * 每条内容自己的 `symbolName` / `symbolNameEn`，在 `scripts/gate/inspect.ts` 的
 * subject 白名单里待着（「特斯拉（example_server 自动带出）」那种泄露就是它拦的）。
 * 名字搬进这张表之后，**闸门的覆盖靠这一行接上** —— 少登记这一行，那两段字
 * 就从三道闸底下一起走掉了，而屏幕上照常印「✓ 没命中已知的危险说法」。
 */
export const SYMBOLS_FILE = "src/data/symbols.json";

/** 后台「回答排序」那一页写的表：同一组里几个智能体的结果谁排前面
 *  （判据 `src/config/answerOrder.ts`）。里面只有智能体 id，没有自由文本 ——
 *  仍然登记在下面那张表里，因为**那张表同时决定 `/_publish` 提交哪些文件**：
 *  不登记的话，后台排完序点提交推送，这个文件根本不跟着走，而且零症状。 */
export const ANSWER_ORDER_FILE = "src/data/answerOrder.json";

/**
 * 上公网、但**不按篇算**的数据文件 —— 三道闸（构建期 / 暂存区 / dev 预览页）都扫它们，
 * `/_publish` 也把它们当"内容"一起提交。
 *
 * ★ 【2026-09-21】这张表是从"只有一个 REGISTRY_FILE"长出来的：加标签表那天，
 *   三道闸里每一道都写着一段只认 registry 的代码，**再加一个数据文件就得改四处**，
 *   而漏掉任何一处的症状是零 —— 那个文件安静地穿过那道闸，屏幕上照常印绿 ✓。
 *   现在加一个数据文件 = 在这里加一行，四处跟着走。
 * ⚠ 顺序就是报表里的顺序。
 */
export const SCANNED_DATA_FILES: readonly { path: string; label: string }[] = [
  { path: REGISTRY_FILE, label: "智能体与模型登记表" },
  { path: TAGS_FILE, label: "标签表" },
  { path: SYMBOLS_FILE, label: "标的表" },
  { path: ANSWER_ORDER_FILE, label: "回答排序表" },
];

const BY_KEY = new Map(CONTENT_COLLECTIONS.map(c => [c.key, c]));

/**
 * 按集合名取登记项。
 *
 * ★ **查不到返回 undefined，调用方必须自己处理。** 不许在这里兜一个
 *   `{ dir: \`src/content/${key}\` }` 的猜测值 —— 那会让"集合名打错一个字母"
 *   变成一个能跑通、只是地址和扫描范围全错的状态，而且哪儿都不报错。
 */
export function collectionSpec(key: string): ContentCollectionSpec | undefined {
  return BY_KEY.get(key);
}

/**
 * 同上，但查不到就抛。
 *
 * 给"这个集合名是代码里写死的、查不到就是我自己写错了"的场合用
 * （比如 `content.config.ts` 里的 `BLOG_PATH`）。这种地方吞掉 undefined
 * 只会让错误在很远的下游以一个坏路径的形式冒出来。
 */
export function requireCollectionSpec(key: string): ContentCollectionSpec {
  const spec = BY_KEY.get(key);
  if (!spec) {
    throw new Error(
      `内容集合登记表里没有「${key}」。现有的是：${CONTENT_COLLECTIONS.map(c => c.key).join(" / ")}` +
        `（表在 src/config/collections.ts）`
    );
  }
  return spec;
}

/**
 * 发布闸要扫的目录，仓库根相对、正斜杠。
 *
 * ★ 两道闸的范围都从这里推：
 *     `scripts/gate/check.ts`        —— `join(process.cwd(), ...dir.split("/"))` 遍历磁盘
 *     `scripts/gate/check-staged.ts` —— 拿它过滤 `git diff --name-only` 的输出
 *   各写一份的那天，就是两道闸开始各说各话的那天（docs/gate.md 第 6 节）。
 */
export const SCANNED_DIRS: readonly string[] = CONTENT_COLLECTIONS.filter(
  c => c.scanned
).map(c => c.dir);

/**
 * 地址是**条目号**的那些集合 —— 也就是"有按条目的详情路由"的那些。
 * 【2026-09-21】判据就是 `urlPrefix !== null`，**刻意不新开一个字段**：
 * 编号存在的理由是"这条内容有一个公开地址"，而这张表里回答那件事的就是 urlPrefix。
 * 多一个字段就多一种两者对不上的状态（有路由却不编号 = 地址没人发号，
 * 两条内容抢同一个文件名）。
 *
 * ★ 这几个集合**共用一个号池**（全站递增，不是每个集合各自从 1 开始）。
 *   为什么，见 `src/config/entryNo.ts` 开头。
 */
export const NUMBERED_COLLECTIONS: readonly string[] =
  CONTENT_COLLECTIONS.filter(c => c.urlPrefix !== null).map(c => c.key);
