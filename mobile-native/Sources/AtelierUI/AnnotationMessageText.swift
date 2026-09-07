import SwiftUI

struct AnnotationMessageText: View {
    let text: String
    var compactWidth = false
    let onQuote: (String) -> Void
    @State private var expanded = false
    private var parts: (citation: String, passage: String, note: String)? {
        guard text.hasPrefix("Document : ") || text.hasPrefix("Article Zotero : "),
              let document = text.range(of: "Document : "),
              let quote = text.range(of: "\n\nPassage cité :\n> ", range: document.upperBound..<text.endIndex),
              let note = text.range(of: "\n\nMa note :\n", range: quote.upperBound..<text.endIndex) else { return nil }
        var message = String(text[note.upperBound...])
        if let attachments = message.range(of: "\n\nPièces jointes : ") { message = String(message[..<attachments.lowerBound]) }
        return (String(text[document.upperBound..<quote.lowerBound]), String(text[quote.upperBound..<note.lowerBound]).replacingOccurrences(of: "\n> ", with: "\n"), message)
    }
    var body: some View {
        if let parts {
            VStack(alignment: .leading, spacing: 10) {
                Text(parts.citation).font(.caption).foregroundStyle(.secondary)
                HStack(alignment: .top, spacing: 8) {
                    Rectangle().fill(AtelierTheme.accent).frame(width: 2)
                    Button { expanded.toggle() } label: {
                        Text(parts.passage).font(.subheadline).foregroundStyle(.secondary).lineLimit(expanded ? nil : 2)
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }.buttonStyle(.plain).accessibilityLabel("Déplier ou replier la citation")
                }.fixedSize(horizontal: false, vertical: true)
                SelectableChatText(text: parts.note, onQuote: onQuote)
            }
        } else { SelectableChatText(text: text, fitsContentWidth: compactWidth, onQuote: onQuote) }
    }
}
