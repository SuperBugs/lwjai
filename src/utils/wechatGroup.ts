/**
 * 磁盘上那份微信群配置（`src/data/community.json`，后台「微信群」那一页写它）。
 * 判据全在 `src/config/community.ts`，这里只负责读进来 —— import 时就验，
 * 验不过**直接抛**（构建红），和 registry.ts / answerOrder.ts 同一条纪律。
 *
 * ★ 读它的只有站点这一侧（页脚、「关于」页、出图路由）。后台**不许** import 这个文件：
 *   表坏了的时候，能修它的地方就是后台那一页（理由写在 community.ts 文件头）。
 */
import raw from "../data/community.json";
import { COMMUNITY_FILE } from "../config/collections";
import {
  parseCommunity,
  wechatGroupStateIn,
  type CommunityConfig,
  type WechatGroupState,
} from "../config/community";

export const COMMUNITY: CommunityConfig = parseCommunity(raw, COMMUNITY_FILE);

/** 此刻该画哪一档（读磁盘上那份）。 */
export function wechatGroupState(now: Date): WechatGroupState {
  return wechatGroupStateIn(COMMUNITY, now);
}
