# Public demonstration media

This harness imports current production React components and serves the current gallery surfaces against a dedicated fictional project. It never opens personal Atelier storage or connects to an agent account. It reuses WorkspaceShell, TopBar, Rail, Sidebar, Chat, SettingsSheet, and resizable panels. The documents appear beside the conversation, as in Atelier; the recording switches actual tabs.

1. Install repository dependencies and provide Python with NumPy/Matplotlib, Playwright Chromium, ffmpeg, and `rust/target/debug/atelier-gallery-server` (build with `cargo build --manifest-path rust/Cargo.toml -p atelier-gallery`).
2. Run `MPLCONFIGDIR=/tmp/atelier-demo-mpl python3 scripts/public-demo/fixtures.py`.
3. Run `npx vite --host 127.0.0.1 --port 4199 --strictPort` from the repo (frontend only; no Tauri runtime).
4. Run `node scripts/public-demo/capture.mjs` in a second terminal.
5. Inspect every PNG and the complete video before publishing. Check labels, clipping, loading states, errors, and privacy. The textual denylist is an extra guard, not a substitute for visual review.

The capture script starts and stops its own gallery Rust server on a dynamically assigned loopback port, using only `/tmp/atelier-public-demo/Observatory`. Synthetic plots are generated from explicit mathematical functions. Public captures and the recording are written to `docs/media/public/` and mirrored into `website/public/media/` (the GIF is README-only). The manifest records visible text and capture time.

The React harness is outside `src/` and is not imported by the packaged desktop app. Gallery captures use the Rust server with current production assets. The fixture generator initializes a local Git history under the fictional identity Atelier Demo so the editor has a valid revision baseline. No remote repository is configured.

The gallery contains 12 synthetic figures: time series, distributions, a scatter plot, a correlation matrix, grouped violins, an uncertainty band, a cumulative curve, residuals, a frequency spectrum, and a seasonal comparison. The supplementary figures use seed 42. The main four-panel regression figure uses seed 2026 and 240 synthetic observations. Its fitted mean, coefficient intervals, in-sample agreement, and residuals come from the same model. Gaussian noise is known by construction; intervals are calculated from that model, not drawn by hand. `research_figure.py` generates the main PNG/PDF and is copied into the fictional editor as `analysis.py`.

The tour also draws a region on a figure and enters an annotation draft, then opens the fictional manuscript in the production LaTeX reading view. The draft is shown before sending; no agent or simulated delivery acknowledgement is used.
