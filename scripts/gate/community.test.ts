/**
 * 微信群二维码（【2026-09-24】）：判据、出图、接线。
 *
 * 判据在 src/config/community.ts（四档：none / active / expired / 坏了就抛），
 * 出图在 src/utils/wechatQr.ts（重新编码、去元数据），画在 WechatGroup.astro ＋ Footer.astro，
 * 后台在 keystatic.config.ts 的 `community` singleton。
 *
 * A 组：判据（纯函数）。B 组：常量之间对不对得上。C 组：接线（读源码）。D 组：真出一张图。
 * 那几条"必须拦 / 必须抛"都故意改坏过一次看它红（见 docs/engineering-notes.md 坑 17）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import sharp from "sharp";
import {
  COMMUNITY_ASSETS_DIR,
  COMMUNITY_FILE,
  SCANNED_DATA_FILES,
} from "../../src/config/collections";
import {
  expiresOnParts,
  parseCommunity,
  WECHAT_GROUP_ANCHOR,
  WECHAT_KIND_FIELD,
  WECHAT_QR_FIELD,
  WECHAT_QR_PUBLIC_PATH,
  WECHAT_QR_ROUTE,
  wechatExpiresAt,
  wechatGroupStateIn,
  type CommunityConfig,
} from "../../src/config/community";
import { isContentPath } from "../../src/dev/publishPlan";
import { COMMUNITY } from "../../src/utils/wechatGroup";
import { renderWechatQr, WECHAT_QR_MAX_WIDTH } from "../../src/utils/wechatQr";
import zh from "../../src/i18n/lang/zh-CN";
import en from "../../src/i18n/lang/en";

const read = (p: string) => readFileSync(p, "utf8");
const WHERE = "测试";
const QR = (ext = "png") => `${WECHAT_QR_PUBLIC_PATH}${WECHAT_QR_FIELD}.${ext}`;
const group = (date: string) => ({ discriminant: "group", value: date });
const at = (iso: string) => new Date(iso);

// ── A. 判据 ──────────────────────────────────────────────────────────

test("A1 没传二维码 = none（完成态），日期留着也不画", () => {
  for (const raw of [
    {},
    { [WECHAT_QR_FIELD]: null },
    { [WECHAT_QR_FIELD]: "" },
    { [WECHAT_KIND_FIELD]: group("2026-10-01") },
  ]) {
    const cfg = parseCommunity(raw, WHERE);
    assert.deepEqual(cfg, {}, JSON.stringify(raw));
    assert.equal(wechatGroupStateIn(cfg, at("2026-09-24T00:00:00Z")).tier, "none");
  }
});

test("A2 群二维码：北京时间失效那天 0 点之前是 active，到点就是 expired", () => {
  const cfg = parseCommunity(
    { [WECHAT_QR_FIELD]: QR(), [WECHAT_KIND_FIELD]: group("2026-10-01") },
    WHERE
  );
  assert.deepEqual(cfg.wechat, {
    file: `${COMMUNITY_ASSETS_DIR}/${WECHAT_QR_FIELD}.png`,
    kind: "group",
    expiresOn: "2026-10-01",
  });
  // 北京 10-01 00:00 = UTC 09-30 16:00。
  const before = wechatGroupStateIn(cfg, at("2026-09-30T15:59:59.999Z"));
  assert.equal(before.tier, "active");
  assert.equal(before.tier === "active" && before.expiresAt, "2026-09-30T16:00:00.000Z");
  const onTheDot = wechatGroupStateIn(cfg, at("2026-09-30T16:00:00.000Z"));
  assert.equal(onTheDot.tier, "expired", "到了失效时刻还画成 active = 挂着一张扫不进去的码");
});

test("A3 个人微信：不失效，也没有 expiresAt（页面据此不挂那段脚本）", () => {
  const cfg = parseCommunity(
    { [WECHAT_QR_FIELD]: QR("jpg"), [WECHAT_KIND_FIELD]: { discriminant: "personal" } },
    WHERE
  );
  const s = wechatGroupStateIn(cfg, at("2099-01-01T00:00:00Z"));
  assert.equal(s.tier, "active");
  assert.equal(s.tier === "active" && s.expiresAt, undefined);
  // Keystatic 的 fields.empty() 也可能写成 value: null —— 两种都认。
  const withNull = parseCommunity(
    { [WECHAT_QR_FIELD]: QR(), [WECHAT_KIND_FIELD]: { discriminant: "personal", value: null } },
    WHERE
  );
  assert.equal(withNull.wechat?.kind, "personal");
});

test("A4 路径：只认后台写出来的那一种形状，扩展名大小写都行", () => {
  assert.equal(
    parseCommunity({ [WECHAT_QR_FIELD]: QR("JPG"), [WECHAT_KIND_FIELD]: group("2026-10-01") }, WHERE)
      .wechat?.file,
    `${COMMUNITY_ASSETS_DIR}/${WECHAT_QR_FIELD}.JPG`
  );
  const bad: [string, RegExp][] = [
    [QR("svg"), /SVG 不收/],
    [`${QR("png")}.svg`, /SVG 不收/],
    [QR("gif"), /期望/],
    ["../assets/guides/wechatQr.png", /期望/],
    [`${WECHAT_QR_PUBLIC_PATH}../../../etc/${WECHAT_QR_FIELD}.png`, /期望/],
    [`/src/assets/community/${WECHAT_QR_FIELD}.png`, /期望/],
    [`${WECHAT_QR_PUBLIC_PATH}qr.png`, /期望/],
  ];
  for (const [value, re] of bad) {
    assert.throws(
      () => parseCommunity({ [WECHAT_QR_FIELD]: value, [WECHAT_KIND_FIELD]: group("2026-10-01") }, WHERE),
      re,
      value
    );
  }
});

test("A5 传了码却没说是哪种 / 群码没填日期 / 日期不存在：抛，不许当成「不会失效」", () => {
  const cases: [unknown, RegExp][] = [
    [undefined, /没说是哪种/],
    [{ discriminant: "channel" }, /没说是哪种/],
    [group(""), /没填失效日期/],
    [{ discriminant: "group" }, /没填失效日期/],
    [group("2026-02-30"), /不是一个 YYYY-MM-DD/],
    [group("2026/10/01"), /不是一个 YYYY-MM-DD/],
  ];
  for (const [kind, re] of cases) {
    assert.throws(
      () => parseCommunity({ [WECHAT_QR_FIELD]: QR(), [WECHAT_KIND_FIELD]: kind }, WHERE),
      re,
      JSON.stringify(kind)
    );
  }
  for (const raw of [null, [], "x", 1]) {
    assert.throws(() => parseCommunity(raw, WHERE), /不是一个 JSON 对象/);
  }
});

test("A6 失效时刻 = 北京时间那天 0 点（跨年那天也对）", () => {
  assert.equal(wechatExpiresAt("2026-10-01"), "2026-09-30T16:00:00.000Z");
  assert.equal(wechatExpiresAt("2027-01-01"), "2026-12-31T16:00:00.000Z");
  assert.deepEqual(expiresOnParts("2026-10-01"), { year: 2026, month: 10, day: 1 });
});

// ── B. 常量之间对得上 ────────────────────────────────────────────────

test("B1 后台 publicPath 从 JSON 所在目录出发，正好指到图片目录", () => {
  assert.equal(
    posix.join(posix.dirname(COMMUNITY_FILE), WECHAT_QR_PUBLIC_PATH),
    `${COMMUNITY_ASSETS_DIR}/`,
    "对不上 = 后台存的路径和 parseCommunity() 认的不是同一个地方"
  );
});

test("B2 出图地址就是那个路由文件", () => {
  assert.ok(
    existsSync(`src/pages${WECHAT_QR_ROUTE}.ts`),
    `WECHAT_QR_ROUTE 是 ${WECHAT_QR_ROUTE}，但 src/pages 下没有对应的文件 —— 「关于」页和 README 都会是一张裂图`
  );
});

test("B3 /_publish 把 JSON 和图一起带上（只带 JSON = 线上构建找不到图）", () => {
  const row = SCANNED_DATA_FILES.find(f => f.path === COMMUNITY_FILE);
  assert.ok(row, "微信群那份表没进 SCANNED_DATA_FILES");
  assert.equal(row.assetsDir, COMMUNITY_ASSETS_DIR);
  assert.ok(isContentPath(COMMUNITY_FILE));
  assert.ok(isContentPath(`${COMMUNITY_ASSETS_DIR}/${WECHAT_QR_FIELD}.png`));
  assert.ok(!isContentPath(`${COMMUNITY_ASSETS_DIR}x/a.png`), "只认那个目录本身");
});

test("B4 磁盘上那份表读得进来；传了码的话，码真的在盘上", () => {
  // COMMUNITY 在 import 时就验过了（验不过这个文件根本加载不起来）。
  if (COMMUNITY.wechat) {
    assert.ok(
      existsSync(COMMUNITY.wechat.file),
      `${COMMUNITY_FILE} 指着 ${COMMUNITY.wechat.file}，盘上没有 —— 构建时出图那一步会红`
    );
  }
});

test("B5 两份语言包的占位符都在（tplStr 遇到写错的占位符静默换成空）", () => {
  for (const [name, t] of [["zh-CN", zh], ["en", en]] as const) {
    assert.match(t.wechat.validUntil, /\{\{date\}\}/, `${name} validUntil`);
    assert.match(t.wechat.expired, /\{\{date\}\}/, `${name} expired`);
    assert.match(t.wechat.date, /\{\{month\}\}/, `${name} date`);
    assert.match(t.wechat.date, /\{\{day\}\}/, `${name} date`);
    for (const k of ["title", "scanGroup", "scanPersonal", "altGroup", "altPersonal"] as const) {
      assert.ok(t.wechat[k].trim(), `${name} wechat.${k} 是空的`);
    }
    assert.ok(t.footer.joinWechat.trim(), `${name} footer.joinWechat 是空的`);
  }
});

// ── C. 接线 ─────────────────────────────────────────────────────────

/** keystatic.config.ts 里 `community: singleton({` 那一段（到同一缩进的 `}),` 为止）。
 *  ⚠ 不用朴素的 stripComments：那个文件的字符串里有 `*.md`，会被当成块注释开头（docs/engineering-notes.md 有记）。 */
function communitySingleton(): string {
  const src = read("keystatic.config.ts");
  const start = src.indexOf("    community: singleton({");
  assert.ok(start >= 0, "keystatic.config.ts 里没有 community 这个 singleton —— 后台配不了二维码");
  const end = src.indexOf("\n    }),\n", start);
  assert.ok(end > start);
  return src.slice(start, end);
}

test("C1 后台那一页：路径、字段名全从常量来，没有手写的第二份", () => {
  const block = communitySingleton();
  for (const needle of [
    "path: COMMUNITY_FILE.replace(",
    "directory: COMMUNITY_ASSETS_DIR",
    "publicPath: WECHAT_QR_PUBLIC_PATH",
    "[WECHAT_QR_FIELD]: fields.image(",
    "[WECHAT_KIND_FIELD]: fields.conditional(",
    'format: { data: "json" }',
  ]) {
    assert.ok(block.includes(needle), `community singleton 里没有「${needle}」`);
  }
  for (const literal of ["src/data/community", "src/assets/community", "../assets/community"]) {
    assert.ok(!block.includes(literal), `community singleton 里手写了「${literal}」`);
  }
  assert.match(block, /validation: \{ isRequired: true \}/, "群二维码的失效日期必须必填");
});

test("C2 后台下拉的每个选项，parseCommunity() 都认（选得到、存得下、构建却红 = 最坏的那种）", () => {
  const block = communitySingleton();
  const values = [...block.matchAll(/value: "(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(values.sort(), ["group", "personal"]);
  for (const v of values) {
    const cfg: CommunityConfig = parseCommunity(
      { [WECHAT_QR_FIELD]: QR(), [WECHAT_KIND_FIELD]: v === "group" ? group("2026-10-01") : { discriminant: v } },
      WHERE
    );
    assert.equal(cfg.wechat?.kind, v);
  }
});

test("C3 后台不 import 读那份 JSON 的模块（表坏了后台还得打得开）", () => {
  const src = read("keystatic.config.ts");
  assert.ok(!/from "\.\/src\/utils\/wechatGroup"/.test(src), "keystatic.config.ts import 了 wechatGroup.ts");
  assert.ok(!/community\.json/.test(read("src/config/community.ts").replace(/\/\*[\s\S]*?\*\//g, "")),
    "src/config/community.ts 读了那份 JSON —— 后台 import 它，表一坏后台就打不开");
});

test("C4 页脚：按同一个判据决定画不画、锚点从常量来", () => {
  const src = read("src/components/Footer.astro");
  assert.match(src, /wechatGroupState\(new Date\(\)\)\.tier !== "none"/);
  assert.match(src, /#\$\{WECHAT_GROUP_ANCHOR\}/);
  assert.match(src, /\{t\.footer\.joinWechat\}/);
  assert.ok(!src.includes(`#${WECHAT_GROUP_ANCHOR}"`), "页脚手写了锚点");
});

test("C5 「关于」页挂了那一节，而且挂在 <Main> 里面（搜索索引、正文排版都在那一层）", () => {
  const src = read("src/pages/a.astro");
  const main = src.slice(src.indexOf("<Main"), src.indexOf("</Main>"));
  assert.match(main, /<WechatGroup \/>/);
});

test("C6 那一节：图走出图路由、挂 pagefind-ignore、过期时刻只在服务端算", () => {
  const src = read("src/components/WechatGroup.astro");
  // ⚠ 分三段查，而且剥掉注释：文件头的注释里正写着 `<img>` 和 `data-pagefind-ignore="all"`，
  //   在全文上 grep 的话删掉真的那个它照样绿（智能体 logo 那边的 alt="" 踩过同一个坑）。
  const fmEnd = src.indexOf("\n---", 3);
  const front = src.slice(3, fmEnd).replace(/\/\*[\s\S]*?\*\//g, "");
  const scriptAt = src.indexOf("<script>");
  const template = src.slice(fmEnd + 4, scriptAt);
  const script = src.slice(scriptAt).replace(/\/\*[\s\S]*?\*\//g, "");

  const imgAt = template.indexOf("<img");
  assert.ok(imgAt >= 0, "模板里没有 <img>");
  const img = template.slice(imgAt, template.indexOf("/>", imgAt));
  assert.match(img, /data-pagefind-ignore="all"/, "二维码会被 Pagefind 记成「关于」页的搜索缩略图");
  assert.match(img, /src=\{src\}/);
  assert.match(front, /WECHAT_QR_ROUTE/);
  assert.match(front, /renderWechatQr\(state\.qr\)/, "宽高和 ?v= 要取自同一次编码");
  assert.match(template, /id=\{WECHAT_GROUP_ANCHOR\}/);
  assert.match(template, /data-wechat-expires-at=\{state\.expiresAt\}/);
  // 按正则找开标签：prettier 会把属性多的标签拆成一行一个（`<p\n  data-wechat-expired`）。
  const noteAt = template.search(/<p\s+data-wechat-expired/);
  assert.ok(noteAt >= 0, "模板里没有给脚本备着的那句过期提示");
  assert.match(
    template.slice(noteAt, template.indexOf(">", noteAt)),
    /data-pagefind-ignore/,
    "备着的那句过期提示进了搜索索引 —— 码还有效时搜「过期」会搜到它"
  );
  assert.match(script, /Date\.now\(\) < at/, "脚本只比大小，不在客户端按日期再推一遍");
  assert.match(script, /document\.addEventListener\("astro:page-load", applyWechatExpiry\)/);
  assert.ok(!/expiresOn/.test(script), "脚本里出现了 expiresOn —— 失效时刻只许在 community.ts 算");
  // 过期那一档不许画码：模板里 expired 分支（到 active 分支为止）没有 <img。
  const expiredAt = template.indexOf('state.tier === "expired"');
  const activeAt = template.indexOf('state.tier === "active"', expiredAt);
  assert.ok(expiredAt >= 0 && activeAt > expiredAt, "模板里认不出 expired / active 两个分支");
  assert.ok(!template.slice(expiredAt, activeAt).includes("<img"), "过期那一档画了码");
});

test("C7 出图路由：只有 active 才出图，其余回没有 body 的 404（静态构建据此不写文件）", () => {
  const src = read("src/pages/wechat-qr.png.ts");
  assert.match(src, /if \(state\.tier !== "active"\)/);
  assert.match(src, /new Response\(null, \{ status: 404/);
  assert.match(src, /renderWechatQr\(state\.qr\)/);
});

// ── D. 真出一张图 ─────────────────────────────────────────────────────

function pngChunkTypes(buf: Buffer): string[] {
  assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "不是 PNG");
  const types: string[] = [];
  for (let off = 8; off + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(off);
    types.push(buf.toString("latin1", off + 4, off + 8));
    off += 12 + len;
  }
  return types;
}

function withTempRoot(fn: (root: string, put: (name: string, bytes: Buffer) => void) => Promise<void>) {
  return async () => {
    const root = mkdtempSync(join(tmpdir(), "lwj-wechat-"));
    const dir = join(root, COMMUNITY_ASSETS_DIR);
    mkdirSync(dir, { recursive: true });
    try {
      await fn(root, (name, bytes) => writeFileSync(join(dir, name), bytes));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

const personal = (ext: string) => ({
  file: `${COMMUNITY_ASSETS_DIR}/${WECHAT_QR_FIELD}.${ext}`,
  kind: "personal" as const,
});

test(
  "D1 带 EXIF 的 JPEG 进去，出来的 PNG 一个元数据块都没有，缩到上限以内",
  withTempRoot(async (root, put) => {
    const jpeg = await sharp({ create: { width: 1080, height: 1440, channels: 3, background: "#ffffff" } })
      .jpeg()
      .withExif({ IFD0: { Artist: "SECRET-ARTIST", Copyright: "SECRET-COPYRIGHT" } })
      .toBuffer();
    assert.ok(jpeg.includes("SECRET-ARTIST"), "测试自己没把 EXIF 写进去 —— 下面那条断言就是空转");
    put(`${WECHAT_QR_FIELD}.jpg`, jpeg);
    const out = await renderWechatQr(personal("jpg"), root);
    const types = pngChunkTypes(out.png);
    for (const t of ["tEXt", "iTXt", "zTXt", "eXIf"]) {
      assert.ok(!types.includes(t), `输出里有 ${t} 块`);
    }
    assert.ok(!out.png.includes("SECRET"), "原图的 EXIF 跟着出去了");
    assert.equal(out.width, WECHAT_QR_MAX_WIDTH);
    assert.equal(out.height, Math.round((1440 * WECHAT_QR_MAX_WIDTH) / 1080));
    assert.match(out.version, /^[0-9a-f]{12}$/);
  })
);

test(
  "D2 EXIF 说要转 90° 的图：先转正再丢元数据（丢了方向的图是歪的）",
  withTempRoot(async (root, put) => {
    const jpeg = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#ffffff" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    assert.equal((await sharp(jpeg).metadata()).orientation, 6, "测试自己没写进方向");
    put(`${WECHAT_QR_FIELD}.jpg`, jpeg);
    const out = await renderWechatQr(personal("jpg"), root);
    assert.deepEqual([out.width, out.height], [200, 400]);
  })
);

test(
  "D3 小图不放大（放大只会让码糊）",
  withTempRoot(async (root, put) => {
    put(
      `${WECHAT_QR_FIELD}.png`,
      await sharp({ create: { width: 300, height: 300, channels: 3, background: "#000" } }).png().toBuffer()
    );
    const out = await renderWechatQr(personal("png"), root);
    assert.deepEqual([out.width, out.height], [300, 300]);
  })
);

test(
  "D4 按内容认格式：改成 .png 的 SVG 要抛；文件不在要抛",
  withTempRoot(async (root, put) => {
    put(
      `${WECHAT_QR_FIELD}.png`,
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>')
    );
    await assert.rejects(renderWechatQr(personal("png"), root), /按内容看是 svg/);
    await assert.rejects(renderWechatQr(personal("webp"), root), /找不到/);
    put(`${WECHAT_QR_FIELD}.jpg`, Buffer.from("not an image at all"));
    await assert.rejects(renderWechatQr(personal("jpg"), root), /读不出来/);
  })
);
