#!/usr/bin/env python3
"""
zotero_to_gallery.py — browse a Zotero library in atelier.

Reads the Zotero SQLite DB (read-only) and builds a tree of HARDLINKS to the
attachments in Zotero's ``storage/``, organised by collection, keeping Zotero's
human-readable filenames (``Author et al. - Year - Title.pdf``). Each item's
Zotero tags *and* collection names are written to ``.fig_state.json`` so the
gallery's Tags filter works out of the box.

Then point the gallery at the output dir::

    python zotero_to_gallery.py            # builds ~/ZoteroGallery
    atelier run --root ~/ZoteroGallery

It is a *separate* gallery from any project gallery — its own stable port and
state — so nothing else is affected, and it keeps every atelier feature
(PDF viewer + highlight, image lightbox, tags, favourites, search, export…).

Why hardlinks, not symlinks: the gallery server only serves files whose real
path is inside its root (an anti-escape guard). A symlink resolves to
``~/Zotero/storage`` (outside the root) and gets a 404; a hardlink is a real
directory entry *inside* the root pointing at the same data — it serves fine and
costs no extra disk. Hardlinks need the output dir on the SAME volume as Zotero
(the default ``~/ZoteroGallery`` is). For a different volume use ``--link copy``.

Nothing in the Zotero data dir is modified: the DB is opened read-only (copied
first if Zotero has it locked); only links/copies are created under ``--out``,
and removing one never affects Zotero's own copy. Re-run any time the library
changes — a manifest tracks what this script created so a rebuild is clean.
"""
import argparse
import errno
import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile
from collections import Counter

UNFILED = "(unfiled)"
MANIFEST = ".zotero_links.json"


def log(*a):
    print(*a, file=sys.stderr)


def safe_component(s):
    """A filesystem-safe single path component (folder or file name)."""
    s = (s or "").replace("/", "-").replace(os.sep, "-")
    s = re.sub(r"[\x00-\x1f]", "", s).strip().strip(".")
    return s or "_"


def open_db_readonly(db):
    """Open the Zotero DB read-only; if it is locked (Zotero running), work on a copy."""
    try:
        con = sqlite3.connect("file:%s?mode=ro&immutable=1" % db, uri=True)
        con.execute("SELECT 1 FROM items LIMIT 1")
        return con
    except sqlite3.Error:
        tmp = os.path.join(tempfile.gettempdir(), "zotero_ro_copy.sqlite")
        shutil.copy2(db, tmp)
        log("note: Zotero DB was locked — read a temporary copy (%s)" % tmp)
        return sqlite3.connect("file:%s?mode=ro" % tmp, uri=True)


def build_plan(cur, storage, types):
    """Resolve all attachments to (rel_path, src_disk, tags) before touching the fs."""

    def collections_of(pid):
        if not pid:
            return []
        return [r[0] for r in cur.execute(
            "SELECT col.collectionName FROM collectionItems ci "
            "JOIN collections col ON ci.collectionID=col.collectionID "
            "WHERE ci.itemID=?", (pid,)).fetchall()]

    def tags_of(pid):
        if not pid:
            return []
        return [r[0] for r in cur.execute(
            "SELECT t.name FROM itemTags it JOIN tags t ON it.tagID=t.tagID "
            "WHERE it.itemID=?", (pid,)).fetchall()]

    # materialise the attachment list first — we issue more queries per row
    atts = cur.execute(
        "SELECT ia.path, i.key, ia.parentItemID, ia.contentType "
        "FROM itemAttachments ia JOIN items i ON ia.itemID=i.itemID "
        "WHERE ia.path LIKE 'storage:%'").fetchall()

    plan, missing, filtered = [], 0, 0
    for path, key, parent, ctype in atts:
        if types is not None and (ctype or "") not in types:
            filtered += 1
            continue
        fn = os.path.basename(path.split("storage:", 1)[1]) or "file"  # leaf only — no path/traversal
        src = os.path.join(storage, key, fn)
        if not os.path.isfile(src):
            missing += 1
            continue
        colls = collections_of(parent) or [UNFILED]
        tags = sorted(set(tags_of(parent)) | {c for c in colls if c != UNFILED})
        for c in colls:                                  # one link per collection membership, mirroring Zotero
            plan.append((os.path.join(safe_component(c), fn), src, tags))
    return plan, len(atts), missing, filtered


def make_link(src, dst, mode):
    if mode == "copy":
        shutil.copy2(src, dst)
    else:                                                # hard
        os.link(src, dst)


def clean_previous(out):
    """Remove exactly what a prior run created (per manifest), then prune empty dirs."""
    mpath = os.path.join(out, MANIFEST)
    old = []
    if os.path.isfile(mpath):
        try:
            old = json.load(open(mpath))
        except Exception:
            old = []
    root = os.path.realpath(out) + os.sep
    for rel in old:
        p = os.path.join(out, rel)
        if not os.path.realpath(p).startswith(root):     # ignore manifest entries that escape the dir (tampered file)
            continue
        if os.path.lexists(p):
            try:
                os.remove(p)                             # removing our link never touches Zotero's own copy
            except OSError:
                pass
    # prune now-empty, non-dot directories we may have created
    for root, dirs, files in os.walk(out, topdown=False):
        if root == out:
            continue
        if os.path.basename(root).startswith("."):
            continue
        if not os.listdir(root):
            try:
                os.rmdir(root)
            except OSError:
                pass


def main(argv=None):
    ap = argparse.ArgumentParser(description="Build a atelier hardlink mirror of a Zotero library.")
    ap.add_argument("--zotero-dir", default=os.path.expanduser("~/Zotero"),
                    help="Zotero data dir (holds zotero.sqlite + storage/). Default: ~/Zotero")
    ap.add_argument("--out", default=os.path.expanduser("~/ZoteroGallery"),
                    help="output dir for the gallery mirror. Default: ~/ZoteroGallery")
    ap.add_argument("--types", default="application/pdf",
                    help="comma-separated attachment content-types to include "
                         "(default 'application/pdf'; e.g. 'application/pdf,image/png,image/jpeg')")
    ap.add_argument("--all-files", action="store_true",
                    help="include every stored attachment regardless of content-type")
    ap.add_argument("--link", choices=("hard", "copy"), default="hard",
                    help="how to materialise files: 'hard' (default, same volume, no extra disk) "
                         "or 'copy' (duplicates bytes; use when --out is on another volume)")
    ap.add_argument("--dry-run", action="store_true", help="print the planned layout, write nothing")
    args = ap.parse_args(argv)

    zdir = os.path.abspath(os.path.expanduser(args.zotero_dir))
    db = os.path.join(zdir, "zotero.sqlite")
    storage = os.path.join(zdir, "storage")
    out = os.path.abspath(os.path.expanduser(args.out))
    if not os.path.isfile(db):
        log("error: %s not found" % db)
        return 1
    if not os.path.isdir(storage):
        log("error: %s not found" % storage)
        return 1

    con = open_db_readonly(db)
    types = None if args.all_files else {t.strip() for t in args.types.split(",") if t.strip()}
    plan, n_att, missing, filtered = build_plan(con.cursor(), storage, types)

    log("%d attachments · %d links planned · %d filtered out · %d missing on disk"
        % (n_att, len(plan), filtered, missing))

    if args.dry_run:
        for folder, n in sorted(Counter(os.path.dirname(r) for r, _, _ in plan).items()):
            log("   %-40s %d" % ((folder or ".") + "/", n))
        return 0

    if os.path.isdir(out):
        clean_previous(out)
    os.makedirs(out, exist_ok=True)

    state_tags, created = {}, []
    for rel, src, tags in plan:
        dst = os.path.join(out, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if os.path.lexists(dst):                         # two different files, same name, same folder
            base, ext = os.path.splitext(rel)
            i = 1
            while os.path.lexists(os.path.join(out, "%s_%d%s" % (base, i, ext))):
                i += 1
            rel = "%s_%d%s" % (base, i, ext)
            dst = os.path.join(out, rel)
        try:
            make_link(src, dst, args.link)
        except OSError as e:
            if e.errno == errno.EXDEV and args.link == "hard":
                log("error: %s and the output dir are on different volumes, so hardlinks are\n"
                    "       impossible. Put --out on the same volume (e.g. ~/ZoteroGallery), or\n"
                    "       re-run with --link copy (duplicates the files)." % storage)
                return 1
            raise
        created.append(rel)
        if tags:
            state_tags[rel] = tags[:30]                  # gallery caps tags at 30/file

    # merge tags into .fig_state.json (preserve any favourites/ratings already there)
    state_path = os.path.join(out, ".fig_state.json")
    state = {}
    if os.path.isfile(state_path):
        try:
            state = json.load(open(state_path))
        except Exception:
            state = {}
    state["tags"] = state_tags
    with open(state_path, "w") as f:
        json.dump(state, f, ensure_ascii=False)

    with open(os.path.join(out, MANIFEST), "w") as f:    # track our files for a clean next rebuild
        json.dump(created, f, ensure_ascii=False)

    verb = "copied" if args.link == "copy" else "hardlinked"
    log("%s %d files under %s" % (verb, len(created), out))
    log("tagged %d files (Zotero tags + collections) in .fig_state.json" % len(state_tags))
    log("next:  atelier run --root %s" % out)
    print(out)                                           # stdout = the path to point the gallery at
    return 0


if __name__ == "__main__":
    sys.exit(main())
