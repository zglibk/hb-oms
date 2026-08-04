import { computed, ref, watch, type Ref } from 'vue';

/**
 * 前端分页：对一份完整数据（source）做客户端切片分页。
 * 适用于后端一次性返回全量列表、但仍需分页器的页面。
 *
 * @param source 全量数据的响应式引用
 * @param defaultSize 默认每页条数（默认 10）
 * @returns page 当前页 / size 每页条数 / total 总条数 / paged 当前页切片
 */
export function useClientPager<T>(source: Ref<T[]>, defaultSize = 10) {
  const page = ref(1);
  const size = ref(defaultSize);

  const total = computed(() => source.value.length);
  const paged = computed(() =>
    source.value.slice((page.value - 1) * size.value, page.value * size.value),
  );

  // 数据量变化（筛选 / 增删）后，若当前页超出范围则回到第 1 页
  watch(total, (n) => {
    const maxPage = Math.max(1, Math.ceil(n / size.value));
    if (page.value > maxPage) page.value = 1;
  });

  return { page, size, total, paged };
}
