/**
 * @hb-oms/shared —— 前后端共享常量与纯函数入口。
 *
 * 收录原则（沿袭 hb-mes CLAUDE.md §4.1）：
 *   凡是前后端都需要、且必须口径一致的**纯常量/纯函数**（业务状态枚举、
 *   单位换算、产品类型组合、部件/边别口径），一律放本包，两端 re-export 消费；
 *   禁止在 apps/server 与 apps/web 各自重复定义。
 * 不收录：依赖 NestJS/Vue/Element Plus 的任何代码。
 */
export * from './business-status';
export * from './unit';
export * from './product-type';
export * from './rail';
export * from './version';
export * from './outsource';
export * from './assembly';
export * from './employee-code';
export * from './position';
export * from './export';
