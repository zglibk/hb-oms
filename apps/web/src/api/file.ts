import service from '@/utils/request';
import { normalizeUploadUrl } from '@/utils/upload-url';

/**
 * 上传单个文件到通用接口，返回服务器访问 URL。
 * @param file     要上传的 File 对象
 * @param bizType  业务类型标识（如 order_front_mark、editor_image）
 */
export async function uploadFile(file: File, bizType: string): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('bizType', bizType);
  const res: any = await service.post('/api/upload', fd);
  return normalizeUploadUrl(res.url) || '';
}
