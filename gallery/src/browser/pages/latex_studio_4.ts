
// pdfjsLib arrive par un script MODULE : differe, donc pas encore la quand ce
// script classique s'execute. Le bootstrap attend le rendez-vous.
window.__pdfjsReady.then(function(pdfjsLib){
AtelierStudioSurfaces.bootstrapLatexSurface({
  editorFactory: AtelierEditorFactory,
  diffFactory: DiffVersions,
  csvToolkit: AtelierCsv,
  // The surface exposes only the pdf.js operations it uses (also implemented by test doubles).
  pdfjs: pdfjsLib as unknown as Parameters<typeof AtelierStudioSurfaces.bootstrapLatexSurface>[0]['pdfjs'],
  selectionPill: SelPill,
  parser: marked,
  sanitizer: DOMPurify,
  katex,
  postToHost: (payload) => __atelierPost(payload),
});
});
