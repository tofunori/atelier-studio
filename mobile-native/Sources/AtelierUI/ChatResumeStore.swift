import Foundation
import CryptoKit

struct SendAttempt: Codable, Sendable { var requestID: String; var fingerprint: String }

struct ChatSettings: Codable, Sendable {
    var model: String
    var effort: String
    var permissionMode: String? = nil
}
struct ChatBookmark: Codable, Sendable {
    var rowID: String?
    var followsTail = true
    var offsetY: Double?
    var contentHeight: Double?
    var rowOffsetY: Double? = nil
}
/// One conversation only; preserve its event ledger together with rows so replay stays idempotent.
struct ChatTranscriptSnapshot: Codable, Sendable {
    var threadID: String
    var rows: [RemoteChatModel.Row]
    var seen: Set<String>
    var liveRows: [String: String]
    var completedTurns: Set<String>
    var failedTurns: Set<String>
    var activeTurns: Set<String>
    var interactionStates: [String: String]
    var running: Bool
}

struct ChatResumeSnapshot: Codable, Sendable {
    var version = 1
    var selected: RemoteChatModel.Thread?
    var pendingAttachments: [GalleryArtifact]?
    var drafts: [String: String] = [:]
    var quotes: [String: RemoteChatModel.Quote] = [:]
    var attachments: [String: [GalleryArtifact]] = [:]
    var settings: [String: ChatSettings] = [:]
    var bookmarks: [String: ChatBookmark] = [:]
    var galleryProjectID = ""
    var historyFiles: [String: [String: [GalleryArtifact]]] = [:]
    var prepared: [PreparedChatMessage]?
    var pins: [String: [String]]?
    var sendAttempts: [String: SendAttempt]?
    var pausedQueues: [String]?
    var globalPermissionMode: String? = nil
    var transcript: ChatTranscriptSnapshot? = nil
}

actor ChatResumeStore {
    let directory: URL
    init(directory: URL) { self.directory = directory }
    static func live() -> ChatResumeStore {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return ChatResumeStore(directory: base.appendingPathComponent("ChatResume", isDirectory: true))
    }
    func load() throws -> ChatResumeSnapshot? {
        let file = directory.appendingPathComponent("session.json")
        guard FileManager.default.fileExists(atPath: file.path) else { return nil }
        var snapshot = try JSONDecoder().decode(ChatResumeSnapshot.self, from: Data(contentsOf: file))
        guard snapshot.version == 1 else { throw CocoaError(.fileReadUnknown) }
        snapshot.pendingAttachments = try restore(snapshot.pendingAttachments ?? [])
        for key in snapshot.attachments.keys { snapshot.attachments[key] = try restore(snapshot.attachments[key] ?? []) }
        for thread in snapshot.historyFiles.keys {
            for message in snapshot.historyFiles[thread]?.keys.map({$0}) ?? [] {
                let items = snapshot.historyFiles[thread]?[message] ?? []
                snapshot.historyFiles[thread]?[message] = try restore(items)
            }
        }
        for index in snapshot.prepared?.indices ?? 0..<0 {
            let files = snapshot.prepared?[index].files ?? []
            snapshot.prepared?[index].files = try restore(files)
        }
        return snapshot
    }
    private func restore(_ items: [GalleryArtifact]) throws -> [GalleryArtifact] {
        try items.map { item in
            var copy = item
            if let name = item.storedDataName {
                guard name.range(of: #"^[a-f0-9]{64}\.bin$"#, options: .regularExpression) != nil else { throw CocoaError(.fileReadInvalidFileName) }
                copy.data = try Data(contentsOf: directory.appendingPathComponent(name))
            }
            return copy
        }
    }
    func save(_ source: ChatResumeSnapshot) throws {
        let fm = FileManager.default
        try fm.createDirectory(at: directory, withIntermediateDirectories: true,
                               attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        var snapshot = source
        var retained: Set<String> = []
        func archive(_ items: [GalleryArtifact]) throws -> [GalleryArtifact] {
            try items.map { item in
                var copy = item
                if let data = item.data {
                    let name = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() + ".bin"
                    let file = directory.appendingPathComponent(name)
                    if !fm.fileExists(atPath: file.path) { try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]) }
                    copy.storedDataName = name; copy.data = nil; retained.insert(name)
                } else if let name = copy.storedDataName { retained.insert(name) }
                return copy
            }
        }
        snapshot.pendingAttachments = try archive(snapshot.pendingAttachments ?? [])
        for key in snapshot.attachments.keys { snapshot.attachments[key] = try archive(snapshot.attachments[key] ?? []) }
        for thread in snapshot.historyFiles.keys {
            for message in snapshot.historyFiles[thread]?.keys.map({$0}) ?? [] {
                let items = snapshot.historyFiles[thread]?[message] ?? []
                snapshot.historyFiles[thread]?[message] = try archive(items)
            }
        }
        for index in snapshot.prepared?.indices ?? 0..<0 {
            let files = snapshot.prepared?[index].files ?? []
            snapshot.prepared?[index].files = try archive(files)
        }
        try JSONEncoder().encode(snapshot).write(to: directory.appendingPathComponent("session.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        // Only unreferenced files owned by this store are removed after the atomic save.
        for file in try fm.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) where file.pathExtension == "bin" && !retained.contains(file.lastPathComponent) {
            try? fm.removeItem(at: file)
        }
    }
}
