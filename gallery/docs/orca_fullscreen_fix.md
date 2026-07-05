# Orca Fullscreen Gallery Fix

## Ranking

1. Project-owned native fullscreen viewer launched by the local gallery server.
   This avoids Orca/Electron HTML fullscreen entirely, so the embedded webview is
   never promoted and cannot remain stuck or freeze Orca on exit. It keeps the
   action inside the gallery workflow and returns to the same Orca pane after
   the viewer process closes.

2. Server-assisted exit from HTML fullscreen using Orca computer-use hotkeys.
   This can enter true fullscreen, but it is not reliable because the request
   originates from the wedged webview and can deadlock or freeze Orca while
   trying to manipulate the host app.

3. Dedicated Orca browser tab or Preview/QuickLook handoff.
   These are operationally simple, but they either do not give the requested
   in-gallery image workflow or move the user into another surface/app.

## Implemented

- Orca gallery URLs still use `?orcaFs=1`, but `build_gallery.py` now routes the
  lightbox fullscreen button to `/orca-native-fullscreen` instead of
  `requestFullscreen()`.
- Non-Orca browser/cmux paths still use `?nativeFs=1` and the existing native
  DOM fullscreen path.
- `fig_annotate_server.py` validates the selected project image and launches
  `native_fullscreen_viewer.py` in a detached child process.
- `native_fullscreen_viewer.py` creates one borderless AppKit fullscreen window,
  scales the image to the Mac screen, and exits cleanly on Escape, `q`, `f`,
  space, right-click, or double-click.
- The fullscreen window now uses a black root content view plus an image subview
  constrained to a safe content rectangle. That rectangle excludes the visible
  menu/notch area and applies a default 200-point margin, configurable with
  `CMUX_GALLERY_FULLSCREEN_MARGIN`.
- The native viewer supports mouse/trackpad inspection: scroll or pinch to zoom,
  and drag the zoomed image to pan.
- The old `/orca-fullscreen-exit` endpoint is now a no-op compatibility route so
  stale pages cannot trigger Orca tab/window control and freeze the app.

## Verification

- `python3 -m unittest discover -s tests`: 14 tests passed.
- `python3 -m py_compile build_gallery.py fig_annotate_server.py cmux_gallery.py native_fullscreen_viewer.py`: passed.
- `python3 native_fullscreen_viewer.py --check docs/banner.png`: image conversion/load path passed.
- Live server integration: `POST /orca-native-fullscreen` launched the viewer,
  Escape closed it, and the process disappeared.
- End-to-end page integration through `lbFsToggle()` in the Orca-loaded
  `?orcaFs=1` gallery launched the viewer, closed with Escape, left
  `document.fullscreenElement === null`, and left the gallery viewport at its
  pane size rather than full-window size.
