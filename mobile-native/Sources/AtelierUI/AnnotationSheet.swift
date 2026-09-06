import SwiftUI

struct AnnotationSheet: View {
    let workspace: WorkspaceModel
    @Bindable var draft: AnnotationDraft
    @Environment(\.dismiss) private var dismiss
    @FocusState private var editing: Bool
    @State private var sending = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(draft.passage.text)
                        .font(.subheadline)
                        .textSelection(.enabled)
                } header: {
                    Text(draft.passage.citation)
                }
                Section("Votre note") {
                    TextField("Que souhaitez-vous dire sur ce passage ?", text: $draft.note, axis: .vertical)
                        .lineLimit(4...10)
                        .focused($editing)
                        .disabled(sending)
                        .accessibilityIdentifier("annotationNote")
                }
                Section {
                    Button {
                        sending = true
                        Task {
                            defer { sending = false }
                            let prompt = "Document : \(draft.passage.citation)\n\nPassage cité :\n> " + draft.passage.text.replacingOccurrences(of: "\n", with: "\n> ") + "\n\nMa note :\n" + draft.note
                            if await workspace.chat.send(prompt, using: workspace.gallery) {
                                _ = workspace.sendAnnotation(draft)
                                dismiss()
                            }
                        }
                    } label: {
                        Label("Envoyer au chat", systemImage: "arrow.up.message")
                            .frame(maxWidth: .infinity)
                    }
                    .disabled(sending || workspace.chat.sending || workspace.chat.running || workspace.chat.selected == nil || draft.note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("sendAnnotation")
                } footer: {
                    Text(workspace.chat.selected == nil ? "Choisissez d’abord une conversation dans l’onglet Chat." : "Envoyer à : " + workspace.chat.title + ". Le passage et votre note seront transmis au Mac.")
                    if let error = workspace.chat.error { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Annoter")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }.disabled(sending)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(!draft.note.isEmpty)
    }
}
