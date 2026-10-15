<template>
  <article class="print-sheet preprinted-sheet" :style="sheetStyle">
    <template v-for="item in config.layout?.elements || []" :key="item.id">
      <div v-if="item.type !== 'table'" class="placed-field" :style="elementStyle(item)">
        {{ fieldText(item) }}
      </div>
      <table v-else class="placed-table" :style="elementStyle(item)">
        <colgroup><col v-for="c in item.columns" :key="c.field" :style="{ width: `${c.widthPct}%` }" /></colgroup>
        <thead v-if="item.showHeader"><tr><th v-for="c in item.columns" :key="c.field">{{ c.label }}</th></tr></thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="index" :style="{ height: `${item.rowHeightMm}mm` }">
            <td v-for="c in item.columns" :key="c.field" :style="{ textAlign: c.align }">{{ rowValue(row, c.field, index) }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PrintLayoutField, PrintProfileConfig } from '@/api/print-config';
import { printPaperBodyOf } from '@/utils/print-paper';

const props = defineProps<{
  config: PrintProfileConfig;
  note: Record<string, any>;
  rows: Array<Record<string, any>>;
}>();

const sheetStyle = computed(() => {
  const body = printPaperBodyOf(props.config.paper);
  return {
    '--paper-width': `${body.widthMm}mm`, '--paper-height': `${body.heightMm}mm`,
    '--page-offset-x': `${body.offsetXmm}mm`, '--page-offset-y': `${body.offsetYmm}mm`,
    '--offset-x': `${props.config.offset.x}mm`, '--offset-y': `${props.config.offset.y}mm`,
    '--font-scale': String(props.config.style.fontScale / 100),
  };
});

function elementStyle(item: any) {
  return {
    left: `calc(${item.xMm}mm + var(--offset-x))`, top: `calc(${item.yMm}mm + var(--offset-y))`,
    width: `${item.widthMm}mm`, height: `${item.heightMm}mm`,
    fontSize: item.type === 'table' ? undefined : `${item.fontSizePt}pt`,
    fontWeight: item.type === 'table' ? undefined : item.fontWeight,
    textAlign: item.type === 'table' ? undefined : item.align,
  };
}

function fieldText(item: PrintLayoutField) {
  if (item.type === 'staticText') return item.text || '';
  const value = item.field?.split('.').reduce<any>((obj, key) => obj?.[key], props.note);
  return String(value ?? '');
}

function rowValue(row: Record<string, any>, field: string, index: number) {
  if (field === 'seq') return String(row.seq ?? index + 1);
  return String(field.split('.').reduce<any>((obj, key) => obj?.[key], row) ?? '');
}
</script>

<style scoped>
.print-sheet {
  position: relative;
  box-sizing: border-box;
  width: var(--paper-width);
  height: var(--paper-height);
  min-height: var(--paper-height);
  margin: 0 auto 12mm;
  overflow: hidden;
  background: #fff;
  color: #111;
  font-family: SimSun, 'Songti SC', 'Noto Serif CJK SC', 'Noto Sans CJK SC', 'Microsoft YaHei', serif;
  font-size: calc(12px * var(--font-scale, 1));
}
.placed-field, .placed-table { position: absolute; box-sizing: border-box; overflow: hidden; }
.placed-field { white-space: pre-wrap; line-height: 1.2; }
.placed-table { border-collapse: collapse; table-layout: fixed; }
.placed-table th, .placed-table td { padding: 0 .8mm; border: 0; vertical-align: middle; overflow: hidden; }
@media print {
  .print-sheet { margin: var(--page-offset-y, 0) auto 0; break-after: page; print-color-adjust: exact; }
}
</style>
