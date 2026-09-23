// Harnais de parité KB (plan 065 C2 → contrat de référence) — rejoue contre
// le binaire `atelier-kb-rs` RÉEL (un vrai spawn, jamais un appel in-process)
// les fixtures figées dans kb_parity/fixtures/*.json. Les fixtures ont été
// gelées par exécution du CLI Node historique (`sidecar/kb_cli.mjs`, retiré
// du dépôt le 2026-09-14) ; elles sont depuis le contrat argv/stdin -> JSON
// que le moteur Rust doit satisfaire à l'identique.
//
//   node --test gallery/tests/kb_parity.test.mjs
//   node gallery/tests/kb_parity.test.mjs        (équivalent)
//
// Résolution du binaire : `KB_PARITY_BIN=<chemin>`, sinon
// `cargo build -p atelier-kb --bin atelier-kb-rs` (debug, incrémental : quasi
// gratuit si déjà à jour) puis rust/target/debug/atelier-kb-rs. Le binaire
// suivi par git dans src-tauri/rust-server-dist/ n'est JAMAIS pris : il date
// du dernier stage-rust-server.sh et peut être périmé par rapport à la source
// (2026-09-22 : binaire du 2026-09-11, 7 fixtures rouges en CI). Le harnais ne
// saute jamais silencieusement faute de binaire.
//
// Design (voir kb_parity/README.md pour le détail) :
//  - gbrain est TOUJOURS simulé (fake-gbrain.mjs via ATELIER_TEST_GBRAIN) —
//    jamais le NAS réel, ni en lecture ni en écriture.
//  - MinerU est désactivé (ATELIER_MINERU_SCRIPT pointe vers un chemin
//    inexistant) — jamais d'appel payant réel au cloud MinerU.
//  - Deux fixtures (groupe D) font un VRAI appel réseau (fetch example.com,
//    Crossref) : marquées `network`, sautées proprement si hors-ligne.
//  - Chaque commande est un spawn réel du binaire — aucun appel in-process,
//    pour que ce harnais teste exactement le contrat que `kb_cli_run`
//    (ws_router.rs, in-process) et les wrappers agents partagent.
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KB_PARITY_DIR = path.join(HERE, "kb_parity");
const FIXTURES_DIR = path.join(KB_PARITY_DIR, "fixtures");
const INPUTS_DIR = path.join(KB_PARITY_DIR, "inputs");
const FAKE_GBRAIN = path.join(KB_PARITY_DIR, "fake-gbrain.mjs");
const REPO = path.resolve(HERE, "..", "..");
const NODE = process.execPath;

// Binaire sous test — voir l'en-tête ci-dessus pour l'ordre de résolution.
const KB_PARITY_BIN = resolveKbBin();

function resolveKbBin() {
  const fromEnv = process.env.KB_PARITY_BIN || "";
  if (fromEnv) return fromEnv;
  const debugBin = path.join(REPO, "rust", "target", "debug", "atelier-kb-rs");
  const build = spawnSync("cargo", [
    "build", "--manifest-path", path.join(REPO, "rust", "Cargo.toml"),
    "-p", "atelier-kb", "--bin", "atelier-kb-rs",
  ], { stdio: "inherit" });
  if (build.status !== 0 || !fs.existsSync(debugBin)) {
    throw new Error("kb_parity: `cargo build -p atelier-kb --bin atelier-kb-rs` a échoué (KB_PARITY_BIN=<chemin> pour forcer un binaire)");
  }
  return debugBin;
}

const ISO_EXACT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ISO_GLOBAL = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g;
const DATE_EXACT = /^\d{4}-\d{2}-\d{2}$/;
const PATH_DERIVED_KINDS = new Set(["file", "pdf", "folder", "zotero"]);
const NETWORK_ERROR_PATTERN = /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|network|hors ligne|réseau|EAI_AGAIN/i;

// --- gel des champs volatils (timestamps, chemins locaux, ids dérivés d'un
// chemin) : converti en jetons stables pour que la fixture reste portable
// d'une machine/checkout à l'autre. ---
function freezeString(s, ctx) {
  if (ISO_EXACT.test(s)) return "<ISO>";
  if (DATE_EXACT.test(s)) return "<DATE>";
  let out = s;
  if (ctx.appDir) out = out.split(ctx.appDir).join("<APPDIR>");
  if (ctx.inputsDir) out = out.split(ctx.inputsDir).join("<INPUTS>");
  if (ctx.mineruScript) out = out.split(ctx.mineruScript).join("<MINERU_SCRIPT>");
  if (ctx.kbParityDir) out = out.split(ctx.kbParityDir).join("<KBPARITY>");
  out = out.replace(ISO_GLOBAL, "<ISO>");
  out = out.replace(/captured: \d{4}-\d{2}-\d{2}/g, "captured: <DATE>");
  // Nom de sauvegarde d'un registre corrompu (reloadFromDisk/reload_from_disk)
  // — le suffixe est Date.now()/SystemTime en millis, jamais reproductible
  // d'un run/moteur à l'autre (KBG-08).
  out = out.replace(/knowledge\.json\.corrupt-\d+/g, "knowledge.json.corrupt-<NUM>");
  return out;
}

function freezeValue(v, ctx, key) {
  if (typeof v === "string") return freezeString(v, ctx);
  if (typeof v === "number") return key === "mtimeMs" ? "<NUM>" : v;
  if (Array.isArray(v)) return v.map((x) => freezeValue(x, ctx));
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = freezeValue(val, ctx, k);
    // id dérivé d'un chemin local (file/pdf/folder/zotero) : non portable,
    // jamais comparé littéralement — voir plans/065-inventaire-kb.md §2.1.
    if (PATH_DERIVED_KINDS.has(out.kind) && typeof out.id === "string") out.id = "<ID>";
    return out;
  }
  return v;
}

// --- résolution de {{placeholders}} : APPDIR/INPUTS (fixes par groupe) et
// valeurs capturées dynamiquement (ex: {{fileId}} = l'id réel retourné par
// un `add` précédent, jamais connu à l'écriture de la fixture). ---
function resolvePlaceholders(v, vars) {
  if (typeof v === "string") {
    return v.replace(/\{\{(\w+)\}\}/g, (m, name) => (name in vars ? vars[name] : m));
  }
  if (Array.isArray(v)) return v.map((x) => resolvePlaceholders(x, vars));
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = resolvePlaceholders(val, vars);
    return out;
  }
  return v;
}

function getPath(obj, dotPath) {
  return dotPath.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

function deletePath(obj, dotPath) {
  const parts = dotPath.split(".");
  const last = parts.pop();
  const parent = parts.reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
  if (parent && typeof parent === "object") delete parent[last];
}

function runCli(args, { stdin, env } = {}) {
  const [bin, ...binArgs] = [KB_PARITY_BIN, ...args];
  const res = spawnSync(bin, binArgs, {
    encoding: "utf8",
    input: stdin,
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: res.status ?? 1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8"));
}

// --- opérations internes au harnais (pas un spawn CLI) ----------------------
// Un step `op` mute l'environnement de fichiers ENTRE deux invocations réelles
// du CLI (ex: réécrire une source mutable pour exercer ensureFresh, ou
// supprimer un cache d'extraction pour vérifier la reconstruction/l'erreur).
// Jamais de spawn ici — juste du fs Node, toujours sous workRoot/appDir.
function runOpStep(step, ctx) {
  if (step.op === "write-file") {
    const target = resolvePlaceholders(step.path, ctx.vars);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, resolvePlaceholders(step.content, ctx.vars));
    return;
  }
  if (step.op === "rm-path") {
    const target = resolvePlaceholders(step.path, ctx.vars);
    fs.rmSync(target, { force: true, recursive: true });
    return;
  }
  throw new Error(`op de step inconnue: ${step.op}`);
}

// --- exécution d'un step ----------------------------------------------------

async function runStep(t, step, ctx) {
  if (step.op) {
    runOpStep(step, ctx);
    return;
  }
  const args = resolvePlaceholders(step.args, ctx.vars).map(String);
  const stdin = step.stdin !== undefined ? resolvePlaceholders(step.stdin, ctx.vars) : undefined;
  const stepEnv = step.env ? resolvePlaceholders(step.env, ctx.vars) : {};
  const res = runCli(args, { stdin, env: { ...ctx.env, ...stepEnv } });
  const expect = step.expect;

  if (step.network && res.status !== expect.exitCode && NETWORK_ERROR_PATTERN.test(res.stderr)) {
    t.skip(`réseau indisponible — ${res.stderr.trim().slice(0, 200)}`);
    return;
  }

  assert.equal(
    res.status,
    expect.exitCode,
    `${step.id}: code de sortie (stderr: ${res.stderr.trim().slice(0, 400)})`,
  );

  if (expect.stderr !== undefined) {
    const actual = freezeString(res.stderr.trim(), ctx.freeze);
    assert.equal(actual, expect.stderr, `${step.id}: stderr`);
  }

  if (expect.stdout !== undefined) {
    let parsed;
    try {
      parsed = JSON.parse(res.stdout);
    } catch {
      assert.fail(`${step.id}: stdout n'est pas un JSON valide: ${res.stdout.slice(0, 300)}`);
      return;
    }
    if (step.capture) {
      for (const [varName, srcPath] of Object.entries(step.capture)) {
        ctx.vars[varName] = getPath(parsed, srcPath);
      }
    }
    const frozenActual = freezeValue(parsed, ctx.freeze);
    const expected = resolvePlaceholders(expect.stdout, ctx.vars);
    checkSoft(step, frozenActual, expected);
    assert.deepEqual(frozenActual, expected, `${step.id}: stdout`);
  }

  if (expect.stdoutLines !== undefined) {
    const lines = res.stdout.split("\n").filter((l) => l.trim());
    const parsedLines = lines.map((l) => JSON.parse(l));
    if (step.capture) {
      const last = parsedLines[parsedLines.length - 1];
      for (const [varName, srcPath] of Object.entries(step.capture)) {
        ctx.vars[varName] = getPath(last, srcPath);
      }
    }
    const frozenLines = parsedLines.map((p) => freezeValue(p, ctx.freeze));
    const expectedLines = expect.stdoutLines.map((p) => resolvePlaceholders(p, ctx.vars));
    assert.equal(frozenLines.length, expectedLines.length, `${step.id}: nombre de lignes stdout`);
    frozenLines.forEach((line, i) => assert.deepEqual(line, expectedLines[i], `${step.id}: ligne ${i}`));
  }
}

// Champs `soft` : la fixture documente la valeur observée le jour de la
// capture (utile pour relire), mais un contenu externe (Crossref, HTML
// distant) peut légitimement dériver — on vérifie juste la PRÉSENCE, pas
// l'égalité, puis on retire le champ de la comparaison stricte.
function checkSoft(step, actual, expected) {
  for (const softPath of step.expect.soft ?? []) {
    const value = getPath(actual, softPath);
    assert.notEqual(value, undefined, `${step.id}: champ soft '${softPath}' absent de la sortie réelle`);
    deletePath(actual, softPath);
    deletePath(expected, softPath);
  }
}

// --- setup par groupe --------------------------------------------------------

function setupGroup(workRoot, fixture) {
  const groupDir = path.join(workRoot, fixture.env.appdir);
  const appDir = path.join(groupDir, "appdir");
  fs.mkdirSync(appDir, { recursive: true });
  const env = { ATELIER_APP_DIR: appDir };
  const freeze = { appDir, inputsDir: INPUTS_DIR, kbParityDir: KB_PARITY_DIR };
  if (fixture.env.gbrain) {
    const store = path.join(groupDir, "gbrain-store");
    env.ATELIER_TEST_GBRAIN = FAKE_GBRAIN;
    env.FAKE_GBRAIN_STORE = store;
    // gbrainInvocation (knowledge.mjs) route par défaut vers `ssh nas` depuis
    // fix(preuves) bb009b2b — ATELIER_GBRAIN_SSH_HOST="" force le binaire
    // local (donc ATELIER_TEST_GBRAIN/fake-gbrain.mjs), comme documenté par
    // ce commit ; sans ce flag les fixtures gbrain partaient en ssh réel.
    env.ATELIER_GBRAIN_SSH_HOST = "";
    if (fixture.env.gbrainFail) env.FAKE_GBRAIN_FAIL = fixture.env.gbrainFail;
  }
  if (fixture.env.mineruDisabled) {
    const bogus = path.join(workRoot, "no-such-mineru.py");
    env.ATELIER_MINERU_SCRIPT = bogus;
    freeze.mineruScript = bogus;
  }
  if (fixture.env.mineruFake) {
    // resolveMineru()/resolve_mineru() cherchent `~/.mineru_token` via
    // homedir()/$HOME — un HOME de scratch avec un jeton vide suffit à passer
    // la garde sans toucher le HOME réel de l'opérateur (jamais le vrai
    // script/jeton MinerU, jamais d'appel payant). ATELIER_MINERU_SCRIPT est
    // fourni PAR STEP (script succès vs échec), pas ici.
    const fakeHome = path.join(groupDir, "mineru-fake-home");
    fs.mkdirSync(fakeHome, { recursive: true });
    fs.writeFileSync(path.join(fakeHome, ".mineru_token"), "fixture-token\n");
    env.HOME = fakeHome;
  }
  const seededSources = [];
  for (const setupStep of fixture.setup ?? []) {
    if (setupStep.kind === "seed-gbrain") {
      const content = fs.readFileSync(path.join(INPUTS_DIR, setupStep.fromInput), "utf8");
      const res = spawnSync(NODE, [FAKE_GBRAIN, "put", setupStep.slug], {
        encoding: "utf8",
        input: content,
        env: { ...process.env, FAKE_GBRAIN_STORE: env.FAKE_GBRAIN_STORE },
      });
      assert.equal(res.status, 0, `setup ${setupStep.id}: fake-gbrain put a échoué (${res.stderr})`);
    } else if (setupStep.kind === "write-file") {
      // Écrit un fichier arbitraire (chemin relatif à appDir) AVANT le
      // premier appel CLI du groupe — seul moyen de fixer un registre
      // corrompu dès la toute première invocation (KBG-08 : la deuxième
      // invocation trouverait knowledge.json déjà renommé en .corrupt-*,
      // donc "absent" plutôt que "corrompu" — pas le même chemin de code).
      const target = path.join(appDir, setupStep.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, setupStep.content);
    } else if (setupStep.kind === "copy-input") {
      // Copie mutable d'un input fixe vers <appdir>/<to> : les fichiers sous
      // inputs/ restent lecture seule (réutilisables d'un run à l'autre),
      // cette copie sous appDir peut être réécrite par un step `op` suivant
      // (ensureFresh — KBG-01).
      const from = path.join(INPUTS_DIR, setupStep.fromInput);
      const to = path.join(appDir, setupStep.to);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    } else if (setupStep.kind === "seed-source") {
      // Registre + cache PRÉFABRIQUÉS directement sur disque (pas de spawn
      // CLI) — seul moyen de fixer une source youtube/zotero déjà épinglée
      // sans dépendre de yt-dlp ni d'une bibliothèque Zotero réelle (KBG-04).
      seededSources.push(setupStep.source);
      const cacheDir = path.join(appDir, "knowledge", "cache");
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(
        path.join(cacheDir, `${setupStep.source.id}.json`),
        JSON.stringify({ version: 1, ...setupStep.cache }),
      );
    } else {
      throw new Error(`kind de setup inconnu: ${setupStep.kind}`);
    }
  }
  if (seededSources.length) {
    const knowledgeDir = path.join(appDir, "knowledge");
    fs.mkdirSync(knowledgeDir, { recursive: true });
    const registryPath = path.join(knowledgeDir, "knowledge.json");
    fs.writeFileSync(
      registryPath,
      JSON.stringify({ version: 2, collections: [], sources: seededSources }, null, 2),
    );
  }
  return {
    env,
    freeze,
    vars: { APPDIR: appDir, INPUTS: INPUTS_DIR, KBPARITY: KB_PARITY_DIR },
  };
}

async function runGroup(t, fileName) {
  const fixture = loadFixture(fileName);
  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-parity-"));
  try {
    const ctx = setupGroup(workRoot, fixture);
    for (const step of fixture.steps) {
      await t.test(step.id, async (st) => runStep(st, step, ctx));
    }
  } finally {
    fs.rmSync(workRoot, { recursive: true, force: true });
  }
}

// --- suites -------------------------------------------------------------

test("kb parity: a-local-store", async (t) => {
  await runGroup(t, "a-local-store.json");
});

test("kb parity: b-gbrain", async (t) => {
  await runGroup(t, "b-gbrain.json");
});

test("kb parity: c-article-local", async (t) => {
  await runGroup(t, "c-article-local.json");
});

test("kb parity: d-network", async (t) => {
  await runGroup(t, "d-network.json");
});

test("kb parity: f-search-passages", async (t) => {
  await runGroup(t, "f-search-passages.json");
});

test("kb parity: g-ensure-fresh", async (t) => {
  await runGroup(t, "g-ensure-fresh.json");
});

test("kb parity: e-kinds-heritage", async (t) => {
  await runGroup(t, "e-kinds-heritage.json");
});

test("kb parity: h-mineru-fake", async (t) => {
  await runGroup(t, "h-mineru-fake.json");
});

test("kb parity: i-gbrain-corpus", async (t) => {
  await runGroup(t, "i-gbrain-corpus.json");
});

test("kb parity: j-misc", async (t) => {
  await runGroup(t, "j-misc.json");
});

test("kb parity: k-corrupt-registry", async (t) => {
  await runGroup(t, "k-corrupt-registry.json");
});
