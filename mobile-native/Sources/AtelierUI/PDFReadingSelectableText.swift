import SwiftUI
import UIKit

struct PDFReadingHighlight {
    let range: NSRange
    let color: UIColor
    let underline: Bool
    var strikethrough: Bool = false
    /// The mark a tap on this passage opens, nil when it cannot be opened from the reading view.
    var markID: String? = nil
    var hasNote: Bool = false
}

/// UIKit exposes the exact UTF-16 selection, including repeated text, without Markdown conversion.
struct PDFReadingSelectableText: UIViewRepresentable {
    let text: String
    let font: UIFont
    let highlights: [PDFReadingHighlight]
    var levels: [Int8] = []
    /// Where the paragraph moves on to the next PDF page, with the label shown in the margin.
    var pageBreaks: [(offset: Int, label: String)] = []
    let onAnnotate: (NSRange) -> Void
    let onQuote: (NSRange) -> Void
    var onOpenMark: (String) -> Void = { _ in }
    var onFigure: (String) -> Void = { _ in }

    static let figureScheme = "atelier-figure"

    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> PDFReadingTextView {
        let view = PDFReadingTextView()
        view.isEditable = false; view.isSelectable = true; view.isScrollEnabled = false
        view.backgroundColor = .clear; view.textContainerInset = .zero; view.clipsToBounds = false
        view.textContainer.lineFragmentPadding = 0; view.delegate = context.coordinator
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.tapped(_:)))
        tap.cancelsTouchesInView = false; tap.delegate = context.coordinator
        view.addGestureRecognizer(tap)
        return view
    }
    func updateUIView(_ view: PDFReadingTextView, context: Context) {
        context.coordinator.parent = self
        let content = Self.attributed(text, font: font, levels: levels, highlights: highlights)
        view.linkTextAttributes = [.foregroundColor: UIColor(AtelierTheme.accent),
                                   .underlineStyle: NSUnderlineStyle.single.rawValue,
                                   .underlineColor: UIColor(AtelierTheme.accent).withAlphaComponent(0.45)]
        if !content.isEqual(to: view.attributedText) {
            let selection = view.selectedRange
            view.attributedText = content
            if NSMaxRange(selection) <= content.length { view.selectedRange = selection }
        }
        // SwiftUI refreshes this view when the reading appearance changes.
        let opacity = context.environment.colorScheme == .dark ? 0.30 : 0.28
        view.update(marks: highlights.filter { !$0.underline && !$0.strikethrough }.map { ($0.range, $0.color.withAlphaComponent(opacity)) },
                    notes: highlights.filter(\.hasNote).map { (NSMaxRange($0.range), $0.color.withAlphaComponent(1)) },
                    pageBreaks: pageBreaks, font: font)
    }

    /// Text with the reading font, its superscripts and subscripts, muted paragraph numbers, figure links,
    /// and the marks drawn as text attributes (underline, strikethrough). Highlights are drawn by the view.
    static func attributed(_ text: String, font: UIFont, levels: [Int8], highlights: [PDFReadingHighlight]) -> NSAttributedString {
        let paragraph = NSMutableParagraphStyle(); paragraph.lineSpacing = font.pointSize * 0.3
        let content = NSMutableAttributedString(string: text, attributes: [.font: font, .foregroundColor: UIColor.label, .paragraphStyle: paragraph])
        if levels.count == content.length {
            var index = 0
            while index < levels.count {
                let level = levels[index]
                var end = index + 1
                while end < levels.count && levels[end] == level { end += 1 }
                if level != 0 {
                    content.addAttributes([.font: font.withSize(font.pointSize * 0.7),
                                           .baselineOffset: level > 0 ? font.pointSize * 0.33 : -font.pointSize * 0.15],
                                          range: NSRange(location: index, length: end - index))
                }
                index = end
            }
        }
        let whole = NSRange(location: 0, length: content.length)
        if let number = try? NSRegularExpression(pattern: #"^\[\d{1,3}\]"#).firstMatch(in: text, range: whole) {
            content.addAttribute(.foregroundColor, value: UIColor.secondaryLabel, range: number.range)
        }
        let figures = try? NSRegularExpression(pattern: #"\b(?:Figures?|Figs?\.)\s?(\d{1,2})[a-z]?\b"#)
        for match in figures?.matches(in: text, range: whole) ?? [] {
            let number = (text as NSString).substring(with: match.range(at: 1))
            if let url = URL(string: "\(figureScheme)://\(number)") { content.addAttribute(.link, value: url, range: match.range) }
        }
        for mark in highlights where mark.range.location >= 0 && NSMaxRange(mark.range) <= content.length {
            if mark.strikethrough {
                content.addAttributes([.strikethroughStyle: NSUnderlineStyle.single.rawValue, .strikethroughColor: mark.color], range: mark.range)
            } else if mark.underline {
                content.addAttributes([.underlineStyle: NSUnderlineStyle.single.rawValue, .underlineColor: mark.color], range: mark.range)
            }
        }
        return content
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: PDFReadingTextView, context: Context) -> CGSize? {
        guard let width = proposal.width, width > 0 else { return nil }
        return CGSize(width: width, height: ceil(uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude)).height))
    }

    @MainActor final class Coordinator: NSObject, UITextViewDelegate, UIGestureRecognizerDelegate {
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

        func textView(_ textView: UITextView, primaryActionFor textItem: UITextItem, defaultAction: UIAction) -> UIAction? {
            guard case let .link(url) = textItem.content, url.scheme == PDFReadingSelectableText.figureScheme, let number = url.host() else {
                return defaultAction
            }
            let open = parent.onFigure
            return UIAction { _ in open(number) }
        }

        func textView(_ textView: UITextView, menuConfigurationFor textItem: UITextItem, defaultMenu: UIMenu) -> UITextItem.MenuConfiguration? {
            if case let .link(url) = textItem.content, url.scheme == PDFReadingSelectableText.figureScheme { return nil }
            return UITextItem.MenuConfiguration(menu: defaultMenu)
        }

        /// A tap on a marked passage opens its annotation, unless it lands on a figure link or ends a selection.
        @objc func tapped(_ gesture: UITapGestureRecognizer) {
            guard gesture.state == .ended, let view = gesture.view as? UITextView, view.selectedRange.length == 0,
                  let position = view.closestPosition(to: gesture.location(in: view)) else { return }
            let index = view.offset(from: view.beginningOfDocument, to: position)
            guard index >= 0, index < view.attributedText.length,
                  view.attributedText.attribute(.link, at: index, effectiveRange: nil) == nil,
                  let mark = parent.highlights.last(where: { NSLocationInRange(index, $0.range) }), let id = mark.markID else { return }
            parent.onOpenMark(id)
        }
        func gestureRecognizer(_ gesture: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
    }
}

/// Draws highlights as a soft marker under the text (rounded, one stroke per line, no stripes between lines),
/// plus the margin signs: a note at the end of an annotated passage, the page where the paragraph continues.
final class PDFReadingTextView: UITextView {
    private var marks: [(range: NSRange, color: UIColor)] = []
    private var notes: [(offset: Int, color: UIColor)] = []
    private var pageBreaks: [(offset: Int, label: String)] = []
    private var lineHeight: CGFloat = 20
    private var drawn: [CALayer] = []

    func update(marks: [(NSRange, UIColor)], notes: [(Int, UIColor)], pageBreaks: [(offset: Int, label: String)], font: UIFont) {
        self.marks = marks.map { (range: $0.0, color: $0.1) }; self.notes = notes.map { (offset: $0.0, color: $0.1) }
        self.pageBreaks = pageBreaks; lineHeight = font.lineHeight
        setNeedsLayout()
    }

    private func range(_ range: NSRange) -> UITextRange? {
        guard range.location >= 0, NSMaxRange(range) <= attributedText.length,
              let start = position(from: beginningOfDocument, offset: range.location),
              let end = position(from: start, offset: range.length) else { return nil }
        return textRange(from: start, to: end)
    }

    /// The line box of an offset: the caret of the character before it, so a mark ending a line stays on that line.
    private func line(at offset: Int) -> CGRect? {
        guard let position = position(from: beginningOfDocument, offset: max(0, min(offset, attributedText.length))) else { return nil }
        let caret = caretRect(for: position)
        return caret.isNull || caret.isInfinite ? nil : caret
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        drawn.forEach { $0.removeFromSuperlayer() }; drawn = []
        for mark in marks {
            guard let range = range(mark.range) else { continue }
            let path = UIBezierPath()
            for rect in selectionRects(for: range).map(\.rect) where rect.width > 0.5 && !rect.isNull && !rect.isInfinite {
                let box = CGRect(x: rect.minX - 1.5, y: rect.minY - 1, width: rect.width + 3, height: min(rect.height, lineHeight) + 2)
                path.append(UIBezierPath(roundedRect: box, cornerRadius: 4))
            }
            let layer = CAShapeLayer()
            layer.path = path.cgPath; layer.fillColor = mark.color.resolvedColor(with: traitCollection).cgColor
            self.layer.insertSublayer(layer, at: 0); drawn.append(layer)
        }
        let gutter = bounds.maxX + 4
        for note in notes {
            guard let caret = line(at: note.offset - 1), let symbol = UIImage(systemName: "text.bubble")?
                .applyingSymbolConfiguration(.init(pointSize: 11, weight: .regular)) else { continue }
            let size = CGSize(width: 14, height: 14)
            let color = note.color.resolvedColor(with: traitCollection)
            let image = UIGraphicsImageRenderer(size: size).image { _ in
                let scale = min(size.width / max(1, symbol.size.width), size.height / max(1, symbol.size.height))
                let fitted = CGSize(width: symbol.size.width * scale, height: symbol.size.height * scale)
                symbol.withTintColor(color, renderingMode: .alwaysOriginal)
                    .draw(in: CGRect(x: (size.width - fitted.width) / 2, y: (size.height - fitted.height) / 2, width: fitted.width, height: fitted.height))
            }
            let layer = CALayer()
            layer.frame = CGRect(x: gutter, y: caret.midY - size.height / 2, width: size.width, height: size.height)
            layer.contents = image.cgImage; layer.contentsGravity = .resizeAspect; layer.contentsScale = image.scale
            self.layer.addSublayer(layer); drawn.append(layer)
        }
        for item in pageBreaks {
            guard let caret = line(at: item.offset) else { continue }
            let text = CATextLayer()
            text.string = NSAttributedString(string: item.label, attributes: [
                .font: UIFont.systemFont(ofSize: 10, weight: .medium),
                .foregroundColor: UIColor.secondaryLabel.resolvedColor(with: traitCollection)])
            text.contentsScale = traitCollection.displayScale
            let size = CGSize(width: 30, height: 12)
            text.bounds = CGRect(origin: .zero, size: size); text.alignmentMode = .center
            text.position = CGPoint(x: gutter + 5, y: caret.midY)
            text.transform = CATransform3DMakeRotation(-.pi / 2, 0, 0, 1)
            self.layer.addSublayer(text); drawn.append(text)
        }
    }

    /// Margin signs sit outside the text; touches there still reach the reading list.
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool { bounds.contains(point) }
}
