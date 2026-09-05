import SwiftUI

struct NativeChatView: View {
    @Bindable var workspace: WorkspaceModel
    @State private var scrollPosition: UUID?
    @FocusState private var composing: Bool

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 24) {
                Text("Exemple de conversation").font(.caption).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                HStack {
                    Spacer(minLength: 32)
                    Text("J’aimerais relire ce passage en gardant le document à côté.")
                        .padding(14)
                        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18))
                }
                VStack(alignment: .leading, spacing: 14) {
                    Label("Atelier", systemImage: "sparkle").font(.caption.weight(.semibold)).foregroundStyle(.orange)
                    Text("Sélectionnez un passage dans le PDF ou la source, touchez Annoter et ajoutez votre note. Le passage et sa référence seront joints au chat.")
                    Text("Votre brouillon reste ici pendant la lecture.")
                    Button {
                        workspace.surface = .document
                        composing = false
                    } label: { Label(workspace.currentName, systemImage: "doc.text") }
                    .buttonStyle(.bordered)
                }
                ForEach(workspace.messages) { message in
                    VStack(alignment: .trailing, spacing: 8) {
                        if let passage = message.passage {
                            VStack(alignment: .leading, spacing: 6) {
                                Label(passage.citation, systemImage: "text.quote").font(.caption.weight(.semibold))
                                Text(passage.text).font(.subheadline).foregroundStyle(.secondary)
                            }
                            .padding(.leading, 12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .overlay(alignment: .leading) { Rectangle().fill(.orange).frame(width: 2) }
                        }
                        Text(message.text).padding(14)
                            .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18))
                        Text(message.configuration.summary).font(.caption2).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .id(message.id)
                }
            }
            .scrollTargetLayout()
            .padding(20)
            .textSelection(.enabled)
        }
        .scrollPosition(id: $scrollPosition)
        .onChange(of: workspace.messages.count) { _, _ in
            scrollPosition = workspace.messages.last?.id
        }
        .onAppear { if let last = workspace.messages.last { scrollPosition = last.id } }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom, spacing: 0) { composer }
    }

    private var composer: some View {
        VStack(spacing: 8) {
            HStack(alignment: .bottom, spacing: 12) {
                TextField("Poursuivre la réflexion…", text: $workspace.draft, axis: .vertical)
                    .lineLimit(1...5).focused($composing)
                    .accessibilityIdentifier("chatDraft")
                Button {
                    workspace.send()
                    composing = false
                    scrollPosition = workspace.messages.last?.id
                } label: { Image(systemName: "arrow.up").fontWeight(.semibold).frame(width: 32, height: 32) }
                    .buttonStyle(.borderedProminent).buttonBorderShape(.circle)
                    .disabled(workspace.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityLabel("Ajouter le message local")
            }
            .padding(12)
            .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 24))
            ChatControls(workspace: workspace)
            if !workspace.configuration.tools.isEmpty {
                Text(ChatConfiguration.Tool.allCases.filter { workspace.configuration.tools.contains($0) }.map(\.rawValue).joined(separator: " · ") + " · au prochain envoi local")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            Text(workspace.feedback.isEmpty ? "Démonstration locale · aucun envoi au Mac" : workspace.feedback)
                .font(.caption2).foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
        .background(.background)
    }
}
