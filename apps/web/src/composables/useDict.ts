import { ref } from 'vue';
import { getDictByType } from '@/api/system';

/**
 * 全局字典缓存（响应式）
 * - dictMap: type -> DictRow[] 的响应式缓存
 * - loadDict(type): 首次拉取并缓存，后续命中缓存直接返回
 * - refreshDict(type): 强制重新拉取并更新缓存，所有引用处自动更新
 * - clearDictCache(): 清除全部缓存（如退出登录）
 */
interface DictRow {
  id: number;
  dictType: string;
  dictLabel: string;
  dictValue: string;
  sort?: number;
  status?: number;
  remark?: string;
}

const dictMap = ref<Record<string, DictRow[]>>({});
const pendingMap: Record<string, Promise<DictRow[]> | undefined> = {};

/** 加载字典（带缓存，并发去重） */
export async function loadDict(type: string): Promise<DictRow[]> {
  if (dictMap.value[type]) return dictMap.value[type];
  const pending = pendingMap[type];
  if (pending) return pending;
  const p = getDictByType(type)
    .then((rows: any) => {
      dictMap.value = { ...dictMap.value, [type]: rows };
      return rows;
    })
    .finally(() => {
      delete pendingMap[type];
    });
  pendingMap[type] = p;
  return p;
}

/** 强制刷新某类字典（字典管理页增删改后调用） */
export async function refreshDict(type: string): Promise<DictRow[]> {
  delete dictMap.value[type];
  return loadDict(type);
}

/** 刷新多个字典类型 */
export function refreshDicts(types: string[]): Promise<DictRow[][]> {
  return Promise.all(types.map((t) => refreshDict(t)));
}

/** 清除全部字典缓存（退出登录时调用） */
export function clearDictCache() {
  dictMap.value = {};
}

/** 获取字典缓存的响应式引用（用于模板 v-for 直接绑定） */
export function useDict(type: string) {
  const load = () => loadDict(type);
  return { dictMap, load };
}
