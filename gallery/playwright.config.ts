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
    {name: 'webkit-standalone-editors', testMatch: /standalone_editors\.spec\.ts/, use: {browserName: 'webkit'}},
    {name: 'webkit-subagents', testMatch: /subagent_ui\.spec\.ts/, use: {browserName: 'webkit'}},
    {name: 'webkit-pdf-refresh', testMatch: /latex_pdf_refresh\.spec\.ts/, use: {browserName: 'webkit'}},
    {name: 'webkit-chat-notice', testMatch: /chat_notice\.spec\.ts/, use: {browserName: 'webkit'}},
    {name: 'webkit-markdown-selection', testMatch: /markdown_selection\.spec\.ts/, use: {browserName: 'webkit'}},
    {name: 'webkit-reading-chat', testMatch: /reading_chat_overlay\.spec\.ts/, use: {browserName: 'webkit'}},
    {name: 'webkit-annotations', testMatch: /figure_(annotations|versions)\.spec\.ts/, use: {browserName: 'webkit'}},
    {name: 'webkit-review', testMatch: /editor_cm6\.spec\.ts/, grep: /latex individual review/, use: {browserName: 'webkit'}},
    {name: 'webkit-toolbar', testMatch: /editor_cm6\.spec\.ts/, grep: /latex toolbar/, use: {browserName: 'webkit'}},
    {name: 'webkit-fluid', testMatch: /editor_cm6\.spec\.ts/, grep: /latex fluid text/, use: {browserName: 'webkit'}},
    {name: 'chromium', use: {browserName: 'chromium'}},
    {
      name: 'webkit-scroll',
      testMatch: /editor_cm6_scroll\.spec\.ts/,
      use: {browserName: 'webkit'},
    },
    {
      name: 'webkit-reading',
      testMatch: /pdf_(reading|toolbar|performance|interaction)\.spec\.ts/,
      use: {browserName: 'webkit'},
    },
    {
      name: 'webkit-lezer',
      testMatch: /latex_lezer\.spec\.ts/,
      use: {browserName: 'webkit'},
    },
    {
      name: 'webkit-rewrap',
      testMatch: /editor_cm6\.spec\.ts/,
      grep: /latex auto rewrap/,
      use: {browserName: 'webkit'},
    },
    {
      // L'app tourne dans un WKWebView : c'est là que la sélection fantôme
      // d'après rechargement agent se voit, Chromium seul ne suffit pas.
      name: 'webkit-selection',
      testMatch: /editor_cm6\.spec\.ts/,
      grep: /rechargement agent/,
      use: {browserName: 'webkit'},
    },
  ],
});
