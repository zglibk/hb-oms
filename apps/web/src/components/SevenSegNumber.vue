<script setup lang="ts">
/**
 * 将整数拆成若干位七段数码；pad 时补前导零（时分秒用）。
 */
import { computed } from 'vue';
import SevenSegDigit from './SevenSegDigit.vue';

const props = withDefaults(
  defineProps<{
    value: number;
    /** 固定位数（不足补 0）；不传则按实际位数 */
    pad?: number;
  }>(),
  { pad: 0 },
);

const chars = computed(() => {
  const n = Math.max(0, Math.floor(Number(props.value) || 0));
  let s = String(n);
  if (props.pad > 0) s = s.padStart(props.pad, '0');
  return s.split('');
});
</script>

<template>
  <span class="seven-seg-num" role="img" :aria-label="String(Math.max(0, Math.floor(value)))">
    <SevenSegDigit
      v-for="(d, i) in chars"
      :key="`${i}-${d}`"
      :digit="d"
      :flip-key="`${i}-${d}`"
    />
  </span>
</template>

<style scoped lang="scss">
.seven-seg-num {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  vertical-align: middle;
}
</style>
