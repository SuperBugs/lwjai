/**
 * 同一组里**几个智能体的结果谁排前面** —— 后台「回答排序」那一页（写
 * `src/data/answerOrder.json`）说了算，判据只有这一份。
 *
 * 【2026-09-21 用户要的】在这之前组内顺序就是"新在前"（喂进来的 pool 顺序），
 * 没有任何地方能调。而同一个选题下几份研究的**先后本身是一种编排** ——
 * 站长想让哪个智能体的那份先被读到，是内容决策，不该由"谁最后改过"决定。
 *
 * ## 两档，不压
 *
 *   - **列表是空的 = 还没排过**（完成态，不是待补）：一切照旧，按时间新在前。
 *     这是新装上这个模块时的样子 —— 一个新加的排序控件不许在没人动它的时候
 *     悄悄把全站的顺序重排一遍。
 *   - **列表有东西**：列进来的按这个顺序；**没列进来的排在它们后面**，
 *     彼此之间仍然按时间。所以后台加了一个新智能体而忘了来排，
 *     它只是排在最后，不会消失、也不会把别人挤掉。
 *
 * ## 它**不**管什么
 *
 *   - **组在列表里的位置**：仍然按"组里最新那条"算（时间流不变）。
 *     不然把某个智能体拖到最前，会把它参与过的每一组都顶到首页最上面 ——
 *     那不是排序，那是置顶。
 *   - **详情页那排切换里的本条**：本条永远排第一（读者是从它出发的，
 *     理由写在 `QaAnswerSwitch.astro`）。这张表只管它后面那几条。
 *
 * ## 为什么不复用"智能体登记表"自己的行序
 *
 * 那张表的顺序已经是**两件事**了：下拉框的顺序，以及新建条目时的默认值
 * （2026-09-21 定的，`DEFAULT_AGENT`）。再挂上第三个含义之后，
 * "把常用的那个拖到最前"就会顺手把全站每一组的展示顺序也换掉 —— 一个控件
 * 干三件事，而其中两件在别的页面上才看得见。所以这是**另一张表**。
 *
 * ★ 零 astro import：`keystatic.config.ts` 在 Astro 之外加载，测试是裸 tsx 跑的。
 */
import raw from "../data/answerOrder.json";

export type AnswerOrder = {
  /** 智能体 id，**从前往后**就是展示顺序。空数组 = 还没排过。 */
  agents: readonly string[];
};

/**
 * 读这份表。**坏数据一律抛**，不许兜成空表 —— 兜成空表的话"文件坏了"和
 * "还没排过"在屏幕上字节级相同，而后者是个完成态（同 registry.ts 的规矩）。
 *
 * ⚠ 这里**不**核对 id 在不在智能体登记表里，是刻意的：在后台把一个智能体删掉，
 *   这张表里那一行就成了孤儿 —— 要是为它抛，整个站会因为一条**排序偏好**
 *   构建不出来。孤儿 id 排不到任何东西，天然无害。代价是手写文件时打错一个
 *   字母不会报错，只是那一条永远不生效；而后台那一页是下拉选的，打不出错字。
 */
export function parseAnswerOrder(
  value: unknown,
  where = "回答排序表"
): AnswerOrder {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${where} 顶层不是对象。`);
  }
  const agents = (value as { agents?: unknown }).agents;
  if (agents === undefined) return { agents: [] };
  if (!Array.isArray(agents)) {
    throw new Error(`${where} 的 agents 不是数组。`);
  }
  const seen = new Set<string>();
  for (const id of agents) {
    if (typeof id !== "string") {
      throw new Error(`${where} 里有一项不是字符串：${JSON.stringify(id)}`);
    }
    if (seen.has(id)) {
      throw new Error(
        `${where} 里 ${id} 出现了两次 —— 同一个智能体排在两个位置，那是个说不通的输入。`
      );
    }
    seen.add(id);
  }
  return { agents: agents as string[] };
}

export const ANSWER_ORDER: AnswerOrder = parseAnswerOrder(
  raw,
  "src/data/answerOrder.json"
);

/** 排过的都在没排过的前面，所以"没排过"要比任何一个真实位置都大。 */
const UNRANKED = Number.MAX_SAFE_INTEGER;

/**
 * 在**给定的**那张表里排第几。没列进来（含没标智能体的）→ `UNRANKED`，排在最后。
 * ★ 返回的是**名次**不是布尔：调用方要拿它去做稳定排序，没有"排过没排过"这种二分。
 *
 * ⚠ 表是**入参**不是全局，为的是测试能拿一张自己造的表跑**真的**这段逻辑。
 *   第一版只有下面那个读全局的版本，于是测试为了不依赖磁盘上那份文件，
 *   自己又实现了一遍名次 —— 实测把 `UNRANKED` 改成 `-1`（"没排过的反而排最前"）
 *   那条用例照样全绿。测试自己喂判据，正是 docs/engineering-notes.md 开头 `SC 13D` 那个形态。
 */
export function answerRankIn(
  order: AnswerOrder,
  agentId: string | undefined
): number {
  if (!agentId) return UNRANKED;
  const i = order.agents.indexOf(agentId);
  return i === -1 ? UNRANKED : i;
}

/** 同上，读的是磁盘上那张表。页面用这个。 */
export function answerRank(agentId: string | undefined): number {
  return answerRankIn(ANSWER_ORDER, agentId);
}

/**
 * 入参只要求"有个 data"。
 *
 * ⚠ 刻意**不**写成 `{ data: { agent?: string } }`：那样一来，喂进来的对象字面量
 *   会撞上 TS 的多余属性检查（`data: { questionKey }` 当场报错），而泛型推断
 *   还会把 `T` 收窄成这个形状、把 `title` / `filePath` 这些一起丢掉 ——
 *   实测 `qaGroups.test.ts` 和 `share.astro` 一共红了 12 处。
 *   宽着收、里面自己取值，是这里唯一不给调用方添乱的写法。
 */
type WithData = { data: object };

/** 从一条内容上取 `agent`。不是字符串（没这一格、或者被手写成了别的）→ undefined。 */
function agentOf(entry: WithData): string | undefined {
  const value = (entry.data as { agent?: unknown }).agent;
  return typeof value === "string" ? value : undefined;
}

/**
 * 把同一组里的几条按上面那张表排好。
 *
 * ★ **稳定排序**，而且**不改入参**：名次一样的两条（比如同一个智能体答了两次、
 *   或者表是空的）保持喂进来的顺序 —— 那个顺序是"新在前"，也就是**这张表空着时
 *   这个函数等于什么都没做**。这正是上面那两档里的第一档。
 */
export function sortAnswersWith<T extends WithData>(
  order: AnswerOrder,
  list: readonly T[]
): T[] {
  return [...list].sort(
    (a, b) => answerRankIn(order, agentOf(a)) - answerRankIn(order, agentOf(b))
  );
}

/** 同上，读的是磁盘上那张表。列表和两个详情页用这个。 */
export function sortAnswers<T extends WithData>(list: readonly T[]): T[] {
  return sortAnswersWith(ANSWER_ORDER, list);
}
