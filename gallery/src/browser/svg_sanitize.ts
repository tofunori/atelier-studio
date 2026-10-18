/** Assainissement d'un SVG de projet avant son insertion dans la visionneuse.
 *
 * svg_viewer.html est une page livrée, servie comme page de confiance à
 * l'origine de la galerie. Elle insère le SVG du projet dans son propre DOM
 * (importNode) pour pouvoir l'éditer : sans assainissement, un attribut
 * `onerror`/`onload`/`onbegin` ou un lien `javascript:` d'un SVG venu d'un
 * dépôt cloné s'exécutait avec tous les droits de la galerie (/codesave,
 * /delete, routes git, /regenerate). Audit du 2026-10-18, problème 18.
 *
 * Pourquoi pas DOMPurify (vendorisé pour md_viewer) : son profil SVG est une
 * liste blanche pensée pour du HTML. Sur un SVG de matplotlib ou d'Inkscape
 * il retire les métadonnées RDF, les espaces de noms d'éditeur
 * (`sodipodi:`, `inkscape:`) et une part des commentaires dont l'éditeur se
 * sert comme libellés — et l'enregistrement réécrit le fichier depuis le DOM
 * affiché, donc ces pertes deviendraient définitives. On retire ici,
 * strictement, tout ce qui peut EXÉCUTER du code ou embarquer du HTML, et on
 * garde le reste à l'octet près :
 *
 * - éléments : script, foreignObject (HTML embarqué), iframe, embed, object,
 *   handler/listener (événements XML), base, meta, link, et tout élément de
 *   l'espace de noms XHTML ;
 * - animations (animate, set…) qui visent `href`, `src` ou un `on*` ;
 * - attributs : tout `on*`, tout attribut de l'espace XML Events, un `style`
 *   à `javascript:`/`expression(` ;
 * - URL (`href`, `xlink:href`, `src`, `action`, `formaction`, `data`,
 *   `xml:base`) en `javascript:`, `vbscript:`, `data:` hors image, et tout
 *   `<use>` qui pointe hors du document ;
 * - instructions de traitement internes.
 *
 * Travaille sur un document issu de DOMParser (aucun contexte de navigation :
 * rien n'y s'exécute) AVANT l'importNode. Renvoie le décompte de ce qui a été
 * retiré pour que la visionneuse le dise.
 */
function installSvgSanitizeApi(root) {
  'use strict';

  const XHTML_NS = "http://www.w3.org/1999/xhtml";
  const XML_EVENTS_NS = "http://www.w3.org/2001/xml-events";
  const DROP = new Set([
    "script", "foreignobject", "iframe", "frame", "frameset", "embed", "object", "applet",
    "handler", "listener", "base", "meta", "link", "noscript", "template", "portal",
  ]);
  const ANIMATIONS = new Set(["animate", "set", "animatemotion", "animatetransform", "animatecolor"]);
  const URL_ATTRS = new Set(["href", "src", "action", "formaction", "data", "base"]);
  const IMAGE_DATA = /^data:image\/(png|jpe?g|gif|webp|bmp|avif|svg\+xml)[;,]/;
  const CONTROL = /[\u0000-\u0020\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\ufeff]+/g;

  type Report = { total: number; removed: Record<string, number> };

  /** Une URL qui exécuterait du code ou chargerait un document actif. */
  function unsafeUrl(value: string, element: string): boolean {
    const v = String(value || "").replace(CONTROL, "").toLowerCase();
    const match = /^([a-z][a-z0-9+.-]*):/.exec(v);
    if (!match) return false;                          // fragment (#id) ou chemin relatif
    const scheme = match[1];
    if (scheme === "javascript" || scheme === "vbscript" || scheme === "livescript") return true;
    if (element === "use") return true;               // <use> hors du document : SVG étranger
    if (scheme === "data") return !IMAGE_DATA.test(v);
    return false;
  }

  function count(report: Report, what: string) {
    report.removed[what] = (report.removed[what] || 0) + 1;
    report.total += 1;
  }

  function cleanAttributes(el: Element, tag: string, report: Report) {
    for (const attr of Array.from(el.attributes)) {
      const local = (attr.localName || attr.name).toLowerCase();
      const name = attr.name.toLowerCase();
      let drop = false;
      if (local.startsWith("on")) drop = true;
      else if (attr.namespaceURI === XML_EVENTS_NS) drop = true;
      else if (URL_ATTRS.has(local) || name === "xml:base") drop = unsafeUrl(attr.value, tag);
      else if (local === "style") drop = /javascript:|expression\s*\(|-moz-binding|behavior\s*:/i.test(attr.value.replace(CONTROL, ""));
      if (drop) {
        el.removeAttributeNode(attr);
        count(report, local.startsWith("on") ? "on*" : name);
      }
    }
  }

  function animationTargetsCode(el: Element): boolean {
    const target = (el.getAttribute("attributeName") || "").trim().toLowerCase().replace(/^.*:/, "");
    return target === "href" || target === "src" || target.startsWith("on");
  }

  function walk(el: Element, report: Report) {
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 7) {                       // <?…?> à l'intérieur du SVG
        el.removeChild(child);
        count(report, "processing-instruction");
        continue;
      }
      if (child.nodeType !== 1) continue;
      const node = child as Element;
      const tag = (node.localName || node.nodeName).toLowerCase();
      if (node.namespaceURI === XHTML_NS || DROP.has(tag) || (ANIMATIONS.has(tag) && animationTargetsCode(node))) {
        el.removeChild(node);
        count(report, tag);
        continue;
      }
      cleanAttributes(node, tag, report);
      walk(node, report);
    }
  }

  /** Assainit `svg` (et ses descendants) en place. */
  function sanitize(svg: Element): Report {
    const report: Report = { total: 0, removed: {} };
    if (!svg) return report;
    cleanAttributes(svg, (svg.localName || "svg").toLowerCase(), report);
    walk(svg, report);
    return report;
  }

  /** « script ×1, on* ×2 » — pour l'infobulle de la visionneuse. */
  function describe(report: Report): string {
    return Object.keys(report.removed).sort()
      .map((what) => what + " ×" + report.removed[what]).join(", ");
  }

  const publicApi = Object.freeze({ sanitize, describe, unsafeUrl });
  root.AtelierSvgSanitize = publicApi;
  return publicApi;
}
installSvgSanitizeApi(typeof globalThis !== 'undefined' ? globalThis : window);
export type SvgSanitizeApi = ReturnType<typeof installSvgSanitizeApi>;
