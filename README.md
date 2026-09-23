# lwjai · 牢玩家

> 把每天用 AI 做的美股研究发成一个静态站 —— 同时保证**写稿人自己的仓位一个字节都发不出去**。
>
> 这是 [lwj.ai](https://lwj.ai/) 背后那套系统的开源版：**只有代码和编的样例内容**，
> 不含站上的任何真实内容。

**English summary.** lwjai is the open-source engine behind lwj.ai: an Astro static site for publishing
AI-generated stock research, with a local-only admin (Keystatic) and a three-layer _publish gate_ that
refuses to build when a draft contains first-person position / cost / size / credential statements.
This repository contains code and fictional sample content only. Docs are in Chinese.

---

## 它是什么

- **纯静态站**：Astro 7 ＋ [AstroPaper](https://github.com/satnaing/astro-paper)（改过）＋ Tailwind 4，
  部署到 Cloudflare Workers Static Assets。没有服务端、没有数据库，内容就是 git 仓库里的 Markdown。
- **后台只在本机**：Keystatic 的 local 模式，只在 `pnpm dev` 里挂载 —— 公网上没有 `/keystatic`。
- **四种内容**：研究稿（`/r`）、问答（`/q`）、教程（`/g`）、提示词（`/p`），外加单页（`/a` 关于）。
- **每一条都说清楚是谁写的**：哪个 AI 智能体（Google Spark / OpenAI ChatGPT / Anthropic Claude /
  OpenAI Codex …）＋ 底下跑的是哪个模型，或者「我自己」写的，或者「还没标」。三档在页面上长得不一样。
- **同一个问题问了几个智能体**：列表里折成一张卡，详情页标题下面一排可以切换。
- 标的索引 `/s/<代码>`、每只票一条分支 RSS、Pagefind 全文搜索、中文不出豆腐块的分享卡、
  `.md` 下载 / 复制全文 / 打印成 PDF。
- **一组只在本机的工具页**：粘贴导入（`/_import`）、发布闸预览（`/_gate`）、提交推送（`/_publish`）、
  发帖文案（`/_share`）、清理特殊字符（`/_tidy`）、封面图（`/_xhs`）。

## 最要紧的那件事：发布闸

这种站唯一一件**出了事没法补救**的事，是把自己的仓位发上公网 —— 网页被抓过一次，撤回也撤不干净。
而这一层的载荷是**人和模型写的自由文本**：你让模型研究 TSLA，它顺手写一句"结合你当前的底仓"，
这句话就躺在正文里了，没有任何字段能挡住它。

所以有三道闸，判据是同一份（`scripts/gate/`）：

|            | 在哪                    | 查什么                                               |
| ---------- | ----------------------- | ---------------------------------------------------- |
| ① 结构闸   | `src/content.config.ts` | schema 里压根没有能存成本、数量、方向的字段          |
| ② 暂存区闸 | pre-commit              | 即将被提交的那份字节（`git show :<path>`）           |
| ③ 构建期闸 | `pnpm build` 的第一步   | 工作树全量。不过就构建失败，站上留着上一个版本       |

- 判定是**三档**：没命中 / 命中意图类（warn，能发但会告诉你）/ 命中事实类（block，没有放行口，只能改文案）。
- **「没命中已知说法」不等于「安全」。** 词表必然有漏网，界面上的措辞也是这么写的。
- **闸门没有开关**：`scan()` 没有第二个参数，没有环境变量能跳过它，构建链里它排在 `astro check` 前面。
  这两件事各有一条测试钉着。

细节（为什么误伤是必然的、为什么三档不许压成两档）在 [docs/gate.md](docs/gate.md)。

## ⚠ 用它建站时，你的内容仓库必须是私有的

这个仓库能公开，是因为这里只有代码和编的样例。**拿它建你自己的站时，放内容的那个仓库必须是私有的。**

闸门的第②③道都站在"已经进了仓库"之后：git 型的后台是先落盘、再构建，内容在 push 的那一刻
就已经进了仓库。只有当公开出去的仅仅是构建产物时，这个结构才成立 ——
把内容仓库设成公开，等于把第③道闸拦下的东西在它拦之前就发了出去。
另外，**草稿不拦**（草稿不生成页面，拦下来只会让人没法存半成品）：这一条同样只在仓库私有时才是对的。

## 跑起来

需要 Node ≥ 22.12、pnpm 9。

```bash
pnpm install
pnpm hooks:install   # 装 pre-commit 那道闸，只用装一次
pnpm dev
```

- 站：<http://localhost:4321>
- 后台：<http://localhost:4321/keystatic>

⚠ **别用 `--host` 把 dev server 暴露到局域网。** 后台和那几个工具页能写盘、能 `git commit` / `push`，
它们只在 `astro dev` 里存在，而且默认只听本机。

## 改成你自己的站

1. `astro-paper.config.ts`：域名、站名、作者、社交账号（现在填的是占位）。
2. `src/data/`：智能体与模型登记表、标签表、标的表 —— 后台左侧那几页也能改。
3. 删掉 `src/content/` 下的样例（每一篇都写着「样例」）。
4. `scripts/gate/rules.ts` 里的 `internal_system`：换成你自己那套系统的服务名、库文件名、主机名。
5. `wrangler.jsonc`：Worker 的名字。Cloudflare 控制台里的构建命令必须**逐字**是 `pnpm build`
   —— 填成 `astro build` 就等于把闸门关掉，而站照常发布（[docs/deploy.md](docs/deploy.md)）。

## 常用命令

| 命令                        | 干什么                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm dev`                  | 开发服务器 ＋ 后台                                                                           |
| `pnpm build`                | 构建。前四步是**发布闸 → 稿件体检 → pnpm test → astro check**，任一步不过就中止               |
| `pnpm gate`                 | 只跑发布闸（查工作树）                                                                       |
| `pnpm gate:staged`          | 只跑发布闸（查暂存区，pre-commit 用的就是它）                                                |
| `pnpm content:check`        | 稿件体检：发出去之后会不会长歪（空正文、被吃掉的分隔线、后台编不开的裸 `<`……）                |
| `pnpm test`                 | 全部测试（构建链里也会跑）                                                                   |
| `pnpm content:import <文件>` | 把一份模型输出变成一条**草稿**，写完当场跑一遍发布闸的判据                                    |
| `pnpm content:prune --to …` | 按时间段批量删老稿。默认只列不删；删之前一定先打包备份，验不过就一个字节都不删                |
| `pnpm admin`                | 一键起管理端，并且真的查一眼它能不能用（不只是端口通、HTTP 200）                              |

## 目录

```
src/content/{posts,qa,guides,prompts,pages}/   ← 内容（这里是样例）
src/data/                                      ← 登记表：智能体与模型、标签、标的、回答排序
src/config/                                    ← 判据：集合登记、地址、出处、时区……（多数是纯函数）
src/dev/                                       ← 只在 astro dev 里挂载的后台增强和工具页
scripts/gate/                                  ← 发布闸 ＋ 绝大多数测试
scripts/content/                               ← 稿件体检、粘贴导入、批量清理
scripts/dev/                                   ← 一键起管理端
scripts/hooks/                                 ← pre-commit
docs/                                          ← 设计文档
```

## 文档

| 文档                                                       | 讲什么                                                         |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| [docs/gate.md](docs/gate.md)                               | 发布闸。动 `scripts/gate/` 之前必读                             |
| [docs/content-model.md](docs/content-model.md)             | 字段、集合、登记表。字段名是接口，改名的后果多半是零症状        |
| [docs/release.md](docs/release.md)                         | 一次发版过哪四道关、顺序为什么是那样                            |
| [docs/deploy.md](docs/deploy.md)                           | Cloudflare Workers 部署                                         |
| [docs/engineering-notes.md](docs/engineering-notes.md)     | 工作纪律和 24 个已知的坑 —— 每一条都是真踩过的                  |

## 这套代码的几条脾气

- **空状态、失败状态、"我不知道"，三者在界面上必须长得不一样。** 「扫了 0 篇」和「扫了 40 篇没命中」
  退出码不同；「还没标模型」和「人写的、没有模型」不许长得一样。
- **判据只写一处。** 同一句断言出现在两个地方、只改了一处，是这个仓库最常见的坏法。
- **测试用例从"模型真的会这么写"来**，不许照着正则反推（docs/gate.md 第 7 节那个 `SC 13D` 的故事）。
- **不许在站上编数字。** 样例内容里没有任何看起来像真实财报的数字 —— 空着比编的便宜。

## 样例内容

`src/content/` 下的每一篇都是编的，只用来展示页面长什么样：
没有真实的价格、财报数字、持仓，也不代表任何观点。测试语料里那些"我的成本在 187 左右"之类的句子
同样是编的 —— 它们只负责长得像模型真会写出来的话。

## 这个仓库怎么维护

它是一个**单向镜像**：维护者在自己的私有仓库里开发，每次同步时导出代码到这里。
欢迎提 issue 和 PR，但 PR **不会被直接合并** —— 维护者读过之后在上游重写一遍，下一次同步带过来
（所以你会看到改动出现了，但 commit 不是你那一个）。细节见 [CONTRIBUTING.md](CONTRIBUTING.md)。

安全问题请走私密渠道：[SECURITY.md](SECURITY.md)。

## 免责声明

这是一套软件。用它搭出来的站上发什么，由那个站的站长自己负责。
样例内容是编的；任何用这套代码发布的研究内容都**不构成任何投资建议、操作指导、要约或推荐**。

## 许可

[MIT](LICENSE)。基于 AstroPaper（MIT）。第三方的部分见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)；
各家 AI 产品的 logo 是其所有者的商标，只用来标注"这一条是哪个产品写的"，不代表任何背书。
