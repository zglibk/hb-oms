# hb-oms —— 海宝五金订单跟踪系统

接单 → 部件外发（可选）→ 回货 → 成品入库 → 成品出库；核心呈现订单数 / 完成数 / 库存数 / 欠数（双口径）。

**当前阶段：M1 骨架已完成（基础数据 + 系统管理），设计文档评审并行。** 权威设计底稿见 [订单跟踪系统(hb-oms)设计文档-V1.0.md](./订单跟踪系统(hb-oms)设计文档-V1.0.md)，实施按文档 §9 里程碑推进：✅ M1 骨架 → M2 订单 → M3 外发 → M4 出入库+台账 → M5 期初+看板。

## 目录结构

```
hb-oms/                                    # pnpm + turbo monorepo（架构模式沿用 hb-mes）
├── 订单跟踪系统(hb-oms)设计文档-V1.0.md   # 设计文档源文件（唯一事实源）
├── apps/
│   ├── server/                            # NestJS + TypeORM + MySQL（端口 8100，库 haibao_oms）
│   └── web/                               # Vue3 + Element Plus + Vite（后台管理，端口 5174）
├── packages/shared/                       # 前后端共享常量/纯函数（状态枚举、1套=2支、1英寸=25mm、产品类型组合）
├── docs/                                  # 文档站构建工具（marked，md → site/）
├── site/                                  # 前台静态站（Nginx /oms/ 部署根：首页 + 设计文档评审页）
└── deploy/                                # 服务器部署脚本
```

> 前后台规划：前台用于**无需权限**的数据表/图表展示（当前为 site/ 静态版，后续 Vue 化），数据管理在**后台**（apps/web，登录 + 权限）。

## 开发

```bash
pnpm install
cp apps/server/.env.example apps/server/.env   # 填本地 MySQL 密码
pnpm db:init        # 全新建库 haibao_oms + 建表 + 种子（勿对已有数据库执行）
pnpm dev            # 前后端并行（server:8100, web:5174）；亦可 dev:server / dev:web 单独起
pnpm lint           # eslint（错误阻断）
pnpm db:migrate     # 存量库增量迁移（幂等）
```

默认账号：`admin / Admin@123`；演示账号 `sales01`/`follow01`（`Sale@123`）、`wh01`（`Wh@12345`）。
已实现模块：登录（滑块验证码/JWT 刷新）、用户/角色/菜单/字典/操作日志、客户资料（Excel 批量导入）、工艺信息（图号唯一 + 外中内三列组 + 多图）、物料管理。
表结构变更规范沿用 hb-mes：`synchronize=false`，改表一律写幂等 `scripts/sql/migration-*.sql` 并登记 `db-migrate.ts` 的 MIGRATIONS 数组末尾，同步更新 `01-schema.sql`；权限点唯一事实源 `src/modules/system/permission-manifest.ts`（启动自动同步）。

## 文档站构建

```bash
cd docs
npm install
npm run build   # 读取根目录设计文档 md，生成 site/index.html 与 site/design-doc.html
```

**修改文档只改根目录 md 源文件**，改完重新 `npm run build`；不要直接编辑 site/ 下的 HTML（会被覆盖）。

## 部署（阿里云 ECS，与 hb-mes / QMS 同机）

服务器已运行 hb-mes（80 端口主站）、QMS（`/QMS/` 前缀）等服务，**hb-oms 前台以独立路径前缀 `/oms/` 挂载**，严禁影响既有 location（尤其 QMS 相关，见 hb-mes README）。

1. 本地构建后上传产物：

```bash
scp -r site/* <user>@<server>:/var/www/hb-oms/site/
```

2. 在 `/etc/nginx/conf.d/hb-mes.conf` 的 server 块内**新增**（不要改动任何既有 location）：

```nginx
# hb-oms 订单跟踪系统前台（静态站，设计评审期）
location /oms/ {
    alias /var/www/hb-oms/site/;
    index index.html;
}
```

3. 验证并重载：

```bash
nginx -t && systemctl reload nginx
```

4. 访问 `http://<server>/oms/` 即前台首页，导航栏「技术文档」进入设计文档评审页。

> 后续 M1 起本仓库将初始化为 pnpm + turbo monorepo（apps/server + apps/web + packages/shared，架构模式沿用 hb-mes），后端建议端口 8100、PM2 进程名 `hb-oms-server`，`/oms/api/` 反代过去；届时更新本 README。
