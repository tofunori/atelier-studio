import { useEffect, useState } from "react";

/** État React miroité en JSON dans le localStorage sous `key`. Lu une fois au
 *  montage (valeur absente ou illisible → `fallback`), réécrit à chaque
 *  changement. Le miroir disque (settings.json) reste géré par App. */
export function useStoredJson<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue] as const;
}
