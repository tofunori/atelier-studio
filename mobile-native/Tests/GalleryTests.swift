import XCTest
import PDFKit
import UIKit
@testable import AtelierUI

final class GalleryTests: XCTestCase {
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
