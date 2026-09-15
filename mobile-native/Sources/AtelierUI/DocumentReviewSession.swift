import Foundation

/// A review of one server version against the version that was already loaded.
///
/// The session deliberately works on line tokens that retain their terminating
/// newline.  Replacing a chunk can therefore restore an added or removed blank
/// line exactly, including a final newline and multi-scalar Unicode characters.
struct DocumentReviewSession: Identifiable, Equatable, Sendable {
    enum Decision: String, Equatable, Sendable {
        case pending
        case accepted
        case rejected
    }

    struct Chunk: Identifiable, Equatable, Sendable {
        public let id: Int
        public let before: String
        public let after: String
        public var decision: Decision

        init(id: Int, before: String, after: String, decision: Decision = .pending) {
            self.id = id
            self.before = before
            self.after = after
            self.decision = decision
        }
    }

    /// A compact renderable projection used by the inline SwiftUI review.
    /// Unchanged segments carry their source in `text`; change segments carry
    /// an empty `text` plus their chunk id and exact before/after text.
    struct Segment: Identifiable, Equatable, Sendable {
        public let id: Int
        public let text: String
        public let chunkID: Int?
        public let before: String
        public let after: String
        public let decision: Decision?

        var isChange: Bool { chunkID != nil }

        fileprivate init(id: Int, text: String, chunkID: Int? = nil,
                         before: String = "", after: String = "", decision: Decision? = nil) {
            self.id = id
            self.text = text
            self.chunkID = chunkID
            self.before = before
            self.after = after
            self.decision = decision
        }
    }

    let id: UUID
    let previous: String
    let current: String
    var chunks: [Chunk]
    private let layout: [LayoutSegment]
    private var history: [[Decision]]

    init(previous: String, current: String, id: UUID = UUID(), preserving existing: DocumentReviewSession? = nil) {
        self.previous = previous
        self.current = current

        let templates = Self.makeLayout(previous: previous, current: current)
        let generatedChunks = templates.compactMap { template -> Chunk? in
            guard let chunkID = template.chunkID,
                  let before = template.before, let after = template.after else { return nil }
            return Chunk(id: chunkID, before: before, after: after)
        }

        // A refresh of the same pair should not turn an accepted/rejected
        // decision back into a pending one.  Matching the complete chunk
        // sequence also protects against accidentally reusing a session for a
        // changed remote version.
        if let existing,
           existing.previous == previous,
           existing.current == current,
           existing.chunks.count == generatedChunks.count,
           zip(existing.chunks, generatedChunks).allSatisfy({ $0.before == $1.before && $0.after == $1.after }) {
            self.id = existing.id
            self.chunks = existing.chunks
            self.history = existing.history
        } else {
            // A changed version must never share the old async identity. The
            // caller uses this id to discard an acknowledgement that belongs
            // to a document/version that is no longer visible.
            self.id = id
            let decisions = Self.preservedDecisions(from: existing, matching: generatedChunks,
                                                    previous: previous, current: current)
            self.chunks = generatedChunks.enumerated().map { index, chunk in
                var chunk = chunk
                chunk.decision = decisions[index]
                return chunk
            }
            self.history = []
        }
        self.layout = templates
    }

    var pendingChunks: [Chunk] { chunks.filter { $0.decision == .pending } }
    var pendingCount: Int { pendingChunks.count }
    var canUndo: Bool { !history.isEmpty }
    var hasChanges: Bool { !chunks.isEmpty }

    /// The text represented by the current decisions. Pending and accepted
    /// chunks retain the current server version; rejected chunks restore only
    /// their exact old span.
    var renderedSource: String {
        var output = ""
        for piece in layout {
            guard let chunkID = piece.chunkID else {
                output += piece.text
                continue
            }
            let decision = chunks[chunkID].decision
            output += decision == .rejected ? piece.before ?? "" : piece.after ?? ""
        }
        return output
    }

    var segments: [Segment] {
        layout.enumerated().map { index, piece in
            guard let chunkID = piece.chunkID else {
                return Segment(id: index, text: piece.text)
            }
            let chunk = chunks[chunkID]
            return Segment(id: index, text: "", chunkID: chunkID,
                           before: chunk.before, after: chunk.after,
                           decision: chunk.decision)
        }
    }

    /// Returns a copy containing the acknowledged decision.  WorkspaceModel
    /// calls this only after its CAS save has succeeded.
    func applying(_ decision: Decision, to chunkID: Int?) -> DocumentReviewSession {
        var next = self
        let oldDecisions = chunks.map(\.decision)
        if let chunkID {
            guard chunks.indices.contains(chunkID), chunks[chunkID].decision == .pending else { return self }
            next.chunks[chunkID].decision = decision
        } else {
            for index in next.chunks.indices where next.chunks[index].decision == .pending {
                next.chunks[index].decision = decision
            }
        }
        guard next.chunks.map(\.decision) != oldDecisions else { return self }
        next.history.append(oldDecisions)
        return next
    }

    /// Returns the state before the most recent acknowledged decision.
    func undoing() -> DocumentReviewSession? {
        guard let oldDecisions = history.last, oldDecisions.count == chunks.count else { return nil }
        var next = self
        next.history.removeLast()
        for index in next.chunks.indices { next.chunks[index].decision = oldDecisions[index] }
        return next
    }

    // MARK: - Exact line-token diff

    private struct LayoutSegment: Equatable, Sendable {
        let chunkID: Int?
        let text: String
        let before: String?
        let after: String?
    }

    private struct ChunkSignature: Hashable {
        let before: String
        let after: String
    }

    private static func preservedDecisions(from existing: DocumentReviewSession?, matching chunks: [Chunk],
                                          previous: String, current: String) -> [Decision] {
        guard let existing, existing.previous == previous, existing.current == current else {
            return Array(repeating: .pending, count: chunks.count)
        }
        var decisions: [ChunkSignature: [Decision]] = [:]
        for chunk in existing.chunks {
            decisions[ChunkSignature(before: chunk.before, after: chunk.after), default: []].append(chunk.decision)
        }
        return chunks.map { chunk in
            let key = ChunkSignature(before: chunk.before, after: chunk.after)
            guard var values = decisions[key], !values.isEmpty else { return .pending }
            let decision = values.removeFirst()
            decisions[key] = values
            return decision
        }
    }

    private static func lineTokens(_ text: String) -> [String] {
        var tokens: [String] = []
        var start = text.startIndex
        for index in text.indices where text[index].isNewline {
            let end = text.index(after: index)
            tokens.append(String(text[start..<end]))
            start = end
        }
        // Keep an empty final token so "a" and "a\n" remain distinguishable.
        if start < text.endIndex || tokens.isEmpty || text.last == "\n" {
            tokens.append(String(text[start..<text.endIndex]))
        }
        return tokens
    }

    private static func makeLayout(previous: String, current: String) -> [LayoutSegment] {
        guard previous != current else {
            return [LayoutSegment(chunkID: nil, text: current, before: nil, after: nil)]
        }
        let old = lineTokens(previous)
        let new = lineTokens(current)

        // CollectionDifference is fast for ordinary source files.  Keep a
        // bounded fallback for generated/very large documents so review never
        // monopolizes the main actor.
        if old.count + new.count > 12_000 {
            return [LayoutSegment(chunkID: 0, text: "", before: previous, after: current)]
        }

        let changes = new.difference(from: old)
        var removals = Set<Int>()
        var additions = Set<Int>()
        for change in changes {
            switch change {
            case .remove(let offset, _, _): removals.insert(offset)
            case .insert(let offset, _, _): additions.insert(offset)
            }
        }

        var pieces: [LayoutSegment] = []
        var oldIndex = 0
        var newIndex = 0
        var removed: [String] = []
        var added: [String] = []
        var nextChunkID = 0

        func appendUnchanged(_ text: String) {
            guard !text.isEmpty else {
                // An empty source is still represented by one harmless segment
                // when there are no changes; empty changed spans use chunks.
                if pieces.isEmpty && old.isEmpty && new.isEmpty {
                    pieces.append(LayoutSegment(chunkID: nil, text: "", before: nil, after: nil))
                }
                return
            }
            if let last = pieces.last, last.chunkID == nil {
                pieces[pieces.count - 1] = LayoutSegment(chunkID: nil,
                    text: last.text + text, before: nil, after: nil)
            } else {
                pieces.append(LayoutSegment(chunkID: nil, text: text, before: nil, after: nil))
            }
        }
        func flushChange() {
            guard !removed.isEmpty || !added.isEmpty else { return }
            pieces.append(LayoutSegment(chunkID: nextChunkID, text: "",
                                        before: removed.joined(), after: added.joined()))
            nextChunkID += 1
            removed.removeAll(keepingCapacity: true)
            added.removeAll(keepingCapacity: true)
        }

        while oldIndex < old.count || newIndex < new.count {
            if oldIndex < old.count, removals.contains(oldIndex) {
                removed.append(old[oldIndex]); oldIndex += 1; continue
            }
            if newIndex < new.count, additions.contains(newIndex) {
                added.append(new[newIndex]); newIndex += 1; continue
            }
            if oldIndex < old.count, newIndex < new.count, old[oldIndex] == new[newIndex] {
                flushChange()
                appendUnchanged(new[newIndex])
                oldIndex += 1; newIndex += 1
            } else if oldIndex < old.count, newIndex < new.count {
                // Defensive fallback for an unusual CollectionDifference with
                // duplicate tokens and no direct operation at this offset.
                removed.append(old[oldIndex]); added.append(new[newIndex])
                oldIndex += 1; newIndex += 1
            } else if oldIndex < old.count {
                removed.append(old[oldIndex]); oldIndex += 1
            } else {
                added.append(new[newIndex]); newIndex += 1
            }
        }
        flushChange()

        if pieces.isEmpty {
            pieces.append(LayoutSegment(chunkID: nil, text: current, before: nil, after: nil))
        }
        return pieces
    }
}
