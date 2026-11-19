# Pilote du noyau Python persistant d'Atelier (chantier 5 du plan
# rattrapage-claude-science-2026-10-18).
#
# Ce fichier tourne DANS le Python de l'utilisateur (son env conda). Il est
# embarqué dans le binaire Rust (`include_str!`) et écrit sur disque au
# lancement : Rust lance et pilote le processus, ce pilote n'est que la
# boucle d'exécution qui garde les variables en mémoire d'une cellule à
# l'autre. Aucune dépendance : il marche avec n'importe quel Python >= 3.8,
# ipykernel compris ou non (24 des 25 envs de Claude Science n'ont pas
# ipykernel, relevé du 2026-10-18).
#
# Protocole : une ligne JSON par message.
#   Rust -> pilote (stdin d'origine) :
#     {"op": "exec", "id": N, "code": "...", "figdir": "...", "rich": bool}
#     {"op": "vars", "id": N}
#     {"op": "shutdown"}
#   pilote -> Rust (stdout d'origine, dupliqué avant toute exécution) :
#     {"t": "ready", ...}
#     {"t": "stream", "id": N, "name": "stdout"|"stderr", "text": "..."}
#     {"t": "display", "id": N, "data": {mime: valeur}}   (seulement si "rich")
#     {"t": "done", "id": N, "status": "ok"|"error", "figures": [...],
#      "result_data": {mime: valeur} (si "rich"),
#      "imports": [...], "lineage": {"created", "modified", "deleted", "used"}, ...}
#     {"t": "vars", "id": N, "vars": [...]}
#
# Le descripteur 1 est redirigé vers 2 : ce qu'une bibliothèque C écrit
# directement sur stdout ne peut donc pas casser le protocole ; Rust le
# rattache à la cellule en cours.

import ast
import base64
import builtins
import io
import json
import linecache
import os
import shlex
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import types

STREAM_MAX = 256 * 1024
RESULT_MAX = 20 * 1024
VAR_REPR_MAX = 160
VARS_MAX = 300
FILES_MAX = 200
FIGURES_MAX = 12
MODULES_MAX = 120
LINEAGE_MAX = 200

_ICI = os.path.abspath(__file__)


class _Etat(object):
    def __init__(self, sortie):
        self.sortie = sortie
        self.verrou = threading.Lock()
        self.cellule = None
        self.envoye = 0
        self.coupe = 0
        self.lus = set()
        self.ecrits = set()

    def envoyer(self, message):
        ligne = json.dumps(message, ensure_ascii=False)
        with self.verrou:
            self.sortie.write(ligne + "\n")
            self.sortie.flush()

    def flux(self, nom, texte):
        cellule = self.cellule
        if cellule is None or not texte:
            return
        reste = STREAM_MAX - self.envoye
        if reste <= 0:
            self.coupe += len(texte)
            return
        if len(texte) > reste:
            self.coupe += len(texte) - reste
            texte = texte[:reste]
        self.envoye += len(texte)
        self.envoyer({"t": "stream", "id": cellule, "name": nom, "text": texte})


class _Flux(io.TextIOBase):
    def __init__(self, etat, nom):
        io.TextIOBase.__init__(self)
        self._etat = etat
        self._nom = nom

    def writable(self):
        return True

    def write(self, texte):
        if not isinstance(texte, str):
            texte = str(texte)
        self._etat.flux(self._nom, texte)
        return len(texte)

    def flush(self):
        pass

    def isatty(self):
        return False

    @property
    def encoding(self):
        return "utf-8"


def _prefixes_ignores():
    bruts = [
        sys.prefix,
        sys.base_prefix,
        sys.exec_prefix,
        os.path.dirname(_ICI),
        tempfile.gettempdir(),
        os.path.expanduser("~/.matplotlib"),
        os.path.expanduser("~/.cache"),
        os.path.expanduser("~/.config/matplotlib"),
        "/dev",
        "/proc",
        "/sys",
        "/System",
        "/usr",
        "/Library",
        "/private/var/folders",
        "/private/var/db",
        "/etc",
        "/opt/homebrew",
    ]
    vus = []
    for p in bruts:
        if p:
            p = os.path.realpath(p)
            if p not in vus:
                vus.append(p)
    return tuple(vus)


def _installer_suivi_fichiers(etat):
    """Relève les fichiers ouverts PENDANT une cellule, par le crochet d'audit
    (PEP 578) : il voit open(), io.open et os.open, donc pandas, numpy et
    matplotlib quand ils passent par Python. Les bibliothèques qui ouvrent en C
    (netCDF4, GDAL, pyarrow) lui échappent ; Rust complète les écritures en
    comparant les dates de modification du dossier du projet."""
    if not hasattr(sys, "addaudithook"):
        return
    ignores = _prefixes_ignores()
    ecriture = os.O_WRONLY | os.O_RDWR | os.O_APPEND | os.O_CREAT

    def crochet(evenement, args):
        if evenement != "open" or etat.cellule is None:
            return
        try:
            chemin = args[0]
            if isinstance(chemin, int) or chemin is None:
                return
            chemin = os.fsdecode(chemin)
            if not os.path.isabs(chemin):
                chemin = os.path.join(os.getcwd(), chemin)
            chemin = os.path.normpath(chemin)
            if chemin.startswith(ignores) or "__pycache__" in chemin:
                return
            if chemin.endswith((".pyc", ".so", ".dylib", ".pth")):
                return
            mode = args[1] if len(args) > 1 else None
            drapeaux = args[2] if len(args) > 2 else 0
            if isinstance(mode, str):
                ecrit = any(c in mode for c in "wax+")
            else:
                ecrit = bool((drapeaux or 0) & ecriture)
            cible = etat.ecrits if ecrit else etat.lus
            if len(cible) < FILES_MAX:
                cible.add(chemin)
        except Exception:
            pass

    sys.addaudithook(crochet)


def _repr_borne(valeur, limite):
    try:
        texte = repr(valeur)
    except Exception as erreur:
        texte = "<repr impossible : %s>" % type(erreur).__name__
    if len(texte) > limite:
        moitie = limite // 2
        texte = texte[:moitie] + "\n… (%d caractères coupés) …\n" % (len(texte) - limite) + texte[-moitie:]
    return texte


def _traceback_utilisateur(erreur):
    """Trace sans les cadres du pilote : l'agent ne doit voir que son code."""
    tb = erreur.__traceback__
    while tb is not None and os.path.abspath(tb.tb_frame.f_code.co_filename) == _ICI:
        tb = tb.tb_next
    if isinstance(erreur, SyntaxError):
        lignes = traceback.format_exception_only(type(erreur), erreur)
    else:
        lignes = traceback.format_exception(type(erreur), erreur, tb)
    return "".join(lignes)


def _capturer_figures(dossier, ident):
    """Enregistre en PNG les figures matplotlib restées ouvertes après la
    cellule, puis les ferme, comme l'affichage en ligne de Jupyter : le
    noyau tourne en Agg, sans fenêtre, et une figure non enregistrée serait
    sinon perdue. Rien n'est importé si la cellule n'a pas chargé pyplot."""
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is None or not dossier:
        return []
    try:
        numeros = list(plt.get_fignums())
    except Exception:
        return []
    if not numeros:
        return []
    chemins = []
    try:
        os.makedirs(dossier, exist_ok=True)
        for rang, numero in enumerate(numeros[:FIGURES_MAX], 1):
            chemin = os.path.join(dossier, "cellule-%d-%d.png" % (ident, rang))
            try:
                plt.figure(numero).savefig(chemin, dpi=144, bbox_inches="tight", facecolor="white")
                chemins.append(chemin)
            except Exception:
                pass
    except Exception:
        pass
    try:
        plt.close("all")
    except Exception:
        pass
    return chemins


# ---------------------------------------------------------------------------
# Affichage riche, comme IPython. Le cahier (op exec avec "rich": true) reçoit
# display(), les rendus _repr_*_ (tableaux pandas en HTML…) et les figures
# matplotlib en ligne, dans l'ordre où la cellule les produit. Sans "rich"
# (l'outil Python du chat), display() écrit simplement le texte.
# ---------------------------------------------------------------------------
RICHE_MAX = 4 * 1024 * 1024
_RICHE = {"actif": False, "ipython": False}
_ETAT = [None]

_REPRS = (
    ("_repr_html_", "text/html"),
    ("_repr_markdown_", "text/markdown"),
    ("_repr_svg_", "image/svg+xml"),
    ("_repr_png_", "image/png"),
    ("_repr_jpeg_", "image/jpeg"),
    ("_repr_latex_", "text/latex"),
    ("_repr_json_", "application/json"),
)


def _est_figure(objet):
    module = type(objet).__module__ or ""
    return module.startswith("matplotlib.figure") and hasattr(objet, "savefig")


def _png_figure(figure):
    tampon = io.BytesIO()
    figure.savefig(tampon, format="png", bbox_inches="tight")
    return base64.b64encode(tampon.getvalue()).decode("ascii")


def _texte_figure(figure):
    try:
        largeur, hauteur = figure.get_size_inches() * figure.dpi
        return "<Figure size %dx%d with %d Axes>" % (largeur, hauteur, len(figure.axes))
    except Exception:
        return "<Figure>"


def _paquet(objet):
    """Paquet MIME d'un objet, comme le formateur d'IPython."""
    donnees = {}
    if _est_figure(objet):
        try:
            donnees["image/png"] = _png_figure(objet)
        except Exception:
            pass
    if not isinstance(objet, type):
        methode = getattr(objet, "_repr_mimebundle_", None)
        if callable(methode):
            try:
                try:
                    paquet = methode(include=None, exclude=None)
                except TypeError:
                    paquet = methode()
            except Exception:
                paquet = None
            if isinstance(paquet, tuple):
                paquet = paquet[0]
            if isinstance(paquet, dict):
                for mime, valeur in paquet.items():
                    donnees.setdefault(mime, valeur)
        for nom, mime in _REPRS:
            if mime in donnees:
                continue
            methode = getattr(objet, nom, None)
            if not callable(methode):
                continue
            try:
                valeur = methode()
            except Exception:
                continue
            if isinstance(valeur, tuple):
                valeur = valeur[0]
            if valeur is not None:
                donnees[mime] = valeur
    propre = {}
    for mime, valeur in donnees.items():
        if isinstance(valeur, (bytes, bytearray)):
            if mime.startswith("image/") and mime != "image/svg+xml":
                valeur = base64.b64encode(bytes(valeur)).decode("ascii")
            else:
                valeur = bytes(valeur).decode("utf-8", "replace")
        if mime == "application/json":
            try:
                if len(json.dumps(valeur)) > RICHE_MAX:
                    continue
            except Exception:
                continue
        elif not isinstance(valeur, str):
            valeur = str(valeur)
        if isinstance(valeur, str) and len(valeur) > RICHE_MAX:
            continue
        propre[mime] = valeur
    propre["text/plain"] = _texte_figure(objet) if _est_figure(objet) else _repr_borne(objet, RESULT_MAX)
    return propre


def _emettre(donnees):
    etat = _ETAT[0]
    if etat is None or etat.cellule is None:
        return
    if _RICHE["actif"]:
        etat.envoyer({"t": "display", "id": etat.cellule, "data": donnees})
    else:
        etat.flux("stdout", str(donnees.get("text/plain", "")) + "\n")


def display(*objets, **options):
    """display() d'IPython : chaque objet devient une sortie de la cellule."""
    brut = options.get("raw", False)
    for objet in objets:
        if brut and isinstance(objet, dict):
            donnees = dict(objet)
            donnees.setdefault("text/plain", "")
        else:
            donnees = _paquet(objet)
        _emettre(donnees)


def _vider_figures(*_args, **_kwargs):
    """plt.show() et fin de cellule : les figures ouvertes deviennent des
    sorties (PNG) puis sont fermées, comme le backend inline de Jupyter."""
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is None:
        return
    try:
        numeros = list(plt.get_fignums())
    except Exception:
        return
    for numero in numeros[:FIGURES_MAX]:
        try:
            figure = plt.figure(numero)
            _emettre({"image/png": _png_figure(figure), "text/plain": _texte_figure(figure)})
        except Exception:
            pass
    try:
        plt.close("all")
    except Exception:
        pass


class _BackendEnLigne(object):
    """MPLBACKEND=module://atelier_inline : Agg pour dessiner, et show()
    affiche dans la cellule au lieu d'avertir « non interactive »."""
    NOM = "atelier_inline"

    def find_spec(self, nom, chemin=None, cible=None):
        if nom != self.NOM:
            return None
        import importlib.util
        return importlib.util.spec_from_loader(nom, self)

    def create_module(self, spec):
        return None

    def exec_module(self, module):
        from matplotlib.backends.backend_agg import FigureCanvasAgg
        module.FigureCanvas = FigureCanvasAgg
        module.show = _vider_figures
        module.backend_version = "atelier"


class _ObjetAffiche(object):
    binaire = False

    def __init__(self, data=None, url=None, filename=None, **options):
        if data is None and filename:
            with open(filename, "rb" if self.binaire else "r") as fichier:
                data = fichier.read()
        self.data = data
        self.url = url
        self.options = options

    def __repr__(self):
        return "<IPython.display.%s object>" % type(self).__name__


def _ipython_minimal():
    """IPython absent : un module IPython.display réduit (display, HTML,
    Markdown, Image…) pour que `from IPython.display import display` marche."""
    ipython = types.ModuleType("IPython")
    module = types.ModuleType("IPython.display")

    class HTML(_ObjetAffiche):
        def _repr_html_(self):
            return self.data

    class Markdown(_ObjetAffiche):
        def _repr_markdown_(self):
            return self.data

    class Latex(_ObjetAffiche):
        def _repr_latex_(self):
            return self.data

    class Math(_ObjetAffiche):
        def _repr_latex_(self):
            texte = (self.data or "").strip()
            return texte if texte.startswith("$") else "$\\displaystyle %s$" % texte

    class SVG(_ObjetAffiche):
        def _repr_svg_(self):
            return self.data

    class JSON(_ObjetAffiche):
        def _repr_json_(self):
            return self.data

    class Image(_ObjetAffiche):
        binaire = True

        def _format(self):
            nom = (self.options.get("format") or self.url or "").lower()
            return "jpeg" if nom.endswith(("jpg", "jpeg")) else "png"

        def _repr_html_(self):
            if self.url and self.data is None:
                return '<img src="%s"/>' % self.url
            return None

        def _repr_png_(self):
            return self.data if self.data is not None and self._format() == "png" else None

        def _repr_jpeg_(self):
            return self.data if self.data is not None and self._format() == "jpeg" else None

    def clear_output(wait=False):
        return None

    for nom, valeur in (("display", display), ("HTML", HTML), ("Markdown", Markdown), ("Latex", Latex),
                        ("Math", Math), ("SVG", SVG), ("JSON", JSON), ("Image", Image),
                        ("clear_output", clear_output)):
        setattr(module, nom, valeur)
    ipython.display = module
    ipython.get_ipython = lambda: None
    # Lu par matplotlib (pyplot, backend_bases) dès que IPython est importé :
    # une version récente lui évite les chemins d'IPython < 8.24.
    ipython.version_info = (9, 0, 0, "atelier")
    ipython.__version__ = "9.0.0+atelier"
    return {"IPython": ipython, "IPython.display": module}


class _IPythonReduit(object):
    """IPython absent : sert le module réduit à `import IPython` seulement.
    Placé en fin de sys.meta_path, il ne masque jamais un vrai IPython, et
    rien n'est inscrit dans sys.modules tant que la cellule ne l'importe pas
    (pandas, tqdm… y cherchent IPython pour se croire dans Jupyter)."""

    def __init__(self):
        self.modules = None

    def find_spec(self, nom, chemin=None, cible=None):
        if nom not in ("IPython", "IPython.display"):
            return None
        import importlib.util
        return importlib.util.spec_from_loader(nom, self, is_package=nom == "IPython")

    def create_module(self, spec):
        if self.modules is None:
            self.modules = _ipython_minimal()
        return self.modules[spec.name]

    def exec_module(self, module):
        return None


def _preparer_ipython():
    """Une fois, au premier passage riche : display d'IPython (s'il est
    installé sans ipykernel) passe par nos sorties ; sinon module réduit."""
    if _RICHE["ipython"]:
        return
    _RICHE["ipython"] = True
    try:
        import IPython.display as reel
    except ImportError:
        sys.meta_path.append(_IPythonReduit())
        return
    except Exception:
        return
    reel.display = display
    for nom in ("IPython.core.display_functions", "IPython.core.display"):
        module = sys.modules.get(nom)
        if module is not None and hasattr(module, "display"):
            module.display = display


# Commandes magiques courantes. Elles ne sont traduites que si la cellule
# n'est pas du Python valide : un vrai code n'est jamais réécrit.
_MAGIES_MUETTES = frozenset(("matplotlib", "config", "load_ext", "reload_ext", "autoreload", "aimport"))


def _magie(nom, arguments):
    if nom == "!" or nom == "sx" or nom == "system":
        return _lancer(arguments, True)
    if nom in ("pip", "conda"):
        if nom == "conda":
            raise RuntimeError("%conda n'est pas disponible dans ce noyau : utilise %pip.")
        return _lancer([sys.executable, "-m", "pip"] + shlex.split(arguments), False)
    if nom == "cd":
        os.chdir(os.path.expanduser(arguments.strip() or "~"))
        print(os.getcwd())
        return None
    if nom == "pwd":
        print(os.getcwd())
        return None
    raise RuntimeError(
        "La commande magique %%%s demande IPython : installe ipykernel dans cet environnement "
        "(pip install ipykernel) pour un noyau Jupyter complet." % nom
    )


def _lancer(commande, coquille):
    processus = subprocess.Popen(
        commande, shell=coquille, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL, universal_newlines=True, bufsize=1,
    )
    try:
        for ligne in processus.stdout:
            sys.stdout.write(ligne)
        processus.wait()
    except KeyboardInterrupt:
        processus.kill()
        raise
    return None


def _traduire_magies(code):
    """Lignes %magie et !commande en appels Python, même numéro de ligne."""
    lignes = code.split("\n")
    sortie = []
    for ligne in lignes:
        corps = ligne.lstrip()
        retrait = ligne[: len(ligne) - len(corps)]
        if corps.startswith("!"):
            sortie.append("%s_atelier_magie(%r, %r)" % (retrait, "!", corps[1:]))
        elif corps.startswith("%") and not corps.startswith("%%"):
            nom, _, arguments = corps[1:].partition(" ")
            if nom in _MAGIES_MUETTES:
                sortie.append(retrait + "pass")
            else:
                sortie.append("%s_atelier_magie(%r, %r)" % (retrait, nom, arguments))
        else:
            sortie.append(ligne)
    return "\n".join(sortie)


# Méthodes qui modifient leur objet en place : `l.append(x)` modifie `l`.
# Les méthodes pandas qui rendent une copie ne comptent qu'avec inplace=True.
_MUTANTES = frozenset((
    "append", "extend", "insert", "remove", "pop", "popitem", "clear", "sort",
    "reverse", "update", "setdefault", "add", "discard", "difference_update",
    "intersection_update", "symmetric_difference_update", "fill", "resize",
    "put", "itemset", "setflags",
))


def _racine(noeud):
    """Nom à la base de `d["x"].y[0]` : d."""
    while isinstance(noeud, (ast.Attribute, ast.Subscript, ast.Starred)):
        noeud = noeud.value
    return noeud.id if isinstance(noeud, ast.Name) else None


def _lire_arbre(arbre):
    """Noms lus et noms modifiés en place, d'après le code seul."""
    lus, mutes = set(), set()
    for noeud in ast.walk(arbre):
        if isinstance(noeud, ast.Name) and isinstance(noeud.ctx, ast.Load):
            lus.add(noeud.id)
        elif isinstance(noeud, (ast.Attribute, ast.Subscript)) and isinstance(noeud.ctx, (ast.Store, ast.Del)):
            nom = _racine(noeud)
            if nom:
                mutes.add(nom)
        elif isinstance(noeud, ast.AugAssign):
            nom = _racine(noeud.target)
            if nom:
                mutes.add(nom)
                lus.add(nom)
        elif isinstance(noeud, ast.Call) and isinstance(noeud.func, ast.Attribute):
            nom = _racine(noeud.func.value)
            inplace = any(k.arg == "inplace" and isinstance(k.value, ast.Constant) and k.value.value is True
                          for k in noeud.keywords)
            if nom and (noeud.func.attr in _MUTANTES or inplace):
                mutes.add(nom)
    return lus, mutes


def _forme(valeur):
    """Empreinte bon marché d'un objet : sa forme ou sa longueur."""
    try:
        forme = getattr(valeur, "shape", None)
        if isinstance(forme, tuple):
            return ("shape",) + tuple(forme)
        if isinstance(valeur, (list, dict, set, bytearray)):
            return ("len", len(valeur))
    except Exception:
        pass
    return None


def _modules_tiers():
    """Modules de premier niveau chargés hors de la bibliothèque standard."""
    noms = []
    for nom, module in list(sys.modules.items()):
        if "." in nom or nom.startswith("_") or nom == "atelier_noyau" or module is None:
            continue
        fichier = getattr(module, "__file__", None) or ""
        if "site-packages" in fichier or "dist-packages" in fichier:
            noms.append(nom)
    noms.sort()
    return noms[:MODULES_MAX]


def _nom_type(valeur):
    t = type(valeur)
    module = getattr(t, "__module__", "")
    nom = getattr(t, "__qualname__", t.__name__)
    if module in ("builtins", "", None):
        return nom
    return "%s.%s" % (module, nom)


class Pilote(object):
    def __init__(self, etat, espace):
        self.etat = etat
        self.espace = espace
        self.de_base = set(espace.keys())

    def _visibles(self):
        """Variables de l'utilisateur : nom → (id, forme)."""
        vues = {}
        for nom, valeur in list(self.espace.items()):
            if nom.startswith("_") or nom in self.de_base or isinstance(valeur, types.ModuleType):
                continue
            vues[nom] = (id(valeur), _forme(valeur))
        return vues

    def executer(self, ident, code, dossier_figures=None, riche=False):
        etat = self.etat
        _RICHE["actif"] = bool(riche)
        if riche:
            _preparer_ipython()
        etat.cellule = ident
        etat.envoye = 0
        etat.coupe = 0
        etat.lus = set()
        etat.ecrits = set()
        nom = "<cellule %d>" % ident
        linecache.cache[nom] = (len(code), None, code.splitlines(True), nom)
        stdout, stderr = sys.stdout, sys.stderr
        sys.stdout = _Flux(etat, "stdout")
        sys.stderr = _Flux(etat, "stderr")
        debut = time.time()
        resultat = None
        erreur = None
        avant = self._visibles()
        lus, mutes = set(), set()
        donnees_resultat = None
        chrono = False
        try:
            source = code
            # Magie de cellule en tête (%%time…) : la première ligne devient
            # vide, les numéros de ligne restent ceux de la cellule.
            premiere, _, reste = code.partition("\n")
            if premiere.lstrip().startswith("%%"):
                magie = premiere.strip()[2:].split(" ")[0]
                if magie == "time":
                    chrono = True
                    source = "\n" + reste
                else:
                    source = "_atelier_magie(%r, '')\n" % ("%" + magie) + reste
            try:
                arbre = ast.parse(source, nom, "exec")
            except SyntaxError as erreur_syntaxe:
                # Pas du Python : peut-être %matplotlib, !pip… (comme IPython).
                try:
                    arbre = ast.parse(_traduire_magies(source), nom, "exec")
                except SyntaxError:
                    raise erreur_syntaxe
            lus, mutes = _lire_arbre(arbre)
            dernier = None
            # « ; » en fin de cellule masque le résultat, comme dans Jupyter.
            muet = code.rstrip().endswith(";")
            if arbre.body and isinstance(arbre.body[-1], ast.Expr):
                dernier = ast.Expression(arbre.body.pop().value)
            exec(compile(arbre, nom, "exec"), self.espace)
            if dernier is not None:
                valeur = eval(compile(dernier, nom, "eval"), self.espace)
                if valeur is not None:
                    self.espace["_"] = valeur
                    plt = sys.modules.get("matplotlib.pyplot")
                    figure_ouverte = (
                        riche and plt is not None and _est_figure(valeur)
                        and getattr(valeur, "number", None) in plt.get_fignums()
                    )
                    if muet or figure_ouverte:
                        # une figure encore ouverte s'affiche en fin de cellule
                        pass
                    else:
                        resultat = _repr_borne(valeur, RESULT_MAX)
                        if riche:
                            # Envoyé tout de suite : comme Jupyter, le
                            # résultat précède les figures de fin de cellule.
                            donnees_resultat = _paquet(valeur)
                            etat.envoyer({"t": "display", "id": ident, "data": donnees_resultat, "result": True})
            if chrono:
                print("Wall time: %.2f s" % (time.time() - debut))
        except BaseException as e:  # KeyboardInterrupt et SystemExit compris
            if isinstance(e, SystemExit) and e.code in (None, 0):
                pass
            else:
                erreur = {
                    "ename": type(e).__name__,
                    "evalue": str(e)[:2000],
                    "traceback": _traceback_utilisateur(e)[-RESULT_MAX:],
                }
        finally:
            if riche:
                # figures restées ouvertes : affichées en ligne, comme Jupyter
                _vider_figures()
            try:
                sys.stdout.flush()
            except Exception:
                pass
            sys.stdout, sys.stderr = stdout, stderr
            etat.cellule = None
        # Hors cellule : les PNG des figures ne comptent pas comme fichiers écrits.
        figures = [] if riche else _capturer_figures(dossier_figures, ident)
        apres = self._visibles()
        crees = sorted(n for n, (ident_obj, _) in apres.items() if n not in avant or avant[n][0] != ident_obj)
        modifies = sorted(
            n for n, (ident_obj, forme) in apres.items()
            if n in avant and avant[n][0] == ident_obj and (n in mutes or forme != avant[n][1])
        )
        lignee = {
            "created": crees[:LINEAGE_MAX],
            "modified": modifies[:LINEAGE_MAX],
            "deleted": sorted(n for n in avant if n not in apres)[:LINEAGE_MAX],
            "used": sorted(n for n in lus if n in avant)[:LINEAGE_MAX],
        }
        message = {
            "t": "done",
            "id": ident,
            "status": "error" if erreur else "ok",
            "result": resultat,
            "result_data": donnees_resultat,
            "error": erreur,
            "truncated": etat.coupe,
            "files": {"read": sorted(etat.lus), "written": sorted(etat.ecrits)},
            "figures": figures,
            "imports": _modules_tiers(),
            "lineage": lignee,
            "duration_ms": int((time.time() - debut) * 1000),
        }
        etat.envoyer(message)

    def variables(self, ident):
        sortie = []
        for nom, valeur in list(self.espace.items()):
            if nom.startswith("_") or nom in self.de_base:
                continue
            if isinstance(valeur, types.ModuleType):
                continue
            info = {"name": nom, "type": _nom_type(valeur)}
            try:
                forme = getattr(valeur, "shape", None)
                if isinstance(forme, tuple) and all(isinstance(x, int) for x in forme):
                    info["shape"] = list(forme)
                dtype = getattr(valeur, "dtype", None)
                if dtype is not None and not callable(dtype):
                    info["dtype"] = str(dtype)
                if not isinstance(valeur, (str, bytes, type)) and hasattr(valeur, "__len__") and "shape" not in info:
                    info["len"] = len(valeur)
            except Exception:
                pass
            if isinstance(valeur, (types.FunctionType, type)):
                info["repr"] = ""
            else:
                info["repr"] = " ".join(_repr_borne(valeur, VAR_REPR_MAX).split())[:VAR_REPR_MAX]
            sortie.append(info)
            if len(sortie) >= VARS_MAX:
                break
        sortie.sort(key=lambda v: v["name"])
        self.etat.envoyer({"t": "vars", "id": ident, "vars": sortie})


def main():
    # Le protocole garde ses propres descripteurs ; le code de l'utilisateur
    # n'a ni stdin (input() rend une fin de fichier) ni le vrai stdout.
    sortie = os.fdopen(os.dup(1), "w", encoding="utf-8")
    entree = os.fdopen(os.dup(0), "r", encoding="utf-8")
    vide = os.open(os.devnull, os.O_RDONLY)
    os.dup2(vide, 0)
    os.close(vide)
    os.dup2(2, 1)
    sys.stdin = io.StringIO("")
    ici = os.path.dirname(_ICI)
    sys.path[:] = [p for p in sys.path if os.path.abspath(p or ".") != ici]

    etat = _Etat(sortie)
    _ETAT[0] = etat
    # display() existe partout, comme dans IPython ; le backend matplotlib
    # « module://atelier_inline » n'est chargé que si on le demande.
    builtins.display = display
    sys.meta_path.insert(0, _BackendEnLigne())
    espace = sys.modules["__main__"].__dict__
    espace["_atelier_magie"] = _magie
    pilote = Pilote(etat, espace)
    _installer_suivi_fichiers(etat)
    etat.envoyer({
        "t": "ready",
        "pid": os.getpid(),
        "python": sys.version.split()[0],
        "executable": sys.executable,
        "prefix": sys.prefix,
        "cwd": os.getcwd(),
    })
    while True:
        try:
            ligne = entree.readline()
        except KeyboardInterrupt:
            # Interruption arrivée entre deux cellules : rien à arrêter.
            continue
        if not ligne:
            break
        ligne = ligne.strip()
        if not ligne:
            continue
        try:
            requete = json.loads(ligne)
        except ValueError:
            continue
        op = requete.get("op")
        try:
            if op == "exec":
                pilote.executer(
                    int(requete.get("id", 0)),
                    str(requete.get("code", "")),
                    requete.get("figdir") or None,
                    bool(requete.get("rich")),
                )
            elif op == "vars":
                pilote.variables(int(requete.get("id", 0)))
            elif op == "shutdown":
                break
        except KeyboardInterrupt:
            # Interruption tombée hors du code de la cellule (pendant l'envoi
            # du résultat) : la cellule est déjà finie, on continue.
            continue


if __name__ == "__main__":
    main()
