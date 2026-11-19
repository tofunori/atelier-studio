// Pilote de la visite guidée : ouvre le projet d'exemple et prépare l'état
// dont parle chaque arrêt (galerie, figure, documents). Chargé à la demande
// au premier « Commencer » — le budget d'entrée est plein — et branché sur
// l'App par le contexte qu'elle publie (lib/guidedTour, provideTourContext).
import { t } from "./i18n";
import { wsSend } from "./wsBus";
import { whenGalleryFrameReady } from "./galleryFrameReady";
import { TOUR_STEPS, tourSnapshot, type TourDriver, type TourStepId } from "./guidedTour";
import type { GalleryCommandRequest } from "./galleryCommandBridge";

type Setter<T> = (value: T | ((current: T) => T)) => void;

/** Ce que l'App expose à la visite, relu à chaque appel. */
export type TourAppContext = {
  activeProject: string | null;
  atelierUrl: string | null;
  openFileTab: (rel: string) => void;
  selectProject: (root: string) => void;
  /** galerie remise sur sa grille (bouton Galerie de la barre) */
  selectSurfaceFromBar: (surface: "atelier") => void;
  /** panneau de l'atelier montré, sans toucher à la galerie */
  switchToSurface: (surface: "atelier") => void;
  addProject: () => Promise<boolean>;
  closeOverlays: () => void;
  setProjects: Setter<string[]>;
  setActiveView: (view: "chats") => void;
  setLayout: Setter<"split" | "chat" | "atelier">;
  setActiveTab: (tab: string) => void;
};

const FIGURE = "figures/bilan_masse_annuel.png";
const DOCUMENTS = ["documents/article.tex", "analyse.ipynb", "documents/rapport.docx"];

function requestExample(): Promise<string> {
  const requestId = `example-${Math.random().toString(36).slice(2)}`;
  return new Promise<string>((resolve, reject) => {
    const timer = window.setTimeout(() => finish({ error: t("tour.example-timeout") }), 20_000);
    function finish(reply: { root?: string; error?: string }) {
      window.clearTimeout(timer);
      window.removeEventListener("project-created", onReply);
      if (reply.root) resolve(reply.root);
      else reject(new Error(reply.error || t("tour.example-timeout")));
    }
    function onReply(event: Event) {
      const msg = (event as CustomEvent).detail as { requestId?: string; root?: string; error?: string };
      if (msg?.requestId === requestId) finish(msg);
    }
    window.addEventListener("project-created", onReply);
    if (!wsSend({ type: "createExampleProject", requestId })) finish({ error: t("projects.create-offline") });
  });
}

export function createTourDriver(context: () => TourAppContext | null): TourDriver {
  let exampleRoot: string | null = null;

  const stillOn = (step: TourStepId) => {
    const tour = tourSnapshot();
    return tour.phase === "step" && TOUR_STEPS[tour.step] === step;
  };

  // Les fichiers ne s'ouvrent qu'une fois le projet d'exemple actif et son
  // serveur galerie prêt (quelques secondes au premier lancement).
  const whenExampleReady = (step: TourStepId, then: (app: TourAppContext, root: string) => void, attempt = 0) => {
    const app = context();
    if (!app || !stillOn(step)) return;
    const root = exampleRoot;
    if (root && app.activeProject !== root) app.selectProject(root);
    if (!root || app.activeProject !== root || !app.atelierUrl) {
      if (attempt < 50) window.setTimeout(() => whenExampleReady(step, then, attempt + 1), 300);
      return;
    }
    then(app, root);
  };

  return {
    openExample: async () => {
      const root = await requestExample();
      exampleRoot = root;
      const app = context();
      if (!app) return;
      app.closeOverlays();
      app.setProjects((current) => (current.includes(root) ? current : [...current, root]));
      if (app.activeProject !== root) app.selectProject(root);
      app.setActiveView("chats");
      app.setLayout("split");
    },
    prepare: (step) => {
      const app = context();
      if (!app) return;
      switch (step) {
        case "projects":
        case "chat":
        case "surfaces":
          app.setLayout((current) => (current === "atelier" ? "split" : current));
          return;
        case "gallery":
          app.selectSurfaceFromBar("atelier");
          app.setActiveTab("gallery");
          return;
        case "annotate":
          // la figure s'ouvre dans la visionneuse de la galerie, là où vit
          // « Annoter » (même chemin qu'une pilule .png du chat)
          whenExampleReady(step, (ready, root) => {
            // pas selectSurfaceFromBar : il remet la grille et refermerait
            // la figure qu'on ouvre
            ready.switchToSurface("atelier");
            ready.setActiveTab("gallery");
            void whenGalleryFrameReady(15_000).then(() => {
              if (!stillOn(step) || context()?.activeProject !== root) return;
              window.dispatchEvent(new CustomEvent("atelier-gallery-command", {
                detail: {
                  action: "open",
                  mode: "viewer",
                  projectRoot: root,
                  requestId: crypto.randomUUID(),
                  rels: [FIGURE],
                } satisfies GalleryCommandRequest,
              }));
            }).catch(() => {});
          });
          return;
        case "documents":
          whenExampleReady(step, (ready) => {
            for (const rel of DOCUMENTS) ready.openFileTab(rel);
          });
          return;
      }
    },
    openOwnFolder: () => { void context()?.addProject(); },
  };
}
