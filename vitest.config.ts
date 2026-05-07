import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    restoreMocks: true,
    testTimeout: 30_000,
    unstubEnvs: true,
    unstubGlobals: true,
    projects: [
      {
        test: {
          name: 'local-lambda',
          environment: 'node',
          include: ['tests/integration/local/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'deployed',
          environment: 'node',
          include: ['tests/integration/deployed/**/*.test.ts'],
        },
      },
    ],
  },
});
