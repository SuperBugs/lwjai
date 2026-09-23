/**
 * 智能体与模型的**登记数据** —— `src/data/registry.json`，后台「智能体与模型」那一页写它。
 *
 * 【2026-09-20 从代码里挪出来】原来智能体和模型各是一份写死在 .ts 里的数组，
 * 加一个模型要改代码。用户要在后台自己加（GPT-6、GPT-6-Pro，以后还有别的），
 * 所以数据进了一份 JSON，由 Keystatic 的 singleton 管；`agents.ts` / `models.ts`
 * 只负责把它读进来、套上哨兵、验一遍。
 *
 * ## 为什么是 JSON，不是 .md / .yaml
 *
 * 这份数据要在**三种环境**里读：Astro（页面、content.config.ts 的 z.enum）、
 * Vite 的浏览器端（keystatic.config.ts 在后台页面里跑）、裸 tsx（导入 CLI、测试、发布闸）。
 * `import x from "./x.json"` 三处都原生支持；.md / .yaml 每一处都得各配一个解析器。
 *
 * ## 三条不许破的
 *
 *   1. **哨兵不在这里。** `unspecified`（还没标）和 `human`（我自己）是 agents.ts / models.ts
 *      里写死的，登记表里不许出现这两个 id（下面拦着）。它们是 schema 的默认值和
 *      "分档"的判据，被人在后台删掉的后果是整站的三档一起塌。
 *      ★ `ANY_AGENT`（模型那一格的「不限智能体」）同理是代码里的哨兵，
 *        而且它**故意长成 id 正则认不出来的样子**，见下面那条常量。
 *   2. **id 定了不改。** 它进 frontmatter（`agent: spark`）。后台改 id
 *      = 库里所有用着旧 id 的条目一起变成"登记表里查不到"（页面上显示「来源未标注」）。
 *      显示名（name）随便改。
 *   3. **登记表上公网，所以过闸。** name / vendor / note 是人手填的自由文本，
 *      渲染在芯片、悬停提示、问答署名、分享卡、导出的 .md 里。发布闸的三道
 *      （构建期 / 暂存区 / dev 预览页）都扫它（`scripts/gate/inspect.ts` 的 inspectRegistry），
 *      `scripts/gate/registryGate.test.ts` 钉着三处都在扫。
 *
 * ## 坏了怎么办
 *
 * 这个文件在 import 时就验，验不过**直接抛** —— 构建红、导入 CLI 红、后台页面红。
 * 不兜：一张读不进来的登记表如果被静默当成空表，页面上所有条目会一起变成「来源未标注」，
 * 而构建全绿。宁可红。
 *
 * ★ 零 astro import（理由同 agents.ts）。唯一的两条 import 是那份 JSON 和
 *   `./agentIcons`（内置图标表，本身也零 import）—— 智能体那一格的「画成哪个符号」
 *   要拿它对账，和模型那一格的归属拿 agents 对账是同一条：**认不出来的值必须抛，
 *   不许悄悄丢掉**。
 */
import raw from "../data/registry.json";
import { AGENT_ICON_IDS, AGENT_ICON_UNSET, isAgentIconId } from "./agentIcons";

/** 进 frontmatter 的 id：小写字母数字，连字符分段。
 *  【2026-09-21】地址换成条目号之后它**不再进地址**了 —— 以前 `spark` 会出现在
 *  `orcl-…-spark-gemini-3-pro` 里，现在地址是个数字，改 id 影响不到任何一条公开链接。 */
export const REGISTRY_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 写死在代码里的两个哨兵 id，登记表里不许出现。 */
export const RESERVED_IDS: readonly string[] = ["unspecified", "human"];

/**
 * 模型那一格「**能在哪些智能体底下跑**」里的一档：**不限智能体**（完成态）。
 *
 * 【2026-09-21 加的第二维联动】一个模型可以显式声明"任何智能体底下都能选"——
 * 直接调 API 跑出来的结果就属于这一档（models.ts 文件头一直记着这件事是真会发生的）。
 *
 * ★ 值是 `*`，**故意长成 `REGISTRY_ID_RE` 认不出来的样子**：它和任何一个真实智能体的
 *   id 都不可能撞上，所以"这一格勾的是哨兵还是某个产品"永远分得清。
 *   拿 `any` / `all` 这种合法 id 当哨兵的话，哪天真有人建一个 id 叫 `any` 的智能体，
 *   全站所有勾了「不限」的模型会一起变成"只在那个产品底下跑"，而哪儿都不报错。
 * ⚠ 它和"这一格是空的"（**还没标**，待补）是**两档，不许压成一档** ——
 *   空着的意思是"没人说过这个模型跟谁配"，勾了这一档的意思是"我看过了，哪儿都能跑"。
 *   三档怎么分、各自在后台和构建期什么表现，写在 src/config/models.ts 的 `modelScope()`。
 */
export const ANY_AGENT = "*";

/** 给后台那一格用的校验：形状对、且不是保留字。 */
export const REGISTRY_ID_INPUT_RE = new RegExp(
  `^(?!(?:${RESERVED_IDS.join("|")})$)[a-z0-9]+(?:-[a-z0-9]+)*$`
);
export const REGISTRY_ID_HINT =
  "只许小写字母、数字和连字符（gpt-6-pro），而且不能是 unspecified / human";

export interface RegistryEntry {
  id: string;
  name: string;
  vendor: string;
  note?: string;
  /**
   * **只有智能体那半张表有**：这个智能体在站上画成哪个符号
   * （`src/config/agentIcons.ts` 里那张表的 id）。
   *
   * ★ **空 / 哨兵 `unset` / 没这个键都折成 `undefined`** —— 那是「还没挑」（待补）
   *   这一档，画法是虚线圆 + 名字首字。折的理由同下面 `note` 的空串：
   *   同一件事在页面和判据上只许有一种写法。
   * ⚠ 认不出来的 id **抛**，不悄悄丢掉：丢掉的话那个智能体会安静地从
   *   「挑过图标」退回「还没挑」，而站上只是多了一个虚线圈 —— 没有任何人会发现
   *   是图标表里删了一行造成的。
   */
  icon?: string;
  /**
   * **只有模型那半张表有**：这个模型能在哪些智能体底下跑。
   * 值是智能体的 id，或者单独一个 `ANY_AGENT`（不限）。
   *
   * ★ **空数组和"没这个键"都折成 `undefined`** —— 那是「还没标」（待补）这一档，
   *   和 `["*"]`（看过了，不限）是两回事。折的理由同下面 `note` 的空串：
   *   `[]` 和 `undefined` 在页面和判据上必须只有一种写法，否则
   *   `deepEqual(磁盘那份, import 进来那份)` 这类对账会在一个无意义的差别上红。
   */
  agents?: readonly string[];
}

export interface Registry {
  agents: RegistryEntry[];
  models: RegistryEntry[];
}

const FILE = "src/data/registry.json";

function fail(where: string, msg: string): never {
  throw new Error(
    `登记表坏了（${where}）：${msg}。去后台「智能体与模型」那一页改，或者直接改 ${FILE}。`
  );
}

/**
 * 模型那一格「能在哪些智能体底下跑」的校验。**查不到的智能体 id 直接抛。**
 *
 * ★ 为什么不"把认不出来的那个悄悄丢掉"：那一格是构建期错配判据的输入
 *   （src/config/models.ts 的 `agentModelMismatch()`）。丢掉一个 id 的后果是
 *   那个模型的归属**从"只在 A 底下"变成"只在 B 底下"**，于是一批本来合法的条目
 *   突然构建失败，或者反过来一个真错配悄悄放行 —— 而登记表看上去一切正常。
 * ⚠ 这条的代价说清楚：**在后台删掉一个还被模型勾着的智能体，登记表就读不进来了，
 *   而后台自己也读它 —— 整个后台打不开**。所以要先去模型那几行取消勾选，再删智能体。
 *   （真撞上了就手改 `src/data/registry.json`，报错里指得出是哪一行。）
 */
function parseAgentRefs(
  value: unknown,
  at: string,
  where: string,
  knownAgents: ReadonlySet<string>
): readonly string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) fail(where, `${at} 的 agents 不是数组`);
  const ids = value.map((v, i) => {
    if (typeof v !== "string") fail(where, `${at} 的 agents[${i}] 不是字符串`);
    return v.trim();
  });
  // 空 = 还没标（待补）。和 ["*"]（看过了，不限）是两档，见 ANY_AGENT。
  if (ids.length === 0) return undefined;
  if (new Set(ids).size !== ids.length) {
    fail(where, `${at} 的 agents 里有重复的智能体`);
  }
  if (ids.includes(ANY_AGENT)) {
    if (ids.length > 1) {
      fail(
        where,
        `${at} 的 agents 既勾了「不限智能体」又勾了具体的产品 —— ` +
          `两者互相矛盾，留一个：真不限就只留「不限」，只在那几个底下跑就把「不限」去掉`
      );
    }
    return ids;
  }
  for (const id of ids) {
    if (!knownAgents.has(id)) {
      fail(
        where,
        `${at} 的 agents 里有一个查不到的智能体「${id}」—— ` +
          `要么是拼错了，要么是那个智能体被删了。` +
          `删智能体之前得先把勾着它的模型改掉（上面 agents 那半张表里现在有：` +
          `${[...knownAgents].join(" / ") || "一个都没有"}）`
      );
    }
  }
  return ids;
}

/**
 * 智能体那一格「画成哪个符号」的校验。**认不出来的 id 直接抛**，理由同
 * `RegistryEntry.icon` 上那段：悄悄丢掉等于把"图标表里删了一行"伪装成
 * "这个智能体本来就没挑过图标"。
 *
 * ⚠ 代价和 `parseAgentRefs` 一样说清楚：**删 `agentIcons.ts` 里一行之前，
 *   先去后台把挑了它的智能体改掉** —— 否则登记表读不进来，而后台自己也读它，
 *   整个后台打不开（只能手改 src/data/registry.json）。
 */
function parseIcon(
  value: unknown,
  at: string,
  where: string
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") fail(where, `${at} 的 icon 不是字符串`);
  const id = value.trim();
  // 空 = 还没挑（待补）。哨兵和空是同一档 —— 后台那个 select 永远有值，
  // 它选「还没挑」时写出来的就是这个哨兵。
  if (!id || id === AGENT_ICON_UNSET) return undefined;
  if (!isAgentIconId(id)) {
    fail(
      where,
      `${at} 的 icon「${id}」不在内置图标表里 —— ` +
        `要么是拼错了，要么是 src/config/agentIcons.ts 里那一行被删了。` +
        `现在表里有：${AGENT_ICON_IDS.join(" / ")}（还没挑就留空，或者写 ${AGENT_ICON_UNSET}）`
    );
  }
  return id;
}

function parseList(
  input: unknown,
  what: "agents" | "models",
  where: string,
  knownAgents?: ReadonlySet<string>
): RegistryEntry[] {
  if (!Array.isArray(input)) fail(where, `${what} 不是数组`);
  const seen = new Set<string>();
  return input.map((item, i) => {
    const at = `${what}[${i}]`;
    if (!item || typeof item !== "object") fail(where, `${at} 不是对象`);
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const vendor = typeof o.vendor === "string" ? o.vendor.trim() : "";
    const note = typeof o.note === "string" ? o.note.trim() : "";
    if (!REGISTRY_ID_RE.test(id)) {
      fail(where, `${at} 的 id「${id}」不合法 —— ${REGISTRY_ID_HINT}`);
    }
    if (RESERVED_IDS.includes(id)) {
      fail(
        where,
        `${at} 用了保留 id「${id}」—— 哨兵是代码里写死的，登记表里不许有`
      );
    }
    if (seen.has(id)) fail(where, `${at} 的 id「${id}」重复了`);
    seen.add(id);
    if (!name) fail(where, `${at}（${id}）没有显示名`);
    if (!vendor) fail(where, `${at}（${id}）没有厂商`);
    const entry: RegistryEntry = { id, name, vendor };
    if (note) entry.note = note;
    // 「能在哪些智能体底下跑」只有模型那半张表有（knownAgents 只在那一半传进来）。
    if (knownAgents) {
      const agents = parseAgentRefs(o.agents, at, where, knownAgents);
      if (agents) entry.agents = agents;
    }
    if (what === "agents") {
      // ★ 图标反过来**只有智能体那半张表有**：模型不单独出现在页面上，
      //   它永远挂在某个智能体的括号里（AgentModelChip 那张「智能体（模型）」），
      //   给它一个自己的图标就是在那一行里多画一个没有主语的记号。
      const icon = parseIcon(o.icon, at, where);
      if (icon) entry.icon = icon;
    }
    return entry;
  });
}

/**
 * 把一份原始 JSON 验成登记表。**验不过就抛**，见文件头。
 * 拆成纯函数是为了让 registry.test.ts 能喂坏数据进来看它红不红（docs/engineering-notes.md 坑 17）。
 *
 * ★ 两半**有先后**：先把智能体那半张表验出来，模型那半张表的「能在哪些智能体底下跑」
 *   要拿它对账。反过来写的话那一格就没得对，只能"信它写的是对的"。
 */
export function parseRegistry(input: unknown, where: string = FILE): Registry {
  if (!input || typeof input !== "object") fail(where, "顶层不是对象");
  const o = input as Record<string, unknown>;
  const agents = parseList(o.agents, "agents", where);
  return {
    agents,
    models: parseList(
      o.models,
      "models",
      where,
      new Set(agents.map(a => a.id))
    ),
  };
}

/** 当前这一份。import 时就验过了。 */
export const REGISTRY: Registry = parseRegistry(raw);
