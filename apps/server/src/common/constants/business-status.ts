/**
 * 业务状态枚举——定义在共享包 `@hb-oms/shared`（packages/shared/src/business-status.ts），
 * 前后端共用同一份数值与中文文案，杜绝双套定义漂移。
 *
 * 本文件是后端统一引用入口（新代码可任选本文件或 `@hb-oms/shared` 引入）；
 * 常量必须保持单向依赖，禁止在 service 内定义状态常量（会造成循环引用与 DI 故障）。
 */
export * from '@hb-oms/shared';
