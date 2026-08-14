<template>
  <div class="page">
    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" v-permission="'role:create'" type="primary" :icon="Plus" @click="openCreate">
          新增角色
        </el-button>
      </div>
      <app-table :data="paged" v-loading="loading" border stripe :page="page" :page-size="size">
        <el-table-column label="角色名称" width="150">
          <template #default="{ row }">
            {{ row.roleName }}<audit-info mode="inline" :row="row" />
          </template>
        </el-table-column>
        <el-table-column label="编码" prop="roleCode" width="160" />
        <el-table-column label="数据范围" width="130">
          <template #default="{ row }">
            <color-tag :seed="String(row.dataScope)">{{ scopeLabel(row.dataScope) }}</color-tag>
          </template>
        </el-table-column>
        <el-table-column label="内置" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.isBuiltin" type="info" size="small">内置</el-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="备注" prop="remark" min-width="140" class-name="col-left" />
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button size="small" v-permission.disable="'role:assign_perm'" link type="primary" class="btn-edit" :icon="SetUp" @click="openPerm(row)">分配权限</el-button>
              <el-button size="small" v-permission.disable="'role:update'" link type="primary" class="btn-edit" :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-tooltip
                content="内置角色不可删除"
                placement="top"
                :disabled="!row.isBuiltin"
              >
                <span class="del-wrap">
                  <el-button size="small"
                    :disabled="row.isBuiltin"
                    v-permission.disable="'role:delete'"
                    link type="danger" class="btn-delete" :icon="Delete" @click="onDelete(row)"
                  >删除</el-button>
                </span>
              </el-tooltip>
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

    <!-- 新增/编辑角色 -->
    <el-dialog v-model="formVisible" :title="editId ? '编辑角色' : '新增角色'" width="480px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="角色名称" prop="roleName">
          <el-input v-model="form.roleName" name="roleName" autocomplete="off" />
        </el-form-item>
        <el-form-item label="角色编码" prop="roleCode">
          <el-input v-model="form.roleCode" name="roleCode" autocomplete="off" :spellcheck="false" :disabled="!!editId" placeholder="如 quality_mgr" />
        </el-form-item>
        <el-form-item label="数据范围" prop="dataScope">
          <el-select v-model="form.dataScope" style="width:100%">
            <el-option v-for="s in SCOPES" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" name="remark" autocomplete="off" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="formVisible=false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 分配权限 -->
    <el-dialog v-model="permVisible" :title="`分配权限 - ${currentRole?.roleName}`" width="780px">
      <div class="perm-tip">
        <el-alert type="info" :closable="false" show-icon>
          <template #title>
            勾选<b>菜单</b>即授予该页面的<b>查看</b>权限；下面的按钮是<b>操作</b>权限，按需单独勾选。
            父子<b>不联动</b>——只勾菜单不勾按钮，即为该页面的只读角色。
          </template>
        </el-alert>
        <div class="perm-quick">
          <el-button size="small" @click="checkAllPerms">全选</el-button>
          <el-button size="small" @click="checkViewOnly">仅授只读</el-button>
          <el-button size="small" @click="clearPerms">全部清空</el-button>
        </div>
      </div>
      <el-tree
        ref="treeRef"
        :data="permTree"
        show-checkbox
        check-strictly
        node-key="id"
        :props="{ label: 'permName', children: 'children' }"
        default-expand-all
        class="perm-tree"
      >
        <template #default="{ data }">
          <span class="perm-node">
            <span>{{ data.permName }}</span>
            <el-tag
              size="small"
              :type="data.accessType === 1 ? 'success' : 'warning'"
              effect="plain"
            >{{ data.accessType === 1 ? '查看' : '操作' }}</el-tag>
          </span>
        </template>
      </el-tree>
      <template #footer>
        <el-button size="small" @click="permVisible=false">取消</el-button>
        <el-button size="small" type="primary" :loading="permSaving" @click="onPermSave">保存权限</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
// keep-alive 缓存键取组件 name；本项目多数页面文件同名 index.vue，
// 不显式命名会导致缓存互相顶替、onActivated 打在错误实例上（刷新失效）。
defineOptions({ name: 'SystemRoleList' });

import { ref, reactive, onActivated, nextTick } from 'vue';
import { Plus, Delete, Edit, SetUp } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { useClientPager } from '@/composables/useClientPager';
import { useUserStore } from '@/stores/user';
import { useRouter } from 'vue-router';
import { registerDynamicRoutes } from '@/router/dynamic';
import {
  getRoleList, createRole, updateRole, deleteRole,
  getRolePermissions, assignRolePermissions, getMenuTree,
} from '@/api/system';
import ColorTag from '@/components/ColorTag.vue';

const SCOPES = [
  { label: '全部数据', value: 1 },
  { label: '本部门', value: 2 },
  { label: '本部门及下级', value: 3 },
  { label: '仅本人', value: 4 },
  { label: '自定义', value: 5 },
];
const scopeLabel = (v: number) => SCOPES.find((s) => s.value === v)?.label ?? v;

const userStore = useUserStore();
const router = useRouter();

const loading = ref(false);
const list = ref<any[]>([]);
const { page, size, total, paged } = useClientPager(list, 20);

const formVisible = ref(false);
const editId = ref<number | null>(null);
const formRef = ref<FormInstance>();
const saving = ref(false);
const form = reactive<any>({ roleName: '', roleCode: '', dataScope: 4, sort: 0, remark: '' });
const rules: FormRules = {
  roleName: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
  roleCode: [{ required: true, message: '请输入角色编码', trigger: 'blur' }],
  dataScope: [{ required: true, message: '请选择数据范围', trigger: 'change' }],
};

const permVisible = ref(false);
const permTree = ref<any[]>([]);
const checkedPerms = ref<number[]>([]);
const currentRole = ref<any>(null);
const treeRef = ref<any>();
const permSaving = ref(false);

async function load() {
  loading.value = true;
  try { list.value = await getRoleList(); }
  finally { loading.value = false; }
}

function openCreate() {
  editId.value = null;
  Object.assign(form, { roleName: '', roleCode: '', dataScope: 4, sort: 0, remark: '' });
  formVisible.value = true;
}
function openEdit(row: any) {
  editId.value = row.id;
  Object.assign(form, { roleName: row.roleName, roleCode: row.roleCode, dataScope: row.dataScope, sort: row.sort, remark: row.remark });
  formVisible.value = true;
}
async function onSave() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    saving.value = true;
    try {
      if (editId.value) await updateRole(editId.value, form);
      else await createRole(form);
      ElMessage.success('保存成功');
      formVisible.value = false;
      load();
    } finally { saving.value = false; }
  });
}
async function onDelete(row: any) {
  await ElMessageBox.confirm(`确认删除角色「${row.roleName}」？`, '提示', { type: 'warning' });
  await deleteRole(row.id);
  ElMessage.success('已删除');
  load();
}

/** 扁平化权限树（前序遍历） */
function flattenPerms(nodes: any[], out: any[] = []): any[] {
  for (const n of nodes) {
    out.push(n);
    if (n.children?.length) flattenPerms(n.children, out);
  }
  return out;
}

/* 【为什么用 check-strictly（父子勾选互不联动）】
 * 旧版默认级联：勾中「订单管理」会连带勾上其下全部增删改按钮，
 * "只读订单页"这种授权在界面上根本表达不出来。改 strict 后
 * 菜单=页面查看权、按钮=操作权，各自独立勾选；父链由服务端
 * normalizePermissionIds 兜底补齐，不会因漏勾父级导致菜单断链。 */
function checkAllPerms() {
  treeRef.value?.setCheckedKeys(flattenPerms(permTree.value).map((n) => n.id));
}
/** 仅授只读：所有 access_type=1 的权限点（菜单 + 查看类按钮） */
function checkViewOnly() {
  treeRef.value?.setCheckedKeys(
    flattenPerms(permTree.value).filter((n) => n.accessType === 1).map((n) => n.id),
  );
}
function clearPerms() {
  treeRef.value?.setCheckedKeys([]);
}

async function openPerm(row: any) {
  currentRole.value = row;
  // 每次打开重新拉树：菜单管理新增/调整权限后无需刷新页面即可看到
  permTree.value = await getMenuTree();
  checkedPerms.value = await getRolePermissions(row.id);
  permVisible.value = true;
  await nextTick();
  // check-strictly 下 setCheckedKeys 不级联，库里存什么就勾什么（含父节点行），
  // 所见即所得——不再需要过滤叶子节点来规避级联造成的"虚高"显示。
  treeRef.value?.setCheckedKeys(checkedPerms.value);
}
async function onPermSave() {
  permSaving.value = true;
  try {
    // check-strictly 下没有半选态，勾什么传什么；父链补齐与同页读权限补齐
    // 由服务端 normalizePermissionIds 统一兜底（API 直调同样受控）。
    const checked = treeRef.value.getCheckedKeys();
    await assignRolePermissions(currentRole.value.id, checked);
    ElMessage.success('权限已保存并即时生效（其他在线用户刷新页面后菜单同步）');
    permVisible.value = false;

    // 后端守卫实时读库，权限已即刻生效；此处刷新当前用户自己的前端菜单/按钮
    await userStore.loadProfile();
    userStore.routesLoaded = false;
    registerDynamicRoutes(router, userStore.menus);
    userStore.routesLoaded = true;
  } finally { permSaving.value = false; }
}

onActivated(load);
</script>

<style scoped lang="scss">
/* 分配权限对话框：树高度限制为对话框默认最大高度的 2/3
 * 全局 .el-dialog__body max-height 为 calc(100vh - 200px)，
 * 这里取其 2/3 作为权限树可视高度，超出部分树内滚动 */
.perm-tree {
  max-height: calc((100vh - 200px) * 2 / 3);
  overflow-y: auto;
}

.perm-tip {
  margin-bottom: 10px;

  :deep(.el-alert__title) {
    line-height: 1.6;
  }
}

.perm-quick {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}

.perm-node {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
