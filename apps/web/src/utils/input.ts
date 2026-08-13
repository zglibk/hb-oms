import type { App } from 'vue';
import { defineComponent, h, ref } from 'vue';
import { ElInput } from 'element-plus';

/** 裸写的属性（如 `show-password`）值为空串，仅 `:x="false"` 才算显式关闭 */
function isOn(value: unknown): boolean {
  return value !== undefined && value !== false && value !== 'false';
}

/**
 * 这些形态不自动补 clearable：
 * - textarea：EP 不渲染 suffix 区域，清除图标无处安放
 * - 密码框：清除整串密码的价值低，且与「显示密码」眼睛图标并列显得拥挤
 * - 自带 #suffix 插槽：插槽内容（如数量框的单位后缀）会与清除图标争同一块位置
 */
function skipClearable(attrs: Record<string, unknown>, hasSuffixSlot: boolean): boolean {
  const type = String(attrs.type ?? 'text');
  if (type === 'textarea' || type === 'password') return true;
  if (isOn(attrs['show-password'] ?? attrs.showPassword)) return true;
  return hasSuffixSlot;
}

/**
 * 覆盖全局 ElInput：普通文本输入框默认带清除按钮（clearable）。
 *
 * 只覆盖全局组件解析，即模板里直写的 `<el-input>`；EP 内部组件
 * （日期选择器、级联选择器、自动补全等）是直接 import ElInput 的，
 * 不走全局解析，因此它们自带的清除逻辑不受影响。
 * 个别场景要关掉，在组件上显式写 `:clearable="false"`。
 */
export function patchElInput(app: App) {
  const Patched = defineComponent({
    name: 'ElInput',
    inheritAttrs: false,
    setup(_, { attrs, slots, expose }) {
      const inputRef = ref<{ [key: string]: unknown } | null>(null);
      // 页面常取 ref 调 focus()/select()/input，原样转发实例成员
      expose(
        new Proxy(
          {},
          {
            get: (_t, key: string | symbol) => {
              const inst = inputRef.value;
              if (!inst) return undefined;
              const val = inst[key as string];
              return typeof val === 'function' ? val.bind(inst) : val;
            },
          },
        ),
      );
      return () => {
        const next = { ...attrs } as Record<string, unknown>;
        const explicit = 'clearable' in next;
        if (!explicit && !skipClearable(next, Boolean(slots.suffix))) {
          next.clearable = true;
        }
        return h(ElInput, { ...next, ref: inputRef }, slots);
      };
    },
  });
  app.component('ElInput', Patched);
}
