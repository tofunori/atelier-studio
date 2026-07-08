// Cache LRU borné en taille — évince l'entrée la plus ancienne au-delà de la
// capacité. Utilisé pour mémoïser la coloration syntaxique (highlight.js) dans
// Chat.tsx sans faire fuir la mémoire sur une longue session de chat : chaque
// event ajouté re-rend toute la liste, donc sans cache tous les blocs de code
// de l'historique seraient recolorés à chaque token reçu.

export class LruCache<V> {
  private readonly map = new Map<string, V>();

  constructor(private readonly maxSize: number) {}

  get(key: string): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      // on remonte l'entrée consultée en position la plus récente
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  get size(): number {
    return this.map.size;
  }
}
