# 第三方声明

这个仓库里**原样再分发**了下面几样别人的东西，各自的许可如下。
通过包管理器安装的依赖（`node_modules/` 里的）不在这里列，它们的许可在各自的包里 ——
其中 satori 是 MPL-2.0、sharp 和 TypeScript 是 Apache-2.0，其余绝大多数是 MIT。

## AstroPaper

- 来源：<https://github.com/satnaing/astro-paper>
- 用途：这个站的底子。目录结构和命名刻意保留，方便对照上游合并。
- 许可：MIT，Copyright (c) 2023 Sat Naing。全文见根目录的 [LICENSE](LICENSE)。

## Tabler Icons

- 来源：<https://tabler.io/icons>（<https://github.com/tabler/tabler-icons>）
- 用途：`src/assets/icons/*.svg`（界面图标，随 AstroPaper 带进来）。
- 许可：MIT，Copyright (c) 2020-2024 Paweł Kuna。

## LobeHub Icons

- 来源：npm 包 `@lobehub/icons-static-svg@1.95.1`（<https://github.com/lobehub/lobe-icons>）
- 用途：`src/assets/agent-logos/*.svg`，**字节未改**、钉死版本。用来标注一条内容是哪个 AI 产品写的。
- 许可：MIT，Copyright (c) 2023 LobeHub。

```
MIT License

Copyright (c) 2023 LobeHub

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 商标

那些 logo 画的是各家公司的商标（Google、OpenAI、Anthropic、DeepSeek、阿里云通义、字节跳动豆包、
月之暗面 Kimi、智谱、MiniMax、Mistral、Meta、Perplexity、xAI、Manus、GitHub Copilot、Cursor 等）。
MIT 许可管的是这些 SVG 文件本身，**不授予任何商标权**。这里用它们只是为了标注"这一条是哪个产品写的"，
不代表这些公司认可、赞助或参与了这个项目。

## 字体

构建期从 Google Fonts 在线取，**不在这个仓库里**：

- Google Sans Code（等宽，代码和数字）—— SIL Open Font License 1.1
- Noto Sans SC（分享卡上的中文，按卡片上出现的字取子集）—— SIL Open Font License 1.1

正文用的是读者系统里自带的中文字体，不下发任何字体文件。
