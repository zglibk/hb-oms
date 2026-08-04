/**
 * 拼音搜索工具：支持原文 / 全拼 / 首字母 / 双拼（小鹤、微软、自然码）匹配
 *
 * 主要用于 el-select 的 filter-method，让中文选项支持多种输入方式搜索。
 * 例如选项「中国」可被以下输入命中：
 *   - 中国（原文）
 *   - zhongguo（全拼，无声调）
 *   - zg（首字母）
 *   - vsgo（小鹤双拼：v=zh s=ong g=g o=uo）
 */
import { ref, computed, isRef, type Ref } from 'vue';
import { match } from 'pinyin-pro';

/** 双拼方案键位表：键 -> 韵母（声母部分用单字母本身，v/i/u 特殊） */
type SchemeTable = {
  /** 韵母键位映射 */
  finals: Record<string, string>;
  /** 特殊声母键位（v/u/i 代表 zh/sh/ch） */
  specialInitials: Record<string, string>;
  /** 零声母引导键（如微软双拼用 'o' 键引导零声母） */
  zeroInitialKeys: string[];
};

/** 小鹤双拼键位表 */
const XIAOHE: SchemeTable = {
  finals: {
    q: 'iu', w: 'ei', e: 'e', r: 'uan', t: 'ue', y: 'un', u: 'u', i: 'i',
    o: 'uo', p: 'ie', a: 'a', s: 'ong', d: 'ai', f: 'en', g: 'eng',
    h: 'ang', j: 'an', k: 'ao', l: 'in', z: 'ou', x: 'ia', c: 'iao',
    v: 'ui', b: 'in', n: 'in', m: 'ian',
  },
  specialInitials: { v: 'zh', i: 'ch', u: 'sh' },
  // 小鹤零声母：a/o/e 自身重复（aa/oo/ee）
  zeroInitialKeys: ['a', 'o', 'e'],
};

/** 微软双拼键位表 */
const MICROSOFT: SchemeTable = {
  finals: {
    q: 'iu', w: 'ia', e: 'e', r: 'uan', t: 'ue', y: 'ing', u: 'u', i: 'i',
    o: 'uo', p: 'un', a: 'a', s: 'ong', d: 'ai', f: 'en', g: 'eng',
    h: 'ang', j: 'an', k: 'ao', l: 'in', z: 'ou', x: 'ie', c: 'iao',
    v: 'ui', b: 'in', n: 'in', m: 'ian',
  },
  specialInitials: { v: 'zh', i: 'ch', u: 'sh' },
  // 微软双拼零声母用 'o' 键引导
  zeroInitialKeys: ['o'],
};

/** 自然码双拼键位表 */
const NATURAL: SchemeTable = {
  finals: {
    q: 'iu', w: 'ia', e: 'e', r: 'uan', t: 'ue', y: 'ing', u: 'u', i: 'i',
    o: 'uo', p: 'un', a: 'a', s: 'ong', d: 'ai', f: 'en', g: 'eng',
    h: 'ang', j: 'an', k: 'ao', l: 'in', z: 'ou', x: 'ie', c: 'iao',
    v: 'ui', b: 'in', n: 'in', m: 'ian',
  },
  specialInitials: { v: 'zh', i: 'ch', u: 'sh' },
  zeroInitialKeys: ['o'],
};

const SCHEMES: Record<'xiaohe' | 'microsoft' | 'natural', SchemeTable> = {
  xiaohe: XIAOHE,
  microsoft: MICROSOFT,
  natural: NATURAL,
};

/** 双拼 → 全拼转换结果缓存 */
const dpCache = new Map<string, string>();

/**
 * 把双拼输入转换为可能的全拼字符串。
 * 例如：'vsgo' + 小鹤 -> 'zhongguo'
 * 转换失败返回 null。
 */
function doublePinyinToPinyin(query: string, schemeName: keyof typeof SCHEMES): string | null {
  const cacheKey = `${schemeName}:${query}`;
  if (dpCache.has(cacheKey)) return dpCache.get(cacheKey)!;

  const scheme = SCHEMES[schemeName];
  let result = '';
  let i = 0;
  while (i < query.length) {
    const first = query[i];
    const second = query[i + 1];
    // 单字符结尾：当作首字母处理
    if (!second) {
      result += first;
      i += 1;
      continue;
    }
    // 零声母：first 是 a/o/e 且 second 是韵母键
    if (scheme.zeroInitialKeys.includes(first)) {
      const ym = scheme.finals[second];
      if (ym) {
        result += ym;
        i += 2;
        continue;
      }
    }
    // 特殊声母（v/u/i -> zh/sh/ch）
    const sm = scheme.specialInitials[first] ?? first;
    const ym = scheme.finals[second];
    if (!ym) return null;
    result += sm + ym;
    i += 2;
  }
  dpCache.set(cacheKey, result);
  return result;
}

/**
 * 综合匹配：判断文本是否匹配用户输入的查询词。
 * 支持原文、全拼、首字母、三种双拼方案。
 */
export function pinyinMatch(text: string, query: string): boolean {
  if (!text) return false;
  if (!query) return true;
  const q = query.trim();
  if (!q) return true;
  // 1. pinyin-pro 的 match 已覆盖原文、全拼、首字母、混合输入
  //    precision: 'any' 允许任意位置匹配；insensitive 大小写不敏感
  if (match(text, q, { precision: 'any', insensitive: true, v: true }) !== null) {
    return true;
  }
  // 2. 双拼匹配：把双拼转换为全拼后再用 match 匹配
  for (const scheme of ['xiaohe', 'microsoft', 'natural'] as const) {
    const fullPinyin = doublePinyinToPinyin(q, scheme);
    if (fullPinyin && match(text, fullPinyin, { precision: 'any', insensitive: true, v: true }) !== null) {
      return true;
    }
  }
  return false;
}

/**
 * el-select 拼音过滤 composable。
 *
 * Element Plus 的 filter-method 签名为 (query) => void，
 * 需在函数内部自行控制 options 显示，而非返回 boolean。
 * 本 composable 通过 computed 自动过滤 options。
 *
 * 用法：
 * ```ts
 * const { filterMethod, filtered, reset } = usePinyinFilter(COUNTRY_OPTIONS, c => c.name);
 * ```
 * ```html
 * <el-select filterable :filter-method="filterMethod" @visible-change="v => !v && reset()">
 *   <el-option v-for="c in filtered" :key="c" :label="c" :value="c" />
 * </el-select>
 * ```
 */
export function usePinyinFilter<T>(
  source: Ref<T[]> | T[],
  getLabel: (item: T) => string,
) {
  const query = ref('');
  const filterMethod = (q: string) => {
    query.value = q;
  };
  const filtered = computed(() => {
    const list = isRef(source) ? source.value : source;
    if (!query.value.trim()) return list;
    const q = query.value.trim();
    return list.filter((item) => pinyinMatch(getLabel(item), q));
  });
  const reset = () => {
    query.value = '';
  };
  return { query, filterMethod, filtered, reset };
}
