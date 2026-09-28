import SwiftUI

/// The Mac viewer's six marking colours (`HL_COLORS` in pdf_viewer.html), in
/// its order and with its labels. Raw values are the Mac's colour names
/// (`normalizeHighlightColor`). Archives and drafts written with the former
/// palette (sage, sand, blue) still decode.
enum AnnotationInk: String, Codable, CaseIterable {
    case amber, green, blue, red, orange, violet
    /// New marks start with the Mac viewer's first colour.
    static var initial: AnnotationInk { .amber }
    /// Marks saved before colours existed were drawn in sage, now green.
    static var legacy: AnnotationInk { .green }
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        // An unknown name must not make a whole annotation archive unreadable.
        self = AnnotationInk(stored: raw) ?? .legacy
    }
    /// Current raw values plus the names of the former three-colour palette.
    init?(stored raw: String) {
        switch raw {
        case "sage": self = .green
        case "sand": self = .amber
        default:
            guard let ink = AnnotationInk(rawValue: raw) else { return nil }
            self = ink
        }
    }
    var title: String {
        switch self {
        case .amber: "Jaune"
        case .green: "Vert"
        case .blue: "Bleu"
        case .red: "Rose"
        case .orange: "Orange"
        case .violet: "Violet"
        }
    }
    /// Same RGB as the Mac; each surface applies its own alpha for highlight or underline.
    var rgb: (red: Int, green: Int, blue: Int) {
        switch self {
        case .amber: (red: 255, green: 213, blue: 74)
        case .green: (red: 120, green: 220, blue: 140)
        case .blue: (red: 120, green: 170, blue: 255)
        case .red: (red: 255, green: 140, blue: 160)
        case .orange: (red: 255, green: 160, blue: 80)
        case .violet: (red: 185, green: 150, blue: 255)
        }
    }
    var uiColor: UIColor {
        let value = rgb
        return UIColor(red: CGFloat(value.red) / 255, green: CGFloat(value.green) / 255, blue: CGFloat(value.blue) / 255, alpha: 1)
    }
    var color: Color { Color(uiColor: uiColor) }
    /// Same hue, darkened in light mode so glyphs and thin rules stay legible
    /// on a light surface; the full tint in dark mode.
    var tint: Color {
        let value = rgb
        return Color(uiColor: UIColor { traits in
            let scale: CGFloat = traits.userInterfaceStyle == .dark ? 1 : 0.62
            return UIColor(red: CGFloat(value.red) / 255 * scale, green: CGFloat(value.green) / 255 * scale,
                           blue: CGFloat(value.blue) / 255 * scale, alpha: 1)
        })
    }
}

struct AnnotationPalette: View {
    @Binding var style: PDFMark.Style
    @Binding var ink: AnnotationInk
    var saveID: String
    var save: () -> Void
    var body: some View {
        // Six 44-pt swatches do not fit beside the styles and the save button
        // on an iPhone: the colours then take their own row, all visible.
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 0) {
                styleButtons
                Rectangle().fill(.primary.opacity(0.12)).frame(width: 1, height: 16).padding(.horizontal, 4)
                swatches
                Spacer(minLength: 0)
                saveButton
            }
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 0) {
                    styleButtons
                    Spacer(minLength: 0)
                    saveButton
                }
                HStack(spacing: 0) {
                    swatches
                    Spacer(minLength: 0)
                }
            }
        }.font(.system(size: 16, weight: .regular)).foregroundStyle(ink.tint).buttonStyle(.plain)
    }
    private var styleButtons: some View {
        ForEach(PDFMark.Style.allCases, id: \.self) { value in
            Button { style = value } label: {
                Image(systemName: value == .highlight ? "highlighter" : "underline")
                    .frame(width: 28, height: 28)
                    .background(style == value ? ink.color.opacity(0.22) : .clear, in: RoundedRectangle(cornerRadius: 7))
                    .frame(width: 44, height: 44)
            }.accessibilityLabel(value.title).accessibilityAddTraits(style == value ? .isSelected : [])
        }
    }
    private var swatches: some View {
        ForEach(AnnotationInk.allCases, id: \.self) { value in
            Button { ink = value } label: {
                Circle().fill(value.color).frame(width: 15, height: 15)
                    .overlay { if ink == value { Circle().stroke(value.tint, lineWidth: 1).padding(-4) } }
                    .frame(width: 44, height: 44)
            }.accessibilityLabel(value.title).accessibilityAddTraits(ink == value ? .isSelected : [])
        }
    }
    private var saveButton: some View {
        Button(action: save) {
            Image(systemName: "checkmark").font(.system(size: 13, weight: .medium))
                .frame(width: 28, height: 28).background(ink.color.opacity(0.24), in: Circle())
                .frame(width: 44, height: 44)
        }.accessibilityLabel("Enregistrer l’annotation").accessibilityIdentifier(saveID)
    }
}

struct AnnotationExcerpt: View {
    let text: String
    let ink: AnnotationInk
    var latex = false
    private var excerpt: String {
        guard latex else { return text }
        let prose = LatexReadingBlock.parse(text).map(\.display).joined(separator: " ")
            .replacingOccurrences(of: #"(?m)^#+\s*"#, with: "", options: .regularExpression)
        return (try? AttributedString(markdown: prose)).map { String($0.characters) } ?? text
    }
    var body: some View {
        Text(excerpt).font(.system(.footnote, design: .serif)).foregroundStyle(.secondary)
            .lineLimit(2).frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 10)
            .overlay(alignment: .leading) { Rectangle().fill(ink.tint.opacity(0.8)).frame(width: 1.5) }
    }
}

struct AnnotationCard: ViewModifier {
    func body(content: Content) -> some View {
        content.padding(.horizontal, 16).padding(.vertical, 6)
            .background(AtelierTheme.surface, in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(.primary.opacity(0.12), lineWidth: 0.5))
    }
}
