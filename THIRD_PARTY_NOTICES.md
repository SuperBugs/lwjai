# 第三方声明

本仓库包含以下第三方文件。通过包管理器安装的依赖不在此列，其许可见各自的软件包
（satori 为 MPL-2.0，sharp 与 TypeScript 为 Apache-2.0，其余多为 MIT）。

## AstroPaper

- 来源：<https://github.com/satnaing/astro-paper>
- 用途：站点主题基础，保留原有目录结构与命名以便对照上游
- 许可：MIT，Copyright (c) 2023 Sat Naing，全文见 [LICENSE](LICENSE)

## Tabler Icons

- 来源：<https://github.com/tabler/tabler-icons>
- 用途：`src/assets/icons/*.svg`（界面图标，随 AstroPaper 引入）
- 许可：MIT，Copyright (c) 2020-2024 Paweł Kuna

## LobeHub Icons

- 来源：npm 包 `@lobehub/icons-static-svg@1.95.1`（<https://github.com/lobehub/lobe-icons>）
- 用途：`src/assets/agent-logos/*.svg`，未经修改，用于标注内容所属的 AI 产品
- 许可：MIT，Copyright (c) 2023 LobeHub

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

上述标识为 Google、OpenAI、Anthropic、DeepSeek、阿里云、字节跳动、月之暗面、智谱、MiniMax、Mistral、
Meta、Perplexity、xAI、Manus、GitHub、Cursor 等公司的商标。MIT 许可仅适用于 SVG 文件本身，不授予任何商标权。
本项目使用这些标识仅为标注内容来源，不代表上述公司认可、赞助或参与本项目。

## 字体

以下字体于构建时从 Google Fonts 获取，不包含在本仓库中：

- Google Sans Code：SIL Open Font License 1.1
- Noto Sans SC（分享图中文，按需取子集）：SIL Open Font License 1.1

正文使用读者系统自带的中文字体。
