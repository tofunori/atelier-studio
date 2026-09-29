import Foundation
import PDFKit
import Vision
import UIKit

struct PDFReadingAnchor: Sendable {
    let offset: Int
    let bounds: CGRect
    let line: Int
    /// A reference number or footnote mark set smaller and raised on its PDF line.
    var superscript: Bool = false
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

    var superscripts: [NSRange] {
        var result: [NSRange] = []
        for (index, anchor) in anchors.enumerated() where anchor?.superscript == true {
            if let last = result.indices.last, NSMaxRange(result[last]) == index { result[last].length += 1 }
            else { result.append(NSRange(location: index, length: 1)) }
        }
        return result
    }

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
            if hyphen == 0xAD || (lowercase && isWord(left + right)) {
                if let mark = located[join - 1], let previous = located[join - 2], previous.line == mark.line {
                    located[join - 2] = PDFReadingAnchor(offset: previous.offset, bounds: previous.bounds.union(mark.bounds),
                                                         line: previous.line, superscript: previous.superscript)
                }
                units.removeSubrange((join - 1)...join); located.removeSubrange((join - 1)...join)
            } else {
                units.remove(at: join); located.remove(at: join)
            }
        }
        return PDFReadingBlock(id: id, text: String(decoding: units, as: UTF16.self), heading: heading, anchors: located, visual: visual)
    }

    private static let conjunctions: Set<String> = ["and", "or", "nor", "to", "et", "ou"]

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
        guard sourceKey == recognizedKey else { return source }
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
                return Self.located(Line(text: trimmed, bounds: selection.bounds(for: page),
                                         anchors: Array(anchors[range.location..<NSMaxRange(range)])), line: lineIndex)
            }
            // Some publishers omit spaces from their text layer. Vision supplies only word boundaries,
            // and only when the complete line matches the original PDF characters.
            if page.rotation == 0, lines.contains(where: { $0.text.range(of: #"\p{L}{26,}"#, options: .regularExpression) != nil }) {
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

    static func located(_ line: Line, line index: Int) -> Line {
        spaced(raisingSuperscripts(filling(line, line: index)))
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

    /// Reference numbers are set smaller and above the line's baseline.
    static func raisingSuperscripts(_ line: Line) -> Line {
        let units = Array(line.text.utf16)
        guard line.anchors.count == units.count else { return line }
        let located = units.indices.compactMap { isWhitespace(units[$0]) ? nil : line.anchors[$0] }
        guard located.count >= 8 else { return line }
        let heights = located.map(\.bounds.height).sorted(), bottoms = located.map(\.bounds.minY).sorted()
        let height = heights[heights.count / 2], bottom = bottoms[bottoms.count / 2]
        guard height > 0 else { return line }
        let marks = CharacterSet(charactersIn: "0123456789,–-−*†‡§")
        var anchors = line.anchors, raised = 0
        for index in units.indices {
            guard let anchor = anchors[index], let scalar = UnicodeScalar(units[index]), marks.contains(scalar),
                  anchor.bounds.height < height * 0.85, anchor.bounds.minY > bottom + height * 0.2 else { continue }
            anchors[index] = PDFReadingAnchor(offset: anchor.offset, bounds: anchor.bounds, line: anchor.line, superscript: true)
            raised += 1
        }
        // A line made mostly of small raised figures is a table or an axis, not prose with references.
        guard raised * 3 < located.count else { return line }
        var result = line; result.anchors = anchors
        return result
    }

    /// Some publishers justify a line by moving its words without any space character, and PDFKit
    /// glues them ("fallingtothewest"). The glyph boxes still show the gap between two words.
    static func spaced(_ line: Line) -> Line {
        let units = Array(line.text.utf16)
        guard line.anchors.count == units.count, looksGlued(line.text) else { return line }
        let heights = units.indices.compactMap { isWhitespace(units[$0]) ? nil : line.anchors[$0] }
            .filter { !$0.superscript }.map(\.bounds.height).sorted()
        guard !heights.isEmpty else { return line }
        let threshold = heights[heights.count / 2] * wordGap
        var output: [UInt16] = [], anchors: [PDFReadingAnchor?] = []
        for index in units.indices {
            if index > 0, !isWhitespace(units[index]), !isWhitespace(units[index - 1]),
               let previous = line.anchors[index - 1], let next = line.anchors[index],
               previous.bounds != next.bounds, next.bounds.minX - previous.bounds.maxX > threshold {
                output.append(0x20); anchors.append(nil)
            }
            output.append(units[index]); anchors.append(line.anchors[index])
        }
        guard output.count != units.count else { return line }
        return Line(text: String(decoding: output, as: UTF16.self), bounds: line.bounds, anchors: anchors)
    }

    /// Only lines that read as glued words are re-spaced from geometry: a very long token
    /// ("TheCoastalzone,falling"), a comma touching a letter or a sentence running into the next ("yearsThe").
    static func looksGlued(_ text: String) -> Bool {
        text.split(whereSeparator: \.isWhitespace).contains { $0.count >= 16 } ||
        text.range(of: #"\p{L}[,;]\p{L}|\p{Ll}{2}[.)]?\p{Lu}\p{Ll}"#, options: .regularExpression) != nil
    }

    /// Word gap as a fraction of the glyph box height. Justified word spaces rarely shrink below
    /// 0.15 em (about 0.13 of the box); letters of one word touch.
    static let wordGap: CGFloat = 0.1

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
        for index in lines.indices {
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
