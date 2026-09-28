import SwiftUI
@preconcurrency import AVFoundation
@preconcurrency import Speech
import UserNotifications

@MainActor @Observable final class NativeVoice {
    static let shared = NativeVoice()
    private let speaker = AVSpeechSynthesizer()
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var generation = UUID()
    var starting = false
    var recording = false
    var transcript = ""
    var error: String?
    func speak(_ text: String) {
        speaker.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "fr-CA")
        speaker.speak(utterance)
    }
    func stopSpeaking() { speaker.stopSpeaking(at: .immediate) }
    func start() async {
        guard !recording, !starting else { return }
        starting = true
        let attempt = UUID(); generation = attempt
        defer { if generation == attempt { starting = false } }
        error = nil
        let authorized = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in continuation.resume(returning: status == .authorized) }
        }
        guard generation == attempt, !Task.isCancelled else { return }
        let microphone = await AVAudioApplication.requestRecordPermission()
        guard generation == attempt, !Task.isCancelled else { return }
        guard authorized && microphone else { error = "Autorisez le microphone et la reconnaissance vocale dans les réglages iOS."; return }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "fr-CA")), recognizer.isAvailable else { error = "La dictée est momentanément indisponible."; return }
        do {
            let audio = AVAudioSession.sharedInstance()
            try audio.setCategory(.record, mode: .measurement, options: .duckOthers)
            try audio.setActive(true, options: .notifyOthersOnDeactivation)
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            self.request = request
            transcript = ""
            let input = engine.inputNode
            input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in request.append(buffer) }
            engine.prepare(); try engine.start(); recording = true
            task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                let text = result?.bestTranscription.formattedString
                let finished = result?.isFinal == true || error != nil
                let message = error?.localizedDescription
                Task { @MainActor [weak self] in
                    guard let self, self.generation == attempt else { return }
                    if let text { self.transcript = text }
                    if finished { self.stop(); if let message, self.transcript.isEmpty { self.error = message } }
                }
            }
        } catch { stop(); self.error = error.localizedDescription }
    }
    func stop() {
        generation = UUID(); starting = false
        engine.stop()
        if request != nil { engine.inputNode.removeTap(onBus: 0) }
        request?.endAudio(); task?.cancel(); task = nil; request = nil; recording = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

struct NativeDictationSheet: View {
    let workspace: WorkspaceModel
    @State private var voice = NativeVoice.shared
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                TextEditor(text: $voice.transcript).accessibilityLabel("Transcription à relire")
                if let error = voice.error { Text(error).font(.footnote).foregroundStyle(.secondary) }
                Button(voice.recording ? "Arrêter la dictée" : "Démarrer la dictée", systemImage: voice.recording ? "stop.circle" : "mic.circle") {
                    if voice.recording { voice.stop() } else { Task { await voice.start() } }
                }.buttonStyle(.bordered).controlSize(.large).disabled(voice.starting)
                Text("Relisez le texte avant de l’ajouter à votre message.").font(.footnote).foregroundStyle(.secondary)
            }.padding().navigationTitle("Dicter").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) { Button("Ajouter") {
                        let text = voice.transcript.trimmingCharacters(in: .whitespacesAndNewlines)
                        workspace.draft += (workspace.draft.isEmpty ? "" : "\n") + text; dismiss()
                    }.disabled(voice.transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || voice.recording) }
                }
                .onDisappear { voice.stop() }
        }
    }
}

@MainActor enum NativeNotifications {
    static func received(thread: String, title: String, approval: Bool = false) {
        guard UserDefaults.standard.bool(forKey: "atelier.notifications"), UIApplication.shared.applicationState != .active else { return }
        let content = UNMutableNotificationContent()
        content.title = approval ? "Votre accord est nécessaire" : "Le travail est terminé"
        content.body = UserDefaults.standard.bool(forKey: "atelier.notificationPreview") ? title
            : approval ? "Ouvrez Atelier pour répondre à la demande." : "Ouvrez Atelier pour consulter le résultat."
        content.userInfo = ["threadId":thread]
        Task { try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "atelier-\(thread)-\(approval)", content: content, trigger: nil)) }
    }
}

/// Alerts the Mac sends through ntfy while Atelier is closed
/// (`GET`/`POST /remote/v1/notify`). The Mac generates the topic on first enable.
struct RemoteNotifySettings: Decodable, Equatable, Sendable {
    var enabled = false
    var server = ""
    var topic: String?
    var subscribeUrl: String?
    var onlyWhenAway = true
    var preview = false
    enum CodingKeys: String, CodingKey { case enabled, server, topic, subscribeUrl, onlyWhenAway, preview }
    init() {}
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        enabled = try c.decodeIfPresent(Bool.self, forKey: .enabled) ?? false
        server = try c.decodeIfPresent(String.self, forKey: .server) ?? ""
        topic = try c.decodeIfPresent(String.self, forKey: .topic).flatMap { $0.isEmpty ? nil : $0 }
        subscribeUrl = try c.decodeIfPresent(String.self, forKey: .subscribeUrl).flatMap { $0.isEmpty ? nil : $0 }
        onlyWhenAway = try c.decodeIfPresent(Bool.self, forKey: .onlyWhenAway) ?? true
        preview = try c.decodeIfPresent(Bool.self, forKey: .preview) ?? false
    }
}

extension GalleryModel {
    func remoteNotifySettings() async throws -> RemoteNotifySettings {
        try JSONDecoder().decode(RemoteNotifySettings.self, from: await chatRequest(["notify"]))
    }
    /// Any subset of `enabled`, `onlyWhenAway`, `preview`; `test` sends a test alert.
    func updateRemoteNotify(_ changes: [String: Bool]) async throws -> RemoteNotifySettings {
        try JSONDecoder().decode(RemoteNotifySettings.self, from: await chatRequest(["notify"], body: changes))
    }
    /// A Mac without the route answers 404 (or 405, or its web page with 200).
    static func remoteNotifyMessage(_ error: Error) -> String {
        if case GalleryError.server(let status) = error, [404, 405].contains(status) { return remoteNotifyOutdated }
        if error is DecodingError { return remoteNotifyOutdated }
        // 429: the Mac allows six test alerts a minute.
        if case GalleryError.message(let text) = error, text == "trop de requêtes" { return "Trop de demandes d’affilée. Réessayez dans une minute." }
        return error.localizedDescription
    }
    static let remoteNotifyOutdated = "Mettez Atelier à jour sur le Mac pour recevoir ces alertes."
}

struct NativeNotificationSettings: View {
    let gallery: GalleryModel
    @AppStorage("atelier.notifications") private var enabled = false
    @AppStorage("atelier.notificationPreview") private var preview = false
    @State private var error: String?
    @State private var remote: RemoteNotifySettings?
    @State private var remoteBusy = false
    @State private var remoteError: String?
    @State private var remoteNotice: String?
    @Environment(\.openURL) private var openURL
    var body: some View {
        Form {
            Section {
                Toggle("Notifications reçues par l’app", isOn: Binding(get: { enabled }, set: { value in
                    if !value { enabled = false; return }
                    Task {
                        do { enabled = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]); if !enabled { error = "Les notifications sont désactivées dans les réglages iOS." } }
                        catch { self.error = error.localizedDescription }
                    }
                }))
                Toggle("Afficher le titre du travail", isOn: $preview)
                if let error { Text(error).foregroundStyle(.secondary) }
                Text("Ces alertes concernent les événements reçus pendant que l’app est ouverte ou vient d’être quittée.").font(.footnote).foregroundStyle(.secondary)
            }
            Section {
                remoteSettings
            } header: {
                Text("Alertes quand l’app est fermée")
            } footer: {
                Text("Nécessite l’app gratuite « ntfy » de l’App Store. Toucher une alerte rouvre Atelier sur le fil concerné.")
            }
        }.navigationTitle("Notifications")
        .task { await loadRemote() }
    }
    @ViewBuilder private var remoteSettings: some View {
        if !gallery.connected {
            Text("Associez d’abord le Mac pour activer ces alertes.").foregroundStyle(.secondary)
        } else if let remote {
            Toggle("Alertes par ntfy", isOn: remoteBinding("enabled", remote.enabled)).disabled(remoteBusy)
            if remote.enabled {
                Toggle("Seulement quand je ne suis pas devant le Mac", isOn: remoteBinding("onlyWhenAway", remote.onlyWhenAway)).disabled(remoteBusy)
                Toggle("Afficher le titre du fil", isOn: remoteBinding("preview", remote.preview)).disabled(remoteBusy)
            }
            // The Mac creates the topic on first enable or first test alert.
            if let link = remote.subscribeUrl {
                LabeledContent("Abonnement") {
                    Text(link).font(.footnote.monospaced()).textSelection(.enabled)
                }
                // ntfy opens its own https://ntfy.sh/<sujet> links.
                if let url = URL(string: link) {
                    Button("S’abonner dans ntfy", systemImage: "bell.badge") { openURL(url) }
                }
                Button("Copier le lien", systemImage: "link") {
                    UIPasteboard.general.string = link
                    remoteNotice = "Lien copié."
                }
                if let topic = remote.topic {
                    Button("Copier le sujet", systemImage: "doc.on.doc") {
                        UIPasteboard.general.string = topic
                        remoteNotice = "Sujet copié."
                    }
                }
            }
            // The Mac sends it even while alerts are off.
            Button("Envoyer une alerte d’essai", systemImage: "paperplane") {
                Task { await updateRemote(["test": true], revertingTo: remote, notice: "Alerte d’essai envoyée. Elle arrive dans ntfy dans quelques secondes.") }
            }.disabled(remoteBusy)
        } else if remoteBusy {
            ProgressView()
        } else {
            Button("Réessayer", systemImage: "arrow.clockwise") { Task { await loadRemote() } }
        }
        if let remoteError { Text(remoteError).font(.footnote).foregroundStyle(.secondary) }
        if let remoteNotice { Text(remoteNotice).font(.footnote).foregroundStyle(.secondary) }
    }
    /// Shows the change at once; the Mac's answer, or the previous state on failure, follows.
    private func remoteBinding(_ key: String, _ value: Bool) -> Binding<Bool> {
        Binding(get: { value }, set: { newValue in
            let previous = remote
            switch key {
            case "enabled": remote?.enabled = newValue
            case "onlyWhenAway": remote?.onlyWhenAway = newValue
            case "preview": remote?.preview = newValue
            default: break
            }
            Task { await updateRemote([key: newValue], revertingTo: previous) }
        })
    }
    private func loadRemote() async {
        guard gallery.connected else { return }
        remoteBusy = true; remoteError = nil
        defer { remoteBusy = false }
        do { remote = try await gallery.remoteNotifySettings() }
        catch { if !Task.isCancelled { remoteError = GalleryModel.remoteNotifyMessage(error) } }
    }
    private func updateRemote(_ changes: [String: Bool], revertingTo previous: RemoteNotifySettings?, notice: String? = nil) async {
        remoteBusy = true; remoteError = nil; remoteNotice = nil
        defer { remoteBusy = false }
        do {
            remote = try await gallery.updateRemoteNotify(changes)
            remoteNotice = notice
        } catch {
            remote = previous
            remoteError = GalleryModel.remoteNotifyMessage(error)
        }
    }
}
