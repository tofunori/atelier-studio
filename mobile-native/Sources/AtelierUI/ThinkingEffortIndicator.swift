import SwiftUI

struct ThinkingEffortLevel {
    let label: String
    let value: Double?
    init(_ effort: String) {
        switch effort.lowercased() {
        case "none": label = "Aucun"; value = 0
        case "minimal": label = "Min."; value = 0.08
        case "low": label = "Faible"; value = 0.2
        case "medium": label = "Moyen"; value = 0.45
        case "high": label = "Élevé"; value = 0.7
        case "xhigh": label = "Très élevé"; value = 0.85
        case "max": label = "Max"; value = 0.95
        case "ultra": label = "Ultra"; value = 1
        case "", "auto": label = "Auto"; value = nil
        default: label = effort; value = nil
        }
    }
}

struct ThinkingEffortIndicator: View {
    let effort: String
    var showLabel = true
    var iconSize: CGFloat = 18
    private var level: ThinkingEffortLevel { ThinkingEffortLevel(effort) }
    var body: some View {
        let value = level.value
        HStack(spacing: 3) {
            Canvas { @Sendable context, size in
                let center = CGPoint(x: size.width / 2, y: size.height / 2)
                let radius = min(size.width, size.height) / 2 - 1.5
                func point(_ fraction: Double, radius: Double) -> CGPoint {
                    let angle = (140 + 260 * fraction) * Double.pi / 180
                    return CGPoint(x: center.x + cos(angle) * radius, y: center.y + sin(angle) * radius)
                }
                func arc(to fraction: Double) -> Path {
                    var path = Path()
                    path.move(to: point(0, radius: radius))
                    for step in 1...52 { path.addLine(to: point(fraction * Double(step) / 52, radius: radius)) }
                    return path
                }
                var trackContext = context
                trackContext.opacity = 0.28
                trackContext.stroke(arc(to: 1), with: .foreground, style: StrokeStyle(lineWidth: 1.7, lineCap: .round))
                if let value {
                    context.stroke(arc(to: value), with: .foreground, style: StrokeStyle(lineWidth: 1.7, lineCap: .round))
                    var needle = Path()
                    needle.move(to: point(value, radius: 2))
                    needle.addLine(to: point(value, radius: radius - 1.5))
                    context.stroke(needle, with: .foreground, style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
                }
                context.stroke(Path(ellipseIn: CGRect(x: center.x - 1.7, y: center.y - 1.7, width: 3.4, height: 3.4)), with: .foreground, lineWidth: 1.3)
            }.frame(width: iconSize, height: iconSize).accessibilityHidden(true)
            if showLabel { Text(level.label).lineLimit(1).fixedSize() }
        }.font(.caption2).accessibilityElement(children: .ignore)
            .accessibilityLabel("Effort de réflexion : \(level.label)")
    }
}

struct ThinkingEffortPanel: View {
    @Bindable var chat: RemoteChatModel
    var chooseModel: () -> Void
    private var levels: [String] { [""] + (chat.provider?.efforts ?? []).filter { !$0.isEmpty && $0 != "auto" } }
    private var selected: Int? { levels.firstIndex(of: chat.effort == "auto" ? "" : chat.effort) }
    var body: some View {
        VStack(spacing: 18) {
            Button(action: chooseModel) {
                HStack(spacing: 6) {
                    Text(chat.provider?.modelLabels?[chat.model] ?? chat.model).fontWeight(.semibold).lineLimit(1)
                    Text(ThinkingEffortLevel(chat.effort).label).foregroundStyle(.secondary)
                    Image(systemName: "chevron.right").font(.caption.weight(.semibold))
                }.font(.subheadline).frame(minHeight: 36)
            }.buttonStyle(.plain).disabled(chat.running || chat.sending)
            if let selected, levels.count > 1 {
                GeometryReader { geometry in
                    let inset: CGFloat = 24
                    let travel = max(1, geometry.size.width - inset * 2)
                    let position = inset + travel * CGFloat(selected) / CGFloat(levels.count - 1)
                    ZStack(alignment: .leading) {
                        Capsule().fill(.primary.opacity(0.08))
                        Capsule().fill(.primary).frame(width: position + 21)
                        ForEach(Array(levels.enumerated()), id: \.offset) { index, _ in
                            Circle().fill(index < selected ? Color(uiColor: .systemBackground).opacity(0.25) : Color.primary.opacity(0.3))
                                .frame(width: 6, height: 6)
                                .position(x: inset + travel * CGFloat(index) / CGFloat(levels.count - 1), y: geometry.size.height / 2)
                        }
                        Circle().fill(Color(uiColor: .systemBackground)).frame(width: 36, height: 36)
                            .overlay(Circle().stroke(.primary.opacity(0.12), lineWidth: 0.5))
                            .position(x: position, y: geometry.size.height / 2)
                    }.contentShape(Capsule())
                        .gesture(DragGesture(minimumDistance: 0).onChanged { gesture in
                            let fraction = min(1, max(0, (gesture.location.x - inset) / travel))
                            let index = Int((fraction * CGFloat(levels.count - 1)).rounded())
                            if !chat.sending { chat.effort = levels[index] }
                        })
                }.frame(height: 48)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Effort de réflexion")
                    .accessibilityValue(ThinkingEffortLevel(chat.effort).label)
                    .accessibilityAdjustableAction { direction in
                        guard !chat.sending else { return }
                        if direction == .increment { chat.effort = levels[min(levels.count - 1, selected + 1)] }
                        else if direction == .decrement { chat.effort = levels[max(0, selected - 1)] }
                    }
            } else if selected == nil {
                Text("Ce niveau n’est plus proposé par cet assistant.").font(.caption).foregroundStyle(.secondary)
                Button("Revenir à Automatique") { chat.effort = "" }.disabled(chat.sending)
            } else {
                Text("Effort automatique pour cet assistant").font(.caption).foregroundStyle(.secondary)
            }
            if chat.running { Text("Pour le prochain message").font(.caption2).foregroundStyle(.secondary) }
        }.padding(18).frame(width: 300)
    }
}
