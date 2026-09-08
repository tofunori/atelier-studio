import SwiftUI

struct NativeChatView: View {
    @Bindable var workspace: WorkspaceModel
    @AppStorage("atelier.follow") private var followPreference = true
    @AppStorage("atelier.density") private var density = "comfortable"
    @State private var showingWork = false
    @State private var showingOptions = false
    @State private var followsResponse = true
    @State private var nearBottom = true
    @State private var returnRequest = UUID()
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
                    Menu {
                        Button("Autorisations · " + chat.permissionMode.title, systemImage: "slider.horizontal.3") { showingOptions = true }
                        Button("Travail du Mac", systemImage: "desktopcomputer") { showingWork = true }
                        Button("Nouvelle conversation", systemImage: "square.and.pencil") { workspace.newChatRequested = true }
                            .disabled(chat.sending)
                    } label: { Image(systemName: "ellipsis") }.accessibilityLabel("Options du chat")
                }
            }
        }

        .onChange(of: workspace.focusChatRequest) { _, _ in showingWork = false; composing = true }
        .sheet(isPresented: $showingOptions) { ChatOptionsView(chat: chat) }
        .sheet(isPresented: $showingWork) { RemoteWorkView(workspace: workspace) }
        .onChange(of: chat.completedResponse) { _, _ in
            if chat.connection == .live && chat.error == nil {
                Task { await chat.deliverPrepared(using: workspace.gallery, automatic: true) }
            }
        }
        .sheet(isPresented: $workspace.chatPickerRequested) { ConversationPicker(workspace: workspace) }
        .task(id: "\(chat.selected?.id ?? ""):\(chat.reconnectGeneration)") { await chat.observe(using: workspace.gallery) }
        .task { if chat.providers.isEmpty { await chat.loadCatalog(using: workspace.gallery) } }
    }
    private var chatContent: some View {
        let chat = workspace.chat
        let finalTextIDs = ChatTimelineItem.finalTextIDs(in: chat.rows)
        let items = ChatTimelineItem.displayItems(chat.rows, running: chat.running)
        let revision = finalTextIDs.sorted().joined(separator: ":") + items.map { chat.isTurnRunning($0.rows[0].turn) ? "1" : "0" }.joined()
        return VStack(spacing: 0) {
            NativeChatList(items: items, renderRevision: revision, threadID: chat.selected?.id ?? "",
                           followsTail: followsResponse && followPreference, animateReturn: !reduceMotion, returnRequest: returnRequest,
                           bookmark: chat.selected.flatMap { chat.bookmarks[$0.id] },
                           row: { AnyView(timelineRow($0, finalTextIDs: finalTextIDs)) },
                           footer: AnyView(VStack(alignment: .leading, spacing: 8) {
                               if let error = chat.error {
                                   Text(error).font(.footnote).foregroundStyle(.secondary).textSelection(.enabled)
                               }
                               QueuedChatMessages(workspace: workspace)
                           }), onUserScroll: { followsResponse = false },
                           onBottomChanged: { nearBottom = $0 },
                           onRest: { id, offset, height, rowOffset, bottom in
                               if bottom { followsResponse = true }
                               chat.rememberPosition(rowID: id, followsTail: followsResponse, offsetY: offset, contentHeight: height, rowOffsetY: rowOffset)
                           })
                .onChange(of: chat.selected?.id, initial: true) { _, _ in
                    followsResponse = chat.selected.flatMap { chat.bookmarks[$0.id]?.followsTail } ?? true
                }
                .onChange(of: chat.sending) { _, sending in if sending { returnToBottom() } }
                .onChange(of: chat.quote?.id) { _, quoteID in if quoteID != nil { composing = true; returnToBottom() } }
                .overlay(alignment: .bottom) {
                    if !nearBottom {
                        ChatReturnToBottomButton(returning: false, reduceMotion: reduceMotion) { returnToBottom() }
                            .padding(.bottom, 12).transition(.opacity)
                    }
                }
        }
    }
    @ViewBuilder private func timelineRow(_ item: ChatTimelineItem, finalTextIDs: Set<String>) -> some View {
        if let row = item.rows.first, let eventID = row.generatedImageEventID, let threadID = workspace.chat.selected?.id {
            ChatGeneratedImage(threadID: threadID, eventID: eventID, gateway: workspace.gallery, hasProject: !(workspace.chat.selected?.projectId ?? "").isEmpty).id(item.id)
        } else if item.isActivity {
            ChatActivityView(rows: item.awaitingActivity ? [] : item.rows, active: item.awaitingActivity || (item.rows.first.map { workspace.chat.isTurnRunning($0.turn) } ?? false), workspace: workspace, onInspect: {
                followsResponse = false
            }, disclosureID: item.id).id(item.id)
        } else if let row = item.rows.first {
            ChatEventRow(row: row, workspace: workspace, isFinalText: finalTextIDs.contains(row.id)).id(item.id)
        }
    }
    private func returnToBottom() {
        followsResponse = true; returnRequest = UUID()
        workspace.chat.rememberPosition(rowID: nil, followsTail: true)
    }
    private var composer: some View { NativeComposerView(workspace: workspace, composing: $composing) }
}

private struct ChatReturnToBottomButton: View {
    let returning: Bool
    let reduceMotion: Bool
    var action: () -> Void
    @AppStorage("atelier.accent") private var accent = "sage"
    var body: some View {
        Button(action: action) {
            Image(systemName: "arrow.down")
                .font(.system(size: 18, weight: .medium, design: .rounded))
                .foregroundStyle(AtelierTheme.accent(named: accent))
                .frame(width: 44, height: 44)
                .background(AtelierTheme.surface, in: Circle())
                .overlay { Circle().strokeBorder(AtelierTheme.accent(named: accent).opacity(0.24), lineWidth: 0.75) }
                .shadow(color: .black.opacity(0.16), radius: 8, y: 3)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Revenir au bas de la réponse")
        .accessibilityValue(returning ? "Défilement en cours" : "")
        .accessibilityHint("Affiche le dernier message de la conversation")
        .accessibilityIdentifier("chat.returnToBottom")
    }
}

private struct ChatEventRow: View {
    let row: RemoteChatModel.Row
    let workspace: WorkspaceModel
    let isFinalText: Bool
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
    @ViewBuilder private var messageContent: some View {
        if let editing, row.kind == "user" {
            InlineMessageEditor(draft: editing, workspace: workspace) { self.editing = nil }
        } else if row.kind == "text" {
            RichChatText(text: row.text) { workspace.chat.quotePassage($0, from: row.id) }
                .opacity(isFinalText ? 1 : 0.82)
        } else if row.kind == "user" {
            AnnotationMessageText(text: userText, compactWidth: true) { workspace.chat.quotePassage($0, from: row.id) }
        } else { SelectableChatText(text: row.text) { workspace.chat.quotePassage($0, from: row.id) } }
    }
    private var userText: String { workspace.chat.editablePrompt(for: row) }
    private var userMenu: some View {
        Menu {
            Button("Copier", systemImage: "doc.on.doc") { UIPasteboard.general.string = userText }
            Button("Sélectionner un passage", systemImage: "text.quote") { selecting = true }
            Button("Lire à voix haute", systemImage: "speaker.wave.2") { NativeVoice.shared.speak(userText) }
            Button("Modifier", systemImage: "pencil") { editing = workspace.chat.prepareRevision(row) }
                .disabled(workspace.chat.running || workspace.chat.sending)
            Button(isPinned ? "Désépingler" : "Épingler", systemImage: "pin") { togglePin() }
        } label: { Image(systemName: "ellipsis").font(.system(size: actionIconSize)).foregroundStyle(.secondary).frame(width: 44, height: 44).contentShape(Rectangle()) }
            .accessibilityLabel("Options du message")
    }
    var body: some View {
        Group {
                VStack(alignment: row.kind == "user" ? .trailing : .leading, spacing: 6) {
                    if isPinned { Label("Épinglé", systemImage: "pin.fill").font(.caption).foregroundStyle(.secondary) }
                    if row.kind == "error" { Text("Erreur").font(.caption.weight(.semibold)).foregroundStyle(.secondary) }
                    if row.kind == "user" && editing == nil {
                        HStack(alignment: .bottom, spacing: 2) {
                            Spacer(minLength: 18)
                            if !row.id.hasPrefix("pending:") { userMenu }
                            VStack(alignment: .trailing, spacing: 8) {
                                if !workspace.chat.files(for: row).isEmpty {
                                    ChatHistoryFiles(items: workspace.chat.files(for: row), workspace: workspace)
                                }
                                if !userText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                    messageContent.padding(12)
                                        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18))
                                }
                            }
                        }
                    } else { messageContent }
                    if row.kind == "text", let target = workspace.revisionTarget, target.threadID == workspace.chat.selected?.id, workspace.chat.isReply(row, to: target.messageID), !workspace.chat.running,
                       SourceRevisionTarget.replacement(in: row.text) != nil {
                        Button("Examiner la reformulation", systemImage: "pencil.and.outline") { reviewing = true }.frame(minHeight: 44)
                    }
                    if row.kind != "user" && editing == nil && !workspace.chat.files(for: row).isEmpty {
                        ChatHistoryFiles(items: workspace.chat.files(for: row), workspace: workspace)
                    }
                    if row.kind == "user", editing == nil { MessageVersionPicker(row: row, workspace: workspace) }
                    if editing == nil && row.kind != "user" && (isFinalText || row.kind == "error") && !row.isStreaming && !workspace.chat.isTurnRunning(row.turn) {
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
                    }
                }.frame(maxWidth: .infinity, alignment: row.kind == "user" ? .trailing : .leading)

        }
        .sheet(isPresented: $reviewing) {
            if let target = workspace.revisionTarget, let replacement = SourceRevisionTarget.replacement(in: row.text) {
                SourceRevisionView(workspace: workspace, target: target, replacement: replacement)
            }
        }
        .sheet(isPresented: $selecting) {
            NavigationStack {
                ScrollView {
                    SelectableChatText(text: row.kind == "user" ? userText : row.text) { passage in
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

private final class ChatScrollMeasurements { var value = ChatScrollMetrics() }

private struct ChatScrollMetrics: Equatable {
    var offset: Double = 0
    var height: Double = 0
    var viewport: Double = 0
    var bottom = true
}
