import SwiftUI

struct RemoteFileChange: Identifiable, Codable, Sendable, Equatable {
    var id: String
    var path: String
    var before: String?
    var after: String?
    var unified: String?
    static func parse(_ event: [String: Any], eventID: String) -> [Self] {
        guard event["kind"] as? String == "edit" else { return [] }
        let snippets = event["snippets"] as? [String: [String: Any]] ?? [:]
        return (event["files"] as? [Any] ?? []).enumerated().compactMap { index, value in
            let object = value as? [String: Any] ?? [:]
            guard let path = value as? String ?? object["path"] as? String else { return nil }
            let snippet = snippets[path] ?? object
            return Self(id: "\(eventID):\(index)", path: path, before: snippet["oldText"] as? String,
                        after: snippet["newText"] as? String, unified: snippet["unified"] as? String)
        }
    }
}

struct PreparedChatMessage: Identifiable, Codable, Sendable {
    var id = UUID().uuidString
    var threadID: String
    var text: String
    var files: [GalleryArtifact]
    var model: String
    var effort: String
    var attempted = false
    /// Reading annotations quoted into this queued message. Optional keeps
    /// older persisted queues decodable without a migration.
    var annotationReferences: [AnnotationSendReference]? = nil
    // Persist the delivery intent so an uncertain steer never becomes a new turn.
    var attemptedMode: String? = nil
    var permissionModeAtTransmission: String? = nil
}

extension RemoteChatModel {
    var preparedForThread: [PreparedChatMessage] { prepared.filter { $0.threadID == selected?.id } }
    func enqueue(workspace: WorkspaceModel) {
        guard let selected, !sending else { return }
        let text = Self.promptWithQuote(workspace.draft, quote: quote)
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !attachments.isEmpty else { return }
        let references = workspace.annotationReferencesForCurrentChatSend()
        let quoteID = quote?.id
        prepared.append(PreparedChatMessage(threadID: selected.id, text: text, files: attachments, model: model, effort: effort,
                                             annotationReferences: references.isEmpty ? nil : references))
        workspace.draft = ""; attachments = []; quote = nil; scheduleSave(); AtelierTheme.confirmation()
        workspace.clearAnnotationReferences(for: quoteID)
    }
    func movePrepared(_ id: String, up: Bool) {
        let ids = prepared.indices.filter { prepared[$0].threadID == selected?.id }
        guard let position = ids.firstIndex(where: { prepared[$0].id == id }) else { return }
        let next = position + (up ? -1 : 1)
        guard ids.indices.contains(next), !sending else { return }
        prepared.swapAt(ids[position], ids[next]); scheduleSave()
    }
    var supportsSteering: Bool { provider?.capabilities?.steering == true }
    func permissionForPrepared(_ item: PreparedChatMessage) -> ChatPermissionMode {
        item.permissionModeAtTransmission.flatMap(ChatPermissionMode.init(rawValue:)) ?? effectivePermissionMode
    }
    func markPreparedTransmitting(_ id: String, mode: String, permission: ChatPermissionMode? = nil) {
        guard let index = prepared.firstIndex(where: { $0.id == id }) else { return }
        prepared[index].attempted = true; prepared[index].attemptedMode = mode
        if prepared[index].permissionModeAtTransmission == nil, let permission {
            prepared[index].permissionModeAtTransmission = permission.rawValue
        }
        scheduleSave()
    }
    /// Pause synchronously before presenting the editor, including its animation.
    func beginPreparedEditing(_ id: String) -> Bool? {
        guard !sending, let item = preparedForThread.first(where: { $0.id == id }), !item.attempted else { return nil }
        let wasPaused = pausedQueues.contains(item.threadID)
        pausedQueues.insert(item.threadID); scheduleSave()
        return wasPaused
    }
    func endPreparedEditing(threadID: String, wasPaused: Bool) {
        if !wasPaused && error == nil { pausedQueues.remove(threadID) }
        scheduleSave()
    }
    func updatePrepared(_ id: String, text: String) -> Bool {
        guard !sending, let index = prepared.firstIndex(where: { $0.id == id && $0.threadID == selected?.id }),
              !prepared[index].attempted,
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !prepared[index].files.isEmpty else { return false }
        prepared[index].text = text; scheduleSave(); return true
    }
    func removePrepared(_ id: String) {
        guard !sending else { return }
        prepared.removeAll { $0.id == id && $0.threadID == selected?.id && !$0.attempted }; scheduleSave()
    }
    func preparedWasAcknowledged(_ item: PreparedChatMessage) -> Bool {
        selected?.id == item.threadID && rows.contains { $0.kind == "user" && $0.messageID == item.id && !$0.id.hasPrefix("pending:") }
    }
    func reconcilePreparedAcknowledgements(workspace: WorkspaceModel? = nil) {
        let acknowledgedItems = prepared.filter { preparedWasAcknowledged($0) }
        let acknowledged = Set(acknowledgedItems.map(\.id))
        guard !acknowledged.isEmpty else { return }
        for item in acknowledgedItems { workspace?.consumeAnnotationReferences(item.annotationReferences ?? []) }
        prepared.removeAll { acknowledged.contains($0.id) }; scheduleSave()
    }
    func steerPrepared(_ id: String, using gateway: GalleryModel, workspace: WorkspaceModel? = nil) async {
        guard !sending, let item = preparedForThread.first(where: { $0.id == id }) else { return }
        if preparedWasAcknowledged(item) {
            reconcilePreparedAcknowledgements(workspace: workspace); return
        }
        guard supportsSteering else { error = "Cet assistant ne permet pas d’intervenir pendant sa réponse. Le message reste en attente."; return }
        guard (!item.attempted || item.attemptedMode == "steer"), running || item.attemptedMode == "steer" else { return }
        let accepted = await intervene(item.text, using: gateway, requestID: item.id, files: item.files, retry: item.attemptedMode == "steer") {
            self.markPreparedTransmitting(item.id, mode: "steer")
        }
        if accepted || preparedWasAcknowledged(item) {
            workspace?.consumeAnnotationReferences(item.annotationReferences ?? [])
            prepared.removeAll { $0.id == id }; scheduleSave()
        }
    }
    func deliverPrepared(using gateway: GalleryModel, automatic: Bool = false, workspace: WorkspaceModel? = nil) async {
        reconcilePreparedAcknowledgements(workspace: workspace)
        guard !running, !sending, let item = preparedForThread.first, item.attemptedMode != "steer",
              (!automatic || (!item.attempted && !pausedQueues.contains(item.threadID))) else { return }
        if !automatic { pausedQueues.remove(item.threadID); scheduleSave() }
        let oldModel = model, oldEffort = effort
        model = item.model; effort = item.effort
        let requestPermission = permissionForPrepared(item)
        let accepted = await send(item.text, using: gateway, explicitFiles: item.files, requestID: item.id, permissionOverride: requestPermission) {
            self.markPreparedTransmitting(item.id, mode: "send", permission: requestPermission)
        }
        if selected?.id == item.threadID { model = oldModel; effort = oldEffort }
        if accepted || preparedWasAcknowledged(item) {
            workspace?.consumeAnnotationReferences(item.annotationReferences ?? [])
            prepared.removeAll { $0.id == item.id }; scheduleSave()
        }
    }
    func intervene(_ text: String, using gateway: GalleryModel, requestID: String, files: [GalleryArtifact] = [], retry: Bool = false, onWillTransmit: (() -> Void)? = nil) async -> Bool {
        guard !isPreview, (running || retry), !sending, let thread = selected,
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !files.isEmpty else { return false }
        guard supportsSteering else { error = "Cet assistant ne permet pas d’intervenir pendant sa réponse. Ajoutez le message à la suite."; return false }
        sending = true; error = nil; defer { sending = false }
        if !files.isEmpty { historyFiles[thread.id, default: [:]][requestID] = files; scheduleSave() }
        do {
            var fileIDs: [String] = []
            for file in files { fileIDs.append(try await gateway.attachmentID(file)) }
            guard gateway.hasAddress else { throw GalleryModel.GalleryError.invalidAddress }
            onWillTransmit?()
            let data = try await gateway.chatRequest(["send"], body: ["threadId":thread.id,"prompt":text,
                "clientRequestId":requestID,"clientMessageId":requestID,"mode":"steer", "fileIds":fileIDs])
            let result = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            guard result?["proxied"] as? Bool == true else { throw ChatError.notSent }
            AtelierTheme.confirmation(); return true
        } catch { self.error = error.localizedDescription; return false }
    }
}

struct RemoteWorkView: View {
    let workspace: WorkspaceModel
    @Environment(\.dismiss) private var dismiss
    @State private var steering = false
    var body: some View {
        let chat = workspace.chat
        NavigationStack {
            List {
                Section {
                    Label(chat.statusLabel, systemImage: chat.statusIcon)
                    Text(chat.title).font(.headline)
                    if chat.running {
                        Button("Préciser la consigne", systemImage: "bubble") { steering = true }.disabled(!chat.supportsSteering)
                        Button("Arrêter le travail", systemImage: "stop") { Task { await chat.stop(using: workspace.gallery) } }
                    }
                }
                Section("À suivre") {
                    NavigationLink { PreparedMessagesView(workspace: workspace) } label: {
                        Label("Messages en attente (\(chat.preparedForThread.count))", systemImage: "text.line.first.and.arrowtriangle.forward")
                    }
                    NavigationLink { RemoteChangesView(workspace: workspace) } label: {
                        Label("Fichiers modifiés (\(chat.rows.flatMap(\.changes).count))", systemImage: "doc.badge.gearshape")
                    }
                }
                Section("Activité récente") {
                    ForEach(chat.rows.filter { ChatTimelineItem.activityKinds.contains($0.kind) }.suffix(30)) { row in
                        NavigationLink {
                            ScrollView { VStack(alignment: .leading, spacing: 16) {
                                Text(row.text).font(.headline)
                                Text(row.detail.isEmpty ? "Aucun détail supplémentaire transmis par le Mac." : row.detail)
                                    .font(.system(.body, design: .monospaced)).textSelection(.enabled)
                            }.frame(maxWidth: .infinity, alignment: .leading).padding() }
                                .navigationTitle("Détail de l’activité").navigationBarTitleDisplayMode(.inline)
                                .toolbar { Button("Copier", systemImage: "doc.on.doc") { UIPasteboard.general.string = row.text + "\n" + row.detail } }
                        } label: { Text(row.text).lineLimit(2) }
                    }
                }
            }.navigationTitle("Travail du Mac").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fermer") { dismiss() } } }
                .sheet(isPresented: $steering) { SteeringSheet(workspace: workspace) }
        }
    }
}

struct PreparedMessagesView: View {
    let workspace: WorkspaceModel
    var body: some View {
        let chat = workspace.chat
        List {
            Section {
                ForEach(chat.preparedForThread) { item in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(item.text).lineLimit(5)
                        if !item.files.isEmpty { Label("\(item.files.count) pièce(s) jointe(s)", systemImage: "paperclip").font(.caption) }
                        if item.attempted { Text("Transmission à vérifier avant de poursuivre.").font(.caption).foregroundStyle(.secondary) }
                        HStack {
                            Button("Remonter", systemImage: "arrow.up") { chat.movePrepared(item.id, up: true) }
                            Button("Descendre", systemImage: "arrow.down") { chat.movePrepared(item.id, up: false) }
                            Spacer()
                            Button("Retirer", systemImage: "xmark") { chat.removePrepared(item.id) }
                        }.labelStyle(.iconOnly).buttonStyle(.borderless).frame(minHeight: 44).disabled(chat.sending)
                    }
                }
                if chat.preparedForThread.isEmpty { Text("Aucun message en attente.").foregroundStyle(.secondary) }
                else if !chat.running { Button("Envoyer le prochain message") { Task { await chat.deliverPrepared(using: workspace.gallery, workspace: workspace) } }.disabled(chat.sending) }
            } footer: {
                Text("Messages conservés sur cet iPhone. La suite est envoyée à la fin du tour tant que cette conversation reste ouverte et connectée. Après une interruption, vous pouvez reprendre l’envoi ici.")
            }
            if let error = chat.error { Text(error).foregroundStyle(.secondary) }
        }.navigationTitle("Messages en attente").navigationBarTitleDisplayMode(.inline)
    }
}

struct SteeringSheet: View {
    let workspace: WorkspaceModel
    @State private var text = ""
    @State private var requestID = UUID().uuidString
    @State private var attempted: String?
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                TextEditor(text: $text).accessibilityLabel("Précision pour le travail en cours").disabled(workspace.chat.sending)
                if let error = workspace.chat.error { Text(error).font(.footnote).foregroundStyle(.secondary) }
                Text("La précision est transmise au tour en cours. Le Mac confirme sa réception.").font(.footnote).foregroundStyle(.secondary)
            }.padding().navigationTitle("Préciser la consigne").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() }.disabled(workspace.chat.sending) }
                    ToolbarItem(placement: .confirmationAction) { Button("Envoyer") {
                        if let attempted, attempted != text { requestID = UUID().uuidString }
                        attempted = text
                        Task { if await workspace.chat.intervene(text, using: workspace.gallery, requestID: requestID) { dismiss() } }
                    }.disabled(workspace.chat.sending || !workspace.chat.running || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
                }.interactiveDismissDisabled(workspace.chat.sending)
        }
    }
}

struct RemoteChangesView: View {
    let workspace: WorkspaceModel
    var body: some View {
        let changes = workspace.chat.rows.flatMap(\.changes)
        List {
            if changes.isEmpty { Text("Aucune modification de fichier transmise pour cette conversation.").foregroundStyle(.secondary) }
            ForEach(changes) { change in
                NavigationLink { RemoteDiffView(change: change, workspace: workspace) } label: {
                    Label(change.path, systemImage: "doc.text").lineLimit(2)
                }
            }
        }.navigationTitle("Fichiers modifiés").navigationBarTitleDisplayMode(.inline)
    }
}

struct RemoteDiffView: View {
    let change: RemoteFileChange
    let workspace: WorkspaceModel
    @State private var steering = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Modification signalée par le Mac").font(.caption).foregroundStyle(.secondary)
                if let before = change.before { Text("Avant").font(.headline); Text(before).font(.system(.body, design: .monospaced)).textSelection(.enabled).padding().frame(maxWidth: .infinity, alignment: .leading).background(.red.opacity(0.08)) }
                if let after = change.after { Text("Après").font(.headline); Text(after).font(.system(.body, design: .monospaced)).textSelection(.enabled).padding().frame(maxWidth: .infinity, alignment: .leading).background(.green.opacity(0.08)) }
                if let unified = change.unified { Text(unified).font(.system(.body, design: .monospaced)).textSelection(.enabled) }
                if change.before == nil && change.after == nil && change.unified == nil { Text("Le fournisseur a transmis le nom du fichier, sans aperçu de la modification.") }
                Button("Demander un ajustement", systemImage: "bubble") {
                    workspace.draft += (workspace.draft.isEmpty ? "" : "\n\n") + "Peux-tu ajuster la modification dans \(change.path) : "
                    workspace.surface = .chat; workspace.focusChatRequest = UUID()
                }
                Text("Cet aperçu décrit un changement déjà signalé. Il ne sauvegarde ni n’annule le fichier.").font(.footnote).foregroundStyle(.secondary)
            }.padding()
        }.navigationTitle((change.path as NSString).lastPathComponent).navigationBarTitleDisplayMode(.inline)
    }
}
