import { ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { EXPORT_ROW_LIMIT } from '@hb-oms/shared';
import { readBlobError } from '@/utils/download';

/**
 * 「预检 → 确认 → 导出」的通用流程。
 *
 * 顺序是刻意的：**先查有没有记录，有才提醒用户确认**。反过来（先弹确认框、
 * 点完确认才发现服务端说「没有数据可导出」）等于让人确认一件注定失败的事。
 * 同理超出行数上限也在确认前就拦下。
 *
 * 条数**每次实查**而不是用页面上的汇总值：用户改了筛选条件但没点「查询」时，
 * 页面汇总还是上一次的数，拿它去提示会和实际导出的内容对不上。
 *
 * 导出走 blob 响应，服务端拒绝时错误体也是 blob，直接读会得到「[object Blob]」
 * 而不是中文原因——统一用 readBlobError 还原，各页面不要再自己 try/catch 一遍。
 */
export function useExcelExport() {
  /** 预检与下载共用一个 loading，按钮从点击到结束一直是禁用态 */
  const exporting = ref(false);

  /**
   * @param name     导出对象的名字，用于提示文案，如「呆滞品」
   * @param getCount 按**当前**筛选条件取记录数；导出前实查一次。
   *                 不传则跳过预检，直接进确认（服务端仍会兜底拦空）
   * @param run      实际的下载函数（api/xxx.ts 里的 downloadXxxExport）
   */
  async function exportWithConfirm(opts: {
    name: string;
    getCount?: () => Promise<number>;
    /** 自定义确认框正文首句（如「导出选中的 N 条」）；不传用默认的「按当前筛选条件导出 N 条」 */
    scopeText?: (count: number) => string;
    run: () => Promise<void>;
  }): Promise<void> {
    exporting.value = true;
    let count: number | undefined;

    try {
      // ---------- 1. 预检：有没有记录、会不会超限 ----------
      if (opts.getCount) {
        try {
          count = await opts.getCount();
        } catch {
          ElMessage.error('无法获取当前筛选的记录数，请重试');
          return;
        }

        if (!count) {
          // 空结果直接告诉用户怎么办，不弹确认框——没什么可确认的
          ElMessage.warning(`当前筛选条件下没有${opts.name}记录可导出，请调整筛选条件后重试`);
          return;
        }
        if (count > EXPORT_ROW_LIMIT) {
          ElMessage.warning(
            `当前筛选命中 ${count} 条，超过单次导出上限 ${EXPORT_ROW_LIMIT} 条，请缩小筛选范围后重试`,
          );
          return;
        }
      }

      // ---------- 2. 确认 ----------
      let scope: string;
      if (opts.scopeText && count !== undefined) scope = opts.scopeText(count);
      else if (count === undefined) scope = '按当前筛选条件导出';
      else scope = `按当前筛选条件导出 <b>${count}</b> 条${opts.name}记录`;
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

      // ---------- 3. 导出 ----------
      try {
        await opts.run();
        ElMessage.success('导出已开始，请查看浏览器下载');
      } catch (err) {
        ElMessage.error(await readBlobError(err));
      }
    } finally {
      exporting.value = false;
    }
  }

  return { exporting, exportWithConfirm };
}
