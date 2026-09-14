import SwiftUI

@MainActor @Observable final class RemoteChatModel {
    struct Thread: Codable, Identifiable, Sendable {
        let id: String; let title: String; let provider: String
        let model: String?; let projectId: String?; let status: String
        var messageRevision: MessageRevision? = nil
        var updatedAt: String? = nil
        var conversationID: String { messageRevision?.rootThreadId ?? id }
    }
    struct Provider: Decodable, Identifiable {
        struct Capabilities: Decodable { var permissionModes: [String]?; var steering: Bool? = nil }
        let id: String; let label: String; let models: [String]; let defaultModel: String
        let efforts: [String]; let ok: Bool; let modelLabels: [String: String]?
        var capabilities: Capabilities? = nil
    }
    struct Row: Identifiable, Codable, Sendable, Equatable {
        let id: String; let kind: String; var text: String; let turn: String
        var detail = ""
        var isStreaming = false
        var eventID: String?
        var changes: [RemoteFileChange] = []
        var requestId: String?
        var resolved = false
        var approval = false
        var messageID: String?
        var toolName = ""
        var toolStatus = ""
        var toolFields: [String: String]? = nil
    }
    struct Quote: Identifiable, Equatable, Codable, Sendable {
        let id = UUID()
        let text: String
        let sourceRowID: String
        var sourceLabel: String? = nil
    }
    var quote: Quote? { didSet { scheduleSave() } }
    private var threadQuotes: [String: Quote] = [:]
    /// Highest journal sequence applied per thread: a resumed conversation asks the
    /// gateway only for what it is missing instead of re-downloading its history.
    private(set) var lastSequences: [String: Int] = [:]
    func quotePassage(_ text: String, from rowID: String) {
        guard selected != nil, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        quote = Quote(text: text, sourceRowID: rowID)
    }
    static func promptWithQuote(_ prompt: String, quote: Quote?) -> String {
        guard let quote else { return prompt }
        let citation = quote.text.components(separatedBy: "\n").map { "> " + $0 }.joined(separator: "\n")
        return (quote.sourceLabel.map { "Document : \($0)\nPassage cité :\n" } ?? "Passage cité de la conversation :\n") + citation + "\n\n" + prompt
    }
    var attachments: [GalleryArtifact] = [] { didSet { scheduleSave() } }
    private var threadAttachments: [String: [GalleryArtifact]] = [:]
    func attach(_ item: GalleryArtifact) {
        guard !attachments.contains(where: { $0.id == item.id }) else { return }
        guard attachments.count < 6 else { error = "Six pièces jointes maximum."; return }
        attachments.append(item)
    }
    var isPreview = false
    var threads: [Thread] = []
    var providers: [Provider] = []
    var selected: Thread?
    var rows: [Row] = []
    var activityDisclosure: [String: Bool] = [:]
    func isTurnRunning(_ turn: String) -> Bool { activeTurns.contains(turn) }
    var model = "" { didSet { scheduleSave() } }
    var effort = "" { didSet { scheduleSave() } }
    var permissionMode: ChatPermissionMode = .full { didSet { scheduleSave() } }
    var effectivePermissionMode: ChatPermissionMode {
        // Providers with no adjustable policy must not erase the global choice.
        if provider != nil && availablePermissionModes.isEmpty { return .ask }
        return permissionMode
    }
    var availablePermissionModes: [ChatPermissionMode] {
        let supported = provider?.capabilities?.permissionModes ?? []
        return ChatPermissionMode.allCases.filter { supported.contains($0.rawValue) }
    }
    var sending = false
    var running = false
    var completedResponse = UUID()
    var pausedQueues: Set<String> = []
    private var activeTurns: Set<String> = []
    private var failedTurns: Set<String> = []
    var loading = false
    enum Connection { case idle, connecting, live, reconnecting, associationRequired }
    var connection: Connection = .idle
    var connectionError: String?
    var connectionLabel: String {
        if isPreview { return "Aperçu local" }
        switch connection {
        case .live: return "Mac connecté"
        case .connecting: return "Connexion au Mac…"
        case .reconnecting: return "Reconnexion au Mac…"
        case .associationRequired: return "Associer le Mac"
        case .idle: return "Mac hors connexion"
        }
    }
    var reconnectGeneration = 0
    private var leftActiveState = false
    private(set) var resumingInBackground = false
    @ObservationIgnored private var resumeStatusTask: Task<Void, Never>?
    var showsConnectionStatus: Bool { connection != .live && !resumingInBackground }
    func sceneDidLeaveActive() { leftActiveState = true }
    func sceneDidBecomeActive() {
        guard leftActiveState else { return }
        leftActiveState = false
        guard selected != nil, !isPreview, connection != .associationRequired else { return }
        // A suspended socket may still look live. Replace it immediately on return,
        // retaining the transcript, draft and reading position throughout the handoff.
        reconnectGeneration += 1
        resumingInBackground = true
        let generation = reconnectGeneration
        resumeStatusTask?.cancel()
        resumeStatusTask = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(1)) } catch { return }
            guard let self, self.reconnectGeneration == generation else { return }
            self.resumingInBackground = false
        }
    }
    private func finishForegroundResume() {
        resumeStatusTask?.cancel(); resumeStatusTask = nil; resumingInBackground = false
    }
    var live = false
    var statusLabel: String {
        if isPreview { return "Aperçu local" }
        if connection == .associationRequired { return "Associer le Mac" }
        if connection == .reconnecting { return "Reconnexion…" }
        if sending { return "Envoi…" }
        if rows.contains(where: { $0.kind == "interaction" && !$0.resolved }) { return "Accord nécessaire" }
        if running { return "Réponse en cours" }
        return live ? "En direct" : "Connexion…"
    }
    var statusIcon: String {
        if isPreview { return "iphone" }
        if connection == .associationRequired { return "link.badge.plus" }
        if connection == .reconnecting { return "wifi.exclamationmark" }
        if rows.contains(where: { $0.kind == "interaction" && !$0.resolved }) { return "hand.raised" }
        return sending || running || !live ? "circle.dotted" : "circle.fill"
    }
    func reconnect() {
        finishForegroundResume()
        live = false
        connection = selected == nil ? .idle : .connecting
        connectionError = nil
        reconnectGeneration += 1
    }

    var error: String?
    private var seen: Set<String> = []
    private var interactionStates: [String: String] = [:]
    private var liveRows: [String: String] = [:]
    private var completedTurns: Set<String> = []
    private var cachedTranscript: ChatTranscriptSnapshot?
    private var drafts: [String: String] = [:]
    @ObservationIgnored var resumeStore: ChatResumeStore?
    @ObservationIgnored private var saveTask: Task<Void, Never>?
    @ObservationIgnored private var replayIndex: ChatReplayIndex?
    @ObservationIgnored private var replayingHistory = false
    /// A delta replay can contain a completion event while the transcript is
    /// being rebuilt. Keep one coalesced signal until the replay batch ends so
    /// document refresh does not run once per historical event.
    @ObservationIgnored private var replayCompletionPending = false
    private var restoring = false
    private var restoreFailed = false
    var sendAttempts: [String: SendAttempt] = [:]
    var prepared: [PreparedChatMessage] = []
    var pins: [String: [String]] = [:]
    var settings: [String: ChatSettings] = [:]
    var bookmarks: [String: ChatBookmark] = [:]
    var galleryProjectID = ""
    var creationProjectID = ""
    var historyFiles: [String: [String: [GalleryArtifact]]] = [:]
    var restorationAttempted = false
    func updateDraft(_ text: String) {
        guard let selected else { return }
        drafts[selected.id] = text; scheduleSave()
    }
    func rememberPosition(rowID: String?, followsTail: Bool, offsetY: Double? = nil, contentHeight: Double? = nil, rowOffsetY: Double? = nil) {
        guard let selected, !isPreview else { return }
        bookmarks[selected.id] = ChatBookmark(rowID: rowID, followsTail: followsTail, offsetY: offsetY, contentHeight: contentHeight, rowOffsetY: rowOffsetY)
        scheduleSave()
    }
    private func currentTranscript() -> ChatTranscriptSnapshot? {
        guard let selected else { return cachedTranscript }
        // An optimistic row may still be uploading and must not become a delivered message on restart.
        let durableRows = rows.filter { !$0.id.hasPrefix("pending:") }
        return ChatTranscriptSnapshot(threadID: selected.id, rows: durableRows, seen: seen, liveRows: liveRows,
                                      completedTurns: completedTurns, failedTurns: failedTurns,
                                      activeTurns: activeTurns, interactionStates: interactionStates, running: !activeTurns.isEmpty)
    }
    private func restoreTranscript(_ transcript: ChatTranscriptSnapshot?, for thread: Thread) {
        let saved = transcript.flatMap { $0.threadID == thread.id ? $0 : nil }
        rows = saved?.rows.filter { !$0.id.hasPrefix("pending:") } ?? []; seen = saved?.seen ?? []; liveRows = saved?.liveRows ?? [:]
        completedTurns = saved?.completedTurns ?? []; failedTurns = saved?.failedTurns ?? []
        activeTurns = saved?.activeTurns ?? []; interactionStates = saved?.interactionStates ?? [:]
        running = saved != nil ? !activeTurns.isEmpty : (thread.status == "running")
    }
    private func snapshot() -> ChatResumeSnapshot {
        var files = threadAttachments, quotes = threadQuotes, settings = settings
        if let selected {
            files[selected.id] = attachments; quotes[selected.id] = quote
            settings[selected.id] = ChatSettings(model: model, effort: effort, permissionMode: permissionMode.rawValue)
        }
        return ChatResumeSnapshot(selected: selected, pendingAttachments: selected == nil ? attachments : [], drafts: drafts, quotes: quotes, attachments: files,
                                  settings: settings, bookmarks: bookmarks, galleryProjectID: galleryProjectID, historyFiles: historyFiles, prepared: prepared, pins: pins, sendAttempts: sendAttempts, pausedQueues: Array(pausedQueues), globalPermissionMode: permissionMode.rawValue, lastSequences: lastSequences, transcript: currentTranscript())
    }
    func scheduleSave() {
        guard resumeStore != nil, !restoring, !replayingHistory, !restoreFailed, !isPreview else { return }
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(350)) } catch { return }
            await self?.flushResume()
        }
    }
    func flushResume() async {
        guard let resumeStore, !restoring, !restoreFailed, !isPreview else { return }
        do { try await resumeStore.save(snapshot()) }
        catch { self.error = "La sauvegarde du brouillon a échoué : " + error.localizedDescription }
    }
    func restore(workspace: WorkspaceModel) async {
        guard !restorationAttempted, let resumeStore, !isPreview else { return }
        restorationAttempted = true; restoring = true; defer { restoring = false }
        do {
            guard let saved = try await resumeStore.load() else { return }
            permissionMode = saved.globalPermissionMode.flatMap(ChatPermissionMode.init(rawValue:)) ?? .full
            drafts = saved.drafts; threadQuotes = saved.quotes; threadAttachments = saved.attachments
            settings = saved.settings; bookmarks = saved.bookmarks; galleryProjectID = saved.galleryProjectID; historyFiles = saved.historyFiles
            pausedQueues = Set(saved.pausedQueues ?? [])
            sendAttempts = saved.sendAttempts ?? [:]
            lastSequences = saved.lastSequences ?? [:]
            prepared = saved.prepared ?? []; pins = saved.pins ?? [:]
            attachments = saved.pendingAttachments ?? []
            workspace.gallery.selectedProject = saved.galleryProjectID
            cachedTranscript = saved.transcript
            if let thread = saved.selected { select(thread, workspace: workspace) }
        } catch { restoreFailed = true; self.error = "La session précédente n’a pas pu être restaurée : " + error.localizedDescription }
    }
    var provider: Provider? { providers.first { $0.id == selected?.provider } }
    // The gateway currently accepts these provider IDs when creating a thread.
    var creationProviders: [Provider] {
        providers.filter { $0.ok && ["claude", "codex", "grok", "opencode", "gemini"].contains($0.id) }
    }
    var title: String { selected?.title ?? "Conversations" }

    func loadCatalog(using gateway: GalleryModel, refreshProviders: Bool = true) async {
        guard !isPreview, gateway.connected, !loading else { return }
        loading = true; defer { loading = false }
        do {
            struct Threads: Decodable { let threads: [Thread] }
            let refreshed = try JSONDecoder().decode(Threads.self, from: await gateway.chatRequest(["threads"])).threads
            try await gateway.loadProjects()
            try Task.checkCancellation()
            threads = refreshed
            if refreshProviders || providers.isEmpty {
                struct Providers: Decodable { let providers: [Provider] }
                providers = try JSONDecoder().decode(Providers.self, from: await gateway.chatRequest(["providers"])).providers
            }
            if refreshProviders { error = nil }
        } catch {
            if (refreshProviders || threads.isEmpty) && !Task.isCancelled && !(error is CancellationError) && (error as? URLError)?.code != .cancelled { self.error = error.localizedDescription }
        }
    }
    func showConversations(workspace: WorkspaceModel) {
        cachedTranscript = currentTranscript()
        if let thread = selected { drafts[thread.id] = workspace.draft; threadAttachments[thread.id] = attachments; threadQuotes[thread.id] = quote; settings[thread.id] = ChatSettings(model: model, effort: effort, permissionMode: permissionMode.rawValue) }
        selected = nil; attachments = []; quote = nil; workspace.draft = ""; live = false; scheduleSave()
    }
    func select(_ thread: Thread, workspace: WorkspaceModel, navigateToChat: Bool = true) {
        if !isPreview && !restoring { workspace.sidebarPreferences.markOpened(thread.projectId) }
        if selected?.id == thread.id {
            if navigateToChat { workspace.surface = .chat }
            return
        }
        let targetTranscript = cachedTranscript
        cachedTranscript = currentTranscript()
        let pending = selected == nil ? attachments : []
        if let old = selected { drafts[old.id] = workspace.draft; threadAttachments[old.id] = attachments; threadQuotes[old.id] = quote; settings[old.id] = ChatSettings(model: model, effort: effort, permissionMode: permissionMode.rawValue) }
        attachments = threadAttachments[thread.id] ?? []
        quote = threadQuotes[thread.id]
        selected = thread; live = false; connection = .connecting; workspace.draft = drafts[thread.id] ?? ""
        model = settings[thread.id]?.model ?? thread.model.flatMap { $0.isEmpty ? nil : $0 } ?? provider?.defaultModel ?? ""
        effort = settings[thread.id]?.effort ?? ""
        restoreTranscript(targetTranscript, for: thread); error = nil; connectionError = nil
        // A sequence watermark is meaningful only with its matching local transcript.
        // Without that transcript, the next observer must request a full snapshot.
        if targetTranscript?.threadID != thread.id { lastSequences.removeValue(forKey: thread.id) }
        for item in pending { attach(item) }
        creationProjectID = thread.projectId ?? ""
        workspace.applyPendingDocumentChat()
        if navigateToChat { workspace.surface = .chat }
        scheduleSave()
    }
    func prepareRevision(_ row: Row) -> MessageEditDraft? {
        guard row.kind == "user", !sending, !running, !isPreview, let selected,
              !row.id.hasPrefix("pending:"), !row.id.hasPrefix("live:"), !row.id.hasPrefix("history:") else { return nil }
        return MessageEditDraft(thread: selected, row: row, prompt: editablePrompt(for: row), files: files(for: row))
    }
    func retryPrompt(for row: Row) -> String? {
        guard row.kind == "text" || row.kind == "error", let index = rows.firstIndex(where: { $0.id == row.id }) else { return nil }
        return rows[..<index].last(where: { $0.kind == "user" }).map { editablePrompt(for: $0) }
    }
    func files(for row: Row) -> [GalleryArtifact] {
        guard let thread = selected?.id, let message = row.messageID else { return [] }
        return historyFiles[thread]?[message] ?? []
    }
    func editablePrompt(for row: Row) -> String {
        let files = files(for: row)
        let suffix = "\n\nPièces jointes : " + files.map(\.name).joined(separator: ", ")
        return !files.isEmpty && row.text.hasSuffix(suffix) ? String(row.text.dropLast(suffix.count)) : row.text
    }
    func retry(_ row: Row, workspace: WorkspaceModel) async {
        guard let index = rows.firstIndex(where: { $0.id == row.id }),
              let user = rows[..<index].last(where: { $0.kind == "user" }) else { return }
        guard let draft = prepareRevision(user) else { return }
        do { try await commitRevision(draft, text: draft.prompt, requestID: UUID().uuidString, workspace: workspace) }
        catch { self.error = error.localizedDescription }
    }
    func create(provider: Provider, workspace: WorkspaceModel, navigateToChat: Bool = true) async throws {
        var body: [String: Any] = ["provider": provider.id, "model": provider.defaultModel, "title": "Nouveau chat"]
        if !creationProjectID.isEmpty { body["projectId"] = creationProjectID }
        let data = try await workspace.gallery.chatRequest(["threads"], body: body)
        let thread = try JSONDecoder().decode(Thread.self, from: data)
        threads.insert(thread, at: 0); select(thread, workspace: workspace, navigateToChat: navigateToChat)
    }
    /// Reconnect ramp: fast enough for a tunnel waking up, capped so that a long
    /// outage never turns into a request storm.
    static let retryDelays: [Double] = [0.15, 0.35, 0.75, 1.5, 3.0]

    func observe(using gateway: GalleryModel) async {
        guard !isPreview, let thread = selected else { return }
        let id = thread.id, generation = reconnectGeneration
        func current() -> Bool { !Task.isCancelled && selected?.id == id && reconnectGeneration == generation }
        live = false; connection = .connecting
        var attempt = 0
        // Catalog refresh is independent of restoring the current conversation.
        while current() {
            do {
                // Subscribe before history to avoid missing events during replay.
                let bytes = try await gateway.chatStream(id)
                let streamTask = bytes.task
                defer { streamTask.cancel() }
                guard current() else { return }
                // The open socket is what makes the conversation live: the transcript
                // is already restored locally, so a replay must not delay that state.
                live = true; connection = .live; connectionError = nil; finishForegroundResume()
                try await withTaskCancellationHandler {
                    // Only what the transcript is missing: a resumed phone must not
                    // download its whole journal again.
                    let replayAfter = lastSequences[id] ?? 0
                    var replayingDelta = replayAfter > 0
                    var envelope = try await historyEnvelope(using: gateway, thread: id, after: replayAfter)
                    guard current() else { return }
                    if envelope.snapshotRequired || !envelope.complete {
                        envelope = try await historyEnvelope(using: gateway, thread: id, after: 0)
                        replayingDelta = false
                        guard current() else { return }
                    }
                    // An incremental delta is the only replay that may contain
                    // a newly completed response. Apply that delta as one
                    // completion-aware batch so the document refresh fires once
                    // after the full replay. A snapshot is older restoration
                    // state and keeps the existing yielding path.
                    let notifyCompletion = replayingDelta && envelope.complete && !envelope.snapshotRequired
                    if notifyCompletion {
                        applyHistoryBatch(envelope.events[...], notifyCompletion: true)
                    } else {
                        applyHistorySnapshot(envelope.events[...])
                    }
                    attempt = 0
                    for try await line in bytes.lines {
                        guard current() else { return }
                        if let data = line.data(using: .utf8), let event = try JSONSerialization.jsonObject(with: data) as? [String: Any] { apply(event) }
                    }
                } onCancel: { streamTask.cancel() }
            } catch {
                guard current() else { return }
                if case GalleryModel.GalleryError.server(401) = error {
                    live = false; connection = .associationRequired; finishForegroundResume()
                    self.connectionError = "L’association a expiré. Reconnectez ce téléphone depuis les options d’Atelier. Votre brouillon est conservé."
                    return
                }
                self.connectionError = "Le Mac est momentanément injoignable. Reconnexion automatique…"
            }
            guard current() else { return }
            live = false; connection = .reconnecting
            attempt += 1
            let delay = Self.retryDelays[min(attempt, Self.retryDelays.count) - 1]
            do { try await Task.sleep(for: .seconds(delay)) } catch { return }
        }
    }

    private func historyEnvelope(using gateway: GalleryModel, thread: String, after: Int) async throws -> ChatHistoryEnvelope {
        let query = after > 0 ? [URLQueryItem(name: "afterSequence", value: String(after))] : []
        let history = try await gateway.chatRequest(["threads", thread, "history"], query: query)
        return try await ChatHistoryEnvelope.decode(history)
    }
    func applyHistoryBatch(_ events: ArraySlice<[String: Any]>, notifyCompletion: Bool = false) {
        replayCompletionPending = false
        replayingHistory = true
        replayIndex = ChatReplayIndex(rows)
        defer {
            replayIndex = nil
            replayingHistory = false
            if notifyCompletion && replayCompletionPending {
                completedResponse = UUID()
                if live, !isPreview, let selected {
                    NativeNotifications.received(thread: selected.id, title: selected.title)
                }
            }
            replayCompletionPending = false
            scheduleSave()
        }
        for event in events {
            apply(event)
            replayIndex?.synchronize(rows)
        }
    }
    func applyHistorySnapshot(_ events: ArraySlice<[String: Any]>, notifyCompletion: Bool = false) {
        let optimistic = rows.filter { $0.id.hasPrefix("pending:") }
        let wasRunning = running
        let previouslyActiveTurns = activeTurns
        let lastGlobalCompletion = events.lastIndex { event in
            guard event["kind"] as? String == "done" else { return false }
            let meta = event["meta"] as? [String: Any]
            return meta?["turnId"] == nil
        }
        let activityEvents: ArraySlice<[String: Any]>
        if let lastGlobalCompletion {
            activityEvents = events[events.index(after: lastGlobalCompletion)...]
        } else {
            activityEvents = events
        }
        rows = []; seen = []; interactionStates = [:]; liveRows = [:]
        completedTurns = []; failedTurns = []; activeTurns = []; running = false
        activityDisclosure = [:]
        if let selected { lastSequences.removeValue(forKey: selected.id) }
        applyHistoryBatch(events, notifyCompletion: notifyCompletion)
        var preservedPending = false
        for row in optimistic where !rows.contains(where: { $0.messageID == row.messageID }) {
            rows.append(row)
            preservedPending = true
        }
        if wasRunning {
            var recoveredActiveTurns = (lastGlobalCompletion == nil ? previouslyActiveTurns : [])
                .subtracting(completedTurns)
                .subtracting(failedTurns)
            for pending in optimistic {
                let durableTurn = activityEvents.compactMap { event -> String? in
                    guard event["kind"] as? String == "user",
                          let meta = event["meta"] as? [String: Any],
                          meta["messageId"] as? String == pending.messageID else { return nil }
                    return meta["turnId"] as? String
                }.last
                if let durableTurn, !completedTurns.contains(durableTurn), !failedTurns.contains(durableTurn) {
                    recoveredActiveTurns.insert(durableTurn)
                }
            }
            if recoveredActiveTurns.isEmpty && preservedPending {
                recoveredActiveTurns.formUnion(optimistic.map(\.turn))
            }
            if activeTurns.isEmpty && recoveredActiveTurns.isEmpty {
                for event in activityEvents.reversed() {
                    guard let kind = event["kind"] as? String,
                          !["done", "error", "heartbeat", "usage"].contains(kind),
                          let meta = event["meta"] as? [String: Any],
                          let turn = meta["turnId"] as? String,
                          !completedTurns.contains(turn), !failedTurns.contains(turn) else { continue }
                    recoveredActiveTurns.insert(turn)
                    break
                }
            }
            activeTurns.formUnion(recoveredActiveTurns)
            running = !activeTurns.isEmpty
        }
    }
    private func replayRowIndex(_ id: String) -> Int? {
        if let replayIndex { return replayIndex.ids[id] }
        return rows.firstIndex { $0.id == id }
    }
    private func replayTurnIndices(_ turn: String) -> [Int] {
        if let replayIndex { return replayIndex.turns[turn] ?? [] }
        return rows.indices.filter { rows[$0].turn == turn }
    }
    private var replayInteractionIndices: [Int] {
        replayIndex?.interactions ?? rows.indices.filter { rows[$0].kind == "interaction" }
    }

    func apply(_ event: [String: Any]) {
        guard let kind = event["kind"] as? String else { return }
        let meta = event["meta"] as? [String: Any] ?? [:]
        let eventID = meta["eventId"] as? String
        let turn = meta["turnId"] as? String ?? "legacy"
        if let sequence = meta["sequence"] as? Int, let thread = (meta["threadId"] as? String) ?? selected?.id {
            lastSequences[thread] = max(lastSequences[thread] ?? 0, sequence)
        }
        if let eventID, !seen.insert(eventID).inserted {
            if kind == "text" || kind == "thinking", let stale = liveRows.removeValue(forKey: "\(turn):\(kind)") {
                rows.removeAll { $0.id == stale }; scheduleSave()
            }
            return
        }
        defer { if !["heartbeat", "usage"].contains(kind) { scheduleSave() } }
        let text = event["text"] as? String ?? event["message"] as? String ?? event["result"] as? String ?? ""
        if kind == "started" { if !completedTurns.contains(turn) { activeTurns.insert(turn); running = true }; return }
        if kind == "done" {
            let wasRunning = running
            if meta["turnId"] == nil { completedTurns.formUnion(activeTurns); activeTurns.removeAll() }
            completedTurns.insert(turn); activeTurns.remove(turn); running = !activeTurns.isEmpty
            // A completion can arrive while the socket is reconnecting or while
            // a send response is replayed. Publish the revision in both cases;
            // the document view uses it to refresh the remote file. Suppress
            // only bulk history replay, which is restoration rather than a new
            // response.
            if wasRunning, !failedTurns.contains(turn) {
                if replayingHistory {
                    replayCompletionPending = true
                } else {
                    completedResponse = UUID()
                    if live, !isPreview, let selected {
                        NativeNotifications.received(thread: selected.id, title: selected.title)
                    }
                }
            }
            for index in meta["turnId"] == nil ? Array(rows.indices) : replayTurnIndices(turn) {
                rows[index].isStreaming = false
                if rows[index].kind == "interaction" { rows[index].resolved = true }
            }
            return
        }
        if kind == "user" {
            for index in replayInteractionIndices where rows[index].turn != turn { rows[index].resolved = true }
        }
        if kind == "error" {
            failedTurns.insert(turn); activeTurns.remove(turn); running = !activeTurns.isEmpty
            if let selected { pausedQueues.insert(selected.id); scheduleSave() }
            for index in replayTurnIndices(turn) { rows[index].isStreaming = false }
            self.error = text.isEmpty ? "Le travail s’est interrompu. La file est en pause." : text
        }
        if ["heartbeat", "usage"].contains(kind) { return }
        if ["delta", "stream_set", "streaming", "thinking_delta", "thinking_live"].contains(kind) {
            guard !completedTurns.contains(turn) else { return }
            activeTurns.insert(turn); running = true
            let thinking = kind.hasPrefix("thinking")
            let key = "\(turn):\(thinking ? "thinking" : "text")"
            let id = liveRows[key] ?? "stream:\(UUID().uuidString)"
            liveRows[key] = id
            if let index = replayRowIndex(id) {
                if kind == "delta" || kind == "thinking_delta" { rows[index].text += text }
                else { rows[index].text = text }
            } else { rows.append(Row(id: id, kind: thinking ? "thinking" : "text", text: text, turn: turn, isStreaming: true)) }
            return
        }
        if kind == "user", let message = meta["messageId"] as? String { rows.removeAll { $0.id == "pending:\(message)" }; replayIndex?.synchronize(rows) }
        let label = text.isEmpty ? (event["name"] as? String ?? event["title"] as? String ?? kind) : text
        guard ["user", "text", "thinking", "error", "tool", "tool_update", "interaction", "edit"].contains(kind) else { return }
        let id = kind == "interaction", requestID = event["requestId"] as? String
        let stableID = (kind == "text" || kind == "thinking") ? liveRows.removeValue(forKey: "\(turn):\(kind)") : nil
        let rowID = stableID ?? (id && requestID != nil ? "interaction:\(requestID!)" : ["tool", "tool_update"].contains(kind) ? "tool:\(turn):\(meta["itemId"] as? String ?? event["id"] as? String ?? eventID ?? label)" : eventID ?? "history:\(turn):\(kind):\(label)")
        if let index = replayRowIndex(rowID) { rows[index].text = label }
        else { rows.append(Row(id: rowID, kind: kind, text: label, turn: turn)) }
        replayIndex?.synchronize(rows)
        if let index = replayRowIndex(rowID) {
            rows[index].isStreaming = false
            if let name = event["name"] as? String { rows[index].toolName = name }
            if let status = event["status"] as? String { rows[index].toolStatus = status }
            rows[index].eventID = eventID
            if event["files"] != nil { rows[index].changes = RemoteFileChange.parse(event, eventID: rowID) }
            rows[index].messageID = meta["messageId"] as? String
            var fields = rows[index].toolFields ?? [:]
            if fields.isEmpty && !rows[index].detail.isEmpty { fields["detail"] = rows[index].detail }
            for key in ["detail", "command", "input", "arguments", "output", "result", "exitCode", "durationMs", "truncated", "files"] {
                guard let value = event[key], !(value is NSNull) else { continue }
                let formatted: String
                if let text = value as? String { formatted = text }
                else if let data = try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys, .fragmentsAllowed]) {
                    formatted = String(decoding: data, as: UTF8.self)
                } else { continue }
                if !formatted.isEmpty { fields[key] = formatted }
            }
            rows[index].toolFields = fields.isEmpty ? nil : fields
            rows[index].detail = ["detail", "command", "input", "arguments", "output", "result", "exitCode", "durationMs", "truncated", "files"].compactMap { key in
                fields[key].map { key == "detail" ? $0 : key + " :\n" + $0 }
            }.joined(separator: "\n\n")
            if let request = event["requestId"] as? String {
                rows[index].requestId = request
                rows[index].approval = event["interactionType"] as? String == "approval"
                if let state = event["state"] as? String, interactionStates[request] == nil || interactionStates[request] == "pending" { interactionStates[request] = state }
                rows[index].resolved = completedTurns.contains(turn) || interactionStates[request].map { $0 != "pending" } == true
            }
        }
    }
    @discardableResult func send(_ prompt: String, using gateway: GalleryModel, includingAttachments: Bool = false, explicitFiles: [GalleryArtifact] = [], requestID: String? = nil, permissionOverride: ChatPermissionMode? = nil, onWillTransmit: (() -> Void)? = nil) async -> Bool {
        guard !isPreview, let thread = selected, !sending, !running, (!prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !explicitFiles.isEmpty || (includingAttachments && (!attachments.isEmpty || quote != nil))) else { return false }
        let requestPermission = permissionOverride ?? effectivePermissionMode
        guard requestPermission == .ask || availablePermissionModes.contains(requestPermission) else { error = "Ce mode d’autorisation n’est pas proposé par cet assistant. Choisissez un autre mode dans les options du chat."; return false }
        sending = true; error = nil; defer { sending = false }
        let files = includingAttachments ? attachments : explicitFiles
        let sentQuote = includingAttachments ? quote : nil
        let composedPrompt = Self.promptWithQuote(prompt, quote: sentQuote)
        let display = files.isEmpty ? composedPrompt : composedPrompt + "\n\nPièces jointes : " + files.map(\.name).joined(separator: ", ")
        let fingerprint = [composedPrompt, model, effort, requestPermission.rawValue, files.map { $0.id.uuidString }.joined(separator: ",")].joined(separator: "\u{1f}")
        let previous = sendAttempts[thread.id]
        let request = requestID ?? (previous?.fingerprint == fingerprint ? previous!.requestID : UUID().uuidString)
        sendAttempts[thread.id] = SendAttempt(requestID: request, fingerprint: fingerprint); scheduleSave()
        if !files.isEmpty { historyFiles[thread.id, default: [:]][request] = files; scheduleSave() }
        rows.append(Row(id: "pending:\(request)", kind: "user", text: display, turn: request, messageID: request))
        running = true
        var body: [String: Any] = ["threadId": thread.id, "prompt": composedPrompt, "clientRequestId": request, "clientMessageId": request, "permissionMode": requestPermission.rawValue]
        if !model.isEmpty { body["model"] = model }
        if !effort.isEmpty { body["effort"] = effort }
        do {
            var ids: [String] = []
            for item in files { ids.append(try await gateway.attachmentID(item)) }
            body["fileIds"] = ids
            guard gateway.hasAddress else { throw GalleryModel.GalleryError.invalidAddress }
            onWillTransmit?()
            let data = try await gateway.chatRequest(["send"], body: body)
            let result = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            guard result?["proxied"] as? Bool == true else { throw ChatError.notSent }
            if result?["replay"] as? Bool == true, selected?.id == thread.id {
                let replayAfter = lastSequences[thread.id] ?? 0
                do {
                    var envelope = try await historyEnvelope(using: gateway, thread: thread.id, after: replayAfter)
                    var fullSnapshot = replayAfter == 0
                    if envelope.snapshotRequired || !envelope.complete {
                        envelope = try await historyEnvelope(using: gateway, thread: thread.id, after: 0)
                        fullSnapshot = true
                    }
                    if selected?.id == thread.id {
                        let wasLive = live; live = false
                        if fullSnapshot { applyHistorySnapshot(envelope.events[...], notifyCompletion: true) }
                        else { applyHistoryBatch(envelope.events[...], notifyCompletion: true) }
                        live = wasLive
                        reconcileReplay(requestID: request)
                    }
                } catch {
                    // The gateway already confirmed that this request is durable.
                    // Keep the optimistic row until the restarted observer retrieves it.
                    if selected?.id == thread.id { reconnect() }
                }
            }
            if includingAttachments && selected?.id == thread.id { attachments.removeAll { item in files.contains { $0.id == item.id } } }
            else if includingAttachments, var saved = threadAttachments[thread.id] {
                saved.removeAll { item in files.contains { $0.id == item.id } }; threadAttachments[thread.id] = saved
            }
            if let sentQuote {
                if selected?.id == thread.id, quote?.id == sentQuote.id { quote = nil }
                else if threadQuotes[thread.id]?.id == sentQuote.id { threadQuotes.removeValue(forKey: thread.id) }
            }
            sendAttempts.removeValue(forKey: thread.id); scheduleSave()
            AtelierTheme.confirmation()
            return true
        } catch {
            if selected?.id == thread.id {
                rows.removeAll { $0.id == "pending:\(request)" }
                if !rows.contains(where: { $0.kind == "user" && $0.messageID == request && !$0.id.hasPrefix("pending:") }) { running = false }
                self.error = error.localizedDescription
            }
            return false
        }
    }
    func reconcileReplay(requestID: String) {
        rows.removeAll { $0.id == "pending:\(requestID)" }
        running = !activeTurns.isEmpty
    }
    func isReply(_ row: Row, to messageID: String) -> Bool {
        guard let user = rows.firstIndex(where: { $0.kind == "user" && $0.messageID == messageID }),
              let response = rows.firstIndex(where: { $0.id == row.id }), response > user else { return false }
        return !rows[(user + 1)..<response].contains(where: { $0.kind == "user" })
    }
    func answer(_ row: Row, allow: Bool, using gateway: GalleryModel) async {
        guard let thread = selected, let request = row.requestId, row.approval, !row.resolved else { return }
        do {
            let data = try await gateway.chatRequest(["interaction"], body: [
                "threadId": thread.id, "requestId": request, "clientRequestId": UUID().uuidString,
                "response": ["allow": allow, "scope": "once"]
            ])
            let result = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            guard result?["proxied"] as? Bool == true else { throw ChatError.notSent }
            for _ in 0..<100 {
                if interactionStates[request] == "answered" { AtelierTheme.confirmation("approvalHaptic"); return }
                guard selected?.id == thread.id else { return }
                if interactionStates[request] == "expired" { throw ChatError.approvalUnconfirmed }
                try await Task.sleep(for: .milliseconds(100))
            }
            throw ChatError.approvalUnconfirmed
        } catch { if selected?.id == thread.id { self.error = error.localizedDescription } }
    }
    func stop(using gateway: GalleryModel) async {
        guard let selected else { return }
        pausedQueues.insert(selected.id); scheduleSave()
        do { _ = try await gateway.chatRequest(["interrupt"], body: ["threadId": selected.id, "clientRequestId": UUID().uuidString]) }
        catch { self.error = error.localizedDescription }
    }
    enum ChatError: LocalizedError {
        case notSent, approvalUnconfirmed
        var errorDescription: String? {
            if self == .approvalUnconfirmed { return "Le Mac n’a pas confirmé cette autorisation. La demande peut avoir expiré ou appartenir à un autre appareil." }
            return "Le Mac n’a pas confirmé la transmission. Le texte est conservé ; vérifiez l’historique avant de réessayer." }
    }
}
