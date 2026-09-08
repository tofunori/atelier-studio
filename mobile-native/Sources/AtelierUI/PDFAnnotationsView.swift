import SwiftUI
import CryptoKit

struct PDFAnnotationEditor: View {
    let workspace: WorkspaceModel
    let passage: DocumentPassage
    var existing: PDFMark?
    @Environment(\.dismiss) private var dismiss
    @State private var style: PDFMark.Style = .highlight
    @State private var note = ""
    @State private var error: String?
    @State private var identity = UUID()
    @State private var documentKey = ""
    var close: (() -> Void)? = nil
    @State private var ink: AnnotationInk = .sage
    @State private var cacheKey = ""
    @State private var finished = false
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(passage.location).font(.caption2).foregroundStyle(.secondary)
                Spacer()
                Button { finish() } label: { Image(systemName: "xmark").font(.caption).frame(width: 44, height: 44) }
                    .accessibilityLabel("Fermer l’annotation")
            }
            AnnotationExcerpt(text: passage.text, ink: ink)
            TextField("Une remarque, si tu veux…", text: $note, axis: .vertical)
                .font(.subheadline).lineLimit(2...3).padding(.vertical, 5)
                .accessibilityIdentifier("pdfAnnotationComment")
            Divider().opacity(0.5)
            AnnotationPalette(style: $style, ink: $ink, saveID: "savePDFAnnotation") {
                do {
                    try workspace.savePDFMark(passage: passage, id: existing?.id ?? identity, style: style, note: note, expectedKey: documentKey, ink: ink)
                    finish()
                } catch { self.error = error.localizedDescription }
            }
            if let error { Text(error).font(.caption).foregroundStyle(.red) }
        }.modifier(AnnotationCard()).buttonStyle(.plain)
        .onAppear {
            documentKey = existing?.documentKey ?? workspace.pdfAnnotationKey
            if let existing { style = existing.style; note = existing.note; ink = existing.color }
            let anchor = passage.regions.map { "\($0.pageIndex):\($0.bounds)" }.joined(separator: "|")
            let key = documentKey + "|" + anchor + "|" + passage.text + "|" + (existing?.id.uuidString ?? "new")
            cacheKey = "atelier.pdfAnnotationDraft." + SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
            if let saved = UserDefaults.standard.dictionary(forKey: cacheKey),
               saved["original"] as? String == original,
               let text = saved["note"] as? String {
                note = text
                if let raw = saved["style"] as? String, let value = PDFMark.Style(rawValue: raw) { style = value }
                if let raw = saved["ink"] as? String, let value = AnnotationInk(rawValue: raw) { ink = value }
            }
        }
        .onChange(of: note) { _, _ in cacheDraft() }
        .onChange(of: style) { _, _ in cacheDraft() }
        .onChange(of: ink) { _, _ in cacheDraft() }
    }
    private var original: String { (existing?.note ?? "") + "|" + (existing?.style.rawValue ?? "highlight") + "|" + (existing?.color.rawValue ?? "sage") }
    private func cacheDraft() {
        guard !cacheKey.isEmpty, !finished else { return }
        UserDefaults.standard.set(["original": original, "note": note, "style": style.rawValue, "ink": ink.rawValue], forKey: cacheKey)
    }
    private func finish() {
        finished = true
        if !cacheKey.isEmpty { UserDefaults.standard.removeObject(forKey: cacheKey) }
        if let close { close() } else { dismiss() }
    }
}

struct PDFAnnotationsList: View {
    let workspace: WorkspaceModel
    @Environment(\.dismiss) private var dismiss
    @State private var editing: PDFMark?
    @State private var syncing: UUID?
    @State private var error: String?
    @State private var query = ""
    private var marks: [PDFMark] { workspace.documentPDFMarks.filter { query.isEmpty || "\($0.text) \($0.note)".localizedStandardContains(query) } }
    var body: some View {
        NavigationStack {
            List {
                if let error = error ?? workspace.pdfAnnotations.loadError { Text(error).foregroundStyle(.red) }
                if workspace.documentPDFMarks.isEmpty {
                    ContentUnavailableView("Aucune annotation", systemImage: "highlighter", description: Text("Dans le PDF, sélectionnez du texte puis touchez Annoter. Vous pouvez surligner ou souligner sans ajouter de commentaire."))
                }
                ForEach(marks) { mark in
                    VStack(alignment: .leading, spacing: 5) {
                        HStack {
                            Image(systemName: mark.style == .highlight ? "highlighter" : "underline").foregroundStyle(mark.color.color)
                            Text("Page \(mark.page + 1)").font(.caption)
                            Spacer()
                            Button("Voir") { workspace.showPDFMark(mark); dismiss() }
                                .accessibilityLabel("Voir l’annotation page \(mark.page + 1)")
                        }.foregroundStyle(.secondary)
                        AnnotationExcerpt(text: mark.text, ink: mark.color)
                        if !mark.note.isEmpty { Text(mark.note).font(.subheadline) }
                        HStack {
                            Menu {
                                Button("Modifier", systemImage: "pencil") { editing = mark }
                                if workspace.currentArticle != nil && mark.style == .highlight && !mark.note.isEmpty {
                                    Button("Enregistrer dans Zotero", systemImage: "books.vertical") { sync(mark) }.disabled(syncing != nil)
                                }
                            } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }.accessibilityLabel("Actions de l’annotation")
                            Spacer()
                            Button("Ajouter au chat") {
                                let passage = workspace.passage(for: mark)
                                if !mark.note.isEmpty { workspace.pendingDocumentPrompt = mark.note }
                                workspace.addDocumentPassageToChat(passage)
                                dismiss()
                            }
                        }.font(.caption)
                        if syncing == mark.id {
                            ProgressView("Enregistrement dans Zotero…").font(.caption)
                        } else if workspace.library.notes.contains(where: { $0.id == mark.id && $0.zoteroKey != nil && $0.syncedText == mark.note }) {
                            Text("Enregistrée dans Zotero").font(.caption).foregroundStyle(.secondary)
                        }
                    }.padding(.vertical, 5).buttonStyle(.borderless)
                    .swipeActions {
                        Button("Supprimer", role: .destructive) {
                            do {
                                try workspace.pdfAnnotations.remove(mark.id)
                                if let document = workspace.pdfDocument { PDFAnnotations.apply(workspace.documentPDFMarks, to: document) }
                            } catch { self.error = error.localizedDescription }
                        }
                    }
                }
            }
            .searchable(text: $query, prompt: "Passage ou commentaire")
            .navigationTitle("Annotations")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fermer") { dismiss() } } }
            .sheet(item: $editing) { mark in
                ScrollView { PDFAnnotationEditor(workspace: workspace, passage: workspace.passage(for: mark), existing: mark) }
                    .presentationDetents([.height(250), .medium, .large]).presentationDragIndicator(.visible)
            }
        }.presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
    }
    private func sync(_ mark: PDFMark) {
        let draft = AnnotationDraft(passage: workspace.passage(for: mark), id: mark.id)
        draft.note = mark.note; syncing = mark.id; error = nil
        Task {
            defer { syncing = nil }
            do { try await workspace.library.sync(draft, using: workspace.gallery) }
            catch { self.error = error.localizedDescription }
        }
    }
}
