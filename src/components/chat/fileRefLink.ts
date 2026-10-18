/** Pilule d'un lien markdown vers un fichier. Le libellé porte souvent le
 * seul nom (`[carte.html](/chemin/complet/carte.html)`) : le href, quand il
 * désigne le même fichier, donne le chemin réel — un nom nu se résolvait
 * contre le projet et ratait un fichier écrit ailleurs. Le `:ligne` du
 * libellé survit. */
export function fileRefFromLink(label: string, href: string, fileRef: RegExp): string | null {
  const labelOk = fileRef.test(label);
  const hrefOk = fileRef.test(href);
  if (!labelOk) return hrefOk ? href : null;
  if (!hrefOk) return label;
  const [labelPath, labelLine] = label.split(/:(?=\d)/);
  const [hrefPath, hrefLine] = href.split(/:(?=\d)/);
  if (hrefPath === labelPath || !hrefPath.endsWith("/" + labelPath.replace(/^\.\//, ""))) return label;
  return hrefLine || !labelLine ? href : `${hrefPath}:${labelLine}`;
}
