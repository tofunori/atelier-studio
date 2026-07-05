import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import cmux_gallery


class ProjectRootTests(unittest.TestCase):
    def test_default_project_root_falls_back_to_start_directory_outside_git(self):
        with tempfile.TemporaryDirectory() as td:
            with patch.object(cmux_gallery, "git_project_root", return_value=None):
                self.assertEqual(cmux_gallery.default_project_root(td), os.path.abspath(td))

    def test_default_project_root_uses_enclosing_git_checkout(self):
        with tempfile.TemporaryDirectory() as td:
            nested = os.path.join(td, "figures", "plots")
            os.makedirs(nested)
            with patch.object(cmux_gallery, "git_project_root", return_value=os.path.abspath(td)):
                self.assertEqual(cmux_gallery.default_project_root(nested), os.path.abspath(td))

    def test_git_project_root_returns_git_toplevel(self):
        root = os.path.abspath("/tmp/example-project")
        result = SimpleNamespace(returncode=0, stdout=root + "\n")
        with patch.object(subprocess, "run", return_value=result) as run:
            self.assertEqual(cmux_gallery.git_project_root("/tmp/example-project/subdir"), root)
            run.assert_called_once_with(
                ["git", "-C", "/tmp/example-project/subdir", "rev-parse", "--show-toplevel"],
                capture_output=True,
                text=True,
                timeout=2,
            )

    def test_root_arg_expands_user_path(self):
        self.assertEqual(cmux_gallery.root_arg("~/example"), os.path.expanduser("~/example"))

    def test_resolve_port_for_host_uses_requested_free_port(self):
        with patch.object(cmux_gallery, "_port_busy", return_value=False):
            self.assertEqual(cmux_gallery.resolve_port_for_host("/tmp/project", 9999), 9999)

    def test_resolve_port_for_host_rejects_requested_busy_port_for_other_server(self):
        with patch.object(cmux_gallery, "_port_busy", return_value=True), \
                patch.object(cmux_gallery, "server_project", return_value="/tmp/other"):
            with self.assertRaises(SystemExit):
                cmux_gallery.resolve_port_for_host("/tmp/project", 9999)

    def test_server_state_round_trip(self):
        with tempfile.TemporaryDirectory() as td:
            log = os.path.join(td, ".fig_thumbs", "cmux-gallery-9999.log")
            cmux_gallery.write_server_state(td, 9999, 12345, log)
            self.assertEqual(cmux_gallery.read_server_state(td, 9999)["pid"], 12345)
            self.assertEqual(cmux_gallery.read_server_state(td, 9999)["port"], 9999)


if __name__ == "__main__":
    unittest.main()
