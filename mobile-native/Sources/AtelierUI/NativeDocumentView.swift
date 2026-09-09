import SwiftUI
import PDFKit

struct NativeDocumentView: View {
    @Bindable var workspace: WorkspaceModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var showingDiff = false
    @State private var annotatingFigure = false
    @State private var showingReadingNotes = false
    @State private var pendingFigure: DocumentPassage?
    @State private var pdfReading = PDFReadingModel()
    @State private var showingPDFAnnotations = false

    private var readingDraft: AnnotationDraft? {
        guard let draft = workspace.annotationDraft,
              draft.passage.sourceRange != nil, draft.passage.articleKey == nil else { return nil }
        return draft
    }
    private var pdfDraft: AnnotationDraft? {
        guard let draft = workspace.annotationDraft, !draft.passage.regions.isEmpty else { return nil }
        return draft
    }
    private var modalDraft: Binding<AnnotationDraft?> {
        Binding(get: { readingDraft == nil && pdfDraft == nil ? workspace.annotationDraft : nil },
                set: { if $0 != nil || (readingDraft == nil && pdfDraft == nil) { workspace.annotationDraft = $0 } })
    }

    var body: some View {
        VStack(spacing: 0) {
            if workspace.image == nil && !workspace.availableDocumentModes.isEmpty {
                Picker("Vue du document", selection: $workspace.documentMode) {
                    ForEach(workspace.availableDocumentModes, id: \.self) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
                .pickerStyle(.segmented).padding(.horizontal, 16).padding(.vertical, 8)
            }
            if workspace.remoteDocumentChanged {
                Text("Le fichier a changé sur le Mac. Votre brouillon est conservé ; utilisez Recharger depuis le Mac pour comparer.")
                    .font(.caption).padding(12)
            }
            if let image = workspace.image {
                ZoomableArtifactImage(image: image)
            } else if workspace.documentMode == .reading {
                if workspace.sourceAvailable { LatexReadingView(workspace: workspace) }
                else { PDFReadingView(workspace: workspace, model: pdfReading).id(workspace.documentID) }
            } else if workspace.documentMode == .source {
                SyntaxSourceEditor(workspace: workspace)
            } else {
                NativePDFView(workspace: workspace)
            }
        }
        .task(id: workspace.documentID) {
            await workspace.refreshDocumentIfNeeded()
            if workspace.chat.isPreview && ProcessInfo.processInfo.arguments.contains("--document-diff-fixture") { showingDiff = true }
        }
        .onChange(of: workspace.surface) { _, surface in
            if surface == .document { Task { await workspace.refreshDocumentIfNeeded() } }
        }
        .onChange(of: workspace.chat.completedResponse) { _, _ in Task { await workspace.refreshDocumentIfNeeded() } }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await workspace.refreshDocumentIfNeeded() } }
        }
        .sheet(isPresented: $showingDiff) {
            DocumentChangesView(previous: workspace.comparisonSources[workspace.documentID] ?? workspace.originalSources[workspace.documentID] ?? workspace.source,
                                current: workspace.source, name: workspace.sourceName)
        }
        .onChange(of: workspace.source) { _, _ in workspace.scheduleDocumentResume() }
        .onChange(of: workspace.pdfPage) { _, _ in workspace.scheduleDocumentResume() }
        .onChange(of: workspace.documentMode) { _, _ in workspace.scheduleDocumentResume() }
        .onDisappear { workspace.scheduleDocumentResume() }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let draft = pdfDraft {
                PDFAnnotationEditor(workspace: workspace, passage: draft.passage, close: { workspace.annotationDraft = nil })
                    .id(draft.id).padding(.horizontal, 8).padding(.vertical, 6)
            } else if let draft = readingDraft {
                ReadingAnnotationEditor(workspace: workspace, draft: draft) {
                    workspace.annotationDraft = nil
                    showingReadingNotes = !workspace.documentReadingNotes.isEmpty
                }
                .id(draft.id).padding(.horizontal, 8).padding(.vertical, 6)
            } else if showingReadingNotes && workspace.sourceAvailable {
                ReadingAnnotationsCard(workspace: workspace) { showingReadingNotes = false }
                    .padding(.horizontal, 8).padding(.vertical, 6)
            } else {
                VStack(spacing: 6) {
                if workspace.image != nil {
                    Button("Annoter la figure", systemImage: "highlighter") { annotatingFigure = true }.frame(minHeight: 44)
                } else if workspace.documentMode == .reading && !workspace.sourceAvailable {
                    Text("Figures, tableaux et annotations dans le PDF")
                        .font(.caption).foregroundStyle(.secondary)
                } else if let passage = workspace.activePassage {
                    HStack {
                        Text(passage.location).font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        Button("Ajouter au chat") { workspace.addDocumentPassageToChat(passage) }.font(.caption)
                        Button { workspace.beginAnnotation() } label: {
                            Label("Annoter", systemImage: "highlighter")
                                .font(.subheadline.weight(.medium))
                                .padding(.horizontal, 14).frame(minHeight: 44)
                                .foregroundStyle(Color(uiColor: .systemBackground))
                                .background(AtelierTheme.accent(named: "sage"), in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("annotateSelection")
                    }
                } else {
                    Text(workspace.documentMode == .pdf
                         ? "Page \(workspace.pdfPage + 1) · sélectionnez un passage pour l’annoter"
                         : "Sélectionnez un passage pour l’annoter")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if workspace.sourceAvailable {
                    Button { showingReadingNotes = true } label: {
                        Label("\(workspace.documentReadingNotes.count) annotation\(workspace.documentReadingNotes.count == 1 ? "" : "s")", systemImage: "text.bubble")
                            .font(.caption).padding(.horizontal, 16).frame(minHeight: 44)
                    }.buttonStyle(.plain).background(AtelierTheme.surface, in: Capsule())
                        .accessibilityIdentifier("readingAnnotations")
                }
                if workspace.pdfDocument != nil && workspace.image == nil && (workspace.documentMode == .pdf || !workspace.sourceAvailable) {
                    Button { showingPDFAnnotations = true } label: {
                        Label("Annotations (\(workspace.documentPDFMarks.count))", systemImage: "text.bubble")
                            .font(.caption).frame(minHeight: 44)
                    }.accessibilityIdentifier("pdfAnnotations")
                }
            }
            .frame(maxWidth: .infinity).padding(.horizontal, 16).padding(.vertical, 8).background(.background)
            }
        }
        .onChange(of: workspace.documentID) { _, _ in showingReadingNotes = false }
        .alert("Document", isPresented: Binding(get: { workspace.documentError != nil }, set: { if !$0 { workspace.documentError = nil } })) { Button("OK") { workspace.documentError = nil } } message: { Text(workspace.documentError ?? "") }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if workspace.sourceAvailable {
                    Button("Diff") { showingDiff = true }.accessibilityLabel("Voir les modifications")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                if workspace.documentMode == .reading && !workspace.sourceAvailable && workspace.pdfDocument != nil {
                    PDFReadingSettings()
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                if workspace.sourceAvailable && workspace.documentMode == .source {
                    Button(workspace.editingSource ? "Terminer l’édition" : "Modifier", systemImage: workspace.editingSource ? "checkmark.circle" : "pencil") { workspace.editingSource.toggle() }
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                if workspace.documentDirty {
                    Button("Enregistrer", systemImage: "checkmark") { Task { await workspace.saveDocument() } }.disabled(workspace.savingDocument)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                if let item = workspace.viewedArtifact {
                    Menu {
                        Button("Joindre au chat", systemImage: "paperclip") { workspace.attachToChat(item) }
                        if workspace.sourceAvailable && item.fileID != nil {
                            Button("Recharger depuis le Mac", systemImage: "arrow.clockwise") { Task { await workspace.reloadDocument() } }
                            if workspace.recoveredDrafts[workspace.documentID] != nil {
                                Button("Récupérer mon brouillon", systemImage: "arrow.uturn.backward") { workspace.recoverDocumentDraft() }
                            }
                        }
                    } label: { Image(systemName: "ellipsis") }.accessibilityLabel("Actions du document")
                }
            }
        }
        .sheet(isPresented: $annotatingFigure, onDismiss: {
            if let passage = pendingFigure { workspace.annotationDraft = AnnotationDraft(passage: passage); pendingFigure = nil }
        }) { if let image = workspace.image { FigureAnnotationView(workspace: workspace, image: image) { pendingFigure = $0 } } }
        .sheet(item: modalDraft) { draft in
            if !draft.passage.regions.isEmpty {
                PDFAnnotationEditor(workspace: workspace, passage: draft.passage)
            } else {
                AnnotationSheet(workspace: workspace, draft: draft)
            }
        }
        .sheet(isPresented: $showingPDFAnnotations) { PDFAnnotationsList(workspace: workspace) }
    }
}

struct NativePDFView: UIViewRepresentable {
    let workspace: WorkspaceModel

    func makeCoordinator() -> Coordinator { Coordinator(workspace: workspace) }

    func makeUIView(context: Context) -> PDFView {
        let view = PageRestoringPDFView()
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.backgroundColor = .secondarySystemBackground
        view.document = workspace.pdfDocument
        view.restorePageWhenReady(workspace.pdfPage)
        context.coordinator.observe(view)
        return view
    }

    func updateUIView(_ view: PDFView, context: Context) {
        if view.document !== workspace.pdfDocument {
            let targetPage = workspace.pdfPage
            view.document = workspace.pdfDocument
            (view as? PageRestoringPDFView)?.restorePageWhenReady(targetPage)
        }
        if context.coordinator.navigationRequest != workspace.pdfNavigationRequest {
            context.coordinator.navigationRequest = workspace.pdfNavigationRequest
            (view as? PageRestoringPDFView)?.restorePageWhenReady(workspace.pdfPage)
        }
    }

    static func dismantleUIView(_ view: PDFView, coordinator: Coordinator) { coordinator.stop() }

    @MainActor final class Coordinator {
        let workspace: WorkspaceModel
        var navigationRequest: UUID
        private var observers: [NSObjectProtocol] = []
        init(workspace: WorkspaceModel) { self.workspace = workspace; navigationRequest = workspace.pdfNavigationRequest }
        func observe(_ view: PDFView) {
            observers.append(NotificationCenter.default.addObserver(forName: .PDFViewPageChanged, object: view, queue: .main) { [weak self, weak view] _ in
                MainActor.assumeIsolated {
                    guard let self, let view, let document = view.document, let current = view.currentPage else { return }
                    let index = document.index(for: current)
                    if index != NSNotFound { self.workspace.pdfPage = index }
                }
            })
            observers.append(NotificationCenter.default.addObserver(forName: .PDFViewSelectionChanged, object: view, queue: .main) { [weak self, weak view] _ in
                MainActor.assumeIsolated { self?.workspace.capturePDFSelection(view?.currentSelection) }
            })
        }
        func stop() {
            for observer in observers { NotificationCenter.default.removeObserver(observer) }
            observers.removeAll()
        }
    }
}

/// PDFKit can ignore go(to:) before it has a usable layout during a reader-mode transition.
final class PageRestoringPDFView: PDFView {
    private var pendingPage: Int?
    func restorePageWhenReady(_ index: Int) { pendingPage = index; setNeedsLayout() }
    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.width > 0, bounds.height > 0, let index = pendingPage, let target = document?.page(at: index) else { return }
        pendingPage = nil
        go(to: target)
    }
}

struct ZoomableArtifactImage: UIViewRepresentable {
    let image: UIImage
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> UIScrollView {
        let scroll = UIScrollView()
        scroll.minimumZoomScale = 1; scroll.maximumZoomScale = 6
        scroll.delegate = context.coordinator
        let view = context.coordinator.imageView
        view.contentMode = .scaleAspectFit
        scroll.addSubview(view)
        return scroll
    }
    func updateUIView(_ scroll: UIScrollView, context: Context) {
        let view = context.coordinator.imageView
        if view.image !== image { scroll.zoomScale = 1; view.image = image }
        view.frame = scroll.bounds
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    }
    final class Coordinator: NSObject, UIScrollViewDelegate {
        let imageView = UIImageView()
        func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView }
    }
}
