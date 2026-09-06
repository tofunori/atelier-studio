import SwiftUI

struct AnnotationSheet: View {
    let workspace: WorkspaceModel
    @Bindable var draft: AnnotationDraft
    @Environment(\.dismiss) private var dismiss
    @FocusState private var editing: Bool
    @State private var sending = false
    @State private var choosingConversation = false

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
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 8) {
                    Button { choosingConversation = true } label: {
                        Label(workspace.chat.selected == nil ? "Choisir une conversation" : workspace.chat.title, systemImage: "bubble.left.and.bubble.right")
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .disabled(sending)
                    .accessibilityIdentifier("annotationConversation")
                    Button {
                        editing = false
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
                    Button("Annuler") { dismiss() }.disabled(sending)
                }
            }
        }
        .sheet(isPresented: $choosingConversation) {
            ConversationPicker(workspace: workspace, navigateToChat: false)
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(!draft.note.isEmpty)
    }
}
