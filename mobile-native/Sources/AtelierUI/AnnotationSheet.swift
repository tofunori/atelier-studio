import SwiftUI

struct AnnotationSheet: View {
    let workspace: WorkspaceModel
    @Bindable var draft: AnnotationDraft
    @Environment(\.dismiss) private var dismiss
    @FocusState private var editing: Bool

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
                        .accessibilityIdentifier("annotationNote")
                }
                Section {
                    Button {
                        if workspace.sendAnnotation(draft) { dismiss() }
                    } label: {
                        Label("Envoyer au chat", systemImage: "arrow.up.message")
                            .frame(maxWidth: .infinity)
                    }
                    .disabled(draft.note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("sendAnnotation")
                } footer: {
                    Text("Passage, référence et note seront joints au chat local. Les annotations restent en mémoire ; votre fichier original n’est pas modifié.")
                }
            }
            .navigationTitle("Annoter")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(!draft.note.isEmpty)
    }
}
