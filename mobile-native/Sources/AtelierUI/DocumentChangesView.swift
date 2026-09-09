import SwiftUI

struct DocumentChangeLine: Identifiable {
    enum Kind { case unchanged, added, removed }
    let id: Int
    let text: String
    let kind: Kind

    static func compare(previous: String, current: String) -> [Self] {
        let old = previous.components(separatedBy: "\n")
        let new = current.components(separatedBy: "\n")
        guard previous != current else { return [] }
        // Bound diff work for very large sources; still expose both complete versions.
        guard old.count + new.count < 8000 else {
            return [.init(id: 0, text: previous, kind: .removed), .init(id: 1, text: current, kind: .added)]
        }
        let changes = new.difference(from: old)
        var removals = Set<Int>(), additions = Set<Int>()
        for change in changes {
            switch change {
            case .remove(let offset, _, _): removals.insert(offset)
            case .insert(let offset, _, _): additions.insert(offset)
            }
        }
        var result: [Self] = [], i = 0, j = 0
        func append(_ text: String, _ kind: Kind) { result.append(.init(id: result.count, text: text, kind: kind)) }
        while i < old.count || j < new.count {
            if i < old.count && removals.contains(i) { append(old[i], .removed); i += 1 }
            else if j < new.count && additions.contains(j) { append(new[j], .added); j += 1 }
            else if j < new.count { append(new[j], .unchanged); i += 1; j += 1 }
            else { break }
        }
        return result
    }
}

struct DocumentChangesView: View {
    let previous: String
    let current: String
    let name: String
    @Environment(\.dismiss) private var dismiss
    @State private var lines: [DocumentChangeLine] = []
    var body: some View {
        NavigationStack {
            ScrollView {
                if previous == current {
                    ContentUnavailableView("Aucune modification", systemImage: "checkmark", description: Text("Le texte correspond à la dernière version chargée."))
                } else {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        Text("Comparaison avec la version précédemment chargée sur cet iPhone.")
                            .font(.caption).foregroundStyle(.secondary).padding(.bottom, 12)
                        ForEach(lines) { line in
                            HStack(alignment: .top, spacing: 8) {
                                Text(line.kind == .added ? "+" : line.kind == .removed ? "−" : " ").frame(width: 14)
                                Text(line.text.isEmpty ? " " : line.text)
                                    .strikethrough(line.kind == .removed)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .font(.system(.callout, design: .monospaced))
                            .foregroundStyle(line.kind == .removed ? Color.red : line.kind == .added ? Color.green : Color.primary)
                            .padding(.vertical, 3)
                            .background(line.kind == .removed ? Color.red.opacity(0.08) : line.kind == .added ? Color.green.opacity(0.08) : Color.clear)
                        }
                    }.textSelection(.enabled).padding(16)
                }
            }
            .navigationTitle("Diff · " + name).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fermer") { dismiss() } } }
            .task { lines = DocumentChangeLine.compare(previous: previous, current: current) }
        }
    }
}
