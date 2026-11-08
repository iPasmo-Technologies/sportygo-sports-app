import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Only source tests; never pick up compiled copies in dist/.
    include: ['src/**/*.test.ts'],
  },
});
