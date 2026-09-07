import XCTest
@testable import AtelierUI

final class SidebarPreferencesTests: XCTestCase {
    @MainActor func testRecentProjectsPinnedAndHiddenPersistWithoutDeletingChats() throws {
        let suite = "atelier-sidebar-test-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let preferences = SidebarProjectPreferences(defaults: defaults)
        let now = Date()
        let groups = (0..<8).map { index in
            ConversationProjectGroup(id: "p\(index)", name: "Projet \(index)", threads: [
                .init(id: "t\(index)", title: "Chat", provider: "codex", model: nil, projectId: "p\(index)", status: "idle", updatedAt: now.addingTimeInterval(Double(-index) * 86400).ISO8601Format())
            ])
        }
        XCTAssertEqual(preferences.visible(groups, now: now).map(\.id), ["p0", "p1", "p2", "p3", "p4"])
        preferences.setPinned("p7", true)
        preferences.setHidden("p1", true)
        let restored = SidebarProjectPreferences(defaults: defaults)
        XCTAssertEqual(restored.visible(groups, now: now).first?.id, "p7")
        XCTAssertFalse(restored.visible(groups, now: now).contains { $0.id == "p1" })
        XCTAssertEqual(groups.flatMap(\.threads).count, 8)
    }
    @MainActor func testOldProjectsNeedPinOrExplicitRecentVisit() throws {
        let suite = "atelier-sidebar-test-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let preferences = SidebarProjectPreferences(defaults: defaults)
        let group = ConversationProjectGroup(id: "old", name: "Ancien", threads: [.init(id: "a", title: "A", provider: "codex", model: nil, projectId: "old", status: "idle", updatedAt: "2020-01-01T00:00:00Z")])
        XCTAssertTrue(preferences.visible([group]).isEmpty)
        preferences.markOpened("old")
        XCTAssertEqual(preferences.visible([group]).count, 1)
        preferences.setHidden("old", true)
        XCTAssertTrue(preferences.visible([group]).isEmpty)
        preferences.setPinned("old", true)
        XCTAssertEqual(preferences.visible([group]).count, 1)
    }
    @MainActor func testUnavailableProjectsAreOneGroupAndHiddenByDefaultButSearchable() throws {
        let suite = "atelier-sidebar-test-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let threads = ["missing-a", "missing-b"].map { RemoteChatModel.Thread(id: $0, title: "Un chat", provider: "codex", model: nil, projectId: $0, status: "idle") }
        let groups = ConversationProjectGroup.groups(threads: threads, projects: [], query: "")
        XCTAssertEqual(groups.count, 1)
        XCTAssertEqual(groups.first?.threads.count, 2)
        XCTAssertTrue(SidebarProjectPreferences(defaults: defaults).visible(groups).isEmpty)
        XCTAssertEqual(ConversationProjectGroup.groups(threads: threads, projects: [], query: "Un chat").first?.threads.count, 2)
    }
    func testEffortGaugeUsesOrderedLevelsAndDoesNotInventAutomaticEffort() {
        let levels = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"].compactMap { ThinkingEffortLevel($0).value }
        XCTAssertEqual(levels, levels.sorted())
        XCTAssertEqual(Set(levels).count, 8)
        XCTAssertNil(ThinkingEffortLevel("").value)
        XCTAssertNil(ThinkingEffortLevel("custom").value)
        XCTAssertEqual(ThinkingEffortLevel("high").label, "Élevé")
    }
}
