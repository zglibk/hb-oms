<template>
  <div class="page announcement-detail" v-loading="loading">
    <el-card v-if="detail" shadow="never">
      <template #header>
        <div class="detail-head">
          <el-button link type="primary" :icon="ArrowLeft" @click="router.back()">返回</el-button>
          <span class="detail-head__status">
            <el-tag v-if="detail.requiresReply" type="warning" effect="plain">要求回复</el-tag>
            <el-tag v-if="detail.isUnread" type="danger" effect="dark" round>New</el-tag>
          </span>
        </div>
      </template>

      <article class="notice-body">
        <div class="notice-body__eyebrow"><AnnouncementLevel :level="detail.level" /></div>
        <h1>{{ detail.title }}</h1>
        <p class="notice-body__summary">{{ detail.summary }}</p>
        <div class="notice-body__meta">
          <span>发布人：{{ detail.creatorName || '—' }}</span>
          <span>发布时间：{{ formatDateTime(detail.publishAt) }}</span>
          <span>失效时间：{{ detail.expireAt ? formatDateTime(detail.expireAt) : '永久有效' }}</span>
        </div>
        <pre class="notice-body__content">{{ detail.content }}</pre>
      </article>
    </el-card>

    <el-card v-if="detail?.requiresReply" shadow="never" class="reply-card">
      <template #header>
        <div class="section-head">
          <b>回复记录</b>
          <el-button
            v-if="detail.canManage"
            v-permission="'announcement:export'"
            type="primary"
            plain
            :icon="Download"
            :loading="exporting"
            @click="onExport"
          >导出回复</el-button>
        </div>
      </template>

      <div v-loading="repliesLoading" class="reply-section">
        <div v-if="replies.length" class="reply-list">
          <div v-for="reply in replies" :key="reply.id" class="reply-row">
            <div class="reply-row__head">
              <b>{{ reply.realName }}</b>
              <span>@{{ reply.username }}</span>
              <span v-if="reply.deptName">{{ reply.deptName }}</span>
              <span v-if="reply.roleNames">{{ reply.roleNames }}</span>
              <el-tag size="small" :type="reply.scope === 'private' ? 'info' : 'success'">
                {{ reply.scope === 'private' ? '非公开' : '公开' }}
              </el-tag>
              <time>{{ formatDateTime(reply.createdAt) }}</time>
            </div>
            <div class="reply-row__content">{{ reply.content }}</div>
          </div>
        </div>
        <el-empty v-else description="暂无回复" :image-size="72" />
        <app-pagination
          v-if="replyTotal > replyPageSize"
          :total="replyTotal"
          v-model:page="replyPage"
          v-model:size="replyPageSize"
          :page-sizes="[10, 20, 50, 100]"
          @change="loadReplies"
        />
      </div>

      <el-form v-if="detail.canReply" label-position="top" class="reply-form">
        <el-form-item label="追加回复">
          <el-input
            v-model="replyForm.content"
            type="textarea"
            :rows="4"
            maxlength="5000"
            show-word-limit
            placeholder="回复提交后不可修改或删除，请确认内容无误"
          />
        </el-form-item>
        <div class="reply-form__actions">
          <el-radio-group v-model="replyForm.scope">
            <el-radio value="public">公开（所有接收人可见）</el-radio>
            <el-radio value="private">非公开（仅本人和通告管理员可见）</el-radio>
          </el-radio-group>
          <el-button type="primary" :loading="submitting" @click="submitReply">提交回复</el-button>
        </div>
      </el-form>
      <el-alert
        v-else
        class="reply-unavailable"
        type="info"
        :closable="false"
        show-icon
        :title="replyUnavailableText"
      />
    </el-card>

    <el-card v-if="detail?.canManage && !detail.requiresReply" shadow="never">
      <template #header><b>查看记录</b></template>
      <app-table :data="viewRecords" border stripe>
        <el-table-column prop="username" label="查看账号" min-width="110" />
        <el-table-column prop="realName" label="查看人员" min-width="110" />
        <el-table-column prop="deptName" label="部门" min-width="120" show-overflow-tooltip />
        <el-table-column prop="roleNames" label="角色" min-width="160" show-overflow-tooltip />
        <el-table-column label="查看时间" width="168">
          <template #default="{ row }">{{ formatDateTime(row.viewedAt) }}</template>
        </el-table-column>
      </app-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Download } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import {
  createAnnouncementReply,
  downloadAnnouncementReplies,
  getAnnouncementDetail,
  getAnnouncementReplies,
  getAnnouncementReplyExportCount,
  getAnnouncementViewRecords,
  markAnnouncementViewed,
  type AnnouncementItem,
  type AnnouncementReply,
  type AnnouncementViewRecord,
} from '@/api/announcement';
import { useAnnouncementStore } from '@/stores/announcement';
import { useExcelExport } from '@/composables/useExcelExport';
import { formatDateTime } from '@/utils/date';
import AnnouncementLevel from '@/components/announcement/AnnouncementLevel.vue';

const route = useRoute();
const router = useRouter();
const store = useAnnouncementStore();
const loading = ref(false);
const detail = ref<AnnouncementItem | null>(null);
const replies = ref<AnnouncementReply[]>([]);
const repliesLoading = ref(false);
const replyPage = ref(1);
const replyPageSize = ref(20);
const replyTotal = ref(0);
const viewRecords = ref<AnnouncementViewRecord[]>([]);
const submitting = ref(false);
const replyForm = reactive({ scope: 'public', content: '' });
const { exporting, exportWithConfirm } = useExcelExport();
const replyUnavailableText = computed(() => {
  if (detail.value?.status === 'withdrawn') return '该通告已撤回，不能继续回复';
  if (!detail.value?.activatedAt) return '该通告尚未生效，当前不能回复';
  return '当前账号不在该通告的接收范围内，不能回复';
});

async function loadReplies() {
  const id = Number(route.params.id);
  if (!id) return;
  repliesLoading.value = true;
  try {
    const result = await getAnnouncementReplies(id, {
      page: replyPage.value,
      pageSize: replyPageSize.value,
    });
    replies.value = result.list;
    replyTotal.value = result.total;
  } finally {
    repliesLoading.value = false;
  }
}

async function load() {
  const id = Number(route.params.id);
  if (!id) return;
  loading.value = true;
  try {
    detail.value = await getAnnouncementDetail(id);
    if (detail.value.status === 'published' && detail.value.activatedAt) {
      await markAnnouncementViewed(id);
    }
    if (detail.value.requiresReply) {
      await loadReplies();
    } else if (detail.value.canManage) {
      viewRecords.value = await getAnnouncementViewRecords(id);
    }
    await store.refresh();
    detail.value = await getAnnouncementDetail(id);
  } finally {
    loading.value = false;
  }
}

async function submitReply() {
  const content = replyForm.content.trim();
  if (!content) {
    ElMessage.warning('请输入回复内容');
    return;
  }
  submitting.value = true;
  try {
    await createAnnouncementReply(Number(route.params.id), { scope: replyForm.scope, content });
    replyForm.content = '';
    ElMessage.success('回复已提交，提交后不可修改或删除');
    replyPage.value = 1;
    await load();
  } finally {
    submitting.value = false;
  }
}

function onExport() {
  const id = Number(route.params.id);
  void exportWithConfirm({
    name: '通知公告回复',
    getCount: () => getAnnouncementReplyExportCount(id),
    scopeText: (count) => `导出当前公告的 <b>${count}</b> 条回复记录`,
    run: () => downloadAnnouncementReplies(id),
  });
}

onMounted(load);
watch(() => route.params.id, () => {
  replyPage.value = 1;
  replies.value = [];
  replyTotal.value = 0;
  void load();
});
</script>

<style scoped lang="scss">
.announcement-detail { max-width: 1080px; margin: 0 auto; }
.detail-head, .section-head { display: flex; align-items: center; justify-content: space-between; }
.detail-head__status { display: flex; gap: 8px; }
.notice-body { max-width: 850px; margin: 0 auto; padding: 16px 20px 28px; }
.notice-body__eyebrow { margin-bottom: 8px; text-align: center; }
.notice-body h1 { margin: 0; color: var(--el-text-color-primary); font-size: 25px; text-align: center; }
.notice-body__summary { margin: 14px 0; color: var(--el-text-color-secondary); font-size: 15px; text-align: center; }
.notice-body__meta { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 24px; padding-bottom: 16px; border-bottom: 1px solid var(--el-border-color-lighter); color: var(--el-text-color-placeholder); font-size: 12px; }
.notice-body__content { margin: 24px 0 0; font: inherit; line-height: 1.85; white-space: pre-wrap; word-break: break-word; }
.reply-card { margin-top: 0; }
.reply-section { min-height: 90px; }
.reply-list { display: flex; flex-direction: column; gap: 12px; }
.reply-row { padding: 12px 14px; border-radius: 6px; background: var(--el-fill-color-lighter); }
.reply-row__head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; color: var(--el-text-color-secondary); font-size: 12px; }
.reply-row__head b { color: var(--el-text-color-primary); font-size: 14px; }
.reply-row__head time { margin-left: auto; }
.reply-row__content { margin-top: 8px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
.reply-form { margin-top: 20px; padding-top: 18px; border-top: 1px dashed var(--el-border-color); }
.reply-unavailable { margin-top: 20px; }
.reply-form__actions { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
@media (max-width: 768px) {
  .notice-body { padding: 8px 2px 18px; }
  .reply-form__actions { align-items: flex-start; flex-direction: column; }
  .reply-row__head time { width: 100%; margin-left: 0; }
}
</style>
