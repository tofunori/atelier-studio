// Fichier test #2 pour l'auto review — bugs volontaires en TypeScript

interface Panier {
  items: { nom: string; prix: number; quantite: number }[];
}

// Bug volontaire : ne multiplie pas par la quantité
export function totalPanier(panier: Panier): number {
  return panier.items.reduce((acc, item) => acc + item.prix, 0);
}

// Bug volontaire : off-by-one, dépasse la fin du tableau
export function dernierElement<T>(arr: T[]): T {
  return arr[arr.length];
}

// Bug volontaire : comparaison == au lieu de === + mutation d'argument
export function retirerDoublons(arr: any[]) {
  const resultat = [];
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] == null) continue;
    let doublon = false;
    for (let j = 0; j < resultat.length; j++) {
      if (resultat[j] == arr[i]) doublon = true;
    }
    if (!doublon) resultat.push(arr[i]);
  }
  arr.length = 0; // mutation involontaire de l'argument original
  return resultat;
}

// Bug volontaire : async sans await, retourne une Promise non résolue
export async function chargerDonnees(url: string) {
  const promesse = fetch(url).then((r) => r.json());
  return promesse.data;
}

// Bug volontaire : condition toujours vraie (assignation au lieu de comparaison)
export function estValide(code: number): boolean {
  let valide;
  if ((valide = code === 200)) {
    return true;
  }
  return false;
}

// Bug volontaire ajouté pour test : boucle infinie potentielle (mauvaise condition d'arrêt)
export function compteAReculons(depart: number): number[] {
  const resultat: number[] = [];
  let i = depart;
  while (i !== 0) {
    resultat.push(i);
    i -= 2; // si depart est impair, n'atteint jamais 0 -> boucle infinie
  }
  return resultat;
}

// Bug volontaire ajouté pour test : index hors limites (pas de vérification de tableau vide)
export function premierEtDernier(arr: number[]): { premier: number; dernier: number } {
  return {
    premier: arr[0],
    dernier: arr[arr.length - 1],
  };
}

// Bug volontaire ajouté pour test : fuite potentielle - setInterval jamais nettoyé
export function demarrerPolling(callback: () => void): void {
  setInterval(callback, 1000); // pas de clearInterval, pas de référence retournée
}
