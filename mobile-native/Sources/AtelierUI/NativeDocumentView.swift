import SwiftUI
import PDFKit

struct NativeDocumentView: View {
    @Bindable var workspace: WorkspaceModel
    @State private var annotatingFigure = false
    @State private var pendingFigure: DocumentPassage?

    var body: some View {
        VStack(spacing: 0) {
            if workspace.sourceAvailable {
                Picker("Vue du document", selection: $workspace.documentMode) {
                    ForEach(WorkspaceModel.DocumentMode.allCases, id: \.self) { mode in
                        if mode != .pdf || workspace.pdfDocument != nil { Text(mode.rawValue).tag(mode) }
                    }
                }
                .pickerStyle(.segmented).padding(.horizontal, 16).padding(.vertical, 8)
            }
            if let image = workspace.image {
                ZoomableArtifactImage(image: image)
            } else if workspace.documentMode == .reading {
                LatexReadingView(workspace: workspace)
            } else if workspace.documentMode == .source {
                SyntaxSourceEditor(workspace: workspace)
            } else {
                NativePDFView(workspace: workspace)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 6) {
                if workspace.image != nil {
                    Button("Annoter la figure", systemImage: "highlighter") { annotatingFigure = true }.frame(minHeight: 44)
                } else if let passage = workspace.activePassage {
                    HStack {
                        Text(passage.location).font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        Button { workspace.beginAnnotation() } label: {
                            Label("Annoter", systemImage: "highlighter")
                        }
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("annotateSelection")
                    }
                } else {
                    Text(workspace.documentMode == .pdf
                         ? "Page \(workspace.pdfPage + 1) · sélectionnez un passage pour l’annoter"
                         : "Sélectionnez un passage pour l’annoter")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity).padding(.horizontal, 16).padding(.vertical, 8).background(.background)
        }
        .alert("Sauvegarde impossible", isPresented: Binding(get: { workspace.documentError != nil }, set: { if !$0 { workspace.documentError = nil } })) { Button("OK") { workspace.documentError = nil } } message: { Text(workspace.documentError ?? "") }
        .toolbar {
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
        .sheet(item: $workspace.annotationDraft) { draft in
            AnnotationSheet(workspace: workspace, draft: draft)
        }
    }
}

struct NativePDFView: UIViewRepresentable {
    let workspace: WorkspaceModel

    func makeCoordinator() -> Coordinator { Coordinator(workspace: workspace) }

    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.backgroundColor = .secondarySystemBackground
        view.document = workspace.pdfDocument
        if let target = view.document?.page(at: workspace.pdfPage) { view.go(to: target) }
        context.coordinator.observe(view)
        return view
    }

    func updateUIView(_ view: PDFView, context: Context) {
        if view.document !== workspace.pdfDocument {
            let targetPage = workspace.pdfPage
            view.document = workspace.pdfDocument
            if let target = view.document?.page(at: targetPage) { view.go(to: target) }
        }
    }

    static func dismantleUIView(_ view: PDFView, coordinator: Coordinator) { coordinator.stop() }

    @MainActor final class Coordinator {
        let workspace: WorkspaceModel
        private var observers: [NSObjectProtocol] = []
        init(workspace: WorkspaceModel) { self.workspace = workspace }
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
