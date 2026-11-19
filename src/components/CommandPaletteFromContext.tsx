// Palette de commandes montée par l'App : les rangées (lib/palette) se
// construisent ici, dans le chunk chargé à l'ouverture, et non plus dans
// l'entrée (budget d'entrée, visite guidée 2026-11-19).
import { useMemo } from "react";
import CommandPalette from "./CommandPalette";
import { buildItems, type PaletteContext } from "../lib/palette";

export default function CommandPaletteFromContext({ context, onClose }: {
  context: PaletteContext;
  onClose: () => void;
}) {
  const items = useMemo(() => buildItems(context), [context]);
  return <CommandPalette open items={items} onClose={onClose} />;
}
