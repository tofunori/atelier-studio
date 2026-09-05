import type {ReadingContext} from "./reading";

/** Balanced groups handle nested BibTeX titles and aux labels without running TeX. */
export function texGroup(text: string, start: number): {value: string; end: number} | null {
  if (text[start] !== "{") return null;
  let depth = 1;
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === "\\") { i++; continue; }
    if (text[i] === "{") depth++;
    if (text[i] === "}" && --depth === 0) return {value: text.slice(start + 1, i), end: i + 1};
  }
  return null;
}
const plain = (s: string) => s.replace(/\\([~'`"^=])\s*\{?([a-zA-Z])\}?/g, (_m, accent: string, letter: string) => {
  const marks: Record<string,string> = {"~":"\u0303", "'":"\u0301", "`":"\u0300", '"':"\u0308", "^":"\u0302", "=":"\u0304"};
  return (letter + marks[accent]).normalize("NFC");
}).replace(/\\(?:textit|textbf|emph)\b/g, "").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();

export function parseReadingContext(tex: string, bib: string, aux: string): ReadingContext {
  const citations: NonNullable<ReadingContext["citations"]> = {};
  const references: Record<string, string> = {};
  const macros: Record<string, string> = {};
  const entries = /@\w+\s*\{\s*([^,\s]+)\s*,/g;
  for (let entry = entries.exec(bib); entry; entry = entries.exec(bib)) {
    const group = texGroup(bib, bib.indexOf("{", entry.index));
    if (!group) continue;
    entries.lastIndex = group.end;
    const fields: Record<string, string> = {};
    const field = /([a-zA-Z]+)\s*=\s*/g;
    for (let match = field.exec(group.value); match; match = field.exec(group.value)) {
      const pos = field.lastIndex;
      const nested = texGroup(group.value, pos);
      const quoted = /^"((?:\\.|[^"\\])*)"/.exec(group.value.slice(pos));
      const bare = /^[^,\n]+/.exec(group.value.slice(pos));
      const key = match[1]!.toLowerCase();
      const value = nested?.value ?? quoted?.[1] ?? bare?.[0] ?? "";
      fields[key] = /^(author|editor)$/.test(key) ? value.trim() : plain(value);
      field.lastIndex = nested?.end ?? pos + (quoted?.[0].length ?? bare?.[0].length ?? 1);
    }
    const authors = (fields.author || fields.editor || "").split(/\s+and\s+/i).filter(Boolean);
    const surname = (author: string) => author.startsWith("{") && author.endsWith("}") ? plain(author) : plain(author.includes(",") ? author.split(",")[0]! : author.split(/\s+/).at(-1)!);
    const names = authors.length > 2 ? `${surname(authors[0]!)} et al.` : authors.map(surname).join(" & ");
    const label = names ? `${names}${fields.year ? ", " + fields.year : ""}` : entry[1]!;
    citations[entry[1]!] = {label, title: fields.title || entry[1]!, url: fields.doi ? `https://doi.org/${fields.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "")}` : fields.url};
  }
  for (const match of aux.matchAll(/\\newlabel\{([^}]+)\}\{/g)) {
    const outer = texGroup(aux, match.index! + match[0].length - 1);
    const number = outer && texGroup(outer.value, 0);
    if (number?.value) references[match[1]!] = plain(number.value);
  }
  for (const match of tex.matchAll(/\\(?:newcommand|renewcommand|providecommand)\*?\s*\{(\\\w+)\}\s*\{/g)) {
    const group = texGroup(tex, match.index! + match[0].length - 1);
    if (group && !group.value.includes("#")) macros[match[1]!] = group.value;
  }
  return {citations, references, macros};
}

export async function loadReadingContext(root: string, read: (path: string) => Promise<string>, compiledAux?: string): Promise<ReadingContext> {
  const dir = root.slice(0, root.lastIndexOf("/") + 1);
  const resolve = (base: string, rel: string): string => {
    const combined = rel.startsWith("/") ? rel : base + rel;
    const parts: string[] = [];
    for (const part of combined.split("/")) {
      if (part === ".." && parts.length && parts.at(-1) !== "..") parts.pop();
      else if (part === ".." && !combined.startsWith("/")) parts.push(part);
      else if (part && part !== "." && part !== "..") parts.push(part);
    }
    return (combined.startsWith("/") ? "/" : "") + parts.join("/");
  };
  const seen = new Set<string>();
  let tex = "", bib = "";
  const aux: Array<{text: string; path: string; prefix: string; external: boolean}> = [];
  const referenceTargets: NonNullable<ReadingContext["referenceTargets"]> = {};
  const visit = async (path: string, depth = 0, prefix = "", external = false): Promise<void> => {
    const key = `${external}:${prefix}:${path}`;
    if (seen.has(key) || seen.size >= 48 || depth > 5) return;
    seen.add(key);
    const text = await read(path);
    if (path.endsWith(".bib")) { bib += "\n" + text; return; }
    if (path.endsWith(".aux")) {
      aux.push({text, path, prefix, external});
      for (const child of text.matchAll(/\\@input\{([^}]+)\}/g)) await visit(resolve(path.slice(0,path.lastIndexOf("/")+1), child[1]!), depth+1, prefix, external);
      return;
    }
    if (!external) tex += "\n" + text;
    for (const label of text.matchAll(/\\label\{([^}]+)\}/g)) {
      const labelKey = prefix + label[1]!;
      if (!external || !referenceTargets[labelKey]) referenceTargets[labelKey] = {path, line: text.slice(0, label.index).split("\n").length, ...(external ? {external: true} : {})};
    }
    const base = path.slice(0, path.lastIndexOf("/") + 1);
    for (const document of text.matchAll(/\\externaldocument(?:\[([^\]]*)\])?(?:\[[^\]]*\])?\{([^}]+)\}/g)) {
      const importedPrefix = prefix + (document[1] || "");
      await visit(resolve(base, document[2]! + ".aux"), depth + 1, importedPrefix, true);
      // Companion TeX supplies the real source location for SyncTeX.
      const name = document[2]!.split("/").at(-1)!;
      await visit(resolve(dir, name + ".tex"), depth + 1, importedPrefix, true);
    }
    for (const match of text.matchAll(/\\(bibliography|addbibresource|input|include)(?:\[[^\]]*\])?\{([^}]+)\}/g)) {
      const ext = /bibliography|addbibresource/.test(match[1]!) ? ".bib" : ".tex";
      for (const name of match[2]!.split(",")) {
        if (!name.trim() || /[\\#]/.test(name)) continue;
        const rel = name.trim().endsWith(ext) ? name.trim() : name.trim() + ext;
        await visit(resolve(base, rel), depth + 1, prefix, external);
      }
    }
  };
  await visit(root);
  await visit(resolve(dir, root.split("/").at(-1)!.replace(/\.tex$/, ".aux")));
  if (compiledAux) await visit(compiledAux);
  const context = parseReadingContext(tex, bib, "");
  // Local labels win over unprefixed external imports, for numbers AND targets.
  for (const chunk of [...aux.filter(a => a.external), ...aux.filter(a => !a.external)]) {
    for (const [key, number] of Object.entries(parseReadingContext("", "", chunk.text).references || {})) {
      context.references![chunk.prefix + key] = number;
      const targetKey = chunk.prefix + key;
      if (chunk.external && !referenceTargets[targetKey]) referenceTargets[targetKey] = {path: chunk.path.replace(/\.aux$/, ".tex"), line: 1, external: true};
      if (!chunk.external && referenceTargets[targetKey]?.external) delete referenceTargets[targetKey];
    }
  }
  return {...context, referenceTargets};
}
