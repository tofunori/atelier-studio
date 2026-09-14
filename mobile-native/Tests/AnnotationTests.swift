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

    @MainActor func testAcknowledgedAnnotationRemovesReadingNoteButFailedOrEditedVersionSurvives() throws {
        let model = WorkspaceModel()
        model.readingNotes = DocumentReadingNotes(directory: nil)
        let source = "Une phrase à vérifier."
        let passage = DocumentPassage(documentID: model.documentID, fileName: "results.tex", location: "ligne 1",
                                      text: source, sourceRange: NSRange(location: 0, length: (source as NSString).length), selectedText: source)
        try model.readingNotes.upsert(documentKey: model.readingNoteKey, fileName: passage.fileName, location: passage.location,
                                      selectedText: source, sourceText: source, sourceRange: passage.sourceRange!, source: source,
                                      note: "Clarifier")
        let note = try XCTUnwrap(model.documentReadingNotes.first)
        model.chat.isPreview = true
        model.chat.select(.init(id: "annotation-send", title: "Annotation", provider: "codex", model: nil, projectId: nil, status: "idle"), workspace: model)
        model.queueReadingNotesToChat([note])
        let reference = try XCTUnwrap(model.annotationReferencesForCurrentChatSend().first)
        model.consumeAnnotationReferences([reference])
        XCTAssertTrue(model.documentReadingNotes.isEmpty)

        try model.readingNotes.upsert(documentKey: model.readingNoteKey, fileName: passage.fileName, location: passage.location,
                                      selectedText: source, sourceText: source, sourceRange: passage.sourceRange!, source: source,
                                      note: "Garder cette note")
        let edited = try XCTUnwrap(model.documentReadingNotes.first)
        let staleReference = AnnotationSendReference(id: edited.id, updatedAt: edited.updatedAt)
        try model.readingNotes.upsert(id: edited.id, documentKey: model.readingNoteKey, fileName: passage.fileName, location: passage.location,
                                      selectedText: source, sourceText: source, sourceRange: passage.sourceRange!, source: source,
                                      note: "Note modifiée")
        model.consumeAnnotationReferences([staleReference])
        XCTAssertEqual(model.documentReadingNotes.first?.note, "Note modifiée")
    }

    @MainActor func testRemoteDocumentUpdateKeepsConflictAndAdoptsWithoutNetwork() throws {
        let model = WorkspaceModel()
        let item = GalleryArtifact(name: "results.tex", data: Data("Avant".utf8))
        try model.openArtifact(item, data: Data("Avant".utf8))
        model.receiveDocumentVersion("Après", for: item.id, expectedSource: "Avant")
        XCTAssertEqual(model.source, "Après")
        XCTAssertEqual(model.currentDocumentUpdate?.previous, "Avant")
        XCTAssertEqual(model.currentDocumentUpdate?.current, "Après")
        XCTAssertEqual(model.currentDocumentUpdate?.applied, true)

        model.source = "Brouillon local"
        model.receiveDocumentVersion("Version Mac", for: item.id, expectedSource: "Après")
        XCTAssertEqual(model.source, "Brouillon local")
        XCTAssertEqual(model.currentDocumentUpdate?.applied, false)
        XCTAssertEqual(model.currentDocumentUpdate?.conflict, true)
        XCTAssertTrue(model.adoptIncomingDocument())
        XCTAssertEqual(model.source, "Version Mac")
        XCTAssertEqual(model.recoveredDrafts[item.id], "Brouillon local")
        XCTAssertEqual(model.currentDocumentUpdate?.applied, true)
    }

    @MainActor func testPendingRemoteVersionSurvivesReturningThroughGalleryBookmark() throws {
        let model = WorkspaceModel(); model.chat.isPreview = true
        let item = GalleryArtifact(name: "results.tex", fileID: "results", projectID: "project")
        try model.openArtifact(item, data: Data("Avant".utf8))
        model.source = "Brouillon local"
        model.receiveDocumentVersion("Version Mac", for: item.id, expectedSource: "Avant")
        model.navigate(to: .chat)
        model.navigate(to: .gallery)
        XCTAssertEqual(model.source, "Brouillon local")
        XCTAssertEqual(model.currentDocumentUpdate?.current, "Version Mac")
        XCTAssertFalse(model.currentDocumentUpdate?.applied ?? true)
        XCTAssertTrue(model.adoptIncomingDocument())
        XCTAssertEqual(model.source, "Version Mac")
    }

    @MainActor func testReplacingDocumentQuoteDropsOnlyTheOldAnnotationReferences() throws {
        let model = WorkspaceModel(); model.readingNotes = DocumentReadingNotes(directory: nil)
        let source = "Première phrase.\nDeuxième phrase."
        let item = GalleryArtifact(name: "results.tex", data: Data(source.utf8))
        try model.openArtifact(item, data: Data(source.utf8))
        model.chat.isPreview = true
        model.chat.select(.init(id: "quote-replace", title: "Annotations", provider: "codex", model: nil,
                                projectId: nil, status: "idle"), workspace: model)
        let firstText = "Première phrase."
        try model.readingNotes.upsert(documentKey: model.readingNoteKey, fileName: item.name, location: "ligne 1",
                                      selectedText: firstText, sourceText: firstText,
                                      sourceRange: NSRange(location: 0, length: (firstText as NSString).length), source: source,
                                      note: "Vérifier")
        let note = try XCTUnwrap(model.documentReadingNotes.first)
        model.queueReadingNotesToChat([note])
        let oldQuoteID = try XCTUnwrap(model.chat.quote?.id)
        XCTAssertEqual(model.annotationReferencesByQuote[oldQuoteID]?.map(\.id), [note.id])

        let passage = DocumentPassage(documentID: model.documentID, fileName: item.name, location: "ligne 2",
                                      text: "Deuxième phrase.")
        model.addDocumentPassageToChat(passage)
        XCTAssertNotEqual(model.chat.quote?.id, oldQuoteID)
        XCTAssertTrue(model.annotationReferencesForCurrentChatSend().isEmpty)
        XCTAssertTrue(model.annotationReferencesByQuote[oldQuoteID] == nil)
        XCTAssertNotNil(model.readingNotes.note(id: note.id))
    }

    @MainActor func testQueuedAnnotationIsRemovedOnlyAfterDeliveredAcknowledgement() throws {
        let model = WorkspaceModel(); model.readingNotes = DocumentReadingNotes(directory: nil)
        let source = "Phrase à vérifier."
        let item = GalleryArtifact(name: "results.tex", data: Data(source.utf8))
        try model.openArtifact(item, data: Data(source.utf8))
        model.chat.isPreview = true
        let thread = RemoteChatModel.Thread(id: "queue-ack", title: "Annotations", provider: "codex", model: nil,
                                            projectId: nil, status: "idle")
        model.chat.select(thread, workspace: model)
        try model.readingNotes.upsert(documentKey: model.readingNoteKey, fileName: item.name, location: "ligne 1",
                                      selectedText: source, sourceText: source,
                                      sourceRange: NSRange(location: 0, length: (source as NSString).length), source: source,
                                      note: "Confirmer cette formulation")
        let note = try XCTUnwrap(model.documentReadingNotes.first)
        model.queueReadingNotesToChat([note])
        model.chat.enqueue(workspace: model)
        let prepared = try XCTUnwrap(model.chat.prepared.first)
        XCTAssertEqual(prepared.annotationReferences?.map(\.id), [note.id])

        // A failed or merely queued send keeps both the queue entry and note.
        model.chat.reconcilePreparedAcknowledgements(workspace: model)
        XCTAssertEqual(model.chat.prepared.map(\.id), [prepared.id])
        XCTAssertNotNil(model.readingNotes.note(id: note.id))

        // The gateway's durable user row is the acknowledgement boundary.
        model.chat.rows.append(.init(id: "delivered", kind: "user", text: prepared.text,
                                     turn: prepared.id, messageID: prepared.id))
        model.chat.reconcilePreparedAcknowledgements(workspace: model)
        XCTAssertTrue(model.chat.prepared.isEmpty)
        XCTAssertNil(model.readingNotes.note(id: note.id))
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
        XCTAssertEqual(model.documentMode, .reading)
    }
}
