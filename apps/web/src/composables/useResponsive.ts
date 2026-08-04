import { ref, onMounted, onUnmounted, computed, readonly } from 'vue';

/**
 * 响应式判断 composable
 * 
 * 用途：组件内根据屏幕宽度切换 UI 结构（如 el-table → 卡片列表）。
 * 断点与 responsive.scss 一致。
 *
 * 使用示例：
 *   const { isMobile, isTablet, isDesktop, desktopSize } = useResponsive();
 *   
 *   <template>
 *     <div v-if="isMobile">卡片视图</div>
 *     <el-table v-else>表格视图</el-table>
 *   </template>
 */
export function useResponsive() {
  const width = ref(typeof window !== 'undefined' ? window.innerWidth : 1920);

  function update() {
    width.value = window.innerWidth;
  }

  onMounted(() => {
    update();
    window.addEventListener('resize', update);
  });

  onUnmounted(() => {
    window.removeEventListener('resize', update);
  });

  const isMobile = computed(() => width.value < 768); // xs
  const isTablet = computed(() => width.value >= 768 && width.value < 992);
  const isDesktop = computed(() => width.value >= 992);
  const isLarge = computed(() => width.value >= 1200);
  const isCompactDesktop = computed(
    () => width.value >= 992 && width.value < 1366,
  );
  const isStandardDesktop = computed(
    () => width.value >= 1366 && width.value < 1920,
  );
  const isWideDesktop = computed(() => width.value >= 1920);

  /**
   * 仅在确实需要切换组件结构时使用；纯尺寸变化优先交给 CSS。
   */
  const desktopSize = computed<
    'mobile' | 'tablet' | 'compact' | 'standard' | 'wide'
  >(() => {
    if (isMobile.value) return 'mobile';
    if (isTablet.value) return 'tablet';
    if (isCompactDesktop.value) return 'compact';
    if (isStandardDesktop.value) return 'standard';
    return 'wide';
  });

  return {
    width: readonly(width),
    isMobile,
    isTablet,
    isDesktop,
    isLarge,
    isCompactDesktop,
    isStandardDesktop,
    isWideDesktop,
    desktopSize,
  };
}
