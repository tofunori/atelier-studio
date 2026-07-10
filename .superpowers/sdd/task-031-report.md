# Plan 031 execution report

## Result

Implementation complete in commit `c41246dc05c0710f95e4b1f728b8ddcc5645e18b`.

The three editor surfaces now create editors through
`window.AtelierEditorFactory`. CM6 is the default, while a valid
`?engine=cm5` query or `localStorage.studioEngine = "cm5"` preserves the CM5
fallback. The active engine is exposed through `window.__ENGINE`,
`document.documentElement.dataset.editorEngine`, and a diagnostic console log.

## Files changed

- `gallery/assets/editor_factory.js`: shared engine resolution and creation seam.
- `gallery/assets/cm6/studio_editor.mjs`: extension routing, Python indentation,
  initial read-only support.
- `gallery/assets/cm6/studio_cm6.bundle.js`: deterministic rebuilt bundle.
- `gallery/assets/code_editor.html`: shared factory, CM6 styling/default, CM5 fallback.
- `gallery/assets/md_viewer.html`: shared factory for Edit/Split, CM6 styling/default,
  CM5 fallback; no timeline added.
- `gallery/assets/latex_studio.html`: shared factory and CM6 default while retaining
  all existing CM5 options and behavior paths.
- `gallery/server/tests/studio_editor_contract.test.mjs`: factory and language
  routing contracts.
- `gallery/tests/e2e/editor_cm6.spec.js`: the five exact plan 031 scenarios.
- `gallery/tests/e2e/diff.spec.js`: engine-aware helpers; code dirty/merge/conflict
  scenarios now exercise the CM6 default.

No server route, visual redesign, or direct `src-tauri/gallery-dist` edit was made.

## Decisions

- Resolution precedence is valid query engine, valid stored engine, then the
  page-provided default. Invalid values are ignored.
- CM5 remains loaded and usable on every surface during the observation period.
- Unknown extensions use plain text rather than throwing.
- LaTeX-specific CM5 options and ghost behavior remain behind the common seam.
- `md_viewer` retains Preview/Split/Edit and does not gain `DiffVersions`.
- `plans/031-execution-notes.md` was not created: the plan assigns live evidence
  capture to the reviewer after the app build.

## Verification

- `npm --prefix gallery ci`: exit 0; 32 packages installed, 0 vulnerabilities.
- `npm --prefix gallery run build:cm6`: exit 0; both CM6 bundles rebuilt.
- `node --test gallery/server/tests/studio_editor_contract.test.mjs`: 7/7 passed.
- `python3 -m unittest discover -s gallery/tests -v`: 32/32 passed.
- `(cd gallery && node server/tests/parity.mjs)`: `parity: ok`.
- `node gallery/server/tests/diff_suite.mjs`: `diff suite: ok (166 tests)`,
  `todo (0)`.
- `npm --prefix gallery run test:e2e`: 38/38 passed, including all five exact
  `editor_cm6.spec.js` titles and the CM5/CM6 diff matrix.
- `npx tsc --noEmit`: exit 0.
- `npx vite build`: exit 0 (existing large-chunk advisory only).
- `(cd sidecar && npx vitest run)`: 24 files, 346/346 tests passed.
- `git diff --check`: exit 0.

No Tauri build, app relaunch, push, or live proof was performed, per controller
instructions.

## Risks and live items remaining

The deterministic browser coverage is green, but the plan's live-only checks are
explicitly **à vérifier live** by the controller after the signed app build:

- PDF rendering and compile/log workflow in the built app.
- SyncTeX source-to-PDF and PDF-to-source directions.
- TCC/Gatekeeper startup convergence and sidecar health in app context.
- In-app annotations, Add to chat, file picker, and visual parity confirmation.
- Final human observation of all three CM5 fallbacks before plan 032 removes CM5.

These items are not claimed as verified here.
