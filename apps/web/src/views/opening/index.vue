<template>
  <div class="page">
    <el-card shadow="never">
      <div class="intro">
        <el-icon><InfoFilled /></el-icon>
        <span>
          系统上线时把手工账上的存量搬进系统，<b>菜单常驻、可反复补录</b>。
          成品期初会生成一张 <b>FGO 期初单并立即生效</b>，在「成品出入库」里可查、录错可红字冲销；
          部件期初按 7 维属性累加并留变动流水。
          已完结订单剩下的成品不在这里录——请到<b>「物料管理 → 呆滞品管理」</b>逐批建档。
        </span>
      </div>

      <el-tabs v-model="tab">
        <!-- ============ 成品期初（挂订单）============ -->
        <el-tab-pane label="成品期初（挂订单）" name="group">
          <div class="tab-tip">
            适用于<b>未完结的历史订单</b>：先在「订单管理」把订单补录进来（<b>必须勾选「期初补录」</b>），
            再在这里按产品录入已完成入库的数量。这部分<b>计入台账「完成数」</b>，参与成品欠数。
            <br />
            「添加产品」<b>只列打开了「期初补录」开关的订单</b>——期初不受装配闸门约束，
            挂到正常订单上等于跳过装配凭空加库存，故一律拦下。
            已完结订单剩下的成品请改到<b>「呆滞品管理」</b>建档。
          </div>
          <div class="toolbar">
            <el-date-picker v-model="docDate" type="date" value-format="YYYY-MM-DD" size="small" style="width: 150px" />
            <el-button size="small" type="primary" plain :icon="Plus" @click="openPicker">添加产品</el-button>
            <el-input v-model="groupRemark" size="small" placeholder="整单备注（选填）" style="width: 220px" />
            <span class="sum">合计 <b>{{ groupTotal }}</b> 支 / {{ groupRows.length }} 行</span>
            <el-button
              size="small" type="primary" v-permission.disable="'opening:finished'"
              :loading="saving" :disabled="!groupRows.length" @click="submitGroup"
            >提交期初</el-button>
          </div>
          <el-table :data="groupRows" border stripe size="small" empty-text="请点击「添加产品」选择要录期初的产品">
            <el-table-column type="index" label="#" width="46" align="center" />
            <el-table-column label="订单号" prop="orderNo" width="130" show-overflow-tooltip />
            <el-table-column label="客户" prop="customerName" width="110" show-overflow-tooltip />
            <el-table-column label="生产单号" prop="productionNo" width="115" show-overflow-tooltip />
            <el-table-column label="产品型号" prop="productModel" min-width="150" show-overflow-tooltip />
            <el-table-column label="规格" prop="dimensionText" width="95" align="center" />
            <el-table-column label="边别" width="70" align="center">
              <template #default="{ row }">
                <color-tag v-if="row.side" :seed="row.side">{{ sideLabel(row.side) }}</color-tag>
                <span v-else>—</span>
              </template>
            </el-table-column>
            <el-table-column label="订单数" prop="qtyPcs" width="80" align="center" />
            <el-table-column label="期初数量(支)" width="130" align="center">
              <template #default="{ row }">
                <el-input-number v-model="row.quantity" :min="1" :precision="0" :controls="false" style="width: 100%" />
              </template>
            </el-table-column>
            <el-table-column label="备注" min-width="110">
              <template #default="{ row }"><el-input v-model="row.remark" /></template>
            </el-table-column>
            <el-table-column label="操作" width="70" align="center" fixed="right">
              <template #default="{ $index }">
                <el-button size="small" link type="danger" :icon="Delete" @click="groupRows.splice($index, 1)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- ============ 部件期初 ============ -->
        <el-tab-pane label="部件期初" name="part">
          <div class="tab-tip">
            按<b>部件/边别/货号/节数/产品类型/料厚/规格</b>七维属性累加到部件台账，每行都会留一条
            <b>来源=期初录入</b>的变动流水。整批<b>全有全无</b>——某行出错整批不落库，改完重提不会重复计数。
          </div>
          <div class="toolbar">
            <el-input v-model="partReason" size="small" placeholder="期初原因（默认「期初录入」）" style="width: 220px" />
            <el-button size="small" type="primary" plain :icon="Plus" @click="addPartRow">添加一行</el-button>
            <span class="sum">合计 <b>{{ partTotal }}</b> 支 / {{ partRows.length }} 行</span>
            <el-button
              size="small" type="primary" v-permission.disable="'opening:part'"
              :loading="saving" :disabled="!partRows.length" @click="submitPart"
            >提交期初</el-button>
          </div>
          <el-table :data="partRows" border stripe size="small" empty-text="请点击「添加一行」录入">
            <el-table-column type="index" label="#" width="46" align="center" />
            <el-table-column label="部件 *" width="110">
              <template #default="{ row }">
                <el-select v-model="row.partType" style="width: 100%">
                  <el-option v-for="o in PART_TYPE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="货号 *" width="120">
              <template #default="{ row }"><el-input v-model="row.itemNo" placeholder="如 53#" /></template>
            </el-table-column>
            <el-table-column label="节数" width="115">
              <template #default="{ row }">
                <el-select v-model="row.railSection" clearable style="width: 100%">
                  <el-option v-for="o in RAIL_SECTION_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="产品类型" width="150">
              <template #default="{ row }">
                <el-select v-model="row.productTypes" multiple collapse-tags placeholder="可多选" style="width: 100%">
                  <el-option v-for="o in PRODUCT_TYPE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="边别" width="110">
              <template #default="{ row }">
                <el-select v-model="row.side" clearable placeholder="非卡口留空" style="width: 100%">
                  <el-option v-for="o in SIDE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="料厚" width="130">
              <template #default="{ row }"><el-input v-model="row.materialThickness" placeholder="如 1.2" /></template>
            </el-table-column>
            <el-table-column label="规格(mm)" width="105">
              <template #default="{ row }">
                <el-input-number v-model="row.dimensionMm" :min="0" :precision="0" :controls="false" style="width: 100%" />
              </template>
            </el-table-column>
            <el-table-column label="数量(支) *" width="115">
              <template #default="{ row }">
                <el-input-number v-model="row.quantity" :min="1" :precision="0" :controls="false" style="width: 100%" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="70" align="center" fixed="right">
              <template #default="{ $index }">
                <el-button size="small" link type="danger" :icon="Delete" @click="partRows.splice($index, 1)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 产品选择器（挂订单期初用）：按边别展开 -->
    <el-dialog v-model="pickerVisible" title="选择要录期初的订单产品" width="1000px" top="6vh" @open="loadOptions">
      <div class="picker-bar">
        <el-input
          v-model="pickerKeyword" clearable size="small" style="width: 280px"
          placeholder="订单号/客户/生产单号/型号/货号"
          @clear="loadOptions" @keyup.enter="loadOptions"
        />
        <el-button size="small" type="primary" :icon="Search" @click="loadOptions">查询</el-button>
        <span class="picker-tip">只列「期初补录」订单；含卡口的产品按左右分行录入</span>
      </div>
      <el-table ref="pickerRef" :data="pickerRows" v-loading="pickerLoading" border stripe size="small" height="52vh"
        empty-text="没有「期初补录」订单。请先到「订单管理」录入订单并打开「期初补录」开关"
        @selection-change="(v: any[]) => (picked = v)">
        <el-table-column type="selection" width="42" :selectable="isSelectable" />
        <el-table-column label="订单号" prop="orderNo" width="130" show-overflow-tooltip />
        <el-table-column label="客户" prop="customerName" width="110" show-overflow-tooltip />
        <el-table-column label="生产单号" prop="productionNo" width="115" show-overflow-tooltip />
        <el-table-column label="产品型号" prop="productModel" min-width="150" show-overflow-tooltip />
        <el-table-column label="规格" prop="dimensionText" width="95" align="center" />
        <el-table-column label="边别" width="70" align="center">
          <template #default="{ row }">
            <color-tag v-if="row.side" :seed="row.side">{{ sideLabel(row.side) }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="订单数" prop="qtyPcs" width="80" align="center" />
      </el-table>
      <template #footer>
        <span class="picker-count">已选 {{ picked.length }} 行</span>
        <el-button size="small" @click="pickerVisible = false">取消</el-button>
        <el-button size="small" type="primary" @click="confirmPick">添加到明细</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Delete, Search, InfoFilled } from '@element-plus/icons-vue';
import { openingFinished, openingPart } from '@/api/opening';
import { getStockGroupOptions } from '@/api/finished-stock';
import {
  PART_TYPE_OPTIONS,
  SIDE_OPTIONS,
  RAIL_SECTION_OPTIONS,
  PRODUCT_TYPE_OPTIONS,
  sideLabel,
  normalizeProductTypes,
} from '@/constants/dict';
import ColorTag from '@/components/ColorTag.vue';

const tab = ref('group');
const saving = ref(false);
const today = () => new Date().toISOString().slice(0, 10);

/* ===================== 挂订单期初 ===================== */
interface GroupRow {
  orderProductId: number;
  side: string;
  orderNo: string | null;
  customerName: string | null;
  productionNo: string | null;
  productModel: string | null;
  dimensionText: string | null;
  qtyPcs: number;
  quantity: number;
  remark: string;
}
const docDate = ref(today());
const groupRemark = ref('');
const groupRows = ref<GroupRow[]>([]);
const groupTotal = computed(() => groupRows.value.reduce((s, r) => s + (r.quantity || 0), 0));

const pickerVisible = ref(false);
const pickerLoading = ref(false);
const pickerKeyword = ref('');
const pickerRows = ref<GroupRow[]>([]);
const picked = ref<GroupRow[]>([]);
const pickerRef = ref<any>();

function openPicker() {
  pickerVisible.value = true;
}
async function loadOptions() {
  pickerLoading.value = true;
  try {
    const opts = await getStockGroupOptions({
      keyword: pickerKeyword.value || undefined,
      limit: 300,
      // 只列「期初补录」订单：期初豁免装配闸门，挂正常订单等于绕过闸门凭空加库存。
      // 服务端 buildOpeningItems 另有硬校验，这里的过滤只是不让人选错。
      onlyOpening: true,
    });
    // 复用出入库的产品行选项接口，按边别展开成可选行（期初不看可入库量，闸门对期初豁免）
    pickerRows.value = opts.flatMap((o) =>
      o.sides.map((s) => ({
        orderProductId: o.orderProductId,
        side: s.side,
        orderNo: o.orderNo,
        customerName: o.customerName,
        productionNo: o.productionNo,
        productModel: o.productModel,
        dimensionText: o.dimensionText,
        qtyPcs: o.qtyPcs,
        quantity: 0,
        remark: '',
      })),
    );
  } finally {
    pickerLoading.value = false;
  }
}
function isSelectable(row: GroupRow) {
  return !groupRows.value.some(
    (r) => r.orderProductId === row.orderProductId && r.side === row.side,
  );
}
function confirmPick() {
  picked.value.forEach((o) => {
    if (groupRows.value.some((r) => r.orderProductId === o.orderProductId && r.side === o.side)) return;
    // 默认按订单数带出（含卡口左右各半，奇数支左边多一支，与 expandPartRows 同口径），
    // 期初多半就是整个产品已完成
    const def = o.side === 'right' ? Math.floor(o.qtyPcs / 2) : o.side ? Math.ceil(o.qtyPcs / 2) : o.qtyPcs;
    groupRows.value.push({ ...o, quantity: def || 1, remark: '' });
  });
  picked.value = [];
  pickerRef.value?.clearSelection?.();
  pickerVisible.value = false;
}

async function submitGroup() {
  const bad = groupRows.value.findIndex((r) => !r.quantity || r.quantity <= 0);
  if (bad >= 0) return ElMessage.warning(`第 ${bad + 1} 行期初数量必须大于 0`);
  saving.value = true;
  try {
    const res = await openingFinished({
      docDate: docDate.value,
      remark: groupRemark.value || undefined,
      items: groupRows.value.map((r) => ({
        orderProductId: r.orderProductId,
        side: r.side,
        quantity: r.quantity,
        remark: r.remark || undefined,
      })),
    });
    ElMessage.success(`期初单 ${res.docNo} 已录入并生效（${res.itemCount} 行）`);
    if (res.finished?.length) ElMessage.success(`订单 ${res.finished.join('、')} 已交清，自动完结`);
    groupRows.value = [];
    groupRemark.value = '';
  } finally {
    saving.value = false;
  }
}

/* ===================== 部件期初 ===================== */
interface PartRow {
  partType: string;
  side: string;
  itemNo: string;
  railSection: string;
  productTypes: string[];
  materialThickness: string;
  dimensionMm: number;
  quantity: number;
}
const partReason = ref('');
const partRows = ref<PartRow[]>([]);
const partTotal = computed(() => partRows.value.reduce((s, r) => s + (r.quantity || 0), 0));

function addPartRow() {
  partRows.value.push({
    partType: 'outer', side: '', itemNo: '', railSection: 'three_section',
    productTypes: [], materialThickness: '', dimensionMm: 0, quantity: 1,
  });
}
async function submitPart() {
  const noItem = partRows.value.findIndex((r) => !r.itemNo.trim());
  if (noItem >= 0) return ElMessage.warning(`第 ${noItem + 1} 行必须填货号`);
  const badQty = partRows.value.findIndex((r) => !r.quantity || r.quantity <= 0);
  if (badQty >= 0) return ElMessage.warning(`第 ${badQty + 1} 行数量必须大于 0`);
  saving.value = true;
  try {
    const res = await openingPart({
      reason: partReason.value || undefined,
      items: partRows.value.map((r) => ({
        partType: r.partType,
        side: r.side || '',
        itemNo: r.itemNo.trim(),
        railSection: r.railSection || '',
        productType: normalizeProductTypes(r.productTypes),
        materialThickness: r.materialThickness.trim(),
        dimensionMm: r.dimensionMm || 0,
        quantity: r.quantity,
      })),
    });
    ElMessage.success(`部件期初已录入 ${res.total} 行`);
    partRows.value = [];
  } finally {
    saving.value = false;
  }
}

</script>

<script lang="ts">
export default { name: 'OpeningEntry' };
</script>

<style scoped lang="scss">
.intro {
  display: flex; align-items: flex-start; gap: 6px; margin-bottom: 10px;
  font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.7;
  b { color: var(--el-text-color-primary); }
}
.tab-tip {
  margin-bottom: 10px; padding: 8px 12px; border-radius: 6px;
  background: var(--el-fill-color-lighter);
  font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.7;
  b { color: var(--el-text-color-primary); }
}
.toolbar {
  display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;
  .sum { margin-left: auto; font-size: 12px; color: var(--el-text-color-secondary); }
  .sum b { color: var(--el-color-primary); font-size: 14px; }
}
.picker-bar {
  display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
  .picker-tip { color: var(--el-text-color-secondary); font-size: 12px; }
}
.picker-count { margin-right: auto; float: left; color: var(--el-text-color-secondary); font-size: 13px; line-height: 24px; }
</style>
