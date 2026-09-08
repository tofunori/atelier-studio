import SwiftUI

/// Local queued messages stay in the conversation, immediately above its tail.
struct QueuedChatMessages: View {
    let workspace: WorkspaceModel
    @State private var editing: PreparedChatMessage?
    @State private var editingPause: (threadID: String, wasPaused: Bool)?
    var body: some View {
        let chat = workspace.chat
        VStack(alignment: .trailing, spacing: 14) {
            ForEach(chat.preparedForThread.filter { item in !chat.rows.contains { $0.id == "pending:\(item.id)" } }) { item in
                VStack(alignment: .trailing, spacing: 4) {
                    VStack(alignment: .leading, spacing: 8) {
                        if !item.text.isEmpty { Text(item.text).textSelection(.enabled) }
                        ForEach(item.files) { file in
                            Label(file.name, systemImage: "paperclip").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.horizontal, 16).padding(.vertical, 12)
                    .background(AtelierTheme.surface, in: RoundedRectangle(cornerRadius: 20))
                    HStack(spacing: 6) {
                        Text(item.attempted ? "Réception à vérifier" : "En attente")
                            .font(.caption).foregroundStyle(.secondary)
                        Menu {
                            Button("Modifier", systemImage: "pencil") {
                                guard let wasPaused = chat.beginPreparedEditing(item.id) else { return }
                                editingPause = (item.threadID, wasPaused); editing = item
                            }
                                .disabled(chat.sending || item.attempted)
                            if chat.supportsSteering {
                                Button(item.attemptedMode == "steer" ? "Check Steer" : "Steer", systemImage: "arrow.turn.up.right") {
                                    Task { await chat.steerPrepared(item.id, using: workspace.gallery) }
                                }.disabled(chat.sending || (!chat.running && item.attemptedMode != "steer") || (item.attempted && item.attemptedMode != "steer"))
                            } else {
                                Text("Steer indisponible avec cet assistant")
                            }
                            if !chat.running && item.attemptedMode != "steer" && chat.preparedForThread.first?.id == item.id {
                                Button(item.attempted ? "Vérifier l’envoi" : "Envoyer maintenant", systemImage: "arrow.up") {
                                    Task { await chat.deliverPrepared(using: workspace.gallery) }
                                }.disabled(chat.sending)
                            }
                            Button("Annuler le message", systemImage: "trash", role: .destructive) { chat.removePrepared(item.id) }
                                .disabled(chat.sending || item.attempted)
                        } label: {
                            Image(systemName: "ellipsis").frame(width: 44, height: 44).contentShape(Rectangle())
                        }.accessibilityLabel("Options du message en attente")
                    }
                    if item.attempted {
                        Text("La réception par le Mac est incertaine. Vérifiez avec le même envoi avant de modifier ou d’annuler.")
                            .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.trailing)
                    }
                }.frame(maxWidth: .infinity, alignment: .trailing).padding(.leading, 48)
                    .accessibilityIdentifier("queuedMessage-\(item.id)")
            }
        }
        .sheet(item: $editing, onDismiss: {
            if let pause = editingPause {
                chat.endPreparedEditing(threadID: pause.threadID, wasPaused: pause.wasPaused)
                editingPause = nil
                Task { await chat.deliverPrepared(using: workspace.gallery, automatic: true) }
            }
        }) { item in QueuedMessageEditor(workspace: workspace, item: item) }
        .onAppear { chat.reconcilePreparedAcknowledgements() }
        .onChange(of: chat.rows.filter { $0.kind == "user" }.map(\.id)) { _, _ in chat.reconcilePreparedAcknowledgements() }
    }
}

private struct QueuedMessageEditor: View {
    let workspace: WorkspaceModel
    let item: PreparedChatMessage
    @State private var text: String
    @Environment(\.dismiss) private var dismiss
    init(workspace: WorkspaceModel, item: PreparedChatMessage) {
        self.workspace = workspace; self.item = item
        _text = State(initialValue: item.text)
    }
    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                TextEditor(text: $text).accessibilityLabel("Message en attente")
                ForEach(item.files) { Label($0.name, systemImage: "paperclip").font(.caption).foregroundStyle(.secondary) }
            }.padding().navigationTitle("Modifier le message").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Enregistrer") {
                            if workspace.chat.updatePrepared(item.id, text: text) { dismiss() }
                        }.disabled(workspace.chat.sending || (text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && item.files.isEmpty))
                    }
                }
        }
    }
}
