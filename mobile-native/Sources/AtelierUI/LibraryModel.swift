import SwiftUI
import CryptoKit

struct LibraryArticle: Codable, Identifiable, Sendable {
    let key: String
    let title: String
    let creators: String
    let year: String
    let publication: String
    let hasPdf: Bool
    let pdfKey: String?
    let pdfFile: String?
    var id: String { key }
}

struct LibraryCollection: Codable, Identifiable { let id: Int; let name: String; let parent: Int? }

struct LibraryNote: Codable, Identifiable {
    let id: UUID
    let articleKey: String
    let citation: String
    let passage: String
    let text: String
    let date: Date
    var zoteroKey: String?
    var zoteroVersions: [String: Int]?
    var syncedText: String?
}

@MainActor @Observable final class LibraryModel {
    var articles: [LibraryArticle] = []
    var notes: [LibraryNote] = []
    var collections: [LibraryCollection] = []
    var selectedCollection = 0
    private var refreshID = UUID()
    private var loadedCollection = 0
    var busy = false
    var error: String?
    private let folder: URL?
    init(folder: URL? = nil) {
        self.folder = folder ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.appendingPathComponent("Library", isDirectory: true)
        if let folder = self.folder {
            articles = (try? JSONDecoder().decode([LibraryArticle].self, from: Data(contentsOf: folder.appendingPathComponent("articles.json")))) ?? []
            notes = (try? JSONDecoder().decode([LibraryNote].self, from: Data(contentsOf: folder.appendingPathComponent("notes.json")))) ?? []
        }
    }
    func refresh(using gallery: GalleryModel) async {
        let id = UUID(); refreshID = id
        let collection = selectedCollection
        if collection != loadedCollection {
            articles = []
            if collection == 0, let folder { articles = (try? JSONDecoder().decode([LibraryArticle].self, from: Data(contentsOf: folder.appendingPathComponent("articles.json")))) ?? [] }
        }
        busy = true; error = nil
        defer { if refreshID == id { busy = false } }
        do {
            struct Payload: Decodable { let items: [LibraryArticle]; let collections: [LibraryCollection] }
            let data = try await gallery.chatRequest(["zotero"], query: collection == 0 ? [] : [URLQueryItem(name: "collectionId", value: String(collection))])
            let fresh = try JSONDecoder().decode(Payload.self, from: data)
            guard refreshID == id else { return }
            if collection == 0 { try store(JSONEncoder().encode(fresh.items), name: "articles.json") }
            articles = fresh.items; collections = fresh.collections; loadedCollection = collection
        } catch { if refreshID == id { self.error = error.localizedDescription } }
    }
    func open(_ article: LibraryArticle, workspace: WorkspaceModel) async throws {
        let name = "\(article.key).pdf"
        let data: Data
        if let folder, let cached = try? Data(contentsOf: folder.appendingPathComponent(name)) { data = cached }
        else {
            data = try await workspace.gallery.chatRequest(["zotero", "pdf", article.key])
            try store(data, name: name)
        }
        let digest = Array(SHA256.hash(data: Data(article.key.utf8)))
        let id = UUID(uuid: (digest[0],digest[1],digest[2],digest[3],digest[4],digest[5],digest[6],digest[7],digest[8],digest[9],digest[10],digest[11],digest[12],digest[13],digest[14],digest[15]))
        let item = GalleryArtifact(id: id, name: article.pdfFile ?? "\(article.title).pdf", data: data)
        try workspace.openArtifact(item, data: data)
        workspace.currentArticle = article
        workspace.documentOrigin = .articles
    }
    func sync(_ draft: AnnotationDraft, using gallery: GalleryModel) async throws {
        try save(draft)
        guard let key = draft.passage.articleKey else { return }
        struct Saved: Decodable { let key: String; let versions: [String: Int] }
        var payload: [String: Any] = ["id": draft.id.uuidString, "citation": draft.passage.citation, "passage": draft.passage.text, "note": draft.note]
        if let attachmentKey = draft.passage.articleAttachmentKey { payload["attachmentKey"] = attachmentKey }
        payload["regions"] = draft.passage.regions.map { ["pageIndex": $0.pageIndex, "rect": [$0.bounds.minX, $0.bounds.minY, $0.bounds.maxX, $0.bounds.maxY]] as [String: Any] }
        payload["expectedVersions"] = notes.first(where: { $0.id == draft.id })?.zoteroVersions ?? [:]
        let data = try await gallery.chatRequest(["zotero", "note", key], body: payload, timeout: 125)
        let result = try JSONDecoder().decode(Saved.self, from: data)
        if let index = notes.firstIndex(where: { $0.id == draft.id }) {
            notes[index].zoteroKey = result.key
            notes[index].zoteroVersions = result.versions
            notes[index].syncedText = draft.note
            try store(JSONEncoder().encode(notes), name: "notes.json")
        }
    }
    func save(_ draft: AnnotationDraft) throws {
        guard let key = draft.passage.articleKey else { return }
        let previous = notes.first { $0.id == draft.id }
        var updated = notes.filter { $0.id != draft.id }
        updated.append(LibraryNote(id: draft.id, articleKey: key, citation: draft.passage.citation, passage: draft.passage.text, text: draft.note, date: Date(), zoteroKey: previous?.zoteroKey, zoteroVersions: previous?.zoteroVersions, syncedText: previous?.syncedText))
        try store(JSONEncoder().encode(updated), name: "notes.json")
        notes = updated
    }
    private func store(_ data: Data, name: String) throws {
        guard let folder else { throw CocoaError(.fileWriteUnknown) }
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try data.write(to: folder.appendingPathComponent(name), options: [.atomic, .completeFileProtectionUnlessOpen])
    }
}

struct NativeLibraryView: View {
    let workspace: WorkspaceModel
    @State private var query = ""
    @State private var opening: String?
    @State private var selected: LibraryArticle?
    var body: some View {
        @Bindable var library = workspace.library
        List {
            if !library.collections.isEmpty {
                Picker("Collection", selection: $library.selectedCollection) {
                    Text("Tous les articles").tag(0)
                    ForEach(library.collections) { Text($0.name).tag($0.id) }
                }
            }
            if library.busy { ProgressView("Chargement de Zotero…") }
            if let error = library.error { Text(error).font(.footnote).foregroundStyle(.secondary) }
            ForEach(library.articles.filter { query.isEmpty || "\($0.title) \($0.creators) \($0.year)".localizedStandardContains(query) }) { article in
                Button { selected = article } label: {
                    HStack(spacing: 12) {
                        Image(systemName: article.hasPdf ? "doc.richtext" : "doc.text").foregroundStyle(AtelierTheme.accent).frame(width: 32)
                        VStack(alignment: .leading, spacing: 5) {
                            Text(article.title).font(.body.weight(.medium)).foregroundStyle(.primary).lineLimit(3)
                            Text("\(article.creators) · \(article.year)").font(.caption).foregroundStyle(.secondary)
                        }
                    }.padding(.vertical, 6)
                }
            }
            if library.articles.isEmpty && !library.busy {
                ContentUnavailableView("Vos articles", systemImage: "books.vertical", description: Text("Connectez le Mac pour charger votre bibliothèque Zotero. Les PDF ouverts restent disponibles sur cet appareil."))
            }
        }
        .searchable(text: $query, prompt: "Titre, auteur, année")
        .refreshable { await library.refresh(using: workspace.gallery) }
        .task(id: library.selectedCollection) { await library.refresh(using: workspace.gallery) }
        .sheet(item: $selected) { article in
            NavigationStack {
                List {
                    Section {
                        Text(article.title).font(.title2.weight(.semibold))
                        Text("\(article.creators) · \(article.year)").foregroundStyle(.secondary)
                        Text(article.publication).font(.subheadline)
                        Button("Lire le PDF", systemImage: "doc.richtext") {
                            opening = article.id
                            Task {
                                defer { opening = nil }
                                do { try await library.open(article, workspace: workspace); selected = nil }
                                catch { library.error = error.localizedDescription }
                            }
                        }.disabled(!article.hasPdf || opening != nil)
                        if opening != nil { ProgressView() }
                        if let error = library.error { Text(error).font(.footnote).foregroundStyle(.red) }
                    }
                    Section("Notes conservées dans Atelier") {
                        ForEach(library.notes.filter { $0.articleKey == article.key }) { note in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(note.citation).font(.caption).foregroundStyle(.secondary)
                                Text(note.passage).font(.subheadline).lineLimit(4)
                                Text(note.text)
                                Text(note.zoteroKey != nil && note.syncedText == note.text ? "Enregistrée dans Zotero" : "Conservée dans Atelier").font(.caption).foregroundStyle(.secondary)
                                Button("Préparer dans le chat", systemImage: "bubble") {
                                    workspace.draft = "Article Zotero : \(article.title) [\(article.key)]\n\(note.citation)\n\n> \(note.passage)\n\n\(note.text)"
                                    workspace.surface = .chat; selected = nil
                                }
                            }
                        }
                        Text("Les notes sont conservées sur cet appareil. L’enregistrement dans Zotero est confirmé séparément.").font(.caption).foregroundStyle(.secondary)
                    }
                }.navigationTitle("Article").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fermer") { selected = nil } } }
            }
        }
    }
}
