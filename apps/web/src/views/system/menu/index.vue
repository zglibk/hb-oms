<template>
  <div class="page">
    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" v-permission="'menu:create'" type="primary" :icon="Plus" @click="openCreate()">
          新增权限
        </el-button>
        <span class="tip">菜单/按钮/接口三级权限，树形结构。修改后即时生效，无需重新登录；按钮权限标识需与代码中 @RequirePermissions / v-permission 完全一致。</span>
      </div>
      <app-table
        :data="tree"
        v-loading="loading"
        row-key="id"
        border
        :serial="false"
        :tree-props="{ children: 'children' }"
      >
        <el-table-column label="名称" prop="permName" min-width="200" class-name="col-left" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <el-tag :type="typeTag(row.permType)" size="small">
              {{ typeLabel(row.permType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="权限标识" prop="permCode" width="180" />
        <el-table-column label="路由/接口" min-width="160" class-name="col-left">
          <template #default="{ row }">
            {{ row.menuPath || row.apiPattern || '—' }}
          </template>
        </el-table-column>
        <el-table-column label="排序" prop="sort" width="70" class-name="col-num" />
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button size="small" link type="primary" class="btn-submit" :icon="Plus" @click="openCreate(row)">加子项</el-button>
              <el-button size="small" v-permission.disable="'menu:update'" link type="primary" class="btn-edit" :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-button size="small" v-permission.disable="'menu:delete'" link type="primary" class="btn-delete" :icon="Delete" @click="onDelete(row)">删除</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
    </el-card>

    <el-dialog v-model="formVisible" :title="editId ? '编辑权限' : '新增权限'" width="500px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="上级">
          <el-cascader
            v-model="parentPath"
            :options="cascaderOptions"
            :props="{ checkStrictly: true, value: 'id', label: 'permName', children: 'children', emitPath: false }"
            clearable
            placeholder="顶级（不选）"
            style="width:100%"
          />
        </el-form-item>
        <el-form-item label="类型" prop="permType">
          <el-radio-group v-model="form.permType">
            <el-radio :value="1">菜单</el-radio>
            <el-radio :value="2">按钮</el-radio>
            <el-radio :value="3">接口</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="名称" prop="permName">
          <el-input v-model="form.permName" name="permName" autocomplete="off" />
        </el-form-item>
        <el-form-item label="权限标识" prop="permCode">
          <el-input v-model="form.permCode" name="permCode" autocomplete="off" :spellcheck="false" :disabled="!!editId" placeholder="如 order:export" />
        </el-form-item>
        <el-form-item v-if="form.permType === 1" label="路由路径">
          <el-input v-model="form.menuPath" name="menuPath" autocomplete="off" :spellcheck="false" placeholder="/order/list" />
        </el-form-item>
        <el-form-item v-if="form.permType === 1" label="组件">
          <el-input v-model="form.component" name="component" autocomplete="off" :spellcheck="false" placeholder="order/index" />
        </el-form-item>
        <el-form-item v-if="form.permType === 1" label="图标">
          <el-input v-model="form.icon" name="icon" autocomplete="off" :spellcheck="false" placeholder="Element Plus 图标名" />
        </el-form-item>
        <el-form-item v-if="form.permType === 3" label="接口模式">
          <el-input v-model="form.apiPattern" name="apiPattern" autocomplete="off" :spellcheck="false" placeholder="POST /api/order" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="formVisible=false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
// keep-alive 缓存键取组件 name；本项目多数页面文件同名 index.vue，
// 不显式命名会导致缓存互相顶替、onActivated 打在错误实例上（刷新失效）。
defineOptions({ name: 'SystemMenuList' });

import { ref, reactive, computed, onActivated } from 'vue';
import { Plus, Delete, Edit } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { getMenuTree, createMenu, updateMenu, deleteMenu } from '@/api/system';

const loading = ref(false);
const tree = ref<any[]>([]);

const typeLabel = (t: number) => ({ 1: '菜单', 2: '按钮', 3: '接口' }[t] || t);
const typeTag = (t: number) => ({ 1: 'primary', 2: 'success', 3: 'warning' }[t] || 'info') as any;

const formVisible = ref(false);
const editId = ref<number | null>(null);
const formRef = ref<FormInstance>();
const saving = ref(false);
const parentPath = ref<number | undefined>(undefined);
const form = reactive<any>({
  permType: 1, permName: '', permCode: '', menuPath: '', component: '', icon: '', apiPattern: '', sort: 0,
});
const rules: FormRules = {
  permType: [{ required: true, message: '请选择类型', trigger: 'change' }],
  permName: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  permCode: [{ required: true, message: '请输入权限标识', trigger: 'blur' }],
};

const cascaderOptions = computed(() => tree.value);

async function load() {
  loading.value = true;
  try { tree.value = await getMenuTree(); }
  finally { loading.value = false; }
}

function reset() {
  Object.assign(form, { permType: 1, permName: '', permCode: '', menuPath: '', component: '', icon: '', apiPattern: '', sort: 0 });
  parentPath.value = undefined;
}
function openCreate(parent?: any) {
  editId.value = null;
  reset();
  if (parent) parentPath.value = parent.id;
  formVisible.value = true;
}
function openEdit(row: any) {
  editId.value = row.id;
  Object.assign(form, {
    permType: row.permType, permName: row.permName, permCode: row.permCode,
    menuPath: row.menuPath, component: row.component, icon: row.icon,
    apiPattern: row.apiPattern, sort: row.sort,
  });
  parentPath.value = row.parentId || undefined;
  formVisible.value = true;
}
async function onSave() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    saving.value = true;
    try {
      const payload = { ...form, parentId: parentPath.value || 0 };
      if (editId.value) await updateMenu(editId.value, payload);
      else await createMenu(payload);
      ElMessage.success('保存成功');
      formVisible.value = false;
      load();
    } finally { saving.value = false; }
  });
}
async function onDelete(row: any) {
  await ElMessageBox.confirm(`确认删除权限「${row.permName}」？`, '提示', { type: 'warning' });
  await deleteMenu(row.id);
  ElMessage.success('已删除');
  load();
}

onActivated(load);
</script>

<style scoped lang="scss">
.toolbar { display: flex; align-items: center; gap: 12px; }
.tip { font-size: 12px; min-width: 0; color: var(--el-text-color-secondary); }
:deep(.col-num) { font-variant-numeric: tabular-nums; }
</style>
