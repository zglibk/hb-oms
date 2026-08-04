import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// Vite 开发代理 + 后端 CORS 双保险；
// 生产部署在主站 /oms/admin/ 子路径（Nginx alias），故 build 时设置 base，
// 路由 history 与静态资源引用随 BASE_URL 自动生效
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/oms/admin/' : '/',
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
}));
