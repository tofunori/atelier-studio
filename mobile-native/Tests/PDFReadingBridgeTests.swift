import XCTest
import PDFKit
import UIKit
import SwiftUI
@testable import AtelierUI

final class PDFReadingBridgeTests: XCTestCase {
    @MainActor private func document(_ draw: (UIGraphicsPDFRendererContext) -> Void) -> Data {
        UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 500, height: 700)).pdfData {
            $0.beginPage(); draw($0)
        }
    }
    @MainActor private func line(_ text: String, x: Double = 40, y: Double) {
        (text as NSString).draw(at: CGPoint(x: x, y: y), withAttributes: [.font: UIFont.systemFont(ofSize: 14)])
    }

    @MainActor func testRepeatedPassageMapsToItsOwnPDFLineAndSameMarkStore() async throws {
        let data = document { _ in
            line("Snow albedo changes with grain size.", y: 70)
            line("Snow albedo changes with grain size.", y: 110)
        }
        let page = try await PDFReadingExtractor(bytes: data).page(0)
        let blocks = page.blocks.filter { $0.text.contains("Snow albedo") }
        XCTAssertEqual(blocks.count, 2)
        let range = (blocks[1].text as NSString).range(of: "albedo")
        let first = try XCTUnwrap(blocks[0].regions(for: range)?.first)
        let second = try XCTUnwrap(blocks[1].regions(for: range)?.first)
        XCTAssertGreaterThan(first.minY - second.minY, 30)
        XCTAssertLessThan(second.width, 70) // A word, not the whole line.
        let workspace = WorkspaceModel()
        workspace.chat.isPreview = true
        workspace.pdfAnnotations = PDFAnnotations(directory: nil)
        workspace.sharedPDFAnnotations = SharedPDFAnnotations(directory: nil)
        try workspace.openArtifact(GalleryArtifact(name: "reading.pdf"), data: data)
        let passage = DocumentPassage(documentID: workspace.documentID, fileName: "reading.pdf", location: "page 1", text: "albedo",
            regions: [.init(pageIndex: 0, bounds: second)])
        try workspace.savePDFMark(passage: passage, style: .highlight, note: "")
        XCTAssertEqual(workspace.documentPDFMarks.count, 1)
        let mark = try XCTUnwrap(workspace.documentPDFMarks.first)
        XCTAssertTrue(blocks[0].ranges(inside: mark.regions.map(\.bounds)).isEmpty)
        XCTAssertEqual(blocks[1].ranges(inside: mark.regions.map(\.bounds)), [range])
        let annotations = try XCTUnwrap(workspace.pdfDocument?.page(at: 0)).annotations
        XCTAssertTrue(annotations.contains { $0.userName == "Atelier PDFMark \(mark.id.uuidString)" && $0.bounds == second })
        // Reopening the same bytes retrieves the exact same mark, not a reading-only duplicate.
        try workspace.openArtifact(GalleryArtifact(name: "reading.pdf"), data: data)
        XCTAssertEqual(workspace.documentPDFMarks.map(\.id), [mark.id])
    }

    func testWhitespaceRepairKeepsOffsetsAndUnmappedLettersFailClosed() throws {
        let source = "Laﬁgure2"
        let anchors: [PDFReadingAnchor?] = Array(source.utf16).enumerated().map {
            PDFReadingAnchor(offset: $0.offset + 50, bounds: CGRect(x: $0.offset * 10, y: 10, width: 9, height: 12), line: 0)
        }
        let display = PDFReadingSpacing.repair(source, recognized: "La figure 2")
        let mapped = PDFReadingExtractor.remapWhitespace(source: source, anchors: anchors, display: display)
        let block = PDFReadingBlock(id: 0, text: display, heading: false, anchors: mapped)
        XCTAssertEqual(mapped.compactMap { $0?.offset }, Array(50..<(50 + source.utf16.count)))
        XCTAssertNotNil(block.regions(for: NSRange(location: 0, length: display.utf16.count)))
        XCTAssertNil(block.regions(for: NSRange(location: NSNotFound, length: 1)))
        XCTAssertNil(block.regions(for: NSRange(location: 0, length: display.utf16.count + 1)))
        let missing = PDFReadingBlock(id: 1, text: "Text", heading: false, anchors: Array(repeating: nil, count: 4))
        XCTAssertNil(missing.regions(for: NSRange(location: 0, length: 4)))
    }

    @MainActor func testReadingSelectionOffersAnnotationAndQuoteActions() throws {
        let reading = PDFReadingSelectableText(text: "Snow albedo", font: .systemFont(ofSize: 18), highlights: [],
            onAnnotate: { _ in }, onQuote: { _ in })
        let menu = try XCTUnwrap(reading.makeCoordinator().textView(UITextView(),
            editMenuForTextIn: NSRange(location: 5, length: 6), suggestedActions: []))
        XCTAssertEqual(menu.children.compactMap { ($0 as? UIAction)?.title }, ["Annoter", "Ajouter au chat"])
    }

    @MainActor func testFigureLabelsBecomeOriginalImageAndCaptionRemainsSelectable() async throws {
        let data = document { context in
            line("0.1 0.2 0.3 0.4 0.5", y: 80)
            line("Pure optically thick snow", y: 110)
            line("100 mm 50 mm", y: 150)
            context.cgContext.stroke(CGRect(x: 45, y: 70, width: 190, height: 130))
            line("Figure 1. Comparison of snow albedo.", y: 230)
            line("The snow surface reflects incoming solar radiation.", y: 280)
        }
        let page = try await PDFReadingExtractor(bytes: data).page(0)
        let visual = try XCTUnwrap(page.blocks.compactMap(\.visual).first)
        XCTAssertNotNil(UIImage(data: visual.image))
        XCTAssertFalse(page.blocks.contains { $0.text.contains("100 mm") || $0.text.contains("0.1 0.2") })
        let caption = try XCTUnwrap(page.blocks.first { $0.text.contains("Figure 1.") })
        XCTAssertNotNil(caption.regions(for: (caption.text as NSString).range(of: "Comparison")))
        XCTAssertTrue(page.blocks.contains { $0.text.contains("reflects incoming") })
    }

    @MainActor func testEquationUsesSourceImageButScientificNumbersInProseRemain() async throws {
        let data = document { _ in
            line("Albedo is 0.42 and grain size is 200 mm.", y: 70)
            line("Q = m c ΔT", y: 140)
            line("A second paragraph explains the measurement.", y: 210)
        }
        let page = try await PDFReadingExtractor(bytes: data).page(0)
        XCTAssertTrue(page.blocks.contains { $0.visual?.label == "Équation · originale" })
        XCTAssertFalse(page.blocks.contains { $0.text.contains("Q =") })
        XCTAssertTrue(page.blocks.contains { $0.text.contains("0.42") && $0.text.contains("200 mm") })
    }

    @MainActor func testRotatedPageUsesOriginalRatherThanUnreliableTextAnchors() async throws {
        let data = document { _ in line("Rotated text", y: 80) }
        let document = try XCTUnwrap(PDFDocument(data: data)); document.page(at: 0)?.rotation = 90
        let page = try await PDFReadingExtractor(bytes: XCTUnwrap(document.dataRepresentation())).page(0)
        XCTAssertEqual(page.blocks.count, 1)
        XCTAssertNotNil(page.blocks.first?.visual)
        XCTAssertTrue(page.blocks.first?.anchors.isEmpty == true)
    }

    @MainActor func testReplacingPDFBytesInvalidatesReadingCache() async throws {
        let first = document { _ in line("First document version.", y: 80) }
        let second = document { _ in line("Replacement document version.", y: 80) }
        let model = PDFReadingModel(), id = UUID()
        await model.load(page: 0, documentID: id, bytes: first, fingerprint: "first")
        await model.load(page: 0, documentID: id, bytes: second, fingerprint: "second")
        XCTAssertNil(model.content(0, documentID: id, fingerprint: "first"))
        XCTAssertTrue(try XCTUnwrap(model.content(0, documentID: id, fingerprint: "second")).blocks.contains { $0.text.contains("Replacement") })
    }

    func testPartlyCroppedLineRemainsReadable() {
        let image = CGRect(x: 40, y: 50, width: 220, height: 80)
        XCTAssertFalse(PDFReadingExtractor.canReplaceLine(CGRect(x: 10, y: 70, width: 300, height: 16), withImage: image))
        XCTAssertTrue(PDFReadingExtractor.canReplaceLine(CGRect(x: 60, y: 70, width: 150, height: 16), withImage: image))
    }

    /// Optional local QA fixture; never commit the user's article into the repository.
    @MainActor func testLocalResearchPDFIfProvided() async throws {
        let path = "/private/tmp/atelier-reading-qa.pdf"
        guard FileManager.default.fileExists(atPath: path) else { throw XCTSkip("No local research PDF supplied") }
        let data = try Data(contentsOf: URL(fileURLWithPath: path))
        let document = try XCTUnwrap(PDFDocument(data: data))
        let reader = PDFReadingExtractor(bytes: data)
        var visuals = 0, mapped = 0
        for index in 0..<document.pageCount {
            let page = try await reader.page(index)
            for block in page.blocks {
                if let visual = block.visual {
                    try visual.image.write(to: URL(fileURLWithPath: "/private/tmp/atelier-reading-qa-\(index)-\(block.id).png"))
                    print("VISUAL QA", index + 1, visual.bounds, visual.label)
                }
            }
            visuals += page.blocks.filter { $0.visual != nil }.count
            for block in page.blocks where !block.text.isEmpty {
                if block.regions(for: NSRange(location: 0, length: block.text.utf16.count)) != nil { mapped += 1 }
            }
        }
        XCTAssertGreaterThan(visuals, 0)
        XCTAssertGreaterThan(mapped, 0)
        print("Reading QA: \(document.pageCount) pages, \(visuals) preserved visuals, \(mapped) anchored text blocks")
    }
}
