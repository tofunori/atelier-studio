<p align="center">
  <img src="docs/banner.png?v=atelier" alt="atelier" width="100%">
</p>

**Atelier** (ex-cmux-gallery) — a portable artifact gallery, tldraw whiteboard, markdown notes and annotation tool for [cmux](https://github.com/manaflow-ai/cmux), Muxy and Orca.
Point it at any project and it builds a searchable HTML gallery of your figures,
PDFs, videos, data and code — with thumbnails, an image lightbox, a video player,
PDF / Markdown / code viewers, figure annotation, and an SVG element selector.
Organise with tags, favourites and smart-hide rules; export a selection or jump
from a figure to the script that generated it. No manual setup per project.

<p align="center">
  <img src="docs/screenshot.png?v=atelier" alt="atelier — the searchable figure grid" width="100%">
</p>

## Features

**Browse** — search · sort · folder filter · one **Formats** menu (toggle any
type, or "only" it) · favourites + 1–5★ ratings · Quick-Look thumbnails (macOS).

**View** — image lightbox (+ compare two side-by-side) · in-page **video player**
(mp4 / mov / webm, with seeking) · embedded PDF / Markdown / code / LaTeX viewers.

**Annotate** — pen / arrow / rect + numbered notes on a figure → sent to Claude
Code; or an **SVG element selector** (click a curve / label / axis of a vector
plot to send that exact element).

**Organise** — tags / collections · per-file hide + glob **smart-hide rules**
(e.g. `**/_qa/**`, `*_preview.png`) · archive toggle, all under a **⚙ View** menu.

**Act on a selection** — bulk hide / delete (to Trash) · **export** to a folder, a
zip, or a printable contact sheet · **tag** · open a figure's **generating
script** (`</> src` → stem-match, else ripgrep).

## How it works

`run` builds the gallery, provisions the viewer assets into the project, starts
or reuses a detached local server (on a stable port, with the project as its
root), opens it as a cmux browser surface, then returns your terminal.

```
build  → GALLERY_ROOT=<root> build_gallery.py  +  copy viewer assets
host   → detached fig_annotate_server.py, project as root
foreground → same server attached to the terminal for debugging
serve  → foreground self-healing host for cmux Dock controls
view   → cmux browser open http://127.0.0.1:<port>/figures_index.html
```

## Install

```bash
git clone https://github.com/tofunori/atelier.git ~/tools/atelier
bash ~/tools/atelier/install.sh
```

`install.sh` links `atelier` (and the legacy alias `cmux-gallery`) into `~/.local/bin`, checks it is on your `PATH`
(and shows how to add it if not), and verifies `python3` + `cmux`. Manual
equivalent: `ln -s …/cmux_gallery.py ~/.local/bin/atelier && chmod +x …`.

`build` needs only the Python 3 standard library; `run`/`serve` need the `cmux`
CLI. Thumbnails use macOS `qlmanage` (skipped gracefully elsewhere).

## Use

```bash
atelier run                 # build + background server + open in cmux
atelier open                # alias for run
atelier stop                # stop the background server for this project
atelier foreground          # foreground mode; keep the pane open
atelier serve               # build + HOST the server, self-healing, no browser tab
atelier run --root /path    # a specific project (default: current dir)
atelier build               # just write the HTML + viewers (no server)
```

When launched from inside a git checkout, the default root is the checkout root,
not the exact subdirectory. So you can run `atelier run` from
`my-project/figures/plots/` and it will index `my-project/`. Outside git, it
uses the current directory. Use `--root <dir>` to override this.

Each project gets a **stable port** derived from its path (8790–9789), so the URL
is the same every time — open it in any browser (cmux or system) and bookmark it,
e.g. `http://127.0.0.1:8790/figures_index.html`. Pin one with `--port <n>`.

> **Opening it (avoid "connection refused"):** prefer `atelier run` over a
> raw bookmark. It starts or reuses the server before opening the page. Use
> `atelier stop` when you want to shut down the detached server.

### As a cmux command / Dock control

- **Command Palette / + menu**: copy the `actions` + `commands` from
  [`cmux.example.json`](./cmux.example.json) into `~/.config/cmux/cmux.json`,
  then run **Project Gallery**.
- **Dock** (recommended): copy [`dock.example.json`](./dock.example.json) into the
  project's `.cmux/dock.json`. It runs `atelier serve`, which **hosts** the
  server, restarts it if it dies, and auto-starts when cmux launches.

## Keeping it running

Pick one:

- **Detached project server (recommended for ad hoc work).** `atelier run`
  starts the server in the background and returns your terminal. Stop it with
  `atelier stop`.

- **A cmux Dock control or pane.** `atelier serve` hosts the
  server and self-heals; in the Dock it also auto-starts with cmux. Because it
  runs *inside cmux* it inherits cmux's file access — which matters on macOS:

  > **Don't use a launchd LaunchAgent for a project under `~/Documents`,
  > `~/Desktop`, `~/Downloads` or iCloud Drive.** macOS **TCC** blocks background
  > launchd processes from reading those folders, so an "always-on" agent there
  > starts but returns **404 for every file** (it binds the socket but can't read
  > your files) unless you grant its `python3` **Full Disk Access**. The
  > cmux-hosted server avoids this entirely.

- **A plain terminal:** `atelier run` (or `serve`) in a pane you keep open.

To run it even when cmux is closed: move the project outside those protected
folders, or grant Full Disk Access to your `python3` and launch `atelier
serve` from a LaunchAgent.

## Zotero library

Browse and annotate your **Zotero** PDFs in the gallery. `zotero_to_gallery.py`
reads your Zotero SQLite DB (read-only) and builds a **hardlink** mirror organised
by collection — keeping Zotero's readable filenames (`Author et al. - Year -
Title.pdf`) and exposing Zotero tags + collections as gallery tags:

```bash
python zotero_to_gallery.py            # builds ~/ZoteroGallery (hardlinks, no extra disk)
atelier run --root ~/ZoteroGallery
```

It's a *separate* gallery (its own port + state) from any project gallery, with
every feature intact — PDF viewer + highlight, tags/collections filter, search,
favourites, export. Re-run any time your library changes (a manifest keeps the
rebuild clean).

- **Hardlinks, not copies** — the mirror shares Zotero's bytes (no duplication),
  so it must sit on the **same volume** as Zotero (the default `~/ZoteroGallery`
  does). For another volume, `--link copy`. (Symlinks can't be used: the server
  only serves files whose real path is inside the gallery root, and a symlink
  resolves outside it.) Removing a mirrored file never touches Zotero's own copy.
- `--types` selects attachment content-types (default `application/pdf`;
  `--all-files` for everything), `--dry-run` previews the layout, `--zotero-dir`
  / `--out` override the paths. Nothing under `~/Zotero` is ever modified.

## Configuration

| flag / env | meaning |
|---|---|
| `--root <dir>` | project to scan (default: git root for the current dir, else current dir) |
| `--port <n>` | server port (default: a stable per-project port 8790–9789; 0 = random) |
| `GALLERY_TITLE` | header wordmark (default `Atelier`) |
| `GALLERY_NO_THUMBS=1` | skip Quick-Look thumbnail generation |
| `GALLERY_SHOW_FRAMES=1` | index animation-frame dirs (hidden by default) |

## Notes & caveats

- **Untrusted filenames are safe**: filenames and tags are HTML-escaped and all
  card handlers use `data-*` delegation, so a crafted name can't execute script.
- **Local-only API**: the server binds `127.0.0.1`, and its state-changing /
  shell endpoints reject browser cross-origin requests (the `Origin` must be
  loopback), so a web page you happen to have open can't drive it.
- **Animation frames are skipped** by default (dirs like `*_frames/`, `frames/`,
  `*html_frames*`) — the playable video/GIF is the artifact, not the stills. Set
  `GALLERY_SHOW_FRAMES=1` to index them.
- **annotate → Claude** and the LaTeX/`open`/trash actions are macOS- and
  Claude-Code-in-cmux-specific; they degrade gracefully elsewhere.
- **Light by default**: image cards load on-demand downscaled thumbnails
  (`/thumb`, cached in `.fig_thumbs/`) instead of the full files — a 4320 px plot
  decodes to ~38 MB but its 480 px card to ~0.5 MB; the lightbox still opens the
  full-resolution original (no quality loss). Code previews load lazily via
  `/snippet` as cards scroll in (keeps the embedded data ~½ the size), and the
  newest thumbnails are pre-warmed at build so the first paint after a rescan is
  instant.
- `figures_index.html`, `.fig_thumbs/`, `annotations/` and `_gallery_exports/`
  are regenerated artifacts; `.fig_state.json` holds per-machine favourites /
  ratings / tags / hidden / rules. Gitignore all of them.

## Bundled third-party

Vendored under `assets/`, each under its own license (see [LICENSE](./LICENSE)):

- [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0) — see `assets/pdfjs/NOTICE`
- [CodeMirror 5](https://codemirror.net) (MIT) — `assets/cm/`
- [marked](https://marked.js.org) (MIT) — `assets/marked.min.js`
- [DOMPurify](https://github.com/cure53/DOMPurify) (Apache-2.0 / MPL-2.0) — `assets/purify.min.js`

## License

MIT — see [LICENSE](./LICENSE).
