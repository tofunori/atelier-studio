
  import * as pdfjsLib from "/.fig_thumbs/pdfjs/pdf.min.mjs";
  window.pdfjsLib = pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/.fig_thumbs/pdfjs/pdf.worker.min.mjs";
  window.__pdfjsResolve(pdfjsLib);
