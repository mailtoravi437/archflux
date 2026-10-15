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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/tests/',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/**/*.d.ts',
        '*.config.ts',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
});