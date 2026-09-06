import SwiftUI

struct AnnotationSheet: View {
    let workspace: WorkspaceModel
    @Bindable var draft: AnnotationDraft
    @Environment(\.dismiss) private var dismiss
    @FocusState private var editing: Bool
    @State private var sending = false
    @State private var savedNote = false
    @State private var syncingNote = false
    @State private var syncedNote = false
    @State private var saveError: String?
    @State private var choosingConversation = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(draft.passage.citation).font(.caption).foregroundStyle(.secondary)
                    if let figure = draft.passage.figure { ArtifactThumbnail(item: figure, gallery: workspace.gallery).frame(height: 140).clipShape(RoundedRectangle(cornerRadius: 12)) }
                    Text(draft.passage.text)
                        .font(.subheadline)
                        .textSelection(.enabled)
                }.padding(14).frame(maxWidth: .infinity, alignment: .leading).background(AtelierTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 8) {
                    Text("Votre note").font(.caption).foregroundStyle(.secondary)
                    TextField("Que souhaitez-vous dire sur ce passage ?", text: $draft.note, axis: .vertical)
                        .lineLimit(4...10)
                        .focused($editing)
                        .disabled(sending || syncingNote)
                        .accessibilityIdentifier("annotationNote")
                }
                }.padding(20)
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 8) {
                    if draft.passage.articleKey != nil {
                        Button(savedNote ? "Note conservée dans Atelier" : "Conserver la note dans Atelier", systemImage: savedNote ? "checkmark" : "bookmark") {
                            do { try workspace.library.save(draft); savedNote = true } catch { saveError = error.localizedDescription }
                        }.frame(minHeight: 44).disabled(draft.note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || sending)
                        Button(syncedNote ? "Enregistrée dans Zotero" : "Enregistrer dans Zotero", systemImage: syncedNote ? "checkmark" : "books.vertical") {
                            syncingNote = true; saveError = nil
                            Task {
                                defer { syncingNote = false }
                                do { try await workspace.library.sync(draft, using: workspace.gallery); savedNote = true; syncedNote = true }
                                catch { saveError = error.localizedDescription }
                            }
                        }.frame(minHeight: 44).disabled(syncingNote || sending || draft.note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        if syncingNote { Text("Confirmez l’autorisation dans Zotero sur le Mac si elle apparaît.").font(.caption).foregroundStyle(.secondary) }
                        if let saveError { Text(saveError).font(.caption).foregroundStyle(.red) }
                    }
                    Button { choosingConversation = true } label: {
                        Label(workspace.chat.selected == nil ? "Choisir une conversation" : workspace.chat.title, systemImage: "bubble.left.and.bubble.right")
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .disabled(sending || syncingNote)
                    .accessibilityIdentifier("annotationConversation")
                    Button {
                        editing = false
                        sending = true
                        Task {
                            defer { sending = false }
                            let prompt = (draft.passage.articleKey.map { "Article Zotero : \($0)\n" } ?? "") + "Document : \(draft.passage.citation)\n\nPassage cité :\n> " + draft.passage.text.replacingOccurrences(of: "\n", with: "\n> ") + "\n\nMa note :\n" + draft.note
                            if await workspace.chat.send(prompt, using: workspace.gallery, explicitFiles: draft.passage.figure.map { [$0] } ?? []) {
                                _ = workspace.sendAnnotation(draft)
                                dismiss()
                            }
                        }
                    } label: {
                        Label("Envoyer au chat", systemImage: "arrow.up.message")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(sending || workspace.chat.sending || workspace.chat.running || workspace.chat.selected == nil || draft.note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("sendAnnotation")
                    Text(workspace.chat.selected == nil ? "Choisissez la conversation qui recevra cette annotation." : "Envoyer à : " + workspace.chat.title + ". Le passage et votre note seront transmis au Mac.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let error = workspace.chat.error { Text(error).foregroundStyle(.red) }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity)
                .background(.regularMaterial)
            }
            .navigationTitle("Annoter")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }.disabled(sending || syncingNote)
                }
            }
        }
        .sheet(isPresented: $choosingConversation) {
            ConversationPicker(workspace: workspace, navigateToChat: false)
        }
        .presentationDetents([.fraction(0.65), .large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(sending || syncingNote || (!draft.note.isEmpty && !savedNote))
        .onChange(of: draft.note) { _, _ in savedNote = false; syncedNote = false }
    }
}
