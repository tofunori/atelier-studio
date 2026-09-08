import XCTest
import SwiftUI
@testable import AtelierUI

final class NativeChatListTests: XCTestCase {
    @MainActor private func list(thread: String = "t", follows: Bool = false, request: UUID = UUID(), revision: String = "1", bookmark: ChatBookmark? = nil, onUser: @escaping () -> Void = {}, row: @escaping (ChatTimelineItem) -> AnyView = { AnyView(Text($0.rows[0].text)) }) -> NativeChatList {
        NativeChatList(items: (0..<12).map { ChatTimelineItem(rows: [.init(id: "\(thread)-\($0)", kind: "text", text: "Message \($0)", turn: thread)]) },
                       renderRevision: revision, threadID: thread, followsTail: follows, animateReturn: true, returnRequest: request,
                       bookmark: bookmark, row: row, footer: AnyView(Text("Fin")), onUserScroll: onUser, onBottomChanged: { _ in }, onRest: { _, _, _, _, _ in })
    }
    @MainActor private func table() -> UITableView {
        let table = UITableView(frame: CGRect(x: 0, y: 0, width: 390, height: 600))
        table.register(UITableViewCell.self, forCellReuseIdentifier: "message")
        table.rowHeight = 80; table.estimatedRowHeight = 80
        return table
    }
    @MainActor func testAlreadyAtBottomReturnDoesNotLeaveAnimationLocked() async throws {
        var state = list(follows: true)
        let table = table(), coordinator = NativeChatList.Coordinator(parent: state)
        coordinator.attach(table); coordinator.update(state)
        try await Task.sleep(for: .milliseconds(100))
        table.layoutIfNeeded()
        table.contentOffset.y = max(0, table.contentSize.height - table.bounds.height)
        state = list(follows: true)
        coordinator.update(state)
        XCTAssertFalse(coordinator.animating)
    }
    @MainActor func testManualScrollSuppressesLaterFollowRequests() async throws {
        var gestures = 0
        let state = list(follows: true, onUser: { gestures += 1 })
        let table = table(), coordinator = NativeChatList.Coordinator(parent: state)
        coordinator.attach(table); coordinator.update(state)
        try await Task.sleep(for: .milliseconds(100))
        coordinator.scrollViewWillBeginDragging(table)
        table.contentOffset.y = 100
        let offset = table.contentOffset.y
        coordinator.scheduleFollow()
        try await Task.sleep(for: .milliseconds(50))
        XCTAssertEqual(gestures, 1)
        XCTAssertEqual(table.contentOffset.y, offset, accuracy: 0.5)
    }
    @MainActor func testRapidThreadSwitchLeavesOnlyNewThreadRows() async throws {
        let first = list(thread: "a"), second = list(thread: "b")
        let table = table(), coordinator = NativeChatList.Coordinator(parent: first)
        coordinator.attach(table); coordinator.update(first); coordinator.update(second)
        try await Task.sleep(for: .milliseconds(100))
        XCTAssertEqual(coordinator.source.snapshot().itemIdentifiers.filter { !$0.hasPrefix("__") }, second.items.map(\.id))
    }
    @MainActor func testContextChangeRefreshesVisibleRowsWithoutChangingIdentity() async throws {
        var configurations = 0
        let request = UUID()
        let build: (ChatTimelineItem) -> AnyView = { item in configurations += 1; return AnyView(Text(item.rows[0].text)) }
        let first = list(request: request, row: build)
        let table = table(), coordinator = NativeChatList.Coordinator(parent: first)
        coordinator.attach(table); coordinator.update(first)
        let host = UIViewController(); host.view = table
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 600)); window.rootViewController = host; window.isHidden = false
        defer { window.isHidden = true }
        try await Task.sleep(for: .milliseconds(100))
        table.layoutIfNeeded()
        let identities = coordinator.source.snapshot().itemIdentifiers
        let before = configurations
        coordinator.update(list(request: request, revision: "2", row: build))
        XCTAssertEqual(coordinator.source.snapshot().itemIdentifiers, identities)
        XCTAssertGreaterThan(configurations, before)
    }
    @MainActor func testFollowCorrectsSmallGrowthWithoutWaitingForOneWholeLine() async throws {
        let state = list(follows: true)
        let table = table(), coordinator = NativeChatList.Coordinator(parent: state)
        coordinator.attach(table); coordinator.update(state)
        try await Task.sleep(for: .milliseconds(100))
        table.layoutIfNeeded()
        let bottom = max(-table.adjustedContentInset.top, table.contentSize.height - table.bounds.height + table.adjustedContentInset.bottom)
        table.contentOffset.y = bottom - 18
        coordinator.scheduleFollow()
        try await Task.sleep(for: .milliseconds(50))
        XCTAssertEqual(table.contentOffset.y, bottom, accuracy: 1)
    }
    @MainActor func testRecentMessageKeepsTheSameRenderedCellWhenReturning() async throws {
        let state = list()
        let table = table(), coordinator = NativeChatList.Coordinator(parent: state)
        coordinator.attach(table); coordinator.update(state)
        try await Task.sleep(for: .milliseconds(100))
        let path = IndexPath(row: 2, section: 0)
        let first = coordinator.source.tableView(table, cellForRowAt: path)
        _ = coordinator.source.tableView(table, cellForRowAt: IndexPath(row: 3, section: 0))
        let returning = coordinator.source.tableView(table, cellForRowAt: path)
        XCTAssertTrue(first === returning)
    }
    @MainActor func testConversationSwitchDoesNotKeepPreviousFooter() async throws {
        let first = list(thread: "first")
        let table = table(), coordinator = NativeChatList.Coordinator(parent: first)
        coordinator.attach(table); coordinator.update(first)
        try await Task.sleep(for: .milliseconds(100))
        let footer = coordinator.source.tableView(table, cellForRowAt: IndexPath(row: 12, section: 0))
        coordinator.update(list(thread: "second"))
        try await Task.sleep(for: .milliseconds(100))
        let nextFooter = coordinator.source.tableView(table, cellForRowAt: IndexPath(row: 12, section: 0))
        XCTAssertFalse(footer === nextFooter)
    }

    @MainActor func testMeasuredCellDoesNotCollapseWhileRendererReloads() async throws {
        let probe = ChatHeightProbeState()
        let state = list(row: { _ in AnyView(ChatHeightProbe(state: probe)) })
        let table = table(), coordinator = NativeChatList.Coordinator(parent: state)
        coordinator.attach(table); coordinator.update(state)
        let host = UIViewController(); host.view = table
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 600))
        window.rootViewController = host; window.isHidden = false
        defer { window.isHidden = true }
        try await Task.sleep(for: .milliseconds(200))
        let path = IndexPath(row: 0, section: 0)
        let measured = coordinator.tableView(table, heightForRowAt: path)
        XCTAssertGreaterThan(measured, 600)
        probe.ready = false; probe.height = 28
        try await Task.sleep(for: .milliseconds(100))
        XCTAssertEqual(coordinator.tableView(table, heightForRowAt: path), measured, accuracy: 0.5)
        probe.height = 720; probe.ready = true
        try await Task.sleep(for: .milliseconds(100))
        XCTAssertGreaterThan(coordinator.tableView(table, heightForRowAt: path), 720)
    }
    @MainActor func testBookmarkWaitsForTargetMessageHeight() async throws {
        let probe = ChatHeightProbeState(); probe.ready = false; probe.height = 1000
        let state = list(bookmark: ChatBookmark(rowID: "t-0", followsTail: false, rowOffsetY: 800), row: { _ in AnyView(ChatHeightProbe(state: probe)) })
        let table = table(), coordinator = NativeChatList.Coordinator(parent: state)
        coordinator.attach(table); coordinator.update(state)
        let host = UIViewController(); host.view = table
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 600))
        window.rootViewController = host; window.isHidden = false
        defer { window.isHidden = true }
        try await Task.sleep(for: .milliseconds(150))
        XCTAssertLessThan(table.contentOffset.y, 180)
        probe.ready = true
        try await Task.sleep(for: .milliseconds(150))
        XCTAssertEqual(table.contentOffset.y + table.adjustedContentInset.top - table.rectForRow(at: IndexPath(row: 0, section: 0)).minY, 800, accuracy: 1)
    }

    @MainActor func testGrowingVisibleMessageDoesNotResetScrollMomentum() async throws {
        let probe = ChatHeightProbeState()
        let state = list(row: { _ in AnyView(ChatHeightProbe(state: probe)) })
        let table = OffsetTrackingTable(frame: CGRect(x: 0, y: 0, width: 390, height: 600))
        let coordinator = NativeChatList.Coordinator(parent: state)
        coordinator.attach(table); coordinator.update(state)
        let host = UIViewController(); host.view = table
        let window = UIWindow(frame: table.frame); window.rootViewController = host; window.isHidden = false
        defer { window.isHidden = true }
        try await Task.sleep(for: .milliseconds(150))
        coordinator.scrollViewWillBeginDragging(table)
        table.offsetAssignments = 0
        probe.height += 50
        try await Task.sleep(for: .milliseconds(150))
        XCTAssertEqual(table.offsetAssignments, 0, "A size change below the reading anchor must not assign even the same offset")
    }

}

@MainActor private final class ChatHeightProbeState: ObservableObject {
    @Published var height: CGFloat = 620
    @Published var ready = true
}
private struct ChatHeightProbe: View {
    @ObservedObject var state: ChatHeightProbeState
    var body: some View {
        Color.clear.frame(height: state.height)
            .preference(key: ChatContentReadyKey.self, value: state.ready)
    }
}

@MainActor private final class OffsetTrackingTable: UITableView {
    var offsetAssignments = 0
    override func setContentOffset(_ contentOffset: CGPoint, animated: Bool) {
        offsetAssignments += 1
        super.setContentOffset(contentOffset, animated: animated)
    }
}
