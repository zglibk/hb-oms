<template>
  <div class="page">
    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" v-permission="'changelog:create'" type="primary" :icon="Plus" @click="openCreate">新增版本</el-button>
        <!-- 时间轴展示页（面向全员的阅读视图，接口登录即可访问，无需额外权限） -->
        <el-button size="small" type="primary" plain :icon="Clock" @click="router.push('/changelog')">时间轴视图</el-button>
      </div>
      <app-table :data="paged" v-loading="loading" border stripe :page="page" :page-size="size">
        <el-table-column label="版本号" width="120">
          <template #default="{ row }">
            {{ row.version }}<audit-info mode="inline" :row="row" />
          </template>
        </el-table-column>
        <el-table-column label="标题" prop="title" min-width="160" class-name="col-left" show-overflow-tooltip>
          <template #default="{ row }">{{ row.title || '—' }}</template>
        </el-table-column>
        <el-table-column label="分类" prop="category" width="110">
          <template #default="{ row }">
            <color-tag v-if="row.category" :seed="row.category">{{ row.category }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="发布日期" prop="releasedAt" width="120">
          <template #default="{ row }">{{ formatDate(row.releasedAt) }}</template>
        </el-table-column>
        <el-table-column label="条目数" width="80" class-name="col-num">
          <template #default="{ row }">{{ row.content?.length ?? 0 }}</template>
        </el-table-column>
        <el-table-column label="排序" prop="sort" width="80" class-name="col-num" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button size="small" v-permission.disable="'changelog:update'" link type="primary" class="btn-edit" :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-button size="small" v-permission.disable="'changelog:delete'" link type="primary" class="btn-delete" :icon="Delete" :loading="deletingId === row.id" @click="onDelete(row)">删除</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination
        class="pager"
        :total="total"
        v-model:page="page"
        v-model:size="size"
      />
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="formVisible" :title="editId ? '编辑版本' : '新增版本'" width="600px" class="changelog-form-dialog">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" size="small">
        <el-form-item label="版本号" prop="version">
          <el-input v-model="form.version" placeholder="如 v1.0.0" name="version" autocomplete="off" :spellcheck="false" />
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="form.title" placeholder="可选，版本主题简述" name="title" autocomplete="off" />
        </el-form-item>
        <el-form-item label="发布日期" prop="releasedAt">
          <el-date-picker
            v-model="form.releasedAt"
            type="date"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            placeholder="选择发布日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="分类">
          <el-input v-model="form.category" placeholder="可选，如 新功能/问题修复/体验优化" name="category" autocomplete="off" />
        </el-form-item>
        <el-form-item label="更新条目" prop="content">
          <div class="content-editor">
            <div v-for="(_, idx) in form.content" :key="idx" class="content-editor__row">
              <el-input
                v-model="form.content[idx]"
                placeholder="输入一条更新内容"
                :spellcheck="false"
                @keydown.enter.prevent="addContentItem(idx)"
              />
              <el-button link type="danger" :icon="Delete" @click="removeContentItem(idx)" />
            </div>
            <el-button size="small" type="primary" plain :icon="Plus" @click="addContentItem(form.content.length - 1)">添加条目</el-button>
          </div>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="formVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
// keep-alive 缓存键取组件 name；本项目多数页面文件同名 index.vue，
// 不显式命名会导致缓存互相顶替、onActivated 打到错误实例上（刷新失效）。
defineOptions({ name: 'SystemChangelog' });

import { ref, reactive, onMounted, onActivated } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, Delete, Edit, Clock } from '@element-plus/icons-vue';

const router = useRouter();
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import {
  getChangelogListAll,
  createChangelog,
  updateChangelog,
  deleteChangelog,
  type ChangelogItem,
  type SaveChangelogPayload,
} from '@/api/changelog';
import { useClientPager } from '@/composables/useClientPager';
import { formatDate } from '@/utils/date';
import ColorTag from '@/components/ColorTag.vue';

const loading = ref(false);
const list = ref<ChangelogItem[]>([]);
const { page, size, total, paged } = useClientPager(list);

const formVisible = ref(false);
const editId = ref<number | null>(null);
const formRef = ref<FormInstance>();
const saving = ref(false);
const deletingId = ref<number | null>(null);

interface ChangelogForm {
  version: string;
  title: string;
  releasedAt: string;
  category: string;
  content: string[];
  sort: number;
  status: number;
}

const form = reactive<ChangelogForm>({
  version: '',
  title: '',
  releasedAt: '',
  category: '',
  content: [''],
  sort: 0,
  status: 1,
});

const rules: FormRules = {
  version: [{ required: true, message: '请输入版本号', trigger: 'blur' }],
  releasedAt: [{ required: true, message: '请选择发布日期', trigger: 'change' }],
  content: [
    {
      validator: (_r, _v, cb) => {
        const valid = form.content.some((s) => s.trim() !== '');
        cb(valid ? undefined : new Error('至少填写一条更新内容'));
      },
      trigger: 'blur',
    },
  ],
};

async function load() {
  loading.value = true;
  try {
    list.value = await getChangelogListAll();
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  Object.assign(form, {
    version: '',
    title: '',
    releasedAt: '',
    category: '',
    content: [''],
    sort: 0,
    status: 1,
  });
}

function openCreate() {
  editId.value = null;
  resetForm();
  formVisible.value = true;
}

function openEdit(row: ChangelogItem) {
  editId.value = row.id;
  Object.assign(form, {
    version: row.version,
    title: row.title ?? '',
    releasedAt: formatDate(row.releasedAt),
    category: row.category ?? '',
    content: row.content?.length ? [...row.content] : [''],
    sort: row.sort,
    status: row.status,
  });
  formVisible.value = true;
}

/** 在指定位置后插入空条目；不传索引则追加到末尾 */
function addContentItem(idx?: number) {
  if (typeof idx === 'number' && idx >= 0 && idx < form.content.length) {
    form.content.splice(idx + 1, 0, '');
  } else {
    form.content.push('');
  }
}

function removeContentItem(idx: number) {
  if (form.content.length <= 1) {
    form.content[0] = '';
    return;
  }
  form.content.splice(idx, 1);
}

async function onSave() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    // 过滤空白条目
    const payload: SaveChangelogPayload = {
      version: form.version.trim(),
      title: form.title.trim() || null,
      releasedAt: form.releasedAt,
      category: form.category.trim() || null,
      content: form.content.map((s) => s.trim()).filter((s) => s !== ''),
      sort: form.sort,
      status: form.status,
    };
    saving.value = true;
    try {
      if (editId.value) await updateChangelog(editId.value, payload);
      else await createChangelog(payload);
      ElMessage.success('保存成功');
      formVisible.value = false;
      load();
    } finally {
      saving.value = false;
    }
  });
}

async function onDelete(row: ChangelogItem) {
  await ElMessageBox.confirm(`确认删除版本「${row.version}」？`, '提示', { type: 'warning' });
  deletingId.value = row.id;
  try {
    await deleteChangelog(row.id);
    ElMessage.success('已删除');
    load();
  } catch {
    // 错误提示由全局响应拦截器处理
  } finally {
    deletingId.value = null;
  }
}

onMounted(load);
onActivated(load);
</script>

<style scoped lang="scss">
.toolbar > * {
  min-width: 0;
}

/* 本对话框 body 最大高度限制为全局值（calc(100vh - clamp(160px,12.5rem,220px))）的 3/5，
 * 避免增加条目后无限增长至接近 90vh */
:deep(.changelog-form-dialog .el-dialog__body) {
  max-height: calc((100vh - clamp(160px, 12.5rem, 220px)) * 3 / 5);
  max-height: calc((100dvh - clamp(160px, 12.5rem, 220px)) * 3 / 5);
}

:deep(.col-num) {
  font-variant-numeric: tabular-nums;
}

/* content 动态条目编辑器 */
.content-editor {
  width: 100%;

  &__row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
}
</style>
