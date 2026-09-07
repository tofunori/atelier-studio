import SwiftUI
import WebKit

struct RichChatText: View {
    @AppStorage("atelier.textSize") private var textSize = "standard"
    @AppStorage("atelier.readingFont") private var readingFont = "serif"
    @AppStorage("atelier.density") private var density = "comfortable"
    @AppStorage("atelier.contrast") private var contrast = false
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @AppStorage("atelier.motion") private var motion = "native"
    private var reduceMotion: Bool { systemReduceMotion || motion == "off" }
    let text: String
    var quoteTitle = "Ajouter au message"
    let onQuote: (String) -> Void
    @ScaledMetric(relativeTo: .body) private var fontSize: CGFloat = 17
    @State private var height: CGFloat = 44
    @State private var selected = ""
    @State private var rendered = false
    @State private var failed = false
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if failed { SelectableChatText(text: text, quoteTitle: quoteTitle, onQuote: onQuote) }
            else {
                ZStack(alignment: .topLeading) {
                    RichMessageWebView(text: text, quoteTitle: quoteTitle, fontSize: fontSize * AtelierTheme.textScale(textSize), readingFont: quoteTitle == "Annoter" ? readingFont : "sans", compact: density == "compact", contrast: contrast, reduceMotion: reduceMotion, height: $height, selection: $selected, rendered: $rendered, failed: $failed, onQuote: onQuote)
                        .frame(height: height).opacity(rendered ? 1 : 0)
                    if !rendered { SelectableChatText(text: text, quoteTitle: quoteTitle, onQuote: onQuote) }
                }
            }
            if !selected.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Button(quoteTitle, systemImage: "text.quote") { onQuote(selected); selected = "" }
                    .font(.caption).buttonStyle(.bordered)
            }
        }
    }
}

@MainActor private enum RichWebSession {
    static let dataStore = WKWebsiteDataStore.nonPersistent()
}

private struct RichMessageWebView: UIViewRepresentable {
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
        context.coordinator.view = view
        if let folder = Bundle.module.url(forResource: "ChatRenderer", withExtension: nil) {
            view.loadFileURL(folder.appendingPathComponent("index.html"), allowingReadAccessTo: folder)
        }
        return view
    }
    func updateUIView(_ view: QuotingWebView, context: Context) {
        context.coordinator.parent = self; view.onQuote = onQuote; view.quoteTitle = quoteTitle
        if selection.isEmpty && !view.selectedPassage.isEmpty {
            view.selectedPassage = ""
            view.evaluateJavaScript("window.clearSelection()", completionHandler: nil)
        }
        context.coordinator.render()
    }
    static func dismantleUIView(_ view: QuotingWebView, coordinator: Coordinator) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: "chat")
        view.stopLoading()
    }
    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var parent: RichMessageWebView
        weak var view: QuotingWebView?
        var ready = false
        var sent: String?
        var sentStyle = ""
        var sentFontSize: CGFloat?
        init(parent: RichMessageWebView) { self.parent = parent }
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
            guard sent != parent.text else { return }
            sent = parent.text
            view.callAsyncJavaScript("window.updateMessage(text)", arguments: ["text": parent.text], in: nil, in: .page, completionHandler: { [weak self] result in if case .failure = result { self?.parent.failed = true } })
        }
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame, let body = message.body as? [String: Any], let kind = body["kind"] as? String else { return }
            switch kind {
            case "ready": ready = true; render()
            case "rendered": parent.rendered = true
            case "failure": parent.failed = true
            case "height":
                if let value = body["height"] as? Double, value.isFinite, value > 0, abs(parent.height - value) > 0.5 { parent.height = value }
            case "selection":
                let text = body["text"] as? String ?? ""
                view?.selectedPassage = text
                parent.selection = text
            case "copy": if let text = body["text"] as? String { UIPasteboard.general.string = text }
            default: break
            }
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webView.evaluateJavaScript("typeof window.updateMessage") { [weak self] value, _ in
                if value as? String != "function" { self?.parent.failed = true }
            }
        }
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { parent.failed = true }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { parent.failed = true }
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            if action.navigationType == .linkActivated {
                if let url = action.request.url, ["https", "http"].contains(url.scheme?.lowercased() ?? "") { await UIApplication.shared.open(url) }
                return .cancel
            } else { return action.request.url?.isFileURL == true ? .allow : .cancel }
        }
    }
}

private final class QuotingWebView: WKWebView {
    var quoteTitle = "Ajouter au message"
    var selectedPassage = ""
    var onQuote: ((String) -> Void)?
    override func buildMenu(with builder: UIMenuBuilder) {
        super.buildMenu(with: builder)
        let action = UIAction(title: quoteTitle, image: UIImage(systemName: "text.quote")) { [weak self] _ in
            guard let self, !selectedPassage.isEmpty else { return }
            onQuote?(selectedPassage)
            evaluateJavaScript("window.clearSelection()", completionHandler: nil)
        }
        builder.insertChild(UIMenu(title: "", options: .displayInline, children: [action]), atStartOfMenu: .standardEdit)
    }
}
