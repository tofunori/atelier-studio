import SwiftUI
import PDFKit
import Security

struct GalleryArtifact: Identifiable {
    var id = UUID()
    let name: String
    var data: Data?
    var fileID: String?
    var size: Int = 0
    var ext: String { (name as NSString).pathExtension.lowercased() }
    var kind: String {
        if ext == "pdf" { return "PDF" }
        if ["png", "jpg", "jpeg", "heic", "webp", "gif", "tiff"].contains(ext) { return "Figures" }
        if ext == "tex" { return "LaTeX" }
        return "Texte"
    }
    var supported: Bool { kind != "Texte" || ["txt", "md", "csv", "json", "py", "r", "bib", "yaml", "yml"].contains(ext) }
}

@MainActor @Observable final class GalleryModel {
    struct Project: Decodable, Identifiable {
        let projectId: String; let name: String
        var id: String { projectId }
    }
    private struct Projects: Decodable { let projects: [Project] }
    private struct Index: Decodable {
        struct Item: Decodable { let fileId: String; let name: String; let size: Int }
        let items: [Item]
    }
    private struct Pair: Decodable { let token: String }
    var localItems: [GalleryArtifact] = []
    var remoteItems: [GalleryArtifact] = []
    var projects: [Project] = []
    var selectedProject = ""
    var connected = false
    var busy = false
    var error: String?
    private var baseURL: URL?
    private var token = ""
    private var identities: [String: UUID] = [:]
    private var cache: [String: Data] = [:]
    private let session = URLSession(configuration: .ephemeral)

    init() {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "atelier.gateway", kSecReturnData as String: true]
        var result: CFTypeRef?
        if SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
           let data = result as? Data,
           let saved = try? JSONDecoder().decode(Credentials.self, from: data) {
            baseURL = saved.address; token = saved.token; connected = true
        }
    }
    private struct Credentials: Codable { let address: URL; let token: String }
    func connect(link: String) async throws {
        guard let parts = URLComponents(string: link.trimmingCharacters(in: .whitespacesAndNewlines)),
              parts.scheme == "atelier-native", parts.host == "pair",
              let address = parts.queryItems?.first(where: { $0.name == "address" })?.value,
              let code = parts.queryItems?.first(where: { $0.name == "code" })?.value else {
            throw GalleryError.invalidAddress
        }
        try await connect(address: address, code: code)
    }
    private func saveCredentials(address: URL, token: String) throws {
        let data = try JSONEncoder().encode(Credentials(address: address, token: token))
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "atelier.gateway"]
        let attributes: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var item = query; item.merge(attributes) { _, new in new }
            guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw GalleryError.keychain }
        } else if status != errSecSuccess { throw GalleryError.keychain }
    }

    func connect(address: String, code: String) async throws {
        guard let url = URL(string: address.trimmingCharacters(in: .whitespacesAndNewlines)),
              ["http", "https"].contains(url.scheme), url.host != nil,
              url.user == nil, url.password == nil else { throw GalleryError.invalidAddress }
        var request = URLRequest(url: url.appendingPathComponent("remote/v1/pair"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["code": code.trimmingCharacters(in: .whitespacesAndNewlines), "deviceName": "Atelier SwiftUI", "protocolVersion": 1])
        let data = try await response(request)
        let paired = try JSONDecoder().decode(Pair.self, from: data)
        try saveCredentials(address: url, token: paired.token)
        baseURL = url; token = paired.token; connected = true
        remoteItems = []; cache = [:]; identities = [:]; projects = []; selectedProject = ""
        try await loadProjects()
    }
    func loadProjects() async throws {
        let data = try await get("remote/v1/projects")
        projects = try JSONDecoder().decode(Projects.self, from: data).projects
        selectedProject = projects.first?.id ?? ""
    }
    func refresh() async {
        guard connected else { remoteItems = []; return }
        busy = true; error = nil
        if projects.isEmpty {
            do { try await loadProjects() }
            catch { self.error = error.localizedDescription; busy = false; return }
        }
        guard !selectedProject.isEmpty else { remoteItems = []; busy = false; return }
        let project = selectedProject
        remoteItems = []
        defer { busy = false }
        do {
            let data = try await get("remote/v1/gallery", identifier: project)
            try Task.checkCancellation()
            guard selectedProject == project else { return }
            remoteItems = try JSONDecoder().decode(Index.self, from: data).items.map {
                let key = project + ":" + $0.fileId
                let id = identities[key] ?? UUID()
                identities[key] = id
                return GalleryArtifact(id: id, name: $0.name, fileID: $0.fileId, size: $0.size)
            }
        } catch is CancellationError {} catch { self.error = error.localizedDescription }
    }
    func contents(_ item: GalleryArtifact) async throws -> Data {
        if let data = item.data { return data }
        guard let id = item.fileID else { throw GalleryError.missingFile }
        if let data = cache[id] { return data }
        guard item.size <= 50 * 1024 * 1024 else { throw GalleryError.tooLarge }
        let data = try await get("remote/v1/file", identifier: id)
        cache[id] = data
        return data
    }
    private func get(_ path: String, identifier: String? = nil) async throws -> Data {
        guard let baseURL else { throw GalleryError.invalidAddress }
        var url = baseURL.appendingPathComponent(path)
        if let identifier { url.appendPathComponent(identifier) }
        var request = URLRequest(url: url)
        request.setValue(token, forHTTPHeaderField: "x-atelier-device-token")
        return try await response(request)
    }
    private func response(_ request: URLRequest) async throws -> Data {
        var request = request; request.timeoutInterval = 20
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw GalleryError.server((response as? HTTPURLResponse)?.statusCode ?? 0)
        }
        return data
    }
    enum GalleryError: LocalizedError {
        case invalidAddress, missingFile, tooLarge, keychain, server(Int)
        var errorDescription: String? {
            switch self {
            case .keychain: "Impossible d’enregistrer la connexion dans le trousseau iOS."
            case .invalidAddress: "Entrez l’adresse HTTP ou HTTPS de la passerelle Atelier."
            case .missingFile: "Fichier indisponible."
            case .tooLarge: "Ce fichier dépasse la limite de 50 Mo de cet aperçu."
            case .server(let status): "La passerelle a répondu \(status). Vérifiez la connexion et le code d’association."
            }
        }
    }
}
