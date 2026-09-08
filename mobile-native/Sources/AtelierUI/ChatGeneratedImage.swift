import SwiftUI

extension RemoteChatModel.Row {
    /// Derived from fields already persisted in older transcript snapshots.
    var generatedImageEventID: String? {
        guard kind == "tool_update",
              ["image_generation", "image-generation", "generate_image", "generate-image"].contains(toolName.lowercased()),
              ["completed", "success", "succeeded"].contains(toolStatus.lowercased()),
              let eventID, !eventID.isEmpty else { return nil }
        return eventID
    }
}

struct ChatGeneratedImage: View {
    let threadID: String
    let eventID: String
    let gateway: GalleryModel
    let hasProject: Bool
    @State private var image: UIImage?
    @State private var failure: String?
    @State private var retry = 0
    @State private var expanded: ExpandedImage?

    private struct ExpandedImage: Identifiable {
        let id: String
        let image: UIImage
    }
    private var requestID: String { "\(gateway.connectionRevision):\(threadID):\(eventID):\(retry)" }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let image {
                Button { expanded = ExpandedImage(id: eventID, image: image) } label: {
                    Image(uiImage: image).resizable().scaledToFit()
                        .frame(maxWidth: 420, maxHeight: 360)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Ouvrir l’image générée en grand")
                .accessibilityIdentifier("chat.generated-image")
            } else if let failure {
                Label("Image indisponible", systemImage: "photo.badge.exclamationmark")
                Text(failure).font(.caption).foregroundStyle(.secondary)
                Button("Réessayer") { retry += 1 }
            } else {
                ProgressView("Chargement de l’image…").frame(minHeight: 100)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .task(id: requestID) { await load() }
        .sheet(item: $expanded) { item in
            GeneratedImageSheet(image: item.image, threadID: threadID, eventID: eventID, gateway: gateway, hasProject: hasProject)
        }
    }

    @MainActor private func load() async {
        image = nil; failure = nil
        do {
            let data = try await gateway.generatedChatImage(threadID: threadID, eventID: eventID)
            let rendered = await ArtifactPreviewRenderer.shared.render(data, pdf: false, maxPixelSize: 2048)
            try Task.checkCancellation()
            guard let rendered else { throw GalleryModel.GalleryError.message("Le fichier reçu n’est pas une image lisible.") }
            image = rendered
        } catch is CancellationError { }
        catch {
            guard !Task.isCancelled else { return }
            failure = error.localizedDescription
        }
    }
}

private struct GeneratedImageSheet: View {
    let image: UIImage
    let threadID: String
    let eventID: String
    let gateway: GalleryModel
    let hasProject: Bool
    @State private var saving = false
    @State private var saved = false
    @State private var saveError: String?
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ZoomableArtifactImage(image: image)
                .navigationTitle("Image générée")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) { Button("Fermer") { dismiss() } }
                    ToolbarItem(placement: .bottomBar) {
                        Button {
                            Task { await saveToGallery() }
                        } label: {
                            Label(saved ? "Enregistrée dans la galerie" : (saving ? "Enregistrement…" : "Enregistrer dans la galerie du projet"),
                                  systemImage: saved ? "checkmark.circle" : "square.and.arrow.down")
                        }
                        .disabled(!hasProject || saving || saved)
                        .accessibilityIdentifier("chat.generated-image.save")
                    }
                }
                .alert("Enregistrement impossible", isPresented: Binding(
                    get: { saveError != nil }, set: { if !$0 { saveError = nil } }
                )) { Button("OK", role: .cancel) { saveError = nil } }
                message: { Text(saveError ?? "") }
        }
    }

    @MainActor private func saveToGallery() async {
        guard !saving, !saved else { return }
        saving = true
        defer { saving = false }
        do {
            try await gateway.saveGeneratedChatImage(threadID: threadID, eventID: eventID)
            saved = true
        } catch {
            saveError = error.localizedDescription
        }
    }

}
