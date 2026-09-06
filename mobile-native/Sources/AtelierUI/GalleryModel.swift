import SwiftUI
import PDFKit
import Security

struct FigureRegion: Codable, Sendable {
    let x: Double, y: Double, width: Double, height: Double
}

struct GalleryArtifact: Identifiable, Codable, Sendable {
    var id = UUID()
    let name: String
    var data: Data?
    var storedDataName: String?
    var fileID: String?
    var projectID: String?
    var size: Int = 0
    var annotationRegion: FigureRegion?
    var ext: String { (name as NSString).pathExtension.lowercased() }
    var kind: String {
        if ext == "pdf" { return "PDF" }
        if ["png", "jpg", "jpeg", "heic", "webp", "gif", "tiff"].contains(ext) { return "Figures" }
        if ext == "tex" { return "LaTeX" }
        return "Texte"
    }
    var supported: Bool { kind != "Texte" || ["txt", "md", "csv", "tsv", "json", "py", "r", "bib", "yaml", "yml", "toml", "swift", "js", "jsx", "ts", "tsx", "rs", "sh", "bash", "html", "css", "svg", "sty", "cls"].contains(ext) }
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
        let nextOffset: Int?
        let snapshot: String?
    }
    private struct Pair: Decodable { let token: String }
    var localItems: [GalleryArtifact] = []
    var remoteItems: [GalleryArtifact] = []
    var projects: [Project] = []
    var selectedProject = ""
    var connected = false
    var busy = false
    private var refreshID = UUID()
    var error: String?
    private var baseURL: URL?
    private var token = ""
    private var identities: [String: UUID] = [:]
    private var cache: [String: Data] = [:]
    private let session: URLSession

    init(address: URL, token: String, session: URLSession) {
        self.baseURL = address; self.token = token; self.session = session; connected = true
    }

    init(restoreCredentials: Bool = true) {
        session = URLSession(configuration: .ephemeral)
        guard restoreCredentials else { return }
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
        if !projects.contains(where: { $0.id == selectedProject }) { selectedProject = projects.first?.id ?? "" }
    }
    func refresh() async {
        guard connected else { remoteItems = []; return }
        let requestID = UUID(); refreshID = requestID
        busy = true; error = nil
        defer { if refreshID == requestID { busy = false } }
        if projects.isEmpty {
            do { try await loadProjects() }
            catch {
                if refreshID == requestID && !Task.isCancelled && (error as? URLError)?.code != .cancelled { self.error = error.localizedDescription }
                return
            }
        }
        guard refreshID == requestID, !Task.isCancelled else { return }
        guard !selectedProject.isEmpty else { remoteItems = []; return }
        let project = selectedProject
        remoteItems = []
        do {
            let items = try await galleryItems(project)
            try Task.checkCancellation()
            guard selectedProject == project, refreshID == requestID else { return }
            remoteItems = items.map {
                let key = project + ":" + $0.fileId
                let id = identities[key] ?? UUID()
                identities[key] = id
                return GalleryArtifact(id: id, name: $0.name, fileID: $0.fileId, projectID: project, size: $0.size)
            }
        } catch is CancellationError {} catch {
            if refreshID == requestID && !Task.isCancelled && (error as? URLError)?.code != .cancelled { self.error = error.localizedDescription }
        }
    }
    func contents(_ item: GalleryArtifact) async throws -> Data {
        if let data = item.data { return data }
        guard let id = item.fileID else { throw GalleryError.missingFile }
        if let data = cache[id] { return data }
        guard item.size <= 50 * 1024 * 1024 else { throw GalleryError.tooLarge }
        let data = try await remoteContents(item)
        cache[id] = data
        return data
    }
    func previewText(_ item: GalleryArtifact) async throws -> String {
        if let data = item.data { return String(decoding: data.prefix(65_536), as: UTF8.self) }
        guard let id = item.fileID else { throw GalleryError.missingFile }
        if let data = cache[id] { return String(decoding: data.prefix(65_536), as: UTF8.self) }
        if item.size == 0 { return "" }
        let data = try await remoteContents(item, range: "bytes=0-65535")
        return String(decoding: data.prefix(65_536), as: UTF8.self)
    }
    private func galleryItems(_ project: String, finding fileID: String? = nil) async throws -> [Index.Item] {
        var items: [Index.Item] = []
        var offset = 0
        var snapshot: String?
        var seen: Set<String> = []
        while true {
            try Task.checkCancellation()
            let data = try await get("remote/v1/gallery", identifier: project, offset: offset, snapshot: snapshot)
            let page = try JSONDecoder().decode(Index.self, from: data)
            snapshot = page.snapshot
            items.append(contentsOf: page.items.filter { seen.insert($0.fileId).inserted })
            if let fileID, items.contains(where: { $0.fileId == fileID }) { return items }
            guard let next = page.nextOffset else { return items }
            guard next > offset else { throw GalleryError.message("Pagination de la galerie interrompue. Réessayez l’actualisation.") }
            offset = next
        }
    }
    private func remoteContents(_ item: GalleryArtifact, range: String? = nil) async throws -> Data {
        guard let id = item.fileID else { throw GalleryError.missingFile }
        do { return try await get("remote/v1/file", identifier: id, range: range) }
        catch GalleryError.message(let message) where message == "fichier inconnu" {
            let restored = try await attachmentID(item)
            return try await get("remote/v1/file", identifier: restored, range: range)
        }
    }
    private func get(_ path: String, identifier: String? = nil, range: String? = nil, offset: Int? = nil, snapshot: String? = nil) async throws -> Data {
        guard let baseURL else { throw GalleryError.invalidAddress }
        var url = baseURL.appendingPathComponent(path)
        if let identifier { url.appendPathComponent(identifier) }
        if let offset { url.append(queryItems: [URLQueryItem(name: "offset", value: String(offset))]) }
        if let snapshot { url.append(queryItems: [URLQueryItem(name: "snapshot", value: snapshot)]) }
        var request = URLRequest(url: url)
        request.setValue(token, forHTTPHeaderField: "x-atelier-device-token")
        if let range { request.setValue(range, forHTTPHeaderField: "Range") }
        return try await response(request)
    }
    func attachmentID(_ item: GalleryArtifact) async throws -> String {
        if let id = item.fileID {
            // A gateway restart clears its in-memory file registry. Re-index the
            // original project before sending the stable opaque reference.
            let candidates: [String]
            if let project = item.projectID { candidates = [project] }
            else {
                let data = try await get("remote/v1/projects")
                candidates = try JSONDecoder().decode(Projects.self, from: data).projects.map(\.id)
            }
            for project in candidates {
                let items = try await galleryItems(project, finding: id)
                if items.contains(where: { $0.fileId == id }) { return id }
            }
            throw GalleryError.message("Ce fichier n’est plus disponible sur le Mac. Retrouvez-le dans la galerie ; votre message est conservé.")
        }
        guard let baseURL, var data = item.data else { throw GalleryError.attachmentTooLarge }
        var name = item.name
        if ["heic", "heif", "tif", "tiff"].contains(item.ext) {
            let converted = try PhotoImport.artifact(data: data)
            data = converted.data!
            name = (item.name as NSString).deletingPathExtension + ".jpg"
        }
        guard data.count <= 8 * 1024 * 1024 else { throw GalleryError.attachmentTooLarge }
        var request = URLRequest(url: baseURL.appendingPathComponent("remote/v1/attachments").appendingPathComponent(name))
        request.httpMethod = "POST"; request.httpBody = data
        request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
        request.setValue(token, forHTTPHeaderField: "x-atelier-device-token")
        struct Uploaded: Decodable { let fileId: String }
        return try JSONDecoder().decode(Uploaded.self, from: await response(request)).fileId
    }
    func invalidate(_ item: GalleryArtifact) { if let id = item.fileID { cache.removeValue(forKey: id) } }
    func chatRequest(_ components: [String], body: [String: Any]? = nil, timeout: TimeInterval = 20) async throws -> Data {
        guard let baseURL else { throw GalleryError.invalidAddress }
        var url = baseURL.appendingPathComponent("remote/v1")
        for component in components { url.appendPathComponent(component) }
        var request = URLRequest(url: url)
        request.setValue(token, forHTTPHeaderField: "x-atelier-device-token")
        if let body {
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        return try await response(request, timeout: timeout)
    }
    func chatStream(_ thread: String) async throws -> URLSession.AsyncBytes {
        guard let baseURL else { throw GalleryError.invalidAddress }
        let url = baseURL.appendingPathComponent("remote/v1/threads").appendingPathComponent(thread).appendingPathComponent("live")
        var request = URLRequest(url: url); request.timeoutInterval = 60
        request.setValue(token, forHTTPHeaderField: "x-atelier-device-token")
        let (bytes, response) = try await session.bytes(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw GalleryError.server((response as? HTTPURLResponse)?.statusCode ?? 0) }
        return bytes
    }
    private func response(_ request: URLRequest, timeout: TimeInterval = 20) async throws -> Data {
        var request = request; request.timeoutInterval = timeout
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            if (response as? HTTPURLResponse)?.statusCode == 401 { throw GalleryError.server(401) }
            if let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let message = body["error"] as? String {
                throw GalleryError.message(message)
            }
            throw GalleryError.server((response as? HTTPURLResponse)?.statusCode ?? 0)
        }
        return data
    }
    enum GalleryError: LocalizedError {
        case invalidAddress, missingFile, tooLarge, attachmentTooLarge, keychain, server(Int), message(String)
        var errorDescription: String? {
            switch self {
            case .message(let text): text
            case .attachmentTooLarge: "Les fichiers importés sont limités à 8 Mo par pièce jointe."
            case .keychain: "Impossible d’enregistrer la connexion dans le trousseau iOS."
            case .invalidAddress: "Entrez l’adresse HTTP ou HTTPS de la passerelle Atelier."
            case .missingFile: "Fichier indisponible."
            case .tooLarge: "Ce fichier dépasse la limite de 50 Mo de cet aperçu."
            case .server(let status): "La passerelle a répondu \(status). Vérifiez la connexion et le code d’association."
            }
        }
    }
}
