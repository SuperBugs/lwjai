/**
 * 「改了就自动填更新时间」（`src/dev/keystaticModTime.ts`）。
 *
 * 动 DOM 那一半没法在裸 tsx 里测（没有 jsdom），所以判据都抽成了纯函数，
 * 这里钉的就是那几条：
 *   ① 三条边界（只在编辑页 / 人动过就不碰 / 没改就不写）**各自**都拦得住；
 *   ② 认编辑页的那条正则认哪些、不认哪些 —— 尤其是**四个集合都要认**；
 *   ③ 填进去的是**北京时间**（写 UTC 的话每条更新时间差 8 小时而四处全绿）；
 *   ④ 接线：挂载调用在、标签只有一处。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hash32,
  isEntryEditPath,
  resetSignalCounts,
  shouldStamp,
} from "../../src/dev/keystaticModTime";
import { beijingWallNow, beijingWallToUtc } from "../../src/config/beijingTime";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** 只为下面那条断言：把块注释和行注释剥掉，剩下的算"代码"。
 *  够用 —— 这个文件里没有含 `//` 的字符串字面量。 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const ok = {
  onItemPage: true,
  fieldFound: true,
  manual: false,
  userTouched: true,
  changed: true,
};

test("四条边界各自都拦得住（逐条单独翻）", () => {
  assert.equal(shouldStamp(ok), true, "都满足时必须填");
  assert.equal(
    shouldStamp({ ...ok, onItemPage: false }),
    false,
    "新建页不许填 —— 新条目没有『更新时间』这回事，留空是完成态"
  );
  assert.equal(
    shouldStamp({ ...ok, fieldFound: false }),
    false,
    "没找到那一格就什么都别做"
  );
  assert.equal(
    shouldStamp({ ...ok, manual: true }),
    false,
    "人自己动过（包括清空）之后不许再碰 —— 那一下是他的答案"
  );
  assert.equal(
    shouldStamp({ ...ok, changed: false }),
    false,
    "打开一条看看就走，不许留下痕迹"
  );
  // ★【2026-09-21 实测抓到的】没有真人碰过这张表 = 后面那些信号一律不算。
  //   一张表在加载过程里可以**先稳住、再变**（正文和图片陆续进来、恢复本地草稿、
  //   我们自己那几段脚本），没有这一条闸的话，光是打开那一页就被盖上一个更新时间。
  assert.equal(
    shouldStamp({ ...ok, userTouched: false }),
    false,
    "没人真的碰过这张表就不许填 —— 水合 / 图片加载 / 我们自己的脚本都不算人改了"
  );
});

/**
 * 【2026-09-21 实测抓到的，差点放出去】**一个条目可以在加载那一刻就是脏的** ——
 * 实测那次是 Keystatic 恢复了浏览器本地的未保存草稿（顶上写着 Unsaved），
 * 而人一个字都没动。
 *
 * 第一版无条件把那条信号取"或"，于是**光是打开那一页就被盖上一个更新时间**。
 * 当时的理由写着"两个信号取或，谁都只会让我们更倾向于填，不引入新失败模式"——
 * **那句话是错的**：一个在加载那一刻就为真的信号，加进来不是更灵敏，是把
 * 「没改就不写」这条边界整条废掉。
 */
test("★ 一打开就脏的条目：Keystatic 那条信号不许算数", () => {
  // 没见过干净 → 整条不算，退回只看指纹。
  assert.equal(resetSignalCounts(false, true), false, "打开就脏的，不许当成人改了");
  assert.equal(resetSignalCounts(false, false), false);
  assert.equal(resetSignalCounts(false, undefined), false);
  // 见过干净之后它才是一条正经信号。
  assert.equal(resetSignalCounts(true, true), true, "干净过又变脏 = 人真的改了");
  assert.equal(resetSignalCounts(true, false), false);
  // 认不出那个按钮（上游改了文案）→ 一律不算，别把 undefined 当成 true。
  assert.equal(resetSignalCounts(true, undefined), false);
});

test("认编辑页：四个集合都要认，新建页 / 列表页 / 登记表页都不认", () => {
  for (const p of [
    "/keystatic/collection/posts/item/1002",
    "/keystatic/collection/qa/item/1003",
    "/keystatic/collection/guides/item/1005",
    "/keystatic/collection/prompts/item/1000",
    "/keystatic/collection/posts/item/1002-2", // 撞号加后缀的那种
  ]) {
    assert.equal(isEntryEditPath(p), true, p);
  }
  for (const p of [
    "/keystatic/collection/posts/create",
    "/keystatic/collection/posts",
    "/keystatic/singletons/registry",
    "/keystatic",
    "/r/1002",
    "",
  ]) {
    assert.equal(isEntryEditPath(p), false, p);
  }
});

test("填进去的是北京时间，不是 UTC", () => {
  const now = new Date("2026-09-21T07:58:33.123Z");
  assert.equal(beijingWallNow(now), "2026-09-21T15:58");
  // 存回盘上要正好是那一刻 —— 差 8 小时的话页面照常显示，四处全绿。
  assert.equal(beijingWallToUtc(beijingWallNow(now)), "2026-09-21T07:58");
});

test("指纹：变一个字就变，同样的输入给同样的结果", () => {
  assert.equal(hash32("abc"), hash32("abc"));
  assert.notEqual(hash32("abc"), hash32("abd"));
  assert.notEqual(hash32(""), hash32(" "));
  // 长文本也不许退化成常数（正文编辑器整篇压进来的就是这一条）。
  const long = "研究稿".repeat(5000);
  assert.notEqual(hash32(long), hash32(long + "。"));
});

test("接线：挂载调用在，标签只写一处", () => {
  const ks = read("keystatic.config.ts");
  assert.match(
    ks,
    /^import \{ mountModTime \} from "\.\/src\/dev\/keystaticModTime";$/m,
    "挂载 import 不在了 —— 整段功能安静地不工作"
  );
  assert.match(
    ks,
    /^mountModTime\(\{ label: MOD_DATETIME_LABEL \}\);$/m,
    "import 了但没调用，等于没挂"
  );
  // 标签是脚本找那一格的唯一钩子，配置里只许有常量这一处字面量。
  assert.equal(
    (ks.match(/"更新时间"/g) ?? []).length,
    1,
    "「更新时间」这个字面量在 keystatic.config.ts 里出现了不止一次 —— " +
      "标签和脚本各写一份的那天，改标签就会让自动填默默失效"
  );
  assert.match(ks, /const MOD_DATETIME_LABEL = "更新时间";/);
  // 脚本那边不许自己写死标签（它只能从 mountModTime 的入参拿）。
  // ⚠ 要先把注释剥掉再看：注释里当然会提到「更新时间」这四个字，
  //   连注释一起比的话，这条断言逼着人把说明写得不像人话。
  assert.ok(
    !stripComments(read("src/dev/keystaticModTime.ts")).includes("更新时间"),
    "keystaticModTime.ts 的代码里不许写死「更新时间」，标签由 mountModTime 的入参传 —— " +
      "写死一份的那天，改 keystatic.config.ts 里那个常量就会让自动填默默失效"
  );
});
