import type { App, Directive } from 'vue';
import { useUserStore } from '@/stores/user';

/**
 * 按钮权限指令（文档 7.2：前端控制 + 后端二次校验）
 *
 * 两种模式：
 *   v-permission="'order:create'"        无权限时移除元素（默认，用于工具栏等独立按钮）
 *   v-permission="['plan:list','plan:issued']" 数组为 OR：拥有其一即显示
 *   v-permission.disable="'order:update'" 无权限时禁用并置灰，不移除
 *
 * 列表操作列建议统一使用 .disable，避免各行按钮数量不等导致对齐错乱。
 *
 * 注意：.disable 模式带 updated 钩子重新校验。因为操作列按钮常同时带响应式
 * :disabled（业务状态），组件重渲染会把 disabled 重置，需在每次 updated 后
 * 重新施加权限禁用，防止无权限按钮被业务态“复活”。
 */
function disableEl(el: HTMLElement) {
  el.setAttribute('disabled', 'disabled');
  el.classList.add('is-disabled');
  el.style.cursor = 'not-allowed';
  el.style.pointerEvents = 'none';
  el.setAttribute('title', '无操作权限');
}

function hasAccess(binding: any): boolean {
  const userStore = useUserStore();
  const value = binding.value;
  const codes: string[] = Array.isArray(value) ? value : [value];
  return codes.some((c) => userStore.hasPermission(c));
}

const permission: Directive = {
  mounted(el: HTMLElement, binding) {
    if (hasAccess(binding)) return;
    if (binding.modifiers.disable) {
      disableEl(el);
    } else {
      el.parentNode?.removeChild(el);
    }
  },
  // 仅 .disable 模式需要：组件重渲染后重新施加权限禁用（覆盖业务 :disabled 的重置）
  updated(el: HTMLElement, binding) {
    if (!binding.modifiers.disable) return;
    if (!hasAccess(binding)) disableEl(el);
  },
};

export function setupDirectives(app: App) {
  app.directive('permission', permission);
}
