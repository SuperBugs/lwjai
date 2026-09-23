/**
 * 标签表（`src/data/tags.json` · `src/config/tags.ts`）的钉子。【2026-09-21 用户要的】
 *
 * 标签从"四个各自手打的文本框"变成了**封闭词表**：后台左侧「标签」那一页管表，
 * 四个集合的那一格从表里勾。这件事有三层，每一层漏掉都**不会报错**：
 *
 *   A. **判据本身**（parseTags / unknownTags）—— 坏表必须抛，不许被当成空表；
 *      空表 + 静默 = 站上每一条的标签一起变成"表里没有"，而构建全绿。
 *   B. **接线** —— 四个集合的 schema 和后台那四格都得走同一个工厂。
 *      漏掉一个集合的症状是零：那个集合从此能夹带任何标签，/t 上多出一个
 *      只有一条内容的孤儿页面，后台、构建、闸门四处全绿（docs/engineering-notes.md 坑 7 那个形态）。
 *   C. **和现有内容对账** —— 表里删掉 / 改名一个还被用着的标签，后果是那几条在后台
 *      打不开、构建红。这条测试让它在 `pnpm test` 那一步就说出来，并指出是哪一条。
 *
 * 外加一条版式的：**标签在标题底下那行元信息里，页脚不许再来一份**（四个详情页 + 卡片）。
 * 漏挂一页是零症状的 —— 那一页的标签悄悄消失，别的页面照常。
 *
 * ⚠ B 和版式那两组钉的是**拼写，不是行为**（grep 源码，不跑 Astro / Keystatic）。
 *   先剥注释再 grep：注释里写着这些名字，不剥的话删掉真正那一处照样绿
 *   （和 detailParity.test.ts / publish.test.ts 同一个做法）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { FORM_CONTROLS_CSS } from "../../src/dev/keystaticFormControls";
import {
  parseTags,
  TAGS,
  tagOptions,
  unknownTags,
  unknownTagsMessage,
} from "../../src/config/tags";
import {
  CONTENT_COLLECTIONS,
  TAGS_FILE,
} from "../../src/config/collections";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** 按行剥：`//` 开头和 JSDoc 里 `*` 开头的行。 */
const stripLineComments = (src: string) =>
  src
    .split("\n")
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

/**
 * .astro 页面用的：块注释（`{/* … *\/}`）也剥掉。
 *
 * ⚠ **这一份不许拿去剥 keystatic.config.ts。** 那个文件里有
 *   `import.meta.glob("./src/content/posts/*.md")` 这种字符串 —— `/*` 在里面，
 *   贪不贪心都一样：块注释那条正则会从这个字符串开始一路吃到下一个 `*\/`，
 *   把中间**真正的代码**一起吃掉。实测就是这么发现的：四个 `tags: tagsField(`
 *   只数出两个，而源码里四个都在。所以那个文件走上面按行剥的那一份。
 */
const stripComments = (src: string) =>
  stripLineComments(src.replace(/\/\*[\s\S]*?\*\//g, ""));

/** 有标签那一格的四个集合（单页 pages 没有 tags）。 */
const TAGGED = ["posts", "qa", "guides", "prompts"] as const;

// ── A. 判据：坏表必须抛 ────────────────────────────────────────────────
// ⚠ 每一条都**实跑坏数据**。写完"必须抛"这类用例要故意破坏一次看它红不红，
//   否则它可能一直在测另一件事（docs/engineering-notes.md 坑 17）。

test("磁盘上那份能读进来，而且不是空表", () => {
  assert.ok(TAGS.length > 0, "标签表是空的 —— 后台那四格会一个可勾的都没有");
  assert.deepEqual(
    tagOptions().map(o => o.value),
    [...TAGS],
    "下拉的值必须就是标签本身（没有 id 那一层，见 tags.ts 文件头）"
  );
  assert.deepEqual(
    tagOptions().map(o => o.label),
    [...TAGS],
    "下拉的标签和值必须一致，否则后台勾的和存进 frontmatter 的不是一个东西"
  );
});

test("坏表一律抛，不许被当成空表通过", () => {
  assert.throws(() => parseTags(null), /顶层不是对象/);
  assert.throws(() => parseTags({}), /tags 不是数组/);
  assert.throws(() => parseTags({ tags: "财报" }), /tags 不是数组/);
  assert.throws(() => parseTags({ tags: [1] }), /不是字符串/);
  assert.throws(() => parseTags({ tags: ["  "] }), /是空的/);
  assert.throws(() => parseTags({ tags: ["财报", "财报"] }), /出现了两次/);
  // 大小写在地址里不算区别（/t 那两页按 slug 折叠）：放进去的话后台下拉是两项，
  // 而站上只有一个 /t/etf —— 另一项点不到。
  assert.throws(() => parseTags({ tags: ["ETF", "etf"] }), /同一个/);
  // ★【2026-09-21】标签里不许有空格。它离开这个站的两条路上都会断：
  //   发帖文案末尾那一行是 `#个股 研究` —— X 的话题标签在空格处就断了，
  //   变成话题「个股」加两个没人认领的字；`/t/<标签>` 那段地址同理。
  //   拦在表这一侧，下游两处就都不用再挑一遍（sharePost.ts 文件头记着这件事）。
  assert.throws(() => parseTags({ tags: ["个股 研究"] }), /空格/);
  assert.throws(() => parseTags({ tags: ["个股\t研究"] }), /空格/);
});

test("前后空白剃掉，顺序原样保留（顺序 = 后台那张表的顺序）", () => {
  assert.deepEqual(parseTags({ tags: [" 财报 ", "估值"] }), ["财报", "估值"]);
});

// ── B. unknownTags：全站唯一的"这个标签在不在表里" ───────────────────

test("unknownTags 只挑出表里没有的，话里带得出是哪几个", () => {
  const known = TAGS[0]!;
  assert.deepEqual(unknownTags([known]), []);
  assert.deepEqual(unknownTags([known, "AI算力"]), ["AI算力"]);
  const msg = unknownTagsMessage(["AI算力"]);
  assert.match(msg, /AI算力/);
  assert.match(msg, /标签/, "报错里得说得出去哪儿加这个标签");
});

// ── C. 接线：四个集合都走同一个工厂 ────────────────────────────────────

test("content.config.ts：四个集合的 tags 都走 tagsField()，没有漏网的裸 z.array", () => {
  const src = stripComments(read("src/content.config.ts"));
  const uses = [...src.matchAll(/tags:\s*tagsField\(\)/g)];
  assert.equal(
    uses.length,
    TAGGED.length,
    `四个集合里有 ${uses.length} 个走了 tagsField() —— 漏掉的那个能夹带表外的标签，而四处全绿`
  );
  assert.ok(
    !/tags:\s*z\.array/.test(src),
    "还有集合在用裸 z.array(z.string()) 当 tags —— 那一格不过标签表"
  );
  assert.match(
    src,
    /unknownTags\(/,
    "tagsField 没用 unknownTags —— 判据在别处又写了一份"
  );
});

test("keystatic.config.ts：四个集合那一格都是从标签表勾的，不是手打的文本框", () => {
  const src = stripLineComments(read("keystatic.config.ts"));
  const uses = [...src.matchAll(/tags:\s*tagsField\(/g)];
  assert.equal(
    uses.length,
    TAGGED.length,
    `后台四个集合里有 ${uses.length} 格走了 tagsField() —— 漏掉的那格仍然能手打，` +
      `打出来的标签在站上是孤儿页面，而后台不会说一个字`
  );
  assert.ok(
    !/tags:\s*fields\.array\(fields\.text/.test(src),
    "还有一格是 fields.array(fields.text) —— 那是换掉之前的手打框"
  );
  assert.match(
    src,
    /fields\.multiselect\(\s*\{[\s\S]*?options:\s*tagOptions\(\)/,
    "tagsField 的选项不是 tagOptions() —— 后台列的和构建期认的不是同一张表"
  );
});

test("后台「标签」那一页写的就是站上读的那份文件", () => {
  const src = stripLineComments(read("keystatic.config.ts"));
  assert.match(
    src,
    /tags:\s*singleton\(\{[\s\S]*?path:\s*"src\/data\/tags"/,
    "后台没有「标签」那一页，或者它写的不是 src/data/tags"
  );
  assert.equal(
    TAGS_FILE,
    "src/data/tags.json",
    "TAGS_FILE 和后台那一页写出来的文件对不上 —— 后台改了标签，站上读的是另一份"
  );
});

// ── D. 和现有内容对账 ──────────────────────────────────────────────────

test("站上每一条用着的标签都在表里（表里删了 / 改名了会在这里先红）", () => {
  const offenders: string[] = [];
  for (const c of CONTENT_COLLECTIONS) {
    let files: string[];
    try {
      files = readdirSync(join(ROOT, ...c.dir.split("/")));
    } catch {
      continue; // 目录还没建 —— 那是另一条测试的事（coverage.test.ts）。
    }
    for (const f of files) {
      if (!/\.mdx?$/.test(f) || f.startsWith("_")) continue;
      const { data } = matter(read(`${c.dir}/${f}`));
      const tags: string[] = Array.isArray(data.tags) ? data.tags.map(String) : [];
      for (const bad of unknownTags(tags)) {
        offenders.push(`${c.dir}/${f} → 「${bad}」`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `这几条用着表里没有的标签（后台打不开、构建也会红）：\n  ${offenders.join("\n  ")}\n` +
      `去后台「标签」那一页加上，或者把条目上的标签换掉。`
  );
});

// ── E. 版式：标签在标题底下那行，页脚不许再来一份 ──────────────────────

test("四个详情页：标签只印一遍，而且在正文上面那行元信息里", () => {
  for (const c of CONTENT_COLLECTIONS.filter(x => x.urlPrefix !== null)) {
    const rel = `src/pages/${c.urlPrefix}/[...slug]/index.astro`;
    const src = stripComments(read(rel));
    const uses = [...src.matchAll(/<Tag\b/g)];
    assert.equal(
      uses.length,
      1,
      `${rel} 里 <Tag> 出现了 ${uses.length} 次 —— 2 次是"同一排标签印两遍"` +
        `（读者会以为下面那排是别的东西），0 次是这一页的标签悄悄没了而别的页照常`
    );
    assert.ok(
      src.indexOf("<Tag") < src.indexOf("<Content"),
      `${rel} 的标签排在正文后面 —— 用户要的是标题底下那行（四页一致）`
    );
  }
});

test("列表卡片上也有标签，而且在标题下面", () => {
  const src = stripComments(read("src/components/Card.astro"));
  assert.match(src, /<Tag\b/, "卡片上没有标签 —— 列表里看不出一条内容属于哪一类");
  assert.ok(
    src.indexOf("<Heading") < src.indexOf("<Tag"),
    "标签行跑到标题上面去了 —— 用户定的位置是标题下面"
  );
  assert.match(
    src,
    /<ul class="contents">/,
    "标签没包在 display:contents 的 <ul> 里 —— <div> 里裸放 <li> 是错 HTML，" +
      "而包成普通 <ul> 会把那一行挤成两行"
  );
});

// ── F. 后台那一格画成一排药丸，不是一行一个 ────────────────────────────

/**
 * 【2026-09-21 用户要的】「标签选择的时候应该用 label group 选择，list 太占空间了」。
 *
 * 这一组钉的是那条覆盖**为什么长这样**，因为它有两个一眼看不出来的地方：
 *   ① 属性选择器写了两遍（权重），删掉重复的那一半会让它悄悄失效 ——
 *      **不报错、数据没事，只是又变回九行**；
 *   ② 它压的是**我们自己** keystaticHelp 里那条 `flex-basis: 100%`，
 *      不是上游的样式。那条哪天没了，这里的双写就成了没人看得懂的怪癖。
 */
test("多选画成药丸：权重必须盖过 keystaticHelp 那条 flex-basis:100%", () => {
  assert.match(
    FORM_CONTROLS_CSS,
    /\[role="group"\]\[role="group"\] > label:has\(> input\[type="checkbox"\]\)/,
    "属性选择器没写两遍 —— 权重 (0,2,2) 盖不过 keystaticHelp 的 (0,3,0)，那一格会悄悄变回一行一个"
  );
  assert.match(
    FORM_CONTROLS_CSS,
    /flex:\s*0 0 auto/,
    "没把 flex-basis 压回 auto —— 那正是撑成整行的那一条"
  );
  assert.ok(
    !/display:\s*none/.test(FORM_CONTROLS_CSS),
    "把 Keystatic 自己那个勾选框藏了 —— :has() 那条一旦不命中，屏幕上就是一排一模一样的词，看不出勾了哪个"
  );

  const help = read("src/dev/keystaticHelp.ts");
  assert.match(
    help,
    /flex-basis:\s*100%/,
    "keystaticHelp 里那条 flex-basis:100% 不见了 —— 它是上面那条覆盖存在的唯一理由，" +
      "确认一下还要不要双写权重（不要了就把它和这条断言一起删掉）"
  );
});

test("接线：keystatic.config.ts 真的 import 了那张样式表", () => {
  const src = stripLineComments(read("keystatic.config.ts"));
  assert.match(
    src,
    /import\s+"\.\/src\/dev\/keystaticFormControls"/,
    "没接上 —— 后台照常能用，只是那一格又占回大半屏，而哪一处都不会报错"
  );
});

/**
 * 【2026-09-21 用户要的】「所有的这个选框都拉长一点，宽度铺满，好选择一点」。
 *
 * Keystar 的 Picker 默认固定 192px，而旁边的文本框是满宽的。这一条钉的是**范围**：
 * 放大只许发生在**字段里**（`[data-lwj-help-head]` 那一层）—— 正文编辑器工具条上
 * 那个「Heading 1」是同一种按钮，铺满整行的话工具条就废了，而那是一眼能看见、
 * 却没人会联想到是这条规则干的。
 */
test("下拉铺满整行，但只在表单字段里 —— 编辑器工具条那个不许跟着变", () => {
  assert.match(
    FORM_CONTROLS_CSS,
    /\[data-lwj-help-head\]\[data-lwj-help-head\][^{]*button\[aria-haspopup="listbox"\][^{]*\{[^}]*width:\s*100%/,
    "下拉没被拉满，或者规则里少了 [data-lwj-help-head] 这层范围"
  );
  for (const line of FORM_CONTROLS_CSS.split("\n")) {
    if (!line.includes('aria-haspopup="listbox"')) continue;
    assert.ok(
      line.includes("data-lwj-help-head"),
      `这一条 Picker 规则没限定在字段里，会连编辑器工具条一起放大：${line.trim()}`
    );
  }
});
