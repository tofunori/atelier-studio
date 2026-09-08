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
                    Button {
                        Task {
                            do { try workspace.openArtifact(item, data: await workspace.gallery.contents(item)) }
                            catch { workspace.chat.error = error.localizedDescription }
                        }
                    } label: {
                        ChatAttachmentPreview(item: item, gallery: workspace.gallery, compact: true)
                    }.buttonStyle(.plain).accessibilityLabel("Afficher " + item.name)
                        .overlay(alignment: .topTrailing) {
                            Button { workspace.chat.attachments.removeAll { $0.id == item.id } } label: {
                                Image(systemName: "xmark").font(.system(size: 10, weight: .semibold))
                                    .foregroundStyle(.primary).frame(width: 22, height: 22)
                                    .background(.regularMaterial, in: Circle()).frame(width: 44, height: 44)
                            }.buttonStyle(.plain).accessibilityLabel("Retirer " + item.name)
                        }
                }
            }.padding(.vertical, 3)
        }.scrollIndicators(.hidden).disabled(workspace.chat.sending)
    }
}

struct ChatAttachMenu: View {
    @Bindable var workspace: WorkspaceModel
    @State private var showPhotos = false
    @State private var photos: [PhotosPickerItem] = []
    @State private var importing = false
    @State private var showingMenu = false
    @State private var pendingAction: AttachmentAction?
    @AppStorage("atelier.accent") private var accent = "sage"
    private enum AttachmentAction { case gallery, photos, files }

    var body: some View {
        Button { showingMenu = true } label: {
            if importing { ProgressView() }
            else { Image(systemName: "plus").frame(width: 44, height: 44) }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Joindre un fichier ou une photo")
        .accessibilityIdentifier("chat.attachMenu")
        .disabled(importing || workspace.chat.sending)
        .popover(isPresented: $showingMenu, attachmentAnchor: .rect(.bounds), arrowEdge: .bottom) {
            VStack(spacing: 4) {
                attachmentAction("Galerie", icon: "square.grid.2x2", action: .gallery)
                attachmentAction("Photos", icon: "photo.on.rectangle", action: .photos)
                attachmentAction("Fichiers", icon: "paperclip", action: .files)
            }
            .padding(12).frame(width: 260)
            .presentationCompactAdaptation(.popover)
            .presentationBackground(.regularMaterial)
            .onDisappear {
                let action = pendingAction
                pendingAction = nil
                switch action {
                case .gallery: workspace.surface = .gallery
                case .photos: showPhotos = true
                case .files: workspace.importToChat = true; workspace.importRequested = true
                case nil: break
                }
            }
        }
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

    private func attachmentAction(_ title: String, icon: String, action: AttachmentAction) -> some View {
        Button {
            pendingAction = action
            showingMenu = false
        } label: {
            HStack(spacing: 14) {
                Image(systemName: icon).font(.system(size: 19, weight: .regular))
                    .foregroundStyle(AtelierTheme.accent(named: accent))
                    .frame(width: 40, height: 40)
                    .background(.primary.opacity(0.06), in: Circle())
                Text(title).font(.body).foregroundStyle(.primary)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 8).padding(.vertical, 9)
            .frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
            .contentShape(Rectangle())
        }.buttonStyle(.plain)
    }
}


struct ChatHistoryFiles: View {
    let items: [GalleryArtifact]
    let workspace: WorkspaceModel
    @State private var opening: UUID?
    var body: some View {
        VStack(alignment: .trailing, spacing: 8) {
            ForEach(items) { item in
                Button {
                    opening = item.id
                    Task {
                        defer { opening = nil }
                        do { try workspace.openArtifact(item, data: await workspace.gallery.contents(item)) }
                        catch { workspace.chat.error = "Ouverture de " + item.name + " : " + error.localizedDescription }
                    }
                } label: {
                    ChatAttachmentPreview(item: item, gallery: workspace.gallery)
                        .overlay { if opening == item.id { ProgressView().padding(12).background(.regularMaterial, in: Circle()) } }
                }.buttonStyle(.plain).disabled(opening != nil).accessibilityLabel("Ouvrir " + item.name)
            }
        }
    }
}

/// Image decoding stays off the main actor; filenames are only needed for documents or failed previews.
struct ChatAttachmentPreview: View {
    let item: GalleryArtifact
    let gallery: GalleryModel
    var compact = false
    @State private var image: UIImage?
    @State private var failed = false
    private var isImage: Bool { item.kind == "Figures" }
    private var imageSize: CGSize {
        if compact { return CGSize(width: 84, height: 84) }
        let ratio = image.map { $0.size.width / max(1, $0.size.height) } ?? 1
        let width = min(220, 300 * ratio)
        return CGSize(width: width, height: width / ratio)
    }
    var body: some View {
        Group {
            if isImage && !failed {
                ZStack {
                    Color.primary.opacity(0.04)
                    if let image {
                        Image(uiImage: image).resizable().scaledToFit()
                            .overlay {
                                if let region = item.annotationRegion {
                                    GeometryReader { geometry in
                                        let ratio = image.size.width / max(1, image.size.height)
                                        let width = min(geometry.size.width, geometry.size.height * ratio)
                                        let height = width / ratio
                                        Rectangle().stroke(AtelierTheme.accent, lineWidth: 2)
                                            .frame(width: region.width * width, height: region.height * height)
                                            .offset(x: (geometry.size.width - width) / 2 + region.x * width,
                                                    y: (geometry.size.height - height) / 2 + region.y * height)
                                    }.allowsHitTesting(false)
                                }
                            }
                    } else { ProgressView().controlSize(.small) }
                }.frame(width: imageSize.width, height: imageSize.height)
                    .clipShape(RoundedRectangle(cornerRadius: compact ? 12 : 16))
                    .overlay(RoundedRectangle(cornerRadius: compact ? 12 : 16).strokeBorder(.primary.opacity(0.09), lineWidth: 0.5))
            } else {
                HStack(spacing: 10) {
                    Image(systemName: isImage ? "photo" : item.kind == "PDF" ? "doc.richtext" : "doc.text")
                        .font(.system(size: 22, weight: .light)).foregroundStyle(.secondary)
                        .frame(width: 32, height: 38)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.name).font(.subheadline).lineLimit(2).multilineTextAlignment(.leading)
                        Text(isImage ? "Ouvrir l’image" : item.ext.uppercased())
                            .font(.caption2).foregroundStyle(.secondary)
                    }.frame(maxWidth: compact ? 140 : 190, alignment: .leading)
                }.padding(12).padding(.trailing, compact ? 24 : 0)
                    .frame(minHeight: compact ? 84 : 64)
                    .background(.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(.primary.opacity(0.1), lineWidth: 0.5))
            }
        }.foregroundStyle(.primary)
            .task(id: "\(item.id):\(gallery.connectionRevision)") {
                guard isImage else { return }
                image = nil; failed = false
                do {
                    let data = try await gallery.contents(item)
                    let rendered = await ArtifactPreviewRenderer.shared.render(data, pdf: false)
                    guard !Task.isCancelled else { return }
                    image = rendered; failed = rendered == nil
                } catch { if !Task.isCancelled { failed = true } }
            }
    }
}
