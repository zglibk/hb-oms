<template>
  <div class="page">
    <el-card shadow="never" v-loading="pageLoading">
      <div class="form-header">
        <div class="form-title">
          <el-button size="small" :icon="Back" @click="goBack">返回列表</el-button>
          <span class="title-text">{{ editId ? '编辑订单' : '新增订单' }}</span>
          <span v-if="orderNo" class="title-sub">{{ orderNo }}</span>
        </div>
        <div>
          <el-button size="small" @click="goBack">取消</el-button>
          <el-button size="small" type="primary" :loading="saving" @click="onSave">保存</el-button>
        </div>
      </div>

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
            <el-form-item label="PO#">
              <el-input v-model="form.poNo" placeholder="客户单号/合同号" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="订单日期" prop="orderDate">
              <el-date-picker v-model="form.orderDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="业务员">
              <el-input v-model="form.salesman" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="跟单员">
              <el-input v-model="form.merchandiser" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="下单来源">
              <el-select v-model="form.orderSource" clearable placeholder="选择来源" style="width: 100%">
                <el-option v-for="o in ORDER_SOURCE" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="16">
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
          <el-col :xs="24" :md="8">
            <el-form-item label="备注">
              <el-input v-model="form.remark" />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="section-title">
          产品明细
          <el-button size="small" type="primary" plain :icon="Plus" class="ml12" @click="addProduct">添加产品行</el-button>
        </div>

        <el-card v-for="(p, pi) in form.products" :key="p._key" shadow="never" class="product-card">
          <template #header>
            <div class="pc-header">
              <span class="pc-title">产品 {{ pi + 1 }}<template v-if="p.itemNo">：{{ productTitle(p) }}</template></span>
              <span class="pc-meta">支数口径：<b>{{ pcsOf(p) }}</b> 支</span>
              <div>
                <el-button size="small" link type="primary" :icon="CopyDocument" @click="copyProduct(pi)">复制</el-button>
                <el-button size="small" link type="danger" :icon="Delete" :disabled="form.products.length <= 1" @click="removeProduct(pi)">删除</el-button>
              </div>
            </div>
          </template>

          <el-row :gutter="12">
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="生产单号" label-width="80px">
                <el-input v-model="p.productionNo" placeholder="如 GLI46212-A" :spellcheck="false" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="货号" label-width="80px">
                <el-input v-model="p.itemNo" placeholder="如 53#" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="产品名称" label-width="80px">
                <el-input v-model="p.productName" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="产品类型" label-width="80px">
                <el-select v-model="p._types" multiple placeholder="可多选（如 普通+自锁）" style="width: 100%">
                  <el-option v-for="o in productTypeDict" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="轨道节数" label-width="80px">
                <el-select v-model="p.railSection" style="width: 100%">
                  <el-option v-for="o in RAIL_SECTION_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
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
                <el-select v-model="p.surfaceType" style="width: 100%">
                  <el-option v-for="o in surfaceDict" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
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
                <el-input v-model="p.sheetMaterial" placeholder="如 Q235" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="装配车间" label-width="80px">
                <el-select v-model="p.assemblyWorkshop" clearable style="width: 100%">
                  <el-option v-for="o in workshopDict" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="交货日期" label-width="80px">
                <el-date-picker v-model="p.deliveryDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="订单类型" label-width="80px">
                <el-select v-model="p.orderType" style="width: 100%">
                  <el-option v-for="o in ORDER_TYPE" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="是否新单" label-width="80px">
                <el-switch v-model="p.isNewOrder" :active-value="1" :inactive-value="0" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="是否出口" label-width="80px">
                <el-switch v-model="p.isExport" :active-value="1" :inactive-value="0" />
                <el-input v-if="p.isExport" v-model="p.exportCountry" placeholder="出口国家" style="width: 130px; margin-left: 8px" />
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
            部件组（跟踪粒度；多数产品一个「整品」组，缓冲类可拆 外中轨+内轨）
            <el-button size="small" link type="primary" :icon="Plus" @click="addGroup(p)">添加部件组</el-button>
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
                  <el-select v-model="g.groupType" style="width: 100%">
                    <el-option
                      v-for="o in PART_GROUP_OPTIONS"
                      :key="o.value"
                      :label="o.label"
                      :value="o.value"
                      :disabled="p.partGroups.some((x) => x !== g && x.groupType === o.value)"
                    />
                  </el-select>
                </td>
                <td>
                  <el-input v-model="g.drawingNo" placeholder="图号；失焦自动带工艺" :spellcheck="false" @change="onDrawingChange(p, g)" />
                </td>
                <td><el-input v-model="g.drawingVersion" placeholder="如 1.1" @change="g.drawingVersion = normalizeVersion(g.drawingVersion) ?? ''" /></td>
                <td><el-input v-model="g.materialThickness" :placeholder="thicknessPlaceholder(g.groupType)" /></td>
                <td><el-input-number v-model="g.qtyPcs" :min="1" :controls="false" :placeholder="String(pcsOf(p))" style="width: 100%" /></td>
                <td class="gg-parts">{{ partsPreview(p, g) }}</td>
                <td>
                  <el-button size="small" link type="danger" :icon="Delete" :disabled="p.partGroups.length <= 1" @click="p.partGroups.splice(gi, 1)" />
                </td>
              </tr>
            </tbody>
          </table>
        </el-card>

        <div class="form-footer">
          <el-button size="small" @click="goBack">取消</el-button>
          <el-button size="small" type="primary" :loading="saving" @click="onSave">保存</el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type UploadFile } from 'element-plus';
import { Back, Plus, Delete, Upload, CopyDocument } from '@element-plus/icons-vue';
import {
  createOrder,
  getOrderDetail,
  updateOrder,
  type OrderPayload,
  type OrderProductPayload,
} from '@/api/order';
import { getAllCustomers, type CustomerItem } from '@/api/customer';
import { getProcessInfoByDrawing } from '@/api/process-info';
import { uploadFile } from '@/api/file';
import {
  ORDER_SOURCE,
  ORDER_TYPE,
  RAIL_SECTION_OPTIONS,
  PART_GROUP_OPTIONS,
  UNIT_OPTIONS,
  DIMENSION_UNIT_OPTIONS,
  expandPartRows,
  formatProductModel,
  hasSocket,
  normalizeVersion,
  parseProductTypes,
  partTypeLabel,
  sideLabel,
  toMm,
  toPieces,
} from '@/constants/dict';
import { loadDict } from '@/composables/useDict';

const route = useRoute();
const router = useRouter();
const editId = ref<number | null>(route.query.id ? Number(route.query.id) : null);
const orderNo = ref('');

const pageLoading = ref(false);
const saving = ref(false);
const uploading = ref(false);
const formRef = ref<FormInstance>();

let keySeq = 0;
const nextKey = () => ++keySeq;

interface GroupRow {
  _key: number;
  groupType: string;
  drawingNo: string;
  drawingVersion: string;
  materialThickness: string;
  qtyPcs: number | undefined;
  remark: string;
}
interface ProductRow {
  _key: number;
  _types: string[];
  orderType: number;
  isNewOrder: number;
  isExport: number;
  exportCountry: string;
  materialCode: string;
  itemNo: string;
  productName: string;
  railSection: string;
  dimensionRaw: string;
  dimensionUnit: string;
  dimensionMm: number | null;
  surfaceType: string;
  color: string;
  sheetMaterial: string;
  orderQty: number;
  unit: string;
  productionNo: string;
  assemblyWorkshop: string;
  deliveryDate: string;
  deliveryAddress: string;
  remark: string;
  partGroups: GroupRow[];
}

const emptyGroup = (): GroupRow => ({
  _key: nextKey(),
  groupType: 'whole',
  drawingNo: '',
  drawingVersion: '',
  materialThickness: '',
  qtyPcs: undefined,
  remark: '',
});
const emptyProduct = (): ProductRow => ({
  _key: nextKey(),
  _types: ['standard'],
  orderType: 1,
  isNewOrder: 0,
  isExport: 0,
  exportCountry: '',
  materialCode: '',
  itemNo: '',
  productName: '',
  railSection: 'three_section',
  dimensionRaw: '',
  dimensionUnit: 'mm',
  dimensionMm: null,
  surfaceType: 'none',
  color: '',
  sheetMaterial: '',
  orderQty: 1,
  unit: 'piece',
  productionNo: '',
  assemblyWorkshop: '',
  deliveryDate: '',
  deliveryAddress: '',
  remark: '',
  partGroups: [emptyGroup()],
});

const form = reactive({
  poNo: '',
  customerId: undefined as number | undefined,
  customerName: '',
  orderDate: new Date().toISOString().slice(0, 10),
  salesman: '',
  merchandiser: '',
  orderSource: '',
  remark: '',
  products: [emptyProduct()] as ProductRow[],
});
const rules = {
  customerName: [{ required: true, message: '请选择或输入客户', trigger: 'change' }],
  orderDate: [{ required: true, message: '请选择订单日期', trigger: 'change' }],
};
const attachments = ref<string[]>([]);

/* ===== 字典 ===== */
const surfaceDict = ref<Array<{ label: string; value: string }>>([]);
const workshopDict = ref<Array<{ label: string; value: string }>>([]);
const productTypeDict = ref<Array<{ label: string; value: string }>>([]);
Promise.all([loadDict('surface_type'), loadDict('assembly_workshop'), loadDict('product_type')]).then(
  ([sf, ws, pt]) => {
    surfaceDict.value = sf.map((r: any) => ({ label: r.dictLabel, value: r.dictValue }));
    workshopDict.value = ws.map((r: any) => ({ label: r.dictLabel, value: r.dictValue }));
    productTypeDict.value = pt.map((r: any) => ({ label: r.dictLabel, value: r.dictValue }));
  },
);

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
    if (editId.value) {
      const row = await getOrderDetail(editId.value);
      orderNo.value = row.orderNo;
      Object.assign(form, {
        poNo: row.poNo ?? '',
        customerId: row.customerId ?? undefined,
        customerName: row.customerName,
        orderDate: (row.orderDate || '').slice(0, 10),
        salesman: row.salesman ?? '',
        merchandiser: row.merchandiser ?? '',
        orderSource: row.orderSource ?? '',
        remark: row.remark ?? '',
        products: row.products.map((p) => ({
          _key: nextKey(),
          _types: parseProductTypes(p.productType),
          orderType: p.orderType,
          isNewOrder: p.isNewOrder,
          isExport: p.isExport,
          exportCountry: p.exportCountry ?? '',
          materialCode: p.materialCode ?? '',
          itemNo: p.itemNo ?? '',
          productName: p.productName ?? '',
          railSection: p.railSection ?? 'three_section',
          dimensionRaw: p.dimensionRaw ?? (p.dimensionMm != null ? String(p.dimensionMm) : ''),
          dimensionUnit: p.dimensionUnit ?? 'mm',
          dimensionMm: p.dimensionMm,
          surfaceType: p.surfaceType || 'none',
          color: p.color ?? '',
          sheetMaterial: p.sheetMaterial ?? '',
          orderQty: p.orderQty,
          unit: p.unit,
          productionNo: p.productionNo ?? '',
          assemblyWorkshop: p.assemblyWorkshop ?? '',
          deliveryDate: p.deliveryDate ? String(p.deliveryDate).slice(0, 10) : '',
          deliveryAddress: p.deliveryAddress ?? '',
          remark: p.remark ?? '',
          partGroups: p.partGroups.map((g) => ({
            _key: nextKey(),
            groupType: g.groupType,
            drawingNo: g.drawingNo ?? '',
            drawingVersion: g.drawingVersion ?? '',
            materialThickness: g.materialThickness ?? '',
            qtyPcs: g.qtyPcs,
            remark: g.remark ?? '',
          })),
        })),
      });
      attachments.value = parseAttachments(row.attachmentIds);
      customerPick.value =
        row.customerId && customers.value.some((c) => c.id === row.customerId)
          ? row.customerId
          : row.customerName || '';
    }
  } finally {
    pageLoading.value = false;
  }
}
init();

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
  dup.partGroups.forEach((g) => (g._key = nextKey()));
  form.products.splice(pi + 1, 0, dup);
}
function removeProduct(pi: number) {
  form.products.splice(pi, 1);
}
function addGroup(p: ProductRow) {
  const used = new Set(p.partGroups.map((g) => g.groupType));
  const next = PART_GROUP_OPTIONS.find((o) => !used.has(o.value));
  if (!next) {
    ElMessage.warning('组类型已用尽');
    return;
  }
  const g = emptyGroup();
  g.groupType = next.value;
  p.partGroups.push(g);
}

/* ===== 展示/换算辅助 ===== */
function pcsOf(p: ProductRow): number {
  return toPieces(p.orderQty, p.unit);
}
function productTitle(p: ProductRow): string {
  return formatProductModel(p.itemNo, p._types, 'whole');
}
function syncDimension(p: ProductRow) {
  p.dimensionMm = p.dimensionRaw ? toMm(Number(p.dimensionRaw), p.dimensionUnit) : null;
}
function thicknessPlaceholder(groupType: string): string {
  if (groupType === 'outer_middle') return '外×中，如 1.2×1.2';
  if (groupType === 'inner') return '单值，如 1.5';
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
async function onSave() {
  await formRef.value?.validate();
  const payload: OrderPayload = {
    poNo: form.poNo || undefined,
    customerId: form.customerId,
    customerName: form.customerName,
    orderDate: form.orderDate,
    salesman: form.salesman || undefined,
    merchandiser: form.merchandiser || undefined,
    orderSource: form.orderSource || undefined,
    attachmentIds: JSON.stringify(attachments.value),
    remark: form.remark || undefined,
    products: form.products.map<OrderProductPayload>((p, i) => ({
      orderType: p.orderType,
      isNewOrder: p.isNewOrder,
      isExport: p.isExport,
      exportCountry: p.isExport ? p.exportCountry || undefined : undefined,
      materialCode: p.materialCode || undefined,
      itemNo: p.itemNo || undefined,
      productName: p.productName || undefined,
      productType: p._types.join(','),
      railSection: p.railSection,
      dimensionMm: p.dimensionMm ?? undefined,
      dimensionRaw: p.dimensionRaw || undefined,
      dimensionUnit: p.dimensionUnit,
      surfaceType: p.surfaceType,
      color: p.color || undefined,
      sheetMaterial: p.sheetMaterial || undefined,
      orderQty: p.orderQty,
      unit: p.unit,
      productionNo: p.productionNo || undefined,
      assemblyWorkshop: p.assemblyWorkshop || undefined,
      deliveryDate: p.deliveryDate || undefined,
      deliveryAddress: p.deliveryAddress || undefined,
      remark: p.remark || undefined,
      sort: i,
      partGroups: p.partGroups.map((g, gi) => ({
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
  saving.value = true;
  try {
    if (editId.value) {
      await updateOrder(editId.value, payload);
      ElMessage.success('已保存');
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
  if (info.drawingVersion && !g.drawingVersion) g.drawingVersion = info.drawingVersion;
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
.form-header {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 14px; margin-bottom: 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  .form-title { display: flex; align-items: center; gap: 12px; }
  .title-text { font-size: 16px; font-weight: 600; }
  .title-sub { color: var(--el-text-color-secondary); font-size: 13px; }
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
.product-card {
  margin-bottom: 14px;
  border: 1px solid var(--el-border-color);
  :deep(.el-card__header) { padding: 8px 16px; background: var(--el-fill-color-lighter); }
  .pc-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .pc-title { font-weight: 600; }
  .pc-meta { color: var(--el-text-color-secondary); font-size: 13px; b { color: var(--el-color-primary); } }
}
.group-title {
  font-size: 13px; color: var(--el-text-color-secondary);
  margin: 4px 0 8px; display: flex; align-items: center; gap: 8px;
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
.customer-2col-popper {
  .el-select-dropdown__item {
    display: flex; justify-content: space-between; align-items: center; gap: 16px;
    min-width: 300px;
    .opt-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .opt-code { flex: none; color: var(--el-text-color-secondary); font-size: 12px; font-family: Consolas, monospace; }
  }
}
</style>
