// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "AtelierUI",
    platforms: [.iOS("26.0")],
    products: [.library(name: "AtelierUI", targets: ["AtelierUI"])],
    targets: [.target(name: "AtelierUI", resources: [.process("Resources")])]
)
