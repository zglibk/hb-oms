<template>
  <!-- inline：单号列旁的小图标，悬浮出气泡（列表页用，不占列宽） -->
  <el-tooltip
    v-if="mode === 'inline'"
    placement="top"
    effect="dark"
    :show-after="200"
  >
    <template #content>
      <div class="audit-pop">
        <div v-for="line in lines" :key="line.label">
          <span class="audit-pop__label">{{ line.label }}</span>{{ line.value }}
        </div>
      </div>
    </template>
    <el-icon class="audit-icon"><InfoFilled /></el-icon>
  </el-tooltip>

  <!-- block：详情/表单页底部的独立审计条 -->
  <el-descriptions
    v-else
    :column="column"
    border
    size="small"
    class="audit-block"
  >
    <el-descriptions-item
      v-for="line in lines"
      :key="line.label"
      :label="line.label"
    >
      {{ line.value }}
    </el-descriptions-item>
  </el-descriptions>
</template>

<script setup lang="ts">
/**
 * 审计追溯统一展示组件。
 *
 * 后端主干业务表都带 creator_name / updater_name / created_at / updated_at
 * （见 CLAUDE.md §5.5），本组件是唯一展示入口，两种形态共用同一份取值与
 * 占位逻辑，免得各页面重复拼 `xxx || '—'`：
 *   mode="block"（默认）—— 详情/表单页底部独立成条；
 *   mode="inline"       —— 列表页单号列旁的信息图标，悬浮显示，不占列宽。
 *
 * 【为什么不做成能塞进调用方 el-descriptions 的子项】
 * el-descriptions 只从自己默认插槽的 vnode 里收集 type.name === 'ElDescriptionsItem'
 * 的节点，组件包装后是一个 AuditInfo vnode，收集不到、整块不渲染。
 * 故本组件自带一个 el-descriptions，作为主信息块下方的独立审计条。
 *
 * 姓名取的是**操作当时的快照**而非实时关联用户表：用户停用/删除后仍可追溯。
 */
import { computed } from 'vue';
import { InfoFilled } from '@element-plus/icons-vue';
import { formatDateTime } from '@/utils/date';
import { useResponsive } from '@/composables/useResponsive';

const props = withDefaults(
  defineProps<{
    /** 任意带审计字段的记录行；字段缺失时统一显示占位符 */
    row?: Record<string, any> | null;
    mode?: 'block' | 'inline';
    /** 强制列数；窄栏传 1，否则按屏宽自适应 */
    column?: number | null;
  }>(),
  { row: null, mode: 'block', column: null },
);

const { width } = useResponsive();
const column = computed(() => {
  if (props.column) return props.column;
  if (width.value >= 1366) return 4;
  return width.value >= 768 ? 2 : 1;
});

const DASH = '—';
const text = (v: unknown) => (v == null || v === '' ? DASH : String(v));
const time = (v: unknown) => (v ? formatDateTime(v as string) : DASH);

const lines = computed(() => [
  { label: '创建人', value: text(props.row?.creatorName) },
  { label: '创建时间', value: time(props.row?.createdAt) },
  { label: '最后更新人', value: text(props.row?.updaterName) },
  { label: '更新时间', value: time(props.row?.updatedAt) },
]);
</script>

<style scoped lang="scss">
.audit-icon {
  margin-left: 4px;
  color: var(--el-text-color-placeholder);
  cursor: help;
  vertical-align: -1px;
  font-size: 13px;

  &:hover {
    color: var(--el-color-primary);
  }
}

.audit-pop {
  line-height: 1.7;

  &__label {
    display: inline-block;
    min-width: 5.5em;
    color: var(--el-text-color-secondary);

    &::after {
      content: '：';
    }
  }
}

.audit-block {
  margin-top: 12px;

  :deep(.el-descriptions__label) {
    color: var(--el-text-color-secondary);
  }
}
</style>
