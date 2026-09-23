/**
 * 「这一份东西是谁写的」—— **全站唯一的判据**。
 *
 * ## ⚠ 现状【2026-09-23】：这个函数**今天没有调用方**
 *
 * 它有过两个消费方：详情页页脚那一句（2026-09-21 用户要求删掉）和导出的 .md
 * 文件头那一句（2026-09-23 删掉 —— 用户要的：下载 / 复制拿到的就是正文原文，
 * 站方一个字都不加，见 `src/utils/exportMarkdown.ts` 顶部）。下面几节讲"页面和
 * 文件都读它"的地方记的是那之前的样子。
 * 留着它（连同 `collections.ts` 里每个集合的 `provenance` 表态和 `t.provenance`）
 * 是等站长决定：删掉，还是另找一个落点。**别把它当成"还有地方在说来路"的证据。**
 *
 * ## 为什么需要它
 *
 * 【2026-09-20 查出来的】这个站从建站起就在四处写着一句全称断言：
 * **「站内所有内容都是 AI 生成」**。那句话在只有研究稿和问答的时候是真的；
 * 加了教程（谁写的没人确认过）和提示词（**人写的，而且收读者投稿**）之后，
 * 它在全站范围内就是**假的**，而且它出现在这些地方：
 *
 *   src/content/pages/about.md          ← 免责声明那一节，首页「完整免责声明」的落点
 *   src/pages/index.astro               ← 首屏底部那行小字
 *   src/pages/{posts,qa,guides}/…/index.astro ← 三份详情页页脚，各写一份
 *   src/i18n/lang/{zh-CN,en}.ts         ← 导出的 .md 文件头（四个端点共用）
 *   README.md                           ← 措辞的出处之一
 *
 * 最难看的一处是**导出的 .md**：一份读者投稿的提示词，frontmatter 里印着
 * `origin: "读者投稿"` + `contributor: "某某"`，紧接着的引用块写着
 * 「站内所有内容都是 AI 生成」—— 等于当着投稿人署名的面说这不是他写的。
 * 而那份文件已经**离开这个站**了，站上改口径追不回来。
 *
 * ## 三档，不许压成两档
 *
 * | 档 | 意思 | 谁落在这儿 |
 * |---|---|---|
 * | `ai`      | 模型写的 | `agent` 指向某个真实智能体的研究稿 / 问答；**提示词**和**教程**（整个集合，2026-09-20 起） |
 * | `human`   | 人写的（**完成态**） | `agent: human` 的研究稿 / 问答 |
 * | `unknown` | **没人确认过**（"我不知道"） | `agent` 还是哨兵、或登记表里查不到那个 id 的研究稿 / 问答 |
 *
 * 【2026-09-20】提示词从 `human`、教程从 `unknown` 都挪到了 `ai`：站长定的全站口径
 * 是 /about 免责声明首句那一句「本站所有内容均为AI生成」。提示词署名那一格上的人
 * 因此是**分享者**（同日从「作者：X」改成「分享者：X」）。
 *
 * ★ 于是 `human` / `unknown` 两档**今天没有集合常量在用**，只由 `by-agent` 逐条算到。
 *   它们不是死代码：删掉任何一档，那些条目都会掉进 `ai`，而那正是替内容认领出身。
 *
 * 下面那段"当着投稿人署名的面否认作者"的历史记录原样留着 —— 它记的是
 * **一句全称断言铺在四个集合上、而当时没人表过态**的后果。现在是表过态的，
 * 代价也写在 `collections.ts` 那两行注释里：这两行靠人守，schema 管不着。
 *
 * 第三档是这个文件存在的一半理由。把 `unknown` 折进 `ai`（"反正站上大多是 AI 写的"）
 * 就是替内容认领出身；折进 `human` 就是替它背书。两个方向都是
 * docs/engineering-notes.md 第二节点名的那件事，而且两个方向都零症状 —— 读者看到的是一个
 * 语气笃定的句子，看不出它是猜的。
 *
 * ## 判据只有一个，页面和文件都读它
 *
 * 同一句断言在这个仓库里已经两次出现「两处只改一处」（docs/engineering-notes.md 坑 8：
 * 问答页「以下是模型的原话」那句）。所以**导出口这一侧只有一处**：
 * 四个 `.md` 端点调的都是下面这个 `provenanceOf()`。
 *
 * ⚠ **页面那一侧只有两页调它，别把这句写成"四个详情页都调"**（写过一次，
 *   是假话 —— 2026-09-20 审出来的）。实情是：
 *
 *   | 详情页 | 页面上「谁写的」由谁回答 |
 *   |---|---|
 *   | posts   | `provenanceOf()` + `AgentModelChip` |
 *   | guides  | `provenanceOf()`（这个集合没有作者字段，只有集合常量那一档） |
 *   | qa      | **`AgentModelChip` + `isAiAnswer()`**（后者 2026-09-23 已删）—— 问答页本来就逐条标着谁答的，
 *               再加一句同义的话只是噪音 |
 *   | prompts | **`PromptOriginChip`**（站长自己在用的 / 投稿 · 署名），
 *               外加那段提示词专属的说明 |
 *
 *   四者的**底层事实是同一个**（`agent` / `origin` 两张封闭枚举表），
 *   所以不会互相矛盾；但"判据只有一个函数"这句话只对导出口成立。
 *   `export.test.ts` 的 E 组用一张显式期望表钉住这四页各走哪一条 ——
 *   加第五个集合时那张表会逼人表态。
 *
 * ## 为什么在这里、而不是在 exportMarkdown.ts 里
 *
 * 因为它**不只服务导出口**：页面页脚是同一句话。而且它要能被裸 tsx 的测试
 * import（`scripts/gate/export.test.ts` 用 `tsx --test` 跑），所以这个文件只
 * import 同样零依赖的 `./agents` 和 `./collections` —— 一条 `@/` 或 `astro:*`
 * 都不许加进来，加了测试就在 import 阶段炸。
 */

import { findAgent } from "./agents";
import { requireCollectionSpec } from "./collections";

/** 三档。值本身进不了页面 —— 显示文案在 `t.provenance` 里，按语言走。 */
export type Provenance = "ai" | "human" | "unknown";

/**
 * 这一条内容是谁写的。
 *
 * @param collection 集合名（posts / qa / guides / prompts）
 * @param data       条目的 frontmatter。只读 `agent` 一个键，而且只在
 *                   `provenance: "by-agent"` 的集合上读。
 *
 * ★ **查不到的集合直接抛，不兜底。** 兜一个 `"ai"` 会让"新集合忘了登记"变成
 *   "新集合的每一份导出件都声称自己是 AI 生成的"，而页面、构建、闸门四处零症状。
 *   （登记表那侧还有一层：有详情路由却没填 `provenance` 是**类型错误**，
 *   `astro check` 在 `pnpm build` 里拦得住 —— 这里是第二道。）
 *
 * ★ `by-agent` 那一档的判据走 `agents.ts` 的 `kind` 字段，**不比 `id === "human"`
 *   这种字面量**（docs/engineering-notes.md 第二节明令）。查不到的 id 落 `unknown` 而不是 `ai`：
 *   一个登记表里已经删掉的 id，我们并不知道它当初是模型还是人。
 */
export function provenanceOf(
  collection: string,
  // ⚠ 松散记录，不是 `{ agent?: string }`。后者是 TS 眼里的**弱类型**：
  //   一个**没有** agent 字段的 frontmatter（教程、提示词的 data）传进来会直接
  //   报 ts(2559)「has no properties in common」—— 而那恰恰是最常见的调用。
  //   这里读的是"如果有 agent 就看它"，类型要照着这个意思写。
  data: Readonly<Record<string, unknown>> = {}
): Provenance {
  const spec = requireCollectionSpec(collection);

  switch (spec.provenance) {
    // 【2026-09-20】集合级的「都是模型写的」。今天只有 prompts 填它 ——
    // 站长的口径是提示词本身也是 AI 写的，发的人只是分享者。
    case "ai":
      return "ai";
    case "human":
      return "human";
    case "unknown":
      return "unknown";
    case "by-agent": {
      const agent = typeof data.agent === "string" ? data.agent : undefined;
      const kind = findAgent(agent)?.kind;
      if (kind === "ai") return "ai";
      if (kind === "human") return "human";
      // 哨兵（还没标）和"登记表里查不到这个 id"都落这儿 —— 两种情况下
      // 我们**确实不知道**是谁写的，而这正是第三档存在的意义。
      return "unknown";
    }
    default:
      throw new Error(
        `「${spec.label}」（${collection}）没有在登记表里写 provenance —— ` +
          `每个有详情路由的集合都必须表态这一条内容是谁写的（src/config/collections.ts）。` +
          `没有默认值是刻意的：兜一个"AI 生成"会让下一个新集合的每一份导出件` +
          `都替内容认错作者，而四处全绿。`
      );
  }
}
