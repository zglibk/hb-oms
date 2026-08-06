<script lang="ts">
import { defineComponent, h, ref, type VNode } from 'vue';
import { ElTable, ElTableColumn, type TableInstance } from 'element-plus';

/**
 * 列表统一封装：
 * 1. 首列自动追加「序号」列；若存在功能列（type="selection" 复选框 /
 *    type="expand" 行展开，可同时存在），序号列排在最后一个功能列之后，
 *    保证展开箭头/复选框始终位于最左侧；
 * 2. 带子项的记录行（tree / type="expand"）做手风琴：同层级最多展开一组。
 * 用法与 el-table 完全一致，额外属性/事件/列均原样透传。
 */
export default defineComponent({
  name: 'AppTable',
  inheritAttrs: false,
  props: {
    /** 是否显示序号列 */
    serial: { type: Boolean, default: true },
    serialLabel: { type: String, default: '序号' },
    serialWidth: { type: Number, default: 60 },
    /** 传入当前页码与页容量则序号跨页连续，否则每页从 1 开始 */
    page: { type: Number, default: 0 },
    pageSize: { type: Number, default: 0 },
    /** 带子项的行是否手风琴（同层最多展开一组） */
    accordion: { type: Boolean, default: true },
  },
  emits: ['expand-change'],
  setup(props, { attrs, slots, emit, expose }) {
    const tableRef = ref<TableInstance>();

    /** 序号计算：分页连续 or 每页从 1 开始 */
    const indexMethod = (i: number) =>
      props.page && props.pageSize
        ? (props.page - 1) * props.pageSize + i + 1
        : i + 1;

    // ---- 手风琴展开 ----
    const rowKeyField = () => (attrs['row-key'] as string) || 'id';
    const childrenField = () => {
      const tp = attrs['tree-props'] as { children?: string } | undefined;
      return tp?.children || 'children';
    };

    /** 在树形数据中找到 target 所在的兄弟数组 */
    function findSiblings(target: any): any[] {
      const key = rowKeyField();
      const cf = childrenField();
      const data = (attrs.data as any[]) || [];
      let found: any[] = [];
      const walk = (arr: any[]): boolean => {
        if (arr.some((n) => n[key] === target[key])) {
          found = arr;
          return true;
        }
        return arr.some((n) => Array.isArray(n[cf]) && walk(n[cf]));
      };
      walk(data);
      return found;
    }

    function onExpandChange(row: any, expanded: any) {
      // 懒加载树（lazy + load）的展开状态由 Element Plus 内部 treeData 维护，
      // 与 expandRows 不是同一套机制。此时调用 toggleRowExpansion 去收起兄弟行，
      // 会触碰尚未加载或已卸载的子节点 DOM，抛出
      // "Cannot set properties of null (setting '__vnode')"。
      // 故懒加载模式下跳过手风琴处理，交由使用方自行控制展开行为。
      const isLazyTree = (attrs as any).lazy !== undefined && (attrs as any).lazy !== false;
      if (props.accordion && tableRef.value && !isLazyTree) {
        const key = rowKeyField();
        if (typeof expanded === 'boolean') {
          // 树形：展开某行时收起同层其它行
          if (expanded) {
            findSiblings(row).forEach((s) => {
              if (s[key] !== row[key]) {
                tableRef.value!.toggleRowExpansion(s, false);
              }
            });
          }
        } else if (Array.isArray(expanded) && expanded.length > 1) {
          // 展开行（type=expand）：仅保留当前展开行
          expanded.forEach((r) => {
            if (r !== row) tableRef.value!.toggleRowExpansion(r, false);
          });
        }
      }
      emit('expand-change', row, expanded);
    }

    expose({ tableRef });

    /** 判断某个 vnode 是否功能列（复选框/行展开），序号列须排其后 */
    const isFunctionalColumn = (v: VNode) => {
      const t = (v as any)?.props?.type;
      return t === 'selection' || t === 'expand';
    };

    /** 判断某个 vnode 是否左固定列 */
    const isFixedLeftColumn = (v: VNode) => {
      const p = (v as any)?.props;
      if (!p) return false;
      // 兼容字符串/布尔写法：fixed="left" / fixed / :fixed="true"
      return p.fixed === 'left' || p.fixed === true || p.fixed === '';
    };

    return () => {
      const cols = slots.default ? [...slots.default()] : [];

      if (props.serial) {
        // 若存在左固定列，序号列同步设为 fixed="left"，避免 Element Plus
        // 先渲染 fixed 列导致序号被挤到固定列之后（视觉上出现在第 2 列）。
        const hasFixedLeft = cols.some(isFixedLeftColumn);
        const indexCol = h(ElTableColumn, {
          type: 'index',
          label: props.serialLabel,
          width: props.serialWidth,
          index: indexMethod,
          align: 'center',
          ...(hasFixedLeft ? { fixed: 'left' } : {}),
        });
        // 若存在功能列（行展开/复选框，可能同时存在），序号列插在最后一个功能列之后；
        // 否则置于首列——保证展开箭头/复选框始终占据最左侧
        let lastFnIdx = -1;
        cols.forEach((c, i) => {
          if (isFunctionalColumn(c)) lastFnIdx = i;
        });
        if (lastFnIdx >= 0) cols.splice(lastFnIdx + 1, 0, indexCol);
        else cols.unshift(indexCol);
      }

      // 透传除 default 外的具名插槽（如 empty / append）
      const forwarded: Record<string, unknown> = {};
      for (const name in slots) {
        if (name !== 'default') forwarded[name] = slots[name];
      }

      return h(
        ElTable,
        { ref: tableRef, ...attrs, onExpandChange },
        { default: () => cols, ...forwarded },
      );
    };
  },
});
</script>
