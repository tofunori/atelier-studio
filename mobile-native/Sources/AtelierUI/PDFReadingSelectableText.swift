import SwiftUI
import UIKit

struct PDFReadingHighlight {
    let range: NSRange
    let color: UIColor
    let underline: Bool
    var strikethrough: Bool = false
}

/// UIKit exposes the exact UTF-16 selection, including repeated text, without Markdown conversion.
struct PDFReadingSelectableText: UIViewRepresentable {
    let text: String
    let font: UIFont
    let highlights: [PDFReadingHighlight]
    let onAnnotate: (NSRange) -> Void
    let onQuote: (NSRange) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> UITextView {
        let view = UITextView()
        view.isEditable = false; view.isSelectable = true; view.isScrollEnabled = false
        view.backgroundColor = .clear; view.textContainerInset = .zero
        view.textContainer.lineFragmentPadding = 0; view.delegate = context.coordinator
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return view
    }
    func updateUIView(_ view: UITextView, context: Context) {
        context.coordinator.parent = self
        let paragraph = NSMutableParagraphStyle(); paragraph.lineSpacing = font.pointSize * 0.22
        let content = NSMutableAttributedString(string: text, attributes: [.font: font, .foregroundColor: UIColor.label, .paragraphStyle: paragraph])
        for mark in highlights where mark.range.location >= 0 && NSMaxRange(mark.range) <= content.length {
            if mark.strikethrough {
                content.addAttributes([.strikethroughStyle: NSUnderlineStyle.single.rawValue, .strikethroughColor: mark.color], range: mark.range)
            } else if mark.underline {
                content.addAttributes([.underlineStyle: NSUnderlineStyle.single.rawValue, .underlineColor: mark.color], range: mark.range)
            } else {
                // SwiftUI refreshes this view when the reading appearance changes.
                let opacity = context.environment.colorScheme == .dark ? 0.50 : 0.30
                let background = mark.color.withAlphaComponent(opacity)
                content.addAttribute(.backgroundColor, value: background, range: mark.range)
            }
        }
        if !content.isEqual(to: view.attributedText) {
            let selection = view.selectedRange
            view.attributedText = content
            if NSMaxRange(selection) <= content.length { view.selectedRange = selection }
        }
    }
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        guard let width = proposal.width, width > 0 else { return nil }
        return CGSize(width: width, height: ceil(uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude)).height))
    }
    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: PDFReadingSelectableText
        init(_ parent: PDFReadingSelectableText) { self.parent = parent }
        func textView(_ textView: UITextView, editMenuForTextIn range: NSRange, suggestedActions: [UIMenuElement]) -> UIMenu? {
            guard SelectableChatText.passage(in: parent.text, range: range) != nil else { return UIMenu(children: suggestedActions) }
            // Capture the current value: a delayed menu action cannot annotate a newly displayed block.
            let current = parent
            func action(_ title: String, icon: String, callback: @escaping (NSRange) -> Void) -> UIAction {
                UIAction(title: title, image: UIImage(systemName: icon)) { [weak textView] _ in
                    textView?.selectedTextRange = nil; textView?.resignFirstResponder()
                    Task { @MainActor in await Task.yield(); callback(range) }
                }
            }
            return UIMenu(children: [action("Annoter", icon: "highlighter", callback: current.onAnnotate),
                                    action("Ajouter au chat", icon: "text.quote", callback: current.onQuote)] + suggestedActions)
        }
    }
}
