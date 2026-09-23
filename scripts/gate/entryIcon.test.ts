/**
 * 条目图标（教程标题前面那个小方块，【2026-09-23 用户要的】）的测试。
 *
 * 判据在 `src/config/entryIcon.ts`（格式白名单）和 `src/config/uploadFilename.ts`
 * （正文截图的文件名清洗，让出 `icon` 这个名字）；画法在 `src/components/EntryIcon.astro`。
 *
 * 分组：
 *   A 格式白名单 —— SVG 会被 Astro **原样透传**，不拦就是原文件逐字节上公网
 *   B 文件名清洗 —— 原有的洗法不许变，而且洗出来永远不叫 `icon`
 *   C 接线 —— 后台那一格、schema、组件、两个调用点
 *
 * ★ C 组最值钱：没接上是**零症状**的。后台那一格的目录写成绝对路径，图照样显示，
 *   只是从此原图直出（坑 15）；schema 里少了那道格式检查，SVG 照样显示，
 *   只是原文件发出去了；组件里改用 `<img src={src.src}>`，图照样显示，只是原图进了 dist。
 *   三种都是"屏幕上一切正常"。
 *
 * ★ 用例是从「人真的会怎么改坏它」来的：
 *     - 嫌 PNG 糊，"SVG 多清楚啊"，把 svg 加进白名单              → A2 / A4 红
 *     - 把白名单"简化"成只拉黑 svg                                → A3 红
 *     - 清洗函数"整理一下"，顺手删了让名那一行                    → B2 / B3 红
 *     - 后台那一格想"整洁一点"，目录改到 public/ 或 publicPath 改成 /guides → C1 红
 *     - 正文截图的清洗又抄回 keystatic.config.ts 里写一份          → C2 红
 *     - schema 里嫌 superRefine 啰嗦，写成裸的 image().optional()   → C3 红
 *     - 照着 Astro 文档写 image().refine(img => img.format …)
 *       （内容层校验时 img 是占位符，每一张图都会被拒 —— 第一版真这么红过） → A5 / C3 红
 *     - 组件里"不就是一张图嘛"，换成 <img src={src.src}>           → C4 红
 *     - 觉得 schema 已经拦过了，删掉组件里渲染前那道真格式检查       → C4 红
 *     - 删掉 layout="none"（"全站都是 constrained，统一一点"）     → C4 红
 *     - 卡片 / 详情页里自己拼一个转场名                            → C5 红
 *
 * ⚠ 测不到的那一半：图标**好不好看**（透明 logo 的白底、深色模式、圆角比例）只能
 *   两个主题各看一眼；以及图本身的内容 —— 闸门看不见像素（docs/gate.md 第 8 节）。
 *
 * 跑：`pnpm test`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ENTRY_ICON_FIELD,
  ENTRY_ICON_FORMATS,
  entryIconFormatIssue,
  entryIconFormatOf,
} from "../../src/config/entryIcon";
import { sanitizeUploadFilename } from "../../src/config/uploadFilename";

const read = (p: string) => readFileSync(p, "utf8");

/**
 * 剥掉 `/** … *\/` 块注释和 `//` 行 —— **只用在 .astro 组件上**。
 * ⚠ 不许用在 keystatic.config.ts / content.config.ts 上：那两个文件的字符串里有
 *   `/*`（`import.meta.glob("./src/content/qa/*.md")`、`"**\/[^_]*.{md,mdx}"`），
 *   朴素的去注释会从那里一口吃到下一个 `*\/`，"不许出现 X"的断言就**空转着绿**。
 *   那两个文件一律从原文里把那一段抠出来再比。
 */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

/** 从原文里抠出 `start` 开头、到第一个 `end` 为止的那一段；抠不到就让用例当场红。 */
function block(src: string, start: RegExp, end: RegExp, what: string): string {
  const m = start.exec(src);
  assert.ok(m, `找不到${what} —— 写法变了就来改这条测试，别让它静默地什么都不比`);
  const rest = src.slice(m.index);
  const e = end.exec(rest.slice(m[0].length));
  assert.ok(e, `找到了${what}的开头，找不到结尾`);
  return rest.slice(0, m[0].length + e.index + e[0].length);
}

const stemOf = (filename: string) => {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
};

// ── A 格式白名单 ──────────────────────────────────────────────────────

test("A1 常见位图都收，大小写不论", () => {
  for (const f of ["png", "jpg", "jpeg", "webp", "avif", "gif", "PNG", "Jpg"]) {
    assert.equal(entryIconFormatIssue(f), undefined, `${f} 应该收`);
  }
});

test("A2 ★ SVG 不收，而且报错说清楚为什么、换成什么", () => {
  for (const f of ["svg", "SVG"]) {
    const issue = entryIconFormatIssue(f);
    assert.ok(issue, `${f} 被收了 —— Astro 会把它逐字节原样发到公网`);
    assert.match(issue!, /SVG/, "报错里没点名 SVG —— 人只会换个文件名再试一次");
    assert.match(issue!, /PNG/, "报错里没说换成什么");
  }
});

test("A3 ★ 是白名单不是黑名单：Astro 认、但没列进来的格式一样不收", () => {
  // tiff 是 Astro 的合法输入格式、sharp 也会重新编码 —— 它在这里被拒，
  // 正好证明判据是"列进来的才收"，而不是"只拉黑 svg"。哪天 Astro 多透传一种格式，
  // 黑名单会安静地放它过去。
  for (const f of ["tiff", "ico", "heif", "bmp"]) {
    assert.ok(entryIconFormatIssue(f), `${f} 被收了 —— 判据退化成黑名单了`);
  }
  // 探不出格式（空 / 缺）也不收：不知道是什么，就不许发。
  assert.ok(entryIconFormatIssue(undefined), "探不出格式时放行了");
  assert.ok(entryIconFormatIssue(""), "空格式放行了");
});

test("A4 白名单里永远没有 svg，而且全是小写（比对前会先转小写）", () => {
  assert.ok(!ENTRY_ICON_FORMATS.includes("svg"), "svg 进了白名单");
  for (const f of ENTRY_ICON_FORMATS) {
    assert.equal(f, f.toLowerCase(), `白名单里的 ${f} 不是小写，永远比不中`);
  }
});

/**
 * ★ A5 是**实测逼出来的**：第一版在 schema 里写的是 `entryIconFormatIssue(img.format)`
 *   （照着 Astro 文档的 `image().refine(img => img.width …)`），而 Astro 7 内容层在校验
 *   那一刻交过来的是一串占位符 —— `img.format` 是 undefined，**每一张图都被拒**。
 *   这里喂的就是那串占位符的真实形状（`astro/dist/content/utils.js` 里
 *   `${IMAGE_IMPORT_PREFIX}${normalizedPath}`），不是照着正则反推的输入。
 */
test("A5 ★ 认格式的三种形状：校验时的占位符、渲染时的元数据、SVG 被换成的组件", () => {
  // 校验时：占位符 + 后台写的那条相对路径 → 按扩展名
  assert.equal(entryIconFormatOf("__ASTRO_IMAGE_../../assets/guides/1005/icon.png"), "png");
  assert.equal(entryIconFormatOf("../../assets/guides/1005/icon.PNG"), "png");
  assert.equal(entryIconFormatOf("../../assets/guides/1005/icon.svg"), "svg");
  // 渲染时：ImageMetadata，format 是按文件内容探出来的
  assert.equal(entryIconFormatOf({ src: "/x", width: 1, height: 1, format: "webp" }), "webp");
  // Astro 把 SVG 换成的组件：一个挂着元数据的函数 —— 它必须被认成 svg，不许落进"认不出"
  const svgComponent = Object.assign(() => "<svg></svg>", { format: "svg", width: 1, height: 1 });
  assert.equal(entryIconFormatOf(svgComponent), "svg");
  assert.ok(entryIconFormatIssue(entryIconFormatOf(svgComponent)), "SVG 组件被放行了");
  // 认不出来 → undefined → 不收（宁可红）
  for (const v of ["../../assets/guides/1005/icon", "", undefined, null, 42, {}, () => 1]) {
    assert.equal(entryIconFormatOf(v), undefined, `${String(v)} 应该认不出来`);
    assert.ok(entryIconFormatIssue(entryIconFormatOf(v)), `${String(v)} 认不出来却放行了`);
  }
});

// ── B 文件名清洗 ──────────────────────────────────────────────────────

test("B1 原有的洗法一个字符都没变（从 keystatic.config.ts 搬出来之前的行为）", () => {
  const cases: [string, string][] = [
    // 账号藏在长数字串里 —— 换成 x
    ["Schwab_Account_12345678.PNG", "schwab-account-x.png"],
    // 日期 / 时间是 4/2/2 位，不受影响；中文和空格换成 -，头尾的 - 剥掉
    ["截图 2026-09-18 14-20-33.png", "2026-09-18-14-20-33.png"],
    ["image.png", "image.png"],
    // 洗完什么都不剩 → shot
    ["开户.png", "shot.png"],
    ["", "shot"],
    // 主名里的点也换成 -（只认最后一个点是扩展名）
    ["a.b.c.JPG", "a-b-c.jpg"],
  ];
  for (const [input, want] of cases) {
    assert.equal(sanitizeUploadFilename(input), want, `「${input}」洗错了`);
  }
});

test("B2 ★ 正文截图洗出来叫 icon 时让名：改叫 icon-shot，扩展名不动", () => {
  assert.equal(sanitizeUploadFilename("icon.png"), "icon-shot.png");
  // 大小写：Windows 的文件系统不分，icon.PNG 和 icon.png 是同一个文件
  assert.equal(sanitizeUploadFilename("ICON.PNG"), "icon-shot.png");
  assert.equal(sanitizeUploadFilename("Icon.jpg"), "icon-shot.jpg");
  assert.equal(sanitizeUploadFilename("icon"), "icon-shot");
});

test("B3 ★ 不管原名长什么样，洗出来的主名永远不是图标那一格的文件名", () => {
  // 比对的是**洗完之后**的主名 —— 这几个洗之前都不叫 icon。
  for (const input of [
    "icon.png",
    "ICON.webp",
    "_icon_.jpg",
    " icon .png",
    "图标icon.png",
    "icon-.gif",
  ]) {
    const out = sanitizeUploadFilename(input);
    assert.notEqual(
      stemOf(out),
      ENTRY_ICON_FIELD,
      `「${input}」洗成了 ${out} —— 和图标那一格写到同一个路径上，后写的静默盖掉先写的`
    );
  }
});

test("B4 只让 icon 这一个名字，挨着它的名字照常", () => {
  for (const name of ["icon-2.png", "icons.png", "schwab-icon.png", "iconic.jpg"]) {
    assert.equal(sanitizeUploadFilename(name), name, `${name} 被误改了`);
  }
});

// ── C 接线 ────────────────────────────────────────────────────────────

const KEYSTATIC = read("keystatic.config.ts");
const CONTENT = read("src/content.config.ts");
const COMPONENT = "src/components/EntryIcon.astro";
const CARD = "src/components/Card.astro";
const GUIDE_PAGE = "src/pages/g/[...slug]/index.astro";

test("C1 ★ 后台「教程」有那一格：key 就是文件名常量、目录和正文截图同一个工厂", () => {
  const guides = block(
    KEYSTATIC,
    /\n {4}guides: collection\(\{/,
    /\n {4}\}\),\n/,
    " keystatic.config.ts 里的 guides 集合"
  );
  const field = new RegExp(
    `\\n\\s+${ENTRY_ICON_FIELD}: fields\\.image\\(\\{([\\s\\S]*?)\\n\\s+\\}\\),`
  ).exec(guides)?.[1];
  assert.ok(
    field,
    `后台「教程」里没有 ${ENTRY_ICON_FIELD}: fields.image({…}) —— ` +
      `要么那一格没了，要么 key 和 ENTRY_ICON_FIELD 对不上` +
      `（key 就是盘上的文件名，正文截图的清洗让出的是那个名字）`
  );
  assert.match(
    field!,
    /\.\.\.imagePaths\("guides"\)/,
    "图标那一格的目录不是 imagePaths(\"guides\") —— 写成别的目录，/_publish 和批量清理不认它；" +
      "写成绝对路径或 public/，图从此不经 sharp、原文件直出（坑 15）"
  );
  assert.ok(
    !/directory:|publicPath:/.test(field!),
    "图标那一格自己手写了 directory / publicPath —— 和正文截图的那一份从此可以各改各的"
  );
});

test("C2 ★ 正文截图和图标共用一份相对路径，清洗函数只有一份", () => {
  const paths = block(
    KEYSTATIC,
    /\nconst imagePaths = /,
    /\n\}\);\n/,
    " imagePaths 工厂"
  );
  assert.match(paths, /directory: `src\/assets\/\$\{collectionKey\}`/);
  // ★ 相对路径是承重的：只有相对路径的图才进 sharp（坑 15）
  assert.match(paths, /publicPath: `\.\.\/\.\.\/assets\/\$\{collectionKey\}\/`/);

  const options = block(
    KEYSTATIC,
    /\nconst imageOptions = /,
    /\n\}\);\n/,
    " imageOptions 工厂"
  );
  assert.match(options, /\.\.\.imagePaths\(collectionKey\)/, "正文截图没走 imagePaths");
  assert.match(
    options,
    /transformFilename: sanitizeUploadFilename,/,
    "正文截图的文件名清洗不是 sanitizeUploadFilename —— 又抄回来一份的话，" +
      "让出 icon 那一条和 B 组的测试都只钉着那份没人用的"
  );
  assert.ok(
    !/\.replace\(/.test(options),
    "imageOptions 里又手写了一份清洗逻辑"
  );
});

test("C3 ★ schema 里那一格过格式白名单，而且是选填", () => {
  const guides = block(
    CONTENT,
    /\nconst guides = defineCollection\(\{/,
    /\n\}\);\n/,
    " content.config.ts 里的 guides 集合"
  );
  // 只按行剥注释（行首是 `*` / `//` 的整行丢掉）—— 这个文件的字符串里有 `/*`，
  // 块注释那一步不能用；而这一段的注释里正写着 `img.format`，不剥的话下面那条"不许"永远红。
  const code = guides
    .split("\n")
    .filter(line => !/^\s*(\/\*\*|\*|\/\/)/.test(line))
    .join("\n");
  const field = new RegExp(
    `\\n\\s+${ENTRY_ICON_FIELD}: image\\(\\)([\\s\\S]*?)\\.optional\\(\\),`
  ).exec(code)?.[1];
  assert.ok(
    field !== undefined,
    `guides 的 schema 里没有 ${ENTRY_ICON_FIELD}: image()…optional() —— ` +
      `后台存进去的那一格会被 zod **静默丢掉**（schema 非 strict），站上一张图都不出`
  );
  assert.match(
    field!,
    /entryIconFormatIssue\(entryIconFormatOf\(img\)\)/,
    "schema 里没拦格式 —— SVG 在 <Image> 里不报错，是被原样透传出去的"
  );
  assert.ok(
    !/img\.format/.test(field!),
    "schema 里又在读 img.format —— 内容层校验时 img 是一串占位符，那样写每一张图都被拒（A5）"
  );
});

test("C4 ★ 组件只经 <Image> 出图：不碰原图、不走全站的响应式版式", () => {
  const raw = read(COMPONENT);
  const src = stripComments(raw);
  // 先自证剥注释没把正文吃掉 —— 否则下面几条"不许出现"会空转着绿。
  assert.match(src, /<Image\b/, `${COMPONENT} 里找不到 <Image —— 剥注释吃掉了正文，或者真的没用它`);
  assert.match(src, /from "astro:assets"/, "Image 不是从 astro:assets 来的");
  assert.ok(
    !/<img\b/.test(src),
    "组件里出现了裸 <img> —— 不经 sharp，原图（连元数据）逐字节进 dist"
  );
  assert.ok(
    !/\bsrc\.src\b/.test(src),
    "组件里引用了 src.src —— 引用了原图的地址，构建就会把原文件拷进 dist（坑 15）"
  );
  assert.match(
    src,
    /layout="none"/,
    "没关掉全站的 layout: \"constrained\" —— 44px 的图标会生成一串到 1920 宽的 srcset，" +
      "还会被 astro.images 那一层的 height: auto 改掉高度"
  );
  assert.match(src, /fit="contain"/, "没写 fit=\"contain\" —— 宽 logo 会被裁成正方形");
  assert.match(src, /alt=""/, "图标旁边就是标题，alt 该是空的（读屏不念第二遍）");
  // ★ 渲染前那一道：按真格式（文件内容探出来的）再比一次，不收就抛。
  //   schema 那一道只看得到扩展名；改了扩展名的 SVG、找不到图时退回的那串路径，都靠这一道。
  assert.match(
    src,
    /entryIconFormatIssue\(entryIconFormatOf\(src\)\)/,
    "组件渲染前没按真格式再拦一次 —— 改了扩展名的 SVG 会被 Astro 换成组件、原样内联进页面"
  );
  assert.match(src, /typeof src === "string"/, "组件没兜住「拿到的是一串路径」那一种");
  assert.match(src, /throw new Error\(/, "拦住了却没抛 —— 坏图只许构建红，不许画出来");
});

test("C5 ★ 两个调用点都画它、都判了「有没有」，转场名只在组件里算", () => {
  const card = stripComments(read(CARD));
  const page = stripComments(read(GUIDE_PAGE));

  // 卡片：图标在标题链接里、标题前面
  const link = /<a\b[\s\S]*?<\/a>/.exec(card)?.[0] ?? "";
  assert.match(
    link,
    /\{\s*icon && <EntryIcon[^>]*\/>\s*\}\s*<Heading\b/,
    "卡片标题前面没有 {icon && <EntryIcon … />} —— 列表里的图标安静地没了"
  );
  assert.match(page, /icon &&[\s\S]*?<EntryIcon[\s\S]*?size="page"/, "教程详情页没画图标");

  for (const [rel, src] of [
    [CARD, card],
    [GUIDE_PAGE, page],
  ] as const) {
    assert.match(src, /import EntryIcon from "[^"]*EntryIcon\.astro"/, `${rel} 没 import EntryIcon`);
    assert.ok(
      !/-icon-/.test(src),
      `${rel} 自己拼了图标的转场名 —— 两边各拼一份，对不上时转场安静地没了`
    );
  }
  assert.match(
    stripComments(read(COMPONENT)),
    /toTransitionName\(`\$\{collection\}-icon-\$\{id\}`\)/,
    "组件里的转场名变了形状"
  );
});
