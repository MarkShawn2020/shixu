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
  }
}

private enum DocumentVisionError: Error {
  case unreadableImage
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
  let enhanced = normalizeOrigin(
    enhanceDocument(standardized, scanFilter: scanFilter)
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
