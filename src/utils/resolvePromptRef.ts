import { getEntry, type CollectionEntry } from "astro:content";
import { postFilter } from "./postFilter";

/**
 * 把研究稿 frontmatter 里的 `prompt` 引用解析成提示词条目 —— **解析不到就抛**。
 *
 * ## 为什么要有这一层
 *
 * Astro 7 的 `reference()` **不核对目标存在**（node_modules/astro/dist/content/runtime.js
 * 的 createReference：只把字符串包成 `{ id, collection }`，一个字都不查）。
 * 于是 `prompt: stock-analysiss`（多打一个 s）能过 schema、过构建，页面上安静地少一行，
 * 或者更糟：链到一个不存在的地址。
 *
 * 调它的是研究稿详情页（`src/pages/r/[...slug]/index.astro`）。
 * 【2026-09-23】.md 导出口原来是第二个调用方（把提示词标题和地址写进文件头）；
 * 导出件改成正文原文之后它不再调 —— 所以"引用坏了构建红"这道检查现在**只靠详情页那一次调用**，
 * 别把那一行挪到一个不是每篇都会走到的地方。
 *
 * ## 三档，只有一档放行
 *
 *   没引用                 → undefined（这篇不是用站上的提示词跑的，完成态）
 *   引用了、找得到、已发布 → 那条提示词
 *   引用了但找不到 / 是草稿 / 还没到发布时间 → **抛**。宁可构建红，也不要一个
 *     看起来正常的 404 链接（草稿不生成页面，见 docs/engineering-notes.md 坑 1）。
 */
export async function resolvePromptRef(owner: {
  id: string;
  data: { title: string; prompt?: { id: string; collection: string } };
}): Promise<CollectionEntry<"prompts"> | undefined> {
  const ref = owner.data.prompt;
  if (!ref) return undefined;

  const where = `研究稿「${owner.data.title}」（${owner.id}）引用的提示词「${ref.id}」`;

  if (ref.collection !== "prompts") {
    throw new Error(
      `${where}指向的是「${ref.collection}」集合，不是 prompts —— schema 里 reference() 的集合名写错了。`
    );
  }

  const entry = await getEntry("prompts", ref.id);
  if (!entry) {
    throw new Error(
      `${where}不存在 —— 对一眼 src/content/prompts/ 下的文件名。` +
        `reference() 不核对目标存在，这里是唯一一道。`
    );
  }
  if (!postFilter(entry)) {
    throw new Error(
      `${where}是草稿或还没到发布时间 —— 它不会生成页面，链过去是 404。先发提示词，再引用它。`
    );
  }
  return entry;
}
