// Primitives de réglages (lot 1) : contrat de rendu des rangées et groupes.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../../../test/render";
import { Advanced, Group, Row, Toggle } from "./index";

beforeEach(() => resetTestState());
afterEach(cleanup);

describe("Row", () => {
  it("rend le titre, la description et le contrôle dans leurs zones", () => {
    renderUi(
      <Row title="Langue" desc="Interface et messages">
        <span data-testid="ctl">Système</span>
      </Row>,
    );
    expect(screen.getByText("Langue")).toHaveClass("set-row-title");
    expect(screen.getByText("Interface et messages")).toHaveClass("set-row-desc");
    expect(screen.getByTestId("ctl").parentElement).toHaveClass("set-row-ctl");
  });

  it("omet la description quand elle n'est pas fournie", () => {
    const { container } = renderUi(<Row title="Langue"><span /></Row>);
    expect(container.querySelector(".set-row-desc")).toBeNull();
  });
});

describe("Group", () => {
  it("rend l'étiquette au-dessus de la carte", () => {
    const { container } = renderUi(
      <Group label="Thème"><Row title="Mode"><span /></Row></Group>,
    );
    expect(screen.getByText("Thème")).toHaveClass("set-group-label");
    expect(container.querySelector(".set-card")).not.toBeNull();
  });

  it("sans étiquette, la carte est rendue seule", () => {
    const { container } = renderUi(<Group><Row title="Mode"><span /></Row></Group>);
    expect(container.querySelector(".set-group-label")).toBeNull();
    expect(container.querySelector(".set-card")).not.toBeNull();
  });
});

describe("Advanced", () => {
  it("est fermé par défaut : le contenu n'est pas dans le document", () => {
    renderUi(
      <Advanced count={2}>
        <Row title="Format d'heure"><span /></Row>
      </Advanced>,
    );
    expect(screen.queryByText("Format d'heure")).toBeNull();
  });

  it("le déclencheur est un bouton nommé, avec aria-expanded", () => {
    renderUi(<Advanced count={2}><Row title="Format d'heure"><span /></Row></Advanced>);
    const trigger = screen.getByRole("button", { name: /Avancé/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("cliquer déplie le contenu et bascule aria-expanded", () => {
    renderUi(<Advanced count={2}><Row title="Format d'heure"><span /></Row></Advanced>);
    const trigger = screen.getByRole("button", { name: /Avancé/ });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Format d'heure")).toBeInTheDocument();
  });

  it("annonce le nombre de réglages repliés", () => {
    renderUi(<Advanced count={3}><Row title="X"><span /></Row></Advanced>);
    expect(screen.getByRole("button", { name: /3 réglages/ })).toBeInTheDocument();
  });
});

describe("Toggle", () => {
  it("expose role=switch avec le nom accessible passé en label", () => {
    renderUi(<Toggle checked={false} onChange={() => {}} label="Notifications" />);
    expect(screen.getByRole("switch", { name: "Notifications" })).toBeInTheDocument();
  });

  it("cliquer appelle onChange avec la valeur inverse", () => {
    const calls: boolean[] = [];
    renderUi(<Toggle checked={false} onChange={(v) => calls.push(v)} label="Notifications" />);
    fireEvent.click(screen.getByRole("switch", { name: "Notifications" }));
    expect(calls).toEqual([true]);
  });
});
