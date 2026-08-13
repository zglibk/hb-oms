import request from '@/utils/request';

/**
 * 走 blob 下载并触发浏览器保存（**与文件类型无关**，xlsx / pdf 通用）。
 *
 * 文件名优先取响应头 `Content-Disposition` 里的 `filename*=UTF-8''`（服务端 sendXlsx
 * 统一按 RFC 5987 编码中文名），取不到再用调用方给的兜底名。
 *
 * 之所以要 `__raw`：request.ts 的拦截器默认解包 `ApiResult`，而文件流不是那个结构，
 * 必须拿到原始响应才能读到响应头。
 */
export async function downloadFile(
  url: string,
  params: any,
  fallbackName: string,
): Promise<void> {
  const resp: any = await request.get(url, { params, responseType: 'blob', __raw: true } as any);
  const blob: Blob = resp.data ?? resp;
  const disposition: string | undefined = resp.headers?.['content-disposition'];

  let filename = fallbackName;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition || '');
  if (star?.[1]) {
    try {
      filename = decodeURIComponent(star[1]);
    } catch {
      /* 头部异常时用兜底名，不影响下载 */
    }
  }

  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(objectUrl);
}

/**
 * Excel 导出沿用的名字（实现即上面的通用下载）。
 * 保留别名而不是全量改调用点：现役 9 个导出端点都在用它，改名收益为零、改错风险不小。
 */
export const downloadXlsx = downloadFile;

/**
 * 导出接口失败时，服务端返回的是 **blob 形态的 JSON 错误体**（因为请求声明了
 * responseType: 'blob'），直接读会得到「[object Blob]」而不是中文原因。
 * 这里把它读回文本再解析，拿到服务端那句可操作的提示（如「超过单次导出上限」）。
 */
export async function readBlobError(err: any): Promise<string> {
  const blob = err?.response?.data ?? err?.data;
  if (blob instanceof Blob) {
    try {
      const text = await blob.text();
      const json = JSON.parse(text);
      return json?.message || '导出失败';
    } catch {
      return '导出失败';
    }
  }
  return err?.message || '导出失败';
}
