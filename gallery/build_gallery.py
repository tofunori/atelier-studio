#!/usr/bin/env python3
"""Regenerate figures_index.html — an interactive gallery of every figure in the project.

Usage:
    GALLERY_ROOT=<project> python build_gallery.py   (or: cmux-gallery build)

Scans the project for image files (png, pdf, svg, jpg, html), collects metadata,
and writes a self-contained figures_index.html at the project root.
Run it again any time to refresh the index after producing new figures.
"""
import os, json, time, hashlib, subprocess, sys, signal, tempfile, shutil, concurrent.futures

ROOT = os.path.abspath(os.environ.get("GALLERY_ROOT") or os.getcwd())
EXTS = {".png", ".jpg", ".jpeg", ".svg", ".pdf", ".html", ".docx", ".xlsx", ".xls", ".csv", ".md", ".py", ".r", ".jl", ".tex", ".sh",
        ".mp4", ".m4v", ".mov", ".webm"}
# Skip these directories entirely (virtualenvs, git, caches, build trees, worktrees, the index itself).
# .prism is a build tree that mirrors source files (PDF/Office duplicates) — indexing it walks
# thousands of extra artefacts and thumbnails build-output copies, so exclude it outright.
EXCLUDE_PARTS = {".git", ".venv", ".venv-era5", ".venv-codex", "node_modules",
                 "__pycache__", ".ipynb_checkpoints", "worktrees", ".claude", ".fig_thumbs",
                 "_gallery_exports", ".prism"}
ARCHIVE_HINTS = ("_archive", "menage_", "/tmp/", "tmp_dir", "/tmp", "raqdps_tests")
SELF = "figures_index.html"
SNIP_EXTS = (".py", ".r", ".jl", ".sh", ".tex", ".md", ".csv")

# Animation-frame directories: hundreds of sequential stills (f000.png, frame_0001.png…).
# Hidden from the gallery by default — the playable .mp4/.gif/.html is the artifact, not the
# individual frames. Set GALLERY_SHOW_FRAMES=1 to index them anyway.
SHOW_FRAMES = bool(os.environ.get("GALLERY_SHOW_FRAMES"))

def is_frames_dir(name):
    # Still-sequence dirs only (f000.png…). NOT "*_animations" dirs — those hold the
    # playable .mp4/.gif we want to keep.
    n = name.lower()
    return (n in ("frames", "frame")
            or n.endswith(("_frames", "_frame"))
            or "html_frames" in n)


def read_snippet(path, max_lines=14, max_chars=700):
    """First lines of a text/code file, for an inline card preview."""
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            out = []
            for _ in range(max_lines):
                ln = f.readline()
                if not ln:
                    break
                out.append(ln.rstrip("\n"))
        return "\n".join(out)[:max_chars]
    except OSError:
        return None


def cmux_favorites():
    """Paths (relative to the project) of files already in ~/.cmux-favorites."""
    fav_dir = os.path.expanduser("~/.cmux-favorites")
    favs = set()
    if os.path.isdir(fav_dir):
        for fn in os.listdir(fav_dir):
            p = os.path.join(fav_dir, fn)
            target = os.path.realpath(p)
            if target.startswith(ROOT + os.sep):
                favs.add(os.path.relpath(target, ROOT).replace(os.sep, "/"))
    return favs


THUMB_DIR = os.path.join(ROOT, ".fig_thumbs")
NO_THUMBS = bool(os.environ.get("GALLERY_NO_THUMBS"))  # skip qlmanage thumbnails (PDF/Office) for speed
# qlmanage is fast/reliable for PDF + video, slow + flaky for Office docs
# (.xlsx/.xls/.docx hang or take 20-40s each and leak renderer processes).
# Office files are still indexed as cards — just not thumbnailed. Set
# GALLERY_OFFICE_THUMBS=1 to opt back into qlmanage thumbnails for them.
THUMB_EXTS = (".pdf", ".mp4", ".m4v", ".mov", ".webm")
if os.environ.get("GALLERY_OFFICE_THUMBS"):
    THUMB_EXTS = THUMB_EXTS + (".docx", ".xlsx", ".xls")

def thumb_key(rel, mtime):
    return hashlib.md5(f"{rel}:{mtime}".encode()).hexdigest()


def _kill_proc_tree(proc):
    """Kill a subprocess together with any descendants it spawned.

    qlmanage forks QuickLook renderer/worker processes that outlive the parent
    being killed — that is what leaves orphaned qlmanage instances after every
    rescan. With start_new_session=True the child runs in its own process group
    so we can tear the whole tree down with one killpg without touching the
    builder process."""
    if proc is None:
        return
    try:
        pgid = os.getpgid(proc.pid)
    except (ProcessLookupError, PermissionError, OSError):
        pgid = None
    if pgid is not None:
        try:
            os.killpg(pgid, signal.SIGKILL)
            return
        except (ProcessLookupError, PermissionError, OSError):
            pass
    try:
        proc.kill()
    except Exception:
        pass


def build_thumbs(pending):
    """Generate missing thumbnails in parallel, one qlmanage call per file.

    Each file gets its own temp output dir so concurrent calls with duplicate
    basenames can't clobber each other's <basename>.png. qlmanage is flaky on
    macOS (Office files / corrupt PDFs hang it), so each call runs in its own
    process group with a short timeout — killpg tears down qlmanage AND its
    renderer children instead of orphaning them."""
    if not pending:
        return
    os.makedirs(THUMB_DIR, exist_ok=True)
    # sweep stale per-file temp dirs from any prior crashed/killed run
    for name in os.listdir(THUMB_DIR):
        if name.startswith("qlm_"):
            shutil.rmtree(os.path.join(THUMB_DIR, name), ignore_errors=True)
    workers = min(8, os.cpu_count() or 4)

    def gen(job):
        full, key = job
        base = os.path.basename(full)
        out = os.path.join(THUMB_DIR, key + ".png")
        fail = os.path.join(THUMB_DIR, key + ".fail")
        tmp = tempfile.mkdtemp(prefix="qlm_", dir=THUMB_DIR)  # per-file: no basename collisions
        try:
            proc = None
            try:
                proc = subprocess.Popen(
                    ["qlmanage", "-t", "-s", "480", "-o", tmp, full],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    start_new_session=True,
                )
                proc.wait(timeout=15)
            except subprocess.TimeoutExpired:
                _kill_proc_tree(proc)
                if proc is not None:
                    try:
                        proc.wait(timeout=5)
                    except Exception:
                        pass
            except Exception:
                _kill_proc_tree(proc)
            produced = os.path.join(tmp, base + ".png")
            if os.path.exists(produced):
                try:
                    os.replace(produced, out)
                    if os.path.exists(fail):
                        os.remove(fail)
                except OSError:
                    pass
            else:
                open(fail, "w").close()
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(gen, pending))
    print(f"[gallery] built {len(pending)} qlmanage thumbnail(s)")


def scan():
    rows = []
    thumb_pending = []
    keys_seen = set()
    for dirpath, dirnames, filenames in os.walk(ROOT):
        if set(dirpath.split(os.sep)) & EXCLUDE_PARTS:
            dirnames[:] = []
            continue
        if not SHOW_FRAMES:                       # don't descend into animation-frame dirs
            dirnames[:] = [d for d in dirnames if not is_frames_dir(d)]
        for fn in filenames:
            if fn.startswith("~$"):  # MS Office lock/temp files — junk, and they hang qlmanage
                continue
            ext = os.path.splitext(fn)[1].lower()
            if ext not in EXTS or fn == SELF:
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
            try:
                st = os.stat(full)
            except OSError:
                continue
            low = rel.lower()
            thumb = None
            if ext in THUMB_EXTS and not NO_THUMBS:
                key = thumb_key(rel, int(st.st_mtime))
                keys_seen.add(key)
                if os.path.exists(os.path.join(THUMB_DIR, key + ".png")):
                    thumb = ".fig_thumbs/" + key + ".png"
                elif not os.path.exists(os.path.join(THUMB_DIR, key + ".fail")):
                    thumb_pending.append((full, key))
                    thumb = ".fig_thumbs/" + key + ".png"
            rows.append({
                "thumb": thumb,
                "code": ext in SNIP_EXTS,  # snippet text is fetched lazily via /snippet (keeps the data light)
                "name": fn,
                "rel": rel,
                "folder": os.path.dirname(rel) or ".",
                "ext": ext.lstrip("."),
                "mtime": int(st.st_mtime),
                "btime": int(getattr(st, "st_birthtime", st.st_mtime)),
                "mdate": time.strftime("%Y-%m-%d %H:%M", time.localtime(st.st_mtime)),
                "bdate": time.strftime("%Y-%m-%d %H:%M", time.localtime(getattr(st, "st_birthtime", st.st_mtime))),
                "size": st.st_size,
                "archive": any(h in low for h in ARCHIVE_HINTS),
            })
    if thumb_pending:
        build_thumbs(thumb_pending)
        ok = {k for _, k in thumb_pending
              if os.path.exists(os.path.join(THUMB_DIR, k + ".png"))}
        for r in rows:
            t = r["thumb"]
            if t:
                k = t.rsplit("/", 1)[1][:-4]
                if k not in ok and not os.path.exists(os.path.join(THUMB_DIR, k + ".png")):
                    r["thumb"] = None
    purge_orphan_thumbs(keys_seen)
    rows.sort(key=lambda r: -r["mtime"])
    return rows


def purge_orphan_thumbs(keys_seen):
    """Remove .png/.fail thumbnails whose (md5) key is no longer referenced."""
    if not os.path.isdir(THUMB_DIR):
        return
    import re as _re
    pat = _re.compile(r"^([0-9a-f]{32})\.(png|fail)$")
    n = 0
    for fn in os.listdir(THUMB_DIR):
        m = pat.match(fn)
        if m and m.group(1) not in keys_seen:
            try:
                os.remove(os.path.join(THUMB_DIR, fn))
                n += 1
            except OSError:
                pass
    if n:
        print(f"  purge: {n} orphan thumbnails removed")


GALLERY_TEMPLATE = os.path.join(os.path.dirname(os.path.realpath(__file__)), "assets", "gallery_template.html")


def load_gallery_template():
    """Load the gallery UI shell from disk; build_gallery.py only injects scan data."""
    with open(GALLERY_TEMPLATE, encoding="utf-8") as f:
        return f.read()


def prewarm_image_thumbs(rows, limit=400):
    """Pre-generate the server /thumb cache for the NEWEST images, in parallel, so
    the first paint after a (re)build is instant instead of generating them on
    demand at view time. Same key scheme as fig_annotate_server's /thumb endpoint
    (md5(realpath:int(mtime):480)). Incremental: only uncached images are built, so
    a rescan after adding a few plots warms only those."""
    if NO_THUMBS or sys.platform != "darwin":
        return
    imgs = sorted(((r["mtime"], os.path.join(ROOT, r["rel"])) for r in rows
                   if r["ext"] in ("png", "jpg", "jpeg")), reverse=True)[:limit]
    todo = []
    for mt, full in imgs:
        key = hashlib.md5((os.path.realpath(full) + ":" + str(int(mt)) + ":480").encode()).hexdigest()
        out = os.path.join(THUMB_DIR, "imgthumb_" + key + ".png")
        if not os.path.exists(out):
            todo.append((full, out))
    if not todo:
        return
    os.makedirs(THUMB_DIR, exist_ok=True)
    def gen(job):
        full, out = job
        try:
            subprocess.run(["sips", "-Z", "480", "-s", "format", "png", full, "--out", out],
                           capture_output=True, timeout=20, check=True)
        except Exception:
            pass
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(8, (os.cpu_count() or 4))) as ex:
        list(ex.map(gen, todo))
    print(f"[gallery] pre-warmed {len(todo)} image thumbnail(s)")


def main():
    rows = scan()
    prewarm_image_thumbs(rows)
    folders = sorted({r["folder"] for r in rows})
    gen = time.strftime("%Y-%m-%d %H:%M")
    _esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    wordmark = _esc(os.environ.get("GALLERY_TITLE") or "Atelier")
    project = _esc(os.path.basename(ROOT.rstrip("/")) or "project")
    # __ROOT__ lands inside single-quoted JS string literals ('__ROOT__/'+rel);
    # escape it for that context so a path with a quote/backslash can't break the script.
    root_js = ROOT.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "").replace("</", "<\\/")
    html = (load_gallery_template()
            .replace("__TITLE__", f"{wordmark} · {project}")
            .replace("__WORDMARK__", wordmark)
            .replace("__PROJECT__", project)
            .replace("__COUNT__", f"{len(rows):,}")
            .replace("__GEN__", gen)
            .replace("__VER__", str(int(time.time())))
            .replace("__DATA__", json.dumps(rows, ensure_ascii=False).replace("</", "<\\/"))
            .replace("__FOLDERS__", json.dumps(folders, ensure_ascii=False).replace("</", "<\\/"))
            .replace("__FAVS__", json.dumps(sorted(cmux_favorites()), ensure_ascii=False).replace("</", "<\\/"))
            .replace("__ROOT__", root_js))
    # regression guard: the page is ONE inline <script>; an unescaped </script> in
    # embedded data (snippet/name/path) would close it early and blank the whole gallery.
    # The </ -> <\/ escaping above prevents that — fail loud if it ever regresses.
    n_close = html.count("</script>")
    if n_close != 1:
        raise SystemExit(f"build_gallery: emitted page has {n_close} </script> tags (expected 1) — "
                         "data escaping is broken; aborting rather than ship a blank gallery")
    out = os.path.join(ROOT, SELF)
    with open(out, "w") as f:
        f.write(html)
    print(f"[{gen}] {len(rows)} files indexed -> {out}")


if __name__ == "__main__":
    main()
