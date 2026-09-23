import XCTest
import PDFKit
import UIKit
@testable import AtelierUI

final class SharedPDFAnnotationsTests: XCTestCase {
    private let json = #"{"id":"mac-1","page":1,"rects":[[0.1,0.2,0.3,0.05]],"kind":"hl","color":"rgba(255,213,74,.40)","text":"passage","note":"note du Mac"}"#
    private func mark() throws -> SharedPDFMark { try JSONDecoder().decode(SharedPDFMark.self, from: Data(json.utf8)) }
    private func page() -> PDFPage {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 400, height: 600)).image { context in
            UIColor.white.setFill(); context.fill(CGRect(x: 0, y: 0, width: 400, height: 600))
        }
        let page = PDFPage(image: image)!
        page.setBounds(CGRect(x: 0, y: 0, width: 500, height: 700), for: .mediaBox)
        page.setBounds(CGRect(x: 10, y: 20, width: 400, height: 600), for: .cropBox)
        return page
    }
    func testNormalizedRectanglesRespectCropOriginAndRotations() throws {
        let page = page()
        let expected = [CGRect(x: 50, y: 470, width: 120, height: 30),
                        CGRect(x: 90, y: 80, width: 20, height: 180),
                        CGRect(x: 250, y: 140, width: 120, height: 30),
                        CGRect(x: 310, y: 380, width: 20, height: 180)]
        for (index, rotation) in [0, 90, 180, 270].enumerated() {
            page.rotation = rotation
            let actual = try XCTUnwrap(SharedPDFMark.bounds([0.1, 0.2, 0.3, 0.05], on: page))
            XCTAssertEqual(actual.minX, expected[index].minX, accuracy: 0.001)
            XCTAssertEqual(actual.minY, expected[index].minY, accuracy: 0.001)
            XCTAssertEqual(actual.width, expected[index].width, accuracy: 0.001)
            XCTAssertEqual(actual.height, expected[index].height, accuracy: 0.001)
        }
        XCTAssertNil(SharedPDFMark.bounds([.nan, 0, 0.1, 0.1], on: page))
        XCTAssertNil(SharedPDFMark.bounds([0, 0, -1, 0.1], on: page))
    }
    @MainActor func testRemoteRefreshNeverReplacesLocalOrEmbeddedMarks() throws {
        let document = PDFDocument(); let page = page(); document.insert(page, at: 0)
        let embedded = PDFAnnotation(bounds: CGRect(x: 0, y: 0, width: 10, height: 10), forType: .text, withProperties: nil)
        page.addAnnotation(embedded)
        let local = PDFMark(id: UUID(), documentKey: "local", fileName: "p.pdf", text: "local", regions: [.init(page: 0, bounds: CGRect(x: 1, y: 1, width: 20, height: 10))], style: .underline, note: "iPhone", createdAt: Date())
        PDFAnnotations.apply([local], to: document)
        let originalCount = page.annotations.count
        SharedPDFAnnotations.apply([try mark()], to: document)
        SharedPDFAnnotations.apply([try mark()], to: document)
        XCTAssertEqual(page.annotations.count, originalCount + 1)
        XCTAssertEqual(page.annotations.last?.contents, "note du Mac")
        PDFAnnotations.apply([local], to: document)
        XCTAssertEqual(page.annotations.count, originalCount + 1)
        SharedPDFAnnotations.apply([], to: document)
        XCTAssertEqual(page.annotations.count, originalCount)
        XCTAssertTrue(page.annotations.contains(embedded))
    }
    @MainActor func testCacheSurvivesRestartAndSeparatesServerAttachmentAndPDF() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: dir) }
        let key = SharedPDFAnnotations.key(server: "mac-a", attachment: "PDF00001", fingerprint: "v1")
        let store = SharedPDFAnnotations(directory: dir)
        try store.replace([try mark()], for: key)
        XCTAssertEqual(SharedPDFAnnotations(directory: dir).marks(for: key), [try mark()])
        XCTAssertTrue(store.marks(for: SharedPDFAnnotations.key(server: "mac-b", attachment: "PDF00001", fingerprint: "v1")).isEmpty)
        XCTAssertTrue(store.marks(for: SharedPDFAnnotations.key(server: "mac-a", attachment: "PDF00002", fingerprint: "v1")).isEmpty)
        XCTAssertTrue(store.marks(for: SharedPDFAnnotations.key(server: "mac-a", attachment: "PDF00001", fingerprint: "v2")).isEmpty)
        try store.replace([], for: key)
        XCTAssertTrue(SharedPDFAnnotations(directory: dir).marks(for: key).isEmpty)
    }
    @MainActor func testRotatedMarkupKeepsTextOrientation() throws {
        let document = PDFDocument(), page = page(); page.rotation = 90; document.insert(page, at: 0)
        let mark = try JSONDecoder().decode(SharedPDFMark.self, from: Data(json.replacingOccurrences(of: "\"hl\"", with: "\"ul\"").utf8))
        SharedPDFAnnotations.apply([mark], to: document)
        let annotation = try XCTUnwrap(page.annotations.first { $0.userName == "Atelier Mac mac-1" })
        let points = try XCTUnwrap(annotation.quadrilateralPoints?.map(\.cgPointValue))
        XCTAssertEqual(points.count, 4)
        XCTAssertEqual(points[0].x, points[1].x, accuracy: 0.001)
        XCTAssertGreaterThan(points[1].y, points[0].y)
        XCTAssertEqual(points[0].y, points[2].y, accuracy: 0.001)
        XCTAssertGreaterThan(points[2].x, points[0].x)
    }
    @MainActor func testOldRefreshCannotReplaceNewerSnapshotOrAnotherDocument() async throws {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [AuditDelayedProtocol.self]
        let workspace = WorkspaceModel()
        workspace.gallery = GalleryModel(address: URL(string: "https://mac.test")!, token: "fixture", session: URLSession(configuration: config))
        workspace.sharedPDFAnnotations = SharedPDFAnnotations(directory: nil)
        workspace.currentArticle = LibraryArticle(key: "ARTICLE1", title: "Paper", creators: "Author", year: "2020", publication: "", hasPdf: true, pdfKey: "PDF00001", pdfFile: "p.pdf")
        let first = expectation(description: "first refresh")
        AuditDelayedProtocol.state.prepare(first)
        let old = Task { await workspace.refreshSharedPDFAnnotations() }
        await fulfillment(of: [first], timeout: 5)
        let second = expectation(description: "second refresh")
        AuditDelayedProtocol.state.expect(second)
        let new = Task { await workspace.refreshSharedPDFAnnotations() }
        await fulfillment(of: [second], timeout: 5)
        AuditDelayedProtocol.state.respond(1, body: #"{"attachmentKey":"PDF00001","fileName":"p.pdf","annots":[]}"#)
        await new.value
        AuditDelayedProtocol.state.respond(0, body: "{\"attachmentKey\":\"PDF00001\",\"fileName\":\"p.pdf\",\"annots\":[\(json)]}")
        await old.value
        XCTAssertTrue(workspace.documentSharedPDFMarks.isEmpty)
        XCTAssertNil(workspace.sharedPDFAnnotationsError)

        let third = expectation(description: "third refresh")
        AuditDelayedProtocol.state.expect(third)
        let stale = Task { await workspace.refreshSharedPDFAnnotations() }
        await fulfillment(of: [third], timeout: 5)
        workspace.currentArticle = nil
        AuditDelayedProtocol.state.respond(2, body: "{\"attachmentKey\":\"PDF00001\",\"fileName\":\"p.pdf\",\"annots\":[\(json)]}")
        await stale.value
        XCTAssertTrue(workspace.documentSharedPDFMarks.isEmpty)
        XCTAssertFalse(workspace.pdfDocument?.page(at: 0)?.annotations.contains { $0.userName == "Atelier Mac mac-1" } == true)
    }

    @MainActor func testFetchAppliesMacMarksAndKeepsCacheOnFailure() async throws {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [SharedMarksProtocol.self]
        let workspace = WorkspaceModel()
        workspace.gallery = GalleryModel(address: URL(string: "https://mac.test")!, token: "fixture", session: URLSession(configuration: config))
        workspace.sharedPDFAnnotations = SharedPDFAnnotations(directory: nil)
        workspace.pdfAnnotations = PDFAnnotations(directory: nil)
        workspace.currentArticle = LibraryArticle(key: "ARTICLE1", title: "Paper", creators: "Author", year: "2020", publication: "", hasPdf: true, pdfKey: "PDF00001", pdfFile: "p.pdf")
        await workspace.refreshSharedPDFAnnotations()
        XCTAssertNil(workspace.sharedPDFAnnotationsError)
        XCTAssertEqual(workspace.documentSharedPDFMarks.count, 1)
        XCTAssertTrue(workspace.pdfDocument?.page(at: 0)?.annotations.contains { $0.userName == "Atelier Mac mac-1" } == true)
        // Same attachment identity, unavailable filename endpoint: cached marks must stay.
        workspace.currentArticle = LibraryArticle(key: "ARTICLE1", title: "Paper", creators: "Author", year: "2020", publication: "", hasPdf: true, pdfKey: "PDF00001", pdfFile: "offline.pdf")
        await workspace.refreshSharedPDFAnnotations()
        XCTAssertNotNil(workspace.sharedPDFAnnotationsError)
        XCTAssertEqual(workspace.documentSharedPDFMarks.count, 1)
    }
}

private final class SharedMarksProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let online = request.url?.path == "/remote/v1/zotero/annotations/PDF00001" && request.url?.query == "file=p.pdf"
        let body = #"{"attachmentKey":"PDF00001","fileName":"p.pdf","annots":[{"id":"mac-1","page":1,"rects":[[0.1,0.2,0.3,0.05]],"kind":"ul","text":"passage","note":"Mac"}]}"#
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: online ? 200 : 503, httpVersion: nil, headerFields: ["Content-Type":"application/json"])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8)); client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
