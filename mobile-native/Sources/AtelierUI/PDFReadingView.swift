import SwiftUI
import PDFKit

@MainActor @Observable final class PDFReadingModel {
    /// Pages as read: a paragraph cut by a page break is whole on the page where it begins.
    private(set) var pages: [Int: PDFReadingPage] = [:]
    private(set) var errors: [Int: String] = [:]
    @ObservationIgnored private var extracted: [Int: PDFReadingPage] = [:]
    private var documentID: UUID?
    private var fingerprint: String?
    @ObservationIgnored private var extractor: PDFReadingExtractor?
    func content(_ page: Int, documentID: UUID, fingerprint: String? = nil) -> PDFReadingPage? { self.documentID == documentID && self.fingerprint == fingerprint ? pages[page] : nil }
    func failure(_ page: Int, documentID: UUID, fingerprint: String? = nil) -> String? { self.documentID == documentID && self.fingerprint == fingerprint ? errors[page] : nil }

    func load(page: Int, documentID: UUID, bytes: Data?, fingerprint: String? = nil) async {
        guard !Task.isCancelled else { return }
        if self.documentID != documentID || self.fingerprint != fingerprint {
            self.documentID = documentID; self.fingerprint = fingerprint; pages = [:]; errors = [:]; extracted = [:]
            extractor = bytes.map { PDFReadingExtractor(bytes: $0) }
        }
        guard extracted[page] == nil else { return }
        guard let extractor else { errors[page] = "Le texte de cette page est indisponible."; return }
        do {
            let result = try await extractor.page(page)
            guard !Task.isCancelled, self.documentID == documentID, self.fingerprint == fingerprint else { return }
            extracted[page] = result; errors[page] = nil
            for index in [page - 1, page, page + 1] { join(index) }
        } catch {
            guard !Task.isCancelled, !(error is CancellationError), self.documentID == documentID, self.fingerprint == fingerprint else { return }
            errors[page] = "Cette page ne peut pas être adaptée. Vous pouvez la lire dans le PDF."
        }
    }

    private func join(_ index: Int) {
        guard let current = extracted[index] else { return }
        let page = PDFReadingPage.joining(previous: extracted[index - 1], current: current, next: extracted[index + 1])
            .joiningHyphenatedLines(isWord: PDFReadingDictionary.isWord)
        let blocks = pages[index]?.blocks
        // Rebuilding an unchanged page would redraw its text and lose the reader's selection.
        if blocks == nil || blocks!.map(\.text) != page.blocks.map(\.text) || pages[index]?.continued != page.continued { pages[index] = page }
    }
}

struct PDFReadingView: View {
    let workspace: WorkspaceModel
    let model: PDFReadingModel
    @State private var position: Int?
    @State private var restored = false
    @State private var selectionErrorPage: Int?
    @State private var editing: PDFMark?
    @State private var macMark: SharedPDFMark?
    @State private var figure: PDFReadingVisual?
    @State private var figurePage = 0
    @AppStorage("atelier.pdfReadingScale") private var scale = 1.0
    @AppStorage("atelier.readingFont") private var readingFont = "serif"
    @ScaledMetric(relativeTo: .body) private var fontSize = 18.0

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
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
        .sheet(item: $editing) { mark in
            ScrollView { PDFAnnotationEditor(workspace: workspace, passage: workspace.passage(for: mark), existing: mark) }
                .presentationDetents([.height(250), .medium, .large]).presentationDragIndicator(.visible)
        }
        .sheet(item: $macMark) { mark in macMarkCard(mark).presentationDetents([.height(240), .medium]).presentationDragIndicator(.visible) }
        .sheet(isPresented: Binding(get: { figure != nil }, set: { if !$0 { figure = nil } })) {
            if let figure { figureSheet(figure) }
        }
    }

    private func page(_ index: Int) -> some View {
        let documentID = workspace.documentID
        let fingerprint = workspace.pdfFingerprint
        let bytes = workspace.documentBytes
        let content = model.content(index, documentID: documentID, fingerprint: fingerprint)
        return VStack(alignment: .leading, spacing: 14) {
            if let page = content {
                if page.blocks.isEmpty && !page.continued {
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
                                highlights: highlights(in: block), levels: block.levels,
                                pageBreaks: block.pageBreaks.map { (offset: $0.offset, label: "p. \($0.page + 1)") },
                                onAnnotate: { use($0, block: block, page: index, documentID: documentID, fingerprint: fingerprint, annotate: true) },
                                onQuote: { use($0, block: block, page: index, documentID: documentID, fingerprint: fingerprint, annotate: false) },
                                onOpenMark: open, onFigure: showFigure)
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
        }
        // The page number sits in the margin; a page whose first paragraph began earlier shows it inside that paragraph.
        .overlay(alignment: .topTrailing) {
            if content?.continued != true {
                Text("p. \(index + 1)").font(.system(size: 10, weight: .medium)).monospacedDigit().foregroundStyle(.secondary)
                    .fixedSize().rotationEffect(.degrees(-90)).frame(width: 12, height: 30).offset(x: 17, y: 2)
                    .accessibilityLabel("Page \(index + 1)")
            }
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
        guard let regions = block.pageRegions(for: range),
              let text = SelectableChatText.passage(in: block.text, range: range) else { selectionErrorPage = page; return }
        let first = regions.first?.page ?? page
        let passage = DocumentPassage(documentID: documentID, fileName: workspace.pdfName, location: "page \(first + 1)", text: text,
            regions: regions.map { .init(pageIndex: $0.page, bounds: $0.bounds) },
            articleKey: workspace.currentArticle?.key, articleAttachmentKey: workspace.currentArticle?.pdfKey)
        if annotate { workspace.annotationDraft = AnnotationDraft(passage: passage) }
        else { workspace.addDocumentPassageToChat(passage) }
    }

    /// Marks of every page the block covers, a paragraph continued on the next page included.
    private func highlights(in block: PDFReadingBlock) -> [PDFReadingHighlight] {
        var result: [PDFReadingHighlight] = []
        for index in block.pages {
            for mark in workspace.documentPDFMarks {
                let regions = mark.regions.filter { $0.page == index }.map(\.bounds)
                guard !regions.isEmpty else { continue }
                result += block.ranges(inside: regions, page: index).map {
                    PDFReadingHighlight(range: $0, color: mark.color.uiColor, underline: mark.style == .underline,
                                        markID: mark.id.uuidString, hasNote: !mark.note.isEmpty)
                }
            }
            if let page = workspace.pdfDocument?.page(at: index) {
                for mark in workspace.documentSharedPDFMarks where mark.page == index + 1 && ["hl", "ul", "st", "comment"].contains(mark.kind) {
                    let regions = mark.rects.compactMap { SharedPDFMark.bounds($0, on: page) }
                    result += block.ranges(inside: regions, page: index).map {
                        PDFReadingHighlight(range: $0, color: mark.uiColor, underline: mark.kind == "ul" || mark.kind == "comment",
                                            strikethrough: mark.kind == "st", markID: "mac:" + mark.id, hasNote: !mark.displayNote.isEmpty)
                    }
                }
            }
        }
        // A note sign once, at the end of the passage, even when the mark spans several pieces.
        var noted = Set<String>()
        for index in result.indices.reversed() where result[index].hasNote {
            if !noted.insert(result[index].markID ?? "").inserted { result[index].hasNote = false }
        }
        return result
    }

    private func open(_ id: String) {
        if id.hasPrefix("mac:") {
            macMark = workspace.documentSharedPDFMarks.first { "mac:" + $0.id == id }
        } else {
            editing = workspace.documentPDFMarks.first { $0.id.uuidString == id }
        }
    }

    private func macMarkCard(_ mark: SharedPDFMark) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Sur le Mac · page \(mark.page)").font(.caption).foregroundStyle(.secondary)
            if !mark.text.isEmpty { Text(mark.text).font(.subheadline).textSelection(.enabled) }
            if !mark.displayNote.isEmpty { Text(mark.displayNote).font(.subheadline).foregroundStyle(.secondary).textSelection(.enabled) }
            Spacer(minLength: 0)
        }.padding(20).frame(maxWidth: .infinity, alignment: .leading)
    }

    /// A mention such as « Figure 9a » opens that figure, found by its caption anywhere in the article.
    private func showFigure(_ number: String) {
        guard let document = workspace.pdfDocument else { return }
        let caption = try? NSRegularExpression(pattern: #"(?m)^\s*(?:Figure|Fig\.)\s*"# + NSRegularExpression.escapedPattern(for: number) + #"\s*[.:]"#)
        guard let index = (0..<document.pageCount).first(where: { index in
            guard let text = document.page(at: index)?.string else { return false }
            return caption?.firstMatch(in: text, range: NSRange(location: 0, length: (text as NSString).length)) != nil
        }) else { return }
        let documentID = workspace.documentID, fingerprint = workspace.pdfFingerprint, bytes = workspace.documentBytes
        Task {
            await model.load(page: index, documentID: documentID, bytes: bytes, fingerprint: fingerprint)
            if let visual = model.content(index, documentID: documentID, fingerprint: fingerprint)?.blocks.compactMap(\.visual).first(where: { $0.figure == number }) {
                figurePage = index; figure = visual
            } else { position = index }
        }
    }

    private func figureSheet(_ visual: PDFReadingVisual) -> some View {
        NavigationStack {
            ScrollView([.horizontal, .vertical]) {
                if let image = UIImage(data: visual.image) {
                    Image(uiImage: image).resizable().scaledToFit().containerRelativeFrame(.horizontal).padding(.vertical, 16)
                        .accessibilityLabel(visual.label)
                }
            }
            .navigationTitle(visual.figure.map { "Figure \($0)" } ?? "Figure").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Fermer") { figure = nil } }
                ToolbarItem(placement: .primaryAction) {
                    Button("Voir dans le PDF") {
                        workspace.pdfPage = figurePage; workspace.pdfNavigationRequest = UUID(); workspace.documentMode = .pdf; figure = nil
                    }
                }
            }
        }.presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
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
