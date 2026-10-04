import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setup: './src/tests/setup.ts',
    cache: 'loose',
    include: ['src/tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['src/**/__tests__/*', 'src/**/.test.*'],
    transform: {
      '^.+\\.(c|m)?[jt]sx?$': 'vitest',
    },
  },
});