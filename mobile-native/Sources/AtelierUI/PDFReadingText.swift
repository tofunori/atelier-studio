import Foundation
import PDFKit
import Vision

struct PDFReadingBlock: Identifiable, Sendable {
    let id: Int
    let text: String
    let heading: Bool
}

struct PDFReadingPage: Sendable {
    let index: Int
    let blocks: [PDFReadingBlock]
    let margins: [PDFReadingBlock]
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
    }

    func page(_ index: Int) throws -> PDFReadingPage {
        try Task.checkCancellation()
        if let cached = pages[index] { return cached }
        let result = try autoreleasepool {
            if document == nil { document = PDFDocument(data: bytes) }
            guard let page = document?.page(at: index), !document!.isLocked else { throw CocoaError(.fileReadCorruptFile) }
            let selections = page.selection(for: NSRange(location: 0, length: page.numberOfCharacters))?.selectionsByLine() ?? []
            var lines = selections.compactMap { selection -> Line? in
                guard let text = selection.string?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
                return Line(text: text, bounds: selection.bounds(for: page))
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
            return PDFReadingPage(index: index, blocks: Self.blocks(bodyLines, pageBounds: bounds, firstPage: index == 0),
                                  margins: Self.blocks(marginLines, pageBounds: bounds, firstPage: false))
        }
        pages[index] = result
        return result
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
        for index in lines.indices {
            let box = lines[index].bounds
            let normalized = CGRect(x: (box.minX - crop.minX) / crop.width, y: (box.minY - crop.minY) / crop.height,
                                    width: box.width / crop.width, height: box.height / crop.height)
            if let candidate = candidates.filter({
                abs($0.0.midY - normalized.midY) < max($0.0.height, normalized.height) * 0.7 &&
                $0.0.intersection(normalized).width > min($0.0.width, normalized.width) * 0.6
            }).max(by: { $0.0.intersection(normalized).width < $1.0.intersection(normalized).width }) {
                lines[index].text = PDFReadingSpacing.repair(lines[index].text, recognized: candidate.1)
            }
        }
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
        var previous: Line?
        func flush() {
            guard !text.isEmpty else { return }
            result.append(PDFReadingBlock(id: result.count, text: text, heading: heading)); text = ""
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
            if !text.isEmpty { text += " " }
            text += line.text
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
