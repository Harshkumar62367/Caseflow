import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3403', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3403',
    url: 'http://127.0.0.1:3403/api/health',
    timeout: 60_000,
    reuseExistingServer: false,
    env: { CASEFLOW_DATA_FILE: resolve('.caseflow/e2e.sqlite'), BENCHMARK_VARIANT: 'baseline', UI_COPY_VARIANT: 'original' },
  },
});
