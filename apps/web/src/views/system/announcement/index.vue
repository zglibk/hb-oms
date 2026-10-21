<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" :model="query" class="filter-bar" @submit.prevent="search">
        <el-form-item label="关键词"><el-input v-model="query.keyword" placeholder="标题/摘要" @keyup.enter="search" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width: 120px">
            <el-option label="草稿" value="draft" />
            <el-option label="已发布" value="published" />
            <el-option label="已撤回" value="withdrawn" />
          </el-select>
        </el-form-item>
        <el-form-item label="级别">
          <el-select v-model="query.level" clearable placeholder="全部" style="width: 110px">
            <el-option v-for="item in ANNOUNCEMENT_LEVEL_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="发布时间">
          <el-date-picker
            v-model="publishDateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width: 250px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="search">查询</el-button>
          <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button v-permission="'announcement:create'" type="primary" :icon="Plus" @click="openCreate">新建通告</el-button>
      </div>
      <app-table :data="list" v-loading="loading" border stripe :page="query.page" :page-size="query.pageSize">
        <el-table-column label="级别" width="78"><template #default="{ row }"><AnnouncementLevel :level="row.level" /></template></el-table-column>
        <el-table-column prop="title" label="标题" min-width="200" class-name="col-left" show-overflow-tooltip>
          <template #default="{ row }">{{ row.title }}<audit-info mode="inline" :row="row" /></template>
        </el-table-column>
        <el-table-column prop="summary" label="摘要" min-width="220" class-name="col-left" show-overflow-tooltip />
        <el-table-column label="回复要求" width="92"><template #default="{ row }"><el-tag :type="row.requiresReply ? 'warning' : 'info'">{{ row.requiresReply ? '要求回复' : '无需回复' }}</el-tag></template></el-table-column>
        <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="statusType(row.displayStatus)">{{ row.displayStatus }}</el-tag></template></el-table-column>
        <el-table-column label="发布时间" width="168"><template #default="{ row }">{{ formatDateTime(row.publishAt) }}</template></el-table-column>
        <el-table-column label="失效时间" width="168"><template #default="{ row }">{{ row.expireAt ? formatDateTime(row.expireAt) : '永久有效' }}</template></el-table-column>
        <el-table-column label="进度" width="138">
          <template #default="{ row }">
            {{ row.requiresReply ? '已回复' : '已查看' }} {{ row.completedCount || 0 }}/{{ row.recipientCount || 0 }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="285" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button link type="primary" :icon="View" @click="openDetail(row)">详情</el-button>
              <el-button v-permission="'announcement:update'" link type="primary" :icon="Edit" :disabled="row.status !== 'draft'" @click="openEdit(row)">编辑</el-button>
              <el-button v-permission="'announcement:publish'" link type="success" :icon="Promotion" :disabled="row.status !== 'draft'" @click="onPublish(row)">发布</el-button>
              <el-button v-permission="'announcement:withdraw'" link type="warning" :disabled="row.status !== 'published'" @click="onWithdraw(row)">撤回</el-button>
              <el-button v-permission="'announcement:delete'" link type="danger" :icon="Delete" :disabled="row.status !== 'draft'" @click="onDelete(row)">删除</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination :total="total" v-model:page="query.page" v-model:size="query.pageSize" @change="load" />
    </el-card>

    <el-dialog v-model="formVisible" :title="editId ? '修改通告草稿' : '新建通告草稿'" width="720px">
      <el-alert type="info" :closable="false" show-icon title="草稿可修改；发布或定时发布后内容立即锁定，只能撤回后重新创建。" />
      <el-form ref="formRef" :model="form" :rules="rules" label-width="92px" class="announcement-form">
        <el-form-item label="标题" prop="title"><el-input v-model="form.title" maxlength="128" show-word-limit /></el-form-item>
        <el-form-item label="摘要" prop="summary"><el-input v-model="form.summary" maxlength="255" show-word-limit placeholder="即时弹窗和列表中单独显示" /></el-form-item>
        <el-form-item label="正文" prop="content"><el-input v-model="form.content" type="textarea" :rows="8" maxlength="20000" show-word-limit placeholder="仅支持纯文本" /></el-form-item>
        <el-form-item label="级别" prop="level">
          <el-radio-group v-model="form.level"><el-radio-button v-for="item in ANNOUNCEMENT_LEVEL_OPTIONS" :key="item.value" :value="item.value">{{ item.label }}</el-radio-button></el-radio-group>
        </el-form-item>
        <el-form-item label="要求回复"><el-switch v-model="form.requiresReply" active-text="是" inactive-text="否" /></el-form-item>
        <el-form-item label="发布时间" prop="publishAt"><el-date-picker v-model="form.publishAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" format="YYYY-MM-DD HH:mm" style="width: 100%" @change="onPublishAtChange" /></el-form-item>
        <el-form-item label="有效期">
          <div class="expiry-row">
            <el-checkbox v-model="form.permanent" @change="onPermanentChange">永久有效</el-checkbox>
            <el-date-picker v-if="!form.permanent" v-model="form.expireAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" format="YYYY-MM-DD HH:mm" placeholder="默认发布时间后 3 天" />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveDraft">保存草稿</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'SystemAnnouncement' });

import { onActivated, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Delete, Edit, Plus, Promotion, Refresh, Search, View } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { ANNOUNCEMENT_LEVEL_OPTIONS } from '@hb-oms/shared';
import {
  createAnnouncementDraft,
  deleteAnnouncementDraft,
  getAnnouncementAdminList,
  publishAnnouncement,
  updateAnnouncementDraft,
  withdrawAnnouncement,
  type AnnouncementItem,
  type SaveAnnouncementPayload,
} from '@/api/announcement';
import {
  formatBusinessDateTimeInput,
  formatDateTime,
  parseBusinessDateTime,
  recentSixNaturalMonthRange,
} from '@/utils/date';
import AnnouncementLevel from '@/components/announcement/AnnouncementLevel.vue';

const router = useRouter();
const loading = ref(false);
const list = ref<AnnouncementItem[]>([]);
const total = ref(0);
const query = reactive<{
  keyword: string;
  status: '' | NonNullable<AnnouncementItem['status']>;
  level: '' | AnnouncementItem['level'];
  page: number;
  pageSize: number;
}>({ keyword: '', status: '', level: '', page: 1, pageSize: 20 });
const publishDateRange = ref<[string, string] | null>(recentSixNaturalMonthRange());
const formVisible = ref(false);
const editId = ref<number | null>(null);
const formRef = ref<FormInstance>();
const saving = ref(false);
const form = reactive({ title: '', summary: '', content: '', level: 'normal', requiresReply: false, publishAt: '', expireAt: '', permanent: false });
const rules: FormRules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  summary: [{ required: true, message: '请输入摘要', trigger: 'blur' }],
  content: [{ required: true, message: '请输入正文', trigger: 'blur' }],
  level: [{ required: true, message: '请选择级别', trigger: 'change' }],
  publishAt: [{ required: true, message: '请选择发布时间', trigger: 'change' }],
};

function defaultTimes() {
  const now = new Date();
  now.setSeconds(0, 0);
  return { publishAt: dateTimeValue(now), expireAt: dateTimeValue(new Date(now.getTime() + 3 * 86400000)) };
}
function dateTimeValue(value: string | Date) {
  return formatBusinessDateTimeInput(value);
}
function resetForm() {
  const times = defaultTimes();
  Object.assign(form, { title: '', summary: '', content: '', level: 'normal', requiresReply: false, ...times, permanent: false });
}
async function load() {
  loading.value = true;
  try {
    const result = await getAnnouncementAdminList({
      keyword: query.keyword.trim() || undefined,
      status: query.status || undefined,
      level: query.level || undefined,
      publishDateFrom: publishDateRange.value?.[0] || undefined,
      publishDateTo: publishDateRange.value?.[1] || undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
    list.value = result.list;
    total.value = result.total;
  } finally { loading.value = false; }
}
function search() { query.page = 1; void load(); }
function resetQuery() {
  Object.assign(query, { keyword: '', status: '', level: '', page: 1 });
  publishDateRange.value = recentSixNaturalMonthRange();
  void load();
}
function openCreate() { editId.value = null; resetForm(); formVisible.value = true; }
function openEdit(row: AnnouncementItem) {
  editId.value = row.id;
  Object.assign(form, {
    title: row.title,
    summary: row.summary,
    content: row.content || '',
    level: row.level,
    requiresReply: Boolean(row.requiresReply),
    publishAt: dateTimeValue(row.publishAt),
    expireAt: row.expireAt ? dateTimeValue(row.expireAt) : '',
    permanent: !row.expireAt,
  });
  formVisible.value = true;
}
function onPermanentChange(value: unknown) {
  if (!value && !form.expireAt) {
    const base = form.publishAt ? parseBusinessDateTime(form.publishAt) : new Date();
    form.expireAt = dateTimeValue(new Date(base.getTime() + 3 * 86400000));
  }
}
function onPublishAtChange(value: unknown) {
  if (form.permanent || typeof value !== 'string' || !value) return;
  form.expireAt = dateTimeValue(new Date(parseBusinessDateTime(value).getTime() + 3 * 86400000));
}
async function saveDraft() {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;
  if (!form.permanent && !form.expireAt) { ElMessage.warning('请选择失效时间或勾选永久有效'); return; }
  const payload: SaveAnnouncementPayload = {
    title: form.title.trim(), summary: form.summary.trim(), content: form.content.trim(),
    level: form.level, requiresReply: form.requiresReply, publishAt: form.publishAt,
    expireAt: form.permanent ? null : form.expireAt,
  };
  saving.value = true;
  try {
    if (editId.value) await updateAnnouncementDraft(editId.value, payload);
    else await createAnnouncementDraft(payload);
    ElMessage.success('草稿已保存');
    formVisible.value = false;
    await load();
  } finally { saving.value = false; }
}
function openDetail(row: AnnouncementItem) {
  if (row.status === 'draft') { openEdit(row); return; }
  router.push(`/announcement/${row.id}`);
}
async function onPublish(row: AnnouncementItem) {
  const scheduled = new Date(row.publishAt).getTime() > Date.now();
  await ElMessageBox.confirm(
    scheduled ? `确认按 ${formatDateTime(row.publishAt)} 定时发布「${row.title}」？发布后内容不可修改。` : `确认立即发布「${row.title}」？发布后内容不可修改。`,
    scheduled ? '确认定时发布' : '确认发布', { type: 'warning' },
  );
  await publishAnnouncement(row.id, { publishAt: row.publishAt, expireAt: row.expireAt });
  ElMessage.success(scheduled ? '已设置定时发布' : '发布成功');
  await load();
}
async function onWithdraw(row: AnnouncementItem) {
  await ElMessageBox.confirm(`撤回后普通用户将无法再查看或回复「${row.title}」，确认撤回？`, '确认撤回', { type: 'warning' });
  await withdrawAnnouncement(row.id); ElMessage.success('已撤回'); await load();
}
async function onDelete(row: AnnouncementItem) {
  await ElMessageBox.confirm(`确认删除草稿「${row.title}」？`, '确认删除', { type: 'warning' });
  await deleteAnnouncementDraft(row.id); ElMessage.success('已删除'); await load();
}
function statusType(status?: string) {
  if (status === '发布中') return 'success';
  if (status === '定时发布') return 'warning';
  if (status === '已撤回') return 'danger';
  return 'info';
}
onMounted(load);
let activated = false;
onActivated(() => { if (activated) void load(); else activated = true; });
</script>

<style scoped lang="scss">
.toolbar { margin-bottom: 12px; }
.announcement-form { margin-top: 16px; }
.expiry-row { display: flex; align-items: center; gap: 16px; }
</style>
