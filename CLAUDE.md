# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **本文件是 hb-oms 项目唯一权威规范文件。** 项目由多个 AI 模型交替开发，任何代码修改、功能开发前必须先通读本文件；实现方案与本文件冲突时，以本文件为准。
>
> 与姊妹项目 hb-mes 的关系：hb-oms 的架构范式**照搬** `D:\Project\hb-mes\CLAUDE.md`（同一套 monorepo/NestJS/Vue3/共享包/迁移/权限体系），但**业务完全独立、数据库独立、代码不共用**。两份文件冲突时，改 hb-oms 代码以本文件为准；本文件未覆盖的通用工程约定，回查 hb-mes CLAUDE.md。
>
> 结构分层：技术架构规范 → 权限体系 → 数据库迁移规范 → 统一开发强制约束 → OMS 业务规范 → 里程碑进度 → 跨会话协作约定 → 部署运维 → 待办与风险清单。

## 项目概述

海宝五金**订单跟踪系统**（hb-oms）：订单 → 外发表面处理（可选）→ 装配 → 成品入库 → 出库的全链路台账系统，核心产出是四个数——**订单数 / 完成数 / 库存数 / 双欠数**（生产欠数 = 订单数 − 累计入库；发货欠数 = 订单数 − 累计出库），替代车间现行的手工 Excel 跟踪台账。

**与 hb-mes 的定位差异（关键，决定什么该做什么不该做）**：hb-mes 是带排产与多级审核的 MES；hb-oms **彻底不做排产、不做审核流、不做报工**（设计文档决策 #2）。凡涉及"排产单/审核/报工/审批开关/大屏"的需求，一律不在本项目实现。

pnpm + turbo monorepo：

- `apps/server` —— NestJS + TypeORM + MySQL 模块化单体（`@hb-oms/server`，端口 **8100**，库 **haibao_oms**）
- `apps/web` —— Vue 3 + Element Plus + Vite（`@hb-oms/web`，dev 端口 **5174**，生产 base `/oms/admin/`）
- `packages/shared` —— 前后端共享常量与纯函数（`@hb-oms/shared`）：业务状态枚举、单位换算、产品类型组合、部件展开蓝图、外发折算的**双端唯一事实源**。双格式产物（CJS 给 Node / ESM 给 Vite）
- `site/` —— 前台静态站（Nginx `/oms/` 部署根），无需权限。**定位已锁定（2026-08-07）：只是门户**——欢迎文案 + 系统主要功能介绍 + 「进入后台管理」入口，**不展示任何业务数据**，也不再规划 Vue 化的公开数据/图表页；一切业务数据与看板都在后台。`design-doc.html` 是评审期产物，仍随站点部署（`/oms/design-doc.html` 可直接访问），但已从首页导航栏摘除
- `docs/` —— 文档站构建器（`pnpm docs:build` 把根目录设计文档 md 渲染成 HTML 挂到前台站）。**前台页面内容改这里的 `build.mjs`，不要直接编辑 `site/*.html`**——那是产物，下次构建即被覆盖
- `deploy/` —— 生产部署脚本

代码注释、提交信息、UI 文案均为中文；提交信息遵循 conventional commits（如 `feat(outsource): ...`）。根目录 [订单跟踪系统(hb-oms)设计文档-V1.0.md](./订单跟踪系统(hb-oms)设计文档-V1.0.md) 是**业务口径的权威来源**，本文件是**工程规范的权威来源**，二者互补。

> 设计文档维护约定：保持**单一首版 V1.0**，需求变化直接整合进正文，**不留修订记录、不写"原方案 X 现改为 Y"**。

## 常用命令

```bash
pnpm dev                          # 前后端并行启动（server:8100, web:5174）
pnpm dev:server / pnpm dev:web    # 单独启动（已前置构建 shared，但只构建一次不 watch）
pnpm build                        # turbo 全量构建（web 构建含 vue-tsc --noEmit 类型检查）
pnpm lint                         # eslint（server: ts；web: ts+vue）
pnpm --filter @hb-oms/shared build  # 单独构建共享包

pnpm db:migrate                   # 存量库增量迁移（幂等，可重复执行）
pnpm db:init                      # 全新建库 + 建表 + 种子（勿对已有数据库执行）

pnpm --filter server verify:ledger  # M4 台账口径核算（独立重算四数并与余额表/闸门比对）
```

共享包构建时机（易踩坑）：`pnpm dev`（根）会先构建再以 `tsc -b --watch` 跟随改动；`pnpm dev:server` / `pnpm dev:web` 只构建一次，**会话中改了共享包必须重新执行**；裸执行 `pnpm --filter @hb-oms/web dev` **不会**自动构建共享包，须先手动构建。

后端 `.env` 位于 `apps/server/.env`（模板 `.env.example`）。

---

## 一、技术架构规范

### 后端架构

- 全局路由前缀 `/api`，全局 ValidationPipe（`transform + whitelist`）。
- 全局守卫：先 `JwtAuthGuard` 后 `PermissionGuard`；开放接口用 `@Public()` 装饰器。
- 统一响应：`TransformInterceptor` 包装为 `{ code, message, data }`；文件下载等原始响应用 `@SkipTransform()`。异常统一走 `AllExceptionsFilter`（**会透传 `errors` 数组**，供批量导入返回逐行错误明细）。
- 操作日志：接口标注 `@OperationLog(模块, 动作)` 即由全局 `OperationLogInterceptor` 自动记录。
- `CommonModule` 为 `@Global()`，提供 `NumberGeneratorService`（单号采番）、`PartGroupSnapshotService`（订单部件组快照，外发/装配/成品出入库统一从它读订单侧展示字段，禁止各模块再写一份 SQL）等公共服务；审计字段统一用 `common/utils/audit.util.ts` 的 `auditOnCreate` / `auditOnUpdate`（注意：实体属性名是 `creatorId/creatorName/updaterId/updaterName`，其中 `updaterId` 映射列 `updated_by`）。
- 业务模块在 `src/modules/` 下，标准结构 `controller / service / dto / entities`。现有模块：auth、captcha（滑块验证码）、customer（客户资料）、process-info（开单信息）、order（订单四级 + **订单跟踪台账** `order-ledger.service.ts`）、outsource（外发发坯单）、assembly（装配批次）、finished-stock（成品出入库 + 余额）、equipment（设备信息）、file、changelog（更新日志）、system-config（系统配置）、system（用户/角色/菜单/字典/部件信息/部门/操作日志）。
- **GET 查询串的布尔参数必须用 `common/utils/transform.util.ts` 的 `toBoolean`**（`@IsOptional() @Transform(toBoolean) @IsBoolean()`），**不得用 `@Type(() => Boolean)`**：全局 ValidationPipe 开了 `enableImplicitConversion`，字符串 `"false"` 会被隐式转成 `true`，且 `@Transform` 拿到的 `value` 已是转换后的结果，必须从原始 `obj[key]` 取值。踩坑实例见该文件注释（装配页两个未勾选的复选框把列表从 3 条筛成 1 条）。

### 前端架构

- 路由为**后端菜单驱动的动态路由**：登录后由 `router/dynamic.ts` 将菜单树注册到 Layout 下，权限清单里的 `component` 字段（如 `'outsource/index'`）映射 `src/views/**/*.vue`。
- **非菜单子页面**（表单页/打印页/履历页）在 `router/index.ts` 的 `constantRoutes` 里静态注册，必须带 `meta.activeMenu` 指向其所属菜单路径，侧栏才会正确高亮并自动展开父级菜单（layout 已实现祖先链展开）。
- HTTP 封装在 `utils/request.ts`：自动附带 Bearer token、401 自动刷新、统一解包 `ApiResult`；API 定义按模块放 `src/api/`。
- 开发期 Vite proxy 将 `/api`、`/uploads` 代理到 `localhost:8100`；`@` 别名指向 `src/`。生产构建 `base = '/oms/admin/'`。
- 状态用 Pinia（`stores/user.ts` 含 token/权限/菜单）。
- **懒加载 chunk 失效兜底**（`router/index.ts` 的 `router.onError`）：部署脚本会 `rm -rf web-dist/assets` 再解包新产物，**发版前打开的页面**持有的旧哈希 chunk 全部消失；此时请求老 chunk 会被 Nginx 的 SPA 规则回吐 `index.html`（`Content-Type: text/html`），动态 import 因 MIME 不符而 reject，vue-router **中止导航、页面原地不动**，用户以为按钮失灵（2026-08-06 发版后实测复现，退出按钮首当其冲）。兜底逻辑识别到 chunk 加载失败即带目标路径硬跳转一次，sessionStorage 打标防死循环，导航成功后清标。**新增懒加载路由无需额外处理；但不要删掉这段 onError**。
- 通用组件优先复用 `src/components/`（`AppTable`、`AppPagination`、`AppActions`、`AppChart`、`AppStatCard` 等）与 `src/composables/`（`useDict`、`useClientPager`、`useResponsive`、`useTour`），**禁止在页面内重复造轮子**。
- **新手引导与操作手册是一对，改功能要一起改**：引导（`layout/index.vue` 的 `TOUR_STEP_DEFS`，el-tour，按业务主线高亮侧栏菜单，步骤按用户可见菜单动态过滤）与手册（`apps/web/public/manual.html`，纯静态、按业务时间线分章）**章节顺序一一对应**，引导最后一步就指向手册。**任何改动用户操作方式的功能，必须同步更新手册对应章节**；引导内容大改时递增 `useTour.ts` 的 `TOUR_DONE_KEY` 版本号（当前 `hb_mes_tour_done_v2`）让老用户重看。手册链接一律用 `${import.meta.env.BASE_URL}manual.html` 拼，**别写死**（生产 base 是 `/oms/admin/`、开发是 `/`）。
- `AppTable` 约定：序号列自动排在最后一个功能列（expand/selection）之后；展开列需显式 `fixed="left"` 才不会被固定列挤到中间。
- 主题：侧栏固定深色（底 `#1E293B`、logo 区 `#16202E`、子菜单 `#192433`、hover `#263349`、激活 `#1C3462` + 左侧 4.5px `#165DFF` 竖条），标题行下分隔线 `#334155`；「更换主题」只影响 Element 主色，不改侧栏配色。

---

## 二、权限体系（唯一事实源）

`apps/server/src/modules/system/permission-manifest.ts` 是全部权限点（菜单/按钮）的 SSOT：

- 应用启动时自动 upsert 到 `t_permission`、回填 parentId、并补授 admin，**新增权限点/改名/改父级都无需写迁移 SQL**（但授予非 admin 角色仍需迁移 SQL）。
- 后端新增 `@RequirePermissions('xxx')` 或前端 `v-permission="'xxx'"` 时，必须在该清单登记。
- `perm_type`：1=菜单 2=按钮；菜单节点的 `component` 对应前端 `src/views/` 下的组件路径。
- `access_type`：0=操作 1=查看，缺省由 `accessTypeOf()` 按「菜单=查看、按钮=操作」推导；**按钮型的读权限点必须在清单显式写 `access_type: 1`**（现役唯一一个是 `stat:dashboard`），否则角色权限树的「仅授只读」漏掉它、服务端的同页读权限补齐也认不出它。
- 现有菜单树（2026-08-07 调整后）：
  - **订单跟踪台账(4)** —— 一级叶子菜单，系统核心产出
  - 生产管理(5)：订单管理、外发管理、装配管理
  - 工艺管理(6)：开单信息
  - **物料管理(7)：成品出入库、成品库存、部件台账、期初录入** —— 成品库存口径（单据 + 结存）、部件半成品台账与上线期初
  - 设备管理(8)：设备信息
  - **基础数据(10)：客户资料、部门信息、部件信息** —— 部件信息属主数据，与出入库单据不同性质，故归此处
  - 系统管理(90)：用户/角色/菜单权限/数据字典/操作日志/更新日志/系统配置
- **调整菜单归属只改清单里的 `parent_code` + `sort`，无需迁移 SQL**：`PermissionSyncService` 第二遍对清单中**每一条**（含存量行）无条件 `update({ parentId })`，重启即生效。同理改名/改图标也只改清单。
- 一级菜单**可以是叶子**（带 component 无 children）：`dynamic.ts` 按 `component && path` 注册路由、`SidebarItem` 用 `v-else-if="menu.path"` 渲染成普通菜单项，订单跟踪台账即用此形态置顶。
- 权限变更后，相关用户需**重新登录**刷新 JWT 权限。
- **内置角色 17 个**（公司岗位编制，数据范围一律「全部」、`is_builtin=1` 不可删除）：`GEN_MGR` 总经理 / `VICE_MGR` 副总经理 / `BUS_MGR` 业务经理 / `BUS_OPR` 业务员 / `DOC_OPR` 跟单员 / `PLN_MGR` 计划经理 / `PLN_OPR` 计划员 / `PROD_MGR` 生产经理 / `PROD_OPR` 生产文员 / `WH_OPR` 仓管员 / `TECH_MGR` 技术经理 / `TECH_ENG` 技术工程师 / `QA_MGR` 品质经理 / `PQE_ENG` PQE 工程师 / `FIN_MGR` 财务经理 / `PAY_OPR` 薪资核算员 / `admin` 系统管理员。
  - **角色不像权限点那样自动同步**：`PermissionSyncService` 只管 `t_permission`，角色是种子数据（只在 `db:init` 跑），**存量库必须写迁移 SQL**。三处需同时改：`seed-data.ts` 的 `ROLES` / `ROLE_PERMISSIONS` / `USERS`、迁移 SQL、前端 `dict.ts` 的 `ROLE_MAP`。
  - **`admin` 编码不可更名**：`PermissionSyncService.grantAllToAdmin()` 按 `role_code='admin'` 定位，改名会导致 admin 不再自动获得全部权限。
  - 改角色编码要**原地 UPDATE**而非删了重建：`t_user_role` / `t_role_permission` 引用的是 `role_id`，重建会同时断掉用户分配与权限授权（2026-08-07 迁移即用此法把 salesman/merchandiser/warehouse 迁到 BUS_OPR/DOC_OPR/WH_OPR，绑定完整保留）。
  - 迁移用 `INSERT IGNORE` + `UPDATE` 的 upsert 写法：生产库可能已有管理员在界面手工建的同编码角色（实测已有 `BUS_MGR`），直接 INSERT 会撞唯一键。`status` 不在 UPDATE 之列，保留库中取值以允许临时停用。

> **命名稳定性约定**：业务侧改展示名（如「物料信息」→「部件信息」、「工艺信息」→「开单信息」）时，**只改 perm_name / 菜单文案 / 页面标题 / 表注释**；内部标识（表名 `t_material` / `t_process_info`、权限码 `material:*` / `process-info:*`、路由路径、组件路径）保持不变，避免连锁改动与历史数据割裂。
>
> ⚠️ 该约定 2026-08-07 被破过一次并留下真 bug：部件信息由「物料管理」移入「基础数据」时权限码从 `system:material` 改成了 `basic:material`，但控制器守卫仍写旧码，而旧码已不在清单里——授了新菜单的角色打开页面必 403，只是 admin 旁路把它盖住了。2026-08-08 已把守卫与前端 `v-permission` 统一到 `basic:material`，迁移清掉了库里的孤儿行。**改权限码必须全库 grep 一遍守卫与 v-permission**。

### 2.1 查看权限与只读角色（2026-08-08）

**页面读权限 = 该页菜单权限点本身**。各模块的 GET 接口一律用所属菜单码作守卫：`order` / `ledger` / `outsource` / `assembly` / `finished-stock` / `stock-balance` / `part-stock` / `basic:customer` / `basic:process-info` / `basic:material` / `equipment:info` / `system:*`。**只勾菜单、不勾按钮 = 只读角色**。

在此之前 hb-oms 的菜单权限点只控制侧栏显隐，**所有业务 GET 接口零守卫**，任意登录账号直接调 API 就能读全厂订单、台账、库存与客户资料——菜单藏起来了，数据没藏。

- **跨页引用型只读接口刻意只要求登录**（各 controller 有注释说明理由）：`/customer/all`（订单/开单信息表单的客户下拉）、`/process-info/by-drawing`（订单表单按图号带入）、`/system/material/by-code`、`/system/dept` 与 `/system/dept/tree`（用户管理选部门、角色数据范围）、`/system/dict/type/:type`（全局字典）。挂菜单码会让「录订单的人没有客户资料菜单」直接 403。作为补偿，`/customer/all` 已收窄投影，只回下拉需要的 6 个字段，联系人电话/备注/审计信息不外露。
- **一个接口服务两个页面时用 `@RequireAnyPermissions`（OR）**：`/finished-stock/group-options`（成品出入库 + 期初录入）、`/assembly/inbound-quota`（装配 + 成品出入库）、`/system/menu/tree`（菜单权限页 + 角色分配权限弹窗）。最后一个此前只认 `system:menu`，导致「只能管角色、不能改菜单」的管理员打不开分配权限弹窗。
- **首页看板** `GET /dashboard/summary` 由 `stat:dashboard` 管控（容器 `stat` 是 perm_type=2 的根节点，`buildMenuTree` 只取 perm_type=1 故侧栏不受影响）。迁移已补授全部存量角色、行为不变，可按角色收回；前端无该权限时**不发请求、不弹 403**，欢迎区与日历照常显示。
- **`RoleService.normalizePermissionIds` 服务端兜底**（放后端而非只靠前端勾选，API 直调同样造不出半残授权）：① 父链补齐——缺父级会让 `buildMenuTree` 断链，出现「权限在、菜单不显示」；② 同页读权限补齐——授了菜单 M 下任一按钮，就补上 M 下所有 **perm_type=2** 的 access_type=1 点，杜绝「页面能开、列表接口 403」。
  > ⚠️ **规则②必须限定 perm_type=2**。菜单节点自身也是 access_type=1，不限定的话「系统管理」下清一色兄弟菜单，只授「数据字典」会被连带补上用户管理/角色管理/菜单权限——**静默越权**（hb-mes 曾真实踩过）。兄弟菜单是各自独立的页面，必须逐个授权。
- **角色分配权限树改为 `check-strictly`（父子勾选互不联动）**：旧版默认级联下勾中「订单管理」会连带勾上其下全部增删改按钮，「只读订单页」这种授权在界面上**根本表达不出来**。节点带「查看/操作」标签，并提供「全选 / 仅授只读 / 全部清空」。回显也随之改为库里存什么勾什么（不再过滤叶子节点）。

---

## 三、数据库迁移规范（重要）

TypeORM `synchronize=false`，**所有表结构变更必须走手写 SQL 迁移**，流程：

1. 在 `apps/server/scripts/sql/` 新建幂等的 `migration-*.sql`（可重复执行不报错，建表用 `CREATE TABLE IF NOT EXISTS`，加列/加索引用存在性判断）。
2. 在 `apps/server/scripts/db-migrate.ts` 的 `MIGRATIONS` 数组**末尾**登记（顺序即执行顺序），并在结构验证段 `expectedColumns` 为新表/关键新列补充校验项。
3. 同步更新 `apps/server/scripts/sql/01-schema.sql`（供全新安装 `db:init` 使用），列定义必须与迁移 SQL **完全一致**。
   - ⚠️ **写删列迁移时必须回头加固前序迁移**（2026-08-07 连踩两次）：`db:migrate` 每次跑**全量清单**，某列被删后，早先引用该列的迁移语句（UPDATE / MODIFY COLUMN）会在下次执行时报 `Unknown column` 而中断整条流程——本地能过是因为那次列还在。删列前把前序迁移里所有引用该列的语句改成「`information_schema` 判存在 → `PREPARE`」。
   - 注意 `IF(cond, 0, (SELECT … col …))` **挡不住**：MySQL 在**预处理阶段**就解析子查询的列名，条件为假照样报错，整条查询都得进 `PREPARE`。
   - 删列迁移应设**安全闸门**：命中会丢数据的情形就中止而不是照删。普通脚本里不能用 `SIGNAL`（仅存储程序可用），用「让预处理语句 `SELECT * FROM \`中止原因写成表名\`」制造报错，报错文本即提示语。
   - 删列后同步：`expectedColumns` 移除该列、`forbiddenColumns` 加上它（盯住不得被旧版 schema 重建复活）。
4. 生产升级由 `deploy/deploy-oms-app.sh` 自动执行（无库跑 `db:init`、有库跑 `db:migrate`），**不要在部署脚本里手抄第二份迁移清单**（hb-mes 曾因此漏跑迁移）。

现有迁移清单见 `db-migrate.ts`（截至内置角色统一共 19 个）；现役业务表：`t_order` / `t_order_product` / `t_order_part_group` / `t_order_part` / `t_outsource_doc` / `t_outsource_item` / `t_outsource_return` / `t_assembly_batch` / `t_finished_doc` / `t_finished_item` / `t_finished_balance` / `t_part_balance` / `t_part_adjust` / `t_customer` / `t_process_info`(+history) / `t_material` / `t_equipment_info` / `t_department` / `t_dict` / `t_changelog` / `t_system_config` / `t_no_sequence` / `t_file` / `t_operation_log` / 权限体系五表。

---

## 四、统一开发强制约束

### 4.1 命名与定义方式全程统一

| 对象 | 规范 |
|---|---|
| 数据表 | `t_` 前缀 + snake_case（如 `t_outsource_doc`） |
| 实体类 | PascalCase，文件 `xxx.entity.ts`，放模块 `entities/` 下 |
| DTO | `CreateXxxDto` / `UpdateXxxDto` / `QueryXxxDto`，放模块 `dto/` 下，禁止 `XxxCreateDto` 等倒装 |
| 接口路由 | kebab-case（如 `/api/outsource/part-group-options`），controller 按模块单文件 |
| 前端 API | 按模块放 `src/api/xxx.ts`，函数名与后端接口语义一致 |
| 分页入参 | 统一 `page` / `pageSize`（默认 1 / 20），禁止 `pageNum` / `limit` / `offset` |
| 分页返回 | 统一 `{ list, total, page, pageSize }`，禁止 `records` / `items` / `rows` |

**状态/枚举常量**（唯一事实源：`packages/shared/src/`）：

- 业务状态枚举定义在 `business-status.ts`：`XXX_STATUS` 为 `as const` 数值对象（逻辑判断），`XXX_STATUS_OPTIONS` 为 `{ label, value, type }` 展示映射（type 为 el-tag 颜色），二者同文件同步维护。
- 后端直接从 `@hb-oms/shared` import；前端经 `constants/dict.ts` re-export（展示数组沿用 `XXX_STATUS` 名，数值对象别名为 `XXX_STATUS_VALUE`），配合 `labelOf` / `tagTypeOf`。
- **新增/修改状态只改共享包一处**。凡前后端都要用、且必须口径一致的纯常量/纯函数一律进共享包，禁止两端各写一份；依赖 NestJS/Vue/Element Plus 的代码不得进共享包。
- **禁止在 service SQL、前端模板中出现裸的状态数字**（如 `status = 2`、`row.status === 1`），一律引用命名常量。注意跨表状态不可混用（订单状态用 `ORDER_STATUS`、外发状态用 `OUTSOURCE_STATUS`，即便数值恰好相同）。

共享包现有内容：`business-status.ts`（订单/外发/装配/成品单据/启停状态、表面处理哨兵 `SURFACE_NONE` 与 `needsOutsource`）、`unit.ts`（套↔支 `PIECES_PER_SET=2`、英寸↔mm `INCH_TO_MM=25`、`normalizeDimensionText`、`formatDimension`）、`product-type.ts`（产品类型多选组合 parse/normalize/format、`hasSocket`、`formatProductModel`）、`rail.ts`（部件/边别/节数/部件组选项、`expandPartRows` 部件展开蓝图）、`version.ts`（`normalizeVersion`）、`outsource.ts`（发坯单号宽度与 `formatBlankNo`、重量→数量折算 `qtyFromWeight`、回齐判定、单头状态派生 `deriveOutsourceStatus`）、`assembly.ts`（批次状态派生 `deriveAssemblyStatus` / `isAssemblyCompleted`、入库闸门算式 `calcInboundQuota`、边别合法性 `isValidSide` 与 `assemblySides`）。

### 4.2 数据库字段注释强制

- 所有新增字段必须带 `COMMENT`（迁移 SQL 与 `01-schema.sql` 双处），实体 `@Column` 的 `comment` 文案同步一致；枚举型字段的 COMMENT 必须列全枚举值及中文含义（如 `状态：1待发出 2已发出 3部分回货 4已回齐 9已作废`）。
- 禁止含义模糊、无注释字段；口径类字段（数量单位、快照/实时、支/套）必须在注释中写明口径。

### 4.3 业务接口四要素

每个业务接口必须明确以下四项：

1. **入参校验**：DTO + class-validator 装饰器，依赖全局 ValidationPipe；禁止在 service 里手工解析未经校验的 body。
2. **异常抛出**：业务错误一律抛 Nest `HttpException` 家族（`BadRequestException` / `NotFoundException` / `ForbiddenException`），message 为面向用户的中文；**禁止 `throw new Error()`**。
3. **返回结构**：交给 `TransformInterceptor` 统一包装，service 返回纯数据；文件流用 `@SkipTransform()`。
4. **操作日志**：所有**增/删/改/确认/登记/导入**接口必须标注 `@OperationLog(...)`；只读查询不标。豁免须在接口处注释说明理由。

同类业务复用统一封装：单号走 `NumberGeneratorService`、Excel 导入导出走既有模式、前端表格分页走 `AppTable`/`AppPagination`。**发现第二处相似实现时，先抽公共封装再继续**。

### 4.4 先设计后编码

任何新增功能，动手写代码前必须先梳理并确认三件事：

1. **数据模型**：涉及哪些表、新增哪些字段、快照还是关联、索引与唯一约束；
2. **业务流程**：状态机流转图（谁触发、从什么状态到什么状态、逆向操作是什么）；
3. **边界场景**：并发重复提交、数量超限/为零、跨订单、单据被下游引用后的修改与作废。

较大功能先补进设计文档再实现。禁止直接上手编码。

### 4.5 验收方式（无单元测试框架）

本项目**没有单元测试框架**，功能验收靠**API 级 E2E 脚本**：Node 原生 `fetch` 直连后端，走真实滑块验证码登录（解析 PNG 定位缺口）→ 拿 token → 串起业务流程逐条断言。约定：

- 脚本写在会话 scratchpad 目录，不进仓库；登录 helper 可复用既有 `oms-api.mjs`（导出 `api / login / ok / results`）。
- 每个里程碑或较大功能完成后必须跑一轮 E2E，**覆盖正常流程 + 全部守卫（拒绝路径）+ 状态机每一条边**，并在结束后**清理测试数据**。
- 涉及数量/金额口径的里程碑另需**独立重算脚本**（M4 的 `verify:ledger` 即此模式）：绕开业务代码用最朴素 SQL 重算一遍再比对。用同一份 SQL 自己验自己等于没验。
- 构建校验必须取**真实退出码**（`pnpm ... build > log 2>&1; echo "EXIT=$?"`）。历史教训：`pnpm build | grep error | head; echo $?` 检查的是 `echo` 的退出码恒为 0，曾导致带类型错误的代码被推上生产。
- ⚠️ **跑 E2E 前别在 `nest start --watch` 开着时执行 `nest build`**（2026-08-07 连踩两次）：两者写同一个 `apps/server/dist/`，`nest build` 会把 watcher 正在用的产物清掉，watcher 随即陷入 `Cannot find module dist/main` 崩溃循环。此时端口上应答的往往是**更早的残留进程跑着旧代码**，E2E 会给出一片看似真实、实则全错的失败——极易误判成代码有问题。正确顺序：先跑构建校验 → 再起 watcher → 再跑 E2E；中途改了代码就让 watcher 自己增量编译，不要手动 build。
- 本地起后端建议走 `.claude/launch.json` 的 `hb-oms-api`（端口 8100）。**不要用 `hb-oms-dev` 跑后端**：预览器会按配置里的 `port` 注入 `PORT` 环境变量，`dev` 同时拉起前后端时后端会被绑到 5174，前端代理到 8100 全部 ECONNREFUSED。

---

## 五、OMS 订单跟踪业务规范

业务细则以设计文档为准，本节只固化**最易出错、必须全局一致**的口径。

### 5.1 业务主线

```
销售订单(order) → 外发表面处理(outsource，可选) → 装配(assembly) → 成品入库 → 成品出库
                                                          ↘ 部件台账(part-stock，V1 仅参考台账)
```

### 5.2 订单四级结构与跟踪锚点

`t_order`（订单）→ `t_order_product`（产品行）→ **`t_order_part_group`（部件组 = 跟踪/台账锚点）** → `t_order_part`（部件行）。

- **部件组是一切下游单据的锚点**：外发明细、装配批次、成品出入库明细、台账行一律锚定 `order_part_group_id`。
- **字段归属（2026-08-07 调整，勿再挪回去）**：
  - `po_no`（PO#，客户订单文件上的订单编号）与 `production_no`（生产单号）**都在订单级 `t_order`，一对一**——一张订单不会有两个生产单号。台账「订单编号」列取的就是 `t_order.production_no`，下游单据的 `production_no` 快照也一律自订单取。
  - 产品级新增 `customer_drawing_no`（**客户图号**，客户来图上的图号），与部件组的 `drawing_no`（**生产图号**，内部转化的技术图纸）是两个字段，别混。
  - `t_order_product.production_no` 与 `t_order_product.assembly_workshop` **已删列**（`migration-drop-deprecated-order-cols.sql`）。该迁移带**安全闸门**：若存在「同一订单多个产品行填了不同生产单号」就中止不删（回填只取行序最前的一个，删列会让其余值永久消失）——闸门用「让预处理语句指向一个不存在的表」实现，报错文本即中止原因。db-migrate.ts 另加 `forbiddenColumns` 断言盯住这两列不得复活。
- 默认一产品一组（`whole` 整品）；缓冲类可拆「外中轨」「内轨」等多组，各组独立图号/版本/料厚；**组不拆数量**，各组支数默认 = 产品支数。同产品行内 `group_type` 唯一。
- 部件行由服务端按 `expandPartRows(组类型, 节数, 是否卡口, 组支数)` **蓝图展开**（三节轨 3 行 / 二节轨 2 行无中轨；含卡口再按左右分列，奇数支左边多一支），客户端只能微调追溯码/备注。

### 5.3 全局数量与规格口径

- **数量**：台账、库存、外发一律以「支」为准；订单单位仅 `set`(套) / `piece`(支) **两种**，1 套 = 2 支。
- **规格**：英寸/mm 双单位录入，换算**固定 1 英寸 = 25mm**（我司口径，非国标 25.4）；存 mm 数值 + 保留原始录入值与单位用于回显。
- **产品类型多选**：按固定字典顺序排序后逗号拼接存储（如 `standard,self_lock`），必须经共享包函数处理，禁止两端手工拆串；组合**含「卡口」即触发全部卡口规则**（左右分列、部件/库存分边别）。
- **产品型号**：`货号 + 产品类型中文组合 + 部件组后缀`（如 `53#普通滑轨`、`45#缓冲外中轨`），共享包 `formatProductModel` 拼接，作为部件组快照与下游单据展示值。
- **表面处理**：字典驱动（`surface_type`），`none`（无）是**代码保留值**——控制"是否需要外发"的判断依据，字典管理界面禁止删除/改值该项。

### 5.4 单据编码规则

所有单号**必须**经 `NumberGeneratorService` 采番（MySQL 计数表 + LAST_INSERT_ID 原子自增，业务表单号列唯一索引兜底），**禁止自行拼接**；事务内采番必须把事务 `manager` 传入。

| 前缀 | 单据 | 格式 | 采番位置 |
|---|---|---|---|
| ORD | 销售订单 | `ORD + yymmdd + '-' + 4位当日序号` | order.service |
| （无前缀） | **发坯单**（外发） | 7 位定长纯数字全局序号，展示层拼 `No.` | outsource.service（`generatePaddedSequence`，key `BLANK_NO`，宽度取共享包 `BLANK_NO_WIDTH`） |
| FGI | 成品**生产入库**单 | 同 ORD | finished-stock.service（`prefixOf()`） |
| FGO | 成品**出库**单 + **期初**（`opening_balance` 虽是入向但走 FGO 序列，§4.7 明文） | 同 ORD | 同上 |
| FGR | 成品**红字冲销**单 | 同 ORD | 同上 |
| FILE | 文件上传 | 同 ORD | file.service |

**不采番的业务行**：装配批次、部件调整流水属轻量记账行，无单据号（主键 id 即可）。

### 5.5 基础数据 vs 业务流水

- **基础数据**（客户资料、开单信息、部件信息、字典、用户/角色/部门、设备信息）：可编辑，用 `status` 启停或软删除；**被业务引用后限制删除**（可停用）。
- **业务流水**（订单、外发单、装配批次、出入库单）：创建时**快照冗余**基础数据关键字段（客户名、生产单号、产品型号、规格、周期码等），基础数据后续变更**不回写**历史单据；审计字段齐全；确认后的单据只能冲销不能改。
- 快照字段一律**由服务端从上游表读取落库**，不采信客户端传值（防伪造）。

**审计字段六件套（强制，2026-08-08 全面补齐）**：`creator_id` + `creator_name` + `updated_by` + `updater_name` + `created_at` + `updated_at`。

- **凡人工可创建/编辑的表都必须带齐**，写入统一走 [audit.util.ts](apps/server/src/common/utils/audit.util.ts) 的 `auditOnCreate(user)` / `auditOnUpdate(user)`（后者只动 updater_*，不覆盖原创建人），禁止在各 service 里手抄 `user.realName || user.username`。姓名是**操作当时的快照**，用户停用/删除后仍可追溯。
- 已覆盖：t_order、t_order_product、t_order_part_group、t_outsource_doc、t_outsource_item、t_assembly_batch、t_finished_doc、t_customer、t_process_info、t_material、t_equipment_info、t_part_balance、t_dict、t_department、t_role、t_permission、t_user、t_changelog；t_system_config 与 t_file 按单向语义只带更新/创建侧。
- **豁免（理由记录在此，勿反复重提）**：`t_order_part`（`expandPartRows` 蓝图展开、不可人工增删改）、`t_finished_item`（挂父单据 t_finished_doc，父表审计齐全）、`t_finished_balance`（余额表，靠单据流水追溯）、`t_outsource_return` 与 `t_part_adjust`（只增不改的流水行，已带 creator_*+created_at）、`t_process_info_history`（履历行，自带 operator_*）、`t_operation_log` 与三张关联表（系统生成/无人工语义）。
- **整体重建型子表的口径**：订单编辑 = 删旧产品/组/部件行后重写，子行创建人无从保留，故**沿用订单头的创建人**（谁录的这张单），更新人记本次编辑者；外发明细同理沿用单头。否则每次编辑都会把子行创建人改写成编辑者。
- 自助操作的更新人记本人（个人中心改资料/改密）；**登录成功失败计数、会话撤销等系统簿记只动 updated_at，不写 updated_by**，否则「最后更新人」会被登录行为洗掉。
- `t_permission` 由清单同步写入的行审计署名记「系统同步」；同步**只在字段真有差异时才 UPDATE**——否则每次启动都会把全部权限行的 `updated_at` 刷成启动时刻，审计意义归零。
- **前端展示**：统一走 [AuditInfo.vue](apps/web/src/components/AuditInfo.vue)（已全局注册），两种形态——详情/表单页底部独立审计条 `mode="block"`、列表页主标识列旁的信息图标 `mode="inline"`（悬浮显示，不占列宽）。禁止各页面重复拼 `xxx || '—'`。注意该组件**自带一个 el-descriptions**，不能塞进调用方的 el-descriptions 当子项——后者只收集自己默认插槽里 `type.name === 'ElDescriptionsItem'` 的 vnode，组件包装后收集不到。
- **接口必须把字段带出来**：列表 service 里手工挑字段拼返回值的地方（如 user.service 的 `findList` / `findOne`）最容易漏，新增列表接口时对照检查；用 `Object.assign(实体, ...)` 拼的（order/outsource/finished-stock）天然带出。

### 5.6 已落地业务模块的关键不变式

**订单（M2）**

- 更新 = 同结构整体重建（删旧产品/组/部件行后重写）。
- 部件组被外发/装配/出入库引用后，禁止编辑与**删除**订单（`assertNoDownstreamRefs` 按 `order_id` 探测下游表，表未建时视为无引用）。
- **删除取代作废（2026-08-07）**：`DELETE /order/:id`（权限 `order:delete`）连带删产品行/部件组/部件行四级数据。原「作废」接口与 `order:cancel` 权限点已下线——作废的限制条件与删除完全一致（被下游引用即禁止），只能作用于没走下游流程的单据，留一条 `status=9` 废记录对账无价值。`ORDER_STATUS.CANCELLED` 枚举**保留**（库中历史已作废订单仍在，各处过滤逻辑照旧），只是不再产生新的。删除动作靠 `@OperationLog` 留痕（行已物理删除，写不了审计列）。
- 出口订单必填出口国家；表单 PO#/生产单号/客户图号/材质/生产图号**自动转大写**。
- 部件组表格支持「复制上一行」：沿用上一组的图号/版本/料厚/支数，组类型自动换成下一个未占用的（同产品行内 `group_type` 唯一，照抄会撞 `uk_product_group`）。

**外发发坯单（M3）**

- 状态机：`1待发出 --登记实际发外日期--> 2已发出 --有回货--> 3部分回货 --全部行回齐/手工关闭--> 4已回齐`；`9已作废`仅从待发出进入。
- 单头状态**一律由共享包 `deriveOutsourceStatus` 派生**（前后端同口径），不在业务代码里散写判断。
- 明细锚定部件组，**同一张单内同一部件组不可重复添加**；表面处理为 `none` 的产品不可入明细；单头表面处理不可为 `none`。
- **仅待发出可整单编辑**；已发出后如需纠正数量，走「发出明细数量修正」接口（只改重量/单重/数量/备注，不动锚点、不增删行），改完**自动双向重算回齐状态**。
- **有回货登记禁作废**；已发出禁作废（尾数不回走「关闭」，须填原因）。
- **回货允许超过发出数**（重量折算误差）：后端不拦截，前端黄色提示；撤销回货后累计数与状态**自动回退**，回退到零时清除手工关闭原因。
- 回货登记、数量修正均在事务内对明细行加**悲观锁**后汇总重算，防并发错乱。
- 重量→数量折算：`数量 = 重量 ÷ 单重` 四舍五入（共享包 `qtyFromWeight`），仅作默认值，允许人工微调。**发出数量只能由过磅重量折算得来，不得用订单数量预填**（2026-08-07）——订单数是"应该发多少"，发坯单要记的是"实际发了多少"，拿订单数当默认值会让人顺手存下一个没过磅的假数，回货对账时才发现对不上。选中部件组时重量与数量都留 0，单重自部件信息带出可改。保存时数量必须 > 0：前端逐行提示，后端 DTO `@ArrayNotEmpty` + 明细 `@Min(1)` 兜底。
- **打印用《电镀发外加工单》版式**（`views/outsource/print.vue`，2026-08-07 自 hb-mes `subcontract/SubcontractPrint.vue` 移植）：纸张是 **240mm × 150mm 四联单，不是 A4**，尺寸/列宽百分比/行高/联次竖排文字均按原单照搬，换纸即可对齐——**不要改成 A4，也不要动列宽**。每页固定 11 行（表体 101mm − 表头 13mm，行高 8mm），多明细自动续页并补空行。抬头固定为公司**全称**常量 `COMPANY_FULL_NAME`（中山市海宝精密五金有限公司），**刻意不取系统配置的 `companyName`**——那是登录页/标题栏的品牌短名，而本单是交给加工商的对外正式单据，抬头须用营业执照全称，两者用途不同不应互相牵制；公司更名时改该常量。与 MES 的两处差异：单头第二格因 hb-oms 无「委托单号」改印**表面处理**；「包装方式」列 hb-oms 无对应字段，留空供手写。
- 明细快照经 `PartGroupSnapshotService` 统一读取；详情接口附带 `qtyPcs`（组需求）与 `sentQty`（**他单**已发，已排除本单），供编辑表单对照超发。

**装配批次（M3.5）**

- 锚点是**部件组 + 边别**（`order_part_group_id` + `side`）：含卡口组合必须落 `left`/`right`，非卡口必须为空串；闸门按 side 分别核算，**左右不串量**（§7.15）。建单时由服务端按 `hasSocket(产品类型)` 硬校验，填错直接拒绝。
- 时间三件套：`plan_start_date`（计划开始）/ `plan_date`（计划完成）为计划员录入的**预计装配区间**，纯计划属性、**不参与闸门**；`actual_date`（实际完成）才是完工与闸门的唯一依据。
- 一组可多批；`plan_date` 与 `actual_date` **至少填一个**（只有计划开始的批次跟踪不到完工）；`plan_start_date` 不得晚于 `plan_date`，前后端双向校验。
- 状态 `status` 落库但为**派生值**，只能由共享包 `deriveAssemblyStatus(actualDate)` 赋值：`actual_date` 空=1计划中、非空=2已完成。聚合已完成装配量时一律按 `actual_date IS NOT NULL` 判定，**不依赖 status 列**（防历史脏数据让闸门失准）。
- **装配车间只存在于批次级 `t_assembly_batch.workshop`**（2026-08-07 起）：订单环节不再安排装配车间，产品行 `assembly_workshop` 已弃用。装配列表与订单跟踪台账的「装配车间」列改为**聚合该部件组各批次的车间**（`GROUP_CONCAT(DISTINCT …)`，一组多批可分属不同车间，界面并列显示），筛选改为 `EXISTS` 匹配批次车间。新建批次的默认车间取该组最近一条批次的车间，不再从订单继承。
- **入库闸门口径的唯一实现在 [assembly-quota.util.ts](apps/server/src/modules/assembly/assembly-quota.util.ts)，M4 成品入库确认必须复用，禁止另写第二份 SQL**：
  `可入库量(部件组, side) = Σ已完成装配量 − Σ已入库量`。
  已入库量只统计**已确认的入库方向单据**：`biz_type='inbound'` 计正、冲销 inbound 的红字单按 direction 计负；**期初 `opening_balance` 与销售出库 `sale_outbound` 均不参与**（期初无装配过程、§4.5 明文豁免闸门，若计入会让该组额度永久为负而挡死后续入库；出库参与则会凭空放大额度），冲销期初的红字单同理排除。成品三表在 M4 才建，表不存在时已入库量按 0 计，建表后自动生效。
- **不得使可入库量为负**（§7.14）：删除批次、下调 qty、退回「计划中」三条路径改完都要复核，为负则**整笔事务回滚**并提示先红字冲销对应入库单。锁顺序统一为「先锁该部件组全部批次行（`FOR UPDATE`）→ 再改本行 → 复核」，与 M4 入库确认保持一致，避免交叉等待死锁。
- 编辑接口**不含锚点**：部件组与边别不可改（改锚点等于换组，会把原组额度静默抽走），要换组只能删除后重录。
- 超装配（Σ装配量 > 组支数）**允许**，前端黄色提示不拦截；台账「装配未完成量」可为负。
- 批次是轻量记账行，**不采番、无单据号**（§5.4）。

**成品出入库与订单跟踪台账（M4）**

- 三表：`t_finished_doc`（单据头）/ `t_finished_item`（明细）/ `t_finished_balance`（余额）。明细锚定**部件组 + 边别**，卡口按左右分行。
- **数量恒为正**，出入方向由单头 `direction`（1入 −1出）表达；聚合一律 `direction × quantity`。红字单方向与被冲原单相反，因此**天然抵扣、无需特判**——不要在聚合里写"如果是红字就减"这类分支。
- 状态机 `1草稿 → 2已确认 → (更正) 开红字单`；`9已作废`仅从草稿进入。**已确认单禁改禁删禁作废，只能红字冲销**；红字单本身不可再冲销；红字单建后**立即确认生效**。
- 红字支持**按行部分冲销**，每行冲销量 ≤ 原行数量 − 该行已冲销量。
- **确认（confirm）是唯一驱动余额的入口**，同事务内三步：① 装配闸门（仅 `inbound`，复用 `assembly-quota.util.ts`，`lock:true`）② 余额行 `FOR UPDATE` ③ 增减后**结存不得为负**。任何地方都不得直接改 `t_finished_balance`。
- 「结存不得为负」同时管住两类操作：销售出库、以及**红字冲销入库单**（货已发出时不能凭空把入库冲掉）。
- `t_finished_balance` 唯一键 `(order_part_group_id, side, batch_no, attr_key)`：挂订单的行 `attr_key` 恒为空串；不挂订单的纯属性期初行锚点列为 0、靠 `attr_key`（属性指纹）兜底唯一。设计文档原写「应用层保证」，实现改为**下沉到数据库唯一键**，并发下应用层判重挡不住重复行。
- **⚠️ 台账「完成数」与闸门「已入库量」口径故意不同，勿"统一"**：
  - 台账完成数**包含期初**（`opening_balance`）——期初是上线前已完成的存量，不计入就对不上手工账；
  - 闸门已入库量**排除期初**——期初没有装配过程，计入会让该组额度永久为负、挡死后续正常入库。
  两处各自正确，改任一处前先想清楚服务的是哪个问题。
- 台账（`order-ledger.service.ts`，`GET /order/ledger`）按部件组一行，四数**全部实时聚合、不落冗余列**；欠数为负（超产/超发）正常显示负数并高亮，不截断为 0。
- 台账 SQL 注意：`rows` 是 MySQL 8 保留字，列别名不能用它（已踩）。
- **欠数口径的唯一事实源是 [order-owed.util.ts](apps/server/src/modules/order/order-owed.util.ts)**：入向/出向单据族的 SQL 片段与参数定义在此，台账聚合与订单自动完结共用，**禁止任一处另写**——分叉后会出现「台账显示已交清、订单却挂在进行中」且查不出谁错。
- **订单状态自动同步（§3.1）**：成品出入库「确认」与「红字冲销」后，在**同一事务内**调用 `syncOrderFinishState`——进行中且**全部部件组**发货欠数 ≤ 0 → 自动完结；已完结但任一组回正 → 自动重开。要点：
  - 只有出向单据影响发货欠数，入库确认不会误触发；
  - 超发（欠数为负）算已交清；
  - 「完结」只是台账口径**不锁单据**，已完结订单仍可继续出入库，所以回正必须能自动重开，否则订单会被错误地挂在已完结上；
  - 作废订单（9）不参与，更新带 `status` 前置条件防并发覆盖；
  - 结果随接口回传（`finished` / `reopened` 订单号），前端 toast 提示——不提示的话用户会以为订单状态被人偷改了。
**部件台账（M5，`t_part_balance` + `t_part_adjust`）**

- **属性锚定、不挂订单**：部件在表面处理前是通用半成品，同属性不分订单，故用 **7 维唯一键**（部件/边别/货号/节数/产品类型组合/料厚/规格）而非订单锚点。
- 7 维**全部 NOT NULL DEFAULT ''/0**：留 NULL 会让 MySQL 唯一键失效（多 NULL 不去重），同一档部件分裂成多行。归一集中在 service 的 `normalizeDimension`，**调用方禁止自行拼**；产品类型组合串必须经共享包 `normalizeProductTypes` 规范化，否则「普通,自锁」与「自锁,普通」会分裂成两行。
- **余量只有一个写入口 `POST /part-stock/adjust`**：按 7 维定位（不存在则建行）累加 `delta` 并写一条 `t_part_adjust` 流水。**刻意不提供「直接设置余量」的接口**——§4.6 要求「不直接改数无痕」，一切变动必须带 delta + 原因，否则事后无法回答「这个数怎么来的」。期初录入与手工调整走同一入口，靠 `source`（opening/manual）区分，期初同样留痕。
- 调整后余量不得为负；`delta` 不接受 0（无意义的空流水）；行锁后累加防并发丢失。
- V1 是**独立参考台账**：不与外发/成品单据联动（§2.1，无报工则无采集点），联动列入 V2（§10）。
- **必填字段的每个约束都要给中文 message**：字段缺省时多个约束同时失败，只要有一个没给 message，用户看到的就是「must be a string」这类英文（本模块已踩，E2E 抓出）。

**期初录入（M5，opening 模块）**

- **纯编排模块，不自己写库**：成品期初走 `FinishedStockService.createOpeningBalance`（§6 明确「内部走 finished-stock 通道」），部件期初走 `PartStockService.adjustInTx` 且 `source='opening'`。各自另写一套写库逻辑会立刻造成口径分叉，这是本模块存在的唯一理由。
- 成品期初**建单后同事务立即确认**、不留草稿：录入页本身即「确认」语义。单据仍在成品出入库列表可见、可红字冲销纠错，追溯性没丢。
- 成品期初支持两种行混录：
  - **挂订单行**（`orderPartGroupId ≥ 1`）：快照由服务端读订单侧，计入台账「完成数」、参与生产欠数；
  - **纯属性行**（省略锚点）：锚点落 0、属性自带，靠余额表 `attr_key` 指纹兜底唯一，**只进库存数、台账查不到**（§7.9，这是设计如此不是漏了）。
- 期初豁免装配闸门（§4.5），但计入台账完成数 —— 与 §5.1 的「完成数含期初 / 闸门排除期初」一致。
- **部件期初整批全有全无**（同一事务）：部件台账是**累加**语义，部分成功后用户改完坏行重提整批，已成功的行会被加第二次、直接把账做错。出错提示带行号，改完整批重提不会重复计数。这也与项目既有导入约定（客户导入「整批校验通过才落库」）一致。
- 「期初补录」订单标记 `is_opening` 在订单表单上有开关；补录订单免非关键必填，但四数口径与正常订单完全一致（§7.7）。

- 口径核算脚本 `pnpm --filter server verify:ledger`：**绕开业务代码**用最朴素 SQL 从原始单据重算四数再比对，两条独立路径算出同一个数才算数。改台账聚合后必须重跑。

---

## 六、里程碑进度

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M1 骨架 | monorepo、登录/权限/菜单、基础数据（客户资料含批量导入、开单信息、部件信息、字典）、共享包 | ✅ 已完成 |
| M2 订单 | 订单四级 CRUD、附件、组按类型自动展开部件、图号带入工艺、状态机 | ✅ 已完成 |
| M3 外发 | 发坯单单头+明细、发出/回货登记、状态自动推进、数量修正、打印 | ✅ 已完成 |
| M3.5 装配 | 装配批次 CRUD（一组多批 + 卡口分边、计划/实际完成时间+数量）、装配管理页、可入库量接口与闸门守卫 | ✅ 已完成 |
| M4 出入库+台账 | 出入库单、确认/红字冲销（支持部分冲销）、**装配入库闸门**（复用 `assembly-quota.util.ts`）、balance、成品库存、**订单跟踪台账** + 口径核算脚本 | ✅ 已完成 |
| M5 期初+看板 | 补录订单、成品/部件期初、部件台账、首页看板、台账展开与合并、台账 Excel 导出、新手引导、操作手册**全部完成** | ✅ 已完成 |

期间另行完成（非里程碑）：菜单四个一级重构、设备信息模块、部门信息模块、更新日志与系统配置移植（**审批管理永不移植**——OMS 无审核流）、部件信息/开单信息两次改名改版、深色侧栏主题、订单表单国旗国家下拉。

---

## 七、跨会话开发协作约定（多 AI 模型协作）

1. **本文件是唯一权威工程规范，设计文档是唯一权威业务口径**。每次会话开始处理代码任务前先读这两份；与之冲突的旧代码写法不作为效仿依据。
2. **同步更新义务**：新增功能、调整架构、新增单号前缀/权限点/状态枚举/迁移脚本后，必须在同一次会话内更新本文件对应章节（尤其 §5.4 单号表、§5.6 不变式、§六 里程碑进度）。
3. **多方案冲突处理**：同类功能存在多种实现时，以本文件规定为准写新代码；旧代码是否重构按「工作量 × 复杂度 × 重要性」评估后列入 §九 风险清单逐步处理，**禁止顺手大范围重构**。
4. **提交与部署节奏**：用户明确说"提交部署/推送部署"才推送并上线；说"先提交本地/暂不推送"则只本地提交。改动多主题时**拆分提交**，不要把无关改动混进一个 commit。
5. **会话结束快照**：每次会话结束前输出简短【变更快照】：改动文件清单、新增迁移/权限点、口径变化、遗留待办。

---

## 八、部署与运维

生产环境为阿里云 ECS `120.79.138.198`（Ubuntu + PM2 + Nginx + MySQL），与 hb-mes、QMS **同机共存**，hb-oms 全部挂 `/oms/` 路径前缀。完整运维手册见 [README.md](./README.md)。关键事实：

| 项 | 路径/配置 |
|---|---|
| 代码目录 | `/var/www/hb-oms/app`（`git archive main \| ssh ... tar -x -C` 同步） |
| **后台前端产物** | **`/var/www/hb-oms/web-dist`** → `location /oms/admin/` |
| 前台静态站 | `/var/www/hb-oms/site` → `location /oms/` |
| 后端进程 | PM2 `hb-oms-server`，`127.0.0.1:8100` → `location /oms/api/` |
| 上传文件 | `/var/www/hb-oms/app/apps/server/uploads` → `location /oms/uploads/` |
| Nginx 配置 | `/etc/nginx/conf.d/hb-mes.conf`（与 hb-mes/QMS 共用 server 块） |
| 部署脚本 | `deploy/deploy-oms-app.sh`（幂等：生成 .env → install+build → db:init/db:migrate → PM2 → Nginx location 只增不改） |

**部署三条铁律**：

1. **前端 dist 必须上传到 `/var/www/hb-oms/web-dist/`**，不是代码目录下的 `app/apps/web/dist/`——传错位置会出现"部署脚本成功但线上不生效"的假象（已踩过）。部署后必须 `curl` 线上 `index.html` 比对入口 JS 哈希确认生效。
2. **前端只在本地构建**：服务器同时跑 MySQL / hb-mes / QMS / OnlyOffice，内存紧张，`vite build` 压缩阶段易 OOM 卡死。禁止在服务器上跑 web 构建。
3. **修改 Nginx 严禁影响 hb-mes 与 QMS 的既有 location**；只增不改，改前备份 + `nginx -t`。

标准部署链：

```bash
pnpm --filter @hb-oms/web build
git push origin main
git archive main | ssh root@120.79.138.198 "tar -x -C /var/www/hb-oms/app"
tar -C apps/web/dist -czf - . | ssh root@120.79.138.198 "rm -rf /var/www/hb-oms/web-dist/assets && tar -xzf - -C /var/www/hb-oms/web-dist"
ssh root@120.79.138.198 "bash /var/www/hb-oms/app/deploy/deploy-oms-app.sh"
```

代码仓库：https://gitee.com/lbk168/hb-oms.git（推送依赖本机凭据管理器，**任何情况下都不要在命令或文件中拼接明文密码**）。

---

## 九、待办与风险清单

| # | 事项 | 说明 | 状态 |
|---|---|---|---|
| 1 | M3.5 装配模块 | 闸门口径已做成唯一实现 [assembly-quota.util.ts](apps/server/src/modules/assembly/assembly-quota.util.ts)；**M4 入库确认必须 import 复用，禁止另写 SQL**。已用临时建表的方式提前验证过闸门口径（含期初/出库不参与、红字回补、左右隔离、三条守卫回滚），M4 建表后自动生效 | ✅ 已完成 |
| 2 | 订单跟踪台账 | 已上线，四数口径由 `verify:ledger` 独立重算核对 | ✅ 已完成 |
| 2a | 订单自动完结/重开 | §3.1 状态机的自动边，出入库确认/冲销后同事务同步；口径与台账共用 order-owed.util | ✅ 已完成（2026-08-07） |
| 2b | 部件台账 part-stock | 两表 + 模块 + 页面已落地；余量唯一写入口是 `POST /part-stock/adjust`（带 delta + 原因走流水），期初与手工调整共用并靠 `source` 区分。**M5 期初模块请复用该通道，勿另写余量写入**。调整原因前端收敛为下拉（期初补录/盘盈盘亏/录错纠正/其他，选其他补填具体原因、落库为「其他：xxx」）；**后端仍不做枚举校验**——「其他」本就是自由文本、期初模块也传自己的文案，校验只能退化成「非空」，加了无意义。选项在 `web/constants/dict.ts`（仅前端用，不进共享包） | ✅ 已完成（2026-08-08） |
| 2c | 期初录入 opening | 三类期初（成品挂订单 / 成品纯属性 / 部件）+ 订单「期初补录」开关全部落地；纯属性行经 `createOpeningBalance` 走通，部件期初整批全有全无 | ✅ 已完成（2026-08-07） |
| 2d | 首页看板 dashboard | `GET /dashboard/summary` + 首页四卡三列表已落地（§5.2，不做 ECharts 大屏）。**欠数口径复用 order-owed.util 的单据族 SQL**，与台账、订单自动完结同一事实源；两处刻意的差异见 dashboard.service 头注释（看板只看进行中 + 欠数逐组取正） | ✅ 已完成（2026-08-07） |
| 2e | 台账 Excel 导出 | `GET /order/ledger/export`（权限 `ledger:export`，`@SkipTransform` 返回文件流）已落地。**直接复用 `findLedger`，不为导出另写聚合 SQL**——两份 SQL 迟早分叉，届时「页面 100、导出 98」最难查。26 列对齐台账页（合并列拆开成独立列便于筛选），产品级列跨组合并规则与页面一致（只合并相邻同产品行），末尾带汇总行，字典值转中文。上限 5000 行，**超限拒绝而非静默截断** | ✅ 已完成（2026-08-08） |
| 2f | 台账行内展开 / 跨组合并单元格 | 均已落地。展开走独立接口 `GET /order/ledger/detail?orderPartGroupId=`（**按需加载**，不随列表返回——一页几十行全查三张流水太重），口径与台账主表一致（成品只取已确认、外发排除已作废、装配按 actual_date 派生完成态）。跨行合并只合并**相邻**的同 `orderProductId` 行：排序由服务端决定，万一同产品的组没挨着，宁可不合并也不能把中间夹着的别的产品错并进来 | ✅ 已完成（2026-08-08） |
| 2g | 新手引导 | 已补成完整业务主线十步（首页看板→订单→外发→装配→出入库→台账→物料→基础数据→系统管理），章节顺序与操作手册一一对应；过时文案（工艺信息/物料档案/「首页后续将展示」）一并订正；版本号递增到 `hb_mes_tour_done_v2` 让老用户重看。**踩坑**：引导目标多为二级菜单，父级 sub-menu 折叠时节点在 DOM 里但尺寸 0×0，el-tour 会把气泡定位到左上角空白；又因 el-menu 开了 `unique-opened`（手风琴）逐个 open 会互相顶掉。解法是引导期间把 `unique-opened` 置 false 并一次性展开全部相关父级、等 360ms 过渡结束再 startTour，结束时恢复手风琴并只留当前路由的父级 | ✅ 已完成（2026-08-08） |
| 2h | 操作手册 | `apps/web/public/manual.html` 已落地：11 章按业务时间线组织（快速上手→录订单→外发→装配→出入库→台账→看板→期初→基础数据→管理员→FAQ），顶栏搜索 + 侧栏目录 + 滚动高亮，纯静态零依赖。用户面板「操作手册」改指 `${import.meta.env.BASE_URL}manual.html`（**不要写死路径**——生产 base 是 `/oms/admin/`、开发是 `/`，写死任一个都会在另一端 404）。**功能改动涉及用户操作时须同步更新手册对应章节** | ✅ 已完成（2026-08-08） |
| 2i | 审计追溯全面补齐 | 六件套补到 t_dict/t_department/t_role/t_permission/t_user/t_changelog/t_order_product/t_order_part_group/t_outsource_item，写入统一走 audit.util；新增全局组件 AuditInfo（列表悬浮图标 + 详情审计条）。豁免表与整体重建型子表口径见 §5.5 | ✅ 已完成（2026-08-08） |
| 2j | 查看权限 / 只读角色 | 各模块 GET 接口挂菜单权限点（此前全裸）、新增 `access_type`、角色树改 check-strictly + 仅授只读、`normalizePermissionIds` 服务端兜底、看板加 `stat:dashboard`。口径见 §2.1 | ✅ 已完成（2026-08-08） |
| 3 | 部件台账 V1 定位 | 仅"期初 + 手工调整留痕"的参考台账，**不与外发/入库单据自动联动**（无报工则无采集点），联动列入 V2 | 📘 已定口径 |
| 4 | 订单变更流程 | V1 简化为"被下游引用后禁改，提示先冲销/作废下游单据"；正式变更单据化列入 V2 | 📘 已定口径 |
| 5 | 外发回货验收(FQC) | V1 仅用备注承载，不独立建模 | 📘 V1 不做 |
| 6 | 外购零配件台账 | V1 不涉及（不建台账、不做出入库） | 📘 V1 不做 |
| 7 | 事务写法约定 | 默认 `dataSource.transaction(mgr => ...)`；仅需悲观锁/手动控制提交时用 QueryRunner，并注释说明原因 | 📘 已定约定 |
| 8 | 前端大 chunk 告警 | vite build 提示主包 > 500KB，暂未做代码分割；影响首屏但不影响功能，需要时再治理 | ⬜ 低优先级 |
