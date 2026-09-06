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
      // SPIKE pdf.js 6.x : l'app tourne dans un WKWebView.
      name: 'pdfjs-spike-webkit',
      testMatch: /pdfjs_spike.*\.spec\.js/,
      use: {browserName: 'webkit'},
    },
    {
      name: 'webkit-scroll',
      testMatch: /editor_cm6_scroll\.spec\.js/,
      use: {browserName: 'webkit'},
    },
    {
      name: 'webkit-lezer',
      testMatch: /latex_lezer\.spec\.js/,
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
