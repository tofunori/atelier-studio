import SwiftUI

struct ConversationProjectGroup: Identifiable {
    let id: String
    let name: String
    let threads: [RemoteChatModel.Thread]

    static let unavailableID = "__unavailable_projects__"
    @MainActor static func groups(threads: [RemoteChatModel.Thread], projects: [GalleryModel.Project], query: String) -> [Self] {
        let names = Dictionary(projects.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
        let grouped = Dictionary(grouping: threads) { thread in
            guard let id = thread.projectId, !id.isEmpty else { return "" }
            return names[id] == nil ? unavailableID : id
        }
        var result = grouped.compactMap { id, threads -> Self? in
            let name = id.isEmpty ? "Sans projet" : id == unavailableID ? "Anciens projets" : names[id] ?? ""
            let matches = threads.filter { query.isEmpty || name.localizedStandardContains(query) || $0.title.localizedStandardContains(query) }
                .sorted { (SidebarProjectPreferences.date($0.updatedAt) ?? .distantPast, $0.id) > (SidebarProjectPreferences.date($1.updatedAt) ?? .distantPast, $1.id) }
            return matches.isEmpty ? nil : Self(id: id, name: name, threads: matches)
        }
        if query.isEmpty {
            for project in projects where grouped[project.id] == nil {
                result.append(Self(id: project.id, name: project.name, threads: []))
            }
        }
        return result.sorted { $0.id.isEmpty ? false : $1.id.isEmpty ? true : $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }
}

struct WorkspaceSidebar: View {
    @Bindable var workspace: WorkspaceModel
    var openSettings: () -> Void
    private var query: String { workspace.sidebarQuery }
    private var collapsed: Set<String> { workspace.sidebarCollapsed }
    @FocusState private var searching: Bool
    @Environment(\.scenePhase) private var scenePhase
    @State private var managingProjects = false
    @State private var expandedHistory: Set<String> = []
    private var groups: [ConversationProjectGroup] {
        let all = ConversationProjectGroup.groups(threads: workspace.chat.conversationThreads, projects: workspace.gallery.projects, query: query)
        return query.isEmpty ? workspace.sidebarPreferences.visible(all) : all
    }
    var body: some View {
        VStack(spacing: 0) {
            GlassEffectContainer(spacing: 8) {
                HStack(spacing: 8) {
                    glassButton("Fermer le menu", symbol: "sidebar.left") { workspace.sidebarRequested = false }
                    Spacer()
                    glassButton("Réglages et apparence", symbol: "gearshape") { workspace.sidebarRequested = false; openSettings() }
                    glassButton("Nouvelle conversation", symbol: "square.and.pencil") {
                        workspace.sidebarRequested = false; workspace.newChatRequested = true
                    }
                }
            }.padding(.horizontal, 12).padding(.top, 12)
            Text("Conversations").font(.title2.weight(.semibold)).kerning(-0.2)
                .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 20).padding(.top, 6).padding(.bottom, 10)
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").font(.subheadline).foregroundStyle(AtelierTheme.tertiaryText)
                TextField("Rechercher", text: $workspace.sidebarQuery).focused($searching)
                    .submitLabel(.search).autocorrectionDisabled()
                if !query.isEmpty { Button("Effacer la recherche", systemImage: "xmark.circle.fill") { workspace.sidebarQuery = "" }.labelStyle(.iconOnly).foregroundStyle(AtelierTheme.tertiaryText) }
            }.font(.subheadline).padding(.horizontal, 10).frame(minHeight: 40)
                .background(AtelierTheme.control, in: RoundedRectangle(cornerRadius: AtelierTheme.cardRadius, style: .continuous))
                .padding(.horizontal, 16).padding(.bottom, 6)
            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(query.isEmpty ? "Projets" : "Résultats · tous les projets")
                        Spacer()
                        Button("Modifier") { searching = false; managingProjects = true }
                            .frame(minHeight: 44)
                            .accessibilityLabel("Gérer les projets affichés")
                    }.font(.caption.weight(.medium)).foregroundStyle(AtelierTheme.secondaryText).padding(.horizontal, 10)
                    ForEach(groups) { group in
                        projectSection(group)
                    }
                    if groups.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(query.isEmpty ? "Aucun projet récent à afficher." : "Aucune conversation trouvée.")
                                .font(.subheadline).foregroundStyle(.secondary)
                            if query.isEmpty { Button("Choisir mes projets") { managingProjects = true }.font(.subheadline) }
                        }.padding(12)
                    }
                    if workspace.chat.loading { ProgressView().padding() }
                    if let error = workspace.chat.error, workspace.chat.threads.isEmpty {
                        Text(error).font(.footnote).foregroundStyle(.secondary).padding(12)
                    }
                }.padding(.horizontal, 10)
            }.scrollDismissesKeyboard(.interactively)
                .refreshable { await workspace.chat.loadCatalog(using: workspace.gallery, refreshProviders: false) }
            Rectangle().fill(AtelierTheme.separator).frame(height: 1)
            macStatus
        }
        .buttonStyle(.plain).foregroundStyle(.primary)
        .background(AtelierTheme.sidebar, in: RoundedRectangle(cornerRadius: 38, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 38, style: .continuous))
        .shadow(color: .black.opacity(0.22), radius: 20, y: 8)
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape) { workspace.sidebarRequested = false }
        .sheet(isPresented: $managingProjects) { SidebarProjectsView(workspace: workspace) }
        .onChange(of: groups.map(\.id), initial: true) { _, ids in
            guard !workspace.sidebarGroupsInitialized, !ids.isEmpty, query.isEmpty else { return }
            workspace.sidebarGroupsInitialized = true
            workspace.sidebarCollapsed = Set(ids.filter { $0 != (workspace.chat.selected?.projectId ?? "") })
        }
        .task(id: scenePhase) {
            guard scenePhase == .active, !workspace.chat.isPreview else { return }
            while !Task.isCancelled {
                await workspace.chat.loadCatalog(using: workspace.gallery, refreshProviders: false)
                do { try await Task.sleep(for: .seconds(8)) }
                catch { return }
            }
        }
    }
    private func glassButton(_ title: String, symbol: String, action: @escaping () -> Void) -> some View {
        Button(title, systemImage: symbol, action: action)
            .labelStyle(.iconOnly).font(.system(size: 17))
            .frame(width: 44, height: 44)
            .atelierGlass(in: Circle(), interactive: true)
    }
    /// Which Mac the conversations come from, in place of a generic profile row.
    private var macStatus: some View {
        let live = workspace.chat.connection == .live
        return HStack(spacing: 8) {
            Circle().fill(live ? AtelierTheme.accent : AtelierTheme.tertiaryText).frame(width: 6, height: 6)
            VStack(alignment: .leading, spacing: 2) {
                Text(workspace.gallery.macHost.map { $0.components(separatedBy: ".").first ?? $0 } ?? "Mac").font(.footnote.weight(.medium)).lineLimit(1)
                Text(workspace.chat.connectionLabel).font(.caption).foregroundStyle(AtelierTheme.secondaryText)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 18)
        .accessibilityElement(children: .combine)
    }
    private func projectSection(_ group: ConversationProjectGroup) -> some View {
        let isExpanded = !collapsed.contains(group.id) || !query.isEmpty
        let threads = query.isEmpty && !expandedHistory.contains(group.id) ? Array(group.threads.prefix(6)) : group.threads
        return VStack(alignment: .leading, spacing: 0) {
            Button {
                if isExpanded { workspace.sidebarCollapsed.insert(group.id) }
                else { workspace.sidebarCollapsed.remove(group.id) }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right").font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(AtelierTheme.tertiaryText).frame(width: 12)
                    Text(group.name).font(.footnote.weight(.semibold)).kerning(-0.1).foregroundStyle(Color.primary.opacity(0.85)).lineLimit(1)
                    Spacer(minLength: 4)
                    if workspace.sidebarPreferences.settings.pinned.contains(group.id) { Image(systemName: "pin.fill").font(.caption2).foregroundStyle(AtelierTheme.tertiaryText) }
                    Text("\(group.threads.count)").font(.caption2.monospacedDigit()).foregroundStyle(AtelierTheme.tertiaryText)
                }.padding(.horizontal, 10).frame(maxWidth: .infinity, minHeight: 40)
                .contentShape(Rectangle())
            }.accessibilityValue(isExpanded ? "Déplié" : "Replié")
            .contextMenu {
                if !group.id.isEmpty && group.id != ConversationProjectGroup.unavailableID {
                    Button(workspace.sidebarPreferences.settings.pinned.contains(group.id) ? "Désépingler" : "Épingler", systemImage: "pin") {
                        workspace.sidebarPreferences.setPinned(group.id, !workspace.sidebarPreferences.settings.pinned.contains(group.id))
                    }
                    Button("Masquer du menu", systemImage: "eye.slash") { workspace.sidebarPreferences.setHidden(group.id, true) }
                }
            }
            if isExpanded {
                VStack(spacing: 0) {
                    ForEach(threads) { thread in
                        conversationRow(thread)
                    }
                    if threads.isEmpty { Text("Aucune conversation").font(.caption).foregroundStyle(AtelierTheme.secondaryText).padding(12) }
                    if query.isEmpty && group.threads.count > 6 {
                        Button(expandedHistory.contains(group.id) ? "Réduire la liste" : "Voir les \(group.threads.count) conversations") {
                            if expandedHistory.contains(group.id) { expandedHistory.remove(group.id) }
                            else { expandedHistory.insert(group.id) }
                        }.font(.caption).foregroundStyle(AtelierTheme.secondaryText).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).padding(.leading, 10)
                    }
                }.padding(.leading, 16).padding(.bottom, 8)
            }
        }
    }
    private func conversationRow(_ thread: RemoteChatModel.Thread) -> some View {
        let selected = workspace.chat.selected?.conversationID == thread.conversationID
        let provider = workspace.chat.providers.first { $0.id == thread.provider }?.label ?? thread.provider.capitalized
        return Button {
            workspace.rememberOpenDocument()
            workspace.chat.select(thread, workspace: workspace)
            workspace.sidebarRequested = false
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(thread.title).font(.subheadline).lineLimit(1).multilineTextAlignment(.leading)
                HStack(spacing: 5) {
                    if thread.status == "running" { Image(systemName: "circle.dotted").foregroundStyle(AtelierTheme.accent) }
                    Text(provider)
                    if thread.status == "running" { Text("· en cours") }
                    else if let date = SidebarProjectPreferences.date(thread.updatedAt) {
                        Text("·")
                        Text(date, format: .dateTime.day().month(.abbreviated).locale(Locale(identifier: "fr_CA")))
                    }
                }.font(.caption).foregroundStyle(AtelierTheme.secondaryText).lineLimit(1)
            }.padding(.vertical, 8).padding(.horizontal, 10).frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                .background(selected ? AtelierTheme.control : .clear, in: RoundedRectangle(cornerRadius: AtelierTheme.controlRadius, style: .continuous))
                .contentShape(Rectangle())
        }.disabled(workspace.chat.sending)
            .accessibilityAddTraits(selected ? .isSelected : [])
    }

}

struct NewConversationView: View {
    @Bindable var workspace: WorkspaceModel
    @Environment(\.dismiss) private var dismiss
    @State private var creating = false
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                Picker("Projet", selection: $workspace.chat.creationProjectID) {
                    Text("Sans projet").tag("")
                    ForEach(workspace.gallery.projects) { Text($0.name).tag($0.id) }
                }
                Section("Choisir l’assistant") {
                    ForEach(workspace.chat.creationProviders) { provider in
                        Button(provider.label) {
                            creating = true
                            Task {
                                defer { creating = false }
                                do {
                                    workspace.rememberOpenDocument()
                                    try await workspace.chat.create(provider: provider, workspace: workspace)
                                    dismiss()
                                } catch { self.error = error.localizedDescription }
                            }
                        }
                    }
                    if workspace.chat.creationProviders.isEmpty { Text("Connectez le Mac pour démarrer une conversation.").foregroundStyle(.secondary) }
                }
                if creating { ProgressView("Création…") }
                if let error { Text(error).foregroundStyle(.red) }
            }.disabled(creating)
                .navigationTitle("Nouvelle conversation").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() }.disabled(creating) } }
                .task {
                    if !workspace.chat.isPreview {
                        await workspace.chat.loadCatalog(using: workspace.gallery)
                    }
                }
        }.presentationDetents([.medium, .large]).interactiveDismissDisabled(creating)
    }
}
