import { defineConfig } from 'vitest/config';

// Replays samples/ against ground truth (docs/ARCHITECTURE.md §9 gate 3). The harness lives in scripts/samples/;
// its own unit tests run in `pnpm test`, this config runs only the replay over the real samples.
export default defineConfig({
  test: {
    name: 'samples',
    include: ['scripts/samples/**/*.samples.test.ts'],
    testTimeout: 120_000,
  },
});
