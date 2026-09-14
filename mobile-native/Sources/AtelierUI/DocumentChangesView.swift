import SwiftUI

struct DocumentChangeLine: Identifiable, Sendable {
    enum Kind: Sendable { case unchanged, added, removed }
    let id: Int
    let text: String
    let kind: Kind
    var oldLine: Int? = nil
    var newLine: Int? = nil

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
        func append(_ text: String, _ kind: Kind) {
            result.append(.init(id: result.count, text: text, kind: kind,
                                oldLine: kind == .added ? nil : i + 1,
                                newLine: kind == .removed ? nil : j + 1))
        }
        while i < old.count || j < new.count {
            if i < old.count && removals.contains(i) { append(old[i], .removed); i += 1 }
            else if j < new.count && additions.contains(j) { append(new[j], .added); j += 1 }
            else if j < new.count { append(new[j], .unchanged); i += 1; j += 1 }
            else { break }
        }
        return result
    }
}

struct DocumentChangeHunk: Identifiable, Sendable {
    let id: Int
    let lines: [DocumentChangeLine]
    let currentLine: Int

    static func group(_ lines: [DocumentChangeLine], context: Int = 2) -> [Self] {
        var windows: [Range<Int>] = []
        for index in lines.indices where lines[index].kind != .unchanged {
            let window = max(0, index - context)..<min(lines.count, index + context + 1)
            if let last = windows.last, last.upperBound >= window.lowerBound {
                windows[windows.count - 1] = last.lowerBound..<window.upperBound
            } else { windows.append(window) }
        }
        return windows.enumerated().map { offset, window in
            let slice = Array(lines[window])
            let changed = slice.first { $0.kind != .unchanged }
            let anchor = slice.first { $0.kind == .added }?.newLine
                ?? changed.flatMap { change in lines.dropFirst(change.id).first { $0.newLine != nil }?.newLine }
                ?? lines.last { $0.newLine != nil }?.newLine ?? 1
            return Self(id: offset, lines: slice, currentLine: anchor)
        }
    }
    var addedCount: Int { lines.filter { $0.kind == .added }.count }
    var removedCount: Int { lines.filter { $0.kind == .removed }.count }
}

struct DocumentChangesView: View {
    let previous: String
    let current: String
    let name: String
    var explanation = "Version précédente → Version actuelle"
    var useMacVersion: (() -> Void)? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var lines: [DocumentChangeLine] = []
    @State private var loading = true
    var body: some View {
        NavigationStack {
            ScrollView {
                if loading {
                    ProgressView("Comparaison…").frame(maxWidth: .infinity).padding(30)
                } else if previous == current {
                    ContentUnavailableView("Aucune modification", systemImage: "checkmark", description: Text("Le texte correspond à la dernière version chargée."))
                } else {
                    LazyVStack(alignment: .leading, spacing: 18) {
                        VStack(alignment: .leading, spacing: 6) {
                            Label(name, systemImage: "doc.text").font(.headline)
                            Text(explanation).font(.caption).foregroundStyle(.secondary)
                            if useMacVersion != nil {
                                Text("Votre brouillon iPhone est conservé. Vous pouvez consulter les différences avant de choisir la version du Mac.")
                                    .font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                        ForEach(DocumentChangeHunk.group(lines)) { hunk in
                            VStack(alignment: .leading, spacing: 0) {
                                HStack {
                                    Text("Passage \(hunk.id + 1) · ligne \(hunk.currentLine)")
                                    Spacer(minLength: 8)
                                    Text("−\(hunk.removedCount)  +\(hunk.addedCount)").monospacedDigit()
                                }.font(.caption.weight(.medium)).foregroundStyle(.secondary).padding(12)
                                Divider()
                                ForEach(hunk.lines) { line in changeRow(line) }
                            }
                            .background(AtelierTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            .overlay { RoundedRectangle(cornerRadius: 14).strokeBorder(.primary.opacity(0.09)) }
                        }
                    }.textSelection(.enabled).padding(16)
                }
            }
            .navigationTitle("Modifications").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fermer") { dismiss() } } }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 8) {
                    if let useMacVersion {
                        Button("Utiliser la version du Mac") { useMacVersion(); dismiss() }
                            .buttonStyle(.borderedProminent).frame(minHeight: 44)
                    }
                    Button("Revenir au document") { dismiss() }.frame(maxWidth: .infinity, minHeight: 44)
                }.padding(.horizontal, 16).background(.bar)
            }
            .task(id: previous + "\u{0}" + current) {
                loading = true
                let result = await Task.detached(priority: .userInitiated) {
                    DocumentChangeLine.compare(previous: previous, current: current)
                }.value
                guard !Task.isCancelled else { return }
                lines = result; loading = false
            }
        }
    }
    private func changeRow(_ line: DocumentChangeLine) -> some View {
        HStack(alignment: .top, spacing: 9) {
            Text((line.newLine ?? line.oldLine).map(String.init) ?? "")
                .font(.caption2.monospacedDigit()).foregroundStyle(.secondary).frame(width: 28, alignment: .trailing)
            VStack(alignment: .leading, spacing: 4) {
                if line.kind != .unchanged {
                    Label(line.kind == .added ? "Ajouté" : "Supprimé", systemImage: line.kind == .added ? "plus.circle.fill" : "minus.circle.fill")
                        .font(.caption.weight(.medium)).foregroundStyle(line.kind == .added ? Color.green : Color.red)
                }
                Text(line.text.isEmpty ? " " : line.text)
                    .font(.system(.callout, design: .monospaced))
                    .foregroundStyle(line.kind == .unchanged ? Color.secondary : Color.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }.padding(.vertical, 9).padding(.horizontal, 10)
            .background(line.kind == .removed ? Color.red.opacity(0.12) : line.kind == .added ? Color.green.opacity(0.12) : Color.clear)
    }
}
