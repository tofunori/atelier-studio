# Contrôle géométrique des figures matplotlib — render-then-verify (§9 de
# Claude Science, consolidé). Livré dans Resources/rust-server/ par
# stage-rust-server.sh ; la consigne <atelier-figure-qc> (send.rs) demande à
# l'agent d'appeler verify() après CHAQUE savefig et de corriger jusqu'à ce
# que ça passe.
#
# Version « par axe » : les paires de textes se comparent DANS un même
# panneau, jamais entre panneaux (sur un multi-panneaux, la version globale
# remonte des dizaines de faux positifs). Trois pièges connus intégrés :
#   1. t.axes vaut None pour les graduations selon la version de matplotlib —
#      l'appartenance texte→panneau se résout par identité (ax.findobj),
#      jamais par l'attribut ;
#   2. get_frame_on() ne suffit pas pour un panneau en axis('off') — il faut
#      aussi getattr(ax, 'axison', True) ;
#   3. les entrées d'une même légende se touchent par construction — exclues.
# Plus le faux positif documenté : matplotlib crée des graduations HORS des
# limites de l'axe en visible=True sans les dessiner (le « 12 » fantôme) —
# filtrées par appartenance à l'intervalle.
#
# Désactivable : ATELIER_FIGURE_QC=off (pipelines batch).

import os


def _actif():
    return os.environ.get("ATELIER_FIGURE_QC", "").strip().lower() not in (
        "off", "0", "non", "false",
    )


def _textes_de_lax(ax, mpl):
    """Textes visibles et non vides du panneau, graduations fantômes exclues."""
    eps = 1e-9
    xlo, xhi = sorted(ax.get_xlim())
    ylo, yhi = sorted(ax.get_ylim())
    xticks = set(ax.get_xticklabels(minor=False)) | set(ax.get_xticklabels(minor=True))
    yticks = set(ax.get_yticklabels(minor=False)) | set(ax.get_yticklabels(minor=True))
    retenus = []
    for t in ax.findobj(mpl.text.Text):
        if not (t.get_text().strip() and t.get_visible()):
            continue
        if t in xticks:
            x = t.get_position()[0]
            if not (xlo - eps <= x <= xhi + eps):
                continue  # graduation fantôme hors limites, jamais dessinée
        elif t in yticks:
            y = t.get_position()[1]
            if not (ylo - eps <= y <= yhi + eps):
                continue
        retenus.append(t)
    return retenus, xticks | yticks


def check(fig=None):
    """Liste les violations géométriques de la figure. [] si tout va bien."""
    if not _actif():
        return []
    import matplotlib as mpl
    import matplotlib.pyplot as plt

    fig = fig or plt.gcf()
    fig.canvas.draw()  # les boîtes n'existent qu'après un rendu
    r = fig.canvas.get_renderer()
    violations = []

    def libelle(t):
        s = t.get_text().strip().replace("\n", " ")
        return s if len(s) <= 40 else s[:37] + "..."

    vus = set()
    for ax in fig.axes:
        # TOUT texte appartenant à un panneau est « vu », même écarté par le
        # filtre (graduation fantôme, panneau axis('off')) — sinon la passe de
        # niveau figure le repêcherait et le dénoncerait à tort.
        vus.update(ax.findobj(mpl.text.Text))
        if not getattr(ax, "axison", True):
            continue  # schéma en axis('off') : ses graduations ne comptent pas
        textes, ticks = _textes_de_lax(ax, mpl)
        boites = [(t, t.get_window_extent(r)) for t in textes]
        leg = ax.get_legend()
        dans_legende = set(leg.get_texts()) if leg else set()

        # 1. paires de textes du même panneau (hors intérieur d'une légende)
        for i, (a, ba) in enumerate(boites):
            for b, bb in boites[i + 1:]:
                if a in dans_legende and b in dans_legende:
                    continue
                if ba.overlaps(bb):
                    violations.append(
                        f"chevauchement : '{libelle(a)}' <-> '{libelle(b)}'"
                    )

        # 2. texte contre épine — sauf les graduations sur la leur
        epines = [(s, s.get_window_extent(r)) for s in ax.spines.values()
                  if s.get_visible()]
        for t, bt in boites:
            if t in ticks:
                continue
            for _s, bs in epines:
                if bt.overlaps(bs):
                    violations.append(f"sort du cadre : '{libelle(t)}'")
                    break

        # 3. sortie du canevas : coupé à l'export
        for t, bt in boites:
            if not fig.bbox.contains(bt.x0, bt.y0) or not fig.bbox.contains(bt.x1, bt.y1):
                violations.append(f"déborde de la figure : '{libelle(t)}'")

    # textes posés sur la figure elle-même (suptitle, fig.text)
    for t in fig.findobj(mpl.text.Text):
        if t in vus or not (t.get_text().strip() and t.get_visible()):
            continue
        bt = t.get_window_extent(r)
        if not fig.bbox.contains(bt.x0, bt.y0) or not fig.bbox.contains(bt.x1, bt.y1):
            violations.append(f"déborde de la figure : '{libelle(t)}'")

    return violations


def _coupable_du_redimensionnement(fig):
    """Nomme CE qu'il faut retirer, pas la liste des suspects.

    Le premier essai réel (2026-08-30) a coûté deux tours à l'agent : le
    message citait tight_layout / constrained_layout / bbox_inches sans dire
    lequel était en cause, et il a doublé le figsize au lieu de retirer le
    coupable. On l'identifie donc par introspection."""
    import matplotlib as mpl

    causes = []
    if str(mpl.rcParams.get("savefig.bbox", "")).lower() == "tight":
        causes.append(
            "rcParams['savefig.bbox'] vaut 'tight' → pose "
            "mpl.rcParams['savefig.bbox'] = 'standard'"
        )
    if mpl.rcParams.get("figure.constrained_layout.use"):
        causes.append(
            "rcParams['figure.constrained_layout.use'] est True → pose-le à False"
        )
    moteur = None
    try:
        moteur = fig.get_layout_engine()
    except AttributeError:
        pass  # matplotlib < 3.6
    if moteur is not None:
        causes.append(
            f"la figure porte un moteur de mise en page ({type(moteur).__name__}) "
            "→ construis-la sans layout='constrained'/'tight' et sans "
            "fig.tight_layout(), et règle les marges avec fig.subplots_adjust(...)"
        )
    if causes:
        return "cause : " + " ; ".join(causes) + "."
    # aucune trace globale : c'est l'appel lui-même qui l'a demandé
    return (
        "cause : savefig a reçu bbox_inches='tight' (ou pad_inches) — retire "
        "cet argument et règle les marges avec fig.subplots_adjust(...). Le "
        "figsize n'est PAS en cause : l'agrandir ne fera que déplacer l'écart."
    )


def verify(fig=None, path=None, dpi=None):
    """La porte dure du §9 : lève AssertionError tant que la figure n'est pas
    propre. À appeler juste APRÈS savefig, dans la même session Python.
    Corrige la mise en page et ré-enregistre jusqu'à ce que ça passe."""
    if not _actif():
        return []
    import matplotlib.pyplot as plt

    fig = fig or plt.gcf()
    problemes = []

    # (a) les dimensions écrites sont celles demandées — un écart signale
    # tight_layout / bbox_inches='tight' qui a redimensionné en silence
    if path and os.path.exists(path) and str(path).lower().endswith(".png"):
        try:
            from PIL import Image
            d = dpi or fig.dpi
            attendu = (round(fig.get_figwidth() * d), round(fig.get_figheight() * d))
            reel = Image.open(path).size
            if reel != attendu:
                problemes.append(
                    f"dimensions {reel} != attendues {attendu} — "
                    + _coupable_du_redimensionnement(fig)
                )
        except ImportError:
            pass  # PIL absent : le contrôle géométrique reste entier

    # (b) aucun chevauchement, aucune sortie de cadre ni de canevas
    problemes += check(fig)

    if problemes:
        raise AssertionError(
            "figure non conforme (%d) :\n  - %s"
            % (len(problemes), "\n  - ".join(problemes))
        )
    return []
