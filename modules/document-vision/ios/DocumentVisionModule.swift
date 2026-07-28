import CoreGraphics
import CoreImage
import ExpoModulesCore
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

private let documentRenderContext = CIContext(options: [
  .cacheIntermediates: true,
  .useSoftwareRenderer: false
])

private struct DocumentPointRecord: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
}

private struct DocumentQuadRecord: Record {
  @Field var topLeft = DocumentPointRecord()
  @Field var topRight = DocumentPointRecord()
  @Field var bottomRight = DocumentPointRecord()
  @Field var bottomLeft = DocumentPointRecord()
}

public class DocumentVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DocumentVision")

    AsyncFunction("detectDocumentAsync") { (uri: URL) -> [String: Any]? in
      guard
        let imageSource = CGImageSourceCreateWithURL(uri as CFURL, nil),
        let image = CGImageSourceCreateImageAtIndex(imageSource, 0, nil)
      else {
        throw DocumentVisionError.unreadableImage
      }

      let handler = VNImageRequestHandler(
        cgImage: image,
        orientation: imageOrientation(from: imageSource),
        options: [:]
      )

      let documentRequest = VNDetectDocumentSegmentationRequest()
      try handler.perform([documentRequest])
      var best = bestDocument(from: documentRequest.results ?? [])

      if best == nil {
        let rectangleRequest = VNDetectRectanglesRequest()
        rectangleRequest.minimumAspectRatio = 0.25
        rectangleRequest.maximumAspectRatio = 1
        rectangleRequest.minimumSize = 0.14
        rectangleRequest.minimumConfidence = 0.45
        rectangleRequest.quadratureTolerance = 35
        rectangleRequest.maximumObservations = 8
        try handler.perform([rectangleRequest])
        best = bestDocument(from: rectangleRequest.results ?? [])
      }

      guard let best else {
        return nil
      }

      return [
        "quad": [
          "topLeft": normalizedPoint(best.observation.topLeft),
          "topRight": normalizedPoint(best.observation.topRight),
          "bottomRight": normalizedPoint(best.observation.bottomRight),
          "bottomLeft": normalizedPoint(best.observation.bottomLeft)
        ],
        "confidence": Double(best.observation.confidence),
        "area": best.area
      ]
    }

    AsyncFunction("processDocumentAsync") {
      (uri: URL, quad: DocumentQuadRecord, scanFilter: String) -> [String: Any] in
      let startedAt = CFAbsoluteTimeGetCurrent()
      let rendered = try renderDocument(
        uri: uri,
        quad: quad,
        scanFilter: scanFilter
      )

      return [
        "uri": rendered.uri.absoluteString,
        "width": rendered.width,
        "height": rendered.height,
        "processingMs": Int(
          (CFAbsoluteTimeGetCurrent() - startedAt) * 1_000
        )
      ]
    }

    AsyncFunction("createPdfAsync") {
      (
        sourceUris: [String],
        destinationUri: String,
        watermarkUri: String?
      ) -> [String: Any] in
      let startedAt = CFAbsoluteTimeGetCurrent()
      let destination = try localFileUrl(from: destinationUri)
      let sources = try sourceUris.map { try localFileUrl(from: $0) }
      let watermark = try watermarkUri.map {
        try localFileUrl(from: $0)
      }
      try renderPdf(
        sources: sources,
        destination: destination,
        watermark: watermark
      )
      let attributes = try FileManager.default.attributesOfItem(
        atPath: destination.path
      )
      let fileSize = (attributes[.size] as? NSNumber)?.intValue ?? 0

      return [
        "uri": destination.absoluteString,
        "numberOfPages": sources.count,
        "fileSize": fileSize,
        "processingMs": Int(
          (CFAbsoluteTimeGetCurrent() - startedAt) * 1_000
        )
      ]
    }
  }
}

private enum DocumentVisionError: Error {
  case emptyPdf
  case invalidFileUrl
  case pdfDestinationFailed
  case unreadableImage
  case unreadablePdfImage
  case perspectiveCorrectionFailed
  case renderingFailed
  case jpegDestinationFailed
}

private struct ScoredRectangle {
  let observation: VNRectangleObservation
  let area: Double
  let score: Double
}

private struct RenderedDocument {
  let uri: URL
  let width: Int
  let height: Int
}

private let pdfPageBounds = CGRect(x: 0, y: 0, width: 595, height: 842)

private func localFileUrl(from value: String) throws -> URL {
  guard
    let url = URL(string: value),
    url.isFileURL
  else {
    throw DocumentVisionError.invalidFileUrl
  }
  return url
}

private func loadPdfImage(from url: URL) throws -> CGImage {
  guard
    let source = CGImageSourceCreateWithURL(url as CFURL, [
      kCGImageSourceShouldCache: false
    ] as CFDictionary),
    let image = CGImageSourceCreateImageAtIndex(source, 0, [
      kCGImageSourceShouldCacheImmediately: true
    ] as CFDictionary)
  else {
    throw DocumentVisionError.unreadablePdfImage
  }
  return image
}

private func drawPdfWatermark(
  _ watermark: CGImage,
  in context: CGContext,
  pageBounds: CGRect
) {
  let targetWidth = pageBounds.width * 0.27
  let targetHeight =
    targetWidth * CGFloat(watermark.height) / CGFloat(watermark.width)
  let margin = min(pageBounds.width, pageBounds.height) * 0.036
  let watermarkBounds = CGRect(
    x: pageBounds.maxX - targetWidth - margin,
    y: pageBounds.minY + margin,
    width: targetWidth,
    height: targetHeight
  )
  context.saveGState()
  context.setAlpha(0.48)
  context.interpolationQuality = .high
  context.draw(watermark, in: watermarkBounds)
  context.restoreGState()
}

private func renderPdf(
  sources: [URL],
  destination: URL,
  watermark: URL?
) throws {
  guard !sources.isEmpty else {
    throw DocumentVisionError.emptyPdf
  }

  try FileManager.default.createDirectory(
    at: destination.deletingLastPathComponent(),
    withIntermediateDirectories: true
  )
  if FileManager.default.fileExists(atPath: destination.path) {
    try FileManager.default.removeItem(at: destination)
  }

  guard
    let consumer = CGDataConsumer(url: destination as CFURL)
  else {
    throw DocumentVisionError.pdfDestinationFailed
  }
  var mediaBox = pdfPageBounds
  guard
    let context = CGContext(
      consumer: consumer,
      mediaBox: &mediaBox,
      nil
    )
  else {
    throw DocumentVisionError.pdfDestinationFailed
  }
  let watermarkImage = try watermark.map(loadPdfImage(from:))

  for source in sources {
    try autoreleasepool {
      let image = try loadPdfImage(from: source)
      context.beginPDFPage(nil)
      context.setFillColor(CGColor(gray: 1, alpha: 1))
      context.fill(pdfPageBounds)
      context.interpolationQuality = .high

      context.draw(image, in: pdfPageBounds)
      if let watermarkImage {
        drawPdfWatermark(
          watermarkImage,
          in: context,
          pageBounds: pdfPageBounds
        )
      }
      context.endPDFPage()
    }
  }
  context.closePDF()

  guard FileManager.default.fileExists(atPath: destination.path) else {
    throw DocumentVisionError.pdfDestinationFailed
  }
}

private func imageOrientation(from source: CGImageSource) -> CGImagePropertyOrientation {
  guard
    let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
    let rawOrientation = properties[kCGImagePropertyOrientation] as? NSNumber
  else {
    return .up
  }

  return CGImagePropertyOrientation(rawValue: rawOrientation.uint32Value) ?? .up
}

private func polygonArea(_ points: [CGPoint]) -> Double {
  var doubledArea = 0.0
  for index in points.indices {
    let next = points[(index + 1) % points.count]
    doubledArea += Double(points[index].x * next.y - next.x * points[index].y)
  }
  return abs(doubledArea) / 2
}

private func bestDocument(
  from observations: [VNRectangleObservation]
) -> ScoredRectangle? {
  observations.compactMap { observation in
    let points = [
      observation.topLeft,
      observation.topRight,
      observation.bottomRight,
      observation.bottomLeft
    ]
    let area = polygonArea(points)
    guard area >= 0.08, area <= 0.94 else {
      return nil
    }

    let centerX = points.reduce(0) { $0 + Double($1.x) } / 4
    let centerY = points.reduce(0) { $0 + Double($1.y) } / 4
    let centerDistance = hypot(centerX - 0.5, centerY - 0.5)
    let centrality = max(0, 1 - centerDistance / 0.72)
    let areaScore = min(area / 0.58, 1)
    let confidence = Double(observation.confidence)
    let score = confidence * 0.52 + areaScore * 0.34 + centrality * 0.14

    return ScoredRectangle(
      observation: observation,
      area: area,
      score: score
    )
  }
  .max { first, second in
    first.score < second.score
  }
}

private func normalizedPoint(_ point: CGPoint) -> [String: Double] {
  [
    "x": min(1, max(0, Double(point.x))),
    "y": min(1, max(0, 1 - Double(point.y)))
  ]
}

private func coreImagePoint(
  _ point: DocumentPointRecord,
  in extent: CGRect
) -> CIVector {
  CIVector(
    x: extent.minX + CGFloat(min(1, max(0, point.x))) * extent.width,
    y: extent.minY + CGFloat(1 - min(1, max(0, point.y))) * extent.height
  )
}

private func applyFilter(
  _ name: String,
  to image: CIImage,
  values: [String: Any] = [:]
) -> CIImage {
  guard let filter = CIFilter(name: name) else {
    return image
  }
  filter.setValue(image, forKey: kCIInputImageKey)
  for (key, value) in values {
    filter.setValue(value, forKey: key)
  }
  return filter.outputImage?.cropped(to: image.extent) ?? image
}

private func normalizeOrigin(_ image: CIImage) -> CIImage {
  let extent = image.extent
  guard extent.minX != 0 || extent.minY != 0 else {
    return image
  }
  return image.transformed(
    by: CGAffineTransform(
      translationX: -extent.minX,
      y: -extent.minY
    )
  )
}

private func standardizeDocument(_ image: CIImage) -> CIImage {
  let extent = image.extent
  let sourceShortEdge = min(extent.width, extent.height)
  let sourceLongEdge = max(extent.width, extent.height)
  guard sourceShortEdge > 0, sourceLongEdge > 0 else {
    return image
  }

  let portrait = extent.height >= extent.width
  let inferredRatio = sourceShortEdge / sourceLongEdge
  let aSeriesRatio = 1 / CGFloat(sqrt(2.0))
  let normalizedRatio =
    portrait && inferredRatio >= 0.58 && inferredRatio <= 0.82
      ? aSeriesRatio
      : inferredRatio

  var targetShortEdge = min(1_600, sourceShortEdge)
  var targetLongEdge = targetShortEdge / normalizedRatio
  if targetLongEdge > 2_600 {
    targetLongEdge = 2_600
    targetShortEdge = targetLongEdge * normalizedRatio
  }

  let targetWidth = portrait ? targetShortEdge : targetLongEdge
  let targetHeight = portrait ? targetLongEdge : targetShortEdge
  let scaleX = targetWidth / extent.width
  let scaleY = targetHeight / extent.height

  guard let filter = CIFilter(name: "CILanczosScaleTransform") else {
    return normalizeOrigin(
      image.transformed(
        by: CGAffineTransform(scaleX: scaleX, y: scaleY)
      )
    )
  }
  filter.setValue(image, forKey: kCIInputImageKey)
  filter.setValue(scaleY, forKey: kCIInputScaleKey)
  filter.setValue(scaleX / scaleY, forKey: kCIInputAspectRatioKey)
  return normalizeOrigin(filter.outputImage ?? image)
}

private func median(_ values: [CGFloat]) -> CGFloat? {
  guard !values.isEmpty else {
    return nil
  }
  let sorted = values.sorted()
  let middle = sorted.count / 2
  if sorted.count.isMultiple(of: 2) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

private func robustHorizontalShear(
  from points: [CGPoint]
) -> CGFloat? {
  guard points.count >= 4 else {
    return nil
  }
  let verticalSpan =
    (points.map(\.y).max() ?? 0) - (points.map(\.y).min() ?? 0)
  guard verticalSpan >= 0.28 else {
    return nil
  }

  var slopes: [CGFloat] = []
  for firstIndex in points.indices {
    for secondIndex in points.indices where secondIndex > firstIndex {
      let deltaY = points[secondIndex].y - points[firstIndex].y
      guard abs(deltaY) >= 0.1 else {
        continue
      }
      let slope =
        (points[secondIndex].x - points[firstIndex].x) / deltaY
      if abs(slope) <= 0.24 {
        slopes.append(slope)
      }
    }
  }
  return median(slopes)
}

private func contentGuidedDeskew(_ image: CIImage) -> CIImage {
  let extent = image.extent
  let shortEdge = min(extent.width, extent.height)
  guard shortEdge > 0 else {
    return image
  }

  let analysisScale = min(1, 1_200 / shortEdge)
  let analysisImage = image.transformed(
    by: CGAffineTransform(
      scaleX: analysisScale,
      y: analysisScale
    )
  )
  guard let analysisCGImage = documentRenderContext.createCGImage(
    analysisImage,
    from: analysisImage.extent.integral
  ) else {
    return image
  }

  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .fast
  request.usesLanguageCorrection = false
  request.minimumTextHeight = 0.007
  let handler = VNImageRequestHandler(
    cgImage: analysisCGImage,
    orientation: .up,
    options: [:]
  )
  guard
    (try? handler.perform([request])) != nil,
    let observations = request.results
  else {
    return image
  }

  let marginPoints = observations.compactMap { observation -> CGPoint? in
    let bounds = observation.boundingBox
    guard
      bounds.width >= 0.08,
      bounds.height >= 0.007,
      bounds.height <= 0.06,
      bounds.minX >= 0.035,
      bounds.minX <= 0.24,
      bounds.midY >= 0.08,
      bounds.midY <= 0.95
    else {
      return nil
    }
    return CGPoint(x: bounds.minX, y: bounds.midY)
  }

  guard
    let measuredShear = robustHorizontalShear(from: marginPoints),
    abs(measuredShear) >= 0.012
  else {
    return image
  }
  let shear = min(0.12, max(-0.12, measuredShear))
  let transform = CGAffineTransform(
    a: 1,
    b: 0,
    c: -shear * extent.width / extent.height,
    d: 1,
    tx: shear * extent.width / 2,
    ty: 0
  )
  return image.transformed(by: transform).cropped(to: extent)
}

private func enhanceDocument(
  _ image: CIImage,
  scanFilter: String
) -> CIImage {
  let documentAmount: Double
  switch scanFilter {
  case "blackwhite":
    documentAmount = 1.65
  case "grayscale":
    documentAmount = 1.5
  default:
    documentAmount = 1.55
  }

  var output = applyFilter(
    "CIDocumentEnhancer",
    to: image,
    values: [kCIInputAmountKey: documentAmount]
  )

  switch scanFilter {
  case "blackwhite":
    output = applyFilter(
      "CIColorControls",
      to: output,
      values: [
        kCIInputSaturationKey: 0,
        kCIInputContrastKey: 1.2,
        kCIInputBrightnessKey: 0.008
      ]
    )
  case "grayscale":
    output = applyFilter(
      "CIColorControls",
      to: output,
      values: [
        kCIInputSaturationKey: 0,
        kCIInputContrastKey: 1.1
      ]
    )
  default:
    output = applyFilter(
      "CIColorControls",
      to: output,
      values: [
        kCIInputSaturationKey: 0.94,
        kCIInputContrastKey: 1.06
      ]
    )
  }

  return applyFilter(
    "CIUnsharpMask",
    to: output,
    values: [
      kCIInputRadiusKey: 1.15,
      kCIInputIntensityKey: scanFilter == "color" ? 0.56 : 0.62
    ]
  )
}

private func renderDocument(
  uri: URL,
  quad: DocumentQuadRecord,
  scanFilter: String
) throws -> RenderedDocument {
  guard var source = CIImage(
    contentsOf: uri,
    options: [.applyOrientationProperty: true]
  ) else {
    throw DocumentVisionError.unreadableImage
  }
  source = normalizeOrigin(source)

  guard let perspective = CIFilter(name: "CIPerspectiveCorrection") else {
    throw DocumentVisionError.perspectiveCorrectionFailed
  }
  perspective.setValue(source, forKey: kCIInputImageKey)
  perspective.setValue(
    coreImagePoint(quad.topLeft, in: source.extent),
    forKey: "inputTopLeft"
  )
  perspective.setValue(
    coreImagePoint(quad.topRight, in: source.extent),
    forKey: "inputTopRight"
  )
  perspective.setValue(
    coreImagePoint(quad.bottomRight, in: source.extent),
    forKey: "inputBottomRight"
  )
  perspective.setValue(
    coreImagePoint(quad.bottomLeft, in: source.extent),
    forKey: "inputBottomLeft"
  )

  guard let corrected = perspective.outputImage else {
    throw DocumentVisionError.perspectiveCorrectionFailed
  }
  let standardized = standardizeDocument(normalizeOrigin(corrected))
  let contentAligned = contentGuidedDeskew(standardized)
  let enhanced = normalizeOrigin(
    enhanceDocument(contentAligned, scanFilter: scanFilter)
  )
  let outputExtent = enhanced.extent.integral
  guard
    outputExtent.width > 0,
    outputExtent.height > 0,
    let renderedImage = documentRenderContext.createCGImage(
      enhanced,
      from: outputExtent
    )
  else {
    throw DocumentVisionError.renderingFailed
  }

  let outputURL = FileManager.default.temporaryDirectory
    .appendingPathComponent("scan-\(UUID().uuidString).jpg")
  guard let destination = CGImageDestinationCreateWithURL(
    outputURL as CFURL,
    UTType.jpeg.identifier as CFString,
    1,
    nil
  ) else {
    throw DocumentVisionError.jpegDestinationFailed
  }
  CGImageDestinationAddImage(
    destination,
    renderedImage,
    [
      kCGImageDestinationLossyCompressionQuality: 0.94
    ] as CFDictionary
  )
  guard CGImageDestinationFinalize(destination) else {
    throw DocumentVisionError.jpegDestinationFailed
  }

  return RenderedDocument(
    uri: outputURL,
    width: renderedImage.width,
    height: renderedImage.height
  )
}
