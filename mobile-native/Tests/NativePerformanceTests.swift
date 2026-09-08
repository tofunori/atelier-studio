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

    @MainActor func testLongActivityGroupingPerformance() {
        let rows = (0..<5000).map { RemoteChatModel.Row(id:"tool-\($0)",kind:"tool",text:"Lecture",turn:"long-turn") }
        measure {
            let timeline = ChatTimelineItem.group(rows)
            XCTAssertEqual(timeline.count,1)
            XCTAssertEqual(timeline[0].rows.count,5000)
        }
    }
}
