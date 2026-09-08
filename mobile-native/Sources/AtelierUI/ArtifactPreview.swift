import Foundation
import ImageIO
import PDFKit
import UIKit

/// Only remote bytes are evictable; imported files and edited documents have their own storage.
struct ArtifactDataCache {
    let limit: Int
    private(set) var byteCount = 0
    private var entries: [String: Data] = [:]
    private var recency: [String] = []

    init(limit: Int = 24 * 1024 * 1024) { self.limit = max(0, limit) }
    mutating func value(for key: String) -> Data? {
        guard let data = entries[key] else { return nil }
        recency.removeAll { $0 == key }; recency.append(key)
        return data
    }
    mutating func remove(_ key: String) {
        byteCount -= entries.removeValue(forKey: key)?.count ?? 0
        recency.removeAll { $0 == key }
    }
    mutating func insert(_ data: Data, for key: String) {
        remove(key)
        guard data.count <= limit else { return }
        while byteCount + data.count > limit, let oldest = recency.first { remove(oldest) }
        entries[key] = data; recency.append(key); byteCount += data.count
    }
}

/// Serial rendering keeps a scrolling grid from decoding many full-resolution images at once.
actor ArtifactPreviewRenderer {
    static let shared = ArtifactPreviewRenderer()
    func render(_ data: Data, pdf: Bool, maxPixelSize: Int = 600) -> UIImage? {
        guard !Task.isCancelled else { return nil }
        return autoreleasepool {
            if pdf {
                return PDFDocument(data: data)?.page(at: 0)?.thumbnail(of: CGSize(width: 300, height: 300), for: .cropBox)
            }
            guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
                  let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceCreateThumbnailWithTransform: true,
                    kCGImageSourceThumbnailMaxPixelSize: max(1, min(maxPixelSize, 4096)),
                    kCGImageSourceShouldCacheImmediately: true
                  ] as CFDictionary) else { return nil }
            return UIImage(cgImage: image)
        }
    }
}
