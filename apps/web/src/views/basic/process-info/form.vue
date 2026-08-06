<template>
  <div class="page">
    <el-card shadow="never" v-loading="pageLoading">
      <div class="form-header">
        <div class="form-title">
          <el-button size="small" :icon="Back" @click="goBack">返回列表</el-button>
          <span class="title-text">{{ editId ? '编辑开单信息' : '新增开单信息' }}</span>
          <span v-if="form.drawingNo" class="title-sub">{{ form.drawingNo }}</span>
        </div>
        <div>
          <el-button size="small" @click="goBack">取消</el-button>
          <el-button size="small" type="primary" :loading="saving" @click="onSave">保存</el-button>
        </div>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px" size="small" class="process-form">
        <div class="section-title">基本信息</div>
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="生产图号" prop="drawingNo">
              <el-input v-model="form.drawingNo" placeholder="唯一；订单录入按此图号自动带入" :spellcheck="false" :formatter="upperFmt" :parser="upperFmt" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="规格">
              <el-input v-model="form.dimension" placeholder="如 10寸 自动换算为 250mm" @blur="onDimensionBlur" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="客户名称">
              <el-select
                v-model="customerPick"
                filterable
                clearable
                allow-create
                default-first-option
                :filter-method="filterCustomers"
                placeholder="选择或输入客户"
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
            <el-form-item label="产品名称">
              <el-input v-model="form.productName" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="机台(薄料)">
              <el-select
                v-model="machineTags"
                multiple
                filterable
                allow-create
                default-first-option
                placeholder="输入机台号回车；无厚薄之分时填此栏"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="机台(厚料)">
              <el-select
                v-model="machineThickTags"
                multiple
                filterable
                allow-create
                default-first-option
                placeholder="厚料生产机台（如 82、80、81），无则留空"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="section-title">分部件要求</div>
        <table class="part-grid">
          <thead>
            <tr>
              <th class="pg-part">部件</th>
              <th class="pg-ver">版本</th>
              <th>长度要求</th>
              <th>特殊要求</th>
              <th>开单注明</th>
              <th class="pg-mold">模具编号</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="pg-part">外轨</td>
              <td><el-input v-model="form.drawingVersionOuter" placeholder="如 1.0" @blur="onVersionBlur('drawingVersionOuter')" /></td>
              <td><el-input v-model="form.lengthReqOuter" placeholder="如 正常长度（不变）" /></td>
              <td><el-input v-model="form.specialReqOuter" type="textarea" :autosize="{ minRows: 1, maxRows: 4 }" /></td>
              <td><el-input v-model="form.billingNoteOuter" type="textarea" :autosize="{ minRows: 1, maxRows: 4 }" placeholder="开单时需注明的事项" /></td>
              <td><el-input v-model="form.moldNoOuter" :formatter="upperFmt" :parser="upperFmt" /></td>
            </tr>
            <tr>
              <td class="pg-part">中轨</td>
              <td><el-input v-model="form.drawingVersionMiddle" placeholder="如 1.0 自动补「版本」" @blur="onVersionBlur('drawingVersionMiddle')" /></td>
              <td><el-input v-model="form.lengthReqMiddle" placeholder="如 外轨正常长度-17MM；二节轨产品此行留空" /></td>
              <td><el-input v-model="form.specialReqMiddle" type="textarea" :autosize="{ minRows: 1, maxRows: 4 }" /></td>
              <td><el-input v-model="form.billingNoteMiddle" type="textarea" :autosize="{ minRows: 1, maxRows: 4 }" /></td>
              <td><el-input v-model="form.moldNoMiddle" :formatter="upperFmt" :parser="upperFmt" /></td>
            </tr>
            <tr>
              <td class="pg-part">内轨</td>
              <td><el-input v-model="form.drawingVersionInner" placeholder="如 1.0" @blur="onVersionBlur('drawingVersionInner')" /></td>
              <td><el-input v-model="form.lengthReqInner" placeholder="如 外轨正常长度-2MM" /></td>
              <td><el-input v-model="form.specialReqInner" type="textarea" :autosize="{ minRows: 1, maxRows: 4 }" /></td>
              <td><el-input v-model="form.billingNoteInner" type="textarea" :autosize="{ minRows: 1, maxRows: 4 }" /></td>
              <td><el-input v-model="form.moldNoInner" :formatter="upperFmt" :parser="upperFmt" /></td>
            </tr>
          </tbody>
        </table>

        <div class="section-title">工艺更新</div>
        <el-row :gutter="16">
          <el-col :xs="24" :md="12">
            <el-form-item label="更新说明">
              <el-input v-model="form.processUpdateNote" type="textarea" :rows="3" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-form-item label="备注">
              <el-input v-model="form.remark" type="textarea" :rows="3" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="附图(多图)">
              <div class="img-list">
                <div v-for="(url, i) in images" :key="url" class="img-item">
                  <el-image :src="url" :preview-src-list="images" :preview-teleported="true" fit="cover" />
                  <el-icon class="img-remove" @click="images.splice(i, 1)"><CircleCloseFilled /></el-icon>
                </div>
                <el-upload
                  :show-file-list="false"
                  :auto-upload="false"
                  accept="image/jpeg,image/png,image/webp"
                  :on-change="(f: UploadFile) => onPickImage(f, images)"
                >
                  <div class="img-add" v-loading="uploading"><el-icon><Plus /></el-icon></div>
                </el-upload>
              </div>
            </el-form-item>
          </el-col>
        </el-row>

        <div class="section-title">审核（产品级，不随 Excel 导入导出）</div>
        <el-row :gutter="16">
          <el-col :xs="24" :md="12">
            <el-form-item label="审核意见">
              <el-input v-model="form.reviewOpinion" type="textarea" :rows="3" placeholder="领导/技术审核意见（文字）" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="意见截图">
              <div class="img-list">
                <div v-for="(url, i) in reviewImgs" :key="url" class="img-item">
                  <el-image :src="url" :preview-src-list="reviewImgs" :preview-teleported="true" fit="cover" />
                  <el-icon class="img-remove" @click="reviewImgs.splice(i, 1)"><CircleCloseFilled /></el-icon>
                </div>
                <el-upload
                  :show-file-list="false"
                  :auto-upload="false"
                  accept="image/jpeg,image/png,image/webp"
                  :on-change="(f: UploadFile) => onPickImage(f, reviewImgs)"
                >
                  <div class="img-add" v-loading="uploading"><el-icon><Plus /></el-icon></div>
                </el-upload>
              </div>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="审核人">
              <el-input v-model="form.reviewer" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="审核日期">
              <el-date-picker v-model="form.reviewDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

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
import { Plus, Back, CircleCloseFilled } from '@element-plus/icons-vue';
import {
  getProcessInfoDetail,
  createProcessInfo,
  updateProcessInfo,
} from '@/api/process-info';
import { getAllCustomers, type CustomerItem } from '@/api/customer';
import { uploadFile } from '@/api/file';
import { normalizeDimensionText } from '@/constants/dict';

const route = useRoute();
const router = useRouter();
const editId = ref<number | null>(route.query.id ? Number(route.query.id) : null);

/* 输入自动大写：生产图号、模具编号等含字母字段统一调用 */
const upperFmt = (v: string) => (v ?? '').toUpperCase();

/* 版本（部件级：外/中/内轨）：失焦时数字自动加「版本」后缀——
 * 纯小数 1.01 → 1.01版本；纯整数 4 → 4.0版本；
 * 旧写法 "Ver x" / 已带「版本」后缀的先剥离再规范化；非数字格式保持原值。 */
type VersionField = 'drawingVersionOuter' | 'drawingVersionMiddle' | 'drawingVersionInner';
function onVersionBlur(field: VersionField) {
  let v = (form[field] || '').trim();
  if (!v) return;
  const prefix = /^ver\s*/i.exec(v);
  if (prefix) v = v.slice(prefix[0].length).trim();
  v = v.replace(/版本$/, '').trim();
  if (/^\d+$/.test(v)) form[field] = `${v}.0版本`;
  else if (/^\d+\.\d+$/.test(v)) form[field] = `${v}版本`;
  else form[field] = v || '';
}

/* 规格（产品级）：失焦自动换算——寸→mm（1寸=25mm），纯数字补 mm */
function onDimensionBlur() {
  form.dimension = normalizeDimensionText(form.dimension);
}

const pageLoading = ref(false);
const saving = ref(false);
const uploading = ref(false);
const formRef = ref<FormInstance>();
const machineTags = ref<string[]>([]);
const machineThickTags = ref<string[]>([]);
const images = ref<string[]>([]);
const reviewImgs = ref<string[]>([]);

const form = reactive({
  drawingNo: '',
  drawingVersionOuter: '', drawingVersionMiddle: '', drawingVersionInner: '',
  dimension: '',
  customerId: undefined as number | undefined,
  customerName: '',
  productName: '',
  lengthReqOuter: '', lengthReqMiddle: '', lengthReqInner: '',
  specialReqOuter: '', specialReqMiddle: '', specialReqInner: '',
  billingNoteOuter: '', billingNoteMiddle: '', billingNoteInner: '',
  moldNoOuter: '', moldNoMiddle: '', moldNoInner: '',
  processUpdateNote: '',
  reviewOpinion: '',
  reviewer: '',
  reviewDate: '' as string | null,
  remark: '',
});
const rules = {
  drawingNo: [{ required: true, message: '请输入生产图号', trigger: 'blur' }],
};

/* ===== 客户下拉（双列：名称 + 客户代码，同名客户靠代码区分；可手输新客户） ===== */
const customers = ref<CustomerItem[]>([]);
const customerOptions = ref<CustomerItem[]>([]);
/** number = 选中已有客户 id；string = 手输的新客户名；'' = 未选 */
const customerPick = ref<number | string>('');

function resetCustomerFilter() {
  customerOptions.value = customers.value;
}
function filterCustomers(q: string) {
  const kw = q.trim().toLowerCase();
  customerOptions.value = kw
    ? customers.value.filter(
        (c) =>
          c.customerName.toLowerCase().includes(kw) ||
          (c.customerCode || '').toLowerCase().includes(kw),
      )
    : customers.value;
}
function onCustomerPick(v: number | string) {
  if (typeof v === 'number') {
    const hit = customers.value.find((c) => c.id === v);
    form.customerId = hit?.id;
    form.customerName = hit?.customerName ?? '';
  } else {
    form.customerId = undefined;
    form.customerName = String(v ?? '').trim();
  }
}

/* ===== 初始化 ===== */
async function init() {
  pageLoading.value = true;
  try {
    customers.value = await getAllCustomers();
    customerOptions.value = customers.value;
    if (editId.value) {
      const row = await getProcessInfoDetail(editId.value);
      Object.assign(form, {
        drawingNo: row.drawingNo,
        drawingVersionOuter: row.drawingVersionOuter ?? '', drawingVersionMiddle: row.drawingVersionMiddle ?? '', drawingVersionInner: row.drawingVersionInner ?? '',
        dimension: row.dimension ?? '',
        customerId: row.customerId ?? undefined,
        customerName: row.customerName ?? '',
        productName: row.productName ?? '',
        lengthReqOuter: row.lengthReqOuter ?? '', lengthReqMiddle: row.lengthReqMiddle ?? '', lengthReqInner: row.lengthReqInner ?? '',
        specialReqOuter: row.specialReqOuter ?? '', specialReqMiddle: row.specialReqMiddle ?? '', specialReqInner: row.specialReqInner ?? '',
        billingNoteOuter: row.billingNoteOuter ?? '', billingNoteMiddle: row.billingNoteMiddle ?? '', billingNoteInner: row.billingNoteInner ?? '',
        moldNoOuter: row.moldNoOuter ?? '', moldNoMiddle: row.moldNoMiddle ?? '', moldNoInner: row.moldNoInner ?? '',
        processUpdateNote: row.processUpdateNote ?? '',
        reviewOpinion: row.reviewOpinion ?? '',
        reviewer: row.reviewer ?? '',
        reviewDate: row.reviewDate ? String(row.reviewDate).slice(0, 10) : '',
        remark: row.remark ?? '',
      });
      machineTags.value = (row.machines || '').split(',').filter(Boolean);
      machineThickTags.value = (row.machinesThick || '').split(',').filter(Boolean);
      images.value = parseImages(row.processUpdateImages);
      reviewImgs.value = parseImages(row.reviewImages);
      // 回显客户：id 仍在客户列表 → 选中项；否则退回名称文本
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

function parseImages(json: string | null): string[] {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function onPickImage(file: UploadFile, target: { value?: string[] } & string[] | string[]) {
  const raw = file.raw as File | undefined;
  if (!raw) return;
  if (raw.size > 10 * 1024 * 1024) {
    ElMessage.warning('图片不能超过 10MB');
    return;
  }
  uploading.value = true;
  try {
    const url = await uploadFile(raw, 'process_image');
    (target as string[]).push(url);
  } finally {
    uploading.value = false;
  }
}

async function onSave() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    const payload = {
      ...form,
      reviewDate: form.reviewDate || undefined,
      machines: machineTags.value.map((s) => s.trim()).filter(Boolean).join(','),
      machinesThick: machineThickTags.value.map((s) => s.trim()).filter(Boolean).join(','),
      processUpdateImages: JSON.stringify(images.value),
      reviewImages: JSON.stringify(reviewImgs.value),
    };
    if (editId.value) {
      await updateProcessInfo(editId.value, payload);
      ElMessage.success('已保存');
    } else {
      await createProcessInfo(payload);
      ElMessage.success('已新增');
    }
    goBack();
  } finally {
    saving.value = false;
  }
}

function goBack() {
  router.push('/basic/process-info');
}
</script>

<script lang="ts">
export default { name: 'ProcessInfoForm' };
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
/* 小节标题：左侧粗竖边框线，不用分隔线 */
.section-title {
  font-size: 14px; font-weight: 600; color: var(--el-text-color-primary);
  border-left: 4px solid var(--el-color-primary);
  padding-left: 10px; line-height: 1.3;
  margin: 22px 0 14px;
}
.process-form { max-width: 1180px; }
.part-grid {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 6px;
  th, td { border: 1px solid var(--el-border-color); }
  th { padding: 6px 8px; background: var(--el-fill-color-light); font-weight: 600; font-size: 13px; text-align: center; }
  /* 外轨/中轨/内轨所在行：表单控件较紧凑，缩小单元格内边距 */
  td { padding: 3px 4px; }
  .pg-part { width: 64px; text-align: center; font-size: 13px; color: var(--el-text-color-regular); background: var(--el-fill-color-lighter); }
  .pg-mold { width: 150px; }
  .pg-ver { width: 100px; }
  :deep(.el-input__wrapper), :deep(.el-textarea__inner) { box-shadow: none; background: transparent; }
}
.img-list {
  display: flex; flex-wrap: wrap; gap: 8px;
  .img-item {
    position: relative; width: 72px; height: 72px;
    .el-image { width: 100%; height: 100%; border-radius: 6px; }
    .img-remove {
      position: absolute; top: -6px; right: -6px; cursor: pointer;
      color: var(--el-color-danger); background: #fff; border-radius: 50%;
    }
  }
  .img-add {
    width: 72px; height: 72px; border: 1px dashed var(--el-border-color);
    border-radius: 6px; display: flex; align-items: center; justify-content: center;
    color: var(--el-text-color-secondary); cursor: pointer;
    &:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
  }
}
.form-footer {
  margin-top: 26px; padding-top: 14px;
  border-top: 1px solid var(--el-border-color-lighter);
  text-align: right;
}
</style>

<style lang="scss">
/* 客户下拉双列面板（popper 挂 body，需全局样式） */
.customer-2col-popper {
  .el-select-dropdown__item {
    display: flex; justify-content: space-between; align-items: center; gap: 16px;
    min-width: 300px;
    .opt-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .opt-code { flex: none; color: var(--el-text-color-secondary); font-size: 12px; font-family: Consolas, monospace; }
  }
}
</style>
