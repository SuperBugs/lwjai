/**
 * 微信交流群 —— 页脚那条「微信交流群」、「关于」页那一块、`/wechat-qr.png` 画什么，
 * 判据只有这一份。【2026-09-24 用户要的】原话「给系统增加一个扫码加入微信群的地方，
 * 管理页面可以配置微信二维码，并且开源项目也要有群交流二维码」。
 * 数据在 `src/data/community.json`（后台「微信群」那一页写它，读它的是
 * `src/utils/wechatGroup.ts`），图在 `src/assets/community/`。
 *
 * ## 四档（`wechatGroupStateIn()`）
 *
 * | 档 | 什么时候 | 站上 |
 * |---|---|---|
 * | `none` | 没传二维码 | 页脚那条、「关于」页那一块都不画，`/wechat-qr.png` 不生成（**完成态**：这个站没有群） |
 * | `active` | 传了，没过失效时刻（或者是个人微信，不会失效） | 二维码 ＋「X月X日前有效」（个人微信没有这一行） |
 * | `expired` | 群二维码过了失效时刻 | **不画那张码**，画一句"已过期、站长更新后换成新的"（**待补**）；`/wechat-qr.png` 不生成 |
 * | （坏了） | 路径不对 / 格式不收 / 没选是哪种 / 文件找不到 | 构建红（`parseCommunity()` 或读图那一步抛） |
 *
 * ★ 过期那一档**不许画出那张旧码**：群二维码 7 天失效，扫一张过期的码，微信只回一句
 *   「该二维码已过期」—— 读者得出的结论是"这个群没了"，不是"码该换了"。
 * ★ 「是哪种二维码」**必须显式选**，不许用"日期留空 = 不会失效"来表达：一张群二维码
 *   忘了填日期，第 8 天起它就挂着一张扫不进去的码，而哪儿都不报错。所以后台那一格是
 *   `fields.conditional`：选「微信群」就必填失效日期，选「个人微信」才没有日期。
 *   （同 `modelScope()` 那条：「还没标」和「看过了、不限」不许压成一档。）
 * ★ 失效时刻按**北京时间那一天的 0 点**算。群二维码上印的是「10月1日前有效」，
 *   它真正失效是生成之后整 7 天（多半是 10 月 1 日白天）。按 0 点算最多提前大半天说它过期；
 *   反过来是挂着一张已经扫不进去的码 —— 两个方向代价不对称，挑便宜的那个。
 * ★ 静态站上"过期"有两个时刻：构建那一刻（这里）和读者打开页面那一刻
 *   （`WechatGroup.astro` 的脚本）。失效时刻**只在这里算一次**（`expiresAt`），
 *   页面把它写进 `data-wechat-expires-at`，脚本只比大小。
 *
 * ★ 这个文件**不读那份 JSON**：`keystatic.config.ts` 要从这里拿字段名和路径常量，
 *   而后台不许因为这份表坏了就整个打不开（标签表那边踩过：登记表读不进来，后台自己也读它）。
 * ★ 零 astro import：测试是裸 tsx 跑的，后台是在 Astro 之外被 Vite 加载的。
 */
import { COMMUNITY_ASSETS_DIR } from "./collections";
import { beijingWallToUtc } from "./beijingTime";

/** 二维码那一格的字段名 —— 也是盘上的文件名（Keystatic 拿字段 key 当文件名）。
 *  ⚠ 改名 = 已经传过的那张图对不上了（盘上还叫旧名字），要去后台重传一次。 */
export const WECHAT_QR_FIELD = "wechatQr";

/** 「是哪种二维码 ＋ 失效日期」那一格的字段名。 */
export const WECHAT_KIND_FIELD = "wechatKind";

/**
 * 后台 image 字段的 `publicPath`：**从 JSON 所在的 `src/data/` 出发**指到
 * `COMMUNITY_ASSETS_DIR`。盘上存的值 = 它 ＋ `wechatQr.<扩展名>`。
 * 不在这里用 `node:path` 现算：这个文件会被后台（浏览器里）加载。
 * `community.test.ts` 钉着它和 COMMUNITY_FILE / COMMUNITY_ASSETS_DIR 对得上。
 */
export const WECHAT_QR_PUBLIC_PATH = "../assets/community/";

/**
 * 收哪几种图（按扩展名；读图那一步 `renderWechatQr()` 再按内容查一遍）。
 * 不收 SVG（里面可以带脚本，而且这张图要被 GitHub 那边引用）、GIF、HEIC（sharp 读不了）。
 */
export const WECHAT_QR_FORMATS = ["png", "jpg", "jpeg", "webp"] as const;

/**
 * 出图那条路由的地址（`src/pages/wechat-qr.png.ts`）。「关于」页的 `<img>` 和
 * 开源仓库 README 里那张图都指向它 —— 图换了，两处跟着变，README 不用改。
 */
export const WECHAT_QR_ROUTE = "/wechat-qr.png";

/** 「关于」页那一块的锚点，页脚那条链接指向它。 */
export const WECHAT_GROUP_ANCHOR = "wechat-group";

export type WechatQr =
  | {
      /** 仓库根相对（`src/assets/community/wechatQr.png`）。 */
      file: string;
      kind: "group";
      /** 失效日期，`YYYY-MM-DD`，北京时间的那一天。 */
      expiresOn: string;
    }
  | { file: string; kind: "personal" };

export interface CommunityConfig {
  /** 没传二维码 = undefined。 */
  wechat?: WechatQr;
}

export type WechatGroupState =
  | { tier: "none" }
  | { tier: "active"; qr: WechatQr; /** 个人微信没有 */ expiresAt?: string }
  | {
      tier: "expired";
      qr: Extract<WechatQr, { kind: "group" }>;
      expiresAt: string;
    };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const QR_VALUE_RE = new RegExp(
  `^${escapeRe(WECHAT_QR_PUBLIC_PATH)}${WECHAT_QR_FIELD}\\.(${WECHAT_QR_FORMATS.join("|")})$`,
  "i"
);

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `2026-10-01` → `{ year: 2026, month: 10, day: 1 }`；不是一个真实存在的日子就抛。 */
export function expiresOnParts(expiresOn: string): {
  year: number;
  month: number;
  day: number;
} {
  const m = DATE_RE.exec(expiresOn);
  const [year, month, day] = m
    ? [Number(m[1]), Number(m[2]), Number(m[3])]
    : [0, 0, 0];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    !m ||
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error(
      `失效日期「${expiresOn}」不是一个 YYYY-MM-DD 格式的真实日期。`
    );
  }
  return { year, month, day };
}

/** 失效日期 → 失效时刻（ISO，UTC）：北京时间那一天的 0 点。理由见文件头。 */
export function wechatExpiresAt(expiresOn: string): string {
  expiresOnParts(expiresOn);
  return new Date(
    `${beijingWallToUtc(`${expiresOn}T00:00`)}:00.000Z`
  ).toISOString();
}

/**
 * 校验并解析那份 JSON。**坏了就抛**（构建红），不许静默当成"没配"：
 * 那样一次手滑传错格式，站上的群入口就悄悄没了，而后台显示着一张图。
 */
export function parseCommunity(raw: unknown, where: string): CommunityConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `${where} 不是一个 JSON 对象。去后台「微信群」那一页存一次。`
    );
  }
  const r = raw as Record<string, unknown>;
  const qr = r[WECHAT_QR_FIELD];
  // 没传（或者在后台把图删了）：完成态。那一格的日期留着也不要紧，没有图就不画。
  if (qr === undefined || qr === null || qr === "") return {};
  if (typeof qr !== "string") {
    throw new Error(
      `${where} 的 ${WECHAT_QR_FIELD} 不是字符串：${JSON.stringify(qr)}`
    );
  }
  const m = QR_VALUE_RE.exec(qr);
  if (!m) {
    throw new Error(
      `${where} 的 ${WECHAT_QR_FIELD} 是「${qr}」—— 期望 ${WECHAT_QR_PUBLIC_PATH}${WECHAT_QR_FIELD}.<${WECHAT_QR_FORMATS.join(" / ")}>。` +
        (/\.svg$/i.test(qr)
          ? "SVG 不收（里面可以带脚本）：换成二维码的 PNG / JPG 截图，去后台「微信群」那一页重传。"
          : "去后台「微信群」那一页重传一次（手改过这个文件的话，路径得和后台写的一模一样）。")
    );
  }
  const file = `${COMMUNITY_ASSETS_DIR}/${WECHAT_QR_FIELD}.${m[1]}`;

  const kind = r[WECHAT_KIND_FIELD];
  const disc =
    kind && typeof kind === "object" && !Array.isArray(kind)
      ? (kind as Record<string, unknown>).discriminant
      : undefined;
  if (disc === "personal") return { wechat: { file, kind: "personal" } };
  if (disc === "group") {
    const expiresOn = (kind as Record<string, unknown>).value;
    if (typeof expiresOn !== "string" || expiresOn === "") {
      throw new Error(
        `${where}：选的是「微信群二维码」但没填失效日期 —— 群二维码 7 天失效，` +
          `不填日期它过期之后站上会一直挂着一张扫不进去的码。去后台「微信群」那一页填上二维码上印的那一天。`
      );
    }
    try {
      expiresOnParts(expiresOn);
    } catch (e) {
      throw new Error(
        `${where}：${e instanceof Error ? e.message : String(e)}`
      );
    }
    return { wechat: { file, kind: "group", expiresOn } };
  }
  throw new Error(
    `${where} 传了二维码，但没说是哪种（${WECHAT_KIND_FIELD} 是 ${JSON.stringify(kind)}）—— ` +
      `去后台「微信群」那一页选「微信群二维码」或「个人微信二维码」再存一次。`
  );
}

/** 此刻该画哪一档。`now` 是入参：测试喂自己的时刻，页面喂 `new Date()`。 */
export function wechatGroupStateIn(
  cfg: CommunityConfig,
  now: Date
): WechatGroupState {
  const qr = cfg.wechat;
  if (!qr) return { tier: "none" };
  if (qr.kind === "personal") return { tier: "active", qr };
  const expiresAt = wechatExpiresAt(qr.expiresOn);
  return now.getTime() >= Date.parse(expiresAt)
    ? { tier: "expired", qr, expiresAt }
    : { tier: "active", qr, expiresAt };
}
