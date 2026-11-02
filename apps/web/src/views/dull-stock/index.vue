<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="runKeywordSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword" clearable style="width: 240px"
            placeholder="产品代码 / 型号 / 客户 / 生产单号"
            @input="scheduleKeywordSearch" @keyup.enter="runKeywordSearch"
          />
        </el-form-item>
        <el-form-item label="表面处理">
          <el-select v-model="query.surfaceType" clearable placeholder="全部" style="width: 130px" @change="runKeywordSearch">
            <el-option v-for="o in surfaceDict" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="边别">
          <el-select v-model="query.side" clearable placeholder="全部" style="width: 100px" @change="runKeywordSearch">
            <el-option v-for="o in SIDE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="月份">
          <el-date-picker
            v-model="flowMonth" type="month" value-format="YYYY-MM" clearable
            placeholder="选择统计月份" style="width: 150px" @change="onFlowMonthChange"
          />
        </el-form-item>
        <el-form-item class="query-actions">
          <el-checkbox v-model="query.onlyInStock" @change="runKeywordSearch">
            {{ hasFlowDateRange ? '只看月末有结存' : '只看有结存' }}
          </el-checkbox>
          <el-button size="small" type="primary" :icon="Search" @click="runKeywordSearch">查询</el-button>
          <el-button size="small" @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
      <div class="filter-second-row">
        <div class="business-actions">
          <el-button size="small" v-permission="'dull-stock:create'" type="primary" plain :icon="Plus" @click="openForm()">
            新增呆滞品
          </el-button>
          <el-button size="small" v-permission="'dull-stock:import'" plain :icon="Upload" @click="importVisible = true">
            批量导入
          </el-button>
          <el-button
            size="small" v-permission="'dull-stock:export'" plain :icon="Download"
            :loading="exporting" @click="onExport"
          >导出</el-button>
        </div>
        <span class="filter-summary">
          当前筛选 {{ summary.rows }} 行，{{ hasFlowDateRange ? '月末结存' : '结存' }}合计
          <b>{{ summary.totalBalancePcs }}</b> 支
          ，{{ hasFlowDateRange ? `${flowMonth}：月初` : '累计：期初' }}
          <b>{{ summary.periodOpeningPcs }}</b> 支，
          客退 <b class="delta-in">{{ summary.periodCustomerReturnPcs }}</b> 支，
          领料 <b class="delta-out">{{ summary.periodProductionIssuePcs }}</b> 支，
          生产入库 <b class="delta-in">{{ summary.periodProductionInboundPcs }}</b> 支，
          出货 <b class="delta-out">{{ summary.periodShipmentPcs }}</b> 支
        </span>
      </div>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <!-- 同成品库存：el-tooltip 深色气泡 + 限宽折行，取代原生 title -->
        <hint-tip class="tip">
          <el-icon><InfoFilled /></el-icon>
          已完结订单剩下的成品，<b>一条记录 = 一批货</b>。
          <b>结存数 = 期初数 + 客退 + 生产入库 − 生产领料 − 出货</b>，变动只能靠「登记库存变动」产生，点行首箭头看日期与明细。
          主列表按手工台账展示期初、四类变动数量与日期、结存；选择月份后切换为月度口径。
          “出货”送货单可直接从行末操作区打印。
          客户和生产单号均为选填，无法确认来源时可以留空。
          本页是<b>独立台账</b>，不进订单跟踪台账、也不进成品库存。
          <template #content>已完结订单剩下的成品，一条记录 = 一批货。主列表按手工台账展示生产单号、客户、产品属性、期初、客户退货、生产领料、生产入库、出货、结存和备注，四类变动同时显示数量与日期。月份留空看累计，选择月份看当月；行末“打印送货单”可选择具体出货记录。打印前必须补充客户。本页是独立台账，不进订单跟踪台账、也不进成品库存。</template>
        </hint-tip>
      </div>

      <app-table
        :data="list" v-loading="loading" border stripe
        :page="query.page" :page-size="query.pageSize" row-key="id"
        @expand-change="onExpand"
      >
        <el-table-column type="expand" width="36" fixed="left">
          <template #default="{ row }">
            <div class="expand-wrap" v-loading="flowLoadingId === row.id">
              <table v-if="(flows[row.id] ?? []).length" class="expand-grid">
                <thead>
                  <tr>
                    <th>发生日期</th><th>业务类型</th><th>数量</th><th>变动后结存</th>
                    <th>说明</th><th>备注</th><th>操作人</th><th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="f in flows[row.id]" :key="f.id">
                    <td class="c">{{ f.flowDate }}</td>
                    <td class="c">
                      <el-tag size="small" :type="f.direction === STOCK_DIRECTION.IN ? 'success' : 'danger'">
                        {{ dullStockFlowTypeLabel(f.flowType) }}
                      </el-tag>
                    </td>
                    <td class="c">
                      <span :class="f.direction === STOCK_DIRECTION.IN ? 'delta-in' : 'delta-out'">
                        {{ f.direction === STOCK_DIRECTION.IN ? '+' : '−' }}{{ f.quantity }}
                      </span>
                    </td>
                    <td class="c">{{ f.balanceAfter }}</td>
                    <td>{{ f.reason || '—' }}</td>
                    <td>{{ f.remark || '—' }}</td>
                    <td class="c">
                      <color-tag v-if="f.creatorName" :seed="f.creatorName">{{ f.creatorName }}</color-tag>
                      <span v-else>—</span>
                    </td>
                    <td class="c">
                      <el-button
                        v-if="f.flowType === DULL_STOCK_FLOW_TYPE.SHIPMENT"
                        size="small" v-permission.disable="'dull-stock:print'" link type="primary"
                        :icon="Printer" @click="openDeliveryNote(f)"
                      >送货单</el-button>
                      <el-button
                        size="small" v-permission.disable="'dull-stock:stock'" link type="danger"
                        :icon="Delete" @click="onDeleteFlow(row, f)"
                      >删除</el-button>
                    </td>
                  </tr>
                </tbody>
              </table>
              <el-empty v-else description="暂无库存变动流水" :image-size="48" />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="生产单号" width="105" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.productionNo || '—' }}<audit-info mode="inline" :row="row" />
          </template>
        </el-table-column>
        <el-table-column label="客户" width="100" show-overflow-tooltip>
          <template #default="{ row }">{{ row.customerName || '—' }}</template>
        </el-table-column>
        <el-table-column label="产品型号" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.productModel || '—' }}</template>
        </el-table-column>
        <el-table-column label="规格" width="68" align="center">
          <template #default="{ row }">{{ row.dimensionText || '—' }}</template>
        </el-table-column>
        <el-table-column label="表面处理" width="90" align="center">
          <template #default="{ row }">
            <color-tag v-if="row.surfaceType" :seed="row.surfaceType">{{ dictLabel(surfaceDict, row.surfaceType) }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="边别" width="50" align="center">
          <template #default="{ row }">
            <color-tag v-if="row.side" :seed="row.side">{{ sideLabel(row.side) }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="单位套/支" width="70" align="center">
          <template #default="{ row }">{{ labelOf(UNIT_OPTIONS, row.unit) }}</template>
        </el-table-column>
        <el-table-column label="材料厚度" width="82" align="center">
          <template #default="{ row }">{{ row.materialThickness || '—' }}</template>
        </el-table-column>
        <el-table-column :label="hasFlowDateRange ? '月初数' : '期初数'" width="72" align="center">
          <template #default="{ row }">{{ row.periodOpeningQty || 0 }}</template>
        </el-table-column>
        <el-table-column label="客户退货" align="center">
          <el-table-column label="数量" width="64" align="center">
            <template #default="{ row }"><b class="delta-in">{{ row.periodCustomerReturnQty || 0 }}</b></template>
          </el-table-column>
          <el-table-column label="时间" width="92" align="center" show-overflow-tooltip>
            <template #default="{ row }"><span class="flow-dates">{{ row.periodCustomerReturnDates || '—' }}</span></template>
          </el-table-column>
        </el-table-column>
        <el-table-column label="生产车间" align="center">
          <el-table-column label="领料" align="center">
            <el-table-column label="数量" width="64" align="center">
              <template #default="{ row }"><b class="delta-out">{{ row.periodProductionIssueQty || 0 }}</b></template>
            </el-table-column>
            <el-table-column label="时间" width="92" align="center" show-overflow-tooltip>
              <template #default="{ row }"><span class="flow-dates">{{ row.periodProductionIssueDates || '—' }}</span></template>
            </el-table-column>
          </el-table-column>
          <el-table-column label="入库" align="center">
            <el-table-column label="数量" width="64" align="center">
              <template #default="{ row }"><b class="delta-in">{{ row.periodProductionInboundQty || 0 }}</b></template>
            </el-table-column>
            <el-table-column label="时间" width="92" align="center" show-overflow-tooltip>
              <template #default="{ row }"><span class="flow-dates">{{ row.periodProductionInboundDates || '—' }}</span></template>
            </el-table-column>
          </el-table-column>
        </el-table-column>
        <el-table-column label="出货" align="center">
          <el-table-column label="数量" width="64" align="center">
            <template #default="{ row }"><b class="delta-out">{{ row.periodShipmentQty || 0 }}</b></template>
          </el-table-column>
          <el-table-column label="时间" width="92" align="center" show-overflow-tooltip>
            <template #default="{ row }"><span class="flow-dates">{{ row.periodShipmentDates || '—' }}</span></template>
          </el-table-column>
        </el-table-column>
        <el-table-column :label="hasFlowDateRange ? '月末结存' : '结存数'" width="90" align="center">
          <template #default="{ row }">
            <span :class="(hasFlowDateRange ? row.periodClosingQty : row.balanceQty) > 0 ? 'num-ok' : 'num-zero'">
              {{ hasFlowDateRange ? (row.periodClosingQty || 0) : row.balanceQty }}{{ unitLabel(row.unit) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="185" align="center" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button
                size="small" v-permission.disable="'dull-stock:update'" link type="primary" :icon="EditPen"
                @click="openForm(row)"
              >编辑</el-button>
              <el-button
                size="small" v-permission.disable="'dull-stock:stock'" link type="primary" :icon="Sort"
                @click="openFlow(row)"
              >库存变动</el-button>
              <el-tooltip
                :disabled="(row.periodShipmentQty || 0) > 0"
                :content="hasFlowDateRange ? '所选月份暂无出货记录，无法打印送货单' : '暂无出货记录，登记出货后才可打印送货单'"
                placement="top"
              >
                <span class="action-tooltip-wrap">
                  <el-button
                    size="small" v-permission.disable="'dull-stock:print'" link type="primary" :icon="Printer"
                    :disabled="(row.periodShipmentQty || 0) <= 0" @click="openShipmentNotes(row)"
                  >送货单</el-button>
                </span>
              </el-tooltip>
              <el-button
                size="small" v-permission.disable="'dull-stock:delete'" link type="danger" :icon="Delete"
                @click="onDelete(row)"
              >删除</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination class="pager" :total="total" v-model:page="query.page" v-model:size="query.pageSize" @change="load" />
    </el-card>

    <!-- 同一批货可能分多次出货：从主列表进入后先选择本次要打印的出货流水。 -->
    <el-dialog
      v-model="shipmentDialogVisible"
      :title="`${shipmentRow?.productModel || shipmentRow?.itemNo || '呆滞品'}－选择出货送货单`"
      width="680px"
    >
      <el-table :data="shipmentFlows" v-loading="shipmentLoading" border stripe>
        <el-table-column label="出货日期" prop="flowDate" width="120" align="center" />
        <el-table-column label="出货数量" width="110" align="center">
          <template #default="{ row }">{{ row.quantity }} {{ shipmentRow ? unitLabel(shipmentRow.unit) : '' }}</template>
        </el-table-column>
        <el-table-column label="说明" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.reason || '—' }}</template>
        </el-table-column>
        <el-table-column label="备注" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" align="center">
          <template #default="{ row }">
            <el-button link type="primary" :icon="Printer" @click="openDeliveryNote(row)">打印</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button size="small" @click="shipmentDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 建档 / 编辑 -->
    <el-dialog v-model="formVisible" :title="editRow ? '编辑呆滞品' : '新增呆滞品'" width="760px">
      <el-alert
        v-if="editRow && hasFlow"
        type="info" :closable="false" show-icon class="mb12"
        title="该记录已有库存变动流水，单位不可再改（改了历史流水记的数含义就变了）；库存数只能靠逐笔登记变动"
      />
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" size="small">
        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="建档日期" prop="filingDate">
              <el-date-picker
                v-model="form.filingDate" type="date" value-format="YYYY-MM-DD"
                placeholder="请选择建档日期" style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="产品代码" prop="itemNo">
              <el-input v-model="form.itemNo" placeholder="如 53#" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="客户">
              <el-select
                v-model="form.customerName" filterable allow-create default-first-option
                clearable placeholder="选填，可选择或直接输入" style="width: 100%"
              >
                <el-option v-for="c in customers" :key="c.id" :label="c.customerName" :value="c.customerName" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="生产单号">
              <el-input v-model="form.productionNo" placeholder="选填，填写原生产单号" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="产品类型">
              <!-- 多选不折叠（2026-08-13）：选了什么要一眼看全，折叠成 +N 反而要点开确认 -->
              <el-select v-model="form.productTypes" multiple placeholder="可多选" style="width: 100%">
                <el-option v-for="o in PRODUCT_TYPE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="节数">
              <el-select v-model="form.railSection" clearable style="width: 100%">
                <el-option v-for="o in RAIL_SECTION_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="规格(mm)">
              <el-input-number v-model="form.dimensionMm" :min="0" :precision="0" :controls="false" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="料厚">
              <el-input v-model="form.materialThickness" maxlength="32" placeholder="如 2.00、1.2×1.0×1.2" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="表面处理">
              <el-select v-model="form.surfaceType" clearable style="width: 100%" @change="onSurfaceChange">
                <el-option v-for="o in surfaceDict" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col v-if="colorEnabled" :span="12">
            <el-form-item label="颜色">
              <el-select
                v-model="form.color" filterable allow-create default-first-option
                clearable placeholder="可选择或直接输入" style="width: 100%"
              >
                <el-option v-for="o in colorDict" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="边别">
              <el-select
                v-model="form.side"
                clearable
                :disabled="!sideEnabled"
                :placeholder="sideEnabled ? '请选择左右' : '非卡口不可选'"
                style="width: 100%"
              >
                <el-option v-for="o in SIDE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="单位" prop="unit">
              <!-- 复选框形态的单选（2026-08-13）：勾另一个即切换；点已勾中的不放开——
                   单位必选其一，不允许空。有流水后禁改的规则不变 -->
              <el-checkbox
                v-for="o in UNIT_OPTIONS" :key="o.value"
                :model-value="form.unit === o.value"
                :disabled="hasFlow"
                @change="(v: any) => onUnitCheck(o.value, v)"
              >{{ o.label }}</el-checkbox>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="期初数" prop="openingQty">
              <el-input-number v-model="form.openingQty" :min="0" :precision="0" :controls="false" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="产品型号">
              <el-input v-model="form.productModel" placeholder="留空按 产品代码+类型 自动拼" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注">
              <el-input v-model="form.remark" maxlength="255" show-word-limit />
            </el-form-item>
          </el-col>
        </el-row>
        <div v-if="editRow" class="preview" :class="{ bad: previewBalance < 0 }">
          结存数将变为：<b>{{ previewBalance }}</b> {{ unitLabel(form.unit) }}
          （期初 {{ form.openingQty || 0 }} + 入库 {{ editRow.inboundQty }} − 出库 {{ editRow.outboundQty }}）
          {{ previewBalance < 0 ? '——为负，将被拒绝' : '' }}
        </div>
      </el-form>
      <template #footer>
        <el-button size="small" @click="formVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="onSubmitForm">确定</el-button>
      </template>
    </el-dialog>

    <!-- 登记库存变动 -->
    <el-dialog v-model="flowVisible" title="登记库存变动" width="560px">
      <el-alert
        v-if="flowRow"
        type="info" :closable="false" show-icon class="mb12"
        :title="`${flowRow.itemNo}${flowRow.productModel ? ' / ' + flowRow.productModel : ''} — 当前结存 ${flowRow.balanceQty} ${unitLabel(flowRow.unit)}`"
      />
      <el-form ref="flowFormRef" :model="flowForm" :rules="flowRules" label-width="100px" size="small">
        <el-form-item label="业务类型" prop="flowType">
          <el-select v-model="flowForm.flowType" style="width: 100%">
            <el-option
              v-for="o in DULL_STOCK_FLOW_TYPE_OPTIONS"
              :key="o.value" :label="o.label" :value="o.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="发生日期" prop="flowDate">
          <el-date-picker v-model="flowForm.flowDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="数量" prop="quantity">
          <!-- 单位内嵌在输入框右侧（2026-08-13），不再另起一行文案 -->
          <el-input-number v-model="flowForm.quantity" :min="1" :precision="0" :controls="false" style="width: 100%">
            <template #suffix>{{ flowRow ? unitLabel(flowRow.unit) : '' }}</template>
          </el-input-number>
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="flowForm.reason" maxlength="255" placeholder="选填，如领料车间、退货原因等" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="flowForm.remark" maxlength="255" show-word-limit />
        </el-form-item>
        <div class="preview" :class="{ bad: previewFlowBalance < 0 }">
          变动后结存：<b>{{ previewFlowBalance }}</b> {{ flowRow ? unitLabel(flowRow.unit) : '' }}
          {{ previewFlowBalance < 0 ? '（为负，将被拒绝）' : '' }}
        </div>
      </el-form>
      <template #footer>
        <el-button size="small" @click="flowVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="onSubmitFlow">确定</el-button>
      </template>
    </el-dialog>

    <!--
      批量导入。呆滞品刻意不设唯一键（同产品代码同客户先后剩下的几批要各建各的档），
      所以导入是「每行新建一条」，重复导入会重复建档——提示条里必须说清楚。
    -->
    <import-dialog
      v-model="importVisible"
      title="批量导入呆滞品"
      tip="模板中的客户、生产单号均可留空，建档日期必填；每一行都会新建一条呆滞品记录（本模块允许同产品代码多批，不会合并、不会覆盖）；整批校验通过才入库，任一行有问题会列出行号并整批回滚"
      confirm-text="即将导入文件「{n}」，每一行都会<b>新建</b>一条呆滞品记录。<br/>同一份文件重复导入会<b>重复建档</b>，请确认没有导过。"
      :download-template="downloadDullStockTemplate"
      :do-import="importDullStock"
      :summarize="(r: any) => `导入成功：新建 ${r.created} 条呆滞品记录`"
      @done="reload"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import {
  Search, Plus, EditPen, Delete, Sort, InfoFilled, Upload, Download, Printer,
} from '@element-plus/icons-vue';
import {
  getDullStockList,
  getDullStockSummary,
  getDullStockFlows,
  createDullStock,
  updateDullStock,
  deleteDullStock,
  createDullStockFlow,
  deleteDullStockFlow,
  downloadDullStockExport,
  downloadDullStockTemplate,
  importDullStock,
  type DullStockRow,
  type DullStockFlowRow,
} from '@/api/dull-stock';
import ImportDialog from '@/components/ImportDialog.vue';
import { useExcelExport } from '@/composables/useExcelExport';
import { useDebouncedSearch } from '@/composables/useDebouncedSearch';
import { getAllCustomers, type CustomerItem } from '@/api/customer';
import {
  SIDE_OPTIONS,
  RAIL_SECTION_OPTIONS,
  PRODUCT_TYPE_OPTIONS,
  UNIT_OPTIONS,
  // 数值对象在 dict.ts 里统一以 _VALUE 结尾（§4.1 命名约定）
  STOCK_DIRECTION_VALUE as STOCK_DIRECTION,
  SURFACE_DEFAULT_COLOR,
  sideLabel,
  normalizeProductTypes,
  parseProductTypes,
  hasSocket,
  labelOf,
} from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import { formatBusinessDate } from '@/utils/date';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppActions from '@/components/AppActions.vue';
import ColorTag from '@/components/ColorTag.vue';
import {
  DULL_STOCK_FLOW_TYPE,
  DULL_STOCK_FLOW_TYPE_OPTIONS,
  dullStockFlowDirection,
  dullStockFlowTypeLabel,
} from '@hb-oms/shared';

/**
 * 呆滞品**自己的**颜色开关（系统配置 → 业务字段 → 呆滞品颜色）。
 *
 * 刻意不用全局的 `colorEnabled`：呆滞品建档时表面处理与颜色是配套联动带出的
 * （电泳→黑色 / 喷涂→白色），颜色是这本账辨认货物的主要依据；全局颜色开关
 * 是给「订单/外发口径用不到颜色」的厂关的。两者各管各的，**不要相与**。
 */
const { dullStockColorEnabled: colorEnabled } = useFeatureFlags();
const router = useRouter();

const today = () => formatBusinessDate(new Date());
const unitLabel = (unit: string) => labelOf(UNIT_OPTIONS, unit);

const loading = ref(false);
const saving = ref(false);
const list = ref<DullStockRow[]>([]);
const total = ref(0);
const summary = ref({
  rows: 0,
  totalBalancePcs: 0,
  periodInboundPcs: 0,
  periodOutboundPcs: 0,
  periodOpeningPcs: 0,
  periodCustomerReturnPcs: 0,
  periodProductionIssuePcs: 0,
  periodProductionInboundPcs: 0,
  periodShipmentPcs: 0,
});
const flowMonth = ref('');
const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  surfaceType: undefined as string | undefined,
  side: undefined as string | undefined,
  flowDateFrom: undefined as string | undefined,
  flowDateTo: undefined as string | undefined,
  onlyInStock: false,
});
const hasFlowDateRange = computed(() => !!query.flowDateFrom && !!query.flowDateTo);

const surfaceDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('surface_type').then((rows: any[]) => {
  surfaceDict.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});
const colorDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('surface_color').then((rows: any[]) => {
  colorDict.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});
const dictLabel = (dict: Array<{ label: string; value: string }>, v: string) =>
  dict.find((d) => d.value === v)?.label || v || '—';

const customers = ref<CustomerItem[]>([]);
getAllCustomers().then((rows) => (customers.value = rows));

async function load() {
  loading.value = true;
  try {
    const [res, sum] = await Promise.all([
      getDullStockList({ ...query }),
      getDullStockSummary({ ...query }),
    ]);
    list.value = res.list;
    total.value = res.total;
    summary.value = sum;
  } finally {
    loading.value = false;
  }
}
function reload() {
  query.page = 1;
  load();
}
function onFlowMonthChange(value: string | null) {
  if (value) {
    const [year, month] = value.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    query.flowDateFrom = `${value}-01`;
    query.flowDateTo = `${value}-${String(lastDay).padStart(2, '0')}`;
    query.onlyInStock = false;
  } else {
    query.flowDateFrom = undefined;
    query.flowDateTo = undefined;
  }
  dropFlowCache();
  runKeywordSearch();
}
const {
  schedule: scheduleKeywordSearch,
  flush: runKeywordSearch,
  cancel: cancelKeywordSearch,
} = useDebouncedSearch(reload);

/** 清空查询条件，恢复全量档案并返回第一页。 */
function resetFilters() {
  cancelKeywordSearch();
  flowMonth.value = '';
  Object.assign(query, {
    page: 1,
    keyword: '',
    surfaceType: undefined,
    side: undefined,
    flowDateFrom: undefined,
    flowDateTo: undefined,
    onlyInStock: false,
  });
  dropFlowCache();
  load();
}
load();
onActivated(load);

/* ===== 批量导入 / 导出 ===== */
const importVisible = ref(false);
const { exporting, exportWithConfirm } = useExcelExport();

const onExport = () => exportWithConfirm({
  name: '呆滞品',
  // 实查而不是用页面上的 summary：筛选条件改了但没点「查询」时汇总是旧的
  getCount: async () => (await getDullStockSummary({ ...query })).rows,
  run: () => downloadDullStockExport({ ...query }),
});

/* ===== 展开行：库存变动流水（按需加载） ===== */
const flows = reactive<Record<number, DullStockFlowRow[]>>({});
const flowLoadingId = ref<number | null>(null);

async function onExpand(row: DullStockRow, expandedRows: DullStockRow[]) {
  const isOpen = Array.isArray(expandedRows)
    ? expandedRows.some((r) => r.id === row.id)
    : !!expandedRows;
  if (!isOpen || flows[row.id]) return;
  await loadFlows(row.id);
}

async function loadFlows(id: number) {
  flowLoadingId.value = id;
  try {
    const res = await getDullStockFlows({
      dullId: id,
      pageSize: 100,
      flowDateFrom: query.flowDateFrom,
      flowDateTo: query.flowDateTo,
    });
    flows[id] = res.list;
  } finally {
    flowLoadingId.value = null;
  }
}

/** 改过数的行，展开缓存已过期，清掉让下次展开重新拉 */
function dropFlowCache(id?: number) {
  if (id != null) delete flows[id];
  else Object.keys(flows).forEach((k) => delete flows[Number(k)]);
}

async function onDeleteFlow(row: DullStockRow, flow: DullStockFlowRow) {
  await ElMessageBox.confirm(
    `确定删除这笔 ${flow.flowDate} 的${dullStockFlowTypeLabel(flow.flowType)} ${flow.quantity} ${unitLabel(row.unit)} 吗？删除后结存会跟着回滚。`,
    '删除库存变动流水',
    { type: 'warning' },
  );
  const res = await deleteDullStockFlow(flow.id);
  ElMessage.success(`已删除，当前结存 ${res.balanceQty} ${unitLabel(row.unit)}`);
  await loadFlows(row.id);
  load();
}

function openDeliveryNote(flow: DullStockFlowRow) {
  const { href } = router.resolve({ path: '/dull-stock/delivery-note', query: { id: flow.id } });
  window.open(href, '_blank', 'noopener');
}

/* ===== 主列表送货单入口 ===== */
const shipmentDialogVisible = ref(false);
const shipmentLoading = ref(false);
const shipmentRow = ref<DullStockRow | null>(null);
const shipmentFlows = ref<DullStockFlowRow[]>([]);

async function openShipmentNotes(row: DullStockRow) {
  if (!row.customerName?.trim()) {
    ElMessage.warning('打印送货单前，请先编辑该呆滞品并补充客户');
    return;
  }
  shipmentRow.value = row;
  shipmentFlows.value = [];
  shipmentDialogVisible.value = true;
  shipmentLoading.value = true;
  try {
    const res = await getDullStockFlows({
      dullId: row.id,
      pageSize: 1000,
      flowDateFrom: query.flowDateFrom,
      flowDateTo: query.flowDateTo,
    });
    const shipments = res.list.filter(
      (flow) => flow.flowType === DULL_STOCK_FLOW_TYPE.SHIPMENT,
    );
    if (!shipments.length) {
      shipmentDialogVisible.value = false;
      ElMessage.warning(hasFlowDateRange.value ? '所选月份没有可打印的出货记录' : '该呆滞品暂无出货记录');
      return;
    }
    shipmentFlows.value = shipments;
  } finally {
    shipmentLoading.value = false;
  }
}

/* ===== 建档 / 编辑 ===== */
const formVisible = ref(false);
const editRow = ref<DullStockRow | null>(null);
const formRef = ref<FormInstance>();
const form = reactive({
  itemNo: '',
  customerName: '',
  productionNo: '',
  productModel: '',
  productTypes: [] as string[],
  railSection: '' as string | undefined,
  dimensionMm: 0,
  materialThickness: '',
  surfaceType: 'electrophoresis',
  color: '黑色',
  side: '' as string | undefined,
  // 默认「套」（2026-08-13 使用部门要求；车间盘点习惯按套报数）
  unit: 'set',
  filingDate: today(),
  openingQty: 0,
  remark: '',
});

/**
 * 单位复选框的单选语义：勾另一个 → 切换；点掉当前已勾中的 → 忽略。
 * 单位必选其一，允许取消会出现「两个都没勾」的空档。
 */
function onUnitCheck(value: string, checked: unknown) {
  if (checked) form.unit = value;
}

const rules: FormRules = {
  itemNo: [{ required: true, message: '请填写产品代码', trigger: 'blur' }],
  unit: [{ required: true, message: '请选择单位', trigger: 'change' }],
  filingDate: [{ required: true, message: '请选择建档日期', trigger: 'change' }],
  openingQty: [{ required: true, message: '请填写期初数', trigger: 'blur' }],
};

/** 已有流水的记录不许改单位 */
const hasFlow = computed(
  () => !!editRow.value && (editRow.value.inboundQty > 0 || editRow.value.outboundQty > 0),
);

/** 边别只在产品类型含「卡口」时可用（含卡口才分左右） */
const sideEnabled = computed(() => hasSocket(form.productTypes));

watch(sideEnabled, (on) => {
  if (!on) form.side = '';
});

const previewBalance = computed(() =>
  editRow.value
    ? (form.openingQty || 0) + editRow.value.inboundQty - editRow.value.outboundQty
    : form.openingQty || 0,
);

/**
 * 表面处理联动颜色：只在颜色为空、或还是上一个表面处理带出的默认色时才改写，
 * 用户手工填过的颜色不能被覆盖。
 */
function onSurfaceChange(next: string) {
  const preset = SURFACE_DEFAULT_COLOR[next];
  if (!preset) return;
  const isUntouched =
    !form.color || Object.values(SURFACE_DEFAULT_COLOR).includes(form.color);
  if (isUntouched) form.color = preset;
}

function openForm(row?: DullStockRow) {
  editRow.value = row ?? null;
  form.itemNo = row?.itemNo ?? '';
  form.customerName = row?.customerName ?? '';
  form.productionNo = row?.productionNo ?? '';
  form.productModel = row?.productModel ?? '';
  form.productTypes = parseProductTypes(row?.productType ?? '');
  form.railSection = row?.railSection ?? '';
  form.dimensionMm = row?.dimensionMm ?? 0;
  form.materialThickness = row?.materialThickness ?? '';
  // 新增默认「电泳 / 黑色」——厂里呆滞品绝大多数是这个搭配
  form.surfaceType = row?.surfaceType ?? 'electrophoresis';
  form.color = row ? row.color : '黑色';
  form.side = row?.side ?? '';
  form.unit = row?.unit ?? 'piece';
  form.filingDate = row?.filingDate ?? today();
  form.openingQty = row?.openingQty ?? 0;
  form.remark = row?.remark ?? '';
  formVisible.value = true;
  // 刚打开就飘红不合理（用户还没动手）：清掉上一次遗留的校验状态。
  nextTick(() => {
    formRef.value?.clearValidate();
  });
}

async function onSubmitForm() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    const payload = {
      itemNo: form.itemNo.trim(),
      customerName: form.customerName?.trim() || undefined,
      productionNo: form.productionNo?.trim() || undefined,
      productModel: form.productModel?.trim() || undefined,
      // 组合串必须规范化后再传，否则「普通,自锁」与「自锁,普通」在筛选与型号上表现不一致
      productType: normalizeProductTypes(form.productTypes),
      railSection: form.railSection || undefined,
      dimensionMm: form.dimensionMm || undefined,
      materialThickness: form.materialThickness.trim() || undefined,
      surfaceType: form.surfaceType || undefined,
      color: form.color || undefined,
      side: sideEnabled.value ? (form.side || '') : '',
      unit: form.unit,
      filingDate: form.filingDate,
      openingQty: form.openingQty || 0,
      remark: form.remark || undefined,
    };
    const res = editRow.value
      ? await updateDullStock(editRow.value.id, payload)
      : await createDullStock(payload);
    ElMessage.success(`${editRow.value ? '已保存' : '已新增'}，当前结存 ${res.balanceQty} ${unitLabel(form.unit)}`);
    formVisible.value = false;
    dropFlowCache(editRow.value?.id);
    load();
  } finally {
    saving.value = false;
  }
}

async function onDelete(row: DullStockRow) {
  await ElMessageBox.confirm(
    `确定删除呆滞品「${row.itemNo}${row.productModel ? ' / ' + row.productModel : ''}」吗？`,
    '删除呆滞品',
    { type: 'warning' },
  );
  await deleteDullStock(row.id);
  ElMessage.success('已删除');
  dropFlowCache(row.id);
  load();
}

/* ===== 登记库存变动 ===== */
const flowVisible = ref(false);
const flowRow = ref<DullStockRow | null>(null);
const flowFormRef = ref<FormInstance>();
const flowForm = reactive({
  flowType: DULL_STOCK_FLOW_TYPE.CUSTOMER_RETURN as string,
  quantity: 1,
  flowDate: today(),
  reason: '',
  remark: '',
});

const flowRules: FormRules = {
  flowType: [{ required: true, message: '请选择业务类型', trigger: 'change' }],
  quantity: [{ required: true, message: '请填写数量', trigger: 'blur' }],
  flowDate: [{ required: true, message: '请选择发生日期', trigger: 'change' }],
};

const previewFlowBalance = computed(() => {
  if (!flowRow.value) return 0;
  return flowRow.value.balanceQty
    + dullStockFlowDirection(flowForm.flowType) * (flowForm.quantity || 0);
});

function openFlow(row: DullStockRow) {
  flowRow.value = row;
  flowForm.flowType = DULL_STOCK_FLOW_TYPE.CUSTOMER_RETURN;
  flowForm.quantity = 1;
  flowForm.flowDate = today();
  flowForm.reason = '';
  flowForm.remark = '';
  flowVisible.value = true;
}

async function onSubmitFlow() {
  await flowFormRef.value?.validate();
  if (!flowRow.value) return;
  saving.value = true;
  try {
    const res = await createDullStockFlow(flowRow.value.id, {
      flowType: flowForm.flowType,
      quantity: flowForm.quantity,
      flowDate: flowForm.flowDate,
      reason: flowForm.reason.trim() || undefined,
      remark: flowForm.remark || undefined,
    });
    ElMessage.success(`已登记，当前结存 ${res.balanceQty} ${unitLabel(flowRow.value.unit)}`);
    flowVisible.value = false;
    dropFlowCache(flowRow.value.id);
    load();
  } finally {
    saving.value = false;
  }
}
</script>

<script lang="ts">
export default { name: 'DullStock' };
</script>

<style scoped lang="scss">
.toolbar {
  display: flex; align-items: center; margin-bottom: 12px;
  .tip {
    flex: 1; min-width: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-size: 12px; color: var(--el-text-color-secondary);
    b { color: var(--el-text-color-primary); }
    .el-icon { vertical-align: -2px; margin-right: 4px; }
  }
}
.query-actions :deep(.el-form-item__content) {
  gap: 8px;
}
.filter-second-row {
  display: flex; align-items: center; justify-content: space-between; gap: 10px 16px; flex-wrap: wrap;
  margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--el-border-color-lighter);
}
.business-actions {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.action-tooltip-wrap {
  display: inline-flex;
  margin-left: clamp(5px, 0.375rem, 7px);
}
.filter-summary {
  margin-left: auto; text-align: right; white-space: nowrap;
  font-size: 12px; color: var(--el-text-color-secondary);
  b { color: var(--el-color-primary); font-size: 14px; }
}
.flow-dates {
  display: block;
  margin-top: 2px;
  color: var(--el-text-color-secondary);
  font-size: 11px;
  font-weight: normal;
  line-height: 1.25;
}
.pager { margin-top: 12px; }
.mb12 { margin-bottom: 12px; }
.preview {
  margin: 4px 0 0 90px; font-size: 13px; color: var(--el-color-primary);
  &.bad { color: var(--el-color-danger); }
}
.num-ok { color: var(--el-color-success); font-weight: 600; }
.num-zero { color: var(--el-text-color-placeholder); }
.delta-in { color: var(--el-color-success); font-weight: 600; }
.delta-out { color: var(--el-color-danger); font-weight: 600; }
.expand-wrap { padding: 8px 16px 8px 56px; }
.expand-grid {
  width: 100%; max-width: 1200px; border-collapse: collapse; font-size: 13px;
  th, td { border: 1px solid var(--el-border-color); padding: 5px 10px; text-align: left; }
  th { background: var(--el-fill-color-light); font-weight: 600; text-align: center; white-space: nowrap; }
  .c { text-align: center; }
}
</style>
