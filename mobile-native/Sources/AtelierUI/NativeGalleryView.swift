import SwiftUI
import PDFKit

struct NativeGalleryView: View {
    @Bindable var workspace: WorkspaceModel
    @State private var query = ""
    @State private var filter = "Tous"
    @State private var showConnection = false
    @State private var opening: UUID?
    @State private var error: String?
    private var items: [GalleryArtifact] {
        (workspace.gallery.localItems + workspace.gallery.remoteItems).filter {
            (filter == "Tous" || $0.kind == filter) && (query.isEmpty || $0.name.localizedStandardContains(query))
        }
    }
    var body: some View {
        @Bindable var gallery = workspace.gallery
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    if gallery.connected {
                        Picker("Projet", selection: $gallery.selectedProject) {
                            ForEach(gallery.projects) { Text($0.name).tag($0.id) }
                        }.labelsHidden()
                    } else {
                        Button("Connecter le Mac", systemImage: "desktopcomputer") { showConnection = true }
                    }
                    Spacer()
                    Menu {
                        Picker("Type", selection: $filter) {
                            ForEach(["Tous", "PDF", "Figures", "LaTeX", "Texte"], id: \.self) { Text($0) }
                        }
                        Button("Actualiser", systemImage: "arrow.clockwise") { Task { await gallery.refresh() } }
                        Button("Importer un fichier", systemImage: "folder") { workspace.importRequested = true }
                        Button("Connexion au Mac", systemImage: "network") { showConnection = true }
                    } label: { Image(systemName: "line.3.horizontal.decrease") }
                    .accessibilityLabel("Filtrer et importer")
                }
                if let problem = gallery.error { Text(problem).font(.footnote).foregroundStyle(.red) }
                if gallery.busy { ProgressView("Chargement des artefacts…").frame(maxWidth: .infinity) }
                if items.isEmpty && !gallery.busy {
                    ContentUnavailableView {
                        Label(query.isEmpty ? "Votre galerie" : "Aucun résultat", systemImage: "square.grid.2x2")
                    } description: {
                        Text("Connectez votre Mac pour retrouver les artefacts de vos projets, ou importez un PDF, une figure ou un fichier LaTeX.")
                    } actions: {
                        Button("Importer", systemImage: "plus") { workspace.importRequested = true }.buttonStyle(.bordered)
                    }
                }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 145), spacing: 12)], spacing: 16) {
                    ForEach(items) { item in
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
                                Text(item.name).font(.subheadline.weight(.medium)).lineLimit(2).foregroundStyle(.primary)
                                Text("\(item.kind) · \(item.fileID == nil ? "Importé" : "Mac")")
                                    .font(.caption).foregroundStyle(.secondary)
                                if !item.supported { Text("Aperçu non disponible").font(.caption2).foregroundStyle(.secondary) }
                            }
                        }.buttonStyle(.plain).disabled(opening != nil || !item.supported)
                        .accessibilityLabel("Ouvrir \(item.name)")
                    }
                }
                Text("Les fichiers ouverts restent en mémoire dans cet aperçu. Les originaux sur le Mac ne sont pas modifiés.")
                    .font(.caption).foregroundStyle(.secondary)
            }.padding(16)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .searchable(text: $query, prompt: "Rechercher un artefact")
        .refreshable { await gallery.refresh() }
        .task(id: gallery.selectedProject) { await gallery.refresh() }
        .sheet(isPresented: $showConnection) { GalleryConnectionSheet(gallery: gallery) }
        .alert("Ouverture impossible", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK") { error = nil }
        } message: { Text(error ?? "") }
    }
}

private struct ArtifactThumbnail: View {
    let item: GalleryArtifact
    let gallery: GalleryModel
    @State private var thumbnail: UIImage?
    var body: some View {
        Group {
            if let thumbnail { Image(uiImage: thumbnail).resizable().scaledToFit().padding(6) }
            else { Image(systemName: item.kind == "PDF" ? "doc.richtext" : item.kind == "Figures" ? "photo" : "doc.text").font(.largeTitle).foregroundStyle(.secondary) }
        }
        .task(id: item.id) {
            guard ["PDF", "Figures"].contains(item.kind), item.size < 5 * 1024 * 1024,
                  let data = try? await gallery.contents(item) else { return }
            if item.kind == "PDF" {
                thumbnail = PDFDocument(data: data)?.page(at: 0)?.thumbnail(of: CGSize(width: 300, height: 300), for: .cropBox)
            } else { thumbnail = UIImage(data: data) }
        }
    }
}

private struct GalleryConnectionSheet: View {
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
                Section {
                    TextField("http://adresse-du-mac:port", text: $address).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    SecureField("Code d’association", text: $code)
                } header: { Text("Passerelle Atelier") } footer: { Text("Utilisez l’adresse et le code affichés par Atelier sur votre Mac. Pour une adresse Tailscale en .ts.net, utilisez HTTPS ; sinon utilisez son IP. La connexion est conservée dans le trousseau iOS.") }
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
