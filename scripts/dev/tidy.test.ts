/**
 * 「清理孤零零的杠」的**磁盘那一半和接线**。判据（删哪些行）在
 * `scripts/content/tidyPlan.test.ts`，这一份钉的是别的东西：
 *
 *   1. 真去写盘那一趟：拿临时目录造一份真稿子，点一下，**只该少那几行**；
 *   2. 路径闸：接口收到的路径是浏览器发来的字符串，而它能写磁盘；
 *   3. 范围从发布闸那份登记表来，不许在这儿另写一份（坑 7）；
 *   4. 页面和接口**读同一次扫描** —— 屏幕上列的和按下去删的必须是同一批行；
 *   5. 接线：两条路由真的挂在 astro.config.ts 的 devGate 里，`prerender = false` 在，
 *      同源检查在。**没接上是零症状的**：按钮点下去 403 或者路由根本不存在。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isTidyTarget,
  missingDirs,
  scanTidy,
  tidyFiles,
  titleOf,
} from "../../src/dev/tidyScan";
import { CONTENT_COLLECTIONS } from "../../src/config/collections";
import { tidyText } from "../../scripts/content/tidyPlan";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** 只看代码，不看注释 —— 注释里写着"别这么干"的反例，照样会被 grep 命中。 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ── 1. 真写盘那一趟 ──────────────────────────────────────────────────────

test("写盘：只少那几行，别的字节一个没动", () => {
  const dir = mkdtempSync(join(tmpdir(), "lwj-tidy-"));
  const cwd = process.cwd();
  try {
    mkdirSync(join(dir, "src", "content", "posts"), { recursive: true });
    const front = "---\ntitle: CRWV\ntags:\n  - 个股研究\n---\n";
    // ★ 两种脏各一处（整行只有杠 / 转义掉的粗体标记），外加一处**裸** `**`
    //   和围栏里的续行 —— 后两样一个字节都不许动。
    const raw = `${front}\n# CRWV｜CoreWeave\n\n**推演分析：**\n\n\\\\\n\n\\*\\*买盘动力：\\*\\*衰竭。\n\n\`\`\`sh\npnpm build \\\n  --force\n\`\`\`\n`;
    const rel = "src/content/posts/1018.md";
    writeFileSync(join(dir, ...rel.split("/")), raw, "utf8");

    process.chdir(dir);
    // ★ 临时仓库里只有 posts 一个目录：登记在册的另外几个必须报成**扫不全**，
    //   而不是静静跳过（那样"目录名拼错"会长得和"没东西可清"一模一样，坑 7）。
    assert.ok(
      missingDirs().length > 0,
      "登记表里有目录不在磁盘上，missingDirs() 却说一切正常"
    );
    assert.ok(!missingDirs().includes("src/content/posts"));

    // 扫描先把这一份认出来（页面上看到的就是这个）。
    const found = scanTidy();
    assert.deepEqual(
      found.map(f => f.path),
      [rel]
    );
    assert.equal(found[0]!.title, "CRWV", "标题读的是 frontmatter，不是路径");
    assert.deepEqual(found[0]!.removed, [
      { line: 6, text: "\\\\", kind: "slash_line" },
      {
        line: 8,
        text: "\\*\\*买盘动力：\\*\\*衰竭。",
        kind: "escaped_emphasis",
        marks: 2,
      },
    ]);

    const results = tidyFiles([rel]);
    assert.deepEqual(results, [{ path: rel, removed: 2, lines: [6, 8] }]);

    const after = readFileSync(join(dir, ...rel.split("/")), "utf8");
    assert.ok(after.startsWith(front), "frontmatter 被动过了");
    assert.ok(!/^\\\\$/m.test(after), "那一行还在");
    assert.match(after, /pnpm build \\\n {2}--force/, "围栏里的续行被删了 —— 那是给人抄的字");
    assert.match(after, /\*\*推演分析：\*\*/, "裸 ** 被吃了 —— 那是真的粗体");
    assert.equal(
      after,
      `${front}\n# CRWV｜CoreWeave\n\n**推演分析：**\n\n买盘动力：衰竭。\n\n\`\`\`sh\npnpm build \\\n  --force\n\`\`\`\n`
    );

    // 再点一次：这一档是"没东西可清"，不是"又清了一次"。
    assert.deepEqual(tidyFiles([rel]), [{ path: rel, removed: 0, lines: [] }]);
    assert.deepEqual(scanTidy(), []);
  } finally {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── 1b. 星号那一档：清完，**渲染出来的东西只差那几个字面星号** ──────────────

test("清掉字面 `**` 之后，剩下那些裸 `**` 不许重新配对", async () => {
  /**
   * 这一条钉的是这条规则**安全的全部理由**，而它不是显然的：
   * 站上真有一行里字面的和裸的交错着 ——
   * `当季**12.772**，同比\*\*+4.9%**、环比约**+3.1%**；TTM约**49.9\*\*`
   * （posts/1009.md 第 37 行）。删掉字面的那几个之后，要是剩下的裸 `**`
   * 换了配对方式，**粗体范围整个挪位**，而字一个没少、四处全绿。
   *
   * 按 CommonMark，转义过的 `\*` 根本不是分隔符（是一个普通字符），
   * 所以它不参与配对 —— 但"按规范推"正是这个项目不许的（见 formatRules.ts
   * 的 `bare_lt` 那一节）。所以这里拿**站上真用的那个包**真渲染一遍去比。
   *
   * ⚠ 只比**只有星号那一档**的文件：整行只有杠的那一档本来就会少一整个
   *   `<p>\</p>`（那正是它要干的事），混在一起比会把两件事搅成一件。
   *   那一档由上面 A / B 两组钉着。
   *
   * ⚠【写完当天就撞到了】**站上那一遍是搭头，用例的分量全在写死的那几段上。**
   *   第一版写的是"至少比到一份站上的稿子，否则这条用例什么都没验" ——
   *   用户当场按了一次「全部清理」，站上一份脏的都不剩，这条用例**当场变红**。
   *   而"清干净"正是这个功能存在的目的：把断言挂在"站上还有脏东西"上，
   *   等于让功能用得越成功、测试越红（同 tidyPlan.test.ts 文件头 C 组那一段：
   *   不许把人随时会改的内容拉进断言）。现在改成钉**写死的那几段**必须真被清到。
   */
  const { createMarkdownProcessor } = await import("@astrojs/markdown-remark");
  // gfm 开着（正文全是表格）、smartypants 关着（坑 10）—— 和 astro.config.ts 一致。
  const proc = await createMarkdownProcessor({ gfm: true, smartypants: false });
  const FRONT = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;
  const body = (s: string) => s.slice((FRONT.exec(s)?.[0] ?? "").length);
  /** 字面星号是**唯一**允许消失的东西，两边一起抹掉再比。 */
  const strip = (s: string) => s.split("**").join("");

  /**
   * 站上真实的几种形状，抄成字面量 —— 它们**不会被清理干净**，所以这条用例
   * 不管站上今天有没有脏东西都在验一样东西。
   */
  const FIXTURES: [string, string][] = [
    // 字面的和裸的交错（posts/1009 第 37 行）：最怕的就是这一行重新配对。
    [
      "字面和裸的交错",
      "| 收入 | 当季**12.772**，同比\\*\\*+4.9%**、环比约**+3.1%**；TTM约**49.9\\*\\* |\n",
    ],
    // CJK 标点后面紧跟汉字（qa/1033 第 67 行的形状）。
    [
      "整段没解析成粗体",
      "\\*\\*最大的风险，是市场提前把“可能支持”当成了“一定赚钱”。\\*\\*反过来也一样。\n",
    ],
    // 同一段里一半是真粗体、一半是字面的（qa/1033 第 53 行）。
    [
      "半真半假同一段",
      "\\*\\*GLND：炒的是能源开发。\\*\\*它同样大涨。因此，**协议不等于钻探获批。**（完）\n",
    ],
  ];
  for (const [label, md] of FIXTURES) {
    assert.ok(
      tidyText(md).removed.length > 0,
      `写死的那段「${label}」压根没被清到 —— 这条用例在比两份一模一样的东西`
    );
  }

  const cases: [string, string][] = [...FIXTURES];
  for (const spec of CONTENT_COLLECTIONS) {
    const dir = join(ROOT, ...spec.dir.split("/"));
    for (const name of readdirSync(dir)) {
      if (name.startsWith("_") || !/\.mdx?$/i.test(name)) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) continue;
      const raw = readFileSync(full, "utf8");
      const { removed } = tidyText(raw);
      if (removed.length === 0) continue;
      if (!removed.every(r => r.kind === "escaped_emphasis")) continue;
      cases.push([`${spec.dir}/${name}`, raw]);
    }
  }

  for (const [label, raw] of cases) {
    const before = (await proc.render(body(raw))).code;
    const after = (await proc.render(body(tidyText(raw).text))).code;
    assert.equal(
      strip(after),
      strip(before),
      `${label}：清完之后渲染变了 —— 多半是剩下的裸 ** 重新配对了，粗体范围挪位`
    );
  }
});

// ── 2. 路径闸 ────────────────────────────────────────────────────────────

test("路径闸：只认登记在册的内容文件", () => {
  for (const ok of [
    "src/content/posts/1018.md",
    "src/content/qa/1003.md",
    "src/content/prompts/1000.md",
    "src\\content\\posts\\1018.md", // Windows 写法也要认
  ]) {
    assert.ok(isTidyTarget(ok), `这条该放行：${ok}`);
  }
  for (const no of [
    "src/content/posts/_template.md", // 下划线开头的不进 collection
    "src/content/posts/../../../etc/passwd",
    "src/data/tags.json", // 登记表是 JSON，这个功能不碰
    "package.json",
    "keystatic.config.ts",
    "/etc/passwd",
    "src/content/posts/shot.png",
    "src/contents/posts/1018.md", // 目录名差一个字母
  ]) {
    assert.ok(!isTidyTarget(no), `这条不该放行：${no}`);
  }
});

test("写盘之前先过路径闸 —— 挡下来的那一份要说清楚，而不是静静地跳过", () => {
  const [r] = tidyFiles(["package.json"]);
  assert.equal(r!.removed, 0);
  assert.match(r!.error ?? "", /内容文件/);
});

test("读不到标题就还路径，不许还空串", () => {
  assert.equal(titleOf("---\ntitle: 'x'\n---\n正文\n", "p.md"), "x");
  assert.equal(titleOf('---\ntitle: "带#号"\n---\n', "p.md"), "带#号");
  assert.equal(titleOf("没有 frontmatter\n", "p.md"), "p.md");
  assert.equal(titleOf("---\nsymbol: CRWV\n---\n", "p.md"), "p.md");
});

// ── 3/4. 范围和判据都不许有第二份 ────────────────────────────────────────

test("范围从发布闸那份登记表来，判据从 tidyPlan 来", () => {
  const scan = stripComments(read("src/dev/tidyScan.ts"));
  assert.match(scan, /from "\.\.\/\.\.\/scripts\/gate\/inspect"/, "范围没从闸门那儿拿");
  assert.match(scan, /SCANNED_PATH_RE/);
  assert.match(scan, /from "\.\.\/\.\.\/scripts\/content\/tidyPlan"/, "判据没从 tidyPlan 拿");
  assert.ok(
    !/"src\/content|'src\/content|"src", "content"/.test(scan),
    "写死了内容目录 —— 新增一个集合时它会安静地漏掉那个目录（坑 7）"
  );
  // 判断"哪一行是孤零零的杠"只许有一处。
  for (const file of ["src/dev/tidyScan.ts", "src/dev/tidy-run.ts", "src/dev/tidy.astro"]) {
    assert.ok(
      !/\[\\\\\\\\\/\]/.test(read(file)),
      `${file} 里出现了第二份"只有杠"的正则 —— 判据只许在 tidyPlan.ts 一处`
    );
    // 星号那一档同理。⚠ 用剥过注释的源：注释里逐字写着这条规矩本身。
    assert.ok(
      !stripComments(read(file)).includes(String.raw`\\\*`),
      `${file} 里出现了第二份"转义星号"的正则 —— 判据只许在 tidyPlan.ts 一处`
    );
  }
  // 行内代码那一段的源也只许有一份：tidyPlan 要在行内做替换，自己再写一个
  // "什么算行内代码"的话，总有一天一处认得出另一处认不出 —— 那天的症状是误删。
  const plan = stripComments(read("scripts/content/tidyPlan.ts"));
  assert.match(plan, /INLINE_CODE_SRC/, "行内代码的判据没从 formatRules 拿");
  assert.ok(
    !/`\[\^`\]\*`/.test(plan),
    "tidyPlan 自己又写了一份行内代码的正则"
  );
});

test("页面和接口读同一次扫描", () => {
  assert.match(
    read("src/dev/tidy.astro"),
    /import \{[^}]*\bscanTidy\b[^}]*\} from "\.\/tidyScan"/,
    "页面自己又扫了一遍 —— 屏幕上列的可以和按下去删的不是同一批"
  );
  assert.match(read("src/dev/tidy-run.ts"), /from "\.\/tidyScan"/);
});

// ── 5. 接线 ──────────────────────────────────────────────────────────────

test("两条 dev 路由挂在 devGate 里", () => {
  const src = read("astro.config.ts");
  const block = /const devGate: AstroIntegration = \{([\s\S]*?)\n\};/.exec(src)?.[1];
  assert.ok(block, "astro.config.ts 里找不到 devGate 集成");
  for (const [pattern, file] of [
    ["/_tidy", "./src/dev/tidy.astro"],
    ["/_tidy/run", "./src/dev/tidy-run.ts"],
  ]) {
    assert.ok(block!.includes(`pattern: "${pattern}"`), `${pattern} 没挂 —— 按钮点下去是 404`);
    assert.ok(block!.includes(file!), `${pattern} 指的不是 ${file}`);
  }
});

test("接口：关了预渲染、查同源头、按钮不能绕过路径闸", () => {
  const src = read("src/dev/tidy-run.ts");
  // 静态站里预渲染路由的 request.headers 是空的（连 dev 里也是），同源检查永远过不了。
  assert.match(
    src,
    /export const prerender = false/,
    "没关预渲染 —— 三条同源检查读不到任何请求头，按钮永远 403"
  );
  assert.match(src, /x-requested-with/i, "没查 X-Requested-With，别的网页能替你点这个按钮");
  assert.match(src, /sec-fetch-site/i);
  assert.match(src, /lwj-tidy/, "自定义头的值要和页面那边对上");
  assert.match(
    read("src/dev/tidy.astro"),
    /"X-Requested-With": "lwj-tidy"/,
    "页面没带那个头 —— 自己的按钮被自己的接口 403"
  );
  // 「全部清理」不信浏览器发来的清单：页面可能开了半小时。
  assert.match(src, /body\.all === true\s*\?\s*scanTidy\(\)/);
});
