/**
 * 打包备份的测试。这一份**碰磁盘**（在系统临时目录里搭一棵真的文件树）——
 * 因为它要测的恰恰是"从盘上收字节、写出去、再读回来比对"这条链子，
 * 用假的 fs 去测它等于把被测对象换成了别的东西。
 *
 * ★ 最要紧的几条都是**"失败时必须失败"**那一类：
 *   备份类代码最典型的翻车方式不是写不出包，是**写了个坏包却说没事** ——
 *   人正是依据"已经备份了"这个信念按下删除的。所以下面每一条"必须抛"的测试，
 *   都比"正常情况能跑通"那一条更值钱。
 *
 * 跑：`pnpm test`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  backup,
  BackupError,
  collectSourcePaths,
  crossCheck,
  DEFAULT_BACKUP_DIR,
  resolveBackupDir,
  unescapeTarName,
  type BackupTarget,
} from "./backup";
import { untarGz } from "./archive";

/** 固定时刻。传进去而不是让 backup() 自己取，正是为了让包名可预测、测试可重复。 */
const NOW = new Date("2026-09-18T21:22:33.000Z");
const TZ = "America/New_York";

/** 搭一棵和站上同形状的小文件树：一篇教程 + 它的配图目录 + 一篇研究稿。 */
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "laowanjia-backup-"));
  mkdirSync(join(root, "src", "content", "guides"), { recursive: true });
  mkdirSync(join(root, "src", "content", "posts"), { recursive: true });
  mkdirSync(join(root, "src", "assets", "guides", "broker-ibkr-open"), {
    recursive: true,
  });
  writeFileSync(
    join(root, "src", "content", "guides", "broker-ibkr-open.md"),
    "---\ntitle: 怎么在盈透开户\n---\n\n![第一步](../../assets/guides/broker-ibkr-open/shot.png)\n"
  );
  writeFileSync(
    join(root, "src", "content", "posts", "tsla-20250115.md"),
    "---\ntitle: 老稿\n---\n正文\n"
  );
  writeFileSync(
    join(root, "src", "assets", "guides", "broker-ibkr-open", "shot.png"),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x42])
  );
  return root;
}

const targets = (): BackupTarget[] => [
  {
    file: "src/content/guides/broker-ibkr-open.md",
    assetDir: "src/assets/guides/broker-ibkr-open",
    meta: {},
  },
  { file: "src/content/posts/tsla-20250115.md", assetDir: null, meta: {} },
];

const run = (root: string, extra?: Partial<Parameters<typeof backup>[0]>) =>
  backup({
    repoRoot: root,
    targets: targets(),
    tz: TZ,
    now: NOW,
    manifest: { from: "2025-01-01", to: "2025-06-30" },
    ...extra,
  });

// ── 正常路径 ──────────────────────────────────────────────────────────

test("包里装着每一个要删的字节，外加一份清单", () => {
  const root = fixture();
  try {
    const r = run(root);
    // 2 篇内容 + 1 张配图 + MANIFEST
    assert.equal(r.entries, 4);

    const inPack = new Map(
      untarGz(readFileSync(join(root, ...r.archive.split("/")))).map(e => [
        e.path,
        e.data,
      ])
    );
    for (const p of [
      "src/content/guides/broker-ibkr-open.md",
      "src/content/posts/tsla-20250115.md",
      "src/assets/guides/broker-ibkr-open/shot.png",
    ]) {
      assert.ok(inPack.has(p), `包里少了 ${p}`);
      assert.ok(
        inPack.get(p)!.equals(readFileSync(join(root, ...p.split("/")))),
        `${p} 的字节不一致`
      );
    }

    // 清单要能回答"三个月后这是哪一次清理、当时 git 在哪个 commit、怎么放回去"。
    const manifest = JSON.parse(inPack.get("MANIFEST.json")!.toString("utf8"));
    assert.equal(manifest.from, "2025-01-01");
    assert.equal(manifest.timezone, TZ);
    assert.match(manifest.restore, /tar -xzf/);
    assert.equal(manifest.files.length, 3);
    assert.ok(manifest.files.every((f: { sha256: string }) => /^[0-9a-f]{64}$/.test(f.sha256)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("包名里带时间戳和区间 —— 三个月后要靠它认出是哪一次", () => {
  const root = fixture();
  try {
    const r = run(root);
    // 时间戳按**站点时区**算（工具里所有时间都是这条口径）：
    // 2026-09-18T21:22:33Z 在美东是 17:22:33。
    assert.equal(
      r.archive,
      `${DEFAULT_BACKUP_DIR}/prune-20260918-172233-2025-01-01_2025-06-30.tar.gz`
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("验过之后才改名成 .tar.gz，而且外面留一份验证记录", () => {
  // ★ 写的时候叫 .partial：写到一半被 Ctrl-C 会留下一个一眼能认出来的半成品，
  //   而不是一个看起来完全正常、解开才发现是半截的 .tar.gz。
  // ★ 验证结论只能写在包**外面** —— 包内那份物理上不可能包含自己的验证结果。
  const root = fixture();
  try {
    const r = run(root);
    const sidecar = JSON.parse(
      readFileSync(join(root, ...`${r.archive}.verified.json`.split("/")), "utf8")
    );
    assert.match(sidecar.sha256, /^[0-9a-f]{64}$/);
    assert.equal(sidecar.entries, 4);
    assert.ok(["cross-checked", "self-verified"].includes(sidecar.tier));
    assert.equal(sidecar.tier, r.tier, "记录里的档位和返回的档位必须是同一个");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("同名的包绝不覆盖", () => {
  // 同一秒跑两次清理时，第二次宁可报错也不许把第一次的包盖掉 ——
  // 那会让一批**已经删掉**的文件失去它唯一的副本。
  const root = fixture();
  try {
    run(root);
    assert.throws(() => run(root), BackupError);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 落点：几个会把备份送上公网 / 送进垃圾桶的地方 ────────────────────

test("备份不许落在 public/ 下 —— 那等于把清理掉的内容发上公网", () => {
  // public/ 下的东西会被 astro build 原样拷进 dist 发布出去，而且零症状：
  // 构建绿、页面正常、没有任何链接指向它。
  const root = fixture();
  try {
    // ★【2026-09-18 复核查出来的】大小写变体必须一起挡：Windows / macOS 的文件系统
    //   不区分大小写，`Public/` 写出来的文件就落在真正的 `public/` 里 ——
    //   而 public/ 会被 astro build 拷进 dist 发上**公网**。
    //   原来这组用例全是小写，正是"测试自己喂的也是对的写法"那个形态（坑 14）。
    for (const bad of [
      "public",
      "public/backups",
      "Public",
      "PUBLIC/backups",
      "Src/Content/x",
      "src/content/backups",
      "dist/x",
      "DIST",
    ]) {
      assert.throws(
        () => resolveBackupDir(root, bad),
        BackupError,
        `${bad} 应该被挡下来`
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("指到仓库外面是允许的 —— 那反而更安全（躲开 git clean -xdf）", () => {
  const root = fixture();
  const outside = mkdtempSync(join(tmpdir(), "laowanjia-outside-"));
  try {
    assert.doesNotThrow(() => resolveBackupDir(root, outside));
    const r = run(root, { backupDir: outside });
    assert.ok(readFileSync(join(root, ...r.archive.split("/"))).length > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

// ── 必须失败的那几档 ─────────────────────────────────────────────────

test("读不了源文件 → 抛，而不是打一个少了一条的包", () => {
  const root = fixture();
  try {
    assert.throws(
      () =>
        backup({
          repoRoot: root,
          targets: [
            { file: "src/content/posts/根本没有这个文件.md", assetDir: null, meta: {} },
          ],
          tz: TZ,
          now: NOW,
          manifest: {},
        }),
      BackupError
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("一个目标都没有 → 抛。空集合上「逐条比对」是恒真的", () => {
  // 这是发布闸「扫了 0 篇 ≠ 通过」在备份这一侧的同一张脸：
  // 一个什么都没装的包能通过下面每一条断言。
  const root = fixture();
  try {
    assert.throws(
      () =>
        backup({ repoRoot: root, targets: [], tz: TZ, now: NOW, manifest: {} }),
      BackupError
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 独立复核的三档：这一组之前一条都没钉住 ───────────────────────────
//
// ★【2026-09-18 复核查出来的】原来只有一条 `assert.ok(["cross-checked","self-verified"]
//   .includes(tier))` —— 那两个字符串就是 tier 这个联合类型的**全集**，断言恒真：
//   把 backup() 改成永远返回 cross-checked，整套测试照样全绿。
//   「以为钉住了，其实钉的是另一件事」在这里的落点。
//   现在 crossCheck 的 tar 命令名可以注入，三档才真的测得了。

test("机器上没有 tar → 降档成 self-verified，**不是**失败", () => {
  const root = fixture();
  try {
    const r = run(root, { tarBin: "这个命令不存在-definitely-not-a-tar" });
    assert.equal(r.tier, "self-verified");
    assert.ok(
      (r.crossCheckSkipped ?? "").length > 0,
      "降档了就必须说清楚为什么 —— 只留一个档位名等于让人猜"
    );
    // 降档不等于失败：包照样写出来了、照样改名成 .tar.gz。
    assert.ok(readFileSync(join(root, ...r.archive.split("/"))).length > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("tar 跑起来了但拒绝这个包 → **失败**，不是「没能证明」", () => {
  // ★ 这一档和上一档的区别是这个模块的核心：
  //   「我不知道」可以降档继续，「我知道它坏了」必须停。
  //   原来两者都归 unavailable —— 一个真的坏掉的包只会多一行黄字，然后照删。
  //   这里拿 `git` 当"另一个实现"：它存在、跑得起来、而且一定会以非 0 退出码拒绝
  //   `git -tzf <包>` —— 正好是"跑了并且拒绝"那一档的真实形状。
  const root = fixture();
  try {
    assert.throws(() => run(root, { tarBin: "git" }), BackupError);
    // 失败了就不许留下一个叫 .tar.gz 的包 —— 那个名字的约定是"验过了"。
    const left = readdirSync(join(root, ...DEFAULT_BACKUP_DIR.split("/")));
    assert.deepEqual(
      left.filter(f => f.endsWith(".tar.gz")),
      [],
      `验不过却留下了 .tar.gz：${left.join(" / ")}`
    );
    assert.ok(left.some(f => f.endsWith(".partial")), "半成品应该留着给人看");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("独立实现列出的清单和预期不一致 → disagrees", () => {
  // 不是"我不知道"，是"它读到的不是同一份东西"。
  const root = fixture();
  try {
    const r = run(root);
    const dir = join(root, ...DEFAULT_BACKUP_DIR.split("/"));
    const name = r.archive.split("/").pop()!;
    const c = crossCheck(dir, name, ["src/content/posts/这条根本不在包里.md"]);
    assert.equal(c.status, "disagrees");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 独立复核对非 ASCII 文件名的处理 ──────────────────────────────────

test("还原 GNU tar 的转义：用它**真的吐出来的那串字节**", () => {
  // ★ 这串字节是 2026-09-18 在这台机器上 `tar -tzf | od -c` 抄下来的，不是我照着
  //   实现构造的（docs/engineering-notes.md 第三节：不许照着正则反推用例）。
  //   GNU tar 1.35 只转义它认为不可打印的那几个字节（0x80 / 0x88 / 0xAD…），
  //   **其余字节原样输出** —— 所以一行里转义和裸字节是混着的。
  const real = Buffer.from([
    0x61, 0x2f, // "a/"
    0xe5, 0xbc, 0x5c, 0x32, 0x30, 0x30, // E5 BC \200      → 开
    0xe6, 0x5c, 0x32, 0x31, 0x30, 0xb7, // E6 \210 B7      → 户
    0xe7, 0xac, 0xac, //                                     第
    0xe4, 0xb8, 0x5c, 0x32, 0x30, 0x30, // E4 B8 \200      → 一
    0xe6, 0x5c, 0x32, 0x35, 0x35, 0xa5, // E6 \255 A5      → 步
    0x2e, 0x70, 0x6e, 0x67, // ".png"
  ]);
  assert.equal(unescapeTarName(real), "a/开户第一步.png");

  // 没有转义的（bsdtar 就是这样）必须是恒等变换。
  assert.equal(
    unescapeTarName(Buffer.from("src/content/posts/tsla-20250115.md", "utf8")),
    "src/content/posts/tsla-20250115.md"
  );
});

test("配图起中文名，备份**不许**被判成「包有问题」", () => {
  // ★【2026-09-18 实测踩到的假阳性】这条曾经 exit 2：GNU tar 列清单时转了码，
  //   逐字比对对不上，于是被判成"独立复核不通过"—— 而包其实是好的。
  //   后果不是"少验一道"，是一次完全正常的清理再也跑不起来，
  //   接下来就会有人去想办法绕过备份。教程模块的截图必然会有中文名。
  const root = fixture();
  try {
    writeFileSync(
      join(root, "src", "assets", "guides", "broker-ibkr-open", "开户第一步.png"),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01])
    );
    const r = run(root); // 不抛就是最重要的断言
    assert.equal(r.entries, 5);
    // 有 tar 的机器上应该能复核通过；没有 tar 的机器上只能自校验 ——
    // 但**无论如何都不许**落到"包有问题"那一档（那一档是抛异常，上面就炸了）。
    assert.ok(["cross-checked", "self-verified"].includes(r.tier));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 枚举范围 ─────────────────────────────────────────────────────────

test("配图目录整个进包，下划线开头的也不例外", () => {
  // "下划线开头不算内容"是给内容集合的约定（content.config.ts 的 glob、发布闸），
  // 资源目录不适用 —— 备份要的是这个目录里的**每一个字节**。
  const root = fixture();
  try {
    writeFileSync(
      join(root, "src", "assets", "guides", "broker-ibkr-open", "_draft.png"),
      "x"
    );
    mkdirSync(join(root, "src", "assets", "guides", "broker-ibkr-open", "sub"));
    writeFileSync(
      join(root, "src", "assets", "guides", "broker-ibkr-open", "sub", "deep.png"),
      "y"
    );
    const paths = collectSourcePaths(root, targets());
    assert.ok(paths.includes("src/assets/guides/broker-ibkr-open/_draft.png"));
    assert.ok(paths.includes("src/assets/guides/broker-ibkr-open/sub/deep.png"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("同一个文件被列两次也只进包一次", () => {
  // 重复条目在包里是两条同名记录，解包时后者覆盖前者、看起来没事，
  // 但"条目数"和"源文件数"从此对不上，验包会报一个指不到真原因的错。
  const root = fixture();
  try {
    const t = targets();
    const paths = collectSourcePaths(root, [...t, ...t]);
    assert.equal(new Set(paths).size, paths.length);
    assert.equal(paths.length, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
