// Séparateur tiré : les surfaces en iframe (page Word) le savent, s'étirent
// pendant le geste au lieu de refaire leur mise en page à chaque image, et se
// remettent en page dès le lâcher (gallery/src/browser/docx_studio.ts).
export function announcePaneResize(on: boolean) {
  for (const frame of Array.from(document.querySelectorAll("iframe"))) {
    try {
      frame.contentWindow?.postMessage({ type: "atelier-pane-resize", on }, "*");
    } catch {
      // iframe en cours de démontage : rien à prévenir
    }
  }
}
