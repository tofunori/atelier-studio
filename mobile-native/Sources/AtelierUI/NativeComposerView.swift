import SwiftUI

struct NativeComposerView: View {
    @Bindable var workspace: WorkspaceModel
    var composing: FocusState<Bool>.Binding
    @State private var dictating = false
    @State private var choosingModel = false
    @State private var choosingEffort = false
    @State private var modelAfterEffort = false
    @State private var expandedQuote = false
    @State private var selection: TextSelection?
    @State private var suggestions = ComposerSuggestionsModel()
    @State private var choosingPermissions = false
    private var trigger: ComposerTrigger? {
        guard composing.wrappedValue else { return nil }
        var caret: Int? = nil
        if let selection {
            guard case .selection(let range) = selection.indices, range.isEmpty else { return nil }
            // SwiftUI can publish the new selection before the new text.
            guard let offset = ComposerTrigger.caretOffset(in: workspace.draft, index: range.lowerBound) else { return nil }
            caret = offset
        }
        return ComposerTrigger.parse(workspace.draft, caret: caret)
    }
    private var suggestionProject: String? { workspace.chat.selected?.projectId ?? (workspace.gallery.selectedProject.isEmpty ? nil : workspace.gallery.selectedProject) }
    private var suggestionKey: String { "\(workspace.gallery.connectionRevision)-\(workspace.chat.selected?.id ?? "")-\(suggestionProject ?? "")-\(trigger?.kind.rawValue ?? "")" }
    private var expanded: Bool { composing.wrappedValue || choosingModel || choosingEffort || dictating }
    private var hasDraft: Bool {
        !workspace.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !workspace.chat.attachments.isEmpty || workspace.chat.quote != nil
    }
    var body: some View {
        let chat = workspace.chat
        VStack(alignment: .leading, spacing: 8) {
            if let trigger {
                ComposerSuggestionsView(model: suggestions, trigger: trigger, chooseCommand: { command in
                    insertSuggestion("/" + command.name + " ", trigger: trigger)
                }, chooseFile: { file in
                    guard chat.attachments.count < 6 || chat.attachments.contains(where: { $0.fileID == file.fileID && $0.projectID == file.projectID && file.fileID != nil }) else {
                        chat.error = "Six pièces jointes maximum."; return
                    }
                    if !chat.attachments.contains(where: { $0.fileID == file.fileID && $0.projectID == file.projectID && file.fileID != nil }) { workspace.attachToChat(file) }
                    insertSuggestion("@" + file.name + " ", trigger: trigger)
                })
                Divider()
            }
            if let quote = chat.quote {
                HStack(alignment: .top, spacing: 8) {
                    Rectangle().fill(AtelierTheme.accent).frame(width: 2)
                    Button { expandedQuote.toggle() } label: {
                        Text(quote.text).font(.subheadline).foregroundStyle(.secondary)
                            .lineLimit(expandedQuote ? nil : 2).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }.buttonStyle(.plain)
                    Button { chat.quote = nil } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }
                        .buttonStyle(.plain).foregroundStyle(.secondary).accessibilityLabel("Retirer la citation").disabled(chat.sending)
                }.fixedSize(horizontal: false, vertical: true)
            }
            if !chat.attachments.isEmpty { ChatAttachmentBar(workspace: workspace) }
            HStack(spacing: 4) {
                if !expanded { attachButton }
                TextField("Message…", text: $workspace.draft, selection: $selection, axis: .vertical)
                    .lineLimit(expanded ? 1...5 : 1...1).focused(composing)
                    .padding(.horizontal, expanded ? 6 : 0).padding(.top, expanded ? 4 : 0)
                    .accessibilityIdentifier("chatDraft")
                if !expanded { microphoneButton; sendButton }
            }
            if expanded {
                HStack(spacing: 4) {
                    attachButton
                    Button { choosingModel = true } label: {
                        HStack(spacing: 5) {
                            Text(chat.provider?.modelLabels?[chat.model] ?? (chat.model.isEmpty ? "Modèle du Mac" : chat.model)).lineLimit(1)
                            Image(systemName: "chevron.down").font(.system(size: 13, weight: .medium))
                        }.font(.subheadline).frame(minHeight: 44)
                    }.buttonStyle(.plain).foregroundStyle(.secondary).disabled(chat.sending || chat.running)
                        .accessibilityLabel("Choisir le modèle")
                        .accessibilityValue(chat.provider?.modelLabels?[chat.model] ?? chat.model)
                    Button { choosingEffort = true } label: {
                        ThinkingEffortIndicator(effort: chat.effort, showLabel: false, iconSize: 24).frame(width: 44, height: 44)
                    }.buttonStyle(.plain).foregroundStyle(.secondary).disabled(chat.sending)
                        .accessibilityLabel("Effort de réflexion")
                        .accessibilityValue(ThinkingEffortLevel(chat.effort).label)
                        .popover(isPresented: $choosingEffort, attachmentAnchor: .rect(.bounds), arrowEdge: .bottom) {
                            ThinkingEffortPanel(chat: chat) {
                                modelAfterEffort = true
                                choosingEffort = false
                            }.presentationCompactAdaptation(.popover)
                                .onDisappear {
                                    if modelAfterEffort { modelAfterEffort = false; choosingModel = true }
                                }
                        }
                    Spacer(minLength: 2)
                    microphoneButton
                    sendButton
                }
            }
        }
        .padding(.horizontal, expanded ? 10 : 8).padding(.vertical, expanded ? 10 : 4)
        .background(AtelierTheme.surface, in: RoundedRectangle(cornerRadius: expanded ? 22 : 26))
        .overlay(RoundedRectangle(cornerRadius: expanded ? 22 : 26).strokeBorder(.primary.opacity(0.07), lineWidth: 1))
        .padding(.horizontal, 12).padding(.vertical, 8).background(.background)
        .sheet(isPresented: $dictating) { NativeDictationSheet(workspace: workspace) }
        .sheet(isPresented: $choosingModel) { NativeModelSheet(chat: chat) }
        .sheet(isPresented: $choosingPermissions) { ChatOptionsView(chat: chat) }
        .task(id: suggestionKey) {
            await suggestions.load(kind: trigger?.kind, thread: chat.selected, project: suggestionProject, gallery: workspace.gallery, preview: chat.isPreview)
        }
        .onChange(of: chat.selected?.id) { _, _ in selection = nil }
    }
    private func insertSuggestion(_ value: String, trigger: ComposerTrigger) {
        guard let result = trigger.replacing(in: workspace.draft, with: value) else { return }
        workspace.draft = result.text
        if let range = Range(NSRange(location: result.caret, length: 0), in: result.text) { selection = TextSelection(insertionPoint: range.lowerBound) }
        composing.wrappedValue = true
    }
    private func handleLocalCommand() -> Bool {
        let parts = workspace.draft.trimmingCharacters(in: .whitespacesAndNewlines).split(maxSplits: 1, whereSeparator: \.isWhitespace)
        guard let command = parts.first else { return false }
        switch command.lowercased() {
        case "/model":
            guard !workspace.chat.running && !workspace.chat.sending else { workspace.chat.error = "Le modèle pourra être changé à la fin de la réponse."; return true }
            choosingModel = true
        case "/permissions": choosingPermissions = true
        default: return false
        }
        workspace.draft = parts.count > 1 ? String(parts[1]) : ""; selection = nil
        return true
    }
    private var attachButton: some View {
        ChatAttachMenu(workspace: workspace).frame(width: 44, height: 44).disabled(workspace.chat.sending)
    }
    private var microphoneButton: some View {
        Button("Dicter", systemImage: "mic") { dictating = true }
            .labelStyle(.iconOnly).frame(width: 44, height: 44).disabled(workspace.chat.sending)
    }
    private var sendButton: some View {
        let chat = workspace.chat
        return Button {
            if handleLocalCommand() { return }
            if chat.running && hasDraft { chat.enqueue(workspace: workspace); composing.wrappedValue = false }
            else if chat.running { Task { await chat.stop(using: workspace.gallery) } }
            else {
                let prompt = workspace.draft, thread = chat.selected?.id
                Task {
                    if await chat.send(prompt, using: workspace.gallery, includingAttachments: true), chat.selected?.id == thread, workspace.draft == prompt {
                        workspace.draft = ""; composing.wrappedValue = false
                    }
                }
            }
        } label: {
            ZStack {
                Circle().fill(AtelierTheme.accent).frame(width: 34, height: 34)
                if chat.sending { ProgressView().tint(Color(uiColor: .systemBackground)) }
                else { Image(systemName: chat.running && !hasDraft ? "stop.fill" : "arrow.up").font(.system(size: 15, weight: .semibold)).foregroundStyle(Color(uiColor: .systemBackground)) }
            }.frame(width: 44, height: 44)
        }.buttonStyle(.plain)
            .disabled(chat.sending || (!chat.running && !hasDraft))
            .accessibilityLabel(chat.running ? (hasDraft ? "Ajouter à la file d’attente" : "Arrêter la réponse") : "Envoyer au Mac")
    }

}

private struct NativeModelSheet: View {
    @Bindable var chat: RemoteChatModel
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Form {
                Section("Modèle") {
                    Picker("Modèle", selection: $chat.model) {
                        if !chat.model.isEmpty && !(chat.provider?.models.contains(chat.model) ?? false) { Text(chat.model).tag(chat.model) }
                        ForEach(chat.provider?.models ?? [], id: \.self) { Text(chat.provider?.modelLabels?[$0] ?? $0).tag($0) }
                    }.pickerStyle(.inline).labelsHidden()
                }
                Section("Réflexion") {
                    Picker("Effort", selection: $chat.effort) {
                        Text("Automatique").tag("")
                        ForEach(chat.provider?.efforts ?? [], id: \.self) { ThinkingEffortIndicator(effort: $0).tag($0) }
                    }
                }
            }.navigationTitle("Modèle et réflexion").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fermer") { dismiss() } } }
        }.presentationDetents([.medium, .large])
    }
}
