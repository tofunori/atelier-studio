"""Tests du wrapper scripts/atelier-run (python3 -m pytest scripts/tests ou python3 scripts/tests/test_atelier_run.py)."""
import glob
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
WRAPPER = os.path.join(HERE, "..", "atelier-run")


def _run(runs_dir, *cmd, wait=True):
    args = [sys.executable, WRAPPER, "--runs-dir", runs_dir, "--", *cmd]
    proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if wait:
        out, err = proc.communicate(timeout=30)
        return proc.returncode, out.decode(), err.decode()
    return proc


def _manifest(runs_dir):
    files = glob.glob(os.path.join(runs_dir, "*", "run.json"))
    assert len(files) == 1, files
    with open(files[0], encoding="utf-8") as fh:
        return json.load(fh), os.path.dirname(files[0])


class AtelierRunTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.runs = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def test_success_writes_completed_manifest_and_log(self):
        code, out, _ = _run(self.runs, sys.executable, "-c", "print('bonjour'); print('::progress current=3 total=10')")
        self.assertEqual(code, 0)
        self.assertIn("bonjour", out)
        m, d = _manifest(self.runs)
        self.assertEqual(m["state"], "completed")
        self.assertEqual(m["exit_code"], 0)
        self.assertEqual(m["progress"], {"current": 3, "total": 10, "unit": ""})
        self.assertIsNotNone(m["ended_at"])
        self.assertTrue(m["started_at"].endswith("Z"))
        with open(os.path.join(d, "log.txt"), encoding="utf-8") as fh:
            self.assertIn("bonjour", fh.read())

    def test_failure_records_exit_code(self):
        code, _, _ = _run(self.runs, sys.executable, "-c", "import sys; sys.exit(3)")
        self.assertEqual(code, 3)
        m, _ = _manifest(self.runs)
        self.assertEqual(m["state"], "failed")
        self.assertEqual(m["exit_code"], 3)

    def test_missing_binary_is_failed_127(self):
        code, _, _ = _run(self.runs, "atelier-binaire-inexistant-xyz")
        self.assertEqual(code, 127)
        m, _ = _manifest(self.runs)
        self.assertEqual(m["state"], "failed")

    def test_sigterm_is_forwarded_and_recorded_failed(self):
        proc = _run(self.runs, sys.executable, "-c", "import time; print('go', flush=True); time.sleep(30)", wait=False)
        deadline = time.time() + 10
        while time.time() < deadline:
            files = glob.glob(os.path.join(self.runs, "*", "run.json"))
            if files:
                with open(files[0], encoding="utf-8") as fh:
                    if json.load(fh)["state"] == "running":
                        break
            time.sleep(0.05)
        proc.send_signal(signal.SIGTERM)
        proc.communicate(timeout=15)
        m, _ = _manifest(self.runs)
        self.assertEqual(m["state"], "failed")
        self.assertIsNotNone(m["ended_at"])
        self.assertIsNotNone(m["pid"])

    def test_label_defaults_to_script_name(self):
        _run(self.runs, sys.executable, "-c", "pass")
        m, _ = _manifest(self.runs)
        self.assertTrue(m["label"])
        self.assertEqual(m["version"], 1)

    def test_label_ignores_trailing_options(self):
        script = os.path.join(self.runs, "fit_m27.py")
        with open(script, "w") as fh:
            fh.write("import sys; print(sys.argv[1:])\n")
        code, out, _ = _run(self.runs, sys.executable, script, "--years", "2019-2023")
        self.assertEqual(code, 0)
        self.assertIn("['--years', '2019-2023']", out)
        m, _ = _manifest(self.runs)
        self.assertEqual(m["label"], "fit_m27.py")

    def test_child_runs_in_its_own_session(self):
        code, out, _ = _run(self.runs, sys.executable, "-c", "import os; print(os.getsid(0) == os.getpid())")
        self.assertEqual(code, 0)
        self.assertIn("True", out)


if __name__ == "__main__":
    unittest.main()
