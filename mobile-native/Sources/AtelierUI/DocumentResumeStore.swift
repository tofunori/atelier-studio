import Foundation

struct DocumentResumeSnapshot: Codable, Sendable {
    var artifact: GalleryArtifact
    var bytes: Data
    var source: String?
    var originalSource: String?
    var page: Int
    var readingOffset: Double
    var mode: String
    var article: LibraryArticle?
    var visible: Bool
}

actor DocumentResumeStore {
    let directory: URL
    init(directory: URL) { self.directory = directory }
    static func live() -> DocumentResumeStore {
        Self(directory: FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("DocumentResume"))
    }
    func save(_ snapshot: DocumentResumeSnapshot) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try JSONEncoder().encode(snapshot).write(to: directory.appendingPathComponent("document.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    func load() throws -> DocumentResumeSnapshot? {
        let path = directory.appendingPathComponent("document.json")
        guard FileManager.default.fileExists(atPath: path.path) else { return nil }
        return try JSONDecoder().decode(DocumentResumeSnapshot.self, from: Data(contentsOf: path))
    }
}

extension WorkspaceModel {
    func scheduleDocumentResume() {
        guard !chat.isPreview else { return }
        documentSaveTask?.cancel()
        documentSaveTask = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(450)) } catch { return }
            await self?.flushDocumentResume()
        }
    }
    func flushDocumentResume() async {
        guard let artifact = viewedArtifact, let documentBytes, !chat.isPreview else { return }
        let snapshot = DocumentResumeSnapshot(artifact: artifact, bytes: documentBytes,
            source: sourceAvailable ? source : nil, originalSource: originalSources[documentID], page: pdfPage,
            readingOffset: readingOffsets[documentID] ?? 0, mode: documentMode.rawValue,
            article: currentArticle, visible: surface == .document)
        do { try await documentResumeStore.save(snapshot) }
        catch { documentError = "La reprise du document n’a pas pu être sauvegardée : " + error.localizedDescription }
    }
    func restoreDocument() async -> Bool {
        do {
            guard let snapshot = try await documentResumeStore.load() else { return false }
            try openArtifact(snapshot.artifact, data: snapshot.bytes)
            if let source = snapshot.source { self.source = source }
            originalSources[documentID] = snapshot.originalSource
            pdfPage = max(0, min(snapshot.page, (pdfDocument?.pageCount ?? 1) - 1))
            readingOffsets[documentID] = snapshot.readingOffset
            documentMode = DocumentMode(rawValue: snapshot.mode) ?? documentMode
            currentArticle = snapshot.article; documentOrigin = snapshot.article == nil ? .gallery : .articles
            return snapshot.visible
        } catch { documentError = "Le dernier document n’a pas pu être restauré : " + error.localizedDescription; return false }
    }
}
