import { getCurrentWindow } from "@tauri-apps/api/window";
import { t } from "../lib/i18n";

// Feux custom (décorations natives coupées, cf. tauri.conf.json) : placés au
// sommet du rail → rail étroit collé tout en haut, aucune bande de titre.
// Rouge = fermer, jaune = réduire, vert = plein écran (toggle).
export default function WindowControls() {
  const win = getCurrentWindow();
  const close = () => void win.close();
  const minimize = () => void win.minimize();
  const fullscreen = async () => {
    try { await win.setFullscreen(!(await win.isFullscreen())); } catch {}
  };
  // stopPropagation : ne pas déclencher le drag de la zone parente au clic
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className="win-ctrls">
      <button className="wc wc-close" onMouseDown={stop} onClick={close} title={t("window.close")} aria-label={t("window.close")} />
      <button className="wc wc-min" onMouseDown={stop} onClick={minimize} title={t("window.minimize")} aria-label={t("window.minimize")} />
      <button className="wc wc-full" onMouseDown={stop} onClick={fullscreen} title={t("window.fullscreen")} aria-label={t("window.fullscreen")} />
    </div>
  );
}
