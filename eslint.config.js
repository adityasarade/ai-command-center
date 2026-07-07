import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

const baseRules = {
  ...js.configs.recommended.rules,
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
  ],
  'no-control-regex': 'off',
};

export default [
  {
    ignores: [
      '**/node_modules/**',
      'site/.next/**',
      'site/out/**',
      '**/.vercel/**',
      'packages/gateway/public/vendor/**',
      'assets/**',
      'site/public/**',
    ],
  },

  // Gateway (Node ESM): src, bin, tests, evals, examples, sdk-js
  {
    files: [
      'packages/gateway/src/**/*.js',
      'packages/gateway/bin/**/*.js',
      'packages/gateway/test/**/*.js',
      'evals/**/*.js',
      'examples/**/*.{js,mjs}',
      'packages/sdk-js/**/*.{js,mjs,cjs}',
      'eslint.config.js',
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, performance: 'readonly' },
    },
    rules: baseRules,
  },

  // Browser dashboard
  {
    files: ['packages/gateway/public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...globals.browser, Chart: 'readonly' },
    },
    rules: baseRules,
  },

  // Next.js site (React, browser + node)
  {
    files: ['site/**/*.js'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, React: 'readonly' },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...baseRules,
      ...react.configs.flat.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  prettier,
];
