import XCTest
import SwiftUI
@testable import AtelierUI

final class NavigationTests: XCTestCase {
    @MainActor func testForegroundResumeKeepsTranscriptAndOnlyRestartsAfterBackground() async {
        let workspace = WorkspaceModel(); let chat = workspace.chat
        chat.select(.init(id: "resume", title: "Resume", provider: "codex", model: nil, projectId: nil, status: "idle"), workspace: workspace)
        chat.rows = [.init(id: "visible", kind: "text", text: "Texte déjà reçu", turn: "t")]
        workspace.draft = "Brouillon"
        chat.rememberPosition(rowID: "visible", followsTail: false, offsetY: 220)
        chat.connection = .live; chat.live = true
        chat.sceneDidBecomeActive()
        XCTAssertEqual(chat.reconnectGeneration, 0) // inactive transitions do not break a live socket
        chat.sceneDidEnterBackground(); chat.sceneDidBecomeActive()
        XCTAssertEqual(chat.reconnectGeneration, 1)
        XCTAssertTrue(chat.resumingInBackground)
        XCTAssertFalse(chat.showsConnectionStatus)
        XCTAssertEqual(chat.rows.map(\.text), ["Texte déjà reçu"])
        XCTAssertEqual(workspace.draft, "Brouillon")
        XCTAssertEqual(chat.bookmarks["resume"]?.offsetY, 220)
        chat.sceneDidBecomeActive(); XCTAssertEqual(chat.reconnectGeneration, 1)
        chat.connection = .reconnecting
        try? await Task.sleep(for: .milliseconds(1100))
        XCTAssertTrue(chat.showsConnectionStatus) // a prolonged outage remains visible
    }
    @MainActor func testForegroundResumeDoesNotOverrideExpiredAssociation() {
        let chat = RemoteChatModel()
        chat.connection = .associationRequired
        chat.sceneDidEnterBackground(); chat.sceneDidBecomeActive()
        XCTAssertEqual(chat.reconnectGeneration, 0)
        XCTAssertFalse(chat.resumingInBackground)
        XCTAssertTrue(chat.showsConnectionStatus)
    }

    @MainActor func testReturnToBottomCompletesWithoutGeometryCallbacks() async {
        let view = UIScrollView(frame: CGRect(x: 0, y: 0, width: 320, height: 600))
        view.contentSize = CGSize(width: 320, height: 1600)
        let controller = ChatScrollController()
        controller.attach(view)
        controller.scrollToBottom()
        let arrived = await controller.returnToBottom(animated: false)
        XCTAssertTrue(arrived)
        XCTAssertEqual(controller.isNearBottom, true)
    }
    @MainActor func testLatestExchangeIsOutsideLazyHistoryAcrossStreamingUpdates() {
        let rows: [RemoteChatModel.Row] = [
            .init(id: "u1", kind: "user", text: "Avant", turn: "a"),
            .init(id: "a1", kind: "text", text: "Ancienne réponse", turn: "a"),
            .init(id: "u2", kind: "user", text: "Maintenant", turn: "b"),
            .init(id: "tools", kind: "tool", text: "Lecture", turn: "b"),
            .init(id: "a2", kind: "text", text: "Texte en cours", turn: "b")
        ]
        let initial = ChatTimelineItem.splitForScrolling(ChatTimelineItem.group(rows))
        XCTAssertEqual(initial.history.map(\.id), ["u1", "a1"])
        XCTAssertEqual(initial.tail.map(\.id), ["u2", "tools", "a2"])
        let updated = ChatTimelineItem.splitForScrolling(ChatTimelineItem.group(rows + [.init(id: "more", kind: "tool", text: "Vérification", turn: "b")]))
        XCTAssertEqual(updated.history.map(\.id), initial.history.map(\.id))
        XCTAssertEqual(updated.tail.map(\.id), ["u2", "tools", "a2", "more"])
        XCTAssertTrue(ChatTimelineItem.splitForScrolling([]).tail.isEmpty)
    }

    @MainActor func testOvershootAfterHeightShrinkIsNotTreatedAsBottom() {
        let view = UIScrollView(frame: CGRect(x: 0, y: 0, width: 320, height: 600))
        view.contentSize = CGSize(width: 320, height: 2400)
        view.contentOffset.y = 1800
        let controller = ChatScrollController(); controller.attach(view)
        XCTAssertEqual(controller.isNearBottom, true)
        view.contentSize.height = 1600
        view.contentOffset.y = 1800
        XCTAssertEqual(controller.isNearBottom, false, "An empty overscrolled viewport must keep the return control available")
    }
    @MainActor func testReturnRetriesStalledDestinationWithoutHeightChange() async {
        let view = UIScrollView(frame: CGRect(x: 0, y: 0, width: 320, height: 600))
        view.contentSize = CGSize(width: 320, height: 1600)
        let controller = ChatScrollController(); controller.attach(view)
        var requests: [Bool] = []
        controller.setBottomNavigation { animated in
            requests.append(animated)
            if requests.count == 2 { view.contentOffset.y = 1000 }
        }
        let arrived = await controller.returnToBottom(animated: true)
        XCTAssertTrue(arrived)
        XCTAssertEqual(requests, [true, false], "A stalled animation needs a fresh nonanimated destination even when height is unchanged")
    }
    @MainActor func testLongReturnSkipsAnimationThroughEstimatedRows() async {
        let view = UIScrollView(frame: CGRect(x: 0, y: 0, width: 320, height: 600))
        view.contentSize = CGSize(width: 320, height: 30000)
        let controller = ChatScrollController(); controller.attach(view)
        var requests: [Bool] = []
        controller.setBottomNavigation { animated in requests.append(animated); view.contentOffset.y = 29400 }
        let arrived = await controller.returnToBottom(animated: true)
        XCTAssertTrue(arrived)
        XCTAssertEqual(requests, [false])
    }

    @MainActor func testReturnToBottomStopsWhenScrollViewNeverAttaches() async {
        let controller = ChatScrollController()
        let arrived = await controller.returnToBottom(animated: false)
        XCTAssertFalse(arrived)
        XCTAssertNil(controller.isNearBottom)
    }
    @MainActor func testReturnToBottomFinishesWhileContentKeepsGrowing() async {
        let view = UIScrollView(frame: CGRect(x:0,y:0,width:320,height:600))
        view.contentSize = CGSize(width:320,height:1600)
        let controller = ChatScrollController(); controller.attach(view)
        let streaming = Task { @MainActor in
            for _ in 0..<100 {
                guard !Task.isCancelled else { return }
                view.contentSize.height += 2
                view.contentOffset.y = view.contentSize.height - view.bounds.height
                try? await Task.sleep(for:.milliseconds(8))
            }
        }
        defer { streaming.cancel() }
        let clock = ContinuousClock(); let start = clock.now
        let arrived = await controller.returnToBottom(animated:false)
        XCTAssertTrue(arrived)
        XCTAssertLessThan(start.duration(to:clock.now),.milliseconds(400), "Arrival must not wait for the stream to settle")
    }
    @MainActor func testFollowInvalidationsCoalesceAndUseLatestHeight() async throws {
        let view = CountingChatScrollView(frame:CGRect(x:0,y:0,width:320,height:600))
        view.contentSize = CGSize(width:320,height:1600)
        let controller = ChatScrollController(); controller.attach(view)
        for height in 1600...1700 {
            view.contentSize.height = CGFloat(height)
            controller.followBottom()
        }
        try await Task.sleep(for:.milliseconds(60))
        XCTAssertEqual(view.writes,1)
        XCTAssertEqual(view.contentOffset.y,1100,accuracy:0.5)
    }
    @MainActor func testCancelledFollowDoesNotMoveAfterUserGesture() async throws {
        let view = CountingChatScrollView(frame:CGRect(x:0,y:0,width:320,height:600))
        view.contentSize = CGSize(width:320,height:1600)
        let controller = ChatScrollController(); controller.attach(view)
        controller.followBottom(); controller.cancelPendingScroll()
        try await Task.sleep(for:.milliseconds(40))
        XCTAssertEqual(view.writes,0)
        XCTAssertEqual(view.contentOffset.y,0)
    }
    @MainActor func testBottomNavigationMaterializesLazyTailWithoutUIKitWrites() {
        let view = CountingChatScrollView(frame:CGRect(x:0,y:0,width:320,height:600))
        view.contentSize = CGSize(width:320,height:600)
        let controller = ChatScrollController(); controller.attach(view)
        var animations: [Bool] = []
        controller.setBottomNavigation { animations.append($0) }
        controller.scrollToBottom(animated:true)
        controller.scrollToBottom(animated:false)
        XCTAssertEqual(animations,[true,false],"Even an estimated bottom must materialize its lazy anchor")
        XCTAssertEqual(view.writes,0)
        controller.setBottomNavigation(nil)
        controller.scrollTo(y:40)
        XCTAssertEqual(view.writes,1)
    }
    @MainActor func testReturnUsesLazyAnchorAndMeasuresUIKitArrival() async {
        let view = CountingChatScrollView(frame:CGRect(x:0,y:0,width:320,height:600))
        view.contentSize = CGSize(width:320,height:600)
        let controller = ChatScrollController(); controller.attach(view)
        var animatedRequest: Bool?
        controller.setBottomNavigation { animatedRequest = $0 }
        let arrived = await controller.returnToBottom(animated:true)
        XCTAssertTrue(arrived)
        XCTAssertEqual(animatedRequest,true)
        XCTAssertEqual(view.writes,0)
    }
    @MainActor func testLayoutWritesDoNotInterruptActiveReturnAnimation() async throws {
        let view = CountingChatScrollView(frame:CGRect(x:0,y:0,width:320,height:600))
        view.contentSize = CGSize(width:320,height:1600); view.holdAnimation = true
        let controller = ChatScrollController(); controller.attach(view)
        let operation = Task { await controller.returnToBottom(animated:true) }
        try await Task.sleep(for:.milliseconds(30))
        for _ in 0..<20 { controller.scrollToBottom(); controller.followBottom() }
        XCTAssertEqual(view.writes,1,"Height callbacks must not snap an active animation")
        controller.cancelPendingScroll()
        let arrived = await operation.value
        XCTAssertFalse(arrived)
    }
    @MainActor func testCancelledUnattachedReturnDoesNotReplayOnAttachment() async {
        let controller = ChatScrollController()
        let operation = Task { await controller.returnToBottom(animated:true) }
        await Task.yield()
        controller.cancelPendingScroll()
        let arrived = await operation.value
        XCTAssertFalse(arrived)
        let view = CountingChatScrollView(frame:CGRect(x:0,y:0,width:320,height:600))
        view.contentSize = CGSize(width:320,height:1600)
        controller.attach(view)
        XCTAssertEqual(view.writes,0)
    }
    @MainActor func testChatProbeFindsAncestorAfterSuperviewChanges() async throws {
        let controller = ChatScrollController()
        let probe = ChatScrollProbe.Probe()
        probe.controller = controller
        let wrapper = UIView()
        wrapper.addSubview(probe)
        let scroll = UIScrollView(frame: CGRect(x: 0, y: 0, width: 320, height: 600))
        scroll.contentSize = CGSize(width: 320, height: 1600)
        scroll.addSubview(wrapper)
        await Task.yield()
        let arrived = await controller.returnToBottom(animated: false)
        XCTAssertTrue(arrived)
        XCTAssertEqual(scroll.contentOffset.y, 1000, accuracy: 0.5)
    }
    @MainActor func testChatScrollTargetsActualBottomAfterContentAndKeyboardResize() {
        let view = UIScrollView(frame: CGRect(x: 0, y: 0, width: 320, height: 600))
        view.contentInsetAdjustmentBehavior = .never
        view.contentInset = UIEdgeInsets(top: 40, left: 0, bottom: 20, right: 0)
        view.contentSize = CGSize(width: 320, height: 1600)
        let controller = ChatScrollController()
        controller.attach(view)
        controller.scrollToBottom()
        XCTAssertEqual(view.contentOffset.y, 1020, accuracy: 0.5)
        view.bounds.size.height = 350
        view.contentSize.height = 1900
        controller.scrollToBottom()
        XCTAssertEqual(view.contentOffset.y, 1570, accuracy: 0.5)
        controller.scrollTo(y: 120)
        XCTAssertEqual(view.contentOffset.y, 120, accuracy: 0.5)
        view.contentSize.height = 100
        controller.scrollToBottom()
        XCTAssertEqual(view.contentOffset.y, -40, accuracy: 0.5)
    }
    @MainActor func testChatScrollKeepsLatestRequestUntilViewAttaches() {
        let controller = ChatScrollController()
        controller.scrollToBottom()
        controller.scrollTo(y: 75)
        let view = UIScrollView(frame: CGRect(x: 0, y: 0, width: 320, height: 600))
        view.contentSize = CGSize(width: 320, height: 1600)
        controller.attach(view)
        XCTAssertEqual(view.contentOffset.y, 75, accuracy: 0.5)
        view.setContentOffset(CGPoint(x: 0, y: 200), animated: false)
        controller.attach(view)
        XCTAssertEqual(view.contentOffset.y, 200, accuracy: 0.5, "A layout update must not replay the old request over user scrolling")
    }
    @MainActor func testAdaptiveColorsCanResolveOnBackgroundRenderer() async {
        let accent = UIColor(AtelierTheme.accent(named: "sage"))
        let surface = UIColor(AtelierTheme.surface)
        let components = await Task.detached {
            let traits = UITraitCollection(userInterfaceStyle: .dark)
            return [accent, surface].map { $0.resolvedColor(with: traits).cgColor.components ?? [] }
        }.value
        XCTAssertEqual(components.count, 2)
        XCTAssertTrue(components.allSatisfy { !$0.isEmpty })
    }
    func testFigureFiltersCombineTypeAndSearch() {
        let items = ["figure_5.pdf", "figure_6.png", "manuscrit.pdf", "méthodes.tex"].map { GalleryArtifact(name: $0) }
        var filter = GalleryFilterState(type: "Figures")
        XCTAssertEqual(items.filter(filter.matches).map(\.name), ["figure_5.pdf", "figure_6.png"])
        filter.query = "6"
        XCTAssertEqual(items.filter(filter.matches).map(\.name), ["figure_6.png"])
        filter.type = "PDF"
        XCTAssertTrue(items.filter(filter.matches).isEmpty)
    }
    @MainActor func testSelectingChatPreservesGalleryProjectAndDraft() {
        let model = WorkspaceModel()
        model.gallery.selectedProject = "gallery"
        let first = RemoteChatModel.Thread(id: "a", title: "A", provider: "codex", model: nil, projectId: "chat", status: "idle")
        let second = RemoteChatModel.Thread(id: "b", title: "B", provider: "codex", model: nil, projectId: nil, status: "idle")
        model.chat.select(first, workspace: model); model.draft = "À conserver"
        model.chat.select(second, workspace: model)
        XCTAssertEqual(model.gallery.selectedProject, "gallery")
        model.chat.select(first, workspace: model)
        XCTAssertEqual(model.draft, "À conserver")
        XCTAssertEqual(model.chat.creationProjectID, "chat")
    }
    @MainActor func testSidebarActiveSectionReturnsToListOnFirstTap() throws {
        for section: WorkspaceModel.Surface in [.gallery, .articles] {
            let model = WorkspaceModel()
            let artifact = GalleryArtifact(name: "notes.tex", data: Data("original".utf8))
            try model.openArtifact(artifact, data: artifact.data!)
            model.documentOrigin = section
            model.source = "édition conservée"
            model.sidebarRequested = true
            model.navigate(to: section)
            XCTAssertEqual(model.surface, section)
            XCTAssertFalse(model.sidebarRequested)
            XCTAssertEqual(model.savedDocuments[artifact.id]?.source, "édition conservée")
            model.navigate(to: section)
            XCTAssertEqual(model.surface, section)
        }
    }
    @MainActor func testDocumentsResumeIndependentlyAndBackReturnsToList() throws {
        let model = WorkspaceModel()
        let gallery = GalleryArtifact(name: "notes.tex", data: Data("original".utf8))
        let article = GalleryArtifact(name: "article.txt", data: Data("article".utf8))
        try model.openArtifact(gallery, data: gallery.data!)
        model.source = "édition conservée"
        model.surface = .chat
        model.navigate(to: .articles)
        try model.openArtifact(article, data: article.data!)
        model.documentOrigin = .articles
        model.navigate(to: .gallery)
        XCTAssertEqual(model.documentID, gallery.id)
        XCTAssertEqual(model.source, "édition conservée")
        model.navigate(to: .articles)
        XCTAssertEqual(model.documentID, article.id)
        XCTAssertEqual(model.documentOrigin, .articles)
        model.returnToDocumentList()
        model.navigate(to: .chat); model.navigate(to: .articles)
        XCTAssertEqual(model.surface, .articles)
    }
    @MainActor func testConversationSearchMatchesProjectAndRetainsUnassignedChats() {
        let threads = [RemoteChatModel.Thread(id: "a", title: "Analyse", provider: "codex", model: nil, projectId: "p", status: "idle"),
                       RemoteChatModel.Thread(id: "b", title: "Question", provider: "codex", model: nil, projectId: nil, status: "idle")]
        let projects = [GalleryModel.Project(projectId: "p", name: "Albédo")]
        XCTAssertEqual(ConversationProjectGroup.groups(threads: threads, projects: projects, query: "albédo").first?.threads.map(\.id), ["a"])
        XCTAssertEqual(ConversationProjectGroup.groups(threads: threads, projects: projects, query: "").last?.name, "Sans projet")
        XCTAssertTrue(ConversationProjectGroup.groups(threads: threads, projects: projects, query: "introuvable").isEmpty)
    }
}


@MainActor private final class CountingChatScrollView: UIScrollView {
    var writes = 0
    var holdAnimation = false
    override func setContentOffset(_ contentOffset: CGPoint, animated: Bool) {
        writes += 1
        if animated && holdAnimation { return }
        super.setContentOffset(contentOffset, animated: animated)
    }
}

final class CalculationTests: XCTestCase {
    func testProgressAndMixedTimestampFormats() throws {
        let snapshot = try JSONDecoder().decode(CalculationSnapshot.self, from: Data(#"{"observedAt":"2026-09-07T13:00:00.000Z","runs":[{"id":"one","host":"nas","label":"Forçages","state":"running","startedAt":1788786000000,"progress":{"current":7,"total":12,"unit":"mois"}},{"id":"two","host":"mac","label":"Export","state":"running","progress":{"current":1,"total":0,"unit":""}}],"errors":[]}"#.utf8))
        XCTAssertNotNil(snapshot.observedAt.date)
        XCTAssertNotNil(snapshot.runs[0].startedAt?.date)
        XCTAssertEqual(snapshot.runs[0].progress!.fraction!, 7.0 / 12.0, accuracy: 0.0001)
        XCTAssertNil(snapshot.runs[1].progress?.fraction)
        XCTAssertEqual(snapshot.runs[1].step, "Progression non fournie")
    }
    @MainActor func testOfflineRefreshRetainsLastSnapshotButAnotherHostClearsIt() async throws {
        CalculationTestProtocol.state.setOffline(false)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [CalculationTestProtocol.self]
        let session = URLSession(configuration: configuration)
        let gallery = GalleryModel(address: URL(string: "https://compute.invalid")!, token: "test", session: session)
        let model = CalculationsModel()
        await model.refresh(using: gallery, host: "all")
        XCTAssertEqual(model.runs.first?.id, "real-run")
        XCTAssertNil(model.error)
        // Same connection with a failing transport preserves the snapshot.
        CalculationTestProtocol.state.setOffline(true)
        await model.refresh(using: gallery, host: "all")
        XCTAssertEqual(model.runs.first?.id, "real-run")
        XCTAssertNotNil(model.error)
        XCTAssertFalse(model.loading)
        await model.refresh(using: gallery, host: "nas")
        XCTAssertTrue(model.runs.isEmpty)
        XCTAssertNotNil(model.error)
    }
}
private final class CalculationTestProtocol: URLProtocol, @unchecked Sendable {
    final class State: @unchecked Sendable {
        private let lock = NSLock()
        private var offline = false
        func setOffline(_ value: Bool) { lock.withLock { offline = value } }
        var isOffline: Bool { lock.withLock { offline } }
    }
    static let state = State()
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        if Self.state.isOffline {
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet)); return
        }
        guard request.url?.path == "/remote/v1/compute", request.value(forHTTPHeaderField: "x-atelier-device-token") == "test" else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL)); return
        }
        let data = Data(#"{"observedAt":"2026-09-07T13:00:00Z","runs":[{"id":"real-run","host":"nas","label":"Forçages","state":"running"}],"errors":[]}"#.utf8)
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

final class LongChatReplayTests: XCTestCase {
    @MainActor func testIndexedReplayMatchesStreamingAndRemovalSemantics() {
        let direct = RemoteChatModel(), batched = RemoteChatModel()
        for model in [direct, batched] { model.rows = [.init(id: "pending:m", kind: "user", text: "Pending", turn: "a")] }
        let events: [[String: Any]] = [
            ["kind": "started", "meta": ["turnId": "a", "eventId": "s"]],
            ["kind": "user", "text": "Question", "meta": ["turnId": "a", "eventId": "u", "messageId": "m"]],
            ["kind": "delta", "text": "Partial", "meta": ["turnId": "a"]],
            ["kind": "text", "text": "Final", "meta": ["turnId": "a", "eventId": "t"]],
            ["kind": "tool", "name": "exec", "command": "pwd", "meta": ["turnId": "a", "itemId": "tool", "eventId": "tool1"]],
            ["kind": "tool_update", "output": "result", "meta": ["turnId": "a", "itemId": "tool", "eventId": "tool2"]],
            ["kind": "interaction", "requestId": "r", "state": "pending", "meta": ["turnId": "a", "eventId": "i"]],
            ["kind": "delta", "text": "Stale", "meta": ["turnId": "a"]],
            ["kind": "text", "text": "Final", "meta": ["turnId": "a", "eventId": "t"]],
            ["kind": "user", "text": "Next", "meta": ["turnId": "b", "eventId": "u2"]],
            ["kind": "done", "meta": ["turnId": "a", "eventId": "d"]]
        ]
        for event in events { direct.apply(event) }
        batched.applyHistoryBatch(events[...])
        XCTAssertEqual(direct.rows.count, batched.rows.count)
        for (left, right) in zip(direct.rows, batched.rows) {
            XCTAssertEqual(left.kind, right.kind); XCTAssertEqual(left.text, right.text)
            XCTAssertEqual(left.turn, right.turn); XCTAssertEqual(left.detail, right.detail)
            XCTAssertEqual(left.toolFields, right.toolFields); XCTAssertEqual(left.resolved, right.resolved)
            XCTAssertEqual(left.isStreaming, right.isStreaming)
        }
        XCTAssertEqual(batched.rows.map(\.text), ["Question", "Final", "tool_update", "interaction", "Next"])
        XCTAssertTrue(batched.rows.first { $0.kind == "interaction" }!.resolved)
        XCTAssertFalse(batched.running)
    }

    @MainActor func testLongHistoryReplayKeepsRowsAndDeduplicates() {
        let chat = RemoteChatModel()
        let events: [[String: Any]] = (0..<1500).flatMap { turn in
            ["started", "user", "text", "done"].enumerated().map { index, kind in
                ["kind": kind, "text": "Message \(turn) " + String(repeating: "contenu ", count: 40),
                 "meta": ["eventId": "event-\(turn)-\(index)", "turnId": "turn-\(turn)"]] as [String: Any]
            }
        }
        let start = ContinuousClock.now
        for start in stride(from: 0, to: events.count, by: 128) { chat.applyHistoryBatch(events[start..<min(start + 128, events.count)]) }
        let first = start.duration(to: .now)
        let replay = ContinuousClock.now
        for start in stride(from: 0, to: events.count, by: 128) { chat.applyHistoryBatch(events[start..<min(start + 128, events.count)]) }
        print("LONG_CHAT_BENCH first=\(first) duplicate=\(replay.duration(to: .now)) rows=\(chat.rows.count)")
        XCTAssertEqual(chat.rows.count, 3000)
        XCTAssertFalse(chat.running)
    }
}

final class ComposerSuggestionTests: XCTestCase {
    func testStaleSelectionFromLongerTextIsIgnored() {
        let previous = "/redaction"
        XCTAssertNil(ComposerTrigger.caretOffset(in: "/", index: previous.endIndex))
        let current = "🧊 @man"
        XCTAssertEqual(ComposerTrigger.caretOffset(in: current, index: current.endIndex), current.utf16.count)
    }
    func testTriggersDistinguishCommandsFilesAndOrdinaryText() {
        XCTAssertEqual(ComposerTrigger.parse("/")?.kind, .command)
        XCTAssertEqual(ComposerTrigger.parse("  /reda")?.query, "reda")
        XCTAssertNil(ComposerTrigger.parse("Lis /tmp"))
        XCTAssertNil(ComposerTrigger.parse("/tmp/file"))
        XCTAssertNil(ComposerTrigger.parse("user@example.com"))
        XCTAssertNil(ComposerTrigger.parse("https://example.com"))
        XCTAssertNil(ComposerTrigger.parse("/recherche ensuite"))
        XCTAssertEqual(ComposerTrigger.parse("Compare 📄 @man")?.query, "man")
        XCTAssertEqual(ComposerTrigger.parse("@folder/man")?.kind, .file)
    }
    func testReplacementUsesCaretAndPreservesSuffixWithUnicode() throws {
        let text = "Évalue 🧊 @brouillon puis compare."
        let caret = (text as NSString).range(of: "@brou").location + "@brou".utf16.count
        let trigger = try XCTUnwrap(ComposerTrigger.parse(text, caret: caret))
        let result = try XCTUnwrap(trigger.replacing(in: text, with: "@manuscrit.tex "))
        XCTAssertEqual(result.text, "Évalue 🧊 @manuscrit.tex  puis compare.")
        XCTAssertEqual(result.caret, "Évalue 🧊 @manuscrit.tex ".utf16.count)
        XCTAssertNil(ComposerTrigger.parse(text, caret: -1))
        XCTAssertNil(ComposerTrigger.parse(text, caret: text.utf16.count + 1))
    }
    @MainActor func testCatalogResetDoesNotLeakAnotherConversationSuggestions() async {
        let model = ComposerSuggestionsModel(), gallery = GalleryModel(restoreCredentials: false)
        let thread = RemoteChatModel.Thread(id: "one", title: "One", provider: "codex", model: nil, projectId: "project", status: "idle")
        await model.load(kind: .command, thread: thread, project: "project", gallery: gallery, preview: true)
        XCTAssertEqual(model.matchingCommands("reda").map(\.name), ["redaction-article"])
        await model.load(kind: .file, thread: nil, project: nil, gallery: gallery, preview: false)
        XCTAssertTrue(model.files.isEmpty)
        XCTAssertFalse(model.commands.contains { $0.name == "redaction-article" })
        XCTAssertNotNil(model.error)
    }
}
