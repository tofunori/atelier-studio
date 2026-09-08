import SwiftUI

/// A single writer for the outer chat scroll view. Rich message web views keep
/// their own scrolling disabled; this probe only walks upward from the stack.
@MainActor final class ChatScrollController {
    private weak var scrollView: UIScrollView?
    private enum Request { case bottom(Bool), offset(Double) }
    private var bottomNavigation: ((Bool) -> Void)?
    private var pending: Request?
    private var returning: UUID?
    private var followTask: Task<Void, Never>?


    /// SwiftUI must materialize the lazy tail before UIKit can measure arrival.
    func setBottomNavigation(_ navigation: ((Bool) -> Void)?) {
        bottomNavigation = navigation
        if navigation != nil, let request = pending, case .bottom = request {
            pending = nil
            perform(request)
        }
    }

    func attach(_ view: UIScrollView) {
        guard scrollView !== view else { return }
        scrollView = view
        if let pending { self.pending = nil; perform(pending) }
    }
    func scrollToBottom(animated: Bool = false) {
        guard returning == nil else { return }
        perform(.bottom(animated))
    }
    func scrollTo(y: Double) { cancelPendingScroll(); perform(.offset(y)) }

    /// Geometry and WebKit can invalidate several times in one frame. Resolve
    /// the latest UIKit height once, without queuing writes behind an animation.
    func followBottom() {
        guard returning == nil, followTask == nil else { return }
        followTask = Task { @MainActor [weak self] in
            do { try await Task.sleep(for: .milliseconds(16)) } catch { return }
            guard let self else { return }
            self.followTask = nil
            guard self.returning == nil, let view = self.scrollView,
                  !view.isTracking && !view.isDragging && !view.isDecelerating else { return }
            self.perform(.bottom(false))
        }
    }
    /// Called at the beginning of a user gesture or when changing conversations.
    func cancelPendingScroll() {
        returning = nil; pending = nil
        followTask?.cancel(); followTask = nil
    }

    var isNearBottom: Bool? {
        guard let view = scrollView else { return nil }
        return abs(distanceToBottom(in: view)) < 28
    }

    /// Finish on arrival, not when streamed content stops changing. While this
    /// owns the scroll, layout invalidations cannot interrupt UIKit's animation.
    func returnToBottom(animated: Bool) async -> Bool {
        cancelPendingScroll()
        let requestID = UUID()
        returning = requestID
        defer { if returning == requestID { returning = nil } }
        var startedView: ObjectIdentifier?
        var lastWriteFrame = 0
        var arrivedFrames = 0
        for frame in 0..<60 {
            guard !Task.isCancelled, returning == requestID else { return false }
            if let view = scrollView {
                guard !view.isTracking && !view.isDragging && !view.isDecelerating else { return false }
                if startedView != ObjectIdentifier(view) {
                    startedView = ObjectIdentifier(view)
                    perform(.bottom(animated && abs(distanceToBottom(in: view)) <= view.bounds.height * 2)); lastWriteFrame = frame
                }
                if abs(distanceToBottom(in: view)) < 28 {
                    arrivedFrames += 1
                    if arrivedFrames >= 2 { return true }
                } else {
                    arrivedFrames = 0
                    // Give the native animation time to land before chasing a
                    // shifted target. Never snap every time a row changes height.
                    if frame - lastWriteFrame >= 22 {
                        perform(.bottom(false)); lastWriteFrame = frame
                    }
                }
            } else if frame >= 15 { return false }
            do { try await Task.sleep(for: .milliseconds(16)) }
            catch { return false }
        }
        guard returning == requestID, let view = scrollView,
              !view.isTracking && !view.isDragging && !view.isDecelerating else { return false }
        return abs(distanceToBottom(in: view)) < 28
    }

    private func distanceToBottom(in view: UIScrollView) -> CGFloat {
        Self.bottomOffset(contentHeight: view.contentSize.height, viewportHeight: view.bounds.height,
                          topInset: view.adjustedContentInset.top, bottomInset: view.adjustedContentInset.bottom) - view.contentOffset.y
    }

    static func bottomOffset(contentHeight: CGFloat, viewportHeight: CGFloat, topInset: CGFloat, bottomInset: CGFloat) -> CGFloat {
        max(-topInset, contentHeight - viewportHeight + bottomInset)
    }
    private func perform(_ request: Request) {
        if case .bottom(let animated) = request, let bottomNavigation {
            // Invoke even at the measured bottom: estimated lazy content height
            // is not proof that the final rows have been instantiated.
            bottomNavigation(animated)
            return
        }
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
