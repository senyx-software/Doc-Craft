import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '/services':    resolve(__dirname, 'src/services'),
      '/controllers': resolve(__dirname, 'src/controllers'),
      '/queues':      resolve(__dirname, 'src/queues'),
      '/db':          resolve(__dirname, 'src/db'),
      '/config':      resolve(__dirname, 'src/config'),
      '/middleware':  resolve(__dirname, 'src/middleware'),
    },
    extensions: ['.ts', '.js'],
  },
  test: {
    globals:     true,
    environment: 'node',
    include:     ['src/__tests__/**/*.test.ts'],
    setupFiles:  ['src/__tests__/test.setup.ts'],
    isolate:     true,
    coverage: {
      provider: 'v8',
      include:  ['src/**/*.ts'],
      exclude:  ['src/generated/**', 'src/__tests__/**', 'src/swagger.ts'],
    },
  },
});

