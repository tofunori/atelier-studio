"""Synthetic seasonal regression: one dataset, four complementary views.

Run beside the demo files. Gaussian noise SD is known by construction;
95% intervals use the exact normal sampling distribution, not estimated noise.
"""
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


def generate(root):
    rng = np.random.default_rng(2026)
    t = np.linspace(0, 24, 240)
    sigma = 0.12
    def design(time):
        return np.column_stack([np.ones_like(time), time / 24,
                                np.sin(2 * np.pi * time / 12),
                                np.cos(2 * np.pi * time / 12)])
    truth = np.array([0.35, 0.28, 0.42, -0.16])
    X = design(t)
    y = X @ truth + rng.normal(0, sigma, len(t))
    beta = np.linalg.lstsq(X, y, rcond=None)[0]
    covariance = sigma**2 * np.linalg.inv(X.T @ X)
    fitted = X @ beta
    residual = y - fitted
    grid = np.linspace(0, 24, 600)
    G = design(grid)
    mean = G @ beta
    se = np.sqrt(np.einsum('ij,jk,ik->i', G, covariance, G))
    copper, teal, ink = '#aa7857', '#65878c', '#343b40'
    with plt.rc_context({'font.family': 'DejaVu Sans', 'font.size': 10,
                         'axes.titlesize': 12, 'axes.labelsize': 10,
                         'axes.spines.top': False, 'axes.spines.right': False,
                         'axes.edgecolor': '#b7bcbf', 'axes.linewidth': .6,
                         'text.color': ink, 'axes.labelcolor': ink,
                         'xtick.color': '#687177', 'ytick.color': '#687177',
                         'legend.fontsize': 8, 'pdf.fonttype': 42}):
        fig, axes = plt.subplots(2, 2, figsize=(10.8, 7.8), layout='constrained')
        fig.get_layout_engine().set(rect=(.015, .085, .975, .81), hspace=.12, wspace=.08)
        fig.text(.065, .955, 'Seasonal dynamics, resolved', fontsize=21)
        fig.text(.065, .921, 'A synthetic regression study  /  240 observations  /  four views of one model',
                 fontsize=10, color='#687177')
        a, b, c, d = axes.flat
        a.scatter(t, y, s=9, color=teal, alpha=.48, edgecolors='none', label='Observations')
        a.fill_between(grid, mean-1.96*se, mean+1.96*se, color=copper, alpha=.24,
                       label='95% CI · mean')
        a.plot(grid, mean, color=copper, lw=1.8, label='Fitted mean')
        a.set(xlabel='Time (months)', ylabel='Response (a.u.)', xlim=(0,24), xticks=[0,6,12,18,24])
        a.legend(frameon=False, loc='lower left', ncols=1, handlelength=1.7)
        a.set_title('a   Observations & uncertainty', loc='left', pad=12)
        b.scatter(fitted, y, s=13, color=teal, alpha=.5, edgecolors='none')
        limits = [min(y.min(), fitted.min())-.06, max(y.max(), fitted.max())+.06]
        b.plot(limits, limits, color=copper, lw=1.2, ls='--', label='1:1 reference')
        b.set(xlabel='Fitted response (a.u.)', ylabel='Observed response (a.u.)', xlim=limits, ylim=limits)
        r2 = 1 - np.sum(residual**2) / np.sum((y-y.mean())**2)
        b.text(.04, .94, f'In-sample $R^2$ = {r2:.2f}', transform=b.transAxes, va='top', fontsize=9)
        b.legend(frameon=False, loc='lower right')
        b.set_title('b   Observed versus fitted', loc='left', pad=12)
        c.axvline(0, color='#b7bcbf', lw=.8, ls='--')
        positions = np.arange(4)
        c.errorbar(beta, positions, xerr=1.96*np.sqrt(np.diag(covariance)), fmt='o',
                   color=copper, ecolor=copper, markersize=5, capsize=3, lw=1.5, label='Estimate · 95% CI')
        c.scatter(truth, positions, marker='|', s=100, color=ink, linewidths=1.5, label='Generating value', zorder=4)
        c.set(yticks=positions, yticklabels=['Baseline', '24-month trend', 'Sine component', 'Cosine component'],
              xlabel='Coefficient (a.u.)', ylim=(3.6,-.6), xlim=(-.28,.58))
        c.legend(frameon=False, loc='upper center', bbox_to_anchor=(.5,-.22), ncols=2)
        c.set_title('c   Estimated model components', loc='left', pad=12)
        d.axhspan(-1.96*sigma, 1.96*sigma, color=teal, alpha=.07)
        d.axhline(0, color=copper, lw=1.2)
        d.scatter(t, residual, s=11, color=teal, alpha=.55, edgecolors='none')
        d.set(xlabel='Time (months)', ylabel='Residual (a.u.)', xlim=(0,24), xticks=[0,6,12,18,24])
        d.set_title('d   Residual structure', loc='left', pad=12)
        d.text(.04,.96, 'Shading: ±1.96 × generating noise SD', transform=d.transAxes,
               va='top', fontsize=8, color='#687177')
        for ax in axes.flat:
            ax.tick_params(length=3, width=.6)
        fig.text(.065,.044, 'Gaussian linear model · known noise SD = 0.12 · pointwise intervals for the mean',
                 fontsize=8, color='#687177')
        fig.text(.065,.022, 'SYNTHETIC DATA · ATELIER DEMO · NO EMPIRICAL FINDINGS', fontsize=8, color='#687177')
        for extension in ['png', 'pdf']:
            fig.savefig(Path(root) / f'observation-windows.{extension}', dpi=200, facecolor='white')
        plt.close(fig)


if __name__ == '__main__':
    generate(Path(__file__).resolve().parent)
