import { onActivated, onBeforeUnmount, onDeactivated, ref } from 'vue';

interface AutoScrollOptions {
  /** 滚动速度（px/秒），车间大屏远看时 20~30 比较跟得上 */
  speed?: number;
  /** 到顶 / 到底后的停顿时长（ms），给人看清首尾行的时间 */
  holdMs?: number;
}

/**
 * 列表内容超出可见高度时自动匀速向下滚动，到底后回到顶部循环，鼠标移入暂停。
 *
 * 用在首页几张待办卡（逾期未发货 / 临近交期 / 近期外发回厂）：内容超出卡片给的
 * 高度时靠滚动轮播，不必把首页拉得很长。
 *
 * **只向下滚，到底停一下直接跳回顶部**（2026-08-13 修）：原实现到底后原速往回卷，
 * 看着像录像倒放，且同一批行来回扫两遍，使用方反馈是 bug。跳回顶部是滚动播报的
 * 常规做法——顶部也停顿一次，避免刚跳回就立刻开滚、让人看不清第一行。
 *
 * 几个实现要点：
 * - 位置自己累加（`pos`）而不是每帧读 `scrollTop`：慢速下每帧位移不到 1px，
 *   浏览器把 scrollTop 取整后会原地不动，越滚越慢直到卡住。
 * - 恢复滚动时才从 `scrollTop` 同步一次，接住用户手动滚过的位置。
 * - 内容没超出（`max <= 1`）就完全不动，避免空列表里出现微小抖动。
 */
export function useAutoScroll(
  resolveEl: () => HTMLElement | null | undefined,
  options: AutoScrollOptions = {},
) {
  const speed = options.speed ?? 26;
  const holdMs = options.holdMs ?? 1400;

  const paused = ref(false);
  let raf = 0;
  let prevTs = 0;
  let holdUntil = 0;
  /** 已滚到底、正在底部停顿：停顿结束后跳回顶部 */
  let atEnd = false;
  let pos = 0;
  let needSync = false;

  function tick(ts: number) {
    raf = requestAnimationFrame(tick);
    const el = resolveEl();
    const dt = prevTs ? (ts - prevTs) / 1000 : 0;
    prevTs = ts;
    if (!el || paused.value || ts < holdUntil) return;

    const max = el.scrollHeight - el.clientHeight;
    if (max <= 1) {
      pos = 0;
      atEnd = false;
      return;
    }
    if (needSync) {
      pos = el.scrollTop;
      needSync = false;
    }

    // 底部停顿结束：瞬间回到顶部，并在顶部再停一次（否则刚跳回就开滚，第一行看不清）
    if (atEnd) {
      atEnd = false;
      pos = 0;
      el.scrollTop = 0;
      holdUntil = ts + holdMs;
      return;
    }

    // dt 上限兜住标签页切回来的一次巨大时间差，否则会瞬间冲到底
    pos = Math.min(max, pos + speed * Math.min(dt, 0.1));
    el.scrollTop = pos;

    if (pos >= max) {
      atEnd = true;
      holdUntil = ts + holdMs;
    }
  }

  function start() {
    if (raf) return;
    prevTs = 0;
    needSync = true;
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function pause() {
    paused.value = true;
  }

  function resume() {
    paused.value = false;
    needSync = true;
    prevTs = 0;
  }

  /** 数据或页签切换后回到顶部重新开始 */
  function reset() {
    pos = 0;
    atEnd = false;
    holdUntil = 0;
    prevTs = 0;
    const el = resolveEl();
    if (el) el.scrollTop = 0;
  }

  // keep-alive 下切走就停，省掉看不见的列表白跑动画
  onDeactivated(stop);
  onActivated(start);
  onBeforeUnmount(stop);

  return { paused, start, stop, pause, resume, reset };
}
