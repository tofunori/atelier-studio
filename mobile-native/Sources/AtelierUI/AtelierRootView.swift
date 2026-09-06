import SwiftUI
import UniformTypeIdentifiers

public struct AtelierRootView: View {
    @State private var workspace = WorkspaceModel(resumeStore: ChatResumeStore.live())
    @AppStorage("atelier.lastTab") private var lastTab = "chat"
    @State private var restoredTab = false
    @State private var showAbout = false
    @State private var importError: String?
    @State private var connecting = false
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.horizontalSizeClass) private var sizeClass

    public init() {}

    public var body: some View {
        workbench
        .tint(.orange)
        .onChange(of: workspace.surface) { _, surface in
            lastTab = surface == .chat ? "chat" : "gallery"
        }
        .task {
            let desiredTab = lastTab
            if !ProcessInfo.processInfo.arguments.contains("--chat-render-fixture") { await workspace.chat.restore(workspace: workspace) }
            if !restoredTab {
                restoredTab = true
                workspace.surface = desiredTab == "gallery" ? .gallery : .chat
            }
            #if targetEnvironment(simulator)
            let arguments = ProcessInfo.processInfo.arguments
            if let index = arguments.firstIndex(of: "--pair-link"), arguments.indices.contains(index + 1) {
                await connect(arguments[index + 1])
            }
            #endif
            ChatPreviewFixture.install(in: workspace)
        }
        .onChange(of: workspace.gallery.selectedProject) { _, project in
            workspace.chat.galleryProjectID = project; workspace.chat.scheduleSave()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { Task { await workspace.chat.flushResume() } }
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
            defer { workspace.importToChat = false }
            do {
                try workspace.importDocument(at: result.get())
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
                        Text("Les conversations sont transmises au Mac. Les éditions et surlignages des documents restent en mémoire sur cet appareil.")
                    }
                    Section("À venir") {
                        Text("Sauvegarde des documents et compilation LaTeX sur le Mac.")
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
        } catch { importError = error.localizedDescription }
    }

    @ViewBuilder private var workbench: some View {
        if sizeClass == .regular {
            NavigationStack {
                HStack(spacing: 0) {
                    NativeChatView(workspace: workspace)
                        .frame(maxWidth: .infinity)
                    Divider()
                    Group {
                        if workspace.surface == .gallery || workspace.viewedArtifact == nil { NativeGalleryView(workspace: workspace) }
                        else { NativeDocumentView(workspace: workspace) }
                    }
                        .frame(maxWidth: .infinity)
                }
                .navigationTitle(workspace.chat.title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { workspaceToolbar }
            }
        } else {
            TabView(selection: Binding(get: { workspace.surface == .chat ? WorkspaceModel.Surface.chat : .gallery }, set: { workspace.surface = $0 })) {
                Tab("Chats", systemImage: "bubble", value: WorkspaceModel.Surface.chat) {
                    NavigationStack {
                        NativeChatView(workspace: workspace)
                            .navigationTitle(workspace.chat.title)
                            .navigationBarTitleDisplayMode(.inline)
                            .toolbar { workspaceToolbar }
                    }
                }
                Tab("Galerie", systemImage: "square.grid.2x2", value: WorkspaceModel.Surface.gallery) {
                    NavigationStack {
                        NativeGalleryView(workspace: workspace)
                            .navigationDestination(isPresented: Binding(get: { workspace.surface == .document }, set: { if !$0 && workspace.surface == .document { workspace.surface = .gallery } })) {
                                NativeDocumentView(workspace: workspace)
                                    .navigationTitle(workspace.currentName)
                                    .navigationBarTitleDisplayMode(.inline)
                                    .toolbar { ToolbarItem(placement: .topBarTrailing) {
                                        Button("Chat", systemImage: "bubble") { workspace.surface = .chat }
                                    } }
                            }
                            .navigationTitle("Galerie")
                            .navigationBarTitleDisplayMode(.inline)
                            .toolbar { workspaceToolbar }
                    }
                }

            }
        }
    }

    @ToolbarContentBuilder private var workspaceToolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) { documentMenu }
    }

    private var documentMenu: some View {
        Menu {
            Button { workspace.surface = .gallery } label: { Label("Galerie", systemImage: "square.grid.2x2") }
            Button { workspace.importRequested = true } label: { Label("Importer un fichier", systemImage: "folder") }
            Button { showAbout = true } label: { Label("À propos du prototype", systemImage: "info.circle") }
        } label: { Image(systemName: "ellipsis") }
        .accessibilityLabel("Options d’Atelier")
    }

}

#Preview("Atelier natif") {
    AtelierRootView()
}
