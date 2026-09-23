/**
 * 搜索结果的缩略图（Pagefind 的 `meta.image`）不许是智能体 logo。
 *
 * 【2026-09-23 查实】Pagefind 1.5.2 会把**标题之后的第一张 `<img>`** 自动记成这一页的
 * `meta.image`（`fossick/parser.rs` 里 auto_image 那一支）。真构建出来的 39 页索引里，
 * 36 页的缩略图是一个智能体 logo，其中 18 页是**别人的**：ChatGPT 的 logo 是单色
 * （`<span>`，不是 `<img>`），于是落到切换排里兄弟那一份的 Gemini 上；提示词页落到
 * 「相关条目」卡片上。缩略图今天没有地方画，但 meta 的字会被编进索引 —— 搜「gemini」
 * 搜得出 16 篇 ChatGPT 写的、搜「claude」搜得出一篇，对上的只是 logo 的文件名：
 * 搜索结果替这一页**认领了一个厂商**。所以这里钉的是 `meta.image` 根本不存在
 * （没有这一格，也就没有这一格的字）。修法、以及为什么只能是那个修法
 * （必须是 `"all"`、必须挂在 `<img>` 本身、不是显式写一个 `image` meta），
 * 写在 `src/components/AgentLogo.astro` 文件头「站内搜索」那一节。
 *
 * ## 这份测试的输入不是手写的
 *
 * 手写一段 `<img data-pagefind-ignore="all">` 喂给 Pagefind，测到的只是"Pagefind 认这个
 * 属性" —— 组件哪天把它丢了，那条照样绿（docs/gate.md 第 7 节 `SC 13D` 那个形态：
 * 测试自己喂的就是它以为站上会写的东西）。所以这里的 logo、芯片、切换排、相关条目卡片
 * 都是**真渲染出来的**：Astro 自己的 Vite 配置（`getViteConfig`）把 `.astro` 编出来，
 * `experimental_AstroContainer` 渲染，输出原样喂给**真的 Pagefind**（`pagefind` 包的
 * Node API，和构建链里 `pagefind --site dist` 是同一个二进制、同一个解析器），
 * 读它记下的 `meta`。
 *
 * 手写的只有外面那层骨架（`<main data-pagefind-body>` ＋ `<h1>` ＋ 一段正文）——
 * 它不是修法的一部分，而 C 组证明这层骨架里 Pagefind **确实在抓图**：
 * 没有 C 组的话，骨架哪天写坏了（比如 `<h1>` 没了，Pagefind 就一张图都不抓），
 * A / B 两组的"没抓到"会一起空转着绿。
 *
 * 分组：
 *   A 每一档的 logo（登记表里的每个智能体 ＋ 两个哨兵 ＋ 查不到的），两个尺寸，都不会被记成缩略图
 *   B 真出过事的两种页面形状：r/1037（本条 logo 不是 `<img>`、切换排里的兄弟是）、
 *     p/1000（「相关条目」卡片里是别的条目）
 *   C 正例：同一个骨架里、排在那些 logo 后面的正文截图，照样当缩略图
 *     （/g/1005 就是这样 —— 修法不许把真正该当缩略图的图一起挡掉）
 *
 * ★ 用例是从「人真的会怎么改坏它」来的（2026-09-23 在一份副本里逐条实跑过）：
 *     - 嫌那个属性多余，从 AgentLogo 的 `<img>` 上删掉              → A / B / C 红
 *     - 改成不带值的 `data-pagefind-ignore`（"反正都是 ignore"）      → A / B / C 红
 *     - 从 `<img>` 挪到外层，切换排那个 `<nav>` 上挂 `="all"`        → A / B / C 红
 *       （B 那几页的 `<nav>` 上明明挂着 all：Pagefind 自己的排除表里有 `nav`，改回了「index」）
 *     - 挂错分支，挂在单色那个 `<span>` 上                            → A / B / C 红
 *     - 骨架里的 `<h1>` 丢了                    → **只有 C 红**（A / B 空转着绿 —— C 就是为这个在的）
 *
 * ⚠ 起了一个 Vite（每次 `pnpm test` 多两三秒）：
 *   - `configFile: false`，**不读 astro.config.ts**：那边配着 `fonts`（Google 那个 provider），
 *     Astro 的字体插件在 dev 配置的 `buildStart` 里就去解析它 —— 联网取，缓存写进 `.astro/`
 *     （按 `astro/dist/assets/fonts/vite-plugin-fonts.js` 的源码），而本机的 dev server
 *     正占着那个目录。一条单测不该碰网络，也不该往别人的目录里写。
 *     内联的只有 `astro:i18n` 要的那一段（`entryUrl()` 用它）：这里要验的和地址长什么样无关。
 *   - 缓存目录是系统临时目录里单开的一个，`after` 里删掉；**不许**落到 `node_modules/.vite` ——
 *     那是正在跑的 dev server 的预打包缓存，被换掉就是坑 20 那个白屏。
 *     ⚠ 那个目录**不是空的**：Astro 自己的插件在 client 环境上写死了 dev toolbar 那几个依赖的
 *     预打包（实测 29 个文件），用户配置盖不掉 —— 别在这儿加一行 `optimizeDeps` 假装关掉了它
 *     （试过，一个文件都没少）。实测跑完之后项目里的 `.astro/`、`node_modules/.vite`、`src/`
 *     一个文件都没变。
 *
 * 跑：`pnpm test`
 */

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as pagefind from "pagefind";
import { getViteConfig } from "astro/config";
import { AGENTS } from "../../src/config/agents";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** 渲染器和 Vite 的最小形状。`vite` 不是这个仓库的直接依赖（它跟着 astro 来），
 *  类型拿不到，只写这里用得到的那两三个方法。 */
type Component = unknown;
type Container = {
  renderToString(
    component: Component,
    options?: { props?: Record<string, unknown> }
  ): Promise<string>;
};
type DevServer = {
  ssrLoadModule(url: string): Promise<Record<string, unknown>>;
  close(): Promise<void>;
};

let server: DevServer | undefined;
let container: Container;
let cacheDir: string | undefined;
let index: pagefind.PagefindIndex;
const component: Record<string, Component> = {};

before(async () => {
  cacheDir = mkdtempSync(join(tmpdir(), "lwj-pagefind-image-"));
  // vite 从 astro 那里解析：pnpm 不把间接依赖提到根上，直接 import "vite" 找不到。
  const viteEntry = createRequire(
    import.meta.resolve("astro/package.json")
  ).resolve("vite");
  const { createServer } = (await import(pathToFileURL(viteEntry).href)) as {
    createServer(config: object): Promise<DevServer>;
  };
  const viteConfig = await getViteConfig(
    {},
    {
      configFile: false,
      root: ROOT,
      logLevel: "silent",
      i18n: {
        locales: ["zh-CN"],
        defaultLocale: "zh-CN",
        routing: { prefixDefaultLocale: false },
      },
    }
  )({ mode: "development", command: "serve" });
  server = await createServer({
    ...viteConfig,
    configFile: false,
    cacheDir,
    logLevel: "silent",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  });

  // 渲染器也从同一个 Vite 里取：组件是在它里面编出来的，两边用同一份 astro 运行时。
  const { experimental_AstroContainer } = (await server.ssrLoadModule(
    "astro/container"
  )) as {
    experimental_AstroContainer: { create(): Promise<Container> };
  };
  container = await experimental_AstroContainer.create();
  for (const name of [
    "AgentLogo",
    "AgentModelChip",
    "QaAnswerSwitch",
    "RelatedEntries",
  ]) {
    component[name] = (
      await server.ssrLoadModule(`/src/components/${name}.astro`)
    ).default;
  }

  const created = await pagefind.createIndex({});
  assert.ok(
    created.index,
    `Pagefind 起不来：${created.errors.join("；")} —— 这条测试靠的就是真的 Pagefind`
  );
  index = created.index;
});

after(async () => {
  await server?.close();
  await pagefind.close();
  if (cacheDir) rmSync(cacheDir, { recursive: true, force: true });
});

const render = (name: string, props: Record<string, unknown>) =>
  container.renderToString(component[name], { props });

const hasImg = (html: string) => /<img\b/i.test(html);

/**
 * 详情页的骨架，**只有这一层是手写的**：`<main data-pagefind-body>` 里先一个 `<h1>`
 * （Pagefind 从标题之后才开始抓图），然后是真渲染出来的那几样，最后是正文。
 * 顺序照着 `src/pages/r/[...slug]/index.astro`：标题 → 那行芯片 → 切换排 → 正文 → 相关条目。
 */
function page(parts: {
  byline?: string;
  switchRow?: string;
  article?: string;
  related?: string;
}): string {
  return [
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">`,
    `<title>探针 | 牢玩家</title></head><body>`,
    `<main data-pagefind-body>`,
    `<h1>探针选题</h1>`,
    `<div>${parts.byline ?? ""}</div>`,
    parts.switchRow ?? "",
    `<article>${parts.article ?? "<p>正文第一段。</p>"}</article>`,
    parts.related ?? "",
    `</main></body></html>`,
  ].join("");
}

let pageNo = 0;
/** 喂给真的 Pagefind，拿回它给这一页记下的 meta。 */
async function metaOf(html: string): Promise<Record<string, string>> {
  const { errors, file } = await index.addHTMLFile({
    url: `/probe/${++pageNo}`,
    content: html,
  });
  assert.deepEqual(errors, [], `Pagefind 解析这一页报错：${errors.join("；")}`);
  return file.meta;
}

const AI = AGENTS.filter(a => a.kind === "ai");
/** 登记表里的每个智能体、两个哨兵（未标注 / 我自己），再加一个查不到的 id —— 四档全在。 */
const EVERY_AGENT_ID = [...AGENTS.map(a => a.id), "no-such-agent"];

/** 切换排 / 相关条目卡片真正读到的那几格。`n` 只用来让地址和转场名不撞。 */
const entryOf = (collection: "posts" | "qa", n: number, agent: string) => ({
  id: String(9000 + n),
  collection,
  filePath: `src/content/${collection}/${9000 + n}.md`,
  data: {
    title: "探针选题",
    description: `探针摘要 ${n}`,
    agent,
    pubDatetime: new Date("2026-09-01T00:00:00Z"),
  },
});

/** 被记成缩略图的那几页，一页一行（哪一页 → 记下的是哪张图），后面跟一次说明。 */
function assertNoLeaks(leaks: string[]) {
  assert.ok(
    leaks.length === 0,
    `Pagefind 把智能体 logo 记成了这几页的缩略图（meta.image）：\n  ` +
      leaks.join("\n  ") +
      `\n一打开 showImages，这些搜索结果就顶着一个智能体 logo（多半是别人的）。` +
      `修法和为什么必须是那个修法：src/components/AgentLogo.astro 文件头「站内搜索」`
  );
}

test("A1 ★ 每一档的 logo，两个尺寸，都不会被记成缩略图（真渲染 → 真 Pagefind）", async () => {
  const leaks: string[] = [];
  const withImg: string[] = [];
  for (const agent of EVERY_AGENT_ID) {
    for (const size of ["sm", "lg"] as const) {
      const logo = await render("AgentLogo", { agent, size });
      if (hasImg(logo)) withImg.push(`${agent}/${size}`);
      const meta = await metaOf(page({ byline: logo }));
      if (meta.image !== undefined) {
        leaks.push(`AgentLogo agent=${agent} size=${size} → ${meta.image}`);
      }
    }
  }
  // ★ 这一条不是凑数：一个 `<img>` 都没渲染出来的话，上面那圈"没被抓"什么也没证明。
  assert.ok(
    withImg.length > 0,
    "这一轮渲染出来的 logo 里一个 <img> 都没有 —— 要么登记表里没有彩色 logo 了，" +
      "要么 AgentLogo 改了画法。那样这条测试在空转，回来看一眼它还该钉什么。"
  );
  assertNoLeaks(leaks);
});

test("B1 ★ r/1037 的形状：本条 logo 不是 <img>，切换排里的兄弟是 —— 谁都不许当缩略图", async () => {
  // 每一个智能体轮流当本条，其余每个 AI 智能体都当它的兄弟。ChatGPT 当本条的那一页
  // 就是当时出事的那一页（它的 logo 是单色 <span>，第一张 <img> 是兄弟的 Gemini）。
  const leaks: string[] = [];
  let sawImg = false;
  for (const collection of ["posts", "qa"] as const) {
    for (const current of AGENTS) {
      const siblings = AI.filter(a => a.id !== current.id).map((a, i) =>
        entryOf(collection, i + 1, a.id)
      );
      const byline = await render("AgentModelChip", {
        agent: current.id,
        size: "lg",
      });
      const switchRow = await render("QaAnswerSwitch", {
        collection,
        current: entryOf(collection, 0, current.id),
        siblings,
        description: "探针摘要",
      });
      sawImg ||= hasImg(byline) || hasImg(switchRow);
      const meta = await metaOf(page({ byline, switchRow }));
      if (meta.image !== undefined) {
        leaks.push(`${collection} 详情页，本条 = ${current.id} → ${meta.image}`);
      }
    }
  }
  assert.ok(sawImg, "芯片和切换排里一个 <img> 都没渲染出来 —— 这条在空转");
  assertNoLeaks(leaks);
});

test("B2 ★ p/1000 的形状：「相关条目」卡片里别的条目的 logo 不许当缩略图", async () => {
  const related = await render("RelatedEntries", {
    heading: "用这份提示词跑出来的研究",
    entries: AI.map((a, i) => entryOf("posts", i, a.id)),
  });
  assert.ok(hasImg(related), "相关条目卡片里一个 <img> 都没渲染出来 —— 这条在空转");
  const meta = await metaOf(page({ related }));
  assertNoLeaks(
    meta.image === undefined ? [] : [`提示词详情页的相关条目 → ${meta.image}`]
  );
});

test("C1 ★ 正例：排在那些 logo 后面的正文截图照样当缩略图（骨架是活的，修法没挡掉真图）", async () => {
  const [current, ...others] = AI;
  assert.ok(current, "登记表里一个 AI 智能体都没有");
  const byline = await render("AgentModelChip", {
    agent: current.id,
    size: "lg",
  });
  const switchRow = await render("QaAnswerSwitch", {
    collection: "posts",
    current: entryOf("posts", 0, current.id),
    siblings: others.map((a, i) => entryOf("posts", i + 1, a.id)),
    description: "探针摘要",
  });
  const related = await render("RelatedEntries", {
    heading: "同一只票的其他研究",
    entries: AI.map((a, i) => entryOf("posts", 10 + i, a.id)),
  });
  // 正文里的一张截图 —— 构建出来就是这个形状（/_astro/<名>.<hash>.webp，alt 是作者写的）。
  const shot = { src: "/_astro/probe-shot.AbCd1234.webp", alt: "开户页截图" };
  const meta = await metaOf(
    page({
      byline,
      switchRow,
      article: `<p>正文第一段。</p><p><img src="${shot.src}" alt="${shot.alt}"></p>`,
      related,
    })
  );
  assert.ok(
    meta.image !== undefined,
    "正文截图没被记成缩略图 —— 骨架里 Pagefind 根本没在抓图（<h1> 还在吗？），" +
      "那 A / B 两组的「没被抓」就什么也没证明"
  );
  assertNoLeaks(
    meta.image === shot.src
      ? []
      : [`排在正文截图前面的那些 logo 抢走了缩略图 → ${meta.image}`]
  );
  assert.equal(meta.image_alt, shot.alt);
});
