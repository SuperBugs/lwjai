/**
 * 盘上现有的条目号 —— 号池的**唯一读盘口**。
 *
 * 【2026-09-21】两个 Node 侧的导入入口共用它：
 *   - `scripts/content/import.ts`（`pnpm content:import`，裸 tsx 跑）
 *   - `src/dev/import-run.ts`（后台左侧菜单「粘贴导入」那条接口）
 *
 * 判据（`nextEntryNo`）是纯函数、不碰磁盘，所以"有哪些号已经被占了"必须由调用方
 * 喂进去。喂之前那一步如果两个入口各写一份，就会出现**其中一个少扫一个集合**的状态：
 * 号池小了一块 → 新条目和别人撞号 → Keystatic 静默加 `-2` 后缀 / 直接覆盖。
 * 所以读盘只有这一份，范围从 `NUMBERED_COLLECTIONS` 推，一个路径字符串都不写死。
 *
 * ★ 后台那条路**用不了它**（`keystatic.config.ts` 跑在浏览器里，没有 fs），
 *   那边读的是 Vite 的 `import.meta.glob` 快照，见那个文件里的说明。
 *   两条路读的是同一个目录集合，但新鲜度不同 —— 这就是
 *   `src/content.config.ts` 的 `generateId` 那道检查存在的理由。
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  NUMBERED_COLLECTIONS,
  requireCollectionSpec,
} from "../../src/config/collections";
import { idFromEntryPath } from "../../src/config/entryNo";

/**
 * 四个编号集合下所有条目的 id（`["1", "2", …]`，不保证有序）。
 *
 * `_` 开头的文件不算条目（`_keep.md`），和 `content.config.ts` 的 glob 同一条规则。
 * ⚠ 认不出是号的文件名**照样返回**：`nextEntryNo` 自己会忽略它们，而"盘上有个坏
 *   文件名"这件事由 content.config.ts 的 `generateId` 去红 —— 在这里偷偷过滤掉，
 *   等于让号池默默跳过一条真实存在的内容。
 */
export function existingEntryIds(root: string = process.cwd()): string[] {
  const ids: string[] = [];
  for (const key of NUMBERED_COLLECTIONS) {
    const spec = requireCollectionSpec(key);
    const dir = join(root, ...spec.dir.split("/"));
    let files: string[];
    try {
      files = readdirSync(dir);
    } catch (e) {
      throw new Error(
        `读不到${spec.label}的内容目录「${spec.dir}」—— 号池少了一块，` +
          `再导一条就会和这个集合里的条目撞号。` +
          `（目录来自 src/config/collections.ts 的登记表。）\n原始错误：${String(e)}`
      );
    }
    for (const file of files) {
      if (file.startsWith("_")) continue;
      if (!/\.(md|mdx)$/i.test(file)) continue;
      ids.push(idFromEntryPath(file));
    }
  }
  return ids;
}
