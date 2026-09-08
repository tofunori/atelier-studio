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
    @MainActor func testQueuedEditPreservesCurrentComposerAndFiles() throws {
        let workspace = WorkspaceModel()
        let chat = workspace.chat
        chat.select(.init(id:"t",title:"T",provider:"codex",model:nil,projectId:nil,status:"running"),workspace:workspace)
        workspace.draft = "À suivre"
        chat.quotePassage("Citation initiale", from: "q")
        let queuedFile = GalleryArtifact(name:"joint.txt",data:Data([1]))
        chat.attach(queuedFile)
        chat.enqueue(workspace:workspace)
        let queued = try XCTUnwrap(chat.prepared.first)
        XCTAssertTrue(queued.text.contains("Citation initiale"))
        workspace.draft = "Autre brouillon"
        chat.quotePassage("Autre citation", from: "other")
        let quoteID = chat.quote?.id
        let draftFile = GalleryArtifact(name:"brouillon.txt",data:Data([2]))
        chat.attach(draftFile)
        XCTAssertTrue(chat.updatePrepared(queued.id, text:"Message modifié"))
        XCTAssertEqual(chat.prepared.first?.id,queued.id)
        XCTAssertEqual(chat.prepared.first?.files.first?.id,queuedFile.id)
        XCTAssertEqual(workspace.draft,"Autre brouillon")
        XCTAssertEqual(chat.quote?.id,quoteID)
        XCTAssertEqual(chat.attachments.first?.id,draftFile.id)
        chat.removePrepared(queued.id)
        XCTAssertTrue(chat.prepared.isEmpty)
        XCTAssertEqual(workspace.draft,"Autre brouillon")
    }
    @MainActor func testUncertainQueueCannotBeEditedOrCancelledAndAcknowledgementReconciles() throws {
        let workspace = WorkspaceModel(); let chat = workspace.chat
        chat.select(.init(id:"t",title:"T",provider:"codex",model:nil,projectId:nil,status:"running"),workspace:workspace)
        workspace.draft = "Consigne"; chat.enqueue(workspace:workspace)
        let id = try XCTUnwrap(chat.prepared.first?.id)
        chat.prepared[0].attempted = true; chat.prepared[0].attemptedMode = "steer"
        XCTAssertFalse(chat.updatePrepared(id,text:"Différent"))
        chat.removePrepared(id)
        XCTAssertEqual(chat.prepared.count,1)
        chat.rows.append(.init(id:"pending:" + id,kind:"user",text:"Consigne",turn:"t",messageID:id))
        chat.reconcilePreparedAcknowledgements()
        XCTAssertEqual(chat.prepared.count,1)
        chat.rows.append(.init(id:"confirmed",kind:"user",text:"Consigne",turn:"t",messageID:id))
        chat.reconcilePreparedAcknowledgements()
        chat.reconcilePreparedAcknowledgements()
        XCTAssertTrue(chat.prepared.isEmpty)
    }
    @MainActor func testSteeringUnavailableLeavesQueuedMessageUntouched() async throws {
        let workspace = WorkspaceModel(); let chat = workspace.chat
        chat.select(.init(id:"t",title:"T",provider:"other",model:nil,projectId:nil,status:"running"),workspace:workspace)
        workspace.draft = "Suite"; chat.enqueue(workspace:workspace); chat.running = true
        let id = try XCTUnwrap(chat.prepared.first?.id)
        await chat.steerPrepared(id,using:workspace.gallery)
        XCTAssertFalse(chat.supportsSteering)
        XCTAssertFalse(chat.prepared.first?.attempted ?? true)
        XCTAssertEqual(chat.prepared.first?.id,id)
        XCTAssertTrue(chat.error?.contains("ne permet pas") ?? false)
    }
    @MainActor func testQueuePreflightFailureRemainsEditableForSendAndSteer() async throws {
        for steer in [false, true] {
            let workspace = WorkspaceModel(); let chat = workspace.chat
            chat.providers = [try JSONDecoder().decode(RemoteChatModel.Provider.self, from: Data(#"{"id":"codex","label":"Codex","models":[],"defaultModel":"","efforts":[],"ok":true,"capabilities":{"steering":true,"permissionModes":["full","ask"]}}"#.utf8))]
            chat.select(.init(id:"t",title:"T",provider:"codex",model:nil,projectId:nil,status:"idle"),workspace:workspace)
            workspace.draft = "Avec une pièce indisponible"
            chat.attach(GalleryArtifact(name:"absent.txt",data:nil))
            chat.enqueue(workspace:workspace)
            let id = try XCTUnwrap(chat.prepared.first?.id)
            chat.running = steer
            if steer { await chat.steerPrepared(id,using:workspace.gallery) }
            else { await chat.deliverPrepared(using:workspace.gallery) }
            XCTAssertNotNil(chat.error)
            XCTAssertFalse(chat.prepared.first?.attempted ?? true)
            XCTAssertNil(chat.prepared.first?.attemptedMode)
            XCTAssertTrue(chat.updatePrepared(id,text:"Corrigé"))
            chat.removePrepared(id)
            XCTAssertTrue(chat.prepared.isEmpty)
        }
    }
    @MainActor func testQueuePauseStartsBeforeEditorAppears() async throws {
        let workspace = WorkspaceModel(); let chat = workspace.chat
        chat.select(.init(id:"t",title:"T",provider:"codex",model:nil,projectId:nil,status:"running"),workspace:workspace)
        workspace.draft = "Ancien texte"; chat.enqueue(workspace:workspace)
        let id = try XCTUnwrap(chat.prepared.first?.id)
        let previous = try XCTUnwrap(chat.beginPreparedEditing(id))
        XCTAssertFalse(previous)
        XCTAssertTrue(chat.pausedQueues.contains("t"))
        chat.running = false
        await chat.deliverPrepared(using:workspace.gallery,automatic:true)
        XCTAssertFalse(chat.prepared.first?.attempted ?? true)
        XCTAssertNil(chat.error)
        XCTAssertTrue(chat.updatePrepared(id,text:"Nouveau texte"))
        chat.endPreparedEditing(threadID:"t",wasPaused:previous)
        XCTAssertFalse(chat.pausedQueues.contains("t"))
        chat.pausedQueues.insert("t")
        let alreadyPaused = try XCTUnwrap(chat.beginPreparedEditing(id))
        chat.endPreparedEditing(threadID:"t",wasPaused:alreadyPaused)
        XCTAssertTrue(chat.pausedQueues.contains("t"))
    }
    @MainActor func testQueuedRetryFreezesPermissionOnlyAtTransmission() throws {
        let workspace = WorkspaceModel(); let chat = workspace.chat
        chat.select(.init(id:"t",title:"T",provider:"codex",model:nil,projectId:nil,status:"idle"),workspace:workspace)
        workspace.draft = "Suite"; chat.enqueue(workspace:workspace)
        let id = try XCTUnwrap(chat.prepared.first?.id)
        chat.permissionMode = .ask
        XCTAssertEqual(chat.permissionForPrepared(chat.prepared[0]),.ask)
        XCTAssertNil(chat.prepared[0].permissionModeAtTransmission)
        chat.permissionMode = .full
        XCTAssertEqual(chat.permissionForPrepared(chat.prepared[0]),.full)
        chat.markPreparedTransmitting(id,mode:"send",permission:.full)
        chat.permissionMode = .ask
        XCTAssertEqual(chat.permissionForPrepared(chat.prepared[0]),.full)
        chat.markPreparedTransmitting(id,mode:"send",permission:.ask)
        XCTAssertEqual(chat.prepared[0].permissionModeAtTransmission,ChatPermissionMode.full.rawValue)
        let restored = try JSONDecoder().decode(PreparedChatMessage.self,from:JSONEncoder().encode(chat.prepared[0]))
        XCTAssertEqual(restored.id,id)
        XCTAssertEqual(chat.permissionForPrepared(restored),.full)
    }
    func testQueuedSteerIntentSurvivesCodableRoundTrip() throws {
        var item = PreparedChatMessage(threadID:"t",text:"Suite",files:[],model:"",effort:"")
        item.attempted = true; item.attemptedMode = "steer"
        let restored = try JSONDecoder().decode(PreparedChatMessage.self,from:JSONEncoder().encode(item))
        XCTAssertEqual(restored.id,item.id)
        XCTAssertEqual(restored.attemptedMode,"steer")
        XCTAssertTrue(restored.attempted)
        let legacy = try JSONDecoder().decode(PreparedChatMessage.self,from:Data(#"{"id":"old","threadID":"t","text":"Suite","files":[],"model":"","effort":"","attempted":false}"#.utf8))
        XCTAssertNil(legacy.attemptedMode)
    }
    func testFileChangeUsesActualProviderPayload() {
        let changes = RemoteFileChange.parse(["kind":"edit","files":[["path":"a.tex","oldText":"avant","newText":"après"]]],eventID:"e")
        XCTAssertEqual(changes.first?.before,"avant"); XCTAssertEqual(changes.first?.after,"après")
        XCTAssertTrue(RemoteFileChange.parse(["kind":"tool","files":["a.tex"]],eventID:"t").isEmpty)
    }
}
