// Mouvement de l'envoi d'un message (« B · Envol », choisi par Thierry le
// 2026-11-09 sur maquette animée), chargé à part (voir sendMotion.ts). Trois pièces, toutes sans état React :
//  - landAtBottom : un seul défilement vers le bas du fil, la cible étant
//    recalculée à chaque image (rangée estimée puis mesurée, composeur qui se
//    replie) ;
//  - followBottom : suivi continu du bas pendant un tour (remplace les
//    à-coups du filet, mesurés toutes les ≈ 500 ms) ;
//  - armSendFlight / flySentBubble : le texte quitte le composeur et vole
//    jusqu'à sa bulle, qui ne se montre qu'à l'atterrissage.
// Durées du système (≤ 200 ms), courbe --ease-out ; rien ne bouge sous
// « réduire les animations ».

/** Durée du vol et du défilement d'atterrissage (plafond système : 200 ms). */
export const SEND_FLIGHT_MS = 180;
/** Repli du composeur vidé par l'envoi (= --motion-standard). */
export const COMPOSER_COLLAPSE_MS = 140;
/** Constante de temps du suivi continu : rattrape une ligne en ≈ 3 images. */
const FOLLOW_TAU_MS = 70;
/** Au-delà, une position que le suivi n'a pas écrite = l'utilisateur lit plus
 * haut (même seuil que le bouton « Aller en bas » de ChatTimeline). */
const USER_AWAY_PX = 32;
/** Un envoi armé qui ne trouve pas sa bulle dans ce délai est abandonné
 * (relance mise en file, commande locale, pièce jointe seule…). */
const FLIGHT_MAX_AGE_MS = 800;

/** cubic-bezier(0.16, 1, 0.3, 1) — la courbe --ease-out des jetons. */
export function easeOut(x: number): number {
  const x1 = 0.16, y1 = 1, x2 = 0.3, y2 = 1;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  let t = x;
  for (let i = 0; i < 8; i += 1) {
    const sx = ((ax * t + bx) * t + cx) * t - x;
    const d = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(sx) < 1e-5 || Math.abs(d) < 1e-6) break;
    t = Math.min(1, Math.max(0, t - sx / d));
  }
  return ((ay * t + by) * t + cy) * t;
}

const bottomOf = (el: HTMLElement) => Math.max(0, el.scrollHeight - el.clientHeight);

/** Défile `scroller` jusqu'à son bas en SEND_FLIGHT_MS (à l'image suivante
 * sous « réduire les animations »). Renvoie l'annulation ; `onDone` est
 * appelé dans les deux cas, jamais de façon synchrone. */
export function landAtBottom(scroller: HTMLElement, onDone: () => void): () => void {
  const durationMs = reducedMotion() ? 0 : SEND_FLIGHT_MS;
  let frame = 0;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame);
    onDone();
  };
  const from = scroller.scrollTop;
  let start = -1;
  const step = (now: number) => {
    if (start < 0) start = now;
    const k = durationMs > 0 ? Math.min(1, (now - start) / durationMs) : 1;
    scroller.scrollTop = from + (bottomOf(scroller) - from) * easeOut(k);
    if (k < 1) frame = requestAnimationFrame(step);
    else finish();
  };
  frame = requestAnimationFrame(step);
  return finish;
}

/** Suivi continu du bas : chaque croissance du contenu (ResizeObserver)
 * relance une boucle d'images qui s'arrête dès que le bas est rejoint — rien
 * ne tourne quand le fil est immobile. `paused()` laisse la main à un autre
 * mouvement (atterrissage, saut de marge).
 * `data-following` porte la dernière position écrite par le suivi : un
 * événement scroll qui la retrouve est le nôtre (ChatTimeline n'affiche pas
 * « Aller en bas » pour un écart de quelques images). Toute autre position
 * vient de l'utilisateur (barre de défilement, clavier) : loin du bas, on ne
 * le ramène pas, et le bouton apparaît comme avant. */
export function followBottom(scroller: HTMLElement, paused: () => boolean): () => void {
  let frame = 0;
  let last = 0;
  const mark = () => { scroller.dataset.following = String(scroller.scrollTop); };
  const step = (now: number) => {
    frame = 0;
    if (paused()) return;
    const dt = last ? Math.min(64, now - last) : 16;
    last = now;
    const gap = bottomOf(scroller) - scroller.scrollTop;
    const user = String(scroller.scrollTop) !== scroller.dataset.following;
    if (gap <= 0.5 || (user && gap > USER_AWAY_PX)) { last = 0; return; }
    scroller.scrollTop += gap < 1 ? gap : gap * (1 - Math.exp(-dt / FOLLOW_TAU_MS));
    mark();
    frame = requestAnimationFrame(step);
  };
  const kick = () => { if (!frame) frame = requestAnimationFrame(step); };
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(kick) : null;
  observer?.observe(scroller);
  if (scroller.firstElementChild) observer?.observe(scroller.firstElementChild);
  mark();
  kick();
  return () => {
    delete scroller.dataset.following;
    observer?.disconnect();
    cancelAnimationFrame(frame);
    frame = 0;
  };
}

type Flight = { left: number; top: number; at: number };
let armed: Flight | null = null;

/** Retient d'où part le texte (le champ du formulaire du composeur) au
 * moment de l'envoi. */
export function armSendFlight(form: HTMLElement | null | undefined): void {
  const field = form?.querySelector("textarea");
  if (!field || reducedMotion()) { armed = null; return; }
  const rect = field.getBoundingClientRect();
  armed = { left: rect.left, top: rect.top, at: performance.now() };
  // le texte quitte le champ : son placeholder attend la fin du vol au lieu
  // de se superposer au texte qui part (App.css, .send-armed)
  field.classList.add("send-armed");
  window.setTimeout(() => field.classList.remove("send-armed"), SEND_FLIGHT_MS);
}

function takeSendFlight(): Flight | null {
  const flight = armed;
  armed = null;
  if (!flight || performance.now() - flight.at > FLIGHT_MAX_AGE_MS) return null;
  return flight;
}

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Fait voler une copie de la bulle depuis le composeur jusqu'à `shell`, qui
 * reste invisible pendant le vol. La cible est relue à chaque image : le fil
 * défile et la rangée passe de sa hauteur estimée à sa hauteur mesurée.
 * Sans envoi armé (historique, autre fil), ne fait rien. */
export function flySentBubble(shell: HTMLElement): () => void {
  const flight = takeSendFlight();
  const host = shell.closest<HTMLElement>(".timeline-scroll-wrap");
  const content = shell.querySelector<HTMLElement>(".user-bubble") ?? shell;
  if (!flight || !host || typeof shell.animate !== "function") return () => {};
  const shellStyle = getComputedStyle(shell);
  const contentStyle = getComputedStyle(content);
  const rect = shell.getBoundingClientRect();
  const ghost = content.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("id");
  ghost.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  ghost.setAttribute("aria-hidden", "true");
  ghost.className = "send-flight";
  // La copie vit hors de la rangée : on lui reporte ce qui venait du contexte.
  for (const prop of ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "color", "padding", "borderRadius", "whiteSpace", "overflowWrap"] as const) {
    ghost.style[prop] = contentStyle[prop];
  }
  const background = contentStyle.backgroundColor !== "rgba(0, 0, 0, 0)"
    ? contentStyle.backgroundColor : shellStyle.backgroundColor;
  ghost.style.width = `${rect.width}px`;
  host.appendChild(ghost);
  shell.style.visibility = "hidden";
  // fenêtre où le statut du tour entre en fondu (App.css, .is-sending)
  host.classList.add("is-sending");
  window.setTimeout(() => host.classList.remove("is-sending"), 450);
  // Le texte du champ commence à son bord ; celui de la bulle après son padding.
  const fromX = flight.left - parseFloat(contentStyle.paddingLeft || "0");
  const fromY = flight.top - parseFloat(contentStyle.paddingTop || "0");
  ghost.animate(
    [
      { backgroundColor: "transparent", opacity: 0.6 },
      { opacity: 1, offset: 0.45 },
      { backgroundColor: background, opacity: 1 },
    ],
    { duration: SEND_FLIGHT_MS, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "both" },
  );
  let frame = 0;
  let start = -1;
  let done = false;
  const place = (k: number) => {
    const target = shell.getBoundingClientRect();
    const origin = host.getBoundingClientRect();
    const e = easeOut(k);
    const x = fromX + (target.left - fromX) * e - origin.left;
    const y = fromY + (target.top - fromY) * e - origin.top;
    ghost.style.transform = `translate(${x}px, ${y}px)`;
  };
  const finish = () => {
    if (done) return;
    done = true;
    // Annulé avant la première image (double montage du mode strict de
    // React en dev) : l'envoi reste armé pour le montage suivant.
    if (start < 0) armed = flight;
    cancelAnimationFrame(frame);
    shell.style.visibility = "";
    ghost.remove();
  };
  const step = (now: number) => {
    if (start < 0) start = now;
    const k = Math.min(1, (now - start) / SEND_FLIGHT_MS);
    place(k);
    if (k < 1) frame = requestAnimationFrame(step);
    else finish();
  };
  place(0);
  frame = requestAnimationFrame(step);
  return finish;
}

/** Le composeur vidé par l'envoi se replie en 140 ms au lieu de claquer
 * (le fil sautait de 26 px au même instant). `before` = hauteur avant vidage. */
export function collapseComposer(field: HTMLElement, before: number): void {
  const after = field.offsetHeight;
  if (before <= after + 1 || typeof field.animate !== "function" || reducedMotion()) return;
  field.animate([{ height: `${before}px` }, { height: `${after}px` }],
    { duration: COMPOSER_COLLAPSE_MS, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
}
