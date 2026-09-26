<template>
  <main class="print-preview-page">
    <header class="preview-toolbar no-print">
      <el-button size="small" :icon="ArrowLeft" @click="goBack">返回列表</el-button>
      <div class="preview-toolbar__title">
        <strong>生产任务单</strong>
        <span>A4 纵向；「导出PDF」直接下载文件，无需打印对话框</span>
      </div>
      <div>
        <el-button size="small" :icon="Printer" :disabled="loading || !order" @click="onPrint">打印</el-button>
        <!-- 与列表入口按钮同权限：直接输 URL 进来的无权用户不该看到可点的按钮
             （后端接口另有 order:export 守卫，这里只是别让人点了才 403） -->
        <el-button
          size="small" type="primary" :icon="Download" v-permission.disable="'order:export'"
          :loading="downloading" :disabled="loading || !order" @click="onDownloadPdf"
        >导出PDF</el-button>
      </div>
    </header>

    <section class="sheet-stage" v-loading="loading">
      <article v-if="order" class="print-sheet">
        <!-- ==================== 页头 ==================== -->
        <header class="doc-heading">
          <h1>{{ COMPANY_FULL_NAME }}</h1>
          <h2>生产任务单</h2>
        </header>
        <div class="doc-meta">
          <div class="doc-meta__row">
            <div class="doc-meta__item">
              <span class="doc-meta__label">生产订单:</span>
              <span class="doc-meta__value">{{ order.productionNo || order.orderNo }}</span>
            </div>
            <div class="doc-meta__item">
              <span class="doc-meta__label">订单日期:</span>
              <!-- 日期数字加粗、年月日汉字不加粗（对照纸质单写法） -->
              <span class="doc-meta__value">
                <template v-if="orderDateParts">
                  <b>{{ orderDateParts.y }}</b>年<b>{{ orderDateParts.m }}</b>月<b>{{ orderDateParts.d }}</b>日
                </template>
                <template v-else>—</template>
              </span>
            </div>
          </div>
          <div class="doc-meta__row">
            <div class="doc-meta__item">
              <span class="doc-meta__label">客户采购单编号:</span>
              <span class="doc-meta__value">{{ order.poNo || '—' }}</span>
            </div>
            <div class="doc-meta__item">
              <span class="doc-meta__label">订单交期:</span>
              <span class="doc-meta__value">
                <template v-if="deliveryParts.length">
                  <template v-for="(p, i) in deliveryParts" :key="i">
                    <span v-if="i > 0">、</span>
                    <b>{{ p.y }}</b>年<b>{{ p.m }}</b>月<b>{{ p.d }}</b>日
                  </template>
                </template>
                <template v-else>—</template>
              </span>
            </div>
          </div>
        </div>

        <!-- ==================== 主表格（一产品行一行） ==================== -->
        <table class="task-table">
          <!-- 客户图号可在「系统配置 → 业务字段」全局停用：col / th / td / 总计行的
               colspan **四处必须同条件**，漏一处整张表的列宽与合并就会错位。
               停用时把它的 10% 让给内容最多的「产品要求描述」列，总宽保持 100% -->
          <colgroup>
            <col style="width: 8%" />
            <col style="width: 12%" />
            <col v-if="customerDrawingNoEnabled" style="width: 10%" />
            <col :style="{ width: customerDrawingNoEnabled ? '21%' : '31%' }" />
            <col style="width: 7.5%" />
            <col style="width: 6%" />
            <col style="width: 8.5%" />
            <col style="width: 10%" />
            <col style="width: 8%" />
            <col style="width: 9%" />
          </colgroup>
          <thead>
            <tr>
              <th>产品代码</th>
              <th>部件<br />编码</th>
              <th v-if="customerDrawingNoEnabled">客户图号</th>
              <th>产品要求描述</th>
              <th>尺寸<br />(mm)</th>
              <th>颜色</th>
              <th>数量/支</th>
              <th>图号</th>
              <th>分类</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in taskRows" :key="i">
              <!-- 相邻同货号行的同值列纵向合并（分体拆行的纸质单形态），span=0 表示被上方合并 -->
              <td v-if="spans.itemNo[i]" :rowspan="spans.itemNo[i]" class="c">{{ r.itemNo || '—' }}</td>
              <td class="c">{{ r.partCode || '—' }}</td>
              <td v-if="customerDrawingNoEnabled" class="c">{{ r.customerDrawingNo || '—' }}</td>
              <td v-if="spans.requirement[i]" :rowspan="spans.requirement[i]" class="pre">{{ r.requirement || '—' }}</td>
              <td v-if="spans.dimension[i]" :rowspan="spans.dimension[i]" class="c">{{ r.dimension || '—' }}</td>
              <td v-if="spans.color[i]" :rowspan="spans.color[i]" class="c">{{ r.color || '—' }}</td>
              <td class="c num">{{ r.qtyPcs }}</td>
              <td v-if="spans.drawing[i]" :rowspan="spans.drawing[i]" class="c pre">{{ r.drawing || '—' }}</td>
              <td class="c">{{ r.category }}</td>
              <td>{{ r.remark }}</td>
            </tr>
            <tr class="total-row">
              <!-- 合并「数量」之前的所有列：停用客户图号时少一列，故 6 → 5 -->
              <td :colspan="customerDrawingNoEnabled ? 6 : 5" class="c"><b>总计</b></td>
              <td class="c num"><b>{{ totalQty }}</b></td>
              <td colspan="3"></td>
            </tr>
          </tbody>
        </table>

        <!-- 订单级一句话备注（列表可见的 remark），照纸质单加粗独立一行 -->
        <div v-if="order.remark" class="doc-remark">备注：{{ order.remark }}</div>

        <!-- ==================== 富文本正文（订单备注 otherReq：文字/图片/表格混排） ==================== -->
        <!-- wangEditor 产出、本系统内部录入，信任边界与订单表单回显一致 -->
        <div v-if="hasOtherReq" class="rich-content" v-html="order.otherReq"></div>

        <!-- ==================== 签名栏（固定结构，不来自富文本） ==================== -->
        <!--
          制单 = 订单**跟单员**（这张单业务上归谁跟，纸质单填的就是他），
          刻意不取录单账号 creatorName——录单的可能是文员代录，与单据责任人是两回事。
          业务审核 = 订单业务员，同为系统内已知的人，不必手签。
        -->
        <footer class="doc-signatures">
          <div>制单：<span class="sign-value">{{ order.merchandiser || '' }}</span></div>
          <div>业务审核：<span class="sign-value">{{ order.salesman || '' }}</span></div>
          <div>生产部审核：<span class="sign-line"></span></div>
          <div>技术部审核：<span class="sign-line"></span></div>
        </footer>
      </article>

      <el-empty v-if="!loading && !order" description="未能加载订单" />
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Printer, Download } from '@element-plus/icons-vue';
import {
  getOrderDetail,
  downloadOrderTaskPdf,
  type OrderItem,
  type OrderProductItem,
} from '@/api/order';
import { readBlobError } from '@/utils/download';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import { useFeatureStore } from '@/stores/feature';
import { COMPANY_FULL_NAME } from '@/constants/company';
import {
  formatProductTypes,
  formatDimension,
  splitParts,
  splitSuffix,
  sanitizeItemCode,
} from '@/constants/dict';
import { loadDict } from '@/composables/useDict';

/**
 * 《生产任务单》打印页（版式对照车间现行纸质单）。
 *
 * 模式沿已下线的《电镀发外加工单》打印页（git dc3083b^ outsource/print.vue）：
 * no-print 工具栏 + print-sheet + @media print 收窄页面，纸张改 A4 纵向。
 * 数据来自现有 GET /order/:id（otherReq 富文本已随详情带出）。
 * 「导出PDF」由服务端渲染本页出 PDF（见 api/order.ts downloadOrderTaskPdf）。
 *
 * ⚠️ 本页是**顶层路由、不在 Layout 下**（原因见 router/index.ts 注释），因此
 * §5.7 那条「业务字段开关由布局层统一拉取、页面不要自己请求」在这里**不适用**：
 * 新标签页打开、以及服务端 PDF 渲染时都没有 Layout，不自己拉一次的话开关会退回
 * 默认值「启用」——管理员明明停用了客户图号，导出的单据上却仍然印着。
 */

/*
 * 单据抬头固定用公司全称（不取系统配置的品牌短名），常量与理由见 constants/company.ts。
 * 2026-08-14 送货单打印页也要用它，故抽到公共常量，两张单据共用一处。
 */

/** 「客户图号」全局开关（系统配置 → 业务字段）；加载见 init() */
const { customerDrawingNoEnabled } = useFeatureFlags();
const featureStore = useFeatureStore();

const route = useRoute();
const router = useRouter();
const id = Number(route.query.id);

const loading = ref(true);
const order = ref<OrderItem | null>(null);
const surfaceDict = ref<Array<{ label: string; value: string }>>([]);
const originalTitle = document.title;

/**
 * yyyy-MM-dd → { y, m, d }（去前导零）。
 * 拆成三段而不是拼成整串：纸质单上**数字加粗、年月日汉字不加粗**，
 * 模板里要分别包 <b>，返回字符串就没法只加粗数字了。
 */
function cnDateParts(v: string | null | undefined): { y: string; m: number; d: number } | null {
  const [y, m, d] = String(v ?? '').slice(0, 10).split('-');
  if (!y || !m || !d) return null;
  return { y, m: Number(m), d: Number(d) };
}

const orderDateParts = computed(() => cnDateParts(order.value?.orderDate));

/** 订单交期 = 产品行交期去重并列（纸质单页头只有一格，多交期用「、」并排） */
const deliveryParts = computed(() => {
  const dates = [...new Set(
    (order.value?.products ?? [])
      .map((p) => (p.deliveryDate ? String(p.deliveryDate).slice(0, 10) : ''))
      .filter(Boolean),
  )];
  return dates.map(cnDateParts).filter((v): v is { y: string; m: number; d: number } => !!v);
});

const surfaceLabel = (v: string | null) => {
  if (!v || v === 'none') return '';
  return surfaceDict.value.find((o) => o.value === v)?.label ?? v;
};

interface TaskRow {
  itemNo: string;
  partCode: string;
  customerDrawingNo: string;
  requirement: string;
  dimension: string;
  color: string;
  qtyPcs: number;
  drawing: string;
  category: string;
  remark: string;
}

/** 产品行 → 任务单行 */
function toRow(p: OrderProductItem): TaskRow {
  const groupTypes = (p.partGroups ?? []).map((g) => g.groupType);
  // 图号 = 组级生产图号(+版本)按组序去重并列；纸质单上版本号另起一行
  const drawings = [...new Set(
    (p.partGroups ?? [])
      .map((g) => (g.drawingNo
        ? `${g.drawingNo}${g.drawingVersion ? `\n版本号:${g.drawingVersion}` : ''}`
        : ''))
      .filter(Boolean),
  )];
  return {
    // 存量产品代码可能夹着中文说明（「45#无锁力」），单据上只印代码部分
    itemNo: [sanitizeItemCode(p.itemNo), formatProductTypes(p.productType ?? '')].filter(Boolean).join(' '),
    partCode: [p.productName, p.materialCode].filter(Boolean).join('-'),
    customerDrawingNo: p.customerDrawingNo ?? '',
    requirement: p.productRequirement ?? '',
    dimension: formatDimension(p.dimensionRaw, p.dimensionUnit, p.dimensionMm) ?? '',
    // 纸质单「颜色」格常填的是表面处理（如封漆）：color 为空时回落表面处理中文
    color: p.color || surfaceLabel(p.surfaceType),
    qtyPcs: p.qtyPcs,
    drawing: drawings.join('\n'),
    // 分类：分体行按组构成推导形态（外中轨/内轨…），整品行标「整品」
    category: p.isSplit ? splitSuffix(splitParts(groupTypes, p.railSection)) : '整品',
    remark: p.remark ?? '',
  };
}

const taskRows = computed<TaskRow[]>(() => (order.value?.products ?? []).map(toRow));

const totalQty = computed(() => taskRows.value.reduce((s, r) => s + (r.qtyPcs || 0), 0));

/**
 * 逐列 rowspan：相邻**同货号**且该列同值的行合并成一格（分体拆行的两行共用
 * 货号/要求/尺寸/颜色/图号，纸质单即此形态）。返回值 span[i]=N 表示第 i 行
 * 起跨 N 行，0 表示被上方合并（该 td 不渲染）。
 */
function spanOf(rows: TaskRow[], pick: (r: TaskRow) => string): number[] {
  const spans = new Array<number>(rows.length).fill(0);
  let anchor = 0;
  for (let i = 0; i <= rows.length; i++) {
    const same = i > 0 && i < rows.length
      && rows[i].itemNo === rows[anchor].itemNo
      && pick(rows[i]) === pick(rows[anchor]);
    if (i === rows.length || !same) {
      if (i > anchor) spans[anchor] = i - anchor;
      anchor = i;
    }
  }
  return spans;
}

const spans = computed(() => ({
  itemNo: spanOf(taskRows.value, (r) => r.itemNo),
  requirement: spanOf(taskRows.value, (r) => r.requirement),
  dimension: spanOf(taskRows.value, (r) => r.dimension),
  color: spanOf(taskRows.value, (r) => r.color),
  drawing: spanOf(taskRows.value, (r) => r.drawing),
}));

/** wangEditor 空正文是 <p><br></p> 之类，剥标签后为空就整块不渲染 */
const hasOtherReq = computed(() => {
  const text = String(order.value?.otherReq ?? '').replace(/<[^>]+>/g, '').trim();
  const hasImg = /<img\s/i.test(String(order.value?.otherReq ?? ''));
  return !!text || hasImg;
});

async function init() {
  if (!id) {
    goBack();
    return;
  }
  loading.value = true;
  try {
    const [res, dict] = await Promise.all([
      getOrderDetail(id),
      loadDict('surface_type'),
      // 顶层路由没有 Layout 兜底，开关必须自己确保加载（见文件头注释）；
      // 已加载过则直接跳过，不重复请求
      featureStore.loaded ? Promise.resolve() : featureStore.load(),
    ]);
    order.value = res;
    surfaceDict.value = (dict as any[]).map((r) => ({ label: r.dictLabel, value: r.dictValue }));
    // 打印/另存 PDF 的默认文件名取自 document.title
    document.title = `生产任务单-${res.productionNo || res.orderNo}`;
  } finally {
    loading.value = false;
  }
}
init();

function onPrint() {
  window.print();
}

/**
 * 导出 PDF：服务端用无头浏览器渲染**这张打印页**再回传文件，点一下直接下载。
 * 不走 window.print()——那必然弹打印对话框，用户还要自己选「另存为 PDF」。
 */
const downloading = ref(false);
async function onDownloadPdf() {
  downloading.value = true;
  try {
    await downloadOrderTaskPdf(id, `生产任务单-${order.value?.productionNo || order.value?.orderNo}.pdf`);
  } catch (err) {
    ElMessage.error(await readBlobError(err));
  } finally {
    downloading.value = false;
  }
}

function goBack() {
  router.push('/order');
}

onBeforeUnmount(() => {
  document.title = originalTitle;
});
</script>

<script lang="ts">
export default { name: 'OrderPrint' };
</script>

<style scoped>
.print-preview-page {
  min-width: 100%;
  min-height: 100vh;
  background: #eef0f3;
  color: #111;
}

.preview-toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  min-height: 56px;
  padding: 0 24px;
  background: #fff;
  border-bottom: 1px solid #dcdfe6;
}
.preview-toolbar > :last-child { justify-self: end; }
.preview-toolbar > :first-child { justify-self: start; }
.preview-toolbar__title { display: flex; align-items: baseline; gap: 12px; white-space: nowrap; }
.preview-toolbar__title strong { font-size: 16px; }
.preview-toolbar__title span { color: #909399; font-size: 12px; }

.sheet-stage {
  box-sizing: border-box;
  min-height: calc(100vh - 57px);
  padding: 24px;
  overflow: auto;
}

/*
 * A4 纵向；高度不固定——富文本长度不定，流式排版由浏览器自动分页。
 * flex 列布局 + 签名栏 margin-top:auto：内容不满一页时签名栏被推到页面底部
 * （对照纸质单）；内容跨页时签名栏自然跟在正文之后。
 *
 * ⚠️ **屏幕纸面必须与打印纸面等高，否则预览是骗人的**：这里 297mm(A4) − 上下
 * 内边距 7mm×2 = 内容区 283mm，与打印时的 `min-height: 283mm`（padding 归 0、
 * 由 @page margin 接管）完全一致，签名栏在两种媒体下落点相同。
 * 改任一处都要同步另一处——先前屏幕 292mm/padding 8mm（内容区 276mm）比打印矮
 * 7mm，预览里的签名栏就比实际打印低了约一行（2026-08-13 用户实测报出）。
 */
.print-sheet {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto 16px;
  padding: 7mm 5mm;
  background: #fff;
  box-shadow: 0 3px 18px rgb(0 0 0 / 14%);
  color: #111;
  /*
   * 字体栈必须**跨平台**：前段是 Windows/macOS 的宋体（用户在浏览器里打印时用），
   * 后段是 Linux 的中文字体——服务端 PDF 由无头 Chrome 渲染，那台机器上没有 SimSun，
   * 缺了 Linux 回落项会让**整张单据的中文全变成豆腐块**（2026-08-13 线上实测踩到）。
   * 服务器需装 fonts-noto-cjk（部署脚本已自动装）。
   */
  font-family: SimSun, 'Songti SC', 'Noto Serif CJK SC', 'Noto Sans CJK SC',
    'WenQuanYi Zen Hei', 'Microsoft YaHei', serif;
  font-size: 12px;
  line-height: 1.5;
}

/* ===== 页头 ===== */
.doc-heading { text-align: center; }
.doc-heading h1 { margin: 0; font-size: 21px; font-weight: 700; letter-spacing: 2px; }
.doc-heading h2 { margin: 2mm 0 0; font-size: 17px; font-weight: 700; letter-spacing: 6px; }

.doc-meta { margin-top: 4mm; }
.doc-meta__row { display: flex; justify-content: space-between; margin-bottom: 1.5mm; }
.doc-meta__item { display: flex; align-items: center; gap: 8px; }
.doc-meta__label { font-weight: 700; }
.doc-meta__value { min-width: 32mm; }

/* ===== 主表格 ===== */
/*
 * 等宽字体：数字/字母按 Consolas 等宽排列，中文回落宋体（标题区不受影响）。
 * 同样要带 Linux 中文回落项，否则服务端渲染的 PDF 里表格中文全是豆腐块。
 */
.task-table {
  width: 100%;
  margin-top: 2.5mm;
  border-collapse: collapse;
  table-layout: fixed;
  font-family: Consolas, 'Courier New', 'Noto Sans Mono CJK SC', SimSun,
    'Noto Serif CJK SC', 'WenQuanYi Zen Hei', monospace;
}
.task-table th,
.task-table td {
  border: 1px solid #333;
  padding: 1.2mm 1.5mm;
  vertical-align: middle;
  word-break: break-all;
}
.task-table th { font-weight: 700; text-align: center; }
.task-table .c { text-align: center; }
.task-table .num { font-weight: 700; }
/* 产品要求描述/图号是多行文本，保留换行 */
.task-table .pre { white-space: pre-wrap; }
.total-row td { font-size: 13px; }

.doc-remark {
  margin: 2.5mm 0;
  font-size: 14px;
  font-weight: 700;
  text-decoration: underline;
}

/* ===== 富文本正文（wangEditor 产出 HTML） ===== */
.rich-content { margin-top: 2mm; }
.rich-content :deep(p) { margin: 1mm 0; }
.rich-content :deep(img) { max-width: 100%; height: auto; }
.rich-content :deep(table) {
  max-width: 100%;
  border-collapse: collapse;
  margin: 2mm 0;
}
.rich-content :deep(table td),
.rich-content :deep(table th) {
  border: 1px solid #333;
  padding: 1.2mm 1.5mm;
  word-break: break-all;
}
/* 打印分页时表格行、图片尽量不被拦腰截断 */
.rich-content :deep(tr),
.rich-content :deep(img) { break-inside: avoid; }

/* ===== 签名栏（margin-top:auto 把它顶到页面底部，见 .print-sheet 的 flex 说明） ===== */
/* 四项整体水平居中：用 center + 固定间距，而不是 space-between 顶到两端 */
.doc-signatures {
  display: flex;
  justify-content: center;
  gap: 14mm;
  margin-top: auto;
  padding-top: 8mm;
  break-inside: avoid;
}
.sign-value { display: inline-block; min-width: 22mm; }
.sign-line { display: inline-block; min-width: 22mm; border-bottom: 1px solid transparent; }

/* ===== 打印 ===== */
@media print {
  :global(html),
  :global(body),
  :global(#app) {
    width: 210mm !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }

  /* 页边距与屏幕纸面的 padding 保持一致（见 .print-sheet 注释），
     打印机不可打印区通常 ≥5mm，再小会被截 */
  @page { size: A4 portrait; margin: 7mm 5mm; }

  .print-preview-page,
  .sheet-stage {
    width: auto;
    min-height: 0;
    margin: 0;
    padding: 0;
    background: #fff;
  }

  .no-print { display: none !important; }

  .print-sheet {
    width: auto;
    /*
     * 撑满一页让签名栏贴底：A4 297mm − 上下页边距 7mm×2 = 283mm 可用高度，
     * 与屏幕纸面的内容区严格相等（见 .print-sheet 注释）。
     * 别再往上加——设成正好等于可用高度时，任何一点渲染舍入都会溢出成第二页空白（已实测）。
     */
    min-height: 283mm;
    margin: 0;
    padding: 0;
    box-shadow: none;
    print-color-adjust: exact;
  }

  .task-table tr { break-inside: avoid; }
}
</style>
