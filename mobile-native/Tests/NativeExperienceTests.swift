import XCTest
@testable import AtelierUI

final class NativeExperienceTests: XCTestCase {
    @MainActor func testFinalTextKeepsItsStreamingIdentity() {
        let chat = RemoteChatModel()
        chat.apply(["kind":"delta","text":"Bon","meta":["turnId":"t"]])
        let id = chat.rows.first?.id
        chat.apply(["kind":"delta","text":"jour","meta":["turnId":"t"]])
        XCTAssertEqual(chat.rows.first?.id,id)
        chat.apply(["kind":"text","text":"Bonjour","meta":["turnId":"t","eventId":"e1"]])
        XCTAssertEqual(chat.rows.first?.id,id)
        XCTAssertEqual(chat.rows.first?.text,"Bonjour")
        XCTAssertFalse(chat.rows.first?.isStreaming ?? true)
        chat.apply(["kind":"delta","text":"Suite","meta":["turnId":"t"]])
        XCTAssertEqual(chat.rows.count,2)
        XCTAssertNotEqual(chat.rows.last?.id,id)
    }
    @MainActor func testPreparedMessagesKeepFilesAndOrderAfterRestore() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = ChatResumeStore(directory: directory)
        let workspace = WorkspaceModel(resumeStore: store)
        let thread = RemoteChatModel.Thread(id:"t",title:"T",provider:"codex",model:nil,projectId:nil,status:"idle")
        workspace.chat.select(thread,workspace: workspace)
        workspace.draft = "Premier"
        workspace.chat.attach(GalleryArtifact(name:"pièce.txt",data:Data([1,2,3])))
        workspace.chat.enqueue(workspace: workspace)
        workspace.draft = "Second"; workspace.chat.enqueue(workspace: workspace)
        let second = try XCTUnwrap(workspace.chat.prepared.last?.id)
        workspace.chat.movePrepared(second,up:true)
        await workspace.chat.flushResume()
        let restored = WorkspaceModel(resumeStore: store)
        await restored.chat.restore(workspace: restored)
        XCTAssertEqual(restored.chat.prepared.map(\.text),["Second","Premier"])
        XCTAssertEqual(restored.chat.prepared.last?.files.first?.data,Data([1,2,3]))
        XCTAssertTrue(restored.draft.isEmpty)
    }
    @MainActor func testProviderErrorPausesPreparedMessages() {
        let workspace = WorkspaceModel()
        workspace.chat.select(.init(id:"t",title:"T",provider:"codex",model:nil,projectId:nil,status:"running"),workspace:workspace)
        workspace.chat.live = true
        let completion = workspace.chat.completedResponse
        workspace.chat.apply(["kind":"error","text":"Échec","meta":["turnId":"t1"]])
        workspace.chat.apply(["kind":"done","meta":["turnId":"t1"]])
        XCTAssertEqual(workspace.chat.completedResponse,completion)
        XCTAssertTrue(workspace.chat.pausedQueues.contains("t"))
    }
    @MainActor func testDocumentResumePreservesUnsavedSourceAndPosition() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:directory) }
        let store = DocumentResumeStore(directory:directory)
        let workspace = WorkspaceModel(); workspace.documentResumeStore = store
        let artifact = GalleryArtifact(name:"notes.tex",data:nil)
        try workspace.openArtifact(artifact,data:Data("Source originale".utf8))
        workspace.source = "Brouillon local"
        workspace.readingOffsets[workspace.documentID] = 345
        await workspace.flushDocumentResume()
        let restored = WorkspaceModel(); restored.documentResumeStore = store
        let visible = await restored.restoreDocument()
        XCTAssertTrue(visible)
        XCTAssertEqual(restored.source,"Brouillon local")
        XCTAssertEqual(restored.originalSources[restored.documentID],"Source originale")
        XCTAssertEqual(restored.readingOffsets[restored.documentID],345)
        XCTAssertTrue(restored.documentDirty)
    }
    @MainActor func testLostAcknowledgementRetryDoesNotRestartCompletedResponse() {
        let chat = RemoteChatModel()
        chat.apply(["kind":"user","text":"Question","meta":["turnId":"t","eventId":"u","messageId":"m"]])
        chat.apply(["kind":"started","meta":["turnId":"t","eventId":"s"]])
        chat.apply(["kind":"done","meta":["turnId":"t","eventId":"d"]])
        chat.rows.append(.init(id:"pending:m",kind:"user",text:"Question",turn:"t",messageID:"m"))
        chat.running = true
        chat.reconcileReplay(requestID:"m")
        XCTAssertFalse(chat.running)
        XCTAssertEqual(chat.rows.count,1)
    }
    func testFileChangeUsesActualProviderPayload() {
        let changes = RemoteFileChange.parse(["kind":"edit","files":[["path":"a.tex","oldText":"avant","newText":"après"]]],eventID:"e")
        XCTAssertEqual(changes.first?.before,"avant"); XCTAssertEqual(changes.first?.after,"après")
        XCTAssertTrue(RemoteFileChange.parse(["kind":"tool","files":["a.tex"]],eventID:"t").isEmpty)
    }
}
