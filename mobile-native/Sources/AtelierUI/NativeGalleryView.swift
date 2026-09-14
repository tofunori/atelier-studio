import SwiftUI
import PDFKit

struct NativeGalleryView: View {
    @Bindable var workspace: WorkspaceModel
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    private var filterState: GalleryFilterState { workspace.galleryFilters[workspace.gallery.selectedProject] ?? GalleryFilterState() }
    private var query: String { filterState.query }
    private var filter: String { filterState.type }
    private func updateFilter(_ change: (inout GalleryFilterState) -> Void) {
        let project = workspace.gallery.selectedProject
        var state = workspace.galleryFilters[project] ?? GalleryFilterState()
        change(&state); workspace.galleryFilters[project] = state
    }
    @State private var showConnection = false
    @State private var opening: UUID?
    @State private var error: String?
    private var items: [GalleryArtifact] {
        (workspace.gallery.localItems.filter { $0.projectID == nil || $0.projectID == workspace.gallery.selectedProject } + workspace.gallery.remoteItems.filter { $0.projectID == workspace.gallery.selectedProject }).filter { filterState.matches($0) }
    }
    private func open(_ item: GalleryArtifact) {
        opening = item.id
        Task {
            defer { opening = nil }
            do { try workspace.openArtifact(item, data: await workspace.gallery.contents(item)) }
            catch { self.error = error.localizedDescription }
        }
    }
    private var projectSelector: some View {
        Group {
            if workspace.gallery.connected {
                Menu {
                    ForEach(workspace.gallery.projects) { project in
                        Button {
                            workspace.gallery.selectedProject = project.id
                            workspace.sidebarPreferences.markOpened(project.id)
                        } label: {
                            if project.id == workspace.gallery.selectedProject { Label(project.name, systemImage: "checkmark") }
                            else { Text(project.name) }
                        }
                    }
                } label: {
                    HStack(spacing: 6) {
                        Text(workspace.gallery.projects.first { $0.id == workspace.gallery.selectedProject }?.name ?? "Projet")
                            .lineLimit(2).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                        Image(systemName: "chevron.up.chevron.down").font(.caption)
                    }.frame(minHeight: 44)
                }.accessibilityLabel("Projet")
                    .accessibilityValue(workspace.gallery.projects.first { $0.id == workspace.gallery.selectedProject }?.name ?? "Aucun")
            } else {
                Button("Connecter le Mac", systemImage: "desktopcomputer") { showConnection = true }
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private var filterActions: some View {
        HStack(spacing: 8) {
            Button("Favoris seulement", systemImage: filterState.favoritesOnly ? "star.fill" : "star") {
                updateFilter { $0.favoritesOnly.toggle() }
            }.labelStyle(.iconOnly).frame(width: 44, height: 44)
                .accessibilityValue(filterState.favoritesOnly ? "Activé" : "Désactivé")
                .foregroundStyle(filterState.favoritesOnly ? AtelierTheme.accent : .primary)
            Button("Filtrer les fichiers", systemImage: "line.3.horizontal.decrease") {
                updateFilter { $0.expanded.toggle() }
            }.labelStyle(.iconOnly).frame(width: 44, height: 44)
                .accessibilityValue(filterState.expanded ? "Déplié" : "Replié")
            Button("Importer un fichier", systemImage: "plus") { workspace.importRequested = true }
                .labelStyle(.iconOnly).frame(width: 44, height: 44)
        }
    }
    private func favoriteButton(_ item: GalleryArtifact) -> some View {
        Button(item.favorite == true ? "Retirer des favoris" : "Ajouter aux favoris",
               systemImage: item.favorite == true ? "star.fill" : "star") {
            Task {
                do { try await workspace.gallery.setFavorite(item, on: item.favorite != true) }
                catch { self.error = error.localizedDescription }
            }
        }.disabled(workspace.gallery.favoriteRequests.contains(item.fileID ?? ""))
            .foregroundStyle(item.favorite == true ? AtelierTheme.accent : .secondary)
    }
    var body: some View {
        @Bindable var gallery = workspace.gallery
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 8) {
                        projectSelector
                        filterActions.frame(maxWidth: .infinity, alignment: .trailing)
                    }
                } else { HStack(spacing: 8) { projectSelector; filterActions } }
                if filterState.expanded {
                    ScrollView(.horizontal) {
                        HStack(spacing: 8) {
                            ForEach(GalleryFilterState.types, id: \.self) { type in
                                Button(type) { updateFilter { $0.type = type } }
                                    .font(.subheadline.weight(.medium)).padding(.horizontal, 14).frame(minHeight: 44)
                                    .background(filter == type ? AtelierTheme.accent.opacity(0.18) : Color.primary.opacity(0.05), in: Capsule())
                                    .foregroundStyle(filter == type ? AtelierTheme.accent : .primary)
                                    .accessibilityAddTraits(filter == type ? .isSelected : [])
                            }
                        }
                    }.scrollIndicators(.hidden)
                }
                Text("\(items.count) fichier\(items.count == 1 ? "" : "s")").font(.caption).foregroundStyle(.secondary)
                if let problem = gallery.error { Text(problem).font(.footnote).foregroundStyle(.red) }
                if gallery.busy { ProgressView("Chargement des artefacts…").frame(maxWidth: .infinity) }
                if items.isEmpty && !gallery.busy {
                    ContentUnavailableView {
                        Label(query.isEmpty ? "Votre galerie" : "Aucun résultat", systemImage: "square.grid.2x2")
                    } description: {
                        Text(!query.isEmpty || filter != "Tous" || filterState.favoritesOnly ? "Aucun fichier ne correspond à votre recherche." : "Retrouvez les fichiers de vos projets ou importez un document.")
                    } actions: {
                        if !query.isEmpty || filter != "Tous" || filterState.favoritesOnly { Button("Réinitialiser la recherche") { updateFilter { $0.query = ""; $0.type = "Tous"; $0.favoritesOnly = false } } }
                        else { Button("Importer", systemImage: "plus") { workspace.importRequested = true }.buttonStyle(.bordered) }
                    }
                }
                LazyVGrid(columns: dynamicTypeSize.isAccessibilitySize ? [GridItem(.flexible())] : [GridItem(.adaptive(minimum: 145), spacing: 12)], spacing: 16) {
                    ForEach(items) { item in
                        VStack(alignment: .leading, spacing: 4) {
                        Button {
                            opening = item.id
                            Task {
                                defer { opening = nil }
                                do { try workspace.openArtifact(item, data: await gallery.contents(item)) }
                                catch { self.error = error.localizedDescription }
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                ArtifactThumbnail(item: item, gallery: gallery)
                                    .frame(height: 145).frame(maxWidth: .infinity)
                                    .background(Color(uiColor: .secondarySystemGroupedBackground))
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                                    .overlay { if opening == item.id { ProgressView().padding().background(.regularMaterial, in: Circle()) } }
                                if !item.supported { Text("Aperçu non disponible").font(.caption2).foregroundStyle(.secondary) }
                            }
                        }.buttonStyle(.plain).disabled(opening != nil || !item.supported)
                        .accessibilityLabel("Ouvrir \(item.name)")
                        .contextMenu {
                            if item.fileID != nil { favoriteButton(item) }
                            Button("Afficher", systemImage: "eye") { open(item) }
                            Button("Joindre au chat", systemImage: "paperclip") { workspace.attachToChat(item) }
                        }
                        HStack(alignment: .top, spacing: 0) {
                            Button { open(item) } label: {
                                Text(item.name).font(.subheadline.weight(.medium)).lineLimit(2)
                                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                            }.buttonStyle(.plain).disabled(opening != nil || !item.supported)
                            if item.fileID != nil {
                                favoriteButton(item).labelStyle(.iconOnly)
                                    .font(.system(size: 16, weight: .regular))
                                    .frame(width: 44, height: 44)
                                    .contentShape(Rectangle()).buttonStyle(.plain)
                            }
                        }
                        Text("\(item.kind) · \(item.fileID == nil ? "Importé" : "Mac")")
                            .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }

            }.padding(16)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .searchable(text: Binding(get: { query }, set: { value in updateFilter { $0.query = value } }), prompt: "Rechercher un fichier")
        .refreshable { await gallery.refresh() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await gallery.refresh() } }
        }
        .task(id: gallery.selectedProject) { await gallery.refresh() }
        .sheet(isPresented: $showConnection) { GalleryConnectionSheet(gallery: gallery) }
        .alert("Action impossible", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK") { error = nil }
        } message: { Text(error ?? "") }
    }
}

struct ArtifactThumbnail: View {
    let item: GalleryArtifact
    let gallery: GalleryModel
    @State private var thumbnail: UIImage?
    @State private var excerpt: String?
    var body: some View {
        Group {
            if let thumbnail {
                Image(uiImage: thumbnail).resizable().scaledToFit().padding(6)
                    .overlay {
                        if let region = item.annotationRegion {
                            GeometryReader { geometry in
                                let ratio = thumbnail.size.width / thumbnail.size.height
                                let width = max(0, min(geometry.size.width - 12, (geometry.size.height - 12) * ratio))
                                let height = width / ratio
                                Rectangle().stroke(AtelierTheme.accent, lineWidth: 2)
                                    .frame(width: region.width * width, height: region.height * height)
                                    .offset(x: (geometry.size.width - width) / 2 + region.x * width, y: (geometry.size.height - height) / 2 + region.y * height)
                            }.allowsHitTesting(false)
                        }
                    }
            }
            else if let excerpt {
                Text(AttributedString(SourceSyntax.attributed(excerpt, name: item.name, size: 8)))
                    .lineLimit(11).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .padding(10).clipped().accessibilityLabel("Aperçu de " + item.name)
            }
            else { Image(systemName: item.kind == "PDF" ? "doc.richtext" : item.kind == "Figures" ? "photo" : "doc.text").font(.largeTitle).foregroundStyle(.secondary) }
        }
        .task(id: item.id) {
            thumbnail = nil; excerpt = nil
            let visual = ["PDF", "Figures"].contains(item.kind)
            guard item.supported else { return }
            if !visual {
                if let text = try? await gallery.previewText(item), !Task.isCancelled { excerpt = String(text.prefix(900)) }
                return
            }
            guard (item.data?.count ?? item.size) < 5 * 1024 * 1024,
                  let data = try? await gallery.contents(item) else { return }
            let image = await ArtifactPreviewRenderer.shared.render(data, pdf: item.kind == "PDF")
            guard !Task.isCancelled else { return }
            thumbnail = image
        }
    }
}

struct GalleryConnectionSheet: View {
    let gallery: GalleryModel
    @Environment(\.dismiss) private var dismiss
    @State private var address = ""
    @State private var code = ""
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    PasteButton(payloadType: String.self) { values in
                        guard let link = values.first else { return }
                        busy = true
                        Task {
                            defer { busy = false }
                            do { try await gallery.connect(link: link); dismiss() }
                            catch { self.error = error.localizedDescription }
                        }
                    }.disabled(busy)
                    Text("Copiez le lien depuis Atelier sur le Mac, puis collez-le ici.").font(.footnote).foregroundStyle(.secondary)
                } header: { Text("Coller le lien du Mac") }
                DisclosureGroup("Saisir l’adresse et le code") {
                    TextField("http://adresse-du-mac:port", text: $address).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    SecureField("Code d’association", text: $code)
                }
                if let error { Text(error).foregroundStyle(.red) }
                Button {
                    busy = true
                    Task {
                        defer { busy = false }
                        do { try await gallery.connect(address: address, code: code); dismiss() }
                        catch { self.error = error.localizedDescription }
                    }
                } label: { if busy { ProgressView() } else { Text("Connecter") } }
                .disabled(busy || address.isEmpty || code.isEmpty)
            }
            .navigationTitle("Connecter le Mac").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() }.disabled(busy) } }
        }.presentationDetents([.medium, .large])
    }
}
