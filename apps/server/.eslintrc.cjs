/**
 * 后端 ESLint 配置（NestJS + TypeScript）。
 * 规则基调：存量代码从未跑过 lint，从宽松基线起步——
 * recommended 规则集 + 少量与项目现状冲突的规则降级/关闭，
 * 保证 `pnpm lint` 可作为 CI 门禁（错误=阻断，警告=提示）。
 */
module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', 'node_modules', 'uploads'],
  rules: {
    // 项目现状大量使用 any（TypeORM 原生查询返回等），不作为错误
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-var-requires': 'off',
    // 装饰器元数据场景常见空构造函数
    '@typescript-eslint/no-empty-function': 'off',
  },
};
