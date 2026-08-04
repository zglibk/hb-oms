import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// 文档 1.8.5 节：Vite 开发代理 + 后端 CORS 双保险
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true, // 监听 0.0.0.0，允许局域网通过本机 IP 访问
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:8100',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:8100',
        changeOrigin: true,
      },
    },
  },
});
