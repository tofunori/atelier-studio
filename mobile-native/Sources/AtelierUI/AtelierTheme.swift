import SwiftUI

/// One preference store for SwiftUI, UIKit and embedded readers.
enum AtelierTheme {
    static func accent(named name: String) -> Color {
        let colors: ([CGFloat], [CGFloat]) = switch name {
        case "blue": ([0.24,0.38,0.48], [0.66,0.80,0.88])
        case "amber": ([0.50,0.37,0.20], [0.87,0.76,0.59])
        case "rose": ([0.52,0.35,0.33], [0.87,0.71,0.68])
        case "graphite": ([0.33,0.36,0.35], [0.80,0.82,0.81])
        default: ([0.31,0.38,0.26], [0.76,0.82,0.68])
        }
        return Color(uiColor: UIColor { traits in
            let c = traits.userInterfaceStyle == .dark ? colors.1 : colors.0
            return UIColor(red: c[0], green: c[1], blue: c[2], alpha: 1)
        })
    }
    static var accent: Color { accent(named: UserDefaults.standard.string(forKey: "atelier.accent") ?? "sage") }
    static let surface = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark ? UIColor(white: 0.065, alpha: 1) : .secondarySystemBackground
    })
    @MainActor static func confirmation(_ key: String = "sendHaptic") {
        let defaults = UserDefaults.standard
        guard defaults.object(forKey: "atelier.haptics") as? Bool != false,
              defaults.object(forKey: "atelier." + key) as? Bool != false else { return }
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
    }
    static func textScale(_ value: String) -> CGFloat { value == "large" ? 1.15 : value == "small" ? 0.9 : 1 }
}

struct AtelierSettingsView: View {
    @AppStorage("atelier.appearance") private var appearance = "system"
    @AppStorage("atelier.accent") private var accent = "sage"
    @AppStorage("atelier.textSize") private var textSize = "standard"
    @AppStorage("atelier.density") private var density = "comfortable"
    @AppStorage("atelier.readingFont") private var readingFont = "serif"
    @AppStorage("atelier.contrast") private var contrast = false
    @AppStorage("atelier.motion") private var motion = "native"
    @AppStorage("atelier.haptics") private var haptics = true
    @AppStorage("atelier.sendHaptic") private var sendHaptic = true
    @AppStorage("atelier.approvalHaptic") private var approvalHaptic = true
    @AppStorage("atelier.follow") private var follow = true
    @AppStorage("atelier.activityExpanded") private var activityExpanded = false
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Form {
                Section("Apparence") {
                    Picker("Thème", selection: $appearance) {
                        Text("Système").tag("system"); Text("Clair").tag("light"); Text("Sombre").tag("dark")
                    }.pickerStyle(.segmented)
                    Picker("Accent", selection: $accent) {
                        Text("Sauge").tag("sage"); Text("Ardoise").tag("blue"); Text("Ambre").tag("amber")
                        Text("Argile").tag("rose"); Text("Graphite").tag("graphite")
                    }
                    ThemeConversationPreview(accent: AtelierTheme.accent(named: accent))
                }
                Section("Lecture") {
                    Picker("Texte", selection: $textSize) { Text("Petit").tag("small"); Text("Standard").tag("standard"); Text("Grand").tag("large") }
                    Picker("Densité", selection: $density) { Text("Aérée").tag("comfortable"); Text("Compacte").tag("compact") }
                    Picker("Police du lecteur", selection: $readingFont) { Text("Éditoriale").tag("serif"); Text("Système").tag("sans") }
                    Toggle("Contraste renforcé", isOn: $contrast)
                    Text("La taille du texte respecte aussi les réglages d’accessibilité d’iOS.").font(.footnote).foregroundStyle(.secondary)
                }
                Section("Mouvement et retours") {
                    Picker("Animations", selection: $motion) { Text("Naturelles").tag("native"); Text("Discrètes").tag("soft"); Text("Réduites").tag("off") }
                    Toggle("Retours tactiles", isOn: $haptics)
                    Toggle("Message envoyé", isOn: $sendHaptic).disabled(!haptics)
                    Toggle("Action confirmée", isOn: $approvalHaptic).disabled(!haptics)
                    Button("Essayer le retour tactile") { AtelierTheme.confirmation() }
                    Text("Réduire les animations dans iOS reste prioritaire.").font(.footnote).foregroundStyle(.secondary)
                }
                Section("Chat") {
                    Toggle("Suivre la réponse", isOn: $follow)
                    Toggle("Développer l’activité", isOn: $activityExpanded)
                    NavigationLink("Notifications") { NativeNotificationSettings() }
                }
                Section("Raccourcis sur iPad") {
                    LabeledContent("Rechercher", value: "⌘ F")
                    LabeledContent("Réglages", value: "⌘ ,")
                    LabeledContent("Galerie", value: "⌘ 2")
                    LabeledContent("Articles", value: "⌘ 3")
                }
            }.tint(AtelierTheme.accent(named: accent)).navigationTitle("Réglages").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fermer") { dismiss() } } }
        }
        .preferredColorScheme(appearance == "dark" ? .dark : appearance == "light" ? .light : nil)
    }
}

/// Uses the same adaptive surfaces as the conversation, inside the settings presentation.
private struct ThemeConversationPreview: View {
    let accent: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Aperçu du chat").font(.caption).foregroundStyle(.secondary)
            Text("Peux-tu éclaircir ce passage ?")
                .padding(12).background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
                .frame(maxWidth: .infinity, alignment: .trailing)
            VStack(alignment: .leading, spacing: 6) {
                Text("Atelier").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                Text("Oui. On peut préciser l’idée principale, puis expliquer ce qui la soutient.")
                Label("Voir la source", systemImage: "doc.text").font(.footnote).foregroundStyle(accent)
            }
            HStack {
                Image(systemName: "plus")
                Text("Message à Atelier").foregroundStyle(.secondary)
                Spacer(minLength: 0)
                Image(systemName: "arrow.up").font(.body.weight(.semibold)).foregroundStyle(Color(uiColor: .systemBackground))
                    .frame(width: 32, height: 32).background(accent, in: Circle())
            }.padding(10).background(AtelierTheme.surface, in: RoundedRectangle(cornerRadius: 22))
        }.padding(14).background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: 18))
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("themeConversationPreview")
    }
}
