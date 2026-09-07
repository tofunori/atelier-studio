import SwiftUI

struct ChatTimelineItem: Identifiable {
    var rows: [RemoteChatModel.Row]
    var id: String { rows[0].id }
    var isActivity: Bool { Self.activityKinds.contains(rows[0].kind) }
    static let activityKinds: Set<String> = ["thinking", "tool", "tool_update", "edit", "interaction"]
    static func finalTextIDs(in rows: [RemoteChatModel.Row]) -> Set<String> {
        var result: Set<String> = []
        var lastByTurn: [String: String] = [:]
        for row in rows {
            if row.kind == "user" { result.formUnion(lastByTurn.values); lastByTurn = [:] }
            else if row.kind == "text" { lastByTurn[row.turn] = row.id }
        }
        result.formUnion(lastByTurn.values)
        return result
    }
    static func group(_ rows: [RemoteChatModel.Row]) -> [Self] {
        var items: [Self] = []
        for row in rows {
            if activityKinds.contains(row.kind), let last = items.indices.last, items[last].isActivity, items[last].rows.last?.turn == row.turn {
                items[last].rows.append(row)
            } else { items.append(Self(rows: [row])) }
        }
        return items
    }
}

struct ChatActivityPresentation {
    let row: RemoteChatModel.Row
    let turnRunning: Bool
    var failed: Bool { ["failed", "error"].contains(row.toolStatus.lowercased()) }
    var completed: Bool { ["completed", "success", "succeeded"].contains(row.toolStatus.lowercased()) }
    var interrupted: Bool { ["cancelled", "canceled", "interrupted"].contains(row.toolStatus.lowercased()) }
    var hasDetails: Bool { !row.detail.isEmpty || row.text.count > 180 || row.text != summary }
    var inProgress: Bool { turnRunning && (row.isStreaming || ["inprogress", "in_progress", "running", "pending"].contains(row.toolStatus.lowercased())) }
    var category: (title: String, symbol: String) {
        if row.kind == "interaction" { return (row.resolved ? "Confirmation traitée" : "Votre accord est nécessaire", "hand.raised") }
        if row.kind == "thinking" { return ("Réflexion", "sparkle") }
        let name = (row.toolName.isEmpty ? row.text : row.toolName).lowercased()
        if name.contains("search") || name.contains("recherche") { return ("Recherche", "magnifyingglass") }
        if name.contains("read") || name.contains("lecture") || name.contains("open") || name.contains("scrape") { return ("Lecture", "doc.text") }
        if row.kind == "edit" || name.contains("edit") || name.contains("patch") || name.contains("write") { return ("Modification", "pencil.line") }
        if name.contains("exec") || name.contains("bash") || name.contains("shell") || name.contains("command") { return ("Commande", "terminal") }
        if name.contains("image") { return ("Image", "photo") }
        if name.contains("wait") || name.contains("sleep") { return ("Attente", "clock") }
        return ("Outil", "wrench.and.screwdriver")
    }
    var state: String {
        if row.kind == "interaction" { return row.resolved ? "Traitée" : "À confirmer" }
        if failed { return "Échec" }
        if completed { return "Terminé" }
        if inProgress { return "En cours" }
        if interrupted { return "Interrompu" }
        return turnRunning ? "Étape reçue" : "Activité terminée"
    }
    var summary: String {
        if row.kind == "thinking" { return row.text }
        return row.toolName.isEmpty ? row.text : row.toolName
    }
}

struct ChatActivityView: View {
    let rows: [RemoteChatModel.Row]
    let active: Bool
    let workspace: WorkspaceModel
    var onInspect: () -> Void = {}
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @AppStorage("atelier.motion") private var motion = "native"
    @AppStorage("atelier.activityExpanded") private var defaultExpanded = false
    @State private var answering = false
    private var reduceMotion: Bool { systemReduceMotion || motion == "off" }
    private var key: String { "\(workspace.chat.selected?.id ?? ""):\(rows.first?.id ?? "")" }
    private var expanded: Bool { workspace.chat.activityDisclosure[key] ?? defaultExpanded }
    private var pending: [RemoteChatModel.Row] { rows.filter { $0.kind == "interaction" && !$0.resolved } }
    private var current: RemoteChatModel.Row? {
        rows.last(where: { ChatActivityPresentation(row: $0, turnRunning: active).inProgress }) ?? rows.last
    }
    private var label: String {
        if !pending.isEmpty { return "Votre accord est nécessaire" }
        if rows.contains(where: { ChatActivityPresentation(row: $0, turnRunning: active).failed }) && !active { return "Activité terminée avec une erreur" }
        if active, let current {
            let presentation = ChatActivityPresentation(row: current, turnRunning: active)
            if presentation.failed { return presentation.category.title + " · échec" }
            if presentation.interrupted { return presentation.category.title + " · interrompue" }
            return presentation.category.title + (presentation.completed ? " terminée" : " en cours")
        }
        return "Activité terminée"
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                onInspect()
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { workspace.chat.activityDisclosure[key] = !expanded }
            } label: {
                HStack(spacing: 9) {
                    Image(systemName: !pending.isEmpty ? "hand.raised" : current.map { ChatActivityPresentation(row: $0, turnRunning: active).category.symbol } ?? "sparkle")
                        .frame(width: 17)
                        .symbolEffect(.pulse, options: .repeating, isActive: active && pending.isEmpty && !reduceMotion && motion == "native")
                    Text(label).lineLimit(2).multilineTextAlignment(.leading)
                    if rows.count > 1 { Text("\(rows.count) étapes").font(.caption2).foregroundStyle(.tertiary) }
                    Image(systemName: "chevron.right").font(.system(size: 9, weight: .semibold))
                        .rotationEffect(.degrees(expanded ? 90 : 0)).opacity(0.6)
                }.font(.caption).foregroundStyle(.secondary)
                    .frame(minHeight: 44, alignment: .leading).contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityValue(expanded ? "Déplié" : "Replié")
                .accessibilityHint("Déplier ou replier les étapes dans le fil")
            if expanded {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(rows.filter { $0.kind != "interaction" || $0.resolved }) { row in
                        activityStep(row)
                    }
                }.padding(.leading, 26).padding(.bottom, 6)
                    .overlay(alignment: .leading) { Rectangle().fill(.secondary.opacity(0.18)).frame(width: 1).padding(.leading, 8) }
            }
            ForEach(pending) { row in
                VStack(alignment: .leading, spacing: 8) {
                    Text(row.text).font(.subheadline)
                    if !row.detail.isEmpty { Text(row.detail).font(.system(.caption, design: .monospaced)).foregroundStyle(.secondary).textSelection(.enabled) }
                    if row.approval && row.requestId != nil {
                        HStack(spacing: 16) {
                            Button("Autoriser une fois") { answer(row, allow: true) }.buttonStyle(.bordered)
                            Button("Refuser") { answer(row, allow: false) }.foregroundStyle(.secondary)
                            if answering { ProgressView().controlSize(.mini) }
                        }.font(.caption).disabled(answering)
                    } else { Text("À confirmer sur le Mac").font(.caption).foregroundStyle(.secondary) }
                }
            }
        }
    }
    private func activityStep(_ row: RemoteChatModel.Row) -> some View {
        let presentation = ChatActivityPresentation(row: row, turnRunning: active)
        let detailKey = key + ":detail:" + row.id
        let detailsOpen = workspace.chat.activityDisclosure[detailKey] ?? false
        return VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: presentation.failed ? "exclamationmark.circle" : presentation.category.symbol).frame(width: 14)
                Text(presentation.category.title).fontWeight(.medium)
                Spacer(minLength: 4)
                Text(presentation.state).font(.caption2).foregroundStyle(.secondary)
            }.font(.caption).foregroundStyle(presentation.failed ? Color.orange : Color.secondary)
            Text(presentation.summary).font(.caption).foregroundStyle(.secondary).lineLimit(detailsOpen ? nil : 3).textSelection(.enabled)
            if presentation.hasDetails {
                Button {
                    onInspect()
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { workspace.chat.activityDisclosure[detailKey] = !detailsOpen }
                } label: {
                    Label(detailsOpen ? "Replier le détail" : "Voir le détail", systemImage: detailsOpen ? "chevron.up" : "chevron.down")
                        .font(.caption2).frame(minHeight: 32)
                }.buttonStyle(.plain).foregroundStyle(.secondary)
                if detailsOpen {
                    if row.kind != "thinking" && row.text != presentation.summary { Text(row.text).font(.caption).textSelection(.enabled) }
                    if !row.detail.isEmpty {
                        Text(row.detail).font(.system(.caption, design: .monospaced)).foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled)
                    }
                }
            }
        }
    }
    private func answer(_ row: RemoteChatModel.Row, allow: Bool) {
        answering = true
        Task { await workspace.chat.answer(row, allow: allow, using: workspace.gallery); answering = false }
    }
}
