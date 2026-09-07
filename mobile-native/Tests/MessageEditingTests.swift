import XCTest
@testable import AtelierUI

final class MessageEditingTests: XCTestCase {
    @MainActor func testVersionsStayInOneConversationAndPreserveTheComposer() throws {
        let workspace = WorkspaceModel()
        let source = RemoteChatModel.Thread(id:"original",title:"Même conversation",provider:"codex",model:nil,projectId:nil,status:"idle")
        workspace.chat.threads = [source]; workspace.chat.select(source, workspace:workspace)
        let row = RemoteChatModel.Row(id:"event",kind:"user",text:"Ancien texte",turn:"one",messageID:"message")
        workspace.chat.rows = [row]
        workspace.draft = "Brouillon 🌲"
        let file = GalleryArtifact(name:"draft.txt",data:Data([1]))
        workspace.chat.attach(file); workspace.chat.quotePassage("Citation",from:"answer")
        let draft = try XCTUnwrap(workspace.chat.prepareRevision(row))
        var next = RemoteChatModel.Thread(id:"version2",title:source.title,provider:"codex",model:nil,projectId:nil,status:"idle")
        next.messageRevision = MessageRevision(rootThreadId:"original",parentThreadId:"original",sourceEventId:"event",groupId:"group",baseThreadId:"original",baseEventId:"event",messageId:"newmessage")
        workspace.chat.acceptRevision(next,from:draft,requestID:"newmessage",workspace:workspace)
        XCTAssertEqual(workspace.chat.conversationThreads.map(\.id),["version2"])
        XCTAssertEqual(workspace.draft,"Brouillon 🌲")
        XCTAssertEqual(workspace.chat.attachments.map(\.id),[file.id])
        XCTAssertEqual(workspace.chat.quote?.text,"Citation")
        let replacement = RemoteChatModel.Row(id:"new-event",kind:"user",text:"Nouveau texte",turn:"two",messageID:"newmessage")
        XCTAssertEqual(workspace.chat.versions(for:replacement)?.index,1)
        XCTAssertEqual(workspace.chat.versions(for:replacement)?.threads.map(\.id),["original","version2"])
        workspace.chat.select(source,workspace:workspace)
        XCTAssertEqual(workspace.chat.versions(for:row)?.index,0)
        XCTAssertEqual(workspace.draft,"Brouillon 🌲")
        XCTAssertEqual(workspace.chat.quote?.text,"Citation")
        let restored = try JSONDecoder().decode(RemoteChatModel.Thread.self,from:JSONEncoder().encode(next))
        XCTAssertEqual(restored.messageRevision?.groupId,"group")
    }

    @MainActor func testFailedEditLeavesHistoryAndDraftUntouched() async throws {
        let workspace = WorkspaceModel()
        workspace.gallery = GalleryModel(restoreCredentials:false)
        let source = RemoteChatModel.Thread(id:"source",title:"Source",provider:"codex",model:nil,projectId:nil,status:"idle")
        workspace.chat.select(source,workspace:workspace)
        let row = RemoteChatModel.Row(id:"event",kind:"user",text:"Texte",turn:"one")
        workspace.chat.rows=[row]; workspace.draft="Brouillon"
        let draft=try XCTUnwrap(workspace.chat.prepareRevision(row))
        do { try await workspace.chat.commitRevision(draft,text:"Correction",requestID:UUID().uuidString,workspace:workspace); XCTFail("Expected connection failure") }
        catch { }
        XCTAssertEqual(workspace.chat.selected?.id,"source")
        XCTAssertEqual(workspace.chat.rows.map(\.text),["Texte"])
        XCTAssertEqual(workspace.draft,"Brouillon")
        XCTAssertFalse(workspace.chat.sending)
    }
}
