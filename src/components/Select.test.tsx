import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Select } from "./Select";
import { renderUi } from "../test/render";

afterEach(cleanup);

describe("Select product adapter", () => {
  it("expose le trigger nommé et affiche le libellé de l'option courante", () => {
    renderUi(
      <Select
        value="one"
        title="Mode"
        options={[{ value: "one", label: "Un" }, { value: "two", label: "Deux" }]}
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Mode" })).toHaveTextContent("Un");
  });

  it("sélectionne une option via le popup Base UI", async () => {
    const onChange = vi.fn();
    renderUi(
      <Select
        value="one"
        title="Mode"
        options={[{ value: "one", label: "Un" }, { value: "two", label: "Deux" }]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Mode" }));
    const option = await screen.findByRole("option", { name: "Deux" });
    fireEvent.pointerDown(option);
    fireEvent.pointerUp(option);
    fireEvent.click(option);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("two"));
  });
});
