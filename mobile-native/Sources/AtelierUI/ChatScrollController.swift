import SwiftUI

/// A single writer for the outer chat scroll view. Rich message web views keep
/// their own scrolling disabled; this probe only walks upward from the stack.
@MainActor final class ChatScrollController {
    private weak var scrollView: UIScrollView?
    private enum Request { case bottom(Bool), offset(Double) }
    private var pending: Request?

    func attach(_ view: UIScrollView) {
        guard scrollView !== view else { return }
        scrollView = view
        if let pending { self.pending = nil; perform(pending) }
    }
    func scrollToBottom(animated: Bool = false) { perform(.bottom(animated)) }
    func scrollTo(y: Double) { perform(.offset(y)) }

    var isNearBottom: Bool? {
        guard let view = scrollView else { return nil }
        return distanceToBottom(in: view) < 28
    }

    /// Completion is bounded and read from UIKit, even if SwiftUI emits no
    /// geometry change (for example, when the requested offset is unchanged).
    func returnToBottom(animated: Bool) async -> Bool {
        var started = false
        var settled = 0
        var lastSize: CGSize?
        for attempt in 0..<40 {
            guard !Task.isCancelled else { return false }
            if let view = scrollView {
                guard !view.isTracking && !view.isDragging else { return false }
                if !started { scrollToBottom(animated: animated); started = true }
                if lastSize != view.contentSize { settled = 0; lastSize = view.contentSize }
                if abs(distanceToBottom(in: view)) <= 1 {
                    settled += 1
                    // WebKit rows can report their final height after the first landing.
                    if attempt >= 12 && settled >= 6 { return true }
                } else {
                    settled = 0
                    if attempt >= 6 { scrollToBottom() }
                }
            }
            do { try await Task.sleep(for: .milliseconds(50)) }
            catch { return false }
        }
        return isNearBottom ?? false
    }

    private func distanceToBottom(in view: UIScrollView) -> CGFloat {
        Self.bottomOffset(contentHeight: view.contentSize.height, viewportHeight: view.bounds.height,
                          topInset: view.adjustedContentInset.top, bottomInset: view.adjustedContentInset.bottom) - view.contentOffset.y
    }

    static func bottomOffset(contentHeight: CGFloat, viewportHeight: CGFloat, topInset: CGFloat, bottomInset: CGFloat) -> CGFloat {
        max(-topInset, contentHeight - viewportHeight + bottomInset)
    }
    private func perform(_ request: Request) {
        guard let view = scrollView else { pending = request; return }
        let target: CGFloat
        let animated: Bool
        switch request {
        case .bottom(let animate):
            target = Self.bottomOffset(contentHeight: view.contentSize.height, viewportHeight: view.bounds.height,
                                       topInset: view.adjustedContentInset.top, bottomInset: view.adjustedContentInset.bottom)
            animated = animate
        case .offset(let y): target = y; animated = false
        }
        guard abs(view.contentOffset.y - target) > 0.5 else { return }
        view.setContentOffset(CGPoint(x: view.contentOffset.x, y: target), animated: animated)
    }
}

struct ChatScrollProbe: UIViewRepresentable {
    let controller: ChatScrollController
    func makeUIView(context: Context) -> Probe {
        let view = Probe()
        view.controller = controller
        view.isUserInteractionEnabled = false
        view.accessibilityElementsHidden = true
        return view
    }
    func updateUIView(_ uiView: Probe, context: Context) { uiView.resolve() }

    final class Probe: UIView {
        weak var controller: ChatScrollController?
        override func didMoveToWindow() { super.didMoveToWindow(); resolve() }
        override func didMoveToSuperview() { super.didMoveToSuperview(); resolve() }
        func resolve() {
            Task { @MainActor [weak self] in self?.attachEnclosingScrollView() }
        }
        private func attachEnclosingScrollView() {
            var ancestor = superview
            while let view = ancestor {
                if let scroll = view as? UIScrollView {
                    controller?.attach(scroll)
                    return
                }
                ancestor = view.superview
            }
        }
    }
}
