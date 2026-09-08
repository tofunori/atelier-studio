import SwiftUI
import UIKit

struct SelectableChatText: UIViewRepresentable {
    @AppStorage("atelier.textSize") private var textSize = "standard"
    let text: String
    var quoteTitle = "Ajouter au chat"
    var fitsContentWidth = false
    var onAnnotate: ((String) -> Void)? = nil
    let onQuote: (String) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }
    func makeUIView(context: Context) -> UITextView {
        let view = UITextView()
        view.isEditable = false
        view.isSelectable = true
        view.isScrollEnabled = false
        view.backgroundColor = .clear
        view.textContainerInset = .zero
        view.textContainer.lineFragmentPadding = 0
        view.font = .preferredFont(forTextStyle: .body)
        view.adjustsFontForContentSizeCategory = true
        view.delegate = context.coordinator
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return view
    }
    func updateUIView(_ view: UITextView, context: Context) {
        context.coordinator.parent = self
        if view.text != text { view.text = text }
        view.textColor = .label
        view.font = UIFontMetrics(forTextStyle: .body).scaledFont(for: .systemFont(ofSize: 17 * AtelierTheme.textScale(textSize)))
    }
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        guard let width = proposal.width, width > 0 else { return nil }
        let measuredWidth: CGFloat
        if fitsContentWidth {
            let bounds = (text as NSString).boundingRect(with: CGSize(width: width, height: .greatestFiniteMagnitude),
                options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: [.font: uiView.font ?? UIFont.preferredFont(forTextStyle: .body)], context: nil)
            measuredWidth = min(width, max(1, ceil(bounds.width) + 1))
        } else { measuredWidth = width }
        let measured = uiView.sizeThatFits(CGSize(width: measuredWidth, height: .greatestFiniteMagnitude))
        return CGSize(width: measuredWidth, height: ceil(measured.height))
    }
    static func passage(in text: String, range: NSRange) -> String? {
        let source = text as NSString
        guard range.location != NSNotFound, range.length > 0, range.location <= source.length,
              range.length <= source.length - range.location else { return nil }
        let passage = source.substring(with: range)
        return passage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : passage
    }
    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: SelectableChatText
        init(parent: SelectableChatText) { self.parent = parent }
        func textView(_ textView: UITextView, editMenuForTextIn range: NSRange, suggestedActions: [UIMenuElement]) -> UIMenu? {
            guard let selected = SelectableChatText.passage(in: textView.text, range: range) else { return UIMenu(children: suggestedActions) }
            let action = UIAction(title: parent.quoteTitle, image: UIImage(systemName: "text.quote")) { [weak self, weak textView] _ in
                textView?.selectedTextRange = nil
                textView?.resignFirstResponder()
                Task { @MainActor [weak self] in
                    await Task.yield()
                    self?.parent.onQuote(selected)
                }
            }
            var actions: [UIMenuElement] = [action]
            if let annotate = parent.onAnnotate {
                actions.append(UIAction(title: "Annoter", image: UIImage(systemName: "highlighter")) { [weak textView] _ in
                    textView?.selectedTextRange = nil; textView?.resignFirstResponder()
                    Task { @MainActor in await Task.yield(); annotate(selected) }
                })
            }
            return UIMenu(children: actions + suggestedActions)
        }
    }
}
