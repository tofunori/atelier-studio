import Foundation

struct GalleryFilterState {
    static let types = ["Tous", "LaTeX", "PDF", "Figures", "Texte"]
    var query = ""
    var type = "Tous"
    var expanded = false
    func matches(_ item: GalleryArtifact) -> Bool {
        let name = (item.name as NSString).lastPathComponent
        let figurePDF = item.ext == "pdf" && name.range(of: "^(fig(ure)?[._ -]?[0-9s]|figure[._ -])", options: [.regularExpression, .caseInsensitive]) != nil
        let kindMatches = type == "Tous" || item.kind == type || (type == "Figures" && figurePDF)
        return kindMatches && (query.isEmpty || item.name.localizedStandardContains(query))
    }
}
