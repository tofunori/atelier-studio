import SwiftUI

struct NativeCalculationsView: View {
    let workspace: WorkspaceModel
    @State private var model = CalculationsModel()
    @State private var host = "all"
    @State private var selected: CalculationRun?
    @Environment(\.scenePhase) private var scenePhase
    private var active: Bool { workspace.surface == .calculations && scenePhase == .active }
    private var pollingKey: String { "\(active)-\(host)-\(workspace.gallery.connectionRevision)" }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Picker("Emplacement", selection: $host) {
                    Text("Tous").tag("all"); Text("Mac").tag("mac"); Text("NAS").tag("nas"); Text("Narval").tag("narval")
                }.pickerStyle(.segmented)
                HStack {
                    TimelineView(.periodic(from: .now, by: 30)) { context in
                        if let date = model.snapshot?.observedAt.date {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Relevé à \(date.formatted(date: .omitted, time: .shortened))")
                                if context.date.timeIntervalSince(date) > 120 { Text("Dernier état connu · à actualiser") }
                            }.font(.caption).foregroundStyle(.secondary)
                        } else { Text("Les calculs suivis par Atelier sur votre Mac.").font(.caption).foregroundStyle(.secondary) }
                    }
                    Spacer()
                    if model.loading { ProgressView().controlSize(.small) }
                }
                if let error = model.error {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Suivi indisponible", systemImage: "wifi.exclamationmark").font(.subheadline.weight(.medium))
                        Text(error).font(.footnote).foregroundStyle(.secondary)
                        if model.snapshot != nil { Text("Le dernier relevé est conservé.").font(.caption).foregroundStyle(.secondary) }
                        Button("Réessayer") { Task { await model.refresh(using: workspace.gallery, host: host) } }.disabled(model.loading)
                    }
                }
                ForEach(Array((model.snapshot?.errors ?? []).enumerated()), id: \.offset) { _, error in
                    Label("\(CalculationRun.location(error.host)) · \(error.message)", systemImage: "exclamationmark.circle")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if model.snapshot != nil && model.runs.isEmpty {
                    ContentUnavailableView("Aucun calcul reçu", systemImage: "chart.bar.xaxis", description: Text(model.snapshot?.errors.isEmpty == true ? "Aucun calcul suivi sur cet emplacement au cours des sept derniers jours." : "Certains emplacements n’ont pas pu être consultés."))
                }
                ForEach([false, true], id: \.self) { finished in
                    let runs = model.runs.filter { $0.finished == finished }
                    if !runs.isEmpty {
                        Text(finished ? "Récents" : "En cours et en attente").font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
                        ForEach(runs) { run in
                            Button { selected = run } label: { CalculationCard(run: run) }.buttonStyle(.plain)
                                .accessibilityHint("Afficher les dernières nouvelles")
                        }
                    }
                }
            }.padding(20)
        }
        .refreshable { await model.refresh(using: workspace.gallery, host: host) }
        .task(id: pollingKey) {
            model.cancelPending()
            guard active else { return }
            while !Task.isCancelled {
                await model.refresh(using: workspace.gallery, host: host)
                do { try await Task.sleep(for: .seconds(host == "mac" ? 30 : 60)) } catch { return }
            }
        }
        .onChange(of: workspace.gallery.connectionRevision) { _, _ in selected = nil }
        .sheet(item: $selected) { run in
            CalculationDetailView(run: model.runs.first { $0.id == run.id } ?? run, gallery: workspace.gallery)
        }
    }
}

private struct CalculationCard: View {
    let run: CalculationRun
    private var color: Color { run.state == "failed" || run.state == "queued" ? .orange : run.state == "completed" ? .green : .secondary }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label(run.location, systemImage: run.host == "mac" ? "laptopcomputer" : "server.rack").foregroundStyle(.secondary)
                Spacer()
                Text(run.stateLabel).foregroundStyle(color)
            }.font(.caption.weight(.medium))
            Text(run.title).font(.headline).foregroundStyle(.primary)
            if let project = run.project { Text(project).font(.caption).foregroundStyle(.secondary) }
            if let fraction = run.progress?.fraction { ProgressView(value: fraction).tint(.accentColor).accessibilityLabel("Avancement") }
            HStack {
                Text(run.step).font(.subheadline).foregroundStyle(.secondary)
                Spacer(minLength: 8)
                if let fraction = run.progress?.fraction { Text("\(Int(fraction * 100)) %").font(.subheadline.monospacedDigit()).foregroundStyle(.primary) }
            }
            if let date = (run.finished ? run.endedAt?.date : run.startedAt?.date) {
                Text("\(run.finished ? "Fin" : "Début") · \(date.formatted(date: .abbreviated, time: .shortened))").font(.caption).foregroundStyle(.secondary)
            }
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18))
            .accessibilityElement(children: .combine)
    }
}

private struct CalculationDetailView: View {
    let run: CalculationRun
    let gallery: GalleryModel
    @State private var log: CalculationLog?
    @State private var error: String?
    @State private var loading = false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    CalculationCard(run: run)
                    HStack { Text("Dernières nouvelles").font(.headline); Spacer(); if loading { ProgressView() } }
                    if let error { Text(error).font(.footnote).foregroundStyle(.secondary) }
                    let lines = log?.lines ?? run.logTail ?? []
                    if lines.isEmpty { Text("Aucune nouvelle transmise pour ce calcul.").font(.subheadline).foregroundStyle(.secondary) }
                    else {
                        Text(lines.joined(separator: "\n")).font(.system(.footnote, design: .monospaced))
                            .frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled)
                        if log?.truncated == true { Text("Dernières lignes seulement.").font(.caption).foregroundStyle(.secondary) }
                    }
                }.padding(20)
            }.refreshable { await refresh() }
                .navigationTitle("Détail du calcul").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fermer") { dismiss() } } }
                .task(id: "\(scenePhase)-\(gallery.connectionRevision)") {
                    guard scenePhase == .active else { return }
                    while !Task.isCancelled {
                        await refresh()
                        do { try await Task.sleep(for: .seconds(60)) } catch { return }
                    }
                }
        }.presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
    }
    private func refresh() async {
        guard !loading else { return }
        loading = true; defer { loading = false }
        do {
            let data = try await gallery.chatRequest(["compute", "log"], timeout: 95, query: [URLQueryItem(name: "runId", value: run.id)])
            let result = try JSONDecoder().decode(CalculationLog.self, from: data)
            guard !Task.isCancelled else { return }
            log = result; error = nil
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}
