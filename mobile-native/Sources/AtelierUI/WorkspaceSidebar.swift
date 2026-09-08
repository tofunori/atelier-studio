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
            HStack {
                Text("atelier.").font(.title2.weight(.semibold))
                Spacer()
                Button("Fermer le menu", systemImage: "sidebar.left") { workspace.sidebarRequested = false }
                    .labelStyle(.iconOnly).frame(width: 44, height: 44)
                Button("Nouvelle conversation", systemImage: "square.and.pencil") {
                    workspace.sidebarRequested = false; workspace.newChatRequested = true
                }.labelStyle(.iconOnly).frame(width: 44, height: 44)
            }.padding(.horizontal, 18)
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Rechercher une conversation", text: $workspace.sidebarQuery).focused($searching)
                    .submitLabel(.search).autocorrectionDisabled()
                if !query.isEmpty { Button("Effacer la recherche", systemImage: "xmark.circle.fill") { workspace.sidebarQuery = "" }.labelStyle(.iconOnly) }
            }.padding(12).background(.background, in: RoundedRectangle(cornerRadius: 12)).padding(.horizontal, 18).padding(.bottom, 12)
            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    destination("Chats", symbol: "bubble", section: .chat)
                    destination("Galerie", symbol: "square.grid.2x2", section: .gallery)
                    destination("Articles", symbol: "books.vertical", section: .articles)
                    destination("Calculs", symbol: "chart.bar.xaxis", section: .calculations)
                    HStack {
                        Text(query.isEmpty ? "Projets" : "Résultats · tous les projets").font(.caption.weight(.medium)).foregroundStyle(.secondary)
                        Spacer()
                        Button("Gérer") { searching = false; managingProjects = true }
                            .font(.caption.weight(.medium)).frame(minHeight: 44)
                            .accessibilityLabel("Gérer les projets affichés")
                    }.padding(.top, 12).padding(.horizontal, 12)
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
            Divider()
            Button {
                workspace.sidebarRequested = false; openSettings()
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "person.crop.circle.fill").font(.title)
                    Text("Réglages et apparence").font(.subheadline.weight(.medium))
                    Spacer()
                    Image(systemName: "gearshape")
                }.padding(18).frame(minHeight: 60)
            }
        }
        .buttonStyle(.plain).foregroundStyle(.primary)
        .background(Color(uiColor: .secondarySystemBackground))
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
    private func projectSection(_ group: ConversationProjectGroup) -> some View {
        let isExpanded = !collapsed.contains(group.id) || !query.isEmpty
        let threads = query.isEmpty && !expandedHistory.contains(group.id) ? Array(group.threads.prefix(6)) : group.threads
        return VStack(alignment: .leading, spacing: 0) {
            Button {
                if isExpanded { workspace.sidebarCollapsed.insert(group.id) }
                else { workspace.sidebarCollapsed.remove(group.id) }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: group.id.isEmpty ? "bubble" : group.id == ConversationProjectGroup.unavailableID ? "archivebox" : "folder").font(.subheadline).foregroundStyle(.secondary)
                    Text(group.name).font(.subheadline.weight(.semibold)).lineLimit(1)
                    Spacer(minLength: 4)
                    if workspace.sidebarPreferences.settings.pinned.contains(group.id) { Image(systemName: "pin.fill").font(.caption2).foregroundStyle(.secondary) }
                    Text("\(group.threads.count)").font(.caption2.monospacedDigit()).foregroundStyle(.tertiary)
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right").font(.system(size: 10, weight: .semibold)).foregroundStyle(.secondary)
                }.padding(.horizontal, 12).frame(maxWidth: .infinity, minHeight: 46)
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
                        if thread.id != threads.last?.id { Divider().opacity(0.4).padding(.leading, 14) }
                    }
                    if threads.isEmpty { Text("Aucune conversation").font(.caption).foregroundStyle(.secondary).padding(12) }
                    if query.isEmpty && group.threads.count > 6 {
                        Button(expandedHistory.contains(group.id) ? "Réduire la liste" : "Voir les \(group.threads.count) conversations") {
                            if expandedHistory.contains(group.id) { expandedHistory.remove(group.id) }
                            else { expandedHistory.insert(group.id) }
                        }.font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).padding(.leading, 14)
                    }
                }.padding(.leading, 22).padding(.trailing, 6).padding(.bottom, 10)
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
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 1).fill(selected ? AtelierTheme.accent : .clear).frame(width: 2)
                VStack(alignment: .leading, spacing: 5) {
                    Text(thread.title).font(.subheadline.weight(selected ? .medium : .regular)).lineLimit(2).multilineTextAlignment(.leading)
                    HStack(spacing: 5) {
                        Text(provider)
                        if let date = SidebarProjectPreferences.date(thread.updatedAt) {
                            Text("·")
                            Text(date, format: .dateTime.day().month(.abbreviated).locale(Locale(identifier: "fr_CA")))
                        }
                        if thread.status == "running" { Image(systemName: "circle.dotted"); Text("En cours") }
                    }.font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
            }.padding(.vertical, 11).padding(.horizontal, 10).frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
                .background(selected ? Color.primary.opacity(0.06) : .clear, in: RoundedRectangle(cornerRadius: 9))
        }.disabled(workspace.chat.sending)
            .accessibilityAddTraits(selected ? .isSelected : [])
    }
    private func destination(_ title: String, symbol: String, section: WorkspaceModel.Surface) -> some View {
        Button { workspace.navigate(to: section) } label: {
            HStack(spacing: 14) {
                Image(systemName: symbol).frame(width: 22)
                Text(title).font(.body.weight(.medium))
                Spacer()
                if workspace.activeSection == section { Circle().fill(AtelierTheme.accent).frame(width: 5, height: 5) }
            }.padding(.horizontal, 12).frame(minHeight: 46)
                .background(workspace.activeSection == section ? Color.primary.opacity(0.07) : .clear, in: RoundedRectangle(cornerRadius: 12))
        }
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
