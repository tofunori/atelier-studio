/** Public contracts for scripts loaded by the gallery HTML pages. */
export {};
declare global {
  var __atelierTooltip: import('./atelier_tooltip').AtelierTooltipApi;
  var AtelierCsv: import('./csv_table').AtelierCsvApi;
  var AtelierPdfPassage: import('./pdf_passage').AtelierPdfPassageApi;
  var AtelierPdfReading: import('./pdf_reading').AtelierPdfReadingApi;
  var AtelierPdfSelection: import('./pdf_selection').AtelierPdfSelectionApi;
  var AtelierPdfRuntime: import('./pdf_runtime').AtelierPdfRuntimeApi;
  var AtelierPdfTools: import('./pdf_tools').AtelierPdfToolsApi;
  var FigureAnnotationGeometry: import('./figure_annotation_geometry').FigureAnnotationGeometryApi;
  var AtelierGalleryCommands: import('./gallery_commands').AtelierGalleryCommandsApi;
  var __atelierPost: import('./annot_kit').__atelierPostApi;
  var AnnotKit: import('./annot_kit').AnnotKitApi;
  var SelPill: import('./sel_pill').SelPillApi;
  var AtelierConflictGuard: import('./editor_conflict').AtelierConflictGuardApi;
  var DiffVersions: import('./diff_versions').DiffVersionsApi;
  var lbSetZoom: import('./pages/gallery_template_1').PageGlobals['lbSetZoom'];
  var lbZoomLevel: import('./pages/gallery_template_1').PageGlobals['lbZoomLevel'];
  var lbList: import('./pages/gallery_template_1').PageGlobals['lbList'];
  var lbShow: import('./pages/gallery_template_1').PageGlobals['lbShow'];
  var lb: import('./pages/gallery_template_1').PageGlobals['lb'];
  var lbHistory: import('./pages/gallery_template_1').PageGlobals['lbHistory'];
  var lbIdx: import('./pages/gallery_template_1').PageGlobals['lbIdx'];
  var lbVersionReady: import('./pages/gallery_template_1').PageGlobals['lbVersionReady'];
  var lbVersionNavigate: import('./pages/gallery_template_1').PageGlobals['lbVersionNavigate'];
  var lbVersionsPoll: import('./pages/gallery_template_1').PageGlobals['lbVersionsPoll'];
  var lbAttachDisplayed: import('./pages/gallery_template_1').PageGlobals['lbAttachDisplayed'];
  var annotToggle: import('./pages/gallery_template_1').PageGlobals['annotToggle'];
  var annotRedraw: import('./pages/gallery_template_1').PageGlobals['annotRedraw'];
  var annotGuard: import('./pages/gallery_template_1').PageGlobals['annotGuard'];
  var annotAskNote: import('./pages/gallery_template_1').PageGlobals['annotAskNote'];
  var annotRemember: import('./pages/gallery_template_1').PageGlobals['annotRemember'];
  var annotStrokes: import('./pages/gallery_template_1').PageGlobals['annotStrokes'];
  var annotBusy: boolean;
  var annotCur: import('./pages/gallery_template_1').PageGlobals['annotCur'];
  var annotDrag: import('./pages/gallery_template_1').PageGlobals['annotDrag'];
  var saveAnnots: import('./pages/pdf_viewer_6').PageGlobals['saveAnnots'];
  var removeAnnot: import('./pages/pdf_viewer_6').PageGlobals['removeAnnot'];
  var sendAnnot: import('./pages/pdf_viewer_6').PageGlobals['sendAnnot'];
  var __reloadPdf: import('./pages/pdf_viewer_6').PageGlobals['__reloadPdf'];
  var pdfRenderScheduler: import('./pages/pdf_viewer_6').PageGlobals['pdfRenderScheduler'];
  var hlText: import('./pages/pdf_viewer_6').PageGlobals['hlText'];
  var PDF_ANNOTS: import('./pages/pdf_viewer_6').PageGlobals['PDF_ANNOTS'];
  var ANNOTS_LOADED: import('./pages/pdf_viewer_6').PageGlobals['ANNOTS_LOADED'];
  var __atelierNonce: string | undefined;
  var __pdfjsReady: Promise<typeof import('pdfjs-dist')>;
  var __pdfjsResolve: (library: typeof import('pdfjs-dist')) => void;
  var __pdfjsReject: (error: unknown) => void;
  var pdfjsLib: typeof import('pdfjs-dist');
  var AtelierStudioRuntime: typeof import('../studio/host/runtime');
  var AtelierStudioCore: typeof import('../studio/core');
  var AtelierStudioCode: typeof import('../studio/features/code');
  var AtelierStudioMarkdown: typeof import('../studio/features/markdown');
  var AtelierStudioSurfaces: typeof import('../studio/surfaces');
  var AtelierAnnotationUI: typeof import('../studio/features/annotation_ui');
  var AtelierEditorFactory: import('../studio/core/editor_contract').StudioEditorFactory;
  var AtelierCodeMirrorDiff: typeof import('./cm6/atelier_diff');
  var cm: ReturnType<typeof import('./cm6/studio_editor').createStudioEditor>;
  var cm6: import('@codemirror/view').EditorView;
  var katex: import('../studio/features/latex').KatexRenderer;
  var marked: import('../studio/features/markdown').MarkdownParser;
  var DOMPurify: import('../studio/features/markdown').HtmlSanitizer;
  var Diff: typeof import('diff');
  var __FOLDERS__: string[];
  var __FAVS__: string[];
  var __DATA__: import("../contracts/gallery").GalleryRow[] | null;
  var AtelierRuntime: { rewriteUrl(url: string): string };
  var toastui: { Editor: new (options: Record<string, unknown>) => {
    on(event: string, listener: () => void): void;
    getMarkdown(): string; setMarkdown(text: string): void;
    getCurrentModeEditor(): unknown; destroy(): void;
  }};
  interface Window {
    __galleryFileTypes?: import('../contracts/gallery').GalleryFileTypeAdapter;
    __gallerySelection?: import('../contracts/gallery').GallerySelectionAdapter;
    __galleryPresentation?: import('../contracts/gallery').GalleryPresentationAdapter;
    __galleryConfirm?: (message: string, label?: string) => Promise<boolean>;
    __ENGINE?: string;
    __tokq?: string;
    __atelierTheme?: {mode?: string; tokens?: Record<string, string>; [key: string]: unknown};
    __claudeSelOverlay?: boolean;
    webkit?: { messageHandlers?: Record<string, {postMessage(message: unknown): void}> };
  }
  interface HTMLElement {
    __trigger?: HTMLElement;
    _html?: string;
    _order?: HTMLSpanElement[];
    _passageIndex?: ReturnType<typeof AtelierPdfPassage.createIndex>;
    _spec?: unknown;
    webkitRequestFullscreen?: () => Promise<void>;
  }
  interface Window {
    __readingMode?: import('./pages/pdf_viewer_6').ReadingMode;
    __pdfTextSearch?: {scan(query:string, onPage:(page:number,matches:ReturnType<typeof AtelierPdfPassage.findAllInIndex>)=>void, cancelled:()=>boolean):Promise<boolean>;ensurePage(page:number):Promise<unknown>;releaseSelection():void;numPages():number;pageIndex(page:number):Promise<ReturnType<typeof AtelierPdfPassage.createIndex>|null>};
  }
  interface Navigator {
    userAgentData?: {platform?: string;brands?: {brand:string;version:string}[]}; virtualKeyboard?: {overlaysContent: boolean} }
  interface Document {
    webkitFullscreenElement?: Element;
    webkitExitFullscreen?: () => Promise<void>;
    caretRangeFromPoint?(x: number, y: number): Range | null;
    caretPositionFromPoint?(x: number, y: number): {offsetNode: Node; offset: number} | null;
  }
}
