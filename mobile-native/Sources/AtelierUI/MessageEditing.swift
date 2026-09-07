import SwiftUI

struct MessageRevision: Codable, Sendable {
    let rootThreadId: String
    let parentThreadId: String
    let sourceEventId: String
    let groupId: String
    let baseThreadId: String
    let baseEventId: String
    let messageId: String
}

struct MessageEditDraft: Identifiable {
    let id = UUID()
    let thread: RemoteChatModel.Thread
    let row: RemoteChatModel.Row
    let prompt: String
    let files: [GalleryArtifact]
}

extension RemoteChatModel {
    var conversationThreads: [Thread] {
        var seen: Set<String> = []
        return threads.sorted { (SidebarProjectPreferences.date($0.updatedAt) ?? .distantPast, $0.id) > (SidebarProjectPreferences.date($1.updatedAt) ?? .distantPast, $1.id) }.compactMap { thread in
            guard seen.insert(thread.conversationID).inserted else { return nil }
            if let selected, selected.conversationID == thread.conversationID {
                var current = threads.first { $0.id == selected.id } ?? selected
                current.updatedAt = thread.updatedAt
                return current
            }
            return thread
        }
    }
    func versions(for row: Row) -> (threads: [Thread], index: Int)? {
        guard let current = selected else { return nil }
        let family = threads.filter { $0.conversationID == current.conversationID }
        guard let revision = family.compactMap(\.messageRevision).first(where: {
            $0.baseEventId == row.id || (row.messageID != nil && $0.messageId == row.messageID)
        }), let original = threads.first(where: { $0.id == revision.baseThreadId }) else { return nil }
        let alternatives = family.filter { $0.messageRevision?.groupId == revision.groupId }
            .sorted { ($0.updatedAt ?? $0.id) < ($1.updatedAt ?? $1.id) }
        let versions = [original] + alternatives
        let index = versions.firstIndex(where: { $0.messageRevision?.messageId == row.messageID && row.messageID != nil }) ?? 0
        return versions.count > 1 ? (versions, index) : nil
    }

    func commitRevision(_ draft: MessageEditDraft, text: String, requestID: String, workspace: WorkspaceModel) async throws {
        guard selected?.id == draft.thread.id, !running, !sending else { throw ChatError.notSent }
        guard permissionMode == .ask || availablePermissionModes.contains(permissionMode) else { throw ChatError.notSent }
        sending = true
        defer { sending = false }
        var ids: [String] = []
        for file in draft.files { ids.append(try await workspace.gallery.attachmentID(file)) }
        var body: [String: Any] = ["eventId":draft.row.id, "originalText":draft.row.text,
            "prompt":text, "requestId":requestID, "fileIds":ids, "permissionMode":permissionMode.rawValue]
        if !model.isEmpty { body["model"] = model }
        if !effort.isEmpty { body["effort"] = effort }
        struct Reply: Decodable { let proxied: Bool; let thread: Thread }
        let reply = try JSONDecoder().decode(Reply.self, from: await workspace.gallery.chatRequest(
            ["threads",draft.thread.id,"edit"], body: body, timeout: 45))
        guard reply.proxied else { throw ChatError.notSent }
        acceptRevision(reply.thread, from: draft, requestID: requestID, workspace: workspace)
        await loadCatalog(using: workspace.gallery)
    }

    func acceptRevision(_ thread: Thread, from draft: MessageEditDraft, requestID: String, workspace: WorkspaceModel) {
        historyFiles[thread.id] = historyFiles[draft.thread.id] ?? [:]
        if !draft.files.isEmpty { historyFiles[thread.id, default: [:]][requestID] = draft.files }
        // The editor owns its text. The normal composer, its quote and its
        // attachments remain untouched, including when changing versions.
        let composer = workspace.draft, pendingFiles = attachments, pendingQuote = quote
        let chosenModel = model, chosenEffort = effort, chosenPermission = permissionMode
        threads.removeAll { $0.id == thread.id }; threads.insert(thread, at: 0)
        select(thread, workspace: workspace)
        workspace.draft = composer; attachments = pendingFiles; quote = pendingQuote
        model = chosenModel; effort = chosenEffort; permissionMode = chosenPermission
        scheduleSave()
    }
}

struct InlineMessageEditor: View {
    let draft: MessageEditDraft
    let workspace: WorkspaceModel
    let onClose: () -> Void
    @State private var text: String
    @State private var submitting = false
    @State private var error: String?
    @State private var requestID = UUID().uuidString
    @State private var attemptedPayload: String?
    @FocusState private var focused: Bool

    init(draft: MessageEditDraft, workspace: WorkspaceModel, onClose: @escaping () -> Void) {
        self.draft = draft; self.workspace = workspace; self.onClose = onClose
        _text = State(initialValue: draft.prompt)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField("Message", text: $text, axis: .vertical)
                .lineLimit(3...12).focused($focused)
                .accessibilityLabel("Message à modifier").accessibilityIdentifier("messageEditText")
                .disabled(submitting)
            if !draft.files.isEmpty {
                Label(draft.files.map(\.name).joined(separator: ", "), systemImage: "paperclip")
                    .font(.footnote).foregroundStyle(.secondary).lineLimit(2)
            }
            if let error { Text(error).font(.footnote).foregroundStyle(.red).textSelection(.enabled) }
            HStack {
                Spacer()
                Button("Annuler") { focused = false; onClose() }.disabled(submitting)
                Button {
                    let payload = [text, workspace.chat.model, workspace.chat.effort, workspace.chat.permissionMode.rawValue].joined(separator: "\u{1f}")
                    if let attemptedPayload, attemptedPayload != payload { requestID = UUID().uuidString }
                    attemptedPayload = payload; submitting = true; error = nil
                    Task {
                        defer { submitting = false }
                        do {
                            try await workspace.chat.commitRevision(draft, text: text, requestID: requestID, workspace: workspace)
                            focused = false; onClose()
                        } catch { self.error = error.localizedDescription }
                    }
                } label: {
                    if submitting { ProgressView() } else { Text("Envoyer") }
                }.buttonStyle(.borderedProminent)
                    .disabled(submitting || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || text == draft.prompt)
                    .accessibilityLabel("Envoyer la modification")
            }.buttonStyle(.bordered).controlSize(.regular)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .task { focused = true }
    }
}

struct MessageVersionPicker: View {
    let row: RemoteChatModel.Row
    let workspace: WorkspaceModel
    var body: some View {
        if let versions = workspace.chat.versions(for: row) {
            HStack(spacing: 0) {
                Button { workspace.chat.select(versions.threads[versions.index - 1], workspace: workspace) } label: {
                    Image(systemName: "chevron.left").frame(width: 44, height: 44)
                }.disabled(versions.index == 0).accessibilityLabel("Version précédente du message")
                Text("\(versions.index + 1) / \(versions.threads.count)").font(.caption.monospacedDigit())
                    .accessibilityLabel("Version \(versions.index + 1) sur \(versions.threads.count)")
                Button { workspace.chat.select(versions.threads[versions.index + 1], workspace: workspace) } label: {
                    Image(systemName: "chevron.right").frame(width: 44, height: 44)
                }.disabled(versions.index + 1 == versions.threads.count).accessibilityLabel("Version suivante du message")
            }.buttonStyle(.plain).foregroundStyle(.secondary)
                .disabled(workspace.chat.running || workspace.chat.sending)
        }
    }
}
