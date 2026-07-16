import { chmod, mkdir, open, unlink } from "node:fs/promises";
import { constants, existsSync, lstatSync } from "node:fs";
import { createHash, randomUUID as nodeRandomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { redactSensitiveText, sanitizeAndBoundInput } from "./sanitize.mjs";

// Journal canonique du harnais (plan 025, Step 7) — la mémoire durable des
// threads Atelier, indépendante des providers.
//
// Stockage : <baseDir>/harness-history/<sha256(threadId)>.jsonl
//   - le nom de fichier est TOUJOURS le sha256 hex du threadId : aucun
//     threadId, même hostile (`../../../etc/passwd`), ne peut sortir du
//     dossier ;
//   - dossier 0700, fichiers 0600, jamais servi par HTTP ;
//   - première ligne = header {schemaVersion, threadId, createdAt, provider} ;
//   - APPEND-only : une ligne JSON complète par événement durable. Jamais de
//     réécriture (writeFileAtomic est réservé aux stores réécrits en entier —
//     ici une réécriture perdrait l'historique en cas de crash).
//
// Sémantique revert/fork :
//   - `truncateFrom` ajoute une ligne tombstone {tombstone, fromEventId, ts}.
//     Un tombstone ne s'applique qu'aux événements qui le PRÉCÈDENT dans le
//     fichier (sequence >= celle de fromEventId) : les événements append-és
//     après le revert — dont la sequence continue de croître — restent
//     vivants. Le fichier n'est jamais réécrit.
//   - `copyThread` (fork) écrit un NOUVEAU fichier avec header neuf et copie
//     les événements survivants jusqu'au point de fork INCLUS.
//
// Contrainte de câblage (router) : la sequence est attribuée par
// harness_events, qui repart de 0 à chaque process. Avant de rebrancher un
// thread existant, initialiser le compteur du sérialiseur au-delà de
// `lastSequence(threadId)`, sinon materialize (tri par sequence) entrelacerait
// anciens et nouveaux événements.

const DEFAULT_BASE_DIR = join(homedir(), "Library", "Application Support", "atelier-studio");

/** Limite documentée : une ligne sérialisée > 512 KiB est refusée (l'émetteur
 * borne déjà les outputs à 64 KiB — dépasser ici signale un bug amont). */
export const MAX_LINE_BYTES = 512 * 1024;

// Kinds éphémères : jamais journalisés par l'émetteur (durable:false), mais
// materialize les filtre par sécurité si une ligne en contenait quand même.
const EPHEMERAL_KINDS = new Set([
  "delta",
  "thinking_delta",
  "thinking_live",
  "stream_set",
  "streaming",
  "started",
  "heartbeat",
]);

// Compactés au replay : seul le DERNIER état de chaque item (turnId, itemId)
// est conservé, à la position de sa première apparition.
const ITEM_COMPACT_KINDS = new Set(["tool_update", "activity"]);

// État de thread : seule la DERNIÈRE occurrence compte, à sa position finale.
const SINGLETON_KINDS = new Set(["todos", "goal"]);

/** Nom réservé de la frontière de session (/clear Codex : même thread
 * Atelier, nouvelle session native — la frontière reste visible au replay). */
export const SESSION_BOUNDARY_NAME = "__session-cleared";

/** Garde-fou anti-secret : le module ne filtre pas le contenu (l'émetteur
 * garantit), mais une interaction ne doit JAMAIS embarquer de réponse brute
 * ni de valeurs de champs — on les retire défensivement avant écriture, sans
 * muter l'objet partagé avec le broadcast. */
const JOURNAL_OUTPUT_MAX = 64 * 1024;
const JOURNAL_INPUT_MAX = 16 * 1024;

function sanitizeForWrite(event) {
  if (!event) return event;
  if (event.kind === "interaction") {
    const { response: _response, ...clean } = event;
    if (Array.isArray(clean.fields)) {
      clean.fields = clean.fields.map((f) => {
        if (f && typeof f === "object" && "value" in f) {
          const { value: _value, ...rest } = f;
          return rest;
        }
        return f;
      });
    }
    if (typeof clean.title === "string") clean.title = redactSensitiveText(clean.title);
    if (typeof clean.detail === "string") clean.detail = redactSensitiveText(clean.detail);
    if (typeof clean.answerSummary === "string") clean.answerSummary = redactSensitiveText(clean.answerSummary);
    return clean;
  }
  // tool_update : la sortie et surtout l'input (un input MCP peut porter une clé
  // API) sont bornés avant écriture — la valeur intégrale ne va jamais sur disque.
  if (event.kind === "tool_update") {
    const clean = { ...event };
    if (typeof clean.output === "string") {
      const safeOutput = redactSensitiveText(clean.output);
      if (safeOutput.length > JOURNAL_OUTPUT_MAX) {
        clean.outputLength = clean.output.length;
        clean.output = safeOutput.slice(0, JOURNAL_OUTPUT_MAX);
        clean.truncated = true;
      } else {
        clean.output = safeOutput;
      }
    }
    clean.input = sanitizeAndBoundInput(clean.input, JOURNAL_INPUT_MAX);
    if (typeof clean.detail === "string") clean.detail = redactSensitiveText(clean.detail);
    return clean;
  }
  if (event.kind === "tool" && typeof event.detail === "string") {
    return { ...event, detail: redactSensitiveText(event.detail) };
  }
  // edit : l'avant/après du diff immédiat (input du tool Edit/Write) peut
  // porter un secret (édition d'un .env) — même redaction que tool_update
  // avant écriture, sans muter l'objet partagé avec le broadcast.
  if (event.kind === "edit" && Array.isArray(event.files)) {
    const files = event.files.map((f) => {
      if (!f || typeof f !== "object") return f;
      const clean = { ...f };
      if (typeof clean.oldText === "string") clean.oldText = redactSensitiveText(clean.oldText);
      if (typeof clean.newText === "string") clean.newText = redactSensitiveText(clean.newText);
      return clean;
    });
    return { ...event, files };
  }
  return event;
}

function assertRegularOwnedFile(stat, filePath) {
  if (!stat.isFile()) throw new Error(`journal refusé : cible non régulière (${filePath})`);
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
    throw new Error(`journal refusé : propriétaire inattendu (${filePath})`);
  }
}

async function openRegular(filePath, flags, mode = 0o600) {
  const fh = await open(filePath, flags | constants.O_NOFOLLOW, mode);
  try {
    assertRegularOwnedFile(await fh.stat(), filePath);
    await fh.chmod(0o600);
    return fh;
  } catch (error) {
    await fh.close();
    throw error;
  }
}

/** Parse le contenu d'un journal, ligne à ligne, sans jamais throw :
 *  - dernière ligne tronquée (crash pendant write) ignorée avec diagnostic ;
 *  - ligne intermédiaire corrompue sautée avec diagnostic ;
 *  - tombstones appliqués aux événements qui les précèdent dans le fichier. */
function parseJournalText(text, threadId) {
  const result = { header: null, events: [], legacySeeded: false };
  if (!text) return result;
  const complete = text.endsWith("\n");
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch {
      if (i === lines.length - 1 && !complete) {
        console.warn(`[journal] dernière ligne tronquée ignorée (thread ${threadId})`);
      } else {
        console.warn(`[journal] ligne ${i + 1} corrompue sautée (thread ${threadId})`);
      }
      continue;
    }
    if (i === 0 && obj && typeof obj === "object" && !obj.kind && obj.tombstone !== true && obj.legacySeed !== true) {
      result.header = obj;
      continue;
    }
    if (obj?.legacySeed === true) {
      result.legacySeeded = true;
      continue;
    }
    if (obj?.tombstone === true) {
      const target = result.events.find((e) => e.meta?.eventId === obj.fromEventId);
      if (!target) {
        console.warn(`[journal] tombstone sans cible (${obj.fromEventId}) ignoré (thread ${threadId})`);
        continue;
      }
      const cutoff = target.meta.sequence;
      result.events = result.events.filter((e) => e.meta.sequence < cutoff);
      continue;
    }
    if (!obj || typeof obj.kind !== "string" || !obj.meta || typeof obj.meta.sequence !== "number") {
      console.warn(`[journal] ligne ${i + 1} sans meta valide sautée (thread ${threadId})`);
      continue;
    }
    result.events.push(obj);
  }
  return result;
}

export function createHarnessJournal({
  baseDir = DEFAULT_BASE_DIR,
  now = Date.now,
  randomUUID = nodeRandomUUID,
} = {}) {
  const dir = join(baseDir, "harness-history");
  const queues = new Map(); // hash -> chaîne de promesses (écritures sérialisées)
  const known = new Set(); // hash des fichiers déjà ouverts/réparés ce process
  let dirReady = false;

  const hashOf = (threadId) => createHash("sha256").update(String(threadId), "utf8").digest("hex");
  const pathOf = (threadId) => join(dir, `${hashOf(threadId)}.jsonl`);

  // QUEUE D'ÉCRITURE SÉRIALISÉE par thread : chaque opération attend la
  // précédente — des appends concurrents ne s'entrelacent jamais. Une
  // opération qui rejette est neutralisée pour ne pas figer le thread.
  function enqueue(threadId, fn) {
    const key = hashOf(threadId);
    const prev = queues.get(key) ?? Promise.resolve();
    const p = prev.then(fn);
    queues.set(
      key,
      p.then(
        () => undefined,
        () => undefined,
      ),
    );
    return p;
  }

  async function ensureDir() {
    if (dirReady) return;
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await chmod(dir, 0o700); // indépendant de l'umask du process
    dirReady = true;
  }

  /** Un crash pendant un write peut laisser une dernière ligne sans \n : on
   * répare une fois par process avant de ré-append-er, sinon la ligne
   * suivante fusionnerait avec le fragment. */
  async function repairTrailingNewline(filePath) {
    const fh = await openRegular(filePath, constants.O_RDWR);
    try {
      const { size } = await fh.stat();
      if (size === 0) return;
      const buf = Buffer.alloc(1);
      await fh.read(buf, 0, 1, size - 1);
      if (buf[0] !== 0x0a) await fh.write("\n", size);
    } finally {
      await fh.close();
    }
  }

  async function writeLines(filePath, data) {
    await ensureDir();
    const fh = await openRegular(
      filePath,
      constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT,
    );
    try {
      await fh.writeFile(data);
    } finally {
      await fh.close();
    }
  }

  /** Crée fichier + header s'ils n'existent pas ; répare la fin de fichier
   * sinon. Idempotent, à appeler DANS la queue du thread. */
  async function ensureOpen(threadId, provider) {
    const key = hashOf(threadId);
    if (known.has(key)) return;
    await ensureDir();
    const filePath = pathOf(threadId);
    let existing = null;
    try { existing = lstatSync(filePath); } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (!existing) {
      const header = {
        schemaVersion: 1,
        threadId: String(threadId),
        createdAt: new Date(now()).toISOString(),
        provider: provider ?? "unknown",
      };
      await writeLines(filePath, JSON.stringify(header) + "\n");
    } else {
      if (existing.isSymbolicLink() || !existing.isFile()) {
        throw new Error(`journal refusé : cible non régulière (${filePath})`);
      }
      await repairTrailingNewline(filePath);
    }
    known.add(key);
  }

  /** Lecture brute (hors queue) — à n'appeler que depuis la queue du thread. */
  async function readThread(threadId) {
    let fh;
    try {
      fh = await openRegular(pathOf(threadId), constants.O_RDONLY);
    } catch (err) {
      if (err?.code === "ENOENT") return { header: null, events: [], legacySeeded: false };
      throw err;
    }
    try {
      return parseJournalText(await fh.readFile("utf8"), threadId);
    } finally {
      await fh.close();
    }
  }

  function fitsLine(line, threadId, kind) {
    if (Buffer.byteLength(line, "utf8") <= MAX_LINE_BYTES) return true;
    console.warn(
      `[journal] ligne refusée (> ${MAX_LINE_BYTES} octets) — thread ${threadId}, kind ${kind}`,
    );
    return false;
  }

  return {
    /** Crée le fichier + header s'il n'existe pas. Idempotent. */
    openThread({ threadId, provider } = {}) {
      return enqueue(threadId, () => ensureOpen(threadId, provider));
    },

    /** Attend la fin de toutes les opérations DÉJÀ enfilées pour ce thread
     * (append/copy/truncate lancés en fire-and-forget par le router). N'enfile
     * rien, ne modifie rien, ne rejette jamais — synchronisation déterministe
     * pour les tests et le diagnostic. */
    flush(threadId) {
      return queues.get(hashOf(threadId)) ?? Promise.resolve();
    },

    /** Vrai si le thread a déjà un journal sur disque. */
    hasJournal(threadId) {
      try {
        const stat = lstatSync(pathOf(threadId));
        return stat.isFile() && !stat.isSymbolicLink();
      } catch {
        return false;
      }
    },

    /**
     * Append un événement durable (AgentEvent décoré par harness_events).
     * Ne rejette JAMAIS : l'émetteur ne l'attend pas (dispatch fire-and-forget)
     * — tout échec est diagnostiqué en console.warn et retourne false.
     */
    append(event) {
      const threadId = event?.meta?.threadId;
      if (!threadId) {
        console.warn("[journal] append refusé : meta.threadId manquant");
        return Promise.resolve(false);
      }
      if (event.meta.durable === false) {
        console.warn(`[journal] événement éphémère refusé (kind ${event.kind}) — thread ${threadId}`);
        return Promise.resolve(false);
      }
      return enqueue(threadId, async () => {
        try {
          await ensureOpen(threadId, event.meta.provider);
          const line = JSON.stringify(sanitizeForWrite(event));
          if (!fitsLine(line, threadId, event.kind)) return false;
          await writeLines(pathOf(threadId), line + "\n");
          return true;
        } catch (err) {
          console.warn(`[journal] append échoué (thread ${threadId}) : ${err?.message ?? err}`);
          return false;
        }
      });
    },

    /**
     * Seed unique de l'historique provider existant (migration legacy-import).
     * Marqueur {legacySeed:true} : un second seed sur le même thread est un
     * no-op (retourne false). Chaque événement reçoit une meta synthétique ;
     * un turnId legacy par message user rencontré — les événements qui suivent
     * partagent le turnId du user précédent (avant tout user : legacy-0).
     * N'échoue jamais bruyamment : le run doit continuer même si le seed rate.
     */
    seedLegacy(threadId, provider, events) {
      return enqueue(threadId, async () => {
        try {
          await ensureOpen(threadId, provider);
          const current = await readThread(threadId);
          if (current.legacySeeded) return false;
          const lines = [JSON.stringify({ legacySeed: true, ts: now(), count: events?.length ?? 0 })];
          let n = 0;
          let turn = 0;
          for (const raw of events ?? []) {
            n += 1;
            if (raw?.kind === "user") turn += 1;
            const meta = {
              schemaVersion: 1,
              eventId: `legacy-${n}`,
              provider,
              threadId: String(threadId),
              turnId: `legacy-${turn}`,
              sequence: n,
              ts: Number.isFinite(raw?.ts) ? raw.ts : now(),
              durable: true,
              origin: "legacy-import",
            };
            const line = JSON.stringify({ ...sanitizeForWrite(raw), meta });
            if (!fitsLine(line, threadId, raw?.kind)) continue;
            lines.push(line);
          }
          // Une seule écriture : marqueur + événements, insécables entre eux.
          await writeLines(pathOf(threadId), lines.join("\n") + "\n");
          return true;
        } catch (err) {
          console.warn(`[journal] seed legacy échoué (thread ${threadId}) : ${err?.message ?? err}`);
          return false;
        }
      });
    },

    /** Lit toutes les lignes valides (tombstones appliqués), en ordre fichier. */
    load(threadId) {
      return enqueue(threadId, async () => {
        const { header, events, legacySeeded } = await readThread(threadId);
        return {
          header: header ? { ...header, ...(legacySeeded ? { legacySeeded: true } : {}) } : null,
          events,
        };
      });
    },

    /** Plus grande sequence journalisée (0 si journal vide/absent) — pour
     * réinitialiser le compteur du sérialiseur au rebranchement d'un thread. */
    lastSequence(threadId) {
      return enqueue(threadId, async () => {
        const { events } = await readThread(threadId);
        return events.reduce((m, e) => Math.max(m, e.meta.sequence ?? 0), 0);
      });
    },

    /**
     * Replay sémantique : ordre par meta.sequence (tri stable — les égalités
     * gardent l'ordre fichier), déduplication par eventId, filtrage des
     * éphémères, compactage :
     *   - tool_update/activity : dernier état par (turnId, itemId), à la
     *     position de la première apparition ;
     *   - interaction : dernier état par requestId (idem position) ;
     *   - todos/goal : seule la dernière occurrence, à sa position finale ;
     *   - user/text/thinking/tool/edit/usage/done/error : conservés tels quels
     *     (usage appartient au turn — jamais compacté entre turns).
     */
    materialize(threadId) {
      return enqueue(threadId, async () => {
        const { events } = await readThread(threadId);
        const sorted = [...events].sort((a, b) => (a.meta.sequence ?? 0) - (b.meta.sequence ?? 0));
        const seen = new Set();
        const out = [];
        const slots = new Map(); // clé de compactage -> index dans out
        for (const e of sorted) {
          const id = e.meta.eventId;
          if (id) {
            if (seen.has(id)) continue; // reconnexion/replay idempotent
            seen.add(id);
          }
          if (EPHEMERAL_KINDS.has(e.kind)) continue;
          if (ITEM_COMPACT_KINDS.has(e.kind)) {
            const key = `item:${e.meta.turnId}:${e.meta.itemId ?? e.meta.eventId}`;
            if (slots.has(key)) out[slots.get(key)] = e;
            else {
              slots.set(key, out.length);
              out.push(e);
            }
            continue;
          }
          if (e.kind === "interaction") {
            const key = `interaction:${e.requestId ?? e.meta.itemId ?? e.meta.eventId}`;
            if (slots.has(key)) out[slots.get(key)] = e;
            else {
              slots.set(key, out.length);
              out.push(e);
            }
            continue;
          }
          if (SINGLETON_KINDS.has(e.kind)) {
            const key = `single:${e.kind}`;
            if (slots.has(key)) out[slots.get(key)] = null; // l'ancien disparaît
            slots.set(key, out.length);
            out.push(e);
            continue;
          }
          out.push(e);
        }
        return out.filter(Boolean);
      });
    },

    /**
     * Frontière de session native (/clear Codex) : même thread Atelier, mais
     * marqueur durable visible au replay — événement `tool` réservé
     * `__session-cleared` (origin atelier). Retourne l'événement écrit, ou
     * false si le thread n'a pas de journal.
     */
    markSessionBoundary(threadId, note) {
      return enqueue(threadId, async () => {
        if (!existsSync(pathOf(threadId))) {
          console.warn(`[journal] frontière ignorée : aucun journal (thread ${threadId})`);
          return false;
        }
        await ensureOpen(threadId);
        const { header, events } = await readThread(threadId);
        const maxSeq = events.reduce((m, e) => Math.max(m, e.meta.sequence ?? 0), 0);
        const id = randomUUID();
        const event = {
          kind: "tool",
          name: SESSION_BOUNDARY_NAME,
          detail: String(note ?? ""),
          meta: {
            schemaVersion: 1,
            eventId: `boundary-${id}`,
            provider: header?.provider ?? "unknown",
            threadId: String(threadId),
            turnId: `boundary-${id}`,
            sequence: maxSeq + 1,
            ts: now(),
            durable: true,
            origin: "atelier",
          },
        };
        await writeLines(pathOf(threadId), JSON.stringify(event) + "\n");
        return event;
      });
    },

    /**
     * Revert NON destructif : ajoute un tombstone {tombstone, fromEventId, ts}.
     * load/materialize ignorent ensuite tous les événements ANTÉRIEURS au
     * tombstone dont la sequence >= celle de fromEventId (fromEventId inclus).
     * Le fichier n'est jamais réécrit ; les lignes brutes restent sur disque.
     */
    truncateFrom(threadId, eventId) {
      return enqueue(threadId, async () => {
        if (!existsSync(pathOf(threadId))) {
          console.warn(`[journal] truncateFrom ignoré : aucun journal (thread ${threadId})`);
          return false;
        }
        await ensureOpen(threadId);
        const { events } = await readThread(threadId);
        if (!events.some((e) => e.meta.eventId === eventId)) {
          console.warn(`[journal] truncateFrom : eventId introuvable (${eventId}, thread ${threadId})`);
          return false;
        }
        await writeLines(
          pathOf(threadId),
          JSON.stringify({ tombstone: true, fromEventId: eventId, ts: now() }) + "\n",
        );
        return true;
      });
    },

    /**
     * Fork : NOUVEAU fichier pour dstThreadId avec header neuf (forkedFrom),
     * copie des événements survivants (tombstones respectés) jusqu'au point
     * de fork INCLUS (`uptoEventId` absent = tout copier). meta.threadId est
     * réécrit vers la destination ; les eventId sont conservés (traçabilité).
     */
    copyThread(srcThreadId, dstThreadId, uptoEventId) {
      if (hashOf(srcThreadId) === hashOf(dstThreadId)) {
        console.warn(`[journal] fork refusé : source et destination identiques (thread ${srcThreadId})`);
        return Promise.resolve(false);
      }
      return enqueue(srcThreadId, () =>
        enqueue(dstThreadId, async () => {
          if (!existsSync(pathOf(srcThreadId))) {
            console.warn(`[journal] fork ignoré : aucun journal source (thread ${srcThreadId})`);
            return false;
          }
          if (existsSync(pathOf(dstThreadId))) {
            console.warn(`[journal] fork refusé : la destination existe déjà (thread ${dstThreadId})`);
            return false;
          }
          const { header, events } = await readThread(srcThreadId);
          let slice = events;
          if (uptoEventId != null) {
            const target = events.find((e) => e.meta.eventId === uptoEventId);
            if (!target) {
              console.warn(`[journal] fork : point introuvable (${uptoEventId}, thread ${srcThreadId})`);
              return false;
            }
            slice = events.filter((e) => e.meta.sequence <= target.meta.sequence);
          }
          const newHeader = {
            schemaVersion: 1,
            threadId: String(dstThreadId),
            createdAt: new Date(now()).toISOString(),
            provider: header?.provider ?? "unknown",
            forkedFrom: String(srcThreadId),
            ...(uptoEventId != null ? { forkPoint: uptoEventId } : {}),
          };
          const lines = [
            JSON.stringify(newHeader),
            ...slice.map((e) => JSON.stringify({ ...e, meta: { ...e.meta, threadId: String(dstThreadId) } })),
          ];
          await writeLines(pathOf(dstThreadId), lines.join("\n") + "\n");
          known.add(hashOf(dstThreadId));
          return true;
        }),
      );
    },

    /** Supprime le journal — uniquement via le chemin HASHÉ (jamais dérivé
     * d'un chemin fourni). Idempotent : false si déjà absent. */
    deleteThread(threadId) {
      return enqueue(threadId, async () => {
        known.delete(hashOf(threadId));
        try {
          await unlink(pathOf(threadId));
          return true;
        } catch (err) {
          if (err?.code === "ENOENT") return false;
          throw err;
        }
      });
    },
  };
}
