# hb-oms —— 海宝五金订单跟踪系统

接单 → 部件外发（可选）→ 回货 → 成品入库 → 成品出库；核心呈现订单数 / 完成数 / 库存数 / 欠数（双口径）。

**当前阶段：M4 出入库+台账已完成，下一步 M5 期初+看板。** 实施按设计文档 §9 里程碑推进：✅ M1 骨架 → ✅ M2 订单 → ✅ M3 外发 → ✅ M3.5 装配 → ✅ M4 出入库+台账 → M5 期初+看板。

两份权威文件，动手前先读：

| 文件 | 管什么 |
|---|---|
| [CLAUDE.md](./CLAUDE.md) | **工程规范唯一权威**：架构分层、命名与状态常量约束、迁移三步法、接口四要素、验收方式、部署铁律、协作约定 |
| [订单跟踪系统(hb-oms)设计文档-V1.0.md](./订单跟踪系统(hb-oms)设计文档-V1.0.md) | **业务口径唯一权威**：数据模型、状态机、四数口径、边界不变式、里程碑 |

## 目录结构

```
hb-oms/                                    # pnpm + turbo monorepo（架构模式沿用 hb-mes）
├── CLAUDE.md                              # 工程规范唯一权威（AI 协作必读）
├── 订单跟踪系统(hb-oms)设计文档-V1.0.md   # 业务口径唯一权威
├── apps/
│   ├── server/                            # NestJS + TypeORM + MySQL（端口 8100，库 haibao_oms）
│   └── web/                               # Vue3 + Element Plus + Vite（后台管理，端口 5174）
├── packages/shared/                       # 前后端共享常量/纯函数（状态枚举、1套=2支、1英寸=25mm、产品类型组合、部件展开蓝图、外发折算、装配状态派生与入库闸门算式）
├── docs/                                  # 文档站构建工具（marked，md → site/）
├── site/                                  # 前台静态站（Nginx /oms/ 部署根：欢迎首页 + 设计文档页）
└── deploy/                                # 服务器部署脚本
```

> 前后台定位：**前台（site/）只是门户**——欢迎文案 + 系统主要功能介绍 + 「进入后台管理」入口，无需登录、不展示任何业务数据，也不再规划 Vue 化的公开数据/图表页；一切业务数据与看板都在**后台**（apps/web，登录 + 权限）。
> `site/design-doc.html` 是评审期产物，仍随站点部署（直接访问 `/oms/design-doc.html` 可看），但已从首页导航栏摘除，不对业务人员外挂。

## 开发

```bash
pnpm install
cp apps/server/.env.example apps/server/.env   # 填本地 MySQL 密码
pnpm db:init        # 全新建库 haibao_oms + 建表 + 种子（勿对已有数据库执行）
pnpm dev            # 前后端并行（server:8100, web:5174）；亦可 dev:server / dev:web 单独起
pnpm lint           # eslint（错误阻断）
pnpm db:migrate     # 存量库增量迁移（幂等）
```

> 共享包构建时机：`pnpm dev`（根）会 watch 跟随改动；`dev:server` / `dev:web` 只构建一次，**改了 `packages/shared` 须重新执行**；裸执行 `pnpm --filter @hb-oms/web dev` 不会自动构建共享包。

默认账号：`admin / Admin@123`；演示账号 `sales01`/`follow01`（`Sale@123`）、`wh01`（`Wh@12345`）。

### 已实现模块

| 分组 | 模块 | 要点 |
|---|---|---|
| 生产管理 | **订单管理** | 四级结构 订单→产品行→**部件组**→部件行；部件组是跟踪/台账锚点；按组类型+节数+卡口蓝图自动展开部件行；PO# 与生产单号同在订单级且一对一，产品级另有客户图号；部件组支持「复制上一行」；完结/重开状态机 + **删除**（取代作废）；被下游单据引用后禁改禁删 |
| 生产管理 | **外发管理**（发坯单） | 单头+发出明细+回货登记三表；发坯单号 7 位定长（展示 `No.`）；重量÷单重折算数量可微调；状态 1待发出→2已发出→3部分回货→4已回齐自动推进，3→4 可手工关闭（须填原因）；分批回货与撤销、超回允许不拦截、发出数量修正自动双向重算回齐；**《电镀发外加工单》打印**（240mm×150mm 四联单版式，移植自 hb-mes，每页 11 行、多明细自动续页） |
| 生产管理 | **装配管理**（批次跟踪） | 按**部件组 + 边别**录批次，一组多批；计划员录**预计装配区间**（计划开始~计划完成），填了实际完成时间即视为该批完成；含卡口产品左右分开核算、左右不串量；列表按部件组聚合已完成/未装配/批次数/逾期；**可入库量接口 = Σ已完成装配 − Σ已入库**（唯一实现，M4 入库闸门复用），删除/下调数量/退回计划中致额度为负一律拒绝并回滚 |
| 物料管理 | **成品出入库** | 单据头+明细+余额三表；单号 FGI入库/FGO出库(含期初)/FGR红字；数量恒正、方向看单头，红字方向相反自然抵扣；**确认是唯一驱动余额的入口**——入库校验装配闸门、出库校验结存，同事务行锁；已确认单禁改禁作废、只能红字冲销（支持按行部分冲销），红字单不可再冲销 |
| 物料管理 | **成品库存** | 按「部件组+边别+批次」分行的实时结存，**只读**——只由单据确认与冲销驱动，改数一律走出入库单/红字冲销（与可手工调整的「部件台账」性质不同，故不叫台账） |
| 物料管理 | **期初录入** | 上线把手工账存量搬进系统，菜单常驻可反复补录；三类：成品期初（挂订单，计入台账完成数）/ 成品期初（不挂订单的纯属性行，只进库存数不参与订单欠数）/ 部件期初（7 维累加并留流水，整批全有全无）。成品期初生成 FGO 单立即生效，录错可红字冲销 |
| 物料管理 | **部件台账** | 7 维属性锚定（部件/边别/货号/节数/产品类型/料厚/规格）的部件半成品余量；**余量唯一写入口是带原因的调整**，期初与手工调整共用并留痕，可按行展开查看变动流水；V1 为独立参考台账，不与外发/成品单据联动 |
| **订单跟踪台账** | **一级菜单（系统核心产出）** | 按**订单产品行**一行（部件组明细在展开行），四数全部实时聚合无冗余列：订单数/完成数/库存数 + 双欠数（成品欠数、发货欠数）；数量按「部件（零件支数）/ 成品（整轨支数）」多级表头分栏；欠数为负=超产/超发照常显示并高亮；筛选客户/业务员/跟单员/交期/表面处理/装配车间/产品类型(包含匹配)/只看有欠数/只看逾期；带汇总卡；配套 `verify:ledger` 口径核算脚本 |
| 工艺管理 | 开单信息 | 图号唯一；部件级版本/长度要求/特殊要求/开单注明/模具编号；多图 + 修改履历；手工表格式 Excel 导入导出（导出附带审核意见与内嵌截图） |
| 物料管理 | 部件信息 | 货号/材质/料厚/单重等，Excel 批量导入 |
| 设备管理 | 设备信息 | 机台号/产品型号/部件/机修员/用料规格/图号/常用料厚 |
| 基础数据 | 客户资料、部门信息 | 客户 Excel 批量导入（整批校验、逐行错误、覆盖开关）；部门树表 |
| 系统管理 | 用户/角色/菜单权限/数据字典/操作日志/更新日志/系统配置 | 登录走滑块验证码 + JWT 刷新；菜单驱动动态路由 |

### 开发规范速查（详见 [CLAUDE.md](./CLAUDE.md)）

- **改表**：`synchronize=false`，一律写幂等 `apps/server/scripts/sql/migration-*.sql` → 登记 `db-migrate.ts` 的 `MIGRATIONS` 末尾并补 `expectedColumns` → 同步 `01-schema.sql`。
- **权限点**：唯一事实源 `src/modules/system/permission-manifest.ts`，启动自动 upsert + 补授 admin，改名/改父级无需迁移 SQL；权限变更后用户需重新登录。
- **状态枚举 / 单位换算 / 产品型号拼接**：只改 `packages/shared` 一处，两端 re-export；**禁止裸状态数字**。
- **单号**：一律经 `NumberGeneratorService` 采番，事务内须传 `manager`。
- **验收**：无单元测试框架，按 CLAUDE.md §4.5 写 API 级 E2E 脚本实测（覆盖守卫与状态机每条边），构建校验取真实退出码；涉及数量口径的改动另跑 `pnpm --filter server verify:ledger` 独立重算核对。

## 文档站构建

```bash
cd docs
npm install
npm run build   # 读取根目录设计文档 md，生成 site/index.html 与 site/design-doc.html
```

**修改文档只改根目录 md 源文件**，改完重新 `npm run build`；不要直接编辑 site/ 下的 HTML（会被覆盖）。

## 部署（阿里云 ECS 120.79.138.198，与 hb-mes / QMS 同机）

同机已运行 hb-mes（80 主站 + PM2 `hb-mes-server`:8000）、QMS（`/QMS/` 前缀 :3000）、OnlyOffice(:8080)、MySQL。**hb-oms 全部挂 `/oms/` 路径前缀**，修改 Nginx 只增不改，严禁影响既有 location（尤其 QMS）。

### 生产环境布局

| 项 | 值 |
|---|---|
| 代码目录 | `/var/www/hb-oms/app`（monorepo，服务器上安装依赖并构建后端） |
| 前台静态站 | `/var/www/hb-oms/site` → `location /oms/` |
| 后台前端产物 | `/var/www/hb-oms/web-dist` → `location /oms/admin/`（**本地构建上传**，服务器内存有限禁跑 vite build） |
| 后端进程 | PM2 `hb-oms-server`，`127.0.0.1:8100` → `location /oms/api/`（proxy_pass 到 `:8100/api/`） |
| 上传文件 | `/var/www/hb-oms/app/apps/server/uploads` → `location /oms/uploads/` |
| 数据库 | 本机 MySQL `haibao_oms`（root 密码沿用 hb-mes .env） |
| 服务端 .env | `/var/www/hb-oms/app/apps/server/.env`（deploy 脚本首次自动生成：PORT=8100、DB_NAME=haibao_oms、随机 JWT_SECRET） |
| Nginx 配置 | `/etc/nginx/conf.d/hb-mes.conf`（共用 server 块，脚本幂等插入 /oms/* location，自动备份+`nginx -t` 回滚） |

### 发版流程（本地 Windows 开发机执行）

> ⚠️ **三条铁律**（都是踩过的坑）：
> 1. 前端 dist **只能传到 `/var/www/hb-oms/web-dist/`**（Nginx alias 目录），传到代码目录下的 `app/apps/web/dist/` 会出现"部署脚本报成功、线上却是旧版"的假象；部署后必须比对入口 JS 哈希确认生效。
> 2. 前端**只在本地构建**：服务器同时跑 MySQL / hb-mes / QMS / OnlyOffice，内存紧张，`vite build` 压缩阶段易 OOM 卡死。
> 3. 改 Nginx **只增不改**，严禁影响 hb-mes 与 QMS 的既有 location。

```bash
# 1. 本地构建后台前端（base=/oms/admin/ 由 vite.config 按 mode 注入）
pnpm --filter @hb-oms/web build

# 2.（如改了设计文档/前台）重建前台静态站
cd docs && npm run build && cd ..

# 3. 同步代码
git push origin main
git archive main | ssh root@120.79.138.198 "mkdir -p /var/www/hb-oms/app && tar -x -C /var/www/hb-oms/app"

# 4. 上传前端产物（先清 assets 再解包，避免历史哈希文件无限堆积）
tar -C apps/web/dist -czf - . | ssh root@120.79.138.198 \
  "rm -rf /var/www/hb-oms/web-dist/assets && tar -xzf - -C /var/www/hb-oms/web-dist"
scp site/*.html root@120.79.138.198:/var/www/hb-oms/site/   # 仅前台有改动时

# 5. 服务器端安装/构建/迁移/重启（幂等）
ssh root@120.79.138.198 "bash /var/www/hb-oms/app/deploy/deploy-oms-app.sh"

# 6. 验证生效：两侧入口 JS 哈希必须一致
grep -o 'assets/index-[^"]*\.js' apps/web/dist/index.html
curl -s http://120.79.138.198/oms/admin/index.html | grep -o 'assets/index-[^"]*\.js'
```

脚本职责见 [deploy/deploy-oms-app.sh](./deploy/deploy-oms-app.sh)：生成 .env（仅首次）→ `pnpm install` + 构建 shared/server → 无库跑 `db:init`、有库跑 `db:migrate` → PM2 start/restart + 探活 → Nginx location 幂等插入并重载。**该脚本不碰前端产物**，dist 由上面第 4 步单独上传。

> 数据库迁移由部署脚本委托 `pnpm db:migrate` 执行（唯一清单来源 `db-migrate.ts`），**不要在脚本或本文件里手抄第二份迁移清单**——hb-mes 曾因手抄清单漏跑迁移，导致"跑完脚本 ≠ 跑完真实清单"。

### 访问入口

- 前台：http://120.79.138.198/oms/ （导航栏：技术文档 / 后台管理）
- 后台管理：http://120.79.138.198/oms/admin/
- 后端 API：http://120.79.138.198/oms/api/

### 常用运维命令（服务器上）

```bash
pm2 status && pm2 logs hb-oms-server --lines 50   # 进程与日志
pm2 restart hb-oms-server                         # 重启后端
nginx -t && systemctl reload nginx                # 配置校验/重载
mysql -uroot -p haibao_oms                        # 进库
cd /var/www/hb-oms/app && pnpm db:migrate         # 手动增量迁移（幂等）
```

本地探活（判断线上是否正常）：

```bash
curl -s -o /dev/null -w "admin:%{http_code}\n" http://120.79.138.198/oms/admin/
curl -s -o /dev/null -w "api:%{http_code}\n" http://120.79.138.198/oms/api/system/config/public
```

### 故障排查

| 现象 | 排查方向 |
|---|---|
| 部署成功但页面还是旧版 | dist 传错目录（须是 `/var/www/hb-oms/web-dist/`）；或浏览器缓存，先按入口 JS 哈希比对确认 |
| 后台白屏 / 404 | 检查访问路径是否带尾斜杠（`/oms` 与 `/oms/admin` 已配 301 重定向）；`pm2 logs hb-oms-server` 看后端是否起来 |
| 接口 401 反复跳登录 | 权限点有变更后需重新登录刷新 JWT；或 `.env` 的 `JWT_SECRET` 被重新生成 |
| 新功能报字段不存在 | 迁移没跑：`pnpm db:migrate` 并看结构验证输出 |
| 前端构建卡死 | 不要在服务器构建前端，回本地构建后上传 dist |
