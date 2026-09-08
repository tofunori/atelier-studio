import SwiftUI

/// Both annotation notes and composer quotes retain their complete text in
/// history. Parse their envelopes only for presentation, never for transport.
struct AnnotationMessageParts: Equatable {
    let citation: String
    let passage: String
    let note: String

    init?(_ text: String, attachmentNames: [String] = []) {
        let lines = text.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
        var index = 0
        var annotationNoteEnvelope = false
        if lines.first?.hasPrefix("Article Zotero : ") == true { index += 1 }
        guard index < lines.count else { return nil }
        if lines[index].hasPrefix("Document : ") {
            citation = String(lines[index].dropFirst("Document : ".count))
            guard !citation.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
            index += 1
            while index < lines.count && lines[index].isEmpty { annotationNoteEnvelope = true; index += 1 }
            guard index < lines.count, lines[index] == "Passage cité :" else { return nil }
        } else if index == 0 && lines[index] == "Passage cité de la conversation :" {
            citation = "Passage de la conversation"
        } else { return nil }
        index += 1
        var quoted: [String] = []
        while index < lines.count {
            let line = lines[index]
            if line.hasPrefix("> ") { quoted.append(String(line.dropFirst(2))) }
            else if line == ">" { quoted.append("") }
            else { break }
            index += 1
        }
        guard !quoted.isEmpty, index == lines.count || lines[index].isEmpty else { return nil }
        passage = quoted.joined(separator: "\n")
        // Consume the envelope separator, keeping the user's paragraphs intact.
        if index < lines.count { index += 1 }
        if annotationNoteEnvelope && index < lines.count && lines[index] == "Ma note :" { index += 1 }
        var message = lines[index...].joined(separator: "\n")
        if !attachmentNames.isEmpty {
            let footer = "\n\nPièces jointes : " + attachmentNames.map { URL(fileURLWithPath: $0).lastPathComponent }.joined(separator: ", ")
            if message.hasSuffix(footer) { message.removeLast(footer.count) }
        }
        note = message
    }
}

struct AnnotationMessageText: View {
    let text: String
    var attachmentNames: [String] = []
    var compactWidth = false
    let onQuote: (String) -> Void
    @State private var showingPassage = false
    var body: some View {
        if let parts = AnnotationMessageParts(text, attachmentNames: attachmentNames) {
            VStack(alignment: .leading, spacing: 10) {
                Button { showingPassage = true } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "text.quote").font(.subheadline).foregroundStyle(.secondary)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(parts.citation).font(.caption.weight(.medium)).foregroundStyle(.primary).lineLimit(2)
                            Text("Voir le passage cité").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 4)
                        Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.secondary)
                    }.padding(10).frame(minHeight: 44)
                        .background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 10))
                        .contentShape(Rectangle())
                }.buttonStyle(.plain)
                    .accessibilityLabel("Passage cité : " + parts.citation)
                    .accessibilityHint("Afficher le texte complet")
                if !parts.note.isEmpty { SelectableChatText(text: parts.note, onQuote: onQuote) }
            }
            .sheet(isPresented: $showingPassage) {
                NavigationStack {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            Text(parts.citation).font(.subheadline).foregroundStyle(.secondary)
                            SelectableChatText(text: parts.passage) { passage in
                                onQuote(passage); showingPassage = false
                            }
                        }.padding(20).frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .navigationTitle("Passage cité").navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Copier", systemImage: "doc.on.doc") { UIPasteboard.general.string = parts.passage }
                                .accessibilityLabel("Copier le passage")
                        }
                        ToolbarItem(placement: .confirmationAction) { Button("Fermer") { showingPassage = false } }
                    }
                }.presentationDetents([.medium, .large])
            }
        } else { SelectableChatText(text: text, fitsContentWidth: compactWidth, onQuote: onQuote) }
    }
}
