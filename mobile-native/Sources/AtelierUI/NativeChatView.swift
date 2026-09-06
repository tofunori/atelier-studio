import SwiftUI

struct NativeChatView: View {
    @Bindable var workspace: WorkspaceModel
    @AppStorage("atelier.follow") private var followPreference = true
    @AppStorage("atelier.density") private var density = "comfortable"
    @State private var showingWork = false
    @State private var followsResponse = true
    @State private var userScrolling = false
    @State private var hasInteracted = false
    @State private var nearBottom = true
    @State private var readingPosition = ScrollPosition(edge: .bottom)
    @State private var pendingBookmark: ChatBookmark?
    @State private var scrollMetrics = ChatScrollMetrics()
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @AppStorage("atelier.motion") private var motion = "native"
    private var reduceMotion: Bool { systemReduceMotion || motion == "off" }
    @FocusState private var composing: Bool
    var body: some View {
        @Bindable var chat = workspace.chat
        Group {
            if chat.selected == nil {
                ContentUnavailableView {
                    Label("Votre espace de travail", systemImage: "bubble")
                } description: {
                    Text("Reprenez une conversation dans le menu ou commencez un nouveau chat.")
                } actions: {
                    Button("Nouvelle conversation", systemImage: "square.and.pencil") { workspace.newChatRequested = true }
                    Button("Mes conversations", systemImage: "sidebar.left") { workspace.sidebarRequested = true }
                }
            }
            else { chatContent }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if chat.selected != nil { composer }
        }
        .toolbar(composing ? .hidden : .visible, for: .tabBar)
        .toolbar {
            if workspace.chat.selected != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Travail du Mac", systemImage: "desktopcomputer") { showingWork = true }
                }
            }
        }
        .onChange(of: workspace.focusChatRequest) { _, _ in showingWork = false; composing = true }
        .sheet(isPresented: $showingWork) { RemoteWorkView(workspace: workspace) }
        .onChange(of: chat.completedResponse) { _, _ in
            if chat.connection == .live && chat.error == nil {
                Task { await chat.deliverPrepared(using: workspace.gallery, automatic: true) }
            }
        }
        .sheet(isPresented: $workspace.chatPickerRequested) { ConversationPicker(workspace: workspace) }
        .task(id: "\(chat.selected?.id ?? ""):\(chat.reconnectGeneration)") { await chat.observe(using: workspace.gallery) }
    }
    private var chatContent: some View {
        let chat = workspace.chat
        return VStack(spacing: 0) {
            if chat.connection != .live {
                Label(chat.statusLabel, systemImage: chat.statusIcon).font(.caption).foregroundStyle(.secondary).padding(.vertical, 4)
            }
            ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: density == "compact" ? 12 : 20) {
                    ForEach(ChatTimelineItem.group(chat.rows)) { item in
                        if item.isActivity {
                            ChatActivityView(rows: item.rows, active: chat.running && item.rows.last?.id == chat.rows.last?.id, workspace: workspace).id(item.id)
                        } else if let row = item.rows.first {
                            ChatEventRow(row: row, workspace: workspace).id(item.id)
                        }
                    }
                    if chat.running && !(chat.rows.last.map { ChatTimelineItem.activityKinds.contains($0.kind) } ?? false) { ProgressView().controlSize(.small).id("running") }
                    if let error = chat.error {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(error).font(.footnote).foregroundStyle(.secondary).textSelection(.enabled)
                            if chat.connection == .reconnecting {
                                Button("Reconnecter maintenant", systemImage: "arrow.clockwise") { chat.reconnect() }.font(.footnote)
                            }
                        }
                    }
                    Color.clear.frame(height: 1).id("chat-bottom")
                }.padding(16)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { _ in
                    if followPreference && followsResponse && !userScrolling { proxy.scrollTo("chat-bottom", anchor: .bottom) }
                }
            }
            .scrollPosition($readingPosition)
            .defaultScrollAnchor(.bottom, for: .initialOffset)
            .onScrollPhaseChange { _, phase in
                userScrolling = phase == .tracking || phase == .interacting || phase == .decelerating
                if userScrolling { pendingBookmark = nil; hasInteracted = true }
                if phase == .idle && nearBottom && pendingBookmark == nil { followsResponse = true }
                if phase == .idle && pendingBookmark == nil && hasInteracted && !chat.rows.isEmpty {
                    chat.rememberPosition(rowID: nil, followsTail: followsResponse, offsetY: scrollMetrics.offset, contentHeight: scrollMetrics.height)
                }
            }
            .onScrollGeometryChange(for: ChatScrollMetrics.self) { geometry in
                ChatScrollMetrics(offset: geometry.contentOffset.y, height: geometry.contentSize.height,
                                  bottom: geometry.contentSize.height - geometry.visibleRect.maxY < 60)
            } action: { _, metrics in
                scrollMetrics = metrics; nearBottom = metrics.bottom
                if userScrolling { followsResponse = metrics.bottom }
                if let bookmark = pendingBookmark, !chat.rows.isEmpty, !userScrolling {
                    let target = bookmark.offsetY ?? 0
                    if abs(metrics.offset - target) > 1 { readingPosition.scrollTo(y: target) }
                    if metrics.height >= (bookmark.contentHeight ?? 0) - 2 && abs(metrics.offset - target) <= 1 { pendingBookmark = nil }
                }
            }
            .onChange(of: chat.rows.count) { _, _ in
                if followPreference && followsResponse && !userScrolling { proxy.scrollTo("chat-bottom", anchor: .bottom) }
            }
            .onChange(of: chat.selected?.id, initial: true) { _, _ in
                userScrolling = false; hasInteracted = false; nearBottom = true
                let bookmark = chat.selected.flatMap { chat.bookmarks[$0.id] }
                followsResponse = bookmark?.followsTail ?? followPreference
                pendingBookmark = followsResponse ? nil : bookmark
                if followsResponse { proxy.scrollTo("chat-bottom", anchor: .bottom) }
            }
            .onChange(of: chat.sending) { _, sending in
                if sending { pendingBookmark = nil; followsResponse = true; chat.rememberPosition(rowID: nil, followsTail: true); proxy.scrollTo("chat-bottom", anchor: .bottom) }
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: chat.quote?.id) { _, quoteID in
                if quoteID != nil { composing = true }
                pendingBookmark = nil; followsResponse = true
                proxy.scrollTo("chat-bottom", anchor: .bottom)
            }
            .overlay(alignment: .bottomTrailing) {
                if !followsResponse {
                    Button {
                        pendingBookmark = nil; followsResponse = true
                        chat.rememberPosition(rowID: nil, followsTail: true)
                        proxy.scrollTo("chat-bottom", anchor: .bottom)
                    } label: { Image(systemName: "arrow.down").font(.body.weight(.semibold)) }
                        .buttonStyle(.borderedProminent).buttonBorderShape(.circle)
                        .accessibilityLabel("Revenir au bas de la réponse")
                        .padding(12)
                }
            }
            }
        }
    }
    private var composer: some View { NativeComposerView(workspace: workspace, composing: $composing) }
}

private struct ChatEventRow: View {
    let row: RemoteChatModel.Row
    let workspace: WorkspaceModel
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ScaledMetric(relativeTo: .caption2) private var actionIconSize = 11
    private var actionWidth: CGFloat { dynamicTypeSize.isAccessibilitySize ? 44 : 32 }
    private var actionHeight: CGFloat { dynamicTypeSize.isAccessibilitySize ? 44 : 30 }
    @State private var selecting = false
    @State private var copied = false
    @State private var reviewing = false
    @State private var editing: MessageEditDraft?
    private var pinID: String { row.eventID ?? row.id }
    private var isPinned: Bool { workspace.chat.pins[workspace.chat.selected?.id ?? ""]?.contains(pinID) == true }
    private func togglePin() {
        guard let id = workspace.chat.selected?.id else { return }
        if isPinned { workspace.chat.pins[id]?.removeAll { $0 == pinID } }
        else { workspace.chat.pins[id, default: []].append(pinID) }
        workspace.chat.scheduleSave()
    }
    var body: some View {
        Group {
                VStack(alignment: row.kind == "user" ? .trailing : .leading, spacing: 6) {
                    if isPinned { Label("Épinglé", systemImage: "pin.fill").font(.caption).foregroundStyle(.secondary) }
                    if row.kind != "user" { Text(row.kind == "error" ? "Erreur" : "Atelier").font(.caption.weight(.semibold)).foregroundStyle(.secondary) }
                    Group {
                        if let editing, row.kind == "user" {
                            InlineMessageEditor(draft: editing, workspace: workspace) { self.editing = nil }
                        } else if row.kind == "text" { RichChatText(text: row.text) { workspace.chat.quotePassage($0, from: row.id) } }
                        else if row.kind == "user" { AnnotationMessageText(text: row.text) { workspace.chat.quotePassage($0, from: row.id) } }
                        else { SelectableChatText(text: row.text) { workspace.chat.quotePassage($0, from: row.id) } }
                    }
                        .padding(row.kind == "user" ? 12 : 0)
                        .background(row.kind == "user" ? Color(uiColor: .secondarySystemBackground) : .clear, in: RoundedRectangle(cornerRadius: 16))
                    if row.kind == "text", let target = workspace.revisionTarget, target.threadID == workspace.chat.selected?.id, workspace.chat.isReply(row, to: target.messageID), !workspace.chat.running,
                       SourceRevisionTarget.replacement(in: row.text) != nil {
                        Button("Examiner la reformulation", systemImage: "pencil.and.outline") { reviewing = true }.frame(minHeight: 44)
                    }
                    if editing == nil && !workspace.chat.files(for: row).isEmpty {
                        ChatHistoryFiles(items: workspace.chat.files(for: row), workspace: workspace)
                    }
                    if editing == nil && !row.isStreaming && !row.id.hasPrefix("pending:") {
                        HStack(spacing: 0) {
                            Button { UIPasteboard.general.string = row.text; copied = true } label: {
                                Image(systemName: copied ? "checkmark" : "doc.on.doc").frame(width: actionWidth, height: actionHeight).contentShape(Rectangle())
                            }.accessibilityLabel("Copier le message")
                            Button { selecting = true } label: {
                                Image(systemName: "text.quote").frame(width: actionWidth, height: actionHeight).contentShape(Rectangle())
                            }.accessibilityLabel("Sélectionner un passage à citer")
                            Menu {
                                Button("Lire à voix haute", systemImage: "speaker.wave.2") { NativeVoice.shared.speak(row.text) }
                                Button("Arrêter la lecture", systemImage: "speaker.slash") { NativeVoice.shared.stopSpeaking() }
                                Button(isPinned ? "Désépingler" : "Épingler", systemImage: "pin") { togglePin() }
                                Button("Citer le message", systemImage: "text.quote") { workspace.chat.quotePassage(row.text, from: row.id) }
                                if row.kind == "user" {
                                    Button("Modifier", systemImage: "pencil") { editing = workspace.chat.prepareRevision(row) }
                                } else if workspace.chat.retryPrompt(for: row) != nil {
                                    Button("Régénérer la réponse", systemImage: "arrow.clockwise") {
                                        Task { await workspace.chat.retry(row, workspace: workspace) }
                                    }
                                }
                            } label: { Image(systemName: "ellipsis").frame(width: actionWidth, height: actionHeight).contentShape(Rectangle()) }
                                .accessibilityLabel("Actions du message")
                                .disabled(workspace.chat.running || workspace.chat.sending)
                        }.font(.system(size: actionIconSize, weight: .regular)).foregroundStyle(.secondary).buttonStyle(.plain)
                        if row.kind == "user" { MessageVersionPicker(row: row, workspace: workspace) }
                    }
                }.frame(maxWidth: .infinity, alignment: row.kind == "user" ? .trailing : .leading)
                .contextMenu {
                    Button("Copier", systemImage: "doc.on.doc") { UIPasteboard.general.string = row.text }
                    Button("Sélectionner du texte", systemImage: "text.cursor") { selecting = true }
                    if row.kind == "user", !workspace.chat.running, !workspace.chat.sending {
                        Button("Modifier", systemImage: "pencil") { editing = workspace.chat.prepareRevision(row) }
                    }
                }
        }
        .sheet(isPresented: $reviewing) {
            if let target = workspace.revisionTarget, let replacement = SourceRevisionTarget.replacement(in: row.text) {
                SourceRevisionView(workspace: workspace, target: target, replacement: replacement)
            }
        }
        .sheet(isPresented: $selecting) {
            NavigationStack {
                ScrollView {
                    SelectableChatText(text: row.text) { passage in
                        workspace.chat.quotePassage(passage, from: row.id); selecting = false
                    }.padding()
                }
                .navigationTitle("Sélectionner un passage").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fermer") { selecting = false } } }
            }.presentationDetents([.medium, .large])
        }
        .task(id: copied) {
            guard copied else { return }
            try? await Task.sleep(for: .seconds(2)); copied = false
        }
    }
}

struct ConversationPicker: View {
    @Bindable var workspace: WorkspaceModel
    var embedded = false
    var navigateToChat = true
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var searching = false
    @State private var creating = false
    @State private var error: String?
    var body: some View {
        Group {
            if embedded { content } else { NavigationStack { content } }
        }
    }
    private var content: some View {
        let chat = workspace.chat
        return List {
                if creating || chat.loading { ProgressView() }
                if let error = error ?? chat.error { Text(error).foregroundStyle(.red) }
                ForEach(chat.conversationThreads.filter { query.isEmpty || $0.title.localizedStandardContains(query) }) { thread in
                    Button {
                        chat.select(thread, workspace: workspace, navigateToChat: navigateToChat); if !embedded { dismiss() }
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(thread.title).foregroundStyle(.primary)
                            Text([thread.provider, thread.model ?? ""].filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }.disabled(creating)
                }
            }
            .navigationTitle("Conversations").navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, isPresented: $searching, prompt: "Rechercher une conversation")
            .refreshable { await chat.loadCatalog(using: workspace.gallery) }
            .task { await chat.loadCatalog(using: workspace.gallery) }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Rechercher", systemImage: "magnifyingglass") { searching = true }.keyboardShortcut("f", modifiers: .command) }
                if !embedded { ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } } }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu("Nouvelle conversation", systemImage: "plus") {
                        ForEach(chat.creationProviders) { provider in
                            Button(provider.label) {
                                creating = true
                                Task {
                                    defer { creating = false }
                                    do { try await chat.create(provider: provider, workspace: workspace, navigateToChat: navigateToChat); if !embedded { dismiss() } }
                                    catch { self.error = error.localizedDescription }
                                }
                            }
                        }
                    }.disabled(creating || chat.creationProviders.isEmpty)
                }
            }
    }
}

private struct ChatScrollMetrics: Equatable {
    var offset: Double = 0
    var height: Double = 0
    var bottom = true
}
