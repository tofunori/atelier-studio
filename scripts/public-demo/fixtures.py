"""Generate original, synthetic material for public Atelier captures."""
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
root = Path('/tmp/atelier-public-demo/Observatory')
root.mkdir(parents=True, exist_ok=True)
plt.rcParams.update({'font.family': 'sans-serif', 'font.size': 11, 'axes.spines.top': False, 'axes.spines.right': False, 'axes.labelcolor': '#555555', 'text.color': '#333333'})
x = np.linspace(0, 12, 150)
y = np.sin(x) * .45 + np.sin(x * 4) * .09
for i, (name, title) in enumerate([('observation-windows', 'One signal, two observation windows'), ('sample-distribution', 'Variation across the sample'), ('pattern-comparison', 'A different view of the same signal')]):
    fig, ax = plt.subplots(figsize=(9, 5.2), layout='constrained')
    if i == 1:
        ax.hist(y, bins=18, color='#b5967c', edgecolor='white'); ax.set(xlabel='Synthetic value', ylabel='Count')
    elif i == 2:
        ax.plot(x[4:-4], np.convolve(y, np.ones(9)/9, mode='valid'), color='#79969b', lw=2, label='Short window')
        ax.plot(x[12:-12], np.convolve(y, np.ones(25)/25, mode='valid'), color='#a37555', lw=2.5, label='Long window')
        ax.set(xlabel='Observation window', ylabel='Smoothed signal'); ax.legend(frameon=False)
    else:
        ax.plot(x, y, color='#b8bec2', lw=1.5, label='Synthetic observations')
        ax.plot(x, np.sin(x)*.45, color='#a37555', lw=2.5, label='Broad pattern')
        ax.set(xlabel='Observation window', ylabel='Relative signal'); ax.legend(frameon=False, loc='upper right')
    fig.get_layout_engine().set(rect=(0, .055, 1, .945))
    ax.set_title(title, loc='left', fontsize=17, pad=22)
    fig.text(.99, .01, 'SYNTHETIC DATA · ATELIER DEMO', ha='right', fontsize=8, color='#777777')
    fig.savefig(root / (name + '.png'), dpi=150)
    if i == 0: fig.savefig(root / 'observation-windows.pdf')
    plt.close(fig)
# Additional figures use a fixed seed so the public demo is reproducible.
rng = np.random.default_rng(42)
extra_figures = [
    ('window-comparison', 'Comparing observation windows'),
    ('signal-relationship', 'Two views of a shared signal'),
    ('correlation-matrix', 'Relationships between signals'),
    ('group-distributions', 'Variation within each group'),
    ('uncertainty-band', 'A pattern and its uncertainty'),
    ('cumulative-pattern', 'How observations accumulate'),
    ('residual-check', 'Checking the remaining variation'),
    ('frequency-spectrum', 'Patterns at different frequencies'),
    ('seasonal-profile', 'A repeating cycle, month by month'),
]
for i, (name, title) in enumerate(extra_figures):
    fig, ax = plt.subplots(figsize=(9, 5.2), layout='constrained')
    if i == 0:
        ax.bar(['2 days', '4 days', '8 days', '16 days', '32 days'], [.81, .73, .59, .42, .26], color=['#c7d1d2', '#aebfc0', '#91a8ab', '#bc987b', '#a37555'])
        ax.set(xlabel='Observation window', ylabel='Relative variation')
    elif i == 1:
        a = rng.normal(size=90)
        b = .7 * a + rng.normal(0, .45, len(a))
        ax.scatter(a, b, s=32, color='#79969b', alpha=.7, edgecolors='none')
        ax.plot([-2.5, 2.5], [-1.75, 1.75], color='#a37555', lw=2)
        ax.set(xlabel='Signal A', ylabel='Signal B')
    elif i == 2:
        data = np.array([[1, .76, .48, -.2], [.76, 1, .62, -.1], [.48, .62, 1, .32], [-.2, -.1, .32, 1]])
        im = ax.imshow(data, cmap='BrBG', vmin=-1, vmax=1)
        ax.set(xticks=range(4), yticks=range(4), xticklabels=list('ABCD'), yticklabels=list('ABCD'))
        for row in range(4):
            for col in range(4):
                ax.text(col, row, f'{data[row,col]:.2f}', ha='center', va='center', color='white' if abs(data[row,col]) > .65 else '#333333')
        fig.colorbar(im, ax=ax, shrink=.8, label='Correlation')
    elif i == 3:
        groups = [rng.normal(v, .2, 70) for v in [.35, .55, .48, .75]]
        parts = ax.violinplot(groups, showmedians=True)
        for body in parts['bodies']:
            body.set_facecolor('#79969b'); body.set_alpha(.65)
        for key in ['cmedians', 'cbars', 'cmins', 'cmaxes']:
            parts[key].set_color('#526e73')
        ax.set(xticks=[1,2,3,4], xticklabels=['A','B','C','D'], xlabel='Synthetic group', ylabel='Relative response')
    elif i == 4:
        trend = .15 + .04 * x + .13 * np.sin(x / 2)
        band = .06 + .012 * x
        ax.fill_between(x, trend-band, trend+band, color='#b5967c', alpha=.25)
        ax.plot(x, trend, color='#a37555', lw=2.5)
        ax.set(xlabel='Observation window', ylabel='Illustrative response')
    elif i == 5:
        values = np.sort(rng.normal(0, 1, 120))
        ax.step(values, np.arange(1,121)/120, color='#79969b', lw=2.5)
        ax.set(xlabel='Synthetic value', ylabel='Cumulative proportion', ylim=(0,1.03))
    elif i == 6:
        residuals = rng.normal(0, .1, len(x))
        ax.axhline(0, color='#a37555', lw=1.5)
        ax.scatter(x, residuals, color='#79969b', alpha=.65, s=20, edgecolors='none')
        ax.set(xlabel='Observation window', ylabel='Synthetic residual')
    elif i == 7:
        frequencies = np.arange(1,21)
        amplitude = .8*np.exp(-((frequencies-3)/1.1)**2)+.35*np.exp(-((frequencies-9)/1.8)**2)+.025
        ax.bar(frequencies, amplitude, color='#79969b', width=.65)
        ax.set(xlabel='Frequency index', ylabel='Relative amplitude')
    else:
        months = np.arange(12)
        ax.plot(months, .5+.3*np.sin((months-2)*np.pi/6), 'o-', color='#a37555', lw=2, markersize=5, label='Series A')
        ax.plot(months, .45+.2*np.sin((months-3)*np.pi/6), 'o-', color='#79969b', lw=2, markersize=5, label='Series B')
        ax.set(xticks=months, xticklabels=list('JFMAMJJASOND'), xlabel='Month', ylabel='Relative signal')
        ax.legend(frameon=False)
    fig.get_layout_engine().set(rect=(0, .055, 1, .945))
    ax.set_title(title, loc='left', fontsize=17, pad=22)
    fig.text(.99, .01, 'SYNTHETIC DATA · ATELIER DEMO', ha='right', fontsize=8, color='#777777')
    fig.savefig(root / (name + '.png'), dpi=150)
    plt.close(fig)

# Use the same runnable source in the editor and for the public hero figure.
from research_figure import generate
generate(root)
(root / 'analysis.py').write_text(Path(__file__).with_name('research_figure.py').read_text())
(root / 'project-brief.md').write_text('# Observatory\n\nA fictional project for demonstrating Atelier.\n\n## Research question\n\nHow can a seasonal model separate a broad trend from periodic variation?\n\n## Scope\n\nAll data is synthetic. The example illustrates a workflow and makes no empirical claim.\n\n## Next steps\n\n1. Fit a seasonal regression to synthetic observations.\n2. Review the figure and its caption.\n3. Draft an introduction with explicit limits.\n')
(root / 'manuscript.tex').write_text(r'''\documentclass[11pt]{article}
\usepackage{amsmath}
\title{Observation windows and visible patterns}
\author{Atelier demonstration}
\date{}
\begin{document}
\maketitle
\section{A question of scale}
A time series can tell different stories depending on the window through which it is observed. Short windows retain local variation. Longer windows make the broad pattern easier to follow.

This fictional study uses a synthetic signal to illustrate the comparison. It demonstrates a research workflow and does not report an empirical finding.
\section{An illustrative signal}
We combine a slowly varying component with a smaller, faster oscillation. The construction is explicit and reproducible:
\[
s(t) = 0.45\sin(t) + 0.09\sin(4t).
\]
Here, the observation coordinate is denoted by $t$. Both components are generated mathematically; neither represents a measurement from a real site.
\section{Comparing two windows}
We average the same signal over a short window and a long window. The longer window smooths local variation while preserving part of the broad cycle. The comparison uses the same axes and units in both cases.

The accompanying gallery presents the signal, its distribution, and several complementary views. Figure annotations record specific editorial changes before the next revision.
\section{Seasonal regression}
The four-panel summary uses a separate synthetic series with 240 observations over 24 months. We fit a linear model with a trend and two seasonal components:
\[
y_i = \beta_0 + \beta_1(t_i/24) + \beta_2\sin(2\pi t_i/12)
+ \beta_3\cos(2\pi t_i/12) + \epsilon_i,
\qquad \epsilon_i \sim \mathcal{N}(0, 0.12^2).
\]
The noise standard deviation is known by construction. The figure shows pointwise 95 percent confidence intervals for the fitted mean and for the coefficients. Observed versus fitted values describe in-sample agreement, not predictive validation.
\section{Interpretation and limits}
A smooth curve is easier to read, but smoothing also removes detail. The choice of window should therefore follow the question being asked.

All figures in this demonstration use synthetic data. A real analysis would require an observation model, an uncertainty assessment, and appropriate references.
\end{document}
''')
print(root)

# The editor's revision view needs a real base commit, even for a demo.
import subprocess
import os
env = {**os.environ, 'GIT_AUTHOR_NAME': 'Atelier Demo', 'GIT_AUTHOR_EMAIL': 'demo@example.invalid', 'GIT_COMMITTER_NAME': 'Atelier Demo', 'GIT_COMMITTER_EMAIL': 'demo@example.invalid'}
def git(*args):
    return subprocess.run(['git', '-C', str(root), *args], env=env, check=True, capture_output=True)
if not (root / '.git').exists():
    git('init', '-b', 'main')
git('add', 'manuscript.tex', 'analysis.py', 'project-brief.md', 'observation-windows.png', 'observation-windows.pdf', 'pattern-comparison.png', 'sample-distribution.png', *[name + '.png' for name, _ in extra_figures])
changed = subprocess.run(['git', '-C', str(root), 'diff', '--cached', '--quiet']).returncode
if changed == 1:
    git('commit', '-m', 'Refresh fictional demonstration materials')
elif changed != 0:
    raise RuntimeError('Unable to inspect demo repository changes')
