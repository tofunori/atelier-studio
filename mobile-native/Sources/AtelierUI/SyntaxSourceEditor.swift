import SwiftUI
import UIKit

/// Lightweight lexical colouring shared by thumbnails and the editable source.
@MainActor enum SourceSyntax {
    struct Rule { let pattern: String; let color: UIColor }
    static func rules(for name: String) -> [Rule] {
        let ext = (name as NSString).pathExtension.lowercased()
        if ["tex", "bib", "sty", "cls"].contains(ext) {
            return [
                Rule(pattern: #"\\(?:[a-zA-Z@]+|.)"#, color: .systemBlue),
                Rule(pattern: #"%[^\n]*"#, color: .secondaryLabel),
                Rule(pattern: #"\$[^$\n]*\$"#, color: .systemPurple),
                Rule(pattern: #"[{}\[\]]"#, color: .systemOrange)
            ]
        }
        let hashComments = ["py", "r", "sh", "bash", "yaml", "yml", "toml"].contains(ext)
        let comment = hashComments ? #"#[^\n]*"# : #"//[^\n]*|/\*[\s\S]*?\*/"#
        let keywords: String
        switch ext {
        case "py": keywords = "False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|match|case"
        case "r": keywords = "function|if|else|for|while|repeat|in|next|break|TRUE|FALSE|NULL|NA|NaN|Inf"
        case "swift": keywords = "import|struct|class|enum|func|let|var|if|else|guard|return|switch|case|async|await|throw|throws|try|public|private|true|false|nil"
        case "js", "jsx", "ts", "tsx", "rs": keywords = "import|export|from|const|let|var|function|class|interface|type|if|else|for|while|return|async|await|try|catch|throw|new|true|false|null|undefined|fn|pub|impl|use|match|mut|self"
        case "json", "yaml", "yml": keywords = "true|false|null"
        default: keywords = ""
        }
        guard !["txt", "md", "csv", "tsv"].contains(ext) else {
            return ext == "md" ? [Rule(pattern: #"(?m)^#{1,6}\s[^\n]*|`[^`\n]+`"#, color: .systemBlue)] : []
        }
        var rules = [
            Rule(pattern: comment, color: .secondaryLabel),
            Rule(pattern: #"\"\"\"[\s\S]*?\"\"\"|'''[\s\S]*?'''|\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'"#, color: .systemGreen)
        ]
        if !keywords.isEmpty { rules.append(Rule(pattern: "\\b(?:\(keywords))\\b", color: .systemPurple)) }
        rules.append(Rule(pattern: #"\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b"#, color: .systemOrange))
        return rules
    }
    static func attributed(_ text: String, name: String, size: CGFloat = 15) -> NSAttributedString {
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineBreakMode = .byWordWrapping
        paragraph.lineSpacing = 3
        let result = NSMutableAttributedString(string: text, attributes: [
            .paragraphStyle: paragraph,
            .font: UIFontMetrics(forTextStyle: .body).scaledFont(for: UIFont.monospacedSystemFont(ofSize: size, weight: .regular)), .foregroundColor: UIColor.label
        ])
        let rules = rules(for: name)
        guard !rules.isEmpty else { return result }
        let pattern = rules.enumerated().map { "(?<t\($0.offset)>\($0.element.pattern))" }.joined(separator: "|")
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return result }
        // Bound lexical work for large source files; the rest stays editable plain text.
        let prefix = String(text.prefix(200_000))
        let range = NSRange(prefix.startIndex..<prefix.endIndex, in: prefix)
        regex.enumerateMatches(in: text, range: range) { match, _, _ in
            guard let match else { return }
            for (index, rule) in rules.enumerated() where match.range(withName: "t\(index)").location != NSNotFound {
                result.addAttribute(.foregroundColor, value: rule.color, range: match.range)
                break
            }
        }
        return result
    }
}

struct SyntaxSourceEditor: UIViewRepresentable {
    let workspace: WorkspaceModel
    var changedRanges: [NSRange] = []
    var revealRange: NSRange? = nil
    var revealRequest: UUID? = nil
    @AppStorage("atelier.accent") private var accentName = "sage"
    func makeCoordinator() -> Coordinator { Coordinator(workspace: workspace) }
    func makeUIView(context: Context) -> UITextView {
        let view = PositionRestoringSourceView()
        view.delegate = context.coordinator
        view.isEditable = workspace.editingSource
        view.adjustsFontForContentSizeCategory = true
        view.backgroundColor = .systemBackground
        view.autocorrectionType = .no; view.autocapitalizationType = .none
        view.smartQuotesType = .no; view.smartDashesType = .no; view.smartInsertDeleteType = .no
        view.textContainerInset = UIEdgeInsets(top: 12, left: 12, bottom: 20, right: 12)
        view.textContainer.widthTracksTextView = true
        view.textContainer.lineBreakMode = .byWordWrapping
        view.alwaysBounceHorizontal = false
        view.showsHorizontalScrollIndicator = false
        view.keyboardDismissMode = .interactive
        view.accessibilityIdentifier = "latexSource"
        context.coordinator.update(view, changedRanges: changedRanges)
        return view
    }
    func updateUIView(_ view: UITextView, context: Context) {
        view.isEditable = workspace.editingSource
        context.coordinator.update(view, changedRanges: changedRanges)
        if context.coordinator.revealRequest != revealRequest, let revealRange {
            context.coordinator.revealRequest = revealRequest
            (view as? PositionRestoringSourceView)?.restoreOffset = nil
            view.layoutIfNeeded()
            if NSMaxRange(revealRange) <= view.text.utf16.count { view.scrollRangeToVisible(revealRange) }
        }
    }

    @MainActor final class Coordinator: NSObject, UITextViewDelegate {
        let workspace: WorkspaceModel
        var documentID: UUID?
        var applying = false
        var noteIDs: [UUID] = []
        var accentName: String?
        var changedRanges: [NSRange] = []
        var revealRequest: UUID?
        init(workspace: WorkspaceModel) { self.workspace = workspace }
        func update(_ view: UITextView, changedRanges: [NSRange] = []) {
            let notes = workspace.documentReadingNotes
            let currentAccent = UserDefaults.standard.string(forKey: "atelier.accent") ?? "sage"
            let accent = UIColor(AtelierTheme.accent(named: "sage"))
            view.tintColor = accent
            guard documentID != workspace.documentID || view.text != workspace.source || noteIDs != notes.map(\.id) || accentName != currentAccent || self.changedRanges != changedRanges else { return }
            self.changedRanges = changedRanges
            accentName = currentAccent
            noteIDs = notes.map(\.id)
            let changedDocument = documentID != workspace.documentID
            applying = true
            let old = view.selectedRange
            let oldOffset = (view as? PositionRestoringSourceView)?.restoreOffset ?? view.contentOffset
            let styled = NSMutableAttributedString(attributedString: SourceSyntax.attributed(workspace.source, name: workspace.sourceName))
            for range in changedRanges where range.location != NSNotFound && NSMaxRange(range) <= styled.length {
                styled.addAttribute(.backgroundColor, value: UIColor.systemOrange.withAlphaComponent(0.12), range: range)
            }
            for note in notes {
                if let range = note.resolvedRange(in: workspace.source) {
                    styled.addAttributes([
                        .backgroundColor: accent.withAlphaComponent(0.3),
                        .underlineStyle: NSUnderlineStyle.single.rawValue,
                        .underlineColor: accent
                    ], range: range)
                }
            }
            view.attributedText = styled
            documentID = workspace.documentID
            if let selection = workspace.selection, case .selection(let range) = selection.indices {
                view.selectedRange = NSRange(range, in: workspace.source)
            } else if changedDocument { view.selectedRange = NSRange(location: 0, length: 0) }
            else if NSMaxRange(old) <= view.text.utf16.count { view.selectedRange = old }
            if changedDocument {
                (view as? PositionRestoringSourceView)?.restoreOffset = workspace.sourceOffsets[workspace.documentID] ?? .zero
                view.setNeedsLayout()
            } else {
                (view as? PositionRestoringSourceView)?.restoreOffset = oldOffset
                view.setNeedsLayout()
            }
            applying = false
        }
        func scrollViewDidScroll(_ scrollView: UIScrollView) {
            guard !applying, let documentID, documentID == workspace.documentID,
                  workspace.surface == .document, workspace.documentMode == .source,
                  (scrollView as? PositionRestoringSourceView)?.restoreOffset == nil else { return }
            workspace.sourceOffsets[documentID] = scrollView.contentOffset
        }
        func textView(_ view: UITextView, editMenuForTextIn range: NSRange, suggestedActions: [UIMenuElement]) -> UIMenu? {
            guard let selected = Range(range, in: workspace.source), range.length > 0 else { return UIMenu(children: suggestedActions) }
            let action = UIAction(title: "Annoter", image: UIImage(systemName: "highlighter")) { [weak self, weak view] _ in
                guard let self else { return }
                self.workspace.selection = TextSelection(range: selected)
                self.workspace.beginAnnotation()
                view?.resignFirstResponder()
            }
            let addToChat = UIAction(title: "Ajouter au chat", image: UIImage(systemName: "text.quote")) { [weak self, weak view] _ in
                guard let self else { return }
                self.workspace.selection = TextSelection(range: selected)
                guard let passage = self.workspace.activePassage else { return }
                view?.resignFirstResponder()
                Task { @MainActor in
                    await Task.yield()
                    self.workspace.addDocumentPassageToChat(passage)
                }
            }
            return UIMenu(children: [addToChat, action] + suggestedActions)
        }
        func textViewDidChange(_ view: UITextView) {
            guard !applying else { return }
            workspace.source = view.text
            guard view.markedTextRange == nil else { return }
            applying = true
            let selected = view.selectedRange
            let styled = SourceSyntax.attributed(view.text, name: workspace.sourceName)
            view.textStorage.beginEditing()
            styled.enumerateAttributes(in: NSRange(location: 0, length: styled.length)) { attributes, range, _ in
                view.textStorage.setAttributes(attributes, range: range)
            }
            view.textStorage.endEditing()
            view.selectedRange = selected
            view.typingAttributes = [.font: UIFont.monospacedSystemFont(ofSize: 15, weight: .regular), .foregroundColor: UIColor.label]
            applying = false
            textViewDidChangeSelection(view)
        }
        func textViewDidChangeSelection(_ view: UITextView) {
            guard !applying else { return }
            guard view.selectedRange.length > 0,
                  let range = Range(view.selectedRange, in: workspace.source) else { workspace.selection = nil; return }
            workspace.selection = TextSelection(range: range)
        }
    }
}

final class PositionRestoringSourceView: UITextView {
    var restoreOffset: CGPoint?
    override func layoutSubviews() {
        super.layoutSubviews()
        guard let target = restoreOffset, bounds.width > 0, bounds.height > 0 else { return }
        layoutManager.ensureLayout(for: textContainer)
        let measuredHeight = sizeThatFits(CGSize(width: bounds.width, height: .greatestFiniteMagnitude)).height
        let contentHeight = max(contentSize.height, measuredHeight)
        setContentOffset(CGPoint(x: 0, y: min(max(0, target.y), max(0, contentHeight - bounds.height + adjustedContentInset.bottom))), animated: false)
        restoreOffset = nil
    }
}
