"""Fullscreen contract for the gallery + SVG viewer.

LESSON (learned the hard way, twice): Orca's embedded WebKit ACCEPTS
`requestFullscreen()` — the pane fills the whole screen — but IGNORES
`document.exitFullscreen()` (and the webkit-prefixed variant). The pane then
stays stuck full-screen on exit. No client-side trick fixes it: not a reflow,
not calling both exit APIs, not requesting FS on a child element.

So inside Orca we do not enter WebKit fullscreen at all. The gallery asks the
local server to launch the project-owned native macOS fullscreen viewer for the
selected image; closing that viewer cannot leave Orca's webview stuck. Real
browsers keep plain ?nativeFs=1. Other embedded shells still default to CSS-only
unless they explicitly opt in.
"""

import unittest
import sys
from unittest.mock import patch
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import cmux_gallery


def gallery_template():
    return (ROOT / "assets" / "gallery_template.html").read_text()


class FullscreenRegressionTests(unittest.TestCase):
    def test_server_has_orca_fullscreen_exit_route(self):
        server = (ROOT / "fig_annotate_server.py").read_text()
        self.assertIn("/orca-native-fullscreen", server)
        self.assertIn("def launch_native_fullscreen(path)", server)
        self.assertIn("native_fullscreen_viewer.py", server)
        self.assertIn("NATIVE_FULLSCREEN_EXTS", server)
        self.assertIn("threading.Thread(target=proc.wait", server)
        self.assertIn('"method": "noop; use /orca-native-fullscreen"', server)
        self.assertNotIn("def _orca_reanchor_browser_tab", server)
        self.assertNotIn('"tab", "switch"', server)
        self.assertNotIn('"terminal", "switch"', server)

    def test_gallery_skips_native_fullscreen_in_embedded_shells(self):
        gallery = gallery_template()

        self.assertIn("function lbNativeFsAllowed()", gallery)
        self.assertIn("function lbOrcaFsExitAllowed()", gallery)
        self.assertIn("function lbOrcaNativeFullscreen()", gallery)
        self.assertIn("/orca-native-fullscreen", gallery)
        self.assertIn("p.get('orcaFs')==='1'||p.get('cssFs')==='1'", gallery)
        self.assertIn("if(lbOrcaFsExitAllowed()) return false;", gallery)
        self.assertIn(r"\b(Orca|Electron|cmux)\b", gallery)
        self.assertIn("if(lbOrcaFsExitAllowed()){\n    await lbOrcaNativeFullscreen();\n    return;\n  }", gallery)
        guard = "if(!lbNativeFsAllowed()){nativeFsOk=false;return;}"
        native_call = "const req=root.requestFullscreen||root.webkitRequestFullscreen;"
        self.assertIn(guard, gallery)
        self.assertIn(native_call, gallery)
        self.assertLess(gallery.index(guard), gallery.index(native_call))

    def test_svg_viewer_skips_native_fullscreen_in_embedded_shells(self):
        viewer = (ROOT / "assets" / "svg_viewer.html").read_text()

        self.assertIn("function nativeFsAllowed()", viewer)
        self.assertIn(r"\b(Orca|Electron|cmux)\b", viewer)
        guard = "if(!nativeFsAllowed()) return;"
        native_call = (
            "const req=document.documentElement.requestFullscreen || "
            "document.documentElement.webkitRequestFullscreen;"
        )
        self.assertIn(guard, viewer)
        self.assertIn(native_call, viewer)
        self.assertLess(viewer.index(guard), viewer.index(native_call))
        self.assertIn("body.fs-mode header{display:none}", viewer)
        self.assertIn("if(window.self!==window.top) return false;", viewer)
        self.assertIn("return false;", viewer.split("function nativeFsAllowed()")[1])

    def test_gallery_url_selects_fullscreen_mode_from_shell(self):
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(
                cmux_gallery.gallery_url(8790),
                "http://127.0.0.1:8790/figures_index.html?nativeFs=1",
            )

        with patch.dict("os.environ", {"ORCA_APP_VERSION": "1.4.101"}, clear=True):
            self.assertEqual(
                cmux_gallery.gallery_url(8790),
                "http://127.0.0.1:8790/figures_index.html?orcaFs=1",
            )

        with patch.dict("os.environ", {"TERM_PROGRAM": "Orca"}, clear=True):
            self.assertEqual(
                cmux_gallery.gallery_url(9000),
                "http://127.0.0.1:9000/figures_index.html?orcaFs=1",
            )

    def test_gallery_defaults_to_css_fullscreen_without_native_flag(self):
        gallery = gallery_template()
        self.assertIn("return false;", gallery.split("function lbNativeFsAllowed()")[1])

    def test_orca_native_viewer_uses_notch_safe_image_area(self):
        viewer = (ROOT / "native_fullscreen_viewer.py").read_text()

        self.assertIn("DEFAULT_IMAGE_MARGIN = 200", viewer)
        self.assertIn("def safe_content_rect(screen):", viewer)
        self.assertIn("screen.safeAreaInsets()", viewer)
        self.assertIn("screen.visibleFrame()", viewer)
        self.assertIn("CMUX_GALLERY_FULLSCREEN_MARGIN", viewer)
        self.assertIn("root = NSView.alloc().initWithFrame_", viewer)
        self.assertIn("content_frame = safe_content_rect(screen)", viewer)
        self.assertIn("root.addSubview_(view)", viewer)
        self.assertIn("window.setContentView_(root)", viewer)
        self.assertIn("frame = safe_content_rect(screen)", viewer)
        self.assertIn("def scrollWheel_(self, event):", viewer)
        self.assertIn("def magnifyWithEvent_(self, event):", viewer)
        self.assertIn("def mouseDragged_(self, event):", viewer)
        self.assertIn("self._applyZoomAtPoint", viewer)

    def test_fullscreen_image_fills_the_viewport(self):
        # The fullscreen image must fill the viewport (width/height:100vw/vh) so
        # it takes the whole screen in true fullscreen (cmux) and fills the pane
        # in CSS pane-fill (Orca). object-fit:contain keeps the aspect ratio.
        gallery = gallery_template()
        fs_img = gallery.split("#lb.fs img{")[1].split("}")[0]
        self.assertIn("width:100vw;height:100vh", fs_img)
        self.assertIn("object-fit:contain", fs_img)

    def test_gallery_has_workflow_shortlist_health_recent_compare_tools(self):
        gallery = gallery_template()
        server = (ROOT / "fig_annotate_server.py").read_text()

        self.assertIn("let collections = JSON.parse(localStorage.getItem('figCollections')", gallery)
        self.assertIn("function buildCollectionChip()", gallery)
        self.assertIn("function applyCollectionToSel(name)", gallery)
        self.assertIn("if(!name) return;", gallery)
        self.assertNotIn("if(!collections[name].length) delete collections[name];", gallery)
        self.assertNotIn('id="tagChip"', gallery)
        self.assertNotIn('id="tagSel"', gallery)
        self.assertNotIn("document.getElementById('tagChip')", gallery)
        self.assertNotIn("document.getElementById('tagSel')", gallery)
        self.assertIn("let workflow = JSON.parse(localStorage.getItem('figWorkflow')", gallery)
        self.assertIn("const WORKFLOW_STATUSES", gallery)
        self.assertIn("function buildWorkflowChip()", gallery)
        self.assertIn("Status &#9662;", gallery)
        # Per-card status moved from an always-visible <select> ("Status: none")
        # to the hover "…" card menu (sober redesign 2026-07): assert the menu form.
        self.assertIn("function cardMenu(", gallery)
        self.assertIn('data-wfset=', gallery)
        self.assertNotIn("Workflow &#9662;", gallery)
        self.assertNotIn("Workflow: none", gallery)
        self.assertIn("let recents = JSON.parse(localStorage.getItem('figRecent')", gallery)
        self.assertIn("function buildRecentChip()", gallery)
        self.assertIn("function checkHealth()", gallery)
        self.assertIn("function healthRows(data)", gallery)
        self.assertIn("Server health", gallery)
        self.assertIn("Settings &#9662;", gallery)
        self.assertNotIn('id="healthChip"', gallery)
        self.assertNotIn('id="healthMenu"', gallery)
        self.assertIn("fetch('/ping')", gallery)
        self.assertIn("cmpZoom", gallery)
        self.assertIn("cmpPanX", gallery)
        self.assertIn("wheel", gallery)
        self.assertIn("pointermove", gallery)
        self.assertIn('"collections": collections', server)
        self.assertIn("collections[name] = clean", server)
        self.assertIn('"workflow": workflow', server)


if __name__ == "__main__":
    unittest.main()
