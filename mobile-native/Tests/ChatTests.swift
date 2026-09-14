import XCTest
@testable import AtelierUI

final class ChatTests: XCTestCase {
    @MainActor func testUploadStageRestartKeepsRetryStateWithoutPhantomRunningMessage() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = ChatResumeStore(directory: directory)
        let first = WorkspaceModel(resumeStore: store)
        let thread = RemoteChatModel.Thread(id: "upload", title: "Upload", provider: "codex", model: nil, projectId: nil, status: "idle")
        first.chat.select(thread, workspace: first)
        first.draft = "Analyse cette photo"
        first.chat.updateDraft(first.draft)
        let photo = GalleryArtifact(name: "photo.png", data: Data([1, 2, 3]))
        first.chat.attach(photo)
        first.chat.sendAttempts[thread.id] = SendAttempt(requestID: "retry-id", fingerprint: "same-prompt")
        first.chat.prepared = [PreparedChatMessage(threadID: thread.id, text: "Question suivante", files: [], model: "", effort: "")]
        first.chat.rows.append(.init(id: "pending:retry-id", kind: "user", text: first.draft, turn: "retry-id", messageID: "retry-id"))
        first.chat.sending = true; first.chat.running = true
        await first.chat.flushResume()
        let saved = try await store.load()
        XCTAssertTrue(saved?.transcript?.rows.isEmpty == true)
        XCTAssertEqual(saved?.transcript?.running, false)
        let second = WorkspaceModel(resumeStore: store)
        await second.chat.restore(workspace: second)
        XCTAssertTrue(second.chat.rows.isEmpty)
        XCTAssertFalse(second.chat.running)
        XCTAssertFalse(second.chat.sending)
        XCTAssertEqual(second.draft, "Analyse cette photo")
        XCTAssertEqual(second.chat.attachments.first?.data, photo.data)
        XCTAssertEqual(second.chat.sendAttempts[thread.id]?.requestID, "retry-id")
        XCTAssertEqual(second.chat.prepared.first?.text, "Question suivante")
    }

    @MainActor func testTranscriptRestoresOfflineAndResumesStreamingWithoutReplayDuplicates() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = ChatResumeStore(directory: directory)
        let first = WorkspaceModel(resumeStore: store)
        let thread = RemoteChatModel.Thread(id: "transcript", title: "Transcript", provider: "codex", model: nil, projectId: nil, status: "running")
        first.chat.select(thread, workspace: first)
        let user: [String: Any] = ["kind": "user", "text": "Question", "meta": ["eventId": "u", "turnId": "t", "messageId": "m"]]
        let delta: [String: Any] = ["kind": "delta", "text": "Bon", "meta": ["eventId": "d1", "turnId": "t"]]
        first.chat.apply(user); first.chat.apply(delta)
        let streamID = try XCTUnwrap(first.chat.rows.last?.id)
        await first.chat.flushResume()
        let second = WorkspaceModel(resumeStore: store)
        await second.chat.restore(workspace: second)
        XCTAssertEqual(second.chat.rows.map(\.text), ["Question", "Bon"])
        XCTAssertEqual(second.chat.rows.last?.id, streamID)
        XCTAssertTrue(second.chat.isTurnRunning("t"))
        XCTAssertTrue(second.chat.running)
        XCTAssertTrue(second.chat.rows.last?.isStreaming == true)
        second.chat.apply(user); second.chat.apply(delta)
        XCTAssertEqual(second.chat.rows.map(\.text), ["Question", "Bon"])
        second.chat.apply(["kind": "delta", "text": "jour", "meta": ["eventId": "d2", "turnId": "t"]])
        XCTAssertEqual(second.chat.rows.last?.text, "Bonjour")
        XCTAssertEqual(second.chat.rows.last?.id, streamID)
        second.chat.apply(["kind": "text", "text": "Bonjour", "meta": ["eventId": "final", "turnId": "t"]])
        second.chat.apply(["kind": "done", "meta": ["eventId": "done", "turnId": "t"]])
        await second.chat.flushResume()
        let third = WorkspaceModel(resumeStore: store)
        await third.chat.restore(workspace: third)
        third.chat.apply(["kind": "delta", "text": "stale", "meta": ["eventId": "late", "turnId": "t"]])
        third.chat.apply(["kind": "started", "meta": ["eventId": "start", "turnId": "t"]])
        XCTAssertEqual(third.chat.rows.map(\.text), ["Question", "Bonjour"])
        XCTAssertFalse(third.chat.running)
        XCTAssertFalse(third.chat.rows.last?.isStreaming == true)
    }

    @MainActor func testTranscriptCacheSurvivesConversationListAndIsolatesThreads() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = ChatResumeStore(directory: directory)
        let first = WorkspaceModel(resumeStore: store)
        let a = RemoteChatModel.Thread(id: "cache-a", title: "A", provider: "codex", model: nil, projectId: nil, status: "idle")
        let b = RemoteChatModel.Thread(id: "cache-b", title: "B", provider: "codex", model: nil, projectId: nil, status: "idle")
        first.chat.select(a, workspace: first)
        first.chat.apply(["kind": "interaction", "text": "Autoriser", "requestId": "request", "state": "accepted", "interactionType": "approval", "meta": ["eventId": "approval", "turnId": "t"]])
        first.chat.showConversations(workspace: first)
        await first.chat.flushResume()
        let second = WorkspaceModel(resumeStore: store)
        await second.chat.restore(workspace: second)
        XCTAssertNil(second.chat.selected)
        second.chat.select(a, workspace: second)
        XCTAssertEqual(second.chat.rows.count, 1)
        XCTAssertTrue(second.chat.rows[0].resolved)
        second.chat.apply(["kind": "interaction", "text": "Autoriser", "requestId": "request", "state": "pending", "interactionType": "approval", "meta": ["eventId": "approval-update", "turnId": "t"]])
        XCTAssertTrue(second.chat.rows[0].resolved)
        second.chat.select(b, workspace: second)
        XCTAssertTrue(second.chat.rows.isEmpty)
        second.chat.select(a, workspace: second)
        XCTAssertEqual(second.chat.rows.count, 1)
        XCTAssertTrue(second.chat.rows[0].resolved)
    }

    @MainActor func testMissingTranscriptInvalidatesItsSequenceWatermark() {
        let workspace = WorkspaceModel()
        let a = RemoteChatModel.Thread(id: "watermark-a", title: "A", provider: "codex", model: nil, projectId: nil, status: "idle")
        let b = RemoteChatModel.Thread(id: "watermark-b", title: "B", provider: "codex", model: nil, projectId: nil, status: "idle")
        let c = RemoteChatModel.Thread(id: "watermark-c", title: "C", provider: "codex", model: nil, projectId: nil, status: "idle")
        workspace.chat.select(a, workspace: workspace)
        workspace.chat.apply(["kind": "text", "text": "A", "meta": ["eventId": "a", "turnId": "a", "threadId": a.id, "sequence": 9]])
        XCTAssertEqual(workspace.chat.lastSequences[a.id], 9)

        workspace.chat.select(b, workspace: workspace)
        workspace.chat.select(c, workspace: workspace)
        workspace.chat.select(a, workspace: workspace)

        XCTAssertTrue(workspace.chat.rows.isEmpty)
        XCTAssertNil(workspace.chat.lastSequences[a.id])
    }

    @MainActor func testLegacyResumeWithoutTranscriptStillRestoresDraft() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = ChatResumeStore(directory: directory)
        let thread = RemoteChatModel.Thread(id: "legacy", title: "Legacy", provider: "codex", model: nil, projectId: nil, status: "idle")
        try await store.save(ChatResumeSnapshot(selected: thread, drafts: [thread.id: "Brouillon ancien"]))
        let workspace = WorkspaceModel(resumeStore: store)
        await workspace.chat.restore(workspace: workspace)
        XCTAssertEqual(workspace.chat.selected?.id, thread.id)
        XCTAssertEqual(workspace.draft, "Brouillon ancien")
        XCTAssertTrue(workspace.chat.rows.isEmpty)
        XCTAssertNil(workspace.chat.error)
    }

    @MainActor func testWebQuoteSurvivesSelectionClearedWhileMenuDismisses() async {
        let view = QuotingWebView()
        let received = expectation(description: "Quoted after menu dismissal")
        let passage = "un été 🌲"
        view.onQuote = { value in XCTAssertEqual(value, passage); received.fulfill() }
        view.selectedPassage = ""
        view.quoteSelection(fallback: passage)
        await fulfillment(of: [received], timeout: 2)
    }

    @MainActor func testAnnotationSelectionPreservesOccurrenceAfterMenuDismissal() async {
        let view = QuotingWebView()
        let received = expectation(description: "Annotation callback")
        view.onAnnotate = { value in
            XCTAssertEqual(value.text, "neige"); XCTAssertEqual(value.occurrence, 1); XCTAssertEqual(value.occurrences, 2)
            received.fulfill()
        }
        view.onQuote = { _ in XCTFail("Annoter must not add a direct quote") }
        view.quoteSelection(fallback: "neige", detail: .init(text: "neige", occurrence: 1, occurrences: 2), annotate: true)
        await fulfillment(of: [received], timeout: 2)
    }
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
    @MainActor func testToolDetailsRetainCommandWhenResultArrives() throws {
        let chat = RemoteChatModel()
        chat.apply(["kind":"tool_update", "id":"shell", "name":"Bash", "detail":"rg albedo notes.md", "input":["command":"rg albedo notes.md"], "status":"running", "meta":["turnId":"t", "eventId":"s1"]])
        chat.apply(["kind":"tool_update", "id":"shell", "name":"Bash", "output":"42: albedo", "exitCode":0, "status":"completed", "meta":["turnId":"t", "eventId":"s2"]])
        let row = try XCTUnwrap(chat.rows.first)
        XCTAssertEqual(ChatActivityPresentation(row: row, turnRunning: true).summary, "rg albedo notes.md")
        XCTAssertTrue(row.detail.contains("42: albedo"))
        XCTAssertTrue(row.detail.contains("rg albedo notes.md"))
        let restored = try JSONDecoder().decode(RemoteChatModel.Row.self, from: JSONEncoder().encode(row))
        XCTAssertEqual(restored.toolFields, row.toolFields)
        var legacy = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(row)) as? [String: Any])
        legacy.removeValue(forKey: "toolFields")
        XCTAssertNil(try JSONDecoder().decode(RemoteChatModel.Row.self, from: JSONSerialization.data(withJSONObject: legacy)).toolFields)
    }
    @MainActor func testActivityUsesRealQueryAndHidesEmptyThinkingMarkers() {
        let chat = RemoteChatModel()
        chat.apply(["kind":"tool", "name":"__thinking", "meta":["turnId":"t", "eventId":"marker"]])
        chat.apply(["kind":"tool_update", "id":"search", "name":"web_search", "input":["query":"glacier albedo"], "meta":["turnId":"t", "eventId":"search"]])
        let items = ChatTimelineItem.group(chat.rows)
        XCTAssertEqual(items.count, 1)
        XCTAssertEqual(items[0].rows.count, 1)
        XCTAssertEqual(ChatActivityPresentation(row: items[0].rows[0], turnRunning: true).summary, "Recherche · glacier albedo")
        let thought = RemoteChatModel.Row(id: "thought", kind: "thinking", text: "Vérifier les périodes", turn: "t")
        XCTAssertEqual(ChatTimelineItem.group([thought])[0].rows[0].text, thought.text)
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

    @MainActor func testGlobalPermissionChoicePersistsAcrossChatsAndRestart() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = ChatResumeStore(directory: directory)
        let workspace = WorkspaceModel(resumeStore: store)
        let a = RemoteChatModel.Thread(id: "permission-a", title: "A", provider: "codex", model: nil, projectId: nil, status: "idle")
        let b = RemoteChatModel.Thread(id: "permission-b", title: "B", provider: "codex", model: nil, projectId: nil, status: "idle")
        workspace.chat.settings[a.id] = ChatSettings(model: "m", effort: "high", permissionMode: "default")
        workspace.chat.select(a, workspace: workspace)
        XCTAssertEqual(workspace.chat.permissionMode, .full)
        workspace.chat.permissionMode = .edits
        workspace.chat.select(b, workspace: workspace)
        XCTAssertEqual(workspace.chat.permissionMode, .edits)
        await workspace.chat.flushResume()
        let restored = WorkspaceModel(resumeStore: store)
        await restored.chat.restore(workspace: restored)
        XCTAssertEqual(restored.chat.permissionMode, .edits)
        restored.chat.select(a, workspace: restored)
        XCTAssertEqual(restored.chat.permissionMode, .edits)
    }
    @MainActor func testLegacySessionUsesRequestedFullAccessDefault() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = ChatResumeStore(directory: directory)
        let thread = RemoteChatModel.Thread(id: "legacy", title: "Legacy", provider: "codex", model: nil, projectId: nil, status: "idle")
        try await store.save(ChatResumeSnapshot(selected: thread, settings: [thread.id: ChatSettings(model: "m", effort: "", permissionMode: "default")]))
        let workspace = WorkspaceModel(resumeStore: store)
        await workspace.chat.restore(workspace: workspace)
        XCTAssertEqual(workspace.chat.permissionMode, .full)
    }
    @MainActor func testProviderWithoutPermissionModesPreservesGlobalFullAccess() {
        let chat = RemoteChatModel()
        chat.providers = [.init(id: "custom", label: "Custom", models: [], defaultModel: "", efforts: [], ok: true, modelLabels: nil)]
        chat.selected = .init(id: "custom-chat", title: "Custom", provider: "custom", model: nil, projectId: nil, status: "idle")
        XCTAssertEqual(chat.effectivePermissionMode, .ask)
        XCTAssertEqual(chat.permissionMode, .full)
        chat.providers.append(.init(id: "codex", label: "Codex", models: [], defaultModel: "", efforts: [], ok: true, modelLabels: nil, capabilities: .init(permissionModes: ["bypassPermissions"])))
        chat.selected = .init(id: "codex-chat", title: "Codex", provider: "codex", model: nil, projectId: nil, status: "idle")
        XCTAssertEqual(chat.effectivePermissionMode, .full)
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

    @MainActor func testHistoryDeltaTracksHighestSequenceAndSurvivesRestart() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = ChatResumeStore(directory: directory)
        let first = WorkspaceModel(resumeStore: store)
        let thread = RemoteChatModel.Thread(id: "delta", title: "Delta", provider: "codex", model: nil, projectId: nil, status: "idle")
        first.chat.select(thread, workspace: first)
        first.chat.apply(["kind": "user", "text": "Question", "meta": ["eventId": "u", "turnId": "t", "threadId": thread.id, "sequence": 4]])
        first.chat.apply(["kind": "text", "text": "Réponse", "meta": ["eventId": "a", "turnId": "t", "threadId": thread.id, "sequence": 9]])
        // A replayed duplicate must never lower the watermark.
        first.chat.apply(["kind": "delta", "text": "rejeu", "meta": ["eventId": "u", "turnId": "t", "threadId": thread.id, "sequence": 4]])
        XCTAssertEqual(first.chat.lastSequences[thread.id], 9)
        await first.chat.flushResume()
        let second = WorkspaceModel(resumeStore: store)
        await second.chat.restore(workspace: second)
        XCTAssertEqual(second.chat.lastSequences[thread.id], 9)
        XCTAssertEqual(second.chat.rows.map(\.text), ["Question", "Réponse"])
    }

    @MainActor func testResumeAnnouncesLiveBeforeHistoryAndAsksOnlyForTheDelta() async throws {
        HistoryDeltaProtocol.state.reset()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [HistoryDeltaProtocol.self]
        let gateway = GalleryModel(address: URL(string: "https://delta.invalid")!, token: "test", session: URLSession(configuration: configuration))
        let workspace = WorkspaceModel()
        workspace.gallery = gateway
        let thread = RemoteChatModel.Thread(id: "delta-thread", title: "Delta", provider: "codex", model: nil, projectId: nil, status: "idle")
        workspace.chat.select(thread, workspace: workspace)
        workspace.chat.apply(["kind": "user", "text": "Question", "meta": ["eventId": "u", "turnId": "t", "threadId": thread.id, "sequence": 7]])
        let task = Task { await workspace.chat.observe(using: gateway) }
        defer { task.cancel() }
        let historyAsked = XCTestExpectation(description: "history requested")
        HistoryDeltaProtocol.state.hold(historyAsked)
        let wait = await XCTWaiter.fulfillment(of: [historyAsked], timeout: 8)
        XCTAssertEqual(wait, .completed)
        // The socket is already open, so the conversation is live while the replay pends.
        XCTAssertTrue(workspace.chat.live)
        XCTAssertEqual(workspace.chat.connectionLabel, "Mac connecté")
        XCTAssertEqual(HistoryDeltaProtocol.state.sequenceQueries, ["7"])
        XCTAssertEqual(HistoryDeltaProtocol.state.liveTimeout, GalleryModel.chatStreamIdleTimeout)
        XCTAssertEqual(HistoryDeltaProtocol.state.liveCachePolicy, .reloadIgnoringLocalCacheData)
        XCTAssertEqual(HistoryDeltaProtocol.state.liveCacheControl, "no-cache")
        HistoryDeltaProtocol.state.release()
        for _ in 0..<200 {
            if workspace.chat.lastSequences[thread.id] == 11 { break }
            try await Task.sleep(for: .milliseconds(25))
        }
        XCTAssertEqual(workspace.chat.lastSequences[thread.id], 11)
        XCTAssertEqual(workspace.chat.rows.map(\.text), ["Question", "Réponse finale"])
        task.cancel()
    }

    @MainActor func testDeltaTheGatewayCannotServeFallsBackToAFullSnapshot() async throws {
        HistoryDeltaProtocol.state.reset(snapshotRequired: true)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [HistoryDeltaProtocol.self]
        let gateway = GalleryModel(address: URL(string: "https://delta.invalid")!, token: "test", session: URLSession(configuration: configuration))
        let workspace = WorkspaceModel()
        workspace.gallery = gateway
        let thread = RemoteChatModel.Thread(id: "delta-thread", title: "Delta", provider: "codex", model: nil, projectId: nil, status: "idle")
        workspace.chat.select(thread, workspace: workspace)
        workspace.chat.apply(["kind": "user", "text": "Question", "meta": ["eventId": "u", "turnId": "t", "threadId": thread.id, "sequence": 7]])
        let task = Task { await workspace.chat.observe(using: gateway) }
        defer { task.cancel() }
        let historyAsked = XCTestExpectation(description: "history requested")
        HistoryDeltaProtocol.state.hold(historyAsked)
        let wait = await XCTWaiter.fulfillment(of: [historyAsked], timeout: 8)
        XCTAssertEqual(wait, .completed)
        HistoryDeltaProtocol.state.release()
        for _ in 0..<200 {
            if workspace.chat.lastSequences[thread.id] == 11 { break }
            try await Task.sleep(for: .milliseconds(25))
        }
        // The refused delta is retried without a cursor, i.e. as a full snapshot.
        XCTAssertEqual(HistoryDeltaProtocol.state.sequenceQueries, ["7", nil])
        XCTAssertEqual(workspace.chat.lastSequences[thread.id], 11)
        XCTAssertEqual(workspace.chat.rows.map(\.text), ["Réponse finale"])
        task.cancel()
    }

    @MainActor func testFullSnapshotReplacesStaleRowsAndPreservesUnsyncedPendingMessage() {
        let workspace = WorkspaceModel()
        let thread = RemoteChatModel.Thread(id: "snapshot", title: "Snapshot", provider: "codex", model: nil, projectId: nil, status: "idle")
        workspace.chat.select(thread, workspace: workspace)
        workspace.chat.apply(["kind": "text", "text": "Ancienne ligne", "meta": ["eventId": "old", "turnId": "old", "threadId": thread.id, "sequence": 4]])
        workspace.chat.rows.append(.init(id: "pending:local", kind: "user", text: "Envoi local", turn: "local", messageID: "local"))
        workspace.chat.running = true

        let snapshot: [[String: Any]] = [
            ["kind": "text", "text": "État actuel", "meta": ["eventId": "new", "turnId": "new", "threadId": thread.id, "sequence": 8]]
        ]
        workspace.chat.applyHistorySnapshot(snapshot[...])

        XCTAssertEqual(workspace.chat.rows.map(\.text), ["État actuel", "Envoi local"])
        XCTAssertEqual(workspace.chat.lastSequences[thread.id], 8)
        XCTAssertTrue(workspace.chat.running)
        XCTAssertTrue(workspace.chat.isTurnRunning("local"))
    }

    @MainActor func testFullSnapshotAbsorbsDurablePendingMessageAndEndsCompletedTurn() {
        let workspace = WorkspaceModel()
        let thread = RemoteChatModel.Thread(id: "durable-snapshot", title: "Snapshot", provider: "codex", model: nil, projectId: nil, status: "running")
        workspace.chat.select(thread, workspace: workspace)
        workspace.chat.rows.append(.init(id: "pending:request", kind: "user", text: "Question", turn: "request", messageID: "request"))
        workspace.chat.running = true

        let snapshot: [[String: Any]] = [
            ["kind": "user", "text": "Question", "meta": ["eventId": "user", "messageId": "request", "turnId": "request", "threadId": thread.id, "sequence": 1]],
            ["kind": "text", "text": "Réponse", "meta": ["eventId": "answer", "turnId": "request", "threadId": thread.id, "sequence": 2]],
            ["kind": "done", "meta": ["eventId": "done", "turnId": "request", "threadId": thread.id, "sequence": 3]]
        ]
        workspace.chat.applyHistorySnapshot(snapshot[...])

        XCTAssertEqual(workspace.chat.rows.map(\.text), ["Question", "Réponse"])
        XCTAssertFalse(workspace.chat.rows.contains { $0.id.hasPrefix("pending:") })
        XCTAssertFalse(workspace.chat.running)
        XCTAssertEqual(workspace.chat.lastSequences[thread.id], 3)
    }

    @MainActor func testFullSnapshotAbsorbsDurablePendingMessageAndKeepsUnfinishedTurnRunning() {
        let workspace = WorkspaceModel()
        let thread = RemoteChatModel.Thread(id: "active-snapshot", title: "Snapshot", provider: "codex", model: nil, projectId: nil, status: "running")
        workspace.chat.select(thread, workspace: workspace)
        workspace.chat.rows.append(.init(id: "pending:request", kind: "user", text: "Question", turn: "request", messageID: "request"))
        workspace.chat.running = true

        let snapshot: [[String: Any]] = [
            ["kind": "user", "text": "Question", "meta": ["eventId": "user", "messageId": "request", "turnId": "request", "threadId": thread.id, "sequence": 1]],
            ["kind": "text", "text": "Réponse partielle", "meta": ["eventId": "answer", "turnId": "request", "threadId": thread.id, "sequence": 2]]
        ]
        workspace.chat.applyHistorySnapshot(snapshot[...])

        XCTAssertEqual(workspace.chat.rows.map(\.text), ["Question", "Réponse partielle"])
        XCTAssertFalse(workspace.chat.rows.contains { $0.id.hasPrefix("pending:") })
        XCTAssertTrue(workspace.chat.running)
        XCTAssertTrue(workspace.chat.isTurnRunning("request"))
        XCTAssertEqual(workspace.chat.lastSequences[thread.id], 2)
    }

    @MainActor func testLegacyGlobalDoneDoesNotResurrectPreviouslyActiveTurn() {
        let workspace = WorkspaceModel()
        let thread = RemoteChatModel.Thread(id: "legacy-done-snapshot", title: "Snapshot", provider: "codex", model: nil, projectId: nil, status: "running")
        workspace.chat.select(thread, workspace: workspace)
        workspace.chat.apply(["kind": "started", "meta": ["eventId": "started", "turnId": "request", "threadId": thread.id, "sequence": 1]])

        let snapshot: [[String: Any]] = [
            ["kind": "user", "text": "Question", "meta": ["eventId": "user", "turnId": "request", "threadId": thread.id, "sequence": 1]],
            ["kind": "text", "text": "Réponse", "meta": ["eventId": "answer", "turnId": "request", "threadId": thread.id, "sequence": 2]],
            ["kind": "done", "meta": ["eventId": "done", "threadId": thread.id, "sequence": 3]]
        ]
        workspace.chat.applyHistorySnapshot(snapshot[...])

        XCTAssertFalse(workspace.chat.running)
        XCTAssertFalse(workspace.chat.isTurnRunning("request"))
        XCTAssertEqual(workspace.chat.lastSequences[thread.id], 3)
    }

}

final class AnnotationMessagePresentationTests: XCTestCase {
    @MainActor func testReadingNotesBecomeQuoteWithoutLosingSourceOrExistingDraft() throws {
        let intro = "Voici mes remarques de lecture. Propose des révisions en tenant compte de chaque remarque."
        let body = "results_en.tex — lignes 90–100\nCitation :\nÉnergie 🌲\n\nSource exacte :\n$14.31$~W~m$^{-2}$\n\nRemarque :\nVarier reaches."
        let prompt = intro + "\n\n" + body
        let parts = try XCTUnwrap(AnnotationMessageParts(prompt))
        XCTAssertEqual(parts.passage, body)
        let workspace = WorkspaceModel()
        workspace.chat.selected = .init(id: "notes-test", title: "Test", provider: "codex", model: nil, projectId: nil, status: "idle")
        workspace.chat.isPreview = true
        workspace.draft = "Ma question."
        workspace.pendingDocumentPrompt = prompt
        workspace.applyPendingDocumentChat()
        XCTAssertEqual(workspace.draft, "Ma question.\n\n" + intro)
        XCTAssertEqual(workspace.chat.quote?.text, body)
        XCTAssertNil(workspace.pendingDocumentPrompt)
        XCTAssertEqual(try XCTUnwrap(AnnotationMessageParts(prompt + "\n\n---\n\nDeuxième remarque.")).passage,
                       body + "\n\n---\n\nDeuxième remarque.")
        let sent = RemoteChatModel.promptWithQuote(workspace.draft, quote: workspace.chat.quote)
        XCTAssertEqual(try XCTUnwrap(AnnotationMessageParts(sent)).passage, body)
        workspace.pendingDocumentPrompt = prompt
        workspace.applyPendingDocumentChat()
        XCTAssertEqual(workspace.chat.quote?.text, body + "\n\n---\n\n" + body)
        XCTAssertEqual(workspace.draft, "Ma question.\n\n" + intro)
        XCTAssertEqual(try XCTUnwrap(AnnotationMessageParts(intro + "\n\n" + body + "\n\n---\n\n" + body)).citation, "2 annotations · results_en.tex — lignes 90–100")
    }

    @MainActor func testDocumentQuoteFromComposerKeepsFullPassageSeparateFromQuestion() throws {
        let passage = #"At the cell level, all 30 fire slopes have 95\,\% intervals."# + "\n\nSuite 🌲."
        let quote = RemoteChatModel.Quote(text: passage, sourceRowID: "source", sourceLabel: "results_en.tex · lignes 30–42")
        let prompt = RemoteChatModel.promptWithQuote("Ce passage se lit comme une liste.\n\nReformule-le.", quote: quote)
        let parts = try XCTUnwrap(AnnotationMessageParts(prompt))
        XCTAssertEqual(parts.citation, "results_en.tex · lignes 30–42")
        XCTAssertEqual(parts.passage, passage)
        XCTAssertEqual(parts.note, "Ce passage se lit comme une liste.\n\nReformule-le.")
        XCTAssertTrue(prompt.contains("> " + passage.components(separatedBy: "\n")[0]))
    }
    func testExistingZoteroAnnotationEnvelopeAndAttachmentFooter() throws {
        let parts = try XCTUnwrap(AnnotationMessageParts("Article Zotero : ABC\nDocument : article.pdf · page 3\n\nPassage cité :\n> Une phrase.\n> Une autre.\n\nMa note :\nPrécise ceci.\n\nPièces jointes : figure.png", attachmentNames: ["figure.png"]))
        XCTAssertEqual(parts.citation, "article.pdf · page 3")
        XCTAssertEqual(parts.passage, "Une phrase.\nUne autre.")
        XCTAssertEqual(parts.note, "Précise ceci.")
    }
    @MainActor func testConversationQuoteAndEmptyQuestionAreSupported() throws {
        let prompt = RemoteChatModel.promptWithQuote("", quote: .init(text: "Passage cité", sourceRowID: "row"))
        let parts = try XCTUnwrap(AnnotationMessageParts(prompt))
        XCTAssertEqual(parts.citation, "Passage de la conversation")
        XCTAssertEqual(parts.passage, "Passage cité")
        XCTAssertEqual(parts.note, "")
    }
    @MainActor func testUserHeadingsAreNeverMistakenForEnvelopeMetadata() throws {
        let note = "Ma note :\nAnalyse ceci.\n\nPièces jointes : voici les données\nExplique la suite."
        let prompt = RemoteChatModel.promptWithQuote(note, quote: .init(text: "Extrait", sourceRowID: "row", sourceLabel: "results.tex"))
        XCTAssertEqual(try XCTUnwrap(AnnotationMessageParts(prompt)).note, note)
        let withFooter = prompt + "\n\nPièces jointes : figure.png"
        XCTAssertEqual(try XCTUnwrap(AnnotationMessageParts(withFooter)).note, note + "\n\nPièces jointes : figure.png")
        XCTAssertEqual(try XCTUnwrap(AnnotationMessageParts(withFooter, attachmentNames: ["figure.png"])).note, note)
    }
    func testOrdinaryAndMalformedMessagesKeepOriginalPresentation() {
        for text in ["Mon commentaire", "Document : results.tex\nTexte normal", "Document : results.tex\nPassage cité :\nTexte sans citation", "Document : results.tex\nPassage cité :\n> Citation\nPas de séparateur"] {
            XCTAssertNil(AnnotationMessageParts(text))
        }
    }
}

final class UnifiedActivityTests: XCTestCase {
    @MainActor func testWaitingBecomesThinkingThenToolsWithoutChangingCellIdentity() {
        let chat = RemoteChatModel()
        func apply(_ kind: String, _ text: String = "", _ fields: [String: Any] = [:]) {
            var event = fields; event["kind"] = kind; event["text"] = text; event["meta"] = ["turnId": "t"]
            chat.apply(event)
        }
        apply("user", "Ma question")
        apply("started")
        let waiting = ChatTimelineItem.displayItems(chat.rows, running: chat.running)
        let id = waiting.last!.id
        XCTAssertTrue(waiting.last!.awaitingActivity)
        apply("tool", "", ["name": "__thinking"])
        XCTAssertEqual(ChatTimelineItem.displayItems(chat.rows, running: chat.running).last?.id, id)
        XCTAssertTrue(ChatTimelineItem.displayItems(chat.rows, running: chat.running).last!.awaitingActivity)
        apply("thinking_live", "")
        XCTAssertTrue(ChatTimelineItem.displayItems(chat.rows, running: chat.running).last!.awaitingActivity)
        XCTAssertEqual(ChatTimelineItem.displayItems(chat.rows, running: chat.running).last?.id, id)
        apply("thinking_delta", "Vérification des sources")
        let thought = ChatTimelineItem.displayItems(chat.rows, running: chat.running).last!
        XCTAssertEqual(thought.id, id); XCTAssertFalse(thought.awaitingActivity)
        XCTAssertEqual(thought.rows.last?.text, "Vérification des sources")
        apply("tool", "", ["name": "__thinking-step", "detail": "Comparaison des résultats"])
        let heading = ChatActivityPresentation.current(in: ChatTimelineItem.displayItems(chat.rows, running: true).last!.rows, active: true)!
        XCTAssertEqual(ChatActivityPresentation(row: heading, turnRunning: true).summary, "Comparaison des résultats")
        apply("thinking", "Vérification des sources")
        apply("tool_update", "Recherche", ["name": "web_search", "id": "search", "status": "inProgress"])
        let tool = ChatTimelineItem.displayItems(chat.rows, running: chat.running).last!
        XCTAssertEqual(tool.id, id); XCTAssertEqual(tool.rows.count, 3)
        XCTAssertEqual(tool.rows.last?.toolName, "web_search")
        apply("done")
        let complete = ChatTimelineItem.displayItems(chat.rows, running: chat.running)
        XCTAssertEqual(complete.last?.id, id)
        XCTAssertFalse(complete.contains(where: \.awaitingActivity))
    }
    func testStreamingResponseDoesNotShowSecondThinkingLineAndCellsStayUnique() {
        let rows: [RemoteChatModel.Row] = [
            .init(id: "u", kind: "user", text: "Question", turn: "a"),
            .init(id: "t1", kind: "thinking", text: "Une étape", turn: "a"),
            .init(id: "t2", kind: "tool", text: "Une autre", turn: "b"),
            .init(id: "text", kind: "text", text: "Réponse", turn: "b", isStreaming: true)
        ]
        let items = ChatTimelineItem.displayItems(rows, running: true)
        XCTAssertEqual(Set(items.map(\.id)).count, items.count)
        XCTAssertFalse(items.contains(where: \.awaitingActivity))
        XCTAssertFalse(ChatTimelineItem.displayItems([], running: false).contains(where: \.awaitingActivity))
        XCTAssertTrue(ChatTimelineItem.displayItems([], running: true).last!.awaitingActivity)
    }
}

private final class HistoryDeltaProtocol: URLProtocol, @unchecked Sendable {
    final class State: @unchecked Sendable {
        private let lock = NSLock()
        private var gate: DispatchSemaphore?
        private var asked: XCTestExpectation?
        private var queries: [String?] = []
        private var snapshotRequired = false
        private var streamTimeout: TimeInterval?
        private var streamCachePolicy: URLRequest.CachePolicy?
        private var streamCacheControl: String?
        func reset(snapshotRequired: Bool = false) {
            lock.withLock {
                gate = nil; asked = nil; queries = []; self.snapshotRequired = snapshotRequired
                streamTimeout = nil; streamCachePolicy = nil; streamCacheControl = nil
            }
        }
        func hold(_ expectation: XCTestExpectation) { lock.withLock { asked = expectation; gate = DispatchSemaphore(value: 0) } }
        func release() { lock.withLock { gate?.signal() } }
        /// Records the delta cursor of one replay request and answers whether it is the
        /// first one. Only that first request is held for the test to inspect.
        func noteHistory(_ request: URLRequest) -> Bool {
            let (expectation, semaphore, isFirst) = lock.withLock { () -> (XCTestExpectation?, DispatchSemaphore?, Bool) in
                let isFirst = queries.isEmpty
                queries.append(URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "afterSequence" }?.value)
                // Only the first request waits; the gate must stay reachable for release().
                return (isFirst ? asked : nil, isFirst ? gate : nil, isFirst)
            }
            expectation?.fulfill()
            semaphore?.wait()
            return isFirst
        }
        var sequenceQueries: [String?] { lock.withLock { queries } }
        var snapshotMode: Bool { lock.withLock { snapshotRequired } }
        func noteLive(_ request: URLRequest) {
            lock.withLock {
                streamTimeout = request.timeoutInterval
                streamCachePolicy = request.cachePolicy
                streamCacheControl = request.value(forHTTPHeaderField: "Cache-Control")
            }
        }
        var liveTimeout: TimeInterval? { lock.withLock { streamTimeout } }
        var liveCachePolicy: URLRequest.CachePolicy? { lock.withLock { streamCachePolicy } }
        var liveCacheControl: String? { lock.withLock { streamCacheControl } }
    }
    static let state = State()
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let url = request.url else { client?.urlProtocol(self, didFailWithError: URLError(.badURL)); return }
        if url.path.hasSuffix("/live") {
            Self.state.noteLive(request)
            // Serve one line, then end the body late: AsyncBytes resolves either on
            // the response or on completion, so this keeps both paths testable.
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data("{\"type\":\"heartbeat\"}\n".utf8))
            DispatchQueue.global().asyncAfter(deadline: .now() + 0.8) { [self] in
                client?.urlProtocolDidFinishLoading(self)
            }
            return
        }
        let first = Self.state.noteHistory(request)
        let body = first && Self.state.snapshotMode
            ? #"{"type":"history","complete":false,"snapshotRequired":true,"events":[]}"#
            : #"{"type":"history","complete":true,"snapshotRequired":false,"events":[{"kind":"text","text":"Réponse finale","meta":{"eventId":"final","turnId":"t","threadId":"delta-thread","sequence":11}}]}"#
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
