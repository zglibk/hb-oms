<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent>
        <el-form-item label="部门名称">
          <el-input v-model="keyword" clearable placeholder="请输入部门名称" style="width: 200px" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="statusFilter" clearable placeholder="全部" style="width: 110px">
            <el-option v-for="o in ENABLE_STATUS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button size="small" :icon="RefreshLeft" @click="onReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" v-permission="'dept:create'" type="primary" :icon="Plus" @click="openCreate(0)">新增部门</el-button>
      </div>
      <el-table
        :data="filteredTree"
        v-loading="loading"
        border
        row-key="id"
        default-expand-all
        :tree-props="{ children: 'children' }"
      >
        <el-table-column label="部门名称" min-width="200" class-name="col-left">
          <template #default="{ row }">
            {{ row.deptName }}<audit-info mode="inline" :row="row" />
          </template>
        </el-table-column>
        <el-table-column label="部门编码" prop="deptCode" min-width="130" />
        <el-table-column label="排序" prop="sort" width="70" />
        <el-table-column label="负责人" min-width="110">
          <template #default="{ row }">{{ row.leader || '—' }}</template>
        </el-table-column>
        <el-table-column label="联系电话" min-width="140">
          <template #default="{ row }">{{ row.phone || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="tagTypeOf(ENABLE_STATUS, row.status)">{{ labelOf(ENABLE_STATUS, row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button size="small" v-permission.disable="'dept:create'" link type="primary" class="btn-submit" :icon="Plus" @click="openCreate(row.id)">新增下级</el-button>
              <el-button size="small" v-permission.disable="'dept:update'" link type="primary" class="btn-edit" :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-button size="small" v-permission.disable="'dept:delete'" link type="primary" class="btn-delete" :icon="Delete" :loading="deletingId === row.id" @click="onDelete(row)">删除</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑 -->
    <el-dialog v-model="formVisible" :title="editId ? '编辑部门' : '新增部门'" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" size="small">
        <el-form-item label="上级部门">
          <el-tree-select
            v-model="form.parentId"
            :data="parentOptions"
            :props="{ label: 'deptName', children: 'children' }"
            node-key="id"
            check-strictly
            default-expand-all
            clearable
            placeholder="不选 = 顶级部门"
            style="width: 100%"
          />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="部门名称" prop="deptName">
              <el-input v-model="form.deptName" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="部门编码" prop="deptCode">
              <el-input v-model="form.deptCode" placeholder="唯一，如 HB-001" :spellcheck="false" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="负责人">
              <el-input v-model="form.leader" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系电话">
              <el-input v-model="form.phone" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="排序">
              <el-input-number v-model="form.sort" :min="0" :controls="false" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="禁用" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button size="small" @click="formVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus';
import { Plus, Edit, Delete, RefreshLeft } from '@element-plus/icons-vue';
import { getDeptTree, createDept, updateDept, deleteDept, type DeptNode } from '@/api/system';
import { ENABLE_STATUS, labelOf, tagTypeOf } from '@/constants/dict';
import AppActions from '@/components/AppActions.vue';

const loading = ref(false);
const tree = ref<DeptNode[]>([]);
const keyword = ref('');
const statusFilter = ref<number | undefined>(undefined);

async function load() {
  loading.value = true;
  try {
    tree.value = await getDeptTree();
  } finally {
    loading.value = false;
  }
}
load();

function onReset() {
  keyword.value = '';
  statusFilter.value = undefined;
}

/** 树过滤：命中节点保留（含其子树），或子孙命中则保留链路 */
const filteredTree = computed<DeptNode[]>(() => {
  const kw = keyword.value.trim();
  const st = statusFilter.value;
  if (!kw && st === undefined) return tree.value;
  const filterNodes = (nodes: DeptNode[]): DeptNode[] =>
    nodes
      .map((n) => {
        const children = filterNodes(n.children ?? []);
        const selfHit =
          (!kw || n.deptName.includes(kw)) && (st === undefined || n.status === st);
        if (selfHit || children.length) return { ...n, children: selfHit ? (n.children ?? []) : children };
        return null;
      })
      .filter((n): n is DeptNode => !!n);
  return filterNodes(tree.value);
});

/* ===== 新增/编辑 ===== */
const formVisible = ref(false);
const saving = ref(false);
const editId = ref<number | null>(null);
const formRef = ref<FormInstance>();

const emptyForm = () => ({
  parentId: undefined as number | undefined,
  deptName: '',
  deptCode: '',
  leader: '',
  phone: '',
  sort: 0,
  status: 1,
});
const form = reactive(emptyForm());
const rules = {
  deptName: [{ required: true, message: '请输入部门名称', trigger: 'blur' }],
  deptCode: [{ required: true, message: '请输入部门编码', trigger: 'blur' }],
};

/** 上级部门候选：编辑时排除自己及子孙（防成环，后端另有硬校验） */
const parentOptions = computed<DeptNode[]>(() => {
  if (!editId.value) return tree.value;
  const excludeIds = new Set<number>();
  const collect = (nodes: DeptNode[]) => {
    nodes.forEach((n) => {
      if (n.id === editId.value || (n.parentId && excludeIds.has(n.parentId))) {
        excludeIds.add(n.id);
      }
      collect(n.children ?? []);
    });
  };
  collect(tree.value);
  const strip = (nodes: DeptNode[]): DeptNode[] =>
    nodes
      .filter((n) => !excludeIds.has(n.id))
      .map((n) => ({ ...n, children: strip(n.children ?? []) }));
  return strip(tree.value);
});

function openCreate(parentId: number) {
  editId.value = null;
  Object.assign(form, emptyForm(), { parentId: parentId || undefined });
  formVisible.value = true;
}
function openEdit(row: DeptNode) {
  editId.value = row.id;
  Object.assign(form, {
    parentId: row.parentId || undefined,
    deptName: row.deptName,
    deptCode: row.deptCode,
    leader: row.leader ?? '',
    phone: row.phone ?? '',
    sort: row.sort,
    status: row.status,
  });
  formVisible.value = true;
}

async function onSave() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    const payload = { ...form, parentId: form.parentId ?? 0 };
    if (editId.value) {
      await updateDept(editId.value, payload);
      ElMessage.success('已保存');
    } else {
      await createDept(payload);
      ElMessage.success('已新增');
    }
    formVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

/* ===== 删除 ===== */
const deletingId = ref<number | null>(null);
async function onDelete(row: DeptNode) {
  await ElMessageBox.confirm(
    `确定删除部门「${row.deptName}」吗？存在下级部门或所属账号时将无法删除。`,
    '提示',
    { type: 'warning' },
  );
  deletingId.value = row.id;
  try {
    await deleteDept(row.id);
    ElMessage.success('已删除');
    load();
  } finally {
    deletingId.value = null;
  }
}
</script>

<script lang="ts">
export default { name: 'BasicDept' };
</script>

<style scoped lang="scss">
.toolbar { margin-bottom: 12px; }

/* 树形表格展开/折叠图标：用 EP 图标 FolderRemove / FolderOpened（黄色 #E6A23C）
 * 折叠态 = FolderRemove；展开态 = FolderOpened。
 * 叶子节点（无 children）EP 不渲染 expand-icon，故无需处理。
 * SVG path 取自 @element-plus/icons-vue（folder-remove.vue / folder-opened.vue）。 */
:deep(.el-table__expand-icon) {
  svg { display: none; }
  width: 16px;
  height: 16px;
  margin-right: 4px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024'%3E%3Cpath fill='%23E6A23C' d='M128 192v640h768V320H485.76L357.504 192zm-32-64h287.872l128.384 128H928a32 32 0 0 1 32 32v576a32 32 0 0 1-32 32H96a32 32 0 0 1-32-32V160a32 32 0 0 1 32-32m256 416h320v64H352z'/%3E%3C/svg%3E") center / contain no-repeat;

  &.el-table__expand-icon--expanded {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024'%3E%3Cpath fill='%23E6A23C' d='M878.08 448H241.92l-96 384h636.16zM832 384v-64H485.76L357.504 192H128v448l57.92-231.744A32 32 0 0 1 216.96 384zm-24.96 512H96a32 32 0 0 1-32-32V160a32 32 0 0 1 32-32h287.872l128.384 128H864a32 32 0 0 1 32 32v96h23.04a32 32 0 0 1 31.04 39.744l-112 448A32 32 0 0 1 807.04 896'/%3E%3C/svg%3E");
    /* 展开态不再旋转 */
    transform: none;
  }
}
</style>
