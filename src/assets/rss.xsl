<?xml version="1.0" encoding="UTF-8"?>
<!--
  点开 /rss.xml 时浏览器渲染的那一页。

  为什么存在：页脚那条链接写着「RSS 订阅」，点下去在浏览器里是一屏 XML，
  顶上还压着一行英文（"This XML file does not appear to have any style
  information associated with it."）—— 对不用阅读器的读者，这和点坏了一个
  链接长得一模一样。**能用但看起来像坏了**，和「投稿入口不许一个字都不提」
  是同一条纪律的轻一档：入口没消失，但它自己说不清自己是什么。

  ★ 它只影响**浏览器**。阅读器不执行 XSL，拿到的还是原来那份 XML，
    一个字节都没变 —— 所以这一层再怎么改也伤不到订阅者。

  ★ 两条 feed（/rss.xml 和 /s/<代码>/rss.xml）共用这一份。

  ⚠ 引用它的路径必须是**根绝对**的 `/rss.xsl`：分支 feed 在 /s/<代码>/ 下面，
    写成相对路径会去取 /s/<代码>/rss.xsl → 404 → 浏览器**静默**回落到裸 XML。
    零报错，而且主 feed 看起来完全正常。钉子在 scripts/gate/feed.test.ts。

  ⚠ **它不在 `public/`，别"顺手"挪回去**（那儿看起来才是静态文件该待的地方）。
    【2026-09-21 实测】Astro 7 的 rolldown 会把 `public/` 下**扩展名不认识**的文件
    当 JS 模块解析：放一份 .xsl 进去，`astro build` 当场红在
    `[PARSE_ERROR] Unexpected JSX expression ╭─[ public/rss.xsl:1:1 ]` ——
    拿 `public/probe2.zzz` 试过，随便什么扩展名都一样，和内容无关。
    现在它由 `src/pages/rss.xsl.ts` 用 `?raw` 读进来再发出去，地址仍然是 /rss.xsl。
    这条至少是**响的**（构建直接失败），不是那种零症状的坑。

  ⚠ **这一页上不印时间。** 站上每一个时间都是北京时间（`site.timezone` +
    `t.post.timezoneLabel` 那一对），而 RSS 的 <pubDate> 是 RFC822 的 GMT
    英文串（`Mon, 21 Sep 2026 11:44:00 GMT`）。XSLT 1.0 里做 UTC→北京 的换算
    要自己处理月名、跨日、跨月、闰年，而且它跑在浏览器里、现有的 node 测试
    一条都钉不住它 —— 在一个"时间决定这篇写在盘前还是盘后"的站上，
    与其印一个没人能验的第三套时间，不如不印。条目点进去就是带时间的正式页面。

  ⚠ 复制按钮【2026-09-21 用户要的】**由脚本自己解除 hidden**，markup 里默认不可见。
    脚本能不能在 XSLT 的结果树里执行取决于浏览器，剪贴板 API 还要安全上下文 ——
    写成默认可见的话，跑不了的那台机器上就是一个"按了没反应"的按钮
    （和右下角那个圆钮同一条教训）。跑不了时这一页退回"一行可以直接选中的地址"，
    那一档本来就是好用的。**宁可没有按钮，也不要一个死按钮。**
    钉子在 feed.test.ts：按钮必须带 hidden，且脚本里必须有解除它的那一行。

  ⚠ 地址是从 feed 自己的 <atom:link rel="self"> 读的，**不是拼出来的**：
    分支 feed 的地址（/s/orcl/rss.xml）没法从 <channel><link> 推出来。
    那一条取不到时走下面的 xsl:otherwise，说一句实话，不编一个地址出来。
-->
<xsl:stylesheet
  version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns="http://www.w3.org/1999/xhtml"
>
  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes" />

  <xsl:template match="/">
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <!-- 这一页是订阅地址的说明书，不该被搜索引擎收成一个页面。 -->
        <meta name="robots" content="noindex, follow" />
        <title>
          <xsl:value-of select="/rss/channel/title" />
          <xsl:text> · RSS 订阅源</xsl:text>
        </title>
        <style>
          /* 配色跟 src/styles/theme.css 的两档取值一致（中性黑白灰、没有主色）。
             这一页独立于站点样式表：它是浏览器直接取的静态文件，
             进不了构建管线，也拿不到那些带哈希的 CSS。 */
          :root {
            --bg: #f5f5f7;
            --surface: #ffffff;
            --fg: #1d1d1f;
            --muted-fg: #6e6e73;
            --muted: #e8e8ed;
            --border: #d2d2d7;
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --bg: #16161a;
              --surface: #1e1e23;
              --fg: #f0f0f3;
              --muted-fg: #a3a3a9;
              --muted: #2a2a30;
              --border: #33333a;
            }
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 2.5rem 1.25rem 4rem;
            background: var(--bg);
            color: var(--fg);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text",
              "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI",
              "Microsoft YaHei", "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;
            line-height: 1.75;
            -webkit-text-size-adjust: 100%;
          }
          .wrap { max-width: 46rem; margin: 0 auto; }
          a { color: inherit; }
          h1 {
            font-size: 1.5rem;
            line-height: 1.4;
            margin: 0 0 0.25rem;
            letter-spacing: -0.01em;
          }
          .sub { color: var(--muted-fg); font-size: 0.9375rem; margin: 0 0 2rem; }
          .card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 0.75rem;
            padding: 1.25rem 1.5rem;
            margin-bottom: 2rem;
          }
          .card h2 { font-size: 1.0625rem; margin: 0 0 0.5rem; }
          .card p { margin: 0.5rem 0; }
          .addrrow {
            display: flex;
            align-items: stretch;
            gap: 0.5rem;
            margin: 0.75rem 0 0.25rem;
          }
          .addr {
            flex: 1 1 auto;
            min-width: 0;
            padding: 0.75rem 0.875rem;
            background: var(--muted);
            border-radius: 0.5rem;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 0.9375rem;
            word-break: break-all;
            /* 没有脚本时这一格仍然好用：点一下整条选中。 */
            user-select: all;
          }
          .copy {
            flex: 0 0 auto;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 2.75rem;
            background: var(--surface);
            color: var(--muted-fg);
            border: 1px solid var(--border);
            border-radius: 0.5rem;
            cursor: pointer;
            padding: 0;
            font: inherit;
          }
          .copy:hover { color: var(--fg); border-color: var(--muted-fg); }
          .copy .i { width: 1.125rem; height: 1.125rem; }
          .copy .i-done { display: none; }
          .copy.copied { color: var(--fg); }
          .copy.copied .i-copy { display: none; }
          .copy.copied .i-done { display: block; }
          .hint { color: var(--muted-fg); font-size: 0.875rem; }
          ol { margin: 0.5rem 0 0; padding-left: 1.25rem; }
          ol li { margin: 0.375rem 0; }
          h2.section {
            font-size: 1.0625rem;
            margin: 0 0 0.75rem;
            padding-bottom: 0.625rem;
            border-bottom: 1px solid var(--border);
          }
          .count { color: var(--muted-fg); font-weight: normal; font-size: 0.9375rem; }
          .item {
            padding: 1rem 0;
            border-bottom: 1px solid var(--border);
          }
          .item:last-child { border-bottom: 0; }
          .item a {
            font-weight: 600;
            text-decoration: none;
            border-bottom: 1px solid transparent;
          }
          .item a:hover { border-bottom-color: currentColor; }
          .item p {
            margin: 0.3125rem 0 0;
            color: var(--muted-fg);
            font-size: 0.9375rem;
          }
          .empty { color: var(--muted-fg); padding: 1rem 0; }
          footer {
            margin-top: 2.5rem;
            padding-top: 1.25rem;
            border-top: 1px solid var(--border);
            color: var(--muted-fg);
            font-size: 0.875rem;
          }
        </style>
      </head>
      <body>
        <div class="wrap">
          <h1>
            <xsl:value-of select="/rss/channel/title" />
            <xsl:text> · RSS 订阅源</xsl:text>
          </h1>
          <p class="sub">
            <xsl:value-of select="/rss/channel/description" />
          </p>

          <div class="card">
            <h2>订阅地址</h2>
            <xsl:choose>
              <xsl:when test="/rss/channel/atom:link[@rel='self']/@href">
                <div class="addrrow">
                  <code class="addr" id="addr">
                    <xsl:value-of select="/rss/channel/atom:link[@rel='self']/@href" />
                  </code>
                  <!--
                    ⚠ 默认 `hidden`，**由底下那段脚本自己解除**。
                    XSLT 结果树里的脚本能不能跑取决于浏览器，剪贴板 API 还要安全上下文 ——
                    写成默认可见的话，跑不了的那台机器上就是一个按了没反应的按钮
                    （和右下角那个圆钮同一条教训）。跑不了时这儿只剩左边那行地址，
                    它本来就是可以直接选中复制的（.addr 的 user-select: all）。
                  -->
                  <button
                    type="button"
                    id="copy"
                    class="copy"
                    hidden="hidden"
                    title="复制订阅地址"
                    aria-label="复制订阅地址"
                  >
                    <svg
                      class="i i-copy"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.7"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="9" y="9" width="11" height="11" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <svg
                      class="i i-done"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.9"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </button>
                </div>
                <!--
                  写入被拒绝时才出现的那一句（见脚本里的 fallback）。默认 hidden —— 它
                  说的是"刚才那一下没成，但地址已经替你选中了"，平时挂在那儿就是噪音。
                -->
                <p class="hint" id="copyhint" hidden="hidden">
                  已替你选中，按 Ctrl+C（Mac 上 ⌘+C）复制。
                </p>
              </xsl:when>
              <xsl:otherwise>
                <p class="hint">
                  地址就是你现在浏览器地址栏里的那一条。
                </p>
              </xsl:otherwise>
            </xsl:choose>
            <ol>
              <li>装一个阅读器：Feedly、Inoreader、Folo、NetNewsWire、Reeder
                都行（网页版和手机 App 都有，也都有免费档）。</li>
              <li>在里面找「添加订阅 / Add feed / ＋」，把上面那个地址粘进去。</li>
              <li>粘站点主页（<xsl:value-of select="/rss/channel/link" />）通常也能认出来
                —— 页面里写着这份订阅源在哪。</li>
            </ol>
            <p class="hint">
              不想装阅读器就不用管这一页，直接收藏站点主页即可。
            </p>
          </div>

          <h2 class="section">
            <xsl:text>这份订阅源里的内容 </xsl:text>
            <span class="count">
              <xsl:text>（</xsl:text>
              <xsl:value-of select="count(/rss/channel/item)" />
              <xsl:text> 条，新的在前）</xsl:text>
            </span>
          </h2>
          <xsl:choose>
            <xsl:when test="/rss/channel/item">
              <xsl:for-each select="/rss/channel/item">
                <div class="item">
                  <a href="{link}">
                    <xsl:value-of select="title" />
                  </a>
                  <xsl:if test="description">
                    <p><xsl:value-of select="description" /></p>
                  </xsl:if>
                </div>
              </xsl:for-each>
            </xsl:when>
            <xsl:otherwise>
              <!-- 一条都没有和"没渲染出来"必须长得不一样。 -->
              <p class="empty">这份订阅源目前一条内容都没有。</p>
            </xsl:otherwise>
          </xsl:choose>

          <!--
            复制按钮的全部行为。★ 它做的第一件事是**把按钮从 hidden 里放出来** ——
            脚本没跑（XSLT 结果树里的脚本执行与否取决于浏览器）、或者剪贴板 API
            不在（非安全上下文、老浏览器），按钮就一直不出现，页面退回"一行可选中的
            地址"那一档。**宁可没有按钮，也不要一个按了没反应的按钮。**
            ⚠ 这段里刻意不写 `&lt;` `&gt;` `&amp;`（所以没有箭头函数、没有 `&amp;&amp;`）：
              它是 XML 的文本节点，那三个字符要转义，转义之后读起来就不是 JS 了。
          -->
          <script>
            (function () {
              var btn = document.getElementById("copy");
              var box = document.getElementById("addr");
              var hint = document.getElementById("copyhint");
              if (!btn) return;
              if (!box) return;
              if (!navigator.clipboard) return;
              if (!navigator.clipboard.writeText) return;
              btn.hidden = false;

              function label(text) {
                btn.title = text;
                btn.setAttribute("aria-label", text);
              }

              function ok() {
                btn.className = "copy copied";
                label("已复制");
                setTimeout(function () {
                  btn.className = "copy";
                  label("复制订阅地址");
                }, 1600);
              }

              /*
               * ★ 写入被拒绝的那一档。【2026-09-21 实测】
               *   `navigator.clipboard.writeText` 存在**不代表**调用会成功：在这个站的
               *   本机预览里它当场 `NotAllowedError: Write permission denied`
               *   （嵌入式浏览器、企业策略、浏览器设置都可能拒）。
               *   没有这一段的话按钮按下去**静默什么都不发生** —— 能力检查挡不住它，
               *   那就是一个真正的死按钮，而且零报错。
               *   这一档替读者把地址选中，再说一句怎么办：成功 / 失败 / 按钮根本不出现，
               *   三者在屏幕上长得不一样。
               */
              function fallback() {
                try {
                  var range = document.createRange();
                  range.selectNodeContents(box);
                  var sel = window.getSelection();
                  sel.removeAllRanges();
                  sel.addRange(range);
                } catch (e) {}
                if (hint) hint.hidden = false;
                label("已选中，按 Ctrl+C 复制");
              }

              btn.addEventListener("click", function () {
                try {
                  navigator.clipboard.writeText(box.textContent.trim()).then(
                    ok,
                    fallback
                  );
                } catch (e) {
                  fallback();
                }
              });
            })();
          </script>

          <footer>
            <a href="{/rss/channel/link}">
              <xsl:text>← 回到 </xsl:text>
              <xsl:value-of select="/rss/channel/title" />
            </a>
          </footer>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
