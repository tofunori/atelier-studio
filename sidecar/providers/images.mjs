// Provider images scientifiques — BytePlus ModelArk (Seedream).
// Calqué sur providers/openai_api.mjs : résolution de clé via env d'abord,
// puis api_providers.json (entrée manuelle, cf. README/commit pour le format
// attendu : { id: "byteplus-images", apiKeyEnv: "ARK_API_KEY" } ou
// { id: "byteplus-images", apiKey: "..." }).
//
// Le modèle est sorti le jour de l'écriture de ce fichier (2026-07) : son ID
// peut changer. Il est centralisé ici (DEFAULT_MODEL) pour rester facile à
// mettre à jour sans chasser les occurrences dans le code.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolveApiKey } from "./openai_api.mjs";

export const ARK_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations";

const CONFIG_FILE = `${homedir()}/Library/Application Support/atelier-studio/api_providers.json`;

// Modèle par défaut (Seedream 5.0 Pro, ID tel que provisionné dans la console
// BytePlus). L'ID peut changer au jour le jour en phase de lancement : il est
// surchargeable sans rebuild via le champ `model` de l'entrée byteplus-images
// dans api_providers.json (cf. resolveArkModel). Repli connu : "seedream-4-5-...".
export const DEFAULT_MODEL = "dola-seedream-5-0-pro-260628";
export const FALLBACK_MODEL = "seedream-4-5-250828";

const IMAGE_PROVIDER_ID = "byteplus-images";

/**
 * Résout la clé API ARK : env ARK_API_KEY d'abord, sinon api_providers.json.
 * On lit le fichier brut plutôt que loadApiProviderConfigs() : cette dernière
 * filtre les entrées sans baseURL+models (providers de chat) et jetterait donc
 * une entrée image qui n'a qu'une clé.
 */
export function resolveArkApiKey(configFile = CONFIG_FILE) {
  if (process.env.ARK_API_KEY) return process.env.ARK_API_KEY;
  if (!existsSync(configFile)) return null;
  try {
    const raw = JSON.parse(readFileSync(configFile, "utf8"));
    const list = Array.isArray(raw) ? raw : raw?.providers;
    if (!Array.isArray(list)) return null;
    const entry = list.find((p) => p?.id === IMAGE_PROVIDER_ID);
    if (!entry) return null;
    return resolveApiKey({ apiKey: entry.apiKey, apiKeyEnv: entry.apiKeyEnv ?? "ARK_API_KEY" });
  } catch {
    return null;
  }
}

/**
 * Modèle à utiliser : champ `model` de l'entrée byteplus-images si présent,
 * sinon DEFAULT_MODEL. Permet de suivre un renommage d'ID (fréquent au
 * lancement) sans rebuild — juste éditer api_providers.json.
 */
export function resolveArkModel(configFile = CONFIG_FILE) {
  if (!existsSync(configFile)) return DEFAULT_MODEL;
  try {
    const raw = JSON.parse(readFileSync(configFile, "utf8"));
    const list = Array.isArray(raw) ? raw : raw?.providers;
    const entry = Array.isArray(list) ? list.find((p) => p?.id === IMAGE_PROVIDER_ID) : null;
    const model = entry?.model;
    return typeof model === "string" && model.trim() ? model.trim() : DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

function extractError(data, res) {
  const err = data?.error ?? data?.data?.[0]?.error;
  if (err?.message) return `${err.code ? `[${err.code}] ` : ""}${err.message}`;
  return `BytePlus ModelArk: HTTP ${res.status}`;
}

/**
 * Génère une image (texte→image, ou édition si editImagePath/editImageDataUri fourni).
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.size] "1K" | "2K" | "LxH"
 * @param {string} [opts.editImageDataUri] data URI (data:image/png;base64,...) de l'image à éditer
 * @param {string} [opts.apiKey]
 * @param {string} [opts.model]
 * @param {typeof fetch} [opts.fetchImpl]
 */
export async function generateImage({
  prompt,
  size = "2K",
  editImageDataUri = null,
  apiKey,
  model = DEFAULT_MODEL,
  fetchImpl = fetch,
} = {}) {
  if (!prompt || !String(prompt).trim()) throw new Error("prompt requis");
  if (!apiKey) throw new Error("clé API BytePlus manquante (ARK_API_KEY ou api_providers.json)");

  const body = {
    model,
    prompt: String(prompt),
    size,
    output_format: "png",
    response_format: "b64_json",
    watermark: false,
  };
  if (editImageDataUri) body.image = editImageDataUri;

  const res = await fetchImpl(ARK_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok || !data || data.error || data.data?.[0]?.error) {
    throw new Error(extractError(data, res));
  }

  const item = data.data?.[0];
  if (!item?.b64_json) throw new Error("réponse BytePlus sans image (b64_json manquant)");

  return {
    b64: item.b64_json,
    size: item.size ?? size,
    model,
    usage: data.usage ?? null,
  };
}

/** Construit la data URI d'édition à partir d'un chemin PNG local. */
export function dataUriFromPngBuffer(buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}
