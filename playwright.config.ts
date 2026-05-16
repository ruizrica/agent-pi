import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['json', { outputFile: './test-results.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || process.env.API_BASE_URL || 'http://localhost:3000',
    extraHTTPHeaders: {
      'Accept': 'application/json',
    },
  },
});
