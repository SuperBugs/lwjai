/**
 * 标签表 —— 「这个站一共有哪几个标签」。数据在 `src/data/tags.json`，
 * 后台左侧「标签」那一页写它。【2026-09-21 用户要的】
 *
 * ## 为什么标签要有一张表（在这之前它是四个手打的文本框）
 *
 * 标签是**一种组织内容的方式**：它撑着 `/t` 索引页和每个 `/t/<标签>` 列表页，
 * 而那两处是按 `slugifyStr(标签)` 折叠的。手打的代价不是难看，是**同一类内容被
 * 拆成两页**：「财报」和「财报解读」在后台看起来只是手滑，在站上是两个各有一篇的
 * 标签页，而后台、构建、闸门四处全绿 —— 没有任何一处会说"这两个是不是同一个意思"。
 * 和 `agent` / `model` 从自由文本换成封闭枚举是同一条理由、同一个形态。
 *
 * ## 存进 frontmatter 的**就是标签本身那几个字**，不是 id
 *
 * 和智能体 / 模型那张表**刻意不一样**：那边是 `id`（进 frontmatter，定了不改）
 * + `name`（显示名，随便改）两格；这里只有一格。因为标签的显示名就是它的身份 ——
 * 地址 `/t/<slug>` 是从这几个字算出来的，再给它一个 id 等于把地址和显示名拆开，
 * 那是另一件事（见 docs/engineering-notes.md 坑 4：中文标签会生成 `%E7%AB%99%E5%8A%A1` 这种地址，
 * 真要治是在 slugify.ts 里加一层英文映射，不是在这儿加一列 id）。
 *
 * ⚠ 代价说清楚：**在后台把一个标签改名 = 改的是所有用着它的条目里的那个词**，
 *   而那些条目里存的还是旧词。它不会静默烂掉 —— 下面 `unknownTags()` 是
 *   `src/content.config.ts` 四个集合共用的判据，构建期当场红，并指出是哪一条用着
 *   哪个表里没有的标签。**红得早，不是坏得安静**。要改名就先把内容改了，或者别改。
 *
 * ## 删一个还在用的标签会怎么样
 *
 * 用着它的条目在后台**打不开并说明原因**（Keystatic 的 `fields.multiselect` 对
 * 不在选项里的值直接抛：`Field validation failed: tags: Must be an array with one of …`，
 * 2026-09-21 实测），构建也红。这是对的那一头 —— 和 keystatic.config.ts 文件头
 * 记着的 `fields.select` 那条同一个取舍：比静默把那几个标签丢掉强得多，
 * 后者等于悄悄把一条内容从它所属的分类里摘出去。
 *
 * ★ **删标签的顺序是反的，而且反了就出不来**：先去用着它的条目上取消勾选（那时它们
 *   还打得开），再回来删这一行。倒过来做的话那几条**在后台里点不开、也就改不了**
 *   （要改的那一格就在打不开的那张表单里），只能先把这一行加回去，或者手改 .md。
 *   实测撞到过一次：表里删掉「期权」，而 `src/content/prompts/1000.md` 还用着它。
 *
 * ## 这张表上公网，所以过闸
 *
 * 标签渲染在卡片、详情页、`/t` 两级页面上，而且 `scripts/gate/inspect.ts` 一直在扫
 * 每篇条目的 `tags`（「我的持仓复盘」是人真的会随手打上的标签）。表本身同理：
 * 路径登记在 `src/config/collections.ts` 的 `SCANNED_DATA_FILES` 里，三道闸都扫它。
 *
 * ★ 零 astro import（理由同 registry.ts）：这个文件要被 Astro、Vite 浏览器端
 *   （keystatic.config.ts）和裸 tsx（测试、导入 CLI）三处加载。
 */
import raw from "../data/tags.json";

const FILE = "src/data/tags.json";

function fail(where: string, msg: string): never {
  throw new Error(
    `标签表坏了（${where}）：${msg}。去后台「标签」那一页改，或者直接改 ${FILE}。`
  );
}

/**
 * 把一份原始 JSON 验成标签表。**验不过就抛**（宁可红：一张读不进来的标签表
 * 如果被静默当成空表，站上每一条内容的标签会一起变成"表里没有"，而构建全绿）。
 *
 * 拆成纯函数是为了让 `scripts/gate/tags.test.ts` 能喂坏数据进来看它红不红
 * （docs/engineering-notes.md 坑 17：不故意破坏一次，"必须抛"那条用例永远绿）。
 */
export function parseTags(input: unknown, where: string = FILE): string[] {
  if (!input || typeof input !== "object") fail(where, "顶层不是对象");
  const list = (input as Record<string, unknown>).tags;
  if (!Array.isArray(list)) fail(where, "tags 不是数组");

  const out: string[] = [];
  /** 折叠后见过的写法 → 原文。`/t/<slug>` 是按折叠后的写法算的，见下面那段。 */
  const seen = new Map<string, string>();

  list.forEach((item, i) => {
    if (typeof item !== "string") fail(where, `tags[${i}] 不是字符串`);
    const tag = item.trim();
    if (!tag)
      fail(where, `tags[${i}] 是空的 —— 空标签在界面上是一个看不见的芯片`);
    // ★【2026-09-21】标签里不许有空格。两个理由，都在标签**离开这个站**的那一侧：
    //   ① 发帖文案末尾那一行是 `#财报 #估值`（src/utils/sharePost.ts），
    //      而 X 的话题标签**在空格处就断了** —— `#个股 研究` 会变成话题「个股」
    //      加两个没人认领的字；
    //   ② `/t/<标签>` 那段地址也是从这几个字算的。
    //   拦在表这一侧是因为它是唯一的入口：拦住了，下游两处都不用再挑一遍。
    if (/\s/.test(tag)) {
      fail(
        where,
        `「${tag}」里有空格 —— 它要当 X 上的话题标签（#个股 研究 会在空格处断掉），` +
          `也是 /t/ 地址里那一段。写成「个股研究」，或者用连字符连起来`
      );
    }
    // ★ 折叠判据要和 `/t` 那两页对齐：`getUniqueTags()` 按 `slugifyStr()` 去重，
    //   而它会把大小写抹平。所以「ETF」和「etf」在这里就得算重复 ——
    //   放进去的话后台下拉里是两项，而站上只有一个 /t/etf，另一项**点不到**。
    //   （这里只抹大小写、不整个调 slugify：这个文件不许 import src/utils/。）
    const key = tag.toLowerCase();
    const dup = seen.get(key);
    if (dup !== undefined) {
      fail(
        where,
        dup === tag
          ? `「${tag}」出现了两次`
          : `「${tag}」和「${dup}」在地址里是同一个（大小写不算区别），留一个`
      );
    }
    seen.set(key, tag);
    out.push(tag);
  });

  return out;
}

/** 当前这一份。import 时就验过了。顺序 = 后台里那张表的顺序 = 下拉里的顺序。 */
export const TAGS: readonly string[] = parseTags(raw);

const TAG_SET = new Set(TAGS);

/** 后台四个集合那一格的选项。值就是标签本身（见文件头：没有 id 这一层）。 */
export function tagOptions(): { label: string; value: string }[] {
  return TAGS.map(tag => ({ label: tag, value: tag }));
}

/**
 * 这几个标签里，哪些**不在表里** —— 全站唯一判据。
 *
 * 读它的地方：`src/content.config.ts` 四个集合的 schema（构建期拦）、
 * 粘贴导入（`scripts/content/importPlan.ts`，把认不出来的丢掉并记一条 note）。
 * ★ 别在别处再写一份 `TAGS.includes(...)`：两处各写一份的那天，就是后台说"这个标签
 *   不存在"而构建说"没问题"的那天（docs/engineering-notes.md 坑 8 那个形态）。
 */
export function unknownTags(tags: readonly string[]): string[] {
  return tags.filter(tag => !TAG_SET.has(tag));
}

/** 构建期拦下来时说的那句话 —— schema 和导入口共用，措辞只写一份。 */
export function unknownTagsMessage(unknown: readonly string[]): string {
  return (
    `这几个标签不在标签表里：${unknown.map(t => `「${t}」`).join("、")}。\n` +
    `去后台左侧「标签」那一页加一行，或者把条目上的标签换成表里已有的` +
    `（现在表里有：${TAGS.join(" / ") || "一个都没有"}）。\n` +
    `⚠ 标签是封闭词表：表里没有的标签在 /t 上不会有自己的页面，而条目在后台也打不开。`
  );
}
