<template>
  <div class="page">
    <el-card shadow="never" v-loading="pageLoading">
      <div class="form-header">
        <div class="form-title">
          <el-button size="small" :icon="Back" @click="goBack">返回列表</el-button>
          <span class="title-text">{{ editId ? '编辑订单' : '新增订单' }}</span>
          <span v-if="orderNo" class="title-sub">{{ orderNo }}</span>
          <span v-else-if="copyHint" class="title-sub title-sub--copy">{{ copyHint }}</span>
        </div>
        <div>
          <el-button size="small" @click="goBack">取消</el-button>
          <el-button size="small" type="primary" :loading="saving" :disabled="guardBlocked" @click="onSave">保存</el-button>
        </div>
      </div>

      <!-- 无修改权（不是创建人、也不在订单修改主管角色里）：只读 -->
      <el-alert
        v-if="editGuard && !editGuard.canEdit"
        type="error"
        :closable="false"
        show-icon
        class="ref-alert"
        :title="`只有${editGuard.editors}可以修改这张订单，您当前只能查看`"
      />
      <!-- 被下游引用的订单：可更正信息、不能动结构 -->
      <el-alert
        v-else-if="editGuard?.referenced"
        type="warning"
        :closable="false"
        show-icon
        class="ref-alert"
        :title="`本订单已被 ${refText(editGuard.refCounts)} 引用`"
      >
        可以更正录错的订单信息，保存后自动同步到这些下游记录（入库单、送货单重新打印即为新值）。
        已被引用的产品行不能删除，轨道节数、卡口、分体出货不能修改；有外发回厂记录的部件组不能删除或改组类型。
      </el-alert>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" size="small" class="order-form">
        <div class="section-title">订单信息</div>
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="客户名称" prop="customerName">
              <el-select
                v-model="customerPick"
                filterable
                clearable
                allow-create
                default-first-option
                :filter-method="filterCustomers"
                placeholder="选择或输入客户；可按名称/代码搜索"
                popper-class="customer-2col-popper"
                style="width: 100%"
                @change="onCustomerPick"
                @visible-change="(v: boolean) => v && resetCustomerFilter()"
              >
                <el-option v-for="c in customerOptions" :key="c.id" :value="c.id" :label="c.customerName">
                  <span class="opt-name">{{ c.customerName }}</span>
                  <span class="opt-code">{{ c.customerCode }}</span>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="PO#" prop="poNo">
              <el-input v-model="form.poNo" placeholder="客户订单文件上的订单编号，没有可留空" :spellcheck="false" :formatter="upperFmt" :parser="upperFmt" />
            </el-form-item>
          </el-col>
          <!-- 生产单号与 PO# 一对一，都是订单级；不再挂在产品行上 -->
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="生产单号" prop="productionNo">
              <el-input v-model="form.productionNo" placeholder="如 GLI46212-A" :spellcheck="false" :formatter="upperFmt" :parser="upperFmt" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="下单日期" prop="orderDate">
              <el-date-picker
                v-model="form.orderDate"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="请选择客户下单日"
                :disabled-date="disableFutureOrderDate"
                style="width: 100%"
                @change="onOrderDateChange"
              />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="业务员">
              <el-select
                v-model="form.salesman"
                clearable
                filterable
                allow-create
                default-first-option
                placeholder="选择或直接输入"
                style="width: 100%"
              >
                <el-option v-for="n in ORDER_SALESMAN_OPTIONS" :key="n" :label="n" :value="n" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="跟单员">
              <el-select
                v-model="form.merchandiser"
                clearable
                filterable
                allow-create
                default-first-option
                placeholder="选择或直接输入"
                style="width: 100%"
              >
                <el-option v-for="n in ORDER_MERCHANDISER_OPTIONS" :key="n" :label="n" :value="n" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="订单来源">
              <el-select v-model="form.orderSource" clearable placeholder="选择来源" style="width: 100%">
                <el-option v-for="o in ORDER_SOURCE" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="期初补录">
              <el-switch v-model="isOpeningOrder" :active-value="1" :inactive-value="0" />
              <el-tooltip
                content="1. 打开：用于补录未完结的历史订单（新系统正式启用时）；补录后再到「期初录入」按部件组录入已完成入库数量。2. 保持关闭：正常新订单"
                placement="top"
              >
                <el-icon class="tip-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="备注">
              <el-input v-model="form.remark" placeholder="一句话摘要，列表可见" />
            </el-form-item>
          </el-col>
          <el-col :xs="24">
            <el-form-item label="订单附件">
              <el-upload
                :show-file-list="false"
                :auto-upload="false"
                multiple
                :on-change="onAttachmentPick"
              >
                <el-button size="small" :icon="Upload" :loading="uploading">上传附件</el-button>
              </el-upload>
              <div v-if="attachments.length" class="attach-list">
                <el-tag
                  v-for="(a, i) in attachments"
                  :key="a"
                  closable
                  size="small"
                  @close="attachments.splice(i, 1)"
                  @click="openAttachment(a)"
                >{{ attachmentName(a) }}</el-tag>
              </div>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 订单备注（图文混排）：承载客户来函要求、包装示意图等
             需要配图说明的内容；上面的「备注」是列表可见的一句话摘要 -->
        <div class="req-block">
          <div class="req-label">
            <span class="req-label__text">订单备注</span>
            <el-button
              link
              size="small"
              type="info"
              :icon="reqCollapsed ? ArrowDown : ArrowUp"
              @click="reqCollapsed = !reqCollapsed"
            >{{ reqCollapsed ? '展开' : '收起' }}</el-button>
          </div>
          <div v-show="!reqCollapsed">
            <rich-editor ref="richEditorRef" v-model="form.otherReq" />
          </div>
        </div>

        <div class="section-title">
          产品明细
          <el-button size="small" type="primary" plain :icon="Plus" class="ml12" @click="addProduct">添加产品行</el-button>
        </div>

        <el-card v-for="(p, pi) in form.products" :key="p._key" shadow="never" class="product-card">
          <template #header>
            <div class="pc-header">
              <span class="pc-title">
                产品 {{ pi + 1 }}<template v-if="p.itemNo">：{{ productTitle(p) }}</template>
                <el-tooltip v-if="productLocked(p)" placement="top" :content="`已被 ${refText(p._refs)} 引用：不能删除，轨道节数、卡口、分体出货不能修改`">
                  <el-tag size="small" type="warning" disable-transitions class="pc-ref-tag">已被引用</el-tag>
                </el-tooltip>
              </span>
              <span class="pc-meta">支数口径：<b>{{ pcsOf(p) }}</b> 支</span>
              <div>
                <el-button size="small" link type="primary" :icon="CopyDocument" @click="copyProduct(pi)">复制</el-button>
                <el-button size="small" link type="danger" :icon="Delete" :disabled="form.products.length <= 1 || productLocked(p)" @click="removeProduct(pi)">删除</el-button>
              </div>
            </div>
          </template>

          <!-- 首行：订单属性（是否新单 / 是否出口 / 出口国家 / 分体出货）。
               单独一个 el-row，出口国家随开关显隐时不会把下面的业务字段挤得错位 -->
          <el-row :gutter="12">
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="是否新单" label-width="80px">
                <el-switch v-model="p.isNewOrder" :active-value="1" :inactive-value="0" />
              </el-form-item>
            </el-col>
            <!-- 出口国家与开关同组、不带自己的标签：它只是「是否出口」的补充项。
                 固定显示（未出口时禁用而非隐藏），免得勾选开关时把后面的字段挤动 -->
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="是否出口" label-width="80px">
                <div class="export-line">
                  <!-- 勾上出口就开始预热国旗图，等用户点开下拉时大旗已在缓存里 -->
                  <el-switch
                    v-model="p.isExport" :active-value="1" :inactive-value="0"
                    @change="preloadCountryFlags()"
                  />
                  <!-- 用虚拟滚动版（el-select-v2）：国家有 250 个，普通 el-select 首次
                       展开要一次性渲染 250 个选项、连带请求 250 个国旗 SVG，明显卡顿；
                       虚拟滚动只渲染可视区的十来项，展开即开 -->
                  <el-select-v2
                    v-model="p.exportCountry"
                    :options="COUNTRY_OPTIONS"
                    :props="COUNTRY_FIELD_PROPS"
                    :disabled="!p.isExport"
                    filterable
                    clearable
                    placeholder="出口国家"
                    popper-class="country-popper"
                    class="export-country"
                    @visible-change="preloadCountryFlags()"
                  >
                    <template #default="{ item }">
                      <div class="country-option">
                        <span class="country-left">
                          <span :class="['fi', 'fi-' + item.code.toLowerCase()]" /><span class="country-zh">{{ item.name }}</span>
                        </span>
                        <span class="country-en">{{ item.englishName }}</span>
                      </div>
                    </template>
                  </el-select-v2>
                </div>
              </el-form-item>
            </el-col>
            <!-- 分体出货：客户把一支滑轨拆开下单（如三节轨拆「外中轨」+「内轨」两行）、
                 分开包装出货、不组装成整品。勾选后下方部件组就是出货构成的事实源：
                 留哪几组这行就出什么货，形态与型号后缀由组构成推导（不落第二个字段） -->
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="分体出货" label-width="80px">
                <!-- 仅三节轨可开；已开着的异常数据不锁死（否则用户关不掉），见 :disabled 条件 -->
                <el-switch
                  v-model="p.isSplit" :active-value="1" :inactive-value="0"
                  :disabled="(!canSplitShipping(p.railSection) && !p.isSplit) || productLocked(p)"
                />
                <el-tooltip
                  placement="top"
                  :content="canSplitShipping(p.railSection)
                    ? '客户把一支滑轨拆开下单（如三节轨拆成「外中轨」和「内轨」两行）、分开包装出货、不组装成整品时开启。开启后，下方部件组留哪几组，这一行就出什么货；只出单个部件（如内轨）的行没有装配环节，入库不受装配数量限制。'
                    : '只有三节轨可以分体出货（二节轨只有外轨和内轨两个部件，业务上不拆单下单）。'"
                >
                  <el-icon class="split-tip"><QuestionFilled /></el-icon>
                </el-tooltip>
                <span v-if="!canSplitShipping(p.railSection)" class="split-na">仅三节轨</span>
                <!-- disable-transitions：v-if 在切换时翻转，el-tag 的 zoom 过渡可能走不完留下残影 -->
                <el-tag
                  v-if="p.isSplit"
                  size="small"
                  :type="splitCoversAll(p) ? 'danger' : 'warning'"
                  disable-transitions
                  class="split-form-tag"
                >{{ splitCoversAll(p) ? '组已覆盖全部部件＝整品' : `出货形态：${splitFormText(p)}` }}</el-tag>
              </el-form-item>
            </el-col>
            <!-- 订单类型只有两个互斥取值，用单选比下拉少一次点开 -->
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="订单类型" label-width="80px">
                <el-radio-group v-model="p.orderType">
                  <el-radio v-for="o in ORDER_TYPE" :key="o.value" :value="o.value">{{ o.label }}</el-radio>
                </el-radio-group>
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="12">
            <el-col :xs="24" :sm="12" :md="6">
              <!-- 只能填宽度或代码式内容：输入不合规时下方即时标红（保存时 onSave 再拦一次，服务端 DTO 兜底） -->
              <el-form-item
                label="产品代码"
                label-width="80px"
                :error="isValidItemCode(p.itemNo) ? '' : '只能填宽度或代码，说明文字请填到产品名称'"
              >
                <!-- 打字时逐字清掉中文（onItemNoInput），失焦再收拾「-」空格并给纯宽度补「#」 -->
                <el-input
                  :model-value="p.itemNo"
                  placeholder="输入产品代码"
                  @update:model-value="(v: string) => onItemNoInput(p, v)"
                  @change="p.itemNo = withWidthHash(sanitizeItemCode(p.itemNo))"
                />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="产品名称" label-width="80px">
                <!-- 新增订单时失焦自动补「滑轨」后缀（已含「轨」字不补，规则见共享包 rail-name.ts）；编辑存量订单不改原写法 -->
                <el-input v-model="p.productName" @change="if (!editId) p.productName = nameWithRail(p);" />
              </el-form-item>
            </el-col>
            <!-- 客户图号：客户来图上的图号；与部件组的「生产图号」（内部转化的技术图纸）是两回事。
                 可在「系统配置 → 业务字段」全局停用；停用时只是不显示输入框，
                 p.customerDrawingNo 仍随表单原样回传，不洗掉历史值 -->
            <el-col v-if="customerDrawingNoEnabled" :xs="24" :sm="12" :md="6">
              <el-form-item label="客户图号" label-width="80px">
                <el-input
                  v-model="p.customerDrawingNo" placeholder="客户来图图号"
                  :spellcheck="false" :formatter="upperFmt" :parser="upperFmt"
                />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="产品类型" label-width="80px">
                <!-- 被引用的产品行不能增减「卡口」：它决定装配与出入库按左右分边记账 -->
                <el-select v-model="p._types" multiple placeholder="可多选（如 普通+自锁）" style="width: 100%">
                  <el-option
                    v-for="o in productTypeDict" :key="o.value" :label="o.label" :value="o.value"
                    :disabled="o.value === 'socket' && productLocked(p)"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="轨道节数" label-width="80px">
                <!-- 改节数要同步部件组：二节轨无中轨，留着中轨组保存必被服务端拒 -->
                <el-select v-model="p.railSection" style="width: 100%" :disabled="productLocked(p)" @change="onRailSectionChange(p)">
                  <el-option v-for="o in RAIL_SECTION_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
            </el-col>
            <!-- 产品要求描述：客户对该产品的特殊要求（如测试标准/包装要求）。
                 可在「系统配置 → 业务字段」全局停用；停用时只是不显示输入框，
                 p.productRequirement 仍随表单原样回传，不洗掉历史值 -->
            <el-col v-if="productRequirementEnabled" :xs="24" :sm="12" :md="6">
              <el-form-item label="产品要求描述" label-width="98px">
                <el-input v-model="p.productRequirement" maxlength="255" placeholder="客户对该产品的特殊要求（选填）" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="规格" label-width="80px">
                <el-input v-model="p.dimensionRaw" placeholder="数值" @change="syncDimension(p)">
                  <template #append>
                    <el-select v-model="p.dimensionUnit" style="width: 76px" @change="syncDimension(p)">
                      <el-option v-for="o in DIMENSION_UNIT_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
                    </el-select>
                  </template>
                </el-input>
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="表面处理" label-width="80px">
                <!-- 改成需外发时，组合型组（外中轨/整品）要按部件拆开，否则外发回厂记不清 -->
                <el-select v-model="p.surfaceType" style="width: 100%" @change="maybeSplitCombinedGroups(p)">
                  <!-- 已有外发回厂记录的产品不能改回「无」，否则台账外发欠数失去口径 -->
                  <el-option
                    v-for="o in surfaceDict" :key="o.value" :label="o.label" :value="o.value"
                    :disabled="o.value === 'none' && !!p._refs?.outsource"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <!-- 颜色字段可在「系统配置 → 业务字段」全局停用；
                 停用时只是不显示输入框，p.color 仍随表单原样回传，不洗掉历史值 -->
            <el-col v-if="colorEnabled" :xs="24" :sm="12" :md="6">
              <el-form-item label="颜色" label-width="80px">
                <el-input v-model="p.color" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="数量" label-width="80px">
                <el-input-number v-model="p.orderQty" :min="1" :controls="false" style="width: calc(100% - 80px)" />
                <el-select v-model="p.unit" style="width: 76px; margin-left: 4px">
                  <el-option v-for="o in UNIT_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="材质" label-width="80px">
                <el-input v-model="p.sheetMaterial" placeholder="如 Q235" :formatter="upperFmt" :parser="upperFmt" />
              </el-form-item>
            </el-col>
            <!-- 装配车间已移除：订单环节不安排车间，车间在「装配管理」新建批次时录入 -->
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item
                label="订单交期"
                :prop="`products.${pi}.deliveryDate`"
                :rules="deliveryDateRules(pi)"
                label-width="80px"
              >
                <el-date-picker
                  v-model="p.deliveryDate"
                  type="date"
                  value-format="YYYY-MM-DD"
                  placeholder="请选择预计交货日"
                  :disabled-date="disableDeliveryBeforeOrderDate"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="交货地址" label-width="80px">
                <el-input v-model="p.deliveryAddress" />
              </el-form-item>
            </el-col>
          </el-row>

          <!-- 部件组（跟踪/台账锚点） -->
          <div class="group-title">
            部件组（跟踪粒度；默认按节数逐部件铺开：三节轨 外/中/内轨，二节轨 外/内轨）
            <span v-if="p.isSplit" class="split-hint">分体出货：留下的组就是这行实际出货的部件，请删掉不需要的部件行</span>
            <el-button
              size="small" link type="primary" :icon="Plus"
              :disabled="!canAddGroup(p)" @click="addGroup(p)"
            >添加部件组</el-button>
            <!-- 部件组已按节数一次性铺开，几组之间通常只有组类型不同（同一张生产图、
                 同版本、同支数），故提供"以第一行为模板灌满其余行" -->
            <el-button
              size="small" link type="primary" :icon="CopyDocument"
              :disabled="!canFillFromFirst(p)"
              title="把第一行的图号/版本/料厚/支数/备注填到其余各组，组类型不变"
              @click="fillFromFirst(p)"
            >按第一行填充</el-button>
          </div>
          <table class="group-grid">
            <thead>
              <tr>
                <th class="gg-type">组类型</th>
                <th>生产图号</th>
                <th class="gg-ver">版本号</th>
                <th class="gg-thick">料厚</th>
                <th class="gg-qty">组支数</th>
                <th>展开部件（自动）</th>
                <th class="gg-op"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(g, gi) in p.partGroups" :key="g._key">
                <td>
                  <!-- 需外发时选了组合型组会被自动拆成单部件组（见 maybeSplitCombinedGroups） -->
                  <el-select
                    v-model="g.groupType" style="width: 100%" :disabled="groupLocked(g)"
                    :title="groupLocked(g) ? `已有 ${g._refs} 条外发回厂记录，不能改组类型` : undefined"
                    @change="maybeSplitCombinedGroups(p)"
                  >
                    <el-option
                      v-for="o in PART_GROUP_OPTIONS"
                      :key="o.value"
                      :label="o.label"
                      :value="o.value"
                      :disabled="p.partGroups.some((x) => x !== g && x.groupType === o.value) || groupTypeUnavailable(p, o.value)"
                    />
                  </el-select>
                </td>
                <td>
                  <el-input v-model="g.drawingNo" placeholder="输入后自动带出工艺" :spellcheck="false" :formatter="upperFmt" :parser="upperFmt" @change="onDrawingChange(p, g)" />
                </td>
                <td><el-input v-model="g.drawingVersion" placeholder="如 1.1" @change="g.drawingVersion = normalizeVersion(g.drawingVersion) ?? ''" /></td>
                <td><el-input v-model="g.materialThickness" :placeholder="thicknessPlaceholder(g.groupType)" /></td>
                <td><el-input-number v-model="g.qtyPcs" :min="1" :controls="false" :placeholder="String(pcsOf(p))" style="width: 100%" /></td>
                <td class="gg-parts">{{ partsPreview(p, g) }}</td>
                <td>
                  <el-button size="small" link type="danger" :icon="Delete" :disabled="p.partGroups.length <= 1 || groupLocked(g)" @click="p.partGroups.splice(gi, 1)" />
                </td>
              </tr>
            </tbody>
          </table>
        </el-card>

        <!-- 编辑态才有审计信息（新建时还没落库） -->
        <audit-info v-if="editId" :row="auditRow" />

        <div class="form-footer">
          <el-button size="small" @click="goBack">取消</el-button>
          <el-button size="small" type="primary" :loading="saving" :disabled="guardBlocked" @click="onSave">保存</el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type UploadFile } from 'element-plus';
import { Back, Plus, Delete, Upload, CopyDocument, QuestionFilled, ArrowDown, ArrowUp } from '@element-plus/icons-vue';
import {
  createOrder,
  getOrderDetail,
  getOrderList,
  updateOrder,
  type OrderEditGuard,
  type OrderPayload,
  type OrderProductPayload,
  type OrderRefCounts,
} from '@/api/order';
import { getAllCustomers, type CustomerItem } from '@/api/customer';
import { getProcessInfoByDrawing } from '@/api/process-info';
import { uploadFile } from '@/api/file';
import RichEditor from '@/components/RichEditor.vue';
import {
  ORDER_SOURCE,
  ORDER_TYPE,
  RAIL_SECTION_OPTIONS,
  PART_GROUP_OPTIONS,
  UNIT_OPTIONS,
  DIMENSION_UNIT_OPTIONS,
  expandPartRows,
  partGroupParts,
  partGroupLabel,
  defaultGroupTypes,
  formatProductModel,
  needsOutsource,
  canSplitShipping,
  isGroupTypeAvailable,
  splitCombinedGroup,
  splitParts,
  splitSuffix,
  hasSocket,
  normalizeVersion,
  ITEM_CODE_MESSAGE,
  isValidItemCode,
  sanitizeItemCode,
  stripItemCodeInput,
  ITEM_CODE_STRIP_MESSAGE,
  withRailSuffix,
  railNameSuffixOf,
  parseProductTypes,
  partTypeLabel,
  sideLabel,
  toMm,
  toPieces,
  COUNTRY_OPTIONS,
  ORDER_SALESMAN_OPTIONS,
  ORDER_MERCHANDISER_OPTIONS,
} from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import { preloadCountryFlags, preloadCountryFlagsWhenIdle } from '@/utils/flag-preload';
import { formatBusinessDate } from '@/utils/date';

/** 业务字段全局开关（系统配置 → 业务字段） */
const { colorEnabled, customerDrawingNoEnabled, productRequirementEnabled, inchToMm } =
  useFeatureFlags();

/** 出口国家下拉（el-select-v2）的字段映射：落库值与展示值都用中文国名 */
const COUNTRY_FIELD_PROPS = { label: 'name', value: 'name' };

/* 输入自动大写：PO#/生产单号/材质/生产图号统一调用 */
const upperFmt = (v: string) => (v ?? '').toUpperCase();

/**
 * 产品代码只填了 2~3 位纯数字（35 / 45 / 100）时自动补「#」——这类值是滑轨宽度，
 * 厂里的写法是「45#」，漏打 # 会让同一种宽度出现「45」「45#」两种写法（2026-09-25 使用方要求）。
 * 其它写法一律不动：「45#无锁力」、客户料号「DS3832A-22Z-DM」、纯数字料号「785140753」、单个数字等。
 * 输入框失焦时补一次，保存 payload 再兜一次（没失焦直接点保存的情况）。
 */
/**
 * 新增订单时产品名称补「滑轨」：整品补「滑轨」，**分体行补它的出货形态**（外中轨/内轨），
 * 否则分体两行名字一模一样（规则见共享包 rail-name.ts，与入库单/送货单同一实现）。
 */
function nameWithRail(p: ProductRow): string {
  return withRailSuffix(
    p.productName,
    railNameSuffixOf(p.isSplit, p.partGroups.map((g) => g.groupType), p.railSection),
  );
}

/**
 * 产品代码不许有中文（2026-09-25 使用方要求）：打字时当场清掉、并提示说明文字该去产品名称。
 * el-input 在输入法组字期间不回写 v-model，所以这里拿到的已是上屏后的字，不会打断拼音输入。
 * 提示节流 3 秒：粘贴一长串中文会连续触发，每次都弹一条会刷屏。
 */
let lastStripTip = 0;
function onItemNoInput(p: ProductRow, v: string) {
  const clean = stripItemCodeInput(v);
  p.itemNo = clean;
  if (clean !== (v ?? '').replace(/＃/g, '#') && Date.now() - lastStripTip > 3000) {
    lastStripTip = Date.now();
    ElMessage.warning({ message: ITEM_CODE_STRIP_MESSAGE, duration: 4000 });
  }
}

function withWidthHash(v: string | null | undefined): string {
  // 中文输入法下常打成全角「＃」，产品代码规则只认半角，顺手换掉（否则会被当成非代码内容拦下）
  const raw = (v ?? '').replace(/＃/g, '#');
  const t = raw.trim();
  return /^\d{2,3}$/.test(t) ? `${t}#` : raw;
}

const route = useRoute();
const router = useRouter();
const editId = ref<number | null>(route.query.id ? Number(route.query.id) : null);
/**
 * 复制来源订单 id（列表「复制」进入）：按详情回显业务内容做模板，走新建保存、单号重新采番。
 * 不继承：PO#（新客户订单文件必然是新号）、下单日期（重置今天）、交期（新单交期几乎必然
 * 不同，沿用漏改比重填代价高）、附件（多为旧单的客户来单文件）、期初标记、审计信息。
 * 生产单号预填后缀递推的建议值（见 suggestNextProductionNo），完全可改可清空。
 */
const copyFromId = ref<number | null>(route.query.copyFrom ? Number(route.query.copyFrom) : null);
/** 复制模式的标题区提示（在 init 里按是否预填了生产单号组装） */
const copyHint = ref('');

/**
 * 复制模式的生产单号建议值：同 PO 追加的车间惯例是字母后缀递推（GLI46212-A → GLI46212-B）。
 * 只认「-大写字母串」结尾并按 26 进制递增（-Z → -AA）；无字母后缀视原单为第一批，直接补「-B」。
 * 刻意不处理数字结尾——「GLI-46212」这类尾段是单号本体，不是批次后缀，递增会造出假号。
 * 只是建议值，业务员可改可清空。
 */
function suggestNextProductionNo(no: string): string {
  if (!no) return '';
  const m = no.match(/^(.*)-([A-Z]+)$/);
  if (!m) return `${no}-B`;
  const chars = m[2].split('');
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] !== 'Z') {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
      break;
    }
    chars[i] = 'A';
    i--;
  }
  if (i < 0) chars.unshift('A');
  return `${m[1]}-${chars.join('')}`;
}
/** 审计追溯原始行（编辑态由详情接口带回，走全局 AuditInfo 展示） */
const auditRow = ref<any>(null);

/**
 * 编辑守卫（详情接口带回）：订单只许创建人与订单修改主管角色修改（管理员与超级管理员均不例外）；
 * 被外发/装配/出入库引用后还只能「更正」——信息可改、结构不能动。
 * 这里只做界面引导，服务端 update 另有同样的硬校验。
 */
const editGuard = ref<OrderEditGuard | null>(null);
/** 被引用且当前用户无更正权限：保存按钮禁用 */
const guardBlocked = computed(() => !!editGuard.value && !editGuard.value.canEdit);
function refText(c: OrderRefCounts | null | undefined): string {
  if (!c) return '';
  return [
    c.outsource ? `${c.outsource} 条外发回厂记录` : '',
    c.assembly ? `${c.assembly} 条装配批次` : '',
    c.finished ? `${c.finished} 条成品出入库明细` : '',
  ].filter(Boolean).join('、');
}
/** 该产品行已被下游引用：不能删行，卡口/节数/分体不能改 */
function productLocked(p: ProductRow): boolean {
  return !!p._refs && p._refs.outsource + p._refs.assembly + p._refs.finished > 0;
}
/** 该部件组已有外发回厂记录：不能删、不能改组类型 */
function groupLocked(g: GroupRow): boolean {
  return g._refs > 0;
}
const orderNo = ref('');

const pageLoading = ref(false);
const saving = ref(false);
const uploading = ref(false);
const formRef = ref<FormInstance>();

let keySeq = 0;
const nextKey = () => ++keySeq;

interface GroupRow {
  _key: number;
  /** 既有部件组 ID（编辑回显带出、保存时回传，服务端按它原地更新）；新增组为空 */
  id?: number;
  /** 外发回厂记录条数：> 0 时不能删、不能改组类型 */
  _refs: number;
  groupType: string;
  drawingNo: string;
  drawingVersion: string;
  materialThickness: string;
  qtyPcs: number | undefined;
  remark: string;
}
/** 被引用产品行的原值：保存前比对，改了数量/规格/表面处理要让用户确认一次 */
interface ProductOrig {
  orderQty: number;
  unit: string;
  dimensionMm: number | null;
  surfaceType: string;
}
interface ProductRow {
  _key: number;
  /** 既有产品行 ID（编辑回显带出、保存时回传，服务端按它原地更新）；新增行为空 */
  id?: number;
  /** 该行的下游引用条数（编辑回显带出）；有引用即锁结构字段 */
  _refs: OrderRefCounts | null;
  _orig: ProductOrig | null;
  _types: string[];
  orderType: number;
  isNewOrder: number;
  isExport: number;
  exportCountry: string;
  materialCode: string;
  itemNo: string;
  /** 客户图号（客户来图图号，区别于部件组的生产图号） */
  customerDrawingNo: string;
  productName: string;
  railSection: string;
  /** 产品要求描述（客户对该产品的特殊要求；随业务字段开关显隐） */
  productRequirement: string;
  /** 分体出货：0整品 1分体（形态由部件组构成推导，见模板注释） */
  isSplit: number;
  dimensionRaw: string;
  dimensionUnit: string;
  dimensionMm: number | null;
  surfaceType: string;
  color: string;
  sheetMaterial: string;
  orderQty: number;
  unit: string;
  deliveryDate: string;
  deliveryAddress: string;
  remark: string;
  partGroups: GroupRow[];
}

const emptyGroup = (groupType = 'outer'): GroupRow => ({
  _key: nextKey(),
  _refs: 0,
  groupType,
  drawingNo: '',
  drawingVersion: '',
  materialThickness: '',
  qtyPcs: undefined,
  remark: '',
});
/** 按节数铺开默认部件组（三节轨 外/中/内、二节轨 外/内），与服务端兜底共用共享包口径 */
const defaultGroups = (railSection: string): GroupRow[] =>
  defaultGroupTypes(railSection).map((t) => emptyGroup(t));
const emptyProduct = (): ProductRow => ({
  _key: nextKey(),
  _refs: null,
  _orig: null,
  _types: ['standard'],
  orderType: 1,
  isNewOrder: 0,
  isExport: 0,
  exportCountry: '',
  materialCode: '',
  itemNo: '',
  customerDrawingNo: '',
  productName: '',
  railSection: 'three_section',
  productRequirement: '',
  isSplit: 0,
  dimensionRaw: '',
  dimensionUnit: 'mm',
  dimensionMm: null,
  surfaceType: 'none',
  color: '',
  sheetMaterial: '',
  orderQty: 1,
  unit: 'piece',
  deliveryDate: '',
  deliveryAddress: '',
  remark: '',
  partGroups: defaultGroups('three_section'),
});

/** 中国标准时间的业务当天，避免 toISOString() 在凌晨取到前一天。 */
const businessToday = () => formatBusinessDate(new Date());

const form = reactive({
  poNo: '',
  /** 生产单号：订单级，与 PO# 一对一 */
  productionNo: '',
  customerId: undefined as number | undefined,
  customerName: '',
  orderDate: businessToday(),
  salesman: '',
  merchandiser: '',
  orderSource: '',
  /** 期初补录标记：0正常 1期初补录（免非关键必填校验，四数口径不变，§4.8） */
  isOpening: 0,
  remark: '',
  /** 订单备注（图文混排 HTML，wangEditor 输出） */
  otherReq: '',
  products: [emptyProduct()] as ProductRow[],
});

/** 订单备注版块折叠态：默认折叠；编辑时有正文才展开 */
const reqCollapsed = ref(true);
const richEditorRef = ref<InstanceType<typeof RichEditor>>();
/** el-switch 需要独立的读写代理，直接绑 form.isOpening 在 reactive 上也可，此处保持显式 */
const isOpeningOrder = computed({
  get: () => form.isOpening,
  set: (v: number) => {
    form.isOpening = v;
  },
});
/*
 * 生产单号 2026-08-14 起必填：车间与台账认的「订单编号」，为空时下游单据
 * （送货单、台账、总计划导出）那一栏就是空白。⚠️ 编辑存量订单时若为空，会被要求补填——有意的。
 * 服务端 CreateOrderDto 另有同样的硬校验（API 直调同样拒绝）。
 * PO# 2026-09-25 起**选填**：口头订单、手写订单没有 PO 号，硬性必填只会逼人乱填一个。
 */
function validateOrderDate(
  _rule: unknown,
  value: string,
  callback: (error?: Error) => void,
) {
  if (value && value > businessToday()) {
    callback(new Error('下单日期不能晚于今天'));
    return;
  }
  callback();
}

function deliveryDateRules(pi: number) {
  return [
    { required: true, message: `请选择产品 ${pi + 1} 的订单交期`, trigger: 'change' },
    {
      validator: (
        _rule: unknown,
        value: string,
        callback: (error?: Error) => void,
      ) => {
        if (value && form.orderDate && value < form.orderDate) {
          callback(new Error('订单交期不能早于下单日期'));
          return;
        }
        callback();
      },
      trigger: 'change',
    },
  ];
}

function disableFutureOrderDate(date: Date): boolean {
  return formatBusinessDate(date) > businessToday();
}

function disableDeliveryBeforeOrderDate(date: Date): boolean {
  return !!form.orderDate && formatBusinessDate(date) < form.orderDate;
}

function onOrderDateChange() {
  form.products.forEach((_product, pi) => {
    const validation = formRef.value?.validateField(`products.${pi}.deliveryDate`);
    if (validation) void validation.catch(() => undefined);
  });
}

const rules = {
  customerName: [{ required: true, message: '请选择或输入客户', trigger: 'change' }],
  orderDate: [
    { required: true, message: '请选择下单日期', trigger: 'change' },
    { validator: validateOrderDate, trigger: 'change' },
  ],
  productionNo: [{ required: true, message: '请输入生产单号', trigger: 'blur' }],
};
const attachments = ref<string[]>([]);

/* ===== 字典 ===== */
// assembly_workshop 字典不再在订单表单加载——订单环节已不安排装配车间
const surfaceDict = ref<Array<{ label: string; value: string }>>([]);
const productTypeDict = ref<Array<{ label: string; value: string }>>([]);
Promise.all([loadDict('surface_type'), loadDict('product_type')]).then(([sf, pt]) => {
  surfaceDict.value = sf.map((r: any) => ({ label: r.dictLabel, value: r.dictValue }));
  productTypeDict.value = pt.map((r: any) => ({ label: r.dictLabel, value: r.dictValue }));
});

/* ===== 客户下拉（双列：名称+代码；带出默认业务员/跟单员/地址） ===== */
const customers = ref<CustomerItem[]>([]);
const customerOptions = ref<CustomerItem[]>([]);
const customerPick = ref<number | string>('');
function resetCustomerFilter() {
  customerOptions.value = customers.value;
}
function filterCustomers(q: string) {
  const kw = q.trim().toLowerCase();
  customerOptions.value = kw
    ? customers.value.filter(
        (c) => c.customerName.toLowerCase().includes(kw) || (c.customerCode || '').toLowerCase().includes(kw),
      )
    : customers.value;
}
function onCustomerPick(v: number | string) {
  if (typeof v === 'number') {
    const hit = customers.value.find((c) => c.id === v);
    form.customerId = hit?.id;
    form.customerName = hit?.customerName ?? '';
    // 带出默认业务员/跟单员/交货地址（空值不覆盖已填内容）
    if (hit?.salesman && !form.salesman) form.salesman = hit.salesman;
    if (hit?.merchandiser && !form.merchandiser) form.merchandiser = hit.merchandiser;
    if (hit?.deliveryAddress) {
      form.products.forEach((p) => {
        if (!p.deliveryAddress) p.deliveryAddress = hit.deliveryAddress as string;
      });
    }
  } else {
    form.customerId = undefined;
    form.customerName = String(v ?? '').trim();
  }
}

/* ===== 初始化（编辑回显） ===== */
async function init() {
  pageLoading.value = true;
  try {
    customers.value = await getAllCustomers();
    customerOptions.value = customers.value;
    const sourceId = editId.value ?? copyFromId.value;
    if (sourceId) {
      // 复制模式与编辑模式共用同一条回显路径，差异只在「不继承的字段」（见 copyFromId 注释）
      const isCopy = !editId.value;
      const row = await getOrderDetail(sourceId);
      if (isCopy) {
        copyHint.value =
          `已复制 ${row.orderNo} 的内容，PO#/交期已清空，请填写新的订单交期` +
          (row.productionNo ? '；生产单号已预填递推建议值（可改，但不能留空）' : '') +
          '，核对后保存';
      } else {
        orderNo.value = row.orderNo;
        auditRow.value = row; // 底部审计条（创建人/更新人/时间）
        editGuard.value = row.editGuard ?? null;
      }
      Object.assign(form, {
        poNo: isCopy ? '' : row.poNo ?? '',
        productionNo: isCopy ? suggestNextProductionNo(row.productionNo ?? '') : row.productionNo ?? '',
        customerId: row.customerId ?? undefined,
        customerName: row.customerName,
        orderDate: isCopy ? businessToday() : (row.orderDate || '').slice(0, 10),
        salesman: row.salesman ?? '',
        merchandiser: row.merchandiser ?? '',
        orderSource: row.orderSource ?? '',
        // 期初单复制出来的一定是正常单
        isOpening: isCopy ? 0 : row.isOpening ?? 0,
        remark: row.remark ?? '',
        otherReq: row.otherReq ?? '',
        // 复制模式不带 ID 与引用信息：复制出来的是一张全新订单
        products: row.products.map((p) => ({
          _key: nextKey(),
          id: isCopy ? undefined : p.id,
          _refs: isCopy ? null : p.refCounts ?? null,
          _orig: isCopy
            ? null
            : { orderQty: p.orderQty, unit: p.unit, dimensionMm: p.dimensionMm, surfaceType: p.surfaceType || 'none' },
          _types: parseProductTypes(p.productType),
          orderType: p.orderType,
          isNewOrder: p.isNewOrder,
          isExport: p.isExport,
          exportCountry: p.exportCountry ?? '',
          materialCode: p.materialCode ?? '',
          itemNo: p.itemNo ?? '',
          customerDrawingNo: p.customerDrawingNo ?? '',
          productName: p.productName ?? '',
          railSection: p.railSection ?? 'three_section',
          productRequirement: p.productRequirement ?? '',
          isSplit: p.isSplit ?? 0,
          dimensionRaw: p.dimensionRaw ?? (p.dimensionMm != null ? String(p.dimensionMm) : ''),
          dimensionUnit: p.dimensionUnit ?? 'mm',
          dimensionMm: p.dimensionMm,
          surfaceType: p.surfaceType || 'none',
          color: p.color ?? '',
          sheetMaterial: p.sheetMaterial ?? '',
          orderQty: p.orderQty,
          unit: p.unit,
          deliveryDate: isCopy ? '' : p.deliveryDate ? String(p.deliveryDate).slice(0, 10) : '',
          deliveryAddress: p.deliveryAddress ?? '',
          remark: p.remark ?? '',
          partGroups: p.partGroups.map((g) => ({
            _key: nextKey(),
            id: isCopy ? undefined : g.id,
            _refs: isCopy ? 0 : g.outsourceCount ?? 0,
            groupType: g.groupType,
            drawingNo: g.drawingNo ?? '',
            drawingVersion: g.drawingVersion ?? '',
            materialThickness: g.materialThickness ?? '',
            qtyPcs: g.qtyPcs,
            remark: g.remark ?? '',
          })),
        })),
      });
      attachments.value = isCopy ? [] : parseAttachments(row.attachmentIds);
      customerPick.value =
        row.customerId && customers.value.some((c) => c.id === row.customerId)
          ? row.customerId
          : row.customerName || '';
      // 编辑时有正文才展开，空的 <p><br></p> 仍保持折叠
      const reqText = (row.otherReq ?? '').replace(/<[^>]+>/g, '').trim();
      reqCollapsed.value = !reqText;
      stripLoadedItemCodes();
    }
  } finally {
    pageLoading.value = false;
  }
}
init();

/**
 * 编辑/复制存量订单时，产品代码里夹着中文说明的（「45#无锁力」，规则上线前录的）当场清掉，
 * 并把原值列给用户——被清掉的「无锁力」这类说明往往有用，要人自己挪进产品名称，系统不替他猜放哪。
 * 不清的话服务端 DTO 会拒绝保存，用户只会看到一句报错而不知道该改哪。
 */
function stripLoadedItemCodes() {
  const changed: string[] = [];
  form.products.forEach((p, i) => {
    const clean = sanitizeItemCode(p.itemNo);
    if (clean !== (p.itemNo ?? '').trim()) {
      changed.push(`产品 ${i + 1}：「${p.itemNo}」→「${clean}」`);
      p.itemNo = clean;
    }
  });
  if (changed.length) {
    ElMessage.warning({
      message: `以下产品代码含中文，已自动去除（${changed.join('；')}）。被去掉的说明文字如需保留，请填写到产品名称中`,
      duration: 0,
      showClose: true,
    });
  }
}
// 出口国家的国旗共约 1.9MB，等下拉打开再下载来不及（见 flag-preload.ts）：
// 进页面就排队预热，用户填到出口字段时图已在缓存里
preloadCountryFlagsWhenIdle();

/* ===== 产品行操作 ===== */
function addProduct() {
  const p = emptyProduct();
  // 新行继承客户默认交货地址
  const hit = customers.value.find((c) => c.id === form.customerId);
  if (hit?.deliveryAddress) p.deliveryAddress = hit.deliveryAddress;
  form.products.push(p);
}
function copyProduct(pi: number) {
  const src = form.products[pi];
  const dup: ProductRow = JSON.parse(JSON.stringify({ ...src }));
  dup._key = nextKey();
  // 复制出的是新行：去掉 ID 与引用信息，否则保存时会被当成原行去更新
  dup.id = undefined;
  dup._refs = null;
  dup._orig = null;
  dup.partGroups.forEach((g) => {
    g._key = nextKey();
    g.id = undefined;
    g._refs = 0;
  });
  form.products.splice(pi + 1, 0, dup);
}
function removeProduct(pi: number) {
  form.products.splice(pi, 1);
}
/* ===== 分体出货：形态由部件组构成推导（与服务端共用共享包口径） ===== */
/** 分体行出货形态预览：外中轨 / 内轨 / 中内轨…… */
function splitFormText(p: ProductRow): string {
  return splitSuffix(splitParts(p.partGroups.map((g) => g.groupType), p.railSection));
}
/** 组并集是否已覆盖当前节数的全部部件——那就是整品，分体开关下保存会被服务端拒 */
function splitCoversAll(p: ProductRow): boolean {
  const parts = splitParts(p.partGroups.map((g) => g.groupType), p.railSection);
  return parts.length >= (p.railSection === 'two_section' ? 2 : 3);
}

/**
 * 该组类型在当前节数下不可选。两类：展不出部件行的（二节轨的中轨组，服务端会拒），
 * 以及组名点名了部件却被节数剔除的（二节轨的「外中轨」实际只剩外轨，组名与实际不符）。
 * 判定全在共享包 isGroupTypeAvailable，前端不另写节数规则。
 */
function groupTypeUnavailable(p: ProductRow, groupType: string): boolean {
  return !isGroupTypeAvailable(groupType, p.railSection);
}

/**
 * 需外发（表面处理≠无）时，把组合型组（外中轨 / 整品）自动拆成单部件组。
 *
 * 为什么必须拆：外发锚定**部件组**——挂一个「外中轨」组的话，① 回厂只能按一条
 * 记账，分不出外轨、中轨各回了多少；② 单重是按部件建档的，组合型组取不到准确
 * 单重，按重量折算数量会系统性偏差。与分不分体无关，整品行同样适用。
 *
 * 字段（图号/版本/料厚/支数/备注）**原样复制到拆出的各行**：计划员核对时只改
 * 差异项，比留空让人重录一长串图号省事得多。
 */
function maybeSplitCombinedGroups(p: ProductRow) {
  if (!needsOutsource(p.surfaceType)) return;
  const notes: string[] = [];
  // 倒序遍历：splice 会改变后续下标
  for (let i = p.partGroups.length - 1; i >= 0; i--) {
    const g = p.partGroups[i];
    // 已有外发回厂记录的组不能拆（拆了就是删掉它，服务端会拒）
    if (groupLocked(g)) continue;
    const targets = splitCombinedGroup(g.groupType, p.railSection);
    if (!targets.length) continue;
    const label = partGroupLabel(g.groupType);
    // 同产品行内组类型唯一（uk_product_group），已存在的目标组不能再建
    const used = new Set(p.partGroups.filter((x) => x !== g).map((x) => x.groupType));
    const fresh = targets.filter((t) => !used.has(t));
    if (!fresh.length) {
      p.partGroups.splice(i, 1);
      notes.push(`「${label}」的各部件都已有单独的组，已移除该行（避免重复计量）`);
      continue;
    }
    // 拆出的都是新组（不带原组 ID），原组由服务端随之删除
    p.partGroups.splice(i, 1, ...fresh.map((t) => ({ ...g, _key: nextKey(), id: undefined, _refs: 0, groupType: t })));
    notes.push(`「${label}」已拆为 ${fresh.map(partGroupLabel).join(' + ')}`);
  }
  if (notes.length) {
    ElMessage({
      type: 'warning',
      duration: 6000,
      showClose: true,
      dangerouslyUseHTMLString: true,
      message:
        '该产品需要表面处理（外发），零件是分开送、分批回厂的，故按部件拆分部件组：<br/>'
        + notes.join('<br/>')
        + '<br/>生产图号 / 版本 / 料厚已复制到各行，请核对后修改。',
    });
  }
}

/**
 * 补组优先序：先补还没用的**单部件组**，组合型（外中轨 / 整品）排最后。
 * 默认已按部件铺开，再叠一个整品组会把同一批部件重复计量一次，放后面减少误选。
 */
const ADD_GROUP_ORDER = ['outer', 'middle', 'inner', 'outer_middle', 'whole'];

/** 下一个还没被占用、且当前节数下可用的组类型（同产品行内 groupType 唯一，见 uk_product_group） */
function nextFreeGroupType(p: ProductRow): string | undefined {
  const used = new Set(p.partGroups.map((g) => g.groupType));
  const ok = (v: string) => !used.has(v) && !groupTypeUnavailable(p, v);
  // 末尾兜底：共享包若新增组类型而未登记进 ADD_GROUP_ORDER，仍能被补上
  return ADD_GROUP_ORDER.find(ok) ?? PART_GROUP_OPTIONS.find((o) => ok(o.value))?.value;
}
function canAddGroup(p: ProductRow): boolean {
  return !!p.partGroups.length && !!nextFreeGroupType(p);
}
function addGroup(p: ProductRow) {
  const next = nextFreeGroupType(p);
  if (!next) {
    ElMessage.warning('组类型已用尽');
    return;
  }
  const g = emptyGroup();
  g.groupType = next;
  p.partGroups.push(g);
}
/** 第一行填过内容、且后面还有行可填时才可用 */
function canFillFromFirst(p: ProductRow): boolean {
  return p.partGroups.length >= 2 && !groupIsBlank(p.partGroups[0]);
}

/**
 * 按第一行填充：把第一组的图号/料厚/支数/备注灌到后面每一组，**组类型保持不变**。
 *
 * 部件组现在按节数一次性铺开（外/中/内），几组之间通常只有组类型不同——同一张
 * 生产图、同支数，逐行重敲纯属浪费。原先的「复制上一行」是配合逐行添加的，
 * 一次性生成后已无用武之地，故替换掉。
 *
 * ⚠️ **版本号不能照抄**：开单信息的版本是**部件级**的（外/中/内三个版本号），
 * 直接抄第一行会把外轨的版本安到内轨上。所以填完图号后按图号查一次工艺，
 * 给每组取它自己首部件对应的版本；查不到才回落用第一行的值。
 *
 * 料厚同样可能逐部件不同（外 1.2 / 中 1.0），这里先照填，用户按需再改——
 * 多数产品三个部件料厚一致，填了比不填省事。
 */
async function fillFromFirst(p: ProductRow) {
  const src = p.partGroups[0];
  const targets = p.partGroups.slice(1);
  if (!src || !targets.length) return;

  // 后面的行已经录过内容就先问一句，别静默盖掉别人填的东西
  if (targets.some((g) => !groupIsBlank(g))) {
    try {
      await ElMessageBox.confirm(
        `将用第一行「${partGroupLabel(src.groupType)}」的图号 / 版本 / 料厚 / 支数 / 备注覆盖后面 ${targets.length} 个部件组（组类型不变）。已填写的内容会被覆盖，确定继续？`,
        '按第一行填充',
        { type: 'warning', confirmButtonText: '填充', cancelButtonText: '取消' },
      );
    } catch {
      return;
    }
  }

  targets.forEach((g) => {
    g.drawingNo = src.drawingNo;
    g.drawingVersion = src.drawingVersion;
    g.materialThickness = src.materialThickness;
    g.qtyPcs = src.qtyPcs;
    g.remark = src.remark;
  });

  // 版本按各组首部件重取（只查一次工艺，避免逐行发请求）
  const dn = src.drawingNo?.trim();
  if (dn) {
    const info = await getProcessInfoByDrawing(dn).catch(() => null);
    if (info) {
      targets.forEach((g) => {
        const firstPart = partGroupParts(g.groupType)[0];
        const ver =
          firstPart === 'inner' ? info.drawingVersionInner :
          firstPart === 'middle' ? info.drawingVersionMiddle : info.drawingVersionOuter;
        if (ver) g.drawingVersion = normalizeVersion(ver) ?? g.drawingVersion;
      });
    }
  }
  ElMessage.success(`已按第一行填充 ${targets.length} 个部件组`);
}

/** 该组是否被填过内容——用于判断自动增删组会不会弄丢用户录入 */
function groupIsBlank(g: GroupRow): boolean {
  return !g.drawingNo && !g.drawingVersion && !g.materialThickness && !g.remark && !g.qtyPcs;
}

/**
 * 切换轨道节数时同步部件组：**二节轨没有中轨**，中轨组在二节轨下
 * expandPartRows 展开为空、服务端直接拒绝保存，所以必须把它摘掉。
 *
 * - 三节轨 → 二节轨：移除中轨组（填过内容先确认，避免静默丢录入）；
 * - 二节轨 → 三节轨：**仅当**当前正好是二节轨的默认形态 {外轨,内轨} 时补回中轨组。
 *   限定这个条件是为了不打扰已经手工改过组结构的人——比如有人特意只留一个整品组，
 *   切个节数就凭空多出一个中轨组会很莫名其妙。
 */
async function onRailSectionChange(p: ProductRow) {
  await syncGroupsForRailSection(p);
  // 分体仅三节轨（共享包 canSplitShipping）：切到二节轨自动关掉，
  // 否则开关虽被禁用、值仍是 1，保存时会被服务端硬校验拒绝
  if (p.isSplit && !canSplitShipping(p.railSection)) {
    p.isSplit = 0;
    ElMessage.info('二节轨不支持分体出货，已关闭该开关');
  }
  // 节数变了，组合型组要拆成的部件也跟着变（如整品组：三节轨拆三行、二节轨拆两行）
  maybeSplitCombinedGroups(p);
}

async function syncGroupsForRailSection(p: ProductRow) {
  const types = p.partGroups.map((g) => g.groupType);
  if (p.railSection === 'two_section') {
    const mi = types.indexOf('middle');
    if (mi < 0) return;
    if (!groupIsBlank(p.partGroups[mi])) {
      try {
        await ElMessageBox.confirm(
          '二节轨没有中轨，需要移除已填写的「中轨」部件组。确定继续？',
          '提示',
          { type: 'warning', confirmButtonText: '移除', cancelButtonText: '改回三节轨' },
        );
      } catch {
        p.railSection = 'three_section'; // 用户反悔：节数回滚，组保持原样
        return;
      }
    }
    p.partGroups.splice(mi, 1);
    ElMessage.info('二节轨无中轨，已移除「中轨」部件组');
    return;
  }
  // 三节轨：只补默认形态，其余结构不动
  if (types.length === 2 && types.includes('outer') && types.includes('inner')) {
    p.partGroups.splice(types.indexOf('outer') + 1, 0, emptyGroup('middle'));
    ElMessage.info('三节轨已补充「中轨」部件组');
  }
}

/* ===== 展示/换算辅助 ===== */
function pcsOf(p: ProductRow): number {
  return toPieces(p.orderQty, p.unit);
}
function productTitle(p: ProductRow): string {
  return formatProductModel(p.itemNo, p._types, 'whole');
}
function syncDimension(p: ProductRow) {
  // 英寸→mm 的系数取系统配置（管理员可改，缺省 25）；落库的 mm 是权威值，
  // 日后改系数不会回头重算这一行
  p.dimensionMm = p.dimensionRaw
    ? toMm(Number(p.dimensionRaw), p.dimensionUnit, inchToMm.value)
    : null;
}
/** 料厚格式随组含几个部件而变：单部件组填单值，外中轨两段，整品三段 */
function thicknessPlaceholder(groupType: string): string {
  if (groupType === 'outer_middle') return '外×中，如 1.2×1.2';
  if (partGroupParts(groupType).length === 1) return '单值，如 1.5';
  return '外×中×内，如 2.0×2.0×2.0';
}
function partsPreview(p: ProductRow, g: GroupRow): string {
  const rows = expandPartRows(g.groupType, p.railSection, hasSocket(p._types), g.qtyPcs ?? pcsOf(p));
  if (!rows.length) return '（当前节数下无部件）';
  return rows.map((r) => `${partTypeLabel(r.partType)}${r.side ? sideLabel(r.side) : ''}×${r.qty}`).join('　');
}

/* ===== 附件 ===== */
function parseAttachments(json: string | null): string[] {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
async function onAttachmentPick(file: UploadFile) {
  const raw = file.raw as File | undefined;
  if (!raw) return;
  if (raw.size > 20 * 1024 * 1024) {
    ElMessage.warning('附件不能超过 20MB');
    return;
  }
  uploading.value = true;
  try {
    const url = await uploadFile(raw, 'order_attachment');
    attachments.value.push(url);
  } finally {
    uploading.value = false;
  }
}
function attachmentName(url: string): string {
  return url.split('/').pop() ?? url;
}
function openAttachment(url: string) {
  window.open(url, '_blank');
}

/* ===== 保存 ===== */
/**
 * 交货地址为空的软提醒（2026-09-25，只提醒不拦截）：送货单的「送货地址」优先取订单产品行的
 * 交货地址，没填才回落客户资料的送货地址（服务端 buildDeliveryNote）。提醒按回落结果说实话——
 * 客户资料有地址就告诉用户会用哪个，连客户资料也没有才说「将为空」。点「返回填写」即中止本次保存。
 */
async function confirmMissingDeliveryAddress() {
  const missing = form.products
    .map((p, i) => ((p.deliveryAddress ?? '').trim() ? 0 : i + 1))
    .filter(Boolean);
  if (!missing.length) return;
  const which = form.products.length > 1 ? `产品 ${missing.join('、')} 未填写交货地址` : '未填写交货地址';
  const fallback = (customers.value.find((c) => c.id === form.customerId)?.deliveryAddress ?? '').trim();
  const detail = fallback
    ? `打印送货单时，「送货地址」将使用客户资料里的地址：<br/><b>${escapeHtml(fallback)}</b>`
    : '该客户资料里也没有维护送货地址，<b>打印送货单时「送货地址」将为空</b>。';
  await ElMessageBox.confirm(`${which}。${detail}<br/>如需指定本单的送货地点，请返回填写。`, '交货地址提醒', {
    type: 'warning',
    dangerouslyUseHTMLString: true,
    confirmButtonText: '继续保存',
    cancelButtonText: '返回填写',
  });
}
/** 地址是用户输入的文本，拼进 HTML 提示前转义 */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

/**
 * 所有产品交期都恰好等于下单日期时二次核对。该组合可能合法，因此只提醒不硬拦；
 * 但它也是把「交期」误抄进「下单日期」最典型的信号。
 */
async function confirmMatchingOrderDates() {
  if (
    !form.orderDate
    || !form.products.length
    || !form.products.every((product) => product.deliveryDate === form.orderDate)
  ) return;
  await ElMessageBox.confirm(
    `所有产品的订单交期都与下单日期相同（${form.orderDate}）。请确认没有把交期误填成下单日期。`,
    '日期核对',
    {
      type: 'warning',
      confirmButtonText: '日期无误，继续保存',
      cancelButtonText: '返回检查',
    },
  );
}

/**
 * 被引用订单的「更正提醒」（只提醒不拦截）：数量/规格/表面处理改了会波及已发生的业务数——
 * 欠数重算（可能变负、订单自动完结/重开）、已入库已发货的记录一并显示新规格、外发欠数口径变化。
 * 让用户确认一次这是在纠正录入错误，而不是顺手改了一个已经在车间流转的产品。
 */
async function confirmReferencedChanges() {
  if (!editGuard.value?.referenced) return;
  const unitText = (u: string) => (u === 'set' ? '套' : '支');
  const notes: string[] = [];
  form.products.forEach((p, i) => {
    const o = p._orig;
    if (!o || !productLocked(p)) return;
    const tag = form.products.length > 1 ? `产品 ${i + 1}：` : '';
    if (p.orderQty !== o.orderQty || p.unit !== o.unit) {
      notes.push(
        `${tag}数量 ${o.orderQty}${unitText(o.unit)} → ${p.orderQty}${unitText(p.unit)}，成品欠数与发货欠数随之重算（可能变负，订单也可能因此自动完结或重开）`,
      );
    }
    if ((p.dimensionMm ?? null) !== (o.dimensionMm ?? null)) {
      notes.push(`${tag}规格已修改，已装配、已入库、已发货的记录会一并显示为新规格`);
    }
    if ((p.surfaceType || 'none') !== o.surfaceType) {
      notes.push(`${tag}表面处理已修改，台账外发欠数按新口径计算`);
    }
  });
  if (!notes.length) return;
  await ElMessageBox.confirm(
    `以下改动会影响已发生的业务数据：<br/>${notes.map((n) => `· ${escapeHtml(n)}`).join('<br/>')}<br/><br/>请确认是在更正录入错误。`,
    '更正提醒',
    { type: 'warning', dangerouslyUseHTMLString: true, confirmButtonText: '确认更正', cancelButtonText: '返回核对' },
  );
}

async function onSave() {
  if (guardBlocked.value) {
    ElMessage.warning(`只有${editGuard.value?.editors ?? '订单创建人'}可以修改这张订单`);
    return;
  }
  await formRef.value?.validate();
  await confirmMatchingOrderDates();
  // 分体行守卫：组并集=全部件就是整品（服务端同样会拒），提前拦下并指明行号
  const badSection = form.products.findIndex((p) => p.isSplit && !canSplitShipping(p.railSection));
  if (badSection >= 0) {
    ElMessage.error(
      `产品 ${badSection + 1}：只有三节轨可以「分体出货」，请关闭该开关或把轨道节数改回三节轨`,
    );
    return;
  }
  // 产品代码只能是宽度或代码式内容（共享包 item-code.ts，服务端 DTO 同样硬校验）
  const badCode = form.products.findIndex((p) => !isValidItemCode(p.itemNo));
  if (badCode >= 0) {
    ElMessage.error(`产品 ${badCode + 1}（「${form.products[badCode].itemNo}」）：${ITEM_CODE_MESSAGE}`);
    return;
  }
  const badSplit = form.products.findIndex((p) => p.isSplit && splitCoversAll(p));
  if (badSplit >= 0) {
    ElMessage.error(
      `产品 ${badSplit + 1} 开启了「分体出货」但部件组已覆盖全部部件（即整品），请删除不出货的组或关闭分体开关`,
    );
    return;
  }
  // 富文本里插入的图片此前只是本地 blob 预览，保存前统一上传并把 blob URL 换成真实
  // URL；不 flush 就提交，落库的 HTML 里全是刷新即失效的 blob 地址。
  await richEditorRef.value?.flushUploads();
  const payload: OrderPayload = {
    // PO# 选填：清空后传 null，服务端也会把空白统一存为 NULL
    poNo: form.poNo?.trim() || null,
    // 生产单号必填（表单 rules 已拦），直接传值
    productionNo: form.productionNo,
    customerId: form.customerId,
    customerName: form.customerName,
    orderDate: form.orderDate,
    salesman: form.salesman || undefined,
    merchandiser: form.merchandiser || undefined,
    orderSource: form.orderSource || undefined,
    // 期初补录开关必须显式带上：漏传时服务端新建兜底为 0，期初录入页会选不到这张订单
    isOpening: form.isOpening,
    attachmentIds: JSON.stringify(attachments.value),
    remark: form.remark || undefined,
    otherReq: form.otherReq || undefined,
    // 产品行/部件组回传 ID：服务端按它原地更新，装配/成品/外发记录才不会悬空
    products: form.products.map<OrderProductPayload>((p, i) => ({
      id: p.id,
      orderType: p.orderType,
      isNewOrder: p.isNewOrder,
      isExport: p.isExport,
      exportCountry: p.isExport ? p.exportCountry || undefined : undefined,
      materialCode: p.materialCode || undefined,
      itemNo: withWidthHash(p.itemNo) || undefined,
      customerDrawingNo: p.customerDrawingNo || undefined,
      // 新增订单：保存时再补一次「滑轨」后缀（没失焦直接点保存的情况）；编辑存量订单保留原写法
      productName: (editId.value ? p.productName : nameWithRail(p)) || undefined,
      productType: p._types.join(','),
      railSection: p.railSection,
      productRequirement: p.productRequirement || undefined,
      isSplit: p.isSplit,
      dimensionMm: p.dimensionMm ?? undefined,
      dimensionRaw: p.dimensionRaw || undefined,
      dimensionUnit: p.dimensionUnit,
      surfaceType: p.surfaceType,
      color: p.color || undefined,
      sheetMaterial: p.sheetMaterial || undefined,
      orderQty: p.orderQty,
      unit: p.unit,
      deliveryDate: p.deliveryDate,
      deliveryAddress: p.deliveryAddress || undefined,
      remark: p.remark || undefined,
      sort: i,
      partGroups: p.partGroups.map((g, gi) => ({
        id: g.id,
        groupType: g.groupType,
        drawingNo: g.drawingNo || undefined,
        drawingVersion: g.drawingVersion || undefined,
        materialThickness: g.materialThickness || undefined,
        qtyPcs: g.qtyPcs ?? undefined,
        remark: g.remark || undefined,
        sort: gi,
      })),
    })),
  };
  // 同 PO# 软提醒（仅新建）：同 PO 的追加/变更另建新单是合法操作，故只提醒不拦截，
  // 防的是无意中的重复录单（客户同一份订单文件被录了两遍）
  if (!editId.value && form.poNo) {
    const dup = await getOrderList({ page: 1, pageSize: 1, poNo: form.poNo });
    if (dup.total > 0) {
      await ElMessageBox.confirm(
        `系统里已存在 ${dup.total} 张 PO# 为「${form.poNo}」的订单。若本单是同 PO 的追加或变更可继续保存；请确认不是重复录单。`,
        '同 PO# 提醒',
        { type: 'warning', confirmButtonText: '继续保存', cancelButtonText: '返回核对' },
      );
    }
  }
  await confirmMissingDeliveryAddress();
  await confirmReferencedChanges();
  saving.value = true;
  try {
    if (editId.value) {
      const res = await updateOrder(editId.value, payload);
      if (res?.corrected) {
        const s = res.synced;
        const n = s ? s.outsource + s.assembly + s.finished : 0;
        const extra = [
          res.finished?.length ? '订单已交清，自动完结' : '',
          res.reopened?.length ? '订单出现发货欠数，自动重开' : '',
        ].filter(Boolean);
        ElMessage.success({
          message: `已更正，并同步到 ${n} 条下游记录${extra.length ? `；${extra.join('；')}` : ''}`,
          duration: 5000,
        });
      } else {
        ElMessage.success('已保存');
      }
    } else {
      const res = await createOrder(payload);
      ElMessage.success(`已创建订单 ${res.orderNo}`);
    }
    goBack();
  } finally {
    saving.value = false;
  }
}

/* ===== 图号带工艺（组级；带出版本号/产品名称，可改） ===== */
async function onDrawingChange(p: ProductRow, g: GroupRow) {
  const dn = g.drawingNo?.trim();
  if (!dn) return;
  const info = await getProcessInfoByDrawing(dn);
  if (!info) return;
  // 开单信息版本为部件级：按组类型取首部件的版本（outer_middle→外轨、inner→内轨…）
  const firstPart = partGroupParts(g.groupType)[0];
  const ver =
    firstPart === 'inner' ? info.drawingVersionInner :
    firstPart === 'middle' ? info.drawingVersionMiddle : info.drawingVersionOuter;
  if (ver && !g.drawingVersion) g.drawingVersion = ver;
  if (info.productName && !p.productName) p.productName = info.productName;
  if (info.customerName && !form.customerName) {
    form.customerName = info.customerName;
    customerPick.value = info.customerName;
  }
  ElMessage.success(`已按图号「${dn}」带入工艺信息`);
}

function goBack() {
  router.push('/order');
}
</script>

<script lang="ts">
export default { name: 'OrderForm' };
</script>

<style scoped lang="scss">
/* 字号对齐表单标签（small 尺寸 12px）；EP 带说明的 alert 默认标题 16px、图标 28px，放在表单上方太抢眼 */
.ref-alert {
  margin: 10px 0 4px;
  --el-alert-title-font-size: 12px;
  --el-alert-title-with-description-font-size: 12px;
  --el-alert-description-font-size: 12px;
  --el-alert-icon-large-size: 16px;
  :deep(.el-alert__title) { font-weight: 600; line-height: 20px; }
  :deep(.el-alert__description) { line-height: 20px; }
}
.form-header {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 14px; margin-bottom: 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  .form-title { display: flex; align-items: center; gap: 12px; }
  .title-text { font-size: 16px; font-weight: 600; }
  .title-sub { color: var(--el-text-color-secondary); font-size: 13px; }
  /* 复制模式提示用紫色突出：既区别于灰色单号，也不与主色蓝/警告橙混淆 */
  .title-sub--copy { color: #722ed1; }
}
.section-title {
  font-size: 14px; font-weight: 600; color: var(--el-text-color-primary);
  border-left: 4px solid var(--el-color-primary);
  padding-left: 10px; line-height: 1.3;
  margin: 22px 0 14px;
  display: flex; align-items: center;
  .ml12 { margin-left: 12px; }
}
.order-form { max-width: 1280px; }

/* 订单备注（富文本）版块：标题条与 .section-title 同视觉语言，但带折叠按钮 */
.req-block { margin-top: 8px; }
.req-label {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 6px;
  .req-label__text {
    font-size: 14px; font-weight: 600; color: var(--el-text-color-primary);
    border-left: 4px solid var(--el-color-primary);
    padding-left: 10px; line-height: 1.3;
  }
}
.product-card {
  margin-bottom: 14px;
  border: 1px solid var(--el-border-color);
  :deep(.el-card__header) { padding: 8px 16px; background: var(--el-fill-color-lighter); }
  .pc-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .pc-title { font-weight: 600; display: inline-flex; align-items: center; }
  .pc-ref-tag { margin-left: 8px; font-weight: normal; }
  .pc-meta { color: var(--el-text-color-secondary); font-size: 13px; b { color: var(--el-color-primary); } }
}
.group-title {
  font-size: 13px; color: var(--el-text-color-secondary);
  margin: 4px 0 8px; display: flex; align-items: center; gap: 8px;
}
/* 分体出货：开关旁的问号提示与形态预览标签、部件组标题里的操作提示 */
.split-tip { margin-left: 6px; color: var(--el-text-color-placeholder); cursor: help; vertical-align: middle; }
.split-na { margin-left: 8px; font-size: 12px; color: var(--el-text-color-placeholder); }
.split-form-tag { margin-left: 8px; }
.split-hint { color: var(--el-color-danger); }
/* 是否出口：开关 + 国家下拉同行，下拉吃掉剩余宽度 */
.export-line {
  display: flex; align-items: center; gap: 8px; width: 100%;
  .export-country { flex: 1; min-width: 0; }
}
.group-grid {
  width: 100%; border-collapse: collapse;
  th, td { border: 1px solid var(--el-border-color); padding: 4px 6px; }
  th { background: var(--el-fill-color-light); font-weight: 600; font-size: 13px; text-align: center; }
  .gg-type { width: 110px; }
  .gg-ver { width: 90px; }
  .gg-thick { width: 150px; }
  .gg-qty { width: 90px; }
  .gg-op { width: 40px; }
  .gg-parts { font-size: 12px; color: var(--el-text-color-secondary); }
  :deep(.el-input__wrapper) { box-shadow: none; background: transparent; }
}
.attach-list { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; .el-tag { cursor: pointer; } }
.form-footer {
  margin-top: 26px; padding-top: 14px;
  border-top: 1px solid var(--el-border-color-lighter);
  text-align: right;
}
</style>

<style lang="scss">
/* 出口国家下拉：国旗+中文名 左侧，英文全称 右侧（沿袭 hb-mes）。
   浮层宽度与内部虚拟列表宽度统一在 styles/index.scss 的 .country-popper 段定义
   （原先这里重复声明过一遍 min-width，改宽度时容易只改一处） */
/* 挤压优先级：国旗恒定完整 > 中文名 > 英文名先截断。
   名字最长的几行（福克兰群岛 Falkland Islands (Malvinas)、密克罗尼西亚联邦
   Federated States of Micronesia）放不下时，原先英文名带 flex-shrink:0 不让收缩，
   被压缩的就成了没写 flex 的国旗——宽度直接压到 0，看着像「这些国家没有国旗」，
   中英文也糊在一起。故国旗必须 flex:none，两侧文字都要能收缩并省略号截断。 */
.country-popper .country-option {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-width: 0;
  .country-left { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1 1 auto;
    /* 浅灰底是占位：纹章类国旗（塞尔维亚等 142 面）超过内联阈值、要单独下载，
       未到位时留一个灰块，比空白更像「图在加载」而不是「这国没有旗」 */
    .fi { flex: none; font-size: 16px; line-height: 1; box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.08); border-radius: 2px; overflow: hidden; background-color: #f1f5f9; }
    .country-zh { font-size: 13px; font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  }
  /* shrink 权重给到 3：空间不足时先压英文名，中文名是主标识、尽量留全。
     margin-left:auto + text-align:right 一并靠右：前者把整块推到行尾（不依赖
     父级的 space-between），后者让框内文字也贴右，短名字不会浮在框左侧 */
  .country-en { color: var(--el-text-color-placeholder); font-size: 12px; flex: 0 3 auto; min-width: 0; max-width: 150px; margin-left: auto; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}

.customer-2col-popper {
  .el-select-dropdown__item {
    display: flex; justify-content: space-between; align-items: center; gap: 16px;
    min-width: 320px;
    height: auto;
    padding: 8px 16px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    transition: background-color 0.15s, color 0.15s;
    &:last-child { border-bottom: none; }

    .opt-name {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-size: 13px;
    }
    .opt-code {
      flex: none; min-width: 76px; text-align: right;
      color: var(--el-text-color-secondary);
      font-size: 12px; font-family: Consolas, monospace;
    }

    // 鼠标悬停 / 键盘焦点
    &.hover, &:hover {
      background-color: var(--el-color-primary-light-9);
      .opt-name { color: var(--el-color-primary); }
      .opt-code { color: var(--el-color-primary); opacity: 0.85; }
    }

    // 当前选中项
    &.selected {
      background-color: var(--el-color-primary-light-9);
      font-weight: 600;
      position: relative;
      &::before {
        content: '';
        position: absolute; left: 0; top: 0; bottom: 0;
        width: 3px; background: var(--el-color-primary);
      }
      .opt-name { color: var(--el-color-primary); font-weight: 600; }
      .opt-code { color: var(--el-color-primary); }
    }
  }
}
</style>
