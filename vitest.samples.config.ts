import { defineConfig } from 'vitest/config';

// Replays samples/ against ground truth (docs/ARCHITECTURE.md §9 gate 3).
// The harness and the first samples land in M0 task 0.6; until then there is nothing to replay.
export default defineConfig({
  test: {
    name: 'samples',
    include: ['samples/**/*.samples.test.ts', 'scripts/samples/**/*.test.ts'],
    passWithNoTests: true,
  },
});
