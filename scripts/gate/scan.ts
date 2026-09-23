import { RULES, type Level, type Rule, type Verdict } from "./rules";

export interface Hit {
  rule: Rule;
  code: string;
  level: Level;
  start: number;
  /** 真正命中的那几个字。 */
  matched: string;
  /** 命中处前后各若干字的原文。**误伤只能靠它来判**，所以不许省。 */
  context: string;
}

export interface Scan {
  verdict: Verdict;
  hits: Hit[];
  blocking: Hit[];
  warnings: Hit[];
}

const CONTEXT = 24;

/**
 * 扫一遍正文。
 *
 * ⚠ 这个函数**没有开关**。没有 `enabled` 参数、没有环境变量能关掉它、
 * 调用方也拿不到"跳过扫描"的路径 —— 一个能被关掉的闸门，迟早会在赶时间的那天被关掉。
 */
export function scan(text: string): Scan {
  const src = text ?? "";
  const hits: Hit[] = [];

  for (const rule of RULES) {
    for (const m of src.matchAll(rule.pattern)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      const lo = Math.max(0, start - CONTEXT);
      const hi = Math.min(src.length, end + CONTEXT);
      hits.push({
        rule,
        code: rule.code,
        level: rule.level,
        start,
        matched: m[0],
        context:
          (lo > 0 ? "…" : "") + src.slice(lo, hi) + (hi < src.length ? "…" : ""),
      });
    }
  }

  hits.sort((a, b) => a.start - b.start || a.code.localeCompare(b.code));

  const blocking = hits.filter(h => h.level === "block");
  const warnings = hits.filter(h => h.level === "warn");
  const verdict: Verdict =
    blocking.length > 0 ? "block" : hits.length > 0 ? "warn" : "clean";

  return { verdict, hits, blocking, warnings };
}

/**
 * 判定的一句话说明。**三档各说各的**，不许压扁成"通过 / 不通过"。
 *
 * 注意 clean 那句：说的是「没命中已知说法」，不是「安全」。
 * 词表必然有漏网，把"我没发现"说成"没有问题"是这个项目最不能接受的错误。
 */
export function verdictLabel(v: Verdict): string {
  switch (v) {
    case "clean":
      return "没命中已知的危险说法（不等于安全 —— 词表必然有漏网）";
    case "warn":
      return "命中了意图类说法，能发，但你要知道自己写了这句";
    case "block":
      return "命中了持仓事实 / 凭证 / 内部系统，发不出去 —— 只能改文案";
  }
}
