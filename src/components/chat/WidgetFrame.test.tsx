import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WidgetFrame } from "./WidgetFrame";
import type { AgentEvent } from "../../lib/ws";

afterEach(() => cleanup());

const EVENT = {
  kind: "widget",
  id: "w_0123456789abcdef",
  title: "loi de Student — poids des résidus",
  height: 420,
} as Extract<AgentEvent, { kind: "widget" }>;

describe("WidgetFrame — carte réservée", () => {
  it("réserve la hauteur déclarée dès le premier rendu, avant tout chargement", () => {
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    const body = container.querySelector(".widget-body") as HTMLElement;
    expect(body.style.height).toBe("420px");
  });

  it("affiche le titre fourni par l'agent", () => {
    render(<WidgetFrame event={EVENT} threadId="t1" />);
    expect(screen.getByText(EVENT.title)).toBeTruthy();
  });

  it("reprend le châssis de .codeblock", () => {
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    expect(container.querySelector(".codeblock.widget-block")).toBeTruthy();
    expect(container.querySelector(".codeblock-bar")).toBeTruthy();
  });
});
