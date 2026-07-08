import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateImage, dataUriFromPngBuffer, resolveArkApiKey, ARK_BASE_URL, DEFAULT_MODEL } from "./images.mjs";

function fakeFetch(status, jsonBody) {
  return async (url, init) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => jsonBody,
    _url: url,
    _init: init,
  });
}

describe("images provider (BytePlus ModelArk)", () => {
  it("t2i: appelle le bon endpoint avec les champs Pro requis (sans seed/n/guidance_scale)", async () => {
    let captured;
    const fetchImpl = async (url, init) => {
      captured = { url, init };
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ b64_json: "QUJD", size: "2048x2048" }], usage: { generated_images: 1 } }),
      };
    };
    const result = await generateImage({ prompt: "un glacier au coucher du soleil", size: "2K", apiKey: "sk-test", fetchImpl });
    expect(captured.url).toBe(ARK_BASE_URL);
    const body = JSON.parse(captured.init.body);
    expect(body).toEqual({
      model: DEFAULT_MODEL,
      prompt: "un glacier au coucher du soleil",
      size: "2K",
      output_format: "png",
      response_format: "b64_json",
      watermark: false,
    });
    expect(body).not.toHaveProperty("seed");
    expect(body).not.toHaveProperty("n");
    expect(body).not.toHaveProperty("guidance_scale");
    expect(body).not.toHaveProperty("stream");
    expect(captured.init.headers.Authorization).toBe("Bearer sk-test");
    expect(result).toEqual({ b64: "QUJD", size: "2048x2048", model: DEFAULT_MODEL, usage: { generated_images: 1 } });
  });

  it("i2i: inclut le champ image en data URI bien formé", async () => {
    let captured;
    const fetchImpl = async (url, init) => {
      captured = { url, init };
      return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: "eHl6" }] }) };
    };
    const editImageDataUri = dataUriFromPngBuffer(Buffer.from("xyz"));
    expect(editImageDataUri).toBe("data:image/png;base64,eHl6");
    await generateImage({ prompt: "ajoute une échelle", editImageDataUri, apiKey: "sk-test", fetchImpl });
    const body = JSON.parse(captured.init.body);
    expect(body.image).toBe("data:image/png;base64,eHl6");
  });

  it("propage une erreur API lisible (error à la racine)", async () => {
    const fetchImpl = fakeFetch(400, { error: { code: "InvalidParameter", message: "size invalide" } });
    await expect(generateImage({ prompt: "x", apiKey: "sk-test", fetchImpl }))
      .rejects.toThrow("InvalidParameter");
  });

  it("propage une erreur API lisible (error dans data[])", async () => {
    const fetchImpl = fakeFetch(200, { data: [{ error: { code: "ContentFiltered", message: "contenu refusé" } }] });
    await expect(generateImage({ prompt: "x", apiKey: "sk-test", fetchImpl }))
      .rejects.toThrow("ContentFiltered");
  });

  it("refuse sans clé API", async () => {
    await expect(generateImage({ prompt: "x", fetchImpl: fakeFetch(200, {}) }))
      .rejects.toThrow(/clé API/);
  });

  it("refuse un prompt vide", async () => {
    await expect(generateImage({ prompt: "  ", apiKey: "sk-test", fetchImpl: fakeFetch(200, {}) }))
      .rejects.toThrow(/prompt/);
  });
});

describe("resolveArkApiKey", () => {
  const prevEnv = process.env.ARK_API_KEY;
  let dir;
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.ARK_API_KEY;
    else process.env.ARK_API_KEY = prevEnv;
    if (dir) { rmSync(dir, { recursive: true, force: true }); dir = null; }
  });

  function writeConfig(arr) {
    dir = mkdtempSync(join(tmpdir(), "atelier-cfg-"));
    const f = join(dir, "api_providers.json");
    writeFileSync(f, JSON.stringify(arr));
    return f;
  }

  it("résout une entrée image (sans baseURL/models) — régression du filtre chat", () => {
    delete process.env.ARK_API_KEY;
    const f = writeConfig([
      { id: "openrouter", baseURL: "https://x", models: ["a"], apiKey: "sk-chat" },
      { id: "byteplus-images", apiKey: "sk-ark-42", apiKeyEnv: "ARK_API_KEY" },
    ]);
    expect(resolveArkApiKey(f)).toBe("sk-ark-42");
  });

  it("privilégie la variable d'env ARK_API_KEY", () => {
    process.env.ARK_API_KEY = "sk-env";
    const f = writeConfig([{ id: "byteplus-images", apiKey: "sk-file" }]);
    expect(resolveArkApiKey(f)).toBe("sk-env");
  });

  it("renvoie null si aucune entrée byteplus-images", () => {
    delete process.env.ARK_API_KEY;
    const f = writeConfig([{ id: "autre", baseURL: "https://x", models: ["a"], apiKey: "k" }]);
    expect(resolveArkApiKey(f)).toBeNull();
  });
});
