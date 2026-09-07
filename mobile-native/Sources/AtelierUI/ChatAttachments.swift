import SwiftUI
import PhotosUI
import ImageIO

enum PhotoImport {
    static func artifact(data: Data) throws -> GalleryArtifact {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 2048
              ] as CFDictionary),
              let jpeg = UIImage(cgImage: thumbnail).jpegData(compressionQuality: 0.88) else {
            throw CocoaError(.fileReadCorruptFile)
        }
        return GalleryArtifact(name: "Photo-\(UUID().uuidString.prefix(8)).jpg", data: jpeg, size: jpeg.count)
    }
}

struct ChatAttachmentBar: View {
    @Bindable var workspace: WorkspaceModel
    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 10) {
                ForEach(workspace.chat.attachments) { item in
                    HStack(spacing: 6) {
                        Button {
                            Task {
                                do { try workspace.openArtifact(item, data: await workspace.gallery.contents(item)) }
                                catch { workspace.chat.error = error.localizedDescription }
                            }
                        } label: {
                            HStack {
                                ArtifactThumbnail(item: item, gallery: workspace.gallery).frame(width: 40, height: 40).clipped()
                                Text(item.name).lineLimit(1).frame(maxWidth: 130)
                            }
                        }.accessibilityLabel("Afficher " + item.name)
                        Button {
                            workspace.chat.attachments.removeAll { $0.id == item.id }
                        } label: { Image(systemName: "xmark.circle.fill") }
                            .accessibilityLabel("Retirer " + item.name)
                    }.font(.caption).padding(8).background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
                }
            }
        }.scrollIndicators(.hidden).disabled(workspace.chat.sending)
    }
}

struct ChatAttachMenu: View {
    @Bindable var workspace: WorkspaceModel
    @State private var showPhotos = false
    @State private var photos: [PhotosPickerItem] = []
    @State private var importing = false

    var body: some View {
        Menu {
            Button("Joindre depuis la galerie", systemImage: "square.grid.2x2") { workspace.surface = .gallery }
            Button("Photothèque", systemImage: "photo.on.rectangle") { showPhotos = true }
            Button("Joindre depuis Fichiers", systemImage: "folder") {
                workspace.importToChat = true; workspace.importRequested = true
            }
            Text("Les outils sont pilotés par l’agent sur le Mac.")
        } label: {
            if importing { ProgressView() }
            else { Image(systemName: "plus").frame(width: 44, height: 44) }
        }
        .accessibilityLabel("Joindre un fichier ou une photo")
        .disabled(importing || workspace.chat.sending)
        .photosPicker(isPresented: $showPhotos, selection: $photos, maxSelectionCount: max(1, 6 - workspace.chat.attachments.count), matching: .images)
        .onChange(of: photos) { _, selection in
            guard !selection.isEmpty else { return }
            let target = workspace.chat.selected?.id
            importing = true
            Task {
                defer { importing = false; photos = [] }
                for photo in selection {
                    do {
                        guard let data = try await photo.loadTransferable(type: Data.self) else { throw CocoaError(.fileReadCorruptFile) }
                        let item = try PhotoImport.artifact(data: data)
                        workspace.gallery.localItems.append(item)
                        if workspace.chat.selected?.id == target { workspace.attachToChat(item) }
                        else { workspace.chat.error = "La photo est disponible dans la galerie ; la conversation a changé." }
                    } catch { workspace.chat.error = "Import Photos : " + error.localizedDescription }
                }
            }
        }
    }
}


struct ChatHistoryFiles: View {
    let items: [GalleryArtifact]
    let workspace: WorkspaceModel
    @State private var opening: UUID?
    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(items) { item in
                    Button {
                        opening = item.id
                        Task {
                            defer { opening = nil }
                            do { try workspace.openArtifact(item, data: await workspace.gallery.contents(item)) }
                            catch { workspace.chat.error = "Ouverture de " + item.name + " : " + error.localizedDescription }
                        }
                    } label: {
                        HStack(spacing: 8) {
                            if opening == item.id { ProgressView().frame(width: 44, height: 44) }
                            else { ArtifactThumbnail(item: item, gallery: workspace.gallery).frame(width: 44, height: 44).clipped() }
                            VStack(alignment: .leading, spacing: 3) {
                                Text(item.name).font(.subheadline).lineLimit(1)
                                Text(item.kind).font(.caption).foregroundStyle(.secondary)
                            }.frame(maxWidth: 180, alignment: .leading)
                        }.padding(10).background(.quaternary, in: RoundedRectangle(cornerRadius: 14))
                    }.buttonStyle(.plain).disabled(opening != nil).accessibilityLabel("Ouvrir " + item.name)
                }
            }
        }.scrollIndicators(.hidden)
    }
}
