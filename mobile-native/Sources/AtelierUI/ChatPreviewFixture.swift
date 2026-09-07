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
        if ProcessInfo.processInfo.arguments.contains("--activity-fixture") {
            workspace.chat.rows = [.init(id: "activity-user", kind: "user", text: "Compare ces sources et explique les étapes.", turn: "activity")]
            Task { @MainActor in
                @MainActor func event(_ kind: String, _ text: String = "", _ fields: [String: Any] = [:]) {
                    var value = fields; value["kind"] = kind; value["text"] = text
                    value["meta"] = ["turnId": "activity"]
                    workspace.chat.apply(value)
                }
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
        #endif
    }
}
