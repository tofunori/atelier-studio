import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../test/render";
import { setLanguage } from "../lib/i18n";
import { MarkdownImage } from "./chat/md";
import { MdThreadContext } from "./chat/mdThread";

describe("figure locale dans le chat", () => {
  beforeEach(() => { resetTestState(); setLanguage("fr"); });
  afterEach(() => cleanup());

  it("offre d'ouvrir ou d'enregistrer dans la galerie quand le fil est connu", async () => {
    renderUi(<MdThreadContext.Provider value="fil"><MarkdownImage src="/tmp/plot.png" alt="Albédo" /></MdThreadContext.Provider>);
    expect(await screen.findByAltText("Albédo")).toBeTruthy();
    expect(screen.getByLabelText("Ouvrir dans la galerie")).toBeTruthy();
    expect(screen.getByLabelText("Enregistrer dans la galerie")).toBeTruthy();
  });

  it("reste une image simple hors d'un fil ou pour une image web", async () => {
    renderUi(<>
      <MarkdownImage src="/tmp/plot.png" alt="locale" />
      <MdThreadContext.Provider value="fil"><MarkdownImage src="https://exemple.org/a.png" alt="web" /></MdThreadContext.Provider>
    </>);
    expect(await screen.findByAltText("locale")).toBeTruthy();
    expect(screen.getByAltText("web")).toBeTruthy();
    expect(screen.queryByLabelText("Ouvrir dans la galerie")).toBeNull();
  });
});
