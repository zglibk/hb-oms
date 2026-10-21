<template>
  <div class="page">
    <el-card shadow="never">
      <div class="form-header">
        <div class="form-title">
          <el-button size="small" :icon="Back" @click="goBack">返回列表</el-button>
          <span class="title-text">登记外发件回厂</span>
        </div>
        <div>
          <el-button size="small" @click="goBack">取消</el-button>
          <el-button size="small" type="primary" :loading="saving" @click="onSave">保存</el-button>
        </div>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" size="small">
        <!-- 区 1：公共信息——录入方式决定明细该填哪列，加工商/日期各行共用 -->
        <div class="shared-block">
          <div class="shared-block__title">公共信息</div>
          <el-row :gutter="16">
            <el-col :span="24">
              <el-form-item label="录入方式">
                <el-radio-group v-model="entryMode">
                  <el-radio v-for="o in ENTRY_MODE_OPTIONS" :key="o.value" :value="o.value">
                    {{ o.label }}
                  </el-radio>
                </el-radio-group>
                <span class="mode-tip">
                  <template v-if="isQtyMode">
                    （以加工商<span class="mode-tip__em">送货单的数量</span>为准；重量与单重<span class="mode-tip__em">选填</span>，填了也不会反过来改数量。）
                  </template>
                  <template v-else>
                    （填<span class="mode-tip__em">重量与单重</span>自动算出数量（重量 ÷ 单重），算完仍可微调。）
                  </template>
                </span>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16" class="shared-block__fields">
            <el-col :xs="24" :sm="12" :md="10" :lg="8">
              <el-form-item label="加工商" prop="processorName">
                <!-- 下拉来自「基础数据 → 供应商」。allow-create：主数据没维护到的新厂
                     也能直接输入，不挡录入（落库仍是名称快照，不存 supplier_id） -->
                <el-select
                  v-model="form.processorName"
                  filterable
                  allow-create
                  default-first-option
                  clearable
                  placeholder="选择或直接输入"
                  style="width: 100%"
                >
                  <el-option
                    v-for="s in supplierOptions"
                    :key="s.id"
                    :label="s.supplierName"
                    :value="s.supplierName"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="10" :lg="8">
              <el-form-item label="回厂日期" prop="backDate">
                <el-date-picker
                  v-model="form.backDate"
                  type="date"
                  value-format="YYYY-MM-DD"
                  class="shared-block__date"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </div>

        <!-- 区 2：回厂明细 -->
        <div class="section-title">
          <span class="section-title__left">
            回厂明细
            <el-button size="small" type="primary" plain :icon="Plus" class="ml12" @click="openPicker">添加回厂部件</el-button>
          </span>
          <span class="sec-sum">
            合计 <b>{{ totalQty }}</b> 支 ／ <b>{{ totalWeight }}</b> kg
          </span>
        </div>

        <div v-if="!form.items.length" class="detail-empty">
          <p class="detail-empty__text">还没有回厂明细，请先选择本次回来的部件/边别</p>
          <el-button type="primary" :icon="Plus" @click="openPicker">添加回厂部件</el-button>
        </div>
        <el-table
          v-else
          ref="detailTableRef"
          :data="form.items"
          border
          stripe
          size="small"
          class="detail-table"
          @keydown.enter="onDetailEditorKeydown"
          @keyup.enter="onDetailEditorKeyup"
        >
          <el-table-column type="index" label="#" width="46" align="center" />
          <el-table-column label="生产单号" prop="productionNo" width="120" fixed="left" show-overflow-tooltip />
          <el-table-column label="产品型号" prop="productModel" min-width="140" show-overflow-tooltip />
          <el-table-column label="规格" prop="dimensionText" width="80" align="center" show-overflow-tooltip />
          <el-table-column label="订单数量" width="88" align="center">
            <template #default="{ row }">{{ row.orderQty }} {{ unitLabel(row.unit) }}</template>
          </el-table-column>
          <el-table-column label="生产图号" width="100" show-overflow-tooltip>
            <template #default="{ row }">{{ row.drawingNo || '—' }}</template>
          </el-table-column>
          <el-table-column label="料厚" width="72" align="center" show-overflow-tooltip>
            <template #default="{ row }">{{ row.materialThickness || '—' }}</template>
          </el-table-column>
          <el-table-column label="表面处理" width="120" align="center">
            <template #default="{ row }">
              <el-select
                v-model="row.surfaceType"
                data-detail-editor
                clearable
                placeholder="按订单"
                style="width: 100%"
              >
                <el-option v-for="o in outsourceSurfaces" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column v-if="colorEnabled" label="颜色" width="90" align="center">
            <template #default="{ row }"><el-input v-model="row.color" data-detail-editor /></template>
          </el-table-column>
          <el-table-column label="边别" width="72" align="center">
            <template #default="{ row }"><color-tag :seed="row.side || 'whole'">{{ sideText(row.side) }}</color-tag></template>
          </el-table-column>
          <!-- 数量列排在重量之前：它才是入账依据；必填校验在保存时统一做 -->
          <el-table-column width="125" align="center" class-name="col-focus" label-class-name="col-focus">
            <template #header>
              回厂数量(支)<span v-if="isQtyMode" class="col-req">*</span>
            </template>
            <template #default="{ row }">
              <el-input-number
                v-model="row.returnQty" :min="0" :precision="0" :step="1" :controls="false"
                data-detail-editor style="width: 100%" :placeholder="isQtyMode ? '按送货单' : '自动折算'"
              />
            </template>
          </el-table-column>
          <el-table-column width="125" align="center" class-name="col-focus" label-class-name="col-focus">
            <template #header>
              回厂重量(kg)<span v-if="isQtyMode" class="col-opt">选填</span>
            </template>
            <template #default="{ row }">
              <el-input-number
                v-model="row.returnWeight" :min="0" :precision="2" :step="1" :controls="false"
                data-detail-editor style="width: 100%" @change="() => syncQty(row)"
              />
            </template>
          </el-table-column>
          <el-table-column width="120" align="center" class-name="col-focus" label-class-name="col-focus">
            <template #header>
              单重(kg/支)<span v-if="isQtyMode" class="col-opt">选填</span>
            </template>
            <template #default="{ row }">
              <el-input-number
                v-model="row.unitWeight" :min="0" :precision="4" :step="0.01" :controls="false"
                data-detail-editor style="width: 100%" @change="() => syncQty(row)"
              />
            </template>
          </el-table-column>
          <el-table-column label="备注" width="110">
            <template #default="{ row }"><el-input v-model="row.remark" data-detail-editor /></template>
          </el-table-column>
          <el-table-column label="操作" width="70" align="center" fixed="right">
            <template #default="{ $index }">
              <el-button size="small" link type="danger" :icon="Delete" @click="form.items.splice($index, 1)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-form>
    </el-card>

    <!-- 可外发部件/边别选择器 -->
    <el-dialog
      v-model="pickerVisible"
      title="选择回厂部件"
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
            :loading="optionsLoading"
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
            :loading="optionsLoading"
            :options="productModelSelectOptions"
            popper-class="picker-model-popper"
            placeholder="全部"
          />
        </el-form-item>
        <el-form-item label="产品类型">
          <el-select
            v-model="pickerQuery.productType"
            clearable
            filterable
            :loading="optionsLoading"
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
          <el-select v-model="pickerQuery.surfaceType" clearable :loading="optionsLoading" placeholder="全部">
            <el-option
              v-for="value in pickerFilterOptions.surfaceTypes"
              :key="value"
              :label="dictLabel(surfaceDict, value)"
              :value="value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="交期">
          <el-date-picker
            v-model="pickerDeliveryRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="开始"
            end-placeholder="结束"
            style="width: 100%"
            @change="initializePicker"
          />
        </el-form-item>
        <el-form-item label="关键词">
          <el-input
            v-model="pickerQuery.keyword"
            clearable
            placeholder="请输入关键词"
            @keyup.enter="loadPickerData"
          />
        </el-form-item>
        <el-form-item class="picker-actions">
          <el-button type="primary" :icon="Search" @click="loadPickerData">查询</el-button>
          <el-button @click="resetPickerQuery">重置</el-button>
        </el-form-item>
      </el-form>
      <div class="picker-bar">
        <!-- 两个互不重叠的本地结果集：默认只列未回齐的（2026-09-26：回完了还被重复登记是实测的高发错误）；
             勾上则只列已回齐的，供返工、补货再登记。 -->
        <el-checkbox v-model="showReturned" @change="loadPickerData">只看已回齐</el-checkbox>
        <span class="picker-tip">
          {{ showReturned ? '当前只列出已回齐的部件/边别（返工、补货再登记用）；取消勾选回到待回厂列表。' : '只列出需要表面处理（非「无」）且尚未回齐的部件/边别；分批回厂可重复选。' }}
        </span>
      </div>
      <el-table
        ref="pickerTableRef"
        :data="optionPageRows"
        :row-key="pickerRowKey"
        v-loading="optionsLoading"
        element-loading-text="正在加载全部回厂部件..."
        border
        stripe
        size="small"
        height="46vh"
        @selection-change="onPickChange"
      >
        <el-table-column type="selection" width="46" reserve-selection />
        <el-table-column type="index" label="序号" width="56" align="center" :index="pickerRowIndex" />
        <el-table-column label="订单号" prop="orderNo" width="130" show-overflow-tooltip />
        <el-table-column label="客户" prop="customerName" width="96" show-overflow-tooltip />
        <el-table-column label="生产单号" prop="productionNo" width="120" show-overflow-tooltip />
        <el-table-column label="产品型号" prop="productModel" min-width="150" show-overflow-tooltip />
        <el-table-column label="边别" width="72" align="center">
          <template #default="{ row }">
            <color-tag :seed="row.side || 'whole'">{{ sideText(row.side) }}</color-tag>
            <div v-if="row.legacyReturnedQty > 0" class="legacy-side-tip">含历史未分边 {{ row.legacyReturnedQty }} 支</div>
          </template>
        </el-table-column>
        <el-table-column label="规格" prop="dimensionText" width="90" align="center" />
        <el-table-column label="表面处理" width="100" align="center">
          <template #default="{ row }">
            <color-tag v-if="row.surfaceType" :seed="row.surfaceType">{{ dictLabel(surfaceDict, row.surfaceType) }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="需求(支)" prop="qtyPcs" width="88" align="center" />
        <el-table-column label="已回厂(支)" width="120" align="center">
          <template #default="{ row }">
            {{ row.returnedQty }}
            <el-tag v-if="optionReturned(row)" size="small" type="success" disable-transitions>已回齐</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <app-pagination
        v-if="options.length > pickerPageSize"
        :total="options.length"
        v-model:page="pickerPage"
        v-model:size="pickerPageSize"
        :page-sizes="[20, 50, 100]"
      />
      <template #footer>
        <span class="picker-count">
          <span>查询到 {{ options.length }} 条符合条件的记录</span>
          <span>已选 {{ picked.length }} 条</span>
        </span>
        <el-button size="small" @click="pickerVisible = false">取消</el-button>
        <el-button size="small" type="primary" @click="confirmPick">添加到明细</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'OutsourceForm' });

import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Back, Plus, Delete, Search } from '@element-plus/icons-vue';
import {
  createOutsourceParts,
  getPartGroupOptions,
  type PartGroupFilterOptions,
  type PartGroupOption,
} from '@/api/outsource';
import { getSupplierOptions, type SupplierOption } from '@/api/supplier';
import {
  SURFACE_NONE,
  UNIT_OPTIONS,
  parseProductTypes,
  qtyFromWeight,
  sideLabel,
} from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import {
  distinctPickerValues,
  pickerTextEquals,
  pickerTextIncludes,
} from '@/utils/local-picker';
import ColorTag from '@/components/ColorTag.vue';
import { businessToday, recentSixNaturalMonthRange } from '@/utils/date';
import {
  ENTRY_MODE_OPTIONS,
  mismatchedQty,
  useOutsourceEntryMode,
  confirmOverReturn,
} from '@/composables/useOutsourceEntry';

/** 「颜色」字段全局开关（系统配置 → 业务字段） */
const { colorEnabled } = useFeatureFlags();

/** 录入方式：按数量 / 按重量折算（记住上次选择，口径见 useOutsourceEntry） */
const { entryMode, isQtyMode } = useOutsourceEntryMode();

const router = useRouter();
const formRef = ref<FormInstance>();
const detailTableRef = ref<any>();
const saving = ref(false);

interface ItemRow {
  orderPartGroupId: number;
  side: string;
  orderNo: string | null;
  customerName: string | null;
  productionNo: string | null;
  productModel: string | null;
  dimensionText: string | null;
  orderQty: number;
  unit: string | null;
  drawingNo: string | null;
  materialThickness: string | null;
  surfaceType: string;
  color: string;
  returnWeight: number;
  unitWeight: number;
  returnQty: number;
  remark: string;
}

const form = reactive({
  processorName: '',
  /** 实际回厂日期，默认今天——本模块只记已回厂的件 */
  backDate: businessToday(),
  items: [] as ItemRow[],
});

const rules: FormRules = {
  processorName: [{ required: true, message: '请填写加工商', trigger: 'blur' }],
  backDate: [{ required: true, message: '请选择回厂日期', trigger: 'change' }],
};

/** 产品类型 / 表面处理字典：筛选项显示中文；取不到时回落原值。 */
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
const outsourceSurfaces = computed(() => surfaceDict.value.filter((o) => o.value !== SURFACE_NONE));

/** 加工商下拉：基础数据里维护的启用供应商（接口只需登录，没有供应商菜单也能取） */
const supplierOptions = ref<SupplierOption[]>([]);
getSupplierOptions().then((rows) => {
  supplierOptions.value = rows;
});

const totalQty = computed(() => form.items.reduce((s, it) => s + (it.returnQty || 0), 0));
const totalWeight = computed(
  () => Math.round(form.items.reduce((s, it) => s + (it.returnWeight || 0), 0) * 100) / 100,
);

/**
 * 重量或单重变化 → 折算数量（共享包同一口径，折算后仍可人工微调）。
 * **仅「按重量折算」模式生效**：按数量模式下这两列只是记录值，
 * 再驱动数量就会把录入员按送货单填好的数字改掉（原实现的坑）。
 */
function syncQty(row: ItemRow) {
  if (isQtyMode.value) return;
  const qty = qtyFromWeight(row.returnWeight, row.unitWeight);
  if (qty > 0) row.returnQty = qty;
}

/* ===== 回厂明细键盘录入 ===== */
/** Enter 只在明细编辑器内接管；中文输入法确认候选时不能误跳到下一格。 */
function detailEditorRoot(event: KeyboardEvent): HTMLElement | null {
  if (event.isComposing || event.keyCode === 229) return null;
  return event.target instanceof HTMLElement
    ? event.target.closest<HTMLElement>('[data-detail-editor]')
    : null;
}

/** 普通输入框按下 Enter 时阻止原生表单提交；下拉框要保留 Enter 打开/选择选项。 */
function onDetailEditorKeydown(event: KeyboardEvent) {
  const editor = detailEditorRoot(event);
  if (!editor || editor.classList.contains('el-select')) return;
  event.preventDefault();
}

/**
 * Enter 后按 DOM 顺序移动到下一可编辑格：本行从左到右，行尾进入下一行。
 * 下拉框展开期间不移动；用 Enter 选中并收起后才进入下一格。
 */
function onDetailEditorKeyup(event: KeyboardEvent) {
  const current = detailEditorRoot(event);
  if (!current) return;
  if (current.querySelector('[aria-expanded="true"]')) return;
  event.preventDefault();

  const table = detailTableRef.value?.$el as HTMLElement | undefined;
  if (!table) return;
  const editors = Array.from(table.querySelectorAll<HTMLElement>('[data-detail-editor]'))
    .filter((editor) => {
      const control = editor.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
      return !!control && !control.disabled && !editor.classList.contains('is-disabled') && control.offsetParent !== null;
    });
  const currentIndex = editors.indexOf(current);
  const next = currentIndex >= 0 ? editors[currentIndex + 1] : undefined;
  const control = next?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
  if (!next || !control) return;

  next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  control.focus();
  // 自动全选原值，数字、单重等已带入字段可直接敲新值覆盖。
  try {
    control.select();
  } catch {
    // 某些浏览器不支持选择特定 input 类型；焦点移动仍然有效。
  }
}

/* ===== 部件组选择器 ===== */
const pickerVisible = ref(false);
const pickerDeliveryRange = ref<[string, string] | null>(recentSixNaturalMonthRange());
interface PickerQuery {
  orderNo: string;
  customerName: string | undefined;
  productionNo: string;
  productModel: string | undefined;
  productType: string | undefined;
  surfaceType: string | undefined;
  keyword: string;
}
const pickerQuery = reactive<PickerQuery>({
  orderNo: '',
  customerName: '',
  productionNo: '',
  productModel: '',
  productType: '',
  surfaceType: '',
  keyword: '',
});
/** 文本条件点「查询」/回车后生效；级联下拉变化由 watcher 立即同步。 */
const appliedPickerQuery = reactive<PickerQuery>({
  orderNo: '',
  customerName: '',
  productionNo: '',
  productModel: '',
  productType: '',
  surfaceType: '',
  keyword: '',
});
const pickerTableRef = ref<any>();
/** 对话框本次打开时取得的全部需外发部件/边别；待回厂/已回齐都从此快照切换。 */
const optionSource = ref<PartGroupOption[]>([]);
const optionsLoading = ref(false);
const picked = ref<PartGroupOption[]>([]);
/** 选择器是否切到「只看已回齐」列表（默认否，每次进页面都重置——同「按数量」模式，不记忆） */
const showReturned = ref(false);
/** 历史未分边流水无法判断左、右哪边已回，故保守地继续显示为待核，不擅自隐藏。 */
function optionReturned(row: PartGroupOption): boolean {
  if (row.side) return row.legacyReturnedQty === 0 && row.qtyPcs > 0 && row.returnedQty >= row.qtyPcs;
  return row.qtyPcs > 0 && row.returnedQty >= row.qtyPcs;
}
const visibleScope = computed(() => optionSource.value.filter((row) => (
  showReturned.value ? optionReturned(row) : !optionReturned(row)
)));
const pickerFilterOptions = computed<PartGroupFilterOptions>(() => {
  const all = visibleScope.value;
  const customerRows = all.filter((row) =>
    pickerTextEquals(row.customerName, pickerQuery.customerName),
  );
  const modelRows = customerRows.filter((row) =>
    pickerTextEquals(row.productModel, pickerQuery.productModel),
  );
  const productTypeRows = modelRows.filter((row) =>
    pickerProductTypeIncludes(row.productType, pickerQuery.productType),
  );
  return {
    customerNames: distinctPickerValues(all, (row) => row.customerName),
    productModels: distinctPickerValues(customerRows, (row) => row.productModel),
    productTypes: distinctProductTypes(modelRows),
    surfaceTypes: distinctPickerValues(productTypeRows, (row) => row.surfaceType),
  };
});
function pickerProductTypeIncludes(combined: string | null | undefined, selected: string | undefined): boolean {
  if (!selected) return true;
  return parseProductTypes(combined).includes(selected);
}
function distinctProductTypes(rows: PartGroupOption[]): string[] {
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
const options = computed(() => visibleScope.value.filter((row) => (
  pickerTextIncludes(row.orderNo, appliedPickerQuery.orderNo)
  && pickerTextEquals(row.customerName, appliedPickerQuery.customerName)
  && pickerTextIncludes(row.productionNo, appliedPickerQuery.productionNo)
  && pickerTextEquals(row.productModel, appliedPickerQuery.productModel)
  && pickerProductTypeIncludes(row.productType, appliedPickerQuery.productType)
  && pickerTextEquals(row.surfaceType, appliedPickerQuery.surfaceType)
  && pickerTextIncludes(row.searchText, appliedPickerQuery.keyword)
)));
const pickerPage = ref(1);
const pickerPageSize = ref(50);
const optionPageRows = computed(() => {
  const start = (pickerPage.value - 1) * pickerPageSize.value;
  return options.value.slice(start, start + pickerPageSize.value);
});
let pickerInitRequestId = 0;
let suppressPickerAutoSearch = false;

// 与成品出入库选择器保持一致，按「客户 → 产品型号 → 产品类型 → 表面处理」逐级收窄；上级变化时
// 清空其下级条件，避免不可见的残留条件锁住结果集。每次操作只触发一次本地过滤。
watch(
  () => pickerQuery.customerName,
  () => {
    if (suppressPickerAutoSearch || !pickerVisible.value) return;
    suppressPickerAutoSearch = true;
    pickerQuery.productModel = '';
    pickerQuery.productType = '';
    pickerQuery.surfaceType = '';
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
    suppressPickerAutoSearch = false;
    void loadPickerData();
  },
  { flush: 'sync' },
);
watch(
  () => pickerQuery.surfaceType,
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
    keyword: pickerQuery.keyword?.trim() ?? '',
  });
  pickerPage.value = 1;
  picked.value = [];
  pickerTableRef.value?.clearSelection?.();
}
function pickerRowIndex(index: number): number {
  return (pickerPage.value - 1) * pickerPageSize.value + index + 1;
}

/** 每次打开只取一次完整快照；再次打开再刷新累计回厂数和新增订单。 */
async function initializePicker() {
  const requestId = ++pickerInitRequestId;
  optionsLoading.value = true;
  optionSource.value = [];
  loadPickerData();
  try {
    const rows = await getPartGroupOptions({
      all: true,
      includeSearchText: true,
      deliveryFrom: pickerDeliveryRange.value?.[0],
      deliveryTo: pickerDeliveryRange.value?.[1],
    });
    if (requestId !== pickerInitRequestId) return;
    optionSource.value = rows.map((row) => ({
      ...row,
      searchText: row.searchText ?? [
        row.orderNo,
        row.customerName,
        row.productionNo,
        row.productModel,
        row.productType,
        row.dimensionText,
        row.cycleCode,
        row.surfaceType,
        row.color,
        row.drawingNo,
        row.materialThickness,
        sideText(row.side),
      ].join('|'),
    }));
    // 全量快照留在内存中，本页最多渲染 50 行；渲染稳定后再撤加载层。
    await nextTick();
  } finally {
    if (requestId === pickerInitRequestId) optionsLoading.value = false;
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
    keyword: '',
  });
  suppressPickerAutoSearch = false;
  showReturned.value = false;
  pickerDeliveryRange.value = recentSixNaturalMonthRange();
  void initializePicker();
}
function onPickChange(rows: PartGroupOption[]) {
  picked.value = rows;
}
function pickerRowKey(row: PartGroupOption) {
  return `${row.orderPartGroupId}|${row.side}`;
}
function confirmPick() {
  picked.value.forEach((o) => {
    if (form.items.some((item) => item.orderPartGroupId === o.orderPartGroupId && item.side === o.side)) return;
    form.items.push({
      orderPartGroupId: o.orderPartGroupId,
      side: o.side,
      orderNo: o.orderNo,
      customerName: o.customerName,
      productionNo: o.productionNo,
      productModel: o.productModel,
      dimensionText: o.dimensionText,
      orderQty: o.orderQty,
      unit: o.unit,
      drawingNo: o.drawingNo,
      materialThickness: o.materialThickness,
      // 表面处理与颜色自订单带出，可改（实际做的与订单登记的可能不同）
      surfaceType: o.surfaceType,
      color: o.color ?? '',
      // 单重自部件信息带出；重量与数量留空，等过磅实测录入——
      // 拿订单数预填会让人顺手存下一个没过磅的假数，对账时才发现对不上
      unitWeight: o.unitWeight,
      returnWeight: 0,
      returnQty: 0,
      remark: '',
    });
  });
  picked.value = [];
  pickerTableRef.value?.clearSelection?.();
  pickerVisible.value = false;
}

function dictLabel(opts: Array<{ label: string; value: string }>, v: string | null): string {
  if (!v) return '—';
  return opts.find((o) => o.value === v)?.label ?? v;
}
function unitLabel(v: string | null): string {
  return UNIT_OPTIONS.find((o: any) => o.value === v)?.label ?? (v ?? '');
}
function sideText(side: string): string {
  return sideLabel(side) || '通用';
}

/**
 * 数量与「重量÷单重」对不上时确认一次（偏差 >10%，口径见 useOutsourceEntry）。
 * **只提示不拦截**：过磅本就有误差，且两个数不一致时以送货单数量为准是业务惯例；
 * 但相差太多多半是某一处录错了，让人当场核一眼比事后对账划算。
 */
async function confirmQtyConsistent(): Promise<boolean> {
  const bad = form.items
    .map((it, i) => ({ it, no: i + 1, calc: mismatchedQty(it) }))
    .filter((r) => r.calc !== null);
  if (!bad.length) return true;
  const lines = bad
    .map((r) => `第 ${r.no} 行：登记 ${r.it.returnQty} 支，按重量折算 ${r.calc} 支`)
    .join('；');
  try {
    await ElMessageBox.confirm(`${lines}。确认以登记的数量入账吗？`, '数量与重量折算不一致', {
      type: 'warning',
      confirmButtonText: '按登记数量入账',
      cancelButtonText: '返回修改',
    });
    return true;
  } catch {
    return false;
  }
}

/* ===== 保存 ===== */
async function onSave() {
  await formRef.value?.validate();
  if (!form.items.length) {
    ElMessage.warning('请至少添加一条回厂明细');
    return;
  }
  const bad = form.items.findIndex((it) => !it.returnQty || it.returnQty <= 0);
  if (bad >= 0) {
    ElMessage.warning(
      isQtyMode.value
        ? `第 ${bad + 1} 行请按送货单填写回厂数量`
        : `第 ${bad + 1} 行回厂数量必须大于 0（填写重量与单重可自动折算）`,
    );
    return;
  }
  if (!(await confirmQtyConsistent())) return;
  // 累计回厂超出部件/边别需求时确认一次（只提醒不拦截，见 confirmOverReturn）
  const overOk = await confirmOverReturn(
    form.items.map((it, i) => ({
      orderPartGroupId: it.orderPartGroupId,
      side: it.side,
      returnQty: it.returnQty,
      label: `第 ${i + 1} 行 ${it.productionNo || it.orderNo || ''} ${it.productModel || ''}${sideText(it.side)}`.trim(),
    })),
  );
  if (!overOk) return;
  saving.value = true;
  try {
    const res = await createOutsourceParts({
      processorName: form.processorName.trim(),
      backDate: form.backDate,
      items: form.items.map((it) => ({
        orderPartGroupId: it.orderPartGroupId,
        side: it.side,
        returnWeight: it.returnWeight || 0,
        unitWeight: it.unitWeight || 0,
        returnQty: it.returnQty,
        surfaceType: it.surfaceType || undefined,
        color: it.color || undefined,
        remark: it.remark || undefined,
      })),
    });
    ElMessage.success(`已登记 ${res.count} 条回厂记录`);
    goBack();
  } finally {
    saving.value = false;
  }
}

function goBack() {
  router.push('/outsource');
}
</script>

<style scoped lang="scss">
.form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.form-title {
  display: flex;
  align-items: center;
  gap: 12px;
  .title-text { font-size: 15px; font-weight: 600; }
}

/* 区 1：本次共用——整块浅底，字段左聚，说明沉底 */
.shared-block {
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 12px 16px 14px;
  margin-bottom: 8px;

  /* 与「回厂明细」同款左侧竖条，两个区块的标题看起来才是同一级 */
  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    border-left: 4px solid var(--el-color-primary);
    padding-left: 10px;
    margin-bottom: 10px;
    line-height: 1.3;
  }
  &__fields {
    max-width: 720px;
  }
  /* Element Plus 日期选择器默认偏窄，YYYY-MM-DD 会被裁切 */
  &__date {
    width: 100% !important;
    min-width: 180px;
  }
  :deep(.shared-block__date.el-date-editor) {
    width: 100% !important;
    max-width: none;
  }
  :deep(.el-form-item) {
    margin-bottom: 14px;
  }
  :deep(.shared-block__fields .el-form-item) {
    margin-bottom: 0;
  }
}
.mode-tip {
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  &__em {
    color: var(--el-color-danger);
    font-weight: 400;
  }
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  border-left: 4px solid var(--el-color-primary);
  padding-left: 10px;
  line-height: 1.3;
  margin: 20px 0 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  &__left {
    display: inline-flex;
    align-items: center;
  }
  .ml12 { margin-left: 12px; }
}
.sec-sum {
  margin-left: auto;
  font-weight: 400;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  b { color: var(--el-color-primary); }
}

.detail-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 200px;
  padding: 32px 16px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  &__text {
    margin: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
}

/* 录入列浅底强调，与订单快照列区分 */
.detail-table {
  :deep(th.col-focus),
  :deep(td.col-focus) {
    background-color: color-mix(in srgb, var(--el-color-primary) 6%, transparent) !important;
  }
  :deep(th.col-focus) {
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
}

.picker-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.picker-filters {
  display: grid;
  /* 宽屏每行最多五个条件；剩余条件与操作区自然换到下一行。 */
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  margin-bottom: 10px;
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
  .picker-actions {
    justify-self: end;
    white-space: nowrap;
    :deep(.el-form-item__content) {
      flex-wrap: nowrap;
    }
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
    .picker-actions { grid-column: 2; }
  }
}
:global(.picker-model-popper) {
  min-width: 280px !important;
}
:global(.picker-model-popper .el-select-dropdown),
:global(.picker-model-popper .el-vl__wrapper),
:global(.picker-model-popper .el-vl__window) {
  width: 100% !important;
}
.picker-tip {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.legacy-side-tip {
  margin-top: 3px;
  color: var(--el-color-warning);
  font-size: 11px;
  line-height: 1.25;
  white-space: nowrap;
}
.picker-count {
  display: inline-flex;
  gap: 18px;
  margin-right: auto;
  float: left;
  line-height: 32px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.col-req {
  color: var(--el-color-danger);
  margin-left: 2px;
}
.col-opt {
  color: var(--el-text-color-placeholder);
  font-weight: 400;
  margin-left: 4px;
  font-size: 11px;
}
</style>
