import UIKit
import WebKit

/// A bounded, view-owned visual backup. UIKit can display it while WebKit wakes.
///
/// Two cases. `.loading`: WebKit has nothing to show (first load, content
/// process restarted), so the cover shows the last image of the message or,
/// failing that, a lightly formatted text stand-in on the reading surface.
/// `.resuming`: the app comes back to the foreground and WebKit still holds its
/// layers, so the cover only lays the last image over them and never a text
/// stand-in (raw text on a black block was the visible flash, 2026-11-01).
@MainActor final class RichTextContinuity {
    enum Reason { case loading, resuming }
    private final class Snapshot: NSObject {
        let image: UIImage; let rect: CGRect; let width: CGFloat
        init(image: UIImage, rect: CGRect, width: CGFloat) {
            self.image = image; self.rect = rect; self.width = width
        }
    }
    private static let snapshots: NSCache<NSString, Snapshot> = {
        let cache = NSCache<NSString, Snapshot>()
        cache.countLimit = 8; cache.totalCostLimit = 16 * 1024 * 1024
        return cache
    }()
    private let key = UUID().uuidString as NSString
    private weak var webView: WKWebView?
    private var cover: UIView?
    private var textView: UITextView?
    private var text = ""
    private var fontSize: CGFloat = 17
    private var reason = Reason.loading
    private var captureTask: Task<Void, Never>?
    private var lastCapture = Date.distantPast
    private var captureInProgress = false
    private var generation = 0
    private(set) var isCovered = false

    func attach(to view: WKWebView, text: String, fontSize: CGFloat) {
        detach()
        webView = view
        update(text: text, fontSize: fontSize)
        show()
    }
    func update(text: String, fontSize: CGFloat) {
        let textChanged = self.text != text, sizeChanged = self.fontSize != fontSize
        self.text = text; self.fontSize = fontSize
        // A streamed message keeps its last image: formatted and slightly behind
        // reads better than raw Markdown. Another text size reflows everything.
        if sizeChanged { Self.snapshots.removeObject(forKey: key) }
        if (textChanged || sizeChanged) && isCovered { show(reason) }
    }
    func show(_ requested: Reason = .loading) {
        guard let view = webView else { return }
        // WebKit still loading when the app leaves: it has nothing to show yet.
        let reason = isCovered && self.reason == .loading ? .loading : requested
        cover?.removeFromSuperview(); cover = nil; textView = nil; isCovered = false
        self.reason = reason
        let snapshot = Self.snapshots.object(forKey: key).flatMap { abs($0.width - view.bounds.width) < 1 ? $0 : nil }
        if reason == .resuming && snapshot == nil { return }
        let overlay = UIView(frame: view.bounds)
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        overlay.backgroundColor = .clear
        overlay.isUserInteractionEnabled = false
        if let snapshot {
            let image = UIImageView(image: snapshot.image)
            image.frame = snapshot.rect; image.backgroundColor = AtelierTheme.backgroundUIColor
            overlay.addSubview(image)
        } else {
            let fallback = UITextView(frame: overlay.bounds)
            fallback.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            fallback.backgroundColor = .clear; fallback.isEditable = false; fallback.isScrollEnabled = false
            fallback.textContainerInset = .zero; fallback.textContainer.lineFragmentPadding = 0
            fallback.attributedText = Self.standIn(for: text, fontSize: fontSize)
            fallback.isUserInteractionEnabled = false
            overlay.addSubview(fallback); textView = fallback
        }
        view.addSubview(overlay); cover = overlay; isCovered = true
    }
    /// The message without its Markdown marks: headings and bold in bold,
    /// bullets as •, code fences dropped. Only shown until WebKit paints.
    static func standIn(for text: String, fontSize: CGFloat) -> NSAttributedString {
        let lines = text.components(separatedBy: "\n").compactMap { line -> String? in
            let indent = String(line.prefix { $0 == " " })
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("```") { return nil }
            let hashes = trimmed.prefix { $0 == "#" }.count
            if (1...6).contains(hashes), trimmed.dropFirst(hashes).first == " " {
                return "**" + String(trimmed.dropFirst(hashes + 1)) + "**"
            }
            for bullet in ["- ", "* ", "+ "] where trimmed.hasPrefix(bullet) {
                return indent + "• " + String(trimmed.dropFirst(2))
            }
            return line
        }
        let source = lines.joined(separator: "\n")
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        let parsed = (try? NSAttributedString(markdown: source, options: options)) ?? NSAttributedString(string: source)
        let result = NSMutableAttributedString(attributedString: parsed)
        let whole = NSRange(location: 0, length: result.length)
        let base = UIFont.systemFont(ofSize: fontSize)
        let paragraph = NSMutableParagraphStyle(); paragraph.minimumLineHeight = fontSize * 1.65
        result.addAttributes([.font: base, .foregroundColor: UIColor.label, .paragraphStyle: paragraph], range: whole)
        result.enumerateAttribute(.inlinePresentationIntent, in: whole) { value, range, _ in
            guard let raw = (value as? NSNumber)?.uintValue else { return }
            let intent = InlinePresentationIntent(rawValue: raw)
            var font = intent.contains(.code) ? UIFont.monospacedSystemFont(ofSize: fontSize * 0.9, weight: .regular) : base
            var traits: UIFontDescriptor.SymbolicTraits = []
            if intent.contains(.stronglyEmphasized) { traits.insert(.traitBold) }
            if intent.contains(.emphasized) { traits.insert(.traitItalic) }
            if !traits.isEmpty, let descriptor = font.fontDescriptor.withSymbolicTraits(traits) {
                font = UIFont(descriptor: descriptor, size: font.pointSize)
            }
            result.addAttribute(.font, value: font, range: range)
        }
        return result
    }
    func reveal() {
        cover?.removeFromSuperview(); cover = nil; textView = nil; isCovered = false
        scheduleCapture()
    }
    private func scheduleCapture() {
        guard captureTask == nil else { return }
        let delay = max(0.06, 0.5 - Date().timeIntervalSince(lastCapture))
        captureTask = Task { @MainActor [weak self] in
            do { try await Task.sleep(for: .seconds(delay)) } catch { return }
            guard let self else { return }
            self.captureTask = nil; self.capture()
        }
    }
    func capture() {
        guard !isCovered, !captureInProgress, Date().timeIntervalSince(lastCapture) >= 0.5,
              UIApplication.shared.applicationState == .active,
              let view = webView, let window = view.window else { return }
        let rect = view.bounds.intersection(view.convert(window.bounds, from: window))
        guard !rect.isNull, rect.width > 1, rect.height > 1 else { return }
        let configuration = WKSnapshotConfiguration(); configuration.rect = rect
        let capturedText = text, width = view.bounds.width, capturedGeneration = generation
        captureInProgress = true; lastCapture = Date()
        view.takeSnapshot(with: configuration) { [weak self] image, _ in
            guard let self, self.generation == capturedGeneration else { return }
            self.captureInProgress = false
            guard self.text == capturedText else { self.scheduleCapture(); return }
            guard let image else { return }
            let cost = image.cgImage.map { $0.bytesPerRow * $0.height } ?? 0
            Self.snapshots.setObject(Snapshot(image: image, rect: rect, width: width), forKey: self.key, cost: cost)
        }
    }
    func detach() {
        generation += 1; captureInProgress = false
        captureTask?.cancel(); captureTask = nil
        cover?.removeFromSuperview(); cover = nil; textView = nil; webView = nil; isCovered = false
    }
}
