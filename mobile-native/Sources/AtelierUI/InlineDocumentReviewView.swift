import SwiftUI

/// Reviews the actual document in place. Decision controls belong to a single
/// change; unchanged paragraphs remain in the reading flow.
struct InlineDocumentReviewView: View {
    let review: DocumentReviewSession
    let sourceMode: Bool
    let sourceName: String
    let documentID: UUID
    @Binding var selectedChange: Int?
    @Binding var scrollOffset: Double
    let busy: Bool
    let decide: (Int, Bool) -> Void
    let onQuote: (String) -> Void
    @State private var position = ScrollPosition(edge: .top)
    @State private var restoreTarget: Double?
    @State private var restored = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private func diffColor(removed: Bool) -> Color {
        Color(uiColor: UIColor { traits in
            if traits.userInterfaceStyle == .dark {
                return removed ? UIColor(red: 0.87, green: 0.66, blue: 0.65, alpha: 1)
                    : UIColor(red: 0.66, green: 0.82, blue: 0.72, alpha: 1)
            }
            return removed ? UIColor(red: 0.61, green: 0.20, blue: 0.20, alpha: 1)
                : UIColor(red: 0.17, green: 0.40, blue: 0.25, alpha: 1)
        })
    }

    private var selectedID: Int? {
        review.pendingChunks.first { $0.id == selectedChange }?.id ?? review.pendingChunks.first?.id
    }
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: sourceMode ? 4 : 18) {
                    ForEach(review.segments) { segment in
                        if let chunkID = segment.chunkID, let chunk = review.chunks.first(where: { $0.id == chunkID }) {
                            change(chunk, proxy: proxy).id("change-\(chunk.id)")
                        } else {
                            documentText(segment.text)
                        }
                    }
                }.padding(.horizontal, 20).padding(.top, 20).padding(.bottom, 80)
            }
            .scrollPosition($position)
            .onScrollGeometryChange(for: Double.self) { $0.contentOffset.y } action: { _, offset in
                if let target = restoreTarget {
                    if abs(offset - target) < 2 { restoreTarget = nil; restored = true }
                } else if restored { scrollOffset = offset }
            }
            .onScrollPhaseChange { _, phase in
                if phase == .tracking || phase == .interacting { restoreTarget = nil; restored = true }
            }
            .task(id: documentID) {
                restored = false; restoreTarget = scrollOffset
                position.scrollTo(y: scrollOffset)
            }
            .accessibilityIdentifier("document.inlineReview")
            .onChange(of: review.pendingChunks.map(\.id)) { previous, ids in
                let old = selectedChange ?? previous.first ?? -1
                if !ids.contains(old) {
                    selectedChange = ids.first { $0 > old } ?? ids.last
                    if let next = selectedChange {
                        restoreTarget = nil; restored = true
                        proxy.scrollTo("change-\(next)", anchor: .center)
                    }
                }
            }
        }
    }

    @ViewBuilder private func documentText(_ source: String) -> some View {
        if !source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            if sourceMode {
                Text(AttributedString(SourceSyntax.attributed(source.trimmingCharacters(in: .newlines), name: sourceName)))
                    .textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
            } else {
                ForEach(LatexReadingBlock.parse(source)) { block in
                    RichChatText(text: block.display, documentStyle: true, onQuote: onQuote)
                }
            }
        }
    }

    private func displayText(_ source: String) -> String {
        if sourceMode { return source.trimmingCharacters(in: .newlines) }
        let blocks = LatexReadingBlock.parse(source)
        let prose = blocks.map(\.display).joined(separator: "\n\n").trimmingCharacters(in: .whitespacesAndNewlines)
        return prose.isEmpty ? source.trimmingCharacters(in: .whitespacesAndNewlines) : prose
    }

    private func change(_ chunk: DocumentReviewSession.Chunk, proxy: ScrollViewProxy) -> some View {
        let pending = chunk.decision == .pending
        let selected = pending && selectedID == chunk.id
        return VStack(alignment: .leading, spacing: 10) {
            if pending {
                VStack(alignment: .leading, spacing: 8) {
                    if !chunk.before.isEmpty {
                        diffText(chunk.before, removed: true)
                    }
                    if !chunk.after.isEmpty {
                        diffText(chunk.after, removed: false)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .onTapGesture { selectedChange = chunk.id }
                .accessibilityAction(named: "Sélectionner cette modification") { selectedChange = chunk.id }
                .accessibilityAction(named: "Accepter cette modification") { if !busy { decide(chunk.id, true) } }
                .accessibilityAction(named: "Rejeter cette modification") { if !busy { decide(chunk.id, false) } }
                if selected { controls(chunk, proxy: proxy) }
            } else {
                documentText(chunk.decision == .rejected ? chunk.before : chunk.after)
            }
        }
        .padding(.vertical, pending ? 9 : 0).padding(.horizontal, 10)
        .background(selected ? AtelierTheme.surface : Color.clear, in: RoundedRectangle(cornerRadius: 6))
        .overlay(alignment: .leading) {
            if pending {
                Rectangle().fill(selected ? AtelierTheme.accent(named: "sage") : Color.secondary.opacity(0.3)).frame(width: 2)
            }
        }
        .accessibilityIdentifier("document.change.\(chunk.id)")
    }

    private func diffText(_ source: String, removed: Bool) -> some View {
        let text = displayText(source)
        return HStack(alignment: .firstTextBaseline, spacing: 7) {
            Text(removed ? "−" : "+").font(.caption.monospaced()).accessibilityHidden(true)
            Text(text.isEmpty ? (removed ? "Ligne vide supprimée" : "Ligne vide ajoutée") : text)
                .font(sourceMode ? .system(.callout, design: .monospaced) : .system(.body, design: .serif))
                .strikethrough(removed, color: diffColor(removed: true))
                .lineSpacing(sourceMode ? 3 : 5)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .foregroundStyle(diffColor(removed: removed))
        .textSelection(.enabled)
        .accessibilityLabel((removed ? "Supprimé : " : "Ajouté : ") + (text.isEmpty ? "ligne vide" : text))
    }

    private func controls(_ chunk: DocumentReviewSession.Chunk, proxy: ScrollViewProxy) -> some View {
        let ids = review.pendingChunks.map(\.id)
        let index = ids.firstIndex(of: chunk.id) ?? 0
        return HStack(spacing: 4) {
            if busy {
                ProgressView().controlSize(.small).accessibilityLabel("Enregistrement de la décision")
            } else {
                Text("\(index + 1) / \(ids.count)").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Button { navigate(-1, ids: ids, index: index, proxy: proxy) } label: {
                Image(systemName: "chevron.up").frame(width: 44, height: 44)
            }.accessibilityLabel("Modification précédente").disabled(ids.count < 2)
            Button { navigate(1, ids: ids, index: index, proxy: proxy) } label: {
                Image(systemName: "chevron.down").frame(width: 44, height: 44)
            }.accessibilityLabel("Modification suivante").accessibilityIdentifier("document.nextChange").disabled(ids.count < 2)
            Button { decide(chunk.id, false) } label: {
                Image(systemName: "xmark").frame(width: 44, height: 44)
                    .background(.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
            }.foregroundStyle(diffColor(removed: true)).accessibilityLabel("Rejeter cette modification").accessibilityIdentifier("document.rejectChange")
            Button { decide(chunk.id, true) } label: {
                Image(systemName: "checkmark").frame(width: 44, height: 44)
                    .background(.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
            }.foregroundStyle(diffColor(removed: false)).accessibilityLabel("Accepter cette modification").accessibilityIdentifier("document.acceptChange")
        }.buttonStyle(.plain).font(.callout).disabled(busy)
    }
    private func navigate(_ step: Int, ids: [Int], index: Int, proxy: ScrollViewProxy) {
        guard !ids.isEmpty else { return }
        let next = ids[(index + step + ids.count) % ids.count]
        selectedChange = next
        restoreTarget = nil; restored = true
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { proxy.scrollTo("change-\(next)", anchor: .center) }
    }
}
