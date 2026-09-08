import Foundation
import Observation
import CryptoKit

struct ReadingNote: Codable, Identifiable, Equatable {
    let id: UUID
    let documentKey: String
    let fileName: String
    let location: String
    let selectedText: String
    let sourceText: String
    private let sourceOffset: Int
    private let sourceLength: Int
    let sourceFingerprint: String
    let contextBefore: String
    let contextAfter: String
    var markingStyle: PDFMark.Style?
    var ink: AnnotationInk?
    var style: PDFMark.Style { markingStyle ?? .highlight }
    var color: AnnotationInk { ink ?? .sage }
    var note: String
    let createdAt: Date
    var updatedAt: Date

    var sourceRange: NSRange { NSRange(location: sourceOffset, length: sourceLength) }

    fileprivate init(id: UUID, documentKey: String, fileName: String, location: String,
                     selectedText: String, sourceText: String, sourceRange: NSRange,
                     source: String, note: String) {
        self.id = id; self.documentKey = documentKey; self.fileName = fileName
        self.location = location; self.selectedText = selectedText; self.sourceText = sourceText
        sourceOffset = sourceRange.location; sourceLength = sourceRange.length
        sourceFingerprint = Self.fingerprint(source)
        let range = Range(sourceRange, in: source)!
        contextBefore = String(source[..<range.lowerBound].suffix(80))
        contextAfter = String(source[range.upperBound...].prefix(80))
        self.note = note; createdAt = Date(); updatedAt = createdAt
    }

    /// Never move a note to another occurrence after edits, even if it is now unique.
    func resolvedRange(in source: String) -> NSRange? {
        guard Self.fingerprint(source) == sourceFingerprint,
              sourceOffset >= 0, sourceLength > 0,
              sourceOffset <= source.utf16.count, sourceLength <= source.utf16.count - sourceOffset,
              let range = Range(sourceRange, in: source),
              String(source[range]) == sourceText else { return nil }
        return sourceRange
    }

    fileprivate static func fingerprint(_ source: String) -> String {
        SHA256.hash(data: Data(source.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

@MainActor @Observable
final class DocumentReadingNotes {
    private(set) var loadError: String?
    private var entries: [ReadingNote] = []
    private let directory: URL?
    static var defaultDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("DocumentReadingNotes", isDirectory: true)
    }
    private struct Archive: Codable { var version = 1; var notes: [ReadingNote] }
    enum StoreError: LocalizedError {
        case unavailable, emptyNote, invalidAnchor, missingNote
        var errorDescription: String? {
            switch self {
            case .unavailable: return "Les annotations enregistrées sont illisibles. Le fichier a été conservé."
            case .emptyNote: return "Ajoutez une remarque avant d’enregistrer."
            case .invalidAnchor: return "Le passage sélectionné ne correspond plus au document."
            case .missingNote: return "Cette annotation n’existe plus."
            }
        }
    }

    /// Passing nil creates an in-memory store for previews.
    init(directory: URL? = DocumentReadingNotes.defaultDirectory) {
        self.directory = directory
        guard let directory else { return }
        do {
            let data = try Data(contentsOf: directory.appendingPathComponent("notes.json"))
            let archive = try JSONDecoder().decode(Archive.self, from: data)
            guard archive.version == 1, Set(archive.notes.map(\.id)).count == archive.notes.count else {
                throw StoreError.unavailable
            }
            entries = archive.notes
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
            // A first launch has no archive.
        } catch { loadError = error.localizedDescription }
    }

    func notes(for documentKey: String) -> [ReadingNote] {
        entries.filter { $0.documentKey == documentKey }.sorted {
            if $0.sourceRange.location != $1.sourceRange.location { return $0.sourceRange.location < $1.sourceRange.location }
            return $0.createdAt < $1.createdAt
        }
    }

    @discardableResult
    func upsert(id: UUID? = nil, documentKey: String, fileName: String, location: String,
                selectedText: String, sourceText: String, sourceRange: NSRange,
                source: String, note: String, style: PDFMark.Style = .highlight, ink: AnnotationInk = .sage) throws -> ReadingNote {
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        var next = entries
        var result: ReadingNote
        if let id {
            guard let index = next.firstIndex(where: { $0.id == id && $0.documentKey == documentKey }) else {
                throw StoreError.missingNote
            }
            // Editing a remark preserves the original citation and anchor, including unresolved ones.
            next[index].markingStyle = style; next[index].ink = ink; next[index].note = trimmed; next[index].updatedAt = Date(); result = next[index]
        } else {
            guard !documentKey.isEmpty, !selectedText.isEmpty, sourceRange.location >= 0,
                  sourceRange.length > 0, sourceRange.location <= source.utf16.count,
                  sourceRange.length <= source.utf16.count - sourceRange.location,
                  let range = Range(sourceRange, in: source),
                  String(source[range]) == sourceText else { throw StoreError.invalidAnchor }
            result = ReadingNote(id: UUID(), documentKey: documentKey, fileName: fileName,
                                 location: location, selectedText: selectedText, sourceText: sourceText,
                                 sourceRange: sourceRange, source: source, note: trimmed)
            result.markingStyle = style; result.ink = ink
            next.append(result)
        }
        try persist(next); entries = next
        return result
    }

    func remove(id: UUID) throws {
        let next = entries.filter { $0.id != id }
        try persist(next); entries = next
    }

    func restore(_ note: ReadingNote) throws {
        guard !entries.contains(where: { $0.id == note.id }) else { return }
        let next = entries + [note]
        try persist(next); entries = next
    }

    static func groupedPrompt(notes: [ReadingNote]) -> String {
        guard !notes.isEmpty else { return "" }
        return "Voici mes remarques de lecture. Propose des révisions en tenant compte de chaque remarque.\n\n" + notes.map {
            "\($0.fileName) — \($0.location)\nCitation :\n\($0.selectedText)\n\nSource exacte :\n\($0.sourceText)\n\nRemarque :\n\($0.note)"
        }.joined(separator: "\n\n---\n\n")
    }

    private func persist(_ next: [ReadingNote]) throws {
        guard loadError == nil else { throw StoreError.unavailable }
        guard let directory else { return }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        let data = try JSONEncoder().encode(Archive(notes: next))
        try data.write(to: directory.appendingPathComponent("notes.json"),
                       options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
