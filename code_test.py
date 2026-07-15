"""Petit gestionnaire de tâches utilisé pour tester les diffs d'Atelier."""

import argparse
import json
from dataclasses import dataclass


@dataclass
class Tache:
    """Représente une tâche simple."""

    titre: str
    priorite: int = 1
    terminee: bool = False

    def terminer(self) -> None:
        """Marque la tâche comme terminée."""
        self.terminee = True

    def afficher(self) -> str:
        """Retourne une ligne lisible décrivant la tâche."""
        statut = "x" if self.terminee else " "
        return f"[{statut}] P{self.priorite} — {self.titre}"


class GestionnaireTaches:
    """Stocke et affiche une petite collection de tâches."""

    def __init__(self) -> None:
        self.taches: list[Tache] = []

    def ajouter(self, titre: str, priorite: int = 1) -> Tache:
        tache = Tache(titre=titre, priorite=priorite)
        self.taches.append(tache)
        return tache

    def afficher_toutes(self) -> str:
        if not self.taches:
            return "Aucune tâche."
        return "\n".join(tache.afficher() for tache in self.taches)

    def filtrer(self, terminee: bool) -> list[Tache]:
        """Sélectionne les tâches selon leur état d'avancement."""
        return [tache for tache in self.taches if tache.terminee is terminee]

    def statistiques(self) -> dict[str, int]:
        """Calcule un résumé numérique de la collection."""
        terminees = len(self.filtrer(terminee=True))
        total = len(self.taches)
        return {
            "total": total,
            "terminees": terminees,
            "restantes": total - terminees,
        }

    def afficher_resume(self) -> str:
        statistiques = self.statistiques()
        return (
            f"Total : {statistiques['total']} | "
            f"Terminées : {statistiques['terminees']} | "
            f"Restantes : {statistiques['restantes']}"
        )


def creer_exemple() -> GestionnaireTaches:
    """Construit un jeu de données reproductible pour les essais."""
    gestionnaire = GestionnaireTaches()
    gestionnaire.ajouter("Créer un fichier de test", priorite=3).terminer()
    gestionnaire.ajouter("Observer les modifications", priorite=2)
    gestionnaire.ajouter("Valider le résultat", priorite=1)
    return gestionnaire


def afficher_json(gestionnaire: GestionnaireTaches) -> None:
    """Affiche les tâches dans un format exploitable par un autre programme."""
    contenu = {
        "taches": [
            {
                "titre": tache.titre,
                "priorite": tache.priorite,
                "terminee": tache.terminee,
            }
            for tache in gestionnaire.taches
        ],
        "statistiques": gestionnaire.statistiques(),
    }
    print(json.dumps(contenu, ensure_ascii=False, indent=2))


def lire_arguments() -> argparse.Namespace:
    analyseur = argparse.ArgumentParser(
        description="Démonstration d'un gestionnaire de tâches."
    )
    analyseur.add_argument(
        "--json",
        action="store_true",
        help="afficher le résultat au format JSON",
    )
    return analyseur.parse_args()


def demonstration(format_json: bool = False) -> None:
    gestionnaire = creer_exemple()
    if format_json:
        afficher_json(gestionnaire)
        return

    print("Liste des tâches")
    print("=" * 30)
    print(gestionnaire.afficher_toutes())
    print("-" * 30)
    print(gestionnaire.afficher_resume())


if __name__ == "__main__":
    arguments = lire_arguments()
    demonstration(format_json=arguments.json)
