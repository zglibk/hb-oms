import { PRODUCT_TYPE_OPTIONS } from './product-type';
import { splitParts, splitSuffix } from './rail';

/**
 * 产品名称补「滑轨」——前后端唯一事实源（2026-09-25 使用方要求）。
 *
 * 用在两处：订单表单（新增时产品名称失焦自动补）与入库单纸面「产品名称」栏（印出前补）。
 *
 * 规则（按顺序）：
 *   1. 名称里**已经有「轨」字**就不动——滑轨/三节轨/内轨/外中轨/键盘轨，以及「轨」在中间的
 *      「45#缓冲滑轨双弹簧」「滚珠滑轨芯（有夹力） -P000809」（按真实数据校准）；
 *   2. 名称里**有产品类型**时，「滑轨」**紧跟在产品类型之后**（使用方指定）：
 *      「45#普通1.0料」→「45#普通滑轨1.0料」、「45#普通自锁」→「45#普通自锁滑轨」、
 *      「35#两节卡扣-右边」→「35#两节卡扣滑轨-右边」。取名称中**第一串**产品类型，连续的多个类型
 *      视为一串、插在整串之后；产品类型取系统字典中文名，另认常见别写「卡扣」（= 卡口）；
 *   3. 名称里没有任何产品类型（「45#角码」「35#胶粒款」）时补在末尾；末尾的左右标记
 *      「（左）」「(右)」「-左边」「-右边」先拿开，「滑轨」补在其前面；
 *   4. 名称里的「分体」原地加全角括号「（分体）」（已带括号的不重复加）；
 *   5. 空值保持为空，不凭空写出「滑轨」。
 * 左右标记必须带括号或「-」才认：避免把名称里自然出现的「左右」拆坏。
 */
const SIDE_TAIL = /((?:[-－]\s*(?:左|右)边?)|(?:[（(]\s*(?:左|右)边?\s*[）)]))$/;

/** 产品类型词：字典中文名 + 常见别写「卡扣」；长词优先匹配 */
const TYPE_WORDS = [...PRODUCT_TYPE_OPTIONS.map((o) => o.label), '卡扣'].sort((a, b) => b.length - a.length);

/** 从 pos 起连续匹配产品类型词，返回这串类型的结束位置（没有匹配则等于 pos） */
function typeRunEnd(s: string, pos: number): number {
  let end = pos;
  for (let hit = true; hit; ) {
    hit = false;
    for (const w of TYPE_WORDS) {
      if (s.startsWith(w, end)) {
        end += w.length;
        hit = true;
        break;
      }
    }
  }
  return end;
}

/**
 * @param suffix 要补的字：整品默认「滑轨」；**分体行传它的出货形态**（「外中轨」「内轨」，见 railNameSuffixOf）。
 *   分体两行的订单产品名称往往一模一样（如都叫「45#普通分体」），不带形态的话入库单/送货单上
 *   两行印成同一个名字、分不出哪行是外中轨（2026-09-25 使用方报 bug）。
 *   分体行名称里写的是「滑轨」时换成形态：「45#普通滑轨分体」→「45#普通外中轨分体」；
 *   已写了具体形态（「…外中轨」「…内轨」）的保持不变。
 */
export function withRailSuffix(name: string | null | undefined, suffix = '滑轨'): string {
  const raw = name ?? '';
  const t = raw.trim();
  if (!t) return raw;
  return bracketSplitWord(insertRailWord(t, suffix));
}

function insertRailWord(t: string, suffix: string): string {
  if (t.includes('轨')) {
    return suffix !== '滑轨' && t.includes('滑轨') ? t.replace('滑轨', suffix) : t;
  }

  // 规则 2：名称中第一串产品类型之后
  for (let i = 0; i < t.length; i++) {
    const end = typeRunEnd(t, i);
    if (end > i) return `${t.slice(0, end)}${suffix}${t.slice(end)}`;
  }

  // 规则 3：无产品类型 → 补在末尾（左右标记之前）
  const tail = t.match(SIDE_TAIL)?.[1] ?? '';
  const core = tail ? t.slice(0, t.length - tail.length).trimEnd() : t;
  if (!core) return t;
  return `${core}${suffix}${tail}`;
}

/**
 * 「分体」原地加全角括号（2026-09-25 使用方要求）：「45#普通内轨无锁力分体」→「45#普通内轨无锁力（分体）」。
 * 已带括号（「（分体）」「(分体)」）的不重复加；不在末尾的同样加（「…左右分体」→「…左右（分体）」）。
 */
export function bracketSplitWord(s: string): string {
  return s.replace(/(^|[^（(])分体(?![）)])/g, '$1（分体）');
}

/**
 * 产品名称该补的字：整品「滑轨」；分体行是它的出货形态（由部件组构成推导，与产品型号
 * productLevelModel 同一套：{外,中}→外中轨、{内}→内轨）。
 */
export function railNameSuffixOf(
  isSplit: number | boolean | null | undefined,
  groupTypes: Array<string | null | undefined>,
  railSection: string | null | undefined,
): string {
  return isSplit ? splitSuffix(splitParts(groupTypes, railSection)) : '滑轨';
}
