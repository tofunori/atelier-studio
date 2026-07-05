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
