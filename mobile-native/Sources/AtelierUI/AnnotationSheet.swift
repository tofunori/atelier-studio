import SwiftUI

struct AnnotationSheet: View {
    let workspace: WorkspaceModel
    @Bindable var draft: AnnotationDraft
    @Environment(\.dismiss) private var dismiss
    @FocusState private var editing: Bool
    @State private var sending = false
    @State private var choosingConversation = false
    @State private var expanded = false
    @State private var savedNote = false
    @State private var syncingNote = false
    @State private var syncedNote = false
    @State private var saveError: String?
    private var busy: Bool { sending || syncingNote }
    private var empty: Bool { draft.note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text(draft.passage.figure == nil ? draft.passage.citation : draft.passage.fileName + (draft.passage.figureRegion == nil ? " · Figure entière" : " · Zone sélectionnée")).font(.caption).foregroundStyle(.secondary).lineLimit(3)
                    if let figure = draft.passage.figure {
                        ArtifactThumbnail(item: figure, gallery: workspace.gallery).frame(height: 90)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    if draft.passage.figure == nil {
                    HStack(alignment: .top, spacing: 10) {
                        Rectangle().fill(AtelierTheme.accent).frame(width: 2)
                        Button { expanded.toggle() } label: {
                            Text(draft.passage.text).font(.subheadline).foregroundStyle(.secondary)
                                .lineLimit(expanded ? nil : 3).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        }.buttonStyle(.plain).accessibilityLabel("Déplier ou replier le passage cité")
                    }.fixedSize(horizontal: false, vertical: true)
                    }
                    TextField("Votre note…", text: $draft.note, axis: .vertical)
                        .lineLimit(3...10).focused($editing).disabled(busy)
                        .accessibilityIdentifier("annotationNote")
                    if let error = saveError ?? workspace.chat.error { Text(error).font(.footnote).foregroundStyle(.red) }
                    if syncingNote { Label("Confirmez dans Zotero sur le Mac si une autorisation apparaît.", systemImage: "desktopcomputer").font(.caption).foregroundStyle(.secondary) }
                    else if syncedNote { Label("Enregistrée dans Zotero", systemImage: "checkmark").font(.caption).foregroundStyle(.secondary) }
                    else if savedNote { Label("Note conservée dans Atelier", systemImage: "bookmark").font(.caption).foregroundStyle(.secondary) }
                }.padding(20)
            }.scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                HStack(spacing: 8) {
                    if draft.passage.articleKey != nil {
                        Menu {
                            Button("Conserver dans Atelier", systemImage: "bookmark") {
                                do { try workspace.library.save(draft); savedNote = true } catch { saveError = error.localizedDescription }
                            }
                            Button("Enregistrer dans Zotero", systemImage: "books.vertical") { syncNote() }
                        } label: { Image(systemName: "bookmark").frame(width: 44, height: 44) }
                            .disabled(empty || busy).accessibilityLabel("Enregistrer l’annotation")
                    }
                    Button { choosingConversation = true } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "bubble")
                            Text(workspace.chat.selected == nil ? "Choisir un chat" : workspace.chat.title).lineLimit(1)
                            Image(systemName: "chevron.down").font(.caption2)
                        }.font(.caption).frame(minHeight: 44)
                    }.buttonStyle(.plain).foregroundStyle(.secondary).disabled(busy)
                        .accessibilityIdentifier("annotationConversation")
                    Spacer(minLength: 0)
                    Button { send() } label: {
                        ZStack {
                            Circle().fill(AtelierTheme.accent).frame(width: 34, height: 34)
                            if busy { ProgressView().tint(Color(uiColor: .systemBackground)) }
                            else { Image(systemName: "arrow.up").fontWeight(.semibold).foregroundStyle(Color(uiColor: .systemBackground)) }
                        }.frame(width: 44, height: 44)
                    }.buttonStyle(.plain)
                        .disabled(busy || workspace.chat.sending || workspace.chat.running || workspace.chat.selected == nil || empty)
                        .accessibilityLabel("Envoyer au chat").accessibilityIdentifier("sendAnnotation")
                }.padding(.horizontal, 12).padding(.vertical, 6).background(.background)
            }
            .navigationTitle("Annoter").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Fermer", systemImage: "xmark") { dismiss() }.disabled(busy) } }
        }
        .sheet(isPresented: $choosingConversation) { ConversationPicker(workspace: workspace, navigateToChat: false) }
        .presentationDetents([.height(draft.passage.figure == nil ? 380 : 420), .large]).presentationDragIndicator(.visible)
        .interactiveDismissDisabled(busy || (!empty && !savedNote))
        .onChange(of: draft.note) { _, _ in savedNote = false; syncedNote = false }
    }
    private func syncNote() {
        syncingNote = true; saveError = nil; editing = false
        Task {
            defer { syncingNote = false }
            do { try await workspace.library.sync(draft, using: workspace.gallery); savedNote = true; syncedNote = true }
            catch { saveError = error.localizedDescription }
        }
    }
    private func send() {
        editing = false; sending = true
        Task {
            defer { sending = false }
            let prompt = (draft.passage.articleKey.map { "Article Zotero : \($0)\n" } ?? "") + "Document : \(draft.passage.citation)\n\nPassage cité :\n> " + draft.passage.text.replacingOccurrences(of: "\n", with: "\n> ") + "\n\nMa note :\n" + draft.note
            let requestID = UUID().uuidString
            if await workspace.chat.send(prompt, using: workspace.gallery, explicitFiles: draft.passage.figure.map { [$0] } ?? [], requestID: requestID) {
                if workspace.sourceAvailable, draft.passage.documentID == workspace.documentID, let threadID = workspace.chat.selected?.id {
                    workspace.revisionTarget = SourceRevisionTarget(documentID: workspace.documentID, threadID: threadID, fileName: draft.passage.fileName, original: workspace.source, passage: draft.passage.text, messageID: requestID)
                }
                _ = workspace.sendAnnotation(draft); dismiss()
            }
        }
    }
}
