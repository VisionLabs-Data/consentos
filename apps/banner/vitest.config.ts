import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'src/__tests__/**/*.test.ts',
      '../../ee/banner/__tests__/**/*.test.ts',
    ],
  },
  server: {
    fs: {
      allow: ['.', path.resolve(__dirname, '../../ee/banner')],
    },
  },
});
