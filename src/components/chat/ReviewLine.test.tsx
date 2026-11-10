// Ligne « Relecture » (variante B) : repliée par défaut, un seul détail
// ouvert à la fois, vérifiées en trop regroupées, actions par affirmation.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ReviewLine from "./ReviewLine";
import type { Review, ReviewClaim } from "./useReviews";
import { setLanguage, t } from "../../lib/i18n";

let serial = 0;
/** Une relecture neuve à chaque test : le dépli est mémorisé par relecture. */
function review(over: Partial<Review> = {}): Review {
  serial += 1;
  return { threadId: "thread-A", turnId: "turn-1", reviewId: `review-${serial}`, status: "done", verdict: "issues", mode: "claims", ...over };
}

const claim = (id: string, outcome: string, over: Partial<ReviewClaim> = {}): ReviewClaim => ({
  id, outcome, claim: `phrase ${id}`, category: "number", proof: `preuve ${id}`, evidenceIds: [], ...over,
});

const MIXED: ReviewClaim[] = [
  claim("ok-1", "passed", { category: "figure", evidenceIds: ["file:fig4_feux.py"] }),
  claim("ok-2", "passed"),
  claim("warn-1", "inconclusive", { category: "citation", evidenceIds: ["article:williamson2021"] }),
  claim("ok-3", "passed"),
  claim("bad-1", "failed", { claim: "0,42 [cellule 29]", cell: 29, evidenceIds: ["cell-29"],
    proof: "0,42 ne figure pas dans la sortie de la cellule 29 ; valeur la plus proche : 0,38." }),
  claim("ok-4", "passed"),
];

function mount(value: Review, onDismiss = vi.fn()) {
  render(<ReviewLine review={value} onDismiss={onDismiss} />);
  return onDismiss;
}
const expand = () => fireEvent.click(screen.getByText(t("review.name")));
const details = () => document.querySelectorAll(".rv-detail");

beforeEach(() => setLanguage("fr"));
afterEach(cleanup);

describe("ReviewLine", () => {
  it("repliée : une ligne avec le décompte, rien de déplié", () => {
    mount(review({ claims: MIXED }));
    expect(screen.getByText("1 échec, 1 avertissement, 4 vérifiées")).toBeTruthy();
    expect(document.querySelector(".rv-body")).toBeNull();
    expect(screen.getByRole("button", { expanded: false })).toBeTruthy();
  });

  it("tout vérifié : le décompte seul", () => {
    mount(review({ verdict: "ok", claims: [1, 2, 3, 4, 5, 6].map((n) => claim(`ok-${n}`, "passed")) }));
    expect(screen.getByText("6 vérifiées")).toBeTruthy();
  });

  it("dépliée : échecs puis avertissements puis vérifiées, le premier échec ouvert", () => {
    mount(review({ claims: MIXED }));
    expand();
    const titles = [...document.querySelectorAll(".rv-title")].map((node) => node.textContent);
    expect(titles).toEqual([
      t("review.title.number.failed"),
      t("review.title.citation.inconclusive"),
      t("review.title.figure.passed"),
      t("review.more-passed", { n: 3 }),
    ]);
    expect(details()).toHaveLength(1);
    expect(screen.getByText("« 0,42 [cellule 29] »")).toBeTruthy();
    expect(screen.getByText("0,42 ne figure pas dans la sortie de la cellule 29 ; valeur la plus proche : 0,38.")).toBeTruthy();
    expect(screen.getByText("[29]")).toBeTruthy();
    // le constat reste sur les rangées fermées
    expect(screen.getByText("preuve warn-1")).toBeTruthy();
  });

  it("un seul détail ouvert à la fois", () => {
    mount(review({ claims: MIXED }));
    expand();
    fireEvent.click(screen.getByText(t("review.title.citation.inconclusive")));
    expect(details()).toHaveLength(1);
    expect(screen.getByText("« phrase warn-1 »")).toBeTruthy();
    expect(screen.queryByText("« 0,42 [cellule 29] »")).toBeNull();
    expect(screen.getByText("williamson2021")).toBeTruthy();
    // recliquer la rangée ouverte la referme
    fireEvent.click(screen.getByText(t("review.title.citation.inconclusive")));
    expect(details()).toHaveLength(0);
  });

  it("les vérifiées en trop sont regroupées et se déplient d'un clic", () => {
    mount(review({ claims: MIXED }));
    expand();
    expect(document.querySelectorAll('.rv-state[data-outcome="passed"]')).toHaveLength(2);
    fireEvent.click(screen.getByText(t("review.more-passed", { n: 3 })));
    expect(document.querySelectorAll('.rv-state[data-outcome="passed"]')).toHaveLength(5);
  });

  it("deux vérifiées ne se regroupent pas", () => {
    mount(review({ verdict: "ok", claims: [claim("ok-1", "passed"), claim("ok-2", "passed")] }));
    expand();
    expect(document.querySelectorAll(".rv-row")).toHaveLength(2);
    // rien à corriger sur une affirmation vérifiée
    fireEvent.click(screen.getByText("preuve ok-1"));
    expect(screen.queryByRole("button", { name: t("review.correct") })).toBeNull();
    expect(screen.queryByRole("button", { name: t("review.dismiss") })).toBeNull();
  });

  it("Corriger demande la correction de cette affirmation, une seule fois", () => {
    const asked: unknown[] = [];
    const listen = (event: Event) => asked.push((event as CustomEvent).detail);
    window.addEventListener("correct-issues", listen);
    mount(review({ claims: MIXED }));
    expand();
    fireEvent.click(screen.getByRole("button", { name: t("review.correct") }));
    window.removeEventListener("correct-issues", listen);
    expect(asked).toEqual([{ threadId: "thread-A", issues: [{
      claim: "0,42 [cellule 29]",
      problem: "0,42 ne figure pas dans la sortie de la cellule 29 ; valeur la plus proche : 0,38.",
      severity: "review",
    }] }]);
    expect((screen.getByRole("button", { name: t("review.corrected") }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Écarter écarte l'affirmation ouverte", () => {
    const value = review({ claims: MIXED });
    const onDismiss = mount(value);
    expand();
    fireEvent.click(screen.getByRole("button", { name: t("review.dismiss") }));
    expect(onDismiss).toHaveBeenCalledWith(value, "bad-1");
  });

  it("Ouvrir la cellule N ouvre la cellule dans la surface Noyau", () => {
    const focused: unknown[] = [];
    const listen = (event: Event) => focused.push((event as CustomEvent).detail);
    window.addEventListener("kernel-cell-focus", listen);
    mount(review({ claims: MIXED }));
    expand();
    fireEvent.click(screen.getByRole("button", { name: t("kernel.cite-open", { n: 29 }) }));
    window.removeEventListener("kernel-cell-focus", listen);
    expect(focused).toEqual([{ cell: 29 }]);
  });

  it("en cours : la même ligne, avec un indicateur d'attente et rien à déplier", () => {
    mount(review({ status: "running", verdict: undefined }));
    expect(screen.getByText(t("review.name"))).toBeTruthy();
    expect(screen.getByText(t("review.running"))).toBeTruthy();
    expect(document.querySelector('.rv [data-slot="spinner"]')).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("rien à vérifier : dit calmement, sans alerte ni détail", () => {
    mount(review({ verdict: "inconclusive", claims: [], limitations: ["no-verifiable-claim"],
      text: "Aucune affirmation vérifiable n'a été relevée dans la réponse." }));
    expect(screen.getByText(t("review.nothing"))).toBeTruthy();
    expect(screen.queryByText(t("review.inconclusive"))).toBeNull();
    expect(document.querySelector(".rv-state")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("vérifiées mais relecture non concluante : le décompte ne vaut pas validation", () => {
    mount(review({ verdict: "inconclusive", claims: [claim("ok-1", "passed")],
      text: "Des sorties du tour sont coupées ou manquantes dans le journal." }));
    expect(screen.getByText(`1 vérifiée, ${t("review.partial")}`)).toBeTruthy();
    expand();
    expect(screen.getByText("Des sorties du tour sont coupées ou manquantes dans le journal.")).toBeTruthy();
  });

  it("une issue inconnue compte comme un avertissement, jamais comme vérifiée", () => {
    mount(review({ claims: [claim("x", "maybe")] }));
    expect(screen.getByText("1 avertissement")).toBeTruthy();
  });

  it("sans affirmation listée, on peut écarter la relecture entière", () => {
    const value = review({ verdict: "error", mode: "git", error: "revue isolée non supportée" });
    const onDismiss = mount(value);
    expand();
    expect(screen.getByText("revue isolée non supportée")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t("review.dismiss") }));
    expect(onDismiss).toHaveBeenCalledWith(value);
  });

  it("le dépli survit au démontage de la rangée (liste virtualisée)", () => {
    const value = review({ claims: MIXED });
    const first = render(<ReviewLine review={value} onDismiss={vi.fn()} />);
    expand();
    first.unmount();
    render(<ReviewLine review={value} onDismiss={vi.fn()} />);
    expect(details()).toHaveLength(1);
  });
});
