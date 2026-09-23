/**
 * tar.gz 格式层的测试。
 *
 * ★ 这里有**两组**，作用完全不同，别把它们读成一组：
 *
 *   ① 往返（我写的 → 我读的）—— 能证明字节没丢，**不能**证明别人的 tar 读得懂。
 *      两边共享同一套假设，一个双向一致的 bug 它抓不到。
 *   ② **真的调系统 tar 解包再逐字节比对** —— 这一组才是"这个包真的能恢复"的证据。
 *      它的存在是因为第一版原型的 PAX 记录长度算错了，① 那一组照样全绿，
 *      而 GNU tar 和 bsdtar 都报 `Malformed extended header: missing newline`。
 *
 * 这正是 docs/engineering-notes.md 第三节那条纪律在这里的样子：**别让测试自己喂错的写法**。
 * 备份是"只有一次机会"的东西，验证必须来自一个和我无关的实现。
 *
 * ⚠ ② 那一组在没有 tar 的机器上会 skip，而不是假装通过 —— skip 和 pass
 *   在 `pnpm test` 的输出里长得不一样，那是刻意的。
 *
 * 跑：`pnpm test`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// 这两个只有"把好包改坏"那几条用得上 —— 坏包要从一个**真的好包**改出来，
// 手搓一个坏包很容易搓出一个"因为别的原因"才抛的东西，那条测试就成了假的。
import { gunzipSync, gzipSync } from "node:zlib";
import { ArchiveError, tarGz, untarGz, type ArchiveEntry } from "./archive";
// ★ 复核 tar 输出时**用产品代码里那一份还原函数**，别在测试里另写一遍：
//   测试自己那套归一化和产品代码不同的话，它绿着也说明不了产品代码是对的。
import { unescapeTarName } from "./backup";

const MTIME = 1_736_958_600; // 2025-01-15T18:30:00Z，就是一篇老稿的发布时间
const entry = (path: string, data: string | Buffer): ArchiveEntry => ({
  path,
  data: typeof data === "string" ? Buffer.from(data, "utf8") : data,
  mtimeSec: MTIME,
  mode: 0o644,
});

/** 站上真的会出现的那几种路径。全部用真实形状，不用 `a/b/c.txt` 这种占位。 */
const REAL_WORLD: ArchiveEntry[] = [
  entry("MANIFEST.json", '{"tool":"pnpm content:prune"}\n'),
  entry(
    "src/content/posts/tsla-20250115.md",
    "---\ntitle: 特斯拉三季度交付量拆解\npubDatetime: 2025-01-15T18:30:00Z\n---\n\n正文里有中文、有 `P/E < 20`、有引号「」。\n"
  ),
  // 截图：二进制，而且字节里有 0x00 —— 按文本处理的话这里会被截断。
  entry(
    "src/assets/guides/broker-ibkr-open/shot.png",
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x00, 0x42])
  ),
  // 空文件。长度 0 的条目在 tar 里不占内容块，最容易被写错。
  entry("src/assets/guides/broker-ibkr-open/empty.txt", ""),
];

// ── ① 往返 ────────────────────────────────────────────────────────────

test("往返：真实形状的几条，字节逐条一致", () => {
  const back = untarGz(tarGz(REAL_WORLD));
  assert.equal(back.length, REAL_WORLD.length);
  for (const want of REAL_WORLD) {
    const got = back.find(e => e.path === want.path);
    assert.ok(got, `包里少了 ${want.path}`);
    assert.ok(
      got.data.equals(want.data),
      `${want.path} 的字节不一致（${got.data.length} vs ${want.data.length}）`
    );
    assert.equal(got.mtimeSec, want.mtimeSec, `${want.path} 的 mtime 丢了`);
  }
});

test("往返：中文文件名", () => {
  // slug 规定是纯 ASCII，但人手建的文件、或者哪天 slug 规则放宽，中文名就会出现。
  // USTAR 的 name 字段没有编码声明，裸字节存进去解包端按自己的 codepage 猜 ——
  // 所以非 ASCII 必须走 PAX（UTF-8 是标准里写死的）。
  const e = entry("src/content/posts/中文标题-测试.md", "中文正文\n");
  const [back] = untarGz(tarGz([e]));
  assert.equal(back.path, "src/content/posts/中文标题-测试.md");
  assert.ok(back.data.equals(e.data));
});

test("往返：超过 100 字节的长路径", () => {
  // USTAR 的 name 字段上限 100 字节。截图文件名是从原始截图带过来的，
  // 加上 `src/assets/guides/<slug>/` 前缀很容易过线。
  // 截断的后果不是报错，是**解出来落在错的位置**。
  const long = `src/assets/guides/broker-ibkr-open-with-a-very-long-slug/${"screenshot-of-the-account-opening-step".repeat(3)}.png`;
  assert.ok(Buffer.byteLength(long, "utf8") > 100, "这条用例本身要够长才有意义");
  const [back] = untarGz(tarGz([entry(long, "x")]));
  assert.equal(back.path, long);
});

test("往返：中文名 + 超长，两个条件同时命中", () => {
  const p = `src/content/posts/${"这是一个很长的中文文件名".repeat(4)}.md`;
  assert.ok(Buffer.byteLength(p, "utf8") > 100);
  const [back] = untarGz(tarGz([entry(p, "正文\n")]));
  assert.equal(back.path, p);
});

// ── 坏输入一律抛，不许"尽力而为" ──────────────────────────────────────

test("反斜杠路径当场抛 —— 在 tar 里它是文件名的一部分，不是分隔符", () => {
  // Windows 上最容易犯的一次：忘了 toPosix，于是包里是一个名字叫
  // `src\content\posts\x.md` 的**单个文件**，解出来平铺在根目录。
  assert.throws(
    () => tarGz([entry("src\\content\\posts\\x.md", "x")]),
    ArchiveError
  );
});

test("绝对路径 / 带盘符的路径当场抛", () => {
  // 解包时会覆盖真实位置上的文件，而不是落在 -C 指定的目录下。
  assert.throws(() => tarGz([entry("/etc/passwd", "x")]), ArchiveError);
  assert.throws(() => tarGz([entry("C:/work/lwjai/x.md", "x")]), ArchiveError);
});

test("路径里有 .. / . / 空段 / 尾斜杠都要抛", () => {
  // ★【2026-09-18 复核查出来的】原来只挡了反斜杠和绝对路径，`..` 过得去 ——
  //   而这种条目**写得进包、我们自己的 reader 也读得回来**，逐字节比对、清单对账、
  //   连 `tar -tzf` 都 exit 0，三档验证一路绿灯印「✓ 已打包并验过」。
  //   只有真去恢复的那一刻 GNU tar 才拒绝它（`Member name contains '..'`）——
  //   也就是一个"验过了"却恢复不出来的包，而这个包是删除的唯一依据。
  for (const bad of [
    "src/content/posts/../../../etc/x.md",
    "./src/content/posts/x.md",
    "src/content//posts/x.md",
    "src/content/posts/",
    "..",
    "",
  ]) {
    assert.throws(
      () => tarGz([entry(bad, "x")]),
      ArchiveError,
      `${JSON.stringify(bad)} 应该被挡下来`
    );
  }
  // 正常路径不许被误伤（这一条是上面那组的反方向 —— 挡过头了同样是 bug）。
  assert.doesNotThrow(() => tarGz([entry("src/content/posts/a.b.c-2025.md", "x")]));
});

test("头 checksum 对不上就抛，不许接着往下读", () => {
  // 坏掉的头往下读只会读出一堆看似合理的垃圾 —— 而"看似合理"正是最坏的那种。
  const gz = tarGz([entry("src/content/posts/x.md", "hello")]);
  const raw = gunzipSync(gz);
  raw[0] = raw[0] ^ 0xff; // 改文件名第一个字节，checksum 立刻对不上
  assert.throws(() => untarGz(gzipSync(raw)), /checksum/);
});

test("被截断的包要抛", () => {
  const raw = gunzipSync(tarGz(REAL_WORLD));
  assert.throws(() => untarGz(gzipSync(raw.subarray(0, raw.length - 700))), ArchiveError);
});

test("根本不是 gzip 的东西要抛", () => {
  assert.throws(() => untarGz(Buffer.from("这不是一个包")), /gzip/);
});

// ── ② 独立实现复核：真的去调系统 tar ─────────────────────────────────

function tarVersion(): string | null {
  try {
    return execFileSync("tar", ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\r?\n/)[0]
      .trim();
  } catch {
    return null;
  }
}
const TAR = tarVersion();
const skip = TAR ? false : "机器上没有 tar —— 这一组没跑（**不是通过**）";

test("系统 tar 能解开我们写的包，而且解出来逐字节一致", { skip }, () => {
  // ★ 全组里最值钱的一条。第一版原型的 PAX 长度算错时，上面那组往返测试**全绿**，
  //   而这一条会红 —— GNU tar 和 bsdtar 都报 Malformed extended header。
  const dir = mkdtempSync(join(tmpdir(), "laowanjia-tar-"));
  try {
    const fixtures = [
      ...REAL_WORLD,
      entry("src/content/posts/中文标题-测试.md", "中文正文，看名字会不会乱码\n"),
    ];
    writeFileSync(join(dir, "probe.tar.gz"), tarGz(fixtures));
    mkdirSync(join(dir, "out"));

    // ⚠ 只传文件名 + cwd，**不传带盘符的绝对路径**：Git Bash 里的 GNU tar 会把
    //   `D:` 当成远程主机名（实测 `Cannot connect to D: resolve failed`）。
    //   backup.ts 里调 tar 的那处是同一个写法，这条测试顺带钉住它。
    execFileSync("tar", ["-xzf", "probe.tar.gz", "-C", "out"], {
      cwd: dir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    for (const f of fixtures) {
      const onDisk = readFileSync(join(dir, "out", ...f.path.split("/")));
      assert.ok(
        onDisk.equals(f.data),
        `系统 tar（${TAR}）解出来的 ${f.path} 和原始字节不一致`
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("系统 tar 列出来的清单和我们自己解出来的一致（**含 PAX 条目**）", { skip }, () => {
  // backup.ts 的独立复核走的就是 `tar -tzf` + 清单对账，这条钉住它的输出能被对账。
  //
  // ★【2026-09-18 复核查出来的】这条原来只喂 REAL_WORLD（4 条全是纯 ASCII 短路径），
  //   包里**一条 PAX 记录都没有** —— 恰恰避开了唯一出过事、也最容易出事的地方。
  //   而真实的备份包里几乎必然有 PAX 条目（中文截图名、长 slug）。
  //   所以这里必须喂带 PAX 的那种，而且**用 backup.ts 里同一份还原函数**去比 ——
  //   测试自己另写一套归一化，就是"测试喂了错的写法所以永远绿"。
  const fixtures = [
    ...REAL_WORLD,
    entry("src/assets/guides/broker-ibkr-open/开户第一步.png", "x"),
    entry(`src/content/posts/${"long-slug-segment-".repeat(8)}.md`, "y"),
  ];
  const dir = mkdtempSync(join(tmpdir(), "laowanjia-tar-"));
  try {
    writeFileSync(join(dir, "probe.tar.gz"), tarGz(fixtures));
    // ⚠ 拿 Buffer，不要 encoding: "utf8" —— GNU tar 会把转义和原始字节混着输出，
    //   utf8 解码会先把原始字节换成 U+FFFD，还原就永远做不成了（backup.ts 里同一条坑）。
    const raw = execFileSync("tar", ["-tzf", "probe.tar.gz"], { cwd: dir });
    const listed = raw
      .toString("latin1")
      .split(/\r?\n/)
      .filter(s => s.trim() !== "")
      .map(s => unescapeTarName(Buffer.from(s, "latin1")).trim().replace(/\/$/, ""))
      .sort();
    assert.deepEqual(
      listed,
      fixtures.map(e => e.path).sort()
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
