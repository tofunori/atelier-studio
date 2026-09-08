import SwiftUI
import PDFKit
import CryptoKit

struct PDFMark: Codable, Identifiable, Equatable {
    enum Style: String, Codable, CaseIterable {
        case highlight, underline
        var title: String { self == .highlight ? "Surligner" : "Souligner" }
    }
    struct Region: Codable, Equatable {
        let page: Int
        let bounds: CGRect
    }
    let id: UUID
    let documentKey: String
    let fileName: String
    let text: String
    let regions: [Region]
    var style: Style
    var note: String
    let createdAt: Date
    var ink: AnnotationInk? = nil
    var color: AnnotationInk { ink ?? .sage }
    var page: Int { regions.first?.page ?? 0 }
}

@MainActor @Observable final class PDFAnnotations {
    private(set) var entries: [PDFMark] = []
    private(set) var loadError: String?
    private(set) var revision = 0
    private let directory: URL?
    private struct Archive: Codable { var version = 1; let marks: [PDFMark] }
    static var defaultDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PDFAnnotations", isDirectory: true)
    }
    enum StoreError: LocalizedError {
        case unavailable, invalidSelection
        var errorDescription: String? {
            switch self {
            case .unavailable: "Les annotations enregistrées sont illisibles. Leur fichier a été conservé."
            case .invalidSelection: "Sélectionnez un passage dans le PDF avant de l’annoter."
            }
        }
    }
    init(directory: URL? = PDFAnnotations.defaultDirectory) {
        self.directory = directory
        guard let directory else { return }
        do {
            let archive = try JSONDecoder().decode(Archive.self, from: Data(contentsOf: directory.appendingPathComponent("annotations.json")))
            guard archive.version == 1, Set(archive.marks.map(\.id)).count == archive.marks.count else { throw StoreError.unavailable }
            entries = archive.marks
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile {} catch { loadError = error.localizedDescription }
    }
    func marks(for key: String) -> [PDFMark] {
        entries.filter { $0.documentKey == key }.sorted { $0.page == $1.page ? $0.createdAt < $1.createdAt : $0.page < $1.page }
    }
    func save(_ mark: PDFMark) throws {
        guard !mark.documentKey.isEmpty, !mark.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !mark.regions.isEmpty, mark.regions.allSatisfy({ $0.page >= 0 && $0.bounds.minX.isFinite && $0.bounds.minY.isFinite && $0.bounds.width.isFinite && $0.bounds.height.isFinite && $0.bounds.width > 0 && $0.bounds.height > 0 }) else { throw StoreError.invalidSelection }
        var next = entries.filter { $0.id != mark.id }; next.append(mark)
        try persist(next)
    }
    func remove(_ id: UUID) throws { try persist(entries.filter { $0.id != id }) }
    private func persist(_ next: [PDFMark]) throws {
        guard loadError == nil else { throw StoreError.unavailable }
        if let directory {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try JSONEncoder().encode(Archive(marks: next)).write(to: directory.appendingPathComponent("annotations.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
        entries = next; revision += 1
    }
    static func fingerprint(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }

    /// Only our own overlay annotations are replaced; original PDF annotations remain intact.
    static func apply(_ marks: [PDFMark], to document: PDFDocument) {
        for index in 0..<document.pageCount {
            guard let page = document.page(at: index) else { continue }
            for annotation in page.annotations where annotation.userName?.hasPrefix("Atelier PDFMark ") == true { page.removeAnnotation(annotation) }
        }
        for mark in marks {
            for region in mark.regions {
                guard let page = document.page(at: region.page) else { continue }
                let annotation = PDFAnnotation(bounds: region.bounds, forType: mark.style == .highlight ? .highlight : .underline, withProperties: nil)
                annotation.color = mark.color.uiColor.withAlphaComponent(mark.style == .highlight ? 0.25 : 0.8)
                annotation.contents = mark.note
                annotation.userName = "Atelier PDFMark \(mark.id.uuidString)"
                page.addAnnotation(annotation)
            }
        }
    }
}

extension WorkspaceModel {
    var pdfAnnotationKey: String {
        if let file = viewedArtifact, let project = file.projectID, let id = file.fileID {
            return "remote:\(project):\(id):pdf:\(pdfFingerprint)"
        }
        // Reimporting the same local PDF must recover its marks despite a new artifact UUID.
        return "local-pdf:\(pdfFingerprint)"
    }
    var documentPDFMarks: [PDFMark] { pdfAnnotations.marks(for: pdfAnnotationKey) }
    func savePDFMark(passage: DocumentPassage, id: UUID = UUID(), style: PDFMark.Style, note: String, expectedKey: String? = nil, ink: AnnotationInk = .sage) throws {
        guard passage.documentID == documentID, !pdfFingerprint.isEmpty, let document = pdfDocument,
              expectedKey == nil || expectedKey == pdfAnnotationKey,
              passage.regions.allSatisfy({ $0.pageIndex < document.pageCount }) else { throw PDFAnnotations.StoreError.invalidSelection }
        let previous = documentPDFMarks.first { $0.id == id }
        try pdfAnnotations.save(PDFMark(id: id, documentKey: pdfAnnotationKey, fileName: passage.fileName,
            text: passage.text, regions: passage.regions.map { .init(page: $0.pageIndex, bounds: $0.bounds) },
            style: style, note: note.trimmingCharacters(in: .whitespacesAndNewlines), createdAt: previous?.createdAt ?? Date(), ink: ink))
        PDFAnnotations.apply(documentPDFMarks, to: document)
    }
    func passage(for mark: PDFMark) -> DocumentPassage {
        DocumentPassage(documentID: documentID, fileName: mark.fileName, location: "page \(mark.page + 1)", text: mark.text,
            regions: mark.regions.map { .init(pageIndex: $0.page, bounds: $0.bounds) }, articleKey: currentArticle?.key, articleAttachmentKey: currentArticle?.pdfKey)
    }
    func showPDFMark(_ mark: PDFMark) { pdfPage = mark.page; pdfNavigationRequest = UUID(); documentMode = .pdf }
}
