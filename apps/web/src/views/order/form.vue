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
              <el-input v-model="form.poNo" placeholder="客户订单文件上的订单编号" :spellcheck="false" :formatter="upperFmt" :parser="upperFmt" />
            </el-form-item>
          </el-col>
          <!-- 生产单号与 PO# 一对一，都是订单级；不再挂在产品行上 -->
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="生产单号">
              <el-input v-model="form.productionNo" placeholder="如 GLI46212-A" :spellcheck="false" :formatter="upperFmt" :parser="upperFmt" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="订单日期" prop="orderDate">
              <el-date-picker v-model="form.orderDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
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
            <el-form-item label="下单来源">
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
              <el-input v-model="form.remark" placeholder="一句话摘要，列表可见" />
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
              <el-form-item label="货号" label-width="80px">
                <el-input v-model="p.itemNo" placeholder="如 53#" />
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
                <!-- 改节数要同步部件组：二节轨无中轨，留着中轨组保存必被服务端拒 -->
                <el-select v-model="p.railSection" style="width: 100%" @change="onRailSectionChange(p)">
                  <el-option v-for="o in RAIL_SECTION_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
            </el-col>
            <!-- 分体出货：客户把一支滑轨拆开下单（如三节轨拆「外中轨」+「内轨」两行）、
                 分开包装出货、不组装成整品。勾选后下方部件组就是出货构成的事实源：
                 留哪几组这行就出什么货，形态与型号后缀由组构成推导（不落第二个字段） -->
            <el-col :xs="24" :sm="12" :md="6">
              <el-form-item label="分体出货" label-width="80px">
                <el-switch v-model="p.isSplit" :active-value="1" :inactive-value="0" />
                <el-tooltip
                  placement="top"
                  content="客户把一支滑轨拆开下单（如三节轨拆成「外中轨」和「内轨」两行）、分开包装出货、不组装成整品时开启。开启后，下方部件组留哪几组，这一行就出什么货；只出单个部件（如内轨）的行没有装配环节，入库不受装配数量限制。"
                >
                  <el-icon class="split-tip"><QuestionFilled /></el-icon>
                </el-tooltip>
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
                <el-select
                  v-if="p.isExport"
                  v-model="p.exportCountry"
                  filterable
                  clearable
                  placeholder="出口国家"
                  popper-class="country-popper"
                  style="width: 150px; margin-left: 8px"
                >
                  <el-option v-for="c in COUNTRY_OPTIONS" :key="c.code" :label="c.name" :value="c.name">
                    <div class="country-option">
                      <span class="country-left">
                        <span :class="['fi', 'fi-' + c.code.toLowerCase()]" /><span class="country-zh">{{ c.name }}</span>
                      </span>
                      <span class="country-en">{{ c.englishName }}</span>
                    </div>
                  </el-option>
                </el-select>
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
            <span v-if="p.isSplit" class="split-hint">分体出货：留下的组就是这行实际出货的部件，请删掉不出货的组</span>
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
                  <el-select v-model="g.groupType" style="width: 100%">
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
                  <el-button size="small" link type="danger" :icon="Delete" :disabled="p.partGroups.length <= 1" @click="p.partGroups.splice(gi, 1)" />
                </td>
              </tr>
            </tbody>
          </table>
        </el-card>

        <!-- 编辑态才有审计信息（新建时还没落库） -->
        <audit-info v-if="editId" :row="auditRow" />

        <div class="form-footer">
          <el-button size="small" @click="goBack">取消</el-button>
          <el-button size="small" type="primary" :loading="saving" @click="onSave">保存</el-button>
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
  updateOrder,
  type OrderPayload,
  type OrderProductPayload,
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
  splitParts,
  splitSuffix,
  hasSocket,
  normalizeVersion,
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

/** 业务字段全局开关（系统配置 → 业务字段） */
const { colorEnabled, customerDrawingNoEnabled } = useFeatureFlags();

/* 输入自动大写：PO#/生产单号/材质/生产图号统一调用 */
const upperFmt = (v: string) => (v ?? '').toUpperCase();

const route = useRoute();
const router = useRouter();
const editId = ref<number | null>(route.query.id ? Number(route.query.id) : null);
/** 审计追溯原始行（编辑态由详情接口带回，走全局 AuditInfo 展示） */
const auditRow = ref<any>(null);
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
  /** 客户图号（客户来图图号，区别于部件组的生产图号） */
  customerDrawingNo: string;
  productName: string;
  railSection: string;
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

const form = reactive({
  poNo: '',
  /** 生产单号：订单级，与 PO# 一对一 */
  productionNo: '',
  customerId: undefined as number | undefined,
  customerName: '',
  orderDate: new Date().toISOString().slice(0, 10),
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

/** 订单备注版块折叠态：新建时展开引导填写，编辑时有内容才展开 */
const reqCollapsed = ref(false);
const richEditorRef = ref<InstanceType<typeof RichEditor>>();
/** el-switch 需要独立的读写代理，直接绑 form.isOpening 在 reactive 上也可，此处保持显式 */
const isOpeningOrder = computed({
  get: () => form.isOpening,
  set: (v: number) => {
    form.isOpening = v;
  },
});
const rules = {
  customerName: [{ required: true, message: '请选择或输入客户', trigger: 'change' }],
  orderDate: [{ required: true, message: '请选择订单日期', trigger: 'change' }],
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
    if (editId.value) {
      const row = await getOrderDetail(editId.value);
      orderNo.value = row.orderNo;
      auditRow.value = row; // 底部审计条（创建人/更新人/时间）
      Object.assign(form, {
        poNo: row.poNo ?? '',
        productionNo: row.productionNo ?? '',
        customerId: row.customerId ?? undefined,
        customerName: row.customerName,
        orderDate: (row.orderDate || '').slice(0, 10),
        salesman: row.salesman ?? '',
        merchandiser: row.merchandiser ?? '',
        orderSource: row.orderSource ?? '',
        isOpening: row.isOpening ?? 0,
        remark: row.remark ?? '',
        otherReq: row.otherReq ?? '',
        products: row.products.map((p) => ({
          _key: nextKey(),
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
          isSplit: p.isSplit ?? 0,
          dimensionRaw: p.dimensionRaw ?? (p.dimensionMm != null ? String(p.dimensionMm) : ''),
          dimensionUnit: p.dimensionUnit ?? 'mm',
          dimensionMm: p.dimensionMm,
          surfaceType: p.surfaceType || 'none',
          color: p.color ?? '',
          sheetMaterial: p.sheetMaterial ?? '',
          orderQty: p.orderQty,
          unit: p.unit,
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
 * 该组类型在当前节数/卡口下展不展得出部件行。展不出的（如二节轨的中轨组）
 * 服务端会直接拒绝保存，前端提前挡掉，别把错误留到点保存时才炸。
 * 判定复用共享包蓝图，不另写节数规则——以后加新组类型自动正确。
 */
function groupTypeUnavailable(p: ProductRow, groupType: string): boolean {
  return expandPartRows(groupType, p.railSection, hasSocket(p._types), 1).length === 0;
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
  p.dimensionMm = p.dimensionRaw ? toMm(Number(p.dimensionRaw), p.dimensionUnit) : null;
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
async function onSave() {
  await formRef.value?.validate();
  // 分体行守卫：组并集=全部件就是整品（服务端同样会拒），提前拦下并指明行号
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
    poNo: form.poNo || undefined,
    productionNo: form.productionNo || undefined,
    customerId: form.customerId,
    customerName: form.customerName,
    orderDate: form.orderDate,
    salesman: form.salesman || undefined,
    merchandiser: form.merchandiser || undefined,
    orderSource: form.orderSource || undefined,
    attachmentIds: JSON.stringify(attachments.value),
    remark: form.remark || undefined,
    otherReq: form.otherReq || undefined,
    products: form.products.map<OrderProductPayload>((p, i) => ({
      orderType: p.orderType,
      isNewOrder: p.isNewOrder,
      isExport: p.isExport,
      exportCountry: p.isExport ? p.exportCountry || undefined : undefined,
      materialCode: p.materialCode || undefined,
      itemNo: p.itemNo || undefined,
      customerDrawingNo: p.customerDrawingNo || undefined,
      productName: p.productName || undefined,
      productType: p._types.join(','),
      railSection: p.railSection,
      isSplit: p.isSplit,
      dimensionMm: p.dimensionMm ?? undefined,
      dimensionRaw: p.dimensionRaw || undefined,
      dimensionUnit: p.dimensionUnit,
      surfaceType: p.surfaceType,
      color: p.color || undefined,
      sheetMaterial: p.sheetMaterial || undefined,
      orderQty: p.orderQty,
      unit: p.unit,
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
  .pc-title { font-weight: 600; }
  .pc-meta { color: var(--el-text-color-secondary); font-size: 13px; b { color: var(--el-color-primary); } }
}
.group-title {
  font-size: 13px; color: var(--el-text-color-secondary);
  margin: 4px 0 8px; display: flex; align-items: center; gap: 8px;
}
/* 分体出货：开关旁的问号提示与形态预览标签、部件组标题里的操作提示 */
.split-tip { margin-left: 6px; color: var(--el-text-color-placeholder); cursor: help; vertical-align: middle; }
.split-form-tag { margin-left: 8px; }
.split-hint { color: var(--el-color-warning); }
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
/* 出口国家下拉：国旗+中文名 左侧，英文全称 右侧（沿袭 hb-mes） */
.country-popper .country-option {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%;
  .country-left { display: flex; align-items: center; gap: 8px; min-width: 0;
    .fi { font-size: 16px; line-height: 1; box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.08); border-radius: 2px; overflow: hidden; }
    .country-zh { font-size: 13px; font-weight: 500; }
  }
  .country-en { color: var(--el-text-color-placeholder); font-size: 12px; flex-shrink: 0; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
