import UIKit
import WebKit

/// A bounded, view-owned visual backup. UIKit can display it while WebKit wakes.
@MainActor final class RichTextContinuity {
    private final class Snapshot: NSObject {
        let image: UIImage; let rect: CGRect; let width: CGFloat; let text: String
        init(image: UIImage, rect: CGRect, width: CGFloat, text: String) {
            self.image = image; self.rect = rect; self.width = width; self.text = text
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
        let changed = self.text != text || self.fontSize != fontSize
        self.text = text; self.fontSize = fontSize
        if changed { Self.snapshots.removeObject(forKey: key) }
        if changed && isCovered { show() }
    }
    func show() {
        guard let view = webView else { return }
        cover?.removeFromSuperview()
        let overlay = UIView(frame: view.bounds)
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        overlay.backgroundColor = .systemBackground
        let fallback = UITextView(frame: overlay.bounds)
        fallback.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        fallback.backgroundColor = .clear; fallback.isEditable = false; fallback.isScrollEnabled = false
        fallback.textContainerInset = .zero; fallback.textContainer.lineFragmentPadding = 0
        let paragraph = NSMutableParagraphStyle(); paragraph.minimumLineHeight = fontSize * 1.65
        fallback.attributedText = NSAttributedString(string: text, attributes: [.font: UIFont.systemFont(ofSize: fontSize), .foregroundColor: UIColor.label, .paragraphStyle: paragraph])
        fallback.isUserInteractionEnabled = false
        overlay.addSubview(fallback)
        if let snapshot = Self.snapshots.object(forKey: key), snapshot.text == text,
           abs(snapshot.width - view.bounds.width) < 1 {
            let image = UIImageView(image: snapshot.image)
            image.frame = snapshot.rect; image.backgroundColor = .systemBackground
            overlay.addSubview(image)
        }
        overlay.isUserInteractionEnabled = false
        view.addSubview(overlay); cover = overlay; textView = fallback; isCovered = true
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
            Self.snapshots.setObject(Snapshot(image: image, rect: rect, width: width, text: capturedText), forKey: self.key, cost: cost)
        }
    }
    func detach() {
        generation += 1; captureInProgress = false
        captureTask?.cancel(); captureTask = nil
        cover?.removeFromSuperview(); cover = nil; textView = nil; webView = nil; isCovered = false
    }
}
