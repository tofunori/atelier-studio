// Tests OpenCodeRouter (lot B2, tâche 4). Fixtures : identifiants routés
// RÉELS (mêmes que groupRoutes.test.ts — voir
// rust/crates/atelier-providers/src/opencode.rs), pas de forme inventée.
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { renderUi, resetTestState } from "../../../test/render";
import { setLanguage } from "../../../lib/i18n";
import { groupRoutes, type Route } from "./groupRoutes";
import { OpenCodeRouter } from "./OpenCodeRouter";

beforeEach(() => { resetTestState(); setLanguage("fr"); vi.clearAllMocks(); });
afterEach(cleanup);

// opencode/glm-5.2 et openrouter/z-ai/glm-5.2 : deux routes vers UN modèle
// (GLM 5.2), à des latences et des prix différents — l'exemple qui motive
// tout le lot B2 (voir l'en-tête de groupRoutes.ts).
const glmOpencode: Route = { id: "opencode/glm-5.2", gateway: "opencode", vendor: null, leaf: "glm-5.2", free: false };
const glmOpenrouter: Route = { id: "openrouter/z-ai/glm-5.2", gateway: "openrouter", vendor: "z-ai", leaf: "glm-5.2", free: false };
const kimiForCoding: Route = { id: "kimi-for-coding/k3", gateway: "kimi-for-coding", vendor: null, leaf: "k3", free: false };
const deepseekFree: Route = {
  id: "openrouter/deepseek/deepseek-v4:free", gateway: "openrouter", vendor: "deepseek", leaf: "deepseek-v4", free: true,
};

const ALL_ROUTES = [glmOpencode, glmOpenrouter, kimiForCoding, deepseekFree];
const GATEWAYS = [
  { id: "opencode", count: 1 },
  { id: "openrouter", count: 2 },
  { id: "kimi-for-coding", count: 1 },
];

// Harnais avec état contrôlé — comme SegFixture (controls.test.tsx) : le
// composant est présentationnel, donc un test réaliste doit reboucler
// lui-même les callbacks sur les props (query/activeGateway/pinned), sinon
// on ne vérifie que le premier rendu.
function Fixture(props: {
  routes?: Route[];
  initialGateway?: string | null;
  initialQuery?: string;
  initialPinned?: string[];
  onTogglePin?: (route: Route) => void;
}) {
  const routes = props.routes ?? ALL_ROUTES;
  const [gateway, setGateway] = useState<string | null>(props.initialGateway ?? null);
  const [query, setQuery] = useState(props.initialQuery ?? "");
  const [pinned, setPinned] = useState<string[]>(props.initialPinned ?? []);
  const groups = groupRoutes(routes, pinned);

  return (
    <OpenCodeRouter
      groups={groups}
      gateways={GATEWAYS}
      activeGateway={gateway}
      query={query}
      onGatewayChange={setGateway}
      onQueryChange={setQuery}
      pinned={pinned}
      onTogglePin={(route) => {
        props.onTogglePin?.(route);
        setPinned((prev) => (prev.includes(route.id) ? prev.filter((id) => id !== route.id) : [...prev, route.id]));
      }}
    />
  );
}

describe("OpenCodeRouter — règle n°1 : rien sans filtre", () => {
  it("sans passerelle ni recherche, aucune route ni aucun groupe n'apparaît", () => {
    renderUi(<Fixture />);
    expect(screen.queryByText("glm-5.2")).toBeNull();
    expect(screen.queryByText("opencode/glm-5.2")).toBeNull();
    expect(screen.queryAllByRole("button", { name: /déplier/i })).toHaveLength(0);
  });

  it("affiche le compte total de modèles et de passerelles, avec une invitation à filtrer", () => {
    renderUi(<Fixture />);
    // 3 groupes (glm fusionné, k3, deepseek-v4) répartis sur 3 passerelles.
    expect(screen.getByText(/3 modèles répartis sur 3 passerelles/)).toBeInTheDocument();
    expect(screen.getByText(/choisis une passerelle ou lance une recherche/i)).toBeInTheDocument();
  });

  it("une recherche sans correspondance affiche un état vide nommé, pas un catalogue tronqué", () => {
    renderUi(<Fixture initialQuery="modèle-inexistant-xyz" />);
    expect(screen.getByText(/aucune route ne correspond/i)).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /déplier/i })).toHaveLength(0);
  });
});

describe("OpenCodeRouter — règle n°2 : dépliage de groupe", () => {
  it("un groupe se déplie et montre ses routes avec leur passerelle", () => {
    renderUi(<Fixture initialQuery="glm" />);
    const trigger = screen.getByRole("button", { name: /déplier glm-5.2/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("opencode/glm-5.2")).toBeInTheDocument();
    expect(screen.getByText("openrouter/z-ai/glm-5.2")).toBeInTheDocument();
    // les passerelles de chaque route sont affichées, pas seulement l'id —
    // recherche scopée au groupe déplié : "opencode"/"openrouter" apparaissent
    // AUSSI comme puces de filtre dans la barre d'outils, donc une recherche
    // globale par texte serait ambiguë.
    const openGroup = trigger.closest("li") as HTMLElement;
    expect(within(openGroup).getByText("opencode")).toBeInTheDocument();
    expect(within(openGroup).getByText("openrouter")).toBeInTheDocument();
  });

  it("un second clic replie le groupe et retire ses routes du DOM", () => {
    renderUi(<Fixture initialQuery="glm" />);
    const trigger = screen.getByRole("button", { name: /déplier glm-5.2/i });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: /replier glm-5.2/i }));
    expect(screen.getByRole("button", { name: /déplier glm-5.2/i })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("opencode/glm-5.2")).toBeNull();
  });

  it("un groupe portant une route épinglée s'ouvre d'office", () => {
    renderUi(<Fixture initialQuery="glm" initialPinned={["opencode/glm-5.2"]} />);
    // Le groupe apparaît DEUX fois : une fois dans la carte « épinglées »,
    // une fois dans le catalogue, déjà déplié sans qu'aucun clic n'ait eu lieu.
    const trigger = screen.getByRole("button", { name: /replier glm-5.2/i });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("openrouter/z-ai/glm-5.2")).toBeInTheDocument();
  });
});

describe("OpenCodeRouter — règle n°3 : on épingle une route, pas un modèle", () => {
  it("l'épinglage remonte l'objet route complet, et l'étiquette de l'action parle de route", () => {
    const onTogglePin = vi.fn();
    renderUi(<Fixture initialQuery="glm" onTogglePin={onTogglePin} />);
    fireEvent.click(screen.getByRole("button", { name: /déplier glm-5.2/i }));

    const pinBtn = screen.getByRole("button", { name: /épingler la route opencode\/glm-5\.2/i });
    fireEvent.click(pinBtn);
    expect(onTogglePin).toHaveBeenCalledWith(glmOpencode);
  });

  it("épingler une route de GLM n'affecte pas l'autre route du même groupe", () => {
    renderUi(<Fixture initialQuery="glm" />);
    fireEvent.click(screen.getByRole("button", { name: /déplier glm-5.2/i }));
    fireEvent.click(screen.getByRole("button", { name: /épingler la route opencode\/glm-5\.2/i }));

    // Une fois épinglée, la route apparaît DEUX fois (règle n°4 : carte
    // « épinglées » en tête + catalogue toujours ouvert) — les deux doivent
    // s'accorder sur l'état pressé.
    const opencodePins = screen.getAllByRole("button", { name: /désépingler la route opencode\/glm-5\.2/i });
    expect(opencodePins).toHaveLength(2);
    for (const btn of opencodePins) expect(btn).toHaveAttribute("aria-pressed", "true");

    const openrouterPin = screen.getByRole("button", { name: /épingler la route openrouter\/z-ai\/glm-5\.2/i });
    expect(openrouterPin).toHaveAttribute("aria-pressed", "false");
  });
});

describe("OpenCodeRouter — règle n°4 : les épinglées sont visibles en tête", () => {
  it("une route épinglée reste visible même sans aucun filtre actif", () => {
    renderUi(<Fixture initialPinned={["opencode/glm-5.2"]} />);
    // Toujours aucun filtre : le catalogue lui-même reste vide (règle n°1)...
    expect(screen.getByText(/répartis sur/)).toBeInTheDocument();
    // ...mais la route épinglée est visible, hors catalogue, avec son id complet.
    expect(screen.getByText("opencode/glm-5.2")).toBeInTheDocument();
    expect(screen.getByText(/remontent en tête du sélecteur du chat/i)).toBeInTheDocument();
  });

  it("désépingler depuis la carte « épinglées » retire la route de la tête de liste", () => {
    renderUi(<Fixture initialPinned={["opencode/glm-5.2"]} />);
    fireEvent.click(screen.getByRole("button", { name: /désépingler la route opencode\/glm-5\.2/i }));
    expect(screen.queryByText(/remontent en tête du sélecteur du chat/i)).toBeNull();
  });

  it("sans aucune route épinglée, la carte « épinglées » ne s'affiche pas du tout", () => {
    renderUi(<Fixture />);
    expect(screen.queryByText(/remontent en tête du sélecteur du chat/i)).toBeNull();
  });
});

describe("OpenCodeRouter — accessibilité", () => {
  it("le champ de recherche a un rôle et un nom accessible", () => {
    renderUi(<Fixture />);
    expect(screen.getByRole("searchbox", { name: /filtrer les routes opencode/i })).toBeInTheDocument();
  });

  it("les puces de passerelle forment un groupe de contrôles nommés", () => {
    renderUi(<Fixture />);
    const group = screen.getByRole("radiogroup", { name: /passerelles/i });
    expect(within(group).getByRole("radio", { name: /toutes/i })).toHaveAttribute("aria-checked", "true");
    expect(within(group).getByRole("radio", { name: /openrouter/i })).toBeInTheDocument();
  });

  it("choisir une passerelle filtre le catalogue sans recherche texte", () => {
    renderUi(<Fixture />);
    fireEvent.click(screen.getByRole("radio", { name: /^opencode/i }));
    // opencode ne porte que glm-5.2 : seul ce groupe doit apparaître.
    expect(screen.getByRole("button", { name: /déplier glm-5.2/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /déplier k3/i })).toBeNull();
  });
});

describe("OpenCodeRouter — clavier", () => {
  it("un groupe fermé ne rend pas ses routes : aucun arrêt de tabulation caché derrière", () => {
    renderUi(<Fixture initialQuery="glm" />);
    // Le déclencheur existe, mais les boutons d'épinglage de ses routes
    // n'existent PAS tant que le groupe n'est pas ouvert — un fournisseur à
    // deux cents modèles ne force donc jamais deux cents arrêts de tabulation
    // avant que l'utilisateur n'ait rien déplié.
    expect(screen.queryByRole("button", { name: /épingler la route/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /déplier glm-5.2/i }));
    expect(screen.getAllByRole("button", { name: /épingler la route|désépingler la route/i }).length).toBeGreaterThan(0);
  });
});
