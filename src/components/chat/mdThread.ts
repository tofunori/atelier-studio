import { createContext } from "react";

/** Fil du message rendu, pour les actions galerie des images locales du chat. */
export const MdThreadContext = createContext<string | null>(null);
