import SwiftUI
import CryptoKit

extension WorkspaceModel {
    var readingNoteKey: String {
        if let file = viewedArtifact, let project = file.projectID, let id = file.fileID { return "remote:\(project):\(id)" }
        return "local:\(viewedArtifact?.id.uuidString ?? documentID.uuidString)"
    }
    var documentReadingNotes: [ReadingNote] { readingNotes.notes(for: readingNoteKey) }
    func readingDraft(for note: ReadingNote) -> AnnotationDraft {
        let draft = AnnotationDraft(passage: DocumentPassage(documentID: documentID, fileName: note.fileName,
            location: note.location, text: note.sourceText, sourceRange: note.sourceRange, selectedText: note.selectedText))
        draft.note = note.note; draft.readingNoteID = note.id
        draft.markingStyle = note.style; draft.ink = note.color
        return draft
    }
    func addDocumentPassageToChat(_ passage: DocumentPassage) {
        pendingDocumentPassage = passage
        surface = .chat
        if chat.selected == nil { chatPickerRequested = true }
        else { applyPendingDocumentChat() }
    }
    func addReadingNotesToChat() {
        let prompt = DocumentReadingNotes.groupedPrompt(notes: documentReadingNotes)
        guard !prompt.isEmpty else { return }
        pendingDocumentPrompt = prompt
        surface = .chat
        if chat.selected == nil { chatPickerRequested = true }
        else { applyPendingDocumentChat() }
    }
    func applyPendingDocumentChat() {
        guard chat.selected != nil else { return }
        var added = false
        if let passage = pendingDocumentPassage {
            chat.quote = .init(text: passage.text, sourceRowID: "document:\(passage.documentID)", sourceLabel: passage.citation)
            pendingDocumentPassage = nil; added = true
        }
        if let prompt = pendingDocumentPrompt {
            draft += (draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "" : "\n\n") + prompt
            chat.updateDraft(draft); pendingDocumentPrompt = nil; added = true
        }
        if added { focusChatRequest = UUID() }
    }
}

struct ReadingAnnotationEditor: View {
    let workspace: WorkspaceModel
    @Bindable var draft: AnnotationDraft
    let close: () -> Void
    @FocusState private var editing: Bool
    @State private var saveError: String?
    @State private var originalNote = ""
    @State private var cacheKey = ""
    @State private var finished = false

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(draft.passage.location).font(.caption2).foregroundStyle(.secondary)
                Spacer()
                Button { finish() } label: { Image(systemName: "xmark").font(.caption).frame(width: 44, height: 44) }
                    .accessibilityLabel("Fermer l’annotation").accessibilityIdentifier("closeReadingAnnotation")
            }
            AnnotationExcerpt(text: draft.passage.selectedText ?? draft.passage.text, ink: draft.ink, latex: draft.passage.fileName.hasSuffix(".tex") && draft.passage.selectedText == nil)
            TextField("Une remarque, si tu veux…", text: $draft.note, axis: .vertical)
                .font(.subheadline).lineLimit(2...3).focused($editing).padding(.vertical, 5)
                .accessibilityIdentifier("readingAnnotationNote")
            Divider().opacity(0.5)
            AnnotationPalette(style: $draft.markingStyle, ink: $draft.ink, saveID: "saveReadingAnnotation", save: save)
            if let saveError { Text(saveError).font(.caption).foregroundStyle(.red) }
        }.buttonStyle(.plain).modifier(AnnotationCard())
        .task(id: draft.id) {
            originalNote = draft.note
            cacheKey = "atelier.annotationDraft." + workspace.readingNoteKey
                + "." + String(draft.passage.sourceRange?.location ?? 0)
                + "." + String(draft.passage.sourceRange?.length ?? 0)
                + "." + (draft.readingNoteID?.uuidString ?? "new")
                + "." + SHA256.hash(data: Data(draft.passage.text.utf8)).map { String(format: "%02x", $0) }.joined()
            if let saved = UserDefaults.standard.dictionary(forKey: cacheKey),
               saved["source"] as? String == draft.passage.text,
               saved["original"] as? String == originalNote,
               let note = saved["note"] as? String {
                draft.note = note
                if let raw = saved["style"] as? String, let value = PDFMark.Style(rawValue: raw) { draft.markingStyle = value }
                if let raw = saved["ink"] as? String, let value = AnnotationInk(rawValue: raw) { draft.ink = value }
            }
        }
        .onChange(of: draft.note) { _, _ in cacheDraft() }
        .onChange(of: draft.markingStyle) { _, _ in cacheDraft() }
        .onChange(of: draft.ink) { _, _ in cacheDraft() }
    }
    private func cacheDraft() {
        guard !cacheKey.isEmpty, !finished else { return }
        UserDefaults.standard.set(["source": draft.passage.text, "original": originalNote, "note": draft.note,
            "style": draft.markingStyle.rawValue, "ink": draft.ink.rawValue], forKey: cacheKey)
    }
    private func finish() {
        finished = true
        if !cacheKey.isEmpty { UserDefaults.standard.removeObject(forKey: cacheKey) }
        editing = false; close()
    }
    private func save() {
        guard workspace.documentID == draft.passage.documentID, let range = draft.passage.sourceRange else {
            saveError = "Ce document a changé. Rouvrez le passage pour l’annoter."; return
        }
        do {
            try workspace.readingNotes.upsert(id: draft.readingNoteID, documentKey: workspace.readingNoteKey,
                fileName: draft.passage.fileName, location: draft.passage.location,
                selectedText: draft.passage.selectedText ?? draft.passage.text, sourceText: draft.passage.text,
                sourceRange: range, source: workspace.source, note: draft.note, style: draft.markingStyle, ink: draft.ink)
            finish()
        } catch { saveError = error.localizedDescription }
    }
}

struct ReadingAnnotationsCard: View {
    let workspace: WorkspaceModel
    let collapse: () -> Void
    @State private var filter = "Tout"
    @State private var deletionError: String?
    @State private var deleted: ReadingNote?
    private var notes: [ReadingNote] { workspace.documentReadingNotes }
    private var filtered: [ReadingNote] { notes.filter { filter == "Tout" || (filter == "Commentées" ? !$0.note.isEmpty : $0.style == .highlight) } }
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Annotations").font(.subheadline.weight(.medium))
                Text("\(notes.count)").font(.caption).foregroundStyle(.secondary)
                Spacer()
                Button(action: collapse) { Image(systemName: "xmark").font(.caption).frame(width: 44, height: 44) }
                    .accessibilityLabel("Replier les annotations").accessibilityIdentifier("collapseReadingAnnotations")
            }
            HStack(spacing: 18) {
                ForEach(["Tout", "Commentées", "Surlignages"], id: \.self) { item in
                    Button { filter = item } label: {
                        Text(item).font(.caption).foregroundStyle(filter == item ? .primary : .secondary)
                            .frame(minHeight: 44).overlay(alignment: .bottom) { if filter == item { Rectangle().frame(height: 1).foregroundStyle(.secondary) } }
                    }.accessibilityAddTraits(filter == item ? .isSelected : [])
                }
            }
            Divider().opacity(0.5)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(filtered) { note in
                        VStack(alignment: .leading, spacing: 5) {
                            HStack {
                                Image(systemName: note.style == .highlight ? "highlighter" : "underline").foregroundStyle(note.color.color)
                                Text(note.location).foregroundStyle(.secondary)
                                Spacer()
                                Menu {
                                    Button("Modifier", systemImage: "pencil") { edit(note) }
                                    Button("Ajouter au chat", systemImage: "arrow.up") {
                                        workspace.pendingDocumentPrompt = DocumentReadingNotes.groupedPrompt(notes: [note])
                                        workspace.surface = .chat
                                        if workspace.chat.selected == nil { workspace.chatPickerRequested = true }
                                        else { workspace.applyPendingDocumentChat() }
                                        collapse()
                                    }
                                    Button("Supprimer", systemImage: "trash", role: .destructive) {
                                        do { try workspace.readingNotes.remove(id: note.id); deleted = note }
                                        catch { deletionError = error.localizedDescription }
                                    }
                                } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }
                                    .accessibilityLabel("Actions : " + note.selectedText)
                            }.font(.caption2)
                            Button { edit(note) } label: {
                                VStack(alignment: .leading, spacing: 7) {
                                    AnnotationExcerpt(text: note.selectedText, ink: note.color, latex: note.fileName.hasSuffix(".tex") && note.selectedText == note.sourceText)
                                    if !note.note.isEmpty { Text(note.note).font(.subheadline).foregroundStyle(.primary).padding(.leading, 10) }
                                }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                            }.accessibilityLabel("Modifier : " + note.selectedText)
                            if note.resolvedRange(in: workspace.source) == nil {
                                Text("Document modifié · citation d’origine conservée").font(.caption2).foregroundStyle(.secondary)
                            }
                        }.padding(.bottom, 12)
                        Divider().opacity(0.5)
                    }
                    if filtered.isEmpty { Text("Aucune annotation dans cette vue.").font(.subheadline).foregroundStyle(.secondary).padding(.vertical, 18) }
                }
            }.frame(maxHeight: 260).fixedSize(horizontal: false, vertical: true)
            HStack {
                if let deleted {
                    Button("Annuler") {
                        do { try workspace.readingNotes.restore(deleted); self.deleted = nil }
                        catch { deletionError = error.localizedDescription }
                    }.accessibilityLabel("Annuler la suppression")
                }
                Spacer()
                Button { workspace.addReadingNotesToChat(); collapse() } label: {
                    HStack(spacing: 7) { Text("Ajouter au chat"); Image(systemName: "arrow.up") }.frame(minHeight: 44)
                }.disabled(notes.isEmpty).accessibilityIdentifier("readingNotesToChat")
            }.font(.caption).foregroundStyle(.secondary)
            if let error = deletionError ?? workspace.readingNotes.loadError { Text(error).font(.caption).foregroundStyle(.red) }
        }.buttonStyle(.plain).modifier(AnnotationCard())
    }
    private func edit(_ note: ReadingNote) { workspace.annotationDraft = workspace.readingDraft(for: note) }
}
