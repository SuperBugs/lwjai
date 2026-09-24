import type { APIRoute } from "astro";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import rehypeSanitize from "rehype-sanitize";
import { MARKDOWN_SANITIZE_SCHEMA } from "@/config/sanitize";
import { findPlatform } from "@/config/socialPlatforms";
import { entryUrl } from "@/utils/getPostPaths";
import {
  XUEQIU_BUDGET,
  XUEQIU_MAX_SHRINKS,
  XUEQIU_TEXT_MAX,
  lengthRejection,
  planDrafts,
  replan,
  shouldShrink,
  type Measure,
  type XueqiuDraftPlan,
} from "@/utils/xueqiuArticle";
import { useTranslations } from "@/i18n";
import { findXhsGroup, xueqiuSourceOf } from "./xhsEntry";
import {
  BridgeRequestError,
  ensureBridge,
  request,
  waitForExtension,
} from "./wechatsyncBridge";
import {
  AUTH_TIMEOUT_MS,
  CONNECT_WAIT_MS,
  DRAFT_TIER_HEAD,
  SYNC_TIMEOUT_MS,
  XUEQIU_PLATFORM,
  bridgeStateLabel,
  classifyAuth,
  classifyRequestError,
  classifySync,
  noTokenLabel,
  stopsDraftBatch,
  type DraftOutcome,
} from "./wechatsyncPlan";
import { recordDraft } from "./xueqiuDrafts";
import { envFileProblem, tokenFromEnv } from "./xueqiu-status";

/**
 * 推一篇长文到雪球草稿箱 —— `POST /_xueqiu/draft`，**只在 `pnpm dev` 里存在**
 * （astro.config.ts 按 isDev 用 injectRoute 挂上）。
 *
 * 【2026-09-23 用户要的】走「文章同步助手」（Wechatsync）扩展，判据和理由全在
 * `wechatsyncPlan.ts` 文件头 —— 尤其是「为什么这条路和小红书那次不一样」那一节。
 *
 * ## 顺序（每一步失败都是自己一档，见 `DraftTier`）
 *
 *   1. 找这一组（**草稿进不来** —— `findXhsGroup()` 走 `getSortedPosts()`）
 *   2. token → 桥 → 等扩展连上来 → 问雪球登没登录       ← 这几步失败 = **还没轮到推**
 *   3. 取每一份的全文：**请求我们自己的 `.md` 导出端点**   ← 和读者下载的逐字节相同
 *   4. 排版（`planDrafts()`）：放得下合成一篇；放不下每份各推一篇、单份再按整节截
 *      → 渲染成 HTML（站上那份消毒 schema 照套）
 *   5. 一篇一篇 `syncArticle` → 分档 → 记账（通道出了问题就停，`stopsDraftBatch()`）
 *
 * ★ **不重试**：超时的那一次可能已经存上了，重试就是两份草稿。
 *   唯一的例外是雪球**明确说正文太长**（= 拒收、什么都没存）：截短成更短的另一篇再推，
 *   有上限 —— 理由在 `xueqiuArticle.ts` 的 `shouldShrink()` 上面。
 * ★ **同一时刻只推一组**，不跨组排队 —— `draft` 那一档成立的前提之一（见平台表文件头 ③）。
 */

export const prerender = false;

/** 同一时刻只推一篇：连点两下不能变成两份草稿。 */
let running = false;

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const outcome = (o: DraftOutcome, extra: Record<string, unknown> = {}) =>
  json({ ...o, head: DRAFT_TIER_HEAD[o.tier], ...extra });

/**
 * 站点自己那台 markdown 渲染器（GFM 表格）＋ **站上那份消毒 schema**。
 *
 * ⚠ 消毒不是可选的：导出的 `.md` 是**原文**，正文里夹着的裸 HTML 在站上是渲染时
 *   才被中和的（docs/engineering-notes.md 坑 13）。不套这一层，一段 `<img onerror>` 就顺着这条路
 *   进了雪球的编辑器。
 * ★ 关掉代码高亮：shiki 会往每一行塞 class 和内联 style，雪球那边的清洗
 *   不认识这些，只会让代码块更乱。
 */
let processor: ReturnType<typeof createMarkdownProcessor> | null = null;
function renderHtml(markdown: string): Promise<string> {
  processor ??= createMarkdownProcessor({
    syntaxHighlight: false,
    rehypePlugins: [[rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA]],
  });
  return processor.then(p => p.render(markdown)).then(r => r.code);
}

export const POST: APIRoute = async ({ request: req, url, currentLocale }) => {
  /**
   * 只认同源请求 —— 它**用你的雪球登录态往外推东西**，而它跑在 localhost 上，
   * 浏览器里随便一个网页都能往这儿发一个表单 POST（同 `/_publish` 那条接口）。
   */
  const site = req.headers.get("sec-fetch-site");
  const reasons = [
    req.headers.get("x-requested-with") !== "lwj-xueqiu" &&
      "缺 X-Requested-With: lwj-xueqiu",
    !(req.headers.get("content-type") ?? "").includes("application/json") &&
      "正文不是 JSON",
    site !== null && site !== "same-origin" && `Sec-Fetch-Site 是 ${site}`,
  ].filter((r): r is string => typeof r === "string");
  if (reasons.length > 0) {
    return new Response(
      `只认 /_share 页面自己发的请求（${reasons.join("；")}）。`,
      { status: 403 }
    );
  }

  if (running) {
    // ⚠ 不记账：这一次什么都没发生，只是上一篇还在推。
    return outcome(
      { tier: "failed", detail: "上一篇还没推完，等它回话。" },
      { busy: true }
    );
  }
  running = true;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      c?: unknown;
      s?: unknown;
    };
    const collection = typeof body.c === "string" ? body.c : "";
    const slug = typeof body.s === "string" ? body.s : "";

    // ── 1. 找这一组。草稿进不来（findXhsGroup 走 getSortedPosts）────────
    const { group, unknownCollection } = await findXhsGroup(collection, slug);
    if (unknownCollection || !group) {
      return json(
        {
          tier: "failed",
          head: DRAFT_TIER_HEAD.failed,
          detail: `找不到已发布的 ${collection}/${slug}（草稿没有公开地址，不推）。`,
        },
        404
      );
    }

    /**
     * 平台表说了算：哪天雪球那一行被改回 manual / retired，这个按钮就不该再推了。
     * ⚠ 不许写成"反正页面上已经不画按钮了" —— 页面和端点是两个出口。
     */
    const platform = findPlatform(XUEQIU_PLATFORM);
    if (!platform || platform.mode !== "draft") {
      return outcome({
        tier: "failed",
        detail:
          `平台表里雪球那一行现在是「${platform?.mode ?? "没有这一行"}」，不是 draft —— ` +
          "推长文这条路关着（src/config/socialPlatforms.ts）。",
      });
    }

    // ── 2. token → 桥 → 扩展 → 登录。这几步失败 = 还没轮到推 ──────────────
    const token = tokenFromEnv();
    if (!token) {
      return outcome({
        tier: "no_token",
        detail: noTokenLabel(envFileProblem()),
      });
    }
    let state;
    try {
      state = await ensureBridge({ token });
    } catch (err) {
      // 端口被占以外的绑定失败：一个字都没推，原话摊出来。
      return outcome({
        tier: "failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    if (state === "port_busy") {
      return outcome({
        tier: "port_busy",
        detail: bridgeStateLabel("port_busy"),
      });
    }
    if (state !== "connected" && !(await waitForExtension(CONNECT_WAIT_MS))) {
      return outcome({
        tier: "no_extension",
        detail:
          `等了 ${CONNECT_WAIT_MS / 1000} 秒扩展没连上来。` +
          bridgeStateLabel("waiting"),
      });
    }

    try {
      const auth = classifyAuth(
        await request(
          "checkAuth",
          token,
          { platform: XUEQIU_PLATFORM },
          AUTH_TIMEOUT_MS
        )
      );
      if (!("ok" in auth)) return outcome(auth);
    } catch (err) {
      // 问登录那一下还没推任何东西 —— sent 按 false 算，落「还没轮到推」那几档。
      return outcome(classifyRequestError(err, false));
    }

    // ── 3. 每一份的全文：请求我们自己的 .md 导出端点 ────────────────────
    /**
     * ★ **不读 `entry.body`**：那是第二个出口。推到雪球的正文必须和读者下载的
     *   逐字节相同 —— 导出端点吐什么这里就推什么（docs/gate.md 7.5「复制全文」那一节）。
     */
    const bodies: string[] = [];
    for (const a of group.answers) {
      const mdUrl = new URL(
        `${entryUrl(a.collection, a.id, a.filePath, currentLocale)}.md`,
        url.origin
      );
      const res = await fetch(mdUrl).catch(() => undefined);
      const text = res?.ok ? await res.text() : undefined;
      if (text === undefined) {
        return outcome({
          tier: "failed",
          detail:
            `取不到 ${mdUrl.pathname} 的全文（HTTP ${res?.status ?? "连不上"}）—— ` +
            "一个字都没推。",
        });
      }
      bodies.push(text);
    }

    // ── 4. 排版：放得下合成一篇，放不下每份各推一篇、单份再按整节截 ────────
    /**
     * 【2026-09-23 第一次真推撞上的】雪球单篇不超过 2 万字，数的是 HTML 全长。
     * 怎么处理是用户定的，判据全在 `planDrafts()`（xueqiuArticle.ts 文件头有来龙去脉）。
     * ★ 量长度用的就是下面推之前渲染 HTML 的那一台（`renderHtml`），不是另一把尺子。
     */
    const t = useTranslations(currentLocale);
    const measure: Measure = async md => (await renderHtml(md)).length;
    let plans: XueqiuDraftPlan[];
    try {
      plans = await planDrafts(
        xueqiuSourceOf(group, collection, t, currentLocale, bodies),
        platform,
        measure
      );
    } catch (err) {
      // 连开头加第一节都放不下 —— 一个字都没推，原话摊出来。
      return json({
        results: [
          {
            tier: "failed",
            head: DRAFT_TIER_HEAD.failed,
            detail: err instanceof Error ? err.message : String(err),
          },
        ],
        notPushed: [],
      });
    }

    // ── 5. 一篇一篇推。之后的失败都算"交出去了" ──────────────────────────
    /**
     * ★ **串行**，上一篇回来了才推下一篇（并发的话连是哪一篇撞了都分不出来）。
     * ★ 某一篇落在「不确定」或者「还没轮到推」那几档（扩展断了、没登录……）就**停下**，
     *   后面的不推 —— 通道本身出了问题，接着推只会多几个同样的结果；
     *   而「没存上」（雪球明确拒了这一篇）不停，那是这一篇自己的事。
     * ★ 雪球**明确说正文太长**的那一篇：按更小的预算重排、排回队头接着推（`shouldShrink()` /
     *   `replan()`）。【用户定的】「正文少很多都行，要保证能上传」。
     * ⚠ 那不是重试：别的失败、超时、看不懂的回话一律不重推 —— 超时的那一次可能已经存上了，
     *   重推就是两份草稿。理由在 `shouldShrink()` 上面。
     */
    /** 这一篇是谁写的：分开推的每一篇标题都一样（站上的标题），屏幕上靠这一格分。 */
    const whoOf = (p: XueqiuDraftPlan) =>
      p.source.sections.length === 1 ? p.source.sections[0]!.label : undefined;
    const results: Record<string, unknown>[] = [];
    let notPushed: { title: string; who?: string }[] = [];
    const queue = [...plans];
    while (queue.length > 0) {
      const plan = queue.shift()!;
      const html = await renderHtml(plan.article.markdown);
      let result: DraftOutcome;
      try {
        result = classifySync(
          await request(
            "syncArticle",
            token,
            {
              platforms: [XUEQIU_PLATFORM],
              // ★ 两样都给：扩展优先拿 markdown 转成它自己的 HTML，
              //   转不了的时候退回用我们给的 HTML。
              article: {
                title: plan.article.title,
                markdown: plan.article.markdown,
                content: html,
              },
            },
            SYNC_TIMEOUT_MS
          )
        );
      } catch (err) {
        result = classifyRequestError(
          err,
          err instanceof BridgeRequestError ? err.sent : true
        );
      }

      /**
       * 雪球说正文太长 —— 这一篇**没存上**，按更小的预算重排、排回队头（不记账：
       * 这一篇还没有结果，记下来的应该是截短之后那一次的）。
       */
      if (shouldShrink(result, plan)) {
        try {
          queue.unshift(...(await replan(plan, platform, measure)));
          continue;
        } catch (err) {
          result = {
            ...result,
            detail:
              `雪球说正文太长，而再截就连第一节都放不下了：` +
              `${err instanceof Error ? err.message : String(err)}`,
          };
        }
      }

      /**
       * 被退回来的是哪一格太长 —— 两种说的话不一样，**不许混成一句**
       * （第一版只认「太长」，把 AAPL 那三篇的**标题**太长说成了"正文预算估少了"）。
       */
      const rejected =
        result.tier === "failed"
          ? lengthRejection(`${result.detail} ${result.raw ?? ""}`)
          : undefined;
      if (rejected === "title") {
        result = {
          ...result,
          detail:
            `雪球说标题太长（平台表里它的上限是 ${platform.titleMax ?? "?"} 字）。` +
            `推的是「${plan.article.title}」，按码点数是 ${[...plan.article.title].length} 字 —— ` +
            `它的数法和我们的对不上，这一篇要人来看（src/utils/xueqiuArticle.ts 的 fitTitle）。`,
        };
      } else if (
        rejected === "body" &&
        (plan.shrinks ?? 0) >= XUEQIU_MAX_SHRINKS
      ) {
        result = {
          ...result,
          detail:
            `雪球连着 ${(plan.shrinks ?? 0) + 1} 次说正文太长（上限 ${XUEQIU_TEXT_MAX}），` +
            `截到最后一次我们估的是 ${plan.estimate}（预算 ${XUEQIU_BUDGET} 起步）—— ` +
            `我们的尺子和它的差得比预想的多，停下来没再推。把 XUEQIU_BUDGET 调低一些再点。`,
        };
      }

      /**
       * 记账：一篇里装了几份就在每一份的 key 下各记一笔（「还没轮到推」那几档不记）。
       * ⚠ 记账写盘失败**不影响这次的结果**，理由在 `recordDraft()` 上面。
       */
      for (const key of plan.keys) {
        recordDraft(key, result.tier, plan.article.title, result.draftUrl, {
          combined: plan.keys.length,
          truncated: plan.truncated
            ? { kept: plan.truncated.kept, total: plan.truncated.total }
            : undefined,
          who: whoOf(plan),
        });
      }

      results.push({
        ...result,
        head: DRAFT_TIER_HEAD[result.tier],
        title: plan.article.title,
        who: whoOf(plan),
        estimate: plan.estimate,
        combined: plan.keys.length >= 2 ? plan.keys.length : undefined,
        truncated: plan.truncated,
        shrinks: plan.shrinks,
        titleCut: plan.article.titleCut,
      });

      if (stopsDraftBatch(result.tier)) {
        notPushed = queue.map(p => ({ title: p.article.title, who: whoOf(p) }));
        break;
      }
    }

    return json({ results, notPushed });
  } finally {
    running = false;
  }
};
