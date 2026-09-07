import XCTest
import SwiftUI
@testable import AtelierUI

final class RedesignTests: XCTestCase {
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
}
