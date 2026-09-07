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
        content.body = UserDefaults.standard.bool(forKey: "atelier.notificationPreview") ? title : "Ouvrez Atelier pour consulter le résultat."
        content.userInfo = ["threadId":thread]
        Task { try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "atelier-\(thread)-\(approval)", content: content, trigger: nil)) }
    }
}

struct NativeNotificationSettings: View {
    @AppStorage("atelier.notifications") private var enabled = false
    @AppStorage("atelier.notificationPreview") private var preview = false
    @State private var error: String?
    var body: some View {
        Form {
            Toggle("Notifications reçues par l’app", isOn: Binding(get: { enabled }, set: { value in
                if !value { enabled = false; return }
                Task {
                    do { enabled = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]); if !enabled { error = "Les notifications sont désactivées dans les réglages iOS." } }
                    catch { self.error = error.localizedDescription }
                }
            }))
            Toggle("Afficher le titre du travail", isOn: $preview)
            if let error { Text(error).foregroundStyle(.secondary) }
            Text("Ces alertes concernent les événements reçus pendant que l’app est connectée. La livraison lorsque iOS suspend Atelier nécessite un service de notifications distantes.").font(.footnote).foregroundStyle(.secondary)
        }.navigationTitle("Notifications")
    }
}
