# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **本文件是 hb-oms 项目唯一权威规范文件。** 项目由多个 AI 模型交替开发，任何代码修改、功能开发前必须先通读本文件；实现方案与本文件冲突时，以本文件为准。
>
> 与姊妹项目 hb-mes 的关系：hb-oms 的架构范式**照搬** `D:\Project\hb-mes\CLAUDE.md`（同一套 monorepo/NestJS/Vue3/共享包/迁移/权限体系），但**业务完全独立、数据库独立、代码不共用**。两份文件冲突时，改 hb-oms 代码以本文件为准；本文件未覆盖的通用工程约定，回查 hb-mes CLAUDE.md。
>
> 结构分层：技术架构规范 → 权限体系 → 数据库迁移规范 → 统一开发强制约束 → OMS 业务规范 → 里程碑进度 → 跨会话协作约定 → 部署运维 → 待办与风险清单。

## 项目概述

海宝五金**订单跟踪系统**（hb-oms）：订单 → 外发表面处理（可选）→ 装配 → 成品入库 → 出库的全链路台账系统，核心产出是四个数——**订单数 / 完成数 / 库存数 / 双欠数**（成品欠数 = 订单数 − 累计入库；发货欠数 = 订单数 − 累计出库），替代车间现行的手工 Excel 跟踪台账。

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
- `CommonModule` 为 `@Global()`，提供 `NumberGeneratorService`（单号采番）、**两个订单侧快照服务**（下游建单统一从它们读展示字段，禁止各模块再写一份 SQL）——`ProductSnapshotService`（产品级，给装配/成品出入库/成品期初）与 `PartGroupSnapshotService`（部件组级，给外发件回厂），分层理由见 §5.2；审计字段统一用 `common/utils/audit.util.ts` 的 `auditOnCreate` / `auditOnUpdate`（注意：实体属性名是 `creatorId/creatorName/updaterId/updaterName`，其中 `updaterId` 映射列 `updated_by`）。
- 业务模块在 `src/modules/` 下，标准结构 `controller / service / dto / entities`。现有模块：auth、captcha（滑块验证码）、customer（客户资料）、supplier（供应商）、position（岗位主数据）、process-info（开单信息）、order（订单四级 + **订单跟踪台账** `order-ledger.service.ts`）、outsource（外发件回厂记录）、assembly（装配批次）、finished-stock（成品出入库 + 余额）、dull-stock（呆滞品管理）、employee（**人事档案**，HR 一级菜单）、equipment（设备信息）、file、changelog（更新日志）、system-config（系统配置）、system（用户/角色/菜单/字典/部件信息/部门/操作日志）。
- **GET 查询串的布尔参数必须用 `common/utils/transform.util.ts` 的 `toBoolean`**（`@IsOptional() @Transform(toBoolean) @IsBoolean()`），**不得用 `@Type(() => Boolean)`**：全局 ValidationPipe 开了 `enableImplicitConversion`，字符串 `"false"` 会被隐式转成 `true`，且 `@Transform` 拿到的 `value` 已是转换后的结果，必须从原始 `obj[key]` 取值。踩坑实例见该文件注释（装配页两个未勾选的复选框把列表从 3 条筛成 1 条）。

### 前端架构

- 路由为**后端菜单驱动的动态路由**：登录后由 `router/dynamic.ts` 将菜单树注册到 Layout 下，权限清单里的 `component` 字段（如 `'outsource/index'`）映射 `src/views/**/*.vue`。
- **非菜单子页面**（表单页/打印页/履历页）在 `router/index.ts` 的 `constantRoutes` 里静态注册，必须带 `meta.activeMenu` 指向其所属菜单路径，侧栏才会正确高亮并自动展开父级菜单（layout 已实现祖先链展开）。
- HTTP 封装在 `utils/request.ts`：自动附带 Bearer token、401 自动刷新、统一解包 `ApiResult`；API 定义按模块放 `src/api/`。
- 开发期 Vite proxy 将 `/api`、`/uploads` 代理到 `localhost:8100`；`@` 别名指向 `src/`。生产构建 `base = '/oms/admin/'`。
- 状态用 Pinia（`stores/user.ts` 含 token/权限/菜单）。
- **localStorage 键一律 `hb_oms_` / `hb-oms-` 前缀，禁止再用 `hb_mes_`**：生产环境 OMS 与 hb-mes 同机同端口（共用 Nginx server 块）= **同源**，localStorage 完全共享。2026-08-12 前四个键沿用 MES 同名（token/refresh/记住密码/系统名缓存），后果是两套系统互相顶掉对方登录态、登录页互相回填对方保存的账号密码，已全部改名。改名时 token/记住密码**刻意不迁移旧值**（旧值可能是 MES 的），tour 标记做了一次性迁移（该键只可能是 OMS 写的）。
- **懒加载 chunk 失效兜底**（`router/index.ts` 的 `router.onError`）：部署脚本会 `rm -rf web-dist/assets` 再解包新产物，**发版前打开的页面**持有的旧哈希 chunk 全部消失；此时请求老 chunk 会被 Nginx 的 SPA 规则回吐 `index.html`（`Content-Type: text/html`），动态 import 因 MIME 不符而 reject，vue-router **中止导航、页面原地不动**，用户以为按钮失灵（2026-08-06 发版后实测复现，退出按钮首当其冲）。兜底逻辑识别到 chunk 加载失败即带目标路径硬跳转一次，sessionStorage 打标防死循环，导航成功后清标。**新增懒加载路由无需额外处理；但不要删掉这段 onError**。
- 通用组件优先复用 `src/components/`（`AppTable`、`AppPagination`、`AppActions`、`AppChart`、`AppStatCard` 等）与 `src/composables/`（`useDict`、`useClientPager`、`useResponsive`、`useTour`、`useAutoScroll`），**禁止在页面内重复造轮子**。
- **`useAutoScroll`（列表超高自动滚动 + 悬停暂停）**：首页三张待办列表在用（`max-height` 露 10 行 = 表头 34 + 10×32，与接口 `TOP_LIMIT=10` 齐平，故常态不滚动、超过 10 条才轮播）。传入「解析滚动元素」的函数而非元素本身——el-table 的滚动元素是 `.el-table__body-wrapper .el-scrollbar__wrap`，数据/页签切换会重建，取一次存下来会失效。滚动位置由 composable 自己累加后写 `scrollTop`，**不要改成每帧读 `scrollTop` 再加**：慢速下每帧位移不足 1px，浏览器取整后原地不动。
 - **只向下滚、到底停顿后跳回顶部，不要再改回「回卷」**（2026-08-13 修）：原实现到底后原速倒着往回滚，看着像录像倒放、同一批行来回扫两遍，使用方直接当成 bug 报了过来。顶部也停顿一次再开滚，否则跳回瞬间就滑走、第一行看不清。
- **新手引导与操作手册是一对，改功能要一起改**：引导（`layout/index.vue` 的 `TOUR_STEP_DEFS`，el-tour，按业务主线高亮侧栏菜单，步骤按用户可见菜单动态过滤）与手册（`apps/web/public/manual.html`，纯静态、按业务时间线分章）**章节顺序一一对应**，引导最后一步就指向手册。**任何改动用户操作方式的功能，必须同步更新手册对应章节**；引导内容大改时递增 `useTour.ts` 的 `TOUR_DONE_KEY` 版本号（当前 `hb_oms_tour_done_v5`）让老用户重看，并在该文件的版本注释里记一行原因。手册链接一律用 `${import.meta.env.BASE_URL}manual.html` 拼，**别写死**（生产 base 是 `/oms/admin/`、开发是 `/`）。
- `AppTable` 约定：序号列自动排在最后一个功能列（expand/selection）之后；展开列需显式 `fixed="left"` 才不会被固定列挤到中间。
- **订单表单「出口国家」下拉的国旗必须靠 [flag-preload.ts](apps/web/src/utils/flag-preload.ts) 在进页面时预热**（271 面 4x3 约 1.9MB，其中 142 面带纹章的超过 Vite 内联阈值、要真发请求；实测 8 并发本地也要 1.2 秒）。下拉用 `el-select-v2` 虚拟滚动，**不要为了「让国旗都显示」改回全量渲染**——那只是把「滚到哪行请求哪行」换成「打开面板一次全发」，第一次打开照样一片空白格，还额外背上 250 个 DOM 节点的卡顿。图在不在取决于请求何时发出，与渲染多少行无关。预热另有两个坑：URL 必须从**已生效的 CSS 规则**里现取（写死路径或用 `import.meta.glob` 都会与 CSS 实际引用的 URL 不一致，缓存命中不了）；**只取 4x3**，连 1x1 方形变体一起取会让下载量翻倍到近 4MB。
- **Element Plus 组件的全局默认行为一律在 `main.ts` 统一覆盖，禁止各页面逐处重复写**（个别场景可在组件上显式传值反转）。现役三项：
 - `el-dialog` 默认 `close-on-click-modal=false`（防误点遮罩丢表单数据）——直接改 props 默认值；
 - `el-tooltip` 的 `content` 按「1. / 2、」数字序号自动换行（[utils/tooltip.ts](apps/web/src/utils/tooltip.ts) 的 `patchElTooltip`）；
 - `el-input` 默认 `clearable`（[utils/input.ts](apps/web/src/utils/input.ts) 的 `patchElInput`），textarea / 密码框 / 带 `#suffix` 插槽的输入框自动跳过。
 - 后两项的做法是**用同名组件覆盖全局注册**（`app.component('ElInput', 包装组件)`）而**不是** mutate `ElInput.props`：EP 内部的日期选择器/级联选择器等是直接 `import ElInput` 的，不走全局解析，覆盖注册才能只作用于模板里直写的标签、不波及它们自带的清除逻辑。包装组件必须 `inheritAttrs: false` + 用 Proxy 把实例成员 `expose` 出去，否则页面 `inputRef.focus()` 这类调用会失效。
- 主题：侧栏固定深色（底 `#1E293B`、logo 区 `#16202E`、子菜单 `#192433`、hover `#263349`、激活 `#1C3462` + 左侧 4.5px `#165DFF` 竖条），标题行下分隔线 `#334155`；「更换主题」只影响 Element 主色，不改侧栏配色。

---

## 二、权限体系（唯一事实源）

`apps/server/src/modules/system/permission-manifest.ts` 是全部权限点（菜单/按钮）的 SSOT：

- 应用启动时自动 upsert 到 `t_permission`、回填 parentId、并补授 admin，**新增权限点/改名/改父级都无需写迁移 SQL**（但授予非 admin 角色仍需迁移 SQL）。
- 后端新增 `@RequirePermissions('xxx')` 或前端 `v-permission="'xxx'"` 时，必须在该清单登记。
- **前端按钮无权限时一律「禁用置灰」，不隐藏**（2026-08-13 起，`v-permission` 的默认行为即禁用；`.disable` 修饰符等价保留，仅为兼容既有写法）。藏起来会让用户以为系统没这功能，转而问同事或提工单；留个灰按钮他就知道该去找管理员要权限。工具栏按钮数量也不再随角色变化。
 - 禁用实现用**原生 `disabled` 属性**而非「捕获阶段拦 click」：事件到达目标元素后，该元素上的 capture 与 bubble 监听器同在 AT_TARGET 阶段按注册顺序执行，Vue 的 `@click` 在渲染时就绑好、早于指令 `mounted`，拦截器根本轮不到先跑。非表单标签（disabled 对其无效）才回落 `pointer-events:none`。
 - 因此**别再给 `v-permission` 加 `pointer-events:none` 的"双保险"**：它会连 `cursor:not-allowed` 一起废掉，用户点上去毫无反馈。
 - `.hide` 只留给「禁用讲不通」的容器型元素，现役唯一一处是系统配置的「危险操作」`el-tab-pane`——页签由 el-tabs 头部另行渲染，禁用面板 div 拦不住用户切过去。
 - **禁用是引导，不是防线**：服务端守卫才是（§2.1），API 可直调。
- `perm_type`：1=菜单 2=按钮；菜单节点的 `component` 对应前端 `src/views/` 下的组件路径。
- `access_type`：0=操作 1=查看，缺省由 `accessTypeOf()` 按「菜单=查看、按钮=操作」推导；**按钮型的读权限点必须在清单显式写 `access_type: 1`**（现役唯一一个是 `stat:dashboard`），否则角色权限树的「仅授只读」漏掉它、服务端的同页读权限补齐也认不出它。
- 现有菜单树（2026-08-07 调整后）：
  - **订单跟踪台账(4)** —— 一级叶子菜单，系统核心产出
  - 生产管理(5)：订单管理、外发管理、装配管理
  - 工艺管理(6)：开单信息
  - **物料管理(7)：成品出入库、成品库存、呆滞品管理、部件台账、期初录入** —— 成品库存口径（单据 + 结存）、呆滞品独立台账、部件半成品台账与上线期初
  - **统计分析(8)：产品汇总** —— 财务用的跨订单「产品视角」汇总查询（2026-08-14，口径见 §5.6 产品汇总块）；**不预置给内置角色**，由管理员按需授权
  - 设备管理(9)：设备信息（2026-08-14 由 8 挪 9，给统计分析腾位）
  - **基础数据(10)：客户资料、供应商、部门信息、岗位管理、职级管理、部件信息** —— 供应商紧挨客户资料（同为往来单位主数据）；岗位与职级紧挨部门信息（同为组织类主数据，且职级是岗位的配套）；部件信息属主数据，与出入库单据不同性质，故归此处
  - **HR人力资源管理(15)：人事档案** —— 员工花名册（基本信息含籍贯/民族/婚姻/政治面貌；教育背景含学历/学历类型/专业/毕业院校/毕业时间；用工与车间属性）；可读部门树；V1 暂不向订单等业务模块对外供数
  - 系统管理(90)：用户/角色/菜单权限/数据字典/**打印模板**/操作日志/更新日志/系统配置（`system:print-template` 2026-08-14 新增，排在数据字典与操作日志之间；纯前端页，看模板效果 + 设全局默认，无自己的后端接口。**菜单排序改清单 `sort` 即生效**——同步服务会 upsert `sort`，无需迁移 SQL）
- **调整菜单归属只改清单里的 `parent_code` + `sort`，无需迁移 SQL**：`PermissionSyncService` 第二遍对清单中**每一条**（含存量行）无条件 `update({ parentId })`，重启即生效。同理改名/改图标也只改清单。
  - 实例：`finished-stock:print` 2026-08-14 由「打印送货单」改名「**打印单据**」——一个权限点同时管**送货单与入库单**（都是「把这张单据打出来」的能力），改 `perm_name` 即生效，已持有的角色自动获得入库单打印权。
- 一级菜单**可以是叶子**（带 component 无 children）：`dynamic.ts` 按 `component && path` 注册路由、`SidebarItem` 用 `v-else-if="menu.path"` 渲染成普通菜单项，订单跟踪台账即用此形态置顶。
- **权限变更后不需要重新登录**（2026-08-14 核实并订正——旧表述「需重新登录刷新 JWT 权限」是早期实现的遗留）：
  - **服务端是实时的**：JWT 只承载身份，每个请求经 `UserAuthCacheService` 取实时鉴权上下文（60s TTL 内存缓存，角色/权限变更时由业务服务主动 `invalidate*`）。所以接口层面授权即刻生效，停用账号、调数据范围同理。
  - **前端是快照**：按钮与菜单取自登录/刷新页面时的 `GET /auth/profile`。故新按钮要**刷新页面**才可见（`v-permission` 是指令，只在挂载/重渲染时判断）；菜单是响应式渲染的，`store.menus` 一变就更新。
  - **已做静默同步**（[usePermissionSync.ts](apps/web/src/composables/usePermissionSync.ts)，布局层调用）：窗口重新获得焦点时节流（5 分钟）重拉 profile，菜单立即生效并补注册动态路由；有变化才提示，权限被**收回**时给不自动关闭的警告（那种情况用户屏幕上还留着不该点的按钮）。撞 403 时由 `request.ts` 调 `syncOnForbidden` 绕过节流立即同步。
  - **不要用强制下线**（`tokenInvalidBefore` 的 `revokeSessions`）来"让权限生效"——服务端本就实时，下线只会打断正在录单的人。那个能力留给停用账号/离职这类安全场景。
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

- **跨页引用型只读接口刻意只要求登录**（各 controller 有注释说明理由）：`/customer/all`（订单/开单信息表单的客户下拉）、`/supplier/all`（外发登记的加工商下拉，投影只回 id/编码/名称）、`/process-info/by-drawing`（订单表单按图号带入）、`/system/material/by-code`、`/system/dept` 与 `/system/dept/tree`（用户管理选部门、角色数据范围）、`/system/dict/type/:type`（全局字典）。挂菜单码会让「录订单的人没有客户资料菜单」直接 403。作为补偿，`/customer/all` 已收窄投影，只回下拉需要的 6 个字段，联系人电话/备注/审计信息不外露。
- **一个接口服务两个页面时用 `@RequireAnyPermissions`（OR）**：`/finished-stock/group-options`（成品出入库 + 期初录入）、`/assembly/inbound-quota`（装配 + 成品出入库）、`/system/menu/tree`（菜单权限页 + 角色分配权限弹窗）。最后一个此前只认 `system:menu`，导致「只能管角色、不能改菜单」的管理员打不开分配权限弹窗。
- **业务字段开关** `GET /system/config/features` **刻意只要求登录、不挂菜单权限点**（同上一条的跨页引用型只读接口）：各业务页开局都要读它决定字段显隐（现有「颜色」「客户图号」两个开关），挂 `system:config` 会让所有业务页 403。返回的只是几个布尔开关，不含业务数据。详见 §5.7。
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

现有迁移清单见 `db-migrate.ts`（**数组本身即权威清单，顺序即执行顺序**；此处不再复述条数，历史上这个计数反复过期）；现役业务表：`t_order` / `t_order_product` / `t_order_part_group` / `t_order_part` / `t_outsource_part` / `t_assembly_batch` / `t_finished_doc` / `t_finished_item` / `t_finished_balance` / `t_dull_stock` / `t_dull_stock_flow` / `t_part_balance` / `t_part_adjust` / `t_customer` / `t_supplier` / `t_position` / `t_job_level` / `t_process_info`(+history) / `t_material` / `t_equipment_info` / `t_department` / `t_dict` / `t_changelog` / `t_system_config` / `t_no_sequence` / `t_file` / `t_operation_log` / 权限体系五表。

> **一次性清数据的迁移必须做成「只生效一次」**（`migration-product-level-tracking.sql` 的写法，抄它）：`db:migrate` 每次跑**全量清单**，直接写 `DELETE FROM` 会让上线后任何一次重跑都清空生产数据。做法是用「被删的旧列是否还存在」当守卫——
> ```sql
> SET @c := (SELECT COUNT(*) FROM information_schema.columns
>   WHERE table_schema=DATABASE() AND table_name='t_assembly_batch' AND column_name='order_part_group_id');
> SET @s := IF(@c = 1, 'DELETE FROM t_assembly_batch', 'SELECT 1');
> ```
> 列删掉后第二次跑即 `SELECT 1`，永不再清。**验收方式**：造几行业务数据 → 重跑 `db:migrate` → 数据仍在（已实测）。

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

共享包现有内容：`business-status.ts`（订单/外发/装配/成品单据/启停状态、表面处理哨兵 `SURFACE_NONE` 与 `needsOutsource`）、`unit.ts`（套↔支 `PIECES_PER_SET=2`、英寸↔mm `INCH_TO_MM=25`、`normalizeDimensionText`、`formatDimension`）、`product-type.ts`（产品类型多选组合 parse/normalize/format、`hasSocket`、`formatProductModel`）、`rail.ts`（部件/边别/节数/部件组选项、`expandPartRows` 部件展开蓝图）、`version.ts`（`normalizeVersion`）、`outsource.ts`（**仅剩**重量→数量折算 `qtyFromWeight`——发坯单号、回齐判定、状态派生已随发坯单一并删除）、`assembly.ts`（批次状态派生 `deriveAssemblyStatus` / `isAssemblyCompleted`、入库闸门算式 `calcInboundQuota`、边别合法性 `isValidSide` 与 `assemblySides`）、`employee-code.ts`（员工编码规则：厂区表 `EMP_PLANT_OPTIONS`、年份标识 `empYearFlag`、非正式前缀 `empCodePrefix`（S实习生/L临时工/A学徒/P派遣工）、换号判定 `needsEmpNoReissue`、拼装 `buildEmpNo` 与界面预览 `empCodePreview`；**部门编码不在此，它是 `t_department.hr_code` 主数据**）。

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

**Excel 导入导出的公共件（2026-08-12 起，新增导出/导入一律复用，禁止各模块手写字体边框）**：

| 位置 | 职责 |
|---|---|
| [excel.util.ts](apps/server/src/common/utils/excel.util.ts) | `styleSheet` 统一排版（**等线 10 号 / 自动列宽 / 隔行浅灰 / 内容区浅灰边框 / 关闭网格线 / 冻结表头**）、`createWorkbook`、`addTipsSheet`（模板的「填写说明」页）、`EXPORT_ROW_LIMIT`(5000)、`labelOf`、`loadFirstSheet`、`cellString`、`parseTypeLabels`、`importRejected` |
| [excel-response.util.ts](apps/server/src/common/utils/excel-response.util.ts) | `sendXlsx` 文件流响应头（中文名走 RFC 5987） |
| [ImportDialog.vue](apps/web/src/components/ImportDialog.vue) | 通用导入弹窗：模板下载 + 拖拽上传 + **导入前二次确认** + 逐行错误清单 + 失败计数 + 回滚提示；模块差异只有 标题/提示/模板函数/上传函数，额外选项走 `#options` 插槽 |
| [useExcelExport.ts](apps/web/src/composables/useExcelExport.ts) | **导出前预检 → 二次确认** + loading + blob 错误还原 |
| [download.ts](apps/web/src/utils/download.ts) | `downloadXlsx` blob 下载并按响应头取中文文件名、`readBlobError` |

- `styleSheet` **必须在写完所有数据行之后调用**——自动列宽要量全部单元格，提前调只量得到表头。
- 隔行填充口径：表头下**第一条数据留白、第二条起填灰**（与表头之间隔开一条，视觉上更分得开）。
- **导出超限/无数据一律拒绝，不给空表或静默截断**（沿用台账导出口径）。行数上限 `EXPORT_ROW_LIMIT` 在**共享包**（`shared/src/export.ts`）：服务端做强制拦截、前端做导出前预检，两端各写一份必漂移。
- **导出顺序是「先预检、再确认」，不能反过来**：`useExcelExport` 会先按当前筛选实查一次条数，**为 0 或超限就直接提示、根本不弹确认框**——先弹确认框、用户点完才被服务端拒绝，等于让人确认一件注定失败的事。条数**每次实查**而不是取页面上的 summary/total：用户改了筛选却没点「查询」时，页面汇总还是上一次的数，拿它提示会和实际导出的内容对不上。前端预检**不替代服务端守卫**（API 可直调），两道都要留。
- **凡是导出按钮，前端必须「预检 + 确认」、服务端必须「空结果拒绝」**（2026-08-12 全项目巡检后统一）。现役导出端点（**刻意不写总数**——历史上这个计数反复过期）：呆滞品 / 部件台账 / **成品库存** / **成品出入库记录** / 岗位 / 数据字典 / 部件清单 / 开单信息 / 订单跟踪台账 / 订单总计划 / **装配记录** / 产品汇总（累计 + 期间两个）。巡检发现的缺口已补齐——台账与开单信息**缺确认框**、岗位与数据字典**两样都没有**、岗位与字典与部件清单**服务端也不拦空**（会导出一张只有表头的空表，拿去对账最危险）。新增导出一律走 `useExcelExport`，别再各写一份 `ElMessageBox.confirm`。E2E `e2e-export-guards.mjs` 覆盖前 8 个端点的空结果守卫，成品库存另见 `e2e-stock-balance.mjs`，装配记录另见 `e2e-assembly-export.mjs`。
- **装配记录导出**（`GET /assembly/export`，权限 `assembly:export`）是**唯一的多表导出**：Sheet1「装配汇总」一行一个产品（对齐列表页 17 列），Sheet2「装配批次明细」是这些产品的逐批完成记录（含登记人/登记时间）。四数**直接复用 `findList`**、不另写聚合 SQL（同台账导出口径）；行数上限按汇总行算，明细表跟着走。
- **导出的「规格」列跟随系统配置的默认查看单位**（台账导出与总计划导出，2026-08-14）：表头写「规格(mm)」/「规格(寸)」、取值走 `formatDimensionView(mm, 单位, 系数)`，口径与页面一致，车间拿表对手工账不用再自己换算。详见 §5.7 单位换算。
- **导出里的字典值必须转中文**，统一走 [dict-label.util.ts](apps/server/src/common/utils/dict-label.util.ts) 的 `loadDictLabels` + `dictLabeler`（台账导出与成品库存导出共用）：`dict_value` 是 `electrophoresis` 这类英文码，车间拿导出表贴工位、对手工账，看到英文等于没导。取不到标签时**回原值**而不是空串——字典项被停用后至少还认得出原始码。
- ⚠️ **导入失败的逐行明细在前端要双取 `err.response.data.errors ?? err.errors`**：HTTP 400 时 `request.ts` 的拦截器 reject 的是**原始 axios 错误**，只读 `err.errors` 永远是 undefined（岗位导入曾因此在浏览器里只显示一句概要，2026-08-12 修）。`err.message` 同理是英文的 axios 文案，要取 `response.data.message`。
- ⚠️ `AllExceptionsFilter` **只透传白名单字段**（`errors` / `failedCount` / `totalCount`）：批量接口新增回传字段必须在那里一并放行，否则前端拿到 undefined（本会话已踩）。

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
       └ 部件组锚点 ┘                          └────────── 产品行锚点 ──────────┘
                                                          ↘ 部件台账(part-stock，V1 仅参考台账)
```

### 5.2 订单四级结构与跟踪锚点分层（2026-08-10 定型）

`t_order`（订单）→ **`t_order_product`（产品行 = 装配/成品/台账锚点）** → **`t_order_part_group`（部件组 = 外发锚点 + 工艺属性载体）** → `t_order_part`（部件行）。

- **锚点分两层，别再"一刀切"**（改错方向会让四数直接失真）：

  | 环节 | 锚点 | 为什么 |
  |---|---|---|
  | 外发件回厂 `t_outsource_part` | **部件组** | 部件确实是分开送去表面处理、分批回厂的 |
  | 装配 `t_assembly_batch` | **产品行 + side** | 装配的动作是把各部件组装成整套滑轨，本就是产品级活动 |
  | 成品明细 `t_finished_item` | **产品行 + side** | 入库对象是装配产出的整套滑轨，拆回外/中/内入库与实物不符 |
  | 成品余额 `t_finished_balance` | **(产品行, side, 批次, attr_key)** | 同上，唯一键随明细走 |
  | 入库闸门 | **(产品行, side)** | 两侧必须同维度，否则额度与入库量对不上 |
  | 台账主行 | **产品行** | 四数在产品级；部件组降为展开明细 |

- **部件组保留的职责**（不要因为"降级"就误删）：订单四级结构、部件行展开依据、生产图号/版本/料厚的载体、外发回厂锚点、台账展开子表。
- **闸门变松是有意的**：产品级闸门只卡总量，不再约束"入到哪个部件组"——成品本身已无组的概念，入库对象就是产品。
- **字段归属（2026-08-07 调整，勿再挪回去）**：
  - `po_no`（PO#，客户订单文件上的订单编号）与 `production_no`（生产单号）**都在订单级 `t_order`，一对一**——一张订单不会有两个生产单号。台账「订单编号」列取的就是 `t_order.production_no`，下游单据的 `production_no` 快照也一律自订单取。
  - 产品级新增 `customer_drawing_no`（**客户图号**，客户来图上的图号），与部件组的 `drawing_no`（**生产图号**，内部转化的技术图纸）是两个字段，别混。
  - `t_order_product.production_no` 与 `t_order_product.assembly_workshop` **已删列**（`migration-drop-deprecated-order-cols.sql`）。该迁移带**安全闸门**：若存在「同一订单多个产品行填了不同生产单号」就中止不删（回填只取行序最前的一个，删列会让其余值永久消失）——闸门用「让预处理语句指向一个不存在的表」实现，报错文本即中止原因。db-migrate.ts 另加 `forbiddenColumns` 断言盯住这两列不得复活。
- **默认按节数逐部件铺开**（2026-08-10 改，原默认是单个 `whole` 整品组）：三节轨 → 外轨/中轨/内轨三组，二节轨 → 外轨/内轨两组，口径由共享包 `defaultGroupTypes(railSection)` 给出，**订单表单默认值与服务端兜底共用它**。改成部件粒度是为了让外发回厂/装配/出入库/台账都能逐部件核算——挂整品组时这些环节只能按"一套"记账，分不出是哪个部件回厂了。
  - **二节轨不能有中轨组**：`expandPartRows('middle', 'two_section', …)` 展开为空，服务端直接拒绝保存。所以 `defaultGroupTypes` 必须按节数返回；前端组类型下拉也据此禁用（判定复用 `expandPartRows(...).length === 0`，不另写节数规则），切换节数时自动摘掉/补回中轨组（填过内容先弹确认，取消则回滚节数）。
  - `whole` / `outer_middle` 组**保留可选**，存量订单原样不动——编辑页按库里的组还原，新默认值不会覆盖历史数据。
  - **组不拆数量**，各组支数默认 = 产品支数（组间是同一批产品的互补部件，非数量拆分）。同产品行内 `group_type` 唯一（`uk_product_group`）。
  - ⚠️ 系统**不校验**「整品组与部件组并存」：`whole` 已含外/中/内三个部件行，再叠一个 `inner` 组会把内轨重复计量。补组下拉已把组合型（外中轨/整品）排到单部件组之后以减少误选，但拦不住手动选。
- 部件行由服务端按 `expandPartRows(组类型, 节数, 是否卡口, 组支数)` **蓝图展开**（三节轨 3 行 / 二节轨 2 行无中轨；含卡口再按左右分列，奇数支左边多一支），客户端只能微调追溯码/备注。
- **分体出货 `t_order_product.is_split`（2026-08-12）**：客户把一支滑轨拆成多行下单（三节轨拆「外中轨」+「内轨」两行，分开包装出货、不组装成整品）。要点：
  - **仅三节轨可开**（`canSplitShipping`，业务口径）：二节轨只有外/内两个部件，厂里不拆单下单。前端禁用开关（已开着的异常数据不锁死，否则用户关不掉）+ 切节数时自动关，服务端 `writeChildren` 硬校验兜住 API 直调。
  - **需外发（表面处理≠无）时组合型组自动拆成单部件组**（`splitCombinedGroup`，前端 `maybeSplitCombinedGroups`，触发于 组类型/表面处理/节数 三处 change）：外发锚部件组，挂「外中轨」组会让 ① 回厂只能按一条记账、分不出各部件；② 单重按部件建档、组合型组取不准，重量折算数量系统性偏差。**与分不分体无关，整品行同样适用**。拆分时图号/版本/料厚**原样复制**到各行（计划员核对只改差异项，留空让人重录一长串图号更费事）；目标组已存在则跳过、组合组整行移除（`uk_product_group` 不允许重复）。
  - **服务端刻意不硬拦「需外发 + 组合型组」**（同岗位下拉过滤的先例：录入引导 ≠ 服务端校验）——硬拦会挡住存量数据编辑，而粒度粗只是跟踪不精细、不会算错数。
  - **二节轨的「外中轨」组已禁用**（`isGroupTypeAvailable`）：它在二节轨下实际只剩外轨，组名写着外中轨、形态却推导成外轨，账面自相矛盾。「整品」是相对语义（有几个部件含几个），不受此限。
  - **出货形态不落库**，由该行部件组构成即时推导（组列表即事实源）：共享包 `splitParts`（组→部件并集）/ `splitSuffix`（生成式后缀：外中轨/内轨/中内轨…）/ `productLevelModel`（**产品级型号唯一拼法**，整品「滑轨」后缀、分体行带形态后缀）。**禁止再落第二个「出货形态」字段**——两处必然漂移。
  - **产品级型号的调用点必须走 `productLevelModel`**（快照服务/装配列表/台账/看板都已换），否则同订单同货号两行在下游分不出彼此。
  - **「免装配」口径已于 2026-08-13 整体下线**（使用部门反馈：内轨等单部件行同样要装配自身小零件）：共享包 `needsAssemblyGate` 与快照的 `splitParts` 字段已删，**所有产品行（含分体单部件行）一律录装配批次、受入库闸门约束**，台账装配两列一律出数字。免装配时期已入库的分体行会被 `verify:ledger`【3】报出「入库 > 装配」——去装配管理补录批次即可，不是 bug。**新代码不得再引入免装配/exempt 概念**。
  - 分体行组并集 = 当前节数全部件 → 就是整品，前后端都拒绝保存（前端 `splitCoversAll`、服务端 writeChildren）。

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
| FGI | 成品**生产入库**单 | 同 ORD | finished-stock.service（`prefixOf()`） |
| FGO | 成品**出库**单 + **期初**（`opening_balance` 虽是入向但走 FGO 序列，§4.7 明文） | 同 ORD | 同上 |
| FGR | 成品**红字冲销**单 | 同 ORD | 同上 |
| FILE | 文件上传 | 同 ORD | file.service |
| POS | **岗位编码** | `POS + 3位流水`（全局递增，不按部门分组） | position.service（`generateCode`，计数键 `POS`） |
| （无） | **员工编号** | `2位厂区 + 2位年份标识 + 3位部门 + 3位流水号`，非正式人员带 S/L 前缀 | employee.service（`generateEmpNo`，计数键 `EMP:{厂区}{年份}{部门}`） |

**不采番的业务行**：**外发件回厂记录**、装配批次、部件调整流水、**呆滞品档案与其出入库流水**属轻量记账行，无单据号（主键 id 即可）。

**送货单号也不采番**：它由所依托的出库单号**派生**（`FGO260814-0001` → `20260814-0001`，共享实现 `deliveryNoOf`），既保住纸质单的日期形态又天然唯一，客户报号时能直接回查到系统单据。**不要为它新开一个序列**——那会让同一次发货有两个号。

**入库单更是连派生都不做**：纸面「入库单号 NO:」直接印所依托的入库单号（`FGI260814-0001`）。它是**内部凭证**，不像送货单要迁就客户那套日期形态的纸质单；印原号，仓库拿着单子能直接回查到系统单据。

### 5.5 基础数据 vs 业务流水

- **基础数据**（客户资料、供应商、开单信息、部件信息、**岗位**、字典、用户/角色/部门、设备信息）：可编辑，用 `status` 启停或软删除；**被业务引用后限制删除**（可停用）。
  - **岗位 `t_position`**：被员工引用（`t_employee.position_id`）时禁止删除，提示改用「停用」——停用同样不进下拉，但已在岗员工与历史档案完好。
    - **岗位编码自动采番**（`POS+3位`，§5.4），客户端传了不采信；**编辑时编码不可改**（恒取库中值）——它是对账用的唯一业务键，放开会让外部台账对不上号。存量 4 条是从旧字典搬来的（`stamping`/`qc` 等），格式不同但原样保留，不为统一格式去重编老数据。
    - **岗位性质 `position_nature` 是三值**（`normal`普通岗 / `manager`管理岗 / `tech`技术岗，2026-08-12 由布尔的 `is_manager` 升级——加了技术岗之后「是不是管理岗」这个是非题已经表达不了了）。选项与标签在共享包 `position.ts`。
    - **批量导入/导出/删除**：导入**整批校验通过才落库**（沿用客户导入约定，错误逐行经 `errors` 数组回传），模板**不含岗位编码**（系统采番）；提供「覆盖更新」开关，按「岗位名称+所属部门」匹配。**批量删除刻意不整批回滚**——各行互相独立，删掉能删的、把不能删的原因摊给用户更有用。
  - **职级 `t_job_level`**（2026-08-12 由字典 `job_level` 升级为独立主数据）：
    - 职级是「**本序列内的等级**」而不是岗位名称——质检员分初/中/高级，工程师分助理/工程师/高级/资深，管理分班组长/主管/经理/高管。原先那套（普工/操作工/机长/工程师…）实际是岗位名称，与岗位列表的「岗位名称」列几乎一模一样，起不到职级的作用。
    - **为什么不用字典**：序列归属得靠 `t_dict.parent_value` 手填「上级键值」，在通用字典页面维护极易填错，故给它一张自己的表和「基础数据 → 职级管理」页。
    - `position_nature` 即所属序列（与岗位性质同一套值）；**岗位的职级必须与其性质同序列**，前端下拉按性质过滤、服务端 `normalize` 再硬校验一次。
    - 唯一键是 `(position_nature, level_name)`——不同序列可以有同名职级；被岗位引用后禁止删除，下线用「停用」。
    - **被引用的职级还禁止改「所属序列」**：岗位保存时的跨序列硬校验只拦得住新数据，就地把职级挪到别的序列会把已引用它的存量岗位改成跨序列且无人报错。要挪只能在目标序列新建职级、再把岗位改挂过去。改名/改等级/改排序不受限。
  - ⚠️ **供应商是例外，删除不做引用检查**：外发回厂只快照 `processor_name` 名称、**不持有 `supplier_id`**，删主数据动不了历史记录（§5.5 快照原则）。想临时下线用「停用」——停用即不进下拉，历史照旧。加工商下拉 `allow-create`，主数据没维护到的新厂可直接手输，不挡录入。
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
- **PO# 与生产单号必填**（2026-08-14，业务部门要求）：两者都是对账用的业务键——PO# 是客户订单文件上的号（送货单按各客户叫法印成「采购单编号」「合同编号」，§5.6 送货单块），生产单号是车间与台账认的「订单编号」。前端 `rules` + 服务端 `CreateOrderDto`（`UpdateOrderDto` 继承它，故编辑同受约束）双向校验。要点：
  - **编辑存量空值订单会被要求补填**——有意为之，顺带把历史数据补齐；
  - **「期初补录」订单不豁免**（`is_opening` 只是区分标记，从不改变校验行为）；
  - **复制新建时 PO# 被清空**（新订单文件必然新号），生产单号预填递推建议值，两者都得有值才能保存；
  - ⚠️ DTO 里 `@IsNotEmpty` 必须写在**最靠近属性**的一行：装饰器自下而上注册、消息取 constraints 第一条，放上面会让字段缺失时报「不能超过 64 个字符」（已实测）。
- **复制新建（2026-08-13）**：列表「复制」按钮（复用 `order:create`，已作废单也可复制——复制的是内容不是状态）→ `/order/form?copyFrom=<id>`，与编辑共用同一条回显路径（`init()` 里 `isCopy` 分支），走新建保存、单号重新采番。**不继承**：PO#（新订单文件必然新号）、订单日期（重置今天）、产品行交期（沿用旧交期漏改比重填代价高）、附件（多为旧单客户文件）、期初标记、审计信息；备注与图文订单备注**保留复制**（模板价值所在）；生产单号**预填后缀递推建议值**（`suggestNextProductionNo`：`-A`→`-B`、`-Z`→`-AA`、无字母后缀补 `-B`，**刻意不递增数字结尾**——那是单号本体不是批次后缀），可改可清空。纯前端实现，后端零改动。
- **同 PO# 软提醒**：PO# **无唯一约束**（同 PO 追加/变更另建新单是合法操作，口径：原单没走下游=直接编辑原单；走了下游=增量另建新单、PO# 照填、生产单号加后缀区分）。新建保存前若 `QueryOrderDto.poNo` 精确匹配（非 LIKE，与 keyword 独立）查到同 PO# 订单即弹确认框，**只提醒不拦截**，防的是同一份订单文件重复录两遍。
- ⚠️ 订单表单保存 payload 必须显式带 `isOpening`（2026-08-13 修复：此前漏传，服务端新建兜底为 0，「期初补录」开关形同虚设——开了也落 0，期初录入页 `onlyOpening` 选不到这张单）。
- 部件组表格支持「复制上一行」：沿用上一组的图号/版本/料厚/支数，组类型自动换成下一个未占用的（同产品行内 `group_type` 唯一，照抄会撞 `uk_product_group`）。
- **订单备注双字段（2026-08-08，移植自 hb-mes）**：`remark` VARCHAR(255) 是列表可见的一句话摘要；`other_req` TEXT 是**图文混排**的「订单备注」（wangEditor 输出 HTML，图片走 `/upload/editor-image` 存真实 URL，正文只留 `<img src>`）。两者用途不同，勿合并。
  - 实体上 `other_req` 标了 **`select: false`**：列表一次 20 张单，把富文本正文全拉回来白白撑大响应体，而列表根本不展示它；详情接口用 `addSelect('o.otherReq')` 显式补选，改列表投影时别忘了这一条。
  - 前端保存前**必须 `await richEditorRef.flushUploads()`**：编辑器里插入的图片在 flush 前只是本地 blob 预览，不 flush 就提交，落库 HTML 里全是刷新即失效的 blob 地址。
- **生产任务单打印页 + PDF 导出（2026-08-13）**：订单列表操作列「导出单据」→ `/order/print?id=`（`views/order/print.vue`），版式对照车间纸质单。按钮复用 `order:export` 权限，已作废订单禁用。
  - **路由刻意注册在顶层、不挂 Layout 下**：Layout 的 `el-main` 自带 16px 内边距、侧栏顶栏在打印媒体下仍占布局高度，会把 A4 纸面整体顶下 12.7mm，**每张单据都多出一页空白**（已实测）。顶层路由 = 纯净页面；登录校验不受影响（`beforeEach` 对所有非 `/login` 路由一律查 token）。同理 `.print-sheet` 打印时 `min-height: 283mm`（A4 285mm 可用高度留 2mm 余量）——设成正好 285mm 时任何渲染舍入都会溢出成第二页。
  - 版式要点：主表格一产品行一行，相邻**同货号**行的 货号/产品要求/尺寸/颜色/图号 同值时 rowspan 合并（分体拆行的纸质形态）；「分类」列分体行=形态后缀、整品行=「整品」；「颜色」空值回落表面处理中文（纸质单该格常填封漆）；页头日期**数字加粗、年月日汉字不加粗**（故 `cnDateParts` 返回三段而非拼接串）；表格用等宽字体；签名栏 `margin-top:auto` 贴纸面底部、四项水平居中，「制单」填订单**跟单员**、「业务审核」填**业务员**（都取订单字段，**不取录单账号 `creatorName`**——录单的可能是文员代录，与单据责任人是两回事）；下半部分 `v-html` 渲染 `otherReq` 富文本（含图/表）。
  - **PDF 走服务端渲染**：`GET /order/:id/task-order-pdf`（`order:export`，`@SkipTransform` 文件流）——[PdfService](apps/server/src/common/services/pdf.service.ts) 用无头浏览器打开**这张打印页**截 PDF，**不另拼一份 HTML 模板**（两套模板必然漂移）。token 经 `evaluateOnNewDocument` 注入 localStorage（**不放 URL 查询串**，否则进 Nginx access log）。打印页地址由 `PRINT_BASE_URL` 配置（开发 Vite 5174 / 生产 Nginx `/oms/admin`）。
  - ⚠️ **PdfService 的三条内存纪律不得删改**（生产 3.5G 内存还跑着 MySQL/hb-mes/QMS/OnlyOffice，常态可用仅 1.3G）：**单例 + 懒启动 + 空闲 60s 自动关闭**（不导出时浏览器进程根本不存在）、**串行队列**（并发会线性放大内存）、**超时强杀**。用 `puppeteer-core` 而非 `puppeteer`（后者每次安装下载 ~300MB Chromium）；浏览器由系统提供，部署脚本装 Google Chrome 官方 deb（Ubuntu 22.04 的 `chromium-browser` 是 snap 转接包，root+无头下常被 AppArmor 拦），**装失败只警告不中断部署**。
- **导出总计划（2026-08-08）**：`GET /order/export/total-plan`（权限 `order:export`，`@SkipTransform` 返回文件流，**必须注册在 `:id` 之前**）。行粒度 = **订单产品行**，字段比台账导出更全（PO#/产品名称/材质/是否新单/出口国家/订单状态）。
  - **四数不另写聚合 SQL**：内部调 `findLedger`，与台账页、订单自动完结共用同一口径。为此给 `QueryLedgerDto` 补了 `orderDateFrom/To`（订单列表按下单日期筛选）。台账主行升产品级后 `findLedger` 直接返回产品级行，原先「按 orderProductId 分桶再汇总」的整段逻辑已删除。
  - 一个产品跨多组时，组级字段（组类型/生产图号/版本/料厚）由 `joinGroupField` **按组序正序**去重并列——组明细的 `ORDER BY g.sort, g.id` 保证得到「外轨/中轨/内轨」这种与订单表单一致的顺序。
  - 上限同台账 5000 行，超限与无数据一律**拒绝而非静默给空表**；按「已作废」筛选时直接提示作废单不进总计划（台账口径本就排除作废）。

**外发件回厂记录（M3）**

> ⚠️ **2026-08-10：外发模块经两轮简化定型**。第一轮取消「发出」环节（发货不过磅、不留发出数量），第二轮**连发坯单也取消**——使用部门只需要记「外发件回厂了什么、回了多少」。三张表（单头/明细/回货流水）已塌缩为单表 `t_outsource_part`，`t_outsource_doc` / `t_outsource_item` / `t_outsource_return` **已删除**。**新代码不得再引入发坯单、发出、应回数量、回齐等概念。**

- **一行 = 一次回厂**。锚定订单部件组；同一组可有多行（分批回厂），不做唯一约束。**外发是唯一仍锚部件组的环节**（装配/成品/台账已升产品级，§5.2）——部件确实分开送去表面处理、分批回厂，这层不能跟着升。
- **没有状态列**（记录存在即已回厂，派生不出第二种状态）、**没有单据号**（不采番，与装配批次同属「轻量记账行」，见 §5.4）、**不登记计划回厂时间**（业务不跟踪还在外面的货）。共享包的 `OUTSOURCE_STATUS` / `deriveOutsourceStatus` / `isItemFullyReturned` / `BLANK_NO_WIDTH` / `formatBlankNo` 均已删除，`outsource.ts` 只剩 `qtyFromWeight`。
- 字段分两类：**订单侧快照只读带出**（生产单号/产品型号/规格/订单数量+单位/生产图号/材料厚度/周期码/订单号/客户）、**人工录入**（加工商、表面处理+颜色、实际回厂日期、重量、单重、数量、备注）。快照一律由服务端经 `PartGroupSnapshotService` 读取落库，不采信客户端传值。
  - 为此给 `PartGroupSnapshot` 补了 `orderQty` / `unit` / `drawingNo` / `materialThickness` 四个字段——**下游模块要新的快照列一律加在这个服务里**，禁止各模块自写 SQL（§一 后端架构）。
- **表面处理与颜色自订单带出、允许改**（实际做的与订单登记的可能不同）；但改写值同样不能是 `none`——不外发的产品不该有回厂记录。
- **入账依据是「回厂数量」，重量与单重是佐证**（2026-08-11 定型）：加工商的送货单是印刷单据，多数只印数量，重量要人手写补、常漏。三者都可人工修改，选中部件组时**重量与数量留 0**——拿订单数预填会让人顺手存下一个没核对过的假数。
  - **「谁驱动谁」由录入方式显式决定**，唯一实现在 [useOutsourceEntry.ts](apps/web/src/composables/useOutsourceEntry.ts)，登记页与列表编辑弹窗共用：
    - `qty` **按数量**（默认，**每次进入都重置成它、刻意不记忆上次选择**——记住上次会让人停在折算模式里，填了数量再补重量又被改掉）：以送货单数量为准，重量/单重仅记录，**不回算数量**；
    - `weight` **按重量折算**：`qtyFromWeight`（重量 ÷ 单重 四舍五入）驱动数量，算完仍可微调。
  - ⚠️ **不要把 `syncQty` 改回无条件触发**。原实现里重量变化**始终**改写数量，导致「按送货单填了 100 → 顺手补一个重量 → 静默变成 80」，账做错了还没人知道（浏览器实测复现过）。现在 `syncQty` 开头有 `if (isQtyMode) return`，这行是关键。
  - 编辑弹窗的模式**按记录自身推断**（重量与单重都 > 0 → 折算模式，否则按数量），不跟登记页的 localStorage 偏好走——编辑的是既有数据，跟着上次的偏好走会改错。
  - 三个数都 > 0 且 `|数量 − 重量÷单重| / 数量 > 10%` 时保存前确认一次（`mismatchedQty`），**只提示不拦截**；也**不清零重量**——表面处理常按重量计价，抹掉重量会让加工费对账失去依据。
- **单重按「组对应的部件」带出**（2026-08-10 改，原先按产品行 `material_id` 带一个值）：部件信息 `t_material` 是**按部件建档**的（`part_type` 取值 `outer/middle/inner`，同货号下各一条、单重不同），部件组拆到部件粒度后必须按部件取，否则外轨组和内轨组会拿到同一个单重、折算出的数量系统性偏差。
  - 实现在 `OutsourceService.loadPartUnitWeights`：按 `(item_no, partGroupParts(组类型)[0])` 批量匹配，取不到回落产品级、再回落 0。**组 → 部件用共享包 `partGroupParts(...)[0]`**（与订单表单按图号带工艺版本的取法一致），外中轨/整品组本就混着多个部件，单重只能给默认值。
  - ⚠️ `t_material.part_type` 的列注释一度写成 `outer_rail/middle_rail/inner_rail`，与实际取值不符，已随本次改动修正（`migration-material-part-type-comment.sql`）。
- 录入支持**一次多行**：勾选多个部件组共用同一加工商与回厂日期（车间一次拉回一批货，逐条重填加工商和日期纯属折磨人）。编辑只能改单条，且**锚点不可改**（改锚点等于换部件组，要换只能删了重录）。
- 接口只剩 `GET /` `GET /part-group-options` `GET /:id` `POST /` `PUT /:id` `DELETE /:id`；权限点只剩 `outsource`（菜单）+ `outsource:create` / `:update` / `:delete`。原 send / close / cancel / return / return-cancel / print 与《电镀发外加工单》打印页一并下线，加工单改回纯手工。
- **台账「外发已回货」**：主行是**该产品下各部件组之和**（`JOIN t_order_part_group` 按 `order_product_id` 聚合），展开行的 `partGroups[]` 再给出逐组明细；展开行的外发流水直接列本表记录、带 `groupType` 标明是哪个部件回的厂。
- **台账「外发欠数」= 应外发量 − 已回货量，应外发量是 `Σ组支数` 而不是产品订单数**（2026-08-10 新增列，位于「外发已回货」与「装配车间」之间）。
  - ⚠️ 这条最容易写错：外发锚部件组，一个三节轨 20 支的产品拆成外/中/内三组各 20 支，**实际要送出去 60 支零件**。用产品订单数去减各组回货合计（20 − 32）会得到 −12 这种废数（已用 E2E 实证）。
  - **表面处理 = `none` 的产品为 `null`**（共享包 `needsOutsource` 判定），界面显示灰色「—」、导出留空——它压根不走外发，显示 0 会和「已全部回厂」混淆。
  - 组级 `partGroups[].outsourceOwed` 同口径（组支数 − 该组回货），主行即各组之和；「哪个部件还没回来」看展开行。
  - 计算落在 `attachPartGroups` 里（那里才同时拿得到组支数与组回货），**不要挪到主 SQL 的 `ret` 派生表**——那张表只按组求和回货量，没有组支数。
- **首页右卡是「近期外发回厂」**（最近 N 条流水），不是超期提醒——不登记计划回厂时间就没有超期基准，也没有"还在外面没回"的记录，那张卡已无法计算。


**装配批次（M3.5）**

- 锚点是**订单产品行 + 边别**（`order_product_id` + `side`，2026-08-10 由部件组升级）：含卡口组合必须落 `left`/`right`，非卡口必须为空串；闸门按 side 分别核算，**左右不串量**（§7.15）。建单时由服务端按 `hasSocket(产品类型)` 硬校验，填错直接拒绝。
- 订单侧展示字段（订单号/生产单号/产品型号/规格/支数）一律经 [ProductSnapshotService](apps/server/src/common/services/product-snapshot.service.ts) 读取落库，**禁止各模块自写 SQL**。它与组级的 `PartGroupSnapshotService` 并存、各管一层：产品级服务给装配/成品/期初，组级服务给外发。
- 时间三件套：`plan_start_date`（计划开始）/ `plan_date`（计划完成）为计划员录入的**预计装配区间**，纯计划属性、**不参与闸门**；`actual_date`（实际完成）才是完工与闸门的唯一依据。
- 一个产品可多批；`plan_date` 与 `actual_date` **至少填一个**（只有计划开始的批次跟踪不到完工）；`plan_start_date` 不得晚于 `plan_date`，前后端双向校验。
- 状态 `status` 落库但为**派生值**，只能由共享包 `deriveAssemblyStatus(actualDate)` 赋值：`actual_date` 空=1计划中、非空=2已完成。聚合已完成装配量时一律按 `actual_date IS NOT NULL` 判定，**不依赖 status 列**（防历史脏数据让闸门失准）。
- **装配车间只存在于批次级 `t_assembly_batch.workshop`**（2026-08-07 起）：订单环节不再安排装配车间，产品行 `assembly_workshop` 已弃用。装配列表与订单跟踪台账的「装配车间」列改为**聚合该产品各批次的车间**（`GROUP_CONCAT(DISTINCT …)`，一个产品多批可分属不同车间，界面并列显示），筛选改为 `EXISTS` 匹配批次车间。新建批次的默认车间取该产品最近一条批次的车间，不再从订单继承。
- **前端排产数量默认 = 该边别未排产量**：非卡口目标为产品订单数，含卡口左右各半且**奇数支左边多一支**（`Math.ceil` / 减法，与共享包 `expandPartRows` 同口径，保证左右合计守恒）。
- **入库闸门口径的唯一实现在 [assembly-quota.util.ts](apps/server/src/modules/assembly/assembly-quota.util.ts)，成品入库确认必须复用，禁止另写第二份 SQL**：
  `可入库量(产品行, side) = Σ已完成装配量 − Σ已入库量`。
  已入库量只统计**已确认的入库方向单据**：`biz_type='inbound'` 计正、冲销 inbound 的红字单按 direction 计负；**期初 `opening_balance` 与销售出库 `sale_outbound` 均不参与**（期初无装配过程、§4.5 明文豁免闸门，若计入会让该产品额度永久为负而挡死后续入库；出库参与则会凭空放大额度），冲销期初的红字单同理排除。
- **不得使可入库量为负**（§7.14）：删除批次、下调 qty、退回「计划中」三条路径改完都要复核，为负则**整笔事务回滚**并提示先红字冲销对应入库单。锁顺序统一为「先锁该产品行全部批次行（`FOR UPDATE`）→ 再改本行 → 复核」，与入库确认保持一致，避免交叉等待死锁。
- **分体行（含单部件行如内轨）照常建批次**（2026-08-13 起）：原「免装配禁建批次」已随免装配口径整体下线（§5.2）。
- 编辑接口**不含锚点**：产品行与边别不可改（改锚点等于换产品，会把原产品额度静默抽走），要换只能删除后重录。
- 超装配（Σ装配量 > 产品支数）**允许**，前端黄色提示不拦截；台账「装配未完成量」可为负。
- 批次是轻量记账行，**不采番、无单据号**（§5.4）。
- ⚠️ 批次弹窗的「含卡口」`el-tag` 必须带 `disable-transitions`：弹窗是复用的，换产品时 `v-if` 在弹窗隐藏状态下翻转，el-tag 的 zoom 过渡收不到 `transitionend` 就走不完，节点被留在 DOM 里——下次打开一个不含卡口的产品，这个标签会原样复活（已踩，浏览器实测复现）。

**成品出入库与订单跟踪台账（M4）**

- 三表：`t_finished_doc`（单据头）/ `t_finished_item`（明细）/ `t_finished_balance`（余额）。明细锚定**订单产品行 + 边别**（2026-08-10 由部件组升级——入库的是装配产出的整套滑轨，拆回外/中/内分别入库与实物不符），卡口按左右分行。挂订单的明细 `group_type` 恒为 null（整套滑轨没有组的概念），只有纯属性期初行才可能有值。
- **数量恒为正**，出入方向由单头 `direction`（1入 −1出）表达；聚合一律 `direction × quantity`。红字单方向与被冲原单相反，因此**天然抵扣、无需特判**——不要在聚合里写"如果是红字就减"这类分支。
- 状态机 `1草稿 → 2已确认 → (更正) 开红字单`；`9已作废`仅从草稿进入。**已确认单禁改禁删禁作废，只能红字冲销**；红字单本身不可再冲销；红字单建后**立即确认生效**。
- 红字支持**按行部分冲销**，每行冲销量 ≤ 原行数量 − 该行已冲销量。
- **确认（confirm）是唯一驱动余额的入口**，同事务内三步：① 装配闸门（仅 `inbound`，复用 `assembly-quota.util.ts`，`lock:true`；**全部产品行一律受闸门**，原免装配剔除已于 2026-08-13 下线，§5.2）② 余额行 `FOR UPDATE` ③ 增减后**结存不得为负**。任何地方都不得直接改 `t_finished_balance`。
- 「结存不得为负」同时管住两类操作：销售出库、以及**红字冲销入库单**（货已发出时不能凭空把入库冲掉）。
- **出入库记录导出**（`GET /finished-stock/export`，权限 `finished-stock:export`，2026-08-14）：**一行一条明细**、单头字段（单号/类型/方向/日期/状态/车间/制单人）冗余到每行——出入库单本就是「单头几个字段 + 一堆明细」，拿去对账要按产品/客户筛选透视，摊平才好用（故不学装配那样分两个 Sheet）。口径**直接复用 `findList`**，不另写查询；行数上限按**明细行数**算（单据数没超但明细上万行同样撑不住）；表面处理与车间走 `dictLabeler` 转中文、颜色列随 §5.7 开关增减、规格列跟随默认查看单位、合计行按表头名定位。「已冲销」列复用 `loadReversedQty` 补齐（`findList` 不带，但对账时要看这行是不是被红字冲掉了）。
- **列表展开行与编辑页明细都带「表面处理 / 颜色」**（2026-08-14 补）：同货号不同表面处理是两批货，选货和核对都要看得见。颜色列受 §5.7 开关控制；⚠️ 原生 table（展开行）里加可选列时 `<th>` 与 `<td>` 必须挂同一个条件，否则整表错位。
- **成品库存页的「批量导入」也不例外**（2026-08-13）：它把 Excel 行汇成**一张 FGO 期初单**走 `createOpeningBalance`，由单据驱动余额，**不直写 `t_finished_balance`**——导入的库存同样有单可查、可红字冲销。若哪天要加「盘点调整」之类的批量改数功能，也必须落成单据，别在这条不变式上开口子。
  - 模板是**预填式**而非空表：库存行锚 `(订单产品行, 边别)`，让人手抄订单号+型号再反查，同订单同货号多行时根本分不清；模板由 `findGroupOptions({onlyOpening:true})` 预填「产品行ID/订单号/…/订单数」，只留「期初数量」待填，含卡口的按左右拆两行。
  - 导入侧**逐行收集全部错误**一次性回给用户（Excel 的错通常成片，一次报一条要来回十几趟），`buildOpeningItems` 的服务端硬校验仍是兜底；两处的「非期初补录订单」提示文案刻意保持一致。
  - 「产品行ID + 订单号」**交叉核对**：ID 列被误改（如排序时只排了一列）会直接报错，不至于静默把库存导到别的订单上。
- `t_finished_balance` 唯一键 `(order_product_id, side, batch_no, attr_key)`：挂订单的行 `attr_key` 恒为空串；不挂订单的纯属性期初行锚点列为 0、靠 `attr_key`（属性指纹）兜底唯一。设计文档原写「应用层保证」，实现改为**下沉到数据库唯一键**，并发下应用层判重挡不住重复行。
- **⚠️ 台账「完成数」与闸门「已入库量」口径故意不同，勿"统一"**：
  - 台账完成数**包含期初**（`opening_balance`）——期初是上线前已完成的存量，不计入就对不上手工账；
  - 闸门已入库量**排除期初**——期初没有装配过程，计入会让该产品额度永久为负、挡死后续正常入库。
  两处各自正确，改任一处前先想清楚服务的是哪个问题。
- **「生产欠数」已更名为「成品欠数」**（2026-08-11）：欠的是成品，与「发货欠数」成对更好读，且正落在下面说的「成品」栏里。按 §二 的命名稳定性约定，**只改展示名**——字段 `productionOwed` / `totalProductionOwed`、SQL 别名、`order-owed.util` 一律不动。
  - ⚠️ 改导出表头时**必须连同 `put('成品欠数', …)` 一起改**：两个导出的汇总行是**按表头名定位**的（§5.7），只改其一，合计就会落到空列上。
- **台账数量区用多级表头分「部件 / 成品」两栏**（2026-08-11）：两栏的「支」不是同一个计量对象，并排平铺极易被读成一套口径。
  - 部件（支数）：外发已回货、外发欠数 —— 计的是零件支数，一套三节轨 = 3 个零件，20 支订单要外发 60 支；
  - 成品（支数）：装配完成、订单数、成品入库、成品欠数、成品出货、发货欠数、库存数 —— 计的是整轨支数。
  - 表头**只写「（支数）」**（2026-08-11）：原「零件支数 / 整轨支数」车间看不懂，口径差异靠分栏本身与操作手册第 6 章表达，别再把行话塞回表头。
  - 分栏要求列**连续**，故「装配车间 / 订单交期」前移到分栏之前（交期紧挨数量区，判断急不急要和发货欠数一起看）。
  - **导出不跟着分栏**：xlsx 是平表、没有分组表头，且导出列序对齐车间手工表用于并行对账，动了反而对不上；页面分栏与导出平铺是有意的差异。
- 台账（`order-ledger.service.ts`，`GET /order/ledger`）**按订单产品行一行**（2026-08-10 由部件组升级），四数**全部实时聚合、不落冗余列**；欠数为负（超产/超发）正常显示负数并高亮，不截断为 0。
  - 每行内嵌 `partGroups[]`（组类型/组型号/生产图号/版本/料厚/组支数/**外发已回货**）随列表一起返回——组数有限（一个产品最多 5 组），一页 20 行也就 60~100 行，一次 IN 查询就够；每展开一行再打一次接口反而更慢。展开行里逐笔流水才走 `GET /order/ledger/detail?orderProductId=`。
  - 主行升到产品级后，一行即一个产品，原先「相邻同产品行跨行合并」的 `span-method` 已整段删除。
  - **两个 Excel 导出都是产品级行**：四数在产品级，按组铺行会让每行重复产品级四数、**合计翻倍**。组级字段（生产图号/版本/料厚/组类型）由 `joinGroupField` 按组序去重后用「/」并列。
- 台账 SQL 注意：`rows` 是 MySQL 8 保留字，列别名不能用它（已踩）。
- **欠数口径的唯一事实源是 [order-owed.util.ts](apps/server/src/modules/order/order-owed.util.ts)**：入向/出向单据族的 SQL 片段与参数定义在此，台账聚合与订单自动完结共用，**禁止任一处另写**——分叉后会出现「台账显示已交清、订单却挂在进行中」且查不出谁错。
- **订单状态自动同步（§3.1）**：成品出入库「确认」与「红字冲销」后，在**同一事务内**调用 `syncOrderFinishState`——进行中且**全部产品行**发货欠数 ≤ 0 → 自动完结；已完结但任一产品行回正 → 自动重开。要点：
  - 只有出向单据影响发货欠数，入库确认不会误触发；
  - 超发（欠数为负）算已交清；
  - 「完结」只是台账口径**不锁单据**，已完结订单仍可继续出入库，所以回正必须能自动重开，否则订单会被错误地挂在已完结上；
  - 作废订单（9）不参与，更新带 `status` 前置条件防并发覆盖；
  - 结果随接口回传（`finished` / `reopened` 订单号），前端 toast 提示——不提示的话用户会以为订单状态被人偷改了。

**产品汇总查询（M9，「统计分析 → 产品汇总」，财务需求 2026-08-14）**

- 台账的「产品视角」姊妹页：跨订单把「相同产品」归并成一行，双页签（Tab1 累计口径 / Tab2 期间进销存）。后端 `product-summary.service.ts`（order 模块内），接口 `GET /product-summary(/export)(/period)(/period/export)`。
- **「相同产品」= 六要素聚合键**：`productLevelModel` | `railSection` | `dimensionMm` | 料厚签名（`joinGroupField` 按组序去重「/」并列）| `surfaceType` | `color`。trim 后按**字面值**聚合，**刻意不做数值语义归一**（「2.0」≠「2」分两行暴露的是录入不规范，正确动作是回订单修正）；聚合键**恒含颜色**，与 §5.7 显示开关无关（开关是展示开关不是数据口径）。
- **Tab1 复用 `findLedger` 应用层二次聚合，禁止另写聚合 SQL**（§4.4 全项目纪律）；台账口径（排除作废、完成数含期初、红字自然抵扣）自动继承。
  - ⚠️ **`onlyOwed`/`onlyOverdue` 绝不透传 findLedger**：那边是订单行级过滤，会把同产品已交清的订单行剔掉、聚合累计失真；本页「只看有欠数/有库存」一律在**聚合行**上过滤（E2E 有回归用例）。
- **Tab2 期间口径**：按**单据日期**切区间，`期末 = 期初 + 期间入 − 期间出`（同一份流水推算，天然勾稽）；期初 = from 之前全部已确认单据的 `direction×quantity` 净额（**不分族**），期间入/出按 `order-owed.util` 单据族拆分（唯一事实源，禁止另写）。**跨期红字计入红字发生期**（期间数可为负，界面标红）——财务标准处理，别"修"成归属原单期间。全量区间下期末合计 = `t_finished_balance` 合计（E2E 断言）。
- 两个导出均双 Sheet（汇总+明细，装配导出模式）：颜色列随开关条件展开、合计行按表头名定位、规格列跟随默认查看单位；空结果/超 5000 行拒绝。
- 权限：菜单 `product-summary` 即页面读权限、导出 `product-summary:export`，挂 `analysis` 容器（sort 8，物料与设备之间）；**无迁移、不预置角色**（admin 启动自动补授，其余由管理员在界面授权——授完刷新页面即可，见 §二 权限变更生效方式）。

**送货单打印（2026-08-14，随货发给客户的纸质单）**

车间原本手工填 Excel，且**不同客户版式不同**。现从成品出库单一键出单（打印 + 服务端 PDF）。

- **锚点 = 成品出库单**（`biz_type='sale_outbound'`），一张出库单出一张送货单，**不新建业务表**：出库单就是发货动作本身，客户/生产单号/型号/规格/数量都已快照且受结存守卫，账实一致。取数 `GET /finished-stock/:id/delivery-note`（读权限即菜单码 `finished-stock`），PDF `GET /finished-stock/:id/delivery-note-pdf`（`finished-stock:print`，复用 `PdfService` 渲染前端打印页，同《生产任务单》做法）。
- **纸面渲染只有一份**：[DeliveryNoteSheet.vue](apps/web/src/components/print/DeliveryNoteSheet.vue)，打印页与「系统管理 → 打印模板」预览页共用。**禁止为预览另写一套**——各写一份迟早出现「预览好好的、打出来不是那样」。三条尺寸纪律（跨平台字体栈含 Linux 回落、屏幕与打印纸面等高 283mm、`.print-sheet` 类名是 PdfService 的等待选择器）都收在该组件里。
- **纸面缩放预览统一走 [DeliveryNoteSheetPreview.vue](apps/web/src/components/print/DeliveryNoteSheetPreview.vue)**（纸面固定 210mm 宽，塞不进任何页面容器，凡"看效果"的地方都要缩放）：现有两处调用——「系统管理 → 打印模板」页、客户资料编辑弹窗里的「预览」按钮。两边各写一份 ResizeObserver + transform 会让缩放口径漂移，故第二处出现时即抽出（§4.4）。
- **客户资料编辑弹窗的模板预览**：字段旁一个「预览」按钮 → 弹出层显示样例数据渲染的纸面。**刻意不把客户表单改成子页面**——客户资料只有 9 个字段，弹窗够用；人事档案改子页面是因为它有四大段字段（§5.6）。未绑定模板时预览的是全局默认那套，与实际打印的取模板顺序一致。
- **「系统管理 → 打印模板」页**（`system:print-template`，纯前端、无后端接口）：左侧列模板（列数/签名项/默认标记），右侧按 A4 等比缩放预览，数据源可切「样例数据」（`SAMPLE_DELIVERY_NOTE`，假客户假单号，配置页不该摆真实客户信息）或「真实单据」（选一张销售出库单，走 `finished-stock` 读权限）。**全局默认模板在这里设**（按钮挂 `config:update`，复用 `PUT /system/config`），系统配置页不再有该编辑框。
- **耐斯克的「物料编码」与精工的「产品编码」是同一个字段**（产品行 `material_code`，客户方编码），只是客户叫法不同；**取不到时回退「客户图号」**（`CODE_FALLBACK`）——两个号客户都能对上货，印一个总比留空强。该回退**刻意不受 §5.7「客户图号」开关影响**：取值兜底与「要不要展示客户图号这个字段」是两回事，且停用该开关的厂本就不录这个号、回退自然取不到值。
- **通用版与两套客户版的版式差异由三个模板字段承载**（2026-08-14 按新版纸质单改）：`metaStyle`（`consignee` = 收货单位/送货单位/我方电话传真三行式，`classic` = 客户+电话/地址+日期+NO）、`contactPhoneLine`（consignee 版第三行的我方固定电话传真）、列上的 `flag`（受业务字段开关控制的列，停用即整列不印）。通用版另有两点与客户版不同：**有独立「单位」列**（故数量列只写数字、表头不带 `{unit}`，`hasUnitCol` 判定）、**四联单**说明。
- **版式知识全在前端注册表 [delivery-note.ts](apps/web/src/constants/delivery-note.ts)，服务端一个字都不持有**：候选字段一律给全（PO#/物料编码/产品名称/产品要求描述/型号/规格/数量/生产单号/备注），显示哪几列、列叫什么名、品名取哪个字段，由模板配置决定。**加一套新客户模板 = 加一条纯数据配置**，不改后端、不写迁移。现役四套：`generic` 通用（四联）、`generic5` 通用（五联）、`nsk` 耐斯克-湖北（9 列，含空着的「单价」列供手填，签「业务」）、`jinggong` 精工（7 列，签「发货人」）。⚠️ 两套通用版**只差底部一行联次说明**，故共用 `GENERIC_BASE` 底座——别复制成两份列定义，改了一边忘另一边是迟早的事；`generic` 的编码不可改名（存量客户资料绑的就是它）。
- **取模板顺序：客户资料 `t_customer.delivery_template` → 系统配置 `delivery_template_default` → 通用**；打印页可临时切换，**不回写客户资料**。编码在库里**不做值域约束**（值域写死一份就得前后端两处改），取到未知编码时 `deliveryTemplateOf` 回落通用模板而不是报错。
- **数量跟随订单单位**（`piecesToUnitQty`，共享包唯一实现）：全单单位一致时表头写「数量（套）」/「数量/支」（占位符 `{unit}` 由模板自带格式），**混着套与支时表头退化成「数量」、单元格各自带单位、合计分单位并列**——把两种单位加成一个数是错的。
- **含卡口产品的 left/right 两行在送货单上合并成一行**（数量相加后再折单位）：客户不关心左右，纸质单也只有一行。与单位口径彼此独立，实现在 [delivery-note.util.ts](apps/server/src/modules/finished-stock/delivery-note.util.ts) 的 `buildDeliveryRows`。
- **规格用送货单口径 `specTextOf`**：英寸录入印「17寸」、mm 录入印「425mm」，**刻意不用共享包 `formatDimension`**（那个产出 `17"（425mm）` 是内部界面口径，纸面那格只有几个字符宽）。
- 守卫（服务端硬拦，前端按钮同步禁用）：**非销售出库单**（入库/期初/红字都不是对客户的发货动作）、**已作废单**、**跨客户单**（抬头地址模板都是客户级的，混单印出来是错单）一律拒绝；**草稿单允许打印**（纸质单常先随货走、后确认），页面顶栏标「单据尚未确认」。
- 制单 = 出库单创建人；业务 = 订单业务员；发货人 / 仓库收货人留空手签。合计行右侧印**单头备注**（车间写「共19托」这类装箱信息）。
- 打印页是**顶层路由**（`/finished-stock/delivery-note`，不挂 Layout，原因见 router 注释），因此 §5.7「开关由布局层统一拉取」不适用：**必须自己 `featureStore.load()`**，否则新标签页与服务端 PDF 渲染读不到全局默认模板。A4 纵向的三条尺寸纪律（跨平台字体栈含 Linux 回落、屏幕与打印纸面等高 283mm、`.print-sheet` 选择器）与《生产任务单》完全一致，改一处要同步另一处。

**入库单打印（2026-08-14，装配完工交仓库收货的内部凭证）**

车间原本手工填一张 A5 的《成品入库单》交仓库，主管/质检/制单三方签字。现从生产入库单一键出单（打印 + 服务端 PDF），做法整体照搬送货单。

- **锚点 = 生产入库单**（`biz_type='inbound'`），**不新建业务表**：入库单据本身就是入库动作，型号/规格/数量都已快照且受装配闸门守卫，账实一致。取数 `GET /finished-stock/:id/inbound-note`（读权限即菜单码 `finished-stock`），PDF `GET /finished-stock/:id/inbound-note-pdf`（`finished-stock:print`）。
- **守卫**：**仅 `inbound` 可打**（期初是上线前存量补录、销售出库是发货、红字是冲销更正，都不是车间实际的入库动作，即便方向也是入库）、**已作废单**、**无明细**一律服务端硬拦，前端按钮同步隐藏/禁用；**草稿单允许打印**（纸质单常先随货走、后确认），页面顶栏标「单据尚未确认」。
- **纸面三列的取值口径**（2026-08-14 与使用部门逐列确认，改前先问）：「产品名称」印**产品型号** `product_model`（如 `45#自锁外中轨`——车间认货号那一套，不是订单里手填的产品名称）、「规格型号」印**规格**（送货单口径 `specTextOf`）、「类别」印**产品类型中文组合** `formatProductTypes`。⚠️ **「类别」与「产品名称」重复一次产品类型是使用方要的**（单独一列便于清点时一眼归类），别为了去重把这列删掉或改成表面处理。
- **「入库单号 NO:」直接印系统单号**（`FGI260814-0001`），**不像送货单那样派生日期形态**——内部凭证，印原号才能直接回查到单据。同理**不新增采番**。
- **列集合直接写在纸面组件里、不进模板注册表**（[InboundNoteSheet.vue](apps/web/src/components/print/InboundNoteSheet.vue)）：入库单是内部单据，只有一套版式、无客户级绑定、无全局默认可设，套用送货单那套 `DELIVERY_TEMPLATES` 只是空转。真出现第二套版式时再照它抽注册表。「颜色」列仍受 §5.7 全局开关控制。
- **A5 横向**（`@page { size: A5 landscape; margin: 10mm 5mm }`，对齐纸质模板的 `paperSize=11`）。`PdfService` 无需改动：它用 `preferCSSPageSize`，纸张与页边距一律以打印页的 `@page` 为准（已实测导出 PDF 为 209.9×148.2mm）。
- ⚠️ **A5 只有 128mm 可用高度，字号与行高不得再调大**：要塞下 标题 + 单头 + 表头 + **10 行明细** + 签名栏。实测 13px/1.5 时**全空行就已顶到 128mm 边界**，任何一格文字折行都会溢出成第二页空白纸；现为 12px/1.4 + 行高 8mm，全空行约 116mm，留 12mm 给折行的行。同理列宽有两列**刻意偏离模板**（产品名称 15.9%→20%、规格型号 17%→12.9%）——模板宽度是给人手写定的，系统印的是完整型号（12 个字），照搬会频繁折行。明细超 10 行时自然跨页，`<thead>` 由浏览器在次页自动重复（已实测 16 行→2 页、32 行→3 页，内容不被裁）。
- **含卡口产品的 left/right 合并成一行**、**数量跟随订单单位**：与送货单同口径，共用件在 [print-note.util.ts](apps/server/src/modules/finished-stock/print-note.util.ts)（`mergeByProduct` / `specTextOf` / `unitLabelOf` / `sumByUnit`，2026-08-14 按 §4.4 从 delivery-note.util.ts 抽出，两张单都从这里取）。
- **纸面「车间」= 单头值优先，为空时回溯装配批次**（2026-08-14 使用部门反馈补）：入库单的 `work_team` 是**选填**的，不填就会印出一张车间空白的单子。装配车间的事实源在**批次级** `t_assembly_batch.workshop`（§5.6：订单环节不安排车间），故按本单涉及的订单产品行聚合，一单来自多个车间时去重并列（`GROUP_CONCAT(DISTINCT …)`，与装配列表、订单跟踪台账的「装配车间」列同一口径）。**回溯不到（未排产/批次没填车间）就留白**给仓管手写，不硬造。车间值由服务端经 `dictLabeler` 转中文后下发（页面与 PDF 同一个值，纸面组件不必再引字典）。
- 制单 = 建单人，主管/质检留空手签；**纸面不印合计行**（模板没有这一行，但 `totals` 照常返回备用）。
- 打印页同为**顶层路由**（`/finished-stock/inbound-note`），§5.7 的「必须自己 `featureStore.load()`」同样适用。

**部件台账（M5，`t_part_balance` + `t_part_adjust`）**

- **属性锚定、不挂订单**：部件在表面处理前是通用半成品，同属性不分订单，故用 **7 维唯一键**（部件/边别/货号/节数/产品类型组合/料厚/规格）而非订单锚点。
- 7 维**全部 NOT NULL DEFAULT ''/0**：留 NULL 会让 MySQL 唯一键失效（多 NULL 不去重），同一档部件分裂成多行。归一集中在 service 的 `normalizeDimension`，**调用方禁止自行拼**；产品类型组合串必须经共享包 `normalizeProductTypes` 规范化，否则「普通,自锁」与「自锁,普通」会分裂成两行。
- **余量只有一个写入口 `POST /part-stock/adjust`**：按 7 维定位（不存在则建行）累加 `delta` 并写一条 `t_part_adjust` 流水。**刻意不提供「直接设置余量」的接口**——§4.6 要求「不直接改数无痕」，一切变动必须带 delta + 原因，否则事后无法回答「这个数怎么来的」。期初录入与手工调整走同一入口，靠 `source`（opening/manual）区分，期初同样留痕。
- 调整后余量不得为负；`delta` 不接受 0（无意义的空流水）；行锁后累加防并发丢失。
- V1 是**独立参考台账**：不与外发/成品单据联动（§2.1，无报工则无采集点），联动列入 V2（§10）。
- **批量导入导出（2026-08-12）**：导入是**批量调整**而非「设置余量」——模板列是「调整量(±) + 调整原因」，每行按 7 维定位后累加并留一条流水。**模板绝不能给一列「余量」让人填目标值**，那等于绕开流水直接设数，破坏「不直接改数无痕」。整批一个事务、全有全无（累加语义下部分成功会让重提整批的行被加第二次）；「调整后余量为负」也在事务内，触发即整批回滚。
- **必填字段的每个约束都要给中文 message**：字段缺省时多个约束同时失败，只要有一个没给 message，用户看到的就是「must be a string」这类英文（本模块已踩，E2E 抓出）。

**人事档案与员工编码（employee 模块）**

编码规则的权威来源是《海宝五金员工编码管理规则》（行政人事部），双端事实源为共享包 [employee-code.ts](packages/shared/src/employee-code.ts)。

- **10 位纯数字：`2位厂区 + 2位年份标识 + 3位部门 + 3位部门流水号`**，新增员工时由服务端自动生成，`empNo` **客户端传了也不采信**（§5.5 防伪造）。
- **年份标识位**：`2026-01-01`（含）之后入职取公历年份后两位，之前的存量老员工统一 `99`。**99 只是存量标识**——工龄/年假一律以 `hire_date` 为准，禁止从编码反推入职时间。
- **部门编码落在 `t_department.hr_code`（3位），不写死在代码里**：部门是会增减的主数据，硬编码迟早与库对不上。未配 `hr_code` 的部门建档即被拒并提示去「基础数据 → 部门信息」配置。初始映射为规则第三段部门表的 `001`~`011`（生产/仓储/行政人事/业务/品检/技术研发/财务/采购/模具/IT/计划），**两条路径都要给到**：存量库由 `migration-employee-code.sql` 按名称回填（缺的部门自动补建），全新安装由 `seed-data.ts` 的 `DEPARTMENTS` 种下（`db:init` **不跑 migrations**，只种子建库，漏了它新库会一个编码都没有）。**改任一处必须同步另一处**。
- **流水号走 `NumberGeneratorService`**（§5.4），计数键 `EMP:{厂区}{年份}{部门}`。**跨年自动从 001 重来不需要额外逻辑**——年份位变了就是另一个计数键。
- **生成编号需要三项前置信息：厂区 / 入职日期 / 所属部门**，缺一即拒绝并给出「这一项决定第几位」的中文提示。
- **编号终身不变**——注意规则四把这条**限定为「正式员工」**：`update` 恒取库中 `empNo`、无视传入值。⚠️ **跨厂区调动只改 `plant_code`，编码里的厂区位仍是入职时的厂区——两者不一致是设计如此，不是 bug**。
- **非正式用工一律带前缀**（规则五，2026-08-11 由 2 类增补到 4 类）：实习生 `S` / 临时工 `L` / 学徒 `A` / 劳务派遣工 `P`，**只有 `formal` 正式工无前缀**。前缀后方 10 位数字的编排逻辑与正式工完全一致（同一组 `厂区+年份+部门` 共用计数），方便人事统一统计。`intern` 字典项由迁移补入 `emp_type`。**不要给规则未列出的类别发明前缀**（附则：编码架构变更须三方评审）。
- **唯一允许换号的场景是「用工属性变更导致前缀应变」**（规则五：学徒期满转正、派遣工转自有正式工等，均需注销原前缀编号、重新核发，原编号归档留存）。判据用共享包 `needsEmpNoReissue(旧, 新)`（**比较前缀是否变化**，故也覆盖规则没写的 实习生 S → 学徒 A 这类横向变更），且必须由前端显式传 `regenerateEmpNo`（用户在弹窗确认过），服务端二次校验才放行——编号是工牌/考勤/薪资的对账依据，**不做静默改号**。年份位仍取本人入职日期（转正不是重新入职，工龄连续）。
- 离职编号永久封存：流水号只增不减、不回收，天然满足「严禁二次分配」。离职返聘 = 新建档案、生成全新编号；派遣工用工结束同理（劳动关系属外派公司，本厂只登记用工厂区与部门）。
- **岗位不是字典，是主数据**（2026-08-11 由 `hr_position` 字典升级）：`t_employee.position_id` 引用 `t_position.id`，与同表 `dept_id` 同款；列表/详情由 `attachNames` 解析出 `positionName`，**解析时不过滤停用岗位**——岗位停用只是不再进下拉，已挂在员工身上的历史岗位仍要显示得出名字。
  - 岗位下拉走 `GET /position/all`（**跨页引用型只读接口，仅需登录**）：传 `deptId` 回「该部门岗位 + 通用岗位（`dept_id` 为空）」。**通用岗位必须带上**，否则「文员」「司机」这类跨部门岗位在任何部门下都选不到。
  - **过滤只是录入引导，服务端不校验岗位与部门是否匹配**——借调、一人多岗是现实存在的。前端换部门后若已选岗位不在新范围内会**清空并提示**，另有「显示全部岗位」开关兜底。
- **人事档案的录入/编辑是独立子页面**（`/hr/employee/form`，2026-08-11 由弹窗改），原因是字段有基本信息/教育背景/用工属性/车间属性四段，弹窗塞不下。按 §一 前端架构注册在 `constantRoutes` 并带 `meta.activeMenu: '/hr/employee'`，否则侧栏不高亮。

**呆滞品管理（2026-08-11，dull-stock 模块）**

已完结订单剩下的成品（多做的/退回的/客户不要的）。由「成品期初（不挂订单）」拆分独立，两张表 `t_dull_stock`（档案 + 四个数）+ `t_dull_stock_flow`（出入库流水）。

- **独立台账，与订单跟踪台账四数、成品库存 `t_finished_balance` 完全不联动**：呆滞品已不属于任何订单，它的出入库不影响任何订单欠数，也不进 `/stock-balance` 页。别为了「口径统一」把它接进台账。
- **一行 = 一批呆滞货，刻意不设属性唯一键**：同货号同客户会先后产生多批呆滞，逐批建档才追溯得到来源与处置进度。这正是原纯属性期初行做不到的（靠属性指纹唯一，同属性只能一行）。
- **四个数**：`结存数 = 期初数 + 入库数 − 出库数`。期初数建档时录、可编辑；**入库数/出库数只由 `createFlow` / `removeFlow` 驱动**，任何地方不得直接写这两列（§4.6「不直接改数无痕」）。
- **单位按行自选 `set`/`piece`**，该行四个数量列一律按本行单位计（这是全局「一律以支为准」的**唯一例外**，因为车间盘点习惯按套报数）；页面与 `GET /summary` 的合计用共享包 `toPieces` **折成支**，汇总口径仍然统一。**已有流水后单位不可改**（改了历史流水记的数含义就变了），服务端硬拒。
- **结存不得为负**：登记出库、编辑期初数、删除入库流水三条路径改完都要复核，为负整笔事务回滚。所有改数路径先对档案行 `SELECT … FOR UPDATE`。
- **流水可整条删除**（与部件台账 `t_part_adjust` 的「只能反向调整」不同——呆滞品是可修正的管理账，不是凭证账）：删除时同事务回滚该笔对累计数的影响。删入库流水会让结存减少，若已出掉就会为负 → 拒绝（说明该删的是那笔出库）。
- **「变动后结存」刻意不落库**：流水可删，存了快照就会在删掉中间一笔后让后续所有行集体失真、还得回填。改由 service 按 `id ASC` 从档案期初数累计推导后返回。
- **只跟踪成品**：无 `group_type`、不涉及部件，也不建部件版呆滞品。
- **批量导入导出（2026-08-12）**：导入**每行新建一条**（本模块刻意无唯一键，同货号多批各建各的），故**没有「覆盖更新」开关**，重复导入会重复建档——弹窗提示与模板说明页都必须写明这一点。模板只含建档字段（含期初数），**入库数/出库数不可导入**（它们是流水累计值，唯一写入口是「登记出入库」）。整批全有全无：部分成功不会把数加错，但用户改完坏行重提整批时成功的那些会**再建一遍**。
- 客户/生产单号是**纯文本快照**，不关联 `t_customer`、不校验订单是否存在（客户下拉 `allow-create`，主数据没维护到的不挡录入，同外发加工商）。
- 轻量记账行，**不采番、无单据号**（§5.4）；档案**有流水时禁止删除**（§5.5「被业务引用后限制删除」）。
- 前端「表面处理 → 颜色」**联动带出**（电泳→黑色、喷涂→白色，新增行默认电泳/黑色），映射在 `web/constants/dict.ts` 的 `SURFACE_DEFAULT_COLOR`（仅前端用，不进共享包，服务端不校验）；**用户手改过颜色后不再覆盖**。
- **颜色走本模块自己的开关 `dull_stock_color_enabled`，不受全局 `color_field_enabled` 管**（§5.7）：呆滞品的表面处理+颜色是配套的辨货依据，而全局开关是给「订单/外发口径用不到颜色」的厂关的，合用一个会出现「关了全局颜色、呆滞品认不出货」。页面取值用 `useFeatureFlags().dullStockColorEnabled`，**不要再与 `colorEnabled` 相与**。

**期初录入（M5，opening 模块）**

- **纯编排模块，不自己写库**：成品期初走 `FinishedStockService.createOpeningBalance`（§6 明确「内部走 finished-stock 通道」），部件期初走 `PartStockService.adjustInTx` 且 `source='opening'`。各自另写一套写库逻辑会立刻造成口径分叉，这是本模块存在的唯一理由。
- 成品期初**建单后同事务立即确认**、不留草稿：录入页本身即「确认」语义。单据仍在成品出入库列表可见、可红字冲销纠错，追溯性没丢。
- 成品期初**只有「挂订单行」一种形态**（`orderProductId` 必填，2026-08-10 由部件组升级，与成品明细同锚点）：快照由服务端经 `ProductSnapshotService` 读订单侧，计入台账「完成数」、参与成品欠数。
  - ⚠️ 原「**纯属性行（不挂订单）**」形态已于 **2026-08-11 整体下线**（系统尚未上线，无历史数据需迁移）：已完结订单剩下的成品改由**呆滞品管理**承载——那里能记客户/生产单号、能持续登记后续出入库，而纯属性期初行录进去之后再也动不了（出入库单必须挂订单产品行）。DTO 的九个属性字段、`buildOpeningItems` 的纯属性分支、`attrKeyOf` 均已删除；`t_finished_balance.attr_key` **保留但恒为空串**（它是 `uk_balance` 唯一键的组成部分，删列要连带重建唯一索引，收益不抵风险），列注释已随迁移订正。**新代码不得再产生锚点为 0 的成品明细/余额行。**
- 期初豁免装配闸门（§4.5），但计入台账完成数 —— 与 §5.1 的「完成数含期初 / 闸门排除期初」一致。
- **部件期初整批全有全无**（同一事务）：部件台账是**累加**语义，部分成功后用户改完坏行重提整批，已成功的行会被加第二次、直接把账做错。出错提示带行号，改完整批重提不会重复计数。这也与项目既有导入约定（客户导入「整批校验通过才落库」）一致。
- **「期初补录」开关 `is_opening` 只是个区分标记，不改变任何行为**（2026-08-11 核实并订正文档）：全项目**没有一处代码读它做校验豁免**，设计文档原写的「免非关键必填校验」是空头支票——订单必填项本就只有客户与订单日期，产品级只有订单数量，没有可豁免的余地。它现存的作用只有两个：订单列表打「期初」标签，以及日后统计时可据此剔除期初单。**不影响四数口径**（台账、导出、欠数聚合都不读该字段）。
- **期初只能挂「期初补录」订单**（2026-08-11 补的闸门，双层）：
  - 前端引导——期初页调 `/finished-stock/group-options` 时传 `onlyOpening=true`，选择器只列 `is_opening=1` 的订单（该接口与成品出入库建单共用，**不传就是全部订单**，出入库要的正是全部）；
  - 服务端硬闸门——`buildOpeningItems` 逐行校验 `snap.orderIsOpening === 1`，否则拒绝并给出「去哪里开开关 / 正常订单该走哪条路」的指引。
  - **为什么必须拦**：期初豁免装配闸门（§5.1），若能挂到正常订单上，就等于绕过「Σ已完成装配 − Σ已入库」凭空给该订单加完成数与库存。为此 `ProductSnapshotService` 增补了 `orderIsOpening` 字段（§一：下游要新快照列一律加在快照服务里）。

- 口径核算脚本 `pnpm --filter server verify:ledger`：**绕开业务代码**用最朴素 SQL 从原始单据重算四数再比对，两条独立路径算出同一个数才算数。改台账聚合后必须重跑。

### 5.7 业务字段全局开关（2026-08-10）

厂里用不到的字段可由管理员在「系统配置 → **业务字段**」停用，停用后该字段在**录入框 / 表格列 / Excel 导出列**一并消失。开关列都落在 `t_system_config`（单行表），各开关**互不影响**（下表两个颜色开关也是各管各的，**禁止相与**）：

| 开关列 | 字段 | 影响面（改相关 UI 时对照检查） |
|---|---|---|
| `color_field_enabled` | **颜色**（与「表面处理」配套的业务字段，**非主题色**） | 订单表单、外发件回厂记录（登记页/编辑弹窗/列表）、成品库存列表、台账展开行的「表面处理/颜色」、**台账导出 + 总计划导出**的「颜色」列。**不含呆滞品管理**——那页走下面的独立开关 |
| `dull_stock_color_enabled` | **呆滞品颜色**（2026-08-11 加，**独立开关**） | 只管呆滞品管理页的颜色列与建档弹窗 |
| `customer_drawing_no_enabled` | **客户图号**（客户来图图号，**不是**部件组的生产图号 `drawing_no`） | 订单表单、订单列表展开行、**总计划导出**的「客户图号」列、**生产任务单**（打印页与 PDF）的「客户图号」列 |
| `product_requirement_enabled` | **产品要求描述**（2026-08-13 加；订单产品级 `t_order_product.product_requirement`，客户对该产品的特殊要求文本） | 订单表单（「轨道节数」与「规格」之间）、订单列表展开行、**总计划导出**的「产品要求描述」列 |

**单位换算（2026-08-14 加，本节唯一的两项非布尔配置）**，同表同接口，但语义不是「启停」：

| 配置列 | 含义 | 影响面 |
|---|---|---|
| `inch_to_mm` | **英寸换算系数**（1 英寸 = N mm），缺省 25（我司口径，非国标 25.4），抽自共享包写死的 `INCH_TO_MM` | 订单表单英寸录入折算、开单信息「10寸」文本归一（前端失焦 + 服务端保存/导入各一次）、全系统「寸」视图显示 |
| `dimension_view_unit` | **规格默认查看单位**（mm / inch） | 首页 / 订单跟踪台账 / 订单管理三页的 mm/寸 切换初值，以及**台账导出与总计划导出**的规格列（表头随之变「规格(mm)」/「规格(寸)」） |
| `delivery_template_default` | **送货单默认模板**（2026-08-14 加） | ⚠️ **编辑入口不在系统配置页**，在「系统管理 → 打印模板」（那里能同时看到每套模板的实际效果）；系统配置页只是把它读进 form 原样回传，别再往「业务字段」Tab 里加回编辑框。只在**客户资料未单独绑定模板**时兜底，取模板顺序：客户资料 `t_customer.delivery_template` → 本配置 → 通用模板。见 §5.6 送货单块 |

- ⚠️ **改系数不重算已落库的 `dimension_mm`**（核心不变式，E2E 有断言）：存储值永远是权威，只影响「之后的录入折算」与「所有寸视图的显示」。配置页提示里必须写明这句，否则管理员会以为历史数据跟着变。
- 共享包三个换算函数（`toMm` / `formatDimensionView` / `normalizeDimensionText`）都接**可选** `factor`，不传即用 `INCH_TO_MM`；调用方一律从配置传值，**不要再直接引常量**。系数为 0/负数/NaN 时 `safeFactor` 回落缺省值（除零会让整页规格变 Infinity）。
- 三页的 mm/寸 切换统一走 [useDimensionView.ts](apps/web/src/composables/useDimensionView.ts)（第三处重复时按 §4.4 抽的）：初值取配置、异步到达要 watch；**用户本次会话手动切过后 `touched` 置位，配置的后续变化不再顶掉他的选择**。
- ⚠️ [stores/feature.ts](apps/web/src/stores/feature.ts) 的缓存与拉取校验**必须按 `DEFAULTS` 同键的类型判断**（`typeof cached[k] === typeof DEFAULTS[k]`），不能写死 `'boolean'`——否则新增的数字/字符串配置会被静默丢弃、永远停在默认值。

- **语义是「录入与展示」开关，不是数据清理开关**（本节最重要的一条）：停用**不删除**库中既有值，重新开启原样恢复。
  - 服务端**刻意不在写入侧剥离字段值**——订单更新是整体重建，停用期间编辑一张老订单会把历史值永久洗掉；
  - 前端只隐藏输入框，`p.color` / `p.customerDrawingNo` / `editForm.color` 仍随表单原样回传。改这两处任一都会破坏该不变式。
  - 订单列表的**关键字搜索仍匹配** `customer_drawing_no`（`order.service.ts`）：搜索是"能不能搜到"，与"展不展示"是两回事，不随开关变。
- **服务端只在导出侧读开关**（`SystemConfigService.getFeatureFlags()`，**唯一读取入口**）：导出文件由服务端生成，前端的显隐管不到。导出列用条件展开 `...(flag ? [col] : [])` 增减。
  - 为此把两个导出的**汇总行改成按表头名定位**（`columns.findIndex(c => c.header === …)`），不再数手写空串——列数会随开关变化，位置写死必错位。**再加可选列时沿用这个写法**。
  - 原生 `<table>` 里加可选列时（订单列表展开行），`<th>` 与 `<td>` 必须挂**同一个条件**，否则 rowspan 结构会整体错位。
- 前端读取链路：`GET /system/config/features`（仅需登录，§2.1）→ `stores/feature.ts`（**localStorage 缓存**，首屏先用上次的值渲染避免列闪现；接口失败保留缓存值；缺省一律启用）→ `composables/useFeatureFlags.ts`。**布局层统一拉一次**（`layout/index.vue` 的 `onMounted`），页面禁止自己请求；管理员保存配置后页面再拉一次，本人即时生效、他人刷新生效。
  - ⚠️ **唯一例外：不在 Layout 下的顶层路由**（现役只有生产任务单打印页 `/order/print`）必须**自己确保加载**（`featureStore.loaded ? skip : load()`）。新标签页打开、以及服务端 PDF 渲染都是全新页面上下文，没有 Layout 兜底、localStorage 里也没缓存，不自己拉就会退回默认值「启用」——管理员停用了字段，导出的单据上却照印。
- **新增字段开关照此模式**（改动点固定 6 处）：迁移 `migration-field-switches.sql` 追加一列 + `01-schema.sql` + entity 列 + DTO `@IsIn([0,1])` + `getFeatureFlags()` 加一个布尔 + `FeatureFlags` 接口/`stores/feature.ts` 的 `DEFAULTS`/`useFeatureFlags()` 各加一项 + 配置页「业务字段」Tab 加一行。store 与 composable 已按键名遍历，加项不用改逻辑（非布尔配置同此模式，只是 DTO 校验与 `DEFAULTS` 的类型换成对应类型）。
- **不要**改成 key-value 配置表——单行表加列在这个体量下更直白，且能给每列写 COMMENT。

---

## 六、里程碑进度

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M1 骨架 | monorepo、登录/权限/菜单、基础数据（客户资料含批量导入、开单信息、部件信息、字典）、共享包 | ✅ 已完成 |
| M2 订单 | 订单四级 CRUD、附件、组按类型自动展开部件、图号带入工艺、状态机 | ✅ 已完成 |
| M3 外发 | ~~发坯单~~ → **外发件回厂记录**（2026-08-10 两轮简化定型：一行=一次回厂，无单据无状态） | ✅ 已完成 |
| M3.5 装配 | 装配批次 CRUD（一个产品多批 + 卡口分边、计划/实际完成时间+数量）、装配管理页、可入库量接口与闸门守卫 | ✅ 已完成 |
| M4 出入库+台账 | 出入库单、确认/红字冲销（支持部分冲销）、**装配入库闸门**（复用 `assembly-quota.util.ts`）、balance、成品库存、**订单跟踪台账** + 口径核算脚本 | ✅ 已完成 |
| M5 期初+看板 | 补录订单、成品/部件期初、部件台账、首页看板、台账展开与合并、台账 Excel 导出、新手引导、操作手册**全部完成** | ✅ 已完成 |
| M6 锚点分层 | 装配/成品/台账由部件组升到**订单产品行**，外发保持部件组；台账改「产品级主行 + 部件组展开」，两个导出改产品级；新增 `ProductSnapshotService` | ✅ 已完成（2026-08-10） |
| M7 呆滞品 | 「成品期初（不挂订单）」拆分为独立的**呆滞品管理**模块（档案 + 出入库流水两表、四个数、单位套/支、流水可删）；成品期初收敛为只能挂订单 | ✅ 已完成（2026-08-11） |
| M8 分体出货 | 产品行 `is_split` 开关承载「一支滑轨拆多行下单」（外中轨/内轨分开出货不组装）：形态由组构成推导、产品级型号统一走 `productLevelModel`（口径见 §5.2/§5.6；原「单部件分体行免装配」已于 2026-08-13 取消） | ✅ 已完成（2026-08-12） |
| M9 产品汇总 | 财务需求：新一级菜单「统计分析」下的**产品汇总**双页签（Tab1 跨订单相同产品累计汇总，复用 findLedger 二次聚合；Tab2 按单据日期的期间进销存，期末=期初+入−出）；六要素聚合键、两个双 Sheet 导出（口径见 §5.6 产品汇总块） | ✅ 已完成（2026-08-14） |

期间另行完成（非里程碑）：菜单四个一级重构、设备信息模块、部门信息模块、更新日志与系统配置移植（**审批管理永不移植**——OMS 无审核流）、部件信息/开单信息两次改名改版、深色侧栏主题、订单表单国旗国家下拉、**送货单打印**（多客户模板）、**入库单打印**（A5 横向，交仓库收货）——后两者口径均见 §5.6。

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
| 2c | 期初录入 opening | 成品期初（挂订单）+ 部件期初 + 订单「期初补录」开关全部落地，部件期初整批全有全无。**「成品期初（纯属性 / 不挂订单）」已于 2026-08-11 下线**，改由呆滞品管理承载（见 2o） | ✅ 已完成（2026-08-07） |
| 2d | 首页看板 dashboard | `GET /dashboard/summary` + 首页四卡三列表已落地（§5.2，不做 ECharts 大屏）。**欠数口径复用 order-owed.util 的单据族 SQL**，与台账、订单自动完结同一事实源；两处刻意的差异见 dashboard.service 头注释（看板只看进行中 + 欠数逐组取正） | ✅ 已完成（2026-08-07） |
| 2e | 台账 Excel 导出 | `GET /order/ledger/export`（权限 `ledger:export`，`@SkipTransform` 返回文件流）已落地。**直接复用 `findLedger`，不为导出另写聚合 SQL**——两份 SQL 迟早分叉，届时「页面 100、导出 98」最难查。26 列对齐台账页（合并列拆开成独立列便于筛选），产品级列跨组合并规则与页面一致（只合并相邻同产品行），末尾带汇总行，字典值转中文。上限 5000 行，**超限拒绝而非静默截断** | ✅ 已完成（2026-08-08） |
| 2f | 台账行内展开 / 跨组合并单元格 | 均已落地。展开走独立接口 `GET /order/ledger/detail?orderPartGroupId=`（**按需加载**，不随列表返回——一页几十行全查三张流水太重），口径与台账主表一致（成品只取已确认、外发排除已作废、装配按 actual_date 派生完成态）。跨行合并只合并**相邻**的同 `orderProductId` 行：排序由服务端决定，万一同产品的组没挨着，宁可不合并也不能把中间夹着的别的产品错并进来 | ✅ 已完成（2026-08-08） |
| 2g | 新手引导 | 已补成完整业务主线十步（首页看板→订单→外发→装配→出入库→台账→物料→基础数据→系统管理），章节顺序与操作手册一一对应；过时文案（工艺信息/物料档案/「首页后续将展示」）一并订正；版本号递增到 `hb_mes_tour_done_v2` 让老用户重看。**踩坑**：引导目标多为二级菜单，父级 sub-menu 折叠时节点在 DOM 里但尺寸 0×0，el-tour 会把气泡定位到左上角空白；又因 el-menu 开了 `unique-opened`（手风琴）逐个 open 会互相顶掉。解法是引导期间把 `unique-opened` 置 false 并一次性展开全部相关父级、等 360ms 过渡结束再 startTour，结束时恢复手风琴并只留当前路由的父级 | ✅ 已完成（2026-08-08） |
| 2h | 操作手册 | `apps/web/public/manual.html` 已落地：11 章按业务时间线组织（快速上手→录订单→外发→装配→出入库→台账→看板→期初→基础数据→管理员→FAQ），顶栏搜索 + 侧栏目录 + 滚动高亮，纯静态零依赖。用户面板「操作手册」改指 `${import.meta.env.BASE_URL}manual.html`（**不要写死路径**——生产 base 是 `/oms/admin/`、开发是 `/`，写死任一个都会在另一端 404）。**功能改动涉及用户操作时须同步更新手册对应章节** | ✅ 已完成（2026-08-08） |
| 2i | 审计追溯全面补齐 | 六件套补到 t_dict/t_department/t_role/t_permission/t_user/t_changelog/t_order_product/t_order_part_group/t_outsource_item，写入统一走 audit.util；新增全局组件 AuditInfo（列表悬浮图标 + 详情审计条）。豁免表与整体重建型子表口径见 §5.5 | ✅ 已完成（2026-08-08） |
| 2j | 查看权限 / 只读角色 | 各模块 GET 接口挂菜单权限点（此前全裸）、新增 `access_type`、角色树改 check-strictly + 仅授只读、`normalizePermissionIds` 服务端兜底、看板加 `stat:dashboard`。口径见 §2.1 | ✅ 已完成（2026-08-08） |
| 2k | 外发取消发出环节 | 使用部门要求：发货不过磅、不留发出记录，外发单只跟踪计划/实际回货与回货数量。删发外日期两列与发出重量/单重，发出数量改「应回数量」作回齐基准；状态机改 1待回货→3部分回货→4已回齐；`outsource:send` 权限点下线。口径见 §5.6 | ✅ 已完成（2026-08-10） |
| 2l | 外发收敛为回厂流水 | 第二轮简化：连发坯单也取消，三表塌缩为 `t_outsource_part`（一行=一次回厂）。删打印页/单号采番/6 个权限点；首页右卡改「近期外发回厂」。口径见 §5.6 | ✅ 已完成（2026-08-10） |
| 2m | 业务字段全局开关 | 系统配置新增「业务字段」Tab，现有两个开关：**颜色**（与表面处理配套的业务字段）、**客户图号**（非部件组生产图号）。**录入展示开关 ≠ 数据清理**：停用不删既有数据、编辑不洗历史值。前端走 feature store + `useFeatureFlags`，后端只在导出侧读开关并把两个导出的汇总行改为按表头名定位。口径与新增开关的 6 处改动点见 §5.7 | ✅ 已完成（2026-08-10） |
| 2n | 跟踪锚点分层 | 装配 / 成品明细 / 成品余额 / 入库闸门 / 台账主行 由**部件组升到订单产品行**，外发件回厂**保持部件组**；台账改「产品级主行 + 部件组展开」，两个 Excel 导出改产品级（按组铺行会让合计翻倍）；新增 `ProductSnapshotService` 与组级快照分层。迁移 `migration-product-level-tracking.sql` 带「清空只生效一次」守卫（已实测重跑不清数据）。口径见 §5.2 | ✅ 已完成（2026-08-10） |
| 2s | 岗位性质三值 + 职级主数据 + 岗位批量操作 | 岗位性质由布尔 `is_manager` 升级为三值（普通/管理/**技术**岗）；职级由字典升级为独立主数据 `t_job_level`（**按序列分等级**：管理 4 档 / 技术 4 档 / 普通 4 档，质检员分初中高即此意），配「基础数据 → 职级管理」页，岗位的职级须与性质同序列（前端过滤 + 服务端硬校验）；岗位新增批量导入（整批校验 + 覆盖更新开关）/ 导出 / 批量删除（逐条尝试、不整批回滚）。⚠️ 又一次踩到「前序迁移把已删种子种回来」——`migration-job-level.sql` 的种子段已清空 | ✅ 已完成（2026-08-12） |
| 2w | 生产任务单打印页 + 服务端 PDF | 订单列表「导出单据」→ A4 打印页（页头 + 产品行表格 rowspan 合并 + `otherReq` 富文本图文 + 贴底签名栏）；「导出PDF」由服务端 `PdfService` 用无头浏览器渲染同一张打印页直接回传文件（点一下即下载，不弹打印对话框）。新增 `puppeteer-core` 依赖与 `PRINT_BASE_URL` 配置，部署脚本自动装 Chrome。⚠️ 内存纪律与「打印页不挂 Layout」的原因见 §5.6 订单块 | ✅ 已完成（2026-08-13） |
| 2v | 产品要求描述字段 + 客户图号移位 | 订单产品级新增 `product_requirement`（迁移 `migration-product-requirement.sql`），表单位置在「轨道节数」与「规格」之间；配套开关 `product_requirement_enabled` 走 §5.7 六处模式（migration-field-switches.sql 追加），影响面：订单表单 / 订单列表展开行 / 总计划导出。「客户图号」输入框移到「产品名称」与「产品类型」之间（纯布局，字段不动） | ✅ 已完成（2026-08-13） |
| 2u | 免装配下线 + 入库单车间 + 呆滞品交互 | ① **免装配整体下线**（使用部门反馈：内轨也要装配自身小零件）：删共享包 `needsAssemblyGate`、快照 `splitParts` 字段、`assemblyExempt`/`exempt` 全链路，分体行一律建批次受闸门，台账装配两列恒出数字；`verify:ledger`【3】同步去豁免。② 入库单「班组」改「**车间**」下拉（字典 assembly_workshop 补**装九**；列名 `work_team` 不动，历史自由文本原样回显）、「机台号」停用录入（列保留，编辑不覆写历史值）。③ 呆滞品：产品类型多选不折叠、单位改复选框单选默认套、数量框内嵌单位后缀、出入库原因按方向分列并新增「销售出库」。迁移 `migration-assembly-required-workshop9.sql`（注释订正+字典行） | ✅ 已完成（2026-08-13） |
| 2t | 成品库存批量导入 / 导出 | 成品库存页新增两个按钮。**导出**：复用 `findBalance`（不另写聚合 SQL），颜色列随 §5.7 开关增减，末尾汇总行**按表头名定位**，空结果/超限一律拒绝。**导入**：⚠️ 关键设计——**不直写 `t_finished_balance`**，Excel 行汇成一张 FGO 期初单走 `createOpeningBalance`，由单据驱动余额（§5.6 核心不变式），录错可红字冲销；模板**预填**可录期初的产品行（含卡口按左右拆行）只留数量待填，「产品行ID + 订单号」交叉核对防串行，整批全有全无。顺带把台账导出的私有 `loadDictLabels` 抽成公共 [dict-label.util.ts](apps/server/src/common/utils/dict-label.util.ts)（§4.4 第二处相似实现即抽公共）。E2E `e2e-stock-balance.mjs` 70 项全过 | ✅ 已完成（2026-08-13） |
| 2q | 岗位主数据 + 人事表单子页面 | 岗位由字典 `hr_position` 升级为「基础数据 → 岗位管理」独立主数据 `t_position`（岗位编码/所属部门/职级/是否管理岗/编制人数，列表带在岗人数并超编标红）；`t_employee.position` → `position_id`，下拉按部门过滤且含通用岗位、被引用禁删。人事档案录入改为独立子页面 `/hr/employee/form`（四段字段弹窗塞不下）。⚠️ 迁移时踩到：`migration-employee.sql` 原本每次都重种 hr_position 字典，导致本迁移删掉后又复活，已回头摘除（§三「删列迁移必须加固前序迁移」的同类问题） | ✅ 已完成（2026-08-11） |
| 2p | 员工编码自动生成 | 按《海宝五金员工编码管理规则》落地：新增员工自动生成 `2位厂区+2位年份标识+3位部门+3位流水号`，非正式人员带 S/L 前缀。新增 `t_employee.plant_code` 与 `t_department.hr_code`（部门编码放主数据、不写死），共享包 `employee-code.ts` 为双端事实源，流水号复用 `NumberGeneratorService`。编号终身不变（跨厂区调动只改 plant_code），唯一例外是试用转正显式换发。口径见 §5.6 | ✅ 已完成（2026-08-11） |
| 2o | 呆滞品管理 | 「成品期初（不挂订单）」拆成独立模块：`t_dull_stock` + `t_dull_stock_flow` 两表，跟踪 期初/入库/出库/结存 四个数，新增客户与生产单号、单位可选套/支、表面处理联动带出颜色、流水可删并回滚累计数。**独立台账，不与订单台账/成品库存联动**。原纯属性期初形态前后端整体删除（系统未上线，无数据需迁移），成品期初收敛为只能挂订单。口径见 §5.6 | ✅ 已完成（2026-08-11） |
| 2r | 期初可挂正常订单（口径漏洞） | 期初豁免装配闸门，而选择器与服务端都不看 `is_opening`，于是在正常新订单上录期初 = 绕过「Σ已完成装配 − Σ已入库」凭空加库存与完成数。已双层堵死：`group-options` 加 `onlyOpening` 参数（期初页传 true）+ `buildOpeningItems` 逐行硬校验 `orderIsOpening===1`；`ProductSnapshotService` 增补 `orderIsOpening` 快照列。口径见 §5.6 | ✅ 已完成（2026-08-11） |
| 3 | 部件台账 V1 定位 | 仅"期初 + 手工调整留痕"的参考台账，**不与外发/入库单据自动联动**（无报工则无采集点），联动列入 V2 | 📘 已定口径 |
| 4 | 订单变更流程 | V1 简化为"被下游引用后禁改，提示先冲销/作废下游单据"；正式变更单据化列入 V2 | 📘 已定口径 |
| 5 | 外发回货验收(FQC) | V1 仅用备注承载，不独立建模 | 📘 V1 不做 |
| 6 | 外购零配件台账 | V1 不涉及（不建台账、不做出入库） | 📘 V1 不做 |
| 2x | 产品汇总查询 | 「统计分析 → 产品汇总」双页签落地（M9）：Tab1 复用 findLedger 聚合（onlyOwed 聚合后过滤的坑见 §5.6）、Tab2 期间口径复用 order-owed 单据族；权限 `product-summary(:export)` 不预置角色 | ✅ 已完成（2026-08-14） |
| 2y | 送货单打印 | 成品出库单一键出送货单（打印页 + 服务端 PDF），版式按客户套模板。锚出库单不新建表；**版式全在前端注册表**（加客户模板 = 加一条纯数据配置）；数量跟随订单单位、混合单位表头退化；含卡口左右合并成一行。权限 `finished-stock:print`（迁移按持有 `:create` 的角色补授）。口径见 §5.6 送货单块 | ✅ 已完成（2026-08-14） |
| 2z | 入库单打印 | 生产入库单一键出 **A5 横向**入库单（打印页 + 服务端 PDF），交仓库收货签字。锚入库单不新建表、单号不派生；仅 `inbound` 可打；列集合直接写在纸面组件、不进模板注册表；与送货单的共用取数件抽到 `print-note.util.ts`。权限**复用** `finished-stock:print`（清单改名「打印单据」，无迁移）。⚠️ A5 只有 128mm 可用高，字号行高不得调大——口径见 §5.6 入库单块 | ✅ 已完成（2026-08-14） |
| 7 | 事务写法约定 | 默认 `dataSource.transaction(mgr => ...)`；仅需悲观锁/手动控制提交时用 QueryRunner，并注释说明原因 | 📘 已定约定 |
| 8 | 前端大 chunk 告警 | vite build 提示主包 > 500KB，暂未做代码分割；影响首屏但不影响功能，需要时再治理 | ⬜ 低优先级 |
