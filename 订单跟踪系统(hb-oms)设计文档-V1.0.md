# 海宝五金订单跟踪系统（hb-oms）设计文档 V1.0

> **状态**：待评审 ｜ **日期**：2026-08-04 ｜ **前身系统**：hb-mes（PMC/MES，排产主线）
>
> 本文档为 hb-oms 项目的权威业务与技术设计底稿，评审通过后作为编码依据；实现与本文档冲突时以本文档为准。

---

## 1. 背景与目标

### 1.1 背景

hb-mes 以「排产单 + 多级审核 + 报工」为主线，但工厂实际排产高度依赖计划员手工灵活调度，系统排产与现场执行长期存在落差：排产单的编制、审核、报数流程对现场是负担而非助力，数据滞后且失真。

业务复盘结论：**放弃对生产过程（排产/审核/报工）的系统化管控，转向订单跟踪**——系统的核心用户从计划员变为**销售业务/跟单员**，核心诉求是随时回答一个问题：

> **「这张订单做完了多少、仓库还有多少、还欠客户多少？」**

### 1.2 系统定位

hb-oms 表现形态类似**仓库台账**，围绕订单逐行呈现四类数字：

| 指标 | 含义 |
|---|---|
| 订单数 | 客户订购数量（统一折算为「支」） |
| 完成数 | 累计成品入库数量 |
| 库存数 | 当前成品结存数量 |
| 欠数（双口径） | **生产欠数** = 订单数 − 完成数（生产视角：还差多少没做完）；**发货欠数** = 订单数 − 累计出库（销售视角：还欠客户多少货） |

### 1.3 业务主线

```
客户下单（官方订单文件 / 口头 / 电话 / 社交软件）
   → 创建订单（订单 → 产品行 → 部件行 三层；按生产图号自动带入工艺信息）
   → 部件外发表面处理【可选：镀锌板产品不外发】（发出登记）
   → 外发回货【可选】（分批回货登记）
   → 装配（计划员手工录计划完成时间 / 实际完成时间 + 装配数量，多批次）
   → 成品入库（受装配闸门约束：装配未完成禁止入库）
   → 成品出库（销售发货）
```

**不进入系统的环节**：排产、工序管理（拉槽/冲压）、车间报工、多级审核、外购零配件（钢珠/拨叉等，见 §10 后续扩展）。

> **装配是唯一纳入系统的工序环节**，但仅作**轻量跟踪**：计划员按产品行手工录入装配批次（计划完成时间 / 实际完成时间 / 装配数量），实际完成时间已填即视为该批完成；不做工序报工、机台工时、产线调度。装配作为成品入库的前置闸门（§4.5 / §7）。

---

## 2. 方案决策（待评审确认）

| # | 决策项 | 结论 |
|---|---|---|
| 1 | 落地方式 | 新项目 `hb-oms` 全新起步，复用 hb-mes 架构模式（pnpm+turbo monorepo / NestJS+TypeORM+MySQL / Vue3+Element Plus / packages/shared），**全新数据库 `haibao_oms`**，历史数据靠期初录入，hb-mes 保持不动 |
| 2 | 排产去留 | **彻底移除**：无排产单、无审核流、无报工；外发单直接锚定订单产品行 |
| 3 | 欠数口径 | **双欠数并列展示**：生产欠数 = 订单数 − 累计入库；发货欠数 = 订单数 − 累计出库 |
| 4 | 表面处理枚举 | **四值：0 无 / 1 封漆 / 2 电泳 / 3 喷涂**（「无」= 镀锌板等不外发产品） |
| 5 | 外发单粒度 | 一张发坯单 = **单头（加工商/日期/表面处理）+ 多产品明细行**；回货按明细行**分批登记**，一行可多次回货 |
| 6 | 外购零配件 | V1 **暂不涉及**（不建台账、不做出入库），列入后续扩展 |
| 7 | 期初成品与订单 | **先补录历史订单再挂期初**：未完结历史订单补录为正式订单（标记「期初补录」），期初成品挂产品行、参与欠数计算；已完结订单的剩余库存用**纯属性期初行**（不挂订单，只计库存数） |
| 8 | 产品类型 | **多选组合**（如「普通自锁」「卡口自锁」）；组合中**含「卡口」即触发全部卡口规则**（左右分列、2 支 = 1 套、部件/库存分边别） |
| 9 | 工艺信息 | 独立基础数据模块，创建订单时**按生产图号匹配**自动带入（可修改） |
| 10 | 装配环节 | 外发回货与成品入库之间新增装配；**一产品可多批装配**（锚定产品行），计划员手工录计划/实际完成时间 + 装配数量；作为入库**硬闸门**：`可入库量 = Σ已完成装配量 − 已入库量`，**按量卡**、支持部分装配部分入库；期初入库豁免 |

### 2.1 统一口径

- **规格双单位**：英寸 / mm 双单位录入，换算系数**固定 1 英寸 = 25mm**（我司统一口径，非国标 25.4）；存储统一为 mm 数值，同时保留原始录入值与单位用于回显。
- **数量口径**：台账、库存、外发一律以「支」为准；订单单位为「套」时 **1 套 = 2 支**（滑轨两支一组；卡口产品左右各 1 支为 1 套）。
- **产品类型多选**：字典值按固定字典顺序排序后逗号拼接存储（如 `standard,self_lock`，保证同一组合唯一表达），展示为中文顺序拼接「普通自锁」；共享包提供 `parseProductTypes / formatProductTypes / hasSocket`（含卡口判断）纯函数，两端统一经此函数处理，禁止各自手工拆串。
- **卡口区分左右**：产品类型组合含「卡口」时，部件行、成品库存、出入库明细均区分左/右（`side`），其余产品 `side=''`。
- **产品型号拼接规则**：`货号 + 产品类型中文组合 + "滑轨"`（如 `53#普通滑轨`、`53#卡口自锁滑轨`），共享包纯函数实现，外发单等处引用。
- **部件台账 V1 定位**：独立参考台账（期初 + 手工调整留痕），**不与外发/入库单据自动联动**——无排产报工后部件产出无采集点，强联动没有数据基础；联动列入 V2 扩展（§10）。
- **料厚**：产品级字段，格式 `外×中×内`（如 `1.2×1.0×1.2`），文本存储。

---

## 3. 业务流程与状态机

### 3.1 订单状态机

```
            创建
             │
             ▼
        1 进行中 ────────────────► 9 已作废（未被出入库/外发引用时可作废）
             │
             │ 发货欠数 ≤ 0 自动完结，或手工点「完结」
             ▼
        2 已完结 ──手工重开──► 1 进行中
```

- 订单**无审核流**，创建即生效。
- 「完结」是台账口径（不再跟踪），不锁单据：已完结订单仍可入库/出库（如客户追加提货），发生出入库后若发货欠数回正可自动重开或提示。
- 作废校验：订单下任一产品行被外发单/出入库单引用后禁止作废，只能走完结。

### 3.2 外发单（发坯单）状态机

```
        1 待发出 ──登记实际发外日期──► 2 已发出
             │                          │
             ▼                          │ 任一明细行有回货登记
        9 已作废（未发出时可作废）        ▼
                                   3 部分回货
                                        │ 全部明细行回齐（Σ回货数 ≥ 发出数），或手工「关闭」
                                        ▼
                                   4 已回齐
```

- 状态由系统按回货登记自动推进（2→3→4），也允许手工从 3 直接「关闭」为 4（尾数不回、损耗核销场景），关闭需填原因。
- 已有回货登记的外发单禁止作废。

### 3.3 成品出入库单状态机

```
        1 草稿 ──确认──► 2 已确认 ──(错误更正)──► 开红字冲销单（FGR，原单不变）
          │
          ▼
        9 已作废（仅草稿可作废）
```

- 沿用 hb-mes 模式：**已确认单据禁止 UPDATE/DELETE**，更正一律开红字单（`biz_type='reversal'`，明细 `origin_item_id` 追溯原明细行）。

### 3.4 装配批次状态机

```
        1 计划中（仅填计划完成时间）
             │ 填写实际完成时间
             ▼
        2 已完成（该批装配数量计入可入库量）
```

- 状态为**派生值**：`actual_date IS NULL → 计划中`，`actual_date 非空 → 已完成`，无独立状态列（`t_assembly_batch.status` 由服务端按 actual_date 计算返回，或前端按字段派生）。
- 已完成批次的数量参与入库闸门（§4.5）；批次**被入库消耗后禁止删除或下调数量致可入库量为负**（§7）。
- 从已完成退回计划中（清空实际完成时间）：仅当该产品行「可入库量」在退回后仍 ≥ 已入库量，否则拒绝。

---

## 4. 数据模型

> 通用约定：所有表 `t_` 前缀 + snake_case；所有字段带 `COMMENT`（枚举字段列全枚举值中文含义）；业务流水表带审计字段 `creator_id / creator_name / updated_by / updater_name / created_at / updated_at`（下文省略不再重复列出）；金额/重量 decimal，数量（支）int。

### 4.1 基础数据

| 表 | 说明 |
|---|---|
| `t_user` / `t_role` / `t_permission` / 关联表 | 用户/角色/权限，权限清单 SSOT（permission-manifest.ts 启动自动 upsert）模式照搬 hb-mes |
| `t_dict` | 数据字典：产品类型、部件类型、轨道节数、单位、下单来源、加工商可用颜色等 |
| `t_customer` | 客户资料（§4.1.1） |
| `t_material` | 物料（产品）主数据（§4.1.2） |
| `t_process_info` | 工艺信息（§4.1.3） |

基础数据原则（继承 hb-mes §5.5）：可编辑、`status` 启停；被业务引用后限制删除；业务单据创建时快照关键字段，主数据变更**不回写**历史单据（工艺信息同理：订单引用的是快照，工艺后续更新不回写历史订单）。

#### 4.1.1 t_customer（客户资料）

| 字段 | 类型 | 说明 |
|---|---|---|
| customer_code | varchar(64) UK | 客户代码（必填，唯一） |
| customer_name | varchar(128) UK | 客户名称（必填，唯一） |
| contact_person / contact_phone | varchar(64) | 联系人 / 电话 |
| salesman | varchar(64) | 默认业务员（订单创建时带出，可改） |
| merchandiser | varchar(64) | 默认跟单员（同上） |
| delivery_address | varchar(255) | 默认交货地址（同上） |
| status | tinyint | 状态：1启用 0停用 |
| remark | varchar(255) | 备注 |

**Excel 批量导入**：
- 模板列：客户代码\*、客户名称\*（必填），联系人、电话、默认业务员、默认跟单员、默认交货地址、备注（选填）；提供模板下载。
- 校验口径沿用 hb-mes 导入模式：**整批校验全部通过才落库**，任一行出错返回逐行错误清单（行号 + 原因），不部分入库。
- 判重按客户代码：默认已存在即报错；导入弹窗提供「覆盖更新」开关，开启后按客户代码 upsert 非空列。
- 导入接口标注 `@OperationLog`。

#### 4.1.2 t_material（物料/产品主数据）

material_code、item_no 货号、product_name、product_type（多选组合，§2.1）、rail_section、dimension、surface_type、color、drawing_no、drawing_version 版本号、sheet_material、material_thickness、unit 默认单位、status。订单选料后**快照**至产品行，可覆盖。

#### 4.1.3 t_process_info（工艺信息）

创建订单时按**生产图号**匹配自动带入（§4.2 联动说明）。

| 字段 | 类型 | 说明 |
|---|---|---|
| drawing_no | varchar(128) UK | 生产图号（唯一，匹配键） |
| drawing_version | varchar(32) | 版本号 |
| customer_id / customer_name | int / varchar(128) | 客户 |
| product_name | varchar(128) | 产品名称 |
| machines | varchar(128) | 生产机台，支持多个（录入为多标签，逗号存储，展示 `89/90/91`） |
| length_req_outer / length_req_middle / length_req_inner | varchar(128) | 长度要求：外轨 / 中轨 / 内轨 |
| special_req_outer / special_req_middle / special_req_inner | varchar(255) | 特殊要求：外轨 / 中轨 / 内轨 |
| mold_no_outer / mold_no_middle / mold_no_inner | varchar(64) | 模具编号：外轨 / 中轨 / 内轨 |
| process_update_note | text | 工艺更新说明 |
| process_update_images | varchar(512) | 工艺更新附图（FILE 上传多图，JSON 数组） |
| remark | varchar(255) | 备注 |
| （审计字段） | | 创建日期/创建人/更新日期/更新人（即通用审计字段） |

### 4.2 订单三层：`t_order` → `t_order_product` → `t_order_part`

#### t_order（订单主表）

| 字段 | 类型 | 说明 |
|---|---|---|
| order_no | varchar(32) UK | 系统单号，`ORD` 采番 |
| po_no | varchar(64) | PO#（客户单号/合同号） |
| customer_id / customer_name | int / varchar(128) | 客户 ID + 名称快照（选客户后自动带出默认业务员/跟单员/交货地址，可改） |
| order_date | date | 订单日期 |
| salesman | varchar(64) | 业务员 |
| merchandiser | varchar(64) | 跟单员 |
| order_source | varchar(32) | 下单来源：official_doc 官方订单文件 / verbal 口头 / phone 电话 / social 社交软件 |
| attachment_ids | varchar(255) | 订单原始文件附件（FILE 上传，JSON 数组） |
| status | tinyint | 状态：1进行中 2已完结 9已作废 |
| is_opening | tinyint | 期初补录标记：0正常 1期初补录（补录订单免外发/交期等非必填校验） |
| remark | varchar(255) | 备注 |

#### t_order_product（产品行）

| 字段 | 类型 | 说明 |
|---|---|---|
| order_id | int idx | 所属订单 |
| order_type | tinyint | 订单类型：1销售订单 2库存备货 |
| is_new_order | tinyint | 是否新单：0否 1是 |
| is_export / export_country | tinyint / varchar(64) | 是否出口 / 出口国家 |
| material_id / material_code | int / varchar(64) | 物料主数据 ID（可空支持手工行）/ 物料代码快照 |
| item_no | varchar(64) | 货号快照 |
| product_name | varchar(128) | 产品名称 |
| product_type | varchar(128) | 产品类型多选组合（字典序逗号拼接，如 `standard,self_lock`；候选值：standard 普通 / buffer 缓冲 / socket 卡口 / rebound 反弹 / self_lock 自锁 / anti_tilt 防倾倒…可扩展；含 socket 即触发卡口规则） |
| rail_section | varchar(32) | 轨道节数：two_section 二节轨 / three_section 三节轨 |
| dimension_mm | int | 规格（mm 统一口径，计算/匹配用） |
| dimension_raw / dimension_unit | varchar(32) / varchar(8) | 原始录入值 / 单位（inch/mm），1 英寸 = 25mm；展示拼 `14"（350mm）` |
| surface_type | tinyint | 表面处理：0无 1封漆 2电泳 3喷涂 |
| color | varchar(64) | 颜色 |
| drawing_no | varchar(128) | 生产图号（录入/选择后按图号匹配工艺信息自动带入，见下方联动说明） |
| drawing_version | varchar(32) | 版本号 |
| sheet_material | varchar(64) | 材质（如 Q235） |
| material_thickness | varchar(32) | 料厚 `外×中×内`（如 1.2×1.0×1.2） |
| order_qty | int | 订单数量（按 unit 计） |
| unit | varchar(16) | 单位：套 / 支 |
| qty_pcs | int | **支数口径**（服务端计算冗余）：unit=套 → order_qty×2，unit=支 → order_qty。台账「订单数」即此值 |
| production_no | varchar(64) | 生产单号（手工填写，产品行级，外发单快照引用；同订单内不同产品行可不同） |
| delivery_date | date | 交货日期 |
| delivery_address | varchar(255) | 交货地址 |
| remark / sort | | 备注 / 行序 |

> **工艺信息联动**：产品行录入/选择生产图号后，按图号匹配 `t_process_info` 自动带入版本号、产品名称（订单客户为空时一并带客户），带入值均为快照、可修改；订单表单提供「查看工艺」抽屉，展示该图号的生产机台、长度要求、特殊要求、模具编号、工艺更新附图——仅参考展示，不落订单字段。
>
> **不落台账冗余列**：完成数/出库数/库存数/双欠数一律实时聚合（§5），产品行不存这些数字，杜绝对账漂移。

#### t_order_part（部件行）

产品行保存时按规则自动展开（非卡口产品 3 行：外/中/内轨；含卡口组合左右分列 6 行），支持人工微调备注与追溯码，数量默认 = 产品支数（卡口按左右各半）。

| 字段 | 类型 | 说明 |
|---|---|---|
| order_id / product_id | int idx | 冗余订单 ID / 所属产品行 |
| part_type | varchar(32) | 部件：outer 外轨 / middle 中轨 / inner 内轨 |
| side | varchar(16) | 边别：left / right，仅含卡口组合使用，其余 `''` |
| cycle_code | varchar(64) | 产品周期（追溯码）：客户要求压印的追溯日期码，非必填；外发单快照引用 |
| qty | int | 需求数量（支） |
| remark / sort | | 备注 / 行序 |

### 4.3 外发（表面处理）：`t_outsource_doc` + `t_outsource_item` + `t_outsource_return`

#### t_outsource_doc（发坯单头）

| 字段 | 类型 | 说明 |
|---|---|---|
| blank_no | varchar(7) UK | **发坯单号**：7 位定长纯数字序号（`generatePaddedSequence` 模式），库存数字、展示拼前缀 `No.`；即本单据号 |
| processor_name | varchar(128) | 加工商 |
| surface_type | tinyint | 表面处理：1封漆 2电泳 3喷涂（外发必有表面处理，无「0无」） |
| color | varchar(64) | 颜色 |
| plan_send_date | date | 计划发外日期 |
| actual_send_date | date | 实际发外日期（登记后状态 → 已发出） |
| require_back_date | date | 要求回货日期 |
| status | tinyint | 状态：1待发出 2已发出 3部分回货 4已回齐 9已作废 |
| close_reason | varchar(255) | 手工关闭原因（部分回货 → 已回齐 时必填） |
| remark | text | 备注 |

#### t_outsource_item（发出明细行）

| 字段 | 类型 | 说明 |
|---|---|---|
| doc_id | int idx | 所属发坯单 |
| order_id / order_product_id | int idx | 锚点：订单 / 产品行 |
| production_no | varchar(64) | 生产单号（自产品行快照） |
| product_model | varchar(128) | 产品型号 = `货号+产品类型组合+"滑轨"`（共享包函数拼接快照，如 53#普通滑轨） |
| dimension_text | varchar(64) | 规格（展示快照） |
| cycle_code | varchar(64) | 周期码（自部件行追溯码快照） |
| send_weight | decimal(10,2) | 发出重量（kg） |
| unit_weight | decimal(10,4) | 单重（kg/支） |
| send_qty | int | 发出数量 = send_weight ÷ unit_weight 取整（前端自动算，可微调） |
| remark | varchar(255) | 备注 |

#### t_outsource_return（回货登记，一明细行可多条 = 分批回货）

| 字段 | 类型 | 说明 |
|---|---|---|
| doc_id / item_id | int idx | 冗余单头 / 所属发出明细行 |
| back_date | date | 回货日期 |
| return_weight | decimal(10,2) | 收回重量（kg） |
| unit_weight | decimal(10,4) | 单重（默认带出发出行单重，可改） |
| return_qty | int | 收回数量 = return_weight ÷ unit_weight 取整（可微调） |
| remark | varchar(255) | 备注 |

回齐判定（行级）：`Σreturn_qty ≥ send_qty`；全部明细行回齐 → 单头自动置 4 已回齐。回货数量允许超发出数量（重量折算误差），超出时界面黄色提示不拦截。

### 4.4 装配批次：`t_assembly_batch`

计划员按订单产品行手工录入装配批次，一产品可多批。**轻量跟踪、不采番**（批次行类比部件调整流水，不走 NumberGeneratorService）。已完成批次（实际完成时间已填）的数量参与成品入库闸门（§4.5）。

#### t_assembly_batch（装配批次）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int PK | |
| order_id / order_product_id | int idx | 锚点：订单 / 产品行 |
| side | varchar(16) | 边别：含卡口组合 left/right，其余 `''`（闸门按 side 分别卡量） |
| plan_date | date | 计划完成时间（计划员录入） |
| actual_date | date NULL | 实际完成时间；NULL=计划中，非空=已完成（该批数量计入可入库量） |
| qty | int | 装配数量（支） |
| status | tinyint | 状态派生值：1计划中 2已完成（按 actual_date 是否为空计算，不落库或落库均可，落库时须与 actual_date 保持一致） |
| remark | varchar(255) | 备注 |
| （审计字段） | | creator/updater/create_time/update_time |

- **索引**：`idx(order_product_id, side)`，供闸门与台账按产品行聚合。
- **闸门口径（唯一实现，入库侧复用）**：`可入库量(产品行, side) = Σqty(actual_date 非空) − Σ已入库量(该产品行该 side，按 direction 抵扣红字)`。
- 批次被入库消耗后禁删、禁下调 qty 或退回计划中致可入库量 < 已入库量（§7）。

### 4.5 成品出入库：`t_finished_doc` + `t_finished_item` + `t_finished_balance`

沿用 hb-mes 三表 + 红字冲销模式，简化状态：

#### t_finished_doc（单据头）

| 字段 | 类型 | 说明 |
|---|---|---|
| doc_no | varchar(32) UK | 单号：FGI 入库 / FGO 出库 / FGR 红字冲销 |
| biz_type | varchar(32) | 业务类型：inbound 生产入库 / opening_balance 期初 / sale_outbound 销售出库 / reversal 红字冲销 |
| direction | tinyint | 方向：1入 -1出（红字单方向与被冲原单相反） |
| doc_date | date | 单据日期 |
| work_team / machine_no | varchar | （入库单可选）班组 / 机台号——保留 hb-mes 简化报工字段，供追溯 |
| origin_doc_id | int | 红字单指向被冲原单 |
| status | tinyint | 状态：1草稿 2已确认 9已作废（仅草稿可作废） |
| remark | varchar(255) | 备注 |

#### t_finished_item（单据明细）

| 字段 | 类型 | 说明 |
|---|---|---|
| doc_id | int idx | 所属单据 |
| order_id / order_product_id | int idx | 锚点：订单 / 产品行（期初纯属性行两者为 NULL） |
| item_no / product_model / dimension_text 等 | varchar | 展示快照（货号/型号/规格/产品类型组合/节数） |
| side | varchar(16) | 边别：含卡口组合 left/right，其余 `''` |
| batch_no | varchar(64) | 批次号（可空 `''`，预留） |
| quantity | int | 数量（支），恒为正；方向由单头 direction 表达 |
| origin_item_id | int | 红字明细指向被冲原明细行 |
| remark | varchar(255) | 备注 |

#### t_finished_balance（库存余额）

| 字段 | 类型 | 说明 |
|---|---|---|
| order_id / order_product_id | int | 锚点（期初纯属性行为 NULL，改用属性列匹配） |
| item_no / product_type / rail_section / dimension_mm / surface_type / color | | 属性快照列（纯属性期初行的匹配与展示依据；product_type 存多选组合串） |
| side | varchar(16) | 边别（含卡口组合 left/right，其余 ''） |
| batch_no | varchar(64) | 批次（默认 ''） |
| quantity | int | 当前结存（支） |

- **唯一键**：`(order_product_id, side, batch_no)`，其中 order_product_id 为 NULL 的纯属性期初行以 `(item_no, product_type, rail_section, dimension_mm, surface_type, color, side, batch_no)` 逻辑唯一（应用层保证，维度空串兜底规避 MySQL 唯一键多 NULL 问题——参照 hb-mes 部件台账做法，锚点列用 0 代替 NULL 参与唯一键）。
- 出库扣减校验：结存不足拒绝确认；余额变动只经单据确认/红字冲销驱动，**禁止直接改 balance**。
- **装配入库闸门**：`biz_type='inbound'` 入库单**确认时**，按每条明细的 order_product_id + side 校验 `本次入库量 ≤ 可入库量(§4.4)`；超额则拒绝（`BadRequestException` 中文提示，含产品行、可入库量、本次量）。`biz_type='opening_balance'`（期初）与 `reversal`（红字）**豁免**该闸门——期初是存量补录、红字是对已确认单的抵扣，均无装配过程。红字冲销入库后，`Σ已入库量` 按 direction 自然回落，可入库量随之回补。

### 4.6 部件台账：`t_part_balance`（属性锚定，独立参考台账）

| 字段 | 类型 | 说明 |
|---|---|---|
| part_type | varchar(32) DEFAULT '' | 部件：外轨/中轨/内轨 |
| side | varchar(16) DEFAULT '' | 边别：left/right，非卡口 '' |
| item_no | varchar(64) DEFAULT '' | 货号（注意：与 hb-mes 用物料代码不同，按业务习惯改用货号） |
| rail_section | varchar(32) DEFAULT '' | 轨道节数 |
| product_type | varchar(128) DEFAULT '' | 产品类型多选组合串（与产品行同一规范化口径） |
| material_thickness | varchar(32) DEFAULT '' | 料厚 |
| dimension_mm | int DEFAULT 0 | 规格（mm） |
| quantity | int | 台账余量（支） |
| remark | varchar(255) | 备注 |

- **唯一键 7 维**：`(part_type, side, item_no, rail_section, product_type, material_thickness, dimension_mm)`，全部 NOT NULL DEFAULT '' / 0 兜底。
- 进出方式：期初录入累加（`INSERT ... ON DUPLICATE KEY UPDATE quantity = quantity + n`）+ 手工调整；调整走 `t_part_adjust` 流水表（字段：7 维快照 + delta 调整量 + reason 原因 + 审计），**不直接改数无痕**。
- 不与外发/成品单据联动（§2.1），V2 扩展见 §10。

### 4.7 单号登记表（NumberGeneratorService 采番，禁止自行拼接）

| 前缀 | 单据 | 格式 |
|---|---|---|
| ORD | 销售订单 | `ORD + yymmdd + '-' + 4位当日序号` |
| FGI | 成品入库单 | 同上 |
| FGO | 成品出库单（含期初 opening_balance） | 同上 |
| FGR | 成品红字冲销单 | 同上 |
| （无前缀） | 发坯单号 | 7 位定长纯数字全局序号，展示拼 `No.` |
| FILE | 文件上传 | 同 hb-mes |

事务内采番必须把事务 manager 传入 `generate()`；业务表单号列唯一索引兜底。

> **不采番的业务行**：装配批次 `t_assembly_batch`、部件调整流水 `t_part_adjust` 为轻量记账行，无单据号（主键 id 即可），不占用上表前缀。

### 4.8 期初录入（系统上线初始化，菜单常驻可复录）

1. **补录历史订单**：未完结历史订单按正常订单录入，`is_opening=1`（免附件/来源等非关键校验；豁免逻辑集中在 DTO 校验层）。
2. **成品期初（挂订单）**：选补录订单的产品行 → 生成 `biz_type='opening_balance'` 入库单（FGO 序列、direction=1）→ 确认后累加 balance。字段自动带出：订单号、生产单号、客户、产品编号（物料代码）、货号、产品类型、规格、节数；含卡口组合分左右两行录数量（2 支 = 1 套口径由 qty_pcs 承接）。
3. **成品期初（纯属性，不挂订单）**：已完结订单的剩余库存，录属性行（货号/产品类型/节数/规格/表面处理/颜色/边别）+ 数量，只进库存数、不参与任何订单欠数。
4. **部件期初**：按 7 维属性行录入累加，字段：部件、边别、货号、轨道节数、产品类型、料厚、规格、数量（支）、备注。

---

## 5. 台账与统计口径（系统核心）

### 5.1 订单跟踪台账（核心页面，按产品行一行）

实时聚合，无冗余列。口径伪 SQL：

```sql
SELECT
  p.qty_pcs                                                   AS 订单数,     -- 支
  IFNULL(fin.in_qty, 0)                                       AS 完成数,     -- Σ已确认入库(FGI+期初) − Σ对应红字
  IFNULL(fout.out_qty, 0)                                     AS 出库数,     -- Σ已确认出库(FGO) − Σ对应红字
  IFNULL(bal.qty, 0)                                          AS 库存数,     -- Σbalance（该产品行）
  p.qty_pcs - IFNULL(fin.in_qty, 0)                           AS 生产欠数,   -- 可为负 = 超产
  p.qty_pcs - IFNULL(fout.out_qty, 0)                         AS 发货欠数,   -- 可为负 = 超发
  IFNULL(asm.done_qty, 0)                                     AS 装配完成量, -- Σ已完成装配批次 qty（actual_date 非空）
  p.qty_pcs - IFNULL(asm.done_qty, 0)                         AS 装配未完成量
FROM t_order_product p
LEFT JOIN (按 order_product_id 聚合已确认入向明细，红字按 direction 自然抵扣) fin ...
LEFT JOIN (同上，出向) fout ...
LEFT JOIN (按 order_product_id 聚合 balance) bal ...
LEFT JOIN (按 order_product_id 聚合 t_assembly_batch，仅 actual_date 非空) asm ...
```

- 红字单 direction 与原单相反，聚合时按 `direction × quantity` 求和即自然抵扣，无需特判。
- 欠数为负（超产/超发）正常显示负数并高亮，不截断为 0。
- 外发进度列（可选展开）：Σsend_qty / Σreturn_qty / 未回数 = Σsend_qty − Σreturn_qty（按 order_product_id 聚合 outsource 明细与回货）。
- 装配进度列：装配完成量 / 装配未完成量（如上聚合）；最近计划完成时间、最早未完成批次计划完成时间供逾期提示。
- 台账行内可展开：该产品行的出入库流水、外发流水、装配批次明细。
- 筛选：客户、业务员、跟单员、交期区间、只看有欠数、只看逾期（delivery_date < 今天 且 发货欠数 > 0）、表面处理、是否出口、产品类型（多选组合按**包含匹配**：FIND_IN_SET 单值命中即入选）。
- 支持 Excel 导出（沿用 hb-mes export 模块模式）。

### 5.2 首页看板（销售视角）

- 汇总卡：进行中订单数、总生产欠数（支）、总发货欠数（支）、逾期订单数。
- 列表区：逾期未发货 TOP、临近交期 7 天内订单、外发超期未回齐（require_back_date 已过且未回齐）。
- 无大屏需求，普通管理页即可（不做 ECharts 大屏，需要时后续加）。

---

## 6. 接口设计（模块 → 主要接口）

统一规范沿用 hb-mes：全局前缀 `/api`；DTO + class-validator 全量校验；业务错误抛 `BadRequestException` 等（禁止 `throw new Error()`）；`TransformInterceptor` 统一包装；增删改及确认/冲销/回货登记/导入等全部 `@OperationLog`；分页 `page/pageSize` → `{ list, total, page, pageSize }`。

| 模块 | 接口（kebab-case） | 说明 |
|---|---|---|
| customer | CRUD + `POST /customer/import`、`GET /customer/import-template` | 客户资料；Excel 批量导入（整批校验、逐行错误、覆盖更新开关） |
| process-info | CRUD + `GET /process-info/by-drawing?drawingNo=` | 工艺信息；by-drawing 供订单表单按图号带入 |
| order | `POST /order`、`PUT /order/:id`、`GET /order`、`GET /order/:id`、`POST /order/:id/finish`、`POST /order/:id/reopen`、`POST /order/:id/cancel` | 三层结构一次性提交（产品行+部件行嵌套 DTO）；被引用后的修改限制见 §7 |
| order | `GET /order/ledger` | **订单跟踪台账**（§5.1 聚合，核心接口） |
| outsource | `POST /outsource`、`PUT /outsource/:id`、`POST /outsource/:id/send`、`POST /outsource/:id/close`、`POST /outsource/:id/cancel`、`GET /outsource`、`GET /outsource/:id` | send=登记实际发外日期；close=手工回齐关闭 |
| outsource | `POST /outsource/item/:itemId/return`、`DELETE /outsource/return/:id` | 回货登记/撤销（撤销需权限，留操作日志） |
| outsource | `GET /outsource/print/:id` | 发坯单打印数据（后续可加 Excel 导出） |
| assembly | `POST /assembly/batch`、`PUT /assembly/batch/:id`、`DELETE /assembly/batch/:id`、`GET /assembly?orderProductId=` | 装配批次增删改查（按产品行，一产品多批）；删/改受 §7 闸门约束 |
| assembly | `GET /assembly/inbound-quota?orderProductId=&side=` | 供成品入库表单查该产品行可入库量（§4.4 口径） |
| finished-stock | `POST /finished-stock`（建单含明细）、`POST /finished-stock/:id/confirm`、`POST /finished-stock/:id/cancel`、`POST /finished-stock/:id/reverse`、`GET /finished-stock`、`GET /finished-stock/balance` | confirm 入库时校验装配闸门（§4.5）；reverse=生成红字单并自动确认；balance=库存查询 |
| opening | `POST /opening/finished`、`POST /opening/part` | 成品期初（内部走 finished-stock 通道）/ 部件期初 |
| part-stock | `GET /part-stock`、`POST /part-stock/adjust` | 部件台账查询 / 手工调整（写 t_part_adjust 流水） |
| system | 用户/角色/菜单/字典/物料 CRUD | 照搬 hb-mes system 模块裁剪 |
| dashboard | `GET /dashboard/summary` | 首页看板汇总 |
| file / export | 上传 / Excel 导出 | 照搬 hb-mes 模式 |

**前端页面清单**：订单管理（列表/表单/详情/附件）、**订单跟踪台账**、外发管理（单据/发出/回货登记/打印发坯单）、**装配管理**（按产品行录多批装配、计划/实际完成时间、状态标签）、成品入库/出库、库存查询、部件台账、期初录入、客户资料（含导入弹窗）、工艺信息（含多图上传预览）、物料/字典等基础数据、系统管理（用户/角色/菜单）。

---

## 7. 边界与不变式

1. **已确认出入库单**只可红字冲销，禁止修改/删除；红字单本身不可再冲销。
2. **出库确认**校验结存充足（按 order_product_id + side + batch_no 定位 balance），不足拒绝。
3. **外发明细行**被回货登记引用后禁止删除；外发单已有回货禁止作废；发出数量修改需重算回齐状态。
4. **订单修改限制**：产品行被外发单或出入库单引用后，禁止直接改数量/删行；需变更走「订单变更」（V1 简化：提示先冲销/作废下游单据再改，正式变更流程列入 V2）。
5. **卡口守恒**：含卡口组合的产品部件行左右数量之和 = 产品支数；入库/出库明细按左右分行，台账聚合时左右合并计入产品行四数，库存查询可按边别下钻。
6. **回货超发出**允许（重量折算误差）但界面提示；回货撤销后回齐状态自动回退。
7. **期初补录订单**（is_opening=1）免非关键必填校验，但四数口径与正常订单完全一致。
8. **并发**：单号采番走 NumberGeneratorService 原子自增；余额增减在 `dataSource.transaction` 内行锁（`SELECT ... FOR UPDATE`）后更新，防并发超扣。
9. **纯属性期初行**不参与任何订单欠数，仅计入库存查询总量。
10. **产品类型组合串**一律经共享包函数规范化（排序+拼接）后入库，禁止两端各自拆拼；被基础数据/台账引用的组合串口径一致。
11. **客户资料**被订单引用后禁止删除（可停用）；客户导入不回写历史订单快照。
12. **工艺信息**被订单引用的是快照字段（版本号/产品名称），工艺更新不回写历史订单；图号唯一，重复创建拒绝。
13. **装配入库闸门**：成品入库（inbound）确认时按 order_product_id + side 校验 `本次入库量 ≤ 可入库量 = Σ已完成装配量 − 已入库量`；期初、红字豁免。闸门计算与入库确认在同一事务、对相关行加锁，防并发绕过。
14. **装配批次不可回退致负**：已完成批次被入库消耗后，禁止删除、下调 qty、或退回计划中致 `可入库量 < 已入库量`；违反则拒绝并提示先冲销对应入库。红字冲销入库后可入库量自然回补。
15. **装配卡口分边**：含卡口组合产品的装配批次、入库明细均带 side，闸门按 side 分别核算，左右不串量。

---

## 8. 技术架构与工程规范（照搬 hb-mes，差异处注明）

- **monorepo**：`apps/server`（NestJS + TypeORM + MySQL，`synchronize=false`）、`apps/web`（Vue3 + Element Plus + Vite）、`packages/shared`（业务状态枚举 `XXX_STATUS` / `XXX_STATUS_OPTIONS`、单位换算 `INCH_TO_MM=25`、`套→支` 系数、产品类型组合 parse/format/hasSocket、产品型号拼接函数——双端唯一事实源，双格式产物）。
- **数据库**：新库 `haibao_oms`；迁移规范同 hb-mes（`scripts/sql/01-schema.sql` 全量 + `migration-*.sql` 幂等增量 + db-migrate.ts 唯一清单）。
- **权限**：permission-manifest.ts SSOT，启动自动 upsert；菜单驱动动态路由。
- **前端**：`AppTable / AppPagination / AppActions` 等通用组件、`useDict / useClientPager` composable 从 hb-mes 拷贝起步；台账页为首页级入口。
- **不搬的部分**：plan（排产）、production-report（报工）、subcontract（被新 outsource 取代）、approval-config（审批开关）、大屏 screen、part-stock 的占用/释放逻辑（occupied_qty 不要）。
- **部署**：同 hb-mes 阿里云 ECS（PM2 + Nginx + MySQL），新增独立 Nginx location 与 PM2 进程 `hb-oms-server`（端口避让 8000/3000，建议 8100）；前端本地构建只传 dist；**严禁影响既有 hb-mes 与 QMS 的 location**。

---

## 9. 实施里程碑

| 里程碑 | 内容 | 验收要点 |
|---|---|---|
| M1 骨架 | monorepo 初始化、登录/权限/菜单、基础数据（客户资料含批量导入、工艺信息、物料、字典）、共享包 | 登录进系统，基础数据 CRUD 可用；客户 Excel 导入整批校验生效；工艺信息多图上传可用 |
| M2 订单 | 订单三层 CRUD、附件上传、部件行自动展开、图号匹配自动带入工艺、状态机 | 建单→图号带入→展开部件→作废/完结全流程；含卡口组合左右展开正确 |
| M3 外发 | 发坯单单头+明细、发出/回货登记、状态自动推进、打印 | 分批回货、回齐自动判定、超回提示 |
| M3.5 装配 | 装配批次 CRUD（一产品多批、计划/实际完成时间+数量）、装配管理页、可入库量接口 | 多批装配、状态派生正确、可入库量口径准 |
| M4 出入库+台账 | 出入库单、确认/红字冲销、**装配入库闸门**、balance、**订单跟踪台账**（含装配进度列） | 四数与手工核算一致；装配未完成入库被拒、部分装配部分入库、超量入库被拒、红字后可入库量+台账自然回退 |
| M5 期初+看板 | 补录订单、成品/部件期初、首页看板、Excel 导出 | 期初后台账首日即可用；导出口径与页面一致 |

每个里程碑完成后跑对应 verify 脚本（参照 hb-mes `verify:*` 模式，M4 必须有台账口径核算脚本）。

---

## 10. 后续扩展（V1 明确不做，接口与表结构不预埋、需求成熟后独立设计）

1. **外购零配件台账**（钢珠/拨叉等通用件）：期初 + 采购入库 + 领用出库，或按 BOM 随成品入库联动扣减。
2. **部件台账与单据联动**：外发发出扣部件、回货加部件（表面处理后口径）、成品入库扣部件。
3. **订单正式变更流程**：被下游引用后的数量变更单据化。
4. **对账/发货单打印**、客户端口径的对账单导出。
5. **FQC 质检**：外发回货验收目前仅备注承载，需求成熟后单独建模。
