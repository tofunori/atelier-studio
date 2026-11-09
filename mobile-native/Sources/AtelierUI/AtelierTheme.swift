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
    /// Raised surface behind floating controls: the paper card in both modes.
    static let surface = tone(0xfcfbf8, 0x1f1e1c)

    // Editorial direction (B, 2026-11-09): warm paper in light, ink in dark,
    // so reading Claude, an article or a figure feels like a printed page.
    private static func uiTone(_ light: UInt32, _ dark: UInt32) -> UIColor {
        UIColor { traits in
            let hex = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat(hex >> 16 & 0xff) / 255, green: CGFloat(hex >> 8 & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: 1)
        }
    }
    private static func tone(_ light: UInt32, _ dark: UInt32) -> Color { Color(uiColor: uiTone(light, dark)) }
    /// Reading surface: chat, gallery, articles.
    static let background = tone(0xf6f4ef, 0x161514)
    /// The reading surface for UIKit views laid over the chat (WebKit covers).
    static let backgroundUIColor = uiTone(0xf6f4ef, 0x161514)
    /// Recessed surface: code, logs, the PDF pasteboard.
    static let sidebar = tone(0xeeebe4, 0x11100f)
    static let recessedUIColor = uiTone(0xeeebe4, 0x11100f)
    /// Raised content: the user's message, previews, the resume card.
    static let card = tone(0xfcfbf8, 0x1f1e1c)
    /// Controls and fields.
    static let control = tone(0xe9e5dc, 0x292725)
    static let separator = tone(0xe2ddd3, 0x2a2826)
    static let secondaryText = tone(0x6b665e, 0x9b968d)
    static let tertiaryText = tone(0x9a948a, 0x6b665f)
    /// Soft shadow under raised paper: depth without a border.
    static let shadow = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark ? UIColor(white: 0, alpha: 0.5) : UIColor(red: 0.16, green: 0.12, blue: 0.08, alpha: 0.09)
    })
    /// The accent at low strength: selected rows and the primary action, never a white fill.
    static var accentSoft: Color { accent.opacity(0.14) }
    /// The editorial serif (New York) for what is read: titles of articles,
    /// conversations and figure captions, section headings.
    static func serif(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
        .system(style, design: .serif, weight: weight)
    }
    /// Selected tab and chips laid on glass.
    static let fill = Color.primary.opacity(0.07)
    /// Radii: controls, cards, then floating glass.
    static let controlRadius: CGFloat = 6
    static let cardRadius: CGFloat = 10
    @MainActor static func confirmation(_ key: String = "sendHaptic") {
        let defaults = UserDefaults.standard
        guard defaults.object(forKey: "atelier.haptics") as? Bool != false,
              defaults.object(forKey: "atelier." + key) as? Bool != false else { return }
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
    }
    static func textScale(_ value: String) -> CGFloat { value == "large" ? 1.15 : value == "small" ? 0.9 : 1 }
}

struct AtelierSettingsView: View {
    let gallery: GalleryModel
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
                Section {
                    Picker("Thème", selection: $appearance) {
                        Text("Système").tag("system"); Text("Clair").tag("light"); Text("Sombre").tag("dark")
                    }.pickerStyle(.segmented)
                    Picker("Accent", selection: $accent) {
                        Text("Sauge").tag("sage"); Text("Ardoise").tag("blue"); Text("Ambre").tag("amber")
                        Text("Argile").tag("rose"); Text("Graphite").tag("graphite")
                    }
                    ThemeConversationPreview(accent: AtelierTheme.accent(named: accent))
                } header: { Text("Apparence").atelierSectionHeading() }
                .listRowBackground(AtelierTheme.card)
                Section {
                    Picker("Texte", selection: $textSize) { Text("Petit").tag("small"); Text("Standard").tag("standard"); Text("Grand").tag("large") }
                    Picker("Densité", selection: $density) { Text("Aérée").tag("comfortable"); Text("Compacte").tag("compact") }
                    Picker("Police du lecteur", selection: $readingFont) { Text("Éditoriale").tag("serif"); Text("Système").tag("sans") }
                    Toggle("Contraste renforcé", isOn: $contrast)
                    Text("La taille du texte respecte aussi les réglages d’accessibilité d’iOS.").font(.footnote).foregroundStyle(.secondary)
                } header: { Text("Lecture").atelierSectionHeading() }
                .listRowBackground(AtelierTheme.card)
                Section {
                    Picker("Animations", selection: $motion) { Text("Naturelles").tag("native"); Text("Discrètes").tag("soft"); Text("Réduites").tag("off") }
                    Toggle("Retours tactiles", isOn: $haptics)
                    Toggle("Message envoyé", isOn: $sendHaptic).disabled(!haptics)
                    Toggle("Action confirmée", isOn: $approvalHaptic).disabled(!haptics)
                    Button("Essayer le retour tactile") { AtelierTheme.confirmation() }
                    Text("Réduire les animations dans iOS reste prioritaire.").font(.footnote).foregroundStyle(.secondary)
                } header: { Text("Mouvement et retours").atelierSectionHeading() }
                .listRowBackground(AtelierTheme.card)
                Section {
                    Toggle("Suivre la réponse", isOn: $follow)
                    Toggle("Développer l’activité", isOn: $activityExpanded)
                    NavigationLink("Notifications") { NativeNotificationSettings(gallery: gallery) }
                } header: { Text("Chat").atelierSectionHeading() }
                .listRowBackground(AtelierTheme.card)
                Section {
                    LabeledContent("Rechercher", value: "⌘ F")
                    LabeledContent("Réglages", value: "⌘ ,")
                    LabeledContent("Galerie", value: "⌘ 2")
                    LabeledContent("Articles", value: "⌘ 3")
                } header: { Text("Raccourcis sur iPad").atelierSectionHeading() }
                .listRowBackground(AtelierTheme.card)
            }.scrollContentBackground(.hidden).background(AtelierTheme.background)
            .tint(AtelierTheme.accent(named: accent)).navigationTitle("Réglages").navigationBarTitleDisplayMode(.large)
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
                .padding(12).atelierRaised()
                .frame(maxWidth: .infinity, alignment: .trailing)
            VStack(alignment: .leading, spacing: 6) {
                Text("Atelier").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                Text("Oui. On peut préciser l’idée principale, puis expliquer ce qui la soutient.").font(AtelierTheme.serif(.body))
                Label("Voir la source", systemImage: "doc.text").font(.footnote).foregroundStyle(accent)
            }
            HStack {
                Image(systemName: "plus")
                Text("Message à Atelier").foregroundStyle(.secondary)
                Spacer(minLength: 0)
                Image(systemName: "arrow.up").font(.body.weight(.semibold)).foregroundStyle(accent)
                    .frame(width: 32, height: 32).background(accent.opacity(0.14), in: Circle())
            }.padding(10).atelierRaised(cornerRadius: 22)
        }.padding(14).background(AtelierTheme.background, in: RoundedRectangle(cornerRadius: AtelierTheme.cardRadius))
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("themeConversationPreview")
    }
}

extension View {
    /// Liquid Glass for what floats over content: toolbar buttons, tabs, composer.
    func atelierGlass<S: Shape>(in shape: S, interactive: Bool = false) -> some View {
        glassEffect(interactive ? .regular.interactive() : .regular, in: shape)
    }
}

extension View {
    /// Paper laid on paper: the card colour and a soft two-layer shadow, no border.
    func atelierRaised(cornerRadius: CGFloat = AtelierTheme.cardRadius) -> some View {
        background(AtelierTheme.card, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .shadow(color: AtelierTheme.shadow, radius: 12, y: 4)
            .shadow(color: AtelierTheme.shadow, radius: 1.5, y: 1)
    }
    /// A section heading in the editorial serif, set in italics as in a journal.
    func atelierSectionHeading() -> some View {
        font(AtelierTheme.serif(.subheadline).italic()).foregroundStyle(AtelierTheme.secondaryText).textCase(nil)
    }
}

/// The main action: the accent at low strength with accent text. Never a white
/// or ink fill (Thierry, 2026-10-21).
struct AtelierPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(AtelierTheme.accent)
            .padding(.horizontal, 16).frame(minHeight: 44)
            .background(AtelierTheme.accentSoft, in: Capsule())
            .opacity(enabled ? (configuration.isPressed ? 0.7 : 1) : 0.45)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// A secondary action: a hairline outline, ink text.
struct AtelierSecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.medium))
            .foregroundStyle(Color.primary.opacity(0.85))
            .padding(.horizontal, 16).frame(minHeight: 44)
            .overlay { Capsule().strokeBorder(AtelierTheme.separator, lineWidth: 1) }
            .contentShape(Capsule())
            .opacity(enabled ? (configuration.isPressed ? 0.6 : 1) : 0.45)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == AtelierPrimaryButtonStyle {
    static var atelierPrimary: AtelierPrimaryButtonStyle { AtelierPrimaryButtonStyle() }
}
extension ButtonStyle where Self == AtelierSecondaryButtonStyle {
    static var atelierSecondary: AtelierSecondaryButtonStyle { AtelierSecondaryButtonStyle() }
}

/// Text tabs underlined by the accent, in place of filled chips or a segmented
/// control: Galerie, Calculs.
struct EditorialTabs<Value: Hashable>: View {
    let items: [(value: Value, title: String)]
    @Binding var selection: Value
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Namespace private var underline
    var body: some View {
        HStack(spacing: 20) {
            ForEach(items, id: \.value) { item in
                let selected = item.value == selection
                Button { selection = item.value } label: {
                    Text(item.title)
                        .font(.subheadline.weight(selected ? .medium : .regular))
                        .foregroundStyle(selected ? Color.primary : AtelierTheme.secondaryText)
                        .padding(.vertical, 10)
                        .overlay(alignment: .bottom) {
                            if selected {
                                Capsule().fill(AtelierTheme.accent).frame(height: 2)
                                    .matchedGeometryEffect(id: "underline", in: underline)
                            }
                        }
                        .frame(minHeight: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .animation(reduceMotion ? nil : .smooth(duration: 0.15), value: selection)
    }
}
