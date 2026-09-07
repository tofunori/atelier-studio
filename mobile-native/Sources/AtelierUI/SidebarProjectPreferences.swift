import SwiftUI

@MainActor @Observable final class SidebarProjectPreferences {
    struct Settings: Codable {
        var pinned: Set<String> = []
        var hidden: Set<String> = []
        var recentOnly = true
        var sortByName = false
        var showUnassigned = true
        var showUnavailable = false
        var opened: [String: Date] = [:]
    }
    var settings: Settings { didSet { save() } }
    @ObservationIgnored private let defaults: UserDefaults
    private static let key = "atelier.sidebar.projects.v1"
    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        settings = defaults.data(forKey: Self.key).flatMap { try? JSONDecoder().decode(Settings.self, from: $0) } ?? Settings()
    }
    private func save() {
        if let data = try? JSONEncoder().encode(settings) { defaults.set(data, forKey: Self.key) }
    }
    func markOpened(_ id: String?) {
        guard let id, !id.isEmpty else { return }
        settings.opened[id] = Date()
    }
    func setPinned(_ id: String, _ pinned: Bool) {
        if pinned { settings.pinned.insert(id); settings.hidden.remove(id) }
        else { settings.pinned.remove(id) }
    }
    func setHidden(_ id: String, _ hidden: Bool) {
        if hidden { settings.hidden.insert(id); settings.pinned.remove(id) }
        else { settings.hidden.remove(id) }
    }
    func visible(_ groups: [ConversationProjectGroup], now: Date = .now) -> [ConversationProjectGroup] {
        let activityDates = Dictionary(groups.map { ($0.id, activity($0)) }, uniquingKeysWith: max)
        let projects = groups.filter { !$0.id.isEmpty && $0.id != ConversationProjectGroup.unavailableID && !settings.hidden.contains($0.id) }
        let ranked = projects.sorted {
            let left = activityDates[$0.id] ?? .distantPast, right = activityDates[$1.id] ?? .distantPast
            if settings.sortByName || left == right { return $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            return left > right
        }
        let pinned = ranked.filter { settings.pinned.contains($0.id) }
        let eligible = ranked.filter { !settings.pinned.contains($0.id) && (!settings.recentOnly || (activityDates[$0.id] ?? .distantPast) >= now.addingTimeInterval(-30 * 86_400)) }
        let recent = settings.recentOnly ? Array(eligible.sorted { (activityDates[$0.id] ?? .distantPast) > (activityDates[$1.id] ?? .distantPast) }.prefix(5)) : eligible
        let orderedRecent = settings.sortByName ? recent.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending } : recent
        let other = groups.filter { ($0.id.isEmpty && settings.showUnassigned) || ($0.id == ConversationProjectGroup.unavailableID && settings.showUnavailable) }
        return pinned + orderedRecent + other
    }
    func activity(_ group: ConversationProjectGroup) -> Date {
        max(settings.opened[group.id] ?? .distantPast, group.threads.compactMap { Self.date($0.updatedAt) }.max() ?? .distantPast)
    }
    nonisolated static func date(_ string: String?) -> Date? {
        guard let string else { return nil }
        return (try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(string))
            ?? (try? Date.ISO8601FormatStyle().parse(string))
    }
}

struct SidebarProjectsView: View {
    @Bindable var workspace: WorkspaceModel
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    private var groups: [ConversationProjectGroup] {
        ConversationProjectGroup.groups(threads: workspace.chat.conversationThreads, projects: workspace.gallery.projects, query: "")
    }
    var body: some View {
        @Bindable var preferences = workspace.sidebarPreferences
        NavigationStack {
            List {
                Section {
                    Toggle("Projets récents seulement", isOn: $preferences.settings.recentOnly)
                    Picker("Trier par", selection: $preferences.settings.sortByName) {
                        Text("Activité récente").tag(false)
                        Text("Nom").tag(true)
                    }
                } footer: {
                    Text(preferences.settings.recentOnly ? "Les cinq projets actifs des 30 derniers jours, plus vos projets épinglés. Les projets masqués restent accessibles dans la galerie et la recherche." : "Tous les projets non masqués, avec vos projets épinglés en premier. Les projets masqués restent accessibles dans la galerie et la recherche.")
                }
                Section("Vos projets") {
                    ForEach(workspace.gallery.projects.filter { query.isEmpty || $0.name.localizedStandardContains(query) }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }) { project in
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(project.name).font(.body)
                                let count = groups.first { $0.id == project.id }?.threads.count ?? 0
                                Text("\(count) conversation\(count == 1 ? "" : "s")").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Menu {
                                Button(preferences.settings.pinned.contains(project.id) ? "Désépingler" : "Épingler", systemImage: "pin") {
                                    preferences.setPinned(project.id, !preferences.settings.pinned.contains(project.id))
                                }
                                Button(preferences.settings.hidden.contains(project.id) ? "Réafficher" : "Masquer", systemImage: preferences.settings.hidden.contains(project.id) ? "eye" : "eye.slash") {
                                    preferences.setHidden(project.id, !preferences.settings.hidden.contains(project.id))
                                }
                            } label: {
                                Label(preferences.settings.hidden.contains(project.id) ? "Masqué" : preferences.settings.pinned.contains(project.id) ? "Épinglé" : "Automatique", systemImage: "chevron.up.chevron.down")
                                    .font(.caption).frame(minHeight: 44)
                            }.accessibilityLabel("Affichage de \(project.name)")
                        }
                    }
                }
                Section("Autres conversations") {
                    Toggle("Sans projet", isOn: $preferences.settings.showUnassigned)
                    Toggle("Anciens projets indisponibles", isOn: $preferences.settings.showUnavailable)
                }
            }.searchable(text: $query, prompt: "Trouver un projet")
                .navigationTitle("Projets du menu").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Terminé") { dismiss() } } }
        }
    }
}
