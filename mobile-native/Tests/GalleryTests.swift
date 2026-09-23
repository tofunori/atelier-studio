import XCTest
import PDFKit
import UIKit
@testable import AtelierUI

final class GalleryTests: XCTestCase {
    @MainActor func testFavoriteMutationSurvivesAnOlderRefreshResponse() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [AuditDelayedProtocol.self]
        let gallery = GalleryModel(address: URL(string: "https://favorites.test")!, token: "fixture", session: URLSession(configuration: config))
        gallery.projects = [.init(projectId: "p", name: "Project")]; gallery.selectedProject = "p"
        let item = GalleryArtifact(name: "model.py", fileID: "f", projectID: "p", favorite: false)
        gallery.remoteItems = [item]
        let refreshing = expectation(description: "refresh started")
        AuditDelayedProtocol.state.prepare(refreshing)
        let refresh = Task { await gallery.refresh() }
        await fulfillment(of: [refreshing], timeout: 5)
        let saving = expectation(description: "save started")
        AuditDelayedProtocol.state.expect(saving)
        let save = Task { try await gallery.setFavorite(item, on: true) }
        await fulfillment(of: [saving], timeout: 5)
        AuditDelayedProtocol.state.respond(1, body: #"{"favorite":true}"#)
        try await save.value
        AuditDelayedProtocol.state.respond(0, body: #"{"items":[{"fileId":"f","name":"model.py","size":8,"favorite":false}]}"#)
        await refresh.value
        XCTAssertEqual(gallery.remoteItems.first?.favorite, true)
        XCTAssertTrue(gallery.favoriteRequests.isEmpty)
    }
    func testPythonAndFavoritesFiltersCombineWithSearch() throws {
        let python = GalleryArtifact(name: "scripts/Model.PY", fileID: "a", projectID: "p", favorite: true)
        XCTAssertEqual(python.kind, "Python")
        XCTAssertTrue(python.supported)
        var filter = GalleryFilterState()
        filter.type = "Python"; filter.favoritesOnly = true; filter.query = "model"
        XCTAssertTrue(filter.matches(python))
        XCTAssertFalse(filter.matches(GalleryArtifact(name: "Model.py")))
        XCTAssertFalse(filter.matches(GalleryArtifact(name: "Model.pdf", favorite: true)))
        filter.query = "unrelated"
        XCTAssertFalse(filter.matches(python))
        let legacy = try JSONDecoder().decode(GalleryArtifact.self, from: JSONEncoder().encode(GalleryArtifact(name: "old.py")))
        XCTAssertNil(legacy.favorite)
    }

    func testRemoteCacheEvictsLeastRecentlyUsedBytesAndRejectsOversizedEntry() {
        var cache = ArtifactDataCache(limit: 10)
        cache.insert(Data(repeating: 1, count: 4), for: "a")
        cache.insert(Data(repeating: 2, count: 4), for: "b")
        XCTAssertNotNil(cache.value(for: "a"))
        cache.insert(Data(repeating: 3, count: 4), for: "c")
        XCTAssertNil(cache.value(for: "b"))
        XCTAssertNotNil(cache.value(for: "a"))
        XCTAssertEqual(cache.byteCount, 8)
        cache.insert(Data(count: 11), for: "huge")
        XCTAssertNil(cache.value(for: "huge"))
        cache.insert(Data(count: 1), for: "a")
        XCTAssertEqual(cache.byteCount, 5)
        cache.remove("a"); XCTAssertEqual(cache.byteCount, 4)
    }

    @MainActor func testThumbnailDownsamplesLargeImageWithoutChangingSource() async throws {
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        let image = UIGraphicsImageRenderer(size: CGSize(width: 3000, height: 1000), format: format).image { context in
            UIColor.blue.setFill(); context.fill(CGRect(x: 0, y: 0, width: 3000, height: 1000))
        }
        let data = try XCTUnwrap(image.pngData())
        let rendered = await ArtifactPreviewRenderer.shared.render(data, pdf: false)
        let thumbnail = try XCTUnwrap(rendered?.cgImage)
        XCTAssertEqual(thumbnail.width, 600)
        XCTAssertEqual(thumbnail.height, 200)
        XCTAssertEqual(UIImage(data: data)?.cgImage?.width, 3000)
        let invalid = await ArtifactPreviewRenderer.shared.render(Data("invalid".utf8), pdf: false)
        XCTAssertNil(invalid)
        let pdf = try XCTUnwrap(WorkspaceModel().pdfDocument?.dataRepresentation())
        let pdfPreview = await ArtifactPreviewRenderer.shared.render(pdf, pdf: true)
        XCTAssertNotNil(pdfPreview)
    }

    @MainActor func testGalleryFailureKeepsSameProjectAndClearsOtherProject() async {
        let gallery = auditGallery()
        gallery.projects = [.init(projectId: "p", name: "P"), .init(projectId: "q", name: "Q")]
        gallery.selectedProject = "p"
        gallery.remoteItems = [.init(name: "known.pdf", fileID: "f", projectID: "p")]
        await gallery.refresh()
        XCTAssertEqual(gallery.remoteItems.map(\.name), ["known.pdf"])
        XCTAssertNotNil(gallery.error)
        gallery.selectedProject = "q"
        await gallery.refresh()
        XCTAssertTrue(gallery.remoteItems.isEmpty)
        XCTAssertFalse(gallery.busy)
    }

    @MainActor func testLibraryReturnsToCachedAllArticlesAfterCollectionFailure() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let article = LibraryArticle(key: "a", title: "Cached", creators: "Author", year: "2026", publication: "Journal", hasPdf: true, pdfKey: nil, pdfFile: nil)
        try JSONEncoder().encode([article]).write(to: folder.appendingPathComponent("articles.json"))
        let library = LibraryModel(folder: folder)
        let gallery = auditGallery()
        library.selectedCollection = 9
        await library.refresh(using: gallery)
        XCTAssertTrue(library.articles.isEmpty)
        library.selectedCollection = 0
        await library.refresh(using: gallery)
        XCTAssertEqual(library.articles.map(\.key), ["a"])
        XCTAssertNotNil(library.error)
    }

    @MainActor func testCancelledLibraryRefreshDoesNotShowConnectionError() async {
        let library = LibraryModel(folder: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        let gallery = auditGallery()
        let task = Task { await library.refresh(using: gallery) }
        task.cancel()
        await task.value
        XCTAssertNil(library.error)
        XCTAssertFalse(library.busy)
    }

    @MainActor private func auditGallery() -> GalleryModel {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AuditOfflineProtocol.self]
        return GalleryModel(address: URL(string: "https://audit.invalid")!, token: "test", session: URLSession(configuration: configuration))
    }

    @MainActor func testDelayedResponsesCannotReplaceNewerProjectsOrChangedLibrarySelection() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AuditDelayedProtocol.self]
        let gallery = GalleryModel(address: URL(string: "https://delayed.invalid")!, token: "test", session: URLSession(configuration: configuration))
        let firstStarted = XCTestExpectation(description: "first request")
        AuditDelayedProtocol.state.prepare(firstStarted)
        let first = Task { await gallery.refresh() }
        let firstWait = await XCTWaiter.fulfillment(of: [firstStarted], timeout: 2)
        XCTAssertEqual(firstWait, .completed)
        let secondStarted = XCTestExpectation(description: "second request")
        AuditDelayedProtocol.state.expect(secondStarted)
        let second = Task { try await gallery.loadProjects() }
        let secondWait = await XCTWaiter.fulfillment(of: [secondStarted], timeout: 2)
        XCTAssertEqual(secondWait, .completed)
        AuditDelayedProtocol.state.respond(1, body: #"{"projects":[{"projectId":"new","name":"New"}]}"#)
        try await second.value
        AuditDelayedProtocol.state.respond(0, body: #"{"projects":[{"projectId":"old","name":"Old"}]}"#)
        await first.value
        XCTAssertEqual(gallery.projects.map(\.id), ["new"])
        XCTAssertEqual(gallery.selectedProject, "new")
        XCTAssertNil(gallery.error)
        XCTAssertFalse(gallery.busy)

        let library = LibraryModel(folder: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        let thirdStarted = XCTestExpectation(description: "library request")
        AuditDelayedProtocol.state.expect(thirdStarted)
        let third = Task { await library.refresh(using: gallery) }
        let thirdWait = await XCTWaiter.fulfillment(of: [thirdStarted], timeout: 2)
        XCTAssertEqual(thirdWait, .completed)
        library.selectedCollection = 99
        let payload = #"{"items":[{"key":"old","title":"Old","creators":"A","year":"2026","publication":"J","hasPdf":true}],"collections":[]}"#
        AuditDelayedProtocol.state.respond(2, body: payload)
        await third.value
        XCTAssertTrue(library.articles.isEmpty)
        XCTAssertNil(library.error)

        let fourthStarted = XCTestExpectation(description: "connection request")
        AuditDelayedProtocol.state.expect(fourthStarted)
        let fourth = Task { await library.refresh(using: gallery) }
        let fourthWait = await XCTWaiter.fulfillment(of: [fourthStarted], timeout: 2)
        XCTAssertEqual(fourthWait, .completed)
        gallery.connectionRevision = UUID()
        AuditDelayedProtocol.state.respond(3, body: payload)
        await fourth.value
        XCTAssertTrue(library.articles.isEmpty)
        XCTAssertNil(library.error)

        let fifthStarted = XCTestExpectation(description: "cancelled request")
        AuditDelayedProtocol.state.expect(fifthStarted)
        let fifth = Task { await library.refresh(using: gallery) }
        let fifthWait = await XCTWaiter.fulfillment(of: [fifthStarted], timeout: 2)
        XCTAssertEqual(fifthWait, .completed)
        fifth.cancel()
        await fifth.value
        XCTAssertTrue(library.articles.isEmpty)
        XCTAssertNil(library.error)
        XCTAssertFalse(library.busy)
    }
    @MainActor func testSwitchingArtifactsPreservesEditedSourceAndChatDraft() throws {
        let model = WorkspaceModel()
        let first = GalleryArtifact(name: "a.tex", data: Data("original".utf8))
        let second = GalleryArtifact(name: "b.tex", data: Data("second".utf8))
        try model.openArtifact(first, data: first.data!)
        model.source = "edited"
        model.draft = "chat draft"
        try model.openArtifact(second, data: second.data!)
        try model.openArtifact(first, data: first.data!)
        XCTAssertEqual(model.source, "edited")
        XCTAssertEqual(model.documentID, first.id)
        XCTAssertEqual(model.draft, "chat draft")
    }
    @MainActor func testPDFAnnotationsSurviveGalleryNavigation() throws {
        let model = WorkspaceModel()
        let data = try XCTUnwrap(model.pdfDocument?.dataRepresentation())
        let pdf = GalleryArtifact(name: "article.pdf", data: data)
        try model.openArtifact(pdf, data: data)
        let document = try XCTUnwrap(model.pdfDocument)
        let page = try XCTUnwrap(document.page(at: 0))
        page.addAnnotation(PDFAnnotation(bounds: CGRect(x: 0, y: 0, width: 10, height: 10), forType: .highlight, withProperties: nil))
        let count = page.annotations.count
        try model.openArtifact(GalleryArtifact(name: "other.tex"), data: Data("other".utf8))
        try model.openArtifact(pdf, data: data)
        XCTAssertTrue(model.pdfDocument === document)
        XCTAssertEqual(model.pdfDocument?.page(at: 0)?.annotations.count, count)
    }
    @MainActor func testOpeningImageClearsPDFAndSelection() throws {
        let model = WorkspaceModel()
        let image = UIGraphicsImageRenderer(size: CGSize(width: 20, height: 20)).image { ctx in
            UIColor.red.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: 20, height: 20))
        }
        let data = try XCTUnwrap(image.pngData())
        try model.openArtifact(GalleryArtifact(name: "figure.png"), data: data)
        XCTAssertNotNil(model.image)
        XCTAssertNil(model.pdfDocument)
        XCTAssertNil(model.activePassage)
        XCTAssertEqual(model.currentName, "figure.png")
    }
    @MainActor func testInvalidPDFKeepsCurrentDocument() throws {
        let model = WorkspaceModel()
        let previous = model.pdfDocument
        XCTAssertThrowsError(try model.openArtifact(GalleryArtifact(name: "bad.pdf"), data: Data("bad".utf8)))
        XCTAssertTrue(model.pdfDocument === previous)
    }
}

private final class AuditOfflineProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet)) }
    override func stopLoading() {}
}

final class AuditDelayedProtocol: URLProtocol, @unchecked Sendable {
    final class State: @unchecked Sendable {
        private let lock = NSLock()
        private var requests: [AuditDelayedProtocol] = []
        private var started: XCTestExpectation?
        func prepare(_ expectation: XCTestExpectation) { lock.withLock { requests = []; started = expectation } }
        func expect(_ expectation: XCTestExpectation) { lock.withLock { started = expectation } }
        func register(_ request: AuditDelayedProtocol) {
            let signal = lock.withLock { requests.append(request); return started }
            signal?.fulfill()
        }
        func respond(_ index: Int, body: String) {
            let request = lock.withLock { requests.indices.contains(index) ? requests[index] : nil }
            request?.respond(Data(body.utf8))
        }
    }
    static let state = State()
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { Self.state.register(self) }
    override func stopLoading() {}
    private func respond(_ data: Data) {
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
}

final class PDFReadingTests: XCTestCase {
    @MainActor func testUniqueTopTextStaysInBodyAndRepeatedHeaderRemainsAvailable() async throws {
        let bytes = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 500, height: 700)).pdfData { context in
            for index in 0..<3 {
                context.beginPage()
                (index == 0 ? "Unique chapter title" : "Journal 2026" as NSString).draw(at: CGPoint(x: 40, y: 20), withAttributes: [.font: UIFont.systemFont(ofSize: 16)])
                ("Body text" as NSString).draw(at: CGPoint(x: 40, y: 100), withAttributes: [.font: UIFont.systemFont(ofSize: 16)])
            }
        }
        let reader = PDFReadingExtractor(bytes: bytes)
        let first = try await reader.page(0), second = try await reader.page(1)
        XCTAssertTrue(first.blocks.contains { $0.text.contains("Unique chapter title") })
        XCTAssertTrue(second.blocks.contains { $0.text.contains("Body text") })
        XCTAssertTrue(second.margins.contains { $0.text.contains("Journal 2026") })
    }

    @MainActor func testPDFRestoresRequestedPageAfterLayoutBecomesAvailable() throws {
        let bytes = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 500, height: 700)).pdfData { context in
            context.beginPage(); context.beginPage(); context.beginPage()
        }
        let document = try XCTUnwrap(PDFDocument(data: bytes))
        let view = PageRestoringPDFView(frame: .zero)
        view.autoScales = true; view.displayMode = .singlePageContinuous
        view.document = document; view.restorePageWhenReady(1)
        view.frame = CGRect(x: 0, y: 0, width: 390, height: 650)
        view.layoutIfNeeded()
        XCTAssertEqual(document.index(for: try XCTUnwrap(view.currentPage)), 1)
    }

    @MainActor func testSpacingRasterScalesPDFContentToFullImage() throws {
        let bytes = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 500, height: 700)).pdfData { context in
            context.beginPage()
            UIColor.black.setFill(); context.cgContext.fill(CGRect(x: 100, y: 100, width: 100, height: 100))
        }
        let document = try XCTUnwrap(PDFDocument(data: bytes))
        let page = try XCTUnwrap(document.page(at: 0))
        let image = try XCTUnwrap(PDFReadingExtractor.rasterForSpacing(of: page))
        XCTAssertGreaterThan(image.width, 1000)
        let data = try XCTUnwrap(image.dataProvider?.data)
        let pixels = try XCTUnwrap(CFDataGetBytePtr(data))
        var dark = 0, count = 0
        for y in stride(from: 0, to: image.height, by: 8) {
            for x in stride(from: 0, to: image.width, by: 8) {
                let offset = y * image.bytesPerRow + x * 4
                if pixels[offset] < 50 && pixels[offset + 1] < 50 && pixels[offset + 2] < 50 { dark += 1 }
                count += 1
            }
        }
        XCTAssertEqual(Double(dark) / Double(count), 10_000.0 / 350_000.0, accuracy: 0.002)
    }

    func testSpacingRecoveryKeepsEveryOriginalNonWhitespaceCharacter() {
        XCTAssertEqual(PDFReadingSpacing.repair("Glaciermassloss", recognized: "Glacier mass loss"), "Glacier mass loss")
        XCTAssertEqual(PDFReadingSpacing.repair("temperature‐indexmelt", recognized: "temperature-index melt"), "temperature‐index melt")
        XCTAssertEqual(PDFReadingSpacing.repair("Laﬁgure2", recognized: "La figure 2"), "La ﬁgure 2")
        // A recognition mistake must not change a scientific value, exponent, letter or punctuation.
        for (source, recognized) in [("0.24myr−1", "0.25 m yr-1"), ("α=0.42", "a = 0.42"), ("m−2", "m2")] {
            XCTAssertEqual(PDFReadingSpacing.repair(source, recognized: recognized), source)
        }
    }

    func testParagraphGroupingPreservesColumnsAndSourceCharacters() {
        let lines = [PDFReadingExtractor.Line(text: "Left first", bounds: CGRect(x: 10, y: 700, width: 200, height: 10)),
                     .init(text: "left continuation", bounds: CGRect(x: 10, y: 687, width: 200, height: 10)),
                     .init(text: "Right first", bounds: CGRect(x: 310, y: 700, width: 200, height: 10)),
                     .init(text: "right continuation", bounds: CGRect(x: 310, y: 687, width: 200, height: 10))]
        let blocks = PDFReadingExtractor.blocks(lines, pageBounds: CGRect(x: 0, y: 0, width: 600, height: 800), firstPage: false)
        XCTAssertEqual(blocks.map(\.text), ["Left first left continuation", "Right first right continuation"])
    }

    @MainActor func testPDFReadingModesNameAndPageSurviveNavigation() throws {
        let workspace = WorkspaceModel()
        let bytes = try XCTUnwrap(workspace.pdfDocument?.dataRepresentation())
        let artifact = GalleryArtifact(name: "paper.pdf", data: bytes)
        try workspace.openArtifact(artifact, data: bytes)
        XCTAssertEqual(workspace.availableDocumentModes, [.pdf, .reading])
        workspace.documentMode = .reading
        XCTAssertEqual(workspace.currentName, "paper.pdf")
        try workspace.openArtifact(GalleryArtifact(name: "source.tex"), data: Data("Text".utf8))
        XCTAssertEqual(workspace.availableDocumentModes, [.reading, .source])
        try workspace.openArtifact(artifact, data: bytes)
        XCTAssertEqual(workspace.documentMode, .reading)
        XCTAssertEqual(workspace.currentName, "paper.pdf")
    }

    @MainActor func testExtractionPreservesTextAndCancelledDocumentCannotClearCurrentPages() async throws {
        let bytes = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 500, height: 700)).pdfData { context in
            context.beginPage()
            ("Glacier albedo is 0.42.\nSecond paragraph." as NSString).draw(at: CGPoint(x: 40, y: 40), withAttributes: [.font: UIFont.systemFont(ofSize: 16)])
            context.beginPage() // An image-only or empty page must offer the original, not invented text.
        }
        let model = PDFReadingModel(), id = UUID()
        await model.load(page: 0, documentID: id, bytes: bytes)
        let page = try XCTUnwrap(model.content(0, documentID: id))
        XCTAssertTrue(page.blocks.map(\.text).joined(separator: " ").contains("Glacier albedo is 0.42."))
        let cancelled = Task { await model.load(page: 0, documentID: UUID(), bytes: bytes) }
        cancelled.cancel(); await cancelled.value
        XCTAssertNotNil(model.content(0, documentID: id))
        await model.load(page: 1, documentID: id, bytes: bytes)
        XCTAssertTrue(try XCTUnwrap(model.content(1, documentID: id)).blocks.isEmpty)
        let other = UUID()
        await model.load(page: 0, documentID: other, bytes: Data("bad".utf8))
        XCTAssertNil(model.content(0, documentID: id))
        XCTAssertNotNil(model.failure(0, documentID: other))
    }
}

final class PDFAnnotationsTests: XCTestCase {
    @MainActor func testBundledPDFCanBeAnnotatedBeforeOpeningAnotherFile() throws {
        let workspace = WorkspaceModel(); workspace.pdfAnnotations = PDFAnnotations(directory: nil)
        XCTAssertFalse(workspace.pdfFingerprint.isEmpty)
        let passage = DocumentPassage(documentID: workspace.documentID, fileName: workspace.pdfName, location: "page 1", text: "Passage", regions: [.init(pageIndex: 0, bounds: CGRect(x: 20, y: 20, width: 40, height: 10))])
        try workspace.savePDFMark(passage: passage, style: .underline, note: "")
        XCTAssertEqual(workspace.documentPDFMarks.count, 1)
        XCTAssertThrowsError(try workspace.savePDFMark(passage: passage, style: .highlight, note: "", expectedKey: "previous-version"))
    }
    @MainActor func testLocalReimportRecoversMarksAfterOpeningAnotherDocumentAndRestarting() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let first = WorkspaceModel(); first.pdfAnnotations = PDFAnnotations(directory: folder)
        let bytes = try XCTUnwrap(first.pdfDocument?.dataRepresentation())
        try first.openArtifact(GalleryArtifact(name: "article.pdf", data: bytes), data: bytes)
        let passage = DocumentPassage(documentID: first.documentID, fileName: "article.pdf", location: "page 1", text: "Passage", regions: [.init(pageIndex: 0, bounds: CGRect(x: 20, y: 20, width: 40, height: 10))])
        try first.savePDFMark(passage: passage, style: .highlight, note: "Retrouver")
        let other = Data("Autre document".utf8)
        try first.openArtifact(GalleryArtifact(name: "other.txt", data: other), data: other)
        let restarted = WorkspaceModel(); restarted.pdfAnnotations = PDFAnnotations(directory: folder)
        try restarted.openArtifact(GalleryArtifact(name: "renamed.pdf", data: bytes), data: bytes)
        XCTAssertEqual(restarted.documentPDFMarks.count, 1)
        XCTAssertEqual(restarted.documentPDFMarks.first?.note, "Retrouver")
        XCTAssertEqual(restarted.pdfDocument?.page(at: 0)?.annotations.filter { $0.userName?.hasPrefix("Atelier PDFMark ") == true }.count, 1)
    }
    @MainActor func testMarksPersistWithoutCommentAndDeleteDurably() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let store = PDFAnnotations(directory: folder)
        var mark = fixtureMark()
        try store.save(mark)
        XCTAssertEqual(PDFAnnotations(directory: folder).marks(for: mark.documentKey), [mark])
        mark.note = "Commentaire"; mark.style = .highlight
        try store.save(mark)
        let restored = PDFAnnotations(directory: folder)
        XCTAssertEqual(restored.entries.count, 1)
        XCTAssertEqual(restored.entries.first?.note, "Commentaire")
        try restored.remove(mark.id)
        XCTAssertTrue(PDFAnnotations(directory: folder).entries.isEmpty)
    }
    @MainActor func testUnreadableArchiveIsNotOverwrittenAndFailedSaveDoesNotPublish() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let path = folder.appendingPathComponent("annotations.json")
        let bytes = Data("broken archive".utf8); try bytes.write(to: path)
        let store = PDFAnnotations(directory: folder)
        XCTAssertNotNil(store.loadError)
        XCTAssertThrowsError(try store.save(fixtureMark()))
        XCTAssertEqual(try Data(contentsOf: path), bytes)
        XCTAssertTrue(store.entries.isEmpty)
    }
    @MainActor func testOverlayReapplicationPreservesOriginalMarksAndDoesNotDuplicate() throws {
        let document = try XCTUnwrap(WorkspaceModel().pdfDocument)
        let page = try XCTUnwrap(document.page(at: 0))
        let original = PDFAnnotation(bounds: CGRect(x: 10, y: 10, width: 30, height: 10), forType: .highlight, withProperties: nil)
        original.userName = "Original"; page.addAnnotation(original)
        let mark = fixtureMark()
        PDFAnnotations.apply([mark], to: document)
        PDFAnnotations.apply([mark], to: document)
        XCTAssertEqual(page.annotations.filter { $0.userName?.hasPrefix("Atelier PDFMark ") == true }.count, 1)
        XCTAssertTrue(page.annotations.contains { $0 === original })
        XCTAssertEqual(page.annotations.first { $0.userName?.hasPrefix("Atelier PDFMark ") == true }?.type, "Underline")
        PDFAnnotations.apply([], to: document)
        XCTAssertTrue(page.annotations.contains { $0 === original })
        XCTAssertFalse(page.annotations.contains { $0.userName?.hasPrefix("Atelier PDFMark ") == true })
    }
    @MainActor func testProjectAndPDFVersionIdentityAndReopeningRestoresMarks() throws {
        let workspace = WorkspaceModel(); workspace.pdfAnnotations = PDFAnnotations(directory: nil)
        let data = try XCTUnwrap(workspace.pdfDocument?.dataRepresentation())
        let a = GalleryArtifact(name: "article.pdf", fileID: "f", projectID: "a")
        let b = GalleryArtifact(name: "article.pdf", fileID: "f", projectID: "b")
        try workspace.openArtifact(a, data: data)
        let key = workspace.pdfAnnotationKey
        let passage = DocumentPassage(documentID: workspace.documentID, fileName: a.name, location: "page 1", text: "passage", regions: [.init(pageIndex: 0, bounds: CGRect(x: 20, y: 20, width: 40, height: 10))])
        try workspace.savePDFMark(passage: passage, style: .underline, note: "")
        try workspace.openArtifact(b, data: data)
        XCTAssertNotEqual(workspace.pdfAnnotationKey, key)
        XCTAssertTrue(workspace.documentPDFMarks.isEmpty)
        try workspace.openArtifact(a, data: data)
        XCTAssertEqual(workspace.documentPDFMarks.count, 1)
        XCTAssertEqual(workspace.pdfDocument?.page(at: 0)?.annotations.filter { $0.userName?.hasPrefix("Atelier PDFMark ") == true }.count, 1)
        let replacement = PDFDocument(); replacement.insert(PDFPage(image: UIImage(systemName: "star")!)!, at: 0)
        let changed = try XCTUnwrap(replacement.dataRepresentation())
        try workspace.openArtifact(a, data: changed)
        XCTAssertNotEqual(workspace.pdfAnnotationKey, key)
        XCTAssertTrue(workspace.documentPDFMarks.isEmpty)
        XCTAssertEqual(workspace.pdfDocument?.pageCount, 1)
        XCTAssertEqual(workspace.pdfAnnotations.marks(for: key).count, 1)
        XCTAssertThrowsError(try workspace.savePDFMark(passage: DocumentPassage(documentID: UUID(), fileName: "wrong", location: "page 1", text: "text", regions: passage.regions), style: .highlight, note: ""))
    }
    @MainActor func testNavigationFromListRequestsTheMarkedPageEvenWithinPDFMode() throws {
        let workspace = WorkspaceModel()
        workspace.documentMode = .pdf
        let previous = workspace.pdfNavigationRequest
        var mark = fixtureMark()
        mark.note = "Repère"
        workspace.showPDFMark(mark)
        XCTAssertEqual(workspace.pdfPage, mark.page)
        XCTAssertNotEqual(workspace.pdfNavigationRequest, previous)
        XCTAssertEqual(workspace.documentMode, .pdf)
    }
    private func fixtureMark() -> PDFMark {
        PDFMark(id: UUID(), documentKey: "project:file:version", fileName: "article.pdf", text: "Passage",
                regions: [.init(page: 0, bounds: CGRect(x: 20, y: 20, width: 40, height: 10))], style: .underline, note: "", createdAt: Date())
    }
}
