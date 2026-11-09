// Œil du contexte vivant (2026-11-09, variante C) : bouton du rail du
// compositeur, survol = ce que le chat voit, clic = panneau avec interrupteur.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage, t } from "../../lib/i18n";
import type { LiveContext } from "../../lib/liveContext";
import { LiveContextEye, liveContextEyeLabel, type LiveContextBinding } from "./LiveContextEye";

afterEach(cleanup);
beforeEach(() => setLanguage("fr"));

const ROOT = "/home/t/Doctorat";
const tex: LiveContext = {
  path: `${ROOT}/Chapitre1/chapitre1.tex`, name: "chapitre1.tex", kind: "tex", line: 23,
  comments: [{ line: 24, text: "source ?" }, { text: "à vérifier" }],
};

function eye(binding: Partial<LiveContextBinding> = {}) {
  const onToggle = vi.fn();
  const utils = render(
    <span className="composer-context-rail">
      <LiveContextEye binding={{ context: tex, on: true, onToggle, projectRoot: ROOT, ...binding }} />
    </span>,
  );
  const button = utils.container.querySelector<HTMLButtonElement>(".live-eye")!;
  return { onToggle, button, ...utils };
}

describe("LiveContextEye", () => {
  it("dit ce que le chat voit, ou qu'il ne voit rien", () => {
    expect(liveContextEyeLabel({ context: tex, on: true })).toBe("Le chat voit chapitre1.tex ligne 23");
    expect(liveContextEyeLabel({ context: { path: "/x/a.pdf", name: "a.pdf", kind: "pdf", page: 7 }, on: true }))
      .toBe("Le chat voit a.pdf page 7");
    expect(liveContextEyeLabel({ context: tex, on: false })).toBe(t("live-context.off"));
    expect(liveContextEyeLabel({ context: null, on: true })).toBe(t("live-context.idle"));
  });

  it("trois états : allumé, coupé (œil barré), rien d'ouvert", () => {
    const on = eye();
    expect(on.button).toHaveAttribute("data-state", "on");
    expect(on.button).toHaveAccessibleName("Le chat voit chapitre1.tex ligne 23");
    expect(on.button.querySelector("svg.lucide-eye")).toBeTruthy();
    on.unmount();
    const off = eye({ on: false });
    expect(off.button).toHaveAttribute("data-state", "off");
    expect(off.button.querySelector("svg.lucide-eye-off")).toBeTruthy();
    off.unmount();
    const idle = eye({ context: null });
    expect(idle.button).toHaveAttribute("data-state", "idle");
    expect(idle.button.querySelector("svg.lucide-eye")).toBeTruthy();
  });

  it("le clic montre ce qui part (chemin relatif, phrase, commentaires) et l'interrupteur coupe", async () => {
    const { button, onToggle } = eye();
    await act(async () => { fireEvent.click(button); });
    expect(await screen.findByText(t("live-context.share"))).toBeInTheDocument();
    expect(button).toHaveAttribute("data-open");
    expect(screen.getByText("Chapitre1/chapitre1.tex")).toBeInTheDocument();
    expect(screen.getByText("curseur à la ligne 23")).toBeInTheDocument();
    expect(screen.getByText("2 commentaires ouverts dans ce fichier")).toBeInTheDocument();
    const toggle = screen.getByRole("switch", { name: t("live-context.share") });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("coupé : le panneau le dit et l'interrupteur rallume", async () => {
    const { button, onToggle } = eye({ on: false });
    await act(async () => { fireEvent.click(button); });
    expect(await screen.findByText(t("live-context.off-note"))).toBeInTheDocument();
    expect(screen.queryByText("Chapitre1/chapitre1.tex")).toBeNull();
    const toggle = screen.getByRole("switch", { name: t("live-context.share") });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("rien d'ouvert : le panneau invite à ouvrir un fichier", async () => {
    const { button } = eye({ context: null });
    await act(async () => { fireEvent.click(button); });
    expect(await screen.findByText(t("live-context.idle-note"))).toBeInTheDocument();
  });
});
