import SwiftUI
import PDFKit

struct NativeDocumentView: View {
    @Bindable var workspace: WorkspaceModel

    var body: some View {
        VStack(spacing: 0) {
            if workspace.sourceAvailable && workspace.pdfDocument != nil {
                Picker("Vue du document", selection: $workspace.documentMode) {
                    ForEach(WorkspaceModel.DocumentMode.allCases, id: \.self) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
                .pickerStyle(.segmented).padding(.horizontal, 16).padding(.vertical, 8)
            }
            if let image = workspace.image {
                ZoomableArtifactImage(image: image)
            } else if workspace.documentMode == .source {
                TextEditor(text: $workspace.source, selection: $workspace.selection)
                    .font(.system(.body, design: .monospaced))
                    .autocorrectionDisabled().textInputAutocapitalization(.never)
                    .padding(.horizontal, 8)
                    .accessibilityIdentifier("latexSource")
            } else {
                NativePDFView(workspace: workspace)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 6) {
                if workspace.image != nil {
                    Text("Pincez pour zoomer").font(.caption).foregroundStyle(.secondary)
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
