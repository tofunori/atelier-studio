import SwiftUI

@MainActor @Observable final class PDFReadingModel {
    private(set) var pages: [Int: PDFReadingPage] = [:]
    private(set) var errors: [Int: String] = [:]
    private var documentID: UUID?
    @ObservationIgnored private var extractor: PDFReadingExtractor?
    func content(_ page: Int, documentID: UUID) -> PDFReadingPage? { self.documentID == documentID ? pages[page] : nil }
    func failure(_ page: Int, documentID: UUID) -> String? { self.documentID == documentID ? errors[page] : nil }

    func load(page: Int, documentID: UUID, bytes: Data?) async {
        guard !Task.isCancelled else { return }
        if self.documentID != documentID {
            self.documentID = documentID; pages = [:]; errors = [:]
            extractor = bytes.map { PDFReadingExtractor(bytes: $0) }
        }
        guard pages[page] == nil else { return }
        guard let extractor else { errors[page] = "Le texte de cette page est indisponible."; return }
        do {
            let result = try await extractor.page(page)
            guard !Task.isCancelled, self.documentID == documentID else { return }
            pages[page] = result; errors[page] = nil
        } catch {
            guard !Task.isCancelled, !(error is CancellationError), self.documentID == documentID else { return }
            errors[page] = "Cette page ne peut pas être adaptée. Vous pouvez la lire dans le PDF."
        }
    }
}

struct PDFReadingView: View {
    let workspace: WorkspaceModel
    let model: PDFReadingModel
    @State private var position: Int?
    @State private var restored = false
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
    }

    private func page(_ index: Int) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .firstTextBaseline) {
                Text("Page \(index + 1)").font(.caption.weight(.medium)).foregroundStyle(.secondary)
                Spacer()
                Button("Voir le PDF", systemImage: "doc.richtext") {
                    workspace.pdfPage = index; workspace.documentMode = .pdf
                }.font(.caption).frame(minHeight: 44)
                    .accessibilityLabel("Voir la page \(index + 1) dans le PDF")
            }
            if let page = model.content(index, documentID: workspace.documentID) {
                if page.blocks.isEmpty {
                    Text("Cette page ne contient pas de texte sélectionnable. Consultez sa mise en page dans le PDF.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(page.blocks) { block in
                        Text(verbatim: block.text)
                            .font(.system(size: fontSize * min(1.6, max(0.85, scale)) * (block.heading ? 1.12 : 1),
                                          weight: block.heading ? .semibold : .regular, design: readingFont == "serif" ? .serif : .default))
                            .lineSpacing(fontSize * 0.22)
                            .textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                if !page.margins.isEmpty {
                    DisclosureGroup("En-tête et pied de page") {
                        ForEach(page.margins) { block in Text(verbatim: block.text).textSelection(.enabled) }
                    }.font(.footnote).foregroundStyle(.secondary)
                }
            } else if let error = model.failure(index, documentID: workspace.documentID) {
                Text(error).foregroundStyle(.secondary)
                Button("Réessayer") { Task { await model.load(page: index, documentID: workspace.documentID, bytes: workspace.documentBytes) } }
            } else {
                ProgressView("Préparation de la lecture…").frame(maxWidth: .infinity, minHeight: 220)
            }
            Divider()
        }
        .task(id: "\(workspace.documentID):\(index)") {
            await model.load(page: index, documentID: workspace.documentID, bytes: workspace.documentBytes)
        }
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
