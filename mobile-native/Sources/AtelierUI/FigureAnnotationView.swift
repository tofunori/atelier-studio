import SwiftUI

struct FigureAnnotationView: View {
    let workspace: WorkspaceModel
    let image: UIImage
    let onAnnotate: (DocumentPassage) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var region: CGRect?
    private let annotationColor = Color(red: 0.08, green: 0.32, blue: 0.72)
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Text("Tracez une zone sur la figure, ou annotez la figure entière.").font(.subheadline).foregroundStyle(.secondary)
                GeometryReader { geometry in
                    let ratio = image.size.width / image.size.height
                    let width = min(geometry.size.width, geometry.size.height * ratio)
                    let height = width / ratio
                    ZStack(alignment: .topLeading) {
                        Image(uiImage: image).resizable().frame(width: width, height: height)
                        if let region {
                            Rectangle().fill(annotationColor.opacity(0.12))
                                .overlay(Rectangle().stroke(.white, lineWidth: 5))
                                .overlay(Rectangle().stroke(annotationColor, lineWidth: 2.5))
                                .frame(width: region.width * width, height: region.height * height)
                                .offset(x: region.minX * width, y: region.minY * height)
                        }
                    }
                    .contentShape(Rectangle())
                    .gesture(DragGesture(minimumDistance: 4).onChanged { gesture in
                        region = Self.normalized(start: gesture.startLocation, end: gesture.location, size: CGSize(width: width, height: height))
                    })
                    .accessibilityLabel("Zone de la figure")
                    .accessibilityValue(region == nil ? "Figure entière" : "Zone sélectionnée")
                    .accessibilityAction(named: "Sélectionner la zone centrale") { region = CGRect(x: 0.25, y: 0.25, width: 0.5, height: 0.5) }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                HStack {
                    Button("Figure entière") { region = nil }.frame(minHeight: 44)
                    Spacer()
                    Button("Annoter", systemImage: "highlighter") {
                        let location = region.map { "zone x=\(Int($0.minX * 100)) %, y=\(Int($0.minY * 100)) %, largeur=\(Int($0.width * 100)) %, hauteur=\(Int($0.height * 100)) % (origine en haut à gauche)" } ?? "figure entière"
                        var file = workspace.viewedArtifact
                        file?.annotationRegion = region.map { FigureRegion(x: $0.minX, y: $0.minY, width: $0.width, height: $0.height) }
                        let passage = DocumentPassage(documentID: workspace.documentID, fileName: workspace.currentName,
                            location: location, text: "Figure : \(workspace.currentName)", figureRegion: region, figure: file)
                        dismiss()
                        onAnnotate(passage)
                    }.buttonStyle(.borderedProminent).tint(annotationColor)
                        .foregroundStyle(.white).frame(minHeight: 44)
                }
            }.padding(20)
            .onAppear {
                #if targetEnvironment(simulator)
                if ProcessInfo.processInfo.arguments.contains("--figure-contrast-fixture") { region = CGRect(x: 0.2, y: 0.2, width: 0.6, height: 0.6) }
                #endif
            }
            .navigationTitle("Annoter la figure").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } } }
        }
    }
    static func normalized(start: CGPoint, end: CGPoint, size: CGSize) -> CGRect? {
        guard size.width > 0, size.height > 0 else { return nil }
        let x1 = min(1, max(0, start.x / size.width)), x2 = min(1, max(0, end.x / size.width))
        let y1 = min(1, max(0, start.y / size.height)), y2 = min(1, max(0, end.y / size.height))
        guard abs(x2-x1) > 0.01, abs(y2-y1) > 0.01 else { return nil }
        return CGRect(x: min(x1,x2), y: min(y1,y2), width: abs(x2-x1), height: abs(y2-y1))
    }
}
