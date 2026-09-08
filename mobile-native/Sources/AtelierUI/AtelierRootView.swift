import SwiftUI
import UniformTypeIdentifiers

public struct AtelierRootView: View {
    @State private var workspace = WorkspaceModel(resumeStore: ChatResumeStore.live())
    @AppStorage("atelier.lastTab") private var lastTab = "chat"
    @State private var restoredTab = false
    @State private var visitedSurfaces: Set<WorkspaceModel.Surface> = [.chat]
    @State private var showAbout = false
    @AppStorage("atelier.appearance") private var appearance = "system"
    @AppStorage("atelier.accent") private var accent = "sage"
    @AppStorage("atelier.contrast") private var contrast = false
    @AppStorage("atelier.motion") private var motion = "native"
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.colorSchemeContrast) private var systemContrast
    @State private var importError: String?
    @State private var connecting = false
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.horizontalSizeClass) private var sizeClass

    public init() {}

    private var connectedWorkbench: some View {
        workbench
        .tint(AtelierTheme.accent(named: accent))
        .contrast(contrast ? 1.18 : 1)
        .transaction { if systemReduceMotion || motion == "off" { $0.animation = nil } }
        .preferredColorScheme(appearance == "dark" ? .dark : appearance == "light" ? .light : nil)
        .onChange(of: workspace.surface) { _, surface in
            visitedSurfaces.insert(surface)
            workspace.scheduleDocumentResume()
            if surface == .chat { lastTab = "chat" }
            else if surface == .calculations { lastTab = "calculations" }
            else if surface == .articles || (surface == .document && workspace.documentOrigin == .articles) { lastTab = "articles" }
            else { lastTab = "gallery" }
        }
        .task { await initialize() }
        .onChange(of: workspace.gallery.selectedProject) { _, project in
            workspace.chat.galleryProjectID = project; workspace.chat.scheduleSave()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { workspace.chat.sceneDidEnterBackground() }
            if phase != .active { Task { await workspace.chat.flushResume(); await workspace.flushDocumentResume() } }
            else {
                workspace.chat.sceneDidBecomeActive()
                Task { await workspace.chat.loadCatalog(using: workspace.gallery, refreshProviders: false) }
            }
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
            let documentVisible = !restoredTab && !ProcessInfo.processInfo.arguments.contains("--chat-render-fixture") ? await workspace.restoreDocument() : false
            if !restoredTab {
                restoredTab = true
                workspace.surface = documentVisible ? .document : desiredTab == "calculations" ? .calculations : desiredTab == "articles" ? .articles : desiredTab == "gallery" ? .gallery : .chat
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

    private var workbench: some View {
        GeometryReader { geometry in
        ZStack(alignment: .leading) {
            mainSurfaces
                .allowsHitTesting(!workspace.sidebarRequested)
                .accessibilityHidden(workspace.sidebarRequested)
            if workspace.sidebarRequested {
                Color.black.opacity(0.28).ignoresSafeArea()
                    .onTapGesture { workspace.sidebarRequested = false }
                    .accessibilityHidden(true)
                WorkspaceSidebar(workspace: workspace) { showAbout = true }
                    .frame(width: min(geometry.size.width * 0.86, sizeClass == .regular ? 340 : 360))
                    .transition(.move(edge: .leading))
                    .gesture(DragGesture(minimumDistance: 30).onEnded { gesture in
                        if gesture.translation.width < -60 && abs(gesture.translation.width) > abs(gesture.translation.height) { workspace.sidebarRequested = false }
                    })
            }
        }
        .animation(systemReduceMotion || motion == "off" ? nil : .smooth(duration: 0.24), value: workspace.sidebarRequested)
        }
        .sheet(isPresented: $workspace.newChatRequested) { NewConversationView(workspace: workspace) }
    }

    private var mainSurfaces: some View {
        HStack(spacing: 0) {
            if sizeClass == .regular {
                chatStack.frame(minWidth: 300, idealWidth: 360, maxWidth: 420)
                Divider()
            }
            ZStack {
                if sizeClass != .regular {
                    chatStack.surfaceVisibility(workspace.surface == .chat)
                }
                if visitedSurfaces.contains(.gallery) || workspace.surface == .gallery || (sizeClass == .regular && workspace.surface == .chat) {
                NavigationStack {
                    NativeGalleryView(workspace: workspace)
                        .navigationTitle("Galerie").navigationBarTitleDisplayMode(.inline)
                        .toolbar { workspaceToolbar }
                }.surfaceVisibility(workspace.surface == .gallery || (sizeClass == .regular && workspace.surface == .chat))
                }
                if visitedSurfaces.contains(.articles) || workspace.surface == .articles {
                NavigationStack {
                    NativeLibraryView(workspace: workspace)
                        .navigationTitle("Articles").navigationBarTitleDisplayMode(.inline)
                        .toolbar { workspaceToolbar }
                }.surfaceVisibility(workspace.surface == .articles)
                }
                if visitedSurfaces.contains(.calculations) || workspace.surface == .calculations {
                NavigationStack {
                    NativeCalculationsView(workspace: workspace)
                        .navigationTitle("Calculs").navigationBarTitleDisplayMode(.inline)
                        .toolbar { ToolbarItem(placement: .topBarLeading) { sidebarButton } }
                }.surfaceVisibility(workspace.surface == .calculations)
                }
                if visitedSurfaces.contains(.document) || workspace.surface == .document {
                NavigationStack {
                    NativeDocumentView(workspace: workspace)
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .topBarLeading) { sidebarButton }
                            ToolbarItem(placement: .principal) {
                                VStack(alignment: .leading, spacing: 1) {
                                    Button { workspace.returnToDocumentList() } label: {
                                        Label(workspace.documentOrigin == .articles ? "Articles" : "Galerie", systemImage: "chevron.left")
                                            .font(.subheadline.weight(.medium))
                                    }.labelStyle(.titleAndIcon)
                                        .accessibilityLabel(workspace.documentOrigin == .articles ? "Retour : Articles" : "Retour : Galerie")
                                    Text(workspace.currentName).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                }.frame(minHeight: 44)
                            }
                        }
                }.surfaceVisibility(workspace.surface == .document)
                }
            }
        }
    }

    private var chatStack: some View {
        NavigationStack {
            NativeChatView(workspace: workspace)
                .navigationTitle(workspace.chat.title).navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        ChatConnectionTitle(chat: workspace.chat)
                    }
                    ToolbarItem(placement: .topBarLeading) { sidebarButton }
                }
        }
    }
    private var sidebarButton: some View {
        Button("Ouvrir le menu", systemImage: "sidebar.left") {
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
            workspace.sidebarRequested = true
        }.keyboardShortcut("s", modifiers: [.command, .shift])
    }
    @ToolbarContentBuilder private var workspaceToolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) { sidebarButton }
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button("Importer un fichier", systemImage: "folder") { workspace.importRequested = true }
                Button("Réglages", systemImage: "gearshape") { showAbout = true }
            } label: { Image(systemName: "ellipsis") }.accessibilityLabel("Options d’Atelier")
        }
    }
}

private extension View {
    func surfaceVisibility(_ visible: Bool) -> some View {
        opacity(visible ? 1 : 0).allowsHitTesting(visible).accessibilityElement(children: .contain).accessibilityHidden(!visible).zIndex(visible ? 1 : 0)
    }
}

#Preview("Atelier natif") { AtelierRootView() }

private struct ChatConnectionTitle: View {
    let chat: RemoteChatModel
    @State private var showingDetails = false
    private var color: Color {
        switch chat.connection {
        case .live: return .green
        case .connecting, .reconnecting: return .orange
        case .associationRequired: return .red
        case .idle: return .secondary
        }
    }
    var body: some View {
        Button { showingDetails = true } label: {
            HStack(spacing: 7) {
                Circle().fill(color).frame(width: 6, height: 6)
                Text(chat.title).font(.headline).foregroundStyle(.primary).lineLimit(1)
            }.frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(chat.title + ", " + chat.connectionLabel)
        .accessibilityHint("Afficher les détails de connexion")
        .popover(isPresented: $showingDetails) {
            VStack(alignment: .leading, spacing: 12) {
                Text(chat.connectionLabel).font(.subheadline.weight(.medium))
                if let detail = chat.connectionError {
                    Text(detail).font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
                if chat.connection == .reconnecting || chat.connection == .idle {
                    Button("Réessayer", systemImage: "arrow.clockwise") { chat.reconnect(); showingDetails = false }
                        .font(.subheadline)
                }
            }
            .padding(16).frame(width: 260)
            .presentationCompactAdaptation(.popover)
        }
    }
}
