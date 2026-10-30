import { readdirSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const packages = readdirSync(new URL('./packages', import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

export default defineConfig({
  test: {
    projects: [
      ...packages.map((name) => ({
        test: { name, root: `packages/${name}`, include: ['src/**/*.test.ts'], environment: 'node' },
      })),
      {
        test: {
          name: 'web',
          root: 'apps/web',
          include: ['src/**/*.test.{ts,tsx}', 'config/**/*.test.ts'],
          environment: 'jsdom',
          setupFiles: ['src/test/setup.ts'],
          // user-event drives the whole app in jsdom; a long form test takes ~3 s alone and more on a busy runner.
          testTimeout: 15_000,
        },
      },
      {
        test: {
          name: 'scripts',
          root: 'scripts',
          include: ['**/*.test.ts'],
          // The samples replay is `pnpm test:samples` (vitest.samples.config.ts).
          exclude: ['**/*.samples.test.ts', '**/node_modules/**'],
        },
      },
    ],
  },
});
