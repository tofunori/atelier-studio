import XCTest
import SwiftUI
import UIKit
@testable import AtelierUI

final class SyntaxTests: XCTestCase {
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
