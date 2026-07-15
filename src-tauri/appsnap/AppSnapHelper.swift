import AppKit
import ApplicationServices
import CoreGraphics
import CoreImage
import CoreMedia
import CoreVideo
import Darwin
import Foundation
import ScreenCaptureKit

private enum HelperMode {
    case checkPermissions
    case requestPermissions
    case watch(outputDirectory: URL, excludedBundleIdentifier: String, parentProcessIdentifier: pid_t)
}

private final class NDJSONEmitter {
    private let lock = NSLock()

    func emit(_ payload: [String: Any?]) {
        let normalized = payload.reduce(into: [String: Any]()) { result, entry in
            result[entry.key] = entry.value ?? NSNull()
        }
        guard JSONSerialization.isValidJSONObject(normalized),
              let data = try? JSONSerialization.data(withJSONObject: normalized),
              let line = String(data: data, encoding: .utf8) else { return }
        lock.lock()
        defer { lock.unlock() }
        FileHandle.standardOutput.write(Data((line + "\n").utf8))
    }

    func error(_ code: String, _ message: String, id: String? = nil, capturedAt: String? = nil) {
        emit([
            "type": "error",
            "code": code,
            "message": message,
            "id": id,
            "capturedAt": capturedAt,
        ])
    }
}

private func permissionName(_ granted: Bool) -> String { granted ? "granted" : "denied" }

private func emitPermissions(_ emitter: NDJSONEmitter) {
    emitter.emit([
        "type": "permissions",
        "inputMonitoring": permissionName(CGPreflightListenEventAccess()),
        "screenRecording": permissionName(CGPreflightScreenCaptureAccess()),
        "accessibility": permissionName(AXIsProcessTrusted()),
    ])
}

private func isoTimestamp(_ date: Date = Date()) -> String {
    ISO8601DateFormatter().string(from: date)
}

private func appIconDataURL(_ application: NSRunningApplication) -> String? {
    guard let image = application.icon else { return nil }
    let icon = NSImage(size: NSSize(width: 32, height: 32))
    icon.lockFocus()
    NSGraphicsContext.current?.imageInterpolation = .high
    image.draw(in: NSRect(x: 0, y: 0, width: 32, height: 32))
    icon.unlockFocus()
    guard let tiff = icon.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiff),
          let png = bitmap.representation(using: .png, properties: [:]) else { return nil }
    return "data:image/png;base64," + png.base64EncodedString()
}

private func captureScale(for frame: CGRect) -> CGFloat {
    let center = CGPoint(x: frame.midX, y: frame.midY)
    return NSScreen.screens.first(where: { $0.frame.contains(center) })?.backingScaleFactor
        ?? NSScreen.main?.backingScaleFactor
        ?? 2
}

private func orderedWindowIDs(for processIdentifier: pid_t) -> [CGWindowID] {
    guard let raw = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
        as? [[String: Any]] else { return [] }
    return raw.compactMap { item in
        guard (item[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == processIdentifier,
              (item[kCGWindowLayer as String] as? NSNumber)?.intValue == 0,
              (item[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 1 > 0,
              let number = item[kCGWindowNumber as String] as? NSNumber else { return nil }
        return CGWindowID(number.uint32Value)
    }
}

private struct AccessibilitySnapshot {
    let text: String
    let elementCount: Int
    let truncated: Bool
}

private let accessibilitySnapshotMaxElements = 400
private let accessibilitySnapshotMaxCharacters = 24_000
private let accessibilitySnapshotMaxDepth = 14
private let accessibilitySnapshotMaxChildrenPerElement = 80
private let accessibilitySnapshotMaxFieldCharacters = 500

private func accessibilityAttribute(_ element: AXUIElement, _ attribute: CFString) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute, &value) == .success else { return nil }
    return value
}

private func accessibilityString(_ element: AXUIElement, _ attribute: CFString) -> String? {
    guard let value = accessibilityAttribute(element, attribute) else { return nil }
    if let string = value as? String { return string }
    if let url = value as? URL { return url.absoluteString }
    return nil
}

private func accessibilityElement(_ element: AXUIElement, _ attribute: CFString) -> AXUIElement? {
    guard let value = accessibilityAttribute(element, attribute),
          CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
    return (value as! AXUIElement)
}

private func accessibilityChildren(_ element: AXUIElement) -> [AXUIElement] {
    accessibilityAttribute(element, kAXChildrenAttribute as CFString) as? [AXUIElement] ?? []
}

private func normalizedAccessibilityText(_ value: String?) -> String? {
    guard let value else { return nil }
    let normalized = value
        .components(separatedBy: .whitespacesAndNewlines)
        .filter { !$0.isEmpty }
        .joined(separator: " ")
    guard !normalized.isEmpty else { return nil }
    if normalized.count <= accessibilitySnapshotMaxFieldCharacters { return normalized }
    let end = normalized.index(normalized.startIndex, offsetBy: accessibilitySnapshotMaxFieldCharacters)
    return String(normalized[..<end]) + "…"
}

private func accessibilityRoleLabel(_ role: String?) -> String {
    let known: [String: String] = [
        kAXApplicationRole as String: "application",
        kAXWindowRole as String: "window",
        kAXGroupRole as String: "group",
        kAXButtonRole as String: "button",
        kAXCheckBoxRole as String: "checkbox",
        kAXRadioButtonRole as String: "radio button",
        kAXPopUpButtonRole as String: "pop up button",
        kAXComboBoxRole as String: "combo box",
        kAXTextFieldRole as String: "text field",
        kAXTextAreaRole as String: "text entry area",
        kAXStaticTextRole as String: "static text",
        kAXImageRole as String: "image",
        "AXLink": "link",
        kAXScrollAreaRole as String: "scroll area",
        kAXListRole as String: "list",
        kAXTableRole as String: "table",
        kAXRowRole as String: "row",
        kAXMenuRole as String: "menu",
        kAXMenuItemRole as String: "menu item",
        kAXToolbarRole as String: "toolbar",
        kAXTabGroupRole as String: "tab group",
        "AXWebArea": "HTML content",
    ]
    guard let role else { return "element" }
    if let label = known[role] { return label }
    return role.hasPrefix("AX") ? String(role.dropFirst(2)).lowercased() : role.lowercased()
}

private func accessibilitySnapshot(
    for application: NSRunningApplication,
    windowTitle: String?
) -> AccessibilitySnapshot? {
    guard AXIsProcessTrusted() else { return nil }
    let appElement = AXUIElementCreateApplication(application.processIdentifier)
    let focusedWindow = accessibilityElement(appElement, kAXFocusedWindowAttribute as CFString)
    let windows = accessibilityAttribute(appElement, kAXWindowsAttribute as CFString) as? [AXUIElement] ?? []
    let matchingWindow = windows.first { candidate in
        normalizedAccessibilityText(accessibilityString(candidate, kAXTitleAttribute as CFString)) ==
            normalizedAccessibilityText(windowTitle)
    }
    guard let root = focusedWindow ?? matchingWindow ?? windows.first else { return nil }

    var lines: [String] = []
    var characterCount = 0
    var elementCount = 0
    var truncated = false

    let appName = normalizedAccessibilityText(application.localizedName) ?? "Unknown app"
    let title = normalizedAccessibilityText(windowTitle) ??
        normalizedAccessibilityText(accessibilityString(root, kAXTitleAttribute as CFString)) ??
        "Untitled window"
    let header = "Window: \"\(title)\", App: \(appName)"
    lines.append(header)
    characterCount = header.count

    func appendLine(_ line: String) -> Bool {
        let extraCharacters = line.count + 1
        guard characterCount + extraCharacters <= accessibilitySnapshotMaxCharacters else {
            truncated = true
            return false
        }
        lines.append(line)
        characterCount += extraCharacters
        return true
    }

    func visit(_ element: AXUIElement, depth: Int) {
        guard !truncated else { return }
        guard elementCount < accessibilitySnapshotMaxElements else {
            truncated = true
            return
        }
        guard depth <= accessibilitySnapshotMaxDepth else {
            truncated = true
            return
        }

        let role = accessibilityString(element, kAXRoleAttribute as CFString)
        let subrole = accessibilityString(element, kAXSubroleAttribute as CFString)
        let secure = role == "AXSecureTextField" || subrole == "AXSecureTextField"
        let title = normalizedAccessibilityText(accessibilityString(element, kAXTitleAttribute as CFString))
        let description = normalizedAccessibilityText(accessibilityString(element, kAXDescriptionAttribute as CFString))
        let help = normalizedAccessibilityText(accessibilityString(element, kAXHelpAttribute as CFString))
        let value = secure ? "[secure text hidden]" : normalizedAccessibilityText(
            accessibilityString(element, kAXValueAttribute as CFString)
        )
        let url = normalizedAccessibilityText(accessibilityString(element, kAXURLAttribute as CFString))

        var details: [String] = []
        for candidate in [title, description, value, help, url] {
            guard let candidate, !details.contains(candidate) else { continue }
            details.append(candidate)
        }
        let prefix = String(repeating: "  ", count: depth)
        let suffix = details.isEmpty ? "" : " " + details.joined(separator: " — ")
        guard appendLine("\(prefix)[\(accessibilityRoleLabel(role))]\(suffix)") else { return }
        elementCount += 1

        let children = accessibilityChildren(element)
        if children.count > accessibilitySnapshotMaxChildrenPerElement { truncated = true }
        for child in children.prefix(accessibilitySnapshotMaxChildrenPerElement) {
            visit(child, depth: depth + 1)
            if truncated { break }
        }
    }

    visit(root, depth: 0)
    if truncated {
        _ = appendLine("[… accessibility snapshot truncated …]")
    }
    return AccessibilitySnapshot(text: lines.joined(separator: "\n"), elementCount: elementCount, truncated: truncated)
}

private final class CaptureFeedback {
    private var panels: [NSPanel] = []

    func flash(frame: CGRect) {
        DispatchQueue.main.async {
            let panel = NSPanel(
                contentRect: frame.insetBy(dx: -3, dy: -3),
                styleMask: [.borderless, .nonactivatingPanel],
                backing: .buffered,
                defer: false
            )
            panel.isOpaque = false
            panel.backgroundColor = .clear
            panel.hasShadow = false
            panel.ignoresMouseEvents = true
            panel.level = .screenSaver
            panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]

            let view = NSView(frame: panel.contentView?.bounds ?? .zero)
            view.wantsLayer = true
            view.layer?.borderColor = NSColor.white.withAlphaComponent(0.92).cgColor
            view.layer?.borderWidth = 3
            view.layer?.cornerRadius = 12
            view.layer?.backgroundColor = NSColor.white.withAlphaComponent(0.08).cgColor
            panel.contentView = view
            panel.alphaValue = 0
            panel.orderFrontRegardless()
            self.panels.append(panel)

            NSAnimationContext.runAnimationGroup { context in
                context.duration = 0.08
                panel.animator().alphaValue = 1
            } completionHandler: {
                NSAnimationContext.runAnimationGroup { context in
                    context.duration = 0.28
                    panel.animator().alphaValue = 0
                } completionHandler: {
                    panel.orderOut(nil)
                    self.panels.removeAll { $0 === panel }
                }
            }
        }
    }
}

@available(macOS 12.3, *)
private final class OneFrameWindowCapture: NSObject, SCStreamOutput, SCStreamDelegate {
    private let outputQueue = DispatchQueue(label: "com.tofunori.atelier.appsnap.stream-output")
    private let completion: (Result<Data, Error>) -> Void
    private var stream: SCStream?
    private var completed = false
    private var timeout: DispatchWorkItem?

    init(window: SCWindow, completion: @escaping (Result<Data, Error>) -> Void) throws {
        self.completion = completion
        super.init()

        let filter = SCContentFilter(desktopIndependentWindow: window)
        let configuration = SCStreamConfiguration()
        let scale = captureScale(for: window.frame)
        configuration.width = max(1, Int(window.frame.width * scale))
        configuration.height = max(1, Int(window.frame.height * scale))
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: 30)
        configuration.queueDepth = 1
        configuration.pixelFormat = kCVPixelFormatType_32BGRA
        configuration.showsCursor = false
        if #available(macOS 13.0, *) { configuration.capturesAudio = false }
        if #available(macOS 14.0, *) {
            configuration.captureResolution = .best
            configuration.shouldBeOpaque = false
        }

        let stream = SCStream(filter: filter, configuration: configuration, delegate: self)
        try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: outputQueue)
        self.stream = stream
    }

    func start() {
        let timeout = DispatchWorkItem { [weak self] in
            self?.finish(.failure(NSError(
                domain: "AtelierAppSnap",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Timed out while preparing or capturing the window."]
            )))
        }
        self.timeout = timeout
        outputQueue.asyncAfter(deadline: .now() + 5, execute: timeout)
        stream?.startCapture { [weak self] error in
            if let error { self?.finish(.failure(error)) }
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        finish(.failure(error))
    }

    func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of outputType: SCStreamOutputType
    ) {
        guard outputType == .screen,
              CMSampleBufferIsValid(sampleBuffer),
              let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        let context = CIContext(options: [.useSoftwareRenderer: false])
        guard let image = context.createCGImage(ciImage, from: ciImage.extent) else {
            finish(.failure(NSError(
                domain: "AtelierAppSnap",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "Could not process the captured window."]
            )))
            return
        }
        let representation = NSBitmapImageRep(cgImage: image)
        guard let png = representation.representation(using: .png, properties: [:]) else {
            finish(.failure(NSError(
                domain: "AtelierAppSnap",
                code: 3,
                userInfo: [NSLocalizedDescriptionKey: "Could not encode the captured window as PNG."]
            )))
            return
        }
        finish(.success(png))
    }

    private func finish(_ result: Result<Data, Error>) {
        outputQueue.async { [weak self] in
            guard let self, !self.completed else { return }
            self.completed = true
            self.timeout?.cancel()
            let done = self.completion
            if let stream = self.stream {
                stream.stopCapture { _ in done(result) }
            } else {
                done(result)
            }
        }
    }
}

@available(macOS 12.3, *)
private final class AppSnapCaptureCoordinator {
    private let emitter: NDJSONEmitter
    private let outputDirectory: URL
    private let excludedBundleIdentifier: String
    private let feedback = CaptureFeedback()
    private let queue = DispatchQueue(label: "com.tofunori.atelier.appsnap.capture")
    private var activeCapture: OneFrameWindowCapture?

    init(emitter: NDJSONEmitter, outputDirectory: URL, excludedBundleIdentifier: String) {
        self.emitter = emitter
        self.outputDirectory = outputDirectory
        self.excludedBundleIdentifier = excludedBundleIdentifier
    }

    func capture(id: String, capturedAt: String) {
        queue.async {
            guard self.activeCapture == nil else {
                self.emitter.error("capture_in_progress", "A previous AppSnap capture is still in progress.", id: id, capturedAt: capturedAt)
                return
            }
            guard CGPreflightScreenCaptureAccess() else {
                self.emitter.error("screen-recording-required", "Screen Recording permission is required to capture a window.", id: id, capturedAt: capturedAt)
                return
            }
            guard AXIsProcessTrusted() else {
                self.emitter.error("accessibility-required", "Accessibility permission is required to capture the visible interface text.", id: id, capturedAt: capturedAt)
                return
            }
            guard let application = NSWorkspace.shared.frontmostApplication else {
                self.emitter.error("no_frontmost_application", "There is no frontmost application to capture.", id: id, capturedAt: capturedAt)
                return
            }
            guard application.bundleIdentifier != self.excludedBundleIdentifier else {
                self.emitter.error("no_eligible_window", "Focus another app before pressing both Option keys.", id: id, capturedAt: capturedAt)
                return
            }

            SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: true) { content, error in
                self.queue.async {
                    if let error {
                        self.emitter.error("shareable_content_unavailable", "Could not read shareable windows: \(error.localizedDescription)", id: id, capturedAt: capturedAt)
                        return
                    }
                    guard let content else {
                        self.emitter.error("window_list_unavailable", "macOS did not provide a window list.", id: id, capturedAt: capturedAt)
                        return
                    }

                    let candidates = content.windows.filter { window in
                        window.isOnScreen &&
                            window.owningApplication?.processID == application.processIdentifier &&
                            window.frame.width >= 64 && window.frame.height >= 64
                    }
                    let orderedIDs = orderedWindowIDs(for: application.processIdentifier)
                    let windowsByID = Dictionary(uniqueKeysWithValues: candidates.map { ($0.windowID, $0) })
                    let selected = orderedIDs.compactMap { windowsByID[$0] }.first
                        ?? candidates.max { lhs, rhs in
                            lhs.frame.width * lhs.frame.height < rhs.frame.width * rhs.frame.height
                        }
                    guard let selected else {
                        self.emitter.error("no_eligible_window", "No eligible frontmost window is available to capture.", id: id, capturedAt: capturedAt)
                        return
                    }

                    let interfaceSnapshot = accessibilitySnapshot(
                        for: application,
                        windowTitle: selected.title
                    )

                    do {
                        let capture = try OneFrameWindowCapture(window: selected) { result in
                            self.queue.async {
                                self.activeCapture = nil
                                switch result {
                                case .failure(let error):
                                    self.emitter.error("capture_processing_failed", "Could not process the captured window: \(error.localizedDescription)", id: id, capturedAt: capturedAt)
                                case .success(let png):
                                    self.finish(
                                        png: png,
                                        id: id,
                                        capturedAt: capturedAt,
                                        application: application,
                                        window: selected,
                                        interfaceSnapshot: interfaceSnapshot
                                    )
                                }
                            }
                        }
                        self.activeCapture = capture
                        capture.start()
                    } catch {
                        self.emitter.error("capture_setup_failed", "Could not configure window capture: \(error.localizedDescription)", id: id, capturedAt: capturedAt)
                    }
                }
            }
        }
    }

    private func finish(
        png: Data,
        id: String,
        capturedAt: String,
        application: NSRunningApplication,
        window: SCWindow,
        interfaceSnapshot: AccessibilitySnapshot?
    ) {
        let fileName = "appsnap-\(id.lowercased()).png"
        let destination = outputDirectory.appendingPathComponent(fileName, isDirectory: false)
        do {
            try png.write(to: destination, options: [.atomic])
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: destination.path)
        } catch {
            emitter.error("output_write_failed", "Could not save the captured AppSnap: \(error.localizedDescription)", id: id, capturedAt: capturedAt)
            return
        }

        feedback.flash(frame: window.frame)
        emitter.emit([
            "type": "captured",
            "id": id,
            "path": destination.path,
            "name": "AppSnap-\(capturedAt.replacingOccurrences(of: ":", with: "-" )).png",
            "capturedAt": capturedAt,
            "sourceAppName": application.localizedName,
            "sourceBundleIdentifier": application.bundleIdentifier,
            "sourceAppIconDataUrl": appIconDataURL(application),
            "sourceWindowTitle": window.title,
            "accessibilitySnapshot": interfaceSnapshot?.text,
            "accessibilityElementCount": interfaceSnapshot?.elementCount,
            "accessibilitySnapshotTruncated": interfaceSnapshot?.truncated,
        ])
    }
}

@available(macOS 12.3, *)
private final class OptionChordMonitor {
    private let emitter: NDJSONEmitter
    private let onChord: (String, String) -> Void
    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var chordIsLatched = false
    private var leftOptionDown = false
    private var rightOptionDown = false

    init(emitter: NDJSONEmitter, onChord: @escaping (String, String) -> Void) {
        self.emitter = emitter
        self.onChord = onChord
    }

    func start() -> Bool {
        let mask = CGEventMask(1 << CGEventType.flagsChanged.rawValue)
        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .listenOnly,
            eventsOfInterest: mask,
            callback: { proxy, type, event, context in
                guard let context else { return Unmanaged.passUnretained(event) }
                let monitor = Unmanaged<OptionChordMonitor>.fromOpaque(context).takeUnretainedValue()
                return monitor.handle(proxy: proxy, type: type, event: event)
            },
            userInfo: Unmanaged.passUnretained(self).toOpaque()
        ) else {
            emitter.error("event_tap_unavailable", "macOS could not create the passive Option-key listener.")
            return false
        }
        eventTap = tap
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        runLoopSource = source
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        leftOptionDown = CGEventSource.keyState(.combinedSessionState, key: 58)
        rightOptionDown = CGEventSource.keyState(.combinedSessionState, key: 61)
        emitter.emit(["type": "ready"])
        return true
    }

    private func handle(proxy: CGEventTapProxy, type: CGEventType, event: CGEvent) -> Unmanaged<CGEvent>? {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            chordIsLatched = false
            leftOptionDown = false
            rightOptionDown = false
            if let eventTap { CGEvent.tapEnable(tap: eventTap, enable: true) }
            emitter.error("event_tap_disabled", "macOS disabled the Option-key listener; Atelier re-enabled it.")
            return Unmanaged.passUnretained(event)
        }
        guard type == .flagsChanged else { return Unmanaged.passUnretained(event) }
        let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
        if keyCode == 58 { leftOptionDown.toggle() }
        else if keyCode == 61 { rightOptionDown.toggle() }
        else { return Unmanaged.passUnretained(event) }
        let bothDown = leftOptionDown && rightOptionDown
        if bothDown && !chordIsLatched {
            chordIsLatched = true
            let id = UUID().uuidString.lowercased()
            let capturedAt = isoTimestamp()
            emitter.emit(["type": "triggered", "id": id, "capturedAt": capturedAt])
            onChord(id, capturedAt)
        } else if !bothDown {
            chordIsLatched = false
        }
        return Unmanaged.passUnretained(event)
    }
}

private func parseArguments() throws -> HelperMode {
    let args = Array(CommandLine.arguments.dropFirst())
    if args == ["--check-permissions"] { return .checkPermissions }
    if args == ["--request-permissions"] { return .requestPermissions }

    guard args.first == "--watch" else {
        throw NSError(domain: "AtelierAppSnap", code: 10, userInfo: [NSLocalizedDescriptionKey: "Expected --check-permissions, --request-permissions, or --watch."])
    }
    var outputDirectory: String?
    var excludedBundleIdentifier: String?
    var parentProcessIdentifier: pid_t?
    var index = 1
    while index < args.count {
        let argument = args[index]
        guard index + 1 < args.count else {
            throw NSError(domain: "AtelierAppSnap", code: 11, userInfo: [NSLocalizedDescriptionKey: "\(argument) requires a value."])
        }
        if argument == "--output-dir" { outputDirectory = args[index + 1] }
        else if argument == "--excluded-bundle-id" { excludedBundleIdentifier = args[index + 1] }
        else if argument == "--parent-pid", let value = pid_t(args[index + 1]), value > 1 {
            parentProcessIdentifier = value
        }
        else {
            throw NSError(domain: "AtelierAppSnap", code: 12, userInfo: [NSLocalizedDescriptionKey: "Unknown argument: \(argument)"])
        }
        index += 2
    }
    guard let outputDirectory, !outputDirectory.isEmpty else {
        throw NSError(domain: "AtelierAppSnap", code: 13, userInfo: [NSLocalizedDescriptionKey: "--watch requires --output-dir."])
    }
    guard let excludedBundleIdentifier, !excludedBundleIdentifier.isEmpty else {
        throw NSError(domain: "AtelierAppSnap", code: 14, userInfo: [NSLocalizedDescriptionKey: "--watch requires --excluded-bundle-id."])
    }
    guard let parentProcessIdentifier else {
        throw NSError(domain: "AtelierAppSnap", code: 15, userInfo: [NSLocalizedDescriptionKey: "--watch requires --parent-pid."])
    }
    return .watch(
        outputDirectory: URL(fileURLWithPath: outputDirectory, isDirectory: true),
        excludedBundleIdentifier: excludedBundleIdentifier,
        parentProcessIdentifier: parentProcessIdentifier
    )
}

private func prepareOutputDirectory(_ url: URL) throws {
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: url.path)
}

private let emitter = NDJSONEmitter()

do {
    switch try parseArguments() {
    case .checkPermissions:
        emitPermissions(emitter)
    case .requestPermissions:
        if !CGPreflightListenEventAccess() { _ = CGRequestListenEventAccess() }
        if !CGPreflightScreenCaptureAccess() { _ = CGRequestScreenCaptureAccess() }
        if !AXIsProcessTrusted() {
            let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
            _ = AXIsProcessTrustedWithOptions(options)
        }
        emitPermissions(emitter)
    case .watch(let outputDirectory, let excludedBundleIdentifier, let parentProcessIdentifier):
        guard #available(macOS 12.3, *) else {
            emitter.error("unsupported_macos", "AppSnap requires macOS 12.3 or later.")
            exit(1)
        }
        try prepareOutputDirectory(outputDirectory)
        emitPermissions(emitter)
        guard CGPreflightListenEventAccess() else {
            emitter.error("input-monitoring-required", "Input Monitoring permission is required to watch both Option keys.")
            exit(2)
        }
        guard CGPreflightScreenCaptureAccess() else {
            emitter.error("screen-recording-required", "Screen Recording permission is required to capture a window.")
            exit(3)
        }

        _ = NSApplication.shared.setActivationPolicy(.accessory)
        let coordinator = AppSnapCaptureCoordinator(
            emitter: emitter,
            outputDirectory: outputDirectory,
            excludedBundleIdentifier: excludedBundleIdentifier
        )
        let monitor = OptionChordMonitor(emitter: emitter) { id, capturedAt in
            coordinator.capture(id: id, capturedAt: capturedAt)
        }
        guard monitor.start() else { exit(4) }

        let parentMonitor = DispatchSource.makeTimerSource(queue: .main)
        parentMonitor.schedule(deadline: .now() + 1, repeating: 1)
        parentMonitor.setEventHandler {
            if kill(parentProcessIdentifier, 0) != 0 { CFRunLoopStop(CFRunLoopGetMain()) }
        }
        parentMonitor.resume()

        signal(SIGTERM, SIG_IGN)
        signal(SIGINT, SIG_IGN)
        let termination = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
        termination.setEventHandler { CFRunLoopStop(CFRunLoopGetMain()) }
        termination.resume()
        let interruption = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
        interruption.setEventHandler { CFRunLoopStop(CFRunLoopGetMain()) }
        interruption.resume()
        CFRunLoopRun()
    }
} catch {
    emitter.error("invalid_arguments", error.localizedDescription)
    exit(64)
}
