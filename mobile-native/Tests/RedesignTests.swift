import XCTest
import SwiftUI
@testable import AtelierUI

final class RedesignTests: XCTestCase {
    @MainActor func testSourceViewportRestoresAfterEditorRecreation() throws {
        let model = WorkspaceModel()
        let bytes = Data((0..<200).map { "print(\($0))" }.joined(separator: "\n").utf8)
        try model.openArtifact(GalleryArtifact(name: "long.py", data: bytes), data: bytes)
        let first = PositionRestoringSourceView(frame: CGRect(x: 0, y: 0, width: 390, height: 600))
        let coordinator = SyntaxSourceEditor.Coordinator(workspace: model)
        first.delegate = coordinator
        coordinator.update(first)
        first.layoutIfNeeded()
        first.setContentOffset(CGPoint(x: 0, y: 900), animated: false)
        coordinator.scrollViewDidScroll(first)
        XCTAssertEqual(model.sourceOffsets[model.documentID]?.y, 900)
        let second = PositionRestoringSourceView(frame: first.frame)
        let restored = SyntaxSourceEditor.Coordinator(workspace: model)
        second.delegate = restored
        restored.update(second)
        second.layoutIfNeeded()
        XCTAssertEqual(second.contentOffset.y, 900, accuracy: 1)
    }
    @MainActor func testDockKeepsSeparateFileAndArticleAcrossGalleryAndChat() throws {
        let model = WorkspaceModel()
        let file = GalleryArtifact(name: "results.tex", data: Data("Texte original".utf8))
        try model.openArtifact(file, data: file.data!)
        model.source = "Texte modifié"
        model.documentMode = .source
        model.readingOffsets[file.id] = 440
        model.switchWorkSurface(.gallery)
        XCTAssertEqual(model.surface, .gallery)
        let article = GalleryArtifact(name: "article.txt", data: Data("Article".utf8))
        try model.openArtifact(article, data: article.data!)
        model.documentOrigin = .articles
        model.readingOffsets[article.id] = 820
        model.documentMode = .reading
        model.draft = "Question en cours"
        model.switchWorkSurface(.chat)
        model.switchWorkSurface(.document)
        XCTAssertEqual(model.documentID, file.id)
        XCTAssertEqual(model.source, "Texte modifié")
        XCTAssertEqual(model.documentMode, .source)
        model.switchWorkSurface(.articles)
        XCTAssertEqual(model.documentID, article.id)
        XCTAssertEqual(model.documentMode, .reading)
        XCTAssertEqual(model.selectedWorkSurface, .articles)
        model.returnToDocumentList()
        XCTAssertEqual(model.surface, .articles)
        model.switchWorkSurface(.gallery)
        model.switchWorkSurface(.articles)
        XCTAssertEqual(model.documentID, article.id)
        XCTAssertEqual(model.surface, .document)
        XCTAssertEqual(model.readingOffsets[file.id], 440)
        XCTAssertEqual(model.readingOffsets[article.id], 820)
        XCTAssertEqual(model.draft, "Question en cours")
    }
    @MainActor func testDirectFileSwitchPreservesWorkingState() throws {
        let model = WorkspaceModel()
        model.surface = .chat
        model.switchWorkSurface(.document)
        XCTAssertEqual(model.surface, .chat)
        let bytes = Data("print('original')".utf8)
        try model.openArtifact(GalleryArtifact(name: "model.py", data: bytes), data: bytes)
        let documentID = model.documentID
        model.source = "print('edited')"
        model.draft = "Mon brouillon de question"
        model.composerSelection = TextSelection(insertionPoint: model.draft.endIndex)
        model.readingOffsets[documentID] = 640
        model.pdfPage = 3
        model.switchWorkSurface(.chat)
        model.switchWorkSurface(.document)
        XCTAssertEqual(model.surface, .document)
        XCTAssertEqual(model.documentID, documentID)
        XCTAssertEqual(model.source, "print('edited')")
        XCTAssertEqual(model.draft, "Mon brouillon de question")
        XCTAssertNotNil(model.composerSelection)
        XCTAssertEqual(model.readingOffsets[documentID], 640)
        XCTAssertEqual(model.pdfPage, 3)
    }
    func testLatexReadingKeepsExactSourceAndLineNumbers() throws {
        let text = "\\documentclass{article}\n\\begin{document}\n\\section{Titre}\n\nLe \\textbf{glacier} et \\cite{reference}.\nDeuxième ligne.\n\n\\end{document}"
        let blocks = LatexReadingBlock.parse(text)
        XCTAssertEqual(blocks.count, 2)
        XCTAssertEqual(blocks[1].firstLine, 5)
        XCTAssertEqual(blocks[1].lastLine, 6)
        XCTAssertEqual(blocks[1].source, "Le \\textbf{glacier} et \\cite{reference}.\nDeuxième ligne.")
        XCTAssertTrue(blocks[1].display.contains("**glacier**"))
    }
    func testReadingSelectionMapsAcrossFormattingWithoutGuessing() throws {
        let block = try XCTUnwrap(LatexReadingBlock.parse("Le \\textbf{glacier} et la neige.").first)
        XCTAssertEqual(block.selectedSource("Le glacier et")?.text, "Le \\textbf{glacier} et")
        XCTAssertEqual(block.selectedSource("glacier")?.text, "glacier")
        XCTAssertNil(block.selectedSource("glacier et"))
        let repeated = try XCTUnwrap(LatexReadingBlock.parse("La neige et la neige.").first)
        XCTAssertNil(repeated.selectedSource("neige"))
        XCTAssertEqual(repeated.selectedSource("neige", occurrence: 1, occurrences: 2)?.range, NSRange(location: 15, length: 5))
        XCTAssertNil(repeated.selectedSource("neige", occurrence: 1, occurrences: 3))
        XCTAssertEqual(repeated.selectedSource("neige", anchor: NSRange(location: 15, length: 5))?.occurrence, 1)
    }
    @MainActor func testReadingBatchPreservesDraftAndDirectQuoteUsesDocumentLabel() throws {
        let model = WorkspaceModel()
        model.readingNotes = DocumentReadingNotes(directory: nil)
        let file = GalleryArtifact(name: "notes.tex", data: Data("La neige.".utf8))
        try model.openArtifact(file, data: Data("La neige.".utf8))
        try model.readingNotes.upsert(documentKey: model.readingNoteKey, fileName: "notes.tex", location: "ligne 1",
            selectedText: "neige", sourceText: "neige", sourceRange: NSRange(location: 3, length: 5), source: model.source, note: "Préciser")
        model.chat.isPreview = true
        model.chat.select(.init(id: "notes", title: "Notes", provider: "codex", model: nil, projectId: nil, status: "idle"), workspace: model)
        model.draft = "Ma demande"
        model.addReadingNotesToChat()
        XCTAssertTrue(model.draft.hasPrefix("Ma demande\n\n"))
        XCTAssertFalse(model.draft.contains("Préciser"))
        XCTAssertTrue(model.chat.quote?.text.contains("Préciser") == true)
        XCTAssertEqual(model.documentReadingNotes.count, 1)
        model.addDocumentPassageToChat(.init(documentID: model.documentID, fileName: "notes.tex", location: "ligne 1", text: "neige"))
        XCTAssertTrue(model.chat.quote?.sourceLabel?.contains("notes.tex") == true)
        XCTAssertEqual(model.chat.quote?.text, "neige")
        XCTAssertTrue(model.draft.hasPrefix("Ma demande"))
    }
    @MainActor func testReadingNotesSeparateSameNamedRemoteFiles() throws {
        let model = WorkspaceModel()
        let a = GalleryArtifact(name: "main.tex", fileID: "folder-a-main", projectID: "project")
        let b = GalleryArtifact(name: "main.tex", fileID: "folder-b-main", projectID: "project")
        try model.openArtifact(a, data: Data("Texte".utf8)); let first = model.readingNoteKey
        try model.openArtifact(b, data: Data("Texte".utf8))
        XCTAssertNotEqual(first, model.readingNoteKey)
        let reopened = GalleryArtifact(name: "main.tex", fileID: "folder-a-main", projectID: "project")
        try model.openArtifact(reopened, data: Data("Texte".utf8))
        XCTAssertEqual(first, model.readingNoteKey)
    }
    func testRevisionRefusesChangedOrAmbiguousSource() {
        let target = SourceRevisionTarget(documentID: UUID(), threadID: "t", fileName: "a.tex", original: "Avant\nParagraphe\nAprès", passage: "Paragraphe")
        XCTAssertEqual(target.applying("Révision", to: target.original), "Avant\nRévision\nAprès")
        XCTAssertNil(target.applying("Révision", to: "Modification Mac"))
        let ambiguous = SourceRevisionTarget(documentID: UUID(), threadID: "t", fileName: "a.tex", original: "Texte Texte", passage: "Texte")
        XCTAssertNil(ambiguous.applying("Révision", to: ambiguous.original))
        XCTAssertEqual(SourceRevisionTarget.replacement(in: "Proposition\n```latex\nUn \\emph{texte}.\n```"), "Un \\emph{texte}.")
    }
    @MainActor func testFigureRegionClampsToImageAndHandlesReverseDrag() throws {
        let region = try XCTUnwrap(FigureAnnotationView.normalized(start: CGPoint(x: 90, y: 90), end: CGPoint(x: -20, y: 150), size: CGSize(width: 100, height: 100)))
        XCTAssertEqual(region.minX, 0)
        XCTAssertEqual(region.maxY, 1)
        XCTAssertEqual(region.width, 0.9, accuracy: 0.001)
        XCTAssertNil(FigureAnnotationView.normalized(start: .zero, end: .zero, size: .zero))
    }
    @MainActor func testLocalSaveUpdatesAttachmentAndConflictRecoveryKeepsDraft() async throws {
        let model = WorkspaceModel()
        let item = GalleryArtifact(name: "notes.tex", data: Data("original".utf8))
        model.gallery.localItems = [item]
        try model.openArtifact(item, data: item.data!)
        model.source = "modifié"
        await model.saveDocument()
        XCTAssertEqual(model.viewedArtifact?.data, Data("modifié".utf8))
        XCTAssertFalse(model.documentDirty)
        model.recoveredDrafts[item.id] = "brouillon récupéré"
        model.recoverDocumentDraft()
        XCTAssertEqual(model.source, "brouillon récupéré")
        XCTAssertTrue(model.documentDirty)
    }
    @MainActor func testArticleNotesPersistAndRepeatedSaveDoesNotDuplicate() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let library = LibraryModel(folder: folder)
        let passage = DocumentPassage(documentID: UUID(), fileName: "article.pdf", location: "page 2", text: "Passage", articleKey: "ABCD2345")
        let draft = AnnotationDraft(passage: passage); draft.note = "Première note"
        try library.save(draft)
        draft.note = "Note corrigée"; try library.save(draft)
        let reopened = LibraryModel(folder: folder)
        XCTAssertEqual(reopened.notes.count, 1)
        XCTAssertEqual(reopened.notes.first?.text, "Note corrigée")
        XCTAssertEqual(reopened.notes.first?.articleKey, "ABCD2345")
    }
    @MainActor func testReadingNotesPersistDistinctOccurrencesAndPreserveAnchorOnEdit() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let store = DocumentReadingNotes(directory: folder)
        let source = "❄️ neige et neige."
        let first = (source as NSString).range(of: "neige")
        let second = (source as NSString).range(of: "neige", options: .backwards)
        func save(_ range: NSRange) throws -> ReadingNote {
            try store.upsert(documentKey: "project/a.tex", fileName: "a.tex", location: "ligne 1",
                             selectedText: "neige", sourceText: "neige", sourceRange: range,
                             source: source, note: " Préciser ")
        }
        let a = try save(first), b = try save(second)
        XCTAssertNotEqual(a.id, b.id)
        XCTAssertEqual(a.resolvedRange(in: source), first)
        XCTAssertEqual(b.resolvedRange(in: source), second)
        XCTAssertNil(b.resolvedRange(in: "❄️ neige."))
        XCTAssertNil(a.resolvedRange(in: "Préfixe " + source))
        let updated = try store.upsert(id: a.id, documentKey: a.documentKey, fileName: "other.tex",
                                      location: "other", selectedText: "other", sourceText: "other",
                                      sourceRange: second, source: "changed", note: "Correction")
        XCTAssertEqual(updated.sourceRange, first)
        XCTAssertEqual(updated.fileName, "a.tex")
        let reopened = DocumentReadingNotes(directory: folder)
        XCTAssertNil(reopened.loadError)
        XCTAssertEqual(reopened.notes(for: a.documentKey).map(\.id), [a.id, b.id])
        XCTAssertEqual(reopened.notes(for: a.documentKey).first?.note, "Correction")
        XCTAssertTrue(reopened.notes(for: "other-project/a.tex").isEmpty)
        let prompt = DocumentReadingNotes.groupedPrompt(notes: reopened.notes(for: a.documentKey))
        XCTAssertTrue(prompt.contains("Correction"))
        XCTAssertTrue(prompt.contains("a.tex — ligne 1"))
        try reopened.remove(id: a.id)
        XCTAssertEqual(DocumentReadingNotes(directory: folder).notes(for: a.documentKey).map(\.id), [b.id])
    }

    @MainActor func testReadingNotesAllowUncommentedMarksAndRefuseInvalidAndCorruptArchiveWithoutOverwriting() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let store = DocumentReadingNotes(directory: folder)
        func save(_ store: DocumentReadingNotes, note: String, text: String = "neige") throws {
            try store.upsert(documentKey: "a", fileName: "a.tex", location: "ligne 1",
                             selectedText: "neige", sourceText: text, sourceRange: NSRange(location: 0, length: 5),
                             source: "neige", note: note)
        }
        try save(store, note: "   ")
        XCTAssertEqual(store.notes(for: "a").first?.note, "")
        try store.remove(id: try XCTUnwrap(store.notes(for: "a").first?.id))
        XCTAssertThrowsError(try save(store, note: "Note", text: "autre"))
        XCTAssertTrue(store.notes(for: "a").isEmpty)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let file = folder.appendingPathComponent("notes.json")
        let corrupt = Data("not-json".utf8)
        try corrupt.write(to: file)
        let broken = DocumentReadingNotes(directory: folder)
        XCTAssertNotNil(broken.loadError)
        XCTAssertThrowsError(try save(broken, note: "Note"))
        XCTAssertThrowsError(try broken.remove(id: UUID()))
        XCTAssertEqual(try Data(contentsOf: file), corrupt)
        XCTAssertTrue(broken.notes(for: "a").isEmpty)
    }

}

final class AnnotationPaletteTests: XCTestCase {
    @MainActor func testReadingStyleColorAndEmptyCommentPersistAndUndoPreservesIdentity() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let store = DocumentReadingNotes(directory: folder)
        let mark = try store.upsert(documentKey: "a", fileName: "a.tex", location: "ligne 1",
            selectedText: "neige", sourceText: "neige", sourceRange: NSRange(location: 0, length: 5), source: "neige", note: "", style: .underline, ink: .blue)
        let restored = DocumentReadingNotes(directory: folder)
        XCTAssertEqual(restored.notes(for: "a").first?.style, .underline)
        XCTAssertEqual(restored.notes(for: "a").first?.color, .blue)
        try restored.remove(id: mark.id)
        try restored.restore(mark)
        XCTAssertEqual(DocumentReadingNotes(directory: folder).notes(for: "a"), [mark])
        let draft = WorkspaceModel().readingDraft(for: mark)
        XCTAssertEqual(draft.markingStyle, .underline)
        XCTAssertEqual(draft.ink, .blue)
    }
    @MainActor func testLegacyArchivesDecodeWithDefaultPalette() throws {
        let store = DocumentReadingNotes(directory: nil)
        let mark = try store.upsert(documentKey: "a", fileName: "a.tex", location: "ligne 1", selectedText: "neige", sourceText: "neige", sourceRange: NSRange(location: 0, length: 5), source: "neige", note: "Note")
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(mark)) as? [String: Any])
        object.removeValue(forKey: "markingStyle"); object.removeValue(forKey: "ink")
        let old = try JSONDecoder().decode(ReadingNote.self, from: JSONSerialization.data(withJSONObject: object))
        XCTAssertEqual(old.color, .sage); XCTAssertEqual(old.style, .highlight)
        XCTAssertEqual(old.sourceRange, mark.sourceRange)
        let pdf = PDFMark(id: UUID(), documentKey: "pdf", fileName: "a.pdf", text: "neige", regions: [.init(page: 0, bounds: CGRect(x: 0, y: 0, width: 30, height: 10))], style: .underline, note: "", createdAt: Date())
        let decoded = try JSONDecoder().decode(PDFMark.self, from: JSONEncoder().encode(pdf))
        XCTAssertEqual(decoded.color, .sage); XCTAssertEqual(decoded.style, .underline)
    }
    @MainActor func testPDFColorPersistsAndChangesOverlayWithoutChangingAnchor() throws {
        let workspace = WorkspaceModel(); workspace.pdfAnnotations = PDFAnnotations(directory: nil)
        let passage = DocumentPassage(documentID: workspace.documentID, fileName: "a.pdf", location: "page 1", text: "neige", regions: [.init(pageIndex: 0, bounds: CGRect(x: 0, y: 0, width: 30, height: 10))])
        try workspace.savePDFMark(passage: passage, style: .underline, note: "", ink: .blue)
        let original = try XCTUnwrap(workspace.documentPDFMarks.first)
        try workspace.savePDFMark(passage: passage, id: original.id, style: .highlight, note: "", ink: .sand)
        let updated = try XCTUnwrap(workspace.documentPDFMarks.first)
        XCTAssertEqual(updated.regions, original.regions)
        XCTAssertEqual(updated.id, original.id)
        XCTAssertEqual(updated.color, .sand)
        let decoded = try JSONDecoder().decode(PDFMark.self, from: JSONEncoder().encode(updated))
        XCTAssertEqual(decoded.color, .sand)
    }
}

final class DocumentRefreshTests: XCTestCase {
    @MainActor func testFreshOpenReplacesCleanCacheAndKeepsDiff() throws {
        let model = WorkspaceModel(); model.chat.isPreview = true
        let file = GalleryArtifact(name: "test.tex", data: Data("old".utf8))
        try model.openArtifact(file, data: Data("old".utf8))
        model.saveCurrentDocument()
        try model.openArtifact(file, data: Data("new".utf8))
        XCTAssertEqual(model.source, "new")
        XCTAssertFalse(model.documentDirty)
        XCTAssertEqual(model.comparisonSources[file.id], "old")
        model.source = "draft"; model.saveCurrentDocument()
        try model.openArtifact(file, data: Data("newer".utf8))
        XCTAssertEqual(model.source, "draft")
    }
    @MainActor func testReturnFromChatKeepsRefreshedVersion() throws {
        let model = WorkspaceModel(); model.chat.isPreview = true
        let file = GalleryArtifact(name: "test.tex", data: Data("old".utf8))
        try model.openArtifact(file, data: Data("old".utf8))
        model.navigate(to: .chat)
        model.receiveDocumentVersion("new", for: file.id, expectedSource: "old")
        model.navigate(to: .gallery)
        XCTAssertEqual(model.source, "new")
        XCTAssertEqual(model.comparisonSources[file.id], "old")
    }
    @MainActor func testRefreshProtectsConcurrentAndDirtyEdits() throws {
        let model = WorkspaceModel(); model.chat.isPreview = true
        let file = GalleryArtifact(name: "test.tex", data: Data("old".utf8))
        try model.openArtifact(file, data: Data("old".utf8))
        model.receiveDocumentVersion("new", for: file.id, expectedSource: "old")
        XCTAssertEqual(model.source, "new")
        XCTAssertEqual(model.comparisonSources[file.id], "old")
        model.source = "my draft"
        model.receiveDocumentVersion("remote", for: file.id, expectedSource: "my draft")
        XCTAssertEqual(model.source, "my draft")
        XCTAssertTrue(model.remoteDocumentChanged)
        model.receiveDocumentVersion("remote", for: file.id, expectedSource: "new")
        XCTAssertEqual(model.source, "my draft")
    }
    func testDiffReconstructsBothSourcesIncludingUnicodeAndBlankLines() {
        for (old, new) in [("a\nb\nc", "a\nx\nc"), ("❄️\n\nb", "b\n❄️\n"), ("", "new"), ("old", "")] {
            let lines = DocumentChangeLine.compare(previous: old, current: new)
            XCTAssertEqual(lines.filter { $0.kind != .added }.map(\.text).joined(separator: "\n"), old)
            XCTAssertEqual(lines.filter { $0.kind != .removed }.map(\.text).joined(separator: "\n"), new)
        }
    }
}

final class DocumentReviewTests: XCTestCase {
    func testExactChunksRoundTripUnicodeBlankLinesAndFinalNewline() {
        let pairs = [
            ("avant\n\n❄️\nfin", "avant\n\n🌋\nfin\n"),
            ("début\nfin", "début\ninséré\nfin"),
            ("début\nretirer\nfin", "début\nfin"),
            ("", "ajout\n"),
            ("ancien\n", "")
        ]

        for (previous, current) in pairs {
            let session = DocumentReviewSession(previous: previous, current: current)
            XCTAssertEqual(session.renderedSource, current, "pending render changed the current source")
            XCTAssertEqual(session.applying(.accepted, to: nil).renderedSource, current)
            XCTAssertEqual(session.applying(.rejected, to: nil).renderedSource, previous,
                           "reject-all must restore the exact old source")
        }
    }

    func testAllDecisionTouchesPendingChunksOnlyAndUndoRestoresSnapshot() {
        let session = DocumentReviewSession(previous: "A\nold\nC\nold2\nE", current: "A\nnew\nC\nnew2\nE")
        XCTAssertGreaterThanOrEqual(session.chunks.count, 2)
        let first = try! XCTUnwrap(session.chunks.first)
        let rejected = session.applying(.rejected, to: first.id)
        XCTAssertEqual(rejected.chunks[first.id].decision, .rejected)
        let acceptedPending = rejected.applying(.accepted, to: nil)
        XCTAssertEqual(acceptedPending.chunks[first.id].decision, .rejected,
                       "accept-all must leave an already-resolved rejection intact")
        XCTAssertTrue(acceptedPending.chunks.dropFirst(first.id + 1).allSatisfy { $0.decision == .accepted })
        XCTAssertTrue(acceptedPending.canUndo)
        XCTAssertEqual(acceptedPending.undoing()?.renderedSource, rejected.renderedSource)
    }

    func testSessionIdentityAndDecisionsReconcileOnlyForSameVersion() {
        let initial = DocumentReviewSession(previous: "a\nb", current: "a\nc")
        let accepted = initial.applying(.accepted, to: initial.chunks[0].id)
        let refreshed = DocumentReviewSession(previous: accepted.previous, current: accepted.current,
                                              preserving: accepted)
        XCTAssertEqual(refreshed.id, accepted.id)
        XCTAssertEqual(refreshed.chunks, accepted.chunks)

        let changed = DocumentReviewSession(previous: "a\nb", current: "a\nd", preserving: accepted)
        XCTAssertNotEqual(changed.id, accepted.id)
        XCTAssertTrue(changed.pendingChunks.allSatisfy { $0.decision == .pending })

        let large = String(repeating: "ligne\n", count: 7_000)
        XCTAssertTrue(DocumentReviewSession(previous: large, current: large).chunks.isEmpty)
    }

    @MainActor
    func testLocalCASFailureRetainsPendingDecisionAndSource() async throws {
        let model = WorkspaceModel()
        let item = GalleryArtifact(name: "review.tex", data: Data("avant".utf8))
        model.gallery.localItems = [item]
        try model.openArtifact(item, data: Data("avant".utf8))
        model.receiveDocumentVersion("après\n", for: item.id, expectedSource: "avant")
        model.gallery.localItems[0].data = Data("après\n".utf8)
        await model.prepareDocumentReview()
        let session = try XCTUnwrap(model.documentReview)
        XCTAssertEqual(session.pendingCount, 1)

        model.gallery.localItems[0].data = Data("quelqu’un d’autre".utf8)
        let changed = await model.decideDocumentReview(chunkID: session.chunks[0].id, accept: false)
        XCTAssertFalse(changed)
        XCTAssertEqual(model.source, "après\n")
        XCTAssertEqual(model.documentReview?.pendingCount, 1)
        XCTAssertNotNil(model.documentError)
    }

    @MainActor
    func testLocalReviewRejectThenUndoUsesCASAndRestoresCurrent() async throws {
        let model = WorkspaceModel()
        let item = GalleryArtifact(name: "review.tex", data: Data("avant".utf8))
        model.gallery.localItems = [item]
        try model.openArtifact(item, data: Data("avant".utf8))
        model.receiveDocumentVersion("après", for: item.id, expectedSource: "avant")
        model.gallery.localItems[0].data = Data("après".utf8)
        await model.prepareDocumentReview()
        let chunkID = try XCTUnwrap(model.documentReview?.chunks.first?.id)

        let rejected = await model.decideDocumentReview(chunkID: chunkID, accept: false)
        XCTAssertTrue(rejected)
        XCTAssertEqual(model.source, "avant")
        XCTAssertEqual(model.gallery.localItems[0].data, Data("avant".utf8))
        XCTAssertTrue(model.documentReview?.canUndo == true)

        let undone = await model.undoDocumentReview()
        XCTAssertTrue(undone)
        XCTAssertEqual(model.source, "après")
        XCTAssertEqual(model.gallery.localItems[0].data, Data("après".utf8))
        XCTAssertEqual(model.documentReview?.pendingCount, 1)
    }
}
