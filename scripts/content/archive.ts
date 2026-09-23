/**
 * tar.gz 的**纯格式层**：拼包、拆包。不碰磁盘、不调外部命令、不引依赖。
 *
 * 批量清理（./prune.ts）在删东西之前要先把这一批打成一个包。这个文件负责那个包的
 * 字节长什么样；`./backup.ts` 负责从磁盘读、写出去、验证。
 *
 * ## 为什么是手写 tar，而不是调系统的 `tar`
 *
 * 【2026-09-18 实测，两条都不是推测】
 *
 * 1. **`tar -czf D:/... ` 直接失败。** Git Bash 里的 GNU tar 1.35 把 `D:` 当成**远程主机名**：
 *    `tar (child): Cannot connect to D: resolve failed`。而备份目录的自然写法恰恰就是
 *    `C:\work\lwjai\.backups\...` 这种绝对路径。要绕就得 `--force-local`
 *    （bsdtar 不认这个参数）或者永远 `cwd` + 相对文件名 —— 一条只在 Windows 上炸、
 *    而且报错信息完全指不到真原因的路。
 * 2. **这台机器上有两个 tar，跑哪个取决于你从哪个壳启动。** `/usr/bin/tar` 是
 *    GNU tar 1.35，`C:\Windows\System32\tar.exe` 是 bsdtar 3.8.4（libarchive）。
 *    从 Git Bash 跑 pnpm 走前者，从 PowerShell / cmd 跑走后者 —— 两者在长文件名、
 *    非 ASCII 名、`-T` 清单文件上的行为都不完全一样。备份是**只有一次机会**的东西，
 *    它的正确性不该取决于用户今天用哪个终端开的 pnpm。
 *
 * 手写的代价是下面这一百来行字节拼装；收益是它在哪台机器上都跑同一条路径，
 * 而且**能被单测逐字节钉住**（`archive.test.ts` 里还有一条真的去调系统 tar 复核）。
 *
 * ## 为什么还压一层 gzip（载荷主要是已经压过的截图，省不了多少）
 *
 * 不是为了体积 —— 教程模块的 PNG / WebP 本来就压过，gzip 在上面通常省不到 5%。
 * 是为了**那个 CRC32**：gzip 尾部带整包校验，`tar -tzf` 读到最后一块就会验它。
 * 这是整条链子里**唯一一个不依赖"我对 tar 格式的理解"的完整性检查** ——
 * 我自己写的 checksum 校验只能证明"按我的理解这个包是自洽的"，
 * 而一个和我无关的 CRC 能证明字节没在写盘、拷贝、同步盘的路上被改过。
 *
 * 代价要知道：gzip 是**一条流**，前面坏一个 bit 后面就全读不出来了 ——
 * 不压的话坏一个块只丢一个文件。这个取舍对"本机撤销点"这个用途是划算的
 * （包就在同一块盘上、几分钟内就会被用到），对"长期离线归档"就未必。
 *
 * ## 为什么带 PAX 扩展头
 *
 * USTAR 的 name 字段只有 100 字节，而且没有编码声明 —— 非 ASCII 名字存进去是裸字节，
 * 解包端按自己的 codepage 猜。实测：GNU tar 写的 UTF-8 名字，Windows 自带的 bsdtar
 * 列出来是乱码。所以**非 ASCII 或超长的路径一律写一条 PAX `path` 记录**（UTF-8，
 * 标准里明确规定 PAX 记录是 UTF-8），两个 tar 都认。
 *
 * ⚠ PAX 记录的长度字段是**自引用**的（`<总长> <kv>\n`，总长把自己那几位数字也算进去），
 *   而且要按**字节**算不是按字符算。第一版原型这里算错了，两个 tar 都报
 *   `Malformed extended header: missing newline` —— 好在它是**响的**错误。
 *   `archive.test.ts` 里钉着这条。
 */

import { gzipSync, gunzipSync } from "node:zlib";

/** 一个条目。`data` 是原始字节，不做任何转换（.md 是 UTF-8，截图是二进制，同一条路）。 */
export interface ArchiveEntry {
  /** 包内路径，**POSIX 正斜杠、仓库根相对**。解包时 `tar -xzf ... -C <仓库根>` 正好落回原位。 */
  path: string;
  data: Buffer;
  /** 修改时间，Unix 秒。用源文件的 —— 恢复出来的文件时间戳该是原来那个。 */
  mtimeSec: number;
  /** 8 进制权限位。Windows 上取不到真权限，统一 0o644。 */
  mode: number;
}

/** 包的格式坏了 / 不支持。**一律抛，不许返回一个"尽力而为"的结果** ——
 *  备份这件事上"部分成功"和失败是同一件事，而它看起来像成功。 */
export class ArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveError";
  }
}

const BLOCK = 512;
const NAME_MAX = 100;
/** size 字段是 11 位 8 进制 —— 8 GiB 封顶。超了必须抛，不许截断成一个能解开但内容错的包。 */
const SIZE_MAX = 0o77777777777;

const isAscii = (s: string) => /^[\x20-\x7e]*$/.test(s);

/** 填 0 的 8 进制定长字段，结尾一个 NUL（USTAR 的常规写法）。 */
function octal(value: number, width: number): string {
  return value.toString(8).padStart(width - 1, "0") + "\0";
}

/**
 * 一条 PAX 记录：`<总长> <key>=<value>\n`。
 *
 * ★ 总长**包含它自己那几位数字**，所以要迭代到稳定；而且是**字节数**，
 *   `path=中文标题.md` 的字节数远大于字符数。这两条各错一次，产出的包都是
 *   两个 tar 都打不开的（实测）。
 */
function paxRecord(key: string, value: string): Buffer {
  const kv = `${key}=${value}`;
  const kvBytes = Buffer.byteLength(kv, "utf8");
  let len = kvBytes + 3; // 先按 1 位数字估
  for (;;) {
    const next = String(len).length + 1 + kvBytes + 1;
    if (next === len) break;
    len = next;
  }
  return Buffer.from(`${len} ${kv}\n`, "utf8");
}

/** 把 USTAR 头里的 ASCII 回退名压到 100 字节以内。**只有在同时写了 PAX path 时才会用到** ——
 *  真正的名字在 PAX 记录里，这个只是给"完全不认 PAX 的古董 tar"看的。 */
function asciiFallback(path: string): string {
  const flat = path.replace(/[^\x20-\x7e]/g, "_");
  if (Buffer.byteLength(flat, "utf8") <= NAME_MAX) return flat;
  // 从后往前留（尾部更有辨识度：目录前缀砍掉不影响人认出是哪个文件）
  return flat.slice(flat.length - NAME_MAX);
}

function header(
  name: string,
  size: number,
  opts: { mtimeSec: number; mode: number; typeflag: string }
): Buffer {
  const b = Buffer.alloc(BLOCK);
  const put = (s: string, off: number, len: number) => {
    const buf = Buffer.from(s, "utf8");
    if (buf.length > len) {
      throw new ArchiveError(
        `tar 头字段放不下（偏移 ${off}，上限 ${len} 字节，实际 ${buf.length}）：${s}`
      );
    }
    buf.copy(b, off);
  };

  put(name, 0, NAME_MAX);
  put(octal(opts.mode & 0o7777, 8), 100, 8);
  put(octal(0, 8), 108, 8); // uid
  put(octal(0, 8), 116, 8); // gid
  put(octal(size, 12), 124, 12);
  put(octal(opts.mtimeSec, 12), 136, 12);
  b.fill(0x20, 148, 156); // checksum 先填 8 个空格，算完再填回去
  put(opts.typeflag, 156, 1);
  put("ustar\0", 257, 6);
  put("00", 263, 2);

  let sum = 0;
  for (const byte of b) sum += byte;
  // 6 位 8 进制 + NUL + 空格，这是被最广泛认的那种写法
  put(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8);
  return b;
}

const padding = (size: number) => Buffer.alloc((BLOCK - (size % BLOCK)) % BLOCK);

/**
 * 拼出一个 .tar.gz 的字节。**纯函数** —— 同样的入参永远出同样的字节，所以能单测。
 *
 * 顺序就是 entries 的顺序，不排序：调用方决定（清单放第一条，方便 `tar -tzf | head -1`）。
 */
export function tarGz(entries: readonly ArchiveEntry[]): Buffer {
  const out: Buffer[] = [];

  for (const e of entries) {
    if (e.path.includes("\\")) {
      throw new ArchiveError(
        `包内路径必须是 POSIX 正斜杠：${e.path}\n` +
          `  反斜杠在 tar 里是**文件名的一部分**，不是分隔符 —— 解出来会是一个` +
          `名字里带反斜杠的文件，而不是一层层目录。`
      );
    }
    if (e.path.startsWith("/") || /^[a-zA-Z]:/.test(e.path)) {
      throw new ArchiveError(
        `包内路径必须是相对路径：${e.path}\n` +
          `  绝对路径解出来会覆盖真实位置上的文件，而不是落在你 -C 指定的目录下。`
      );
    }
    // ★【2026-09-18 复核查出来的】路径**按段**校验，不是只看开头那一个字符。
    //   `src/content/posts/../../../etc/x.md` 过得了上面两条（不是反斜杠、不以 / 开头），
    //   写进包里我们自己的 reader 也原样读得回来、逐字节比对和清单对账**全绿**，
    //   `tar -tzf` 也 exit 0 —— 于是三档验证一路绿灯、屏幕印「✓ 已打包并验过」。
    //   只有真去恢复的那一刻才发现 GNU tar 拒绝解它（`Member name contains '..'`）。
    //   也就是说：一个**恢复不出来的包**被当成验过了，而这个包是删除的唯一依据。
    const segments = e.path.split("/");
    if (
      e.path === "" ||
      e.path.endsWith("/") ||
      segments.some(seg => seg === "" || seg === "." || seg === "..")
    ) {
      throw new ArchiveError(
        `包内路径不合法：${JSON.stringify(e.path)}\n` +
          `  不许有空段、\`.\`、\`..\`，也不许以斜杠结尾。\n` +
          `  带 \`..\` 的条目写得进包、我们自己也读得回来，但真 tar 解包时会拒绝它` +
          `（"Member name contains '..'"）—— 那是一个"验过了"却恢复不出来的包。`
      );
    }
    if (e.data.length > SIZE_MAX) {
      throw new ArchiveError(
        `${e.path} 有 ${e.data.length} 字节，超过 tar 的 8 GiB 上限`
      );
    }

    const needsPax = !isAscii(e.path) || Buffer.byteLength(e.path, "utf8") > NAME_MAX;
    if (needsPax) {
      const recs = paxRecord("path", e.path);
      out.push(
        header("PaxHeader", recs.length, {
          mtimeSec: e.mtimeSec,
          mode: 0o644,
          typeflag: "x",
        }),
        recs,
        padding(recs.length)
      );
    }

    out.push(
      header(needsPax ? asciiFallback(e.path) : e.path, e.data.length, {
        mtimeSec: e.mtimeSec,
        mode: e.mode,
        typeflag: "0",
      }),
      e.data,
      padding(e.data.length)
    );
  }

  // 结尾两个全 0 块。少了它 GNU tar 会报 "Unexpected EOF"。
  out.push(Buffer.alloc(BLOCK * 2));
  return gzipSync(Buffer.concat(out), { level: 9 });
}

/**
 * 把 `tarGz()` 的产物拆回来。
 *
 * ★ 这个函数存在的唯一目的是**验证刚写出去的包**（backup.ts 拿它逐条比对源文件字节）。
 *   所以它对任何看不懂的东西都直接抛：checksum 对不上、typeflag 不认识、块不完整 ——
 *   一个"尽力恢复"的 tar 解析器在这里是负资产，它会让一个坏包看起来是好的。
 *
 * ⚠ 它读的是**我自己写的**格式。所以它能证明"写进去的字节能原样取回来"，
 *   **不能**证明"别人的 tar 也能解开这个包"。后者只有真的去调一个独立实现才算数，
 *   见 backup.ts 的 `crossCheck` 和 archive.test.ts 里那条调系统 tar 的测试。
 */
export function untarGz(gz: Buffer): ArchiveEntry[] {
  let buf: Buffer;
  try {
    buf = gunzipSync(gz);
  } catch (e) {
    throw new ArchiveError(`gzip 解不开：${(e as Error).message}`);
  }
  if (buf.length % BLOCK !== 0) {
    throw new ArchiveError(
      `包的长度 ${buf.length} 不是 ${BLOCK} 的整数倍 —— 写到一半被截断了`
    );
  }

  const entries: ArchiveEntry[] = [];
  let pos = 0;
  /** 上一条 PAX 头里给出的真实路径，作用于紧跟着的那一条。 */
  let pendingPath: string | null = null;

  while (pos + BLOCK <= buf.length) {
    const head = buf.subarray(pos, pos + BLOCK);
    pos += BLOCK;

    if (head.every(b => b === 0)) break; // 结尾块

    const str = (off: number, len: number) => {
      const raw = head.subarray(off, off + len);
      const nul = raw.indexOf(0);
      return raw.subarray(0, nul === -1 ? raw.length : nul).toString("utf8").trim();
    };
    const num = (off: number, len: number) => {
      const s = str(off, len);
      return s === "" ? 0 : parseInt(s, 8);
    };

    // checksum 先验。坏了的头往下读只会读出一堆看似合理的垃圾。
    const stated = num(148, 8);
    const copy = Buffer.from(head);
    copy.fill(0x20, 148, 156);
    let sum = 0;
    for (const b of copy) sum += b;
    if (sum !== stated) {
      throw new ArchiveError(
        `第 ${entries.length + 1} 条的头 checksum 对不上（头里写着 ${stated}，实算 ${sum}）`
      );
    }

    const size = num(124, 12);
    const typeflag = str(156, 1) || "0";
    const body = buf.subarray(pos, pos + size);
    if (body.length < size) {
      throw new ArchiveError(`包在第 ${entries.length + 1} 条的内容中间就结束了`);
    }
    pos += size + padding(size).length;

    if (typeflag === "x") {
      pendingPath = parsePaxPath(body);
      continue;
    }
    if (typeflag !== "0" && typeflag !== "\0") {
      throw new ArchiveError(
        `不认识的 tar 条目类型「${typeflag}」—— 这个包不是 tarGz() 写的`
      );
    }

    entries.push({
      path: pendingPath ?? str(0, NAME_MAX),
      data: Buffer.from(body),
      mtimeSec: num(136, 12),
      mode: num(100, 8),
    });
    pendingPath = null;
  }

  return entries;
}

function parsePaxPath(body: Buffer): string {
  const text = body.toString("utf8");
  let at = 0;
  let found: string | null = null;
  while (at < text.length) {
    const space = text.indexOf(" ", at);
    if (space === -1) break;
    const len = parseInt(text.slice(at, space), 10);
    if (!Number.isFinite(len) || len <= 0) {
      throw new ArchiveError("PAX 记录的长度字段读不出来");
    }
    const record = text.slice(at, at + len);
    const eq = record.indexOf("=");
    if (eq !== -1 && record.slice(space - at + 1, eq) === "path") {
      found = record.slice(eq + 1).replace(/\n$/, "");
    }
    at += len;
  }
  if (found === null) throw new ArchiveError("PAX 头里没有 path 记录");
  return found;
}
