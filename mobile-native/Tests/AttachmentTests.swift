import XCTest
import UIKit
@testable import AtelierUI

final class AttachmentTests: XCTestCase {
    @MainActor func testRemoteAttachmentReindexesAfterGatewayRestart() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [GalleryReindexProtocol.self]
        let gateway = GalleryModel(address: URL(string: "https://gateway.invalid")!, token: "test", session: URLSession(configuration: configuration))
        let file = GalleryArtifact(name: "plot.png", fileID: "f_original", projectID: "p_test")
        let id = try await gateway.attachmentID(file)
        XCTAssertEqual(id, "f_original")
        do {
            _ = try await gateway.attachmentID(GalleryArtifact(name: "plot.png", fileID: "f_other", projectID: "p_test"))
            XCTFail("Must not substitute a same-name file")
        } catch { XCTAssertTrue(error.localizedDescription.contains("plus disponible")) }
    }
    @MainActor func testKnownAttachmentIsConfirmedByOneByteWithoutListingTheProject() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [FileProbeProtocol.self]
        FileProbeProtocol.state.reset()
        let gateway = GalleryModel(address: URL(string: "https://gateway.invalid")!, token: "test", session: URLSession(configuration: configuration))
        let id = try await gateway.attachmentID(GalleryArtifact(name: "plot.png", fileID: "f_known", projectID: "p_test"))
        XCTAssertEqual(id, "f_known")
        XCTAssertEqual(FileProbeProtocol.state.paths, ["/remote/v1/file/f_known"])
        XCTAssertEqual(FileProbeProtocol.state.ranges, ["bytes=0-0"])
        // An expired association is reported, not hidden behind a re-index.
        do {
            _ = try await gateway.attachmentID(GalleryArtifact(name: "plot.png", fileID: "f_expired", projectID: "p_test"))
            XCTFail("401 must be reported")
        } catch GalleryModel.GalleryError.server(let status) {
            XCTAssertEqual(status, 401)
        } catch { XCTFail("Unexpected error: \(error)") }
        XCTAssertFalse(FileProbeProtocol.state.paths.contains { $0.hasPrefix("/remote/v1/gallery") })
    }
    @MainActor func testAttachmentOwnershipAndDeduplication() {
        let workspace = WorkspaceModel()
        let a = RemoteChatModel.Thread(id:"a",title:"A",provider:"codex",model:nil,projectId:nil,status:"idle")
        let b = RemoteChatModel.Thread(id:"b",title:"B",provider:"codex",model:nil,projectId:nil,status:"idle")
        let file = GalleryArtifact(name:"analysis.py",data:Data("print(1)".utf8))
        workspace.attachToChat(file)
        XCTAssertTrue(workspace.chatPickerRequested)
        workspace.chat.select(a,workspace:workspace)
        workspace.chat.attach(file)
        XCTAssertEqual(workspace.chat.attachments.count,1)
        workspace.chat.select(b,workspace:workspace)
        XCTAssertTrue(workspace.chat.attachments.isEmpty)
        workspace.chat.select(a,workspace:workspace)
        XCTAssertEqual(workspace.chat.attachments.first?.id,file.id)
        workspace.draft = "Mon brouillon"
        workspace.chat.showConversations(workspace: workspace)
        XCTAssertNil(workspace.chat.selected)
        workspace.chat.attach(GalleryArtifact(name: "new.png", data: Data()))
        workspace.chat.select(a, workspace: workspace)
        XCTAssertEqual(workspace.draft, "Mon brouillon")
        XCTAssertEqual(workspace.chat.attachments.count, 2)
        XCTAssertEqual(workspace.chat.attachments.first?.id, file.id)
    }
    @MainActor func testAttachmentLimitAndFailureRetention() async {
        let workspace = WorkspaceModel()
        workspace.gallery = GalleryModel(restoreCredentials: false)
        workspace.chat.select(.init(id:"a",title:"A",provider:"codex",model:nil,projectId:nil,status:"idle"),workspace:workspace)
        for i in 0..<7 { workspace.chat.attach(GalleryArtifact(name:"file\(i).txt",data:Data("hello".utf8))) }
        XCTAssertEqual(workspace.chat.attachments.count,6)
        let sent = await workspace.chat.send("",using:workspace.gallery,includingAttachments:true)
        XCTAssertFalse(sent)
        XCTAssertEqual(workspace.chat.attachments.count,6)
        XCTAssertFalse(workspace.chat.running)
    }
    @MainActor func testImageOnlyRetryTransmitsAndKeepsCurrentDraftAttachments() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [AttachmentSendProtocol.self]
        let gateway = GalleryModel(address: URL(string: "https://gateway.invalid")!, token: "test", session: URLSession(configuration: config))
        let chat = RemoteChatModel()
        chat.selected = .init(id: "thread", title: "Test", provider: "codex", model: nil, projectId: nil, status: "idle")
        chat.providers = [.init(id: "codex", label: "Codex", models: [], defaultModel: "", efforts: [], ok: true, modelLabels: nil, capabilities: .init(permissionModes: ["default", "bypassPermissions"]))]
        let pending = GalleryArtifact(name: "draft.png", data: Data([9]))
        let historical = GalleryArtifact(name: "old.png", data: Data([1,2,3]))
        chat.attach(pending)
        let sent = await chat.send("", using: gateway, explicitFiles: [historical])
        XCTAssertTrue(sent)
        XCTAssertEqual(chat.attachments.map(\.id), [pending.id])
        XCTAssertEqual(chat.files(for: try XCTUnwrap(chat.rows.last)).first?.id, historical.id)
    }

    @MainActor func testPhotoConversionPreservesImageAndBoundsSize() throws {
        let renderer = UIGraphicsImageRenderer(size:CGSize(width:3000,height:1000))
        let source = renderer.image { context in UIColor.red.setFill(); context.fill(CGRect(x:0,y:0,width:3000,height:1000)) }
        let item = try PhotoImport.artifact(data:try XCTUnwrap(source.pngData()))
        let image = try XCTUnwrap(UIImage(data:try XCTUnwrap(item.data)))
        XCTAssertLessThanOrEqual(image.size.width,2048)
        XCTAssertEqual(item.ext,"jpg")
        XCTAssertLessThan(item.data!.count,8*1024*1024)
        XCTAssertThrowsError(try PhotoImport.artifact(data:Data("invalid".utf8)))
    }
}

private final class GalleryReindexProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        // The restarted gateway no longer knows either reference.
        if request.url?.path.hasPrefix("/remote/v1/file/") == true {
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 404, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(#"{"error":"fichier inconnu","code":"not_found"}"#.utf8))
            client?.urlProtocolDidFinishLoading(self)
            return
        }
        guard request.url?.path == "/remote/v1/gallery/p_test" else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL)); return
        }
        let second = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.contains { $0.name == "offset" && $0.value == "500" } == true
        let data = Data((second
            ? #"{"items":[{"fileId":"f_original","name":"plot.png","size":12}]}"#
            : #"{"items":[{"fileId":"f_first","name":"other.png","size":12}],"nextOffset":500}"#).utf8)
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

private final class AttachmentSendProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let isUpload = request.url?.path == "/remote/v1/attachments/old.png"
        guard isUpload || request.url?.path == "/remote/v1/send" else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL)); return
        }
        let data = Data((isUpload ? #"{"fileId":"uploaded"}"# : #"{"proxied":true}"#).utf8)
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

private final class FileProbeProtocol: URLProtocol, @unchecked Sendable {
    final class State: @unchecked Sendable {
        private let lock = NSLock()
        private var seen: [String] = []
        private var headers: [String] = []
        func reset() { lock.withLock { seen = []; headers = [] } }
        func record(_ request: URLRequest) {
            lock.withLock {
                seen.append(request.url?.path ?? "")
                if let range = request.value(forHTTPHeaderField: "Range") { headers.append(range) }
            }
        }
        var paths: [String] { lock.withLock { seen } }
        var ranges: [String] { lock.withLock { headers } }
    }
    static let state = State()
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.state.record(request)
        let path = request.url?.path ?? ""
        let status: Int, body: Data
        switch path {
        case "/remote/v1/file/f_known": status = 206; body = Data([0x89])
        case "/remote/v1/file/f_expired": status = 401; body = Data(#"{"error":"appareil inconnu"}"#.utf8)
        default: status = 500; body = Data()
        }
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
