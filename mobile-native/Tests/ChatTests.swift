import XCTest
@testable import AtelierUI

final class ChatTests: XCTestCase {
    @MainActor func testSelectedQuotePreservesUnicodeDraftAndThreadOwnership() async throws {
        let source = "Un été 🌲 et de la neige"
        let range = (source as NSString).range(of: "été 🌲")
        let passage = try XCTUnwrap(SelectableChatText.passage(in: source, range: range))
        XCTAssertEqual(passage, "été 🌲")
        XCTAssertNil(SelectableChatText.passage(in: source, range: NSRange(location: 999, length: 1)))
        let workspace = WorkspaceModel()
        workspace.gallery = GalleryModel(restoreCredentials: false)
        let a = RemoteChatModel.Thread(id: "quote-a", title: "A", provider: "codex", model: nil, projectId: nil, status: "idle")
        let b = RemoteChatModel.Thread(id: "quote-b", title: "B", provider: "codex", model: nil, projectId: nil, status: "idle")
        workspace.chat.select(a, workspace: workspace)
        workspace.draft = "Explique ceci"
        workspace.chat.quotePassage(passage, from: "response-1")
        XCTAssertEqual(workspace.draft, "Explique ceci")
        let prompt = RemoteChatModel.promptWithQuote(workspace.draft, quote: workspace.chat.quote)
        XCTAssertTrue(prompt.contains("> été 🌲"))
        XCTAssertTrue(prompt.hasSuffix("Explique ceci"))
        workspace.chat.select(b, workspace: workspace)
        XCTAssertNil(workspace.chat.quote)
        workspace.chat.select(a, workspace: workspace)
        XCTAssertEqual(workspace.chat.quote?.text, passage)
        let sent = await workspace.chat.send(workspace.draft, using: workspace.gallery, includingAttachments: true)
        XCTAssertFalse(sent)
        XCTAssertEqual(workspace.chat.quote?.text, passage)
        XCTAssertEqual(workspace.draft, "Explique ceci")
        workspace.chat.quote = nil
        workspace.chat.select(b, workspace: workspace)
        workspace.chat.select(a, workspace: workspace)
        XCTAssertNil(workspace.chat.quote)
    }
    @MainActor func testStreamingPromotesToOneDurableAnswer() {
        let chat = RemoteChatModel()
        chat.apply(["kind":"delta", "text":"Bon", "meta":["turnId":"t", "eventId":"1"]])
        chat.apply(["kind":"delta", "text":"jour", "meta":["turnId":"t", "eventId":"2"]])
        XCTAssertEqual(chat.rows.last?.text, "Bonjour")
        chat.apply(["kind":"text", "text":"Bonjour", "meta":["turnId":"t", "eventId":"3"]])
        chat.apply(["kind":"text", "text":"Bonjour", "meta":["turnId":"t", "eventId":"3"]])
        chat.apply(["kind":"done"])
        XCTAssertEqual(chat.rows.count, 1)
        XCTAssertFalse(chat.running)
    }
    @MainActor func testCompletedHistoryRejectsBufferedStream() {
        let chat = RemoteChatModel()
        chat.apply(["kind":"text","text":"Final","meta":["turnId":"t","eventId":"final"]])
        chat.apply(["kind":"done","meta":["turnId":"t","eventId":"done"]])
        chat.apply(["kind":"started","meta":["turnId":"t","eventId":"start"]])
        chat.apply(["kind":"delta","text":"Old","meta":["turnId":"t","eventId":"old"]])
        XCTAssertEqual(chat.rows.map(\.text), ["Final"])
        XCTAssertFalse(chat.running)
    }
    @MainActor func testSnapshotFinalCleansBufferedDeltaEvenWhenDuplicate() {
        let chat = RemoteChatModel()
        let final: [String: Any] = ["kind":"text","text":"Final","meta":["turnId":"t","eventId":"final"]]
        chat.apply(final)
        chat.apply(["kind":"delta","text":"Old","meta":["turnId":"t","eventId":"old"]])
        chat.apply(final)
        chat.apply(["kind":"done","meta":["turnId":"t","eventId":"done"]])
        XCTAssertEqual(chat.rows.map(\.text), ["Final"])
        XCTAssertFalse(chat.running)
    }
    @MainActor func testToolAndApprovalDetailsRemainVisible() {
        let chat = RemoteChatModel()
        chat.apply(["kind":"interaction", "title":"Lecture", "detail":"cat file.json", "interactionType":"approval", "requestId":"r", "state":"pending",
                    "meta":["turnId":"t","eventId":"approval"]])
        XCTAssertEqual(chat.rows.first?.requestId,"r")
        XCTAssertEqual(chat.rows.first?.detail,"cat file.json")
        XCTAssertEqual(chat.rows.first?.resolved,false)
        XCTAssertEqual(chat.rows.first?.approval,true)
        chat.apply(["kind":"interaction", "requestId":"r", "state":"answered", "meta":["turnId":"t","eventId":"answered"]])
        XCTAssertEqual(chat.rows.count,1)
        XCTAssertEqual(chat.rows.first?.resolved,true)
        chat.apply(["kind":"done","meta":["turnId":"t","eventId":"done"]])
        XCTAssertEqual(chat.rows.first?.resolved,true)
        chat.apply(["kind":"tool", "name":"web_search", "input":["query":"test"], "meta":["eventId":"tool","itemId":"i"]])
        XCTAssertTrue(chat.rows.last?.detail.contains("query") == true)
    }
    @MainActor func testThreadSwitchPreservesSeparateDrafts() throws {
        let model = WorkspaceModel()
        let a = RemoteChatModel.Thread(id:"a",title:"A",provider:"codex",model:"m",projectId:nil,status:"idle")
        let b = RemoteChatModel.Thread(id:"b",title:"B",provider:"codex",model:"m",projectId:nil,status:"idle")
        model.chat.select(a,workspace:model); model.draft = "draft A"
        model.chat.select(b,workspace:model); model.draft = "draft B"
        model.chat.select(a,workspace:model)
        XCTAssertEqual(model.draft,"draft A")
        XCTAssertTrue(model.chat.rows.isEmpty)
        model.chat.rows.append(.init(id:"row",kind:"text",text:"History",turn:"t"))
        model.chat.select(a,workspace:model)
        XCTAssertEqual(model.chat.rows.first?.text,"History")
    }
    @MainActor func testToolUpdatesReplaceMatchingItem() {
        let chat = RemoteChatModel()
        chat.apply(["kind":"tool_update","text":"start","meta":["turnId":"t","eventId":"1","itemId":"tool"]])
        chat.apply(["kind":"tool_update","text":"done","meta":["turnId":"t","eventId":"2","itemId":"tool"]])
        XCTAssertEqual(chat.rows.count,1)
        XCTAssertEqual(chat.rows.first?.text,"done")
    }
    @MainActor func testSessionSurvivesNewWorkspaceWithIndependentDraftsAndPhoto() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = ChatResumeStore(directory: directory)
        let first = WorkspaceModel(resumeStore: store)
        first.gallery = GalleryModel(restoreCredentials: false)
        let a = RemoteChatModel.Thread(id: "a", title: "A", provider: "codex", model: nil, projectId: nil, status: "idle")
        let b = RemoteChatModel.Thread(id: "b", title: "B", provider: "codex", model: nil, projectId: nil, status: "idle")
        first.chat.select(b, workspace: first); first.draft = "B conservé"
        first.chat.select(a, workspace: first); first.draft = "Mon brouillon 🌲"
        first.chat.model = "gpt-6-astra"; first.chat.effort = "high"
        first.chat.quotePassage("Albédo", from: "source")
        let photo = Data("photo fixture".utf8)
        first.chat.attach(GalleryArtifact(name: "photo.png", data: photo))
        first.chat.attach(GalleryArtifact(name: "duplicate.png", data: photo))
        first.chat.rememberPosition(rowID: nil, followsTail: false, offsetY: 425, contentHeight: 1600)
        await first.chat.flushResume()
        let second = WorkspaceModel(resumeStore: store)
        second.gallery = GalleryModel(restoreCredentials: false)
        await second.chat.restore(workspace: second)
        XCTAssertEqual(second.chat.selected?.id, "a")
        XCTAssertEqual(second.draft, "Mon brouillon 🌲")
        XCTAssertEqual(second.chat.quote?.text, "Albédo")
        XCTAssertEqual(second.chat.attachments.first?.data, photo)
        XCTAssertEqual(second.chat.model, "gpt-6-astra")
        XCTAssertEqual(second.chat.effort, "high")
        XCTAssertEqual(second.chat.bookmarks["a"]?.offsetY, 425)
        XCTAssertEqual(second.chat.bookmarks["a"]?.followsTail, false)
        let blobs = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil).filter { $0.pathExtension == "bin" }
        XCTAssertEqual(blobs.count, 1)
        let metadata = try String(contentsOf: directory.appendingPathComponent("session.json"), encoding: .utf8)
        XCTAssertFalse(metadata.contains(photo.base64EncodedString()))
        second.chat.select(b, workspace: second)
        XCTAssertEqual(second.draft, "B conservé")
        XCTAssertTrue(second.chat.attachments.isEmpty)
    }

    @MainActor func testUnassignedAttachmentPersistsAndFailedRestoreCannotOverwriteSession() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = ChatResumeStore(directory: directory)
        let workspace = WorkspaceModel(resumeStore: store)
        workspace.chat.attach(GalleryArtifact(name: "before-chat.png", data: Data([1,2,3])))
        await workspace.chat.flushResume()
        let saved = try await store.load()
        XCTAssertEqual(saved?.pendingAttachments?.first?.data, Data([1,2,3]))
        let session = directory.appendingPathComponent("session.json")
        let original = try Data(contentsOf: session)
        let blobs = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil).filter { $0.pathExtension == "bin" }
        try FileManager.default.removeItem(at: XCTUnwrap(blobs.first))
        let next = WorkspaceModel(resumeStore: store)
        await next.chat.restore(workspace: next)
        XCTAssertNotNil(next.chat.error)
        await next.chat.flushResume()
        XCTAssertEqual(try Data(contentsOf: session), original)
    }

    @MainActor func testRevisionAndRetryUsePrecedingUserMessage() {
        let workspace = WorkspaceModel()
        workspace.chat.select(.init(id: "actions", title: "Actions", provider: "codex", model: nil, projectId: nil, status: "idle"), workspace: workspace)
        let first = RemoteChatModel.Row(id: "u1", kind: "user", text: "Question A", turn: "1")
        let answer = RemoteChatModel.Row(id: "a1", kind: "text", text: "Réponse A", turn: "1")
        let later = RemoteChatModel.Row(id: "u2", kind: "user", text: "Question B", turn: "2")
        workspace.chat.rows = [first, answer, later]
        XCTAssertEqual(workspace.chat.retryPrompt(for: answer), "Question A")
        workspace.draft = "Mon brouillon";
        XCTAssertEqual(workspace.chat.prepareRevision(first)?.prompt, "Question A")
        XCTAssertEqual(workspace.draft, "Mon brouillon")
        XCTAssertEqual(workspace.chat.rows.count, 3)
        workspace.chat.running = true
        XCTAssertNil(workspace.chat.prepareRevision(later))
        XCTAssertEqual(workspace.draft, "Mon brouillon")
    }

    @MainActor func testAcknowledgedAttachmentSurvivesHistoryReplayAndRevision() {
        let workspace = WorkspaceModel()
        workspace.chat.select(.init(id: "files", title: "Files", provider: "codex", model: nil, projectId: nil, status: "idle"), workspace: workspace)
        let image = GalleryArtifact(name: "plot.png", data: Data([1,2,3]))
        workspace.chat.historyFiles["files"] = ["message": [image]]
        workspace.chat.apply(["kind": "user", "text": "Analyse ceci\n\nPièces jointes : plot.png", "meta": ["eventId": "event", "messageId": "message", "turnId": "turn"]])
        let row = workspace.chat.rows[0]
        XCTAssertEqual(workspace.chat.files(for: row).first?.data, image.data)
        let draftFile = GalleryArtifact(name: "draft.txt", data: Data("draft".utf8))
        workspace.chat.attach(draftFile)
        workspace.chat.quotePassage("Citation préparée", from: "other")
        workspace.draft = "Brouillon indépendant"
        let revision = workspace.chat.prepareRevision(row)
        XCTAssertEqual(revision?.prompt, "Analyse ceci")
        XCTAssertEqual(revision?.files.map(\.id), [image.id])
        XCTAssertEqual(workspace.draft, "Brouillon indépendant")
        XCTAssertEqual(workspace.chat.attachments.map(\.id), [draftFile.id])
        XCTAssertEqual(workspace.chat.quote?.text, "Citation préparée")
    }

    @MainActor func testStatusDistinguishesReconnectSendAndApproval() {
        let chat = RemoteChatModel()
        chat.live = true; chat.connection = .live
        XCTAssertEqual(chat.statusLabel, "En direct")
        chat.sending = true
        XCTAssertEqual(chat.statusLabel, "Envoi…")
        chat.sending = false; chat.running = true
        XCTAssertEqual(chat.statusLabel, "Réponse en cours")
        chat.apply(["kind": "interaction", "requestId": "r", "state": "pending", "title": "Permission", "meta": ["turnId": "t"]])
        XCTAssertEqual(chat.statusLabel, "Accord nécessaire")
        chat.connection = .reconnecting
        XCTAssertEqual(chat.statusLabel, "Reconnexion…")
        chat.connection = .associationRequired
        XCTAssertEqual(chat.statusLabel, "Associer le Mac")
    }

    @MainActor func testToolLifecyclePreservesIdentityNameAndFailure() throws {
        let chat = RemoteChatModel()
        chat.apply(["kind":"started", "meta":["turnId":"t"]])
        chat.apply(["kind":"tool_update", "id":"call", "name":"web_search", "status":"inProgress", "input":["query":"glacier"], "meta":["turnId":"t","eventId":"start"]])
        let identity = try XCTUnwrap(chat.rows.first?.id)
        XCTAssertTrue(ChatActivityPresentation(row: chat.rows[0], turnRunning: chat.isTurnRunning("t")).inProgress)
        chat.apply(["kind":"tool_update", "id":"call", "status":"failed", "output":"Network unavailable", "meta":["turnId":"t","eventId":"end"]])
        XCTAssertEqual(chat.rows.count, 1)
        XCTAssertEqual(chat.rows[0].id, identity)
        XCTAssertEqual(chat.rows[0].toolName, "web_search")
        XCTAssertEqual(ChatActivityPresentation(row: chat.rows[0], turnRunning: true).state, "Échec")
        XCTAssertTrue(chat.rows[0].detail.contains("Network unavailable"))
        let shortResult = RemoteChatModel.Row(id: "short", kind: "tool", text: "Permission refusée", turn: "t", toolName: "read_file", toolStatus: "failed")
        XCTAssertTrue(ChatActivityPresentation(row: shortResult, turnRunning: true).hasDetails)
        let interrupted = RemoteChatModel.Row(id: "stop", kind: "tool", text: "Arrêt", turn: "t", toolName: "web_search", toolStatus: "interrupted")
        XCTAssertTrue(ChatActivityPresentation(row: interrupted, turnRunning: true).interrupted)
    }
    @MainActor func testActivityIdentitySurvivesStreamingPromotionAndTextBoundary() {
        let chat = RemoteChatModel()
        chat.apply(["kind":"thinking_delta", "text":"Examiner", "meta":["turnId":"t"]])
        let id = ChatTimelineItem.group(chat.rows)[0].id
        chat.activityDisclosure[id] = true
        chat.apply(["kind":"thinking", "text":"Examiner les sources", "meta":["turnId":"t","eventId":"thought"]])
        chat.apply(["kind":"tool", "name":"read_file", "meta":["turnId":"t","itemId":"read"]])
        XCTAssertEqual(ChatTimelineItem.group(chat.rows).count, 1)
        XCTAssertEqual(ChatTimelineItem.group(chat.rows)[0].id, id)
        XCTAssertEqual(chat.activityDisclosure[id], true)
        chat.apply(["kind":"text", "text":"Un résultat intermédiaire", "meta":["turnId":"t","eventId":"comment"]])
        chat.apply(["kind":"tool", "name":"exec_command", "meta":["turnId":"t","itemId":"exec"]])
        XCTAssertEqual(ChatTimelineItem.group(chat.rows).map(\.isActivity), [true, false, true])
    }
    @MainActor func testDoneEndsBufferedStreamingWithoutInventingToolSuccess() {
        let chat = RemoteChatModel()
        chat.apply(["kind":"thinking_delta", "text":"Lecture", "meta":["turnId":"a"]])
        chat.apply(["kind":"tool_update", "name":"read_file", "status":"inProgress", "meta":["turnId":"a","itemId":"read"]])
        chat.apply(["kind":"delta", "text":"Réponse", "meta":["turnId":"a"]])
        chat.apply(["kind":"started", "meta":["turnId":"b"]])
        chat.apply(["kind":"done", "meta":["turnId":"a"]])
        XCTAssertTrue(chat.running)
        XCTAssertFalse(chat.isTurnRunning("a"))
        XCTAssertTrue(chat.isTurnRunning("b"))
        XCTAssertFalse(chat.rows.contains(where: \.isStreaming))
        let presentation = ChatActivityPresentation(row: chat.rows[1], turnRunning: false)
        XCTAssertFalse(presentation.completed)
        XCTAssertEqual(presentation.state, "Activité terminée")
    }

    @MainActor func testPermissionChoiceIsPerConversationAndRestoresWithoutChangingLegacyDefaults() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = ChatResumeStore(directory: directory)
        let workspace = WorkspaceModel(resumeStore: store)
        let a = RemoteChatModel.Thread(id: "permission-a", title: "A", provider: "codex", model: nil, projectId: nil, status: "idle")
        let b = RemoteChatModel.Thread(id: "permission-b", title: "B", provider: "codex", model: nil, projectId: nil, status: "idle")
        workspace.chat.select(a, workspace: workspace)
        XCTAssertEqual(workspace.chat.permissionMode, .ask)
        workspace.chat.permissionMode = .full
        workspace.chat.select(b, workspace: workspace)
        XCTAssertEqual(workspace.chat.permissionMode, .ask)
        workspace.chat.permissionMode = .edits
        workspace.chat.select(a, workspace: workspace)
        XCTAssertEqual(workspace.chat.permissionMode, .full)
        await workspace.chat.flushResume()
        let restored = WorkspaceModel(resumeStore: store)
        await restored.chat.restore(workspace: restored)
        XCTAssertEqual(restored.chat.permissionMode, .full)
        restored.chat.select(b, workspace: restored)
        XCTAssertEqual(restored.chat.permissionMode, .edits)
        let legacy = try JSONDecoder().decode(ChatSettings.self, from: Data(#"{"model":"m","effort":"high"}"#.utf8))
        XCTAssertNil(legacy.permissionMode)
    }
    @MainActor func testPermissionModesUseProviderCapabilities() throws {
        let chat = RemoteChatModel()
        chat.selected = .init(id: "permission-caps", title: "Caps", provider: "codex", model: nil, projectId: nil, status: "idle")
        let data = Data(#"{"id":"codex","label":"Codex","models":[],"defaultModel":"","efforts":[],"ok":true,"capabilities":{"permissionModes":["default","acceptEdits","plan","bypassPermissions"]}}"#.utf8)
        chat.providers = [try JSONDecoder().decode(RemoteChatModel.Provider.self, from: data)]
        XCTAssertEqual(chat.availablePermissionModes, [.ask, .edits, .full])
        chat.providers = []
        XCTAssertTrue(chat.availablePermissionModes.isEmpty)
    }
    @MainActor func testQuietTranscriptKeepsOnlyFinalActionsAcrossLegacyUserBoundaries() {
        let rows: [RemoteChatModel.Row] = [
            .init(id: "u1", kind: "user", text: "Question", turn: "legacy"),
            .init(id: "comment", kind: "text", text: "Je vérifie", turn: "legacy"),
            .init(id: "tool", kind: "tool", text: "Lecture", turn: "legacy"),
            .init(id: "final", kind: "text", text: "Résultat", turn: "legacy"),
            .init(id: "u2", kind: "user", text: "Suite", turn: "legacy"),
            .init(id: "answer2", kind: "text", text: "Autre réponse", turn: "legacy")
        ]
        XCTAssertEqual(ChatTimelineItem.finalTextIDs(in: rows), ["final", "answer2"])
        XCTAssertEqual(ChatTimelineItem.group(rows).flatMap(\.rows).map(\.id), rows.map(\.id))
    }

}
