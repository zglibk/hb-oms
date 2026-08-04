<template>
  <el-card>
    <el-empty :description="`「${title}」页面建设中（任务9 前端业务页面）`" />
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const title = computed(() => (route.meta.title as string) || '页面');
</script>
