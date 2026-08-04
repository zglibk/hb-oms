/**
 * 前端 ESLint 配置（Vue 3 + TypeScript）。
 * 规则基调：存量代码从未跑过 lint，从宽松基线起步——
 * vue3-essential（仅捕获真实错误，不管格式）+ ts recommended。
 */
module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true },
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    sourceType: 'module',
    ecmaVersion: 2022,
    extraFileExtensions: ['.vue'],
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:vue/vue3-essential',
  ],
  ignorePatterns: ['dist', 'node_modules'],
  rules: {
    // 页面组件统一命名 index.vue（路由由后端菜单驱动），多词组件名规则不适用
    'vue/multi-word-component-names': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
  overrides: [
    {
      files: ['*.vue'],
      rules: {
        // .vue 内 TS 类型标注由 vue-tsc 把关，no-undef 对 SFC 误报
        'no-undef': 'off',
        // 大屏等页面在 HTML 文本中刻意使用全角空格（U+3000）排版：
        // 用 vue 版规则放行 HTML 文本，脚本区仍然检查
        'no-irregular-whitespace': 'off',
        'vue/no-irregular-whitespace': ['error', { skipHTMLTextContents: true }],
      },
    },
    {
      files: ['*.d.ts'],
      rules: {
        // Vite 官方 vue shim 使用 DefineComponent<{}, {}, any>，属标准写法
        '@typescript-eslint/ban-types': 'off',
      },
    },
  ],
};
