import SwiftUI
import PDFKit

struct DocumentPassage: Identifiable {
    struct Region { let pageIndex: Int; let bounds: CGRect }
    let id = UUID()
    let documentID: UUID
    let fileName: String
    let location: String
    let text: String
    var regions: [Region] = []

    var citation: String { "\(fileName) · \(location)" }
}

@MainActor @Observable
final class AnnotationDraft: Identifiable {
    let id = UUID()
    let passage: DocumentPassage
    var note = ""
    init(passage: DocumentPassage) { self.passage = passage }
}

@MainActor @Observable
final class WorkspaceModel {
    enum Surface: Hashable { case chat, document, gallery }
    enum DocumentMode: String, CaseIterable { case source = "Source", pdf = "PDF" }
    struct Message: Identifiable {
        let id = UUID()
        let text: String
        let passage: DocumentPassage?
        let configuration: ChatConfiguration
    }
    struct Annotation: Identifiable {
        let id = UUID()
        let passage: DocumentPassage
        let note: String
    }

    var gallery = GalleryModel()
    var image: UIImage?
    var imageName = ""
    var savedDocuments: [UUID: DocumentState] = [:]
    struct DocumentState {
        let source: String; let sourceName: String; let pdfName: String
        let sourceAvailable: Bool; let pdf: PDFDocument?; let page: Int
        let mode: DocumentMode; let image: UIImage?; let imageName: String
    }
    func saveCurrentDocument() {
        savedDocuments[documentID] = DocumentState(source: source, sourceName: sourceName, pdfName: pdfName,
            sourceAvailable: sourceAvailable, pdf: pdfDocument, page: pdfPage, mode: documentMode, image: image, imageName: imageName)
    }
    func openArtifact(_ item: GalleryArtifact, data: Data) throws {
        saveCurrentDocument()
        if let saved = savedDocuments[item.id] {
            source = saved.source; sourceName = saved.sourceName; pdfName = saved.pdfName
            sourceAvailable = saved.sourceAvailable; pdfDocument = saved.pdf; pdfPage = saved.page
            documentMode = saved.mode; image = saved.image; imageName = saved.imageName
        } else {
            try loadDocument(data: data, name: item.name)
        }
        documentID = item.id
        selection = nil; pdfPassage = nil; annotationDraft = nil
        surface = .document
    }

    var surface: Surface = .chat
    var documentMode: DocumentMode = .pdf
    var draft = ""
    var configuration = ChatConfiguration()
    var importRequested = false
    var messages: [Message] = []
    var annotations: [Annotation] = []
    var annotationDraft: AnnotationDraft?
    var pdfPage = 0
    var source = WorkspaceModel.initialSource
    var sourceName = "notes.tex"
    var pdfName = "notes.pdf"
    var sourceAvailable = true
    var documentID = UUID()
    var selection: TextSelection?
    var pdfPassage: DocumentPassage?
    var feedback = ""
    var pdfDocument = Bundle.module.url(forResource: "notes", withExtension: "pdf").flatMap(PDFDocument.init(url:))

    var currentName: String { image != nil ? imageName : (documentMode == .source ? sourceName : pdfName) }
    var activePassage: DocumentPassage? {
        if image != nil { return nil }
        if documentMode == .pdf { return pdfPassage }
        guard sourceAvailable, let selection else { return nil }
        guard case .selection(let range) = selection.indices else { return nil }
        let text = String(source[range])
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        let firstLine = source[..<range.lowerBound].filter { $0.isNewline }.count + 1
        let lastLine = firstLine + text.dropLast().filter { $0.isNewline }.count
        let location = firstLine == lastLine ? "ligne \(firstLine)" : "lignes \(firstLine)–\(lastLine)"
        return DocumentPassage(documentID: documentID, fileName: sourceName, location: location, text: text)
    }

    func capturePDFSelection(_ selected: PDFSelection?) {
        guard let document = pdfDocument, let selected,
              let text = selected.string, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            pdfPassage = nil
            return
        }
        let indexes = selected.pages.map { document.index(for: $0) }.filter { $0 != NSNotFound }.sorted()
        guard let first = indexes.first, let last = indexes.last else { pdfPassage = nil; return }
        let location = first == last ? "page \(first + 1)" : "pages \(first + 1)–\(last + 1)"
        var regions: [DocumentPassage.Region] = []
        for line in selected.selectionsByLine() {
            for page in line.pages {
                let index = document.index(for: page)
                let bounds = line.bounds(for: page)
                if index != NSNotFound, !bounds.isEmpty, !bounds.isInfinite, !bounds.isNull {
                    regions.append(.init(pageIndex: index, bounds: bounds))
                }
            }
        }
        pdfPassage = DocumentPassage(documentID: documentID, fileName: pdfName, location: location, text: text, regions: regions)
    }

    func beginAnnotation() {
        guard let passage = activePassage else { return }
        annotationDraft = AnnotationDraft(passage: passage)
    }

    @discardableResult func sendAnnotation(_ draft: AnnotationDraft) -> Bool {
        let note = draft.note.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !note.isEmpty else { return false }
        let annotation = Annotation(passage: draft.passage, note: note)
        annotations.append(annotation)
        if draft.passage.documentID == documentID, let document = pdfDocument {
            for region in draft.passage.regions {
                guard let page = document.page(at: region.pageIndex) else { continue }
                let highlight = PDFAnnotation(bounds: region.bounds, forType: .highlight, withProperties: nil)
                highlight.color = UIColor.systemYellow.withAlphaComponent(0.4)
                highlight.contents = note
                highlight.userName = "Atelier"
                page.addAnnotation(highlight)
            }
        }
        messages.append(Message(text: note, passage: draft.passage, configuration: configuration))
        surface = .chat
        feedback = "Annotation ajoutée au chat local. Aucun agent appelé."
        return true
    }

    func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        messages.append(Message(text: text, passage: nil, configuration: configuration))
        draft = ""
        feedback = "Message local. Aucun agent n’a été appelé."
    }

    func importDocument(at url: URL) throws {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        let data = try Data(contentsOf: url)
        let item = GalleryArtifact(name: url.lastPathComponent, data: data)
        try openArtifact(item, data: data)
        gallery.localItems.append(item)
    }

    private func loadDocument(data: Data, name: String) throws {
        if (name as NSString).pathExtension.lowercased() == "pdf" {
            guard let document = PDFDocument(data: data), !document.isLocked, document.pageCount > 0 else {
                throw ImportError.unreadablePDF
            }
            pdfDocument = document
            pdfName = name
            sourceAvailable = false
            source = ""
            documentMode = .pdf
        } else if ["png", "jpg", "jpeg", "heic", "webp", "gif", "tiff"].contains((name as NSString).pathExtension.lowercased()) {
            guard let decoded = UIImage(data: data) else { throw ImportError.unreadableImage }
            image = decoded; imageName = name; pdfDocument = nil; sourceAvailable = false; source = ""
        } else {
            guard let text = String(data: data, encoding: .utf8) else { throw ImportError.unreadableText }
            source = text
            sourceName = name
            sourceAvailable = true
            pdfDocument = nil
            documentMode = .source
        }
        if !["png", "jpg", "jpeg", "heic", "webp", "gif", "tiff"].contains((name as NSString).pathExtension.lowercased()) { image = nil }
        documentID = UUID()
        selection = nil
        pdfPassage = nil
        annotationDraft = nil
        pdfPage = 0
        surface = .document
    }

    enum ImportError: LocalizedError {
        case unreadablePDF, unreadableText, unreadableImage
        var errorDescription: String? {
            switch self {
            case .unreadableImage: "Cette image est illisible."
            case .unreadablePDF: "Ce PDF est vide, verrouillé ou illisible."
            case .unreadableText: "Ce fichier texte doit être encodé en UTF-8."
            }
        }
    }

    static let initialSource = #"""
    \documentclass{article}
    \title{Notes de travail}
    \begin{document}
    \maketitle

    \section{Une question, un document}
    Un espace de travail rassemble une conversation,
    un document et les observations qui les accompagnent.
    Passer de l'un à l'autre ne devrait pas interrompre
    le fil de la réflexion.

    \section{Relecture}
    Cette page sert à essayer la navigation.
    Sélectionnez un passage pour le joindre au chat.
    Aucun résultat scientifique n'est présenté ici.

    \end{document}
    """#
}
