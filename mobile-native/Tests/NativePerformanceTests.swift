import XCTest
@testable import AtelierUI

final class NativePerformanceTests: XCTestCase {
    @MainActor func testLongActivityGroupingPerformance() {
        let rows = (0..<5000).map { RemoteChatModel.Row(id:"tool-\($0)",kind:"tool",text:"Lecture",turn:"long-turn") }
        measure {
            let timeline = ChatTimelineItem.group(rows)
            XCTAssertEqual(timeline.count,1)
            XCTAssertEqual(timeline[0].rows.count,5000)
        }
    }
}
