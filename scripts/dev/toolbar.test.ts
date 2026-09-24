/**
 * 后台左侧菜单最底下那一块（src/dev/keystaticToolbar.ts）的测试。
 *
 * DOM 那半边（认侧边栏、挂进去、扛住重渲染）测不了 —— 它要一个真的 Keystatic 后台。
 * 能抽成纯函数的判据全在这儿钉着：
 *   1. 拼路径本身：Windows 用反斜杠、POSIX 用斜杠，结尾多余的分隔符要吃掉；
 *   2. **注入没成的时候照样显示**（退回文件名 + exact: false）——
 *      整块消失的话，"没有这个东西"和"注入断了"在屏幕上字节级相同；
 *   3. 两边那个常量名是同一个：astro.config.ts 注入 `__LWJ_DEV_ROOT__`、
 *      这块读 `__LWJ_DEV_ROOT__`。改一边不改另一边 = 屏幕上**悄悄**退回文件名；
 *   4. 屏幕上印的那个文件**真的存在**，而且 `pnpm admin:restart` 真的在 package.json 里。
 *      印一条指向空气的路径，比不印更坏；
 *   5.【2026-09-21 挪进左侧菜单时加的】「发帖文案」该不该出现，判据是**地址栏**；
 *   6. 回落那一档（认不出侧边栏）在屏幕上必须和正常那一档长得不一样；
 *   7. 每一条入口的 href 都真的是 astro.config.ts 注进去的一条 dev 路由，
 *      而且这整块真的被 keystatic.config.ts import 了 —— 没接上是零症状的。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  copyStatus,
  fallbackNote,
  NAV_LINKS,
  restartPath,
  SHARE_ROUTE,
  shareHref,
  shareTarget,
} from "../../src/dev/keystaticToolbar";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** 注入进来的常量名。两边必须逐字一致 —— 这就是第 3 条要对的账。 */
const DEFINE = "__LWJ_DEV_ROOT__";
const SCRIPT = "admin-restart.cmd";

test("拼路径：跟着根目录的分隔符走", () => {
  assert.deepEqual(restartPath("C:\\work\\lwjai"), {
    text: `C:\\work\\lwjai\\${SCRIPT}`,
    exact: true,
  });
  assert.deepEqual(restartPath("/home/me/laowanjia"), {
    text: `/home/me/laowanjia/${SCRIPT}`,
    exact: true,
  });
  // 结尾带分隔符不许拼出两道杠。
  assert.equal(
    restartPath("C:\\work\\lwjai\\").text,
    `C:\\work\\lwjai\\${SCRIPT}`
  );
});

test("注入没成：退回文件名，而且标成不精确 —— 不许整块消失", () => {
  for (const bad of [undefined, "", "   "]) {
    const got = restartPath(bad);
    assert.equal(got.exact, false, `${JSON.stringify(bad)} 应该算没注入`);
    assert.equal(got.text, SCRIPT);
  }
});

test("接线对账：注入的常量名和工具条读的是同一个", () => {
  const config = read("astro.config.ts");
  const toolbar = read("src/dev/keystaticToolbar.ts");
  assert.ok(
    config.includes(`${DEFINE}: JSON.stringify(process.cwd())`),
    `astro.config.ts 里没有把 cwd 注入成 ${DEFINE}`
  );
  assert.ok(
    toolbar.includes(DEFINE),
    `keystaticToolbar.ts 没读 ${DEFINE}，路径那一行会永远退回文件名`
  );
});

test("点一下之后那句话分三档，不许把「没选上」说成「已选中」", () => {
  // ★ 2026-09-20 当场抓到的假话：复制失败时固定印「整条已选中，Ctrl-C」，
  //   而元素是个 <button>，点它根本不产生选区 —— 照着那句按 Ctrl-C 什么都没有。
  assert.equal(copyStatus(true, false), "已复制 ✓");
  assert.notEqual(copyStatus(false, true), copyStatus(false, false));
  assert.match(copyStatus(false, true), /选中/);
  assert.match(copyStatus(false, false), /自己选/);
});

test("印在屏幕上的那个脚本真的存在", () => {
  assert.ok(existsSync(join(ROOT, SCRIPT)), `仓库根目录没有 ${SCRIPT}`);
  const pkg = JSON.parse(read("package.json")) as {
    scripts?: Record<string, string>;
  };
  assert.ok(
    typeof pkg.scripts?.["admin:restart"] === "string",
    "package.json 里没有 admin:restart —— 提示里让人跑的命令不存在"
  );
});

/**
 * 【2026-09-21】下面几条是挪进左侧菜单那次加的。
 *
 * ⚠ 用例里的地址都是**在后台里真的会出现**的那些（点进一条稿子、点「新建」、
 * 点集合本身、Dashboard），不是照着 `ITEM_RE` 反推出来的 —— 照正则反推的用例
 * 只能证明正则等于它自己（docs/engineering-notes.md 第三节那条 `SC 13D`）。
 */
test("「发帖文案」常驻菜单 —— 三条入口都在 NAV_LINKS 里", () => {
  /**
   * 【2026-09-21 用户要的】它从"只在编辑某一条时冒出来"改成了常驻。
   * 钉在 NAV_LINKS 上而不是钉在渲染结果上：这张表就是菜单的内容，
   * 而"某一条被顺手挪出去"在屏幕上只是少了一行，没有任何报错。
   */
  const share = NAV_LINKS.find(l => l.href === SHARE_ROUTE);
  assert.ok(
    share,
    "NAV_LINKS 里没有 /_share —— 「发帖文案」又变回只在编辑页出现了"
  );
  assert.equal(share!.text, "发帖文案");
  // 【2026-09-22】加了第四条「清理特殊字符」→ /_tidy、第五条「封面图」→ /_xhs；
  // 【2026-09-23】小红书删了、卡留着，第五条改叫「图片卡片」→ /_cards。
  // 数字钉在这儿是为了让"顺手挪走一条"这件事红一次 —— 屏幕上少一行是没有任何报错的。
  assert.equal(NAV_LINKS.length, 5, "菜单里应该是五条入口");
  assert.ok(
    NAV_LINKS.some(l => l.href === "/_tidy" && l.text === "清理特殊字符"),
    "NAV_LINKS 里没有 /_tidy —— 清理特殊字符那一页在后台里就没有入口了"
  );
  assert.ok(
    NAV_LINKS.some(l => l.href === "/_cards" && l.text === "图片卡片"),
    "NAV_LINKS 里没有 /_cards —— 图片卡片那一页在后台里就没有入口了"
  );
  assert.ok(
    !NAV_LINKS.some(l => l.href === "/_xhs"),
    "菜单还指着 /_xhs —— 那条路由 2026-09-23 改成了 /_cards，指过去是 404"
  );
});

test("在编辑某一条时补锚点；认不出条目就退回不带锚点的 /_share", () => {
  // 编辑一条研究稿 / 一条问答：带锚点。
  assert.deepEqual(shareTarget("/keystatic/collection/posts/item/1002"), {
    collection: "posts",
    slug: "1002",
  });
  assert.deepEqual(shareTarget("/keystatic/collection/qa/item/1003"), {
    collection: "qa",
    slug: "1003",
  });

  /**
   * ★【2026-09-21】教程 / 提示词也带锚点 —— 同一天 /_share 扩成四个集合。
   *   这两条以前断言的是 `undefined`（那时 /_share 只发前两个集合）。
   *   ⚠ 名单是从登记表推的（`CONTENT_COLLECTIONS` 里有详情路由的那几个），
   *     所以这两条同时也钉着"别退回写死的 (posts|qa)"。
   */
  assert.deepEqual(shareTarget("/keystatic/collection/guides/item/1005"), {
    collection: "guides",
    slug: "1005",
  });
  assert.deepEqual(shareTarget("/keystatic/collection/prompts/item/1000"), {
    collection: "prompts",
    slug: "1000",
  });

  // 新建页：认不出条目。还没存盘的条目没有公开地址，/_share 上根本没有它 ——
  // 链接本身还在（常驻），只是不带锚点。
  assert.equal(shareTarget("/keystatic/collection/posts/create"), undefined);
  assert.equal(shareTarget("/keystatic/collection/qa/create"), undefined);

  // 集合列表页、Dashboard、单例页：同上。
  assert.equal(shareTarget("/keystatic/collection/posts"), undefined);
  assert.equal(shareTarget("/keystatic"), undefined);
  assert.equal(shareTarget("/keystatic/singleton/registry"), undefined);

  // 登记表里没有的集合名不许命中（别让正则变成 `[^/]+`）。
  assert.equal(
    shareTarget("/keystatic/collection/systemPrompts/item/publish-json"),
    undefined,
    "常用提示词没有公开地址，不该带锚点"
  );
});

test("锚点拼成 /_share#<集合>/<slug>，中文 slug 要解回来", () => {
  assert.equal(
    shareHref({ collection: "posts", slug: "1002" }),
    "/_share#posts/1002"
  );
  // 后台里中文 slug 在地址栏是百分号编码的；/_share 那边 focusHash() 比的是
  // `decodeURIComponent(location.hash.slice(1))`，所以这里要先解回来。
  assert.deepEqual(
    shareTarget("/keystatic/collection/qa/item/%E4%B8%AD%E6%96%87"),
    { collection: "qa", slug: "中文" }
  );
  // ⚠ 解不开不许抛：这段每 300ms 跑一次，抛一次就是整块菜单从此不再更新，
  //   而手敲一个带孤立 `%` 的地址就够了。
  assert.deepEqual(shareTarget("/keystatic/collection/posts/item/100%2"), {
    collection: "posts",
    slug: "100%2",
  });
});

test("回落那一档在屏幕上必须自报家门，不许和正常档长得一样", () => {
  assert.equal(
    fallbackNote("sidebar"),
    undefined,
    "正常挂进侧边栏时不该多出一句话"
  );
  const note = fallbackNote("corner");
  assert.ok(
    typeof note === "string" && note.trim() !== "",
    "认不出侧边栏时屏幕上必须说一句 —— 静默挪到右下角等于没人会发现"
  );
  assert.notEqual(note, fallbackNote("sidebar"));
});

test("每条入口都指向一条真的 dev 路由，而且这整块真的被后台 import 了", () => {
  const astro = read("astro.config.ts");
  const hrefs = [...NAV_LINKS.map(l => l.href), SHARE_ROUTE];
  assert.ok(hrefs.length >= 3, "入口少于三条 —— 是不是有一条被顺手删了");
  for (const href of hrefs) {
    assert.ok(
      astro.includes(`pattern: "${href}"`),
      `astro.config.ts 里没有 injectRoute ${href} —— 菜单里那条入口指向空气`
    );
  }
  // 挂载点只有这一句副作用 import。删了它整块**一声不响地不存在**，
  // 而 astro check / pnpm build 全绿（这个模块除了它没有别的引用方）。
  //
  // ⚠ 正则**必须顶行锚定**（`^…/m`）。第一版写的是 /import\s+"…"/，
  //   实测把那一行注释成 `// import "./src/dev/keystaticToolbar";` 之后**照样绿** ——
  //   子串还在。那条断言钉的其实是"这个字符串在文件里出现过"，
  //   和"后台真的加载了它"是两件事（docs/engineering-notes.md 第一节那个 `scan.length === 1` 同形态）。
  assert.match(
    read("keystatic.config.ts"),
    /^import\s+"\.\/src\/dev\/keystaticToolbar";/m,
    "keystatic.config.ts 没 import keystaticToolbar —— 后台里这块东西整个不存在"
  );
});
