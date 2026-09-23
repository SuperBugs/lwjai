type GroupKey = string | number | symbol;
type GroupFunction<T> = (item: T, index?: number) => GroupKey;

/**
 * 按任意条件分组。函数体和集合无关，所以改成泛型 —— 归档页要把 posts 和 qa
 * 混在同一条年月时间流里分组，写死 `CollectionEntry<"posts">` 的话混排进不来。
 */
export function getPostsByGroupCondition<T>(
  posts: T[],
  groupFunction: GroupFunction<T>
): Record<GroupKey, T[]> {
  const result: Record<GroupKey, T[]> = {};

  for (let i = 0; i < posts.length; i++) {
    const item = posts[i];
    const groupKey = groupFunction(item, i);

    if (!result[groupKey]) {
      result[groupKey] = [];
    }

    result[groupKey].push(item);
  }

  return result;
}
