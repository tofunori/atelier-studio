import SwiftUI

enum ChatPermissionMode: String, CaseIterable, Identifiable {
    case ask = "default"
    case edits = "acceptEdits"
    case full = "bypassPermissions"
    var id: String { rawValue }
    var title: String {
        switch self {
        case .ask: "Demander confirmation"
        case .edits: "Modifications autorisées"
        case .full: "Accès complet"
        }
    }
    var detail: String {
        switch self {
        case .ask: "L’assistant demande votre accord pour les actions qui nécessitent une autorisation."
        case .edits: "Les fichiers du projet peuvent être modifiés. Certaines commandes et certains accès demandent encore votre accord."
        case .full: "Les outils s’exécutent sans demande de confirmation, avec un accès plus large au Mac."
        }
    }
}

struct ChatOptionsView: View {
    @Bindable var chat: RemoteChatModel
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(chat.title).font(.subheadline).foregroundStyle(.secondary)
                }
                Section {
                    ForEach(ChatPermissionMode.allCases) { mode in
                        if mode == .ask || chat.availablePermissionModes.contains(mode) {
                            Button {
                                chat.permissionMode = mode
                            } label: {
                                HStack(alignment: .top, spacing: 12) {
                                    Image(systemName: chat.permissionMode == mode ? "largecircle.fill.circle" : "circle")
                                        .font(.body).padding(.top, 2).frame(width: 20)
                                    VStack(alignment: .leading, spacing: 7) {
                                        HStack(spacing: 8) {
                                            Text(mode.title).font(.subheadline.weight(.medium))
                                            if mode == .full { Text("Auto").font(.caption2).foregroundStyle(.secondary) }
                                        }
                                        Text(mode.detail).font(.footnote).foregroundStyle(.secondary)
                                    }.frame(maxWidth: .infinity, alignment: .leading)
                                }.padding(.vertical, 9).contentShape(Rectangle())
                            }.buttonStyle(.plain).disabled(chat.sending)
                                .accessibilityAddTraits(chat.permissionMode == mode ? .isSelected : [])
                        }
                    }
                } header: { Text("Autorisations") } footer: {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Pour les prochains messages de cette conversation, y compris ceux en attente.")
                        if chat.running { Text("Le travail déjà lancé conserve son mode. Une demande d’accord en cours reste à traiter.") }
                        if chat.provider == nil { Text("Connexion au Mac nécessaire pour connaître les modes disponibles.") }
                        else if chat.availablePermissionModes.isEmpty { Text("Cet assistant ne propose pas de mode d’autorisation réglable.") }
                        if chat.permissionMode != .ask && !chat.availablePermissionModes.contains(chat.permissionMode) {
                            Text("Le mode conservé n’est plus disponible. Choisissez un autre mode avant d’envoyer.")
                        }
                    }
                }
            }
            .navigationTitle("Options du chat").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Terminé") { dismiss() } } }
        }
    }
}
