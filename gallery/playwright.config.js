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
    {name: 'webkit-chat-notice', testMatch: /chat_notice\.spec\.js/, use: {browserName: 'webkit'}},
    {name: 'webkit-markdown-selection', testMatch: /markdown_selection\.spec\.js/, use: {browserName: 'webkit'}},
    {name: 'webkit-reading-chat', testMatch: /reading_chat_overlay\.spec\.js/, use: {browserName: 'webkit'}},
    {name: 'webkit-annotations', testMatch: /figure_(annotations|versions)\.spec\.js/, use: {browserName: 'webkit'}},
    {name: 'webkit-review', testMatch: /editor_cm6\.spec\.js/, grep: /latex individual review/, use: {browserName: 'webkit'}},
    {name: 'webkit-toolbar', testMatch: /editor_cm6\.spec\.js/, grep: /latex toolbar/, use: {browserName: 'webkit'}},
    {name: 'webkit-fluid', testMatch: /editor_cm6\.spec\.js/, grep: /latex fluid text/, use: {browserName: 'webkit'}},
    {name: 'chromium', use: {browserName: 'chromium'}},
    {
      name: 'webkit-scroll',
      testMatch: /editor_cm6_scroll\.spec\.js/,
      use: {browserName: 'webkit'},
    },
    {
      name: 'webkit-reading',
      testMatch: /pdf_(reading|toolbar)\.spec\.js/,
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
