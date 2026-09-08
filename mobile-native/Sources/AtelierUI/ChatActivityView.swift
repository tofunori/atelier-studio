import SwiftUI

struct ChatTimelineItem: Identifiable {
    var rows: [RemoteChatModel.Row]
    var activityID: String? = nil
    var awaitingActivity = false
    var id: String { activityID ?? rows[0].id }
    var isActivity: Bool { rows[0].generatedImageEventID == nil && Self.activityKinds.contains(rows[0].kind) }
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
    static func splitForScrolling(_ items: [Self]) -> (history: [Self], tail: [Self]) {
        // Keep the latest exchange materialized: a lazy offscreen tail can have
        // a valid estimated bottom while none of its content is actually drawn.
        let start = items.lastIndex(where: { $0.rows.first?.kind == "user" }) ?? max(0, items.count - 1)
        return (Array(items.prefix(start)), Array(items.dropFirst(start)))
    }
    /// Display-only waiting state shares the cell identity of the next activity group.
    static func displayItems(_ rows: [RemoteChatModel.Row], running: Bool) -> [Self] {
        var items = group(rows)
        var preceding = "start"
        var segment = 0
        for index in items.indices {
            if items[index].isActivity {
                items[index].activityID = "activity:" + preceding + ":\(segment)"
                segment += 1
            } else { preceding = items[index].id; segment = 0 }
        }
        if running && (items.isEmpty || (items.last?.isActivity == false && items.last?.rows.last?.isStreaming != true)) {
            let marker = RemoteChatModel.Row(id: "awaiting:" + preceding, kind: "thinking", text: "", turn: rows.last?.turn ?? "")
            items.append(Self(rows: [marker], activityID: "activity:" + preceding + ":0", awaitingActivity: true))
        }
        return items
    }
    static func group(_ rows: [RemoteChatModel.Row]) -> [Self] {
        var items: [Self] = []
        for row in rows {
            if row.kind == "text" && row.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { continue }
            if ChatActivityPresentation(row: row, turnRunning: false).isEmptyThinkingMarker { continue }
            if row.generatedImageEventID == nil, activityKinds.contains(row.kind), let last = items.indices.last, items[last].isActivity, items[last].rows.last?.turn == row.turn {
                items[last].rows.append(row)
            } else { items.append(Self(rows: [row])) }
        }
        return items
    }
}

struct ChatActivityPresentation {
    let row: RemoteChatModel.Row
    let turnRunning: Bool
    static func current(in rows: [RemoteChatModel.Row], active: Bool) -> RemoteChatModel.Row? {
        // The provider sends completed summary headings alongside the growing thought.
        // Prefer that newest heading while its body is still streaming.
        if let last = rows.last, last.toolName == "__thinking-step", !last.detail.isEmpty { return last }
        return rows.last(where: { Self(row: $0, turnRunning: active).inProgress }) ?? rows.last
    }
    var failed: Bool { ["failed", "error"].contains(row.toolStatus.lowercased()) }
    var completed: Bool { ["completed", "success", "succeeded"].contains(row.toolStatus.lowercased()) }
    var interrupted: Bool { ["cancelled", "canceled", "interrupted"].contains(row.toolStatus.lowercased()) }
    var isEmptyThinkingMarker: Bool {
        let noContent = row.detail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && row.changes.isEmpty
        return noContent && ((row.kind == "thinking" && row.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            || (["__thinking", "__thinking-step"].contains(row.toolName) && (row.text == row.toolName || row.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)))
    }
    var hasDetails: Bool { !row.detail.isEmpty || !row.text.isEmpty || !row.changes.isEmpty }
    var inProgress: Bool { turnRunning && (row.isStreaming || ["inprogress", "in_progress", "running", "pending"].contains(row.toolStatus.lowercased())) }
    var category: (title: String, symbol: String) {
        if row.toolName == "__steered" || row.text == "__steered" { return ("Steered", "arrow.turn.up.right") }
        if row.kind == "interaction" { return (row.resolved ? "Confirmation traitée" : "Votre accord est nécessaire", "hand.raised") }
        if row.kind == "thinking" || row.toolName.hasPrefix("__thinking") { return ("Réflexion", "sparkle") }
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
        if row.toolName == "__steered" || row.text == "__steered" { return "Steered" }
        if row.kind == "thinking" { return row.text }
        if let path = row.changes.first?.path { return "Modification de " + path + (row.changes.count > 1 ? " (+\(row.changes.count - 1))" : "") }
        let fields = row.toolFields ?? [:]
        for key in ["command", "input", "arguments"] {
            guard let raw = fields[key] else { continue }
            if let data = raw.data(using: .utf8), let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                for parameter in ["command", "cmd", "file_path", "path", "query", "q", "url", "description"] {
                    if let value = object[parameter] as? String, !value.isEmpty { return action(value) }
                }
            } else if !raw.isEmpty { return action(raw) }
        }
        if let detail = fields["detail"], !detail.isEmpty { return action(detail) }
        if !row.text.isEmpty && row.text != row.toolName && !["tool", "tool_update", "edit"].contains(row.text) { return row.text }
        if !row.detail.isEmpty { return action(row.detail) }
        return category.title == "Outil" && !row.toolName.isEmpty ? row.toolName : category.title
    }
    private func action(_ value: String) -> String {
        if category.title == "Modification", let file = value.components(separatedBy: "\n").first(where: {
            $0.hasPrefix("*** Update File: ") || $0.hasPrefix("*** Add File: ") || $0.hasPrefix("*** Delete File: ")
        }), let separator = file.range(of: ": ") { return "Modification de " + file[separator.upperBound...] }
        let first = value.split(separator: "\n", omittingEmptySubsequences: true).first.map(String.init) ?? value
        switch category.title {
        case "Lecture": return "Lecture de " + first
        case "Recherche": return "Recherche · " + first
        case "Modification": return "Modification · " + first
        default: return first
        }
    }
}

struct ChatActivityView: View {
    let rows: [RemoteChatModel.Row]
    let active: Bool
    let workspace: WorkspaceModel
    var onInspect: () -> Void = {}
    var disclosureID: String? = nil
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @AppStorage("atelier.motion") private var motion = "native"
    @AppStorage("atelier.activityExpanded") private var defaultExpanded = false
    @State private var answering = false
    private var reduceMotion: Bool { systemReduceMotion || motion == "off" }
    private var key: String { "\(workspace.chat.selected?.id ?? ""):\(disclosureID ?? rows.first?.id ?? "")" }
    private var legacyKey: String { "\(workspace.chat.selected?.id ?? ""):\(rows.first?.id ?? "")" }
    private var expanded: Bool { workspace.chat.activityDisclosure[key] ?? workspace.chat.activityDisclosure[legacyKey] ?? defaultExpanded }
    private var pending: [RemoteChatModel.Row] { rows.filter { $0.kind == "interaction" && !$0.resolved } }
    private var current: RemoteChatModel.Row? {
        ChatActivityPresentation.current(in: rows, active: active)
    }
    private var label: String {
        if !pending.isEmpty { return "Votre accord est nécessaire" }
        if rows.contains(where: { ChatActivityPresentation(row: $0, turnRunning: active).failed }) && !active { return "Activité terminée avec une erreur" }
        if let current {
            let presentation = ChatActivityPresentation(row: current, turnRunning: active)
            if presentation.failed { return presentation.summary + " · échec" }
            if presentation.interrupted { return presentation.summary + " · interrompue" }
            return presentation.summary
        }
        return active ? "Thinking" : "Activité terminée"
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if rows.isEmpty {
                activityHeader
            } else {
                Button {
                    onInspect()
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { workspace.chat.activityDisclosure[key] = !expanded }
                } label: { activityHeader }
                    .buttonStyle(.plain).accessibilityValue(expanded ? "Déplié" : "Replié")
                    .accessibilityHint("Déplier ou replier les étapes dans le fil")
            }
            if expanded && !rows.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(rows.filter { $0.kind != "interaction" || $0.resolved }) { row in
                        activityStep(row)
                    }
                }.padding(.bottom, 6)
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
    private var activityHeader: some View {
                HStack(spacing: 9) {
                    Image(systemName: !pending.isEmpty ? "hand.raised" : current.map { ChatActivityPresentation(row: $0, turnRunning: active).category.symbol } ?? "sparkle")
                        .font(.subheadline).frame(width: 20)
                    ChatActivityLabel(text: label, active: active && pending.isEmpty && workspace.surface == .chat)
                        .contentTransition(.opacity)
                        .animation(reduceMotion ? nil : .easeInOut(duration: 0.16), value: current?.id)
                    if rows.count > 1 { Text("\(rows.count) étapes").font(.subheadline).foregroundStyle(.secondary) }
                    if !rows.isEmpty {
                        Image(systemName: "chevron.right").font(.system(size: 12, weight: .medium))
                            .rotationEffect(.degrees(expanded ? 90 : 0)).opacity(0.6)
                    }
                }.font(.body).foregroundStyle(.secondary)
                    .frame(minHeight: 44, alignment: .leading).contentShape(Rectangle())
    }
    private func activityStep(_ row: RemoteChatModel.Row) -> some View {
        let presentation = ChatActivityPresentation(row: row, turnRunning: active)
        let detailKey = key + ":detail:" + row.id
        let detailsOpen = workspace.chat.activityDisclosure[detailKey] ?? workspace.chat.activityDisclosure[legacyKey + ":detail:" + row.id] ?? false
        return VStack(alignment: .leading, spacing: 6) {
            Button {
                onInspect()
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { workspace.chat.activityDisclosure[detailKey] = !detailsOpen }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: presentation.failed ? "exclamationmark.circle" : presentation.category.symbol)
                        .font(.subheadline).frame(width: 20)
                    Text(presentation.summary).font(.body).lineLimit(1).truncationMode(.tail)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if presentation.inProgress { ProgressView().controlSize(.mini) }
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .medium))
                        .rotationEffect(.degrees(detailsOpen ? 90 : 0))
                }.foregroundStyle(presentation.failed ? Color.orange : Color.secondary)
                    .frame(minHeight: 44).contentShape(Rectangle())
            }.buttonStyle(.plain)
                .accessibilityLabel(presentation.summary)
                .accessibilityValue(presentation.state + (detailsOpen ? ", déplié" : ", replié"))
            if detailsOpen {
                VStack(alignment: .leading, spacing: 12) {
                    Text(presentation.category.title)
                        .font(.subheadline).foregroundStyle(.secondary)
                    ScrollView([.vertical, .horizontal]) {
                        VStack(alignment: .leading, spacing: 12) {
                            if !row.text.isEmpty && row.text != row.toolName && !["tool", "tool_update", "edit"].contains(row.text) {
                                Text(row.text == "__steered" ? "Steered" : row.text)
                            }
                            if !row.detail.isEmpty {
                                Text(row.detail)
                            } else if row.text == row.toolName || row.text.isEmpty {
                                Text("Aucun détail transmis pour cette étape.").foregroundStyle(.secondary)
                            }
                        }
                        .font(.system(.subheadline, design: .monospaced))
                        .fixedSize(horizontal: true, vertical: true)
                        .textSelection(.enabled)
                        .padding(.bottom, 6)
                    }
                    .frame(height: 240)
                    .scrollBounceBehavior(.basedOnSize)
                    .accessibilityLabel("Détails de l’outil, zone défilante")
                    Text(presentation.state)
                        .font(.caption).foregroundStyle(presentation.failed ? Color.orange : Color.secondary)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
                .padding(16)
                .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18))
                .padding(.bottom, 12)
            }
        }
    }

    private func answer(_ row: RemoteChatModel.Row, allow: Bool) {
        answering = true
        Task { await workspace.chat.answer(row, allow: allow, using: workspace.gallery); answering = false }
    }
}

/// Shared typography and illumination for waiting, thinking summaries and tools.
struct ChatActivityLabel: View {
    let text: String
    let active: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("atelier.motion") private var motion = "native"
    static let sweepDuration = 1.05
    var body: some View {
        Text(text).font(.body).lineLimit(1).multilineTextAlignment(.leading)
            .foregroundStyle(.secondary)
            .overlay {
                if active && !reduceMotion && motion != "off" && scenePhase == .active {
                    TimelineView(.animation(minimumInterval: 1.0 / 30)) { context in
                        let phase = context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: Self.sweepDuration) / Self.sweepDuration
                        GeometryReader { geometry in
                            LinearGradient(colors: [.clear, .primary.opacity(0.85), .clear], startPoint: .leading, endPoint: .trailing)
                                .frame(width: geometry.size.width * 0.7)
                                .offset(x: geometry.size.width * (phase * 1.7 - 0.7))
                        }
                    }.mask(Text(text).font(.body).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading))
                        .accessibilityHidden(true)
                }
            }
    }
}
