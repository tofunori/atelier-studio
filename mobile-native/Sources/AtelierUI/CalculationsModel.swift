import Foundation
import Observation

struct CalculationTimestamp: Decodable, Equatable {
    let date: Date?
    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if let text = try? value.decode(String.self) {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            date = formatter.date(from: text) ?? ISO8601DateFormatter().date(from: text)
        } else if let number = try? value.decode(Double.self), number.isFinite {
            date = Date(timeIntervalSince1970: number > 10_000_000_000 ? number / 1000 : number)
        } else { date = nil }
    }
}
struct CalculationRun: Decodable, Identifiable {
    struct Progress: Decodable {
        let current: Double
        let total: Double
        let unit: String
        var fraction: Double? {
            guard current.isFinite, total.isFinite, current >= 0, total > 0 else { return nil }
            return min(1, current / total)
        }
        var label: String { "\(current.formatted()) / \(total.formatted()) \(unit)" }
    }
    let id: String
    let label: String
    let host: String
    let state: String
    let workDir: String?
    let startedAt: CalculationTimestamp?
    let endedAt: CalculationTimestamp?
    let lastActivityAt: CalculationTimestamp?
    let progress: Progress?
    let logTail: [String]?
    var title: String { label.isEmpty ? "Calcul sans titre" : label }
    var location: String { Self.location(host) }
    static func location(_ host: String) -> String { ["mac":"Mac", "nas":"NAS", "narval":"Narval"][host] ?? host }
    var stateLabel: String { ["running":"En cours", "queued":"En attente", "completed":"Terminé", "failed":"Échec"][state] ?? "État inconnu" }
    var finished: Bool { state == "completed" || state == "failed" }
    var project: String? {
        guard let workDir, !workDir.isEmpty, workDir != "/" else { return nil }
        return URL(fileURLWithPath: workDir).lastPathComponent
    }
    var step: String {
        if let progress, progress.fraction != nil { return progress.label }
        return ["queued":"En attente de ressources", "running":"Progression non fournie", "completed":"Calcul terminé", "failed":"Consulter les dernières nouvelles"][state] ?? "Vérification nécessaire"
    }
}
struct CalculationSnapshot: Decodable {
    struct HostError: Decodable {
        let host: String
        let code: String
        let message: String
    }
    let observedAt: CalculationTimestamp
    let runs: [CalculationRun]
    let errors: [HostError]
}
struct CalculationLog: Decodable {
    let lines: [String]
    let truncated: Bool
}

@MainActor @Observable final class CalculationsModel {
    var snapshot: CalculationSnapshot?
    var loading = false
    var error: String?
    private var requestID: UUID?
    private var connectionRevision: UUID?
    private var filter: String?
    func cancelPending() { requestID = nil; loading = false }
    var runs: [CalculationRun] {
        (snapshot?.runs ?? []).sorted {
            if $0.finished != $1.finished { return !$0.finished }
            let left = $0.lastActivityAt?.date ?? $0.startedAt?.date ?? .distantPast
            let right = $1.lastActivityAt?.date ?? $1.startedAt?.date ?? .distantPast
            return left == right ? $0.id < $1.id : left > right
        }
    }
    func refresh(using gallery: GalleryModel, host: String) async {
        if connectionRevision != gallery.connectionRevision || filter != host {
            connectionRevision = gallery.connectionRevision; filter = host
            snapshot = nil; error = nil; requestID = nil; loading = false
        }
        guard !loading else { return }
        guard gallery.hasAddress else { error = "Associez votre Mac dans les réglages pour voir les calculs."; return }
        let id = UUID(); requestID = id; loading = true
        defer { if requestID == id { loading = false; requestID = nil } }
        do {
            let data = try await gallery.chatRequest(["compute"], timeout: 95, query: [URLQueryItem(name: "host", value: host)])
            let result = try JSONDecoder().decode(CalculationSnapshot.self, from: data)
            guard !Task.isCancelled, requestID == id, connectionRevision == gallery.connectionRevision else { return }
            snapshot = result; error = nil
        } catch {
            guard !Task.isCancelled, requestID == id else { return }
            self.error = error.localizedDescription
        }
    }
}
