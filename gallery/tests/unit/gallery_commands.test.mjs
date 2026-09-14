import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../../assets/gallery_commands.js", import.meta.url), "utf8");
const PROJECT = "/Users/test/thesis";
const galleryTemplate = fs.readFileSync(new URL("../../assets/gallery_template.html", import.meta.url), "utf8");

function loadContract() {
  const context = vm.createContext({});
  vm.runInContext(source, context, { filename: "gallery_commands.js" });
  return context.AtelierGalleryCommands;
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }

function command(action, rels, requestId = `req-${action}`) {
  const modes = { show: "focus", open: "viewer", compare: "selection", reset: "all" };
  return { type: "atelier-gallery-command", action, mode: modes[action], projectRoot: PROJECT, requestId, rels };
}

test("la Galerie charge le contrat et borne le bridge par top + nonce", () => {
  assert.match(galleryTemplate, /import\('\/.fig_thumbs\/gallery_commands\.js/);
  assert.match(galleryTemplate, /e\.source!==window\.top/);
  assert.match(galleryTemplate, /e\.data\.nonce!==nonce/);
  assert.match(galleryTemplate, /type:'atelier-gallery-result'/);
  assert.match(galleryTemplate, /chatFocusRels\.has\(f\.rel\)/);
});

test("show garde les figures connues, déduplique et rapporte les absentes", () => {
  const shown = [];
  const result = loadContract().execute(
    command("show", ["./figures/a.png", "figures/missing.png", "figures/a.png", "figures/b.svg"]),
    ["figures/a.png", "figures/b.svg", "notes/readme.md"],
    { projectRoot: PROJECT, show: (rels) => shown.push([...rels]) },
  );
  assert.deepEqual(shown, [["figures/a.png", "figures/b.svg"]]);
  assert.deepEqual(plain(result), {
    ok: true, action: "show", projectRoot: PROJECT, requestId: "req-show",
    matched: ["figures/a.png", "figures/b.svg"], missing: ["figures/missing.png"], applied: true,
  });
});

test("open appelle le viewer uniquement pour un chemin connu", () => {
  const opened = [];
  const contract = loadContract();
  const found = contract.execute(command("open", ["figures/a.png"]), ["figures/a.png"], {
    projectRoot: PROJECT, open: (rel) => opened.push(rel),
  });
  const missing = contract.execute(command("open", ["missing.png"], "req-open-missing"), ["figures/a.png"], {
    projectRoot: PROJECT, open: (rel) => opened.push(rel),
  });
  assert.deepEqual(opened, ["figures/a.png"]);
  assert.equal(found.applied, true);
  assert.equal(missing.applied, false);
  assert.deepEqual(plain(missing.missing), ["missing.png"]);
});

test("open rescane une fois puis ouvre une figure créée après l'index initial", async () => {
  const opened = [];
  let rescans = 0;
  const contract = loadContract();
  const result = await contract.executeWithRefresh(
    command("open", ["figures/new-export.pdf"]),
    ["figures/old-export.pdf"],
    { projectRoot: PROJECT, open: (rel) => opened.push(rel) },
    async () => {
      rescans += 1;
      return ["figures/old-export.pdf", "figures/new-export.pdf"];
    },
  );
  assert.equal(rescans, 1);
  assert.deepEqual(opened, ["figures/new-export.pdf"]);
  assert.deepEqual(plain(result), {
    ok: true, action: "open", projectRoot: PROJECT, requestId: "req-open",
    matched: ["figures/new-export.pdf"], missing: [], applied: true,
  });
});

test("open ne rescane pas quand la figure est déjà indexée", async () => {
  let rescans = 0;
  const result = await loadContract().executeWithRefresh(
    command("open", ["figures/current.pdf"]),
    ["figures/current.pdf"],
    { projectRoot: PROJECT, open: () => {} },
    async () => { rescans += 1; return []; },
  );
  assert.equal(rescans, 0);
  assert.equal(result.applied, true);
});

test("compare applique au moins deux correspondances et reste honnête sinon", () => {
  const compared = [];
  const contract = loadContract();
  const applied = contract.execute(command("compare", ["a.png", "b.png", "missing.png"]), ["a.png", "b.png"], {
    projectRoot: PROJECT, compare: (rels) => compared.push([...rels]),
  });
  const partial = contract.execute(command("compare", ["a.png", "missing.png"], "req-compare-partial"), ["a.png"], {
    projectRoot: PROJECT, compare: (rels) => compared.push([...rels]),
  });
  assert.deepEqual(compared, [["a.png", "b.png"]]);
  assert.equal(applied.applied, true);
  assert.equal(partial.applied, false);
  assert.deepEqual(plain(partial.matched), ["a.png"]);
});

test("reset restaure la galerie sans exiger de chemin", () => {
  let resets = 0;
  const result = loadContract().execute(command("reset", []), ["a.png"], {
    projectRoot: PROJECT, reset: () => { resets += 1; },
  });
  assert.equal(resets, 1);
  assert.deepEqual(plain(result), {
    ok: true, action: "reset", projectRoot: PROJECT, requestId: "req-reset",
    matched: [], missing: [], applied: true,
  });
});

test("le contrat refuse les modes, cardinalités et chemins mal formés", () => {
  const contract = loadContract();
  let calls = 0;
  const adapter = { projectRoot: PROJECT, show: () => { calls += 1; } };
  const payloads = [
    null,
    { ...command("show", ["a.png"]), mode: "viewer" },
    command("open", ["a.png", "b.png"]),
    command("compare", ["a.png"]),
    command("reset", ["a.png"]),
    command("show", ["../secret"]),
    { ...command("show", ["a.png"]), unexpected: true },
  ];
  for (const payload of payloads) assert.equal(contract.execute(payload, ["a.png", "b.png"], adapter).ok, false);
  assert.equal(calls, 0);
});
