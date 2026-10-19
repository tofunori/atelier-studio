// Frontière de rendu (audit du 2026-10-18, problème 14) : un message que le
// rendu ne supporte pas, ou une exception dans le chat, n'efface plus toute
// la fenêtre — seule la partie fautive cède la place à une notice avec
// « Recharger », qui la remonte. Même notice que LazyBoundary.
import React from "react";
import { t } from "../lib/i18n";
import { BoundaryNotice } from "./LazyBoundary";

type Props = {
  children: React.ReactNode;
  /** Ce qui n'a pas pu s'afficher, pour la notice. */
  message?: React.ReactNode;
  className?: string;
};

type State = { error: unknown; attempt: number };

export class RenderBoundary extends React.Component<Props, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error ?? new Error("render error") };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("Atelier: rendu en erreur (contenu isolé) :", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <BoundaryNotice
          className={this.props.className ?? "lazy-error"}
          message={this.props.message ?? t("render.error")}
          actionLabel={t("action.reload")}
          onRetry={() => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))}
          error={this.state.error}
        />
      );
    }
    // attempt en clé : « Recharger » remonte le sous-arbre fautif.
    return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
  }
}

/** Exécute `render` dans son propre composant : une exception levée par la
 * fonction elle-même (pas seulement par ses enfants) atteint la frontière. */
export function Deferred({ render }: { render: () => React.ReactNode }) {
  return <>{render()}</>;
}
