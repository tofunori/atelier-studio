import Foundation
import PDFKit
import ImageIO
import UniformTypeIdentifiers

extension PDFReadingExtractor {
    struct VisualRegion {
        let bounds: CGRect
        let label: String
    }

    static func canReplaceLine(_ bounds: CGRect, withImage imageBounds: CGRect) -> Bool {
        imageBounds.contains(bounds)
    }

    /// Conservative layout preservation: no numeric token or equation is deleted.
    /// Captions stay selectable; labels enclosed by a figure become part of its image.
    static func visualRegions(_ lines: [Line], pageBounds: CGRect) -> [VisualRegion] {
        var regions: [VisualRegion] = []
        let caption = #"^(?:Figure|Fig\.)\s*\d+\s*[.:]"#
        for line in lines where line.text.range(of: caption, options: [.regularExpression, .caseInsensitive]) != nil {
            // A caption's first line can be just "Figure 1." and cannot define image width.
            // Preserve the full horizontal band rather than clipping a plot or its axes.
            let left = pageBounds.minX
            let right = pageBounds.maxX
            let above = lines.filter { $0.bounds.minY > line.bounds.maxY + 2 && $0.bounds.midX >= left && $0.bounds.midX <= right }
            let prose = above.filter { $0.text.count > 55 && $0.text.split(whereSeparator: \.isWhitespace).count > 7 }
            let labelTop = (above.map(\.bounds.maxY).max() ?? 0) + 6
            let top = prose.map(\.bounds.minY).min().map { $0 - 4 }
                ?? min(pageBounds.maxY, max(labelTop, pageBounds.maxY - pageBounds.height * 0.085))
            let bottom = line.bounds.maxY + 3
            guard top - bottom > 45 else { continue }
            let rect = CGRect(x: left, y: bottom, width: right - left, height: top - bottom)
            guard !regions.contains(where: { $0.bounds.intersects(rect) }) else { continue }
            regions.append(VisualRegion(bounds: rect, label: "Figure · originale"))
        }
        for line in lines {
            let math = line.text.range(of: #"[=∫∑√≤≥≈∂]"#, options: .regularExpression) != nil
            let words = line.text.split(whereSeparator: \.isWhitespace)
            guard math, line.text.count < 100, words.filter({ $0.count > 3 }).count < 3,
                  !regions.contains(where: { $0.bounds.intersects(line.bounds) }) else { continue }
            // Include nearby superscripts, subscripts and fractions, but not adjacent prose.
            let band = line.bounds.insetBy(dx: -12, dy: -max(8, line.bounds.height))
            let neighbors = lines.filter { $0.bounds.intersects(band) && $0.text.count < 80 }
            let rect = neighbors.reduce(line.bounds) { $0.union($1.bounds) }.insetBy(dx: -6, dy: -5).intersection(pageBounds)
            if !regions.contains(where: { $0.bounds.intersects(rect) }) {
                regions.append(VisualRegion(bounds: rect, label: "Équation · originale"))
            }
        }
        return regions
    }

    func visualBlocks(_ lines: [Line], page: PDFPage, firstPage: Bool) throws -> [PDFReadingBlock] {
        let bounds = page.bounds(for: .cropBox)
        // Rotated pages need a different reading-order analysis. Keep the source intact.
        if page.rotation % 360 != 0, let image = Self.visualImage(page, region: bounds) {
            return [PDFReadingBlock(id: 0, text: "", heading: false,
                visual: PDFReadingVisual(bounds: bounds, image: image, label: "Page tournée · originale"))]
        }
        let candidates = Self.visualRegions(lines, pageBounds: bounds)
        var visuals: [(index: Int, visual: PDFReadingVisual)] = []
        for candidate in candidates {
            try Task.checkCancellation()
            guard let image = Self.visualImage(page, region: candidate.bounds) else { continue }
            let index = lines.firstIndex { candidate.bounds.contains(CGPoint(x: $0.bounds.midX, y: $0.bounds.midY)) }
                ?? lines.firstIndex { $0.bounds.maxY < candidate.bounds.minY } ?? lines.count
            visuals.append((index, PDFReadingVisual(bounds: candidate.bounds, image: image, label: candidate.label)))
        }
        var result: [PDFReadingBlock] = [], pending: [Line] = []
        func flush() {
            result += Self.blocks(pending, pageBounds: bounds, firstPage: firstPage)
            pending = []
        }
        for index in 0...lines.count {
            for item in visuals where item.index == index {
                flush()
                result.append(PDFReadingBlock(id: 0, text: "", heading: false, visual: item.visual))
            }
            guard index < lines.count else { continue }
            let line = lines[index]
            if !visuals.contains(where: { Self.canReplaceLine(line.bounds, withImage: $0.visual.bounds) }) {
                pending.append(line)
            }
        }
        flush()
        return result.enumerated().map { index, block in
            PDFReadingBlock(id: index, text: block.text, heading: block.heading, anchors: block.anchors, visual: block.visual)
        }
    }

    static func visualImage(_ page: PDFPage, region: CGRect) -> Data? {
        guard let reference = page.pageRef, !region.isEmpty, !region.isInfinite, !region.isNull else { return nil }
        let rotated = page.rotation % 180 != 0
        let size = rotated ? CGSize(width: region.height, height: region.width) : region.size
        let scale = min(2.5, 1600 / max(size.width, size.height))
        let width = max(1, Int(size.width * scale)), height = max(1, Int(size.height * scale))
        guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
        context.setFillColor(CGColor(gray: 1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        if page.rotation % 360 != 0 {
            context.concatenate(reference.getDrawingTransform(.cropBox, rect: CGRect(x: 0, y: 0, width: width, height: height), rotate: 0, preserveAspectRatio: true))
        } else {
            context.scaleBy(x: CGFloat(width) / region.width, y: CGFloat(height) / region.height)
            context.translateBy(x: -region.minX, y: -region.minY)
        }
        context.drawPDFPage(reference)
        guard let image = context.makeImage() else { return nil }
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return data as Data
    }
}
