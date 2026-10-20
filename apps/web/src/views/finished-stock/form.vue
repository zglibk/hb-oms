<template>
  <div class="page">
    <el-card shadow="never" v-loading="pageLoading">
      <div class="form-header">
        <div class="form-title">
          <el-button size="small" :icon="Back" @click="goBack">返回列表</el-button>
          <span class="title-text">{{ editId ? '编辑' : '新增' }}{{ bizLabel }}</span>
          <span v-if="docNo" class="title-sub">{{ docNo }}</span>
        </div>
        <div>
          <el-button size="small" @click="goBack">取消</el-button>
          <el-button size="small" type="primary" :loading="saving" :disabled="!!notOwnerTip" @click="onSave">保存草稿</el-button>
        </div>
      </div>
      <!-- 不是自己制的草稿：只读（服务端另有硬校验） -->
      <el-alert v-if="notOwnerTip" type="error" :closable="false" show-icon class="owner-alert" :title="notOwnerTip" />

      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" size="small">
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12" :md="6">
            <el-form-item label="业务类型">
              <el-tag :type="tagTypeOf(FINISHED_BIZ_TYPE_OPTIONS, form.bizType)">{{ bizLabel }}</el-tag>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="6">
            <el-form-item label="单据日期" prop="docDate">
              <el-date-picker v-model="form.docDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col v-if="isInbound" :xs="24" :sm="12" :md="6">
            <!-- 展示名 2026-08-13 由「班组」改为「车间」，字段仍是 workTeam（命名稳定性约定）；
                 选项走 assembly_workshop 字典（装一~装九），历史自由文本值原样回显 -->
            <el-form-item label="车间">
              <el-select v-model="form.workTeam" clearable placeholder="选填，供追溯" style="width: 100%">
                <el-option v-for="o in workshopDict" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-form-item label="备注">
              <el-input v-model="form.remark" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-alert
          v-if="isSaleOutbound"
          class="outbound-guide"
          type="info"
          :closable="false"
          show-icon
          title="销售出库单就是本次实际送货：可按订单号筛选，只勾选本次发货的产品；“本次发货数”需逐行填写，不会自动带出当前结存。保存后送货单只打印本单明细，剩余数量请下次新建销售出库单继续发货。卡口产品按左、右分别填写。"
        />

        <div class="section-title">
          出入库明细
          <el-button size="small" type="primary" plain :icon="Plus" class="ml12" @click="openPicker">添加产品</el-button>
          <span class="sec-sum">合计 <b>{{ totalQty }}</b> 支</span>
        </div>

        <el-table :data="form.items" border stripe size="small" empty-text="请点击「添加产品」选择要出入库的产品">
          <el-table-column type="index" label="#" width="46" align="center" />
          <el-table-column label="订单号" prop="orderNo" width="130" show-overflow-tooltip />
          <el-table-column label="生产单号" prop="productionNo" width="115" show-overflow-tooltip />
          <el-table-column label="产品型号" prop="productModel" min-width="150" show-overflow-tooltip />
          <el-table-column label="规格" prop="dimensionText" width="95" align="center" />
          <el-table-column label="表面处理" width="95" align="center">
            <template #default="{ row }">
              <color-tag v-if="row.surfaceType" :seed="row.surfaceType">{{ surfaceLabel(row.surfaceType) }}</color-tag>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <!-- 「颜色」是可停用的业务字段（§5.7），停用时整列不显示 -->
          <el-table-column v-if="colorEnabled" label="颜色" width="80" align="center">
            <template #default="{ row }">
              <color-tag v-if="row.color" :seed="row.color">{{ row.color }}</color-tag>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column label="边别" width="70" align="center">
            <template #default="{ row }">
              <color-tag v-if="row.side" :seed="row.side">{{ sideLabel(row.side) }}</color-tag>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column :label="limitLabel" width="110" align="center">
            <template #default="{ row }">
              <span :class="row.limit > 0 ? 'lim-ok' : 'lim-zero'">{{ row.limit }}</span>
            </template>
          </el-table-column>
          <el-table-column v-if="isSaleOutbound" label="订单应发(支)" width="110" align="center">
            <template #default="{ row }">{{ row.orderedQty }}</template>
          </el-table-column>
          <el-table-column v-if="isSaleOutbound" label="累计出库(支)" width="110" align="center">
            <template #default="{ row }">{{ row.outboundQty }}</template>
          </el-table-column>
          <el-table-column v-if="isSaleOutbound" label="发货欠数(支)" width="110" align="center">
            <template #default="{ row }">
              <span :class="row.deliveryOwed > 0 ? 'lim-ok' : 'lim-zero'">{{ row.deliveryOwed }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="isSaleOutbound ? '本次发货(支)' : '数量(支)'" :width="isSaleOutbound ? 190 : 130" align="center">
            <template #default="{ row }">
              <div v-if="isSaleOutbound" class="shipment-qty">
                <el-input-number v-model="row.quantity" :min="1" :precision="0" :step="1" :controls="false" style="width: 100%" />
                <span class="shipment-qty__reference" :class="shipmentQtyReferenceClass(row)">
                  {{ shipmentQtyReferenceText(row) }} · 库存 {{ row.limit }} 支
                  <template v-if="row.quantity && row.quantity > row.limit"> · 超库存，无法确认</template>
                  <template v-else-if="row.quantity && row.quantity > row.deliveryOwed"> · 超待发，请核对</template>
                </span>
              </div>
              <el-input-number v-else v-model="row.quantity" :min="1" :precision="0" :step="1" :controls="false" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="120">
            <template #default="{ row }"><el-input v-model="row.remark" /></template>
          </el-table-column>
          <el-table-column label="操作" width="70" align="center" fixed="right">
            <template #default="{ $index }">
              <el-button size="small" link type="danger" :icon="Delete" @click="form.items.splice($index, 1)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div v-if="overRows.length" class="over-tip">
          <el-icon><WarningFilled /></el-icon>
          以下行超过{{ limitLabel }}，确认时会被后端拒绝：
          {{ overRows.map((r) => `${r.productModel}${r.side ? ` ${sideLabel(r.side)}边` : ''}（${r.quantity} > ${r.limit}）`).join('；') }}
        </div>
        <div v-if="overOrderRows.length" class="over-tip">
          <el-icon><WarningFilled /></el-icon>
          以下行本次发货数超过订单待发数，请核对；该提醒不拦截合理超发，库存充足时仍可保存并确认：
          {{ overOrderRows.map((r) => `${r.productModel}${r.side ? ` ${sideLabel(r.side)}边` : ''}（${r.quantity} > ${r.deliveryOwed}）`).join('；') }}
        </div>
      </el-form>
    </el-card>

    <!-- 产品选择器：按边别展开成可选行（成品是装配产出的整套滑轨，锚订单产品行） -->
    <el-dialog
      v-model="pickerVisible"
      title="选择订单产品"
      width="min(1180px, 94vw)"
      top="4vh"
      @open="initializePicker"
    >
      <el-form :model="pickerQuery" size="small" class="picker-filters" @submit.prevent>
        <el-form-item label="客户">
          <el-select
            v-model="pickerQuery.customerName"
            clearable
            filterable
            :loading="pickerLoading"
            placeholder="全部"
          >
            <el-option v-for="name in pickerFilterOptions.customerNames" :key="name" :label="name" :value="name" />
          </el-select>
        </el-form-item>
        <el-form-item label="订单号">
          <el-input v-model="pickerQuery.orderNo" clearable placeholder="请输入订单号" @keyup.enter="loadPickerData" />
        </el-form-item>
        <el-form-item label="生产单号">
          <el-input v-model="pickerQuery.productionNo" clearable placeholder="请输入生产单号" @keyup.enter="loadPickerData" />
        </el-form-item>
        <el-form-item label="产品型号">
          <el-select-v2
            v-model="pickerQuery.productModel"
            clearable
            filterable
            :loading="pickerLoading"
            :options="productModelSelectOptions"
            popper-class="stock-picker-model-popper"
            placeholder="全部"
          />
        </el-form-item>
        <el-form-item label="产品类型">
          <el-select
            v-model="pickerQuery.productType"
            clearable
            filterable
            :loading="pickerLoading"
            placeholder="全部"
          >
            <el-option
              v-for="value in pickerFilterOptions.productTypes"
              :key="value"
              :label="productTypeLabel(value)"
              :value="value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="表面处理">
          <el-select
            v-model="pickerQuery.surfaceType"
            clearable
            :loading="pickerLoading"
            placeholder="全部"
          >
            <el-option
              v-for="value in pickerFilterOptions.surfaceTypes"
              :key="value"
              :label="surfaceLabel(value)"
              :value="value"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="colorEnabled" label="颜色">
          <el-select
            v-model="pickerQuery.color"
            clearable
            filterable
            :loading="pickerLoading"
            placeholder="全部"
          >
            <el-option v-for="value in pickerFilterOptions.colors" :key="value" :label="value" :value="value" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词" class="picker-keyword">
          <el-input v-model="pickerQuery.keyword" clearable placeholder="请输入关键词" @keyup.enter="loadPickerData" />
        </el-form-item>
        <el-form-item class="picker-actions">
          <el-button type="primary" :icon="Search" @click="loadPickerData">查询</el-button>
          <el-button @click="resetPickerQuery">重置</el-button>
        </el-form-item>
      </el-form>
      <div class="picker-tip">
        <template v-if="isInbound">「可入库量」= 已完成装配 − 已入库，为 0 说明装配还没录</template>
        <template v-else>请只勾选本次实际发货的产品；加入明细后必须逐行填写“本次发货数”，不会自动按当前结存带出。</template>
        <span v-if="isSaleOutbound && selectedCustomerName" class="picker-customer-tip">本单已选择客户：{{ selectedCustomerName }}；只能继续选择该客户产品。</span>
      </div>
      <el-table ref="pickerTableRef" :data="pickerPageRows" :row-key="pickerRowKey" v-loading="pickerLoading"
        element-loading-text="正在加载全部订单产品..." border stripe size="small" height="58vh"
        @selection-change="onPickChange">
        <el-table-column type="selection" width="42" :selectable="isSelectable" reserve-selection />
        <el-table-column type="index" label="序号" width="56" align="center" :index="pickerRowIndex" />
        <el-table-column label="订单号" prop="orderNo" width="130" show-overflow-tooltip />
        <el-table-column label="客户" prop="customerName" width="110" show-overflow-tooltip />
        <el-table-column label="生产单号" prop="productionNo" width="115" show-overflow-tooltip />
        <el-table-column label="产品型号" prop="productModel" min-width="150" show-overflow-tooltip />
        <el-table-column label="规格" prop="dimensionText" width="95" align="center" />
        <!-- 选货时也要看得到表面处理与颜色：同货号不同表面处理是两批货，选错了要冲销 -->
        <el-table-column label="表面处理" width="95" align="center">
          <template #default="{ row }">
            <color-tag v-if="row.surfaceType" :seed="row.surfaceType">{{ surfaceLabel(row.surfaceType) }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column v-if="colorEnabled" label="颜色" width="80" align="center">
          <template #default="{ row }">
            <color-tag v-if="row.color" :seed="row.color">{{ row.color }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="边别" width="70" align="center">
          <template #default="{ row }">
            <color-tag v-if="row.side" :seed="row.side">{{ sideLabel(row.side) }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column v-if="!isSaleOutbound" label="订单数" prop="qtyPcs" width="80" align="center" />
        <el-table-column v-if="isSaleOutbound" label="订单应发(支)" prop="orderedQty" width="105" align="center" />
        <el-table-column v-if="isSaleOutbound" label="累计出库(支)" prop="outboundQty" width="105" align="center" />
        <el-table-column v-if="isSaleOutbound" label="发货欠数(支)" width="105" align="center">
          <template #default="{ row }">
            <span :class="row.deliveryOwed > 0 ? 'lim-ok' : 'lim-zero'">{{ row.deliveryOwed }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="limitLabel" width="110" align="center">
          <template #default="{ row }">
            <span :class="row.limit > 0 ? 'lim-ok' : 'lim-zero'">{{ row.limit }}</span>
          </template>
        </el-table-column>
      </el-table>
      <app-pagination
        v-if="pickerRows.length > pickerPageSize"
        :total="pickerRows.length"
        v-model:page="pickerPage"
        v-model:size="pickerPageSize"
        :page-sizes="[20, 50, 100]"
      />
      <template #footer>
        <span class="picker-count">
          <span>查询到 {{ pickerRows.length }} 条符合条件的记录</span>
          <span>已选 {{ picked.length }} 行</span>
        </span>
        <el-button size="small" @click="pickerVisible = false">取消</el-button>
        <el-button size="small" type="primary" @click="confirmPick">添加到明细</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Back, Plus, Delete, Search, WarningFilled } from '@element-plus/icons-vue';
import {
  getFinishedDocDetail,
  getStockGroupOptions,
  createFinishedDoc,
  updateFinishedDoc,
  type StockGroupFilterOptions,
} from '@/api/finished-stock';
import {
  FINISHED_BIZ_TYPE,
  FINISHED_BIZ_TYPE_OPTIONS,
  labelOf,
  tagTypeOf,
  sideLabel,
  parseProductTypes,
} from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import {
  distinctPickerValues,
  pickerTextEquals,
  pickerTextIncludes,
} from '@/utils/local-picker';
import ColorTag from '@/components/ColorTag.vue';

const route = useRoute();
const router = useRouter();
const editId = ref<number | null>(route.query.id ? Number(route.query.id) : null);
const docNo = ref('');
const pageLoading = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();

interface ItemRow {
  orderProductId: number;
  side: string;
  orderNo: string | null;
  customerName: string | null;
  productionNo: string | null;
  productModel: string | null;
  dimensionText: string | null;
  /** 表面处理（字典 surface_type）与颜色：同货号不同表面处理是两批货，选货与核对都要看 */
  surfaceType: string | null;
  color: string | null;
  /** 入库=可入库量，出库=当前结存 */
  limit: number;
  /** 订单应发数（支；卡口已按左/右边别拆分） */
  orderedQty: number;
  /** 已确认销售出库数（支，红字冲销已抵扣） */
  outboundQty: number;
  /** 发货欠数（支；可为负数） */
  deliveryOwed: number;
  /** 新选明细先留空，必须由用户填本次数量；编辑态回填既有数量。 */
  quantity?: number;
  remark: string;
}

interface PickerRow extends ItemRow {
  productType: string | null;
  qtyPcs: number;
  searchText: string;
}

const form = reactive({
  bizType: (route.query.bizType as string) || FINISHED_BIZ_TYPE.INBOUND,
  docDate: new Date().toISOString().slice(0, 10),
  workTeam: '',
  remark: '',
  items: [] as ItemRow[],
});

/** 车间下拉（字典 assembly_workshop：装一~装九），与装配批次同一套选项 */
const workshopDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('assembly_workshop').then((rows: any[]) => {
  workshopDict.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});

/** 产品类型 / 表面处理字典：筛选项和明细都要显示中文；取不到时回原值 */
const productTypeDict = ref<Array<{ label: string; value: string }>>([]);
const surfaceDict = ref<Array<{ label: string; value: string }>>([]);
Promise.all([loadDict('product_type'), loadDict('surface_type')]).then(([pt, sf]) => {
  productTypeDict.value = pt.map((r: any) => ({ label: r.dictLabel, value: r.dictValue }));
  surfaceDict.value = sf.map((r: any) => ({ label: r.dictLabel, value: r.dictValue }));
});
function productTypeLabel(v: string | null | undefined): string {
  if (!v) return '—';
  return productTypeDict.value.find((o) => o.value === v)?.label ?? v;
}
function surfaceLabel(v: string | null | undefined): string {
  if (!v) return '—';
  return surfaceDict.value.find((o) => o.value === v)?.label ?? v;
}

/** 「颜色」是可停用的业务字段（§5.7） */
const { colorEnabled } = useFeatureFlags();

const rules: FormRules = {
  docDate: [{ required: true, message: '请选择单据日期', trigger: 'change' }],
};

const isInbound = computed(
  () => form.bizType === FINISHED_BIZ_TYPE.INBOUND || form.bizType === FINISHED_BIZ_TYPE.OPENING_BALANCE,
);
const isSaleOutbound = computed(() => form.bizType === FINISHED_BIZ_TYPE.SALE_OUTBOUND);
const bizLabel = computed(() => labelOf(FINISHED_BIZ_TYPE_OPTIONS, form.bizType));
const limitLabel = computed(() => (isInbound.value ? '可入库量' : '当前结存'));
const totalQty = computed(() => form.items.reduce((s, it) => s + (it.quantity || 0), 0));
const overRows = computed(() => form.items.filter((it) => (it.quantity || 0) > it.limit));
const overOrderRows = computed(() =>
  isSaleOutbound.value
    ? form.items.filter((it) => (it.quantity || 0) > it.deliveryOwed)
    : [],
);
const selectedCustomerName = computed(() =>
  isSaleOutbound.value ? String(form.items[0]?.customerName ?? '').trim() : '',
);

/** 销售出库填数时把最需要核对的待发量、结存和异常状态紧贴输入框展示。 */
function shipmentQtyReferenceText(row: ItemRow) {
  if (row.deliveryOwed > 0) return `待发 ${row.deliveryOwed} 支`;
  if (row.deliveryOwed === 0) return '待发 0 支（已发齐）';
  return `已超发 ${Math.abs(row.deliveryOwed)} 支`;
}

function shipmentQtyReferenceClass(row: ItemRow) {
  if (!row.quantity) return '';
  if (row.quantity > row.limit) return 'is-danger';
  if (row.quantity > row.deliveryOwed) return 'is-warning';
  return 'is-ok';
}

/** 草稿只许制单人与出入库主管角色编辑：无权时为提示文案（顶部只读提示 + 禁用保存），有权为空串 */
const notOwnerTip = ref('');

async function init() {
  if (!editId.value) return;
  pageLoading.value = true;
  try {
    const doc = await getFinishedDocDetail(editId.value);
    docNo.value = doc.docNo;
    notOwnerTip.value =
      doc.canModify === false ? `只有${doc.editors ?? '制单人'}可以编辑这张草稿，您当前只能查看` : '';
    form.bizType = doc.bizType;
    form.docDate = String(doc.docDate).slice(0, 10);
    form.workTeam = doc.workTeam ?? '';
    form.remark = doc.remark ?? '';
    form.items = (doc.items ?? []).map((it) => ({
      orderProductId: it.orderProductId,
      side: it.side,
      orderNo: it.orderNo,
      customerName: it.customerName,
      productionNo: it.productionNo,
      productModel: it.productModel,
      dimensionText: it.dimensionText,
      surfaceType: it.surfaceType,
      color: it.color,
      limit: 0,
      orderedQty: 0,
      outboundQty: 0,
      deliveryOwed: 0,
      quantity: it.quantity,
      remark: it.remark ?? '',
    }));
    await refreshLimits();
  } finally {
    pageLoading.value = false;
  }
}
init();

/** 编辑态回填额度/结存：选项接口按产品行返回，按 (产品行,边别) 对齐 */
async function refreshLimits() {
  if (!form.items.length) return;
  const opts = await getStockGroupOptions({ bizType: form.bizType });
  const map = new Map<string, {
    limit: number;
    orderedQty: number;
    outboundQty: number;
    deliveryOwed: number;
  }>();
  opts.forEach((o) => {
    o.sides.forEach((s) =>
      map.set(`${o.orderProductId}#${s.side}`, {
        limit: isInbound.value ? s.quota : s.stockQty,
        orderedQty: s.orderedQty,
        outboundQty: s.outboundQty,
        deliveryOwed: s.deliveryOwed,
      }),
    );
  });
  form.items.forEach((it) => {
    const current = map.get(`${it.orderProductId}#${it.side}`);
    it.limit = current?.limit ?? 0;
    it.orderedQty = current?.orderedQty ?? 0;
    it.outboundQty = current?.outboundQty ?? 0;
    it.deliveryOwed = current?.deliveryOwed ?? 0;
  });
}

/* ===== 选择器 ===== */
const pickerVisible = ref(false);
const pickerLoading = ref(false);
interface PickerQuery {
  orderNo: string;
  customerName: string | undefined;
  productionNo: string;
  productModel: string | undefined;
  productType: string | undefined;
  surfaceType: string | undefined;
  color: string | undefined;
  keyword: string;
}
const pickerQuery = reactive<PickerQuery>({
  orderNo: '',
  customerName: '',
  productionNo: '',
  productModel: '',
  productType: '',
  surfaceType: '',
  color: '',
  keyword: '',
});
/** 文本框仍在点「查询」/回车后生效；下拉变化由 watcher 立即同步到这里。 */
const appliedPickerQuery = reactive<PickerQuery>({
  orderNo: '',
  customerName: '',
  productionNo: '',
  productModel: '',
  productType: '',
  surfaceType: '',
  color: '',
  keyword: '',
});
/** 对话框本次打开时取得的完整候选快照；筛选期间不再请求服务端。 */
const pickerSourceRows = ref<PickerRow[]>([]);
const pickerFilterOptions = computed<StockGroupFilterOptions>(() => {
  const all = pickerSourceRows.value;
  const customerRows = all.filter((row) =>
    pickerTextEquals(row.customerName, pickerQuery.customerName),
  );
  const modelRows = customerRows.filter((row) =>
    pickerTextEquals(row.productModel, pickerQuery.productModel),
  );
  const productTypeRows = modelRows.filter((row) =>
    pickerProductTypeIncludes(row.productType, pickerQuery.productType),
  );
  const surfaceRows = productTypeRows.filter((row) =>
    pickerTextEquals(row.surfaceType, pickerQuery.surfaceType),
  );
  return {
    customerNames: distinctPickerValues(all, (row) => row.customerName),
    productModels: distinctPickerValues(customerRows, (row) => row.productModel),
    productTypes: distinctProductTypes(modelRows),
    surfaceTypes: distinctPickerValues(productTypeRows, (row) => row.surfaceType),
    colors: distinctPickerValues(surfaceRows, (row) => row.color),
  };
});
function pickerProductTypeIncludes(combined: string | null | undefined, selected: string | undefined): boolean {
  if (!selected) return true;
  return parseProductTypes(combined).includes(selected);
}
function distinctProductTypes(rows: PickerRow[]): string[] {
  const values = new Set(rows.flatMap((row) => parseProductTypes(row.productType)));
  const order = new Map(productTypeDict.value.map((option, index) => [option.value, index]));
  return [...values].sort((a, b) => {
    const orderDiff = (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER);
    return orderDiff || productTypeLabel(a).localeCompare(productTypeLabel(b), 'zh-CN');
  });
}
const productModelSelectOptions = computed(() =>
  pickerFilterOptions.value.productModels.map((value) => ({ label: value, value })),
);
const pickerRows = computed(() => pickerSourceRows.value.filter((row) => (
  pickerTextIncludes(row.orderNo, appliedPickerQuery.orderNo)
  && pickerTextEquals(row.customerName, appliedPickerQuery.customerName)
  && pickerTextIncludes(row.productionNo, appliedPickerQuery.productionNo)
  && pickerTextEquals(row.productModel, appliedPickerQuery.productModel)
  && pickerProductTypeIncludes(row.productType, appliedPickerQuery.productType)
  && pickerTextEquals(row.surfaceType, appliedPickerQuery.surfaceType)
  && (!colorEnabled.value || pickerTextEquals(row.color, appliedPickerQuery.color))
  && pickerTextIncludes(row.searchText, appliedPickerQuery.keyword)
)));
const pickerPage = ref(1);
const pickerPageSize = ref(50);
const pickerPageRows = computed(() => {
  const start = (pickerPage.value - 1) * pickerPageSize.value;
  return pickerRows.value.slice(start, start + pickerPageSize.value);
});
const picked = ref<PickerRow[]>([]);
const pickerTableRef = ref<any>();
let pickerInitRequestId = 0;
let suppressPickerAutoSearch = false;

// 下拉条件按「客户 → 产品型号 → 产品类型 → 表面处理 → 颜色」逐级收窄。上级选择或清空时同步清空
// 下级，避免下级残留条件继续锁住结果集；抑制标记确保一次操作只触发一次本地过滤。
watch(
  () => pickerQuery.customerName,
  () => {
    if (suppressPickerAutoSearch || !pickerVisible.value) return;
    suppressPickerAutoSearch = true;
    pickerQuery.productModel = '';
    pickerQuery.productType = '';
    pickerQuery.surfaceType = '';
    pickerQuery.color = '';
    suppressPickerAutoSearch = false;
    void loadPickerData();
  },
  { flush: 'sync' },
);
watch(
  () => pickerQuery.productModel,
  () => {
    if (suppressPickerAutoSearch || !pickerVisible.value) return;
    suppressPickerAutoSearch = true;
    pickerQuery.productType = '';
    pickerQuery.surfaceType = '';
    pickerQuery.color = '';
    suppressPickerAutoSearch = false;
    void loadPickerData();
  },
  { flush: 'sync' },
);
watch(
  () => pickerQuery.productType,
  () => {
    if (suppressPickerAutoSearch || !pickerVisible.value) return;
    suppressPickerAutoSearch = true;
    pickerQuery.surfaceType = '';
    pickerQuery.color = '';
    suppressPickerAutoSearch = false;
    void loadPickerData();
  },
  { flush: 'sync' },
);
watch(
  () => pickerQuery.surfaceType,
  () => {
    if (suppressPickerAutoSearch || !pickerVisible.value) return;
    suppressPickerAutoSearch = true;
    pickerQuery.color = '';
    suppressPickerAutoSearch = false;
    void loadPickerData();
  },
  { flush: 'sync' },
);
watch(
  () => pickerQuery.color,
  () => {
    if (!suppressPickerAutoSearch && pickerVisible.value) void loadPickerData();
  },
  { flush: 'sync' },
);

function openPicker() {
  pickerVisible.value = true;
}

function loadPickerData() {
  Object.assign(appliedPickerQuery, {
    orderNo: pickerQuery.orderNo?.trim() ?? '',
    customerName: pickerQuery.customerName?.trim() ?? '',
    productionNo: pickerQuery.productionNo?.trim() ?? '',
    productModel: pickerQuery.productModel?.trim() ?? '',
    productType: pickerQuery.productType ?? '',
    surfaceType: pickerQuery.surfaceType ?? '',
    color: colorEnabled.value ? pickerQuery.color ?? '' : '',
    keyword: pickerQuery.keyword?.trim() ?? '',
  });
  pickerPage.value = 1;
  picked.value = [];
  pickerTableRef.value?.clearSelection?.();
}

function pickerRowKey(row: PickerRow): string {
  return `${row.orderProductId}#${row.side ?? ''}`;
}
function pickerRowIndex(index: number): number {
  return (pickerPage.value - 1) * pickerPageSize.value + index + 1;
}

/**
 * 每次打开对话框只请求一次完整候选集；含卡口的产品在内存中展开左右两行。
 * 再次打开会重新取数，避免长期沿用旧的可入库量 / 当前结存。
 */
async function initializePicker() {
  const requestId = ++pickerInitRequestId;
  pickerLoading.value = true;
  pickerSourceRows.value = [];
  loadPickerData();
  try {
    const opts = await getStockGroupOptions({
      bizType: form.bizType,
      includeSearchText: true,
    });
    if (requestId !== pickerInitRequestId) return;
    pickerSourceRows.value = opts.flatMap((o) =>
      o.sides.map((s) => ({
        orderProductId: o.orderProductId,
        side: s.side,
        orderNo: o.orderNo,
        customerName: o.customerName,
        productionNo: o.productionNo,
        productModel: o.productModel,
        productType: o.productType,
        dimensionText: o.dimensionText,
        surfaceType: o.surfaceType,
        color: o.color,
        qtyPcs: o.qtyPcs,
        limit: isInbound.value ? s.quota : s.stockQty,
        orderedQty: s.orderedQty,
        outboundQty: s.outboundQty,
        deliveryOwed: s.deliveryOwed,
        quantity: undefined,
        remark: '',
        searchText: o.searchText ?? [
          o.orderNo,
          o.customerName,
          o.productionNo,
          o.itemNo,
          o.productName,
          o.productModel,
          o.productType,
          o.dimensionText,
          o.surfaceType,
          o.color,
        ].join('|'),
      })),
    );
    // 等本页最多 50 行完成渲染后再撤加载层，避免全量数据赋值时的短暂卡白。
    await nextTick();
  } finally {
    if (requestId === pickerInitRequestId) pickerLoading.value = false;
  }
}

function resetPickerQuery() {
  suppressPickerAutoSearch = true;
  Object.assign(pickerQuery, {
    orderNo: '',
    customerName: '',
    productionNo: '',
    productModel: '',
    productType: '',
    surfaceType: '',
    color: '',
    keyword: '',
  });
  suppressPickerAutoSearch = false;
  void loadPickerData();
}
/** 已在明细中的 (产品行,边别) 不可重复选；销售出库一张单只能服务同一客户。 */
function isSelectable(row: ItemRow): boolean {
  if (form.items.some((it) => it.orderProductId === row.orderProductId && it.side === row.side)) {
    return false;
  }
  return !isSaleOutbound.value
    || !selectedCustomerName.value
    || String(row.customerName ?? '').trim() === selectedCustomerName.value;
}
function onPickChange(rows: ItemRow[]) {
  picked.value = rows as PickerRow[];
}
function confirmPick() {
  picked.value.forEach((o) => {
    if (form.items.some((it) => it.orderProductId === o.orderProductId && it.side === o.side)) return;
    if (
      isSaleOutbound.value
      && selectedCustomerName.value
      && String(o.customerName ?? '').trim() !== selectedCustomerName.value
    ) {
      ElMessage.warning(`一张销售出库单只能选择客户「${selectedCustomerName.value}」的产品`);
      return;
    }
    form.items.push({
      orderProductId: o.orderProductId,
      side: o.side,
      orderNo: o.orderNo,
      customerName: o.customerName,
      productionNo: o.productionNo,
      productModel: o.productModel,
      dimensionText: o.dimensionText,
      surfaceType: o.surfaceType,
      color: o.color,
      limit: o.limit,
      orderedQty: o.orderedQty,
      outboundQty: o.outboundQty,
      deliveryOwed: o.deliveryOwed,
      // 只带出本次要发的产品，不擅自把当前结存当作本次发货数。
      // 保持空值，保存时强制填写；库存硬校验仍在确认时由服务端执行。
      quantity: undefined,
      remark: '',
    });
  });
  picked.value = [];
  pickerTableRef.value?.clearSelection?.();
  pickerVisible.value = false;
}

/* ===== 保存 ===== */
async function onSave() {
  if (notOwnerTip.value) {
    ElMessage.warning(notOwnerTip.value);
    return;
  }
  await formRef.value?.validate();
  if (!form.items.length) {
    ElMessage.warning('请至少添加一条明细');
    return;
  }
  const bad = form.items.findIndex((it) => !it.quantity || it.quantity <= 0);
  if (bad >= 0) {
    ElMessage.warning(`第 ${bad + 1} 行数量必须大于 0`);
    return;
  }
  if (overOrderRows.value.length) {
    ElMessage.warning('本次发货数超过订单待发数，请核对；库存充足时仍会按您填写的数量保存');
  }
  const payload = {
    bizType: form.bizType,
    docDate: form.docDate,
    workTeam: form.workTeam || undefined,
    remark: form.remark || undefined,
    items: form.items.map((it, i) => ({
      orderProductId: it.orderProductId,
      side: it.side,
      quantity: it.quantity!,
      remark: it.remark || undefined,
      sort: i,
    })),
  };
  saving.value = true;
  try {
    if (editId.value) {
      await updateFinishedDoc(editId.value, payload);
      ElMessage.success('保存成功');
    } else {
      const res = await createFinishedDoc(payload);
      ElMessage.success(`单据 ${res.docNo} 已保存为草稿，请在列表中确认`);
    }
    goBack();
  } finally {
    saving.value = false;
  }
}

function goBack() {
  router.push('/finished-stock');
}
</script>

<script lang="ts">
export default { name: 'FinishedStockForm' };
</script>

<style scoped lang="scss">
.owner-alert { margin: 10px 0 4px; }
.form-header {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 14px; margin-bottom: 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  .form-title { display: flex; align-items: center; gap: 12px; }
  .title-text { font-size: 16px; font-weight: 600; }
  .title-sub { color: var(--el-text-color-secondary); font-size: 13px; }
}
.section-title {
  display: flex; align-items: center;
  font-size: 14px; font-weight: 600; margin: 16px 0 12px;
  padding-left: 8px; border-left: 3px solid var(--el-color-primary);
  .ml12 { margin-left: 12px; }
  .sec-sum { margin-left: auto; font-weight: 400; font-size: 13px; color: var(--el-text-color-secondary); }
}
.outbound-guide { margin-top: 14px; }
.picker-filters {
  display: grid;
  /* 宽屏每行最多五个条件；剩余条件与操作区自然换到下一行。 */
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px 14px;
  align-items: center;
  padding: 12px 14px;
  margin-bottom: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-lighter);

  :deep(.el-form-item) {
    display: flex;
    min-width: 0;
    margin-right: 0;
    margin-bottom: 0;
  }
  :deep(.el-form-item__label) {
    width: auto;
    padding-right: 6px;
  }
  :deep(.el-form-item__content) {
    flex: 1;
    min-width: 0;
  }
  :deep(.el-input),
  :deep(.el-select),
  :deep(.el-select-v2) {
    width: 100%;
  }
  .picker-keyword { grid-column: auto; }
  .picker-actions {
    grid-column: auto;
    justify-self: end;
    white-space: nowrap;
    :deep(.el-form-item__content) { flex-wrap: nowrap; }
  }
}
@media (max-width: 1100px) {
  .picker-filters {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .picker-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.picker-tip { margin-bottom: 8px; color: var(--el-text-color-secondary); font-size: 12px; }
.picker-customer-tip { margin-left: 12px; color: var(--el-color-primary); font-weight: 600; }
:global(.stock-picker-model-popper) { min-width: 280px !important; }
:global(.stock-picker-model-popper .el-select-dropdown),
:global(.stock-picker-model-popper .el-vl__wrapper),
:global(.stock-picker-model-popper .el-vl__window) { width: 100% !important; }
.picker-count {
  display: inline-flex;
  gap: 18px;
  margin-right: auto;
  float: left;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 24px;
}
.lim-ok { color: var(--el-color-success); font-weight: 600; }
.lim-zero { color: var(--el-color-danger); font-weight: 600; }
.shipment-qty {
  display: grid;
  gap: 3px;
  text-align: left;
}
.shipment-qty__reference {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.25;
  white-space: nowrap;
  &.is-ok { color: var(--el-color-success); }
  &.is-warning { color: var(--el-color-warning); font-weight: 600; }
  &.is-danger { color: var(--el-color-danger); font-weight: 600; }
}
.over-tip {
  display: flex; align-items: center; gap: 6px; margin-top: 10px;
  color: var(--el-color-warning); font-size: 12px;
}
</style>
