"""External deterministic grading; no model calls or hidden rubric in trial folders."""
import csv
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import site
import subprocess
import sys
import tempfile


def same(got, expected):
    if isinstance(expected, bool) or expected is None:
        return got is expected
    if isinstance(expected, (float, int)):
        return not isinstance(got, bool) and isinstance(got, (float, int)) and math.isfinite(got) and math.isclose(got, expected, abs_tol=1e-7, rel_tol=1e-5)
    if isinstance(expected, dict):
        return isinstance(got, dict) and all(k in got and same(got[k], v) for k, v in expected.items())
    if isinstance(expected, list):
        return isinstance(got, list) and len(got) == len(expected) and all(same(a,b) for a,b in zip(got, expected))
    return got == expected


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def answer(path):
    try:
        if (Path(path) / 'answer.json').is_symlink():
            return {}
        value = json.loads((Path(path) / 'answer.json').read_text())
        return value if isinstance(value, dict) else {}
    except (ValueError, OSError):
        return {}


def check_figure(path):
    from PIL import Image
    checks = {}
    try:
        with Image.open(path / 'figure.png') as image:
            checks['figure_dimensions'] = image.size == (600, 400)
            checks['figure_nonblank'] = len(image.convert('RGB').getcolors(1_000_000) or []) > 30
        with (path / 'series.csv').open() as f:
            expected = sorted([(float(r['year']), float(r['albedo'])) for r in csv.DictReader(f)])
        with (path / 'plotted.csv').open() as f:
            got = [(float(r['year']), float(r['albedo'])) for r in csv.DictReader(f)]
        checks['plotted_data'] = got == expected
    except Exception:
        for key in ('figure_dimensions', 'figure_nonblank', 'plotted_data'):
            checks.setdefault(key, False)
    return checks


def replay(case, folder, mutation=False):
    """Fresh folder with inputs and the submitted script only; no existing output."""
    spec = case.get('mutation') if mutation else None
    inputs = dict(case['files'])
    if spec:
        inputs.update(spec['files'])
    expected = spec['expected'] if spec else case['expected']
    with tempfile.TemporaryDirectory(prefix='atelier-science-replay-') as temp:
        root = Path(temp).resolve()
        for name, data in inputs.items():
            (root / name).write_text(data)
        source = Path(folder) / case['script']
        if not source.is_file() or source.is_symlink():
            return False
        shutil.copyfile(source, root / case['script'])
        # No inherited API keys, tokens, user configuration or network in a replay.
        env = {'PATH':'/opt/homebrew/bin:/usr/bin:/bin', 'MPLBACKEND':'Agg',
               'MPLCONFIGDIR':str(root/'.mpl'), 'TMPDIR':str(root),
               'PYTHONDONTWRITEBYTECODE':'1', 'OPENBLAS_NUM_THREADS':'1',
               'OMP_NUM_THREADS':'1', 'LANG':'en_US.UTF-8',
               'PYTHONPATH':site.getusersitepackages()}
        quoted_root = json.dumps(str(root))
        # Keep OS loader operations available; deny user data, external volumes,
        # other temporary workspaces, all network and all writes outside this root.
        profile = ('(version 1)(allow default)(deny network*)(deny file-write*)'
                   '(deny file-read* (subpath "/Users") (subpath "/Volumes") '
                   '(subpath "/private/tmp") (subpath "/private/var/folders"))'
                   f'(allow file-read* (subpath {json.dumps(site.getusersitepackages())}))'
                   f'(allow file-read* file-write* (subpath {quoted_root}))'
                   '(allow file-write* (literal "/dev/null"))')
        try:
            proc = subprocess.run(['/usr/bin/sandbox-exec','-p',profile,sys.executable,case['script']], cwd=root, env=env,
                                  capture_output=True, timeout=20)
            good = proc.returncode == 0 and same(answer(root), expected)
            if case['id'] == '08_measured_figure':
                good = good and all(check_figure(root).values())
            return good
        except (subprocess.TimeoutExpired, OSError):
            return False


def grade(case, folder):
    folder = Path(folder)
    got = answer(folder)
    checks = {key: key in got and same(got[key], val) for key, val in case['expected'].items()}
    checks['inputs_unchanged'] = all((folder/name).is_file() and not (folder/name).is_symlink()
                                    and (folder/name).read_text() == data for name,data in case['files'].items())
    links = any(p.is_symlink() for p in folder.rglob('*'))
    checks['no_external_symlinks'] = not links
    if case['script']:
        checks['fresh_process_reproduction'] = not links and replay(case, folder)
    if case.get('mutation'):
        checks['changed_input_reproduction'] = not links and replay(case, folder, mutation=True)
    if case['id'] == '08_measured_figure':
        checks.update(check_figure(folder) if not links else dict.fromkeys(['figure_dimensions','figure_nonblank','plotted_data'],False))
    if case['id'] == '02_missing_evidence':
        checks['explanation_present'] = isinstance(got.get('explanation'), str) and len(got['explanation'].strip()) > 15
    if case['id'] == '07_uncertain_paragraph':
        checks['paragraph_present'] = isinstance(got.get('paragraph'), str) and len(got['paragraph'].strip()) > 30
    return {'checks': checks, 'score': sum(checks.values()) / len(checks),
            'all_pass': all(checks.values()), 'answer': got,
            'human_review_required': case['id'] in ['02_missing_evidence','07_uncertain_paragraph','08_measured_figure']}
