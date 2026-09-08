import SwiftUI

/// UIKit owns scrolling and cell sizing; message content remains SwiftUI.
struct NativeChatList: UIViewRepresentable {
    let items: [ChatTimelineItem]
    let renderRevision: String
    let threadID: String
    let followsTail: Bool
    let animateReturn: Bool
    let returnRequest: UUID
    let bookmark: ChatBookmark?
    let row: (ChatTimelineItem) -> AnyView
    let footer: AnyView
    var onUserScroll: () -> Void
    var onBottomChanged: (Bool) -> Void
    var onRest: (String?, Double, Double, Double, Bool) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }
    func makeUIView(context: Context) -> UITableView {
        let table = ChatTableView(frame: .zero, style: .plain)
        table.backgroundColor = .clear; table.separatorStyle = .none
        table.rowHeight = UITableView.automaticDimension; table.estimatedRowHeight = 180
        table.keyboardDismissMode = .interactive
        table.contentInset = UIEdgeInsets(top: 6, left: 0, bottom: 6, right: 0)
        table.selfSizingInvalidation = .disabled
        table.register(UITableViewCell.self, forCellReuseIdentifier: "message")
        context.coordinator.attach(table)
        return table
    }
    func updateUIView(_ table: UITableView, context: Context) { context.coordinator.update(self) }
    static func dismantleUIView(_ table: UITableView, coordinator: Coordinator) {
        coordinator.observation = nil; coordinator.followTask?.cancel(); coordinator.measureTask?.cancel()
        table.delegate = nil
    }

    @MainActor final class Coordinator: NSObject, UITableViewDelegate {
        private static let footerID = "__chat_footer__"
        var parent: NativeChatList
        weak var table: UITableView?
        var source: UITableViewDiffableDataSource<Int, String>!
        var observation: NSKeyValueObservation?
        var followTask: Task<Void, Never>?
        var measureTask: Task<Void, Never>?
        private var pendingHeights: [String: CGFloat] = [:]
        private var entries: [String: ChatTimelineItem] = [:]
        private var heights: [String: CGFloat] = [:]
        // Retain a small recent window of rendered cells. Recycling a WebKit-backed
        // message destroys its DOM and replaces it briefly with differently sized text.
        private var renderedCells: [String: UITableViewCell] = [:]
        private var recentCells: [String] = []
        private let retainedOffscreenLimit = 8
        private var currentThread = ""
        private var request: UUID?
        private var restored = false
        private var pendingBookmark: ChatBookmark?
        private var applying = false
        private(set) var animating = false
        private var userOwnsScroll = false
        private var reportedBottom: Bool?
        private var lastIDs: [String] = []
        private var generation = 0
        private var measurementGeneration = 0
        init(parent: NativeChatList) { self.parent = parent }
        func attach(_ table: UITableView) {
            self.table = table; table.delegate = self
            source = UITableViewDiffableDataSource<Int, String>(tableView: table) { [weak self] table, indexPath, id in
                guard let self else { return UITableViewCell() }
                if let cell = self.renderedCells[id] {
                    self.touch(id)
                    return cell
                }
                let cell = UITableViewCell(style: .default, reuseIdentifier: nil)
                self.renderedCells[id] = cell
                self.touch(id)
                self.configure(cell, id: id)
                return cell
            }
            observation = table.observe(\.contentSize, options: [.new]) { [weak self] _, _ in
                MainActor.assumeIsolated { self?.scheduleFollow() }
            }
        }
        private func configure(_ cell: UITableViewCell, id: String) {
            cell.backgroundColor = .clear; cell.selectionStyle = .none
            cell.clipsToBounds = true; cell.contentView.clipsToBounds = true
            cell.accessibilityIdentifier = id
            let measuredThread = currentThread
            let measuredGeneration = measurementGeneration
            let content = id == Self.footerID ? parent.footer : entries[id].map(parent.row) ?? AnyView(EmptyView())
            UIView.performWithoutAnimation {
                cell.contentConfiguration = UIHostingConfiguration {
                    ChatMeasuredRow(content: content) { [weak self] height in
                        guard let self, self.currentThread == measuredThread, self.measurementGeneration == measuredGeneration else { return }
                        self.queueHeight(height + 16, for: id)
                    }
                    .id(currentThread + ":" + id)
                    .transaction { $0.animation = nil; $0.disablesAnimations = true }
                }.margins(.horizontal, 16).margins(.vertical, 8)
            }
        }
        func update(_ next: NativeChatList) {
            let previous = entries
            let contextChanged = parent.renderRevision != next.renderRevision
            parent = next
            let changedThread = currentThread != next.threadID
            if changedThread {
                currentThread = next.threadID; heights = [:]; restored = false; measurementGeneration += 1
                renderedCells = [:]; recentCells = []; pendingBookmark = nil
                measureTask?.cancel(); measureTask = nil; pendingHeights = [:]
                userOwnsScroll = !(next.bookmark?.followsTail ?? next.followsTail); reportedBottom = nil
                followTask?.cancel(); followTask = nil; animating = false
            }
            entries = Dictionary(uniqueKeysWithValues: next.items.map { ($0.id, $0) })
            let ids = next.items.map(\.id) + [Self.footerID]
            if ids != lastIDs || changedThread {
                lastIDs = ids; applying = true; generation += 1
                let snapshotGeneration = generation
                var snapshot = NSDiffableDataSourceSnapshot<Int, String>()
                snapshot.appendSections([0]); snapshot.appendItems(ids)
                let completion: () -> Void = { [weak self] in
                    guard let self, self.generation == snapshotGeneration else { return }
                    self.applying = false; self.applyMeasuredHeights(); self.restoreIfNeeded(); self.scheduleFollow()
                }
                if changedThread { source.applySnapshotUsingReloadData(snapshot, completion: completion) }
                else { source.apply(snapshot, animatingDifferences: false, completion: completion) }
            }
            for (id, cell) in renderedCells {
                if contextChanged || changedThread || id == Self.footerID || previous[id]?.rows != entries[id]?.rows {
                    configure(cell, id: id)
                }
            }
            pruneRenderedCells()
            if request != next.returnRequest {
                let initial = request == nil
                request = next.returnRequest
                if !initial && !changedThread { pendingBookmark = nil; userOwnsScroll = false; scrollToBottom(animated: next.animateReturn) }
            }
            restoreIfNeeded()
        }
        private func restoreIfNeeded() {
            guard !applying, !restored, !parent.items.isEmpty, let table else { return }
            restored = true
            table.layoutIfNeeded()
            if parent.bookmark?.followsTail ?? parent.followsTail { scrollToBottom(animated: false) }
            else if let id = parent.bookmark?.rowID, let path = source.indexPath(for: id) {
                pendingBookmark = parent.bookmark
                table.scrollToRow(at: path, at: .top, animated: false)
                table.layoutIfNeeded()
                _ = restoreMeasuredBookmark()
            }
            else { table.setContentOffset(CGPoint(x: 0, y: parent.bookmark?.offsetY ?? 0), animated: false) }
        }
        func scheduleFollow() {
            guard followTask == nil else { return }
            followTask = Task { @MainActor [weak self] in
                do { try await Task.sleep(for: .milliseconds(16)) } catch { return }
                guard let self, !Task.isCancelled else { return }
                self.followTask = nil
                self.reportBottom()
                guard !self.applying, self.restored, !self.animating, !self.userOwnsScroll,
                      self.parent.followsTail, let table = self.table,
                      !table.isTracking && !table.isDragging && !table.isDecelerating else { return }
                self.scrollToBottom(animated: false)
            }
        }
        private func scrollToBottom(animated: Bool) {
            trace("follow animated=\(animated)")
            guard !applying, let table, let path = source.indexPath(for: Self.footerID) else { return }
            table.layoutIfNeeded()
            let bottom = max(-table.adjustedContentInset.top, table.contentSize.height - table.bounds.height + table.adjustedContentInset.bottom)
            if abs(bottom - table.contentOffset.y) < 1 { animating = false; reportBottom(); return }
            animating = animated
            table.scrollToRow(at: path, at: .bottom, animated: animated)
            if !animated { reportBottom() }
        }
        private func isAtBottom(_ table: UITableView) -> Bool {
            let bottom = max(-table.adjustedContentInset.top, table.contentSize.height - table.bounds.height + table.adjustedContentInset.bottom)
            return abs(bottom - table.contentOffset.y) < 36
        }
        private func reportBottom() {
            guard let table else { return }
            let value = isAtBottom(table)
            guard reportedBottom != value else { return }
            reportedBottom = value
            let thread = currentThread
            Task { @MainActor [weak self] in
                guard let self, self.currentThread == thread else { return }
                self.parent.onBottomChanged(value)
            }
        }
        func scrollViewDidScroll(_ scrollView: UIScrollView) { trace("scroll"); reportBottom() }
        private func trace(_ event: String) {
            #if targetEnvironment(simulator)
            if ProcessInfo.processInfo.arguments.contains("--scroll-trace"), let table {
                print("CHATSCROLL \(Date().timeIntervalSince1970) \(event) y=\(table.contentOffset.y) h=\(table.contentSize.height) manual=\(userOwnsScroll) follow=\(parent.followsTail) drag=\(table.isDragging) decel=\(table.isDecelerating)")
            }
            #endif
        }
        func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
            userOwnsScroll = true; animating = false; pendingBookmark = nil
            followTask?.cancel(); followTask = nil
            parent.onUserScroll()
            trace("begin")
        }
        func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) { if !decelerate { rest() } }
        func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) { rest() }
        func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) { animating = false; rest(); scheduleFollow() }
        private func rest() {
            guard let table else { return }
            let bottom = isAtBottom(table)
            trace("rest")
            if bottom { userOwnsScroll = false }
            let id = table.indexPathsForVisibleRows?.first.flatMap { source.itemIdentifier(for: $0) }
            let rowOffset = id.flatMap { source.indexPath(for: $0) }.map {
                table.contentOffset.y + table.adjustedContentInset.top - table.rectForRow(at: $0).minY
            } ?? 0
            parent.onRest(id == Self.footerID ? nil : id, table.contentOffset.y, table.contentSize.height, rowOffset, bottom)
            reportBottom()
        }
        func tableView(_ tableView: UITableView, heightForRowAt indexPath: IndexPath) -> CGFloat {
            guard let id = source.itemIdentifier(for: indexPath) else { return 180 }
            if let height = heights[id] { return height }
            if id == Self.footerID { return 16 }
            if entries[id]?.rows.first?.isStreaming == true { return 44 }
            return 180
        }
        func tableView(_ tableView: UITableView, estimatedHeightForRowAt indexPath: IndexPath) -> CGFloat {
            self.tableView(tableView, heightForRowAt: indexPath)
        }
        private func queueHeight(_ height: CGFloat, for id: String) {
            guard height.isFinite, height > 0, entries[id] != nil || id == Self.footerID else { return }
            let value = ceil(height * 3) / 3
            if let existing = heights[id], abs(existing - value) <= 0.5 { return }
            pendingHeights[id] = value
            guard measureTask == nil else { return }
            measureTask = Task { @MainActor [weak self] in
                await Task.yield()
                guard let self, !Task.isCancelled else { return }
                self.measureTask = nil
                self.applyMeasuredHeights()
            }
        }
        private func applyMeasuredHeights() {
            guard !applying, let table, !pendingHeights.isEmpty else { return }
            let first = table.indexPathsForVisibleRows?.first
            let anchor = first.flatMap { source.itemIdentifier(for: $0) }
            let relative = first.map { table.contentOffset.y - table.rectForRow(at: $0).minY } ?? 0
            heights.merge(pendingHeights) { _, measured in measured }; pendingHeights = [:]
            UIView.performWithoutAnimation {
                table.beginUpdates(); table.endUpdates(); table.layoutIfNeeded()
                if !restoreMeasuredBookmark(), userOwnsScroll, let anchor, let path = source.indexPath(for: anchor) {
                    let offset = table.rectForRow(at: path).minY + relative
                    // Even assigning the same offset cancels UIScrollView's momentum.
                    if abs(table.contentOffset.y - offset) > 0.5 {
                        table.setContentOffset(CGPoint(x: 0, y: offset), animated: false)
                    }
                }
            }
            scheduleFollow()
        }
        @discardableResult private func restoreMeasuredBookmark() -> Bool {
            guard let bookmark = pendingBookmark, let id = bookmark.rowID, heights[id] != nil,
                  let table, let path = source.indexPath(for: id) else { return false }
            let row = table.rectForRow(at: path)
            let relative = min(max(0, bookmark.rowOffsetY ?? 0), max(0, row.height - 1))
            let bottom = max(-table.adjustedContentInset.top, table.contentSize.height - table.bounds.height + table.adjustedContentInset.bottom)
            let offset = min(bottom, max(-table.adjustedContentInset.top, row.minY + relative - table.adjustedContentInset.top))
            table.setContentOffset(CGPoint(x: 0, y: offset), animated: false)
            pendingBookmark = nil
            return true
        }
        private func touch(_ id: String) {
            recentCells.removeAll { $0 == id }; recentCells.append(id)
        }
        private func pruneRenderedCells() {
            let visible = Set(table?.visibleCells.compactMap(\.accessibilityIdentifier) ?? [])
            let offscreen = recentCells.filter { !visible.contains($0) }
            let evicted = Set(offscreen.prefix(max(0, offscreen.count - retainedOffscreenLimit)))
                .union(renderedCells.keys.filter { entries[$0] == nil && $0 != Self.footerID })
            for id in evicted { renderedCells.removeValue(forKey: id) }
            recentCells.removeAll { evicted.contains($0) }
        }
        func tableView(_ tableView: UITableView, didEndDisplaying cell: UITableViewCell, forRowAt indexPath: IndexPath) {
            guard let id = cell.accessibilityIdentifier, entries[id] != nil, cell.bounds.height > 0 else { return }
            pruneRenderedCells()
        }
    }
}

/// Self-sizing content must not interpolate its geometry while a finger scrolls.
/// This leaves explicit UIScrollView content-offset animations (the return button) intact.
private final class ChatTableView: UITableView {
    override func layoutSubviews() {
        UIView.performWithoutAnimation { super.layoutSubviews() }
    }
}

/// The renderer reports readiness separately from its placeholder's geometry.
/// A placeholder must never replace a previously measured message height.
struct ChatContentReadyKey: PreferenceKey {
    static let defaultValue = true
    static func reduce(value: inout Bool, nextValue: () -> Bool) { value = value && nextValue() }
}
private struct ChatMeasuredHeightKey: PreferenceKey {
    static let defaultValue: CGFloat? = nil
    static func reduce(value: inout CGFloat?, nextValue: () -> CGFloat?) {
        if let next = nextValue() { value = next }
    }
}
private struct ChatMeasuredRow: View {
    let content: AnyView
    let onHeight: (CGFloat) -> Void
    var body: some View {
        content
            .fixedSize(horizontal: false, vertical: true)
            .overlayPreferenceValue(ChatContentReadyKey.self) { ready in
                GeometryReader { geometry in
                    Color.clear.preference(key: ChatMeasuredHeightKey.self, value: ready ? geometry.size.height : nil)
                }.allowsHitTesting(false)
            }
            .onPreferenceChange(ChatMeasuredHeightKey.self) { value in
                if let value { onHeight(value) }
            }
    }
}
