<script setup lang="ts">
/**
 * 七段数码管单字（0–9），风格参考电子表：亮段霓虹绿、暗段幽灵灰、深底。
 * 倒计时各位用 :key 切换时会整段重挂，形成「换图」效果。
 */
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{ digit: number | string; flipKey?: string | number }>(),
  { flipKey: '' },
);

type Seg = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g';

/** 标准七段：a 顶 / b 右上 / c 右下 / d 底 / e 左下 / f 左上 / g 中 */
const ON: Record<string, ReadonlySet<Seg>> = {
  '0': new Set(['a', 'b', 'c', 'd', 'e', 'f']),
  '1': new Set(['b', 'c']),
  '2': new Set(['a', 'b', 'd', 'e', 'g']),
  '3': new Set(['a', 'b', 'c', 'd', 'g']),
  '4': new Set(['b', 'c', 'f', 'g']),
  '5': new Set(['a', 'c', 'd', 'f', 'g']),
  '6': new Set(['a', 'c', 'd', 'e', 'f', 'g']),
  '7': new Set(['a', 'b', 'c']),
  '8': new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g']),
  '9': new Set(['a', 'b', 'c', 'd', 'f', 'g']),
};

const ch = computed(() => String(props.digit).replace(/\D/g, '').slice(-1) || '0');
const active = computed(() => ON[ch.value] ?? ON['0']);

function isOn(s: Seg) {
  return active.value.has(s);
}
</script>

<template>
  <svg
    class="seven-seg"
    viewBox="0 0 44 72"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    :key="`${ch}-${flipKey}`"
  >
    <rect class="seven-seg__bg" x="0" y="0" width="44" height="72" rx="4" ry="4" />
    <polygon class="seg" :class="{ 'is-on': isOn('a') }" points="10,6 34,6 30,11 14,11" />
    <polygon class="seg" :class="{ 'is-on': isOn('b') }" points="35,7 39,11 39,31 35,35 31,31 31,11" />
    <polygon class="seg" :class="{ 'is-on': isOn('c') }" points="35,37 39,41 39,61 35,65 31,61 31,41" />
    <polygon class="seg" :class="{ 'is-on': isOn('d') }" points="14,61 30,61 34,66 10,66" />
    <polygon class="seg" :class="{ 'is-on': isOn('e') }" points="9,37 13,41 13,61 9,65 5,61 5,41" />
    <polygon class="seg" :class="{ 'is-on': isOn('f') }" points="9,7 13,11 13,31 9,35 5,31 5,11" />
    <polygon class="seg" :class="{ 'is-on': isOn('g') }" points="14,34 30,34 34,36 30,38 14,38 10,36" />
  </svg>
</template>

<style scoped lang="scss">
.seven-seg {
  display: block;
  width: 12px;
  height: 20px;
  flex-shrink: 0;
  animation: seven-seg-pop 0.18s ease;
}
.seven-seg__bg {
  fill: #2a2e33;
}
.seg {
  fill: #3a4048;
  &.is-on {
    fill: #b8f000;
    filter: drop-shadow(0 0 1px rgba(184, 240, 0, 0.55));
  }
}
@keyframes seven-seg-pop {
  from { opacity: 0.35; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1); }
}
</style>
