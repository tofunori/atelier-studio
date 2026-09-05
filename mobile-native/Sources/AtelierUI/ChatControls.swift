import SwiftUI

struct ChatConfiguration {
    enum Thinking: String, CaseIterable, Identifiable {
        case automatic = "Auto", low = "Faible", medium = "Moyen", high = "Élevé"
        var id: String { rawValue }
    }
    enum Tool: String, CaseIterable, Identifiable {
        case web = "Recherche web", analysis = "Analyse de données"
        var id: String { rawValue }
        var icon: String { self == .web ? "globe" : "chart.xyaxis.line" }
        var shortName: String { self == .web ? "Web" : "Analyse" }
    }
    struct Model: Identifiable {
        let id: String
        let name: String
        let provider: String
    }
    // Preview fixtures from mobile/src/chat/providerCatalog.ts, not live availability.
    static let models = [
        Model(id: "gpt-5.5", name: "GPT-5.5", provider: "Codex"),
        Model(id: "gpt-5.6-sol", name: "GPT-5.6 Sol", provider: "Codex"),
        Model(id: "claude-opus-5", name: "Opus 5", provider: "Claude"),
        Model(id: "claude-fable-5-1", name: "Fable 5.1", provider: "Claude")
    ]
    var modelID = "gpt-5.5"
    var thinking: Thinking = .automatic
    var tools: Set<Tool> = []
    var modelName: String { Self.models.first { $0.id == modelID }?.name ?? modelID }
    var summary: String {
        ([modelName, "Réflexion : \(thinking.rawValue)"] + Tool.allCases.filter { tools.contains($0) }.map(\.shortName)).joined(separator: " · ")
    }
}

struct ChatControls: View {
    @Bindable var workspace: WorkspaceModel
    @State private var sheet: SettingsSheet?
    enum SettingsSheet: String, Identifiable { case models; var id: String { rawValue } }

    var body: some View {
        HStack(spacing: 14) {
            Menu {
                Button { workspace.importRequested = true } label: { Label("Ouvrir un PDF ou LaTeX", systemImage: "folder") }
                Section("Outils du prochain message") {
                    ForEach(ChatConfiguration.Tool.allCases) { tool in
                        Toggle(isOn: Binding(get: { workspace.configuration.tools.contains(tool) }, set: { enabled in
                            if enabled { workspace.configuration.tools.insert(tool) }
                            else { workspace.configuration.tools.remove(tool) }
                        })) { Label(tool.rawValue, systemImage: tool.icon) }
                    }
                }
            } label: { Image(systemName: "plus").frame(minWidth: 32, minHeight: 40) }
                .accessibilityLabel("Outils et documents")
            Button { sheet = .models } label: {
                HStack(spacing: 4) { Text(workspace.configuration.modelName); Image(systemName: "chevron.down").imageScale(.small) }
            }
            .accessibilityLabel("Modèle : \(workspace.configuration.modelName)")
            Spacer(minLength: 0)
            Menu {
                Picker("Niveau de réflexion", selection: $workspace.configuration.thinking) {
                    ForEach(ChatConfiguration.Thinking.allCases) { level in Text(level.rawValue).tag(level) }
                }
            } label: { Label(workspace.configuration.thinking.rawValue, systemImage: "brain") }
                .accessibilityLabel("Réflexion : \(workspace.configuration.thinking.rawValue)")
        }
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .sheet(item: $sheet) { _ in ModelPickerSheet(workspace: workspace) }
    }
}

private struct ModelPickerSheet: View {
    @Bindable var workspace: WorkspaceModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                ForEach(["Codex", "Claude"], id: \.self) { provider in
                    Section(provider) {
                        ForEach(ChatConfiguration.models.filter { $0.provider == provider }) { model in
                            Button {
                                workspace.configuration.modelID = model.id
                                dismiss()
                            } label: {
                                HStack {
                                    Text(model.name).foregroundStyle(.primary)
                                    Spacer()
                                    if workspace.configuration.modelID == model.id { Image(systemName: "checkmark") }
                                }
                            }
                            .accessibilityAddTraits(workspace.configuration.modelID == model.id ? .isSelected : [])
                        }
                    }
                }
                Section {
                    Text("Catalogue d’exemple. Les modèles, niveaux de réflexion et outils disponibles seront fournis par le Mac lors de la connexion.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Choisir le modèle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fermer") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}
