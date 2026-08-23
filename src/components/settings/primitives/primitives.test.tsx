// Primitives de réglages (lot 1) : contrat de rendu des rangées et groupes.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../../../test/render";
import { Group, Row } from "./index";

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
