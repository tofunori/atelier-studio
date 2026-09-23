import SwiftUI
import PDFKit
import CryptoKit

/// Mac/PDF.js rectangles are normalized in displayed page coordinates (top left).
/// Kept separate from local PDFMark entries: refreshing cannot overwrite iPhone notes.
struct SharedPDFMark: Codable, Identifiable, Equatable {
    let id: String
    let page: Int
    let rects: [[Double]]
    let pin: [Double]?
    let kind: String
    let color: String?
    let text: String
    let note: String

    enum CodingKeys: String, CodingKey { case id, page, rects, pin, kind, color, text, note }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let value = try? c.decode(String.self, forKey: .id) { id = value }
        else { id = String(try c.decode(Int64.self, forKey: .id)) }
        page = try c.decode(Int.self, forKey: .page)
        rects = try c.decodeIfPresent([[Double]].self, forKey: .rects) ?? []
        pin = try c.decodeIfPresent([Double].self, forKey: .pin)
        kind = try c.decodeIfPresent(String.self, forKey: .kind) ?? "hl"
        color = try c.decodeIfPresent(String.self, forKey: .color)
        text = try c.decodeIfPresent(String.self, forKey: .text) ?? ""
        note = try c.decodeIfPresent(String.self, forKey: .note) ?? ""
    }

    static func bounds(_ rect: [Double], on page: PDFPage) -> CGRect? {
        guard let points = points(rect, on: page) else { return nil }
        let xs = points.map(\.x), ys = points.map(\.y)
        return CGRect(x: xs.min()!, y: ys.min()!, width: xs.max()! - xs.min()!, height: ys.max()! - ys.min()!)
    }
    /// Z-order follows the displayed text, including pages with /Rotate.
    static func points(_ rect: [Double], on page: PDFPage) -> [CGPoint]? {
        guard rect.count == 4, rect.allSatisfy(\.isFinite), rect[2] > 0, rect[3] > 0,
              rect[0] >= 0, rect[1] >= 0, rect[0] + rect[2] <= 1.001, rect[1] + rect[3] <= 1.001 else { return nil }
        let box = page.bounds(for: .cropBox)
        func point(_ u: Double, _ v: Double) -> CGPoint {
            let xy: (Double, Double)
            switch (page.rotation % 360 + 360) % 360 {
            case 90: xy = (v, u)
            case 180: xy = (1 - u, v)
            case 270: xy = (1 - v, 1 - u)
            default: xy = (u, 1 - v)
            }
            return CGPoint(x: box.minX + xy.0 * box.width, y: box.minY + xy.1 * box.height)
        }
        return [point(rect[0], rect[1]), point(rect[0] + rect[2], rect[1]),
                point(rect[0], rect[1] + rect[3]), point(rect[0] + rect[2], rect[1] + rect[3])]
    }

    var uiColor: UIColor {
        let values = (color ?? "").split(whereSeparator: { !($0.isNumber || $0 == ".") }).compactMap { Double($0) }
        if color?.hasPrefix("rgb") == true, values.count >= 3 {
            return UIColor(red: min(255, max(0, values[0])) / 255, green: min(255, max(0, values[1])) / 255,
                           blue: min(255, max(0, values[2])) / 255, alpha: kind == "hl" ? 0.4 : 0.9)
        }
        return UIColor.systemYellow.withAlphaComponent(kind == "hl" ? 0.4 : 0.9)
    }
}

@MainActor @Observable final class SharedPDFAnnotations {
    private var cache: [String: [SharedPDFMark]] = [:]
    private let directory: URL?
    init(directory: URL? = PDFAnnotations.defaultDirectory.appendingPathComponent("Mac", isDirectory: true)) { self.directory = directory }
    static func key(server: String, attachment: String, fingerprint: String) -> String {
        SHA256.hash(data: Data("\(server)|\(attachment)|\(fingerprint)".utf8)).map { String(format: "%02x", $0) }.joined()
    }
    func marks(for key: String) -> [SharedPDFMark] {
        if let marks = cache[key] { return marks }
        guard let directory, let data = try? Data(contentsOf: directory.appendingPathComponent(key + ".json")),
              let marks = try? JSONDecoder().decode([SharedPDFMark].self, from: data) else { return [] }
        return marks
    }
    func replace(_ marks: [SharedPDFMark], for key: String) throws {
        guard Set(marks.map(\.id)).count == marks.count else { throw CocoaError(.fileReadCorruptFile) }
        if let directory {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try JSONEncoder().encode(marks).write(to: directory.appendingPathComponent(key + ".json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
        cache[key] = marks
    }
    static func apply(_ marks: [SharedPDFMark], to document: PDFDocument) {
        for index in 0..<document.pageCount {
            guard let page = document.page(at: index) else { continue }
            for annotation in page.annotations where annotation.userName?.hasPrefix("Atelier Mac ") == true { page.removeAnnotation(annotation) }
        }
        for mark in marks where mark.page > 0 && mark.page <= document.pageCount {
            guard let page = document.page(at: mark.page - 1) else { continue }
            let validRects = mark.rects.filter { SharedPDFMark.bounds($0, on: page) != nil }
            var bounds = validRects.compactMap { SharedPDFMark.bounds($0, on: page) }
            if mark.kind == "note", let pin = mark.pin, pin.count == 2,
               let anchor = SharedPDFMark.bounds([min(0.98, pin[0]), min(0.98, pin[1]), 0.02, 0.02], on: page) { bounds = [anchor] }
            let type: PDFAnnotationSubtype
            switch mark.kind {
            case "ul", "comment": type = .underline
            case "st": type = .strikeOut
            case "area": type = .square
            case "note": type = .text
            default: type = .highlight
            }
            for (index, bound) in bounds.enumerated() {
                let annotation = PDFAnnotation(bounds: bound, forType: type, withProperties: nil)
                if [.highlight, .underline, .strikeOut].contains(type), index < validRects.count,
                   let corners = SharedPDFMark.points(validRects[index], on: page) {
                    annotation.quadrilateralPoints = corners.map { NSValue(cgPoint: CGPoint(x: $0.x - bound.minX, y: $0.y - bound.minY)) }
                }
                annotation.color = mark.uiColor
                annotation.contents = mark.note.isEmpty ? mark.text : mark.note
                annotation.userName = "Atelier Mac \(mark.id)"
                page.addAnnotation(annotation)
            }
        }
    }
}

extension WorkspaceModel {
    var sharedPDFAnnotationKey: String? {
        guard let attachment = currentArticle?.pdfKey, !pdfFingerprint.isEmpty, let server = gallery.annotationServerID else { return nil }
        return SharedPDFAnnotations.key(server: server, attachment: attachment, fingerprint: pdfFingerprint)
    }
    var documentSharedPDFMarks: [SharedPDFMark] { sharedPDFAnnotationKey.map { sharedPDFAnnotations.marks(for: $0) } ?? [] }

    func refreshSharedPDFAnnotations() async {
        let request = UUID(); sharedPDFAnnotationsRequest = request
        sharedPDFAnnotationsError = nil
        guard let document = pdfDocument else { return }
        SharedPDFAnnotations.apply(documentSharedPDFMarks, to: document)
        guard let article = currentArticle, let attachment = article.pdfKey, let filename = article.pdfFile,
              let cacheKey = sharedPDFAnnotationKey else { return }
        let revision = gallery.connectionRevision, identity = documentID
        do {
            let data = try await gallery.chatRequest(["zotero", "annotations", attachment], query: [URLQueryItem(name: "file", value: filename)])
            struct Reply: Decodable { let attachmentKey: String; let fileName: String; let annots: [SharedPDFMark] }
            let reply = try JSONDecoder().decode(Reply.self, from: data)
            guard !Task.isCancelled, sharedPDFAnnotationsRequest == request, documentID == identity, pdfDocument === document,
                  sharedPDFAnnotationKey == cacheKey, gallery.connectionRevision == revision else { return }
            guard reply.attachmentKey == attachment, reply.fileName == filename else { throw CocoaError(.fileReadCorruptFile) }
            try sharedPDFAnnotations.replace(reply.annots, for: cacheKey)
            SharedPDFAnnotations.apply(reply.annots, to: document)
        } catch {
            guard !Task.isCancelled, !(error is CancellationError), (error as? URLError)?.code != .cancelled,
                  sharedPDFAnnotationsRequest == request, documentID == identity, sharedPDFAnnotationKey == cacheKey, gallery.connectionRevision == revision else { return }
            sharedPDFAnnotationsError = "Annotations du Mac non actualisées. La dernière copie disponible et vos annotations iPhone sont conservées."
        }
    }
}
