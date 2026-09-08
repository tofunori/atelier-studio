import XCTest
@testable import AtelierUI

final class GeneratedImageTests: XCTestCase {
    @MainActor func testGeneratedImageSurvivesTranscriptReplayAndStaysOutsideActivity() throws {
        let chat = RemoteChatModel()
        chat.apply(["kind": "tool_update", "id": "image-item", "name": "image_generation", "status": "inProgress",
                    "meta": ["eventId": "start", "turnId": "turn", "itemId": "image-item"]])
        XCTAssertNil(chat.rows.first?.generatedImageEventID)
        chat.apply(["kind": "tool_update", "id": "image-item", "name": "image_generation", "status": "completed",
                    "output": "/Users/test/.codex/generated_images/session/image.png",
                    "meta": ["eventId": "complete", "turnId": "turn", "itemId": "image-item"]])
        chat.apply(["kind": "done", "meta": ["eventId": "done", "turnId": "turn"]])
        XCTAssertEqual(chat.rows.count, 1)
        let restored = try JSONDecoder().decode([RemoteChatModel.Row].self, from: JSONEncoder().encode(chat.rows))
        XCTAssertEqual(restored.first?.generatedImageEventID, "complete")
        let tool = RemoteChatModel.Row(id: "tool", kind: "tool", text: "Read", turn: "turn")
        let items = ChatTimelineItem.displayItems([tool] + restored + [tool], running: false)
        XCTAssertEqual(items.count, 3)
        XCTAssertTrue(items[0].isActivity)
        XCTAssertFalse(items[1].isActivity)
        XCTAssertTrue(items[2].isActivity)
    }

    @MainActor func testFailedGenerationAndOrdinaryToolsAreNotImages() {
        var row = RemoteChatModel.Row(id: "image", kind: "tool_update", text: "", turn: "turn")
        row.eventID = "event"; row.toolName = "image_generation"; row.toolStatus = "failed"
        XCTAssertNil(row.generatedImageEventID)
        row.toolStatus = "completed"; row.toolName = "Read"
        XCTAssertNil(row.generatedImageEventID)
        row.toolName = "image_generation"; row.eventID = nil
        XCTAssertNil(row.generatedImageEventID)
    }

    @MainActor func testSaveTargetsImageEventWithoutClientProjectPath() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [GeneratedImageProtocol.self]
        let gateway = GalleryModel(address: URL(string: "https://gateway.invalid")!, token: "test-token", session: URLSession(configuration: configuration))
        try await gateway.saveGeneratedChatImage(threadID: "thread-a", eventID: "event-a")
    }

    @MainActor func testImageRequestUsesEventIdentityAndAuthorizationHeader() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [GeneratedImageProtocol.self]
        let gateway = GalleryModel(address: URL(string: "https://gateway.invalid")!, token: "test-token", session: URLSession(configuration: configuration))
        let data = try await gateway.generatedChatImage(threadID: "thread-a", eventID: "event-a")
        XCTAssertEqual(data, GeneratedImageProtocol.png)
        do {
            _ = try await gateway.generatedChatImage(threadID: "thread-a", eventID: "denied")
            XCTFail("Unauthorized image must not be returned")
        } catch { XCTAssertTrue(error.localizedDescription.contains("403")) }
        do {
            _ = try await gateway.generatedChatImage(threadID: "thread-a", eventID: "invalid")
            XCTFail("An old gateway's HTML fallback must not be cached as an image")
        } catch { XCTAssertTrue(error.localizedDescription.contains("image valide")) }
    }
}

private final class GeneratedImageProtocol: URLProtocol, @unchecked Sendable {
    static let png = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=")!
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        XCTAssertEqual(request.value(forHTTPHeaderField: "x-atelier-device-token"), "test-token")
        XCTAssertNil(request.url?.query)
        if request.url?.lastPathComponent == "gallery" || request.url?.lastPathComponent == "projects" {
            let saving = request.url?.lastPathComponent == "gallery"
            if saving {
                XCTAssertEqual(request.httpMethod, "POST")
                XCTAssertEqual(request.url?.path, "/remote/v1/threads/thread-a/images/event-a/gallery")
            }
            let body = saving ? #"{"relativePath":"images-generees/test.png"}"# : #"{"projects":[]}"#
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(body.utf8))
            client?.urlProtocolDidFinishLoading(self)
            return
        }
        let denied = request.url?.lastPathComponent == "denied"
        let invalid = request.url?.lastPathComponent == "invalid"
        XCTAssertEqual(request.url?.path, "/remote/v1/threads/thread-a/images/\(denied ? "denied" : invalid ? "invalid" : "event-a")")
        let response = HTTPURLResponse(url: request.url!, statusCode: denied ? 403 : 200, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: denied ? Data() : invalid ? Data("<html>Atelier</html>".utf8) : Self.png)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() { }
}
