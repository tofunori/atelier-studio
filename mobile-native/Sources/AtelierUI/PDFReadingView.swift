import SwiftUI
import PDFKit

@MainActor @Observable final class PDFReadingModel {
    private(set) var pages: [Int: PDFReadingPage] = [:]
    private(set) var errors: [Int: String] = [:]
    private var documentID: UUID?
    private var fingerprint: String?
    @ObservationIgnored private var extractor: PDFReadingExtractor?
    func content(_ page: Int, documentID: UUID, fingerprint: String? = nil) -> PDFReadingPage? { self.documentID == documentID && self.fingerprint == fingerprint ? pages[page] : nil }
    func failure(_ page: Int, documentID: UUID, fingerprint: String? = nil) -> String? { self.documentID == documentID && self.fingerprint == fingerprint ? errors[page] : nil }

    func load(page: Int, documentID: UUID, bytes: Data?, fingerprint: String? = nil) async {
        guard !Task.isCancelled else { return }
        if self.documentID != documentID || self.fingerprint != fingerprint {
            self.documentID = documentID; self.fingerprint = fingerprint; pages = [:]; errors = [:]
            extractor = bytes.map { PDFReadingExtractor(bytes: $0) }
        }
        guard pages[page] == nil else { return }
        guard let extractor else { errors[page] = "Le texte de cette page est indisponible."; return }
        do {
            let result = try await extractor.page(page)
            guard !Task.isCancelled, self.documentID == documentID, self.fingerprint == fingerprint else { return }
            pages[page] = result; errors[page] = nil
        } catch {
            guard !Task.isCancelled, !(error is CancellationError), self.documentID == documentID, self.fingerprint == fingerprint else { return }
            errors[page] = "Cette page ne peut pas être adaptée. Vous pouvez la lire dans le PDF."
        }
    }
}

struct PDFReadingView: View {
    let workspace: WorkspaceModel
    let model: PDFReadingModel
    @State private var position: Int?
    @State private var restored = false
    @State private var selectionErrorPage: Int?
    @AppStorage("atelier.pdfReadingScale") private var scale = 1.0
    @AppStorage("atelier.readingFont") private var readingFont = "serif"
    @ScaledMetric(relativeTo: .body) private var fontSize = 18.0

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 32) {
                ForEach(0..<(workspace.pdfDocument?.pageCount ?? 0), id: \.self) { index in
                    page(index).id(index)
                }
            }.scrollTargetLayout().padding(.horizontal, 22).padding(.vertical, 20)
        }
        .scrollPosition(id: $position, anchor: .top)
        .onAppear { if !restored { restored = true; position = workspace.pdfPage } }
        .onChange(of: position) { _, page in
            if let page, workspace.documentMode == .reading, workspace.surface == .document { workspace.pdfPage = page }
        }
        .onChange(of: workspace.documentID) { _, _ in position = workspace.pdfPage }
        .background(Color(uiColor: .systemBackground))
        .accessibilityIdentifier("pdfReadingView")
        .alert("Passage à vérifier dans le PDF", isPresented: Binding(get: { selectionErrorPage != nil }, set: { if !$0 { selectionErrorPage = nil } })) {
            Button("Voir le PDF") {
                if let index = selectionErrorPage { workspace.pdfPage = index }
                workspace.documentMode = .pdf; selectionErrorPage = nil
            }
            Button("Annuler", role: .cancel) { selectionErrorPage = nil }
        } message: { Text("L’emplacement exact de cette sélection ne peut pas être garanti. Aucune annotation n’a été créée.") }
    }

    private func page(_ index: Int) -> some View {
        let documentID = workspace.documentID
        let fingerprint = workspace.pdfFingerprint
        let bytes = workspace.documentBytes
        return VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .firstTextBaseline) {
                Text("Page \(index + 1)").font(.caption.weight(.medium)).foregroundStyle(.secondary)
                Spacer()
                Button("Voir le PDF", systemImage: "doc.richtext") {
                    workspace.pdfPage = index; workspace.documentMode = .pdf
                }.font(.caption).frame(minHeight: 44)
                    .accessibilityLabel("Voir la page \(index + 1) dans le PDF")
            }
            if let page = model.content(index, documentID: documentID, fingerprint: fingerprint) {
                if page.blocks.isEmpty {
                    Text("Cette page ne contient pas de texte sélectionnable. Consultez sa mise en page dans le PDF.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(page.blocks) { block in
                        if let visual = block.visual, let image = UIImage(data: visual.image) {
                            Button {
                                workspace.pdfPage = index; workspace.pdfNavigationRequest = UUID(); workspace.documentMode = .pdf
                            } label: {
                                VStack(alignment: .leading, spacing: 8) {
                                    Image(uiImage: image).resizable().scaledToFit()
                                        .accessibilityHidden(true)
                                    Label("\(visual.label) · agrandir dans le PDF", systemImage: "arrow.up.left.and.arrow.down.right")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }.buttonStyle(.plain).accessibilityIdentifier("pdfReadingVisual.\(index).\(block.id)")
                        } else {
                            PDFReadingSelectableText(text: block.text, font: font(for: block),
                                highlights: highlights(in: block, page: index),
                                onAnnotate: { use($0, block: block, page: index, documentID: documentID, fingerprint: fingerprint, annotate: true) },
                                onQuote: { use($0, block: block, page: index, documentID: documentID, fingerprint: fingerprint, annotate: false) })
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .accessibilityIdentifier("pdfReadingText.\(index).\(block.id)")
                        }
                    }
                }
                if !page.margins.isEmpty {
                    DisclosureGroup("En-tête et pied de page") {
                        ForEach(page.margins) { block in Text(verbatim: block.text).textSelection(.enabled) }
                    }.font(.footnote).foregroundStyle(.secondary)
                }
            } else if let error = model.failure(index, documentID: documentID, fingerprint: fingerprint) {
                Text(error).foregroundStyle(.secondary)
                Button("Réessayer") { Task { await model.load(page: index, documentID: documentID, bytes: bytes, fingerprint: fingerprint) } }
            } else {
                ProgressView("Préparation de la lecture…").frame(maxWidth: .infinity, minHeight: 220)
            }
            Divider()
        }
        .task(id: "\(documentID):\(fingerprint):\(index)") {
            await model.load(page: index, documentID: documentID, bytes: bytes, fingerprint: fingerprint)
        }
    }

    private func font(for block: PDFReadingBlock) -> UIFont {
        let size = fontSize * min(1.6, max(0.85, scale)) * (block.heading ? 1.12 : 1)
        let base = UIFont.systemFont(ofSize: size, weight: block.heading ? .semibold : .regular)
        return readingFont == "serif" ? UIFont(descriptor: base.fontDescriptor.withDesign(.serif) ?? base.fontDescriptor, size: size) : base
    }

    private func use(_ range: NSRange, block: PDFReadingBlock, page: Int, documentID: UUID, fingerprint: String?, annotate: Bool) {
        guard workspace.documentID == documentID, workspace.pdfFingerprint == fingerprint else { return }
        guard let rects = block.regions(for: range),
              let text = SelectableChatText.passage(in: block.text, range: range) else { selectionErrorPage = page; return }
        let passage = DocumentPassage(documentID: documentID, fileName: workspace.pdfName, location: "page \(page + 1)", text: text,
            regions: rects.map { .init(pageIndex: page, bounds: $0) },
            articleKey: workspace.currentArticle?.key, articleAttachmentKey: workspace.currentArticle?.pdfKey)
        if annotate { workspace.annotationDraft = AnnotationDraft(passage: passage) }
        else { workspace.addDocumentPassageToChat(passage) }
    }

    private func highlights(in block: PDFReadingBlock, page index: Int) -> [PDFReadingHighlight] {
        var result: [PDFReadingHighlight] = []
        for mark in workspace.documentPDFMarks {
            let regions = mark.regions.filter { $0.page == index }.map(\.bounds)
            result += block.ranges(inside: regions).map { PDFReadingHighlight(range: $0, color: mark.color.uiColor, underline: mark.style == .underline) }
        }
        if let page = workspace.pdfDocument?.page(at: index) {
            for mark in workspace.documentSharedPDFMarks where mark.page == index + 1 && ["hl", "ul", "st", "comment"].contains(mark.kind) {
                let regions = mark.rects.compactMap { SharedPDFMark.bounds($0, on: page) }
                result += block.ranges(inside: regions).map { PDFReadingHighlight(range: $0, color: mark.uiColor, underline: mark.kind == "ul" || mark.kind == "comment", strikethrough: mark.kind == "st") }
            }
        }
        return result
    }
}

struct PDFReadingSettings: View {
    @AppStorage("atelier.pdfReadingScale") private var scale = 1.0
    @AppStorage("atelier.readingFont") private var readingFont = "serif"
    var body: some View {
        Menu {
            Button("Agrandir le texte", systemImage: "textformat.size.larger") { scale = min(1.6, scale + 0.1) }.disabled(scale >= 1.6)
            Button("Réduire le texte", systemImage: "textformat.size.smaller") { scale = max(0.85, scale - 0.1) }.disabled(scale <= 0.85)
            Button("Taille standard") { scale = 1 }
            Picker("Police", selection: $readingFont) {
                Text("Éditoriale").tag("serif")
                Text("Système").tag("sans")
            }
        } label: { Text("Aa").font(.system(size: 18, weight: .medium)).frame(minWidth: 32, minHeight: 44) }
        .accessibilityLabel("Réglages de lecture")
    }
}
