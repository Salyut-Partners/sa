import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The core is the one tested seam: pure functions, no DOM, no network.
    include: ['src/core/**/*.test.ts'],
    environment: 'node',
  },
});
