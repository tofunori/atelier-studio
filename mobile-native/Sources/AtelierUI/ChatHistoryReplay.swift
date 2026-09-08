import Foundation

/// JSONSerialization returns immutable Foundation containers by default. The
/// decoded envelope is transferred once and only read on the main actor.
struct ChatHistoryEnvelope: @unchecked Sendable {
    let events: [[String: Any]]
    static func decode(_ data: Data) async throws -> Self {
        try await Task.detached(priority: .userInitiated) {
            guard let body = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let events = body["events"] as? [[String: Any]] else { throw CocoaError(.fileReadCorruptFile) }
            return Self(events: events)
        }.value
    }
}

/// Ephemeral index for a synchronous replay batch. Nothing is retained across
/// a suspension or a conversation switch. Removals rebuild shifted indices.
struct ChatReplayIndex {
    private(set) var count = 0
    var ids: [String: Int] = [:]
    var turns: [String: [Int]] = [:]
    var interactions: [Int] = []
    init(_ rows: [RemoteChatModel.Row]) { synchronize(rows) }
    mutating func synchronize(_ rows: [RemoteChatModel.Row]) {
        if rows.count < count { count = 0; ids.removeAll(keepingCapacity: true); turns.removeAll(keepingCapacity: true); interactions.removeAll(keepingCapacity: true) }
        for index in count..<rows.count {
            ids[rows[index].id] = index
            turns[rows[index].turn, default: []].append(index)
            if rows[index].kind == "interaction" { interactions.append(index) }
        }
        count = rows.count
    }
}
