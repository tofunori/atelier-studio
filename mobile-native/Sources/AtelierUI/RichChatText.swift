import SwiftUI
import WebKit

struct RichTextSelection: Equatable {
    var text: String
    var occurrence: Int? = nil
    var occurrences: Int? = nil
}
struct RichTextHighlight: Codable, Equatable {
    var id: String
    var text: String
    var occurrence: Int
    var occurrences: Int
    var style: PDFMark.Style = .highlight
    var ink: AnnotationInk = .sage
}

struct RichChatText: View {
    @AppStorage("atelier.textSize") private var textSize = "standard"
    @AppStorage("atelier.readingFont") private var readingFont = "serif"
    @AppStorage("atelier.density") private var density = "comfortable"
    @AppStorage("atelier.contrast") private var contrast = false
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @AppStorage("atelier.motion") private var motion = "native"
    private var reduceMotion: Bool { systemReduceMotion || motion == "off" }
    let text: String
    var quoteTitle = "Ajouter au chat"
    var documentStyle = false
    var onSelection: ((RichTextSelection) -> Void)? = nil
    var onAnnotate: ((RichTextSelection) -> Void)? = nil
    var highlights: [RichTextHighlight] = []
    var onHighlight: ((String) -> Void)? = nil
    let onQuote: (String) -> Void
    @ScaledMetric(relativeTo: .body) private var fontSize: CGFloat = 17
    @State private var height: CGFloat = 44
    @State private var selected = ""
    @State private var rendered = false
    @State private var failed = false
    @State private var continuity = RichTextContinuity()
    private var fallback: some View {
        SelectableChatText(text: text, quoteTitle: quoteTitle,
            onAnnotate: onAnnotate.map { action in { action(RichTextSelection(text: $0)) } },
            onQuote: { value in
                if let onSelection { onSelection(RichTextSelection(text: value)) } else { onQuote(value) }
            })
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if failed { fallback }
            else {
                ZStack(alignment: .topLeading) {
                    RichMessageWebView(continuity: continuity, text: text, quoteTitle: quoteTitle, fontSize: fontSize * AtelierTheme.textScale(textSize), readingFont: documentStyle || quoteTitle == "Annoter" ? readingFont : "sans", compact: density == "compact", contrast: contrast, reduceMotion: reduceMotion, height: $height, selection: $selected, rendered: $rendered, failed: $failed, onSelection: onSelection, onAnnotate: onAnnotate, highlights: highlights, onHighlight: onHighlight, onQuote: onQuote)
                        .frame(height: rendered ? height : 28).opacity(rendered ? 1 : 0)
                    if !rendered {
                        ProgressView().controlSize(.small)
                            .frame(maxWidth: .infinity, minHeight: 28, alignment: .leading)
                            .accessibilityLabel("Mise en forme du message")
                    }
                }
            }

        }
        .preference(key: ChatContentReadyKey.self, value: rendered || failed)
    }
}

@MainActor private enum RichWebSession {
    static let dataStore = WKWebsiteDataStore.nonPersistent()
}

private struct RichMessageWebView: UIViewRepresentable {
    let continuity: RichTextContinuity
    let text: String
    let quoteTitle: String
    let fontSize: CGFloat
    let readingFont: String
    let compact: Bool
    let contrast: Bool
    let reduceMotion: Bool
    @Binding var height: CGFloat
    @Binding var selection: String
    @Binding var rendered: Bool
    @Binding var failed: Bool
    var onSelection: ((RichTextSelection) -> Void)?
    var onAnnotate: ((RichTextSelection) -> Void)?
    var highlights: [RichTextHighlight]
    var onHighlight: ((String) -> Void)?
    let onQuote: (String) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }
    func makeUIView(context: Context) -> QuotingWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = RichWebSession.dataStore
        config.userContentController.add(context.coordinator, name: "chat")
        let view = QuotingWebView(frame: .zero, configuration: config)
        view.isOpaque = false; view.backgroundColor = .clear
        view.scrollView.backgroundColor = .clear; view.scrollView.isScrollEnabled = false
        view.navigationDelegate = context.coordinator
        view.onQuote = onQuote; view.quoteTitle = quoteTitle
        view.onSelection = onSelection; view.onAnnotate = onAnnotate
        context.coordinator.view = view
        continuity.attach(to: view, text: text, fontSize: fontSize)
        context.coordinator.observeLifecycle()
        if let folder = Bundle.module.url(forResource: "ChatRenderer", withExtension: nil) {
            view.loadFileURL(folder.appendingPathComponent("index.html"), allowingReadAccessTo: folder)
        }
        return view
    }
    func updateUIView(_ view: QuotingWebView, context: Context) {
        context.coordinator.parent = self; view.onQuote = onQuote; view.quoteTitle = quoteTitle
        view.onSelection = onSelection; view.onAnnotate = onAnnotate
        if selection.isEmpty && !view.selectedPassage.isEmpty {
            view.selectedPassage = ""
            view.evaluateJavaScript("window.clearSelection()", completionHandler: nil)
        }
        continuity.update(text: text, fontSize: fontSize)
        context.coordinator.render()
    }
    static func dismantleUIView(_ view: QuotingWebView, coordinator: Coordinator) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: "chat")
        NotificationCenter.default.removeObserver(coordinator)
        coordinator.parent.continuity.detach()
        view.stopLoading()
    }
    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var parent: RichMessageWebView
        weak var view: QuotingWebView?
        var ready = false
        var sent: String?
        var sentStyle = ""
        var sentHighlights: [RichTextHighlight]?
        var sentFontSize: CGFloat?
        init(parent: RichMessageWebView) { self.parent = parent }
        func observeLifecycle() {
            NotificationCenter.default.addObserver(self, selector: #selector(pauseRendering), name: UIApplication.willResignActiveNotification, object: nil)
            NotificationCenter.default.addObserver(self, selector: #selector(resumeRendering), name: UIApplication.didBecomeActiveNotification, object: nil)
        }
        @objc private func pauseRendering() { parent.continuity.show() }
        @objc private func resumeRendering() {
            parent.continuity.show()
            view?.evaluateJavaScript("window.resumeRendering?.()", completionHandler: nil)
        }
        func render() {
            guard ready, let view else { return }
            if sentFontSize != parent.fontSize {
                sentFontSize = parent.fontSize
                view.callAsyncJavaScript("window.setFontSize(size)", arguments: ["size": parent.fontSize], in: nil, in: .page, completionHandler: nil)
            }
            let style = "\(parent.readingFont):\(parent.compact):\(parent.contrast):\(parent.reduceMotion)"
            if style != sentStyle {
                sentStyle = style
                view.callAsyncJavaScript("window.setReadingStyle(font, compact, contrast, reduced)", arguments: ["font":parent.readingFont,"compact":parent.compact,"contrast":parent.contrast,"reduced":parent.reduceMotion], in: nil, in: .page, completionHandler: nil)
            }
            if sentHighlights != parent.highlights {
                sentHighlights = parent.highlights
                let notes = parent.highlights.map { ["id": $0.id, "text": $0.text, "occurrence": $0.occurrence, "occurrences": $0.occurrences, "style": $0.style.rawValue, "ink": $0.ink.rawValue] as [String: Any] }
                view.callAsyncJavaScript("window.setReadingHighlights(notes)", arguments: ["notes": notes], in: nil, in: .page, completionHandler: nil)
            }
            guard sent != parent.text else { return }
            sent = parent.text
            view.callAsyncJavaScript("window.updateMessage(text)", arguments: ["text": parent.text], in: nil, in: .page, completionHandler: { [weak self] result in if case .failure = result { self?.parent.failed = true } })
        }
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame, let body = message.body as? [String: Any], let kind = body["kind"] as? String else { return }
            switch kind {
            case "ready":
                ready = true; render()
                #if targetEnvironment(simulator)
                if ProcessInfo.processInfo.arguments.contains("--renderer-stall-fixture") {
                    view?.evaluateJavaScript("const resume = window.resumeRendering; window.resumeRendering = () => setTimeout(resume, 10000)", completionHandler: nil)
                }
                #endif
            case "rendered": parent.rendered = true; parent.continuity.reveal()
            case "failure": parent.failed = true
            case "height":
                if let value = body["height"] as? Double, value.isFinite, value > 0, abs(parent.height - value) > 0.5 {
                    var transaction = Transaction(animation: nil)
                    transaction.disablesAnimations = true
                    withTransaction(transaction) { parent.height = value }
                }
            case "selection":
                let text = body["text"] as? String ?? ""
                view?.selectedPassage = text
                view?.selectedDetail = RichTextSelection(text: text, occurrence: body["occurrence"] as? Int, occurrences: body["occurrences"] as? Int)
                parent.selection = text
            case "annotation": if let id = body["id"] as? String { parent.onHighlight?(id) }
            case "copy": if let text = body["text"] as? String { UIPasteboard.general.string = text }
            default: break
            }
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webView.evaluateJavaScript("typeof window.updateMessage") { [weak self] value, _ in
                if value as? String != "function" { self?.parent.failed = true }
            }
        }
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            parent.continuity.show()
            ready = false; sent = nil; sentStyle = ""; sentHighlights = nil; sentFontSize = nil
            if let folder = Bundle.module.url(forResource: "ChatRenderer", withExtension: nil) {
                webView.loadFileURL(folder.appendingPathComponent("index.html"), allowingReadAccessTo: folder)
            } else { parent.failed = true }
        }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { parent.failed = true }
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            if action.navigationType == .linkActivated {
                if let url = action.request.url, ["https", "http"].contains(url.scheme?.lowercased() ?? "") { await UIApplication.shared.open(url) }
                return .cancel
            } else { return action.request.url?.isFileURL == true ? .allow : .cancel }
        }
    }
}

final class QuotingWebView: WKWebView {
    var quoteTitle = "Ajouter au chat"
    var selectedPassage = ""
    var onQuote: ((String) -> Void)?
    var selectedDetail = RichTextSelection(text: "")
    var onSelection: ((RichTextSelection) -> Void)?
    var onAnnotate: ((RichTextSelection) -> Void)?
    override func buildMenu(with builder: UIMenuBuilder) {
        super.buildMenu(with: builder)
        let detail = selectedDetail.text.isEmpty ? RichTextSelection(text: selectedPassage) : selectedDetail
        let passage = detail.text
        let action = UIAction(title: quoteTitle, image: UIImage(systemName: "text.quote")) { [weak self] _ in
            self?.quoteSelection(fallback: passage, detail: detail)
        }
        // WebKit does not guarantee a standardEdit submenu. The root always exists.
        var actions: [UIMenuElement] = [action]
        if onAnnotate != nil {
            actions.append(UIAction(title: "Annoter", image: UIImage(systemName: "highlighter")) { [weak self] _ in
                self?.quoteSelection(fallback: passage, detail: detail, annotate: true)
            })
        }
        builder.insertChild(UIMenu(title: "", options: .displayInline, children: actions), atStartOfMenu: .root)
    }
    func quoteSelection(fallback: String, detail: RichTextSelection? = nil, annotate: Bool = false) {
        let passage = selectedPassage.isEmpty ? fallback : selectedPassage
        guard !passage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        let captured = selectedDetail.text == passage ? selectedDetail : (detail ?? RichTextSelection(text: passage))
        selectedPassage = ""
        evaluateJavaScript("window.clearSelection()", completionHandler: nil)
        Task { @MainActor [weak self] in
            await Task.yield()
            guard let self else { return }
            if annotate { onAnnotate?(captured) }
            else if let onSelection { onSelection(captured) }
            else { onQuote?(passage) }
        }
    }
}
