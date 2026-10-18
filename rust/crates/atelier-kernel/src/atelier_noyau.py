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
#     {"op": "exec", "id": N, "code": "...", "figdir": "..."}
#     {"op": "vars", "id": N}
#     {"op": "shutdown"}
#   pilote -> Rust (stdout d'origine, dupliqué avant toute exécution) :
#     {"t": "ready", ...}
#     {"t": "stream", "id": N, "name": "stdout"|"stderr", "text": "..."}
#     {"t": "done", "id": N, "status": "ok"|"error", "figures": [...], ...}
#     {"t": "vars", "id": N, "vars": [...]}
#
# Le descripteur 1 est redirigé vers 2 : ce qu'une bibliothèque C écrit
# directement sur stdout ne peut donc pas casser le protocole ; Rust le
# rattache à la cellule en cours.

import ast
import builtins
import io
import json
import linecache
import os
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

    def executer(self, ident, code, dossier_figures=None):
        etat = self.etat
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
        try:
            arbre = ast.parse(code, nom, "exec")
            dernier = None
            if arbre.body and isinstance(arbre.body[-1], ast.Expr):
                dernier = ast.Expression(arbre.body.pop().value)
            exec(compile(arbre, nom, "exec"), self.espace)
            if dernier is not None:
                valeur = eval(compile(dernier, nom, "eval"), self.espace)
                if valeur is not None:
                    self.espace["_"] = valeur
                    resultat = _repr_borne(valeur, RESULT_MAX)
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
            try:
                sys.stdout.flush()
            except Exception:
                pass
            sys.stdout, sys.stderr = stdout, stderr
            etat.cellule = None
        # Hors cellule : les PNG des figures ne comptent pas comme fichiers écrits.
        figures = _capturer_figures(dossier_figures, ident)
        message = {
            "t": "done",
            "id": ident,
            "status": "error" if erreur else "ok",
            "result": resultat,
            "error": erreur,
            "truncated": etat.coupe,
            "files": {"read": sorted(etat.lus), "written": sorted(etat.ecrits)},
            "figures": figures,
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
    espace = sys.modules["__main__"].__dict__
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
