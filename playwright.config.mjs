import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3402', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run start', url: 'http://127.0.0.1:3402/api/health', timeout: 60_000, reuseExistingServer: !process.env.CI },
});
