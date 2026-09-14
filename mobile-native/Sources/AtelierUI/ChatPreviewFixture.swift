import UIKit
import Foundation

@MainActor enum ChatPreviewFixture {
    static let response = #"""
    ## Résultat scientifique

    Un **résultat important**, une *nuance* et une [source](https://example.com).

    L’albédo suit \(\alpha = E_r / E_i\).

    \[
    \Delta F = -\Delta\alpha\, S_{\downarrow}
    \]

    | Région | Albédo |
    | --- | --- |
    | Athabasca | 0,42 |
    | Columbia | 0,51 |

    ```python
    import numpy as np
    albedo = np.array([0.42, 0.51])
    print(albedo.mean())
    ```

    > Un passage à sélectionner pour poser une question.

    1. Comparer les deux régions.
    2. Vérifier les incertitudes.
    """#
    static func install(in workspace: WorkspaceModel) {
        #if targetEnvironment(simulator)
        guard ProcessInfo.processInfo.arguments.contains("--chat-render-fixture") else { return }
        workspace.chat.isPreview = true
        workspace.chat.select(.init(id: "preview-render", title: "Aperçu du rendu", provider: "codex", model: nil, projectId: nil, status: "idle"), workspace: workspace)
        let file = GalleryArtifact(name: "notes.pdf", data: Bundle.module.url(forResource: "notes", withExtension: "pdf").flatMap { try? Data(contentsOf: $0) })
        workspace.chat.historyFiles["preview-render"] = ["preview-message": [file]]
        workspace.chat.rows = [
            .init(id: "preview-user", kind: "user", text: "Explique ce document.\n\nPièces jointes : notes.pdf", turn: "preview-turn", messageID: "preview-message"),
            .init(id: "preview-answer", kind: "text", text: response, turn: "preview-turn")
        ]
        if ProcessInfo.processInfo.arguments.contains("--attachment-polish-fixture") {
            let image = UIGraphicsImageRenderer(size: CGSize(width: 600, height: 400)).image { context in
                UIColor(red: 0.8, green: 0.88, blue: 0.93, alpha: 1).setFill()
                context.fill(CGRect(x: 0, y: 0, width: 600, height: 400))
                let mountain = UIBezierPath()
                mountain.move(to: CGPoint(x: 0, y: 400)); mountain.addLine(to: CGPoint(x: 230, y: 55))
                mountain.addLine(to: CGPoint(x: 600, y: 400)); mountain.close()
                UIColor.white.setFill(); mountain.fill()
                ("Glacier · aperçu" as NSString).draw(at: CGPoint(x: 28, y: 345),
                    withAttributes: [.font: UIFont.systemFont(ofSize: 24), .foregroundColor: UIColor.darkGray])
            }
            let photo = GalleryArtifact(name: "Photo-test.jpg", data: image.jpegData(compressionQuality: 0.9))
            workspace.chat.historyFiles["preview-render"] = ["photo-message": [photo], "document-message": [file]]
            workspace.chat.rows = [
                .init(id: "photo-user", kind: "user", text: "Peux-tu regarder cette image ?\n\nPièces jointes : Photo-test.jpg", turn: "photo-turn", messageID: "photo-message"),
                .init(id: "document-user", kind: "user", text: "\n\nPièces jointes : notes.pdf", turn: "document-turn", messageID: "document-message")
            ]
            workspace.chat.attachments = [photo, file]
            workspace.surface = .chat
        }
        if ProcessInfo.processInfo.arguments.contains("--long-history-fixture") {
            workspace.chat.rows = (0..<1500).flatMap { turn in
                [RemoteChatModel.Row(id: "long-user-\(turn)", kind: "user", text: "Question \(turn + 1)", turn: "long-\(turn)"),
                 RemoteChatModel.Row(id: "long-answer-\(turn)", kind: "text", text: turn % 100 == 99 ? response : "Réponse \(turn + 1). " + String(repeating: "Le glacier réfléchit une partie du rayonnement solaire. ", count: 10), turn: "long-\(turn)")]
            }
            workspace.surface = .chat
        }
        if ProcessInfo.processInfo.arguments.contains("--annotation-card-fixture") {
            let passage = String(repeating: "At the cell level, all 30 fire slopes are negative and have a 95% interval below zero.\n", count: 15)
            let quote = RemoteChatModel.Quote(text: passage, sourceRowID: "document", sourceLabel: "results_en.tex · lignes 30–42")
            workspace.chat.rows = [.init(id: "annotation-card", kind: "user", text: RemoteChatModel.promptWithQuote("Le problème avec les résultats, c’est que ça se lit comme une liste. Peux-tu améliorer l’enchaînement ?", quote: quote), turn: "annotation-card")]
            workspace.surface = .chat
        }
        if ProcessInfo.processInfo.arguments.contains("--document-refresh-fixture") {
            let old = "\\section{Results}\nIndividual summers show larger forcings.\n"
            let updated = "\\section{Results}\n" + String(repeating: "The summer mean reaches $14.31$~W~m$^{-2}$ in 2023, with a melt equivalent of 341 mm w.e. ", count: 5) + "\n"
            let file = GalleryArtifact(name: "results_en.tex", data: Data(old.utf8))
            try? workspace.openArtifact(file, data: Data(old.utf8))
            workspace.receiveDocumentVersion(updated, for: file.id, expectedSource: old)
            workspace.documentMode = .source
            workspace.surface = .document
        }
        if ProcessInfo.processInfo.arguments.contains("--inline-review-fixture") {
            let before = "\\section{Résultats}\n\nNous comparons les estimations entre régions et zones glaciaires.\n\nLe modèle confirme un effet négatif dans toutes les régions.\n\nCet effet est significatif.\n\n\\subsection{Interprétation}\n\nCes résultats démontrent un mécanisme commun.\n"
            let after = before
                .replacingOccurrences(of: "Le modèle confirme un effet négatif dans toutes les régions.", with: "Les estimations centrales sont négatives ; leur incertitude varie selon les régions.")
                .replacingOccurrences(of: "Cet effet est significatif.", with: "L’intervalle recouvre zéro : le sens de cet effet reste incertain.")
                .replacingOccurrences(of: "Ces résultats démontrent un mécanisme commun.", with: "Ces résultats suggèrent une réponse commune, sans établir le mécanisme sous-jacent.")
            let file = GalleryArtifact(name: "results_en.tex", data: Data(before.utf8))
            workspace.gallery.localItems.append(file)
            try? workspace.openArtifact(file, data: Data(before.utf8))
            workspace.receiveDocumentVersion(after, for: file.id, expectedSource: before)
            if let index = workspace.gallery.localItems.firstIndex(where: { $0.id == file.id }) {
                workspace.gallery.localItems[index].data = Data(after.utf8)
            }
            workspace.documentMode = .reading; workspace.surface = .document
        }
        if ProcessInfo.processInfo.arguments.contains("--document-update-review-fixture") {
            let before = "\\section{Résultats}\n\nNous comparons les estimations entre régions.\n\nLe modèle confirme un effet négatif.\n\n\\subsection{Discussion}\n\nLa lecture des intervalles complète celle des estimations centrales.\n"
            let after = before.replacingOccurrences(of: "Le modèle confirme un effet négatif.", with: "L’intervalle recouvre zéro : le sens de cet effet reste incertain.")
            let file = GalleryArtifact(name: "results_en.tex", data: Data(before.utf8))
            try? workspace.openArtifact(file, data: Data(before.utf8))
            if ProcessInfo.processInfo.arguments.contains("--document-conflict-fixture") {
                workspace.source = before + "\nUne précision rédigée sur l’iPhone.\n"
            }
            workspace.receiveDocumentVersion(after, for: file.id, expectedSource: before)
            workspace.documentMode = .reading
            workspace.surface = .document
        }
        if ProcessInfo.processInfo.arguments.contains("--reading-capsule-fixture") {
            let source = String(repeating: "Individual summers show much larger regional forcings: $14.31$~W~m$^{-2}$ in 2023. ", count: 5)
            let prompt = "Voici mes remarques de lecture. Propose des révisions en tenant compte de chaque remarque.\n\nresults_en.tex — lignes 90–100\nCitation :\n" + source + "\n\nSource exacte :\n" + source + "\n\nRemarque :\nVarier reaches."
            workspace.pendingDocumentPrompt = prompt
            workspace.applyPendingDocumentChat()
            workspace.chat.rows = [
                .init(id: "reading-capsule", kind: "user", text: prompt, turn: "reading-capsule"),
                .init(id: "reading-response", kind: "text", text: "Voici la révision :\n\n```latex\n" + source + "\n```", turn: "reading-capsule")
            ]
            workspace.surface = .chat
        }
        if ProcessInfo.processInfo.arguments.contains("--thinking-label-fixture") {
            workspace.chat.running = true
            workspace.surface = .chat
        }
        if ProcessInfo.processInfo.arguments.contains("--connection-dot-fixture") {
            workspace.chat.connection = .reconnecting
            workspace.chat.connectionError = "Le Mac est momentanément injoignable. Reconnexion automatique…"
        }
        if ProcessInfo.processInfo.arguments.contains("--resume-fixture") {
            workspace.chat.resumeStore = nil
            workspace.gallery = GalleryModel(address: URL(string: "http://127.0.0.1:8769")!, token: "local-fixture", session: URLSession(configuration: .ephemeral))
            workspace.chat.isPreview = false
            workspace.chat.select(.init(id: "resume-demo", title: "Retour dans Atelier", provider: "codex", model: nil, projectId: nil, status: "idle"), workspace: workspace)
            workspace.chat.apply(["kind": "user", "text": "Ce fil reste visible quand je change d’app.", "meta": ["eventId": "resume-user", "turnId": "resume-turn"]])
            workspace.chat.apply(["kind": "text", "text": "Le texte déjà reçu reste affiché pendant la reprise de connexion.", "meta": ["eventId": "resume-answer", "turnId": "resume-turn"]])
            workspace.chat.apply(["kind": "done", "meta": ["eventId": "resume-done", "turnId": "resume-turn"]])
            workspace.draft = "Mon brouillon reste ici."
        }
        if ProcessInfo.processInfo.arguments.contains("--figure-contrast-fixture") {
            let renderer = UIGraphicsImageRenderer(size: CGSize(width: 600, height: 400))
            let image = renderer.image { context in
                UIColor(white: 0.96, alpha: 1).setFill(); context.fill(CGRect(x: 0, y: 0, width: 600, height: 400))
                UIColor(white: 0.08, alpha: 1).setFill(); context.fill(CGRect(x: 300, y: 0, width: 300, height: 400))
            }
            if let data = image.pngData() {
                try? workspace.openArtifact(GalleryArtifact(name: "Contraste.png", data: data), data: data)
            }
        }
        if ProcessInfo.processInfo.arguments.contains("--reading-notes-fixture") {
            workspace.readingNotes = DocumentReadingNotes(directory: nil)
            let source = "\\section{Lecture}\n\nLa neige et la neige. Le \\textbf{glacier} reflète la lumière.\n\nCe passage permet de conserver une remarque et de la reprendre dans le chat."
            let file = GalleryArtifact(name: "lecture.tex", data: Data(source.utf8))
            try? workspace.openArtifact(file, data: Data(source.utf8))
            workspace.documentMode = .reading
            workspace.draft = "Mon brouillon conservé."
            if ProcessInfo.processInfo.arguments.contains("--saved-notes-fixture") {
                let range = (source as NSString).range(of: "glacier")
                _ = try? workspace.readingNotes.upsert(documentKey: workspace.readingNoteKey, fileName: file.name,
                    location: "ligne 3", selectedText: "glacier", sourceText: "glacier", sourceRange: range,
                    source: source, note: "Préciser la période de mesure.")
            }
        }
        if ProcessInfo.processInfo.arguments.contains("--pdf-compact-fixture") {
            workspace.pdfAnnotations = PDFAnnotations(directory: nil)
            if let data = WorkspaceModel.initialPDFData {
                try? workspace.openArtifact(GalleryArtifact(name: "notes.pdf", data: data), data: data)
                workspace.documentMode = .pdf
                if let page = workspace.pdfDocument?.page(at: 0), let raw = page.string,
                   let selection = page.selection(for: NSRange(location: 0, length: min(90, raw.utf16.count))) {
                    let passage = DocumentPassage(documentID: workspace.documentID, fileName: "notes.pdf", location: "page 1", text: selection.string ?? "", regions: selection.selectionsByLine().map { .init(pageIndex: 0, bounds: $0.bounds(for: page)) })
                    workspace.annotationDraft = AnnotationDraft(passage: passage)
                }
            }
        }
        if ProcessInfo.processInfo.arguments.contains("--scientific-notes-fixture") {
            workspace.readingNotes = DocumentReadingNotes(directory: nil)
            let source = "\\subsection*{Darkening is concentrated in three regions and seven summers}\n\nThree regions account for 61% of the cumulative attributable darkening: the Mackenzie and Selwyn Mountains (27%), Northern Alaska (18%) and the Northern Rocky Mountains (16%).\n\nThese shares refer to the full study period, rather than an individual summer."
            let file = GalleryArtifact(name: "results_en.tex", data: Data(source.utf8))
            try? workspace.openArtifact(file, data: Data(source.utf8))
            workspace.documentMode = .reading
            for (text, note) in [("the Mackenzie and Selwyn Mountains (27%), Northern Alaska (18%) and the Northern Rocky Mountains (16%)", "Préciser la période de référence."), ("These shares refer to the full study period", "")] {
                let range = (source as NSString).range(of: text)
                _ = try? workspace.readingNotes.upsert(documentKey: workspace.readingNoteKey, fileName: file.name, location: "lignes 88–90", selectedText: text, sourceText: text, sourceRange: range, source: source, note: note)
            }
            if let note = workspace.documentReadingNotes.first { workspace.annotationDraft = workspace.readingDraft(for: note) }
        }
        if ProcessInfo.processInfo.arguments.contains("--queue-fixture") {
            workspace.chat.providers = [.init(id: "codex", label: "Codex", models: ["GPT-6-Astra"], defaultModel: "GPT-6-Astra", efforts: [], ok: true, modelLabels: nil, capabilities: .init(permissionModes: ["default", "bypassPermissions"], steering: true))]
            workspace.chat.running = true
            workspace.draft = "Ajoute les incertitudes à cette comparaison."
            workspace.chat.enqueue(workspace: workspace)
            workspace.draft = "Présente ensuite les sources."
            workspace.chat.enqueue(workspace: workspace)
            workspace.draft = "Mon brouillon conservé."
        }
        if ProcessInfo.processInfo.arguments.contains("--tool-detail-fixture") {
            workspace.chat.rows = [.init(id: "tools-user", kind: "user", text: "Vérifie les sources du bilan d’énergie.", turn: "tools")]
            let events: [[String: Any]] = [
                ["kind":"tool", "name":"__thinking"],
                ["kind":"tool_update", "id":"search", "name":"web_search", "input":["query":"glacier surface energy balance"], "status":"completed", "output":"Deux sources trouvées."],
                ["kind":"tool_update", "id":"read", "name":"read_file", "input":["path":"notes/bilan-energie.md"], "status":"completed", "output":"Le bilan comprend le rayonnement net et les flux turbulents."],
                ["kind":"tool_update", "id":"cmd", "name":"Bash", "detail":"rg -n 'albedo' manuscript/main.tex", "status":"completed", "output":"42: albedo", "exitCode":0],
                ["kind":"tool_update", "id":"edit", "name":"apply_patch", "input":["path":"manuscript/main.tex"], "status":"running"]
            ]
            for (index, event) in events.enumerated() {
                var value = event; value["meta"] = ["turnId":"tools", "eventId":"tools-\(index)"]
                workspace.chat.apply(value)
            }
            workspace.chat.apply(["kind":"started", "meta":["turnId":"tools"]])
            workspace.chat.activityDisclosure["preview-render:tool:tools:search"] = true
            if ProcessInfo.processInfo.arguments.contains("--tool-box-fixture") {
                if let index = workspace.chat.rows.firstIndex(where: { $0.toolName == "Bash" }) {
                    workspace.chat.rows[index].detail = (1...100).map { "ligne \($0): let résultat = analyser(glacier: \"Peyto\", année: 2014, conserverLesDétails: true)" }.joined(separator: "\n")
                    workspace.chat.activityDisclosure["preview-render:tool:tools:search:detail:" + workspace.chat.rows[index].id] = true
                }
            }
        }
        if ProcessInfo.processInfo.arguments.contains("--activity-fixture") {
            workspace.chat.rows = [.init(id: "activity-user", kind: "user", text: "Compare ces sources et explique les étapes.", turn: "activity")]
            Task { @MainActor in
                @MainActor func event(_ kind: String, _ text: String = "", _ fields: [String: Any] = [:]) {
                    var value = fields; value["kind"] = kind; value["text"] = text
                    value["meta"] = ["turnId": "activity"]
                    workspace.chat.apply(value)
                }
                event("started")
                try? await Task.sleep(for: .seconds(5))
                event("tool", "", ["name": "__thinking"])
                try? await Task.sleep(for: .seconds(3))
                event("thinking_delta", "Je repère les sources pertinentes, puis je compare leurs résultats.")
                try? await Task.sleep(for: .seconds(8))
                event("thinking", "Je repère les sources pertinentes, puis je compare leurs résultats.")
                event("tool_update", "Recherche des sources", ["id":"search", "name":"web_search", "status":"inProgress", "input":["query":"glacier albedo"]])
                try? await Task.sleep(for: .seconds(12))
                event("tool_update", "Deux sources trouvées", ["id":"search", "name":"web_search", "status":"completed", "output":"Source A : méthode et période.\nSource B : résultats et limites."])
                event("tool_update", "Lecture des résultats", ["id":"read", "name":"read_file", "status":"inProgress", "input":["path":"notes.md"]])
                try? await Task.sleep(for: .seconds(10))
                event("tool_update", "Lecture terminée", ["id":"read", "name":"read_file", "status":"completed", "output":"La période et la méthode diffèrent entre les deux sources. Vérifier avant de comparer."])
                let answer = "Les deux sources décrivent la même question, mais couvrent des périodes différentes.\n\n**La comparaison demande donc de distinguer les méthodes.** La première source mesure directement le phénomène; la seconde en propose une estimation.\n\nIl faut conserver cette nuance dans le texte avant de rapprocher leurs résultats."
                for word in answer.split(separator: " ", omittingEmptySubsequences: false) {
                    event("delta", String(word) + " ")
                    try? await Task.sleep(for: .milliseconds(140))
                }
                event("text", answer)
                event("done")
            }
        }
        if ProcessInfo.processInfo.arguments.contains("--quiet-chat-fixture") {
            workspace.chat.providers = [.init(id: "codex", label: "Codex", models: ["GPT-6-Astra"], defaultModel: "GPT-6-Astra", efforts: ["low", "medium", "high"], ok: true, modelLabels: nil, capabilities: .init(permissionModes: ["default", "acceptEdits", "bypassPermissions"]))]
            workspace.chat.model = "GPT-6-Astra"
            workspace.chat.rows = [
                .init(id: "quiet-previous", kind: "text", text: "Seule sonde-nas apparaît dans le suivi. Il faut y rattacher le pilote pour le rendre visible.", turn: "previous"),
                .init(id: "quiet-user", kind: "user", text: "oui", turn: "quiet"),
                .init(id: "quiet-comment", kind: "text", text: "Je rattache le pilote au suivi, puis je vérifie qu’il apparaît dans Calculs.", turn: "quiet"),
                .init(id: "quiet-tool", kind: "tool", text: "Vérification du suivi", turn: "quiet", detail: "Le pilote est visible dans Calculs. La requête existante est conservée.", toolName: "read_file", toolStatus: "completed"),
                .init(id: "quiet-final", kind: "text", text: "Il apparaît maintenant dans **Calculs → NAS** sous « Copernicus — Peyto / Haig — janvier 2014 », avec l’état **En cours**.\n\nLa requête Copernicus existante a bien été conservée.", turn: "quiet")
            ]
        }
        if ProcessInfo.processInfo.arguments.contains("--scroll-fixture") {
            workspace.chat.rows = (1...12).flatMap { index in
                [RemoteChatModel.Row(id: "scroll-user-\(index)", kind: "user", text: "Passage \(index)", turn: "scroll-\(index)"),
                 .init(id: "scroll-text-\(index)", kind: "text", text: "## Passage \(index)\n\n" + response, turn: "scroll-\(index)")]
            }
            workspace.chat.rows.append(.init(id: "scroll-end", kind: "text", text: "**Fin du fil.**", turn: "scroll-end"))
            workspace.chat.bookmarks["preview-render"] = ChatBookmark(rowID: nil, followsTail: false, offsetY: 0, contentHeight: 0)
            if ProcessInfo.processInfo.arguments.contains("--scroll-stream-fixture") {
                workspace.chat.running = true
                workspace.chat.rows[workspace.chat.rows.count - 1].isStreaming = true
                Task { @MainActor in
                    try? await Task.sleep(for: .seconds(15))
                    for index in 1...80 {
                        guard workspace.chat.isPreview else { return }
                        workspace.chat.rows[workspace.chat.rows.count - 1].text += "\n\nSuite du texte \(index) : la position reste au bas pendant que cette réponse s’allonge."
                        try? await Task.sleep(for: .milliseconds(350))
                    }
                    workspace.chat.rows[workspace.chat.rows.count - 1].text += "\n\n**Dernière ligne — réponse terminée.**"
                    workspace.chat.rows[workspace.chat.rows.count - 1].isStreaming = false
                    workspace.chat.running = false
                }
            }
        }
        if ProcessInfo.processInfo.arguments.contains("--arrival-fixture") {
            workspace.chat.bookmarks["preview-render"] = ChatBookmark(rowID: nil, followsTail: true)
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(4))
                workspace.chat.rows.append(.init(id: "arrival-user", kind: "user", text: "Ajoute une réponse progressivement.", turn: "arrival"))
                workspace.chat.running = true
                try? await Task.sleep(for: .seconds(1))
                workspace.chat.rows.append(.init(id: "arrival-text", kind: "text", text: "", turn: "arrival", isStreaming: true))
                let fragments = ("## Nouvelle réponse\n\n" + response + "\n\n" + response).components(separatedBy: " ")
                for fragment in fragments {
                    guard workspace.chat.isPreview else { return }
                    if let index = workspace.chat.rows.firstIndex(where: { $0.id == "arrival-text" }) {
                        workspace.chat.rows[index].text += fragment + " "
                    }
                    try? await Task.sleep(for: .milliseconds(120))
                }
                if let index = workspace.chat.rows.firstIndex(where: { $0.id == "arrival-text" }) { workspace.chat.rows[index].isStreaming = false }
                workspace.chat.running = false
            }
        }
        if ProcessInfo.processInfo.arguments.contains("--send-scroll-fixture") {
            workspace.chat.resumeStore = nil
            workspace.gallery = GalleryModel(address: URL(string: "http://127.0.0.1:8769")!, token: "local-fixture", session: URLSession(configuration: .ephemeral))
            workspace.chat.providers = [.init(id: "codex", label: "Codex", models: ["test"], defaultModel: "test", efforts: [], ok: true, modelLabels: nil, capabilities: .init(permissionModes: ["default", "bypassPermissions"]))]
            workspace.chat.model = "test"
            workspace.chat.isPreview = false
            workspace.chat.reconnect()
        }
        #endif
    }
}
