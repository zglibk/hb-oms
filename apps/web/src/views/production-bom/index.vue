<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="runKeywordSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="生产图号/产品/客户/物料"
            style="width: 250px"
            @input="scheduleKeywordSearch"
            @keyup.enter="runKeywordSearch"
          />
        </el-form-item>
        <el-form-item label="客户">
          <el-select v-model="query.customerId" clearable filterable placeholder="全部客户" style="width: 180px">
            <el-option v-for="c in customers" :key="c.id" :label="c.customerName" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="版本">
          <el-input v-model="query.version" clearable placeholder="如 1.0" style="width: 110px" @keyup.enter="search" />
        </el-form-item>
        <el-form-item>
          <el-button size="small" type="primary" :icon="Search" @click="search">查询</el-button>
          <el-button size="small" :icon="RefreshLeft" @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" v-permission="'production-bom:create'" type="primary" :icon="Plus" @click="openCreate">
          新增生产BOM
        </el-button>
        <el-button size="small" v-permission="'production-bom:import'" type="primary" plain :icon="Upload" @click="openImport">
          批量导入
        </el-button>
        <el-dropdown
          v-permission="'production-bom:export'"
          trigger="click"
          popper-class="bom-export-popper"
          :disabled="exporting"
          @command="onExport"
        >
          <el-button size="small" plain :icon="Download" :loading="exporting">
            批量导出<el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="selected" :disabled="!selection.length">
                <div class="export-option">
                  <b>导出已选BOM</b>
                  <span>当前已选 {{ selection.length }} 份</span>
                </div>
              </el-dropdown-item>
              <el-dropdown-item command="filtered">
                <div class="export-option">
                  <b>按当前筛选导出</b>
                  <span>包含汇总页及每份BOM正式表</span>
                </div>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <span v-if="selection.length" class="selection-tip">已选 {{ selection.length }} 份</span>
      </div>

      <app-table
        v-loading="loading"
        :data="list"
        row-key="id"
        border
        stripe
        :page="query.page"
        :page-size="query.pageSize"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="42" fixed="left" />
        <el-table-column label="生产图号" min-width="150" fixed="left" show-overflow-tooltip>
          <template #default="{ row }">
            <el-button link type="primary" @click="openView(row)">{{ row.drawingNo }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="产品名称" prop="productName" min-width="160" show-overflow-tooltip />
        <el-table-column label="客户" prop="customerName" min-width="135" show-overflow-tooltip>
          <template #default="{ row }">{{ row.customerName || '—' }}</template>
        </el-table-column>
        <el-table-column label="版本" width="90" align="center">
          <template #default="{ row }"><color-tag :seed="`bom-version-${row.version}`">{{ row.version }}</color-tag></template>
        </el-table-column>
        <el-table-column label="物料行数" prop="itemCount" width="90" align="center" />
        <el-table-column label="制表人" width="100" align="center">
          <template #default="{ row }"><color-tag :seed="row.preparedBy">{{ row.preparedBy }}</color-tag></template>
        </el-table-column>
        <el-table-column label="制表日期" prop="preparedDate" width="112" align="center" />
        <el-table-column label="更新人" width="100" align="center">
          <template #default="{ row }">
            <color-tag v-if="row.updaterName" :seed="row.updaterName">{{ row.updaterName }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="150" align="center">
          <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="142" align="center" fixed="right">
          <template #default="{ row }">
            <app-actions :max="4">
              <el-button size="small" link type="primary" :icon="View" title="查看" aria-label="查看" @click="openView(row)" />
              <el-button size="small" v-permission.disable="'production-bom:update'" link type="primary" class="btn-edit" :icon="Edit" title="编辑" aria-label="编辑" @click="openEdit(row)" />
              <el-button size="small" v-permission.disable="'production-bom:export'" link type="primary" :icon="Download" title="导出单个BOM" aria-label="导出单个BOM" :loading="exportingId === row.id" @click="onExportSingle(row)" />
              <el-button size="small" v-permission.disable="'production-bom:delete'" link type="primary" class="btn-delete" :icon="Delete" title="删除" aria-label="删除" :loading="deletingId === row.id" @click="onDelete(row)" />
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination class="pager" :total="total" v-model:page="query.page" v-model:size="query.pageSize" @change="load" />
    </el-card>

    <import-dialog
      v-model="importVisible"
      title="批量导入生产BOM"
      tip="同一BOM可逐行重复表头，也可只在首行填写；任一错误会整批回滚。"
      confirm-text="确定导入文件「{n}」吗？开启覆盖后，同图号同版本的BOM将整份替换。"
      :download-template="downloadProductionBomTemplate"
      :do-import="doImport"
      :summarize="summarizeImport"
      @done="load"
    >
      <template #options>
        <div class="import-overwrite">
          <el-switch v-model="importOverwrite" />
          <span>覆盖更新同图号、同版本BOM（表头和全部明细整份替换）</span>
        </div>
      </template>
    </import-dialog>
  </div>
</template>

<script setup lang="ts">
import { onActivated, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowDown, Delete, Download, Edit, Plus, RefreshLeft, Search, Upload, View } from '@element-plus/icons-vue';
import {
  PRODUCTION_BOM_EXPORT_LIMIT,
  deleteProductionBom,
  exportProductionBoms,
  exportSingleProductionBom,
  getProductionBomList,
  importProductionBoms,
  downloadProductionBomTemplate,
  type ProductionBomQuery,
  type ProductionBomRow,
} from '@/api/production-bom';
import { getAllCustomers, type CustomerItem } from '@/api/customer';
import { useDebouncedSearch } from '@/composables/useDebouncedSearch';
import { useExcelExport } from '@/composables/useExcelExport';
import { formatDateTime } from '@/utils/date';
import { readBlobError } from '@/utils/download';
import AppActions from '@/components/AppActions.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppTable from '@/components/AppTable.vue';
import ColorTag from '@/components/ColorTag.vue';
import ImportDialog from '@/components/ImportDialog.vue';

const router = useRouter();
const loading = ref(false);
const list = ref<ProductionBomRow[]>([]);
const total = ref(0);
const customers = ref<CustomerItem[]>([]);
const selection = ref<ProductionBomRow[]>([]);
const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  customerId: undefined as number | undefined,
  version: '',
});

function apiQuery(page = query.page, pageSize = query.pageSize): ProductionBomQuery {
  return {
    page,
    pageSize,
    keyword: query.keyword.trim() || undefined,
    customerId: query.customerId,
    version: query.version.trim() || undefined,
  };
}

async function load() {
  loading.value = true;
  try {
    const res = await getProductionBomList(apiQuery());
    list.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

function reload() {
  query.page = 1;
  void load();
}

const { schedule: scheduleKeywordSearch, flush: runKeywordSearch } = useDebouncedSearch(reload);

function search() {
  runKeywordSearch();
}

function reset() {
  query.keyword = '';
  query.customerId = undefined;
  query.version = '';
  reload();
}

function openCreate() {
  router.push({ name: 'ProductionBomForm' });
}
function openView(row: ProductionBomRow) {
  router.push({ name: 'ProductionBomForm', query: { id: row.id, mode: 'view' } });
}
function openEdit(row: ProductionBomRow) {
  router.push({ name: 'ProductionBomForm', query: { id: row.id } });
}

const deletingId = ref<number | null>(null);
async function onDelete(row: ProductionBomRow) {
  await ElMessageBox.confirm(
    `确定删除生产图号「${row.drawingNo}」、版本「${row.version}」的整份BOM吗？`,
    '删除生产BOM',
    { type: 'warning', confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' },
  );
  deletingId.value = row.id;
  try {
    await deleteProductionBom(row.id);
    ElMessage.success('已删除');
    selection.value = selection.value.filter((r) => r.id !== row.id);
    await load();
  } finally {
    deletingId.value = null;
  }
}

function onSelectionChange(rows: ProductionBomRow[]) {
  selection.value = rows;
}

const exportingId = ref<number | null>(null);
async function onExportSingle(row: ProductionBomRow) {
  exportingId.value = row.id;
  try {
    await exportSingleProductionBom(row.id, row.drawingNo, row.version);
    ElMessage.success('单份BOM导出已开始，请查看浏览器下载');
  } catch (error) {
    ElMessage.error(await readBlobError(error));
  } finally {
    exportingId.value = null;
  }
}

const { exporting, exportWithConfirm } = useExcelExport();

async function onExport(command: 'selected' | 'filtered') {
  let rows: ProductionBomRow[];
  let exportParams: ProductionBomQuery;
  if (command === 'selected') {
    if (!selection.value.length) return;
    rows = [...selection.value];
    exportParams = { ids: rows.map((r) => r.id).join(',') };
  } else {
    const res = await getProductionBomList(apiQuery(1, PRODUCTION_BOM_EXPORT_LIMIT));
    if (res.total > PRODUCTION_BOM_EXPORT_LIMIT) {
      ElMessage.warning(`当前筛选命中 ${res.total} 份BOM，超过单次导出上限 ${PRODUCTION_BOM_EXPORT_LIMIT} 份，请缩小范围`);
      return;
    }
    rows = res.list;
    exportParams = apiQuery(1, PRODUCTION_BOM_EXPORT_LIMIT);
  }
  const itemTotal = rows.reduce((sum, row) => sum + Number(row.itemCount || 0), 0);
  if (itemTotal > 5000) {
    ElMessage.warning(`当前范围共 ${itemTotal} 条明细，超过单次导出上限 5000 条，请缩小范围`);
    return;
  }
  await exportWithConfirm({
    name: '生产BOM',
    getCount: async () => rows.length,
    scopeText: (count) => command === 'selected'
      ? `导出已选的 <b>${count}</b> 份生产BOM（共 <b>${itemTotal}</b> 条明细）`
      : `按当前筛选导出 <b>${count}</b> 份生产BOM（共 <b>${itemTotal}</b> 条明细）`,
    run: () => exportProductionBoms(exportParams),
  });
}

const importVisible = ref(false);
const importOverwrite = ref(false);
function openImport() {
  importOverwrite.value = false;
  importVisible.value = true;
}
const doImport = (file: File) => importProductionBoms(file, importOverwrite.value);
const summarizeImport = (res: { created: number; updated: number; itemTotal: number }) =>
  `导入成功：新增 ${res.created} 份，更新 ${res.updated} 份，共 ${res.itemTotal} 条明细`;

getAllCustomers().then((rows) => (customers.value = rows));
void load();
onActivated(load);
</script>

<style scoped lang="scss">
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.pager { margin-top: 12px; }
.selection-tip { color: var(--el-text-color-secondary); font-size: 13px; }
.import-overwrite {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border-radius: 4px;
  background: var(--el-fill-color-light); color: var(--el-text-color-regular); font-size: 13px;
}
.export-option { display: flex; flex-direction: column; gap: 2px; min-width: 230px; padding: 5px 2px; }
.export-option b { color: var(--el-text-color-primary); font-weight: 600; }
.export-option span { color: var(--el-text-color-secondary); font-size: 12px; }
</style>

<style lang="scss">
.bom-export-popper {
  .el-dropdown-menu { padding: 6px; }
  .el-dropdown-menu__item { border-radius: 4px; line-height: 1.45; }
  .el-dropdown-menu__item + .el-dropdown-menu__item { margin-top: 4px; border-top: 1px solid var(--el-border-color-lighter); }
}
</style>
