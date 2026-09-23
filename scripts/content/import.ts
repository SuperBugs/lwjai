/**
 * `pnpm content:import <file.md> [--collection posts|qa] [--agent id] [--model id] [...]`
 *
 * 把一段粘贴进来的模型输出变成一条**草稿**：摘标题、认标的、截摘要、拼 frontmatter、
 * 落盘，然后**当场过一遍发布闸**。判据在 ./importPlan.ts（纯函数，有单测）；
 * 这里只有 I/O 和屏幕上的字。
 *
 * ## 它不做什么
 *
 *   - 不发布。产出永远是 `draft: true`，人要在后台看一遍、取消草稿、提交。
 *   - 不覆盖。目标文件已存在就退出，换 `--slug`。
 *   - 不替闸门放行。闸门命中 block 档时文件照样写（它是草稿，不上公网），
 *     但退出码是 1，屏幕上是红的 —— 取消草稿之前那句话必须改掉。
 *
 * 用法：
 *   pnpm content:import ~/Downloads/tsla.md --agent spark --model gemini-3-pro --prompt stock-analysis
 *   pnpm content:import - --collection qa --agent claude --model claude-opus-5 --question-key tsla-margin < answer.md
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BLD, DIM, GRN, OFF, RED, YEL, inspect } from "../gate/inspect";
import { verdictLabel } from "../gate/scan";
import {
  ImportError,
  planImport,
  type ImportCollection,
  type ImportPlan,
} from "./importPlan";
import { existingEntryIds } from "./existingIds";
import { registerSymbols } from "./registerSymbols";

const USAGE = `用法：pnpm content:import <文件.md 或 -> [选项]

  <文件>                 模型输出的 .md；写 - 从标准输入读
  --collection posts|qa  默认 posts
  --agent <id>           哪个智能体写的 / 答的：后台「智能体与模型」页里登记的 id（spark / chatgpt / claude / codex …）或 human
  --model <id>           那个智能体底下跑的是哪个模型：同一页里登记的 id（gpt-6-pro / gemini-3-pro …）
  --slug <号>            地址里那一段；不给就自动取全站统一的下一个号（一般不用管它）
  --title <标题>         不给就取正文第一个一级标题
  --description <摘要>   不给就从第一段截 120 字（会警告）
  --symbol <代码>        显式指定标的（symbolSource: manual）
  --symbol-name <名>     公司中文名
  --prompt <id>          只有 posts：用的是哪份提示词
  --question-key <key>   只有 qa：问题组
`;

function parseArgs(argv: string[]) {
  const opts: Record<string, string> = {};
  let file: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    }
    if (a.startsWith("--")) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) {
        console.error(`${RED}${a} 后面要跟一个值${OFF}\n\n${USAGE}`);
        process.exit(2);
      }
      opts[a.slice(2)] = v;
      i++;
    } else if (file === undefined) {
      file = a;
    } else {
      console.error(`${RED}多出来一个参数：${a}${OFF}\n\n${USAGE}`);
      process.exit(2);
    }
  }
  return { file, opts };
}

const { file, opts } = parseArgs(process.argv.slice(2));
if (!file) {
  console.error(`${RED}要一个输入文件（或 - 读标准输入）${OFF}\n\n${USAGE}`);
  process.exit(2);
}

const markdown =
  file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");

let plan: ImportPlan;
try {
  plan = planImport({
    collection: (opts.collection ?? "posts") as ImportCollection,
    markdown,
    now: new Date(),
    // 号池：四个编号集合现有的 id，读盘口只有 existingIds.ts 一份。
    existingIds: existingEntryIds(),
    agent: opts.agent,
    model: opts.model,
    slug: opts.slug,
    title: opts.title,
    description: opts.description,
    prompt: opts.prompt,
    questionKey: opts["question-key"],
    symbol: opts.symbol,
    symbolName: opts["symbol-name"],
  });
} catch (e) {
  if (e instanceof ImportError) {
    console.error(`${RED}${BLD}✗ ${e.message}${OFF}`);
    process.exit(2);
  }
  throw e;
}

// --prompt 指向的提示词必须真的存在：reference() 不查，构建期 resolvePromptRef 才查，
// 那时离导入已经隔了一段时间。在这里就拦。
if (opts.prompt) {
  const p = join(
    process.cwd(),
    "src",
    "content",
    "prompts",
    `${opts.prompt}.md`
  );
  if (!existsSync(p)) {
    console.error(
      `${RED}${BLD}✗ 提示词「${opts.prompt}」不存在${OFF}：${p}\n  对一眼 src/content/prompts/ 下的文件名。`
    );
    process.exit(2);
  }
}

const target = join(process.cwd(), ...plan.file.split("/"));
if (existsSync(target)) {
  console.error(
    `${RED}${BLD}✗ 不覆盖已有文件${OFF}：${plan.file}\n  换一个 --slug，或者去后台改那一条。`
  );
  process.exit(2);
}

writeFileSync(target, plan.text, "utf8");
// ★ 稿子和标的表**一起写**：稿子勾着一只表里没有的票时，只写稿子的话这一条
//   在后台打不开、构建也红。判据在 src/config/symbols.ts 的 withSymbolRow()，
//   /_import 那条路读同一份。
const registered = registerSymbols(plan.newSymbols);

console.log(`${GRN}${BLD}✓ 写入草稿${OFF} ${plan.file}`);
console.log(`  标题     ${plan.title}`);
console.log(
  `  标的     ${plan.symbols.join(" / ") || `${YEL}（空）${OFF}`}  ${DIM}symbolSource: ${plan.symbolSource}${OFF}`
);
if (registered.length > 0) {
  console.log(
    `  ${DIM}标的表里新登记了：${registered.join(" / ")}（去后台补公司名）${OFF}`
  );
}
console.log(`  智能体   ${plan.agent}`);
// 人写的没有模型这一格 —— 印「（不适用）」而不是「unspecified」，后者会被读成"还没填"。
console.log(
  `  模型     ${/^model:/m.test(plan.frontmatter) ? plan.model : `${DIM}（不适用：人写的）${OFF}`}`
);
console.log(`  摘要     ${plan.description}`);
if (plan.warnings.length > 0) {
  console.log(`\n${YEL}${BLD}要回来补的：${OFF}`);
  for (const w of plan.warnings) console.log(`  ${YEL}•${OFF} ${w}`);
}

// ── 当场过一遍闸门：和 pre-commit / 构建期是同一份判据 ──
const r = inspect(plan.file, plan.text);
console.log(`\n${BLD}发布闸${OFF} ${DIM}（同 pnpm gate 的判据）${OFF}`);
const printHit = (h: (typeof r.blocked)[number], color: string) => {
  console.log(`  ${color}${h.code}${OFF}  命中「${h.matched}」`);
  console.log(`    ${DIM}${h.context.replaceAll("\n", " ")}${OFF}`);
  console.log(`    ${DIM}${h.rule.why}${OFF}`);
};
for (const h of r.blocked) printHit(h, RED);
for (const h of r.warnings) printHit(h, YEL);
if (r.blocked.length > 0) {
  console.log(`${RED}${BLD}✗ ${verdictLabel("block")}${OFF}`);
  console.log(
    `  ${DIM}文件已经写了（它是草稿，不上公网），但取消草稿之前上面那几句必须改掉。${OFF}`
  );
} else if (r.warnings.length > 0) {
  console.log(`${YEL}${BLD}! ${verdictLabel("warn")}${OFF}`);
} else {
  console.log(`${GRN}✓ ${verdictLabel("clean")}${OFF}`);
}

console.log(
  `\n${DIM}下一步：pnpm dev → http://localhost:4321/keystatic → ${plan.slug} → 补齐 → 取消「草稿」→ git add src/content && git commit${OFF}`
);
process.exit(r.blocked.length > 0 ? 1 : 0);
