import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { t } from "../lib/i18n";
import type { PluginCatalogEntry } from "../lib/plugins";

/** Catalogue de plugins du fournisseur actif (Codex seulement aujourd'hui).
 *  Une seule requête `listPlugins` fait foi à la fois : `requestId` écarte les
 *  réponses périmées. Le dernier catalogue valide de chaque projet reste en
 *  mémoire pour revalider les skills d'un tour mis en file. */
export function usePluginCatalog(
  ws: MutableRefObject<WebSocket | null>,
  activeProject: string | null,
  activeProviderId: string | null,
  wsReady: boolean,
) {
  const [plugins, setPlugins] = useState<PluginCatalogEntry[]>([]);
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [pluginsError, setPluginsError] = useState<string | null>(null);
  const pluginRequestId = useRef(0);
  const pluginCatalogsByProject = useRef(new Map<string, PluginCatalogEntry[]>());
  const requestPlugins = useCallback((projectRoot: string) => {
    const requestId = ++pluginRequestId.current;
    setPlugins([]);
    setPluginsError(null);
    if (ws.current?.readyState !== 1) {
      setPluginsLoading(false);
      setPluginsError(t("plugins.disconnected"));
      return;
    }
    setPluginsLoading(true);
    ws.current.send(JSON.stringify({ type: "listPlugins", projectRoot, requestId }));
  }, [ws]);

  useEffect(() => {
    if (activeProviderId === "codex" && activeProject && wsReady) {
      requestPlugins(activeProject);
    } else {
      ++pluginRequestId.current;
      setPlugins([]);
      setPluginsLoading(false);
      setPluginsError(wsReady ? null : t("plugins.disconnected"));
    }
  }, [activeProject, activeProviderId, wsReady, requestPlugins]);

  /** Réponse `plugins` du sidecar ; ignorée si elle ne répond pas à la dernière requête. */
  function handlePluginsMessage(msg: any) {
    if (msg.requestId !== pluginRequestId.current) return;
    const catalog = Array.isArray(msg.plugins) ? msg.plugins : [];
    setPlugins(catalog);
    if (!msg.error && typeof msg.projectRoot === "string") {
      pluginCatalogsByProject.current.set(msg.projectRoot, catalog);
    }
    setPluginsError(typeof msg.error === "string" ? msg.error : null);
    setPluginsLoading(false);
  }

  function pluginCatalogFor(projectRoot: string): PluginCatalogEntry[] | undefined {
    return pluginCatalogsByProject.current.get(projectRoot);
  }

  return { plugins, pluginsLoading, pluginsError, requestPlugins, handlePluginsMessage, pluginCatalogFor };
}
