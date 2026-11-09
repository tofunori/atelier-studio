import XCTest
import WebKit
@testable import AtelierUI

final class NativePerformanceTests: XCTestCase {
    @MainActor func testWebContentCoverSurvivesRecreationAndForegroundDelay() {
        let continuity = RichTextContinuity()
        let first = WKWebView(frame: CGRect(x: 0, y: 0, width: 320, height: 300))
        continuity.attach(to: first, text: "Texte déjà reçu", fontSize: 21)
        XCTAssertTrue(continuity.isCovered)
        let overlay = first.subviews.last
        XCTAssertEqual(overlay?.subviews.compactMap { ($0 as? UITextView)?.text }.first, "Texte déjà reçu")
        continuity.reveal(); XCTAssertFalse(continuity.isCovered)
        continuity.show(); XCTAssertTrue(continuity.isCovered)
        continuity.detach(); XCTAssertFalse(continuity.isCovered)
        let recreated = WKWebView(frame: first.frame)
        continuity.attach(to: recreated, text: "Texte déjà reçu", fontSize: 21)
        XCTAssertTrue(continuity.isCovered)
        continuity.update(text: "Texte déjà reçu et sa suite", fontSize: 21)
        XCTAssertEqual(recreated.subviews.last?.subviews.compactMap { ($0 as? UITextView)?.text }.first, "Texte déjà reçu et sa suite")
        continuity.detach()
    }

    @MainActor func testForegroundReturnNeverShowsTextStandIn() {
        let continuity = RichTextContinuity()
        let view = WKWebView(frame: CGRect(x: 0, y: 0, width: 320, height: 300))
        continuity.attach(to: view, text: "**Total** : environ 166 mots", fontSize: 17)
        continuity.reveal(); XCTAssertFalse(continuity.isCovered)
        // No image of the message yet: WebKit keeps its own layers on return.
        continuity.show(.resuming); XCTAssertFalse(continuity.isCovered)
        XCTAssertFalse(view.subviews.contains { $0.subviews.contains { $0 is UITextView } })
        // Still loading when the app leaves: the stand-in stays.
        continuity.show(); continuity.show(.resuming); XCTAssertTrue(continuity.isCovered)
        continuity.detach()
    }

    @MainActor func testTextStandInDropsMarkdownMarks() {
        let text = RichTextContinuity.standIn(for: "## Deux options\n- **A.** Couper\n```swift\nlet x = 1\n```", fontSize: 17)
        XCTAssertEqual(text.string, "Deux options\n• A. Couper\nlet x = 1")
        let bold = text.attribute(.font, at: 0, effectiveRange: nil) as? UIFont
        XCTAssertTrue(bold?.fontDescriptor.symbolicTraits.contains(.traitBold) == true)
    }

    @MainActor func testLongActivityGroupingPerformance() {
        let rows = (0..<5000).map { RemoteChatModel.Row(id:"tool-\($0)",kind:"tool",text:"Lecture",turn:"long-turn") }
        measure {
            let timeline = ChatTimelineItem.group(rows)
            XCTAssertEqual(timeline.count,1)
            XCTAssertEqual(timeline[0].rows.count,5000)
        }
    }
}
