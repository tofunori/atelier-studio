#!/usr/bin/env python3
"""reapply_svg_edits.py — re-apply manual cmux-gallery SVG-editor tweaks onto a regenerated SVG.

The SVG editor (Save 💾) writes ``<figure>.edits.json`` next to the figure: for every element you
moved or resized, the element's matplotlib ``id``, its label text, and the editor DELTA transform
(the move/scale prefix, with the element's *own* original transform stripped off). When the figure
script regenerates the ``.svg`` from scratch, run this to paste those deltas back on top of the fresh
elements — so your precise manual placement survives every regeneration, with no coordinate
conversion (it stays in SVG space, exactly as you placed it).

Matching: by matplotlib ``id`` (deterministic for a stable figure); falls back to the label text
(matplotlib emits an HTML ``<!-- text -->`` comment just before each ``<text>`` group). Anything it
cannot match is reported, never guessed. The delta is applied as the OUTER transform on top of the
fresh element's own transform, so it is correct even if the underlying geometry shifted a little.

Run it on the FRESHLY regenerated SVG (your script's output), not on an already-patched one; a guard
skips an element whose transform already starts with the delta, so a re-run is a no-op.

Usage:
  reapply_svg_edits.py FIG.svg                 # uses FIG.edits.json, rewrites FIG.svg in place
  reapply_svg_edits.py FIG.svg -o OUT.svg      # write the patched SVG elsewhere (FIG.svg untouched)
  reapply_svg_edits.py FIG.svg EDITS.json -o OUT.svg
  reapply_svg_edits.py FIG.svg --stdout        # print to stdout
"""
import argparse
import json
import os
import re
import sys


def log(*a):
    print(*a, file=sys.stderr)


def load_edits(path):
    d = json.load(open(path, encoding="utf-8"))
    edits = d.get("edits", d) if isinstance(d, dict) else d
    return [e for e in edits if isinstance(e, dict) and e.get("delta")]


def comment_id_map(raw):
    """{label text -> element id} from matplotlib's `<!-- text --> <g id="...">` pairs."""
    m = {}
    for mo in re.finditer(r'<!--\s*(.*?)\s*-->\s*<\w+\s+id="([^"]+)"', raw, re.S):
        m.setdefault(mo.group(1).strip(), mo.group(2))
    return m


def find_open_tag(raw, elid):
    """The opening tag carrying id="elid" (ids are unique; references use href/url, not id=)."""
    return re.search(r'<[A-Za-z][^>]*\bid="' + re.escape(elid) + r'"[^>]*>', raw)


def with_delta(tag, delta):
    """Prepend `delta` to the tag's transform (outermost), or add a transform if it has none."""
    tm = re.search(r'\btransform="([^"]*)"', tag)
    if tm:
        fresh = tm.group(1).strip()
        if fresh.replace(" ", "").startswith(delta.replace(" ", "")):
            return tag, False                                  # already patched → idempotent no-op
        combined = (delta + " " + fresh).strip()
        return tag[:tm.start()] + 'transform="' + combined + '"' + tag[tm.end():], True
    if tag.endswith("/>"):
        return tag[:-2].rstrip() + ' transform="' + delta + '"/>', True
    return tag[:-1].rstrip() + ' transform="' + delta + '">', True


def reapply(raw, edits):
    by_text = comment_id_map(raw)
    applied, skipped, missing = [], [], []
    for e in edits:
        delta, elid, text = e["delta"], e.get("id"), (e.get("text") or "").strip()
        m = find_open_tag(raw, elid) if elid else None
        how = "id"
        if not m and text and text in by_text:                 # fallback: same label, new id
            elid = by_text[text]; m = find_open_tag(raw, elid); how = "text"
        if not m:
            missing.append(e); continue
        newtag, changed = with_delta(m.group(0), delta)
        if not changed:
            skipped.append(elid); continue
        raw = raw[:m.start()] + newtag + raw[m.end():]
        applied.append((elid, how))
    return raw, applied, skipped, missing


def main(argv=None):
    ap = argparse.ArgumentParser(description="Re-apply cmux-gallery SVG-editor tweaks onto a regenerated SVG.")
    ap.add_argument("svg", help="the freshly regenerated .svg to patch")
    ap.add_argument("edits", nargs="?", help="the .edits.json (default: <svg stem>.edits.json)")
    ap.add_argument("-o", "--out", help="write the patched SVG here (default: overwrite the input in place)")
    ap.add_argument("--stdout", action="store_true", help="print the patched SVG to stdout instead of writing a file")
    args = ap.parse_args(argv)

    edits_path = args.edits or (os.path.splitext(args.svg)[0] + ".edits.json")
    if not os.path.isfile(edits_path):
        log("no edits file (%s) — nothing to re-apply" % edits_path)
        return 0
    if not os.path.isfile(args.svg):
        log("error: %s not found" % args.svg); return 1

    edits = load_edits(edits_path)
    raw = open(args.svg, encoding="utf-8").read()
    patched, applied, skipped, missing = reapply(raw, edits)

    log("re-applied %d/%d edit(s)%s%s from %s"
        % (len(applied), len(edits),
           (" · %d already-applied" % len(skipped)) if skipped else "",
           (" · %d UNMATCHED" % len(missing)) if missing else "",
           os.path.basename(edits_path)))
    for e in missing:
        log("  unmatched: id=%s text=%r — element not in the regenerated SVG (structure changed?)"
            % (e.get("id"), e.get("text")))

    if args.stdout:
        sys.stdout.write(patched)
    else:
        out = args.out or args.svg
        with open(out, "w", encoding="utf-8") as f:
            f.write(patched)
        log("wrote %s" % out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
