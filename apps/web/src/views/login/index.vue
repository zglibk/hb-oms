<template>
  <div class="login-page">
    <!-- 背景装饰图形（光晕/圆环/点阵，图片背景下隐藏） -->
    <div class="bg-decoration">
      <span class="blob blob-1"></span>
      <span class="blob blob-2"></span>
      <span class="ring ring-1"></span>
      <span class="ring ring-2"></span>
      <span class="dot-grid"></span>
    </div>
    <!-- 沿轨迹运动的粒子与几何图形（任何背景下始终显示） -->
    <div class="bg-particles">
      <!-- 可见轨迹线（SVG 半透明路径） -->
      <svg class="trails" viewBox="0 0 1600 1000" width="1600" height="1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="trail-g1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="rgba(65,168,129,0)" />
            <stop offset="50%" stop-color="rgba(65,168,129,0.18)" />
            <stop offset="100%" stop-color="rgba(65,168,129,0)" />
          </linearGradient>
          <linearGradient id="trail-g2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="rgba(110,220,180,0)" />
            <stop offset="50%" stop-color="rgba(110,220,180,0.16)" />
            <stop offset="100%" stop-color="rgba(110,220,180,0)" />
          </linearGradient>
          <linearGradient id="trail-g3" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="rgba(255,196,0,0)" />
            <stop offset="50%" stop-color="rgba(255,196,0,0.14)" />
            <stop offset="100%" stop-color="rgba(255,196,0,0)" />
          </linearGradient>
        </defs>
        <path class="trail-line trail-line-1" d="M 0 200 Q 200 100 400 300 T 800 200 T 1200 400 T 1600 300" />
        <path class="trail-line trail-line-2" d="M 0 500 Q 300 300 600 600 T 1200 500 T 1600 700" />
        <path class="trail-line trail-line-3" d="M 100 0 Q 400 200 300 500 T 500 900" />
        <path class="trail-line trail-line-4" d="M 1500 100 Q 1100 400 1300 700 T 900 900" />
        <path class="trail-line trail-line-5" d="M 0 800 Q 400 700 700 850 T 1400 700 T 1600 800" />
        <path class="trail-line trail-line-6" d="M 800 0 Q 900 400 700 600 T 800 1000" />
      </svg>

      <!-- 流光粒子（带拖尾） -->
      <span class="particle particle-1"></span>
      <span class="particle particle-2"></span>
      <span class="particle particle-3"></span>
      <span class="particle particle-4"></span>
      <span class="particle particle-5"></span>
      <span class="particle particle-6"></span>

      <!-- 几何图形（沿轨迹运动 + 自转） -->
      <span class="shape shape-tri-1"></span>
      <span class="shape shape-tri-2"></span>
      <span class="shape shape-square-1"></span>
      <span class="shape shape-diamond-1"></span>
      <span class="shape shape-ring-1"></span>
    </div>


    <!-- 方案介绍浮层（页面级，独立于登录卡片，浮在任意背景之上） -->
    <div class="brand-intro" aria-label="系统方案介绍">
      <h2 class="brand-intro__title">海宝五金订单跟踪系统</h2>
      <span class="brand-intro__rule" aria-hidden="true"></span>
      <ul class="brand-intro__list">
        <li class="brand-intro__item">
          <span class="brand-intro__icon" aria-hidden="true">
            <el-icon><Setting /></el-icon>
          </span>
          <div class="brand-intro__text">
            <p>接单 → 外发 → 回货 → 装配</p>
            <p>成品出入库全链路跟踪</p>
          </div>
        </li>
        <li class="brand-intro__item">
          <span class="brand-intro__icon" aria-hidden="true">
            <el-icon><Grid /></el-icon>
          </span>
          <div class="brand-intro__text">
            <p>订单数 · 完成数 · 库存数 · 欠数</p>
            <p>双口径欠数，交付进度一眼清</p>
          </div>
        </li>
        <li class="brand-intro__item">
          <span class="brand-intro__icon" aria-hidden="true">
            <el-icon><Share /></el-icon>
          </span>
          <div class="brand-intro__text">
            <p>订单跟踪台账统一落点</p>
            <p>逾期与临近交期及时预警</p>
          </div>
        </li>
      </ul>
    </div>

    <!-- 悬浮登录卡片 -->
    <div class="login-card">
      <!-- 左侧系统介绍 -->
      <div class="intro-side">
        <div class="intro-decoration">
          <span class="circle circle-1"></span>
          <span class="circle circle-2"></span>
        </div>
        <div class="intro-top" v-show="themeStore.loginBgScheme !== 'particles'">
          <div class="logo-box">HB</div>
          <div class="logo-text">
            <span class="cn">海宝 OMS</span>
            <span class="en">ORDER TRACKING</span>
          </div>
        </div>
        <div class="intro-illustration" aria-hidden="true">
          <!-- OMS 主题插画：数字化看板 + 滑轨产品 + 流程节点 -->
          <svg viewBox="0 0 340 300" width="340" height="300" xmlns="http://www.w3.org/2000/svg" fill="none">
            <defs>
              <linearGradient id="ill-panel" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="rgba(255,255,255,0.16)" />
                <stop offset="1" stop-color="rgba(255,255,255,0.04)" />
              </linearGradient>
              <linearGradient id="ill-accent" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#ffd76a" />
                <stop offset="1" stop-color="#ffb020" />
              </linearGradient>
            </defs>

            <!-- 地面参考线 -->
            <line x1="20" y1="248" x2="320" y2="248" stroke="rgba(255,255,255,0.18)" stroke-width="1.5" stroke-dasharray="4 6" />

            <!-- 中控大屏（数字化看板） -->
            <rect x="46" y="40" width="150" height="96" rx="8" fill="url(#ill-panel)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" />
            <rect x="58" y="54" width="60" height="8" rx="4" fill="rgba(255,255,255,0.5)" />
            <!-- 看板柱状图 -->
            <rect x="60" y="104" width="12" height="20" rx="2" fill="rgba(255,255,255,0.55)" />
            <rect x="78" y="92" width="12" height="32" rx="2" fill="rgba(255,255,255,0.7)" />
            <rect x="96" y="98" width="12" height="26" rx="2" fill="rgba(255,255,255,0.55)" />
            <rect x="114" y="84" width="12" height="40" rx="2" fill="url(#ill-accent)" />
            <!-- 看板折线 -->
            <polyline points="140,110 152,96 164,102 180,80" stroke="#ffd76a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="180" cy="80" r="3.5" fill="#ffd76a" />
            <!-- 支架 -->
            <rect x="116" y="136" width="10" height="18" fill="rgba(255,255,255,0.3)" />
            <rect x="98" y="154" width="46" height="5" rx="2.5" fill="rgba(255,255,255,0.3)" />

            <!-- 机械臂 -->
            <g stroke="rgba(255,255,255,0.85)" stroke-width="5" stroke-linecap="round" fill="none">
              <line x1="250" y1="210" x2="250" y2="150" />
              <line x1="250" y1="150" x2="288" y2="120" />
              <line x1="288" y1="120" x2="288" y2="150" />
            </g>
            <circle cx="250" cy="210" r="9" fill="rgba(255,255,255,0.85)" />
            <circle cx="250" cy="150" r="7" fill="#41a881" stroke="rgba(255,255,255,0.9)" stroke-width="2" />
            <circle cx="288" cy="120" r="6" fill="rgba(255,255,255,0.85)" />
            <!-- 夹爪抓取的滑轨件 -->
            <rect x="278" y="150" width="22" height="8" rx="2" fill="url(#ill-accent)" />

            <!-- 传送带上的滑轨产品（长条形，呼应滑轨主业） -->
            <g>
              <rect x="60" y="212" width="150" height="14" rx="4" fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.3)" stroke-width="1" />
              <rect x="70" y="215" width="40" height="8" rx="3" fill="rgba(255,255,255,0.65)" />
              <rect x="118" y="215" width="40" height="8" rx="3" fill="url(#ill-accent)" />
              <rect x="166" y="215" width="34" height="8" rx="3" fill="rgba(255,255,255,0.5)" />
              <!-- 传送带滚轮 -->
              <circle cx="72" cy="232" r="5" fill="rgba(255,255,255,0.3)" />
              <circle cx="110" cy="232" r="5" fill="rgba(255,255,255,0.3)" />
              <circle cx="148" cy="232" r="5" fill="rgba(255,255,255,0.3)" />
              <circle cx="186" cy="232" r="5" fill="rgba(255,255,255,0.3)" />
            </g>

            <!-- 流程节点连线（订单→排产→审核→外协 的数字化流） -->
            <g>
              <line x1="60" y1="180" x2="120" y2="180" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-dasharray="3 4" />
              <circle cx="60" cy="180" r="4" fill="#41a881" stroke="#fff" stroke-width="1.5" />
              <circle cx="120" cy="180" r="4" fill="rgba(255,255,255,0.6)" />
              <circle cx="180" cy="180" r="4" fill="rgba(255,255,255,0.6)" />
              <line x1="120" y1="180" x2="180" y2="180" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-dasharray="3 4" />
            </g>
          </svg>
        </div>
        <div class="intro-footer">{{ themeStore.copyrightInfo || '海宝五金 · IT部 · V1.0' }}</div>
      </div>

      <!-- 右侧登录表单 -->
      <div class="form-side">
        <div class="form-inner">
          <div class="form-header">
            <!-- 手机端专用：登录框上方显示 Logo + 系统名称（PC 端由左侧浮层/插画标识，无需重复） -->
            <div class="form-system-name">
              <company-logo :size="30" aria-label="海宝 OMS" />
              <span>{{ themeStore.systemName || '海宝 OMS 系统' }}</span>
            </div>
            <h2>欢迎回来</h2>
            <p>请登录您的账号以继续</p>
          </div>
          <el-form
            ref="formRef"
            :model="form"
            :rules="rules"
            class="login-form"
            size="large"
            @submit.prevent
            @keyup.enter="handleLogin"
          >
            <el-form-item prop="username">
              <el-input
                v-model="form.username"
                name="username"
                placeholder="请输入账号…"
                autocomplete="username"
                :prefix-icon="User"
                :spellcheck="false"
                clearable
              />
            </el-form-item>
            <el-form-item prop="password">
              <el-input
                v-model="form.password"
                name="password"
                type="password"
                placeholder="请输入密码…"
                autocomplete="current-password"
                :prefix-icon="Lock"
                show-password
              />
            </el-form-item>
            <div class="login-options">
              <el-checkbox v-model="rememberMe">记住密码（2 天内有效）</el-checkbox>
            </div>
            <el-form-item>
              <el-tooltip
                v-model:visible="verifyTipVisible"
                content="请先完成验证"
                placement="top"
                trigger="manual"
                :hide-after="0"
                popper-class="verify-tip"
              >
                <el-button
                  class="verify-btn"
                  :class="`is-${captchaStatus}`"
                  :type="captchaStatus === 'verified' ? 'success' : 'default'"
                  :icon="verifyBtnIcon"
                  :disabled="loading"
                  @click="openCaptchaDialog"
                >
                  {{ verifyBtnText }}
                </el-button>
              </el-tooltip>
            </el-form-item>
            <el-form-item>
              <el-button
                type="primary"
                class="login-btn"
                :loading="loading"
                @click="handleLogin"
              >
                登录
              </el-button>
            </el-form-item>
          </el-form>
          <div class="form-footer">
            <a class="to-frontend" :href="frontendHomeUrl">去前台 &gt;&gt;</a>
          </div>
        </div>

        <!-- 滑块验证码对话框：相对 form-side 居中（PC 端随登录卡片靠右） -->
        <el-dialog
          v-model="captchaDialogVisible"
          width="360px"
          class="captcha-dialog"
          modal-class="captcha-overlay"
          :close-on-click-modal="false"
          :teleported="false"
          @closed="onCaptchaDialogClosed"
        >
          <template #header>
            <div class="captcha-dialog__header">
              <span class="captcha-dialog__title">安全验证</span>
              <button
                type="button"
                class="captcha-dialog__refresh"
                aria-label="刷新验证码"
                @click="captchaRef?.refresh()"
              >
                <el-icon aria-hidden="true"><Refresh /></el-icon>
              </button>
            </div>
          </template>
          <slider-captcha
            v-if="captchaDialogVisible"
            ref="captchaRef"
            @success="onCaptchaSuccess"
            @reset="captchaToken = ''"
          />
          <div class="captcha-dialog__hint">请完成滑块验证后继续登录…</div>
        </el-dialog>
      </div>
    </div>

    <!-- 背景切换悬浮按钮 -->
    <LoginBgPicker />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  User,
  Lock,
  CircleCheck,
  Warning,
  Refresh,
  Share,
  Setting,
  Grid,
} from '@element-plus/icons-vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { useUserStore } from '@/stores/user';
import { useThemeStore } from '@/stores/theme';
import { registerDynamicRoutes } from '@/router/dynamic';
import LoginBgPicker from '@/components/LoginBgPicker.vue';
import SliderCaptcha from '@/components/SliderCaptcha.vue';
import CompanyLogo from '@/components/CompanyLogo.vue';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const themeStore = useThemeStore();

/** 前台首页：生产 base=/oms/admin/ → /oms/；开发环境退回上级路径 */
const frontendHomeUrl = computed(() => {
  const base = import.meta.env.BASE_URL || '/';
  if (/\/admin\/?$/.test(base)) return base.replace(/\/admin\/?$/, '/');
  try {
    return new URL('..', window.location.origin + base).pathname;
  } catch {
    return '../';
  }
});

const formRef = ref<FormInstance>();
const loading = ref(false);
const form = reactive({ username: '', password: '' });
const rememberMe = ref(false);

/** 滑块验证通过后的一次性登录凭证 */
const captchaToken = ref('');
const captchaRef = ref<InstanceType<typeof SliderCaptcha>>();
/** 滑块验证码对话框显隐 */
const captchaDialogVisible = ref(false);
/** 标记对话框是否因验证成功而关闭（避免 @closed 清掉刚拿到的 token） */
let closedBySuccess = false;
/** 未验证时登录按钮上方的 tip 显隐（manual 模式由代码控制） */
const verifyTipVisible = ref(false);
let verifyTipTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 验证状态机：idle（未验证） / verified（已验证） / expired（超时）
 * 后端 captchaToken 60s 失效，前端同步倒计时，超时后按钮提示重新验证
 */
type CaptchaStatus = 'idle' | 'verified' | 'expired';
const captchaStatus = ref<CaptchaStatus>('idle');
let captchaExpireTimer: ReturnType<typeof setTimeout> | null = null;
const CAPTCHA_TTL = 60_000; // 与后端 verifyToken 60s 有效期对齐

/** 验证按钮文字 */
const verifyBtnText = computed(() => {
  switch (captchaStatus.value) {
    case 'verified':
      return '验证通过，请登录';
    case 'expired':
      return '超时，请重新验证';
    default:
      return '点击按钮开始验证';
  }
});

/** 验证按钮图标 */
const verifyBtnIcon = computed(() => {
  switch (captchaStatus.value) {
    case 'verified':
      return CircleCheck;
    case 'expired':
      return Warning;
    default:
      return Lock;
  }
});

/** 显示「请先完成验证」tip，3 秒后自动消失 */
function showVerifyTip() {
  if (verifyTipTimer) clearTimeout(verifyTipTimer);
  verifyTipVisible.value = true;
  verifyTipTimer = setTimeout(() => {
    verifyTipVisible.value = false;
    verifyTipTimer = null;
  }, 3000);
}

/** 启动验证码超时倒计时：到期后清凭证并切换为 expired 态 */
function startCaptchaExpire() {
  if (captchaExpireTimer) clearTimeout(captchaExpireTimer);
  captchaExpireTimer = setTimeout(() => {
    captchaToken.value = '';
    captchaStatus.value = 'expired';
    captchaExpireTimer = null;
  }, CAPTCHA_TTL);
}

/** 重置验证状态到 idle（打开对话框、手动关闭未验证时调用） */
function resetCaptchaStatus() {
  if (captchaExpireTimer) {
    clearTimeout(captchaExpireTimer);
    captchaExpireTimer = null;
  }
  captchaToken.value = '';
  captchaStatus.value = 'idle';
}

/** 滑块验证通过回调：保存凭证、关闭对话框、启动超时倒计时 */
function onCaptchaSuccess(token: string) {
  captchaToken.value = token;
  captchaStatus.value = 'verified';
  startCaptchaExpire();
  closedBySuccess = true;
  captchaDialogVisible.value = false;
}

/** 对话框完全关闭后：仅当用户手动关闭（非验证成功）时重置状态 */
function onCaptchaDialogClosed() {
  if (!closedBySuccess) {
    resetCaptchaStatus();
  }
  closedBySuccess = false;
}

/**
 * 记住密码存储键。`hb_oms_` 前缀（2026-08-12 改，原 `hb_mes_remember` 与
 * MES 生产同源同键同结构——在一边勾记住密码，另一边登录页会把这边的账号
 * 密码原样回填进去）。**刻意不迁移旧键**：旧值可能是 MES 的凭据。
 */
const REMEMBER_KEY = 'hb_oms_remember';
/** 记住密码有效期：48 小时（与提示文案「2 天内有效」对齐） */
const REMEMBER_TTL_MS = 48 * 60 * 60 * 1000;

interface RememberedCredential {
  username: string;
  password: string;
  savedAt: number;
}

const rules: FormRules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

/**
 * 读取记住的账号密码（带时效校验）
 * 注意：localStorage 明文存储密码仅为便利性设计（防肩窥用 base64 轻度混淆），
 * 不构成安全加密；敏感环境不建议开启记住密码。
 * 过期（超过 REMEMBER_TTL_MS）则视为未记住，清除存储且不回填表单。
 */
function loadRemembered() {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return;
    const data = JSON.parse(atob(raw)) as Partial<RememberedCredential>;
    // 过期则清理，不回填、不勾选
    if (!data.savedAt || Date.now() - data.savedAt > REMEMBER_TTL_MS) {
      localStorage.removeItem(REMEMBER_KEY);
      return;
    }
    if (data.username) {
      form.username = data.username;
      form.password = data.password || '';
      rememberMe.value = true;
    }
  } catch {
    localStorage.removeItem(REMEMBER_KEY);
  }
}

/** 根据勾选状态保存/清除记住的凭据（写入时间戳供下次过期校验） */
function saveRemembered() {
  try {
    if (rememberMe.value) {
      const payload: RememberedCredential = {
        username: form.username,
        password: form.password,
        savedAt: Date.now(),
      };
      localStorage.setItem(REMEMBER_KEY, btoa(JSON.stringify(payload)));
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }
  } catch {
    // 移动端隐私模式/内嵌浏览器可能禁用 localStorage，不应影响登录主流程。
  }
}

/**
 * 点击登录：校验表单 + 验证状态。
 * 未完成滑块验证时在验证按钮上方显示 tip 提醒，已验证则发起登录。
 */
async function handleLogin() {
  if (!formRef.value) return;
  if (loading.value) return; // 防重入：手机键盘 Enter + 按钮点击可能触发两次
  await formRef.value.validate((valid) => {
    if (!valid) return;
    if (!captchaToken.value) {
      showVerifyTip();
      return;
    }
    doLogin();
  });
}

/** 点击验证按钮：重置状态并打开滑块验证对话框 */
function openCaptchaDialog() {
  resetCaptchaStatus();
  captchaDialogVisible.value = true;
}

/** 滑块验证通过后执行实际登录 */
async function doLogin() {
  loading.value = true;
  try {
    await userStore.login({ ...form, captchaToken: captchaToken.value });
    // 登录成功后立即注册动态菜单路由并标记就绪，确保跳转时目标路由已存在，
    // 避免依赖守卫内“加路由 + 重导航”导致首次登录不跳转、需手动刷新的问题
    registerDynamicRoutes(router, userStore.menus);
    userStore.routesLoaded = true;
    saveRemembered();
    ElMessage.success('登录成功');
    const redirect = (route.query.redirect as string) || '/';
    await router.replace(redirect);
  } catch {
    // 凭证已被后端一次性核销：必须同步重置按钮态，否则仍显示「验证通过」
    // 却因 token 已空而提示「请先完成验证」，随后倒计时到点又变成「超时」
    resetCaptchaStatus();
  } finally {
    loading.value = false;
  }
}

/** 加载系统配置（logo + favicon + 默认登录背景），写入 :root CSS 变量并应用 favicon */
onMounted(() => {
  loadRemembered();
  themeStore.loadSystemConfig();
});
</script>

<style scoped lang="scss">
.login-page {
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 9%;
  background: #fff;
  /* 由 LoginBgPicker 通过 :root CSS 变量注入；默认 none 保持现有白底 */
  background-image: var(--login-bg-image, none);
  background-size: 100% 100%;
  background-position: center;
  background-repeat: no-repeat;
  overflow: hidden;
}

/* ===== 方案介绍浮层（页面级，浮于所有背景之上、登录卡片之外） ===== */
.brand-intro {
  position: absolute;
  z-index: 2; /* 高于背景层(bg-decoration/bg-particles/text-particle-layer)，与卡片(z-index:1)分离且不遮挡 */
  left: 8%;
  top: 50%;
  transform: translateY(-50%);
  width: 25rem;
  max-width: 38vw;
  padding: 1.75rem 2rem;
  /* 接近透明的轻量浮层，尽量保留背景可见度 */
  background: rgba(16, 24, 40, 0.12);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 1rem;
  box-shadow: 0 0.75rem 2.5rem rgba(0, 0, 0, 0.12);
  pointer-events: none; /* 纯展示，不拦截背景层交互 */

  &__title {
    margin: 0;
    font-size: clamp(19px, 1.375rem, 24px);
    font-weight: 700;
    line-height: 1.4;
    color: #fff;
    letter-spacing: 0.5px;
    text-shadow: 0 0.125rem 0.75rem rgba(0, 0, 0, 0.4);
  }

  /* 标题下方蓝色装饰横线 */
  &__rule {
    display: block;
    width: 4rem;
    height: 0.25rem;
    margin: 0.875rem 0 1.625rem;
    border-radius: 0.125rem;
    background: linear-gradient(90deg, #2f7bff, #4f9bff);
  }

  &__list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: var(--hb-space-lg);

    & + & {
      margin-top: 1.5rem;
    }
  }

  /* 蓝色菱形图标底座（对照参考图的旋转方块 + 白色线性图标） */
  &__icon {
    flex-shrink: 0;
    width: 2.625rem;
    height: 2.625rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #2f7bff, #1e5eff);
    border-radius: 0.625rem;
    transform: rotate(45deg);
    box-shadow: 0 0.25rem 0.875rem rgba(47, 123, 255, 0.4);

    .el-icon {
      transform: rotate(-45deg); /* 图标转正 */
      font-size: 1.25rem;
      color: #fff;
    }
  }

  &__text {
    p {
      margin: 0;
      font-size: clamp(14px, 0.9375rem, 17px);
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.92);
      text-shadow: 0 0.0625rem 0.375rem rgba(0, 0, 0, 0.35);
    }
  }
}

/* ===== 背景装饰 ===== */
.bg-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* 图片背景下隐藏 CSS 装饰；默认 block 保持现有视觉 */
  display: var(--login-bg-show-decoration, block);

  .blob,
  .ring {
    position: absolute;
    border-radius: 50%;
  }
  .blob {
    filter: blur(2px);
  }
  .blob-1 {
    width: 480px;
    height: 480px;
    top: -120px;
    left: -80px;
    background: radial-gradient(
      circle,
      rgba(65, 168, 129, 0.5),
      rgba(65, 168, 129, 0.12) 55%,
      transparent 72%
    );
    animation: blob-1-drift 18s ease-in-out infinite;
  }
  .blob-2 {
    width: 380px;
    height: 380px;
    bottom: -120px;
    left: 10%;
    background: radial-gradient(
      circle,
      rgba(65, 168, 129, 0.38),
      rgba(65, 168, 129, 0.08) 55%,
      transparent 72%
    );
    animation: blob-2-drift 22s ease-in-out infinite;
  }
  .ring {
    border: 2px solid rgba(65, 168, 129, 0.35);
  }
  .ring-1 {
    width: 260px;
    height: 260px;
    top: 14%;
    left: 24%;
    animation: ring-1-orbit 24s linear infinite;
  }
  .ring-2 {
    width: 150px;
    height: 150px;
    bottom: 18%;
    left: 6%;
    animation: ring-2-orbit 16s linear infinite reverse;
  }
  .dot-grid {
    position: absolute;
    top: 16%;
    left: 6%;
    width: 150px;
    height: 150px;
    background-image: radial-gradient(
      rgba(65, 168, 129, 0.6) 2px,
      transparent 2px
    );
    background-size: 18px 18px;
    opacity: 0.8;
    animation: dot-grid-pulse 8s ease-in-out infinite;
  }
}

/* ===== 背景动态动画 ===== */
@keyframes blob-1-drift {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25%      { transform: translate(120px, 80px) scale(1.15); }
  50%      { transform: translate(200px, -60px) scale(0.9); }
  75%      { transform: translate(80px, 140px) scale(1.1); }
}

@keyframes blob-2-drift {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33%      { transform: translate(-150px, -100px) scale(1.2); }
  66%      { transform: translate(100px, -180px) scale(0.85); }
}

@keyframes ring-1-orbit {
  0%   { transform: translate(0, 0) rotate(0deg); }
  50%  { transform: translate(-80px, 60px) rotate(180deg); }
  100% { transform: translate(0, 0) rotate(360deg); }
}

@keyframes ring-2-orbit {
  0%   { transform: translate(0, 0) rotate(0deg); }
  50%  { transform: translate(100px, -80px) rotate(180deg); }
  100% { transform: translate(0, 0) rotate(360deg); }
}

@keyframes dot-grid-pulse {
  0%, 100% { opacity: 0.8; transform: scale(1) translate(0, 0); }
  50%      { opacity: 0.4; transform: scale(1.3) translate(40px, 30px); }
}

/* ===== 沿轨迹运动的粒子系统 ===== */
/* 设计理念：有机生物科技感 —— 三层深度（远景光晕 / 中景轨迹线 / 近景粒子与几何）
   每个元素沿独立 SVG 路径运动，周期互质，错峰启动，形成持续生动的流动感 */

.bg-particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}

/* 文字粒子聚合动效层：页面级浮层，位于背景粒子之上、登录卡片之下 */
.text-particle-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  overflow: hidden;
}

/* --- 可见轨迹线（半透明 SVG 路径，让运动轨迹成为视觉元素） --- */
.trails {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.55;
}
.trail-line {
  fill: none;
  stroke-width: 1.2;
  stroke-dasharray: 4 8;
  animation: trail-draw 60s linear infinite;
}
.trail-line-1 { stroke: url(#trail-g1); animation-duration: 80s; }
.trail-line-2 { stroke: url(#trail-g2); animation-duration: 90s; animation-delay: -20s; }
.trail-line-3 { stroke: url(#trail-g3); animation-duration: 70s; animation-delay: -10s; }
.trail-line-4 { stroke: url(#trail-g1); animation-duration: 85s; animation-delay: -40s; }
.trail-line-5 { stroke: url(#trail-g2); animation-duration: 75s; animation-delay: -15s; }
.trail-line-6 { stroke: url(#trail-g3); animation-duration: 95s; animation-delay: -30s; }

@keyframes trail-draw {
  to { stroke-dashoffset: -1000; }
}

/* --- 流光粒子（带拖尾的发光圆点） --- */
.particle {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(65, 168, 129, 0.95);
  box-shadow:
    0 0 8px rgba(65, 168, 129, 0.9),
    0 0 16px rgba(65, 168, 129, 0.6),
    -8px 0 12px rgba(65, 168, 129, 0.4),
    -16px 0 20px rgba(65, 168, 129, 0.2);
  offset-rotate: 0deg;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
.particle-1 {
  offset-path: path('M 0 200 Q 200 100 400 300 T 800 200 T 1200 400 T 1600 300');
  animation-name: particle-flow;
  animation-duration: 18s;
}
.particle-2 {
  offset-path: path('M 0 500 Q 300 300 600 600 T 1200 500 T 1600 700');
  background: rgba(110, 220, 180, 0.95);
  box-shadow:
    0 0 8px rgba(110, 220, 180, 0.9),
    0 0 16px rgba(110, 220, 180, 0.6),
    -8px 0 12px rgba(110, 220, 180, 0.4),
    -16px 0 20px rgba(110, 220, 180, 0.2);
  animation-name: particle-flow;
  animation-duration: 22s;
  animation-delay: -5s;
}
.particle-3 {
  offset-path: path('M 100 0 Q 400 200 300 500 T 500 900');
  background: rgba(255, 196, 0, 0.95);
  box-shadow:
    0 0 8px rgba(255, 196, 0, 0.9),
    0 0 16px rgba(255, 196, 0, 0.5),
    -6px 0 10px rgba(255, 196, 0, 0.4),
    -12px 0 18px rgba(255, 196, 0, 0.2);
  width: 5px; height: 5px;
  animation-name: particle-flow;
  animation-duration: 20s;
  animation-delay: -3s;
}
.particle-4 {
  offset-path: path('M 1500 100 Q 1100 400 1300 700 T 900 900');
  background: rgba(65, 168, 129, 0.95);
  animation-name: particle-flow;
  animation-duration: 17s;
  animation-delay: -8s;
}
.particle-5 {
  offset-path: path('M 0 800 Q 400 700 700 850 T 1400 700 T 1600 800');
  background: rgba(180, 240, 210, 0.95);
  box-shadow:
    0 0 10px rgba(180, 240, 210, 0.9),
    0 0 20px rgba(180, 240, 210, 0.6),
    -10px 0 14px rgba(180, 240, 210, 0.4),
    -20px 0 24px rgba(180, 240, 210, 0.2);
  width: 7px; height: 7px;
  animation-name: particle-flow;
  animation-duration: 24s;
  animation-delay: -2s;
}
.particle-6 {
  offset-path: path('M 800 0 Q 900 400 700 600 T 800 1000');
  background: rgba(255, 220, 100, 0.9);
  box-shadow:
    0 0 8px rgba(255, 220, 100, 0.9),
    0 0 16px rgba(255, 220, 100, 0.5),
    -6px 0 10px rgba(255, 220, 100, 0.4),
    -12px 0 18px rgba(255, 220, 100, 0.2);
  width: 4px; height: 4px;
  animation-name: particle-flow;
  animation-duration: 19s;
  animation-delay: -11s;
}

@keyframes particle-flow {
  0%   { offset-distance: 0%;   opacity: 0; }
  8%   { opacity: 1; }
  92%  { opacity: 1; }
  100% { offset-distance: 100%; opacity: 0; }
}

/* --- 几何图形（沿轨迹运动 + 自转） --- */
.shape {
  position: absolute;
  offset-rotate: auto;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}

/* 三角形 1：绿色，沿顶部水平长波浪线运动（横跨左右） */
.shape-tri-1 {
  width: 0; height: 0;
  border-left: 9px solid transparent;
  border-right: 9px solid transparent;
  border-bottom: 16px solid rgba(65, 168, 129, 0.75);
  filter: drop-shadow(0 0 8px rgba(65, 168, 129, 0.6));
  offset-path: path('M -50 150 Q 400 50 800 250 T 1600 150 T 2000 100');
  animation-name: particle-flow;
  animation-duration: 28s;
}

/* 三角形 2：金色，沿底部水平长波浪线运动（与三角形1上下分离） */
.shape-tri-2 {
  width: 0; height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-bottom: 12px solid rgba(255, 196, 0, 0.7);
  filter: drop-shadow(0 0 6px rgba(255, 196, 0, 0.5));
  offset-path: path('M 2000 900 Q 1400 1050 1000 850 T 400 950 T -50 850');
  animation-name: particle-flow;
  animation-duration: 32s;
  animation-delay: -12s;
}

/* 方块：金色边框，沿左侧垂直 S 曲线运动（纵跨上下） */
.shape-square-1 {
  width: 14px; height: 14px;
  background: rgba(255, 196, 0, 0.15);
  border: 1.5px solid rgba(255, 196, 0, 0.85);
  box-shadow:
    0 0 10px rgba(255, 196, 0, 0.5),
    inset 0 0 6px rgba(255, 196, 0, 0.3);
  offset-path: path('M 200 -50 Q 500 300 200 600 T 500 1100');
  animation-name: particle-flow;
  animation-duration: 30s;
  animation-delay: -10s;
}

/* 菱形：青绿色，沿右侧垂直 S 曲线运动（与方块左右分离） */
.shape-diamond-1 {
  width: 12px; height: 12px;
  background: rgba(110, 220, 180, 0.8);
  box-shadow:
    0 0 12px rgba(110, 220, 180, 0.7),
    0 0 24px rgba(110, 220, 180, 0.4);
  transform: rotate(45deg);
  offset-path: path('M 1500 -50 Q 1200 350 1500 650 T 1200 1100');
  animation-name: particle-flow;
  animation-duration: 26s;
  animation-delay: -7s;
}

/* 圆环：绿色空心，沿中心对角线运动（斜跨全屏，避开中部聚集） */
.shape-ring-1 {
  width: 18px; height: 18px;
  border: 2px solid rgba(65, 168, 129, 0.7);
  border-radius: 50%;
  box-shadow:
    0 0 12px rgba(65, 168, 129, 0.5),
    inset 0 0 8px rgba(65, 168, 129, 0.3);
  offset-path: path('M -50 1000 Q 500 800 900 500 T 1700 200 T 2000 -50');
  animation-name: particle-flow;
  animation-duration: 34s;
  animation-delay: -15s;
}

/* ===== 悬浮卡片 ===== */
.login-card {
  position: relative;
  z-index: 1;
  display: flex;
  width: 55rem;
  max-width: 92vw;
  height: 32.5rem;
  background: #fff;
  border-radius: 1.125rem;
  overflow: hidden;
  box-shadow:
    0 1.5rem 3.75rem rgba(65, 168, 129, 0.28),
    0 0.5rem 1.25rem rgba(0, 0, 0, 0.1),
    0 0 0 1px rgba(0, 0, 0, 0.05);
}

/* ===== 左侧介绍区 ===== */
.intro-side {
  position: relative;
  width: 46%;
  padding: 2.75rem 2.5rem 3.5rem;
  color: #fff;
  background: #41a881;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.intro-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;

  .circle {
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.06);
  }
  .circle-1 {
    width: 220px;
    height: 220px;
    top: -70px;
    right: -70px;
  }
  .circle-2 {
    width: 130px;
    height: 130px;
    bottom: -40px;
    left: -30px;
    background: rgba(255, 255, 255, 0.1);
  }
}

.intro-top {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--hb-space-md);
  margin-bottom: 2.25rem;

  .logo-box {
    width: 2.875rem;
    height: 2.875rem;
    border-radius: 0.6875rem;
    background: rgba(255, 255, 255, 0.16);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    font-weight: 800;
  }
  .logo-text {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
    .cn {
      font-size: var(--hb-font-size-large);
      font-weight: 700;
    }
    .en {
      font-size: var(--hb-font-size-xs);
      letter-spacing: 2px;
      color: rgba(255, 255, 255, 0.6);
    }
  }
}

.intro-illustration {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--hb-space-sm) 0;

  svg {
    width: 100%;
    max-width: 18.75rem;
    height: auto;
    /* 轻微浮动动画，增加数字化"活"的感觉 */
    animation: illust-float 6s ease-in-out infinite;
  }
}

@keyframes illust-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .intro-illustration svg {
    animation: none;
  }
  /* 禁用所有背景装饰动画（光晕/圆环/点阵/粒子/几何图形/轨迹线） */
  .blob,
  .ring,
  .dot-grid,
  .particle,
  .shape,
  .trail-line {
    animation: none !important;
  }
}

.intro-footer {
  position: relative;
  z-index: 1;
  font-size: var(--hb-font-size-small);
  color: rgba(255, 255, 255, 0.45);
  text-align: center;
  margin-top: 2rem;
}

/* ===== 右侧表单区 ===== */
.form-side {
  position: relative; /* 作为验证码对话框 absolute 定位的参照 */
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3rem;
}

.form-inner {
  width: 100%;
  max-width: 20rem;
}

.form-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

.to-frontend {
  font-size: 13px;
  color: #86909c;
  text-decoration: none;
  line-height: 1.4;
  transition: color 0.15s ease;

  &:hover {
    color: #41a881;
  }
  &:focus-visible {
    outline: 2px solid rgba(65, 168, 129, 0.45);
    outline-offset: 2px;
    border-radius: 2px;
  }
}

.form-header {
  margin-bottom: 2rem;

  /* 系统名称：默认（PC 端）隐藏，仅手机端在登录框上方显示 */
  .form-system-name {
    display: none;
  }

  h2 {
    font-size: clamp(20px, 1.5rem, 27px);
    color: #1d2129;
    margin-bottom: var(--hb-space-sm);
  }
  p {
    font-size: var(--hb-font-size-base);
    color: #86909c;
  }
}

.login-form {
  :deep(.el-input__wrapper) {
    border-radius: 0.625rem;
    padding: var(--hb-space-xs) 0.875rem;
  }
  :deep(.el-input__wrapper.is-focus) {
    box-shadow: 0 0 0 1px #41a881 inset;
  }
}

.login-btn {
  width: 100%;
  height: clamp(40px, 2.75rem, 50px);
  letter-spacing: 4px;
  font-size: clamp(14px, 0.9375rem, 17px);
  border-radius: 0.625rem;
  background: #41a881;
  border-color: #41a881;

  &:hover {
    background: #379270;
    border-color: #379270;
  }
  &:focus-visible {
    background: #379270;
    border-color: #379270;
    outline: 2px solid rgba(65, 168, 129, 0.5);
    outline-offset: 2px;
  }
}

/* 验证按钮：与登录按钮等宽，高度略矮区分主次 */
.verify-btn {
  width: 100%;
  height: clamp(36px, 2.5rem, 45px);
  font-size: var(--hb-font-size-base);
  border-radius: 0.625rem;

  /* idle 态 hover：边框/文字改为登录绿，与主题按钮统一色调（排除 expired） */
  &.is-idle:not(.is-disabled):hover {
    color: #41a881;
    border-color: #41a881;
    background: rgba(65, 168, 129, 0.06);
  }
  &.is-idle:not(.is-disabled):focus-visible {
    color: #41a881;
    border-color: #41a881;
    background: rgba(65, 168, 129, 0.06);
    outline: 2px solid rgba(65, 168, 129, 0.5);
    outline-offset: 2px;
  }

  /* expired 超时态：文字/边框红色，背景保持初始色（白色） */
  &.is-expired {
    color: #f56c6c;
    border-color: #f56c6c;
    background: #fff;
  }
  &.is-expired:not(.is-disabled):hover {
    color: #f56c6c;
    border-color: #f56c6c;
    background: rgba(245, 108, 108, 0.06);
  }
  &.is-expired:not(.is-disabled):focus-visible {
    color: #f56c6c;
    border-color: #f56c6c;
    background: rgba(245, 108, 108, 0.06);
    outline: 2px solid rgba(245, 108, 108, 0.5);
    outline-offset: 2px;
  }
}

/* 记住密码复选框行：紧贴密码框下方，右对齐留出呼吸感 */
.login-options {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin: -0.375rem 0 var(--hb-space-lg);

  :deep(.el-checkbox__label) {
    font-size: var(--hb-font-size-base);
    color: #606266;
  }
  :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
    background: #41a881;
    border-color: #41a881;
  }
  :deep(.el-checkbox__input.is-checked + .el-checkbox__label) {
    color: #41a881;
  }
}

/* 滑块验证码对话框标题栏：标题 + 刷新按钮 */
.captcha-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 0.625rem; /* 给关闭按钮留出间距，避免与刷新按钮挤在一起 */
}
.captcha-dialog__title {
  font-size: var(--hb-font-size-medium);
  font-weight: 600;
  color: #303133;
}
/* 刷新按钮：原生 button 重置样式，10px 间距由 margin-left 实现 */
.captcha-dialog__refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  margin-left: 0.625rem;
  padding: 0;
  border: none;
  border-radius: 0.375rem;
  background: transparent;
  color: #909399;
  cursor: pointer;
  transition: color 0.2s ease, background-color 0.2s ease;

  &:hover {
    color: #41a881;
    background: rgba(65, 168, 129, 0.08);
  }
  &:focus-visible {
    outline: 2px solid #41a881;
    outline-offset: 1px;
  }
  .el-icon {
    font-size: 1rem;
  }
}

/* 滑块验证码对话框提示文案：位于滑块下方 */
.captcha-dialog__hint {
  margin-top: 0.875rem;
  font-size: var(--hb-font-size-base);
  color: #909399;
  text-align: center;
}

/* 窄屏：登录卡片居中，对话框回到视口居中 */
@media (max-width: 767.98px) {
  .form-side :deep(.captcha-overlay) {
    position: fixed !important;
    inset: 0;
  }
}

/* 窄屏：隐藏介绍区，卡片仅留表单 */
@media (max-width: 767.98px) {
  /* PC 端卡片靠右（flex-end + padding-right:9%）；
     手机端改为块级布局 + margin auto 强制水平居中，
     避免 flex justify-content 在 overflow/背景定位下的细微偏移 */
  .login-page {
    display: block;
    padding: 0;
    /* 留出刘海屏/手势条安全区 */
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
  /* 方案介绍浮层在手机端隐藏（屏幕窄，与居中卡片重叠） */
  .brand-intro {
    display: none;
  }
  .login-card {
    width: 92vw;
    max-width: 400px;
    height: auto;
    max-height: 96vh;
    overflow-y: auto;
    padding: 8px 0;
    /* 绝对定位精确居中，不受父级 flex/padding/overflow 影响 */
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
  .intro-side {
    display: none;
  }
  .form-side {
    padding: 32px 24px;
  }
  /* 手机端：登录框上方显示系统名称，作为页面标识 */
  .form-header {
    text-align: center;
    .form-system-name {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      font-size: 19px;
      font-weight: 700;
      color: #1d2129;
      line-height: 1.4;
      margin-bottom: 20px;
      padding-bottom: 14px;
      position: relative;
      &::after {
        content: '';
        position: absolute;
        left: 50%;
        bottom: 0;
        transform: translateX(-50%);
        width: 44px;
        height: 3px;
        border-radius: 2px;
        background: var(--el-color-primary, #2f7bff);
      }
    }
    /* 手机端弱化"欢迎回来"，让系统名称成为视觉主标题 */
    h2 {
      font-size: 18px;
    }
  }
}

/* 超窄屏（iPhone SE 等 ≤375px）：进一步压缩 */
@media (max-width: 375px) {
  .form-side {
    padding: 24px 16px;
  }
  :deep(.el-input__inner) {
    height: 40px !important;
  }
}
</style>

<!-- 非 scoped：tooltip 经 teleport 挂到 body，需全局样式覆盖背景色 -->
<style lang="scss">
.verify-tip.el-popper.is-dark {
  /* 警告色背景（Element Plus warning #e6a23c） */
  background: #e6a23c;
  color: #fff;
  /* 去掉默认黑色边框 */
  border: none;
  /* 箭头颜色同步 */
  .el-popper__arrow::before {
    background: #e6a23c;
    border: none;
  }
}
</style>
