import SwiftUI
import UniformTypeIdentifiers

public struct AtelierRootView: View {
    @State private var workspace = WorkspaceModel(resumeStore: ChatResumeStore.live())
    @AppStorage("atelier.lastTab") private var lastTab = "chat"
    @State private var restoredTab = false
    @State private var showAbout = false
    @AppStorage("atelier.appearance") private var appearance = "system"
    @State private var importError: String?
    @State private var connecting = false
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.horizontalSizeClass) private var sizeClass

    public init() {}

    private var connectedWorkbench: some View {
        workbench
        .tint(AtelierTheme.accent)
        .preferredColorScheme(appearance == "dark" ? .dark : appearance == "light" ? .light : nil)
        .onChange(of: workspace.surface) { _, surface in
            if surface == .chat { lastTab = "chat" }
            else if surface == .articles || (surface == .document && workspace.documentOrigin == .articles) { lastTab = "articles" }
            else { lastTab = "gallery" }
        }
        .task { await initialize() }
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
    }

    public var body: some View {
        connectedWorkbench
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
            AtelierSettingsView()
        }
    }

    private func initialize() async {
            let desiredTab = lastTab
            if !ProcessInfo.processInfo.arguments.contains("--chat-render-fixture") { await workspace.chat.restore(workspace: workspace) }
            if !restoredTab {
                restoredTab = true
                workspace.surface = desiredTab == "articles" ? .articles : desiredTab == "gallery" ? .gallery : .chat
            }
            #if targetEnvironment(simulator)
            let arguments = ProcessInfo.processInfo.arguments
            if let index = arguments.firstIndex(of: "--pair-link"), arguments.indices.contains(index + 1) {
                await connect(arguments[index + 1])
            }
            #endif
            ChatPreviewFixture.install(in: workspace)
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
            HStack(spacing: 0) {
                NavigationStack {
                    NativeChatView(workspace: workspace)
                        .navigationTitle(workspace.chat.title).navigationBarTitleDisplayMode(.inline)
                }.frame(minWidth: 300, idealWidth: 360, maxWidth: 420)
                Divider()
                NavigationStack {
                    Group {
                        if workspace.surface == .articles { NativeLibraryView(workspace: workspace) }
                        else if workspace.surface == .document { NativeDocumentView(workspace: workspace) }
                        else { NativeGalleryView(workspace: workspace) }
                    }
                    .navigationTitle(workspace.surface == .articles ? "Articles" : workspace.surface == .document ? workspace.currentName : "Galerie")
                    .navigationBarTitleDisplayMode(.inline).toolbar { workspaceToolbar }
                }.frame(maxWidth: .infinity)
            }
        } else {
            TabView(selection: Binding(get: { workspace.surface == .document ? workspace.documentOrigin : workspace.surface }, set: { workspace.surface = $0 })) {
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
                            .navigationDestination(isPresented: Binding(get: { workspace.surface == .document && workspace.documentOrigin == .gallery }, set: { if !$0 && workspace.surface == .document { workspace.surface = .gallery } })) {
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
                Tab("Articles", systemImage: "books.vertical", value: WorkspaceModel.Surface.articles) {
                    NavigationStack {
                        NativeLibraryView(workspace: workspace)
                            .navigationTitle("Articles").navigationBarTitleDisplayMode(.inline)
                            .toolbar { workspaceToolbar }
                            .navigationDestination(isPresented: Binding(get: { workspace.surface == .document && workspace.documentOrigin == .articles }, set: { if !$0 && workspace.surface == .document { workspace.surface = .articles } })) {
                                NativeDocumentView(workspace: workspace)
                                    .navigationTitle(workspace.currentArticle?.title ?? workspace.currentName)
                                    .navigationBarTitleDisplayMode(.inline)
                            }
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
            Button { workspace.surface = .articles } label: { Label("Articles", systemImage: "books.vertical") }
            Button { workspace.surface = .gallery } label: { Label("Galerie", systemImage: "square.grid.2x2") }
            Button { workspace.importRequested = true } label: { Label("Importer un fichier", systemImage: "folder") }
            Button { showAbout = true } label: { Label("Réglages", systemImage: "gearshape") }
        } label: { Image(systemName: "ellipsis") }
        .accessibilityLabel("Options d’Atelier")
    }

}

#Preview("Atelier natif") {
    AtelierRootView()
}
