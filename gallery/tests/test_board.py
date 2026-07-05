"""Whiteboard endpoints: /board/load, /board/save, /board/poll, /board/command."""
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _req(port, path, payload=None):
    url = f"http://127.0.0.1:{port}{path}"
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data,
                                 headers={"Content-Type": "application/json"} if data else {})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


class BoardEndpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.port = _free_port()
        # a real image file the add_image command can point at
        png = os.path.join(cls.tmp.name, "fig.png")
        with open(png, "wb") as f:
            f.write(b"\x89PNG\r\n\x1a\n")
        env = dict(os.environ, GALLERY_ROOT=cls.tmp.name, FIG_PORT=str(cls.port))
        cls.proc = subprocess.Popen([sys.executable, str(ROOT / "fig_annotate_server.py")],
                                    env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            try:
                _req(cls.port, "/ping")
                return
            except Exception:
                time.sleep(0.1)
        raise RuntimeError("server did not start")

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait(timeout=5)
        cls.tmp.cleanup()

    def test_load_empty_then_save_roundtrip(self):
        code, j = _req(self.port, "/board/load")
        self.assertEqual(code, 200)
        self.assertIsNone(j["snapshot"])
        snap = {"store": {"shape:x": {"type": "geo"}}, "schema": {"v": 1}}
        code, j = _req(self.port, "/board/save", {"snapshot": snap})
        self.assertEqual(code, 200)
        self.assertTrue(j["ok"])
        code, j = _req(self.port, "/board/load")
        self.assertEqual(code, 200)
        self.assertEqual(j["snapshot"], snap)

    def test_save_rejects_non_object(self):
        code, _ = _req(self.port, "/board/save", {"snapshot": "nope"})
        self.assertEqual(code, 400)

    def test_command_queue_and_poll(self):
        code, j = _req(self.port, "/board/command", {"type": "zoom_to_fit"})
        self.assertEqual(code, 200)
        code, j = _req(self.port, "/board/poll")
        self.assertEqual(code, 200)
        self.assertEqual(j["commands"], [{"type": "zoom_to_fit"}])
        code, j = _req(self.port, "/board/poll")  # drained
        self.assertEqual(j["commands"], [])

    def test_command_requires_type(self):
        code, _ = _req(self.port, "/board/command", {"x": 1})
        self.assertEqual(code, 400)

    def test_add_image_validates_path(self):
        code, _ = _req(self.port, "/board/command", {"type": "add_image", "url": "/missing.png"})
        self.assertEqual(code, 404)
        code, _ = _req(self.port, "/board/command", {"type": "add_image", "url": "/../etc/passwd"})
        self.assertEqual(code, 404)
        code, j = _req(self.port, "/board/command", {"type": "add_image", "url": "/fig.png"})
        self.assertEqual(code, 200)
        _, j = _req(self.port, "/board/poll")
        self.assertEqual(j["commands"][0]["url"], "/fig.png")


    def test_notes_load_empty_then_save_roundtrip(self):
        code, j = _req(self.port, "/notes/load")
        self.assertEqual(code, 200)
        self.assertEqual(j["markdown"], "")
        md = "# Idées\n\n- albédo\n- feu\n"
        code, j = _req(self.port, "/notes/save", {"markdown": md})
        self.assertEqual(code, 200)
        self.assertTrue(j["ok"])
        code, j = _req(self.port, "/notes/load")
        self.assertEqual(j["markdown"], md)
        with open(os.path.join(self.tmp.name, "notes.md"), encoding="utf-8") as f:
            self.assertEqual(f.read(), md)

    def test_notes_save_rejects_non_string(self):
        code, _ = _req(self.port, "/notes/save", {"markdown": {"nope": 1}})
        self.assertEqual(code, 400)


if __name__ == "__main__":
    unittest.main()
