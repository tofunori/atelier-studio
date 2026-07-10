// Frontière de chargement paresseux (plan 022) : Suspense + ErrorBoundary
// avec retry — un chunk qui échoue (offline, app mise à jour) affiche une
// notice actionnable au design Atelier, jamais un écran vide.
import React, { Suspense, lazy, useState } from "react";
import { t } from "../lib/i18n";
import { Button, InlineNotice } from "./ui";

// React.lazy mémorise un import rejeté : remonter le même composant lazy
// re-lance l'erreur en cache, jamais l'import. Ce wrapper crée une instance
// lazy NEUVE à chaque montage et n'encaisse que les promesses résolues —
// le retry de la LazyBoundary (remount par clé) relance donc vraiment le
// réseau, et un module déjà chargé reste instantané.
export function lazyWithRetry<P extends object>(
  importer: () => Promise<{ default: React.ComponentType<P> }>,
): React.ComponentType<P> {
  // module résolu, partagé entre montages : jamais de re-fallback ni de
  // re-fetch une fois le chunk arrivé
  let loaded: { default: React.ComponentType<P> } | null = null;
  return function LazyRetry(props: P) {
    const [Comp] = useState(() => {
      // UN import par montage, échec compris — React 19 peut re-lancer
      // l'init d'un lazy rejeté : sans ce memo par montage, un chunk
      // durablement absent (offline) ré-importerait en boucle CPU.
      let pending: Promise<{ default: React.ComponentType<P> }> | null = null;
      return lazy(() => {
        if (loaded) return Promise.resolve(loaded);
        if (!pending) pending = importer().then((m) => { loaded = m; return m; });
        return pending;
      });
    });
    return <Comp {...(props as any)} />;
  };
}

type State = { error: Error | null; attempt: number };

export class LazyBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  State
> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <InlineNotice tone="error" className="lazy-error">
          {t("lazy.chunk-error")}
          <Button
            variant="secondary"
            onClick={() => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))}
          >
            {t("action.retry")}
          </Button>
        </InlineNotice>
      );
    }
    // attempt en clé : un retry remonte le sous-arbre et relance l'import
    return (
      <Suspense key={this.state.attempt} fallback={this.props.fallback}>
        {this.props.children}
      </Suspense>
    );
  }
}
