import SwiftUI

struct LatexReadingBlock: Identifiable {
    let id: Int
    let source: String
    let display: String
    let firstLine: Int
    let lastLine: Int

    func selectedSource(_ selected: String) -> (text: String, firstLine: Int, lastLine: Int)? {
        let raw = source as NSString
        let units = Array(source.utf16)
        var excluded = Set<Int>()
        for pattern in [#"\\(?:label)\{[^{}]*\}"#, #"\\[a-zA-Z@]+\*?"#] {
            guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
            for match in regex.matches(in: source, range: NSRange(location: 0, length: raw.length)) {
                excluded.formUnion(match.range.location..<NSMaxRange(match.range))
            }
        }
        var visible: [UInt16] = [], offsets: [Int] = []
        for (index, unit) in units.enumerated() {
            if excluded.contains(index) || [123,125,91,93,36].contains(Int(unit)) { continue }
            let whitespace = [9,10,13,32,126].contains(Int(unit))
            if whitespace && visible.last == 32 { continue }
            visible.append(whitespace ? 32 : unit); offsets.append(index)
        }
        let normalized = String(decoding: visible, as: UTF16.self) as NSString
        let needle = selected.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
            .replacingOccurrences(of: "[", with: "").replacingOccurrences(of: "]", with: "")
        guard !needle.isEmpty else { return nil }
        let found = normalized.range(of: needle)
        guard found.location != NSNotFound, NSMaxRange(found) <= offsets.count,
              normalized.range(of: needle, range: NSRange(location: NSMaxRange(found), length: normalized.length - NSMaxRange(found))).location == NSNotFound else { return nil }
        let start = offsets[found.location]
        var end = offsets[NSMaxRange(found) - 1] + 1
        var span = raw.substring(with: NSRange(location: start, length: end-start))
        var balance = span.filter { $0 == "{" }.count - span.filter { $0 == "}" }.count
        while balance > 0 && end < units.count && units[end] == 125 { end += 1; balance -= 1 }
        guard balance == 0 else { return nil }
        span = raw.substring(with: NSRange(location: start, length: end-start))
        var depth = 0
        for character in span {
            if character == "{" { depth += 1 }
            if character == "}" { depth -= 1 }
            if depth < 0 { return nil }
        }
        let first = firstLine + raw.substring(to: start).filter { $0.isNewline }.count
        return (span, first, first + span.dropLast().filter { $0.isNewline }.count)
    }

    static func parse(_ source: String) -> [Self] {
        var result: [Self] = []
        var lines: [String] = []
        var start = 1
        var inDocument = !source.contains("\\begin{document}")
        func flush(_ end: Int) {
            guard !lines.isEmpty else { return }
            let raw = lines.joined(separator: "\n")
            var prose = raw
            for (pattern, replacement) in [
                (#"(?m)^\s*%[^\n]*"#, ""),
                (#"\\(?:sub)*section\*?\{([^{}]*)\}"#, "## $1"),
                (#"\\(?:textbf|mathbf)\{([^{}]*)\}"#, "**$1**"),
                (#"\\(?:emph|textit)\{([^{}]*)\}"#, "*$1*"),
                (#"\\(?:label)\{[^{}]*\}"#, ""),
                (#"\\(?:cite\w*|ref|eqref)\{([^{}]*)\}"#, "[$1]"),
                (#"\\(?:begin|end)\{(?:itemize|enumerate)\}"#, ""),
                (#"\\item\s*"#, "\n- "),
                (#"\\%"#, "%"), (#"\\&"#, "&"), (#"~"#, " ")
            ] {
                prose = prose.replacingOccurrences(of: pattern, with: replacement, options: .regularExpression)
            }
            if !prose.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                result.append(Self(id: start, source: raw, display: prose, firstLine: start, lastLine: end))
            }
            lines = []
        }
        for (index, line) in source.components(separatedBy: "\n").enumerated() {
            if line.contains("\\begin{document}") { inDocument = true; continue }
            if line.contains("\\end{document}") { flush(index); break }
            guard inDocument else { continue }
            if line.trimmingCharacters(in: .whitespaces).isEmpty { flush(index); continue }
            if lines.isEmpty { start = index + 1 }
            lines.append(line)
        }
        flush(source.components(separatedBy: "\n").count)
        return result
    }
}

struct LatexReadingView: View {
    @State private var readingPosition = ScrollPosition(edge: .top)
    @State private var restoredPosition = false
    @State private var restoreTarget: Double?
    let workspace: WorkspaceModel
    @State private var selectionError = false
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 22) {
                ForEach(LatexReadingBlock.parse(workspace.source)) { block in
                    RichChatText(text: block.display, quoteTitle: "Annoter") { selected in
                        guard let source = block.selectedSource(selected) else { selectionError = true; return }
                        workspace.annotationDraft = AnnotationDraft(passage: DocumentPassage(documentID: workspace.documentID, fileName: workspace.sourceName,
                            location: source.firstLine == source.lastLine ? "ligne \(source.firstLine)" : "lignes \(source.firstLine)–\(source.lastLine)", text: source.text))
                    }
                        .contextMenu {
                            Button("Annoter ce paragraphe", systemImage: "highlighter") { annotate(block) }
                            Button("Reformuler avec l’agent", systemImage: "pencil.and.outline") { annotate(block, rewrite: true) }
                        }
                }
                Text("Lecture simplifiée · les références gardent leurs clés LaTeX. Les citations conservent le texte source.")
                    .font(.caption).foregroundStyle(.secondary)
            }.padding(20)
        }
        .scrollPosition($readingPosition)
        .onScrollGeometryChange(for: CGSize.self) { CGSize(width: $0.contentOffset.y, height: $0.contentSize.height) } action: { _, geometry in
            if let target = restoreTarget {
                if abs(geometry.width - target) < 2 { restoreTarget = nil; restoredPosition = true }
                else { readingPosition.scrollTo(y: target) }
            } else if restoredPosition { workspace.readingOffsets[workspace.documentID] = geometry.width; workspace.scheduleDocumentResume() }
        }
        .onScrollPhaseChange { _, phase in
            if phase == .tracking || phase == .interacting { restoreTarget = nil; restoredPosition = true }
        }
        .task(id: workspace.documentID) {
            restoredPosition = false
            let target = workspace.readingOffsets[workspace.documentID] ?? 0
            restoreTarget = target; readingPosition.scrollTo(y: target)
        }
        .alert("Sélection à préciser", isPresented: $selectionError) {
            Button("Ouvrir la source") { workspace.documentMode = .source }
            Button("Annuler", role: .cancel) {}
        } message: { Text("Ce passage ne correspond pas à une portion unique du LaTeX. Sélectionnez un passage plus long, ou annotez-le dans la source.") }
    }
    private func annotate(_ block: LatexReadingBlock, rewrite: Bool = false) {
        let passage = DocumentPassage(documentID: workspace.documentID, fileName: workspace.sourceName,
            location: block.firstLine == block.lastLine ? "ligne \(block.firstLine)" : "lignes \(block.firstLine)–\(block.lastLine)", text: block.source)
        let draft = AnnotationDraft(passage: passage)
        if rewrite { draft.note = "Propose une reformulation de ce passage en conservant son sens et ses commandes LaTeX. Donne le remplacement dans un bloc latex, sans modifier le fichier avant ma validation." }
        workspace.annotationDraft = draft
    }
}
