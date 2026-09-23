# 部署

## 0. 先说结论

- **内容仓库私有，公开的只有构建产物。** 这是发布闸的前提，见 [gate.md](gate.md)。
- **部署到 Cloudflare Workers（Static Assets），不是 Pages。**
  Cloudflare 对新项目推荐 Workers，Astro 官方部署文档也这么写。Pages 没有停用时间表，
  但新功能一律先上 Workers；而且 Workers 这条路以后要挂动态数据时**不用重新平台化**。
- **后台不部署。** Keystatic 是 local 模式，只在 `pnpm dev` 里存在 ——
  公网上没有 `/keystatic` 这个地址。
- **一次发版要过四道关**（发布闸 → 稿件体检 → `pnpm test` → `astro check`），
  在 pre-commit 和构建链上各卡一次。这一份只讲 Cloudflare 那一侧；
  关卡本身见 [release.md](release.md)。

## 1. 日常发一篇

```bash
pnpm dev
```

1. 开 <http://localhost:4321/keystatic> → **研究稿** 或 **问答** → Add
   （问答：标题填**问题**，正文粘**回答**，「哪个智能体答的」必选 ——
   没选的话构建期会被拦下来，见 [content-model.md](content-model.md)）
2. 正文框里**直接粘 Gemini 的输出**（裸 Markdown 就行，它会自己转成标题、表格、列表）
3. 右边填：标题 / 摘要 / 发布时间 / 标的代码。**地址不用管** ——
   它自动填成全站统一的下一个号（`/r/1008`），判据在 `src/config/entryNo.ts`
4. Create
5. 提交推送 —— 两条路，走的是同一条闸：

   - **后台左侧菜单底部的「提交推送」**（【2026-09-20 加】，【2026-09-21】从右下角挪进菜单）
     → 打开 <http://localhost:4321/_publish>，
     先看清单（只带内容：稿子、后台粘的图、智能体与模型登记表；代码改动单独列出、不碰），
     改一下提交信息，点「提交并推送」。pre-commit 照跑，拦下就不提交、把话原样摊出来。
   - 终端：

     ```bash
     git add src/content && git commit -m "TSLA 三季度点评" && git push
     ```

pre-commit 会在这一步扫一遍即将提交的内容（[gate.md](gate.md) 第 2 节）。
推上去之后 Cloudflare 自己构建，构建时闸门还会再全量查一遍。

> ⚠ **`pubDatetime` 是 UTC**（`2026-09-18T00:30:00.000Z`），而站上按**北京时间**显示，
> 两者差 8 小时（后台那两格填的就是北京时间，存盘时自动换算）。
> 手写 frontmatter 时把手表上的读数直接抄成 `...Z`，正好得到一条 8 小时后的未来稿 ——
> 写成未来时间的稿子在 `pnpm dev` 里看得见、
> `pnpm build` 里页面根本不生成，而且构建是绿的（[engineering-notes.md](engineering-notes.md) 坑 1）。

## 2. 第一次部署

### 2.1 仓库

`origin` 指向你自己的**私有**仓库：`git remote add origin <你的私有仓库地址>`。

推之前到 GitHub 确认两件事：**Visibility = Private**，且是**空仓**（没有建仓时自动
生成的 README / .gitignore，否则首次 push 会撞上不相干的历史）。

> 为什么必须私有：git 型后台是"先落盘、再构建"，内容在 `git push` 那一刻就进了仓库。
> 闸门站在它后面 —— 只有当公开的东西仅仅是构建产物时，这个结构才成立。

首次提交是**全量入库**，和第 1 节日常发稿那条 `git add src/content` 不是一回事
（照搬会漏掉全部构建配置）：

```bash
git add -A && git commit -m "初始提交" && git push origin main
```

⚠ 两件只有这一次机会做、之后要重写历史才能改的事：

- **提交身份**。`.git/config` 里没有 `[user]` 覆盖的话走全局默认，邮箱会永久嵌进
  commit 头。站的公开面是化名的（`author: 牢玩家`、`socials: []`、关掉了 editPost），
  身份要对得上就在**提交之前**设仓库内覆盖：
  `git config user.email "<GitHub noreply 地址>"`。
  注意 `.git/config` 不进版本控制，换台机器 clone 会**静默**退回全局默认。
- **`.gitignore`**。首次提交一把抓全部 untracked，忽略规则在这一刻定型。

pre-commit 这一步不用额外处理：`core.hooksPath` 已指向 `scripts/hooks`，而
`check-staged.ts` 读的是 `git diff --cached` + `git show :<path>`，**都不引用 HEAD**
—— 零 commit 的仓库（unborn 分支）上闸门照常跑，实测过。

### 2.2 接到 Cloudflare

Cloudflare 控制台 → Workers & Pages → **Create** → **Workers** → **Import a repository**，
选那个私有仓库。

> ⚠ **别走 Pages 的 Connect to Git。** 两个入口都在 Workers & Pages 这一页下面，长得很像。
> 走了 Pages 的话 `wrangler.jsonc` **整个不被读取**（缺 `pages_build_output_dir` 时
> Cloudflare 只给一条 warning），`not_found_handling: "404-page"` 失效 —— 404 落到
> Cloudflare 的白页而不是站内那张中文 404。而站照常构建、照常能访问，
> **界面上和"部署对了"长得一模一样**。第 0 节选 Workers 那个决定就这么静默地没发生。

构建设置（Settings > Build，字段名对照
[官方文档](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)）：

| 项 | 值 |
|---|---|
| Build command | `pnpm build` —— **只能逐字是这个**，见下 |
| Deploy command | `npx wrangler deploy`（默认值，别清空。**这一步才是真正把站发出去的动作**） |
| Build variables | **不用填**，见下 |

**没有「构建输出目录」这一栏，这是正常的。** Workers Builds 的字段只有 Git account /
Git repository / Git branch / Build command / Deploy command / Non-production branch
deploy command / Root directory / API token / Build variables。发哪个目录由
[`wrangler.jsonc`](../wrangler.jsonc) 的 `assets.directory`（`./dist`）决定。
**找不到那一栏不是你填错了** —— 去 Pages 里找就会掉进上面那个坑。

**版本不用填 —— Cloudflare 自己从 `package.json` 探测。**【2026-09-18 首次部署实测】
构建日志第一行：

```
Detected the following tools from environment: nodejs@22.23.2, pnpm@9.15.9
```

`pnpm@9.15.9` 来自 `packageManager` 字段，`nodejs@22.23.2` 来自 `engines.node` 的
`>=22.12.0`（镜像预装 22.23.2 和 24.18.0 两个版本，默认是 24.18.0，这里它选了满足
约束的 22.23.2）。随后 `pnpm install --frozen-lockfile` 报 `Lockfile is up to date`。

⚠ 官方 build-image 文档只列了「默认版本 + 环境变量/版本文件覆盖」，**没写它会从
`package.json` 探测**。照着文档推会以为要手填 `PNPM_VERSION`（否则用镜像默认的
pnpm 10.11.1）—— 实测不需要。要钉死版本仍然可以填，但那是加固，不是必填项。

`NODE_ENV` 不在 Cloudflare 默认注入的变量里（默认只有 `CI` / `WORKERS_CI*`），
**也别自己加** —— 加了 `NODE_ENV=production`，pnpm 会跳过 devDependencies，
而 `astro` / `tsx` / `pagefind` / `@astrojs/check` 全在那里面，构建链第一步就炸。
（首次部署的日志里 devDependencies 那一段列全了，确认没被跳过。）

`wrangler.jsonc` 已经在仓库里了（纯静态、没有 Worker 脚本）。

#### 构建命令是发布闸在部署侧**唯一**的挂载点

`pnpm build` 的第一步就是发布闸 —— 命中就构建失败，这一版发不出去
（已经发过的话站上留着上一个版本；首次部署则是站还不存在）。

但要说清楚这道闸"绕不过"的**前提**：绕不过的是仓库里那条 `build` 脚本的顺序
（`scripts/gate/coverage.test.ts` 有一条测试钉着它），**不是控制台里这一行字符串**。
那一行不在仓库里、没有版本、没人 review。把它改成 `astro build`
= 发布闸就此消失，而站照常发布、构建全绿，**仓库里没有任何东西能发现这件事**。

唯一的旁证是站内搜索：改成 `astro build` 会同时丢掉 `pagefind --site dist` 那一步，
`/search` 会明着坏掉。

### 2.3 手动部署（不接 Git 的话）

```bash
npx wrangler login          # 只有第一次要，会开浏览器走 OAuth
pnpm build && npx wrangler deploy
```

⚠ **那个 `&&` 不是排版。** 写成两行、整块粘进 shell 的话，闸门拦下来（非零退出）之后
第二行照常执行 —— `wrangler` 发的是磁盘上留着的**上一次** `dist/`，而且印的是成功。
症状是「以为发了新稿，其实发的是旧站」。`scripts/` 里没有任何东西检查产物
（见 `package.json` 里 `//build` 注释第 ② 条）。

⚠ **这条路和 2.2 的「绕不过」不是一回事。** 它把第 ③ 道闸从 Cloudflare 挪回了本机，
本机的东西都是可跳过的。`wrangler` 也不在 `package.json` 里，`npx` 每次现拉一个
不固定版本 —— 要长期走这条路就 `pnpm add -D wrangler` 钉住
（顺带让 `wrangler.jsonc` 第一行那个 `$schema` 真的有东西可指，它现在指着一个
不存在的文件、编辑器校验是哑的）。

### 2.4 域名

正式域名是 **`lwj.ai`**，已经写死在
[`astro-paper.config.ts`](../astro-paper.config.ts) 里。

**域名要在第一次构建之前定死，不是绑完再补。** 它是构建期烤进产物的，先用临时地址
发一版再换，等于让已经被搜索引擎和社交平台抓走的那一版全指向临时地址。

要改域名，**两处都要改**，它们是两个独立的字符串：

| 字段 | 进到哪 | 改漏了的症状 |
|---|---|---|
| `site.url` | canonical · `og:url` · `og:image` · RSS 的 channel link 和每条 `guid` · sitemap 每条 `<loc>` · robots.txt 的 `Sitemap:` 行 | 站照常打开，只有分享卡片 / 阅读器 / 搜索引擎收录的是另一个地址 |
| `site.profile` | JSON-LD 的 `author[0].url`（`src/layouts/PostLayout.astro`） | **零症状**。canonical 和 og 全对、页面全对，只有结构化数据里作者链接指着旧主机 |

改完必须**重新构建**才生效。接 Git 那条路 push 之后 Cloudflare 自己重建；
走 2.3 手动路径的话 `wrangler deploy` **不会**重新构建，必须先 `pnpm build`。

改完这样验（数字必须是 0）：

```bash
grep -rl "<旧域名>" dist | wc -l
```

> ⚠ 部署完先拿到的是 `laowanjia.<账号>.workers.dev`，而产物里的 canonical 已经是
> `lwj.ai`。**在域名绑好之前别把 workers.dev 那个链接分享出去** —— 分享出去的卡片
> 会指向一个还打不开的地址。绑域名要求 `lwj.ai` 已经作为 zone 托管在同一个
> Cloudflare 账号下（NS 指过去）。位置：Workers → 你的 Worker → Settings →
> Domains & Routes。口径要和配置**逐字节一致**（`https`、末尾斜杠、带不带 `www`）。

境外域名不用备案。国内直连 Cloudflare 的速度不稳，这是选境外那条路时就接受的代价。

### 2.5 ⚠【2026-09-18 踩到】绑完域名，明文 HTTP **不会自己跳** HTTPS

症状：Chrome 地址栏挂着「不安全」，而页面完全正常地渲染出来了。

第一反应一定是"证书还没签好"。**不是。** 实测：

```
https://lwj.ai/  → 200，ssl_verify_result: 0（证书有效）
http://lwj.ai/   → 200，num_redirects: 0   ← 问题在这
```

证书早就签好了，HTTPS 那条路一直是通的。真正发生的是：**Cloudflare 默认不做
HTTP→HTTPS 跳转**，明文请求它就明文响应。而浏览器地址栏里敲 `lwj.ai` 不带协议时
走的是 `http://`，于是每一个第一次访问的人看到的都是「不安全」。

**这个开关不在仓库里**，测试、构建、`wrangler deploy` 全都发现不了它 ——
和红线 3 末尾那条「Cloudflare 控制台里的构建命令」同一个形态：
**没有版本、没人 review、只能靠人守**。

> 位置：Cloudflare → 选 `lwj.ai` 域 → **SSL/TLS → Edge Certificates →
> `Always Use HTTPS`** 打开。

打开后这样验，必须看到 `301` 和 `location: https://`：

```bash
curl -sS -o /dev/null -D - http://lwj.ai/ | grep -iE "^HTTP/|^location:"
```

**HSTS（同一页上的 `Enable HSTS`）先别开。** 它是单向门 —— 浏览器会把
「这个域只准走 HTTPS」按 `max-age` 缓存住，**清不掉**。证书出问题、域名要临时降级、
或者哪天想把某个子域挪去别处走明文，在 `max-age` 到期前全都做不到，而且是**在用户那一侧**
生效，你改服务端也救不回来。等站稳定跑过一段再考虑，要开也从小 `max-age` 起步。

### 2.6 让搜索引擎找到它

【2026-09-20】域名绑上两天，Google 搜「牢玩家」「牢玩家AI」「lwj.ai」都是空的。
**这不是页面写得不好，是没人告诉过 Google 这个站存在。** 一个零外链的新域名，爬虫不会
自己撞上来；就算撞上，从抓取到出现在结果里也要几天到几周。

仓库里能做的都已经在了（每页 title / description / canonical / OG；文章页 og:type=article +
JSON-LD；首页一份 WebSite 结构化数据带站名别名 `site.alternateNames`；robots.txt 指向
`/sitemap.xml`；每条 `<lastmod>` 取内容自己的修改时间、没有可靠时间就不印；
`/search` noindex 且不进 sitemap；老地址的跳转页也不进 sitemap；
钉子在 `scripts/gate/seo.test.ts` 和 `scripts/gate/sitemap.test.ts`）。
剩下三步**只有人能做**，缺一步都等于没做：

1. **验证 Search Console**：<https://search.google.com/search-console> → 添加资源 →
   「网址前缀」填 `https://lwj.ai/`。验证方式选「HTML 标记」，把它给的
   `content="…"` 里那串填进 `astro-paper.config.ts` 的 `site.googleVerification`，
   提交推送、等 Cloudflare 构建完，再回去点「验证」。
   - 这串**不是密钥**，进仓库没事 —— 它只证明"能改这个站的人认领了它"。
   - ⚠ **别填进 `.env`**：`.env*` 在 .gitignore 里，Cloudflare 的构建机上没有这个文件，
     线上页面里就没有那条 meta，验证永远失败，而本机 `pnpm dev` 看着是好的。
     真要走环境变量，去 Cloudflare 控制台的 Variables 里加 `PUBLIC_GOOGLE_SITE_VERIFICATION`。
   - 选「网域」那种验证要去 DNS 加一条 TXT，也行，效果一样。
2. **提交 sitemap**：Search Console → 站点地图 → 填 `https://lwj.ai/sitemap.xml`。
   - 【2026-09-22】这个地址**在那之前是 404** —— `@astrojs/sitemap` 只会写
     `sitemap-index.xml`，凑不出一个不带后缀的名字（它只有 `filenameBase` 一个选项）。
     现在构建期多抄一份同名产物，判据在 `src/config/sitemap.ts`，
     robots.txt 和每一页 `<head>` 里那条 `<link rel="sitemap">` 读的是同一个常量。
   - 老地址 `sitemap-index.xml` **照旧是好的**，已经提交过的那一条不用动
     （它就是这一份的源文件，两边逐字节相同）。
   - ⚠ 这一条是**仓库外的那一半**：没有任何测试能发现你在控制台里填错了地址，
     同 2.2 那行构建命令。填完回来 `curl -I https://lwj.ai/sitemap.xml` 看一眼
     是不是 `200` ＋ `content-type: application/xml`。
3. **请求编入索引**：网址检查 → 粘 `https://lwj.ai/` → 「请求编入索引」。头几周每篇新稿
   都值得这么点一次，之后爬虫会自己按 sitemap 来。

顺手两件：
- Bing Webmaster Tools（<https://www.bing.com/webmasters>）可以一键从 Search Console 导入。
  DuckDuckGo、Yahoo 用的是 Bing 的索引。
- X 账号简介和 Telegram 频道简介里挂上 `https://lwj.ai/`。这是这个站眼下**仅有的外链来源**，
  爬虫顺着它们来，而且外链是排名的一部分 —— 站内什么都替代不了它。

看收录了没有：Google 搜 `site:lwj.ai`。有结果 = 收录了；没结果 ≠ 出错，只是还没轮到。
收录之后搜「牢玩家」还排不到前面是另一回事 —— 那要靠时间和外链，不是仓库里的活。

## 3. 想用手机发稿的话

现在这套做不到 —— 后台只在本机的 `pnpm dev` 里。要手机发稿得换成 Keystatic 的
**GitHub 模式**，代价是一整套：

1. `keystatic.config.ts` 的 `storage` 从 `{ kind: "local" }` 换成
   `{ kind: "github", repo: "你/laowanjia" }`
2. 建一个 GitHub App 走 OAuth，配 `KEYSTATIC_GITHUB_CLIENT_ID` 等一串密钥
3. 装 `@astrojs/cloudflare`，`output` 改成 `server`，`astro.config.ts` 里
   Keystatic 不能再只在 dev 挂载
4. 站从"一堆静态文件"变成"一个要维护的服务"

以及两件真正要权衡的：

- **公网上从此有一个 `/keystatic` 入口**，它后面连着你的私有仓库写权限。
- **pre-commit 那道闸失效** —— GitHub 模式是浏览器直接调 GitHub API 提交，
  本机 git 钩子根本不参与。三道闸剩两道。

不值不值得你定。现在这套的代价只是"发稿得在这台机器上"。

## 4. 访问统计

**只统计、不在站上显示数字。** 站是纯静态的，页面上要实时显示「阅读 N 次」得另加一个
能读数的端点（Worker + KV），那会让站不再是纯静态 —— 现在刻意没做。

### 4.1 首选：走自动注入（零代码）

**`lwj.ai` 已经绑上并验证可访问（2026-09-18），所以这条现在就能走，也应该走这条。**
自动注入是在边缘改写 HTML，前提是那个域名在你自己的 Cloudflare 区里并且被代理 ——
`lwj.ai` 满足，早先那个 `laowanjia.<账号>.workers.dev` 不满足（`workers.dev`
不是你添加的区），所以 4.2 那条手动路是**当时**唯一能用的，现在不是了。

1. Cloudflare 后台 → **Analytics & Logs → Web Analytics → Add a site**
2. 填 `lwj.ai`，打开开关
3. **`.env` 里的 `PUBLIC_CF_BEACON_TOKEN` 保持留空**（本来就没填过）——
   填了就是下面那条"双计"

Cloudflare 会在边缘往 HTML 里插 beacon，仓库一个字节都不用改。
拿到的是：日活 / UV / PV / 热门页面 / 来源 / 国家。无 cookie，不需要同意弹窗。

**怎么确认它真的生效了**（不要靠"我在后台点过了"）：

```bash
curl -sS https://lwj.ai/ | grep -c "beacon.min.js\|cdn-cgi/rum"
```

非 0 = 生效，`.env` 就别填；0 = 没生效，才退到 4.2。

> 【2026-09-18 实测】这条命令当时返回 **0**，即后台开关**还没开**。
> 同时查了线上响应头是 `Cache-Control: public, max-age=0, must-revalidate` ——
> **没有 `no-transform`**，所以下面那个已知的阻塞原因不存在，
> 开关打开之后自动注入应该直接生效。

### 4.2 手动埋点（自动注入不生效时的逃生口）

在 `.env` 里填（Cloudflare 后台「Manage site」里能复制到 token）：

```
PUBLIC_CF_BEACON_TOKEN=你的token
```

`src/layouts/Layout.astro` 会在**生产构建且 token 非空**时输出 beacon。
dev 里永远不输出 —— 不挡住的话，你每存一次盘刷新一次页面都会被算进日活。

### ⚠ 两条路不许同时开

自动注入 + 手动埋点 = **同一次访问被记两遍**，而且**两边都不报错** ——
你只会看到一份 2 倍的数字，而且找不到原因。规矩是二选一：
后台开关开着就把 `.env` 里那一行留空。

已知会让自动注入失效的一件事：响应头带 `Cache-Control: public, no-transform` 时
Cloudflare 不能改写响应体，beacon 插不进去、后台永远是 0，而页面一切正常。

### 4.3 还有一层免费的、不用脚本的

Cloudflare 的 **Workers 自带请求指标**（后台 → 你的 Worker → Metrics）：
请求数、状态码、带宽、地区分布。它是**服务端**统计，不下发任何脚本、
不碰读者的浏览器。粒度粗（按请求不按人），但它**已经在那儿了**，
你什么都不用做就能看。

## 5. 备份

内容全在 `src/content/{posts,qa,pages}/*.md`，就是 git 仓库本身。没有数据库要备份 ——
这是选 git 型后台顺带得到的好处。

`dist/` 和 `public/pagefind/` 是构建产物，都在 `.gitignore` 里，不用管。

## 6. 新稿自动推到 Telegram 频道（可选，站外的事）

站上有两种 feed，都是构建产物，不用服务端：

| 地址 | 内容 |
|---|---|
| `/rss.xml` | 全站，四个集合都在（**完整的一条**，分支不是替代） |
| `/s/<代码>/rss.xml` | 一只票的研究和问答，如 `/s/tsla/rss.xml` |

要让频道自动发新稿，接一个「RSS → Telegram」的机器人就行（Telegram 上有现成的
RSS 转发 bot，也可以在一台常开的机器上自己跑一个开源的）。仓库里**一行代码都不用改**，
也不用任何密钥进仓库 —— 密钥在 bot 那一侧。

⚠ 用第三方 bot 等于把"发到频道"这一步交给别人的服务：它挂了、慢了、重复发了，
站上零症状，只有频道里看得见。频道是单向广播（`astro-paper.config.ts` 里核实过），
bot 发进去的东西读者不能回。
