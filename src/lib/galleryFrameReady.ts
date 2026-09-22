const GALLERY_FRAME_READY_SELECTOR = 'iframe[data-atelier-role="gallery"][data-atelier-ready="true"]';

/** Attend que l'iframe galerie soit montée ET chargée (`data-atelier-ready`).
 *  Résout tout de suite si elle l'est déjà ; sinon sonde le DOM (mutations +
 *  filet périodique) jusqu'à `timeoutMs`, puis résout quand même — le bridge
 *  produira alors son erreur habituelle. */
export function whenGalleryFrameReady(timeoutMs: number): Promise<void> {
  if (document.querySelector(GALLERY_FRAME_READY_SELECTOR)) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      observer.disconnect();
      window.clearInterval(tick);
      window.clearTimeout(deadline);
      resolve();
    };
    const check = () => { if (document.querySelector(GALLERY_FRAME_READY_SELECTOR)) finish(); };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-atelier-ready"] });
    const tick = window.setInterval(check, 100);
    const deadline = window.setTimeout(finish, timeoutMs);
  });
}
