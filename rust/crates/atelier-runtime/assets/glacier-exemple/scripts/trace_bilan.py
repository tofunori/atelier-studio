"""Trace le bilan de masse annuel du glacier d'exemple.

Valeurs illustratives (glacier fictif), en mètres d'équivalent en eau.
Lancer depuis la racine du projet : python scripts/trace_bilan.py
"""
import csv
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

RACINE = Path(__file__).resolve().parent.parent
annees, bilans = [], []
with open(RACINE / "donnees" / "bilan_masse_annuel.csv", newline="") as f:
    for ligne in csv.DictReader(f):
        annees.append(int(ligne["annee"]))
        bilans.append(float(ligne["bilan_m_eq_eau"]))

fig, ax = plt.subplots(figsize=(7, 3.6), dpi=150)
couleurs = ["#3b6e99" if b >= 0 else "#8a9bb0" for b in bilans]
ax.bar(annees, bilans, color=couleurs, width=0.7)
ax.axhline(0, color="#333333", linewidth=0.8)
ax.set_xlabel("Année")
ax.set_ylabel("Bilan de masse (m éq. eau)")
ax.set_title("Glacier-Exemple : bilan de masse annuel, 2000-2024", fontsize=11)
ax.spines[["top", "right"]].set_visible(False)
ax.grid(axis="y", color="#dddddd", linewidth=0.6)
ax.set_axisbelow(True)
fig.tight_layout()
sortie = RACINE / "figures" / "bilan_masse_annuel.png"
fig.savefig(sortie)
print(f"Figure enregistrée : {sortie.relative_to(RACINE)}")
