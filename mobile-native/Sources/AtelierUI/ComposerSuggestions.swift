import SwiftUI

struct ComposerTrigger: Equatable {
    enum Kind: String { case command, file }
    let kind: Kind
    let query: String
    let range: NSRange

    static func caretOffset(in text: String, index: String.Index) -> Int? {
        guard index == text.endIndex || text.indices.contains(index) else { return nil }
        return index.utf16Offset(in: text)
    }

    static func parse(_ text: String, caret: Int? = nil) -> Self? {
        let offset = caret ?? text.utf16.count
        guard offset >= 0, offset <= text.utf16.count,
              let cursor = Range(NSRange(location: offset, length: 0), in: text)?.lowerBound else { return nil }
        let prefix = text[..<cursor]
        let start = prefix.lastIndex(where: { $0.isWhitespace }).map { text.index(after: $0) } ?? text.startIndex
        guard start < cursor else { return nil }
        let token = text[start..<cursor]
        let kind: Kind
        if token.first == "/", text[..<start].allSatisfy(\.isWhitespace), !token.dropFirst().contains("/") { kind = .command }
        else if token.first == "@" { kind = .file }
        else { return nil }
        let end = text[cursor...].firstIndex(where: \.isWhitespace) ?? text.endIndex
        return Self(kind: kind, query: String(token.dropFirst()), range: NSRange(start..<end, in: text))
    }
    func replacing(in text: String, with value: String) -> (text: String, caret: Int)? {
        guard let range = Range(range, in: text) else { return nil }
        var result = text
        result.replaceSubrange(range, with: value)
        return (result, self.range.location + value.utf16.count)
    }
}

struct ComposerCommand: Decodable, Identifiable {
    let name: String
    let source: String
    var description: String? = nil
    var id: String { name }
    var subtitle: String { description ?? (source == "project" ? "Skill du projet" : "Skill du Mac") }
}

@MainActor @Observable final class ComposerSuggestionsModel {
    var commands: [ComposerCommand] = []
    var files: [GalleryArtifact] = []
    var loading = false
    var error: String?
    private var context = ""
    private var requestID = UUID()
    static let localCommands: [ComposerCommand] = [
        .init(name: "model", source: "atelier", description: "Choisir le modèle"),
        .init(name: "permissions", source: "atelier", description: "Mode d’autorisation")
    ]
    func load(kind: ComposerTrigger.Kind?, thread: RemoteChatModel.Thread?, project: String?, gallery: GalleryModel, preview: Bool) async {
        let key = "\(gallery.connectionRevision)-\(thread?.id ?? "")-\(project ?? "")-\(kind?.rawValue ?? "")"
        guard key != context else { return }
        context = key; requestID = UUID()
        let request = requestID
        commands = Self.localCommands; files = []; error = nil; loading = false
        guard let kind else { return }
        if preview {
            commands += [.init(name: "redaction-article", source: "user"), .init(name: "recherche", source: "user")]
            files = [GalleryArtifact(name: "manuscrit.tex", data: Data("Texte de démonstration".utf8))]
            return
        }
        guard gallery.hasAddress else { error = "Le Mac doit être connecté pour charger les suggestions."; return }
        if kind == .command && thread == nil { return }
        if kind == .file && (project == nil || project?.isEmpty == true) { error = "Choisissez un projet pour retrouver ses fichiers."; return }
        loading = true
        defer { if requestID == request { loading = false } }
        do {
            if kind == .command, let thread {
                struct Catalog: Decodable { let commands: [ComposerCommand] }
                let data = try await gallery.chatRequest(["threads", thread.id, "commands"])
                let result = try JSONDecoder().decode(Catalog.self, from: data)
                guard !Task.isCancelled, requestID == request else { return }
                commands = result.commands
            } else if let project {
                let result = try await gallery.composerFiles(project: project)
                guard !Task.isCancelled, requestID == request else { return }
                files = result
            }
        } catch {
            guard !Task.isCancelled, requestID == request else { return }
            self.error = "Suggestions indisponibles. Vérifiez la connexion et la version d’Atelier sur le Mac."
        }
    }
    func matchingCommands(_ query: String) -> [ComposerCommand] {
        commands.filter { query.isEmpty || $0.name.localizedStandardContains(query) }
            .sorted { ($0.name.lowercased().hasPrefix(query.lowercased()) ? 0 : 1, $0.name) < ($1.name.lowercased().hasPrefix(query.lowercased()) ? 0 : 1, $1.name) }
    }
    func matchingFiles(_ query: String) -> [GalleryArtifact] {
        files.filter { query.isEmpty || $0.name.localizedStandardContains(query) }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }
}

struct ComposerSuggestionsView: View {
    let model: ComposerSuggestionsModel
    let trigger: ComposerTrigger
    var chooseCommand: (ComposerCommand) -> Void
    var chooseFile: (GalleryArtifact) -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(trigger.kind == .command ? "Skills et commandes" : "Fichiers du projet").font(.caption).foregroundStyle(.secondary)
                Spacer()
                if model.loading { ProgressView().controlSize(.mini) }
            }.padding(.horizontal, 10)
            ScrollView {
                LazyVStack(spacing: 0) {
                    if trigger.kind == .command {
                        ForEach(model.matchingCommands(trigger.query)) { command in
                            Button { chooseCommand(command) } label: {
                                suggestion("/" + command.name, subtitle: command.subtitle, icon: command.source == "atelier" ? "command" : "sparkles")
                            }.buttonStyle(.plain)
                        }
                    } else {
                        ForEach(model.matchingFiles(trigger.query)) { file in
                            Button { chooseFile(file) } label: { suggestion(file.name, subtitle: file.kind, icon: "doc") }.buttonStyle(.plain)
                        }
                    }
                    if let error = model.error { Text(error).font(.caption).foregroundStyle(.secondary).padding(10) }
                    else if !model.loading && (trigger.kind == .command ? model.matchingCommands(trigger.query).isEmpty : model.matchingFiles(trigger.query).isEmpty) {
                        Text("Aucun résultat").font(.caption).foregroundStyle(.secondary).padding(10)
                    }
                }
            }.frame(maxHeight: 190).fixedSize(horizontal: false, vertical: true)
        }.padding(.vertical, 8)
    }
    private func suggestion(_ title: String, subtitle: String, icon: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon).frame(width: 22).foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline).foregroundStyle(.primary).lineLimit(1)
                Text(subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 0)
        }.padding(.horizontal, 10).padding(.vertical, 6).frame(minHeight: 44).contentShape(Rectangle())
    }
}
