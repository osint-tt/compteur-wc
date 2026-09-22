import { defineConfig } from '@playwright/test';

const PORT = 5173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Émulation téléphone : 390 x 844, tactile, français, fuseau Europe/Paris.
const phone = {
  baseURL: BASE_URL,
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  // 1 suffit pour les tests : le WebKit de Playwright sous Windows finit par
  // planter (allocation Skia) quand plusieurs contextes en 2x tournent en même temps.
  deviceScaleFactor: 1,
  locale: 'fr-FR',
  timezoneId: 'Europe/Paris',
};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 4,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...phone, browserName: 'chromium' } },
    { name: 'webkit', use: { ...phone, browserName: 'webkit' } },
  ],
  webServer: {
    command: 'node tests/server.mjs',
    url: `${BASE_URL}/index.html`,
    reuseExistingServer: true,
    timeout: 20_000,
  },
});
