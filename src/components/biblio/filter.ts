// Filtrage et tri LOCAUX de la bibliothèque (point 3 du plan) : le catalogue
// de la portée est chargé une seule fois, la saisie ne repart JAMAIS sur le
// réseau tant que la portée tient dans la limite serveur.
import type { SortBy, ZoteroItem } from "./types";

/** Plafond accepté par le backend pour un `zoteroSearch` sans `q`. */
export const CATALOG_LIMIT = 5000;

/**
 * Repli casse/accents : NFD puis suppression des diacritiques combinants.
 * « Évêque » et « eveque » deviennent la même clé de comparaison.
 */
export function foldText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

/** Champs indexés localement : titre, auteurs, année, revue/éditeur. */
export function itemHaystack(item: ZoteroItem): string {
  return foldText([item.title, item.creators, item.year, item.publication].filter(Boolean).join(" "));
}

/** Tous les mots de la requête doivent apparaître (ET, insensible aux accents). */
export function matchesQuery(item: ZoteroItem, query: string): boolean {
  const needle = foldText(query).trim();
  if (!needle) return true;
  const hay = itemHaystack(item);
  return needle.split(/\s+/).every((word) => hay.includes(word));
}

export function filterItems(items: ZoteroItem[], query: string): ZoteroItem[] {
  const needle = foldText(query).trim();
  if (!needle) return items;
  return items.filter((item) => matchesQuery(item, needle));
}

export function sortItems(items: ZoteroItem[], sortBy: SortBy): ZoteroItem[] {
  const list = [...items];
  if (sortBy === "added") list.sort((a, b) => (b.dateAdded || "").localeCompare(a.dateAdded || ""));
  if (sortBy === "year") list.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
  if (sortBy === "author") {
    list.sort((a, b) => (a.creators || "\uffff").localeCompare(b.creators || "\uffff", undefined, { sensitivity: "base" }));
  }
  if (sortBy === "title") list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  return list;
}

/** Un surtitre d'année et les références qui lui appartiennent. */
export type BiblioYearGroup = { year: string; items: ZoteroItem[] };

/**
 * Regroupement par année pour les surtitres de la liste (geste 2). L'ordre des
 * GROUPES suit la première apparition — la liste est déjà triée, on ne
 * réordonne rien ; un item sans année tombe dans le groupe `""`, rendu à part.
 */
export function groupByYear(items: ZoteroItem[]): BiblioYearGroup[] {
  const groups: BiblioYearGroup[] = [];
  const byYear = new Map<string, BiblioYearGroup>();
  for (const item of items) {
    const year = (item.year || "").trim();
    let group = byYear.get(year);
    if (!group) {
      group = { year, items: [] };
      byYear.set(year, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

/** Les surtitres n'ont de sens que si l'ordre suit une date (geste 2). */
export function groupsForSort(items: ZoteroItem[], sortBy: SortBy): BiblioYearGroup[] {
  if (sortBy !== "year" && sortBy !== "added") return [{ year: "", items }];
  return groupByYear(items);
}
