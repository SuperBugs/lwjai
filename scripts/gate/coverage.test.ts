/**
 * 发布闸的**覆盖面**测试 —— 闸门到底看不看这些东西。
 *
 * gate.test.ts 管的是"看到了之后判得对不对"（22 条全是 scan() / 规则表的纯内存单测，
 * 一行都不碰磁盘）。这份管的是前一个问题：**它有没有看**。
 *
 * ★ 为什么必须有这一份：2026-09-18 一轮只读侦察发现，新增一个内容目录
 *   （`src/content/qa/`）而不动闸门时，**两道闸都不扫它，一个字的报错都没有** ——
 *   `files.length` 因为 posts 还有稿所以 > 0，exit 2 不触发，屏幕照常印
 *   「✓ 没命中已知的危险说法」。同一天还发现 `src/content/pages/about.md`
 *   从建站起就没被任何一道闸看过，而它正文里有一句「不写我自己的仓位」（own_size，block 档）。
 *   当时 22 条测试全绿 —— 因为**没有任何一条测试会因为"漏扫"而失败**。
 *   这正是 docs/gate.md 第 7 节 `SC 13D` 事故的形态：断言和代码一起漏，零症状。
 *
 * 所以下面这几条是**双向对账**：磁盘上有的必须在表里，表里有的必须在磁盘上。
 * 单向都不行 —— 漏登记和路径写错是两个方向的失败，而且都零症状。
 *
 * 跑：`pnpm test`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  CONTENT_COLLECTIONS,
  NUMBERED_COLLECTIONS,
  SCANNED_DIRS,
  collectionSpec,
} from "../../src/config/collections";
import {
  inspect,
  scannedSpecForPath,
  SCANNED_PATH_RE,
  SCANNED_SPECS,
} from "./inspect";

const CONTENT_ROOT = "src/content";
const abs = (dir: string) => join(process.cwd(), ...dir.split("/"));

// ── 登记表自身的形状 ──────────────────────────────────────────────────
// 后面几条对账全都建立在这些前提上。前提坏了，对账会"通过"而其实没对上。

test("登记表：dir 是仓库根相对的 POSIX 路径，key 唯一", () => {
  const keys = CONTENT_COLLECTIONS.map(s => s.key);
  assert.equal(
    new Set(keys).size,
    keys.length,
    "key 不许重复 —— collectionSpec() 和逐集合报数认的都是它"
  );
  for (const s of CONTENT_COLLECTIONS) {
    assert.ok(s.dir.length > 0, `${s.key} 的 dir 是空的`);
    assert.ok(
      !s.dir.includes("\\"),
      `${s.key} 的 dir 用了反斜杠（${s.dir}）—— 登记表是 POSIX 正斜杠的，` +
        `check-staged 拿 git 给的正斜杠路径去比它，反斜杠会静默匹配不上`
    );
    assert.ok(
      !s.dir.endsWith("/"),
      `${s.key} 的 dir 带了尾斜杠（${s.dir}）—— 路径前缀判断会多出一个空段`
    );
    assert.ok(
      s.label.length > 0,
      `${s.key} 没有 label —— 报表和错误信息里就只能印一个英文 key 给人猜`
    );
  }
});

test("登记表：一个 import 都不许有", () => {
  // 这条是**闸门自己的依赖**，所以钉在闸门的测试里。
  // 两道闸是裸 tsx 跑的（pre-commit 钩子、Cloudflare 构建第一步），那里没有 `@/` 别名、
  // 也没有 astro:content 这类虚拟模块。登记表一旦 import 了其中任何一样，
  // 闸门就会在 **import 阶段**直接炸 —— 而炸在 pre-commit 上的那个场景，
  // 人十有八九会顺手 `--no-verify` 一把绕过去，然后就没有然后了。
  const src = readFileSync(abs("src/config/collections.ts"), "utf8");
  const imports = src.split("\n").filter(l => /^\s*import[\s{*]/.test(l));
  assert.deepEqual(
    imports,
    [],
    `src/config/collections.ts 里出现了 import：\n${imports.join("\n")}\n` +
      `  它要同时喂给 Astro 侧和裸 tsx 侧，只能是纯数据 + 纯函数。`
  );
});

test("登记表：每个集合都在 src/content/ 下", () => {
  // 这条不是洁癖。下面那条"磁盘 → 表"的对账**只枚举 src/content/**，
  // 如果登记表允许别处的目录，那条对账就有一半是假的：它永远看不到那些目录，
  // 也就永远不会因为漏登记而失败。要往别处加集合，先把对账的枚举范围一起改。
  for (const s of CONTENT_COLLECTIONS) {
    assert.ok(
      s.dir.startsWith(`${CONTENT_ROOT}/`),
      `${s.key} 的 dir 在 src/content/ 之外（${s.dir}）—— 那样下面的漏登记对账就形同虚设了`
    );
  }
});

// ── 双向对账 ──────────────────────────────────────────────────────────

test("对账①：磁盘上的内容目录必须全部登记进闸门", () => {
  const onDisk = readdirSync(abs(CONTENT_ROOT), { withFileTypes: true })
    // 下划线开头的不进 collection（content.config.ts 的 glob 是 `**/[^_]*.{md,mdx}`），
    // 闸门跟着同一条约定，所以也不要求它们登记。
    .filter(d => d.isDirectory() && !d.name.startsWith("_"))
    .map(d => `${CONTENT_ROOT}/${d.name}`)
    .sort();

  const registered = new Set(CONTENT_COLLECTIONS.map(s => s.dir));
  const unregistered = onDisk.filter(d => !registered.has(d));

  assert.deepEqual(
    unregistered,
    [],
    `这些内容目录没登记进 src/config/collections.ts：${unregistered.join(" / ")}\n` +
      `  没登记 = 两道闸都不看它，而且**一个字的报错都没有**：总篇数因为别的集合还有稿所以 > 0，\n` +
      `  exit 2 不触发，屏幕照常印「✓ 没命中已知的危险说法」。这条测试就是为了让那一天有人知道。`
  );
});

test("对账②：登记表里的目录必须真的存在", () => {
  for (const s of CONTENT_COLLECTIONS) {
    const p = abs(s.dir);
    assert.ok(
      existsSync(p),
      `${s.label}（${s.key}）登记的目录不存在：${s.dir}\n` +
        `  路径写错和"这个集合还没有内容"是两件事。构建期闸对这一档是 exit 2 ——\n` +
        `  一次路径写错会表现成"扫描通过"，而闸门其实一个字节都没看。`
    );
    assert.ok(
      statSync(p).isDirectory(),
      `${s.key} 登记的 ${s.dir} 不是目录 —— walk() 到那里会 ENOTDIR 崩掉，不是干净的 exit 2`
    );
  }
});

test("对账③：不扫的集合必须写明为什么不扫", () => {
  // 不许靠"没登记"来豁免一个目录 —— 那和忘了登记字节级相同。
  // 要放过一个集合，就得在表里显式写 scanned: false 并留下理由，
  // 这样 `git log -p` 里看得见是谁在哪天决定不扫它、为什么。
  for (const s of CONTENT_COLLECTIONS.filter(s => !s.scanned)) {
    assert.ok(
      (s.scanExempt ?? "").trim().length > 0,
      `${s.label}（${s.key}）写了 scanned: false 却没写 scanExempt —— ` +
        `一个不用写理由的"不扫"，三天后就是下一个 about.md`
    );
  }
});

test("对账④：两道闸的扫描范围真的同源", () => {
  assert.deepEqual(
    [...SCANNED_DIRS],
    CONTENT_COLLECTIONS.filter(s => s.scanned).map(s => s.dir),
    "SCANNED_DIRS 和登记表里 scanned: true 的那些目录对不上"
  );
  assert.deepEqual(
    SCANNED_SPECS.map(s => s.dir),
    [...SCANNED_DIRS],
    "构建期闸遍历的目录（SCANNED_SPECS）和暂存区闸的过滤器（SCANNED_DIRS）对不上"
  );

  // 暂存区闸拿 SCANNED_PATH_RE 去比 `git diff --cached` 给的路径。
  // 每一个登记目录下的真实路径形态都必须被它捞到 —— 少捞一种，
  // 那种稿子就能安静地穿过 pre-commit。
  for (const dir of SCANNED_DIRS) {
    for (const sample of [
      `${dir}/hello-20260918.md`,
      `${dir}/about.mdx`,
      `${dir}/2026/q3/tsla.md`, // 后台写扁平文件，但人手建子目录是允许的
    ]) {
      assert.ok(
        SCANNED_PATH_RE.test(sample),
        `暂存区闸的过滤器漏了 ${sample} —— 这条路径在构建期会被扫，在 pre-commit 不会`
      );
      assert.equal(
        scannedSpecForPath(sample)?.dir,
        dir,
        `${sample} 归不进 ${dir} —— 逐集合报数会少一篇，合计对不上（report 按故障处理）`
      );
    }
  }
});

test("对账④补：范围之外的路径不许被捞进来", () => {
  // 反方向也要钉。过滤器过宽的后果不是漏扫，是闸门对着 README 和构建脚本报警，
  // 人很快就学会闭眼绕过它 —— 到那时它已经废了，只是没人知道。
  //
  // 注意这两个函数的分工，别把它们混成一个：
  //   SCANNED_PATH_RE   —— 「这条路径查不查」（认目录 + 认扩展名）
  //   scannedSpecForPath—— 「这条路径算哪个集合的」（**只认目录前缀**）
  // 后者只会被喂已经过了正则的路径，所以它不看扩展名是对的。
  for (const p of [
    "README.md",
    "docs/gate.md",
    "src/pages/index.astro",
    "src/content/pageshadow/x.md", // 目录名必须整段命中且后面跟 /
  ]) {
    assert.ok(!SCANNED_PATH_RE.test(p), `${p} 不该进发布闸的扫描范围`);
    assert.equal(scannedSpecForPath(p), undefined, `${p} 不该归进任何集合`);
  }

  // 登记目录下的非内容文件：正则必须把它挡掉（下面这些真的会出现在
  // src/content/ 里 —— 配图、数据附件），否则闸门会拿 gray-matter 去解析二进制。
  for (const p of [
    "src/content/posts/notes.txt",
    "src/content/posts/chart.png",
    "src/content/qa/data.json",
  ]) {
    assert.ok(!SCANNED_PATH_RE.test(p), `${p} 不是 .md / .mdx，不该被查`);
  }
});

test("这一轮的三个集合都在表里，而且都在扫", () => {
  // 写死这三个 key 是刻意的：它们各自对应一个真实的漏扫事故或风险。
  // posts —— 一直在扫；pages —— about.md 漏扫了整个建站期（own_size，block 档）；
  // qa    —— 这一轮新增，新增内容目录而不动闸门是零症状漏扫。
  for (const key of ["posts", "qa", "pages"]) {
    const spec = collectionSpec(key);
    assert.ok(spec, `登记表里没有 ${key}`);
    assert.equal(spec.scanned, true, `${key} 居然不在扫描范围里`);
  }
});

/**
 * 【2026-09-21】**四个编号集合的 loader 必须都是 `numberedGlob()`。**
 *
 * 那个 loader 和裸 `glob()` 的唯一区别是它的 `generateId` 会检查文件名是不是
 * 一个条目号 —— 而那道检查是**后台撞号的唯一兜底**：Keystatic 撞名会静默加
 * `-2` 后缀（`/posts/8-2`），页面打得开、构建是绿的、闸门也不看文件名。
 *
 * ★ 所以把任何一个集合改回裸 `glob()` 的症状是**零**，直到某天两条内容抢同一个号。
 *   这一条和上面那条「构建链顺序」同一个形态：钉的是"那道检查到底在不在链路里"。
 *
 * 按**源码文本**比，因为 `src/content.config.ts` import 了 `astro:content`，
 * 裸 tsx 加载不了它（和上面那条读 package.json 是同一个做法）。
 */
test("四个编号集合的 loader 必须都带文件名检查（numberedGlob）", () => {
  const src = readFileSync(abs("src/content.config.ts"), "utf8");
  for (const key of NUMBERED_COLLECTIONS) {
    assert.ok(
      src.includes(`numberedGlob("${key}")`),
      `${key} 的 loader 不是 numberedGlob —— 这个集合的文件名从此没人检查，` +
        `后台撞号会静默写出 /${key}/8-2 这种地址，而四处全绿`
    );
  }
  // 没有详情路由的集合（pages）不编号，它的文件名就是 about 这种词。
  assert.ok(
    !src.includes('numberedGlob("pages")'),
    "pages 不该编号：它没有按条目的详情路由，路由是一个个手写的"
  );
  // 编号集合里不许再留一个裸 glob（改了一半的状态）。
  const bareGlobs = src.match(/loader:\s*glob\(/g) ?? [];
  assert.equal(
    bareGlobs.length,
    CONTENT_COLLECTIONS.length - NUMBERED_COLLECTIONS.length,
    "裸 glob 的数量和「不编号的集合」对不上 —— 有集合被改回去了，或者新集合没接上"
  );
});

// ── 闸门在构建链里的位置 ──────────────────────────────────────────────
// 上面几条钉的是"闸门看哪些文件"。这一条钉的是更前面一个问题：**它到底跑不跑**。
//
// ★ 为什么必须有这一条（2026-09-18 部署前审计查出来的）：
//   docs/engineering-notes.md 红线 3 说「构建脚本里它排在 astro check 前面，有一条测试钉着这件事
//   （`闸门没有开关`）」—— 但那条测试（gate.test.ts）断言的是 `scan.length === 1`，
//   也就是 scan() 不许有第二个参数，**和构建脚本的顺序毫无关系**。
//   在这一条加进来之前，把 `tsx scripts/gate/check.ts && ` 从 build 里删掉，
//   `pnpm test` 照样全绿、`pnpm build` 照样全绿，而 docs/deploy.md 所说的
//   「最后一道，也是唯一一道绕不过的闸」就这么没了。
//   这正是 docs/gate.md 第 7 节 `SC 13D` 的形态：**以为有保障，其实钉的是另一件事**。
//
// 钉的是**相对位置**而不是前缀字面量：把 `tsx scripts/gate/check.ts` 换成等价的
// `pnpm gate` 是合法重构，不该让测试假红。

test("构建链：发布闸必须排在 astro check / astro build 前面", () => {
  const pkg = JSON.parse(readFileSync(abs("package.json"), "utf8"));
  const build: string = pkg.scripts?.build ?? "";

  // 先钉住参照物本身存在。少了任何一个，下面的位置比较就会拿 -1 去比，
  // 那种"通过"和真的通过字节级相同。
  for (const marker of ["astro check", "astro build"]) {
    assert.ok(
      build.includes(marker),
      `package.json 的 build 里找不到 \`${marker}\`。\n` +
        `  如果是刻意改的构建链，请把这条测试一起改 —— 别让它退化成一个恒真断言。\n` +
        `  当前 build: ${build}`
    );
  }

  const gateAt = build.search(/scripts\/gate\/check\.ts|pnpm (run )?gate\b/);
  assert.ok(
    gateAt >= 0,
    `package.json 的 build 里没有发布闸。\n` +
      `  删掉它 = 把 docs/deploy.md 说的「唯一一道绕不过的闸」拆掉，而且**零症状**：\n` +
      `  测试全绿、构建全绿、站照常发布。Cloudflare 那条自动路径跑的就是这个脚本。\n` +
      `  当前 build: ${build}`
  );

  for (const marker of ["astro check", "astro build"]) {
    assert.ok(
      gateAt < build.indexOf(marker),
      `发布闸排在 \`${marker}\` 后面了。\n` +
        `  顺序不是风格问题：类型错误是"修一下再发"，泄露是"发出去就收不回来"。\n` +
        `  闸门必须第一个跑，后面任何一步失败都不该让它已经放过的内容多走一步。\n` +
        `  当前 build: ${build}`
    );
  }

  // package.json:14 的 `//build` 注释②记着的第二个顺序不变量，同样没有测试守过。
  assert.ok(
    build.indexOf("rm -rf public/pagefind") < build.indexOf("astro build"),
    `\`rm -rf public/pagefind\` 必须排在 \`astro build\` **前面**。\n` +
      `  public/pagefind 在 .gitignore 里、因此只增不减，而 Pagefind 的 fragment 存的是\n` +
      `  **整页正文**：astro build 会把 public/ 整个拷进 dist，pagefind 只覆盖同名文件、\n` +
      `  删不掉上一轮留下的 fragment —— 于是一篇**已经删掉**的稿子的全文会被 cp 回 public、\n` +
      `  下一轮再拷进 dist 发上公网。发布闸扫的是内容文件，看不见这堆产物。\n` +
      `  当前 build: ${build}`
  );

  // ★【2026-09-18 实测复现】第三个顺序/开关不变量，和上一条是同一种病：
  //   **删掉的稿子被重新发布**，只是缓存在另一个地方。
  //
  //   Astro 的内容层缓存不在 `.astro/`，在 **`node_modules/.astro/data-store.json`**。
  //   干净复现过：建一篇 → 构建（页面在）→ 删掉 .md → `rm -rf dist` 再构建
  //   → **页面还在**；连 `rm -rf .astro` 一起清 → **还在**；
  //   清掉 `node_modules/.astro` 才没。
  //
  //   最坏的一点不是"多发了一页"，是**闸门和构建看的不是同一批东西**：
  //   闸门扫源文件、报「研究稿 0 篇」，而 dist 里躺着那一篇。
  //   也就是说"因为漏了东西所以把这篇删掉"这个动作，在本机部署路径
  //   （docs/deploy.md 的 `npx wrangler deploy`）上**是无效的**。
  //   Cloudflare 那条自动路径是干净检出，node_modules 是新装的，不受影响 ——
  //   所以这是一个**只在本机发生、而且本机看起来一切正常**的缺口。
  //
  //   `--force` 是 Astro 官方的开关（`astro build --help`：
  //   "Clear the content layer and content collection cache, forcing a full rebuild"），
  //   实测能清掉。代价是失去增量缓存、构建慢一点 —— 这笔买卖在这个项目里不用犹豫。
  assert.match(
    build,
    /astro build\s+--force/,
    `\`astro build\` 必须带 \`--force\`。\n` +
      `  去掉它 = 删掉的稿子在本机构建里**继续被发布**，而闸门报「0 篇」。\n` +
      `  两边看的不是同一批东西，屏幕上没有任何症状。\n` +
      `  （Astro 的内容层缓存在 node_modules/.astro/，rm -rf .astro 清不掉。）\n` +
      `  当前 build: ${build}`
  );
});

/**
 * ★ 这一条守的不是闸门，是**测试自己跑不跑**。它住在这个文件里，
 *   因为它必须住在一个**肯定会被跑到**的文件里 —— 放在新目录下的话，
 *   那个目录漏出 `pnpm test` 的射程时，这条断言会跟着一起消失。
 *   （和上面那条"发布闸在构建链里的位置"同一个形态：钉的是"它到底跑不跑"。）
 *
 * 【2026-09-18】`pnpm test` 的路径是逐段写出来的（`scripts/gate/*.test.ts
 * scripts/content/*.test.ts`），不是一个 `scripts/**`。新加一个测试目录忘了写进去，
 * 后果是**那一整批测试静默不跑**，而 `pnpm test` 照常全绿、条数只是少了一点 ——
 * 没有人会注意到一个本来就在变的数字变小了。
 */
test("pnpm test 真的会跑到 scripts/ 下的每一个 *.test.ts", () => {
  const pkg = JSON.parse(readFileSync(abs("package.json"), "utf8"));
  const cmd: string = pkg.scripts?.test ?? "";
  const patterns = cmd.split(/\s+/).filter(a => a.endsWith(".test.ts"));

  // 先钉参照物。一个都没有的话，下面两条对账会双双"通过"。
  assert.ok(
    patterns.length > 0,
    `package.json 的 test 里一条 *.test.ts 路径都没有。当前 test: ${cmd}`
  );

  const found: string[] = [];
  const walkTests = (rel: string) => {
    for (const d of readdirSync(abs(rel), { withFileTypes: true })) {
      const p = `${rel}/${d.name}`;
      if (d.isDirectory()) walkTests(p);
      else if (d.name.endsWith(".test.ts")) found.push(p);
    }
  };
  walkTests("scripts");

  // `*` 只跨一段（和 sh、node --test 的行为一致），别的字符原样。
  const toRe = (glob: string) =>
    new RegExp(
      `^${glob
        .split("*")
        .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*")}$`
    );
  const res = patterns.map(toRe);

  const uncovered = found.filter(f => !res.some(re => re.test(f)));
  assert.deepEqual(
    uncovered,
    [],
    `这些测试文件不在 \`pnpm test\` 的射程内：${uncovered.join(" / ")}\n` +
      `  它们**一条都不会跑**，而 pnpm test 照常全绿。把路径加进 package.json 的 test。\n` +
      `  当前 test: ${cmd}`
  );

  // 反方向：每条 pattern 至少要匹配到一个真实文件。
  // 目录改了名之后，留在那儿的那条 pattern 会静默匹配不到任何东西 ——
  // 而"少跑了一批测试"和"那批测试全过"在屏幕上分不出来。
  const dead = patterns.filter((_, i) => !found.some(f => res[i].test(f)));
  assert.deepEqual(
    dead,
    [],
    `package.json 的 test 里这些路径一个文件都匹配不到：${dead.join(" / ")}\n` +
      `  目录改名或删了测试之后，它就是一条死路径 —— 而 pnpm test 不会因此报错。`
  );
});

// ── 扫描范围：frontmatter 里哪些字段算"会上公网的自由文本" ──────────────
// 目录扫到了，字段没扫到，同样是漏扫。下面每条用例都是**人或模型真的会这么填**的，
// 不是从 pattern 里抠出来的碎片（见 gate.test.ts 开头那段 SC 13D）。

/**
 * 【2026-09-22 搬家】公司中英文名原来是条目上的两格自由文本（`symbolName` /
 * `symbolNameEn`），这里原来有两条用例钉着"它们要被扫到"—— 用的语料是
 * 「特斯拉（example_server 自动带出的中文名）」和「Tesla, Inc.（example_client 导出的名字）」，
 * 也就是**从上游系统粘过来时会连备注一起粘进去**的那个真实填法。
 *
 * 标的那一格改成多选之后那两格没了：名字搬进了标的表（src/data/symbols.json），
 * 条目上只剩代码。**那段语料一个字都没丢** —— 它搬到了 `registryGate.test.ts`，
 * 因为现在扫它的是 `inspectDataJson`（SCANNED_DATA_FILES 那条路）。
 * 下面这条钉的是**搬家这件事本身**：条目上不许再长出一个"上公网但闸门不扫"的名字格。
 */
test("字段覆盖：公司名不许再回到条目上 —— 它在标的表里，由另一条路过闸", () => {
  const schema = readFileSync(abs("src/content.config.ts"), "utf8");
  for (const dead of ["symbolName", "symbolNameEn"]) {
    assert.ok(
      !new RegExp(`^\\s+${dead}\\s*:`, "m").test(schema),
      `content.config.ts 里又出现了 ${dead} 这一格。\n` +
        `  公司名住在标的表里（src/data/symbols.json，后台「标的」那一页），` +
        `三道闸按 SCANNED_DATA_FILES 扫它。\n` +
        `  真要把它加回条目上，**必须同时**把它加进 scripts/gate/inspect.ts 的 subject —— ` +
        `漏掉的话「特斯拉（example_server 自动带出）」这种写法会一路发到公网上，而四处全绿。`
    );
  }
  // 反面自证：这个扫描器不是在扫空气 —— 真·存在的那几格必须扫得到。
  for (const alive of ["symbols", "symbolSource"]) {
    assert.match(schema, new RegExp(`^\\s+${alive}\\s*:`, "m"));
  }
});

test("字段覆盖：tags 要扫 —— 标签撑起整套 /tags/ 公开页", () => {
  // "我的持仓复盘"是一个人真的会随手打上的标签，而它会变成一个公开页面的标题。
  const raw = [
    "---",
    "title: 英伟达数据中心业务的客户集中度",
    "description: 前几大客户占比和议价能力。",
    "tags:",
    "  - 半导体",
    "  - 我的持仓复盘",
    "---",
    "",
    "数据中心营收的客户集中度仍然偏高，这是最强的反证。",
  ].join("\n");

  const r = inspect("src/content/posts/nvda-concentration.md", raw);
  assert.ok(
    r.blocked.some(h => h.code === "own_position"),
    `tags 没被扫到。命中的是：${r.blocked.map(h => h.code).join(",") || "（无）"}`
  );
});

test("字段覆盖：contributor 要扫 —— 投稿人署名是别人写的自由文本", () => {
  // 提示词模块收投稿。署名栏是一个**投稿人自己填的、直接印在页面上**的自由文本框，
  // 而人在署名栏里真的会写"某某（嘉信账户实盘跑了半年）"这种话来证明自己的来路。
  // 我自己粘的字至少还过一遍眼，这一项的字不是我写的 —— 更该扫。
  const raw = [
    "---",
    "title: 财报季逐条核对提示词",
    "description: 一份把财报电话会拆成可核对项的提示词。",
    "origin: contributed",
    "contributor: 某某（我的账户实盘跑了半年）",
    "---",
    "",
    "先核对指引口径，再看一次性项目。",
  ].join("\n");

  const r = inspect("src/content/prompts/earnings-check.md", raw);
  assert.ok(
    r.blocked.some(h => h.code === "own_broker"),
    `contributor 没被扫到。命中的是：${r.blocked.map(h => h.code).join(",") || "（无）"}`
  );
});

test("字段覆盖：标签之间不许被连成一条命中", () => {
  // 两个各自无害的标签。用空格拼进 subject 的话，"为什么我看错了 成本结构"
  // 会命中 own_cost（我 + 4 个字 + 成本，锚点允许夹 6 个字）——
  // 一条纯粹的误伤，而且人完全看不出它是两个标签拼出来的。
  // 所以标签之间用换行拼：第一人称锚点把 \n 当硬边界。
  const raw = [
    "---",
    "title: 一次判断错误的复盘",
    "description: 当时哪一步的推理是错的。",
    "tags:",
    "  - 为什么我看错了",
    "  - 成本结构",
    "---",
    "",
    "错的是对定价权的假设，不是对成本曲线的假设。",
  ].join("\n");

  const r = inspect("src/content/posts/postmortem.md", raw);
  assert.deepEqual(
    r.blocked.map(h => `${h.code}「${h.matched}」`),
    [],
    "两个标签被连成了一条命中 —— 闸门天天咬正确的句子，人就会养成闭眼豁免的习惯"
  );
});

test("字段覆盖：没登记要扫的 frontmatter 键一律不进 subject", () => {
  // 这是全仓唯一一条**负方向**的字段范围用例 —— 别的都在断言"这个字段必须扫到"，
  // 只有它断言"没登记的不许扫"。两个方向缺一不可：
  // 漏扫是泄露，多扫是天天咬正确的句子（而那会让人养成绕过闸门的习惯）。
  //
  // ⚠【2026-09-18】这条以前用 `gateWaiveReason` 当探针，钉的是"豁免理由不许扫，
  //   否则豁免永远闭不上环"。豁免机制整个删掉之后那个探针不存在了。
  //   **没有跟着把这条用例删掉** —— 它的属性和豁免无关，换个真实的探针字段就行。
  //   `author` 是天然的替身：它在 schema 里、上不了公网（站上印的是
  //   config.site.author）、也不在 inspect() 的 subject 白名单里。
  const raw = [
    "---",
    "title: 毛利率扩张里有多少来自单位成本",
    "description: 拆一下价格和成本各贡献了多少。",
    "author: 某某（我持有这只票两个季度了，我的成本在 187）",
    "---",
    "",
    "公司披露的单位制造成本同比下降，其中大部分来自产线改造。",
  ].join("\n");

  const r = inspect("src/content/posts/margin.md", raw);
  assert.deepEqual(
    r.blocked.map(h => `${h.code}「${h.matched}」`),
    [],
    "author 被扫进了 subject —— 它不在白名单里，扫它等于凭空多一档误伤"
  );
});

test("豁免机制已经删掉：frontmatter 里残留的 gateWaived 不再有任何效力", () => {
  // ★【2026-09-18】这是「豁免没了」在仓库里**唯一的机械陈述**。
  //   删除类改动最典型的事故是"删了一半"：schema / 后台 / 文档都清了，
  //   而 inspect() 里那几行还在 —— 那种状态下 pnpm test、pnpm build、页面**四处全绿**，
  //   因为 inspect() 走 matter(raw) 直接读磁盘原文，完全绕过 zod。
  //   磁盘上只要还躺着一个 gateWaived，它就照常全功能生效，没有任何人会发现。
  const raw = [
    "---",
    "title: 一篇残留了豁免字段的稿子",
    "description: 验豁免机制真的没了。",
    "gateWaived:",
    "  - own_cost",
    'gateWaiveReason: "这里的成本说的是公司的单位制造成本"',
    "---",
    "",
    "考虑到我的成本在 187 左右，这个位置不算便宜。",
  ].join("\n");

  const r = inspect("src/content/posts/leftover.md", raw);
  assert.deepEqual(
    r.blocked.map(h => h.code),
    ["own_cost"],
    "残留的 gateWaived 把这条命中放行了 —— 豁免机制没删干净"
  );
});

test("inspect() 的分档：warn 档不许被当成 block 拦下来", () => {
  // ★【2026-09-18】这条是 inspect.ts 里 `blocked: result.blocking` 那一行唯一的护栏。
  //   删豁免时那一行从 `unwaived(result, waived)` 改过来，**写成 `result.hits` 也能全绿**
  //   —— 当时全部样本的 warn 命中数恰好都是 0。后果要等下一篇带「底仓」或
  //   「我打算买」的稿子才出现，而且表现成"这句话怎么发不出去了"。
  //   （写完照 docs/engineering-notes.md 坑 17 办：故意改成 result.hits 跑一次看它红，再改回来 —— 实跑过。）
  const raw = [
    "---",
    "title: 财报后的观察",
    "description: 一句意图，一个仓位口语。",
    "---",
    "",
    "如果财报后回落到 190 下方，我打算买一些作为底仓。",
  ].join("\n");

  const r = inspect("src/content/posts/intent.md", raw);
  assert.deepEqual(r.blocked, [], "warn 档被当成 block 拦下来了");
  assert.deepEqual(
    r.warnings.map(h => h.code).sort(),
    ["bare_position_term", "own_intent"],
    "warn 档命中不全 —— 它该被报出来，只是不拦"
  );
});
