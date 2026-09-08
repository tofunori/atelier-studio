import SwiftUI

enum AnnotationInk: String, Codable, CaseIterable {
    case sage, sand, blue
    var title: String { switch self { case .sage: "Sauge"; case .sand: "Sable"; case .blue: "Bleu" } }
    var uiColor: UIColor {
        switch self {
        case .sage: UIColor(red: 0.40, green: 0.53, blue: 0.42, alpha: 1)
        case .sand: UIColor(red: 0.65, green: 0.52, blue: 0.33, alpha: 1)
        case .blue: UIColor(red: 0.40, green: 0.55, blue: 0.66, alpha: 1)
        }
    }
    var color: Color { Color(uiColor: uiColor) }
}

struct AnnotationPalette: View {
    @Binding var style: PDFMark.Style
    @Binding var ink: AnnotationInk
    var saveID: String
    var save: () -> Void
    var body: some View {
        HStack(spacing: 0) {
            ForEach(PDFMark.Style.allCases, id: \.self) { value in
                Button { style = value } label: {
                    Image(systemName: value == .highlight ? "highlighter" : "underline")
                        .frame(width: 28, height: 28)
                        .background(style == value ? ink.color.opacity(0.15) : .clear, in: RoundedRectangle(cornerRadius: 7))
                        .frame(width: 44, height: 44)
                }.accessibilityLabel(value.title).accessibilityAddTraits(style == value ? .isSelected : [])
            }
            Rectangle().fill(.primary.opacity(0.12)).frame(width: 1, height: 16).padding(.horizontal, 4)
            ForEach(AnnotationInk.allCases, id: \.self) { value in
                Button { ink = value } label: {
                    Circle().fill(value.color).frame(width: 15, height: 15)
                        .overlay { if ink == value { Circle().stroke(value.color, lineWidth: 1).padding(-4) } }
                        .frame(width: 44, height: 44)
                }.accessibilityLabel(value.title).accessibilityAddTraits(ink == value ? .isSelected : [])
            }
            Spacer(minLength: 0)
            Button(action: save) {
                Image(systemName: "checkmark").font(.system(size: 13, weight: .medium))
                    .frame(width: 28, height: 28).background(ink.color.opacity(0.16), in: Circle())
                    .frame(width: 44, height: 44)
            }.accessibilityLabel("Enregistrer l’annotation").accessibilityIdentifier(saveID)
        }.font(.system(size: 16, weight: .regular)).foregroundStyle(ink.color).buttonStyle(.plain)
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
            .overlay(alignment: .leading) { Rectangle().fill(ink.color.opacity(0.7)).frame(width: 1.5) }
    }
}

struct AnnotationCard: ViewModifier {
    func body(content: Content) -> some View {
        content.padding(.horizontal, 16).padding(.vertical, 6)
            .background(AtelierTheme.surface, in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(.primary.opacity(0.12), lineWidth: 0.5))
    }
}
