<template>
  <div class="page">
    <el-card shadow="never">
      <el-tabs v-model="activeTab">
        <!-- Tab1：公司信息 -->
        <el-tab-pane label="公司信息" name="company">
          <el-form
            :model="form"
            label-width="100px"
            class="config-form"
            v-loading="loading"
          >
            <el-form-item label="Logo">
              <div class="field-block">
                <InlineImageCropper
                  ref="logoCropperRef"
                  v-model="form.logoUrl"
                  :aspect-ratio="0"
                  stencil-type="rect"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  placeholder-text="上传 Logo"
                  :placeholder-width="240"
                  :preview-width="120"
                  output-name="logo"
                  output-mime="image/png"
                />
                <el-button
                  v-if="form.logoUrl"
                  link
                  type="danger"
                  size="small"
                  @click="clearField('logoUrl', logoCropperRef)"
                >移除</el-button>
              </div>
            </el-form-item>

            <el-form-item label="网站图标">
              <div class="field-block">
                <InlineImageCropper
                  ref="faviconCropperRef"
                  v-model="form.faviconUrl"
                  :aspect-ratio="1"
                  stencil-type="rect"
                  accept="image/x-icon,image/vnd.microsoft.icon,image/png,image/gif"
                  placeholder-text="上传 Favicon"
                  :placeholder-width="200"
                  :preview-width="64"
                  output-name="favicon"
                  output-mime="image/png"
                />
                <div class="upload-tips">
                  <div>支持 ICO（默认）、PNG、SVG、GIF，裁剪为 1:1 方形</div>
                  <div>建议尺寸 32×32 或 64×64</div>
                  <el-button
                    v-if="form.faviconUrl"
                    link
                    type="danger"
                    size="small"
                    @click="clearField('faviconUrl', faviconCropperRef)"
                  >移除</el-button>
                </div>
              </div>
            </el-form-item>

            <el-form-item label="公司名称">
              <el-input v-model="form.companyName" name="companyName" placeholder="如：海宝五金…" maxlength="128" show-word-limit autocomplete="off" />
            </el-form-item>
            <el-form-item label="系统名称">
              <el-input v-model="form.systemName" name="systemName" placeholder="如：MES 系统…" maxlength="64" show-word-limit autocomplete="off" />
            </el-form-item>
            <el-form-item label="联系电话">
              <el-input v-model="form.contactPhone" name="contactPhone" placeholder="如：0577-12345678…" maxlength="64" autocomplete="off" inputmode="tel" />
            </el-form-item>
            <el-form-item label="公司地址">
              <el-input v-model="form.companyAddress" name="companyAddress" placeholder="公司详细地址…" maxlength="255" show-word-limit autocomplete="off" />
            </el-form-item>
            <el-form-item label="银行账号">
              <el-input v-model="form.bankAccount" name="bankAccount" placeholder="对公银行账号…" maxlength="64" autocomplete="off" inputmode="numeric" :spellcheck="false" />
            </el-form-item>
            <el-form-item label="税号">
              <el-input v-model="form.taxNo" name="taxNo" placeholder="统一社会信用代码…" maxlength="64" autocomplete="off" :spellcheck="false" />
            </el-form-item>
            <el-form-item label="版权信息">
              <el-input v-model="form.copyrightInfo" name="copyrightInfo" placeholder="如：海宝五金 · IT部 · V1.0…" maxlength="255" show-word-limit autocomplete="off" />
            </el-form-item>

            <el-form-item>
              <el-button size="small"
                v-permission="'config:update'"
                type="primary"
                :loading="saving"
                @click="onSave"
              >保存</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- Tab2：登录背景 -->
        <el-tab-pane label="登录背景" name="loginBg">
          <el-form
            :model="form"
            label-width="100px"
            class="config-form"
            v-loading="loading"
          >
            <el-form-item label="背景图片">
              <div class="upload-row">
                <el-upload
                  :show-file-list="false"
                  :auto-upload="false"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  :on-change="(f: UploadFile) => onUploadBg(f)"
                >
                  <div v-if="form.loginBgUrl" class="upload-preview upload-preview--bg">
                    <img :src="form.loginBgUrl" alt="登录页背景图" width="320" height="180" />
                    <div class="upload-mask">点击替换</div>
                  </div>
                  <div v-else class="upload-placeholder upload-placeholder--bg">
                    <el-icon aria-hidden="true"><Plus /></el-icon>
                    <span>上传背景图…</span>
                  </div>
                </el-upload>
                <el-button
                  v-if="form.loginBgUrl"
                  link
                  type="danger"
                  size="small"
                  @click="clearBgFile"
                >移除</el-button>
              </div>
              <div class="upload-tips">建议尺寸 1920×1080；上传后请在下方“设为默认”开关启用</div>
            </el-form-item>

            <el-form-item label="设为默认">
              <el-switch
                :model-value="form.loginBgSetAsDefault === 1"
                @update:model-value="(v: any) => (form.loginBgSetAsDefault = v ? 1 : 0)"
              />
              <span class="switch-hint">开启后，登录页右下角"系统默认"项将使用此图片作为背景</span>
            </el-form-item>

            <el-form-item>
              <el-button size="small"
                v-permission="'config:update'"
                type="primary"
                :loading="saving"
                @click="onSave"
              >保存</el-button>
            </el-form-item>
          </el-form>

          <!-- 单例配置行只有「被修改」没有「被创建」，故只露更新侧 -->
          <div v-if="form.updaterName || form.updatedAt" class="config-audit">
            最后更新：{{ form.updaterName || '—' }}
            <span v-if="form.updatedAt">（{{ formatDateTime(form.updatedAt) }}）</span>
          </div>
        </el-tab-pane>

        <!-- 审批管理不移植：OMS 无审核流（设计文档决策 #2） -->

        <!-- Tab3：业务字段（全局字段启用开关） -->
        <el-tab-pane label="业务字段" name="fields">
          <el-form
            :model="form"
            label-width="100px"
            class="config-form"
            v-loading="loading"
          >
            <!-- 版块一：全局字段开关（清一色的启用/停用） -->
            <el-card shadow="never" class="cfg-section">
            <div class="section-title">全局字段开关</div>
            <p class="section-desc">
              关闭后该字段在全系统的录入框、表格列与 Excel 导出列一并隐藏。这是「录入与展示」开关，
              不会删除已录入的数据——重新开启即原样恢复。
            </p>

            <el-form-item label="颜色字段">
              <el-switch
                :model-value="form.colorFieldEnabled === 1"
                active-text="启用"
                inactive-text="停用"
                @update:model-value="(v: any) => (form.colorFieldEnabled = v ? 1 : 0)"
              />
              <div class="switch-hint switch-hint--block">
                与「表面处理」配套的业务字段。影响范围：订单表单、外发件回厂记录（登记 / 编辑 / 列表）、
                成品库存列表、订单跟踪台账展开行，以及台账导出与总计划导出的「颜色」列。
                <strong>不影响呆滞品管理</strong>——那一页有下面单独的开关。
              </div>
            </el-form-item>

            <el-form-item label="客户图号">
              <el-switch
                :model-value="form.customerDrawingNoEnabled === 1"
                active-text="启用"
                inactive-text="停用"
                @update:model-value="(v: any) => (form.customerDrawingNoEnabled = v ? 1 : 0)"
              />
              <div class="switch-hint switch-hint--block">
                客户来图上的图号，<strong>不是</strong>部件组的「生产图号」（后者不受此开关影响）。
                影响范围：订单表单、订单列表展开行，以及总计划导出的「客户图号」列。
              </div>
            </el-form-item>

            <el-form-item label="呆滞品颜色">
              <el-switch
                :model-value="form.dullStockColorEnabled === 1"
                active-text="启用"
                inactive-text="停用"
                @update:model-value="(v: any) => (form.dullStockColorEnabled = v ? 1 : 0)"
              />
              <div class="switch-hint switch-hint--block">
                只管<strong>「物料管理 → 呆滞品管理」</strong>的颜色列与建档弹窗，
                <strong>独立于上面的「颜色字段」开关</strong>——呆滞品的表面处理与颜色是配套联动带出的
                （电泳→黑色、喷涂→白色），是这本账辨认货物的主要依据，所以单独控制。
              </div>
            </el-form-item>

            <el-form-item label="产品要求描述">
              <el-switch
                :model-value="form.productRequirementEnabled === 1"
                active-text="启用"
                inactive-text="停用"
                @update:model-value="(v: any) => (form.productRequirementEnabled = v ? 1 : 0)"
              />
              <div class="switch-hint switch-hint--block">
                订单产品级的特殊要求文本（如测试标准、包装要求），录订单时随产品行登记。
                影响范围：订单表单（「轨道节数」与「规格」之间）、订单列表展开行，
                以及总计划导出的「产品要求描述」列。
              </div>
            </el-form-item>
            </el-card>

            <!-- 版块二：单位换算。与上面的启用/停用开关不是一类（这里是设定值），
                 故各自成卡；只用一条分隔线区分不够，视觉上仍像同一组配置 -->
            <el-card shadow="never" class="cfg-section">
            <div class="section-title">单位换算</div>
            <p class="section-desc">
              这两项不是开关，是<strong>设定值</strong>：一个定英寸与 mm 的换算约定，一个定规格默认按哪个单位显示。
            </p>

            <el-form-item label="换算系数">
              <div class="unit-line">
                <span>1 英寸 =</span>
                <el-input-number
                  v-model="form.inchToMm"
                  :min="0.001"
                  :max="999"
                  :precision="3"
                  :step="1"
                  :controls="false"
                  style="width: 110px"
                />
                <span>mm</span>
              </div>
              <div class="switch-hint switch-hint--block">
                我司口径为 <strong>25</strong>（非国标 25.4），此前写死在程序里，现可在此调整。
                影响范围：订单表单「英寸」录入折算、开单信息「10寸」自动换算，以及全系统的「寸」视图显示。
                <strong>改动只对之后的录入与显示生效，不会重算已经存进系统的 mm 数值</strong>——
                历史订单的规格不会因为改这个数而变动。
              </div>
            </el-form-item>

            <el-form-item label="默认规格单位">
              <el-radio-group v-model="form.dimensionViewUnit">
                <el-radio-button value="mm">mm</el-radio-button>
                <el-radio-button value="inch">寸</el-radio-button>
              </el-radio-group>
              <div class="switch-hint switch-hint--block">
                <strong>首页、订单跟踪台账、订单管理</strong>三个页面打开时「规格」列默认按哪个单位显示
                （页面上仍可随时切换，只是不再每次手动改）；<strong>台账导出与总计划导出</strong>的规格列也跟随此设置。
              </div>
            </el-form-item>
            </el-card>

            <el-form-item>
              <el-button size="small"
                v-permission="'config:update'"
                type="primary"
                :loading="saving"
                @click="onSave"
              >保存</el-button>
            </el-form-item>
          </el-form>

          <div class="config-audit">
            保存后本人立即生效；其他已登录用户刷新页面后生效。
          </div>
        </el-tab-pane>

        <!-- Tab4：危险操作（仅 admin 可见）。
             整个页签隐藏而非禁用：页签标题由 el-tabs 头部另行渲染，
             禁用面板 div 拦不住用户切到该页签。 -->
        <el-tab-pane
          v-permission.hide="'system:danger'"
          label="危险操作"
          name="danger"
        >
          <div class="danger-zone">
            <el-alert
              type="error"
              :closable="false"
              show-icon
              title="危险操作区"
              description="以下操作不可恢复，仅系统管理员可执行。请确认你已了解后果后再操作。"
            />

            <el-card shadow="never" class="danger-card">
              <div class="danger-card__title">清理业务测试数据</div>
              <div class="danger-card__desc">
                清除订单、排产、外协、消息、操作日志、文件记录及单号序列（重置为初始值）。
                <strong>保留</strong>系统配置（用户/角色/权限）、物料主数据、字典主数据。
              </div>
              <ul class="danger-card__list">
                <li>适用场景：部署前清理测试阶段产生的业务数据</li>
                <li>安全判断：订单数 &gt; 50 条时视为已正式使用，<strong>即使管理员也无法清理</strong></li>
                <li>清理后请同步删除服务器 <code>uploads/</code> 目录下的孤儿文件</li>
              </ul>

              <el-form label-width="100px" class="danger-form">
                <el-form-item label="确认口令">
                  <el-input
                    v-model="cleanupConfirm"
                    name="cleanupConfirm"
                    placeholder='请输入“清理”二字以确认…'
                    :disabled="cleaning"
                    autocomplete="off"
                    :spellcheck="false"
                    style="width: 240px"
                  />
                </el-form-item>
                <el-form-item>
                  <el-button
                    type="danger"
                    :loading="cleaning"
                    :disabled="cleanupConfirm !== '清理'"
                    @click="onCleanup"
                  >执行清理</el-button>
                </el-form-item>
              </el-form>

              <el-alert
                v-if="cleanupResult"
                :type="cleanupError ? 'error' : 'success'"
                :closable="false"
                show-icon
                aria-live="polite"
                :title="cleanupError ? '清理失败' : '清理完成'"
                :description="cleanupError || cleanupResult.message"
                style="margin-top: 12px"
              />
            </el-card>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
// keep-alive 缓存键取组件 name；本项目多数页面文件同名 index.vue，
// 不显式命名会导致缓存互相顶替、onActivated 打在错误实例上（刷新失效）。
defineOptions({ name: 'SystemConfigPage' });

import { ref, reactive, onActivated, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type UploadFile } from 'element-plus';
import { uploadFile } from '@/api/file';
import {
  getSystemConfig,
  updateSystemConfig,
  cleanupBusinessData,
  type SystemConfig,
  type CleanupResult,
} from '@/api/system';
import { formatDateTime } from '@/utils/date';
import { useThemeStore } from '@/stores/theme';
import { useFeatureStore } from '@/stores/feature';
import { normalizeUploadUrl } from '@/utils/upload-url';
import InlineImageCropper from '@/components/InlineImageCropper.vue';

const loading = ref(false);
const saving = ref(false);
const route = useRoute();
const router = useRouter();
const validTabs = ['company', 'loginBg', 'fields', 'danger'] as const;
type TabName = (typeof validTabs)[number];
const initialTab = validTabs.includes(route.query.tab as TabName)
  ? (route.query.tab as TabName)
  : 'company';
const activeTab = ref<TabName>(initialTab);
// URL 反映状态：Tab 切换同步到 query，支持深链/刷新保持
watch(activeTab, (tab) => {
  if (route.query.tab !== tab) {
    router.replace({ query: { ...route.query, tab } });
  }
});
const themeStore = useThemeStore();
const featureStore = useFeatureStore();

/* 危险操作：业务数据清理 */
const cleanupConfirm = ref('');
const cleaning = ref(false);
const cleanupResult = ref<CleanupResult | null>(null);
const cleanupError = ref('');

async function onCleanup() {
  if (cleanupConfirm.value !== '清理') {
    ElMessage.warning('请输入确认口令「清理」');
    return;
  }
  // 二次确认弹窗
  try {
    await ElMessageBox.confirm(
      '此操作将清除所有订单、排产、外协、消息、日志数据，且不可恢复！确定继续？',
      '危险操作确认',
      { type: 'error', confirmButtonText: '确认清理', cancelButtonText: '取消' },
    );
  } catch {
    return; // 用户取消
  }
  cleaning.value = true;
  cleanupError.value = '';
  cleanupResult.value = null;
  try {
    cleanupResult.value = await cleanupBusinessData(cleanupConfirm.value);
    ElMessage.success('清理完成');
    cleanupConfirm.value = '';
  } catch (err: any) {
    cleanupError.value = err?.message || '清理失败，请重试';
    ElMessage.error(cleanupError.value);
  } finally {
    cleaning.value = false;
  }
}

/** 表单数据（与 SystemConfig 接口字段对齐） */
const form = reactive<SystemConfig>({
  logoUrl: null,
  faviconUrl: null,
  companyName: null,
  systemName: null,
  contactPhone: null,
  companyAddress: null,
  bankAccount: null,
  taxNo: null,
  copyrightInfo: null,
  loginBgUrl: null,
  loginBgSetAsDefault: 0,
  // 默认启用：接口回值前不该让页面先渲染成"已停用"
  colorFieldEnabled: 1,
  customerDrawingNoEnabled: 1,
  dullStockColorEnabled: 1,
  productRequirementEnabled: 1,
  // 单位换算：缺省同共享包的我司口径（1 英寸 = 25mm）与内部存储口径（mm）
  inchToMm: 25,
  dimensionViewUnit: 'mm',
});

/* 裁剪组件 ref */
const logoCropperRef = ref<InstanceType<typeof InlineImageCropper>>();
const faviconCropperRef = ref<InstanceType<typeof InlineImageCropper>>();

/* 背景图文件：选图后保留原始 File，保存时上传 */
const pendingBgFile = ref<File | null>(null);
const bgPreviewUrl = ref<string>('');

async function load() {
  loading.value = true;
  try {
    const cfg = await getSystemConfig();
    const normalizedCfg = {
      ...cfg,
      logoUrl: normalizeUploadUrl(cfg.logoUrl),
      faviconUrl: normalizeUploadUrl(cfg.faviconUrl),
      loginBgUrl: normalizeUploadUrl(cfg.loginBgUrl),
    };
    Object.assign(form, normalizedCfg);
    bgPreviewUrl.value = normalizedCfg.loginBgUrl ?? '';
  } finally {
    loading.value = false;
  }
}

/** 登录背景图最大 10MB（与后端 MAX_IMAGE_SIZE 一致） */
const MAX_BG_SIZE = 10 * 1024 * 1024;

/**
 * 背景图选图（不裁剪）：保留原始 File，生成 blob 预览。
 * 选图时立即校验大小，超限给出友好提示并中止。
 */
function onUploadBg(file: UploadFile) {
  const raw = file.raw;
  if (!raw) return;
  // 大小校验：超限直接拦截，避免提交时才报 413
  if (raw.size > MAX_BG_SIZE) {
    const mb = (raw.size / 1024 / 1024).toFixed(1);
    ElMessage.warning(`图片大小 ${mb}\u00A0MB，超过 10\u00A0MB 限制，请压缩后重新选择`);
    return;
  }
  // 撤销旧 blob 预览
  if (bgPreviewUrl.value && bgPreviewUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(bgPreviewUrl.value);
  }
  pendingBgFile.value = raw;
  bgPreviewUrl.value = URL.createObjectURL(raw);
  form.loginBgUrl = bgPreviewUrl.value;
}

/** 清除背景图待上传文件 */
function clearBgFile() {
  if (bgPreviewUrl.value && bgPreviewUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(bgPreviewUrl.value);
  }
  pendingBgFile.value = null;
  bgPreviewUrl.value = '';
  form.loginBgUrl = null;
}

/**
 * 清除裁剪字段并重置对应裁剪组件
 */
function clearField(
  field: 'logoUrl' | 'faviconUrl',
  cropper?: InstanceType<typeof InlineImageCropper>,
) {
  form[field] = null;
  cropper?.reset();
}

/**
 * 保存：先上传待上传的裁剪文件与背景图文件，再用真实 URL 提交表单。
 * 裁剪字段：用户未选新图时 getCroppedFile() 返回 null，保留原 URL；
 *          用户选了新图时返回 File，上传后用真实 URL 覆盖 form 字段。
 */
async function onSave() {
  saving.value = true;
  try {
    // 1. 上传 Logo（若有新裁剪）
    const logoFile = await logoCropperRef.value?.getCroppedFile();
    if (logoFile) {
      form.logoUrl = await uploadFile(logoFile, 'system_logo');
    }
    // 2. 上传 Favicon（若有新裁剪）
    const faviconFile = await faviconCropperRef.value?.getCroppedFile();
    if (faviconFile) {
      form.faviconUrl = await uploadFile(faviconFile, 'system_favicon');
    }
    // 3. 上传背景图（若有新文件）
    if (pendingBgFile.value) {
      form.loginBgUrl = await uploadFile(pendingBgFile.value, 'system_loginBg');
      pendingBgFile.value = null;
    }
    // 4. 提交表单
    await updateSystemConfig({ ...form });
    ElMessage.success('保存成功');
    // 刷新表单为服务器最新状态
    await load();
    // 立即同步到全局：logo（侧边栏顶部）+ favicon（浏览器标签）+ 登录背景
    themeStore.loadSystemConfig();
    // 业务字段开关同步刷新，本人无需重登即可看到字段显隐生效
    featureStore.load();
  } catch (err: any) {
    ElMessage.error(err?.message || '保存失败，请重试');
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
// keep-alive 缓存页：切回时重新拉取，避免展示他处已变更的陈旧配置
let configActivated = false;
onActivated(() => {
  if (!configActivated) { configActivated = true; return; }
  load();
});
</script>

<style scoped lang="scss">

.config-form {
  max-width: 720px;
  padding: 16px 0;
}

.field-block {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.upload-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.upload-preview,
.upload-placeholder {
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  transition: border-color 0.2s;
  touch-action: manipulation;

  &:hover {
    border-color: var(--el-color-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 2px;
  }
}

.upload-preview {
  position: relative;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .upload-mask {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
  }

  &:hover .upload-mask {
    opacity: 1;
  }
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  gap: 6px;
  min-width: 0;

  .el-icon {
    font-size: 22px;
  }
}

.upload-preview--bg,
.upload-placeholder--bg {
  width: 320px;
  height: 180px;
}

.upload-tips {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}

.switch-hint {
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 业务字段 Tab 的版块卡：「全局字段开关」与「单位换算」各自成卡。
   两者性质不同（前者是启用/停用开关、后者是设定值），只用一条分隔线区分
   会让人以为是同一组配置的延续。 */
.cfg-section {
  margin-bottom: 16px;
  border-color: var(--el-border-color-lighter);
  :deep(.el-card__body) { padding: 16px 20px 4px; }
  /* 卡内最后一个表单项的下边距由卡片 padding 兜住，避免底部空一大截 */
  :deep(.el-form-item:last-child) { margin-bottom: 12px; }
}

/* 版块标题：主色左竖线 + 统一字号字重（与订单表单的 .section-title 同一套视觉） */
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  border-left: 4px solid var(--el-color-primary);
  padding-left: 10px;
  line-height: 1.3;
  margin: 0 0 8px;
  display: flex;
  align-items: center;
}

/* 版块说明：跟在标题下、与标题左对齐（含竖线宽度），不用 el-alert 的灰底块 */
.section-desc {
  margin: 0 0 16px;
  padding-left: 14px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

/* 「1 英寸 = [__] mm」一行排开，数字框与前后文字对齐 */
.unit-line {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-regular);
}

/* 影响范围这类长说明另起一行，跟在开关后面会把表单行撑得很宽 */
.switch-hint--block {
  display: block;
  width: 100%;
  margin-left: 0;
  margin-top: 4px;
  line-height: 1.6;
}

/* 危险操作区 */
.config-audit {
  margin-top: 4px;
  padding-left: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.danger-zone {
  max-width: 760px;
  padding: 16px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.danger-card {
  border: 1px solid var(--el-color-danger-light-9);

  :deep(.el-card__body) {
    padding: 20px;
  }

  &__title {
    font-size: 15px;
    font-weight: 600;
    color: var(--el-color-danger);
    margin-bottom: 8px;
  }

  &__desc {
    font-size: 13px;
    color: var(--el-text-color-regular);
    line-height: 1.7;
    margin-bottom: 10px;
  }

  &__list {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    line-height: 1.8;
    padding-left: 18px;
    margin: 0 0 16px;

    code {
      background: var(--el-fill-color-light);
      padding: 1px 5px;
      border-radius: 3px;
      font-family: Consolas, Monaco, monospace;
      color: var(--el-color-warning);
    }
  }
}

.danger-form {
  margin-top: 4px;
}

/* 手机端适配 */
@media (max-width: 767.98px) {
  .field-block {
    gap: 8px;
  }
  .upload-row {
    gap: 8px;
  }
  .switch-hint {
    display: block;
    margin-left: 0;
    margin-top: 4px;
  }
  .upload-tips {
    font-size: 11px;
    line-height: 1.5;
  }
}

/* 尊重用户的减少动画偏好 */
@media (prefers-reduced-motion: reduce) {
  .upload-preview,
  .upload-placeholder {
    transition: none;
  }
  .upload-preview .upload-mask {
    transition: none;
  }
}
</style>
