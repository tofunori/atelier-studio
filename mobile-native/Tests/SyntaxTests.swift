import XCTest
import SwiftUI
import UIKit
@testable import AtelierUI

final class SyntaxTests: XCTestCase {
    func testDocumentDiffNumbersReplacementAndDeletionHunks() {
        let previous = "Titre\nAvant\ncontexte 1\ncontexte 2\ncontexte 3\ncontexte 4\ncontexte 5\nRetirer"
        let current = "Titre\nAprès\ncontexte 1\ncontexte 2\ncontexte 3\ncontexte 4\ncontexte 5"
        let lines = DocumentChangeLine.compare(previous: previous, current: current)
        XCTAssertEqual(lines.first { $0.kind == .added }?.newLine, 2)
        XCTAssertEqual(lines.first { $0.kind == .removed }?.oldLine, 2)
        let hunks = DocumentChangeHunk.group(lines)
        XCTAssertEqual(hunks.count, 2)
        XCTAssertEqual(hunks.first?.currentLine, 2)
        XCTAssertEqual(hunks.last?.currentLine, 7)
        XCTAssertTrue(DocumentChangeHunk.group(DocumentChangeLine.compare(previous: current, current: current)).isEmpty)
    }
    @MainActor func testPythonStringsAndCommentsDoNotColourInnerKeywords() throws {
        let text = "import numpy\nlabel = \"if # text\"\n# return comment\nreturn 42"
        let result = SourceSyntax.attributed(text, name: "analysis.py")
        func color(_ needle: String) throws -> UIColor {
            let range = try XCTUnwrap(text.range(of: needle))
            return try XCTUnwrap(result.attribute(.foregroundColor, at: NSRange(range, in: text).location, effectiveRange: nil) as? UIColor)
        }
        XCTAssertEqual(try color("import"), UIColor.systemPurple)
        XCTAssertEqual(try color("if # text"), UIColor.systemGreen)
        XCTAssertEqual(try color("# return"), UIColor.secondaryLabel)
        XCTAssertEqual(try color("42"), UIColor.systemOrange)
        XCTAssertEqual(result.string, text)
    }
    @MainActor func testLatexEscapedPercentDoesNotStartComment() throws {
        let text = #"\section{Titre} 10\% réel % note"#
        let result = SourceSyntax.attributed(text, name: "paper.tex")
        let command = try XCTUnwrap(text.range(of: #"\section"#))
        let escaped = try XCTUnwrap(text.range(of: #"\%"#))
        let comment = try XCTUnwrap(text.range(of: "% note"))
        XCTAssertEqual(result.attribute(.foregroundColor, at: NSRange(command, in: text).location, effectiveRange: nil) as? UIColor, .systemBlue)
        XCTAssertEqual(result.attribute(.foregroundColor, at: NSRange(escaped, in: text).location, effectiveRange: nil) as? UIColor, .systemBlue)
        XCTAssertEqual(result.attribute(.foregroundColor, at: NSRange(comment, in: text).location, effectiveRange: nil) as? UIColor, .secondaryLabel)
    }
    @MainActor func testRecreatedEditorRestoresVisibleAnnotationSelection() throws {
        let model = WorkspaceModel()
        model.documentMode = .source
        model.source = "Intro\nPassage sélectionné"
        let range = try XCTUnwrap(model.source.range(of: "Passage sélectionné"))
        model.selection = TextSelection(range: range)
        let newEditor = UITextView()
        SyntaxSourceEditor.Coordinator(workspace: model).update(newEditor)
        XCTAssertEqual(newEditor.selectedRange, NSRange(range, in: model.source))
        XCTAssertEqual(model.activePassage?.text, "Passage sélectionné")
    }

    @MainActor func testDiffHighlightRefreshPreservesSourceViewport() {
        let model = WorkspaceModel()
        model.source = String(repeating: "Une ligne de résultats.\n", count: 100)
        let view = PositionRestoringSourceView(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
        let coordinator = SyntaxSourceEditor.Coordinator(workspace: model)
        coordinator.update(view)
        view.layoutIfNeeded()
        view.setContentOffset(CGPoint(x: 0, y: 500), animated: false)
        coordinator.update(view, changedRanges: [NSRange(location: 0, length: 10)])
        view.layoutIfNeeded()
        XCTAssertEqual(view.contentOffset.y, 500, accuracy: 1)
    }

    @MainActor func testEditorSelectionAndTypingPreserveUnicodeCitation() throws {
        let model = WorkspaceModel()
        model.documentMode = .source; model.source = "# 🌍\nreturn résultat"
        model.sourceName = "analysis.py"
        let coordinator = SyntaxSourceEditor.Coordinator(workspace: model)
        let view = UITextView()
        coordinator.update(view)
        let range = try XCTUnwrap(model.source.range(of: "résultat"))
        view.selectedRange = NSRange(range, in: model.source)
        coordinator.textViewDidChangeSelection(view)
        XCTAssertEqual(model.activePassage?.text, "résultat")
        XCTAssertEqual(model.activePassage?.location, "ligne 2")
        let selected = view.selectedRange
        coordinator.textViewDidChange(view)
        XCTAssertEqual(view.selectedRange, selected)
        XCTAssertEqual(model.activePassage?.text, "résultat")
    }
}
