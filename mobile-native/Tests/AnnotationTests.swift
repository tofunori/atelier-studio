import XCTest
import SwiftUI
import PDFKit
@testable import AtelierUI

final class AnnotationTests: XCTestCase {
    @MainActor func testSourceAnnotationPreservesReferenceAndExistingChatDraft() throws {
        let model = WorkspaceModel()
        model.documentMode = .source
        model.source = "Introduction\nUn passage à annoter\nSuite"
        let range = try XCTUnwrap(model.source.range(of: "Un passage à annoter"))
        model.selection = TextSelection(range: range)
        model.draft = "Brouillon déjà commencé"
        model.beginAnnotation()
        let note = try XCTUnwrap(model.annotationDraft)
        model.selection = nil // The keyboard can clear the original selection.
        note.note = "  Clarifier cette phrase.  "
        XCTAssertTrue(model.sendAnnotation(note))
        XCTAssertEqual(model.messages.last?.passage?.text, "Un passage à annoter")
        XCTAssertEqual(model.messages.last?.passage?.location, "ligne 2")
        XCTAssertEqual(model.messages.last?.text, "Clarifier cette phrase.")
        XCTAssertEqual(model.draft, "Brouillon déjà commencé")
        XCTAssertEqual(model.surface, .chat)
    }

    @MainActor func testPDFAnnotationUsesSelectedPageAndAddsHighlight() throws {
        let model = WorkspaceModel()
        let page = try XCTUnwrap(model.pdfDocument?.page(at: 1))
        let selected = try XCTUnwrap(page.selection(for: NSRange(location: 0, length: 7)))
        model.capturePDFSelection(selected)
        model.beginAnnotation()
        let draft = try XCTUnwrap(model.annotationDraft)
        XCTAssertEqual(draft.passage.location, "page 2")
        XCTAssertEqual(draft.passage.fileName, "notes.pdf")
        let count = page.annotations.count
        draft.note = "Vérifier ce passage."
        XCTAssertTrue(model.sendAnnotation(draft))
        XCTAssertGreaterThan(page.annotations.count, count)
        XCTAssertEqual(page.annotations.last?.contents, "Vérifier ce passage.")
    }

    @MainActor func testSourceLineReferencesSupportWindowsNewlines() throws {
        let model = WorkspaceModel()
        model.documentMode = .source
        model.source = "Titre\r\nPremière ligne\r\nDeuxième ligne\r\nFin"
        let range = try XCTUnwrap(model.source.range(of: "Première ligne\r\nDeuxième ligne"))
        model.selection = TextSelection(range: range)
        XCTAssertEqual(model.activePassage?.location, "lignes 2–3")
    }

    @MainActor func testEmptyAnnotationCannotSend() throws {
        let model = WorkspaceModel()
        let passage = DocumentPassage(documentID: model.documentID, fileName: "notes.tex", location: "ligne 1", text: "Texte")
        let draft = AnnotationDraft(passage: passage)
        draft.note = " \n "
        XCTAssertFalse(model.sendAnnotation(draft))
        XCTAssertTrue(model.messages.isEmpty)
        XCTAssertTrue(model.annotations.isEmpty)
    }

    @MainActor func testSettingsSnapshotDoesNotChangePastMessages() throws {
        let model = WorkspaceModel()
        model.configuration.modelID = "claude-opus-5"
        model.configuration.thinking = .high
        model.configuration.tools = [.web]
        model.draft = "Une question"
        model.send()
        model.configuration.modelID = "gpt-5.5"
        model.configuration.thinking = .low
        model.configuration.tools = []
        let message = try XCTUnwrap(model.messages.last)
        XCTAssertEqual(message.configuration.modelID, "claude-opus-5")
        XCTAssertEqual(message.configuration.thinking, .high)
        XCTAssertEqual(message.configuration.tools, [.web])
    }

    @MainActor func testImportSourceDoesNotExposeUnrelatedPDFOrStaleSelection() throws {
        let model = WorkspaceModel()
        let originalID = model.documentID
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".tex")
        try "Mon document".write(to: file, atomically: true, encoding: .utf8)
        defer { try? FileManager.default.removeItem(at: file) }
        model.capturePDFSelection(model.pdfDocument?.page(at: 0)?.selection(for: NSRange(location: 0, length: 5)))
        try model.importDocument(at: file)
        XCTAssertNotEqual(model.documentID, originalID)
        XCTAssertNil(model.pdfDocument)
        XCTAssertNil(model.pdfPassage)
        XCTAssertEqual(model.source, "Mon document")
        XCTAssertEqual(model.sourceName, file.lastPathComponent)
        XCTAssertEqual(model.documentMode, .source)
    }
}
