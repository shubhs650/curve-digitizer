import { defineConfig, devices } from '@playwright/test';

const port = 4173;

export default defineConfig({
  testDir: 'apps/web/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${String(port)}`,
    trace: 'retain-on-failure',
  },
  // R4: current Chrome/Edge (Chromium), Firefox and Safari (WebKit).
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    // e2e runs against the production bundle so offline/PWA behaviour matches what ships.
    command: 'pnpm --filter @cd/web build && pnpm --filter @cd/web preview',
    url: `http://localhost:${String(port)}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
