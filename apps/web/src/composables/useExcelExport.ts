import { ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { readBlobError } from '@/utils/download';

/**
 * 「确认 → 导出」的通用流程。
 *
 * 导出走的是 blob 响应，服务端拒绝时（无数据 / 超行数上限）返回的错误体也是 blob，
 * 直接读会得到「[object Blob]」而不是中文原因——这里统一用 readBlobError 还原，
 * 各页面不要再自己 try/catch 一遍（§一：禁止在页面内重复造轮子）。
 */
export function useExcelExport() {
  const exporting = ref(false);

  /**
   * @param name  导出对象的名字，用于确认文案，如「呆滞品」
   * @param count 当前筛选命中的行数；传了会在确认框里显示，让用户先看清导多少条
   * @param run   实际的下载函数（api/xxx.ts 里的 downloadXxxExport）
   */
  async function exportWithConfirm(opts: {
    name: string;
    count?: number;
    run: () => Promise<void>;
  }): Promise<void> {
    const scope = opts.count === undefined
      ? '按当前筛选条件导出'
      : `按当前筛选条件导出 <b>${opts.count}</b> 条${opts.name}记录`;
    try {
      await ElMessageBox.confirm(
        `${scope}。<br/>导出的是<b>当前筛选结果</b>而不是全部数据，如需完整数据请先清空筛选条件。`,
        '确认导出',
        {
          type: 'info',
          dangerouslyUseHTMLString: true,
          confirmButtonText: '确认导出',
          cancelButtonText: '取消',
        },
      );
    } catch {
      return; // 用户取消
    }

    exporting.value = true;
    try {
      await opts.run();
      ElMessage.success('导出已开始，请查看浏览器下载');
    } catch (err) {
      ElMessage.error(await readBlobError(err));
    } finally {
      exporting.value = false;
    }
  }

  return { exporting, exportWithConfirm };
}
