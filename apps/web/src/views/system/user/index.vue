<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :model="query" class="filter-bar" label-position="left" label-width="auto" size="small" @submit.prevent="runKeywordSearch">
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12" :md="4">
            <el-form-item label="状态">
              <el-select v-model="query.status" clearable placeholder="全部" @change="runKeywordSearch">
                <el-option label="启用" :value="1" />
                <el-option label="停用" :value="0" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="4">
            <el-form-item label="部门">
              <el-tree-select
                v-model="query.deptId"
                :data="deptTree"
                :props="{ label: 'deptName', children: 'children' }"
                node-key="id"
                check-strictly
                default-expand-all
                clearable
                placeholder="全部"
                @change="runKeywordSearch"
              />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="4">
            <el-form-item label="关键字">
              <el-input
                v-model="query.keyword"
                placeholder="账号 / 姓名"
                clearable
                @input="scheduleKeywordSearch"
                @keyup.enter="runKeywordSearch"
              />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="4">
            <el-form-item>
              <el-button size="small" type="primary" @click="runKeywordSearch">查询</el-button>
              <el-button size="small" @click="resetQuery">重置</el-button>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" v-permission="'user:create'" type="primary" :icon="Plus" @click="openCreate">
          新增用户
        </el-button>
        <el-button size="small"
          v-permission="'user:delete'"
          type="danger"
          :icon="Delete"
          :disabled="!selection.length"
          @click="batchDelete"
        >
          批量删除{{ selection.length ? `（${selection.length}）` : '' }}
        </el-button>
      </div>
      <app-table
        :data="list"
        v-loading="loading"
        border
        stripe
        :page="query.page"
        :page-size="query.pageSize"
        row-key="id"
        @selection-change="(s: any[]) => (selection = s)"
      >
        <el-table-column
          type="selection"
          width="44"
          reserve-selection
          :selectable="(row: any) => row.username !== 'admin'"
        />
        <el-table-column label="账号" width="130">
          <template #default="{ row }">
            {{ row.username }}<audit-info mode="inline" :row="row" />
          </template>
        </el-table-column>
        <el-table-column label="姓名" prop="realName" width="120" />
        <el-table-column label="部门" prop="deptName" width="110" />
        <el-table-column label="角色" min-width="160" class-name="col-left">
          <template #default="{ row }">
            <color-tag
              v-for="r in row.roleNames"
              :key="r"
              :seed="r"
              size="small"
              style="margin-right: 4px"
            >
              {{ r }}
            </color-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button size="small" v-permission.disable="'user:update'" link type="primary" class="btn-edit" :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-button size="small" v-permission.disable="'user:assign_role'" link type="primary" class="btn-view" :icon="Avatar" @click="openAssign(row)">角色</el-button>
              <el-button size="small" v-permission.disable="'user:reset_pwd'" link type="primary" class="btn-warning" :icon="Key" @click="onResetPwd(row)">重置密码</el-button>
              <el-button size="small"
                :disabled="row.username === 'admin'"
                v-permission.disable="'user:update'"
                link
                type="primary"
                :class="row.status === 1 ? 'btn-delete' : 'btn-submit'"
                :icon="row.status === 1 ? CircleClose : Open"
                @click="onToggle(row)"
              >
                {{ row.status === 1 ? '停用' : '启用' }}
              </el-button>
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination
        class="pager"
        :total="total"
        v-model:page="query.page"
        v-model:size="query.pageSize"
        @change="load"
      />
    </el-card>

    <!-- 新增/编辑 -->
    <el-dialog v-model="formVisible" :title="editId ? '编辑用户' : '新增用户'" width="520px" @open="onFormOpen">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="账号" prop="username">
          <el-input v-model="form.username" name="username" autocomplete="off" :spellcheck="false" :disabled="!!editId" />
        </el-form-item>
        <el-form-item v-if="!editId" label="初始密码" prop="password">
          <el-input v-model="form.password" name="password" autocomplete="new-password" placeholder="≥6位，首次登录需改密" />
        </el-form-item>
        <el-form-item label="姓名" prop="realName">
          <el-input v-model="form.realName" />
        </el-form-item>
        <el-form-item label="性别" prop="gender">
          <el-radio-group v-model="form.gender">
            <el-radio :value="1">男</el-radio>
            <el-radio :value="2">女</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="部门">
          <el-tree-select
            v-model="form.deptId"
            :data="deptTree"
            :props="{ label: 'deptName', children: 'children' }"
            node-key="id"
            check-strictly
            default-expand-all
            clearable
            placeholder="选择部门…"
            style="width:100%"
          />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="form.phone" name="phone" autocomplete="off" inputmode="tel" />
        </el-form-item>
        <el-form-item v-if="!editId" label="角色" prop="roleIds">
          <el-select v-model="form.roleIds" multiple placeholder="分配角色…" style="width:100%">
            <el-option v-for="r in roles" :key="r.id" :label="r.roleName" :value="r.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="formVisible=false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 分配角色 -->
    <el-dialog v-model="assignVisible" title="分配角色" width="420px">
      <el-select v-model="assignRoleIds" multiple style="width:100%">
        <el-option v-for="r in roles" :key="r.id" :label="r.roleName" :value="r.id" />
      </el-select>
      <template #footer>
        <el-button size="small" @click="assignVisible=false">取消</el-button>
        <el-button size="small" type="primary" @click="onAssignSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
// keep-alive 缓存键取组件 name；本项目多数页面文件同名 index.vue，
// 不显式命名会导致缓存互相顶替、onActivated 打在错误实例上（刷新失效）。
defineOptions({ name: 'SystemUserList' });

import { ref, reactive, onMounted, onActivated } from 'vue';
import { Plus, Delete, Edit, Avatar, Key, CircleClose, Open } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import ColorTag from '@/components/ColorTag.vue';
import { useDebouncedSearch } from '@/composables/useDebouncedSearch';
import {
  getUserList, getUserDetail, createUser, updateUser,
  assignUserRoles, resetUserPassword, toggleUserStatus, deleteUsers,
  getRoleList, getDeptTree,
} from '@/api/system';

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const selection = ref<any[]>([]);
const query = reactive<any>({ page: 1, pageSize: 10 });
const roles = ref<any[]>([]);
const deptTree = ref<any[]>([]);

const formVisible = ref(false);
const editId = ref<number | null>(null);
const formRef = ref<FormInstance>();
const saving = ref(false);
const form = reactive<any>({ username: '', password: '', realName: '', gender: 0, deptId: undefined, phone: '', roleIds: [] });

const rules: FormRules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, min: 6, message: '密码至少6位', trigger: 'blur' }],
  realName: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  roleIds: [{ required: true, type: 'array', min: 1, message: '请分配角色', trigger: 'change' }],
};

const assignVisible = ref(false);
const assignUserId = ref<number | null>(null);
const assignRoleIds = ref<number[]>([]);

async function load() {
  loading.value = true;
  try {
    const res: any = await getUserList(query);
    list.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}
function reload() { query.page = 1; load(); }
const { schedule: scheduleKeywordSearch, flush: runKeywordSearch } = useDebouncedSearch(reload);
function resetQuery() { query.keyword = undefined; query.status = undefined; query.deptId = undefined; runKeywordSearch(); }

async function loadMeta() {
  roles.value = await getRoleList();
  deptTree.value = await getDeptTree();
}

function openCreate() {
  editId.value = null;
  Object.assign(form, { username: '', password: '', realName: '', gender: 0, deptId: undefined, phone: '', roleIds: [] });
  formVisible.value = true;
}
async function openEdit(row: any) {
  editId.value = row.id;
  const d: any = await getUserDetail(row.id);
  Object.assign(form, { username: d.username, realName: d.realName, gender: d.gender ?? 0, deptId: d.deptId, phone: d.phone, roleIds: d.roleIds });
  formVisible.value = true;
}
function onFormOpen() { formRef.value?.clearValidate(); }

async function onSave() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    saving.value = true;
    try {
      if (editId.value) {
        await updateUser(editId.value, { realName: form.realName, gender: form.gender, deptId: form.deptId, phone: form.phone });
      } else {
        await createUser(form);
      }
      ElMessage.success('保存成功');
      formVisible.value = false;
      load();
    } finally {
      saving.value = false;
    }
  });
}

function openAssign(row: any) {
  assignUserId.value = row.id;
  assignRoleIds.value = [...row.roleIds];
  assignVisible.value = true;
}
async function onAssignSave() {
  await assignUserRoles(assignUserId.value!, assignRoleIds.value);
  ElMessage.success('角色已更新');
  assignVisible.value = false;
  load();
}

async function onResetPwd(row: any) {
  const { value } = await ElMessageBox.prompt(
    `为「${row.realName}」设置新密码（≥6位）`, '重置密码',
    {
      inputType: 'password',
      inputValidator: (v) => (!!v && v.length >= 6 ? true : '密码至少6位'),
    },
  );
  await resetUserPassword(row.id, value);
  ElMessage.success('密码已重置');
}
async function onToggle(row: any) {
  const next = row.status === 1 ? 0 : 1;
  await ElMessageBox.confirm(`确认${next ? '启用' : '停用'}「${row.realName}」？`, '提示', { type: 'warning' });
  await toggleUserStatus(row.id, next);
  ElMessage.success('已更新');
  load();
}

async function batchDelete() {
  const rows = selection.value.filter((r) => r.username !== 'admin');
  const ids = rows.map((r) => r.id);
  if (!ids.length) return;
  await ElMessageBox.confirm(
    `确定删除选中的 ${ids.length} 个用户吗？将同时移除其角色关联，此操作不可恢复。`,
    '批量删除',
    { type: 'warning' },
  );
  await deleteUsers(ids);
  ElMessage.success('删除成功');
  selection.value = [];
  load();
}

// loadMeta（角色/部门选项）只需初始化一次
onMounted(loadMeta);
// 每次激活页面时重新拉取用户列表，保证角色名称等始终最新
onActivated(load);
</script>
