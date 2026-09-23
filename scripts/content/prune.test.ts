/**
 * 批量清理的判据测试。**一行都不碰磁盘**（除了读登记表那两条对账）——
 * 判据在 ./plan.ts 里是纯函数，所以这里喂的是真实形状的 frontmatter，
 * 而不是我临时造的一棵假文件树。
 *
 * ★ 用例是从「我真的会这么敲这条命令 / 后台真的会这么写这个字段」来的，
 *   不是照着代码里的分支反推的。docs/engineering-notes.md 第三节那条纪律（`SC 13D` 事故：
 *   87 条测试全绿，因为测试自己喂的也是错的写法）在这里的落点是：
 *   时间那几条用的是 `src/content/posts/` 里真实存在的那种 `2026-09-17T18:30:00Z`，
 *   而且**先用 gray-matter 解一遍**，确认 `entryTime()` 收到的到底是 Date 还是字符串。
 *
 * 跑：`pnpm test`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { CONTENT_COLLECTIONS } from "../../src/config/collections";
import {
  entryTime,
  judge,
  parseArgs,
  parseDayRange,
  PRUNABLE_KEYS,
  PRUNE_SCOPE,
  UsageError,
  type Candidate,
  type GitState,
} from "./plan";

/** 两个时区都**写死在测试里**，都不从配置读 —— 从配置读的话，配置改成 UTC 那天
 *  下面每一条断言都会变成恒真，而"区间按站点时区的日界算"这件事就没人钉着了。
 *
 *  ★ 要两个是刻意的，它们的方向相反，少一边就漏一半：
 *    - `SITE_TZ` 是站上今天真在用的那个（【2026-09-21】`Asia/Shanghai`，+8、
 *      **没有夏令时**），日界比 UTC **早**；
 *    - `TZ` 是一个**偏移为负、有夏令时**的时区，日界比 UTC **晚**
 *      （这个站 2026-09-21 之前就是它）。把换算写成反号的那种错，
 *      只钉一边的话仍然全绿；下面那条 23 / 25 小时的用例也只有它测得出来。 */
const TZ = "America/New_York";
const SITE_TZ = "Asia/Shanghai";

const entry = (
  data: Record<string, unknown>,
  git: GitState = "committed"
): Candidate => ({
  file: "src/content/posts/tsla-20260917.md",
  collectionKey: "posts",
  slug: "tsla-20260917",
  data,
  git,
});

const DEFAULTS = { includeFeatured: false, allowUncommitted: false };

// ── 谁参与清理：和登记表双向对账 ──────────────────────────────────────

test("清理范围表：登记表里的每个集合都必须在表里出现恰好一次", () => {
  // 新增一个内容集合而忘了在 PRUNE_SCOPE 里表态，后果是"那个集合永远不会被清理"——
  // 失败方向是安全的（少删），但它**零症状**：清理命令照常跑、照常报"命中 0 条"。
  // 所以这条对账要的是"表过态了"，不是"表里有它"。
  for (const c of CONTENT_COLLECTIONS) {
    const hits = PRUNE_SCOPE.filter(s => s.key === c.key);
    assert.equal(
      hits.length,
      1,
      `${c.label}（${c.key}）在 scripts/content/plan.ts 的 PRUNE_SCOPE 里出现了 ${hits.length} 次，` +
        `应该恰好 1 次 —— 要么参与清理，要么写明为什么不清理`
    );
  }
});

test("清理范围表：表里不许有登记表之外的集合", () => {
  // 反方向。集合改名之后，表里留着的那一行会静默失效 ——
  // `requireCollectionSpec()` 到执行时才抛，而那时人已经敲了 --yes。
  const registered = new Set(CONTENT_COLLECTIONS.map(c => c.key));
  const ghosts = PRUNE_SCOPE.filter(s => !registered.has(s.key)).map(s => s.key);
  assert.deepEqual(
    ghosts,
    [],
    `PRUNE_SCOPE 里有登记表里不存在的集合：${ghosts.join(" / ")}`
  );
});

test("清理范围表：不清理的集合必须写明为什么", () => {
  for (const s of PRUNE_SCOPE.filter(s => s.timeField === null)) {
    assert.ok(
      (s.pruneExempt ?? "").trim().length > 0,
      `${s.key} 不参与清理却没写 pruneExempt —— 一条没有理由的"不清理"，` +
        `过一阵没人分得清它是取舍还是手滑`
    );
  }
  // 这一档现在有两个实例，**两条理由不一样**，别把它们读成一条：
  //   pages   —— schema 里压根没有 pubDatetime，读不出时间。
  //   prompts —— 有时间，但那个时间不是"过期"的依据（它是当前在用的工具，
  //              而且收读者投稿）。见 plan.ts 里那两段 pruneExempt。
  // ★ 顺序跟着登记表走（PRUNE_SCOPE 的书写顺序 = collections.ts 的顺序）。
  assert.deepEqual(
    PRUNE_SCOPE.filter(s => s.timeField === null).map(s => s.key),
    ["prompts", "pages"]
  );
  assert.deepEqual([...PRUNABLE_KEYS], ["posts", "qa", "guides"]);
});

// ── 时间口径：区间按站点时区的日界切，frontmatter 是 UTC ──────────────
//    下面前两条喂的是 `TZ`（偏移为负、有夏令时），第三条喂 `SITE_TZ`（+8）——
//    两个方向都要钉，理由写在上面那两个常数那儿。

test("frontmatter 里的 pubDatetime 被 YAML 解析成 Date，不是字符串", () => {
  // 这条是下面所有时间断言的前提。前提坏了（哪天改成 `pubDatetime: "2026-..."`
  // 带引号存），entryTime 走的就是另一条分支，而断言照常全绿。
  const raw = [
    "---",
    "title: 这是一篇用来看版式的临时稿，看完就删",
    "description: 占位。",
    "pubDatetime: 2026-09-17T18:30:00Z",
    "---",
    "",
    "正文。",
  ].join("\n");
  const { data } = matter(raw);
  assert.ok(
    data.pubDatetime instanceof Date,
    `YAML 给的不是 Date，是 ${typeof data.pubDatetime}`
  );
  const t = entryTime(data as Record<string, unknown>);
  assert.equal(t.ok && t.ms, Date.parse("2026-09-17T18:30:00Z"));
});

test("--to 2026-09-17 收的是美东 9/17 一整天，不是 UTC 的 9/17", () => {
  // ★ 这条钉的是 docs/engineering-notes.md 坑 1 里那个 4~5 小时，在清理工具里的样子。
  //   美东傍晚发的稿子，UTC 已经是第二天 —— 按 UTC 日界切的话它会漏掉，
  //   而屏幕上只是"这一天少了一篇"，没有任何报错。
  const range = parseDayRange({ to: "2026-09-17", tz: TZ });

  // 美东 9/17 14:30（就是 src/content/posts 里那篇临时稿的时间）
  const afternoon = entry({ pubDatetime: new Date("2026-09-17T18:30:00Z") });
  // 美东 9/17 23:00 —— UTC 已经是 9/18 03:00。按 UTC 切就会漏掉这一条。
  const lateNight = entry({ pubDatetime: new Date("2026-09-18T03:00:00Z") });
  // 美东 9/18 00:00 —— 差一毫秒就出界。
  const nextDay = entry({ pubDatetime: new Date("2026-09-18T04:00:00Z") });

  assert.equal(judge(afternoon, range, DEFAULTS).kind, "delete");
  assert.equal(
    judge(lateNight, range, DEFAULTS).kind,
    "delete",
    "美东 9/17 深夜的稿（UTC 已是 9/18）漏掉了 —— 按 UTC 日界切的典型症状"
  );
  assert.equal(judge(nextDay, range, DEFAULTS).kind, "out-of-range");
});

test("--from 2026-09-17 的下界也是美东日界", () => {
  // 反方向：美东 9/16 深夜（UTC 已是 9/17）不许被 `--from 2026-09-17` 捞进来。
  // 按 UTC 切的话它会被**删掉**，而人以为自己只划了 9/17 往后。
  const range = parseDayRange({ from: "2026-09-17", tz: TZ });
  assert.equal(
    judge(entry({ pubDatetime: new Date("2026-09-17T03:59:59Z") }), range, DEFAULTS)
      .kind,
    "out-of-range",
    "美东 9/16 23:59 的稿（UTC 已是 9/17）被捞进了 --from 2026-09-17"
  );
  assert.equal(
    judge(entry({ pubDatetime: new Date("2026-09-17T04:00:00Z") }), range, DEFAULTS)
      .kind,
    "delete"
  );
});

test("站点时区那一边：日界按北京时间切，方向和上面两条相反", () => {
  // ★ 上面两条用的时区偏移为负，"深夜那篇稿子"落在**下一个** UTC 日；
  //   站上今天用的是 +8，落点翻到**上一个** UTC 日 —— 同一个 bug 的另一半。
  //   只钉一边的话，把换算写成反号仍然能全绿，而这条工具是**删文件**的。
  const range = parseDayRange({
    from: "2026-09-17",
    to: "2026-09-17",
    tz: SITE_TZ,
  });

  // 北京 9/17 07:00 —— UTC 还是 9/16 23:00。按 UTC 日界切就会漏掉这一条。
  const morning = entry({ pubDatetime: new Date("2026-09-16T23:00:00Z") });
  // 北京 9/17 23:59。
  const lateNight = entry({ pubDatetime: new Date("2026-09-17T15:59:00Z") });
  // 北京 9/18 00:00 —— 差一毫秒就出界，而这时 UTC 还是 9/17。
  const nextDay = entry({ pubDatetime: new Date("2026-09-17T16:00:00Z") });

  assert.equal(
    judge(morning, range, DEFAULTS).kind,
    "delete",
    "北京 9/17 早上的稿（UTC 还是 9/16）漏掉了 —— 按 UTC 日界切的典型症状"
  );
  assert.equal(judge(lateNight, range, DEFAULTS).kind, "delete");
  assert.equal(
    judge(nextDay, range, DEFAULTS).kind,
    "out-of-range",
    "北京 9/18 的稿（UTC 还是 9/17）被 --to 2026-09-17 捞进来了"
  );
});

test("夏令时：同一个写法在 3 月那一天是 23 小时、11 月那一天是 25 小时", () => {
  // ⚠ 这条只能用 TZ：站点时区（+8）一年到头每天都是 24 小时，偏移写死的那种错
  //   在它上面不会自己暴露。换掉 TZ = 把这条用例变成恒真。
  // 偏移量写死成 -4 或 -5 的话，一年里有一半日子的日界会错一小时 ——
  // 错的那一小时正好是"深夜那篇稿子"所在的地方。
  const spring = parseDayRange({ from: "2026-03-08", to: "2026-03-08", tz: TZ });
  const fall = parseDayRange({ from: "2026-11-01", to: "2026-11-01", tz: TZ });
  const hours = (r: { fromMs: number | null; toMs: number | null }) =>
    (r.toMs! - r.fromMs! + 1) / 3_600_000;
  assert.equal(hours(spring), 23, "春季往前拨的那天应该只有 23 小时");
  assert.equal(hours(fall), 25, "秋季往回拨的那天应该有 25 小时");
});

// ── 「我不知道这是哪天的」是独立一档 ──────────────────────────────────

test("时间读不出来的，一条都不删 —— 而且不许报成「不在区间内」", () => {
  const range = parseDayRange({ to: "2026-09-17", tz: TZ });

  // 手改 frontmatter 时真的会这么写（YAML 给的是字符串）。
  const chinese = entry({ pubDatetime: "上周五" });
  // 字段整个没了 —— 后台写不出这种，但人手建的文件、模型吐的模板会。
  const missing = entry({ title: "没有发布时间的稿子" });

  for (const c of [chinese, missing]) {
    const v = judge(c, range, DEFAULTS);
    assert.equal(
      v.kind,
      "unreadable-time",
      `${JSON.stringify(c.data)} 应该是"读不出来"那一档，实际是 ${v.kind}`
    );
  }

  // ★ 关键的一半：它也不许被算成 delete。
  assert.notEqual(judge(chinese, range, DEFAULTS).kind, "delete");

  // 报表上要说得出"为什么读不出来"。一句笼统的"时间有问题"等于让人自己去翻文件。
  const t = entryTime(missing.data);
  assert.ok(
    !t.ok && /没有 pubDatetime/.test(t.why),
    `缺字段那一档要说清楚是缺字段：${JSON.stringify(t)}`
  );
});

// ── 置顶保护：两种"没删"必须分得开 ────────────────────────────────────

test("置顶的默认保护，--include-featured 才纳入", () => {
  const range = parseDayRange({ to: "2026-09-17", tz: TZ });
  const pinned = entry({
    pubDatetime: new Date("2026-09-17T18:30:00Z"),
    featured: true,
  });
  assert.equal(judge(pinned, range, DEFAULTS).kind, "kept-featured");
  assert.equal(
    judge(pinned, range, { ...DEFAULTS, includeFeatured: true }).kind,
    "delete"
  );
});

test("区间外的置顶稿报「不在区间内」，不报「置顶保护」", () => {
  // ★ 这两档合并的后果很具体：屏幕上写着"置顶保护，跳过"，人就会去加
  //   --include-featured，而那个参数对一篇区间外的稿子根本没有影响 ——
  //   于是他以为工具坏了，其实是自己的区间划错了。
  //   「不在射程内」和「在射程内但被拦住」是两件事。
  const range = parseDayRange({ to: "2026-09-17", tz: TZ });
  const pinnedNewer = entry({
    pubDatetime: new Date("2026-09-20T18:30:00Z"),
    featured: true,
  });
  assert.equal(judge(pinnedNewer, range, DEFAULTS).kind, "out-of-range");
  assert.equal(
    judge(pinnedNewer, range, { ...DEFAULTS, includeFeatured: true }).kind,
    "out-of-range",
    "--include-featured 不该把区间外的条目拉进来"
  );
});

test("草稿照删 —— 但判据里没有它，报表上只标一下", () => {
  // 草稿不生成页面，所以清理它没有"下架"这一层含义，不该多一个参数。
  const range = parseDayRange({ to: "2026-09-17", tz: TZ });
  const draft = entry({
    pubDatetime: new Date("2026-09-17T18:30:00Z"),
    draft: true,
  });
  assert.equal(judge(draft, range, DEFAULTS).kind, "delete");
});

// ── git 里没有备份的不删 ──────────────────────────────────────────────

test("未跟踪 / 有未提交改动的，默认拒绝删", () => {
  const range = parseDayRange({ to: "2026-09-17", tz: TZ });
  const data = { pubDatetime: new Date("2026-09-17T18:30:00Z") };

  for (const git of ["untracked", "modified"] as const) {
    const v = judge(entry(data, git), range, DEFAULTS);
    assert.equal(v.kind, "unsafe-git", `${git} 应该被拦下来`);
    assert.equal(v.kind === "unsafe-git" && v.git, git);
  }

  // 已提交的才默认可删 —— 那一份删了 `git checkout --` 就回来了。
  assert.equal(judge(entry(data, "committed"), range, DEFAULTS).kind, "delete");
});

test("--allow-uncommitted 放行之后，git 状态还跟着判定走", () => {
  // 放行不等于忘掉。报表上那一行要继续标「未跟踪」，
  // 否则"我明知道这是不可逆的"和"我不知道"在屏幕上又长得一样了。
  const range = parseDayRange({ to: "2026-09-17", tz: TZ });
  const v = judge(
    entry({ pubDatetime: new Date("2026-09-17T18:30:00Z") }, "untracked"),
    range,
    { ...DEFAULTS, allowUncommitted: true }
  );
  assert.equal(v.kind, "delete");
  assert.equal(v.kind === "delete" && v.git, "untracked");
});

// ── 参数 ──────────────────────────────────────────────────────────────

test("不给区间不会默认删全部", () => {
  assert.throws(() => parseArgs([]), UsageError);
  assert.throws(() => parseArgs(["--yes"]), UsageError);
  // 这条报错的措辞本身是安全设计的一部分：人敲 `pnpm prune --yes` 的那一刻
  // 期待的多半就是"清一下"，而"清一下"不该等于清空。
  assert.throws(() => parseArgs(["--yes"]), /不给区间不会默认删全部/);
});

test("不认识的参数一律报错 —— 包括 --dry-run", () => {
  // ★ 默认就是只列不删，所以咽掉 --dry-run **恰好碰对**，
  //   于是"加上 --dry-run 就安全"会变成肌肉记忆，而它其实什么都没做。
  //   哪天拼成 --dryrun、或者写成 `--yes --dry-run`，删除照常发生。
  assert.throws(() => parseArgs(["--to", "2026-01-01", "--dry-run"]), UsageError);
  assert.throws(() => parseArgs(["--to", "2026-01-01", "--Yes"]), UsageError);
  assert.throws(() => parseArgs(["--to"]), /后面要跟一个值/);
  assert.throws(() => parseArgs(["--to", "--yes"]), /后面要跟一个值/);
});

test("--collections 只认参与清理的集合", () => {
  assert.deepEqual(parseArgs(["--to", "2026-01-01", "--collections", "posts,qa"]).collections, [
    "posts",
    "qa",
  ]);
  // 单页不参与清理（它没有 pubDatetime）。点名它要当场报错，
  // 不许"接受了参数、然后一条都不命中" —— 那和"这个集合里没有老稿"没法区分。
  assert.throws(
    () => parseArgs(["--to", "2026-01-01", "--collections", "pages"]),
    /不参与清理/
  );
  assert.throws(
    () => parseArgs(["--to", "2026-01-01", "--collections", "post"]),
    /不参与清理/
  );
});

test("备份没有开关 —— 任何一种「别备份了」的写法都要报错", () => {
  // ★ 这条和 gate.test.ts 的「闸门没有开关」是同一条纪律（docs/engineering-notes.md 红线 3）：
  //   一个能被关掉的备份，迟早会在赶时间的那天被关掉 —— 而"赶时间"和"手滑删错"
  //   通常是同一天。所以 parseArgs 里**不许**出现下面任何一个参数。
  //
  //   注意这条测试钉的是"这些写法必须报错"，不是"PruneOptions 里没有某个字段" ——
  //   后者是实现细节，前者才是人真的会敲的东西。
  for (const flag of [
    "--no-backup",
    "--skip-backup",
    "--without-backup",
    "--backup=false",
    "--no-archive",
  ]) {
    assert.throws(
      () => parseArgs(["--to", "2026-01-01", "--yes", flag]),
      UsageError,
      `${flag} 居然被接受了 —— 备份不许有开关`
    );
  }
});

test("删除**排在备份后面**，而且删的是备份清单里那些", () => {
  // ★【2026-09-18 复核查出来的】上面那条「备份没有开关」钉的是 `parseArgs` 认不认
  //   `--no-backup` —— 那和"删之前真的备份了"**是两件事**。docs/engineering-notes.md 红线 3 记的
  //   正是这个形态：`scan.length === 1` 钉不住构建脚本顺序，于是把闸门从 build 里
  //   删掉，测试全绿。闸门那边的解法是 coverage.test.ts 直接读 package.json 文本
  //   对账构建链；这里照搬：读 prune.ts 的源码，对账"谁排在谁前面"。
  //
  //   钉的是**相对位置**，不是某一行的字面量 —— 改个变量名不该让这条假红。
  const src = readFileSync(
    join(process.cwd(), "scripts", "content", "prune.ts"),
    "utf8"
  );

  const backupAt = src.indexOf("saved = backup({");
  const firstRm = src.indexOf("rmSync(");
  assert.ok(backupAt > 0, "prune.ts 里找不到 backup() 调用 —— 备份被拆掉了？");
  assert.ok(firstRm > 0, "prune.ts 里找不到 rmSync —— 这条测试的参照物没了，先修它");
  assert.ok(
    backupAt < firstRm,
    "删除排到了备份前面。顺序不是风格问题：反过来做会制造出" +
      "「文件已经没了、包也没有」这个唯一不可挽回的状态。"
  );

  // 删的必须是**备份清单**里那些（saved.files），不是另一份名单 ——
  // 两份名单一旦漂开，删掉的东西和包里的东西就不是同一批了，而且零症状。
  assert.match(
    src,
    /for \(const f of saved\.files\) \{\s*try \{\s*rmSync\(abs\(f\.path\)\)/,
    "删除循环没有遍历 saved.files（备份清单）—— 删的和备份的可能不是同一批"
  );

  // 配图目录不许无条件 recursive 删：目录里可能有**备份之后才出现**的文件，
  // 那一份不在包里，删了就真没了。所以"已经空了"那个判断必须排在它前面。
  const dirRm = src.indexOf("rmSync(abs(t.assetDir)");
  const emptyGuard = src.indexOf("rest.length === 0");
  assert.ok(dirRm > 0, "找不到删配图目录那一步 —— 这条测试的参照物没了，先修它");
  assert.ok(
    emptyGuard > 0 && emptyGuard < dirRm,
    "配图目录在「确认已经空了」之前就被 recursive 删了 —— " +
      "目录里可能有备份之后才出现的文件，那一份不在包里"
  );
});

test("--backup-dir 要跟一个值，而且值会原样传下去", () => {
  // 备份落点可以换（比如指到别的盘、指到仓库外面躲开 git clean -xdf），
  // 但"要不要备份"不可以 —— 换落点和关掉是两件完全不同的事。
  assert.equal(
    parseArgs(["--to", "2026-01-01", "--backup-dir", "D:/Backups/laowanjia"])
      .backupDir,
    "D:/Backups/laowanjia"
  );
  assert.equal(
    parseArgs(["--to", "2026-01-01", "--backup-dir=../backups"]).backupDir,
    "../backups"
  );
  assert.throws(() => parseArgs(["--to", "2026-01-01", "--backup-dir"]), /后面要跟一个值/);
});

test("--from=2026-01-01 这种等号写法也认", () => {
  const o = parseArgs(["--from=2026-01-01", "--to=2026-06-30", "--yes"]);
  assert.equal(o.from, "2026-01-01");
  assert.equal(o.to, "2026-06-30");
  assert.equal(o.apply, true);
});

test("不存在的日期不许被静默滚过去", () => {
  // `new Date("2026-02-31")` 会**静默**变成 3 月 3 日 ——
  // 人以为自己划了二月，实际删到了三月。
  assert.throws(() => parseDayRange({ to: "2026-02-31", tz: TZ }), /没有「2026-02-31」这一天/);
  assert.throws(() => parseDayRange({ to: "2026-13-01", tz: TZ }), UsageError);
  // 格式也要严：`2026-9-7` 这种手滑不许被当成 9 月 7 日蒙对。
  assert.throws(() => parseDayRange({ to: "2026-9-7", tz: TZ }), /YYYY-MM-DD/);
  assert.throws(() => parseDayRange({ to: "上周", tz: TZ }), /YYYY-MM-DD/);
});

test("反着的区间当场报错，不许静默命中 0 条", () => {
  // 一个反区间一条都不会命中，而那在屏幕上和"这个区间里没有老稿"长得一样 ——
  // 人会以为清理过了。
  assert.throws(
    () => parseDayRange({ from: "2026-06-30", to: "2026-01-01", tz: TZ }),
    /区间是反的/
  );
  // 同一天的区间是合法的（清某一天的）。
  const single = parseDayRange({ from: "2026-01-01", to: "2026-01-01", tz: TZ });
  assert.ok(single.fromMs! < single.toMs!);
});

test("时区配错了当场报错，不许悄悄退回 UTC", () => {
  // 退回 UTC 的后果是整个区间偏 4~5 小时，而屏幕上一切正常。
  assert.throws(() => parseDayRange({ to: "2026-01-01", tz: "Mei/Dong" }), UsageError);
});
