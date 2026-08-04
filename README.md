# hb-oms —— 海宝五金订单跟踪系统

接单 → 部件外发（可选）→ 回货 → 成品入库 → 成品出库；核心呈现订单数 / 完成数 / 库存数 / 欠数（双口径）。

**当前阶段：设计评审。** 权威设计底稿见 [订单跟踪系统(hb-oms)设计文档-V1.0.md](./订单跟踪系统(hb-oms)设计文档-V1.0.md)，评审通过后按文档 §9 里程碑（M1~M5）启动开发。

## 目录结构（当前）

```
hb-oms/
├── 订单跟踪系统(hb-oms)设计文档-V1.0.md   # 设计文档源文件（唯一事实源）
├── docs/                                  # 文档站构建工具
│   ├── package.json                       # 依赖：marked
│   └── build.mjs                          # md → site/ 静态页构建脚本
└── site/                                  # 构建产物 = 前台静态站（Nginx 部署根）
    ├── index.html                         # 前台首页（导航栏：首页 / 技术文档 / 后台管理占位）
    └── design-doc.html                    # 设计文档 HTML 版（暂挂前台导航栏供评审）
```

> 前后台规划：前台用于**无需权限**的数据表/图表展示，数据管理在**后台**（登录 + 权限）。当前 `site/` 是前台的静态先行版，业务前台后续由 Vue 应用替换，设计文档届时仍保留为导航栏入口（或迁至后台）。

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
