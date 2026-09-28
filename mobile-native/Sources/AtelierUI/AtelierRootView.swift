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
    /// A pairing link that would replace the saved Mac, awaiting confirmation.
    @State private var replacementPairing: String?
    /// A thread link received before the previous session was restored.
    @State private var pendingLink: AtelierLink?
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.horizontalSizeClass) private var sizeClass
    @FocusState private var composing: Bool

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
        .onChange(of: workspace.chat.selected?.id) { _, _ in workspace.composerSelection = nil }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active {
                workspace.chat.sceneDidLeaveActive()
                Task { await workspace.chat.flushResume(); await workspace.flushDocumentResume() }
            }
            else {
                workspace.chat.sceneDidBecomeActive()
                Task { await workspace.chat.loadCatalog(using: workspace.gallery, refreshProviders: false) }
            }
        }
        .onOpenURL { url in
            // An unrecognised link keeps reporting why it cannot pair.
            guard let link = AtelierLink(url) else { Task { await connect(url.absoluteString) }; return }
            // Restoring the previous session selects its own thread: open the
            // linked one only after that, so the link wins.
            if case .thread = link, !restoredTab { pendingLink = link } else { handle(link) }
        }
        .alert("Remplacer l’association avec le Mac ?",
               isPresented: Binding(get: { replacementPairing != nil }, set: { if !$0 { replacementPairing = nil } }),
               presenting: replacementPairing) { link in
            Button("Remplacer", role: .destructive) {
                replacementPairing = nil
                Task { await connect(link) }
            }
            Button("Annuler", role: .cancel) { replacementPairing = nil }
        } message: { link in
            Text(AtelierLink.replacementMessage(link))
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
            AtelierSettingsView(gallery: workspace.gallery)
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
            if let link = pendingLink { pendingLink = nil; handle(link) }
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
            workspace.chat.reconnect()
            workspace.surface = .gallery
        } catch { importError = error.localizedDescription }
    }

    private func handle(_ link: AtelierLink) {
        switch link {
        case .pair(let value):
            // A first pairing needs no confirmation; replacing a saved Mac does.
            if workspace.gallery.hasAddress || workspace.gallery.connected { replacementPairing = value }
            else { Task { await connect(value) } }
        case .thread(let id):
            Task { await workspace.openThread(id: id) }
        }
    }

    private var workbench: some View {
        GeometryReader { geometry in
        ZStack(alignment: .leading) {
            VStack(spacing: 0) {
                mainSurfaces.frame(maxWidth: .infinity, maxHeight: .infinity)
                bottomCommandPanel
            }
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
                                Text(workspace.currentName).font(.subheadline.weight(.medium)).lineLimit(1)
                            }
                        }
                }.surfaceVisibility(workspace.surface == .document)
                }
            }
        }
    }

    private var chatStack: some View {
        NavigationStack {
            NativeChatView(workspace: workspace, composing: $composing, showsComposer: sizeClass == .regular)
                .navigationTitle(workspace.chat.title).navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        ChatConnectionTitle(chat: workspace.chat)
                    }
                    ToolbarItem(placement: .topBarLeading) { sidebarButton }
                }
        }
    }
    private var bottomCommandPanel: some View {
        VStack(spacing: 0) {
            if sizeClass != .regular, workspace.surface == .chat, workspace.chat.selected != nil {
                NativeComposerView(workspace: workspace, composing: $composing, embedded: true)
            }
            workSurfaceSwitcher
        }
        .background(AtelierTheme.surface.ignoresSafeArea(edges: .bottom))
    }
    private var workSurfaceSwitcher: some View {
        HStack(spacing: 0) {
            workSurfaceButton(.chat, glyph: .chat, label: "Conversation")
            workSurfaceButton(.document, glyph: .document, label: "Fichier actif")
            workSurfaceButton(.gallery, glyph: .gallery, label: "Galerie")
            workSurfaceButton(.articles, glyph: .book, label: "Article Zotero")
        }
        .padding(.horizontal, 12)
        .padding(.top, 2)
        .padding(.bottom, 5)
    }
    private func workSurfaceButton(_ target: WorkspaceModel.Surface, glyph: WorkSurfaceGlyph.Kind, label: String) -> some View {
        let selected = workspace.selectedWorkSurface == target
        return Button {
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
            workspace.switchWorkSurface(target)
        } label: {
            WorkSurfaceGlyph(kind: glyph)
                .frame(width: 25, height: 25)
                .foregroundStyle(selected ? AtelierTheme.accent : Color.secondary)
                .frame(maxWidth: .infinity, minHeight: 44)
        }.buttonStyle(.plain).frame(maxWidth: .infinity)
            .disabled(target == .document && !workspace.hasWorkingFile)
            .accessibilityLabel(label)
            .accessibilityIdentifier("surface-" + String(describing: target))
            .accessibilityAddTraits(workspace.selectedWorkSurface == target ? .isSelected : [])
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
                Button("Calculs", systemImage: "chart.bar.xaxis") { workspace.switchWorkSurface(.calculations) }
                Button("Importer un fichier", systemImage: "folder") { workspace.importRequested = true }
                Button("Réglages", systemImage: "gearshape") { showAbout = true }
            } label: { Image(systemName: "ellipsis") }.accessibilityLabel("Options d’Atelier")
        }
    }
}

private struct WorkSurfaceGlyph: View {
    enum Kind { case chat, document, gallery, book }
    let kind: Kind
    var body: some View {
        Canvas { context, size in
            let scale = min(size.width, size.height) / 24
            context.scaleBy(x: scale, y: scale)
            let style = StrokeStyle(lineWidth: 1.55, lineCap: .round, lineJoin: .round)
            context.stroke(path, with: .foreground, style: style)
        }
        .accessibilityHidden(true)
    }
    private var path: Path {
        var path = Path()
        switch kind {
        case .chat:
            path.addRoundedRect(in: CGRect(x: 3, y: 4, width: 18, height: 13.5), cornerSize: CGSize(width: 3.5, height: 3.5))
            path.move(to: CGPoint(x: 8, y: 17.2)); path.addLine(to: CGPoint(x: 5.2, y: 20.2)); path.addLine(to: CGPoint(x: 5.7, y: 16.8))
        case .document:
            path.move(to: CGPoint(x: 6, y: 2.5)); path.addLine(to: CGPoint(x: 14.5, y: 2.5))
            path.addLine(to: CGPoint(x: 19, y: 7)); path.addLine(to: CGPoint(x: 19, y: 21.5))
            path.addLine(to: CGPoint(x: 6, y: 21.5)); path.addLine(to: CGPoint(x: 6, y: 2.5))
            path.move(to: CGPoint(x: 14.5, y: 2.8)); path.addLine(to: CGPoint(x: 14.5, y: 7)); path.addLine(to: CGPoint(x: 18.7, y: 7))
            path.move(to: CGPoint(x: 9, y: 14)); path.addLine(to: CGPoint(x: 16, y: 14))
        case .gallery:
            path.addRoundedRect(in: CGRect(x: 3, y: 3, width: 7.5, height: 7.5), cornerSize: CGSize(width: 1.7, height: 1.7))
            path.addRoundedRect(in: CGRect(x: 13.5, y: 3, width: 7.5, height: 5.5), cornerSize: CGSize(width: 1.7, height: 1.7))
            path.addRoundedRect(in: CGRect(x: 3, y: 13.5, width: 7.5, height: 7.5), cornerSize: CGSize(width: 1.7, height: 1.7))
            path.addRoundedRect(in: CGRect(x: 13.5, y: 11.5, width: 7.5, height: 9.5), cornerSize: CGSize(width: 1.7, height: 1.7))
        case .book:
            path.move(to: CGPoint(x: 3, y: 5)); path.addCurve(to: CGPoint(x: 11.8, y: 7), control1: CGPoint(x: 6, y: 3.7), control2: CGPoint(x: 9.3, y: 4.5))
            path.addLine(to: CGPoint(x: 11.8, y: 20)); path.addCurve(to: CGPoint(x: 3, y: 18), control1: CGPoint(x: 9, y: 17.6), control2: CGPoint(x: 5.8, y: 17))
            path.closeSubpath()
            path.move(to: CGPoint(x: 21, y: 5)); path.addCurve(to: CGPoint(x: 12.2, y: 7), control1: CGPoint(x: 18, y: 3.7), control2: CGPoint(x: 14.7, y: 4.5))
            path.addLine(to: CGPoint(x: 12.2, y: 20)); path.addCurve(to: CGPoint(x: 21, y: 18), control1: CGPoint(x: 15, y: 17.6), control2: CGPoint(x: 18.2, y: 17))
            path.closeSubpath()
        }
        return path
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

/// Links the app answers: `atelier-native://pair?address=…&code=…` copied from
/// the Mac, and `atelier-native://thread/{threadId}` opened by a notification
/// (the ntfy app) to return to one conversation.
enum AtelierLink: Equatable {
    case pair(String)
    case thread(String)
    init?(_ url: URL) {
        guard url.scheme?.lowercased() == "atelier-native" else { return nil }
        switch url.host?.lowercased() {
        case "pair": self = .pair(url.absoluteString)
        case "thread":
            // The Mac percent-encodes the id as a single path segment, `/` included
            // (`%2F`), so it is decoded from the raw path rather than split.
            let segment = URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedPath
                .trimmingCharacters(in: CharacterSet(charactersIn: "/")) ?? ""
            guard let id = segment.removingPercentEncoding, !id.isEmpty else { return nil }
            self = .thread(id)
        default: return nil
        }
    }
    /// The Mac a pairing link points to, shown before replacing a saved pairing.
    static func pairingHost(_ link: String) -> String? {
        guard let address = URLComponents(string: link)?.queryItems?.first(where: { $0.name == "address" })?.value,
              let host = URL(string: address.trimmingCharacters(in: .whitespacesAndNewlines))?.host, !host.isEmpty else { return nil }
        return host
    }
    static func replacementMessage(_ link: String) -> String {
        guard let host = pairingHost(link) else { return "Ce lien remplace l’association actuelle avec le Mac." }
        return "Ce lien associe l’iPhone à « \(host) ». L’association actuelle sera remplacée."
    }
}

extension WorkspaceModel {
    /// Shows a conversation named by a link: its chat when this iPhone knows the
    /// thread (after loading the catalog if needed), else the conversation list.
    func openThread(id: String) async {
        sidebarRequested = false
        if !chat.threads.contains(where: { $0.id == id }) {
            // A catalog refresh already under way (the app is launching) is
            // awaited rather than skipped by `loadCatalog`'s own guard.
            var waited = 0
            while chat.loading && waited < 100 {
                do { try await Task.sleep(for: .milliseconds(100)) } catch { return }
                waited += 1
            }
            if !chat.threads.contains(where: { $0.id == id }) {
                await chat.loadCatalog(using: gallery, refreshProviders: false)
            }
        }
        if let thread = chat.threads.first(where: { $0.id == id }) {
            chat.select(thread, workspace: self)
        } else {
            surface = .chat
            sidebarRequested = true
        }
    }
}
