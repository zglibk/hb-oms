import { SetMetadata } from '@nestjs/common';

/** 标记接口跳过统一响应包装（如 wangEditor 图片上传需返回原始格式） */
export const SKIP_TRANSFORM_KEY = 'skipTransform';
export const SkipTransform = () => SetMetadata(SKIP_TRANSFORM_KEY, true);
