import SwiftUI

struct NativeComposerView: View {
    @Bindable var workspace: WorkspaceModel
    var composing: FocusState<Bool>.Binding
    @State private var dictating = false
    @State private var steering = false
    @State private var choosingModel = false
    @State private var choosingEffort = false
    @State private var modelAfterEffort = false
    @State private var expandedQuote = false
    var body: some View {
        let chat = workspace.chat
        VStack(alignment: .leading, spacing: 8) {
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
            TextField("Poursuivre la réflexion…", text: $workspace.draft, axis: .vertical)
                .lineLimit(1...5).focused(composing).padding(.horizontal, 6).padding(.top, 4)
                .accessibilityIdentifier("chatDraft")
            HStack(spacing: 4) {
                ChatAttachMenu(workspace: workspace).frame(width: 44, height: 44).disabled(chat.sending || chat.running)
                Button { choosingModel = true } label: {
                    HStack(spacing: 5) {
                        Text(chat.provider?.modelLabels?[chat.model] ?? (chat.model.isEmpty ? "Modèle du Mac" : chat.model)).lineLimit(1)
                        Image(systemName: "chevron.down").font(.caption2)
                    }.font(.caption).frame(minHeight: 44)
                }.buttonStyle(.plain).foregroundStyle(.secondary).disabled(chat.sending || chat.running)
                    .accessibilityLabel("Choisir le modèle")
                    .accessibilityValue(chat.provider?.modelLabels?[chat.model] ?? chat.model)
                Button { choosingEffort = true } label: {
                    ThinkingEffortIndicator(effort: chat.effort, showLabel: false).frame(width: 36, height: 44)
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
                Button("Dicter", systemImage: "mic") { dictating = true }
                    .labelStyle(.iconOnly).frame(width: 44, height: 44).disabled(chat.sending)
                if chat.running && !workspace.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Menu {
                        Button("Après cette réponse", systemImage: "text.line.first.and.arrowtriangle.forward") { chat.enqueue(workspace: workspace) }
                        Button("Préciser le travail en cours", systemImage: "bubble") { steering = true }
                    } label: { Image(systemName: "arrow.up").frame(width: 44, height: 44) }.disabled(chat.sending)
                }
                Button {
                    if chat.running { Task { await chat.stop(using: workspace.gallery) } }
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
                        else { Image(systemName: chat.running ? "stop.fill" : "arrow.up").font(.system(size: 15, weight: .semibold)).foregroundStyle(Color(uiColor: .systemBackground)) }
                    }.frame(width: 44, height: 44)
                }.buttonStyle(.plain)
                    .disabled(chat.sending || (!chat.running && workspace.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && chat.attachments.isEmpty && chat.quote == nil))
                    .accessibilityLabel(chat.running ? "Arrêter la réponse" : "Envoyer au Mac")
            }
        }
        .padding(10).background(AtelierTheme.surface, in: RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(.primary.opacity(0.07), lineWidth: 1))
        .padding(.horizontal, 12).padding(.vertical, 8).background(.background)
        .sheet(isPresented: $dictating) { NativeDictationSheet(workspace: workspace) }
        .sheet(isPresented: $steering) { SteeringSheet(workspace: workspace) }
        .sheet(isPresented: $choosingModel) { NativeModelSheet(chat: chat) }
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
