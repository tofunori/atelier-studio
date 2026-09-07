import XCTest
import SwiftUI
@testable import AtelierUI

final class NavigationTests: XCTestCase {
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
