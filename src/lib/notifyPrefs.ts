// Préférences de notification (Réglages › Général › Notifications). À part de
// notify.ts pour que la section des réglages les lise sans charger le plugin
// de notification (ni casser les tests qui le simulent).
const SYSTEM_KEY = "atelier-studio.notifications";
const IN_APP_KEY = "atelier-studio.notifications.in-app";

const cache = new Map<string, boolean>();

function read(key: string): boolean {
  const known = cache.get(key);
  if (known !== undefined) return known;
  let value = true;
  try {
    const stored = localStorage.getItem(key);
    value = stored === null ? true : stored === "1";
  } catch {
    // Stockage indisponible : on garde la valeur par défaut (activé).
  }
  cache.set(key, value);
  return value;
}

function write(key: string, enabled: boolean): void {
  cache.set(key, enabled);
  try {
    localStorage.setItem(key, enabled ? "1" : "0");
  } catch {
    // Ignore storage failures: callers still get the in-memory value.
  }
}

/** Notifications macOS quand Atelier n'est pas au premier plan. */
export const isSystemEnabled = () => read(SYSTEM_KEY);
export const setSystemEnabled = (enabled: boolean) => write(SYSTEM_KEY, enabled);

/** Bandeau dans l'app quand Atelier est devant mais que le fil n'est pas affiché. */
export const isInAppEnabled = () => read(IN_APP_KEY);
export const setInAppEnabled = (enabled: boolean) => write(IN_APP_KEY, enabled);

export function resetNotifyPrefsForTests() {
  cache.clear();
}
