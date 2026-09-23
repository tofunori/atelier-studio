export type ZoteroPaletteItem = {
  key: string;
  title: string;
  creators?: string;
  year?: string;
  citeKey?: string;
  publication?: string;
  doi?: string;
  abstract?: string;
  hasPdf?: boolean;
  pdfKey?: string | null;
  pdfFile?: string | null;
};

/** Bloc structuré envoyé à l'agent pour une référence Zotero citée (@citekey). */
export function buildZoteroReferenceText(
  item: ZoteroPaletteItem,
  extra?: { pdfPath?: string | null; digest?: string | null; digestPath?: string | null },
): string {
  const citekey = item.citeKey || item.key;
  const head = [
    `<zotero-reference citekey="${citekey}" zotero-key="${item.key}"${item.pdfKey ? ` pdf-key="${item.pdfKey}"` : ""}${item.pdfFile ? ` pdf-file="${item.pdfFile.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"` : ""}>`,
    `titre : ${item.title}`,
    item.creators ? `auteurs : ${item.creators}` : null,
    item.year ? `année : ${item.year}` : null,
    item.publication ? `publication : ${item.publication}` : null,
    item.doi ? `doi : ${item.doi}` : null,
    extra?.pdfPath ? `pdf : ${extra.pdfPath}` : item.pdfFile ? `pdf-zotero : ${item.pdfFile}` : null,
    item.abstract ? `abstract : ${item.abstract}` : null,
    `</zotero-reference>`,
  ].filter(Boolean).join("\n");
  if (extra?.digest) {
    return `${head}\n<digest citekey="${citekey}" source="${extra.digestPath ?? ""}">\n${extra.digest}\n</digest>`;
  }
  if (extra?.digestPath) {
    return `${head}\n<digest citekey="${citekey}" state="absent">Aucun digest en cache pour ce papier. Si son contenu compte pour la tâche : lis le PDF, rédige un digest en markdown français (sections « Résumé vulgarisé » — 2-3 phrases accessibles, « Méthode » — données/approche/période, « Résultats clés » — avec les chiffres, « Limites »), sauvegarde-le tel quel dans ${extra.digestPath} (crée le dossier au besoin), puis appuie-toi dessus.</digest>`;
  }
  return head;
}
