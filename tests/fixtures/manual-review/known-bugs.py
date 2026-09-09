"""Fichier test pour l'auto review — contient quelques bugs volontaires."""


def moyenne(valeurs):
    # Bug volontaire : division par zéro si liste vide
    return sum(valeurs) / len(valeurs)


def trouver_max(valeurs):
    # Bug volontaire : ignore le premier élément
    maximum = valeurs[0]
    for v in valeurs[1:]:
        if v > maximum:
            maximum = v
    return maximum


def compter_doublons(items):
    # Bug volontaire : mutation du paramètre par défaut
    vus = {}
    doublons = 0
    for item in items:
        if item in vus:
            doublons += 1
        vus[item] = True
    return doublons


def normaliser(valeurs):
    # Bug volontaire : min == max → division par zéro
    mn, mx = min(valeurs), max(valeurs)
    return [(v - mn) / (mx - mn) for v in valeurs]


if __name__ == "__main__":
    print(moyenne([1, 2, 3]))
    print(trouver_max([4, 9, 2]))
    print(compter_doublons([1, 1, 2, 3, 3]))
    print(normaliser([0, 5, 10]))
