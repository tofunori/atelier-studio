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
    /// Chat text the Mac attached to the mark.
    let note: String
    /// Personal note written on the Mac (also Claude's reason for a highlight).
    /// Absent from caches written before it was decoded.
    let memo: String
    /// What the reader wrote: the personal note, else the chat text.
    var displayNote: String { memo.isEmpty ? note : memo }

    enum CodingKeys: String, CodingKey { case id, page, rects, pin, kind, color, text, note, memo }
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
        memo = try c.decodeIfPresent(String.self, forKey: .memo) ?? ""
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
    /// Inverse of `points`: a PDFKit page rectangle as the Mac stores it.
    static func fraction(_ rect: CGRect, on page: PDFPage) -> [Double]? {
        let box = page.bounds(for: .cropBox)
        guard box.width > 0, box.height > 0, rect.minX.isFinite, rect.minY.isFinite,
              rect.width.isFinite, rect.height.isFinite, rect.width > 0, rect.height > 0 else { return nil }
        let rotation = (page.rotation % 360 + 360) % 360
        let corners = [CGPoint(x: rect.minX, y: rect.minY), CGPoint(x: rect.maxX, y: rect.maxY)].map { p -> (u: Double, v: Double) in
            let x = Double((p.x - box.minX) / box.width), y = Double((p.y - box.minY) / box.height)
            switch rotation {
            case 90: return (y, x)
            case 180: return (1 - x, y)
            case 270: return (1 - y, 1 - x)
            default: return (x, 1 - y)
            }
        }
        let snap = { (value: Double) in (value * 100_000).rounded() / 100_000 }
        let u0 = snap(max(0, min(corners[0].u, corners[1].u))), u1 = snap(min(1, max(corners[0].u, corners[1].u)))
        let v0 = snap(max(0, min(corners[0].v, corners[1].v))), v1 = snap(min(1, max(corners[0].v, corners[1].v)))
        guard u1 > u0, v1 > v0 else { return nil }
        return [u0, v0, u1 - u0, v1 - v0]
    }
    /// `iphone-{uuid}-p{page}`: the iPhone mark this Mac entry copies.
    var phoneMarkID: UUID? {
        guard id.hasPrefix("iphone-") else { return nil }
        return UUID(uuidString: String(id.dropFirst(7).prefix(36)))
    }

    var uiColor: UIColor {
        let values = (color ?? "").split(whereSeparator: { !($0.isNumber || $0 == ".") }).compactMap { Double($0) }
        if color?.hasPrefix("rgb") == true, values.count >= 3 {
            return UIColor(red: min(255, max(0, values[0])) / 255, green: min(255, max(0, values[1])) / 255,
                           blue: min(255, max(0, values[2])) / 255, alpha: kind == "hl" ? 0.4 : 0.9)
        }
        // The Mac also accepts its colour names, and draws a mark without colour
        // in its first one (`normalizeHighlightColor`).
        let ink = color.flatMap { AnnotationInk(rawValue: $0) } ?? .amber
        return ink.uiColor.withAlphaComponent(kind == "hl" ? 0.4 : 0.9)
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
                annotation.contents = mark.displayNote.isEmpty ? mark.text : mark.displayNote
                annotation.userName = "Atelier Mac \(mark.id)"
                page.addAnnotation(annotation)
            }
        }
    }
}

extension AnnotationInk {
    /// The Mac viewer's own colour string (`HL_COLORS`).
    var macColor: String {
        switch self {
        case .amber: "rgba(255,213,74,.40)"
        case .green: "rgba(120,220,140,.40)"
        case .blue: "rgba(120,170,255,.40)"
        case .red: "rgba(255,140,160,.40)"
        case .orange: "rgba(255,160,80,.40)"
        case .violet: "rgba(185,150,255,.40)"
        }
    }
}

extension PDFMark {
    /// One Mac entry per page (see `save_annotations` in the gateway), nil when
    /// a region cannot be placed or the mark exceeds what the Mac accepts.
    func macAnnotations(in document: PDFDocument) -> [[String: Any]]? {
        var pages: [Int: [[Double]]] = [:]
        for region in regions {
            guard let page = document.page(at: region.page), let rect = SharedPDFMark.fraction(region.bounds, on: page) else { return nil }
            pages[region.page, default: []].append(rect)
        }
        guard !pages.isEmpty, pages.count <= 20, pages.values.allSatisfy({ $0.count <= 500 }),
              text.utf8.count <= 20_000, note.utf8.count <= 20_000 else { return nil }
        // The note goes on the first page only, like a passage Claude highlights.
        return pages.keys.sorted().enumerated().map { index, page -> [String: Any] in
            ["page": page + 1, "rects": pages[page] ?? [], "text": text, "kind": style == .highlight ? "hl" : "ul",
             "color": color.macColor, "memo": index == 0 ? note : ""]
        }
    }
}

extension WorkspaceModel {
    var sharedPDFAnnotationKey: String? {
        guard let attachment = currentArticle?.pdfKey, !pdfFingerprint.isEmpty, let server = gallery.annotationServerID else { return nil }
        return SharedPDFAnnotations.key(server: server, attachment: attachment, fingerprint: pdfFingerprint)
    }
    /// The Mac's marks, less the copies of this iPhone's own (shown as iPhone marks).
    var documentSharedPDFMarks: [SharedPDFMark] {
        (sharedPDFAnnotationKey.map { sharedPDFAnnotations.marks(for: $0) } ?? [])
            .filter { mark in mark.phoneMarkID.map { !pdfAnnotations.isLocal($0) } ?? true }
    }

    /// Sends this article's iPhone marks the Mac has not confirmed (new,
    /// edited, removed) to its annotations file, so the Mac viewer shows them.
    /// They stay on the iPhone either way; a failed send is retried at the
    /// next opening of the article.
    func sendPDFMarksToMac() async {
        guard !sendingPDFMarks else { sendPDFMarksAgain = true; return }
        sendingPDFMarks = true
        defer { sendingPDFMarks = false }
        repeat {
            sendPDFMarksAgain = false
            guard let article = currentArticle, let attachment = article.pdfKey, let filename = article.pdfFile,
                  let document = pdfDocument, let cacheKey = sharedPDFAnnotationKey else { return }
            let pending = pdfAnnotations.pendingForMac(documentKey: pdfAnnotationKey)
            var payload: [[String: Any]] = pending.removals.map { ["id": $0.id.uuidString, "annots": [Any]()] }
            var sent: [PDFMark] = []
            for mark in pending.marks {
                guard let annots = mark.macAnnotations(in: document) else { continue }
                payload.append(["id": mark.id.uuidString, "annots": annots]); sent.append(mark)
            }
            guard !payload.isEmpty else { return }
            let revision = gallery.connectionRevision, identity = documentID
            do {
                let data = try await gallery.chatRequest(["zotero", "annotations", attachment], body: ["marks": payload],
                                                         query: [URLQueryItem(name: "file", value: filename)])
                struct Reply: Decodable { let attachmentKey: String; let fileName: String; let annots: [SharedPDFMark] }
                let reply = try JSONDecoder().decode(Reply.self, from: data)
                guard reply.attachmentKey == attachment, reply.fileName == filename else { throw CocoaError(.fileReadCorruptFile) }
                try pdfAnnotations.confirmSentToMac(sent, removals: pending.removals.map(\.id))
                guard documentID == identity, pdfDocument === document, sharedPDFAnnotationKey == cacheKey,
                      gallery.connectionRevision == revision else { return }
                try sharedPDFAnnotations.replace(reply.annots, for: cacheKey)
                SharedPDFAnnotations.apply(documentSharedPDFMarks, to: document)
            } catch {
                guard !Task.isCancelled, !(error is CancellationError), (error as? URLError)?.code != .cancelled,
                      documentID == identity, gallery.connectionRevision == revision else { return }
                sharedPDFAnnotationsError = "Annotations iPhone pas encore envoyées au Mac. Elles restent ici et partiront à la prochaine ouverture de l’article."
                return
            }
        } while sendPDFMarksAgain
    }

    func refreshSharedPDFAnnotations() async {
        let request = UUID(); sharedPDFAnnotationsRequest = request
        sharedPDFAnnotationsError = nil
        guard let document = pdfDocument else { return }
        SharedPDFAnnotations.apply(documentSharedPDFMarks, to: document)
        guard let article = currentArticle, let attachment = article.pdfKey, let filename = article.pdfFile,
              let cacheKey = sharedPDFAnnotationKey else { return }
        await sendPDFMarksToMac()
        guard sharedPDFAnnotationsRequest == request else { return }
        let revision = gallery.connectionRevision, identity = documentID
        do {
            let data = try await gallery.chatRequest(["zotero", "annotations", attachment], query: [URLQueryItem(name: "file", value: filename)])
            struct Reply: Decodable { let attachmentKey: String; let fileName: String; let annots: [SharedPDFMark] }
            let reply = try JSONDecoder().decode(Reply.self, from: data)
            guard !Task.isCancelled, sharedPDFAnnotationsRequest == request, documentID == identity, pdfDocument === document,
                  sharedPDFAnnotationKey == cacheKey, gallery.connectionRevision == revision else { return }
            guard reply.attachmentKey == attachment, reply.fileName == filename else { throw CocoaError(.fileReadCorruptFile) }
            try sharedPDFAnnotations.replace(reply.annots, for: cacheKey)
            SharedPDFAnnotations.apply(documentSharedPDFMarks, to: document)
        } catch {
            guard !Task.isCancelled, !(error is CancellationError), (error as? URLError)?.code != .cancelled,
                  sharedPDFAnnotationsRequest == request, documentID == identity, sharedPDFAnnotationKey == cacheKey, gallery.connectionRevision == revision else { return }
            sharedPDFAnnotationsError = "Annotations du Mac non actualisées. La dernière copie disponible et vos annotations iPhone sont conservées."
        }
    }
}
