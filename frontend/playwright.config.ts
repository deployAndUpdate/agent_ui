import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'npm run start -w backend',
      url: 'http://127.0.0.1:3001/health',
      reuseExistingServer: !process.env.CI,
      cwd: '..',
      env: {
        ...process.env,
        PORT: '3001',
        AUTH_ENABLED: 'false',
      },
    },
    {
      command: 'npm run dev -w frontend -- --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      cwd: '..',
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
