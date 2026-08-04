<script lang="ts">
import {
  defineComponent,
  h,
  ref,
  Comment,
  Text,
  Fragment,
  type VNode,
} from 'vue';
import { ElButton, ElDropdown, ElIcon } from 'element-plus';
import { ArrowDown } from '@element-plus/icons-vue';

/**
 * 操作列按钮组统一封装：
 *   - 按钮数 ≤ max（默认 3）：全部平铺
 *   - 按钮数 > max：保留前 inline（默认 2）个，其余收进「更多▾」下拉
 *
 * 下拉里渲染的是原始按钮 vnode，因此 v-permission.disable 指令、
 * :disabled 业务态、@click 处理器全部原样保留，不丢权限校验。
 *
 * 用法：
 *   <el-table-column label="操作">
 *     <template #default="{ row }">
 *       <app-actions>
 *         <el-button ...>详情</el-button>
 *         <el-button ...>编辑</el-button>
 *         ...
 *       </app-actions>
 *     </template>
 *   </el-table-column>
 */

/** 展平插槽 vnode，剔除注释与纯空白文本，Fragment 递归展开 */
function flattenVNodes(nodes: VNode[]): VNode[] {
  const out: VNode[] = [];
  for (const node of nodes) {
    if (!node || node.type === Comment) continue;
    if (node.type === Text) {
      const text = String(node.children ?? '').trim();
      if (!text) continue;
      out.push(node);
      continue;
    }
    if (node.type === Fragment && Array.isArray(node.children)) {
      out.push(...flattenVNodes(node.children as VNode[]));
      continue;
    }
    out.push(node);
  }
  return out;
}

export default defineComponent({
  name: 'AppActions',
  props: {
    /** 超过该数量才折叠 */
    max: { type: Number, default: 3 },
    /** 折叠时保留在外侧的按钮个数 */
    inline: { type: Number, default: 2 },
  },
  setup(props, { slots }) {
    const dropdownRef = ref<any>();

    return () => {
      const all = flattenVNodes(slots.default ? slots.default() : []);

      // 数量不超阈值：全部平铺
      if (all.length <= props.max) return all;

      const head = all.slice(0, props.inline);
      const rest = all.slice(props.inline);

      const trigger = h(
        ElButton,
        { link: true, type: 'primary', class: 'app-actions__more' },
        () => [
          '更多',
          h(ElIcon, { class: 'app-actions__arrow', 'aria-hidden': true }, () => h(ArrowDown)),
        ],
      );

      // 点击面板任意处后关闭下拉（原始按钮的 onClick 会先触发）
      const menu = h(
        'div',
        {
          class: 'app-actions-menu',
          onClick: () => dropdownRef.value?.handleClose?.(),
        },
        rest,
      );

      const dropdown = h(
        ElDropdown,
        {
          ref: dropdownRef,
          trigger: 'click',
          popperClass: 'app-actions-dropdown',
        },
        { default: () => trigger, dropdown: () => menu },
      );

      return [...head, dropdown];
    };
  },
});
</script>
