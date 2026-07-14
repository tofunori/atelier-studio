import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Checkbox, CheckboxIndicator } from "./checkbox";
import { Field, FieldGroup, FieldLabel } from "./field";
import { Input } from "./input";
import { RadioGroup, RadioGroupItem } from "./radio-group";
import { Switch } from "./switch";
import { Textarea } from "./textarea";

afterEach(cleanup);

function ControlsFixture() {
  const [enabled, setEnabled] = useState(false);
  const [selected, setSelected] = useState(false);
  return (
    <FieldGroup>
      <label>
        <Switch aria-label="Notifications" checked={enabled} onCheckedChange={setEnabled} />
        Notifications
      </label>
      <label>
        <Checkbox aria-label="Model" checked={selected} onCheckedChange={setSelected}>
          <CheckboxIndicator>✓</CheckboxIndicator>
        </Checkbox>
        Model
      </label>
      <Field>
        <FieldLabel>Label</FieldLabel>
        <Input defaultValue="Atelier" />
      </Field>
      <Textarea aria-label="Notes" defaultValue="Notes" />
      <RadioGroup aria-label="Provider" defaultValue="codex">
        <label><RadioGroupItem value="codex" />Codex</label>
        <label><RadioGroupItem value="claude" />Claude</label>
      </RadioGroup>
    </FieldGroup>
  );
}

describe("shadcn form controls", () => {
  it("exposes controlled switch and checkbox semantics", () => {
    render(<ControlsFixture />);
    const switchControl = screen.getByRole("switch", { name: "Notifications" });
    const checkbox = screen.getByRole("checkbox", { name: "Model" });

    expect(switchControl).toHaveAttribute("aria-checked", "false");
    expect(checkbox).toHaveAttribute("aria-checked", "false");
    fireEvent.click(switchControl);
    fireEvent.click(checkbox);
    expect(switchControl).toHaveAttribute("aria-checked", "true");
    expect(checkbox).toHaveAttribute("aria-checked", "true");
  });

  it("keeps native text and multiline field semantics", () => {
    render(<ControlsFixture />);
    expect(screen.getByRole("textbox", { name: "Label" })).toHaveValue("Atelier");
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue("Notes");
    expect(screen.getByRole("radio", { name: "Codex" })).toHaveAttribute("aria-checked", "true");
  });
});
