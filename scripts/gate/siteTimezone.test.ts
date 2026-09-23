/**
 * **时区那几个字，和真正用来换算的那个时区，必须说同一件事** ——
 * 而且它出现在哪儿、不出现在哪儿，是**两个出口两个答案**。
 *
 * 判据只能分在两个文件里：换算要的是 IANA 名字（`astro-paper.config.ts` 的
 * `site.timezone`，dayjs 认它），人看的那几个字是人话（`t.post.timezoneLabel`）。
 * 改了一处漏了另一处的症状是**页面、构建、闸门四处全绿**，而站上拿着一个时区的
 * 读数贴着另一个时区的名字 —— 这个站上的时间决定一篇稿子写在盘前还是盘后，
 * 读者正是照着它对盘。
 *
 * 【2026-09-21 用户定的，当天两轮】① 站点时区换成 `Asia/Shanghai`；
 * ② 页面上**只印裸时间**，时区名收进 `<time>` 的 `title`（hover 才出现）。
 * （当时导出的 .md 文件头里还印着带时区那一版；【2026-09-23】导出件改成正文原文、
 *  站方一个字都不加，那一行随 frontmatter 一起没了 —— 现在带时区那一版只剩 title 一个出口。）
 *
 * 钉四件事：
 *   ① 站点时区显式配着，而且在下面那张表里有一行 —— 换时区要回来加一行，
 *      不是把断言改松；
 *   ② 两份语言包的 `timezoneLabel` 就是表里那几个字，**不许留空**
 *      （留空 = hover 里没有时区，而页面上本来就没印，读者只能猜，
 *      而猜错的方向正好是盘前 / 盘后）；
 *   ③ 拿 **Intl 独立复核**一遍：同一个时刻，配置里那个时区真的给出表里写的读数。
 *      自己的配置自己验等于没验 —— 这一条走的是系统的时区库；
 *   ④ **接线**：页面印裸的、title 印带时区的。
 *      任何一处退回去都是零症状的（屏幕上多三个字 / hover 里少三个字，都不报错）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import config from "../../astro-paper.config";
import { dateFormatWithZone } from "../../src/i18n/format";
import zhCN from "../../src/i18n/lang/zh-CN";
import en from "../../src/i18n/lang/en";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * IANA 名 → 这个站愿意印在时间后面的那几个字（两份语言包各一格），
 * 外加一个**手写的**样例读数。
 *
 * ★ 换站点时区时**在这里加一行**，别把断言改松。这张表就是"两处必须同时改"的
 *   那条绳子：它红的时候，人看到的那几个字正好还是上一个时区的名字。
 * ★ `sample` 必须是人算出来填进去的，不是从代码里推的 —— 从代码推的样例
 *   和被测的那段代码错在一起，就等于没测（docs/engineering-notes.md 第三节那条 `SC 13D`）。
 */
const LABELS: Record<
  string,
  {
    zh: string;
    en: string;
    /** `2026-09-16T12:00:00.000Z`（站上那篇 ORCL 的发布时间）在这个时区的读数。 */
    sample: string;
  }
> = {
  "Asia/Shanghai": { zh: "北京时间", en: "UTC+8", sample: "2026-09-16 20:00" },
};

/** 上面那个 sample 说的是哪一刻。frontmatter 里存的就是这个形状（UTC）。 */
const INSTANT = new Date("2026-09-16T12:00:00.000Z");

const TZ = config.site.timezone;

const read = (...p: string[]) =>
  readFileSync(join(process.cwd(), ...p), "utf8");

/** 取 dayjs 格式串里方括号那一段（dayjs 的字面量转义）。没有方括号 = undefined。 */
const literal = (fmt: string) => fmt.match(/\[([^\]]*)\]/)?.[1];

test("站点时区显式配着，而且这张表里有它", () => {
  // 不配的后果不是报错：`src/config.ts` 兜的是 "UTC"，站上会安静地印 UTC 的读数，
  // 而 hover 和导出的文件里照常写着「北京时间」。
  assert.ok(TZ, "astro-paper.config.ts 里没配 site.timezone");
  assert.ok(
    TZ in LABELS,
    `站点时区是 ${TZ}，而 LABELS 里没有这一行 —— ` +
      `加一行（连同手算的 sample），并把两份语言包的 timezoneLabel 改成同一个说法`
  );
});

test("两份语言包的 timezoneLabel = 表里那一格，而且页面那版不带它", () => {
  const want = LABELS[TZ!];
  assert.ok(want, "上一条已经解释了：先把这一行加进 LABELS");

  for (const [lang, pack, expected] of [
    ["zh-CN", zhCN.post, want.zh],
    ["en", en.post, want.en],
  ] as const) {
    assert.ok(
      pack.timezoneLabel,
      `${lang} 的 timezoneLabel 是空的 —— hover 里不会有时区了，` +
        `而页面上本来就没印，等于全站一处都不说这是哪个时区`
    );
    assert.equal(
      pack.timezoneLabel,
      expected,
      `${lang} 说时区是「${pack.timezoneLabel}」，而站点时区是 ${TZ}（该是「${expected}」）：` +
        `一个时区的读数贴着另一个时区的名字，页面、构建、闸门四处都看不出来`
    );

    // 页面那版是**裸的**（用户定的）。混回去的话每张卡片后面又多三个字，
    // 而且和这里的 timezoneLabel 成了两份会各说各话的东西。
    assert.equal(
      literal(pack.dateFormat),
      undefined,
      `${lang} 的 dateFormat（${pack.dateFormat}）里又出现了方括号字面量 —— ` +
        `时区名只走 timezoneLabel，页面那一版不带它`
    );

    // 而拼出来那版必须真的带上（`<time>` 的 title 读的就是它）。
    assert.ok(
      dateFormatWithZone(pack).endsWith(`[${expected}]`),
      `dateFormatWithZone 没把时区拼进去：${dateFormatWithZone(pack)}`
    );

    /**
     * 【2026-09-22】列表卡片上那一格只到日（`dateOnlyFormat`），详情页到秒。
     * 两个串是**一对**：短的必须是长的**前缀** —— 那正好等于说"日期部分完全一样，
     * 短的只是少了后面的时间"。
     *
     * ⚠ 各写各的那天，站上会同时存在两种写法的日期（比如列表 `2026/09/22`、
     *   详情页 `22/09/2026`），而页面、构建、闸门四处全绿 —— 没有任何一处
     *   会把两个格式串放在一起看。
     */
    assert.ok(
      pack.dateFormat.startsWith(pack.dateOnlyFormat),
      `${lang} 的 dateOnlyFormat（${pack.dateOnlyFormat}）不是 ` +
        `dateFormat（${pack.dateFormat}）的前缀 —— 列表和详情页的日期会长得不一样`
    );
    assert.notEqual(
      pack.dateOnlyFormat,
      pack.dateFormat,
      `${lang} 的两个格式串一模一样 —— 那"列表只到日"这件事等于没做`
    );
  }
});

test("Intl 独立复核：这个时区真的给出表里写的那个读数", () => {
  const want = LABELS[TZ!];
  assert.ok(want, "先把这一行加进 LABELS");

  // 走系统的时区库，不读上面任何一个常数。
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(INSTANT);
  const p = (type: string) => parts.find(x => x.type === type)?.value ?? "";
  assert.equal(
    `${p("year")}-${p("month")}-${p("day")} ${p("hour")}:${p("minute")}`,
    want.sample,
    `Intl 说 ${INSTANT.toISOString()} 在 ${TZ} 是另一个读数 —— ` +
      `要么 sample 抄错了，要么时区名不是你以为的那个`
  );

  // 站上真正那条路（dayjs + timezone 插件，`Datetime.astro` / 导出口 / 分享卡共用）
  // 必须给出同一个读数。两边不等 = 站上印的和这张表说的不是一回事。
  assert.equal(
    dayjs(INSTANT).tz(TZ).format("YYYY-MM-DD HH:mm"),
    want.sample,
    `dayjs 对 ${TZ} 给出的读数和 Intl 不一致`
  );
});

// ── ④ 接线：谁印裸的、谁印带时区的 ────────────────────────────────────

test("Datetime.astro：屏幕上印裸的，时区名只在 title 里", () => {
  const src = read("src", "components", "Datetime.astro");

  /**
   * 【2026-09-22】屏幕上那一行现在有**两档精度**（列表只到日、详情页到秒），
   * 所以这条断言从"就是 dateFormat"改成"这两个裸格式串都用上了"。
   * 钉的还是同一件事：屏幕上印的是**不带时区**的那种串。
   */
  assert.match(
    src,
    /const date = datetime\.format\(/,
    "屏幕上那一行不再印裸格式串了 —— 用户要的就是卡片后面不缀那几个字"
  );
  assert.match(src, /t\.post\.dateOnlyFormat/, "只到日那一档没接上");
  assert.match(src, /t\.post\.dateFormat/, "到秒那一档没接上");
  assert.match(
    src,
    /datetime\.format\(dateFormatWithZone\(t\.post\)\)/,
    "没有带时区那一版了 —— hover 上去将什么都没有，而页面上本来就没印"
  );
  /**
   * 【2026-09-21 用户要的】屏幕上那个「更新于:」删掉了，于是 title 里多了一段：
   * **「发布于」还是「更新于」＋ 带时区的完整时刻**。
   *
   * 这条断言因此从 `title={dateWithZone}` 改成"title 那个串是拿 dateWithZone 拼的" ——
   * 钉的还是同一件事（算出来的那一版真的有人看得见），只是中间多了一层。
   */
  assert.match(
    src,
    /const titleText = [^\n]*dateWithZone/,
    "title 那一串不是拿带时区那一版拼的 —— 时区名算出来却没人看得见"
  );
  assert.match(
    src,
    /title=\{titleText\}/,
    "拼好了却没挂到 <time> 的 title 上"
  );
  assert.match(
    src,
    /t\.post\.updatedAt[^\n]*t\.post\.publishedAt|t\.post\.publishedAt[^\n]*t\.post\.updatedAt/,
    "「发布于」和「更新于」不再两档分开 —— 屏幕上那个标签删掉之后，" +
      "title 是唯一还能区分这两档的人类可读出口（docs/engineering-notes.md 第二节）"
  );
  assert.match(
    src,
    /datetime=\{datetime\.toISOString\(\)\}/,
    "<time datetime> 里那个完整时刻是机器那一侧唯一的答案，不许去掉"
  );
});

// 【2026-09-23】这里原来还有一条「四条 .md 导出路由：印的是带时区那一版」。
// 导出件改成了正文原文（用户要的：下载 / 复制不许夹带站方的任何东西），
// 文件头里那行 published 随 frontmatter 一起没了，四条路由不再碰时间 —— 那条跟着删了。
