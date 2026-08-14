import { onBeforeUnmount, onDeactivated } from 'vue';

/**
 * 关键字动态查询：连续输入期间只保留最后一次查询，清空关键字时立即刷新。
 * `flush` 供查询按钮或表单回车使用，会先取消尚未执行的防抖任务，避免重复请求。
 */
export function useDebouncedSearch(
  search: () => void | Promise<void>,
  delay = 300,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function cancel() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function run() {
    cancel();
    void search();
  }

  function schedule(value: unknown) {
    cancel();
    if (!String(value ?? '').trim()) {
      void search();
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      void search();
    }, delay);
  }

  onBeforeUnmount(cancel);
  // 列表页面可能使用 keep-alive；离开页面时不要让尚未触发的查询在后台继续执行。
  onDeactivated(cancel);
  return { schedule, flush: run, cancel };
}
