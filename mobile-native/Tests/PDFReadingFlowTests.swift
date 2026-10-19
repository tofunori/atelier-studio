import XCTest
import UIKit
import PDFKit
@testable import AtelierUI

/// Reading mode on a real article layout: Gardner and Sharp (2010), JGR, page 7, as PDFKit splits it
/// (selectionsByLine bounds measured on the Mac). The hat of Ŝ and the raised 0 of r⁰ₑ come as lines of their own.
final class PDFReadingFlowTests: XCTestCase {
    typealias Line = PDFReadingExtractor.Line

    /// One anchor per character, spread over the line; `boxes` pins the characters whose position matters.
    private func line(_ text: String, x: Double, y: Double, width: Double, height: Double, index: Int,
                      boxes: [Int: (x: Double, width: Double)] = [:], levels: [Int8] = [], size: CGFloat = 10) -> Line {
        let count = text.utf16.count
        let step = width / Double(count)
        let anchors: [PDFReadingAnchor?] = (0..<count).map { offset in
            let box = boxes[offset] ?? (x + Double(offset) * step, step)
            return PDFReadingAnchor(offset: index * 100 + offset, bounds: CGRect(x: box.x, y: y, width: box.width, height: height), line: index, page: 6)
        }
        return Line(text: text, bounds: CGRect(x: x, y: y, width: width, height: height), anchors: anchors, levels: levels, size: size)
    }

    private var gardner: [Line] {
        let subscriptE: [Int8] = [0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0]
        let leadingE = [Int8(-1)] + Array(repeating: 0, count: 38)
        return [
            line("blage of spherical air bubbles encased in ice. This is very", x: 60.9, y: 321.8, width: 239.1, height: 9.1, index: 25),
            line("^", x: 263.8, y: 313.3, width: 5, height: 9, index: 26, size: 0),
            line("important and highlights the significance of using", x: 60.9, y: 310.8, width: 199.7, height: 9.1, index: 27),
            line("S instead", x: 263.5, y: 310.8, width: 36.4, height: 9.1, index: 28, boxes: [0: (263.5, 5)]),
            line("of re and r", x: 60.9, y: 298.8, width: 43.4, height: 10.1, index: 29, boxes: [10: (100.5, 3.9)], levels: subscriptE),
            line("0", x: 104.3, y: 304.7, width: 2, height: 6.7, index: 30, size: 7.1),
            line("e for the modeling snow and ice albedo.", x: 104.1, y: 298.8, width: 163.6, height: 10.1, index: 31,
                 boxes: [0: (104.1, 3.3)], levels: leadingE),
            line("[29] The modification of broadband albedo due to the", x: 68.1, y: 288.8, width: 231.9, height: 9.1, index: 32),
            line("presence of light-absorbing carbon is dependent on its", x: 60.9, y: 277.8, width: 239, height: 9.1, index: 33),
            line("concentration and the^", x: 60.9, y: 266.8, width: 95.5, height: 11.5, index: 34,
                 boxes: [20: (145.2, 4.4), 21: (149.6, 6.8)]),
            line("S of the snow/ice in which it resides", x: 151.2, y: 266.8, width: 148.8, height: 9.1, index: 35, boxes: [0: (151.2, 5)]),
            line("^", x: 205.5, y: 258.3, width: 5, height: 9, index: 36, size: 0),
            line("(Figure 9a). Snow/ice with higher", x: 60.9, y: 255.8, width: 140.2, height: 9.1, index: 37),
            line("S are less impacted by", x: 205.3, y: 255.8, width: 94.8, height: 9.1, index: 38, boxes: [0: (205.3, 5)]),
        ]
    }

    func testSplitLinesBecomeOneParagraphWithAccentsAndScripts() throws {
        let rows = PDFReadingExtractor.rows(gardner)
        XCTAssertEqual(rows.count, 7)
        let blocks = PDFReadingExtractor.blocks(rows, pageBounds: CGRect(x: 0, y: 0, width: 612, height: 792), firstPage: false)
        XCTAssertEqual(blocks.map(\.text), [
            "blage of spherical air bubbles encased in ice. This is very important and highlights the significance of using S\u{302} instead of re and r0e for the modeling snow and ice albedo.",
            "[29] The modification of broadband albedo due to the presence of light-absorbing carbon is dependent on its concentration and the S\u{302} of the snow/ice in which it resides (Figure 9a). Snow/ice with higher S\u{302} are less impacted by",
        ])
        let first = blocks[0], text = first.text as NSString
        // The subscript e of rₑ, the raised 0 and the subscript e of r⁰ₑ keep their position.
        let scripts = text.range(of: "re and r0e")
        XCTAssertEqual(first.levels.count, text.length)
        XCTAssertEqual(Array(first.levels[scripts.location..<NSMaxRange(scripts)]), [0, -1, 0, 0, 0, 0, 0, 0, 1, -1])
        // The combining hat keeps the box of the PDF's ^, so the passage is still annotatable.
        let hat = text.range(of: "S\u{302} instead")
        XCTAssertEqual(first.anchors[hat.location + 1]?.offset, 2600)
        let regions = try XCTUnwrap(first.regions(for: text.range(of: "significance of using S\u{302} instead")))
        XCTAssertEqual(regions.count, 1)
        XCTAssertNotNil(blocks[1].regions(for: (blocks[1].text as NSString).range(of: "the S\u{302} of the snow")))
    }

    func testScriptsComeFromFontSizeAndBaselineShift() {
        func styles(_ text: String, _ small: Set<Int>, size: CGFloat, shift: CGFloat) -> [PDFReadingExtractor.Style?] {
            text.utf16.indices.enumerated().map { index, _ in
                small.contains(index) ? .init(size: size * 0.75, shift: shift) : .init(size: size, shift: 0.0013)
            }
        }
        XCTAssertEqual(PDFReadingExtractor.levels(styles("of re and r", [4, 5], size: 10, shift: -1.7), text: "of re and r").levels,
                       [0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0])
        XCTAssertEqual(PDFReadingExtractor.levels(styles("years)15,16.The", [6, 7, 8, 9, 10], size: 9.5, shift: 2.89), text: "years)15,16.The").levels,
                       [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0])
        // An accent shifted up at the body size is not an exponent.
        var hat = styles("the^", [], size: 10, shift: 0); hat[3] = .init(size: 10, shift: 2.44)
        XCTAssertTrue(PDFReadingExtractor.levels(hat, text: "the^").levels.isEmpty)
        let attributed = NSMutableAttributedString(string: "re", attributes: [.font: UIFont.systemFont(ofSize: 10)])
        attributed.addAttributes([.font: UIFont.systemFont(ofSize: 7.1), NSAttributedString.Key("CTBaselineOffset"): -1.7],
                                 range: NSRange(location: 1, length: 1))
        XCTAssertEqual(PDFReadingExtractor.styles(attributed, matching: "re\n").map { $0?.shift }, [0, -1.7, nil])
        XCTAssertTrue(PDFReadingExtractor.styles(attributed, matching: "ab").allSatisfy { $0 == nil })
    }

    func testOtherColumnAndNextLineStaySeparate() {
        let rows = PDFReadingExtractor.rows([
            line("Left column line that ends here", x: 60, y: 300, width: 240, height: 9.1, index: 0),
            line("Right column line at the same height", x: 312, y: 300, width: 240, height: 9.1, index: 1),
            line("Next line of the right column", x: 312, y: 289, width: 240, height: 9.1, index: 2),
        ])
        XCTAssertEqual(rows.map(\.text), ["Left column line that ends here", "Right column line at the same height", "Next line of the right column"])
    }

    func testSentenceCutByAColumnContinuesAndIndentOpensAParagraph() {
        let lines = [
            line("The albedo of snow decreases as the", x: 60, y: 120, width: 240, height: 9.1, index: 0),
            line("grains grow and light-absorbing particles accumulate.", x: 312, y: 700, width: 240, height: 9.1, index: 1),
            line("[30] A new paragraph opens with an indent.", x: 319, y: 689, width: 233, height: 9.1, index: 2),
            line("Its second line is flush left.", x: 312, y: 678, width: 240, height: 9.1, index: 3),
        ]
        let blocks = PDFReadingExtractor.blocks(lines, pageBounds: CGRect(x: 0, y: 0, width: 612, height: 792), firstPage: false)
        XCTAssertEqual(blocks.map(\.text), [
            "The albedo of snow decreases as the grains grow and light-absorbing particles accumulate.",
            "[30] A new paragraph opens with an indent. Its second line is flush left.",
        ])
    }

    private func block(_ text: String, page: Int, id: Int = 0) -> PDFReadingBlock {
        PDFReadingBlock(id: id, text: text, heading: false, anchors: text.utf16.indices.enumerated().map { index, _ in
            PDFReadingAnchor(offset: index, bounds: CGRect(x: 60 + Double(index) * 5, y: 100, width: 5, height: 9), line: 0, page: page)
        })
    }

    func testParagraphCutByAPageBreakIsReadWhole() throws {
        let previous = PDFReadingPage(index: 0, blocks: [block("First paragraph.", page: 0), block("A sentence cut at the", page: 0, id: 1)], margins: [])
        let current = PDFReadingPage(index: 1, blocks: [block("foot of the page.", page: 1), block("Next paragraph.", page: 1, id: 1)], margins: [])
        let joined = PDFReadingPage.joining(previous: nil, current: previous, next: current)
        let paragraph = try XCTUnwrap(joined.blocks.last)
        XCTAssertEqual(paragraph.text, "A sentence cut at the foot of the page.")
        XCTAssertEqual(paragraph.pages, [0, 1])
        XCTAssertEqual(paragraph.pageBreaks.map(\.offset), [("A sentence cut at the " as NSString).length])
        let regions = try XCTUnwrap(paragraph.pageRegions(for: (paragraph.text as NSString).range(of: "the foot")))
        XCTAssertEqual(regions.map(\.page), [0, 1])
        XCTAssertFalse(joined.continued)
        let next = PDFReadingPage.joining(previous: previous, current: current, next: nil)
        XCTAssertTrue(next.continued)
        XCTAssertEqual(next.blocks.map(\.text), ["Next paragraph."])
        // A closed sentence, a heading or an uppercase start are not continuations.
        XCTAssertFalse(block("Done.", page: 0).continues(into: block("next", page: 1)))
        XCTAssertFalse(block("open", page: 0).continues(into: block("Next", page: 1)))
        XCTAssertTrue(block("hyphen-", page: 0).continues(into: block("ated", page: 1)))
        // A word hyphenated across the page break is rejoined like one split across two lines.
        let hyphen = PDFReadingPage.joining(previous: nil, current: PDFReadingPage(index: 0, blocks: [block("the rain sha-", page: 0)], margins: []),
                                            next: PDFReadingPage(index: 1, blocks: [block("dow of the range.", page: 1), block("Next.", page: 1, id: 1)], margins: []))
            .joiningHyphenatedLines { $0 == "shadow" }
        XCTAssertEqual(hyphen.blocks.first?.text, "the rain shadow of the range.")
    }

    func testHighlightCoversTheSpacesBetweenMarkedWords() {
        let text = "This is very important"
        let anchors: [PDFReadingAnchor?] = text.utf16.indices.enumerated().map { index, unit in
            unit == 0x20 ? nil : PDFReadingAnchor(offset: index, bounds: CGRect(x: Double(index) * 5, y: 100, width: 5, height: 9), line: 0)
        }
        let block = PDFReadingBlock(id: 0, text: text, heading: false, anchors: anchors)
        XCTAssertEqual(block.ranges(inside: [CGRect(x: 0, y: 90, width: 200, height: 30)]), [NSRange(location: 0, length: 22)])
        // Words outside the mark still split it.
        XCTAssertEqual(block.ranges(inside: [CGRect(x: 0, y: 90, width: 22, height: 30), CGRect(x: 60, y: 90, width: 60, height: 30)]),
                       [NSRange(location: 0, length: 4), NSRange(location: 13, length: 9)])
    }

    func testReadingTextShowsScriptsParagraphNumberAndFigureLink() {
        let text = "[29] Snow (Figure 9a) with r0e"
        var levels = [Int8](repeating: 0, count: text.utf16.count); levels[28] = 1; levels[29] = -1
        let font = UIFont.systemFont(ofSize: 18)
        let content = PDFReadingSelectableText.attributed(text, font: font, levels: levels, highlights: [])
        XCTAssertEqual(content.attribute(.foregroundColor, at: 1, effectiveRange: nil) as? UIColor, .secondaryLabel)
        let link = content.attribute(.link, at: 12, effectiveRange: nil) as? URL
        XCTAssertEqual(link?.absoluteString, "atelier-figure://9")
        XCTAssertGreaterThan(content.attribute(.baselineOffset, at: 28, effectiveRange: nil) as? CGFloat ?? 0, 0)
        XCTAssertLessThan(content.attribute(.baselineOffset, at: 29, effectiveRange: nil) as? CGFloat ?? 0, 0)
        XCTAssertLessThan((content.attribute(.font, at: 28, effectiveRange: nil) as? UIFont)?.pointSize ?? 99, 18)
        XCTAssertNil(content.attribute(.baselineOffset, at: 27, effectiveRange: nil))
    }

    /// Optional local QA: renders the page holding ATELIER_QA_PHRASE (default « significance of using ») of
    /// /private/tmp/atelier-reading-qa.pdf as the reading view draws it, light and dark, to PNG files next to it.
    /// Never commit the user's article into the repository.
    @MainActor func testLocalResearchPDFReadingRenderIfProvided() async throws {
        let path = "/private/tmp/atelier-reading-qa.pdf"
        guard FileManager.default.fileExists(atPath: path) else { throw XCTSkip("No local research PDF supplied") }
        let data = try Data(contentsOf: URL(fileURLWithPath: path))
        let document = try XCTUnwrap(PDFDocument(data: data))
        let phrase = ProcessInfo.processInfo.environment["ATELIER_QA_PHRASE"] ?? "significance of using"
        guard let index = (0..<document.pageCount).first(where: { document.page(at: $0)?.string?.contains(phrase) == true }) else {
            throw XCTSkip("Phrase not found in the local PDF")
        }
        let model = PDFReadingModel(), id = UUID()
        for page in [index - 1, index, index + 1] where page >= 0 && page < document.pageCount {
            await model.load(page: page, documentID: id, bytes: data)
        }
        let page = try XCTUnwrap(model.content(index, documentID: id))
        for block in page.blocks where block.visual == nil {
            print("TEXT QA", index + 1, block.levels.isEmpty ? "" : "levels", block.text)
        }
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        for style in [UIUserInterfaceStyle.light, .dark] {
            let window = UIWindow(windowScene: scene)
            window.frame = CGRect(x: 0, y: 0, width: 390, height: 844); window.overrideUserInterfaceStyle = style
            let stack = UIStackView(); stack.axis = .vertical; stack.spacing = 14; stack.translatesAutoresizingMaskIntoConstraints = false
            let font = UIFont.systemFont(ofSize: 19)
            var views: [(PDFReadingTextView, PDFReadingBlock, [PDFReadingHighlight])] = []
            for block in page.blocks where block.visual == nil {
                let text = block.text as NSString
                var highlights: [PDFReadingHighlight] = []
                for (start, ink) in [("This is very", AnnotationInk.amber), ("Snow/ice with higher", .amber), ("broadband albedos of", .green)] {
                    let from = text.range(of: start)
                    guard from.location != NSNotFound else { continue }
                    let end = text.range(of: ".", range: NSRange(location: from.location, length: text.length - from.location))
                    let to = end.location == NSNotFound ? text.length : NSMaxRange(end)
                    highlights.append(PDFReadingHighlight(range: NSRange(location: from.location, length: to - from.location), color: ink.uiColor,
                                                          underline: false, markID: start, hasNote: ink == .green))
                }
                let view = PDFReadingTextView()
                view.isEditable = false; view.isScrollEnabled = false; view.backgroundColor = .clear; view.clipsToBounds = false
                view.textContainerInset = .zero; view.textContainer.lineFragmentPadding = 0
                view.attributedText = PDFReadingSelectableText.attributed(block.text, font: font, levels: block.levels, highlights: highlights)
                stack.addArrangedSubview(view); views.append((view, block, highlights))
            }
            let container = UIView(); container.backgroundColor = .systemBackground
            container.addSubview(stack)
            NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 22),
                                         stack.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -22),
                                         stack.topAnchor.constraint(equalTo: container.topAnchor, constant: 20),
                                         container.widthAnchor.constraint(equalToConstant: 390)])
            window.addSubview(container); window.isHidden = false
            let height = stack.systemLayoutSizeFitting(CGSize(width: 346, height: 0), withHorizontalFittingPriority: .required,
                                                       verticalFittingPriority: .fittingSizeLevel).height + 40
            container.frame = CGRect(x: 0, y: 0, width: 390, height: height); window.frame.size.height = height
            container.layoutIfNeeded()
            for (view, block, highlights) in views {
                let opacity = style == .dark ? 0.30 : 0.28
                view.update(marks: highlights.map { ($0.range, $0.color.withAlphaComponent(opacity)) },
                            notes: highlights.filter(\.hasNote).map { (NSMaxRange($0.range), $0.color) },
                            pageBreaks: block.pageBreaks.map { (offset: $0.offset, label: "p. \($0.page + 1)") }, font: font)
                view.layoutIfNeeded()
            }
            let image = UIGraphicsImageRenderer(bounds: container.bounds).image { _ in
                container.drawHierarchy(in: container.bounds, afterScreenUpdates: true)
            }
            let name = style == .dark ? "sombre" : "clair"
            try XCTUnwrap(image.pngData()).write(to: URL(fileURLWithPath: "/private/tmp/atelier-reading-qa-render-\(name).png"))
            window.isHidden = true
        }
    }
}
