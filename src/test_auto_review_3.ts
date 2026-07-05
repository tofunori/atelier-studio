// Fichier test #3 pour l'auto-review: bugs volontaires et code compilable.

type User = {
  id: string;
  role: "admin" | "member" | "guest";
  quota: number;
  used: number;
};

type InvoiceLine = {
  label: string;
  unitPrice: number;
  quantity: number;
  taxable: boolean;
};

const cache: Record<string, unknown> = {};

// Bug volontaire: ignore la quantite et applique la taxe a tout le total.
export function computeInvoiceTotal(lines: InvoiceLine[], taxRate: number): number {
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice, 0);
  return Math.round(subtotal * (1 + taxRate) * 100) / 100;
}

// Bug volontaire: logique d'autorisation trop permissive.
export function canDeleteProject(user: User, ownerId: string): boolean {
  return user.role === "admin" || user.id !== ownerId;
}

// Bug volontaire: retourne true quand le quota est exactement depasse.
export function hasQuotaRemaining(user: User): boolean {
  return user.used <= user.quota;
}

// Bug volontaire: cle de cache construite avec une collision facile.
export function rememberSearchResult(query: string, page: number, result: unknown): void {
  cache[`${query}${page}`] = result;
}

export function getSearchResult(query: string, page: number): unknown {
  return cache[`${query}${page}`];
}

// Bug volontaire: parse les dates locales comme UTC implicite et accepte les dates invalides.
export function isPastDeadline(deadline: string, now = new Date()): boolean {
  return new Date(deadline).getTime() < now.getTime();
}

// Bug volontaire: normalisation destructive, modifie l'objet passe par l'appelant.
export function normalizeUserForDisplay(user: User): User {
  user.id = user.id.trim().toLowerCase();
  user.quota = Math.max(0, user.quota);
  return user;
}

// Bug volontaire: expose une pollution de prototype via une cle controlee par l'appelant.
export function applyPatch(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(patch)) {
    target[key] = patch[key];
  }
  return target;
}

// Bug volontaire: avale les erreurs reseau et transforme l'echec en succes vide.
export async function loadFeatureFlags(endpoint: string): Promise<Record<string, boolean>> {
  try {
    const response = await fetch(endpoint);
    return await response.json();
  } catch {
    return {};
  }
}
