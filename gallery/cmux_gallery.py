#!/usr/bin/env python3
"""atelier — artifact gallery, whiteboard, notes and annotations for cmux/Muxy/Orca.

Generalises an existing figures-index builder and fig-annotate server so they
work in ANY project. `run` builds the gallery, provisions the viewer assets into
the project, starts the server (a free port, cwd = project root) and opens it as
a cmux browser surface. Full functions are preserved: search · sort · folder +
format filters · archive toggle · favourites + star ratings · thumbnails ·
PDF/Markdown/code viewers · image lightbox with annotation → Claude.

Use `run` or `open` when you want a detached per-project server and your prompt
back. Use `foreground` when you want the server attached to the terminal.

Subcommands:
    build   GALLERY_ROOT=<root> build_gallery.py  +  drop viewer assets
    run     build + start/reuse a detached server + open the gallery
    open    build + start/reuse a detached server + open the gallery
"""
import argparse
import hashlib
import http.client
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.realpath(__file__))  # realpath: resolve the PATH symlink
BUILDER = os.path.join(HERE, "build_gallery.py")
SERVER = os.path.join(HERE, "fig_annotate_server.py")
ASSETS = os.path.join(HERE, "assets")
VIEWERS = ("pdf_viewer.html", "md_viewer.html", "code_editor.html", "latex_studio.html")
OUT = "figures_index.html"


PORT_BASE = 8790  # each project gets a stable port derived from its path


def state_path(root: str, port: int) -> str:
    """Return the per-project background server metadata path."""
    return os.path.join(root, ".fig_thumbs", f"cmux-gallery-{port}.json")


def project_port(root: str) -> int:
    """A stable, per-project port (same project → same URL, bookmarkable;
    different projects coexist on different ports)."""
    h = int(hashlib.md5(os.path.realpath(root).encode()).hexdigest(), 16)
    return PORT_BASE + (h % 1000)  # 8790–9789


def git_project_root(start: str) -> str | None:
    """Return the enclosing git worktree root for ``start``, if there is one."""
    try:
        res = subprocess.run(
            ["git", "-C", start, "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            timeout=2,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    root = res.stdout.strip()
    if res.returncode == 0 and root:
        return os.path.abspath(root)
    return None


def default_project_root(start: str | None = None) -> str:
    """Pick the project root for commands launched from inside a project."""
    cwd = os.path.abspath(os.path.expanduser(start or os.getcwd()))
    return git_project_root(cwd) or cwd


def root_arg(value: str) -> str:
    """Normalize an explicit ``--root`` argument."""
    return os.path.abspath(os.path.expanduser(value))


def gallery_url(port: int) -> str:
    """Return the browser URL, selecting the safest fullscreen mode for the host.

    Orca's embedded WebKit accepts requestFullscreen() but ignores
    exitFullscreen(), so native fullscreen leaves the pane stuck full-screen on
    exit. Inside Orca we use native entry plus a local-server exit route that
    asks the Orca desktop bridge to leave fullscreen. System browsers keep plain
    native fullscreen, so opening this URL in Safari/Chrome gives true
    whole-screen with a clean exit.
    """
    if os.environ.get("ORCA_APP_VERSION") or os.environ.get("TERM_PROGRAM") == "Orca":
        qs = "?orcaFs=1"
    else:
        qs = "?nativeFs=1"
    return f"http://127.0.0.1:{port}/{OUT}{qs}"


def open_cmux_browser(url: str) -> bool:
    """Open ``url`` in cmux when the CLI is available."""
    if not shutil.which("cmux"):
        print("[atelier] cmux CLI not found on PATH; open this URL manually "
              "or run with --no-open", file=sys.stderr)
        return False
    res = subprocess.run(["cmux", "browser", "open", url], capture_output=True, text=True)
    msg = res.stdout.strip() or res.stderr.strip()
    if msg:
        print(msg)
    return res.returncode == 0


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _port_busy(port: int) -> bool:
    s = socket.socket()
    try:
        s.bind(("127.0.0.1", port))
        return False
    except OSError:
        return True
    finally:
        s.close()


def server_project(port: int):
    """If one of our gallery servers answers on `port`, return the project root
    it serves (realpath); otherwise None. Lets `run` reuse an already-running
    server for the same project instead of spawning a duplicate on a new port."""
    try:
        c = http.client.HTTPConnection("127.0.0.1", port, timeout=1)
        c.request("GET", "/ping")
        r = c.getresponse()
        body = r.read()
        c.close()
        if r.status != 200:
            return None
        d = json.loads(body or b"{}")
        if d.get("service") == "fig-annotate" and d.get("project"):
            return os.path.realpath(d["project"])
    except (OSError, ValueError):
        pass
    return None


def provision_viewers(root: str) -> None:
    """Copy every bundled viewer asset (the *.html viewers + cm/, pdfjs/,
    marked.min.js …) into <root>/.fig_thumbs/, where the server serves them.
    Both files and vendor dirs are refreshed each build so a tool upgrade ships
    new CodeMirror/pdf.js to existing projects (was: dirs copied once = stale)."""
    td = os.path.join(root, ".fig_thumbs")
    os.makedirs(td, exist_ok=True)
    for name in os.listdir(ASSETS):
        src, dst = os.path.join(ASSETS, name), os.path.join(td, name)
        if os.path.isdir(src):
            shutil.copytree(src, dst, dirs_exist_ok=True)
        else:
            shutil.copy2(src, dst)


def build(root: str) -> str:
    env = dict(os.environ, GALLERY_ROOT=root)
    subprocess.run([sys.executable, BUILDER], cwd=root, env=env, check=True)
    provision_viewers(root)
    return os.path.join(root, OUT)


def wait_up(port: int, timeout: float = 8.0) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        try:
            c = http.client.HTTPConnection("127.0.0.1", port, timeout=1)
            c.request("GET", "/ping")
            r = c.getresponse()
            c.close()
            if r.status == 200:
                return True
        except OSError:
            time.sleep(0.2)
    return False


def write_server_state(root: str, port: int, pid: int, log_path: str) -> None:
    os.makedirs(os.path.join(root, ".fig_thumbs"), exist_ok=True)
    data = {
        "service": "atelier",
        "project": os.path.realpath(root),
        "port": port,
        "pid": pid,
        "log": log_path,
        "started": int(time.time()),
    }
    with open(state_path(root, port), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def read_server_state(root: str, port: int) -> dict | None:
    try:
        with open(state_path(root, port), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def process_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def start_detached_server(root: str, port: int) -> tuple[int, str]:
    env = dict(os.environ, FIG_PORT=str(port), GALLERY_ROOT=root)
    os.makedirs(os.path.join(root, ".fig_thumbs"), exist_ok=True)
    log_path = os.path.join(root, ".fig_thumbs", f"cmux-gallery-{port}.log")
    log = open(log_path, "a", encoding="utf-8")
    try:
        srv = subprocess.Popen(
            [sys.executable, SERVER],
            cwd=root,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            close_fds=True,
        )
    finally:
        log.close()
    write_server_state(root, port, srv.pid, log_path)
    return srv.pid, log_path


def resolve_port_for_host(root: str, requested_port: int) -> int:
    port = requested_port or project_port(root)
    if not _port_busy(port):
        return port
    served_project = server_project(port)
    if served_project == os.path.realpath(root):
        return port
    if requested_port:
        raise SystemExit(f"[atelier] port {port} is busy and is not serving {root}")
    print(f"[atelier] port {port} busy (not our gallery) → using a free port", file=sys.stderr)
    return next((c for c in range(port + 1, port + 50) if not _port_busy(c)), 0) or free_port()


def cmd_build(a) -> None:
    out = build(a.root)
    print(f"[atelier] built {out}  (+ viewers provisioned)")


def cmd_foreground(a) -> None:
    out = build(a.root)
    print(f"[atelier] built {out}")
    port = a.port or project_port(a.root)
    # The build above already refreshed figures_index.html + viewers. If our own
    # gallery for THIS project is already running on its stable port, reuse it
    # (the live server serves the fresh file) instead of starting a duplicate on
    # a random port — that's what was leaking a new port on every run.
    if not a.port and _port_busy(port):
        if server_project(port) == os.path.realpath(a.root):
            url = gallery_url(port)
            print(f"[atelier] gallery already running on :{port} → reusing it "
                  f"(rebuilt; stable URL, no duplicate server)")
            if a.open:
                open_cmux_browser(url)
            print(f"[atelier] gallery → {url}")
            return
        print(f"[atelier] port {port} busy (not our gallery) → using a free port", file=sys.stderr)
        port = next((c for c in range(port + 1, port + 50) if not _port_busy(c)), 0) or free_port()
    env = dict(os.environ, FIG_PORT=str(port), GALLERY_ROOT=a.root)
    print(f"[atelier] starting server on :{port}  (cwd={a.root})")
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))  # SIGTERM -> SystemExit -> finally tears down the server (no orphan)
    srv = subprocess.Popen([sys.executable, SERVER], cwd=a.root, env=env)
    try:
        if not wait_up(port):
            print("[atelier] warning: server /ping did not answer", file=sys.stderr)
        url = gallery_url(port)
        if a.open:
            open_cmux_browser(url)
        print(f"[atelier] gallery → {url}   (Ctrl-C to stop)")
        srv.wait()
    except KeyboardInterrupt:
        print("\n[atelier] stopping server")
    finally:
        srv.terminate()
        try:
            srv.wait(timeout=5)
        except subprocess.TimeoutExpired:
            srv.kill()


def cmd_open(a) -> None:
    out = build(a.root)
    print(f"[atelier] built {out}")
    port = resolve_port_for_host(a.root, a.port)
    url = gallery_url(port)
    served_project = server_project(port) if _port_busy(port) else None
    if served_project == os.path.realpath(a.root):
        print(f"[atelier] gallery already running on :{port} → reusing it")
    else:
        pid, log_path = start_detached_server(a.root, port)
        if wait_up(port):
            print(f"[atelier] started detached server pid {pid} on :{port}")
        else:
            print(f"[atelier] warning: server /ping did not answer; log: {log_path}",
                  file=sys.stderr)
    if a.open:
        open_cmux_browser(url)
    print(f"[atelier] gallery → {url}")


def cmd_run(a) -> None:
    cmd_open(a)


def cmd_stop(a) -> None:
    port = a.port or project_port(a.root)
    state = read_server_state(a.root, port)
    if not state:
        print(f"[atelier] no background server metadata for :{port}")
        return
    pid = int(state.get("pid") or 0)
    if pid and process_alive(pid):
        os.kill(pid, signal.SIGTERM)
        print(f"[atelier] stopped background server pid {pid} on :{port}")
    else:
        print(f"[atelier] background server pid {pid or '?'} is not running")
    try:
        os.remove(state_path(a.root, port))
    except OSError:
        pass


def cmd_serve(a) -> None:
    """Build, then HOST the server in the foreground and keep it alive (self-healing).

    Unlike `run`, this never reuses-and-exits — it IS the host. No browser tab is
    opened. Ideal for a cmux Dock control or a long-lived pane: the server lives as
    long as this process, and restarts itself if it ever dies."""
    out = build(a.root)
    print(f"[atelier] built {out}")
    port = a.port or project_port(a.root)
    env = dict(os.environ, FIG_PORT=str(port), GALLERY_ROOT=a.root)
    print(f"[atelier] serving {gallery_url(port)}  "
          f"(cwd={a.root}; hosting; self-healing; Ctrl-C to stop)")
    srv = None
    def _stop(*_):
        if srv:
            srv.terminate()
        sys.exit(0)
    signal.signal(signal.SIGTERM, _stop)
    try:
        while True:
            srv = subprocess.Popen([sys.executable, SERVER], cwd=a.root, env=env)
            srv.wait()
            print("[atelier] server exited — restarting in 2s", file=sys.stderr)
            time.sleep(2)
    except KeyboardInterrupt:
        pass
    finally:
        if srv:
            srv.terminate()
            try:
                srv.wait(timeout=5)
            except subprocess.TimeoutExpired:
                srv.kill()


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="atelier", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="build the gallery HTML + provision viewers")
    b.add_argument("--root", default=None, type=root_arg,
                   help="project to scan (default: git root for cwd, else cwd)")
    r = sub.add_parser("run", help="build + start/reuse a detached server + open in cmux")
    r.add_argument("--root", default=None, type=root_arg,
                   help="project to scan (default: git root for cwd, else cwd)")
    r.add_argument("--port", type=int, default=0,
                   help="server port (default: a stable port derived from the project path)")
    r.add_argument("--no-open", dest="open", action="store_false",
                   help="start (or reuse) the detached server without opening a cmux browser tab")
    o = sub.add_parser("open", help="build + start/reuse a detached server + open in cmux")
    o.add_argument("--root", default=None, type=root_arg,
                   help="project to scan (default: git root for cwd, else cwd)")
    o.add_argument("--port", type=int, default=0,
                   help="server port (default: a stable port derived from the project path)")
    o.add_argument("--no-open", dest="open", action="store_false",
                   help="start (or reuse) the detached server without opening a cmux browser tab")
    st = sub.add_parser("stop", help="stop a detached server started by atelier run/open")
    st.add_argument("--root", default=None, type=root_arg,
                    help="project to stop (default: git root for cwd, else cwd)")
    st.add_argument("--port", type=int, default=0,
                    help="server port (default: the stable port derived from the project path)")
    fg = sub.add_parser("foreground", help="build + host the server in this terminal")
    fg.add_argument("--root", default=None, type=root_arg,
                    help="project to scan (default: git root for cwd, else cwd)")
    fg.add_argument("--port", type=int, default=0,
                    help="server port (default: a stable port derived from the project path)")
    fg.add_argument("--no-open", dest="open", action="store_false",
                    help="start (or reuse) the server without opening a cmux browser tab")
    s = sub.add_parser("serve", help="build + HOST the server, self-healing, no browser (for a Dock control)")
    s.add_argument("--root", default=None, type=root_arg,
                   help="project to scan (default: git root for cwd, else cwd)")
    s.add_argument("--port", type=int, default=0,
                   help="server port (default: a stable port derived from the project path)")
    a = p.parse_args(argv)
    if a.root is None:
        a.root = default_project_root()
    {
        "build": cmd_build,
        "run": cmd_run,
        "open": cmd_open,
        "stop": cmd_stop,
        "foreground": cmd_foreground,
        "serve": cmd_serve,
    }[a.cmd](a)
    return 0


if __name__ == "__main__":
    sys.exit(main())
