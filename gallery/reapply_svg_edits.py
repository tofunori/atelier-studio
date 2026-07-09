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
    """Return either a v1 list of transform dicts, or a v2 dict of edit sections.

    v1 (legacy): a bare JSON list, or ``{"svg": ..., "edits": [...]}`` — treated as
    ``transforms`` only. v2: ``{"version": 2, "transforms", "added", "removed", "styles"}``.
    """
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    if isinstance(d, dict) and (d.get("version") == 2
                                or any(k in d for k in ("transforms", "added", "removed", "styles"))):
        return {
            "version": 2,
            "transforms": [e for e in (d.get("transforms") or []) if isinstance(e, dict) and e.get("delta")],
            "added": [e for e in (d.get("added") or []) if isinstance(e, dict)],
            "removed": [e for e in (d.get("removed") or []) if isinstance(e, dict)],
            "styles": [e for e in (d.get("styles") or []) if isinstance(e, dict) and isinstance(e.get("props"), dict) and e["props"]],
        }
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


def _match(raw, e, by_text):
    """Find the opening tag for an edit: by matplotlib id first, then by label text."""
    elid = e.get("id")
    m = find_open_tag(raw, elid) if elid else None
    how = "id"
    if not m:                                                  # fallback: same label, new id
        text = (e.get("text") or "").strip()
        if text and text in by_text:
            elid = by_text[text]; m = find_open_tag(raw, elid); how = "text"
    return m, elid, how


def element_span(raw, tag_match):
    """(start, end) covering the whole element whose opening tag is `tag_match`.

    Balances nested same-name tags; a self-closing opening tag is the element itself."""
    tag = tag_match.group(0)
    start = tag_match.start()
    if tag.endswith("/>"):
        return start, tag_match.end()
    name = re.match(r'<([A-Za-z][\w:.-]*)', tag).group(1)
    pat = re.compile(r'<' + re.escape(name) + r'\b[^>]*>|</' + re.escape(name) + r'\s*>')
    depth = 1
    for mo in pat.finditer(raw, tag_match.end()):
        s = mo.group(0)
        if s.startswith("</"):
            depth -= 1
            if depth == 0:
                return start, mo.end()
        elif not s.endswith("/>"):
            depth += 1
    return start, tag_match.end()                              # unbalanced → drop just the open tag


def _esc_text(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _esc_attr(s):
    return _esc_text(s).replace('"', "&quot;")


def parse_style(s):
    """`prop: val; ...` → ordered dict, preserving declaration order."""
    d = {}
    for part in (s or "").split(";"):
        if ":" in part:
            k, v = part.split(":", 1)
            k = k.strip()
            if k:
                d[k] = v.strip()
    return d


def merge_style(existing, props):
    """Merge `props` into `existing` style: same-name props override in place, order kept."""
    d = parse_style(existing)
    for k, v in props.items():
        d[str(k)] = str(v)
    return "; ".join("%s: %s" % (k, v) for k, v in d.items())


def with_style(tag, props):
    """Merge `props` into the tag's style attribute (adding one if it has none)."""
    sm = re.search(r'\bstyle="([^"]*)"', tag)
    if sm:
        merged = _esc_attr(merge_style(sm.group(1), props))
        return tag[:sm.start()] + 'style="' + merged + '"' + tag[sm.end():]
    merged = _esc_attr(merge_style("", props))
    if tag.endswith("/>"):
        return tag[:-2].rstrip() + ' style="' + merged + '"/>'
    return tag[:-1].rstrip() + ' style="' + merged + '">'


def apply_anchored_style(raw, e):
    """Style a bare (id-less, label-less) shape located by an id-bearing ancestor + index.

    The client emits ``anchor`` (nearest ancestor id), ``tag`` (lowercase tag name) and
    ``index`` (0-based position among the ancestor's same-tag descendants, document order).
    We find the anchor's element span, then the (index+1)-th ``<tag`` OPENING tag inside it —
    the lookahead ``(?=[^0-9A-Za-z])`` stops ``<text`` from matching ``<textPath`` and avoids
    ``</tag`` closers. Returns ``(raw, ok)``; ok=False (anchor/index missing) → warn + unmatched.
    """
    anchor = e.get("anchor")
    tag = (e.get("tag") or "").strip()
    idx = e.get("index")
    if not anchor or not tag or not isinstance(idx, int) or idx < 0:
        return raw, False
    am = find_open_tag(raw, anchor)
    if not am:
        return raw, False
    s, en = element_span(raw, am)                              # search descendants only: from just after the anchor's own open tag
    pat = re.compile(r'<' + re.escape(tag) + r'(?=[^0-9A-Za-z])')
    matches = list(pat.finditer(raw, am.end(), en))
    if idx >= len(matches):
        return raw, False
    tm = re.compile(r'<[A-Za-z][^>]*>').match(raw, matches[idx].start())
    if not tm:
        return raw, False
    return raw[:tm.start()] + with_style(tm.group(0), e["props"]) + raw[tm.end():], True


def build_added(e):
    """A fresh `<text>` element from an `added` entry (id/x/y/style/transform optional)."""
    attrs = []
    if e.get("id"):
        attrs.append('id="%s"' % _esc_attr(e["id"]))
    for k in ("x", "y"):
        if e.get(k) is not None:
            attrs.append('%s="%s"' % (k, _esc_attr(e[k])))
    style = (e.get("style") or "").strip()
    if style:
        attrs.append('style="%s"' % _esc_attr(style))
    tr = (e.get("transform") or "").strip()
    if tr:
        attrs.append('transform="%s"' % _esc_attr(tr))
    return '<text %s>%s</text>' % (" ".join(attrs), _esc_text(e.get("content", "")))


def reapply(raw, edits):
    """Dispatch: v2 dict (sections) or v1 list (transforms only). Returns
    ``(raw, applied, skipped, missing)`` — applied/missing aggregate every section."""
    if isinstance(edits, dict):
        return reapply_v2(raw, edits)
    return reapply_transforms(raw, edits)


def reapply_transforms(raw, edits):
    by_text = comment_id_map(raw)
    applied, skipped, missing = [], [], []
    for e in edits:
        delta = e["delta"]
        m, elid, how = _match(raw, e, by_text)
        if not m:
            missing.append(e); continue
        newtag, changed = with_delta(m.group(0), delta)
        if not changed:
            skipped.append(elid); continue
        raw = raw[:m.start()] + newtag + raw[m.end():]
        applied.append((elid, how))
    return raw, applied, skipped, missing


def reapply_v2(raw, edits):
    """Order: transforms → styles → removed → added (per the .edits.json v2 contract)."""
    by_text = comment_id_map(raw)                              # ids/labels are stable across the passes below
    raw, applied, skipped, missing = reapply_transforms(raw, edits.get("transforms") or [])

    for e in edits.get("styles") or []:                        # merge style overrides
        if e.get("anchor"):                                    # bare shape: located by ancestor id + same-tag index
            raw2, ok = apply_anchored_style(raw, e)
            if ok:
                raw = raw2; applied.append((e.get("anchor"), "style/anchor"))
            else:
                log("  style unmatched (anchor): anchor=%s tag=%s index=%s"
                    % (e.get("anchor"), e.get("tag"), e.get("index")))
                missing.append(e)
            continue
        m, elid, how = _match(raw, e, by_text)
        if not m:
            log("  style unmatched: id=%s text=%r" % (e.get("id"), e.get("text")))
            missing.append(e); continue
        raw = raw[:m.start()] + with_style(m.group(0), e["props"]) + raw[m.end():]
        applied.append((elid, "style/" + how))

    for e in edits.get("removed") or []:                       # drop deleted nodes
        m, elid, how = _match(raw, e, by_text)
        if not m:
            log("  removed unmatched: id=%s text=%r — already absent?" % (e.get("id"), e.get("text")))
            missing.append(e); continue
        s, en = element_span(raw, m)
        raw = raw[:s] + raw[en:]
        applied.append((elid, "removed/" + how))

    added_frags = [build_added(e) for e in edits.get("added") or []]
    if added_frags:                                            # append fresh <text> before </svg> (inherits svg namespace)
        idx = raw.rfind("</svg>")
        if idx < 0:
            idx = len(raw)
        raw = raw[:idx] + "".join(added_frags) + raw[idx:]
        applied.extend(("added", "new") for _ in added_frags)

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

    total = (sum(len(edits.get(k) or []) for k in ("transforms", "added", "removed", "styles"))
             if isinstance(edits, dict) else len(edits))
    log("re-applied %d/%d edit(s)%s%s from %s"
        % (len(applied), total,
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
