import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  reporter: [['list']],
  use: {trace: 'retain-on-failure'},
  projects: [
    {name: 'chromium', use: {browserName: 'chromium'}},
    {
      name: 'webkit-scroll',
      testMatch: /editor_cm6_scroll\.spec\.js/,
      use: {browserName: 'webkit'},
    },
    {
      name: 'webkit-rewrap',
      testMatch: /editor_cm6\.spec\.js/,
      grep: /latex auto rewrap/,
      use: {browserName: 'webkit'},
    },
    {
      // L'app tourne dans un WKWebView : c'est là que la sélection fantôme
      // d'après rechargement agent se voit, Chromium seul ne suffit pas.
      name: 'webkit-selection',
      testMatch: /editor_cm6\.spec\.js/,
      grep: /rechargement agent/,
      use: {browserName: 'webkit'},
    },
  ],
});
