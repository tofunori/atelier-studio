import SwiftUI
import UniformTypeIdentifiers

public struct AtelierRootView: View {
    @State private var workspace = WorkspaceModel()
    @State private var isWorking = false
    @State private var showAbout = false
    @State private var importError: String?
    @State private var connecting = false
    @Environment(\.horizontalSizeClass) private var sizeClass

    public init() {}

    public var body: some View {
        Group {
            if isWorking { workbench } else { home }
        }
        .tint(.orange)
        .task {
            #if targetEnvironment(simulator)
            let arguments = ProcessInfo.processInfo.arguments
            if let index = arguments.firstIndex(of: "--pair-link"), arguments.indices.contains(index + 1) {
                await connect(arguments[index + 1])
            }
            #endif
        }
        .onOpenURL { url in
            Task { await connect(url.absoluteString) }
        }
        .overlay {
            if connecting {
                ProgressView("Connexion au Mac…")
                    .padding(24).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
            }
        }
        .fileImporter(isPresented: $workspace.importRequested, allowedContentTypes: [.pdf, .image, .plainText, UTType(filenameExtension: "tex") ?? .text]) { result in
            do {
                try workspace.importDocument(at: result.get())
                isWorking = true
            } catch { importError = error.localizedDescription }
        }
        .alert("Ouverture impossible", isPresented: Binding(get: { importError != nil }, set: { if !$0 { importError = nil } })) {
            Button("OK") { importError = nil }
        } message: { Text(importError ?? "") }
        .sheet(isPresented: $showAbout) {
            NavigationStack {
                Form {
                    Section("Prototype SwiftUI") {
                        Text("Interface native iPhone et iPad, lecteur PDFKit et source LaTeX.")
                        Text("Les documents ouverts, les annotations et les messages restent en mémoire. Les fichiers originaux ne sont pas modifiés.")
                    }
                    Section("À connecter") {
                        Text("Reprise des conversations, sauvegarde des documents et compilation sur le Mac.")
                    }
                }
                .navigationTitle("À propos")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fermer") { showAbout = false } } }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private func connect(_ link: String) async {
        connecting = true
        defer { connecting = false }
        do {
            try await workspace.gallery.connect(link: link)
            workspace.surface = .gallery
            isWorking = true
        } catch { importError = error.localizedDescription }
    }

    private var home: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Reprendre le fil.").font(.largeTitle.weight(.semibold))
                        Text("Vos idées, vos documents.\nAu même endroit.").foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 20)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                }
                Section("Dernier espace ouvert") {
                    Button {
                        workspace.surface = .chat
                        isWorking = true
                    } label: {
                        Label {
                            VStack(alignment: .leading, spacing: 5) {
                                Text("Carnet de recherche").foregroundStyle(.primary)
                                Text("Relecture et notes de travail").font(.subheadline).foregroundStyle(.secondary)
                            }
                        } icon: { Image(systemName: "book.closed").foregroundStyle(.orange) }
                        .padding(.vertical, 8)
                    }
                    .accessibilityIdentifier("resumeWorkspace")
                }
                Section("À portée de main") {
                    Button {
                        workspace.surface = .document
                        isWorking = true
                    } label: { Label(workspace.currentName, systemImage: "doc.text") }
                    .accessibilityIdentifier("openDocument")
                }
                Section {
                    Text(workspace.gallery.connected ? "Galerie connectée au Mac · chat local" : "Démonstration locale · aucun envoi au Mac")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Atelier")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { documentMenu } }
        }
    }

    @ViewBuilder private var workbench: some View {
        if sizeClass == .regular {
            NavigationStack {
                HStack(spacing: 0) {
                    NativeChatView(workspace: workspace)
                        .frame(maxWidth: .infinity)
                    Divider()
                    Group {
                        if workspace.surface == .gallery { NativeGalleryView(workspace: workspace) }
                        else { NativeDocumentView(workspace: workspace) }
                    }
                        .frame(maxWidth: .infinity)
                }
                .navigationTitle("Carnet de recherche")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { workspaceToolbar }
            }
        } else {
            TabView(selection: $workspace.surface) {
                Tab("Chat", systemImage: "bubble", value: WorkspaceModel.Surface.chat) {
                    NavigationStack {
                        NativeChatView(workspace: workspace)
                            .navigationTitle("Carnet de recherche")
                            .navigationBarTitleDisplayMode(.inline)
                            .toolbar { workspaceToolbar }
                    }
                }
                Tab("Galerie", systemImage: "square.grid.2x2", value: WorkspaceModel.Surface.gallery) {
                    NavigationStack {
                        NativeGalleryView(workspace: workspace)
                            .navigationTitle("Galerie")
                            .navigationBarTitleDisplayMode(.inline)
                            .toolbar { workspaceToolbar }
                    }
                }
                Tab("Document", systemImage: "doc.text", value: WorkspaceModel.Surface.document) {
                    NavigationStack {
                        NativeDocumentView(workspace: workspace)
                            .navigationTitle(workspace.currentName)
                            .navigationBarTitleDisplayMode(.inline)
                            .toolbar { workspaceToolbar }
                    }
                }
            }
        }
    }

    @ToolbarContentBuilder private var workspaceToolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button { isWorking = false } label: { Image(systemName: "chevron.left") }
                .accessibilityLabel("Retour à l’accueil")
        }
        ToolbarItem(placement: .topBarTrailing) { documentMenu }
    }

    private var documentMenu: some View {
        Menu {
            Button { workspace.surface = .gallery; isWorking = true } label: { Label("Galerie", systemImage: "square.grid.2x2") }
            Button { workspace.importRequested = true } label: { Label("Importer un fichier", systemImage: "folder") }
            Button { showAbout = true } label: { Label("À propos du prototype", systemImage: "info.circle") }
        } label: { Image(systemName: "ellipsis") }
        .accessibilityLabel("Options du document")
    }

}

#Preview("Atelier natif") {
    AtelierRootView()
}
