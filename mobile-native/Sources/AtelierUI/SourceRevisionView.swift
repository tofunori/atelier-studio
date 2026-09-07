import SwiftUI

struct SourceRevisionTarget {
    let documentID: UUID
    let threadID: String
    let fileName: String
    let original: String
    let passage: String
    var messageID: String = ""
    static func replacement(in response: String) -> String? {
        guard let start = response.range(of: "```latex\n") ?? response.range(of: "```tex\n"),
              let end = response.range(of: "```", range: start.upperBound..<response.endIndex) else { return nil }
        let result = String(response[start.upperBound..<end.lowerBound]).trimmingCharacters(in: .newlines)
        return result.isEmpty ? nil : result
    }
    func applying(_ replacement: String, to current: String) -> String? {
        guard current == original, let range = current.range(of: passage),
              current.range(of: passage, range: range.upperBound..<current.endIndex) == nil else { return nil }
        var result = current; result.replaceSubrange(range, with: replacement); return result
    }
}

struct SourceRevisionView: View {
    let workspace: WorkspaceModel
    let target: SourceRevisionTarget
    let replacement: String
    @Environment(\.dismiss) private var dismiss
    @State private var applied = false
    private var applicable: Bool { workspace.documentID == target.documentID && target.applying(replacement, to: workspace.source) != nil }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text(target.fileName).font(.caption).foregroundStyle(.secondary)
                    Text("Avant").font(.headline)
                    Text(target.passage).textSelection(.enabled)
                        .padding(14).frame(maxWidth: .infinity, alignment: .leading).background(AtelierTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                    Text("Proposition").font(.headline)
                    Text(replacement).textSelection(.enabled)
                        .padding(14).frame(maxWidth: .infinity, alignment: .leading).background(AtelierTheme.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
                    if !applicable && !applied { Text("Le document a changé ou le passage n’est pas unique. Rouvrez le document et demandez une nouvelle proposition.").foregroundStyle(.secondary) }
                    if let error = workspace.documentError { Text(error).foregroundStyle(.red) }
                }.padding(20)
            }
            .safeAreaInset(edge: .bottom) {
                Button(applied ? "Appliquée au brouillon" : "Appliquer au document", systemImage: "checkmark") {
                    guard let updated = target.applying(replacement, to: workspace.source) else { return }
                    workspace.selection = nil; workspace.source = updated; workspace.saveCurrentDocument(); applied = true
                    workspace.surface = .document; dismiss()
                }.buttonStyle(.borderedProminent).frame(maxWidth: .infinity, minHeight: 44)
                    .disabled(!applicable || applied).padding().background(.background)
            }
            .navigationTitle("Reformulation").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } } }
        }
    }
}
