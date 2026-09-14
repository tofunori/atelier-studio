import SwiftUI

struct LatexReadingBlock: Identifiable {
    let id: Int
    let source: String
    let display: String
    let firstLine: Int
    let lastLine: Int

    func selectedSource(_ selected: String, occurrence: Int? = nil, occurrences: Int? = nil, anchor: NSRange? = nil) -> (text: String, firstLine: Int, lastLine: Int, range: NSRange, occurrence: Int, occurrences: Int)? {
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
        var matches: [NSRange] = [], cursor = 0
        while cursor < normalized.length {
            let found = normalized.range(of: needle, range: NSRange(location: cursor, length: normalized.length - cursor))
            if found.location == NSNotFound { break }
            matches.append(found); cursor = NSMaxRange(found)
        }
        let index: Int
        if let anchor {
            guard let found = matches.firstIndex(where: { offsets[$0.location] == anchor.location }) else { return nil }
            index = found
        } else if let occurrence, let occurrences {
            guard occurrences == matches.count, matches.indices.contains(occurrence) else { return nil }
            index = occurrence
        } else {
            guard matches.count == 1 else { return nil }; index = 0
        }
        let found = matches[index]
        guard NSMaxRange(found) <= offsets.count else { return nil }
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
        return (span, first, first + span.dropLast().filter { $0.isNewline }.count, NSRange(location: start, length: end-start), index, matches.count)
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
    var changedLines: Set<Int> = []
    var revealLine: Int? = nil
    var revealRequest: UUID? = nil
    @State private var selectionError = false
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 22) {
                ForEach(LatexReadingBlock.parse(workspace.source)) { block in
                    RichChatText(text: block.display, documentStyle: true,
                        onSelection: { use($0, in: block, annotate: false) },
                        onAnnotate: { use($0, in: block, annotate: true) },
                        highlights: highlights(in: block),
                        onHighlight: { id in
                            if let note = workspace.documentReadingNotes.first(where: { $0.id.uuidString == id }) {
                                workspace.annotationDraft = workspace.readingDraft(for: note)
                            }
                        }, onQuote: { use(RichTextSelection(text: $0), in: block, annotate: false) })
                        .padding(.leading, 10)
                        .background(changedLines.contains { (block.firstLine...block.lastLine).contains($0) } ? Color.orange.opacity(0.07) : .clear)
                        .overlay(alignment: .leading) {
                            if changedLines.contains(where: { (block.firstLine...block.lastLine).contains($0) }) {
                                RoundedRectangle(cornerRadius: 2).fill(Color.orange).frame(width: 3).accessibilityHidden(true)
                            }
                        }
                        .id(block.id)
                }
                Text("Lecture simplifiée · les références gardent leurs clés LaTeX. Les citations conservent le texte source.")
                    .font(.caption).foregroundStyle(.secondary)
            }.scrollTargetLayout().padding(20)
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
        .onChange(of: revealRequest) { _, _ in
            guard let revealLine else { return }
            let blocks = LatexReadingBlock.parse(workspace.source)
            guard let block = blocks.first(where: { $0.lastLine >= revealLine }) ?? blocks.last else { return }
            restoreTarget = nil; restoredPosition = true
            readingPosition.scrollTo(id: block.id, anchor: .top)
        }
        .alert("Sélection à préciser", isPresented: $selectionError) {
            Button("Ouvrir la source") { workspace.documentMode = .source }
            Button("Annuler", role: .cancel) {}
        } message: { Text("Ce passage ne correspond pas à une portion unique du LaTeX. Sélectionnez un passage plus long, ou annotez-le dans la source.") }
    }
    private func blockOffset(_ block: LatexReadingBlock) -> Int {
        workspace.source.components(separatedBy: "\n").prefix(block.firstLine - 1).reduce(0) { $0 + $1.utf16.count + 1 }
    }
    private func use(_ selection: RichTextSelection, in block: LatexReadingBlock, annotate: Bool) {
        guard let source = block.selectedSource(selection.text, occurrence: selection.occurrence, occurrences: selection.occurrences) else {
            selectionError = true; return
        }
        let passage = DocumentPassage(documentID: workspace.documentID, fileName: workspace.sourceName,
            location: source.firstLine == source.lastLine ? "ligne \(source.firstLine)" : "lignes \(source.firstLine)–\(source.lastLine)",
            text: source.text, sourceRange: NSRange(location: blockOffset(block) + source.range.location, length: source.range.length), selectedText: selection.text)
        if annotate { workspace.annotationDraft = AnnotationDraft(passage: passage) }
        else { workspace.addDocumentPassageToChat(passage) }
    }
    private func highlights(in block: LatexReadingBlock) -> [RichTextHighlight] {
        let offset = blockOffset(block)
        return workspace.documentReadingNotes.compactMap { note in
            guard let range = note.resolvedRange(in: workspace.source), range.location >= offset,
                  NSMaxRange(range) <= offset + block.source.utf16.count else { return nil }
            if let mapped = block.selectedSource(note.selectedText,
                anchor: NSRange(location: range.location - offset, length: range.length)), mapped.range.length == range.length {
                return RichTextHighlight(id: note.id.uuidString, text: note.selectedText, occurrence: mapped.occurrence, occurrences: mapped.occurrences, style: note.style, ink: note.color)
            }
            return nil
        }
    }
}
