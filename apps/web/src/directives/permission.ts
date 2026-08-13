import type { App, Directive } from 'vue';
import { useUserStore } from '@/stores/user';

/**
 * 按钮权限指令（前端控制 + 后端二次校验）
 *
 *   v-permission="'order:create'"          无权限时禁用并置灰（默认）
 *   v-permission="['plan:list','plan:x']"  数组为 OR：拥有其一即可用
 *   v-permission.disable="'order:update'"  与默认等价，保留以兼容既有写法
 *   v-permission.hide="'system:danger'"    无权限时移除元素
 *
 * 默认「禁用」而非「隐藏」：按钮藏起来会让用户以为系统没有这个功能，
 * 转而去问同事或提工单；留一个灰按钮，他知道功能存在、只是自己没被授权，
 * 直接去找管理员要权限即可。工具栏按钮数量也不再随角色变化，界面稳定。
 *
 * `.hide` 只用于「禁用讲不通」的容器型元素——典型是 el-tab-pane：
 * 页签由 el-tabs 头部另行渲染，禁用面板 div 拦不住用户切到该页签。
 *
 * 注意：禁用模式带 updated 钩子重新校验。按钮常同时带响应式 :disabled
 * （业务状态），组件重渲染会把 disabled 重置，需在每次 updated 后重新
 * 施加权限禁用，防止无权限按钮被业务态「复活」。
 */

/** 原生 disabled 只对表单控件生效，其余标签要另行兜底 */
const FORM_TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'FIELDSET']);

/**
 * 置灰且点不动。
 *
 * 用原生 disabled 而不是「捕获阶段拦 click」：事件到达目标元素后，该元素上的
 * capture 与 bubble 监听器同在 AT_TARGET 阶段按注册顺序执行，而 Vue 的 @click
 * 在渲染时就绑好了、早于指令 mounted，拦截器根本轮不到先跑。disabled 则让浏览器
 * 压根不派发 click，可靠。
 *
 * 不设 pointer-events:none（非表单元素除外）：它会让 cursor:not-allowed 一起失效，
 * 用户连「这里点不动」的光标反馈都没有。
 */
function disableEl(el: HTMLElement) {
  el.setAttribute('disabled', 'disabled');
  el.setAttribute('aria-disabled', 'true');
  el.classList.add('is-disabled');
  el.style.cursor = 'not-allowed';
  el.setAttribute('title', '无操作权限');
  if (!FORM_TAGS.has(el.tagName)) el.style.pointerEvents = 'none';
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
    if (binding.modifiers.hide) {
      el.parentNode?.removeChild(el);
    } else {
      disableEl(el);
    }
  },
  // 仅禁用模式需要：组件重渲染后重新施加权限禁用（覆盖业务 :disabled 的重置）
  updated(el: HTMLElement, binding) {
    if (binding.modifiers.hide) return;
    if (!hasAccess(binding)) disableEl(el);
  },
};

export function setupDirectives(app: App) {
  app.directive('permission', permission);
}
