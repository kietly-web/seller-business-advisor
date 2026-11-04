import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';

export default defineConfig(
  { ignores: ['**/node_modules/**', '**/.next/**', '**/coverage/**', '**/next-env.d.ts', '.claude/**', 'packages/db/migrations/**'] },
  tseslint.configs.strict,
  {
    ...nextPlugin.configs['core-web-vitals'],
    files: ['apps/web/**/*.{ts,tsx}'],
    settings: { next: { rootDir: 'apps/web' } },
  },
  {
    // ADR-001: engine, parsers and shared must stay free of I/O and app-layer packages
    files: ['packages/{engine,parsers,shared}/src/**/*.ts'],
    ignores: ['packages/parsers/src/node.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@sa/db', '@sa/llm', '@sa/web'], message: 'Pure packages must not depend on I/O packages (ADR-001).' },
            { group: ['node:*', 'next', 'next/*', 'react', 'react/*'], message: 'Pure packages must not import runtime-specific modules (ADR-001).' },
          ],
        },
      ],
    },
  },
);
