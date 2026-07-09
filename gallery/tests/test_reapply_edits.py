import json
import os
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import reapply_svg_edits as R


# A tiny matplotlib-like SVG: each <text> is preceded by a `<!-- label -->` comment
# (that's how matplotlib emits ids/labels) so the text-fallback matcher has something to chew on.
SVG = (
    '<?xml version="1.0"?>\n'
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">\n'
    ' <!-- x axis label -->\n'
    ' <g id="label_x" transform="translate(10 20)"><text style="font: 12px sans">X axis</text></g>\n'
    ' <!-- title -->\n'
    ' <text id="title_1" style="fill: #000; font: 14px sans">My Title</text>\n'
    ' <!-- legend box -->\n'
    ' <g id="legend_1"><rect x="0" y="0" width="30" height="20"/></g>\n'
    '</svg>\n'
)


class V1BackCompat(unittest.TestCase):
    def test_bare_list_is_treated_as_transforms(self):
        edits = R.load_edits(self._write([{"id": "label_x", "text": "x axis label", "delta": "translate(3,4) "}]))
        self.assertIsInstance(edits, list)
        out, applied, skipped, missing = R.reapply(SVG, edits)
        self.assertEqual(len(applied), 1)
        self.assertEqual(missing, [])
        # delta prefixed onto the element's own existing transform
        self.assertIn('transform="translate(3,4)  translate(10 20)"', out)

    def test_wrapped_list_still_works(self):
        p = self._write({"svg": "fig.svg", "edits": [{"id": "label_x", "delta": "translate(1,1) "}]})
        edits = R.load_edits(p)
        self.assertIsInstance(edits, list)
        out, applied, _, missing = R.reapply(SVG, edits)
        self.assertEqual((len(applied), missing), (1, []))

    def test_text_fallback_when_id_changed(self):
        # id no longer present → match via the `<!-- x axis label -->` comment
        edits = [{"id": "gone_id", "text": "x axis label", "delta": "translate(5,5) "}]
        out, applied, _, missing = R.reapply(SVG, edits)
        self.assertEqual((len(applied), missing), (1, []))
        self.assertIn('translate(5,5)  translate(10 20)', out)

    def _write(self, obj):
        fd, p = tempfile.mkstemp(suffix=".json")
        with os.fdopen(fd, "w") as f:
            json.dump(obj, f)
        self.addCleanup(os.remove, p)
        return p


class V2Sections(unittest.TestCase):
    def setUp(self):
        self.edits = {
            "version": 2,
            "transforms": [{"id": "label_x", "text": "x axis label", "delta": "translate(3,4) "}],
            "styles": [{"id": "title_1", "text": "title", "props": {"fill": "#c00", "font-size": "20px"}}],
            "removed": [{"id": "legend_1", "text": "legend box"}],
            "added": [{"id": "added_text_1", "x": 120.5, "y": 88.2, "content": "New Label",
                       "style": "font: 12px sans-serif; fill: #000", "transform": ""}],
        }

    def test_load_edits_recognizes_v2(self):
        fd, p = tempfile.mkstemp(suffix=".json")
        with os.fdopen(fd, "w") as f:
            json.dump(self.edits, f)
        self.addCleanup(os.remove, p)
        loaded = R.load_edits(p)
        self.assertIsInstance(loaded, dict)
        self.assertEqual(loaded["version"], 2)
        self.assertEqual(len(loaded["transforms"]), 1)

    def test_full_v2_reapply(self):
        out, applied, skipped, missing = R.reapply(SVG, self.edits)
        self.assertEqual(missing, [])

        # transform: delta prefixed onto the existing one
        self.assertIn('transform="translate(3,4)  translate(10 20)"', out)

        # style merged: existing `fill:#000` overridden, existing `font` preserved, new key added
        self.assertIn("fill: #c00", out)
        self.assertNotIn("fill: #000; font: 14px sans", out)   # old fill replaced in place
        self.assertIn("font: 14px sans", out)                  # untouched prop preserved
        self.assertIn("font-size: 20px", out)                  # new prop appended

        # removed: the legend node is gone
        self.assertNotIn('id="legend_1"', out)
        self.assertNotIn("<rect", out)

        # added: new <text> appended before </svg>, inside the svg
        self.assertIn('id="added_text_1"', out)
        self.assertIn('>New Label</text>', out)
        self.assertLess(out.index('id="added_text_1"'), out.index("</svg>"))
        self.assertIn('x="120.5"', out)

    def test_removed_missing_is_warned_not_fatal(self):
        e = dict(self.edits)
        e["removed"] = [{"id": "nope", "text": "not here"}]
        out, applied, _, missing = R.reapply(SVG, e)
        self.assertEqual(len(missing), 1)                       # unmatched removal reported
        self.assertIn('id="added_text_1"', out)                # rest still applied

    def test_style_merge_helpers(self):
        self.assertEqual(R.parse_style("a: 1; b:2"), {"a": "1", "b": "2"})
        self.assertEqual(R.merge_style("fill: #000; x: 1", {"fill": "#c00", "y": "2"}),
                         "fill: #c00; x: 1; y: 2")


class V2AnchoredStyle(unittest.TestCase):
    # a matplotlib legend group with two id-less, label-less <path>s (the common case
    # that collectEdits() now anchors by ancestor id + same-tag index)
    SVG = (
        '<?xml version="1.0"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg">\n'
        ' <g id="legend_1">\n'
        '  <path d="M0 0h10"/>\n'
        '  <path d="M0 5h10"/>\n'
        ' </g>\n'
        ' <textPath id="tp" href="#p">not a text tag</textPath>\n'
        '</svg>\n'
    )

    def test_only_indexed_shape_is_styled(self):
        edits = {"version": 2, "styles": [
            {"id": None, "text": None, "anchor": "legend_1", "tag": "path",
             "index": 1, "props": {"stroke": "#c00"}}]}
        out, applied, skipped, missing = R.reapply(self.SVG, edits)
        self.assertEqual(missing, [])
        self.assertEqual(len(applied), 1)
        paths = re.findall(r'<path[^>]*>', out)
        self.assertEqual(len(paths), 2)
        self.assertNotIn("stroke", paths[0])                  # first path untouched
        self.assertIn("stroke: #c00", paths[1])               # only the 2nd path styled

    def test_text_anchor_does_not_match_textpath(self):
        # tag="text" with no <text> descendant → <textPath> must NOT be matched
        edits = {"version": 2, "styles": [
            {"id": None, "text": None, "anchor": "legend_1", "tag": "text",
             "index": 0, "props": {"fill": "#c00"}}]}
        out, applied, skipped, missing = R.reapply(self.SVG, edits)
        self.assertEqual(len(missing), 1)                     # index out of range → unmatched, not a bad match
        self.assertNotIn("fill: #c00", out)

    def test_missing_anchor_is_warned_not_fatal(self):
        edits = {"version": 2, "styles": [
            {"id": None, "text": None, "anchor": "nope", "tag": "path",
             "index": 0, "props": {"stroke": "#c00"}}]}
        out, applied, skipped, missing = R.reapply(self.SVG, edits)
        self.assertEqual(len(missing), 1)
        self.assertNotIn("stroke: #c00", out)


if __name__ == "__main__":
    unittest.main()
