<template>
  <div />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

onMounted(() => {
  // 从 /redirect/<path> 跳回原路径，强制重新挂载组件
  const target = '/' + (route.params.path as string);
  router.replace(target);
});
</script>
