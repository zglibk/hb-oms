<template>
  <div class="profile-page">
    <!-- 左侧：账户概览卡（hero banner + 头像 + 身份 + 信息列表） -->
    <aside class="profile-aside">
      <!-- 顶部渐变 banner，装饰光斑 -->
      <div class="profile-aside__banner">
        <span class="profile-aside__glow profile-aside__glow--1" />
        <span class="profile-aside__glow profile-aside__glow--2" />
        <span class="profile-aside__grain" />
      </div>

      <div class="profile-aside__body">
        <!-- 头像：跨 banner 边界，带光环与在线点。点击已保存的头像可放大预览 -->
        <div class="profile-aside__avatar" :class="{ 'profile-aside__avatar--zoomable': !!userStore.userInfo?.avatar }">
          <span class="profile-aside__ring" />
          <el-image
            v-if="userStore.userInfo?.avatar"
            :src="userStore.userInfo.avatar"
            :preview-src-list="[userStore.userInfo.avatar]"
            preview-teleported
            hide-on-click-modal
            fit="cover"
            class="profile-aside__avatar-img"
            alt="头像"
          />
          <span v-else class="profile-aside__avatar-text">{{ avatarText }}</span>
          <span class="profile-aside__online" title="在线" />
        </div>

        <!-- 身份 -->
        <div class="profile-aside__identity">
          <div class="profile-aside__name">
            {{ userStore.userInfo?.realName || userStore.userInfo?.username }}
          </div>
          <div class="profile-aside__sub">@{{ userStore.userInfo?.username }}</div>
          <div v-if="roleDisplay !== '未分配'" class="profile-aside__roles">
            <span
              v-for="r in roleDisplay.split('、')"
              :key="r"
              class="profile-aside__role-chip"
            >
              {{ r }}
            </span>
          </div>
        </div>

        <!-- 状态条 -->
        <div class="profile-aside__status">
          <span
            class="profile-aside__status-pill"
            :class="{
              'is-ok': userStore.userInfo?.status === 1,
              'is-off': userStore.userInfo?.status !== 1,
            }"
          >
            <i class="dot" />
            {{ userStore.userInfo?.status === 1 ? '账号正常' : '已停用' }}
          </span>
        </div>

        <!-- 信息列表 -->
        <ul class="profile-aside__list">
          <li>
            <span class="ic ic--dept"><el-icon><OfficeBuilding /></el-icon></span>
            <span class="label">部门</span>
            <span class="value">{{ userStore.userInfo?.deptName || '未分配' }}</span>
          </li>
          <li>
            <span class="ic ic--phone"><el-icon><Iphone /></el-icon></span>
            <span class="label">手机</span>
            <span class="value">{{ userStore.userInfo?.phone || '—' }}</span>
          </li>
          <li>
            <span class="ic ic--clock"><el-icon><Clock /></el-icon></span>
            <span class="label">最近登录</span>
            <span class="value">{{ lastLoginDisplay }}</span>
          </li>
          <li>
            <span class="ic ic--cal"><el-icon><Calendar /></el-icon></span>
            <span class="label">注册时间</span>
            <span class="value">{{ createdAtDisplay }}</span>
          </li>
        </ul>
      </div>
    </aside>

    <!-- 右侧：选项卡主区 -->
    <section class="profile-main">
      <el-tabs v-model="activeTab" class="profile-tabs">
        <!-- 基本信息编辑 -->
        <el-tab-pane label="基本信息" name="profile">
          <div class="profile-form-wrap">
            <!-- 头像编辑区 -->
            <div class="avatar-edit">
              <div class="avatar-edit__preview" @click="cropperVisible = true">
                <img v-if="avatarPreview" :src="avatarPreview" alt="头像" />
                <span v-else class="avatar-edit__fallback">{{ avatarText }}</span>
                <span class="avatar-edit__overlay">
                  <el-icon><Camera /></el-icon>
                  <span>更换</span>
                </span>
              </div>
              <div class="avatar-edit__actions">
                <div class="avatar-edit__title">个人头像</div>
                <div class="avatar-edit__hint">
                  点击头像可选择更换
                </div>
                <el-button :icon="Picture" plain size="small" @click="cropperVisible = true">
                  上传头像
                </el-button>
              </div>
            </div>

            <el-form
              ref="profileFormRef"
              :model="profileForm"
              :rules="profileRules"
              label-width="80px"
              class="profile-form"
            >
              <el-form-item label="真实姓名" prop="realName">
                <el-input v-model="profileForm.realName" maxlength="50" />
              </el-form-item>
              <el-form-item label="性别" prop="gender">
                <el-radio-group v-model="profileForm.gender">
                  <el-radio :value="1">男</el-radio>
                  <el-radio :value="2">女</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="用户名">
                <el-input :model-value="userStore.userInfo?.username" disabled />
              </el-form-item>
              <el-form-item label="手机号" prop="phone">
                <el-input v-model="profileForm.phone" maxlength="20" placeholder="请输入手机号" />
              </el-form-item>
              <el-form-item label="部门">
                <el-input :model-value="userStore.userInfo?.deptName || '未分配'" disabled />
              </el-form-item>
              <el-form-item label="备注" prop="remark">
                <el-input
                  v-model="profileForm.remark"
                  type="textarea"
                  :rows="3"
                  maxlength="200"
                  show-word-limit
                />
              </el-form-item>
              <el-form-item>
                <el-button size="small" type="primary" :loading="saving" @click="onSaveProfile">保存修改</el-button>
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <!-- 修改密码 -->
        <el-tab-pane label="修改密码" name="password">
          <div class="profile-form-wrap">
            <div class="pwd-hero">
              <div class="pwd-hero__icon"><el-icon><Lock /></el-icon></div>
              <div class="pwd-hero__text">
                <div class="pwd-hero__title">设置高强度密码</div>
                <div class="pwd-hero__sub">建议定期更换，避免多站点复用</div>
              </div>
            </div>

            <el-form
              ref="pwdFormRef"
              :model="pwdForm"
              :rules="pwdRules"
              label-width="100px"
              class="profile-form"
            >
              <el-form-item label="原密码" prop="oldPassword">
                <el-input v-model="pwdForm.oldPassword" type="password" show-password />
              </el-form-item>
              <el-form-item label="新密码" prop="newPassword">
                <el-input v-model="pwdForm.newPassword" type="password" show-password />
                <!-- 密码强度可视化 -->
                <div class="pwd-strength">
                  <div class="pwd-strength__bars">
                    <span
                      v-for="i in 4"
                      :key="i"
                      class="pwd-strength__bar"
                      :class="{ active: pwdStrength.score >= i }"
                      :style="{ background: pwdStrength.score >= i ? pwdStrength.color : '' }"
                    />
                  </div>
                  <span class="pwd-strength__label" :style="{ color: pwdStrength.color }">
                    {{ pwdStrength.label }}
                  </span>
                </div>
                <div class="pwd-tip">至少 6 位，含大小写/数字/特殊字符中的至少三种</div>
              </el-form-item>
              <el-form-item label="确认新密码" prop="confirm">
                <el-input v-model="pwdForm.confirm" type="password" show-password />
              </el-form-item>
              <el-form-item>
                <el-button size="small" type="primary" :loading="pwdLoading" @click="onChangePwd">
                  确认修改
                </el-button>
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>
      </el-tabs>
    </section>

    <!-- 头像裁剪弹窗 -->
    <AvatarCropper v-model="cropperVisible" @confirm="onCropperConfirm" />
  </div>
</template>

<script setup lang="ts">
// keep-alive 缓存键取组件 name；本项目多数页面文件同名 index.vue，
// 不显式命名会导致缓存互相顶替、onActivated 打在错误实例上（刷新失效）。
defineOptions({ name: 'UserProfile' });

import { ref, reactive, computed } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import {
  OfficeBuilding,
  Clock,
  Calendar,
  Picture,
  Iphone,
  Camera,
  Lock,
} from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import { formatDateTime } from '@/utils/date';
import { uploadFile } from '@/api/file';
import { changePassword } from '@/api/auth';
import AvatarCropper from '@/components/AvatarCropper.vue';

const userStore = useUserStore();

const activeTab = ref('profile');

/* ===== 头像相关 ===== */
const cropperVisible = ref(false);
const pendingAvatarFile = ref<File | null>(null);
const avatarPreview = ref<string>(userStore.userInfo?.avatar || '');
const avatarText = computed(
  () => (userStore.userInfo?.realName || '?').charAt(0),
);

function onCropperConfirm(file: File, previewUrl: string) {
  // 撤销旧的 blob 预览（仅当是 blob 时）
  if (avatarPreview.value && avatarPreview.value.startsWith('blob:')) {
    URL.revokeObjectURL(avatarPreview.value);
  }
  pendingAvatarFile.value = file;
  avatarPreview.value = previewUrl;
  cropperVisible.value = false;
}

/* ===== 基本信息表单 ===== */
const profileFormRef = ref<FormInstance>();
const saving = ref(false);
const profileForm = reactive({
  realName: userStore.userInfo?.realName || '',
  gender: userStore.userInfo?.gender ?? 0,
  phone: userStore.userInfo?.phone || '',
  remark: userStore.userInfo?.remark || '',
});

const profileRules: FormRules = {
  realName: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
};

async function onSaveProfile() {
  if (!profileFormRef.value) return;
  await profileFormRef.value.validate(async (valid) => {
    if (!valid) return;
    saving.value = true;
    try {
      let avatarUrl: string | undefined;
      // 仅当有新头像文件时才上传
      if (pendingAvatarFile.value) {
        avatarUrl = await uploadFile(pendingAvatarFile.value, 'user_avatar');
      }
      await userStore.updateMyProfile({
        realName: profileForm.realName,
        gender: profileForm.gender,
        phone: profileForm.phone,
        remark: profileForm.remark,
        avatar: avatarUrl,
      });
      // 同步预览为服务器 URL
      if (avatarUrl) {
        if (avatarPreview.value.startsWith('blob:')) {
          URL.revokeObjectURL(avatarPreview.value);
        }
        avatarPreview.value = userStore.userInfo?.avatar || '';
      }
      pendingAvatarFile.value = null;
      ElMessage.success('保存成功');
    } catch {
      ElMessage.error('保存失败，请重试');
    } finally {
      saving.value = false;
    }
  });
}

/* ===== 修改密码表单 ===== */
const pwdFormRef = ref<FormInstance>();
const pwdLoading = ref(false);
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirm: '' });

const pwdRules: FormRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [{ required: true, message: '请输入新密码', trigger: 'blur' }],
  confirm: [
    {
      validator: (_r, v, cb) =>
        v === pwdForm.newPassword ? cb() : cb(new Error('两次密码不一致')),
      trigger: 'blur',
    },
  ],
};

/* 密码强度：4 段条 + 文案 + 颜色 */
const pwdStrength = computed(() => {
  const p = pwdForm.newPassword || '';
  let types = 0;
  if (/[a-z]/.test(p)) types++;
  if (/[A-Z]/.test(p)) types++;
  if (/[0-9]/.test(p)) types++;
  if (/[^a-zA-Z0-9]/.test(p)) types++;
  const len = p.length;
  let score = 0;
  if (len >= 6 && types >= 3) score = 1;
  if (len >= 10 && types >= 3) score = 2;
  if (len >= 12 && types >= 4) score = 3;
  if (len >= 14 && types >= 4) score = 4;
  const palette = [
    { label: '', color: '#c0c4cc' },
    { label: '弱', color: '#f56c6c' },
    { label: '中', color: '#e6a23c' },
    { label: '强', color: '#409eff' },
    { label: '极强', color: '#67c23a' },
  ];
  return { score, ...palette[score] };
});

async function onChangePwd() {
  if (!pwdFormRef.value) return;
  await pwdFormRef.value.validate(async (valid) => {
    if (!valid) return;
    pwdLoading.value = true;
    try {
      await changePassword({
        oldPassword: pwdForm.oldPassword,
        newPassword: pwdForm.newPassword,
      });
      ElMessage.success('密码修改成功');
      pwdForm.oldPassword = pwdForm.newPassword = pwdForm.confirm = '';
    } finally {
      pwdLoading.value = false;
    }
  });
}

/* ===== 概览展示计算属性 ===== */
const roleDisplay = computed(() => {
  const names = userStore.roleNames?.length
    ? userStore.roleNames
    : userStore.roles;
  return names.length ? names.join('、') : '未分配';
});
const lastLoginDisplay = computed(() =>
  userStore.userInfo?.lastLoginAt
    ? formatDateTime(userStore.userInfo.lastLoginAt)
    : '—',
);
const createdAtDisplay = computed(() =>
  userStore.userInfo?.createdAt
    ? formatDateTime(userStore.userInfo.createdAt)
    : '—',
);
</script>

<style scoped lang="scss">
.profile-page {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

/* ============================================================
 * 左侧：账户概览卡
 * 设计语言：hero banner + 跨边界头像 + 角色标签 + 信息列表图标容器
 * ============================================================ */
.profile-aside {
  width: 300px;
  flex-shrink: 0;
  background: #fff;
  border-radius: 14px;
  border: 1px solid #ebeef5;
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 4px 16px rgba(15, 23, 42, 0.04);
  overflow: hidden;
  position: relative;
}

/* 顶部 banner：分层渐变 + 光斑 + 颗粒 */
.profile-aside__banner {
  position: relative;
  height: 96px;
  background:
    radial-gradient(140% 120% at 0% 0%, rgba(255, 255, 255, 0.35) 0%, transparent 55%),
    linear-gradient(120deg, var(--el-color-primary) 0%, var(--el-color-primary-light-3) 100%);
  overflow: hidden;
}
.profile-aside__glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(28px);
  pointer-events: none;
  &--1 {
    width: 120px;
    height: 120px;
    top: -50px;
    right: -30px;
    background: #fff;
    opacity: 0.22;
  }
  &--2 {
    width: 80px;
    height: 80px;
    bottom: -40px;
    left: 30%;
    background: var(--el-color-primary-light-5);
    opacity: 0.35;
  }
}
.profile-aside__grain {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(rgba(255, 255, 255, 0.18) 1px, transparent 1px);
  background-size: 14px 14px;
  opacity: 0.4;
  mix-blend-mode: overlay;
}

.profile-aside__body {
  padding: 0 20px 20px;
  margin-top: -42px;
  position: relative;
  z-index: 1;
}

/* 头像：跨边界，带光环与在线点 */
.profile-aside__avatar {
  position: relative;
  width: 84px;
  height: 84px;
  border-radius: 50%;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-light-3));
  color: #fff;
  font-size: 32px;
  font-weight: 600;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.18);
  overflow: visible;
  border: 4px solid #fff;

  &--zoomable {
    cursor: zoom-in;
  }

  /* el-image 组件容器：撑满圆形 */
  .profile-aside__avatar-img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    overflow: hidden;

    :deep(.el-image__inner) {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
    }
  }
}
.profile-aside__avatar-text {
  letter-spacing: 1px;
}
// 头像光环
.profile-aside__ring {
  position: absolute;
  inset: -7px;
  border-radius: 50%;
  border: 3px dashed var(--el-color-primary-light-5);
  pointer-events: none;
  animation: ringSpin 30s linear infinite;
}
@keyframes ringSpin {
  to { transform: rotate(360deg); }
}
.profile-aside__online {
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #67c23a;
  border: 3px solid #fff;
  box-shadow: 0 0 0 1px rgba(103, 194, 58, 0.3);
}

/* 身份 */
.profile-aside__identity {
  text-align: center;
  margin-top: 12px;
}
.profile-aside__name {
  font-size: 17px;
  font-weight: 600;
  color: #1f2329;
  letter-spacing: 0.3px;
}
.profile-aside__sub {
  font-size: 12px;
  color: #909399;
  margin-top: 3px;
}
.profile-aside__roles {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  margin-top: 10px;
}
.profile-aside__role-chip {
  display: inline-block;
  padding: 2px 10px;
  font-size: 11px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 11px;
  line-height: 1.6;
}

/* 状态条 */
.profile-aside__status {
  display: flex;
  justify-content: center;
  margin-top: 14px;
}
.profile-aside__status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 12px;
  font-weight: 500;

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
  &.is-ok {
    color: #67c23a;
    background: #f4faf0;
    border: 1px solid #d6edcc;
    .dot {
      background: #67c23a;
      box-shadow: 0 0 0 3px rgba(103, 194, 58, 0.15);
    }
  }
  &.is-off {
    color: #f56c6c;
    background: #fef0f0;
    border: 1px solid #fbc8c8;
    .dot {
      background: #f56c6c;
    }
  }
}

/* 信息列表 */
.profile-aside__list {
  list-style: none;
  padding: 0;
  margin: 18px 0 0;

  li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 4px;
    font-size: 13px;
    border-bottom: 1px dashed #ebeef5;
    transition: background 0.2s;

    &:last-child {
      border-bottom: none;
    }
    &:hover {
      background: #fafbfc;
    }

    .ic {
      flex-shrink: 0;
      width: 26px;
      height: 26px;
      border-radius: 7px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      color: #fff;

      .el-icon {
        font-size: 14px;
      }
    }
    .ic--dept { background: linear-gradient(135deg, #409eff, #66b1ff); }
    .ic--phone { background: linear-gradient(135deg, #67c23a, #95d475); }
    .ic--clock { background: linear-gradient(135deg, #e6a23c, #f0c781); }
    .ic--cal { background: linear-gradient(135deg, #909399, #b1b3b8); }

    .label {
      color: #909399;
      width: 60px;
      flex-shrink: 0;
    }
    .value {
      color: #303133;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: right;
    }
  }
}

/* ============================================================
 * 右侧：主区
 * ============================================================ */
.profile-main {
  flex: 1;
  min-width: 0;
  background: #fff;
  border-radius: 14px;
  border: 1px solid #ebeef5;
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 4px 16px rgba(15, 23, 42, 0.04);
  padding: 8px 24px 24px;
}

/* 选项卡头部精修 */
.profile-tabs {
  :deep(.el-tabs__header) {
    margin: 0 0 22px;
  }
  :deep(.el-tabs__nav-wrap::after) {
    height: 1px;
    background: #f0f1f3;
  }
  :deep(.el-tabs__item) {
    font-size: 14px;
    font-weight: 500;
    color: #606266;
    height: 44px;
    padding: 0 18px;
    &.is-active {
      color: var(--el-color-primary);
      font-weight: 600;
    }
  }
  :deep(.el-tabs__active-bar) {
    height: 3px;
    border-radius: 3px 3px 0 0;
    background: linear-gradient(90deg, var(--el-color-primary), var(--el-color-primary-light-3));
  }
}

.profile-form-wrap {
  max-width: 520px;
}

/* 头像编辑区 */
.avatar-edit {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 26px;
  padding: 18px;
  background: linear-gradient(135deg, var(--el-color-primary-light-9) 0%, #fafbfc 100%);
  border: 1px solid var(--el-color-primary-light-8);
  border-radius: 12px;

  &__preview {
    position: relative;
    width: 76px;
    height: 76px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-light-3));
    color: #fff;
    font-size: 28px;
    font-weight: 600;
    overflow: hidden;
    cursor: pointer;
    border: 3px solid #fff;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }
  &__fallback {
    letter-spacing: 1px;
  }
  &__overlay {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 11px;
    color: #fff;
    background: rgba(0, 0, 0, 0.55);
    opacity: 0;
    transition: opacity 0.22s;

    .el-icon {
      font-size: 18px;
    }
  }
  &__preview:hover .avatar-edit__overlay {
    opacity: 1;
  }

  &__actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }
  &__title {
    font-size: 14px;
    font-weight: 600;
    color: #303133;
  }
  &__hint {
    font-size: 12px;
    color: #909399;
    line-height: 1.5;
  }
}

.profile-form {
  :deep(.el-form-item__label) {
    font-size: 14px;
    color: #606266;
  }
  :deep(.el-input__inner) {
    font-size: 14px;
  }
  :deep(.el-input.is-disabled .el-input__inner) {
    background: #f7f8fa;
    color: #909399;
  }
}

/* 密码 hero */
.pwd-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  margin-bottom: 22px;
  background: linear-gradient(135deg, #fdf6ec 0%, #fafbfc 100%);
  border: 1px solid #faecd8;
  border-radius: 12px;

  &__icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #e6a23c, #f0c781);
    color: #fff;
    font-size: 20px;
    box-shadow: 0 4px 10px rgba(230, 162, 60, 0.3);
  }
  &__title {
    font-size: 14px;
    font-weight: 600;
    color: #303133;
  }
  &__sub {
    font-size: 12px;
    color: #909399;
    margin-top: 2px;
  }
}

/* 密码强度可视化 */
.pwd-strength {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;

  &__bars {
    display: flex;
    gap: 4px;
    flex: 1;
    max-width: 160px;
  }
  &__bar {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: #ebeef5;
    transition: background 0.25s;
  }
  &__label {
    font-size: 12px;
    font-weight: 500;
    width: 28px;
    text-align: right;
  }
}

.pwd-tip {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
  margin-top: 6px;
}

/* ===== 移动端单列 ===== */
@media (max-width: 767.98px) {
  .profile-page {
    flex-direction: column;
    gap: 12px;
    padding: 8px;
  }
  .profile-aside {
    width: 100%;
  }
  .profile-main {
    width: 100%;
  }
  /* aside 头像与信息压缩 */
  .profile-aside :deep(.el-card__body) {
    padding: 16px !important;
  }
  /* Tab 内表单单列 */
  :deep(.el-tabs__item) {
    padding: 0 12px !important;
  }
}
</style>
