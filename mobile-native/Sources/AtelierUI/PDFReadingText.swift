import Foundation
import PDFKit
import Vision
import UIKit

struct PDFReadingAnchor: Sendable {
    let offset: Int
    let bounds: CGRect
    let line: Int
    /// The PDF page of this character: a paragraph continued on the next page keeps both pages.
    var page: Int = 0
}

struct PDFReadingVisual: Sendable {
    let bounds: CGRect
    let image: Data
    let label: String
    /// The figure number read from its caption ("Figure 9." → "9"), so a mention in the text can open it.
    var figure: String? = nil
}

struct PDFReadingBlock: Identifiable, Sendable {
    let id: Int
    let text: String
    let heading: Bool
    var anchors: [PDFReadingAnchor?] = []
    var visual: PDFReadingVisual? = nil
    /// UTF-16 offsets of the spaces that join two PDF lines, until hyphenation is resolved.
    var joins: [Int] = []
    /// Per UTF-16 unit: 1 for a superscript, -1 for a subscript, 0 otherwise. Empty when the block has none.
    var levels: [Int8] = []

    /// Rejoins words the PDF split across two lines ("sha-" / "dow" → "shadow"). The hyphen stays
    /// when the joined form is not a word ("stand-replacing"), or before "and"/"or" ("pre- and post-fire").
    /// A removed hyphen's box is kept in the preceding letter's anchor, so annotations still cover it.
    func joiningHyphenatedLines(isWord: (String) -> Bool) -> PDFReadingBlock {
        guard !joins.isEmpty, anchors.count == text.utf16.count else { var copy = self; copy.joins = []; return copy }
        var units = Array(text.utf16), located = anchors
        var scripts = levels.count == units.count ? levels : []
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
                if !scripts.isEmpty { scripts.removeSubrange((join - 1)...join) }
            } else {
                units.remove(at: join); located.remove(at: join)
                if !scripts.isEmpty { scripts.remove(at: join) }
            }
        }
        return PDFReadingBlock(id: id, text: String(decoding: units, as: UTF16.self), heading: heading, anchors: located, visual: visual,
                               levels: scripts)
    }

    private static let conjunctions: Set<String> = ["and", "or", "nor", "to", "et", "ou"]
    private static let prefixes: Set<String> = ["non", "self"]

    /// Offsets come from extraction, not a search for a potentially repeated quote.
    func regions(for range: NSRange) -> [CGRect]? { pageRegions(for: range)?.map(\.bounds) }

    /// One rectangle per PDF line, with its page: a passage may cross a page break.
    func pageRegions(for range: NSRange) -> [(page: Int, bounds: CGRect)]? {
        guard range.location != NSNotFound, range.location >= 0, range.length > 0,
              range.location <= anchors.count, range.length <= anchors.count - range.location,
              anchors.count == text.utf16.count else { return nil }
        let units = Array(text.utf16)
        var result: [(page: Int, bounds: CGRect)] = [], previous: (line: Int, page: Int)?
        for index in range.location..<NSMaxRange(range) {
            if let scalar = UnicodeScalar(units[index]), CharacterSet.whitespacesAndNewlines.contains(scalar) { continue }
            guard let anchor = anchors[index] else {
                return nil
            }
            guard !anchor.bounds.isEmpty, !anchor.bounds.isInfinite, !anchor.bounds.isNull else { return nil }
            if previous?.line == anchor.line, previous?.page == anchor.page, let last = result.indices.last {
                result[last].bounds = result[last].bounds.union(anchor.bounds)
            } else { result.append((anchor.page, anchor.bounds)) }
            previous = (anchor.line, anchor.page)
        }
        return result.isEmpty ? nil : result
    }

    /// The pages this block's characters come from, in reading order.
    var pages: [Int] {
        var result: [Int] = []
        for case let anchor? in anchors where result.last != anchor.page { result.append(anchor.page) }
        return result
    }

    /// Offsets where the block moves on to another PDF page, with that page's index.
    var pageBreaks: [(offset: Int, page: Int)] {
        var result: [(offset: Int, page: Int)] = [], current: Int?
        for (index, anchor) in anchors.enumerated() {
            guard let anchor else { continue }
            if let current, current != anchor.page { result.append((index, anchor.page)) }
            current = anchor.page
        }
        return result
    }

    /// Characters inside the regions of one page. The spaces between two marked words belong to the mark,
    /// so a highlight reads as one stroke rather than a word-by-word patchwork.
    func ranges(inside regions: [CGRect], page: Int? = nil) -> [NSRange] {
        var result: [NSRange] = []
        let units = Array(text.utf16)
        for (index, anchor) in anchors.enumerated() {
            guard let anchor, page == nil || anchor.page == page, regions.contains(where: {
                $0.contains(CGPoint(x: anchor.bounds.midX, y: anchor.bounds.midY))
            }) else { continue }
            if let last = result.indices.last, NSMaxRange(result[last]) == index { result[last].length += 1 }
            else if let last = result.indices.last, units.count == anchors.count,
                    units[NSMaxRange(result[last])..<index].allSatisfy({ UnicodeScalar($0).map(CharacterSet.whitespacesAndNewlines.contains) ?? false }) {
                result[last].length = index + 1 - result[last].location
            } else { result.append(NSRange(location: index, length: 1)) }
        }
        return result
    }

    /// A paragraph cut by a column or page break: no closing punctuation, then a lowercase word or a split word.
    func continues(into next: PDFReadingBlock) -> Bool {
        guard visual == nil, next.visual == nil, !heading, !next.heading,
              let last = text.trimmingCharacters(in: .whitespaces).last, let first = next.text.first else { return false }
        if last == "-" || last == "\u{2010}" { return first.isLetter }
        return !PDFReadingExtractor.endsSentence(text) && first.isLowercase
    }

    /// Joins this paragraph with its continuation, keeping both texts, anchors and scripts.
    func appending(_ next: PDFReadingBlock) -> PDFReadingBlock {
        let length = text.utf16.count
        func scripts(_ block: PDFReadingBlock) -> [Int8] {
            block.levels.count == block.text.utf16.count ? block.levels : Array(repeating: 0, count: block.text.utf16.count)
        }
        func located(_ block: PDFReadingBlock) -> [PDFReadingAnchor?] {
            block.anchors.count == block.text.utf16.count ? block.anchors : Array(repeating: nil, count: block.text.utf16.count)
        }
        let levels = levels.isEmpty && next.levels.isEmpty ? [] : scripts(self) + [0] + scripts(next)
        return PDFReadingBlock(id: id, text: text + " " + next.text, heading: false, anchors: located(self) + [nil] + located(next),
                               joins: joins + [length] + next.joins.map { $0 + length + 1 }, levels: levels)
    }
}

struct PDFReadingPage: Sendable {
    let index: Int
    let blocks: [PDFReadingBlock]
    let margins: [PDFReadingBlock]
    /// The first paragraph began on the previous page and is shown there, whole.
    var continued = false

    func joiningHyphenatedLines(isWord: (String) -> Bool) -> PDFReadingPage {
        PDFReadingPage(index: index, blocks: blocks.map { $0.joiningHyphenatedLines(isWord: isWord) },
                       margins: margins.map { $0.joiningHyphenatedLines(isWord: isWord) }, continued: continued)
    }

    /// A paragraph cut by the page break moves whole onto the page where it begins. Only a page with
    /// another paragraph after it gives its first one away, so a page never becomes empty.
    static func joining(previous: PDFReadingPage?, current: PDFReadingPage, next: PDFReadingPage?) -> PDFReadingPage {
        var blocks = current.blocks, continued = false
        if let previous, let last = previous.blocks.last, current.blocks.count > 1, last.continues(into: current.blocks[0]) {
            blocks.removeFirst(); continued = true
        }
        if let next, next.blocks.count > 1, let last = blocks.last, last.continues(into: next.blocks[0]) {
            blocks[blocks.count - 1] = last.appending(next.blocks[0])
        }
        return PDFReadingPage(index: current.index, blocks: blocks, margins: current.margins, continued: continued)
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
        /// Superscript (1) or subscript (-1) per UTF-16 unit, empty when the line has none.
        var levels: [Int8] = []
        /// The most common font size of the line, 0 when PDFKit gives none.
        var size: CGFloat = 0
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
                var text = "", anchors: [PDFReadingAnchor?] = [], styles: [Style?] = []
                for index in 0..<selection.numberOfTextRanges(on: page) {
                    let range = selection.range(at: index, on: page)
                    guard range.location != NSNotFound, range.location >= 0, range.length > 0,
                          range.location <= source.length, range.length <= source.length - range.location else { continue }
                    if !text.isEmpty { text += " "; anchors.append(nil); styles.append(nil) }
                    let piece = source.substring(with: range)
                    text += piece
                    styles += Self.styles(page.selection(for: range)?.attributedString, matching: piece)
                    anchors += (range.location..<NSMaxRange(range)).map {
                        // characterBounds uses glyph indices on some PDFs, while selections use
                        // string offsets including inserted line breaks. Stay in one index space.
                        guard let glyph = page.selection(for: NSRange(location: $0, length: 1)),
                              Self.glyph(glyph.string, matches: source, at: $0) else { return nil }
                        return PDFReadingAnchor(offset: $0, bounds: glyph.bounds(for: page), line: lineIndex, page: index)
                    }
                }
                // A mismatched text layer can still be read, but never annotated by guessing.
                if text.isEmpty {
                    text = selection.string ?? ""; anchors = Array(repeating: nil, count: text.utf16.count)
                    styles = Array(repeating: nil, count: text.utf16.count)
                }
                let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { return nil }
                let range = (text as NSString).range(of: trimmed)
                let kept = Array(styles[range.location..<NSMaxRange(range)])
                var line = Self.filling(Line(text: trimmed, bounds: selection.bounds(for: page),
                                             anchors: Array(anchors[range.location..<NSMaxRange(range)])), line: lineIndex)
                (line.levels, line.size) = Self.levels(kept, text: trimmed)
                return line
            }
            // Some publishers omit spaces from their text layer. Vision supplies only word boundaries,
            // on glued lines, where its words match the original PDF characters.
            if page.rotation == 0, lines.contains(where: { Self.looksGlued($0.text) }) {
                try Task.checkCancellation()
                repairSpacing(in: &lines, page: page)
            }
            lines = Self.rows(lines)
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

    /// Font size and baseline shift PDFKit reports for one character (CTBaselineOffset, in points).
    struct Style: Equatable { let size: CGFloat; let shift: CGFloat }

    /// The attributed string of a selection carries each glyph's size and baseline shift. It is used only
    /// when its characters are the PDF's own, so a style never lands on the wrong letter.
    static func styles(_ attributed: NSAttributedString?, matching piece: String) -> [Style?] {
        let length = (piece as NSString).length
        guard let attributed, attributed.length > 0, attributed.length <= length, piece.hasPrefix(attributed.string) else {
            return Array(repeating: nil, count: length)
        }
        var result = [Style?](repeating: nil, count: length)
        let shiftKey = NSAttributedString.Key("CTBaselineOffset")
        attributed.enumerateAttributes(in: NSRange(location: 0, length: attributed.length)) { values, range, _ in
            guard let font = values[.font] as? UIFont else { return }
            let shift = (values[shiftKey] as? NSNumber).map { CGFloat($0.doubleValue) } ?? 0
            for index in range.location..<NSMaxRange(range) { result[index] = Style(size: font.pointSize, shift: shift) }
        }
        return result
    }

    /// A glyph smaller than the line's text and shifted off its baseline is a superscript (reference call,
    /// exponent) or a subscript. Same-size shifted glyphs, such as an accent, stay ordinary text.
    static func levels(_ styles: [Style?], text: String) -> (levels: [Int8], size: CGFloat) {
        let units = Array(text.utf16)
        guard styles.count == units.count else { return ([], 0) }
        var counts: [CGFloat: Int] = [:]
        for (unit, style) in zip(units, styles) where !isWhitespace(unit) { if let style { counts[style.size, default: 0] += 1 } }
        guard let body = counts.max(by: { $0.value < $1.value || ($0.value == $1.value && $0.key < $1.key) })?.key else { return ([], 0) }
        let levels: [Int8] = zip(units, styles).map { unit, style in
            guard let style, !isWhitespace(unit), style.size < body * 0.9, abs(style.shift) > 0.5 else { return 0 }
            return style.shift > 0 ? 1 : -1
        }
        return (levels.contains { $0 != 0 } ? levels : [], body)
    }

    private static let accents: [UInt16: UInt16] = [0x5E: 0x302, 0x2C6: 0x302, 0x7E: 0x303, 0x2DC: 0x303, 0xAF: 0x304, 0x2C9: 0x304,
                                                    0xA8: 0x308, 0xB4: 0x301, 0x2CA: 0x301, 0x60: 0x300, 0x2CB: 0x300, 0x2D9: 0x307, 0x2C7: 0x30C]

    /// PDFKit splits a printed line wherever a glyph leaves the baseline: the hat of Ŝ, a raised 0, a symbol in
    /// another font. Pieces that share most of their height and touch horizontally become one line again,
    /// in x order. Only a few neighbouring pieces are considered, so the other column is never pulled in.
    static func rows(_ lines: [Line]) -> [Line] {
        guard lines.count > 1 else { return lines }
        let heights = lines.map(\.bounds.height).filter { $0 > 0 && $0.isFinite }.sorted()
        let body = heights.isEmpty ? 10 : heights[heights.count / 2]
        func main(_ group: [Line]) -> Line { group.max { $0.text.utf16.count < $1.text.utf16.count }! }
        func sameRow(_ group: [Line], _ line: Line) -> Bool {
            let band = main(group).bounds
            let overlap = min(band.maxY, line.bounds.maxY) - max(band.minY, line.bounds.minY)
            guard overlap >= min(band.height, line.bounds.height) * 0.5 else { return false }
            let span = group.map(\.bounds).reduce(CGRect.null) { $0.union($1) }
            let gap = max(line.bounds.minX - span.maxX, span.minX - line.bounds.maxX)
            return gap < body * 0.75
        }
        var groups: [[Line]] = []
        for line in lines {
            if let index = groups.indices.suffix(3).last(where: { sameRow(groups[$0], line) }) { groups[index].append(line) }
            else { groups.append([line]) }
        }
        return groups.enumerated().map { row, group in group.count == 1 ? group[0] : assemble(group, row: row) }
    }

    private struct Unit { let code: UInt16; var anchor: PDFReadingAnchor?; var level: Int8; var accent = false }

    static func assemble(_ pieces: [Line], row: Int) -> Line {
        let band = pieces.max { $0.text.utf16.count < $1.text.utf16.count }!
        func units(_ line: Line) -> [Unit] {
            let codes = Array(line.text.utf16)
            let located = line.anchors.count == codes.count ? line.anchors : Array(repeating: nil, count: codes.count)
            let levels = line.levels.count == codes.count ? line.levels : Array(repeating: 0, count: codes.count)
            // A whole piece set smaller than the line and raised (or lowered) is one script.
            var shift: Int8 = 0
            let smaller = line.size > 0 && band.size > 0 ? line.size < band.size * 0.9 : line.bounds.height < band.bounds.height * 0.85
            if smaller {
                let offset = line.bounds.midY - band.bounds.midY
                if abs(offset) > band.bounds.height * 0.15 { shift = offset > 0 ? 1 : -1 }
            }
            let lone = line.text.utf16.count == 1
            return codes.indices.map { index in
                // An accent printed apart from its letter: alone in its piece, or hanging at its end ("the^").
                let accent = accents[codes[index]] != nil && located[index] != nil && (lone || index == codes.count - 1)
                return Unit(code: codes[index], anchor: located[index], level: shift != 0 ? shift : levels[index], accent: accent)
            }
        }
        // Narrow pieces first when two start at the same x: r, then its stacked 0, then the subscript e.
        let ordered = pieces.sorted {
            abs($0.bounds.minX - $1.bounds.minX) < 1.5 ? $0.bounds.width < $1.bounds.width : $0.bounds.minX < $1.bounds.minX
        }
        var result: [Unit] = []
        for piece in ordered {
            let next = units(piece)
            if let last = result.last(where: { !$0.accent }), let first = next.first(where: { !$0.accent }),
               !isWhitespace(last.code), !isWhitespace(first.code) {
                let gap = (first.anchor?.bounds.minX ?? piece.bounds.minX) - (last.anchor?.bounds.maxX ?? .infinity)
                if gap > max(1, band.bounds.height * 0.1) { result.append(Unit(code: 0x20, anchor: nil, level: 0)) }
            }
            result += next
        }
        // Each accent becomes a combining mark after the letter below it (S + ^ = Ŝ) and keeps its own box.
        // An accent with no letter under it stays where the PDF put it.
        for index in result.indices.reversed() where result[index].accent {
            let mark = result[index]
            guard let box = mark.anchor?.bounds, let combining = accents[mark.code],
                  let letter = result.indices.first(where: { other in
                      guard other != index, let scalar = UnicodeScalar(result[other].code), CharacterSet.letters.contains(scalar),
                            let bounds = result[other].anchor?.bounds else { return false }
                      return box.midX >= bounds.minX - 0.5 && box.midX <= bounds.maxX + 0.5
                  }) else { continue }
            result.remove(at: index)
            var position = (letter > index ? letter - 1 : letter) + 1
            while position < result.count, let scalar = UnicodeScalar(result[position].code),
                  scalar.properties.generalCategory == .nonspacingMark { position += 1 }
            result.insert(Unit(code: combining, anchor: mark.anchor, level: result[position - 1].level), at: position)
        }
        // A space left at either end by a removed accent goes too.
        while let first = result.first, isWhitespace(first.code) { result.removeFirst() }
        while let last = result.last, isWhitespace(last.code) { result.removeLast() }
        // The main piece's PDF line number stays unique on the page, unlike the row's own position.
        let line = band.anchors.lazy.compactMap { $0?.line }.first ?? row
        let anchors = result.map { unit in
            unit.anchor.map { PDFReadingAnchor(offset: $0.offset, bounds: $0.bounds, line: line, page: $0.page) }
        }
        let levels = result.map(\.level)
        let span = pieces.map(\.bounds).reduce(CGRect.null) { $0.union($1) }
        return Line(text: String(decoding: result.map(\.code), as: UTF16.self),
                    bounds: CGRect(x: span.minX, y: band.bounds.minY, width: span.width, height: band.bounds.height),
                    anchors: anchors, levels: levels.contains { $0 != 0 } ? levels : [], size: band.size)
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
                    anchors[position] = PDFReadingAnchor(offset: neighbour.offset, bounds: box, line: index, page: neighbour.page)
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
        var anchors: [PDFReadingAnchor?] = [], joins: [Int] = [], levels: [Int8] = []
        var previous: Line?
        func flush() {
            guard !text.isEmpty else { return }
            let scripts = levels.contains { $0 != 0 } ? levels : []
            result.append(PDFReadingBlock(id: result.count, text: text, heading: heading, anchors: anchors, joins: joins, levels: scripts))
            text = ""; anchors = []; joins = []; levels = []
        }
        for line in lines {
            let isHeading = line.bounds.height > bodyHeight * 1.35 && line.text.count < 180
            if let previous {
                let gap = previous.bounds.minY - line.bounds.maxY
                let column = abs(previous.bounds.minX - line.bounds.minX) > max(24, bodyHeight * 3) || gap < -bodyHeight
                let sentence = Self.endsSentence(previous.text)
                // A sentence cut at the foot of a column goes on at the top of the next one.
                let continued = !sentence && (line.text.first?.isLowercase ?? false)
                // Paragraphs set without space between them still open with an indent.
                let indented = sentence && line.bounds.minX - previous.bounds.minX > max(3, bodyHeight * 0.4)
                if (column && !continued) || gap > bodyHeight * 0.85 || isHeading != heading || indented {
                    flush()
                }
            }
            if !text.isEmpty { joins.append(text.utf16.count); text += " "; anchors.append(nil); levels.append(0) }
            text += line.text
            anchors += line.anchors.count == line.text.utf16.count ? line.anchors : Array(repeating: nil, count: line.text.utf16.count)
            levels += line.levels.count == line.text.utf16.count ? line.levels : Array(repeating: 0, count: line.text.utf16.count)
            heading = isHeading; previous = line
        }
        flush()
        return result
    }

    static func endsSentence(_ text: String) -> Bool {
        var trimmed = text.trimmingCharacters(in: .whitespaces)
        while let last = trimmed.last, "\"'”’)]".contains(last) { trimmed.removeLast() }
        guard let last = trimmed.last else { return true }
        return ".?!:".contains(last)
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
