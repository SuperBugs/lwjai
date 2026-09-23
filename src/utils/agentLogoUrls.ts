/**
 * 智能体 logo 的**地址表**：`agentIcons.ts` 里那一行 → 这个 .svg 在页面上的 URL。
 *
 * 【2026-09-23 加】logo 换成品牌标文件之后（`src/assets/agent-logos/`），
 * 站上的组件和后台的预览都要知道"这个文件发出去叫什么地址"。
 * **两个消费方读这一份**：
 *   - `src/components/AgentLogo.astro`（站上三处：芯片、折叠行、详情页切换排）
 *   - `src/dev/keystaticIconPreview.ts`（后台「图标」那一格旁边的预览）
 * 各写一份 glob 的后果是：哪天挪了目录只改一处，另一处**静默**取不到图 ——
 * 站上那半会抛（见下），后台那半只是预览不见了，零报错。
 *
 * ★ 用 `?url` 不用 `?raw`：拿到的是一个地址，页面上画成 `<img src>` 或 CSS mask ——
 *   两种里的 SVG 都**不执行脚本、不发外链、没有 id 冲突**（理由见 agentIcons.ts 文件头
 *   「为什么两种都不内联」）。换成 `?raw` + `set:html` 就是把从网上拿来的 SVG 源码
 *   直接塞进每一页，`agentIcons.test.ts` 的 D 组钉着这件事。
 * ★ 构建出来是 `/_astro/<名>.<hash>.svg`（内容寻址，缓存永远不会拿到旧图）；
 *   dev 里是 `/src/assets/agent-logos/<名>.svg`。
 * ⚠【2026-09-23 实测踩到】**`&no-inline` 是承重的**。光写 `?url` 时，Vite 把 4 KB 以下的
 *   资源（这里 20 个里有 19 个）直接内联成 `data:image/svg+xml,…`，而它编码 SVG 时属性用的
 *   是**单引号**（`fill='currentColor'`）—— 单色那几个的 CSS mask 写成 `url('…')` 就被
 *   提前截断，整条 `mask` 声明作废，那一格画成一块**纯色方块**（屏幕上 ChatGPT 那一格
 *   就是这么变成灰方块的）。彩色那几个走 `<img src>`，照常显示 —— 只坏一半，零报错。
 *   现在两道都守着：这里不内联（每页不再重复塞十几份同样的 SVG 源码，浏览器也能缓存），
 *   mask 那条 CSS 由 `logoMaskStyle()` 转义着拼（agentIcons.ts，有单测）。
 *
 * ⚠ **这个文件只能被 Vite 加载**（Astro 组件、keystatic.config.ts 那一路）：
 *   `import.meta.glob` 是 Vite 的编译期语法，裸 tsx 里没有。scripts/ 和测试里别 import 它 ——
 *   测试要对账就直接读 `AGENT_LOGO_DIR` 那个目录（同 docs/engineering-notes.md 坑 18 的第①条）。
 * ⚠ glob 的路径**必须是字面量**（Vite 在编译期展开它，变量拼不进去），
 *   所以这里写死了一份 `/src/assets/agent-logos/*.svg` —— 它和 `AGENT_LOGO_DIR` 是一对，
 *   测试钉着两者一致。
 */
import { AGENT_LOGO_DIR, type AgentIcon } from "../config/agentIcons";

const URLS = import.meta.glob<string>("/src/assets/agent-logos/*.svg", {
  eager: true,
  query: "?url&no-inline",
  import: "default",
});

/**
 * 这个 logo 在页面上的地址。
 *
 * ★ **找不到就抛**，不返回空串：表里登记了一行而文件不在，空串画出来是一个
 *   看不见的 `<img>`（或者一块纯色方块，mask 那一档）—— 那一条的出处记号就这么没了，
 *   而构建、类型检查、闸门四处全绿。抛了之后是构建期当场红，报错里指得出是哪个文件。
 *   （`agentIcons.test.ts` 的 A2 在 `pnpm test` 那一步就会先红一次，这里是第二道。）
 */
export function agentLogoUrl(icon: AgentIcon): string {
  const url = URLS[`/${AGENT_LOGO_DIR}/${icon.file}`];
  if (!url) {
    throw new Error(
      `智能体 logo「${icon.id}」登记的文件 ${AGENT_LOGO_DIR}/${icon.file} 不存在 —— ` +
        `要么是文件名拼错了，要么是文件被删了（src/config/agentIcons.ts 里那一行还在）。`
    );
  }
  return url;
}
