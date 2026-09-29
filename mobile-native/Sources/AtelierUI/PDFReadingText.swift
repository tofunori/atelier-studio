import Foundation
import PDFKit
import Vision
import UIKit

struct PDFReadingAnchor: Sendable {
    let offset: Int
    let bounds: CGRect
    let line: Int
}

struct PDFReadingVisual: Sendable {
    let bounds: CGRect
    let image: Data
    let label: String
}

struct PDFReadingBlock: Identifiable, Sendable {
    let id: Int
    let text: String
    let heading: Bool
    var anchors: [PDFReadingAnchor?] = []
    var visual: PDFReadingVisual? = nil
    /// UTF-16 offsets of the spaces that join two PDF lines, until hyphenation is resolved.
    var joins: [Int] = []

    /// Rejoins words the PDF split across two lines ("sha-" / "dow" → "shadow"). The hyphen stays
    /// when the joined form is not a word ("stand-replacing"), or before "and"/"or" ("pre- and post-fire").
    /// A removed hyphen's box is kept in the preceding letter's anchor, so annotations still cover it.
    func joiningHyphenatedLines(isWord: (String) -> Bool) -> PDFReadingBlock {
        guard !joins.isEmpty, anchors.count == text.utf16.count else { var copy = self; copy.joins = []; return copy }
        var units = Array(text.utf16), located = anchors
        func scalar(_ index: Int) -> UnicodeScalar? { units.indices.contains(index) ? UnicodeScalar(units[index]) : nil }
        func letter(_ index: Int) -> Bool { scalar(index).map(CharacterSet.letters.contains) ?? false }
        for join in joins.sorted(by: >) where join >= 2 && join + 1 < units.count && units[join] == 0x20 {
            let hyphen = units[join - 1]
            guard [0x2D, 0x2010, 0x2011, 0xAD].contains(hyphen), letter(join - 2),
                  letter(join + 1) || (scalar(join + 1).map(CharacterSet.decimalDigits.contains) ?? false) else { continue }
            var start = join - 2
            while letter(start - 1) { start -= 1 }
            var end = join + 1
            while letter(end) { end += 1 }
            let left = String(decoding: units[start..<(join - 1)], as: UTF16.self)
            let right = String(decoding: units[(join + 1)..<end], as: UTF16.self)
            if hyphen != 0xAD && Self.conjunctions.contains(right.lowercased()) { continue }
            let lowercase = scalar(join + 1).map(CharacterSet.lowercaseLetters.contains) ?? false
            // "non-lethal" and "self-shading" read as compounds even when the dictionary knows the joined form.
            let prefix = Self.prefixes.contains(left.lowercased())
            if hyphen == 0xAD || (lowercase && !prefix && isWord((left + right).lowercased())) {
                if let mark = located[join - 1], let previous = located[join - 2], previous.line == mark.line {
                    located[join - 2] = PDFReadingAnchor(offset: previous.offset, bounds: previous.bounds.union(mark.bounds), line: previous.line)
                }
                units.removeSubrange((join - 1)...join); located.removeSubrange((join - 1)...join)
            } else {
                units.remove(at: join); located.remove(at: join)
            }
        }
        return PDFReadingBlock(id: id, text: String(decoding: units, as: UTF16.self), heading: heading, anchors: located, visual: visual)
    }

    private static let conjunctions: Set<String> = ["and", "or", "nor", "to", "et", "ou"]
    private static let prefixes: Set<String> = ["non", "self"]

    /// Offsets come from extraction, not a search for a potentially repeated quote.
    func regions(for range: NSRange) -> [CGRect]? {
        guard range.location != NSNotFound, range.location >= 0, range.length > 0,
              range.location <= anchors.count, range.length <= anchors.count - range.location,
              anchors.count == text.utf16.count else { return nil }
        let units = Array(text.utf16)
        var result: [CGRect] = [], previousLine: Int?
        for index in range.location..<NSMaxRange(range) {
            if let scalar = UnicodeScalar(units[index]), CharacterSet.whitespacesAndNewlines.contains(scalar) { continue }
            guard let anchor = anchors[index] else {
                return nil
            }
            guard !anchor.bounds.isEmpty, !anchor.bounds.isInfinite, !anchor.bounds.isNull else { return nil }
            if previousLine == anchor.line, let last = result.indices.last {
                result[last] = result[last].union(anchor.bounds)
            } else { result.append(anchor.bounds) }
            previousLine = anchor.line
        }
        return result.isEmpty ? nil : result
    }

    func ranges(inside regions: [CGRect]) -> [NSRange] {
        var result: [NSRange] = []
        for (index, anchor) in anchors.enumerated() {
            guard let anchor, regions.contains(where: {
                $0.contains(CGPoint(x: anchor.bounds.midX, y: anchor.bounds.midY))
            }) else { continue }
            if let last = result.indices.last, NSMaxRange(result[last]) == index { result[last].length += 1 }
            else { result.append(NSRange(location: index, length: 1)) }
        }
        return result
    }
}

struct PDFReadingPage: Sendable {
    let index: Int
    let blocks: [PDFReadingBlock]
    let margins: [PDFReadingBlock]

    func joiningHyphenatedLines(isWord: (String) -> Bool) -> PDFReadingPage {
        PDFReadingPage(index: index, blocks: blocks.map { $0.joiningHyphenatedLines(isWord: isWord) },
                       margins: margins.map { $0.joiningHyphenatedLines(isWord: isWord) })
    }
}

/// UIKit's spelling dictionary decides whether a word split at a line end is one word.
@MainActor enum PDFReadingDictionary {
    private static let checker = UITextChecker()
    private static let languages = ["en_US", "en_GB", "fr_FR", "fr_CA"].filter(UITextChecker.availableLanguages.contains)
    private static var known: [String: Bool] = [:]

    static func isWord(_ word: String) -> Bool {
        if let cached = known[word] { return cached }
        let range = NSRange(location: 0, length: (word as NSString).length)
        let result = !languages.isEmpty && languages.contains {
            checker.rangeOfMisspelledWord(in: word, range: range, startingAt: 0, wrap: false, language: $0).location == NSNotFound
        }
        known[word] = result
        return result
    }
}

/// The PDF remains the source of every non-whitespace character.
enum PDFReadingSpacing {
    static func canonical(_ text: String) -> String {
        text.precomposedStringWithCompatibilityMapping
            .replacingOccurrences(of: "‐", with: "-")
            .replacingOccurrences(of: "‑", with: "-")
    }

    static func repair(_ source: String, recognized: String) -> String {
        let sourceKey = canonical(source.filter { !$0.isWhitespace })
        let recognizedKey = canonical(recognized.filter { !$0.isWhitespace })
        guard sourceKey == recognizedKey else { return aligned(source, recognized: recognized) }
        var boundaries = Set<Int>(), offset = 0
        for character in recognized {
            if character.isWhitespace { boundaries.insert(offset) }
            else { offset += canonical(String(character)).utf16.count }
        }
        var result = "", pendingSpace = false
        offset = 0
        for character in source {
            if character.isWhitespace { pendingSpace = true; continue }
            if !result.isEmpty && (pendingSpace || boundaries.contains(offset)) { result += " " }
            result.append(character)
            offset += canonical(String(character)).utf16.count
            pendingSpace = false
        }
        return result
    }

    /// When recognition misreads part of the line (a reference number, a dash), a space is still taken
    /// before a recognized word that starts with a letter and matches the PDF characters exactly, right
    /// after the last character of the previous word. Nothing else in the line changes.
    static func aligned(_ source: String, recognized: String) -> String {
        let characters = Array(source)
        var sourceKeys: [Character] = [], owner: [Int] = []
        for (index, character) in characters.enumerated() where !character.isWhitespace {
            for key in canonical(String(character)) { sourceKeys.append(key); owner.append(index) }
        }
        var keys: [Character] = [], words: [Range<Int>] = []
        for word in recognized.split(whereSeparator: \.isWhitespace) {
            let start = keys.count
            keys += Array(canonical(String(word)))
            if keys.count > start { words.append(start..<keys.count) }
        }
        guard !sourceKeys.isEmpty, words.count > 1 else { return source }
        var removed = Set<Int>(), inserted = Set<Int>()
        for change in keys.difference(from: sourceKeys) {
            switch change {
            case let .remove(offset, _, _): removed.insert(offset)
            case let .insert(offset, _, _): inserted.insert(offset)
            }
        }
        var match: [Int: Int] = [:]
        for (key, sourceKey) in zip(keys.indices.filter { !inserted.contains($0) }, sourceKeys.indices.filter { !removed.contains($0) }) {
            match[key] = sourceKey
        }
        // A recognized line from elsewhere on the page shares only scattered letters.
        guard match.count * 5 >= sourceKeys.count * 4, match.count * 5 >= keys.count * 4 else { return source }
        func exact(_ word: Range<Int>) -> Bool {
            guard let first = match[word.lowerBound] else { return false }
            return word.enumerated().allSatisfy { match[$0.element] == first + $0.offset }
        }
        var breaks = Set<Int>()
        for index in words.indices.dropFirst() {
            let previous = words[index - 1], word = words[index]
            guard keys[word.lowerBound].isLetter, exact(word),
                  let before = match[previous.upperBound - 1], let after = match[word.lowerBound],
                  after == before + 1, owner[after] != owner[before] else { continue }
            breaks.insert(owner[after])
        }
        guard !breaks.isEmpty else { return source }
        var result = "", pendingSpace = false
        for (index, character) in characters.enumerated() {
            if character.isWhitespace { pendingSpace = true; continue }
            if !result.isEmpty && (pendingSpace || breaks.contains(index)) { result += " " }
            result.append(character)
            pendingSpace = false
        }
        return result
    }
}

/// Each reader owns a separate PDFKit document. Parsing and optional spacing recovery run serially off the UI actor.
actor PDFReadingExtractor {
    private let bytes: Data
    private var document: PDFDocument?
    private var pages: [Int: PDFReadingPage] = [:]
    init(bytes: Data) { self.bytes = bytes }

    struct Line {
        var text: String
        let bounds: CGRect
        var anchors: [PDFReadingAnchor?] = []
    }

    func page(_ index: Int) throws -> PDFReadingPage {
        try Task.checkCancellation()
        if let cached = pages[index] { return cached }
        let result = try autoreleasepool {
            if document == nil { document = PDFDocument(data: bytes) }
            guard let page = document?.page(at: index), !document!.isLocked else { throw CocoaError(.fileReadCorruptFile) }
            let selections = page.selection(for: NSRange(location: 0, length: page.numberOfCharacters))?.selectionsByLine() ?? []
            let source = (page.string ?? "") as NSString
            var lines = selections.enumerated().compactMap { lineIndex, selection -> Line? in
                var text = "", anchors: [PDFReadingAnchor?] = []
                for index in 0..<selection.numberOfTextRanges(on: page) {
                    let range = selection.range(at: index, on: page)
                    guard range.location != NSNotFound, range.location >= 0, range.length > 0,
                          range.location <= source.length, range.length <= source.length - range.location else { continue }
                    if !text.isEmpty { text += " "; anchors.append(nil) }
                    text += source.substring(with: range)
                    anchors += (range.location..<NSMaxRange(range)).map {
                        // characterBounds uses glyph indices on some PDFs, while selections use
                        // string offsets including inserted line breaks. Stay in one index space.
                        guard let glyph = page.selection(for: NSRange(location: $0, length: 1)),
                              Self.glyph(glyph.string, matches: source, at: $0) else { return nil }
                        return PDFReadingAnchor(offset: $0, bounds: glyph.bounds(for: page), line: lineIndex)
                    }
                }
                // A mismatched text layer can still be read, but never annotated by guessing.
                if text.isEmpty { text = selection.string ?? ""; anchors = Array(repeating: nil, count: text.utf16.count) }
                let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { return nil }
                let range = (text as NSString).range(of: trimmed)
                return Self.filling(Line(text: trimmed, bounds: selection.bounds(for: page),
                                         anchors: Array(anchors[range.location..<NSMaxRange(range)])), line: lineIndex)
            }
            // Some publishers omit spaces from their text layer. Vision supplies only word boundaries,
            // on glued lines, where its words match the original PDF characters.
            if page.rotation == 0, lines.contains(where: { Self.looksGlued($0.text) }) {
                try Task.checkCancellation()
                repairSpacing(in: &lines, page: page)
            }
            try Task.checkCancellation()
            let bounds = page.bounds(for: .cropBox)
            let repeatedHeaders = neighboringHeaders(index)
            let marginLines = lines.filter { Self.isMargin($0, pageBounds: bounds, firstPage: index == 0, repeatedHeaders: repeatedHeaders) }
            let bodyLines = lines.filter { !Self.isMargin($0, pageBounds: bounds, firstPage: index == 0, repeatedHeaders: repeatedHeaders) }
            return PDFReadingPage(index: index, blocks: try visualBlocks(bodyLines, page: page, firstPage: index == 0),
                                  margins: Self.blocks(marginLines, pageBounds: bounds, firstPage: false))
        }
        pages[index] = result
        return result
    }

    /// A ligature (ﬁ, ﬂ, ﬀ) is one glyph for several characters: PDFKit returns the whole glyph for each
    /// of them, so they share its box. Any other difference keeps the character unlocated.
    static func glyph(_ glyph: String?, matches source: NSString, at offset: Int) -> Bool {
        guard let glyph, offset >= 0, offset < source.length else { return false }
        if glyph == source.substring(with: NSRange(location: offset, length: 1)) { return true }
        let key = PDFReadingSpacing.canonical(glyph.trimmingCharacters(in: .whitespacesAndNewlines))
        let length = (key as NSString).length
        guard length >= 1, length <= 4 else { return false }
        for start in max(0, offset - length + 1)...offset where start + length <= source.length {
            if PDFReadingSpacing.canonical(source.substring(with: NSRange(location: start, length: length))) == key { return true }
        }
        return false
    }

    private static func isWhitespace(_ unit: UInt16) -> Bool {
        UnicodeScalar(unit).map(CharacterSet.whitespacesAndNewlines.contains) ?? false
    }

    /// A symbol PDFKit cannot select alone sits between its located neighbours on the same PDF line
    /// (or the line's own edge): it takes that gap, never a guessed position elsewhere on the page.
    static func filling(_ line: Line, line index: Int) -> Line {
        let units = Array(line.text.utf16)
        guard line.anchors.count == units.count, line.anchors.contains(where: { $0 != nil }) else { return line }
        let visible = units.indices.filter { !isWhitespace(units[$0]) }
        var anchors = line.anchors, cursor = 0
        while cursor < visible.count {
            guard anchors[visible[cursor]] == nil else { cursor += 1; continue }
            var end = cursor
            while end < visible.count && anchors[visible[end]] == nil { end += 1 }
            let before = cursor > 0 ? anchors[visible[cursor - 1]] : nil
            let after = end < visible.count ? anchors[visible[end]] : nil
            let left = before?.bounds.maxX ?? line.bounds.minX, right = after?.bounds.minX ?? line.bounds.maxX
            if end - cursor <= 6, let neighbour = before ?? after, right >= left - 1 {
                let vertical = [before?.bounds, after?.bounds].compactMap { $0 }.reduce(CGRect.null) { $0.union($1) }
                let box = CGRect(x: min(left, right), y: vertical.minY, width: max(1, abs(right - left)), height: vertical.height)
                for position in visible[cursor..<end] {
                    anchors[position] = PDFReadingAnchor(offset: neighbour.offset, bounds: box, line: index)
                }
            }
            cursor = end
        }
        var result = line; result.anchors = anchors
        return result
    }

    /// A line reads as glued words when it has a very long run of letters ("fallingtothewest"), a comma
    /// touching a letter ("zone,falling") or a sentence running into the next ("yearsThe"). Addresses,
    /// compounds and paths are split first: they are long without being glued.
    static func looksGlued(_ text: String) -> Bool {
        let words = text.split(whereSeparator: \.isWhitespace).filter { !$0.contains("@") && !$0.contains("://") && !$0.hasPrefix("www.") }
        let prose = words.joined(separator: " ")
        return prose.split(whereSeparator: { $0.isWhitespace || "-‐–—/".contains($0) }).contains { $0.count >= 16 } ||
            prose.range(of: #"\p{L}[,;]\p{L}|\p{Ll}{2}[.)]?\p{Lu}\p{Ll}"#, options: .regularExpression) != nil
    }

    private func repairSpacing(in lines: inout [Line], page: PDFPage) {
        guard let image = Self.rasterForSpacing(of: page) else { return }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        request.recognitionLanguages = ["en-US", "fr-FR"]
        guard (try? VNImageRequestHandler(cgImage: image).perform([request])) != nil else { return }
        let crop = page.bounds(for: .cropBox)
        let candidates = (request.results ?? []).compactMap { observation -> (CGRect, String)? in
            guard let text = observation.topCandidates(1).first?.string else { return nil }
            return (observation.boundingBox, text)
        }
        for index in lines.indices where Self.looksGlued(lines[index].text) {
            let box = lines[index].bounds
            let normalized = CGRect(x: (box.minX - crop.minX) / crop.width, y: (box.minY - crop.minY) / crop.height,
                                    width: box.width / crop.width, height: box.height / crop.height)
            if let candidate = candidates.filter({
                abs($0.0.midY - normalized.midY) < max($0.0.height, normalized.height) * 0.7 &&
                $0.0.intersection(normalized).width > min($0.0.width, normalized.width) * 0.6
            }).max(by: { $0.0.intersection(normalized).width < $1.0.intersection(normalized).width }) {
                let repaired = PDFReadingSpacing.repair(lines[index].text, recognized: candidate.1)
                lines[index].anchors = Self.remapWhitespace(source: lines[index].text, anchors: lines[index].anchors, display: repaired)
                lines[index].text = repaired
            }
        }
    }

    static func remapWhitespace(source: String, anchors: [PDFReadingAnchor?], display: String) -> [PDFReadingAnchor?] {
        let original = Array(source.utf16), output = Array(display.utf16)
        guard original.count == anchors.count else { return Array(repeating: nil, count: output.count) }
        func whitespace(_ unit: UInt16) -> Bool { UnicodeScalar(unit).map(CharacterSet.whitespacesAndNewlines.contains) ?? false }
        var cursor = 0, result: [PDFReadingAnchor?] = []
        for unit in output {
            if whitespace(unit) { result.append(nil); continue }
            while cursor < original.count && whitespace(original[cursor]) { cursor += 1 }
            guard cursor < original.count, original[cursor] == unit else { return Array(repeating: nil, count: output.count) }
            result.append(anchors[cursor]); cursor += 1
        }
        return result
    }

    static func rasterForSpacing(of page: PDFPage) -> CGImage? {
        guard let reference = page.pageRef else { return nil }
        let box = page.bounds(for: .cropBox)
        guard box.width > 0, box.height > 0 else { return nil }
        let scale = min(1800 / box.width, 2400 / box.height)
        let width = max(1, Int(box.width * scale)), height = max(1, Int(box.height * scale))
        guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
        let target = CGRect(x: 0, y: 0, width: width, height: height)
        context.setFillColor(CGColor(gray: 1, alpha: 1)); context.fill(target)
        context.scaleBy(x: CGFloat(width) / box.width, y: CGFloat(height) / box.height)
        context.translateBy(x: -box.minX, y: -box.minY)
        context.drawPDFPage(reference)
        return context.makeImage()
    }

    static func blocks(_ source: [Line], pageBounds: CGRect, firstPage: Bool) -> [PDFReadingBlock] {
        guard !source.isEmpty else { return [] }
        var lines = source
        // Put the article before a narrow publication sidebar on first pages such as Wiley's.
        let wide = lines.filter { $0.bounds.width > pageBounds.width * 0.55 }
        if firstPage, wide.count >= 8, let start = wide.map(\.bounds.minX).min(), start > pageBounds.minX + pageBounds.width * 0.2 {
            lines = lines.filter { $0.bounds.minX >= start - 4 } + lines.filter { $0.bounds.minX < start - 4 }
        }
        let heights = lines.map(\.bounds.height).filter { $0 > 0 && $0.isFinite }.sorted()
        let bodyHeight = heights.isEmpty ? 10 : heights[heights.count / 2]
        var result: [PDFReadingBlock] = [], text = "", heading = false
        var anchors: [PDFReadingAnchor?] = [], joins: [Int] = []
        var previous: Line?
        func flush() {
            guard !text.isEmpty else { return }
            result.append(PDFReadingBlock(id: result.count, text: text, heading: heading, anchors: anchors, joins: joins))
            text = ""; anchors = []; joins = []
        }
        for line in lines {
            let isHeading = line.bounds.height > bodyHeight * 1.35 && line.text.count < 180
            if let previous {
                let gap = previous.bounds.minY - line.bounds.maxY
                if abs(previous.bounds.minX - line.bounds.minX) > max(24, bodyHeight * 3) ||
                    gap > bodyHeight * 0.85 || gap < -bodyHeight || isHeading != heading {
                    flush()
                }
            }
            if !text.isEmpty { joins.append(text.utf16.count); text += " "; anchors.append(nil) }
            text += line.text
            anchors += line.anchors.count == line.text.utf16.count ? line.anchors : Array(repeating: nil, count: line.text.utf16.count)
            heading = isHeading; previous = line
        }
        flush()
        return result
    }

    private static func headerKey(_ text: String) -> String {
        PDFReadingSpacing.canonical(text.filter { !$0.isWhitespace }).replacingOccurrences(of: #"\d+"#, with: "#", options: .regularExpression)
    }

    private func neighboringHeaders(_ index: Int) -> Set<String> {
        var keys = Set<String>()
        for neighbor in [index - 1, index + 1] where neighbor >= 0 {
            guard let page = document?.page(at: neighbor) else { continue }
            let bounds = page.bounds(for: .cropBox)
            let band = CGRect(x: bounds.minX, y: bounds.maxY - bounds.height * 0.085, width: bounds.width, height: bounds.height * 0.085)
            for line in page.selection(for: band)?.selectionsByLine() ?? [] {
                if let text = line.string { keys.insert(Self.headerKey(text)) }
            }
        }
        return keys
    }

    private static func isMargin(_ line: Line, pageBounds: CGRect, firstPage: Bool, repeatedHeaders: Set<String>) -> Bool {
        line.bounds.maxY < pageBounds.minY + pageBounds.height * 0.045 ||
        (!firstPage && line.bounds.minY > pageBounds.maxY - pageBounds.height * 0.085 && repeatedHeaders.contains(headerKey(line.text)))
    }
}
