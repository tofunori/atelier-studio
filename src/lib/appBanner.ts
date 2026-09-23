/** Bandeau global d'App (connexion sidecar, reçus d'envoi, CLI manquant…). */
export type AppBanner = {
  kind?: "connection";
  requestType?: string;
  clientMessageId?: string;
  threadId?: string;
  projectRoot?: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  closable?: boolean;
};
