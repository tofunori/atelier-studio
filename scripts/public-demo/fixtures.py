"""Generate original, synthetic material for public Atelier captures."""
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
root = Path('/tmp/atelier-public-demo/Observatory')
root.mkdir(parents=True, exist_ok=True)
plt.rcParams.update({'font.family': 'sans-serif', 'font.size': 11, 'axes.spines.top': False, 'axes.spines.right': False, 'axes.labelcolor': '#555555', 'text.color': '#333333'})
x = np.linspace(0, 12, 150)
y = np.sin(x) * .45 + np.sin(x * 4) * .09
for i, (name, title) in enumerate([('observation-windows', 'One signal, two observation windows'), ('sample-distribution', 'Variation across the sample'), ('pattern-comparison', 'A different view of the same signal')]):
    fig, ax = plt.subplots(figsize=(9, 5.2), layout='constrained')
    if i == 1:
        ax.hist(y, bins=18, color='#b5967c', edgecolor='white'); ax.set(xlabel='Synthetic value', ylabel='Count')
    else:
        ax.plot(x, y, color='#b8bec2', lw=1.5, label='Synthetic observations')
        ax.plot(x, np.sin(x)*.45, color='#a37555', lw=2.5, label='Broad pattern')
        ax.set(xlabel='Observation window', ylabel='Relative signal'); ax.legend(frameon=False, loc='upper right')
    ax.set_title(title, loc='left', fontsize=17, pad=22)
    fig.text(.99, .01, 'SYNTHETIC DATA · ATELIER DEMO', ha='right', fontsize=8, color='#777777')
    fig.savefig(root / (name + '.png'), dpi=150)
    if i == 0: fig.savefig(root / 'observation-windows.pdf')
    plt.close(fig)
(root / 'analysis.py').write_text('''"""Observation windows — a synthetic demonstration."""

import numpy as np
import matplotlib.pyplot as plt

# Generate an illustrative signal. No empirical data is used.
window = np.linspace(0, 12, 150)
pattern = 0.45 * np.sin(window)
variation = 0.09 * np.sin(4 * window)
observations = pattern + variation

fig, ax = plt.subplots(figsize=(9, 5))
ax.plot(window, observations, color="#b8bec2", label="Observations")
ax.plot(window, pattern, color="#a37555", label="Broad pattern")
ax.set(
    title="One signal, two observation windows",
    xlabel="Observation window",
    ylabel="Relative signal",
)
ax.legend(frameon=False)
fig.tight_layout()
fig.savefig("observation-windows.png", dpi=150)
''')
(root / 'project-brief.md').write_text('# Observatory\n\nA fictional project for demonstrating Atelier.\n\n## Research question\n\nHow does the observation window affect the patterns visible in a time series?\n\n## Scope\n\nAll data is synthetic. The example illustrates a workflow and makes no empirical claim.\n\n## Next steps\n\n1. Compare observation windows.\n2. Review the figure and its caption.\n3. Draft an introduction with explicit limits.\n')
print(root)

# The editor's revision view needs a real base commit, even for a demo.
import subprocess
import os
env = {**os.environ, 'GIT_AUTHOR_NAME': 'Atelier Demo', 'GIT_AUTHOR_EMAIL': 'demo@example.invalid', 'GIT_COMMITTER_NAME': 'Atelier Demo', 'GIT_COMMITTER_EMAIL': 'demo@example.invalid'}
def git(*args):
    return subprocess.run(['git', '-C', str(root), *args], env=env, check=True, capture_output=True)
if not (root / '.git').exists():
    git('init', '-b', 'main')
git('add', 'analysis.py', 'project-brief.md', 'observation-windows.png', 'observation-windows.pdf', 'pattern-comparison.png', 'sample-distribution.png')
changed = subprocess.run(['git', '-C', str(root), 'diff', '--cached', '--quiet']).returncode
if changed == 1:
    git('commit', '-m', 'Refresh fictional demonstration materials')
elif changed != 0:
    raise RuntimeError('Unable to inspect demo repository changes')
