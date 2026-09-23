import type { APIRoute } from "astro";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inspect } from "../../scripts/gate/inspect";
import { existingEntryIds } from "../../scripts/content/existingIds";
import { ImportError, planImport } from "../../scripts/content/importPlan";
import { registerSymbols } from "../../scripts/content/registerSymbols";
import { parsePublishJson } from "./importJson";

/**
 * 「粘贴导入」真正落盘的那条接口 —— `POST /_import/run`，**只在 `pnpm dev` 里存在**。
 *
 * 粘进来的 JSON 先过 ./importJson.ts（一次摊出所有错），再交给 **和 CLI 同一份**的
 * planImport()（scripts/content/importPlan.ts）：认标的、截摘要、起地址、转义裸 `<`，
 * 产出永远是 `draft: true`。写完当场跑一遍发布闸判据（inspect，和 pre-commit / 构建期同一份），
 * 结果原样回给页面。**不覆盖已有文件。**
 *
 * 同源检查和 publish-run.ts 一样（那边写了为什么）；`prerender = false` 的理由也一样：
 * 预渲染路由拿到的请求头是空的。
 */
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const site = request.headers.get("sec-fetch-site");
  const reasons = [
    request.headers.get("x-requested-with") !== "lwj-import" &&
      "缺 X-Requested-With: lwj-import",
    !(request.headers.get("content-type") ?? "").includes("application/json") &&
      "正文不是 JSON",
    site !== null && site !== "same-origin" && `Sec-Fetch-Site 是 ${site}`,
  ].filter((r): r is string => typeof r === "string");
  if (reasons.length > 0) {
    return new Response(
      `只认 /_import 页面自己发的请求（${reasons.join("；")}）。`,
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { json?: unknown };
  const raw = typeof body.json === "string" ? body.json : "";
  if (!raw.trim()) {
    return json({ stage: "invalid", errors: ["什么都没粘。"] }, 200);
  }

  const parsed = parsePublishJson(raw);
  if (!parsed.ok) {
    return json({ stage: "invalid", errors: parsed.errors }, 200);
  }
  const v = parsed.value;

  // 引用的提示词必须真的存在：reference() 不查，构建期 resolvePromptRef 才查，那时太晚。
  if (v.prompt) {
    const p = join(
      process.cwd(),
      "src",
      "content",
      "prompts",
      `${v.prompt}.md`
    );
    if (!existsSync(p)) {
      return json(
        {
          stage: "invalid",
          errors: [
            `prompt「${v.prompt}」不存在 —— 对一眼 src/content/prompts/ 下的文件名。`,
          ],
        },
        200
      );
    }
  }

  let plan;
  try {
    plan = planImport({
      collection: v.collection,
      markdown: v.body,
      now: new Date(),
      // 号池：四个编号集合现有的 id。读盘口和 CLI 是同一份（existingIds.ts）——
      // 各写一份的那天，就是其中一条路少扫一个集合、新条目和人撞号的那天。
      existingIds: existingEntryIds(),
      title: v.title,
      description: v.description,
      symbol: v.symbol,
      symbolName: v.symbolName,
      symbols: v.symbols,
      tags: v.tags,
      agent: v.agent,
      model: v.model,
      prompt: v.prompt,
      questionKey: v.questionKey,
    });
  } catch (e) {
    if (e instanceof ImportError) {
      return json({ stage: "invalid", errors: [e.message] }, 200);
    }
    throw e;
  }

  const target = join(process.cwd(), ...plan.file.split("/"));
  if (existsSync(target)) {
    return json(
      {
        stage: "exists",
        file: plan.file,
        errors: [
          `不覆盖已有文件：${plan.file}。等一分钟再导（地址带时分），或者去后台改那一条。`,
        ],
      },
      200
    );
  }
  writeFileSync(target, plan.text, "utf8");
  // ★ 稿子和标的表一起写：勾着一只表里没有的票时，只写稿子的话这一条在后台
  //   打不开、构建也红。判据在 src/config/symbols.ts，CLI 那条路读同一份。
  const registered = registerSymbols(plan.newSymbols);

  const gate = inspect(plan.file, plan.text);
  const hit = (h: (typeof gate.blocked)[number]) => ({
    code: h.code,
    matched: h.matched,
    context: h.context,
    why: h.rule.why,
  });
  return json(
    {
      stage: "created",
      file: plan.file,
      slug: plan.slug,
      title: plan.title,
      editUrl: `/keystatic/collection/${v.collection}/item/${plan.slug}`,
      notes: [
        ...parsed.notes,
        ...plan.warnings,
        // 真的往标的表里写了行时多说一句 —— 那是这次导入在内容之外改的**另一个文件**，
        // 不说的话它会在 /_publish 的待提交清单里冒出来而没人知道为什么。
        ...(registered.length > 0
          ? [
              `标的表里新登记了：${registered.join(" / ")}。` +
                `去后台左侧「标的」那一页把公司中英文名补上（站上只印代码，不编名字）。`,
            ]
          : []),
      ],
      gate: {
        blocked: gate.blocked.map(hit),
        warnings: gate.warnings.map(hit),
      },
    },
    200
  );
};

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
