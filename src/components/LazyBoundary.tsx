// Frontière de chargement paresseux (plan 022) : Suspense + ErrorBoundary
// avec retry — un chunk qui échoue (offline, app mise à jour) affiche une
// notice actionnable au design Atelier, jamais un écran vide.
import React, { Suspense } from "react";
import { t } from "../lib/i18n";
import { Button, InlineNotice } from "./ui";

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
