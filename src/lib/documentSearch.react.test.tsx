import {it, expect} from "vitest";
import {render, cleanup} from "@testing-library/react";
import {findDocumentRanges, highlightDocumentRanges, clearDocumentHighlights} from "./documentSearch";
it("React can update text after fallback highlighting has been cleared", () => {
  const view = render(<p>Alpha beta <strong>bold</strong></p>);
  highlightDocumentRanges(view.container, "reader-search", findDocumentRanges(view.container, "Alpha"));
  clearDocumentHighlights(view.container, "reader-search");
  view.rerender(<p>Gamma beta <strong>bold</strong></p>);
  expect(view.container.textContent).toBe("Gamma beta bold");
  cleanup();
});
