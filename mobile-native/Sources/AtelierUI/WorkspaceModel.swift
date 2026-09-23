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
    /// Existing local PDF mark identity, when this passage came from the
    /// annotation list. New selections intentionally leave it nil.
    var annotationID: UUID?
    var sourceRange: NSRange?
    var selectedText: String?

    var citation: String { "\(fileName) · \(location)" }
}

/// The exact persisted annotation version that was included in a chat send.
/// Keeping the timestamp with the id lets a later acknowledgement remove only
/// the annotation that was actually sent, while preserving edits made in the
/// meantime.
struct AnnotationSendReference: Codable, Equatable, Hashable, Sendable {
    let id: UUID
    let updatedAt: Date
}

@MainActor @Observable
final class AnnotationDraft: Identifiable {
    let id: UUID
    let passage: DocumentPassage
    var note = ""
    var readingNoteID: UUID?
    var readingNoteUpdatedAt: Date?
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
    struct DocumentUpdate: Equatable {
        let previous: String
        let current: String
        let applied: Bool
        let conflict: Bool
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
    var sourceOffsets: [UUID: CGPoint] = [:]
    var revisionTarget: SourceRevisionTarget?
    var chatPickerRequested = false
    var focusChatRequest = UUID()
    var importToChat = false
    var viewedArtifact: GalleryArtifact?
    func switchWorkSurface(_ target: Surface) {
        if target == .document || target == .articles {
            let origin: Surface = target == .document ? .gallery : .articles
            if viewedArtifact != nil && documentOrigin == origin {
                surface = .document
            } else if let bookmark = lastDocuments[origin] {
                do {
                    try openArtifact(bookmark.artifact, data: bookmark.data)
                    documentOrigin = origin
                    currentArticle = bookmark.article
                } catch { documentError = error.localizedDescription }
            } else if target == .articles { surface = .articles }
        } else { surface = target }
        sidebarRequested = false
    }
    var hasWorkingFile: Bool { (viewedArtifact != nil && documentOrigin == .gallery) || lastDocuments[.gallery] != nil }
    var selectedWorkSurface: Surface { surface == .document && documentOrigin == .articles ? .articles : surface }
    func attachToChat(_ item: GalleryArtifact) {
        chat.attach(item); surface = .chat
        if chat.selected == nil { chatPickerRequested = true }
    }
    var readingNotes = DocumentReadingNotes()
    var pdfAnnotations = PDFAnnotations()
    var sharedPDFAnnotations = SharedPDFAnnotations()
    var sharedPDFAnnotationsError: String?
    @ObservationIgnored var sharedPDFAnnotationsRequest = UUID()
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
    }
    var gallery = GalleryModel()
    var chat = RemoteChatModel()
    var image: UIImage?
    var imageName = ""
    var originalSources: [UUID: String] = [:]
    var comparisonSources: [UUID: String] = [:]
    var remoteDocumentChanged = false
    /// Incoming remote text retained when a local draft or active editor makes
    /// immediate replacement unsafe. The UI can show a diff and adopt it later.
    var pendingRemoteSources: [UUID: String] = [:]
    var documentUpdates: [UUID: DocumentUpdate] = [:]
    /// The active review and per-document snapshots. A snapshot is restored
    /// only when its previous/current pair still identifies the same remote
    /// version; a changed pair starts a fresh review.
    var documentReview: DocumentReviewSession?
    var documentReviewSessions: [UUID: DocumentReviewSession] = [:]
    var documentRefreshRequests: [UUID: UUID] = [:]
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
        if let documentReview { documentReviewSessions[documentID] = documentReview }
        rememberOpenDocument()
        saveCurrentDocument()
        currentArticle = nil; documentOrigin = .gallery; editingSource = false
        // A bookmark can contain the last local draft while a newer Mac
        // version is waiting in memory. Keep that pending version through the
        // re-open instead of treating the stale bookmark bytes as a resolution.
        let retainedPendingRemote = pendingRemoteSources[item.id]
        let retainedUpdate = documentUpdates[item.id]
        let incomingFingerprint = PDFAnnotations.fingerprint(data)
        let incomingText = String(data: data, encoding: .utf8)
        if let saved = savedDocuments[item.id],
           (saved.sourceAvailable && (originalSources[item.id] != saved.source || originalSources[item.id] == incomingText)) ||
           (saved.pdf != nil && saved.pdfFingerprint == incomingFingerprint) {
            source = saved.source; sourceName = saved.sourceName; pdfName = saved.pdfName
            sourceAvailable = saved.sourceAvailable; pdfDocument = saved.pdf; pdfPage = saved.page
            documentMode = saved.mode; image = saved.image; imageName = saved.imageName
        } else {
            try loadDocument(data: data, name: item.name)
            if sourceAvailable, let previous = originalSources[item.id], previous != source {
                comparisonSources[item.id] = previous
            }
            if sourceAvailable { originalSources[item.id] = source }
        }
        remoteDocumentChanged = sourceAvailable && incomingText != nil && originalSources[item.id] != incomingText
        if remoteDocumentChanged, let incomingText {
            pendingRemoteSources[item.id] = incomingText
            documentUpdates[item.id] = DocumentUpdate(
                previous: originalSources[item.id] ?? source,
                current: incomingText,
                applied: false,
                conflict: originalSources[item.id].map { $0 != source } == true
            )
        } else if let retainedPendingRemote, retainedUpdate?.conflict == true {
            pendingRemoteSources[item.id] = retainedPendingRemote
            remoteDocumentChanged = true
            documentUpdates[item.id] = retainedUpdate
        } else {
            pendingRemoteSources[item.id] = nil
        }
        if originalSources[item.id] == nil && sourceAvailable { originalSources[item.id] = source }
        viewedArtifact = item
        documentBytes = data
        pdfFingerprint = pdfDocument == nil ? "" : incomingFingerprint
        documentID = item.id
        if let review = documentReviewSessions[item.id],
           let update = documentUpdates[item.id], update.applied, !update.conflict,
           review.previous == update.previous, review.current == update.current,
           review.renderedSource == source {
            documentReview = review
        } else {
            documentReview = nil
            documentReviewSessions[item.id] = nil
        }
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
    var composerSelection: TextSelection?
    var configuration = ChatConfiguration()
    var importRequested = false
    var messages: [Message] = []
    var annotations: [Annotation] = []
    /// Reading-note versions attached to the current quote. The mapping is
    /// intentionally keyed by quote id because a chat draft can outlive the
    /// document view that created it.
    var annotationReferencesByQuote: [UUID: [AnnotationSendReference]] = [:]
    var pendingAnnotationReferences: [AnnotationSendReference] = []
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

    var currentDocumentUpdate: DocumentUpdate? { documentUpdates[documentID] }

    /// Whether the current source can safely participate in the per-change
    /// review. A pending remote conflict or a local edit closes the review
    /// controls until the user resolves that state explicitly.
    var canReviewDocument: Bool {
        guard sourceAvailable, !documentDirty, !remoteDocumentChanged,
              !editingSource,
              let update = currentDocumentUpdate, update.applied, !update.conflict,
              let review = documentReview,
              review.previous == update.previous, review.current == update.current,
              source == review.renderedSource else { return false }
        return review.hasChanges
    }

    /// Build/reconcile the current document's review session. Work is detached
    /// because a large source can contain thousands of line tokens; all state
    /// installation remains guarded on the main actor after the task returns.
    func prepareDocumentReview() async {
        guard sourceAvailable, let update = currentDocumentUpdate,
              update.applied, !update.conflict,
              !documentDirty, !remoteDocumentChanged else {
            return
        }
        let id = documentID
        let previous = update.previous
        let current = update.current
        let expectedSource = source
        let existing = documentReview
        if let existing {
            guard existing.previous == previous, existing.current == current,
                  existing.renderedSource == expectedSource else {
                documentReview = nil
                documentReviewSessions[id] = nil
                return
            }
        } else {
            guard expectedSource == current else { return }
        }
        let session = await Task.detached(priority: .userInitiated) {
            DocumentReviewSession(previous: previous, current: current, preserving: existing)
        }.value
        guard !Task.isCancelled, documentID == id,
              !savingDocument,
              documentReview == existing,
              let latest = currentDocumentUpdate,
              latest.previous == previous, latest.current == current,
              latest.applied, !latest.conflict,
              !documentDirty, !remoteDocumentChanged,
              source == expectedSource else { return }
        guard session.hasChanges else {
            documentReview = nil
            documentReviewSessions[id] = nil
            return
        }
        documentReview = session
        documentReviewSessions[id] = session
    }

    /// Accept or reject one chunk (or every pending chunk when `chunkID` is
    /// nil). The CAS write is performed before either the source or decision is
    /// changed, so a failed gateway request leaves the review retryable.
    @discardableResult
    func decideDocumentReview(chunkID: Int?, accept: Bool) async -> Bool {
        guard canReviewDocument, let artifact = viewedArtifact,
              let review = documentReview, !savingDocument else { return false }
        let id = documentID
        let sessionID = review.id
        let expectedSource = source
        let next = review.applying(accept ? .accepted : .rejected, to: chunkID)
        guard next != review else { return true }
        let candidate = next.renderedSource
        savingDocument = true
        documentError = nil
        defer { savingDocument = false }
        do {
            try await persistDocumentReview(artifact: artifact, expected: expectedSource, content: candidate)
        } catch {
            if documentID == id { documentError = error.localizedDescription }
            return false
        }
        return commitDocumentReview(id: id, sessionID: sessionID, review: review,
                                    expected: expectedSource, candidate: candidate, next: next)
    }

    /// Restore the decision snapshot before the most recent acknowledged
    /// action, again guarded by the same CAS expected source.
    @discardableResult
    func undoDocumentReview() async -> Bool {
        guard canReviewDocument, let artifact = viewedArtifact,
              let review = documentReview, let next = review.undoing(), !savingDocument else { return false }
        let id = documentID
        let sessionID = review.id
        let expectedSource = source
        let candidate = next.renderedSource
        savingDocument = true
        documentError = nil
        defer { savingDocument = false }
        do {
            try await persistDocumentReview(artifact: artifact, expected: expectedSource, content: candidate)
        } catch {
            if documentID == id { documentError = error.localizedDescription }
            return false
        }
        return commitDocumentReview(id: id, sessionID: sessionID, review: review,
                                    expected: expectedSource, candidate: candidate, next: next)
    }

    /// Install an acknowledged result only for the document/version that
    /// initiated the request. If the user switched files while the request was
    /// in flight, update that file's saved bookmark instead of mutating the
    /// newly visible document.
    private func commitDocumentReview(id: UUID, sessionID: UUID, review: DocumentReviewSession,
                                      expected: String, candidate: String,
                                      next: DocumentReviewSession) -> Bool {
        let data = Data(candidate.utf8)
        if documentID == id {
            guard let currentReview = documentReview, currentReview.id == sessionID,
                  currentReview == review,
                  let update = currentDocumentUpdate,
                  update.applied, !update.conflict,
                  update.previous == review.previous, update.current == review.current,
                  source == expected, !documentDirty, !remoteDocumentChanged else { return false }
            selection = nil
            pdfPassage = nil
            source = candidate
            originalSources[id] = candidate
            updateDocumentBytes(data)
            documentReview = next
            documentReviewSessions[id] = next
            saveCurrentDocument()
            scheduleDocumentResume()
            return true
        }

        guard let saved = savedDocuments[id], saved.source == expected,
              let update = documentUpdates[id], update.applied, !update.conflict,
              let stored = documentReviewSessions[id], stored.id == sessionID,
              stored.renderedSource == expected else { return false }
        originalSources[id] = candidate
        documentReviewSessions[id] = next
        savedDocuments[id] = DocumentState(source: candidate, sourceName: saved.sourceName,
            pdfName: saved.pdfName, sourceAvailable: saved.sourceAvailable, pdf: saved.pdf,
            page: saved.page, mode: saved.mode, image: saved.image, imageName: saved.imageName,
            pdfFingerprint: saved.pdfFingerprint)
        for (section, bookmark) in lastDocuments where bookmark.artifact.id == id {
            lastDocuments[section] = OpenDocumentBookmark(artifact: bookmark.artifact, data: data, article: bookmark.article)
        }
        return true
    }

    private func persistDocumentReview(artifact: GalleryArtifact, expected: String, content: String) async throws {
        if let fileID = artifact.fileID {
            // The document route checks `original` against the latest bytes on
            // the Mac. Even an accept/no-op therefore validates the CAS and
            // cannot silently approve a stale remote version.
            let resolvedID = try await gallery.attachmentID(artifact)
            _ = try await gallery.chatRequest(["document", resolvedID],
                                               body: ["original": expected, "content": content])
            gallery.invalidate(artifact)
            _ = fileID // Keep the branch explicit for diagnostics/readability.
        } else if let index = gallery.localItems.firstIndex(where: { $0.id == artifact.id }) {
            let existing = gallery.localItems[index].data.flatMap { String(data: $0, encoding: .utf8) }
            guard existing == expected else {
                throw GalleryModel.GalleryError.message("Le document local a changé. Rechargez-le avant de réappliquer cette modification.")
            }
            gallery.localItems[index].data = Data(content.utf8)
        } else {
            throw GalleryModel.GalleryError.missingFile
        }
    }

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

    func updateDocumentBytes(_ data: Data) {
        documentBytes = data
        for (section, bookmark) in lastDocuments where bookmark.artifact.id == documentID {
            lastDocuments[section] = OpenDocumentBookmark(artifact: bookmark.artifact, data: data, article: bookmark.article)
        }
    }

    /// Adopt server changes only if the local draft is still the one we fetched for.
    func receiveDocumentVersion(_ text: String, for id: UUID, expectedSource: String) {
        guard documentID == id else { return }
        guard text != originalSources[id] else {
            pendingRemoteSources[id] = nil
            remoteDocumentChanged = false
            if documentUpdates[id]?.applied != true { documentUpdates[id] = nil }
            return
        }
        let localMatchesRequest = source == expectedSource
        // A review source can be clean relative to its last CAS while still
        // carrying pending decisions. Never auto-adopt a new server version
        // over that state; retain the remote bytes for an explicit resolution.
        if (documentReview?.pendingCount ?? 0) > 0 || !localMatchesRequest || documentDirty {
            documentReview = nil
            documentReviewSessions[id] = nil
            pendingRemoteSources[id] = text
            remoteDocumentChanged = true
            documentUpdates[id] = DocumentUpdate(
                previous: expectedSource,
                current: text,
                applied: false,
                conflict: true
            )
            return
        }
        comparisonSources[id] = source
        selection = nil; source = text; originalSources[id] = text
        updateDocumentBytes(Data(text.utf8))
        documentReview = nil
        documentReviewSessions[id] = nil
        pendingRemoteSources[id] = nil
        remoteDocumentChanged = false
        documentUpdates[id] = DocumentUpdate(previous: expectedSource, current: text, applied: true, conflict: false)
        saveCurrentDocument(); scheduleDocumentResume()
    }

    /// Apply a retained remote version without another network request. A local
    /// draft is saved in `recoveredDrafts` before replacement so the user can
    /// restore it after inspecting the diff.
    @discardableResult
    func adoptIncomingDocument() -> Bool {
        guard sourceAvailable, let incoming = pendingRemoteSources[documentID] else { return false }
        let id = documentID
        if incoming == source {
            pendingRemoteSources[id] = nil
            remoteDocumentChanged = false
            let previous = originalSources[id] ?? incoming
            originalSources[id] = incoming
            documentUpdates[id] = DocumentUpdate(previous: previous, current: incoming, applied: true, conflict: false)
            documentReview = nil
            documentReviewSessions[id] = nil
            saveCurrentDocument(); scheduleDocumentResume()
            return true
        }
        recoveredDrafts[id] = source
        let previous = source
        comparisonSources[id] = previous
        selection = nil
        source = incoming
        originalSources[id] = incoming
        updateDocumentBytes(Data(incoming.utf8))
        documentReview = nil
        documentReviewSessions[id] = nil
        pendingRemoteSources[id] = nil
        remoteDocumentChanged = false
        documentUpdates[id] = DocumentUpdate(previous: previous, current: incoming, applied: true, conflict: false)
        saveCurrentDocument(); scheduleDocumentResume()
        feedback = "Version du Mac appliquée. Votre brouillon reste récupérable."
        return true
    }
    func refreshDocumentIfNeeded() async {
        guard sourceAvailable, let artifact = viewedArtifact, artifact.fileID != nil,
              !savingDocument, !chat.isPreview else { return }
        let id = documentID, previous = source
        let request = UUID()
        documentRefreshRequests[id] = request
        defer { if documentRefreshRequests[id] == request { documentRefreshRequests[id] = nil } }
        do {
            gallery.invalidate(artifact)
            let data = try await gallery.contents(artifact)
            guard !Task.isCancelled, documentRefreshRequests[id] == request,
                  let text = String(data: data, encoding: .utf8) else { return }
            receiveDocumentVersion(text, for: id, expectedSource: previous)
        } catch {
            if !Task.isCancelled && documentID == id && documentRefreshRequests[id] == request { documentError = "Actualisation impossible : " + error.localizedDescription }
        }
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
            let previous = source
            comparisonSources[id] = previous
            selection = nil; source = text; originalSources[id] = text
            updateDocumentBytes(data); documentReview = nil; documentReviewSessions[id] = nil
            pendingRemoteSources[id] = nil; remoteDocumentChanged = false
            documentUpdates[id] = DocumentUpdate(previous: previous, current: text, applied: true, conflict: false)
            saveCurrentDocument(); scheduleDocumentResume()
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
            if documentID == id {
                updateDocumentBytes(Data(content.utf8)); saveCurrentDocument(); scheduleDocumentResume()
                feedback = artifact.fileID == nil ? "Copie locale enregistrée" : "Enregistré sur le Mac"
            }
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

    func annotationReferences(for ids: [UUID]) -> [AnnotationSendReference] {
        ids.compactMap { id in
            readingNotes.note(id: id).map { AnnotationSendReference(id: id, updatedAt: $0.updatedAt) }
        }
    }

    func annotationReferencesForCurrentChatSend() -> [AnnotationSendReference] {
        guard let quoteID = chat.quote?.id else { return [] }
        return annotationReferencesByQuote[quoteID] ?? []
    }

    func clearAnnotationReferences(for quoteID: UUID?) {
        if let quoteID { annotationReferencesByQuote.removeValue(forKey: quoteID) }
        pendingAnnotationReferences.removeAll()
    }

    /// Remove only the persisted annotation versions that were actually
    /// acknowledged by the gateway. If a note was edited after it was quoted,
    /// `removeIfUnchanged` leaves the newer version in place.
    func consumeAnnotationReferences(_ references: [AnnotationSendReference]) {
        guard !references.isEmpty else { return }
        for reference in references {
            do { _ = try readingNotes.removeIfUnchanged(id: reference.id, updatedAt: reference.updatedAt) }
            catch { documentError = error.localizedDescription }
        }
        let sentReferences = Set(references)
        annotationReferencesByQuote = annotationReferencesByQuote.mapValues { refs in
            // A newer edit of the same note may already be queued in another
            // quote. Remove only the exact id+timestamp version acknowledged
            // by this send.
            refs.filter { !sentReferences.contains($0) }
        }.filter { !$0.value.isEmpty }
    }

    /// Called by the annotation composer only after `chat.send` returned a
    /// positive gateway acknowledgement. It removes the local reading mark and
    /// any PDF overlay belonging to that draft; a failed send never calls it.
    func consumeAnnotationAfterSuccessfulSend(_ draft: AnnotationDraft) {
        if let noteID = draft.readingNoteID {
            if let updatedAt = draft.readingNoteUpdatedAt {
                consumeAnnotationReferences([AnnotationSendReference(id: noteID, updatedAt: updatedAt)])
            }
        } else if let markID = draft.passage.annotationID, let mark = documentPDFMarks.first(where: { $0.id == markID }) {
            do {
                try pdfAnnotations.remove(mark.id)
                if let document = pdfDocument { PDFAnnotations.apply(documentPDFMarks, to: document) }
            } catch { documentError = error.localizedDescription }
        }
        if annotationDraft?.id == draft.id { annotationDraft = nil }
        selection = nil; pdfPassage = nil
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
