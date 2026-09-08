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
    var figureRegion: CGRect?
    var figure: GalleryArtifact?
    var articleKey: String?
    var articleAttachmentKey: String?
    var sourceRange: NSRange?
    var selectedText: String?

    var citation: String { "\(fileName) · \(location)" }
}

@MainActor @Observable
final class AnnotationDraft: Identifiable {
    let id: UUID
    let passage: DocumentPassage
    var note = ""
    var readingNoteID: UUID?
    var markingStyle: PDFMark.Style = .highlight
    var ink: AnnotationInk = .sage
    init(passage: DocumentPassage, id: UUID = UUID()) { self.passage = passage; self.id = id }
}

@MainActor @Observable
final class WorkspaceModel {
    enum Surface: Hashable { case chat, document, gallery, articles, calculations }
    enum DocumentMode: String, CaseIterable { case reading = "Lecture", source = "Source", pdf = "PDF" }
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

    init(resumeStore: ChatResumeStore? = nil) {
        chat.resumeStore = resumeStore
        if let data = Self.initialPDFData {
            pdfFingerprint = PDFAnnotations.fingerprint(data)
            if let document = pdfDocument { PDFAnnotations.apply(documentPDFMarks, to: document) }
        }
    }
    static let initialPDFData = Bundle.module.url(forResource: "notes", withExtension: "pdf").flatMap { try? Data(contentsOf: $0) }
    var documentResumeStore = DocumentResumeStore.live()
    @ObservationIgnored var documentSaveTask: Task<Void, Never>?
    var documentBytes: Data?
    var readingOffsets: [UUID: Double] = [:]
    var revisionTarget: SourceRevisionTarget?
    var chatPickerRequested = false
    var focusChatRequest = UUID()
    var importToChat = false
    var viewedArtifact: GalleryArtifact?
    func attachToChat(_ item: GalleryArtifact) {
        chat.attach(item); surface = .chat
        if chat.selected == nil { chatPickerRequested = true }
    }
    var readingNotes = DocumentReadingNotes()
    var pdfAnnotations = PDFAnnotations()
    var pdfFingerprint = ""
    var pdfNavigationRequest = UUID()
    var pendingDocumentPrompt: String?
    var pendingDocumentPassage: DocumentPassage?
    var library = LibraryModel()
    var currentArticle: LibraryArticle?
    var documentOrigin: Surface = .gallery
    var sidebarRequested = false
    var sidebarQuery = ""
    var sidebarCollapsed: Set<String> = []
    var sidebarGroupsInitialized = false
    var sidebarPreferences = SidebarProjectPreferences()
    var newChatRequested = false
    var galleryFilters: [String: GalleryFilterState] = [:]
    var lastDocuments: [Surface: OpenDocumentBookmark] = [:]
    struct OpenDocumentBookmark {
        let artifact: GalleryArtifact
        let data: Data
        let article: LibraryArticle?
    }
    var activeSection: Surface { surface == .document ? documentOrigin : surface }
    func rememberOpenDocument() {
        guard surface == .document, let artifact = viewedArtifact, let data = documentBytes else { return }
        saveCurrentDocument()
        lastDocuments[documentOrigin] = OpenDocumentBookmark(artifact: artifact, data: data, article: currentArticle)
    }
    func navigate(to section: Surface) {
        sidebarRequested = false
        if surface == .document && documentOrigin == section {
            returnToDocumentList()
            return
        }
        rememberOpenDocument()
        if section != .chat, let bookmark = lastDocuments[section] {
            do {
                try openArtifact(bookmark.artifact, data: bookmark.data)
                documentOrigin = section; currentArticle = bookmark.article
            } catch { documentError = error.localizedDescription; surface = section }
        } else { surface = section }
        sidebarRequested = false
    }
    func returnToDocumentList() {
        let origin = documentOrigin
        rememberOpenDocument()
        surface = origin
        lastDocuments[origin] = nil
    }
    var gallery = GalleryModel()
    var chat = RemoteChatModel()
    var image: UIImage?
    var imageName = ""
    var originalSources: [UUID: String] = [:]
    var recoveredDrafts: [UUID: String] = [:]
    var documentError: String?
    var savingDocument = false
    var savedDocuments: [UUID: DocumentState] = [:]
    struct DocumentState {
        let source: String; let sourceName: String; let pdfName: String
        let sourceAvailable: Bool; let pdf: PDFDocument?; let page: Int
        let mode: DocumentMode; let image: UIImage?; let imageName: String
        let pdfFingerprint: String
    }
    func saveCurrentDocument() {
        savedDocuments[documentID] = DocumentState(source: source, sourceName: sourceName, pdfName: pdfName,
            sourceAvailable: sourceAvailable, pdf: pdfDocument, page: pdfPage, mode: documentMode, image: image, imageName: imageName, pdfFingerprint: pdfFingerprint)
    }
    func openArtifact(_ item: GalleryArtifact, data: Data) throws {
        rememberOpenDocument()
        saveCurrentDocument()
        currentArticle = nil; documentOrigin = .gallery; editingSource = false
        let incomingFingerprint = PDFAnnotations.fingerprint(data)
        if let saved = savedDocuments[item.id], saved.pdf == nil || saved.pdfFingerprint == incomingFingerprint {
            source = saved.source; sourceName = saved.sourceName; pdfName = saved.pdfName
            sourceAvailable = saved.sourceAvailable; pdfDocument = saved.pdf; pdfPage = saved.page
            documentMode = saved.mode; image = saved.image; imageName = saved.imageName
        } else {
            try loadDocument(data: data, name: item.name)
        }
        if originalSources[item.id] == nil && sourceAvailable { originalSources[item.id] = source }
        viewedArtifact = item
        documentBytes = data
        pdfFingerprint = pdfDocument == nil ? "" : incomingFingerprint
        documentID = item.id
        if let document = pdfDocument { PDFAnnotations.apply(documentPDFMarks, to: document) }
        selection = nil; pdfPassage = nil; annotationDraft = nil
        surface = .document
    }

    var surface: Surface = .chat {
        willSet { if surface == .document && newValue != .document { rememberOpenDocument() } }
    }
    var editingSource = false
    var documentMode: DocumentMode = .pdf
    var draft = "" { didSet { chat.updateDraft(draft) } }
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
    var pdfDocument = WorkspaceModel.initialPDFData.flatMap(PDFDocument.init(data:))

    var currentName: String { image != nil ? imageName : (sourceAvailable && documentMode != .pdf ? sourceName : pdfName) }
    var availableDocumentModes: [DocumentMode] {
        if image != nil { return [] }
        if sourceAvailable { return DocumentMode.allCases.filter { $0 != .pdf || pdfDocument != nil } }
        return pdfDocument == nil ? [] : [.pdf, .reading]
    }
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
        return DocumentPassage(documentID: documentID, fileName: sourceName, location: location, text: text, sourceRange: NSRange(range, in: source), selectedText: text)
    }

    func reloadDocument() async {
        guard let artifact = viewedArtifact, artifact.fileID != nil, !savingDocument else { return }
        let id = documentID
        recoveredDrafts[id] = source
        savingDocument = true; documentError = nil
        defer { savingDocument = false }
        do {
            gallery.invalidate(artifact)
            let data = try await gallery.contents(artifact)
            guard documentID == id, let text = String(data: data, encoding: .utf8) else { return }
            selection = nil; source = text; originalSources[id] = text
            saveCurrentDocument()
            feedback = "Version du Mac rechargée. Votre ancien brouillon reste récupérable."
        } catch { documentError = error.localizedDescription }
    }
    func recoverDocumentDraft() {
        guard let text = recoveredDrafts[documentID] else { return }
        selection = nil; source = text
    }

    var documentDirty: Bool { sourceAvailable && originalSources[documentID].map { $0 != source } == true }
    func saveDocument() async {
        guard let artifact = viewedArtifact, let original = originalSources[documentID], !savingDocument else { return }
        let id = documentID, content = source
        savingDocument = true; documentError = nil
        defer { savingDocument = false }
        do {
            if artifact.fileID != nil {
                let fileID = try await gallery.attachmentID(artifact)
                _ = try await gallery.chatRequest(["document", fileID], body: ["original": original, "content": content])
                gallery.invalidate(artifact)
            } else if let index = gallery.localItems.firstIndex(where: { $0.id == artifact.id }) {
                gallery.localItems[index].data = Data(content.utf8)
                if documentID == id { viewedArtifact = gallery.localItems[index] }
            }
            originalSources[id] = content
            if documentID == id { feedback = artifact.fileID == nil ? "Copie locale enregistrée" : "Enregistré sur le Mac" }
        } catch { documentError = error.localizedDescription }
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
        pdfPassage = DocumentPassage(documentID: documentID, fileName: pdfName, location: location, text: text, regions: regions, articleKey: currentArticle?.key, articleAttachmentKey: currentArticle?.pdfKey)
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
        gallery.localItems.append(item)
        if importToChat { importToChat = false; attachToChat(item) } else { try openArtifact(item, data: data) }
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
            documentMode = (name as NSString).pathExtension.lowercased() == "tex" ? .reading : .source
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
