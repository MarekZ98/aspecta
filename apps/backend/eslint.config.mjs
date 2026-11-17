import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Nest modules are empty classes that only carry the @Module decorator.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      // Nest declares plain option objects (for example NestApplicationOptions) as classes.
      '@typescript-eslint/no-unsafe-class-instance-assignment': 'off',
    },
  },
  {
    files: ['eslint.config.mjs', 'vitest.config.mts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
