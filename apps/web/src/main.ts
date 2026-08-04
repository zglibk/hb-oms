import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus, { ElDialog } from 'element-plus';
import 'element-plus/dist/index.css';
import 'flag-icons/css/flag-icons.min.css';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import App from './App.vue';
import router from './router';
import { setupDirectives } from './directives/permission';
import { useThemeStore } from './stores/theme';
import AppTable from './components/AppTable.vue';
import AppPagination from './components/AppPagination.vue';
import AppActions from './components/AppActions.vue';
import './styles/index.scss';
import './styles/responsive.scss';
import { applyCachedTitle } from './utils/document-meta';

// 尽早同步应用缓存的系统名称到标签标题，消除硬编码标题到动态标题的跳变
applyCachedTitle();

/* 全局默认禁用「点击遮罩层关闭对话框」：
 * 避免用户误点遮罩导致表单数据丢失；个别场景需开启可在模板上显式覆盖 */
(ElDialog as any).props.closeOnClickModal.default = false;

const app = createApp(App);

// 全量注册 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component as any);
}

// 全局列表封装（首列序号 + 手风琴展开）与统一分页器
app.component('AppTable', AppTable);
app.component('AppPagination', AppPagination);
app.component('AppActions', AppActions);
// 全局甘特图组件（基于 dhtmlxGantt 二次封装，多处可调用）

app.use(createPinia());
app.use(router);
app.use(ElementPlus, { locale: zhCn });
setupDirectives(app);

// 应用启动时还原持久化的主题色
useThemeStore().initTheme();

app.mount('#app');
