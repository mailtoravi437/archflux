const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 2,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    testIdAttribute: 'data-testid',
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  expect: {
    timeout: 10000,
    // Visual regression thresholds: headless canvas rasterization (icon
    // paints, text AA) leaves ~1% of pixels nondeterministic run-to-run;
    // 12000px (~1.6% of a 1280x672 canvas) absorbs that while still catching
    // real regressions (broken layouts, missing panels, theme breakage all
    // shift 10%+ of pixels). DOM screenshots are unaffected and stay precise.
    toHaveScreenshot: {
      maxDiffPixels: 12000,
      threshold: 0.2,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
      testIgnore: /critical-journeys/,
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
      testIgnore: /critical-journeys/,
    },
    {
      name: 'mobile-smoke',
      use: { ...devices['Pixel 5'] },
      testMatch: /smoke/,
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
