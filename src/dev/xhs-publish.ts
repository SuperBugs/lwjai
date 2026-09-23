import type { APIRoute } from "astro";
import { loadMonoFonts } from "@/utils/ogEndpoint";
import { renderCached } from "./xhsCache";
import { recordPublish } from "./xhsPublished";
import { xhsPost } from "@/utils/xhsPost";
import { cardSourceOf, findXhsGroup, postSourceOf } from "./xhsEntry";
import { checkLogin, publishNote } from "./xhsMcp";
import { checkImagePath, type PublishOutcome } from "./xhsPublishPlan";
import { useTranslations } from "@/i18n";

/**
 * 把一条内容发到小红书 —— `POST /_xhs/publish`，
 * **只在 `pnpm dev` 里存在**（astro.config.ts 按 isDev 用 injectRoute 挂上）。
 *
 * 【2026-09-22 用户要的】接 `xpzouying/xiaohongshu-mcp`，**直接发，不停在发布页等确认**。
 *
 * ## ⚠ 这条路上**没有人再看一眼**了
 *
 * 在它之前，`/_xhs` 是人点下载、人去小红书发 —— 那是发布闸和公网之间
 * 最后一双眼睛。用户明确要全自动（我提过这一条，他决定了），所以记在这儿：
 *
 *   - 图和文案上的每一个字节**仍然是闸门扫过的**（标题 / 摘要 / 标签来自
 *     frontmatter，公司名和模型名来自那两张过闸的数据表），所以这不是泄露口子；
 *   - 变的是**"闸扫过"和"人看过"之间那一步没有了**。真要加回来，
 *     加在这儿（发之前把 title/body 摊出来等一次确认），别加在别处。
 *
 * ## 四档，一档都不许压（`xhsPublishPlan.ts`）
 *
 *   `published`   命中了已知的成功信号
 *   `unconfirmed` 调通了但**看不懂回包** —— 不是成功，也不是失败
 *   `failed`      明确失败
 *   `offline`     server 没起 / 没登录 —— **还没轮到发布**
 *
 * ★ 那个接口**没有公开的响应 schema**，所以今天多半每一条都落 `unconfirmed`，
 *   页面会把回包原文摊出来。对着真回包校准 `SUCCESS_SIGNALS` 之后才会有
 *   `published`。**在校准之前不许把这一档粉饰成绿的。**
 *
 * ## 图片必须落成**纯 ASCII 路径的本地文件**
 *
 * 那个工具的排障清单里明写着「路径编码（不要有中文）」是发布失败的已知原因，
 * 而 `/_xhs` 给人下载用的文件名是 `牢玩家-r1009.png`。所以发出去的是**缓存里
 * 那一份**（`cacheFileName()` 起的名，纯 ASCII），并且**发之前**先查一遍整条
 * 绝对路径（`checkImagePath()`）—— 不查的话得到的是一次没有原因的失败。
 */

/**
 * ★ 必须显式关掉预渲染：预渲染路由拿到的 `request.headers` 是空的，
 *   下面那三条同源检查永远过不了（同 `publish-run.ts` / `tidy-run.ts`）。
 */
export const prerender = false;

/** 同一时刻只许发一条：连点两下不能变成发两遍。 */
let running = false;

const json = (payload: unknown, status: number) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

export const POST: APIRoute = async ({ request, url, currentLocale }) => {
  /**
   * 只认同源请求。和 `/_publish/run`、`/_tidy/run` 同一条理由，而且这一条更狠：
   * 它**往公网发内容**，而它跑在 localhost 上 —— 浏览器里随便一个网页都能
   * 往这儿发一个表单 POST。
   */
  const site = request.headers.get("sec-fetch-site");
  const reasons = [
    request.headers.get("x-requested-with") !== "lwj-xhs" &&
      "缺 X-Requested-With: lwj-xhs",
    !(request.headers.get("content-type") ?? "").includes("application/json") &&
      "正文不是 JSON",
    site !== null && site !== "same-origin" && `Sec-Fetch-Site 是 ${site}`,
  ].filter((r): r is string => typeof r === "string");
  if (reasons.length > 0) {
    return new Response(
      `只认 /_xhs 页面自己发的请求（${reasons.join("；")}）。`,
      {
        status: 403,
      }
    );
  }

  if (running) {
    return json(
      {
        tier: "failed",
        detail: "上一条还没发完，等它。",
      } satisfies PublishOutcome,
      409
    );
  }
  running = true;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      c?: unknown;
      s?: unknown;
      token?: unknown;
      endpoint?: unknown;
    };
    const collection = typeof body.c === "string" ? body.c : "";
    const slug = typeof body.s === "string" ? body.s : "";
    const opts = {
      token: typeof body.token === "string" ? body.token : undefined,
      endpoint: typeof body.endpoint === "string" ? body.endpoint : undefined,
    };

    const { group, unknownCollection } = await findXhsGroup(collection, slug);
    if (unknownCollection || !group) {
      return json(
        {
          tier: "failed",
          detail: `找不到已发布的 ${collection}/${slug}（草稿没有公开地址，不发）。`,
        } satisfies PublishOutcome,
        404
      );
    }

    // ── ① 先问登录。没登录是 `offline` 档，**不是发布失败** ──────────────
    const login = await checkLogin(opts);
    if (login.tier !== "published") return json(login, 200);

    const t = useTranslations(currentLocale);

    /**
     * ── ② 出图 ──────────────────────────────────────────────────────────
     *
     * ★ 走**和出图端点同一份缓存**（`renderCached`）——
     *   所以**发出去的就是你在页面上看过的那张图**，逐字节相同。
     *   各画一次的话，中间只要有一处不确定（字体回落、时间跨过零点），
     *   你看到的和发出去的就是两张图，而没有任何一处会说。
     * ⚠ 缓存文件名是纯 ASCII（`cacheFileName()`：那个工具的排障清单里路径带中文
     *   是已知失败原因），所以直接拿它去发。
     */
    let file: string;
    try {
      const r = await renderCached(
        cardSourceOf(group, collection, t, currentLocale),
        await loadMonoFonts(url),
        collection,
        slug
      );
      file = r.file;
    } catch (err) {
      // 图没画出来就**不发** —— 没有图的小红书笔记等于没有内容。
      return json(
        {
          tier: "failed",
          detail:
            `封面图没画出来，所以没发：${err instanceof Error ? err.message : String(err)}\n` +
            `多半是中文字形取不到（见 src/utils/googleFontSubset.ts）。`,
        } satisfies PublishOutcome,
        200
      );
    }

    // 发之前再查一遍整条绝对路径：仓库被 clone 到 `D:\项目\…` 时才看得出来。
    const pathProblem = checkImagePath(file);
    if (pathProblem) {
      return json(
        { tier: "failed", detail: pathProblem } satisfies PublishOutcome,
        200
      );
    }

    // ── ③ 文案 ＋ 发 ──────────────────────────────────────────────────
    const note = xhsPost(postSourceOf(group, collection, t));
    const outcome = await publishNote(
      {
        title: note.title,
        content: note.body,
        images: [file],
        tags: note.tags,
      },
      opts
    );

    /**
     * 记一笔流水账（`offline` 不记 —— 那是还没轮到发布）。
     * ★ 记的是「**我们发过**」，不是「小红书上现在有」，三档跟着 outcome 走。
     *   在它之前页面对"发过什么"**毫无记忆**：刷新一下就分不出哪些发过了，
     *   而重复发正是这整套四档要防的事（见 `xhsPublished.ts` 文件头）。
     * ⚠ 记账写盘失败**不影响这次的结果** —— 帖子已经发出去了，
     *   这时候报错只会让人以为没发成而去重发。
     */
    recordPublish(collection, slug, outcome.tier, note.title);

    // 把发出去的那份文案一起回给页面：`unconfirmed` 那一档人要拿它去小红书比对。
    return json({ ...outcome, note, image: file }, 200);
  } finally {
    running = false;
  }
};
